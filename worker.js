// ===== SwampRealms accounts API: Cloudflare Worker + D1 =====
// Handles only /api/* (see run_worker_first in wrangler.jsonc). Everything else is served as static files.
// Username + password sign in, a session cookie, and one cloud save per account.

const enc = new TextEncoder();
const SESSION_DAYS = 30;
const ITER = 100000;          // Cloudflare Workers allows at most 100,000 PBKDF2 iterations
const MAX_SAVE = 200000;      // largest cloud save, in characters of JSON
const MAX_DELVE = 900000;     // largest Delve world save, in characters (a heavily built world is ~100-300k)
const MAX_DELVE_WORLDS = 12;  // Delve worlds kept in the cloud per account
const COOKIE = "sv_session";
const LOGIN_MAX = 8, LOGIN_WINDOW = 15 * 60 * 1000;   // 8 wrong passwords per name per 15 minutes
const REG_MAX = 10, REG_WINDOW = 60 * 60 * 1000;      // 10 new accounts per IP per hour

const json = (o, status = 200, headers = {}) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const toB64 = u8 => { let s = ""; u8.forEach(b => (s += String.fromCharCode(b))); return btoa(s); };
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const sha256 = async s => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

async function pbkdf2(password, salt, iters) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iters }, key, 256));
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
function getCookie(req, name) {
  const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : "";
}
function setCookie(url, value, maxAge) {
  return `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${url.protocol === "https:" ? "; Secure" : ""}`;
}

// ---- simple rate limiting kept in D1 ----
async function blocked(db, key, max, windowMs) {
  const r = await db.prepare("SELECT n, first FROM limits WHERE k = ?").bind(key).first();
  return !!r && Date.now() - r.first < windowMs && r.n >= max;
}
async function hit(db, key, windowMs) {
  const now = Date.now();
  const r = await db.prepare("SELECT n, first FROM limits WHERE k = ?").bind(key).first();
  if (!r || now - r.first >= windowMs)
    await db.prepare("INSERT OR REPLACE INTO limits (k, n, first) VALUES (?, 1, ?)").bind(key, now).run();
  else
    await db.prepare("UPDATE limits SET n = n + 1 WHERE k = ?").bind(key).run();
}
const unhit = (db, key) => db.prepare("DELETE FROM limits WHERE k = ?").bind(key).run();

// ---- sessions ----
async function startSession(db, url, userId) {
  const token = hex(rand(32));
  const now = Date.now();
  await db.prepare("DELETE FROM sessions WHERE expires < ?").bind(now).run();
  await db.prepare("INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)")
    .bind(await sha256(token), userId, now + SESSION_DAYS * 86400000).run();
  return setCookie(url, token, SESSION_DAYS * 86400);
}
async function auth(req, db) {
  const token = getCookie(req, COOKIE);
  if (!token) return null;
  return (await db.prepare(
    "SELECT u.id AS id, u.display AS name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ?"
  ).bind(await sha256(token), Date.now()).first()) || null;
}
async function cloudSave(db, userId) {
  const r = await db.prepare("SELECT data, rev, updated FROM saves WHERE user_id = ?").bind(userId).first();
  return r ? { data: JSON.parse(r.data), rev: r.rev, updated: r.updated } : null;
}

async function readJson(req) {
  if (!(req.headers.get("content-type") || "").includes("application/json")) return null;
  try { return await req.json(); } catch (e) { return null; }
}
const okName = s => typeof s === "string" && /^[A-Za-z0-9_]{3,20}$/.test(s);
const okPass = s => typeof s === "string" && s.length >= 8 && s.length <= 200;
const isObj = o => !!o && typeof o === "object" && !Array.isArray(o);

