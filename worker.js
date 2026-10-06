// ===== SwampRealms accounts API: Cloudflare Worker + D1 =====
// Handles only /api/* (see run_worker_first in wrangler.jsonc). Everything else is served as static files.
// Username + password sign in, a session cookie, and one cloud save per account.

const enc = new TextEncoder();
const SESSION_DAYS = 30;
const ITER = 100000;          // Cloudflare Workers allows at most 100,000 PBKDF2 iterations
const MAX_SAVE = 200000;      // largest cloud save, in characters of JSON
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

  return json({ error: "Not found" }, 404);
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