async function api(req, env, url) {
  if (!env.DB) return json({ error: "Accounts are not set up yet." }, 503);
  const db = env.DB, path = url.pathname, method = req.method;

  // Writes must come from this site: same origin, and JSON only (a plain cross-site form can't send JSON)
  if (method !== "GET" && method !== "HEAD") {
    const origin = req.headers.get("origin");
    if (origin) { let h = ""; try { h = new URL(origin).host; } catch (e) {} if (h !== url.host) return json({ error: "Not allowed" }, 403); }
  }

  if (path === "/api/me" && method === "GET") {
    const u = await auth(req, db);
    if (!u) return json({ error: "Not signed in" }, 401);
    return json({ user: { name: u.name }, save: await cloudSave(db, u.id) });
  }

  if (path === "/api/register" && method === "POST") {
    const b = await readJson(req);
    if (!b) return json({ error: "Bad request" }, 400);
    if (!okName(b.username)) return json({ error: "Username: 3 to 20 letters, numbers or underscores." }, 400);
    if (!okPass(b.password)) return json({ error: "Password must be at least 8 characters." }, 400);
    const ipKey = "reg:" + (req.headers.get("cf-connecting-ip") || "unknown");
    if (await blocked(db, ipKey, REG_MAX, REG_WINDOW)) return json({ error: "Too many new accounts from here. Try again later." }, 429);
    const name = b.username.toLowerCase();
    if (await db.prepare("SELECT 1 AS x FROM users WHERE name = ?").bind(name).first())
      return json({ error: "That username is taken." }, 409);
    const id = crypto.randomUUID(), salt = rand(16), hash = await pbkdf2(b.password, salt, ITER);
    try {
      await db.prepare("INSERT INTO users (id, name, display, salt, hash, iters, created) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(id, name, b.username, toB64(salt), toB64(hash), ITER, Date.now()).run();
    } catch (e) { return json({ error: "That username is taken." }, 409); }
    await hit(db, ipKey, REG_WINDOW);
    const cookie = await startSession(db, url, id);
    return json({ user: { name: b.username }, save: null }, 200, { "set-cookie": cookie });
  }

  if (path === "/api/login" && method === "POST") {
    const b = await readJson(req);
    if (!b || typeof b.username !== "string" || typeof b.password !== "string") return json({ error: "Bad request" }, 400);
    const name = b.username.toLowerCase().slice(0, 40), key = "login:" + name;
    if (await blocked(db, key, LOGIN_MAX, LOGIN_WINDOW)) return json({ error: "Too many tries. Wait 15 minutes and try again." }, 429);
    const u = await db.prepare("SELECT id, display, salt, hash, iters FROM users WHERE name = ?").bind(name).first();
    // Do the same work whether or not the name exists, so timing doesn't reveal which names are taken
    const salt = u ? fromB64(u.salt) : rand(16);
    const got = await pbkdf2(b.password.slice(0, 200), salt, u ? u.iters : ITER);
    if (!u || !same(got, fromB64(u.hash))) {
      await hit(db, key, LOGIN_WINDOW);
      return json({ error: "Wrong username or password." }, 401);
    }
    await unhit(db, key);
    const cookie = await startSession(db, url, u.id);
    return json({ user: { name: u.display }, save: await cloudSave(db, u.id) }, 200, { "set-cookie": cookie });
  }

  if (path === "/api/logout" && method === "POST") {
    const token = getCookie(req, COOKIE);
    if (token) await db.prepare("DELETE FROM sessions WHERE token = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "set-cookie": setCookie(url, "", 0) });
  }

  if (path === "/api/save" && method === "PUT") {
    const u = await auth(req, db);
    if (!u) return json({ error: "Not signed in" }, 401);
    const b = await readJson(req);
    if (!b || !isObj(b.data) || !Number.isInteger(b.baseRev) || b.baseRev < 0) return json({ error: "Bad request" }, 400);
    for (const k of ["cards", "packs", "crystals"]) if (!isObj(b.data[k])) return json({ error: "Bad save data" }, 400);
    const data = JSON.stringify({ cards: b.data.cards, packs: b.data.packs, crystals: b.data.crystals });
    if (data.length > MAX_SAVE) return json({ error: "Save is too large" }, 413);
    const now = Date.now();
    const conflict = async () => { const c = await cloudSave(db, u.id); return json({ error: "conflict", ...c }, 409); };

    const cur = await db.prepare("SELECT rev FROM saves WHERE user_id = ?").bind(u.id).first();
    if (!cur) {
      const r = await db.prepare("INSERT OR IGNORE INTO saves (user_id, data, rev, updated) VALUES (?, ?, 1, ?)").bind(u.id, data, now).run();
      if (!r.meta || r.meta.changes !== 1) return conflict();
      return json({ rev: 1, updated: now });
    }
    if (cur.rev !== b.baseRev) return conflict();
    // compare-and-swap: only succeeds if nobody else saved in between
    const r = await db.prepare("UPDATE saves SET data = ?, rev = rev + 1, updated = ? WHERE user_id = ? AND rev = ?")
      .bind(data, now, u.id, b.baseRev).run();
    if (!r.meta || r.meta.changes !== 1) return conflict();
    return json({ rev: b.baseRev + 1, updated: now });
  }

  // ---- Delve multiplayer rooms (see DelveRoom below). The host must be signed in; anyone can join with the code. ----
  //   POST /api/mp/host        {name, pub, pvp} -> {code}   (one open room per account; hosting again replaces it)
  //   GET  /api/mp/list        public rooms seen in the last 2 minutes
  //   GET  /api/mp/room/<code> one room's details, so the game can explain a bad code before connecting
  //   GET  /api/mp/ws/<code>?role=host|guest&name=...   the WebSocket, handed to that room's Durable Object
  if (path.startsWith("/api/mp/")) {
    if (!env.ROOMS) return json({ error: "Multiplayer is not set up on this server yet." }, 503);
    await mpTable(db);
    const now = Date.now();
    if (path === "/api/mp/host" && method === "POST") {
      const u = await auth(req, db); if (!u) return json({ error: "Sign in to host a world." }, 401);
      const b = (await readJson(req)) || {};
      const name = (typeof b.name === "string" ? b.name : "My Swamp").replace(/[^\w '!?.-]/g, "").trim().slice(0, 24) || "My Swamp";
      let code = "";
      for (let i = 0; i < 8 && !code; i++) { const c = mpCode(); if (!(await db.prepare("SELECT 1 AS x FROM mp_rooms WHERE code = ?").bind(c).first())) code = c; }
      if (!code) return json({ error: "Could not make a room code. Try again." }, 500);
      await db.prepare("DELETE FROM mp_rooms WHERE host_id = ?").bind(u.id).run();
      await db.prepare("INSERT INTO mp_rooms (code, host_id, host_name, name, pub, pvp, players, updated, site) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)")
        .bind(code, u.id, u.name, name, b.pub ? 1 : 0, b.pvp ? 1 : 0, now, url.host).run();
      return json({ code });
    }
    if (path === "/api/mp/list" && method === "GET") {
      const r = await db.prepare("SELECT code, host_name, name, players, pvp FROM mp_rooms WHERE pub = 1 AND updated > ? AND (site = ? OR site = '') ORDER BY updated DESC LIMIT 30").bind(now - 120000, url.host).all();
      return json({ rooms: r.results || [] });
    }
    const m = path.match(/^\/api\/mp\/(room|ws)\/([A-Z0-9]{6})$/);
    if (!m || method !== "GET") return json({ error: "Not found" }, 404);
    const room = await db.prepare("SELECT code, host_id, host_name, name, pub, pvp, players, updated, site FROM mp_rooms WHERE code = ?").bind(m[2]).first();
    if (room && room.site && room.site !== url.host) return json({ error: room.host_name + " is hosting on a different address of the site. Open Delve at " + room.site + " and join from there.", site: room.site }, 409);
    if (m[1] === "room" && room && room.updated < now - 10 * 60000) return json({ error: "That world was closed. Ask your friend for a new code." }, 404);
    if (m[1] === "room") return room ? json({ code: room.code, name: room.name, host: room.host_name, players: room.players, pvp: !!room.pvp }) : json({ error: "No world with that code. Check the code with your friend." }, 404);
    if ((req.headers.get("upgrade") || "").toLowerCase() !== "websocket") return json({ error: "Expected a WebSocket" }, 426);
    const origin = req.headers.get("origin"); if (origin) { let h = ""; try { h = new URL(origin).host; } catch (e) {} if (h !== url.host) return json({ error: "Not allowed" }, 403); }
    if (!room) return json({ error: "No world with that code." }, 404);
    const role = url.searchParams.get("role") === "host" ? "host" : "guest", u = await auth(req, db);
    if (role === "host" && (!u || u.id !== room.host_id)) return json({ error: "Only the person who opened this room can host it." }, 403);
    let name = u ? u.name : String(url.searchParams.get("name") || "").replace(/[^\w -]/g, "").trim().slice(0, 16);
    if (!name || name.length < 2) name = "Guest";
    const h = new Headers(req.headers); h.set("x-mp-role", role); h.set("x-mp-name", name); h.set("x-mp-code", room.code); h.set("x-mp-pvp", room.pvp ? "1" : "0");
    return env.ROOMS.get(env.ROOMS.idFromName(room.code)).fetch(new Request(req, { headers: h }));
  }

  // ---- Delve worlds: one row per (account, world id). The table is created the first time it is used. ----
  //   GET    /api/delve          list: [{wid, name, rev, updated, size}]
  //   GET    /api/delve/<wid>    {wid, name, data, rev, updated}
  //   PUT    /api/delve/<wid>    {name, data, baseRev} -> {rev, updated}; 409 {error:"conflict", rev, updated} if the cloud copy changed since baseRev
  //   DELETE /api/delve/<wid>
  if (path === "/api/delve" || path.startsWith("/api/delve/")) {
    const u = await auth(req, db);
    if (!u) return json({ error: "Not signed in" }, 401);
    await delveTable(db);
    const wid = path.length > 11 ? decodeURIComponent(path.slice(11)) : "";
    if (!wid) {
      if (method !== "GET") return json({ error: "Not found" }, 404);
      const r = await db.prepare("SELECT wid, name, rev, updated, length(data) AS size FROM delve WHERE user_id = ? ORDER BY updated DESC").bind(u.id).all();
      return json({ worlds: r.results || [] });
    }
    if (!/^w[a-z0-9]{4,24}$/.test(wid)) return json({ error: "Bad world id" }, 400);
    if (method === "GET") {
      const r = await db.prepare("SELECT wid, name, data, rev, updated FROM delve WHERE user_id = ? AND wid = ?").bind(u.id, wid).first();
      return r ? json(r) : json({ error: "Not found" }, 404);
    }
    if (method === "DELETE") {
      await db.prepare("DELETE FROM delve WHERE user_id = ? AND wid = ?").bind(u.id, wid).run();
      return json({ ok: true });
    }
    if (method === "PUT") {
      const b = await readJson(req);
      if (!b || typeof b.data !== "string" || !Number.isInteger(b.baseRev) || b.baseRev < 0) return json({ error: "Bad request" }, 400);
      if (b.data.length > MAX_DELVE) return json({ error: "World is too large for the cloud" }, 413);
      let parsed = null; try { parsed = JSON.parse(b.data); } catch (e) {}
      if (!isObj(parsed) || !Number.isFinite(parsed.seed)) return json({ error: "Bad world data" }, 400);
      const name = (typeof b.name === "string" ? b.name : "World").trim().slice(0, 24) || "World", now = Date.now();
      const conflict = async () => { const c = await db.prepare("SELECT rev, updated FROM delve WHERE user_id = ? AND wid = ?").bind(u.id, wid).first(); return json({ error: "conflict", rev: c ? c.rev : 0, updated: c ? c.updated : 0 }, 409); };
      const cur = await db.prepare("SELECT rev FROM delve WHERE user_id = ? AND wid = ?").bind(u.id, wid).first();
      if (!cur) {
        if (b.baseRev !== 0) return conflict();
        const n = await db.prepare("SELECT COUNT(*) AS n FROM delve WHERE user_id = ?").bind(u.id).first();
        if (n && n.n >= MAX_DELVE_WORLDS) return json({ error: "You already have " + MAX_DELVE_WORLDS + " worlds in the cloud. Delete one first." }, 409);
        const r = await db.prepare("INSERT OR IGNORE INTO delve (user_id, wid, name, data, rev, updated) VALUES (?, ?, ?, ?, 1, ?)").bind(u.id, wid, name, b.data, now).run();
        if (!r.meta || r.meta.changes !== 1) return conflict();
        return json({ rev: 1, updated: now });
      }
      if (cur.rev !== b.baseRev) return conflict();
      const r = await db.prepare("UPDATE delve SET data = ?, name = ?, rev = rev + 1, updated = ? WHERE user_id = ? AND wid = ? AND rev = ?")
        .bind(b.data, name, now, u.id, wid, b.baseRev).run();
      if (!r.meta || r.meta.changes !== 1) return conflict();
      return json({ rev: b.baseRev + 1, updated: now });
    }
    return json({ error: "Not found" }, 404);
  }

  return json({ error: "Not found" }, 404);
}
let mpReady = false;
async function mpTable(db) {
  if (mpReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS mp_rooms (code TEXT PRIMARY KEY, host_id TEXT NOT NULL, host_name TEXT NOT NULL, name TEXT NOT NULL, pub INTEGER NOT NULL, pvp INTEGER NOT NULL, players INTEGER NOT NULL, updated INTEGER NOT NULL)").run();
  // site: the web address the room was opened on. Live connections only meet if both players use the same address (each deployed copy of the
  // Worker has its own rooms, even when they share this database), so a guest on another address is sent to the right one.
  try { await db.prepare("ALTER TABLE mp_rooms ADD COLUMN site TEXT NOT NULL DEFAULT ''").run(); } catch (e) {}
  mpReady = true;
}
const MP_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function mpCode() { const r = rand(6); let s = ""; for (const b of r) s += MP_CHARS[b % MP_CHARS.length]; return s; }

// ===== DelveRoom: one Durable Object per room code. It only relays messages; the host's game runs the world. =====
// Sockets use the hibernation API, so an idle room costs nothing. Each socket's attachment holds {id, role, name}.
//   Guest messages of the kinds in BCAST go to everyone else; other guest messages go to the host only.
//   Host messages go to every guest, or to one player when they carry {to}. Any message with {to} goes only to that player.
//   Host-only controls: {t:"kick", id}, {t:"meta", players, pub, pvp} (refreshes the lobby listing).
const MP_MAX = 4, MP_BCAST = { p: 1, set: 1, wall: 1, chat: 1, me: 1, fx: 1 };
export class DelveRoom {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.rate = new Map();
    try { this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong")); } catch (e) {}   // keep-alive, answered without waking the room
  }
  metas() { return this.ctx.getWebSockets().map(w => ({ w, m: w.deserializeAttachment() })).filter(q => q.m); }
  send(w, o) { try { w.send(typeof o === "string" ? o : JSON.stringify(o)); } catch (e) {} }
  async listing(players) {
    const code = (this.metas()[0] || {}).m; if (!code || !this.env.DB) return;
    try { await this.env.DB.prepare("UPDATE mp_rooms SET players = ?, updated = ? WHERE code = ?").bind(players, Date.now(), code.code).run(); } catch (e) {}
  }
  async fetch(req) {
    if ((req.headers.get("upgrade") || "").toLowerCase() !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const role = req.headers.get("x-mp-role") === "host" ? "host" : "guest", name = req.headers.get("x-mp-name") || "Guest", code = req.headers.get("x-mp-code") || "";
    const pair = new WebSocketPair(), [client, server] = Object.values(pair), others = this.metas();
    this.ctx.acceptWebSocket(server);
    const refuse = msg => { this.send(server, { t: "error", m: msg }); try { server.close(4000, msg.slice(0, 120)); } catch (e) {} return new Response(null, { status: 101, webSocket: client }); };
    if (role === "host") others.forEach(q => { if (q.m.role === "host") { this.send(q.w, { t: "error", m: "You opened this world somewhere else." }); try { q.w.close(4001, "replaced"); } catch (e) {} } });
    else {
      if (!others.some(q => q.m.role === "host" && !q.m.left)) return refuse("The host's world isn't open right now. Ask them to keep Delve open (or reopen Play together), then try again in a few seconds.");
      if (others.length >= MP_MAX) return refuse("This world is full (" + MP_MAX + " players).");
    }
    const id = ((await this.ctx.storage.get("n")) || 0) + 1; await this.ctx.storage.put("n", id);
    const live = others.filter(q => !(role === "host" && q.m.role === "host"));
    server.serializeAttachment({ id, role, name, code });
    this.send(server, { t: "hello", id, role, pvp: req.headers.get("x-mp-pvp") === "1", players: live.map(q => ({ id: q.m.id, name: q.m.name, role: q.m.role })) });
    live.forEach(q => this.send(q.w, { t: "join", id, name, role }));
    await this.listing(live.length + 1);
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, data) {
    const me = ws.deserializeAttachment(); if (!me || typeof data !== "string") return;
    if (data.length > (me.role === "host" ? 1500000 : 32000)) return;
    if (me.role !== "host") {   // a guest may send at most 60 messages a second
      const now = Date.now(), r = this.rate.get(me.id) || { t: now, n: 0 };
      if (now - r.t > 1000) { r.t = now; r.n = 0; } if (++r.n > 60) { this.rate.set(me.id, r); return; } this.rate.set(me.id, r);
    }
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m.t !== "string") return;
    m.from = me.id; const all = this.metas();
    if (me.role === "host" && m.t === "kick") { const q = all.find(q => q.m.id === m.id && q.m.role !== "host"); if (q) { this.send(q.w, { t: "kicked" }); try { q.w.close(4002, "kicked"); } catch (e) {} } return; }
    if (me.role === "host" && m.t === "meta") {
      if (this.env.DB) try { await this.env.DB.prepare("UPDATE mp_rooms SET players = ?, pub = ?, pvp = ?, updated = ? WHERE code = ?").bind(all.length, m.pub ? 1 : 0, m.pvp ? 1 : 0, Date.now(), me.code).run(); } catch (e) {}
      return;
    }
    const out = JSON.stringify(m);
    if (m.to) { const q = all.find(q => q.m.id === m.to); if (q) this.send(q.w, out); return; }
    all.forEach(q => { if (q.w === ws) return; if (me.role === "host" || MP_BCAST[m.t] || q.m.role === "host") this.send(q.w, out); });
  }
  async webSocketClose(ws, code, reason) { await this.gone(ws, code === 1000); try { ws.close(code === 1005 ? 1000 : code, "bye"); } catch (e) {} }
  async webSocketError(ws) { await this.gone(ws, false); }
  async gone(ws, clean) {
    const me = ws.deserializeAttachment(); if (!me || me.left) return; me.left = true; try { ws.serializeAttachment(me); } catch (e) {}
    const rest = this.metas().filter(q => q.w !== ws && !q.m.left);
    if (me.role === "host" && !rest.some(q => q.m.role === "host" && !q.m.left)) {
      rest.forEach(q => { this.send(q.w, { t: "hostleft" }); try { q.w.close(4003, "host left"); } catch (e) {} });
      // closed on purpose: the room is gone. Dropped (phone asleep, network blip): keep the code for a few minutes so the host's game can reconnect to it.
      if (this.env.DB) try { if (clean) await this.env.DB.prepare("DELETE FROM mp_rooms WHERE code = ?").bind(me.code).run(); else await this.env.DB.prepare("UPDATE mp_rooms SET players = 0 WHERE code = ?").bind(me.code).run(); } catch (e) {}
      return;
    }
    rest.forEach(q => this.send(q.w, { t: "leave", id: me.id }));
    await this.listing(rest.length);
  }
}

let delveReady = false;
async function delveTable(db) {
  if (delveReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS delve (user_id TEXT NOT NULL, wid TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL, rev INTEGER NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (user_id, wid))").run();
  delveReady = true;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/"))
      return env.ASSETS ? env.ASSETS.fetch(req) : new Response("Not found", { status: 404 });
    try { return await api(req, env, url); }
    catch (e) { console.error(e); return json({ error: "Server error" }, 500); }
  }
};
