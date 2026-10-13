// ===== SwampRealms: Delve (Stage 1: single-player dig-and-build sandbox) =====
// Load AFTER cards.js, weapons.js, avatar.js, store.js, account.js, menu.js and sandbox-world.js (see sandbox.html).
// Everything lives inside this function so it can never clash with globals in cards.js / store.js.
//
// SAVING: the whole game is one localStorage key, "swamp-delve-v1" (this browser only, NOT cloud-synced in Stage 1).
//   { v, seed, e:"idx:tile,idx:tile" (only tiles you changed), ex:"run-length explored map", p:{x,y,f}, animal, inv:{item:n}, mru:[item],
//     tier (pick level 1-4), time (0-480 day clock), ms:{milestone:1}, st:{mined,placed,torches,wood,maxDepth,swim}, zoom }
// Swamp Coins and Swamp Crystals are never read or written. Nothing here pays out currency.
(function () {
  "use strict";
  if (typeof SbxWorld === "undefined") return;
  var SW = SbxWorld, W = SW.W, H = SW.H, SURF = SW.SURF, T = SW.T, TILES = SW.TILES, ITEMS = SW.ITEMS, ORDER = SW.ITEM_ORDER, BIOMES = SW.BIOMES;

  // ---------- TUNING ----------
  var KEY = "swamp-delve-v1", CYCLE = 480, REACH = 5.6, PW = 0.7, PH = 1.5, SAVE_MS = 8000;
  var PICKS = [
    { n: "Reed Pick", c: "#c9b58a", sp: 1 }, { n: "Glowspore Pick", c: "#4ee6b4", sp: 1.8 },
    { n: "Cinder Pick", c: "#ff8a3d", sp: 2.8 }, { n: "Frost Pick", c: "#7fd6ff", sp: 4.2 }
  ];
  var RECIPES = [
    { id: "planks", n: "Planks", out: { planks: 2 }, cost: { wood: 1 }, d: "Build walls, floors and bridges." },
    { id: "torch", n: "Torches (4)", out: { torch: 4 }, cost: { wood: 1, spore: 1 }, d: "Light up caves. Place next to a wall." },
    { id: "pick2", n: "Glowspore Pick", tier: 2, cost: { spore: 12, wood: 8 }, d: "Digs 1.8x faster. Breaks Basalt and Cinder Ore." },
    { id: "pick3", n: "Cinder Pick", tier: 3, cost: { cinder: 14, basalt: 10, planks: 8 }, d: "Digs 2.8x faster. Breaks Frostrock and Frost Crystal." },
    { id: "pick4", n: "Frost Pick", tier: 4, cost: { crystal: 16, frostrock: 12, planks: 6 }, d: "The fastest pick in the swamp. Digs 4.2x faster." }
  ];
  var GOALS = [
    { id: "dig", n: "First Dig", d: "Mine your first block", f: function () { return S.st.mined >= 1; } },
    { id: "wood", n: "Timber!", d: "Collect 10 Wood", f: function () { return S.st.wood >= 10; } },
    { id: "swim", n: "Wet Paws", d: "Swim in the swamp", f: function () { return S.st.swim >= 2; } },
    { id: "glow", n: "Glow Finder", d: "Mine Glowspore Ore", f: function () { return (S.inv.spore || 0) + S.st.torches > 0 || S.tier >= 2; } },
    { id: "lights", n: "Night Light", d: "Place 10 Torches", f: function () { return S.st.torches >= 10; } },
    { id: "pick2", n: "Spore Smith", d: "Craft the Glowspore Pick", f: function () { return S.tier >= 2; } },
    { id: "ember", n: "Into the Ember", d: "Reach Ember Bog", f: function () { return bioAt() === 1 || S.ms.ember; } },
    { id: "pick3", n: "Cinder Smith", d: "Craft the Cinder Pick", f: function () { return S.tier >= 3; } },
    { id: "frost", n: "Frozen Feet", d: "Reach Frostfen", f: function () { return bioAt() === 2 || S.ms.frost; } },
    { id: "pick4", n: "Frost Smith", d: "Craft the Frost Pick", f: function () { return S.tier >= 4; } },
    { id: "build", n: "Builder", d: "Place 100 blocks", f: function () { return S.st.placed >= 100; } },
    { id: "deep", n: "Deep Diver", d: "Dig down to depth 50", f: function () { return S.st.maxDepth >= 50; } }
  ];
  var PHN = { day: "Day", dusk: "Dusk", night: "Night", dawn: "Dawn" };

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var lerp = function (a, b, k) { return a + (b - a) * k; };
  var reduce = matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = matchMedia && matchMedia("(pointer: coarse)").matches;
  var cv = $("sbxCv"), ctx = cv.getContext("2d");
  var stageEl = $("sbxStage");

  // ---------- STATE ----------
  var S, world, tiles, orig, edits, col, ex;
  var p = { x: 40.5, y: 34, vx: 0, vy: 0, face: 1, on: false, coy: 0, wet: false, walk: 0 };
  var cam = { x: 40, y: 34 }, keys = { l: 0, r: 0, j: 0 }, tk = { l: 0, r: 0, j: 0 };
  var sel = "pick", mine = null, aim = { down: false, id: null, mx: 0, my: 0, tx: -1, ty: -1 }, cool = 0;
  var parts = [], texts = [], flies = [], glows = [];
  var vw = 800, vh = 600, dpr = 1, ts = 28, ox = 0, oy = 0;
  var panelOpen = false, tab = "craft", hbDirty = true, lastBio = -1, hudT = 0, saveT = 0, msT = 0, nagT = 0, exKey = "", sprite = null, spriteKey = "", confirmNew = false;
  var ICO = {}, ATLAS, bannerQ = [], bannerBusy = false;

  // ---------- SAVE / LOAD ----------
  function rle(a) { var out = [], v = 0, n = 0; for (var i = 0; i < a.length; i++) { if (a[i] === v) n++; else { out.push(n); v = a[i]; n = 1; } } out.push(n); return out.join(","); }
  function unrle(s, a) { if (typeof s !== "string") return; var v = 0, i = 0, parts2 = s.split(","); for (var k = 0; k < parts2.length; k++) { var n = parseInt(parts2[k], 10) || 0; if (v) a.fill(1, i, Math.min(a.length, i + n)); i += n; v ^= 1; } }
  function defaultAnimal() { try { return Crystals.outfit().animal || "frog"; } catch (e) { return "frog"; } }
  function fresh(seed) { return { v: 1, seed: seed, e: "", ex: "", p: null, animal: defaultAnimal(), inv: {}, mru: [], tier: 1, time: 60, ms: {}, st: { mined: 0, placed: 0, torches: 0, wood: 0, maxDepth: 0, swim: 0 }, zoom: 1 }; }
  function clean(o) {
    if (!o || typeof o !== "object" || !o.seed) return null;
    var d = fresh(o.seed | 0 || 1);
    d.e = typeof o.e === "string" ? o.e : ""; d.ex = typeof o.ex === "string" ? o.ex : "";
    if (o.p && isFinite(o.p.x) && isFinite(o.p.y)) d.p = { x: clamp(+o.p.x, 1, W - 1), y: clamp(+o.p.y, 2, H - 2), f: o.p.f < 0 ? -1 : 1 };
    if (typeof o.animal === "string") d.animal = o.animal;
    if (o.inv && typeof o.inv === "object") ORDER.forEach(function (k) { var n = Math.floor(+o.inv[k]); if (n > 0) d.inv[k] = Math.min(n, 99999); });
    if (Array.isArray(o.mru)) d.mru = o.mru.filter(function (k) { return ITEMS[k] && ITEMS[k].tile !== undefined; }).slice(0, 20);
    d.tier = clamp(Math.floor(+o.tier) || 1, 1, 4); d.time = clamp(+o.time || 60, 0, CYCLE - 0.01);
    if (o.ms && typeof o.ms === "object") GOALS.forEach(function (g) { if (o.ms[g.id]) d.ms[g.id] = 1; });
    if (o.st && typeof o.st === "object") Object.keys(d.st).forEach(function (k) { d.st[k] = Math.max(0, Math.floor(+o.st[k]) || 0); });
    d.zoom = [0.8, 1, 1.25, 1.5, 2].indexOf(+o.zoom) > -1 ? +o.zoom : 1;
    return d;
  }
  function build(state) {
    world = SW.gen(state.seed); tiles = world.t; orig = tiles.slice(); edits = {};
    state.e.split(",").forEach(function (s) { var a = s.split(":"), i = parseInt(a[0], 10), id = parseInt(a[1], 10); if (i >= 0 && i < tiles.length && TILES[id]) { tiles[i] = id; if (id !== orig[i]) edits[i] = id; } });
    col = new Int16Array(W); for (var x = 0; x < W; x++) recalc(x);
    ex = new Uint8Array(W * H); unrle(state.ex, ex);
  }
  function start(state) {
    S = state; build(S);
    var sp = world.spawn; p.x = S.p ? S.p.x : sp.x; p.y = S.p ? S.p.y : sp.y; p.face = S.p ? S.p.f : 1; p.vx = p.vy = 0;
    var guard = 0; while (boxHit(p.x, p.y) && guard++ < 120) p.y -= 1;
    cam.x = p.x; cam.y = p.y - 1; sel = "pick"; mine = null; lastBio = -1; hbDirty = true; exKey = ""; spriteKey = ""; ICO = {};
    reveal(true);
  }
  function save() {
    try {
      S.p = { x: +p.x.toFixed(2), y: +p.y.toFixed(2), f: p.face };
      S.e = Object.keys(edits).map(function (k) { return k + ":" + edits[k]; }).join(",");
      S.ex = rle(ex);
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (e) {}
  }
  function load() {
    var o = null; try { o = clean(JSON.parse(localStorage.getItem(KEY))); } catch (e) {}
    start(o || fresh(Math.floor(Math.random() * 2e9) + 1));
  }

  // ---------- WORLD ACCESS ----------
  function get(x, y) { if (x < 0 || x >= W) return T.BEDROCK; if (y < 0) return T.AIR; if (y >= H) return T.BEDROCK; return tiles[y * W + x]; }
  var opaque = function (id) { return TILES[id].solid && id !== T.LEAVES; };
  function recalc(x) { for (var y = 0; y < H; y++) if (opaque(tiles[y * W + x])) { col[x] = y; return; } col[x] = H; }
  function setT(x, y, id) {
    var i = y * W + x; tiles[i] = id;
    if (id === orig[i]) delete edits[i]; else edits[i] = id;
    recalc(x);
  }
  var bioAt = function () { return world.bio[clamp(Math.floor(p.x), 0, W - 1)]; };
  function boxHit(x, y) {
    var x0 = Math.floor(x - PW / 2 + 1e-4), x1 = Math.floor(x + PW / 2 - 1e-4), y0 = Math.floor(y - PH + 1e-4), y1 = Math.floor(y - 1e-4);
    for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) if (TILES[get(xx, yy)].solid) return true;
    return false;
  }
  function touches(kind) {
    var x0 = Math.floor(p.x - PW / 2), x1 = Math.floor(p.x + PW / 2), y0 = Math.floor(p.y - PH), y1 = Math.floor(p.y - 0.05);
    for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) if (TILES[get(xx, yy)].kind === kind) return true;
    return false;
  }

  // ---------- INVENTORY ----------
  function give(item, n, tx, ty) {
    S.inv[item] = (S.inv[item] || 0) + n;
    if (item === "wood") S.st.wood += n;
    if (ITEMS[item].tile !== undefined && S.mru.indexOf(item) < 0) S.mru.push(item);
    if (tx !== undefined) text(tx + 0.5, ty, "+" + n + " " + ITEMS[item].n, ITEMS[item].gem || "#f6eedb");
    hbDirty = true; if (panelOpen) renderPanel();
  }
  function hot() { return S.mru.filter(function (k) { return (S.inv[k] || 0) > 0; }).slice(0, 6); }
  function choose(id) {
    if (id === "pick") sel = "pick";
    else if ((S.inv[id] || 0) > 0 && ITEMS[id] && ITEMS[id].tile !== undefined) { sel = id; S.mru = [id].concat(S.mru.filter(function (k) { return k !== id; })); }
    mine = null; hbDirty = true;
  }

  // ---------- DAY / NIGHT ----------
  function phaseOf(t) { if (t < 240) return { id: "day", k: t / 240 }; if (t < 280) return { id: "dusk", k: (t - 240) / 40 }; if (t < 440) return { id: "night", k: (t - 280) / 160 }; return { id: "dawn", k: (t - 440) / 40 }; }
  function daylight(t) { var f = phaseOf(t); return f.id === "day" ? 1 : f.id === "dusk" ? 1 - 0.7 * f.k : f.id === "night" ? 0.3 : 0.3 + 0.7 * f.k; }
  var SKY = { day: [[56, 160, 205], [176, 226, 214]], dusk: [[88, 52, 112], [255, 150, 90]], night: [[5, 8, 24], [14, 32, 52]], dawn: [[52, 66, 120], [255, 176, 140]] };
  var mixC = function (a, b, k) { return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; };
  var rgb = function (c) { return "rgb(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + ")"; };
  function skyAt(t) {
    var f = phaseOf(t), k = f.k, a, b, m;
    if (f.id === "day") return SKY.day;
    if (f.id === "night") return SKY.night;
    var from = f.id === "dusk" ? SKY.day : SKY.night, mid = f.id === "dusk" ? SKY.dusk : SKY.dawn, to = f.id === "dusk" ? SKY.night : SKY.day;
    if (k < 0.5) { m = k * 2; return [mixC(from[0], mid[0], m), mixC(from[1], mid[1], m)]; }
    m = (k - 0.5) * 2; return [mixC(mid[0], to[0], m), mixC(mid[1], to[1], m)];
  }

  // ---------- TILE PAINTER (no image files: every tile is drawn in code) ----------
  function buildAtlas() {
    ATLAS = document.createElement("canvas"); ATLAS.width = 64; ATLAS.height = 16 * TILES.length;
    var g = ATLAS.getContext("2d");
    TILES.forEach(function (td) { for (var v = 0; v < 4; v++) paint(g, td, v, td.id * 16); });
  }
  function paint(g, td, v, oy) {
    var id = td.id, ox = v * 16, hh = function (x, y, s) { return SW.hash(x + v * 16, y + id * 31, s + id); };
    var rect = function (x, y, w, h, c, a) { g.globalAlpha = a == null ? 1 : a; g.fillStyle = c; g.fillRect(ox + x, oy + y, w, h); g.globalAlpha = 1; };
    var x, y;
    if (id === T.AIR || id === T.WATER || id === T.LAVA) return;
    if (td.kind === "torch") { rect(7, 6, 2, 10, "#7a5230"); rect(7, 6, 2, 1, "#9b6b3f"); rect(6, 2, 4, 5, "#ff8a1f"); rect(7, 1, 2, 3, "#ffd25a"); rect(7, 4, 2, 2, "#fff2b0"); return; }
    if (td.kind === "glowcap") { rect(7, 9, 2, 7, "#d8e8d0"); rect(4, 6, 8, 4, "#2fbf93"); rect(5, 5, 6, 2, "#4ee6b4"); rect(6, 4, 4, 1, "#8ff7d8"); rect(6, 7, 1, 1, "#c8fff4"); rect(9, 8, 1, 1, "#c8fff4"); rect(10, 6, 1, 1, "#c8fff4"); return; }
    rect(0, 0, 16, 16, td.c);
    var sc = td.kind === "ore" ? "#ffffff" : td.c2, sa = td.kind === "ore" ? 0.1 : 0.5;
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) { var r = hh(x, y, 1); if (r < 0.17) rect(x, y, 1, 1, sc, sa); else if (r > 0.9) rect(x, y, 1, 1, "#000", 0.2); }
    if (td.kind === "moss") for (x = 0; x < 16; x++) { var d = 3 + Math.floor(hh(x, 0, 7) * 3); rect(x, 0, 1, d, "#3f8f3a"); rect(x, 0, 1, 1, "#7ccf55"); if (hh(x, 1, 8) > 0.6) rect(x, d, 1, 1, "#3f8f3a"); }
    if (td.kind === "snow") { rect(0, 0, 16, 3, "#ffffff"); for (x = 0; x < 16; x++) if (hh(x, 2, 9) > 0.5) rect(x, 3, 1, 1, "#ffffff"); }
    if (td.kind === "ash") for (x = 0; x < 16; x += 3) rect(x + Math.floor(hh(x, 5, 3) * 2), Math.floor(hh(x, 6, 4) * 14), 2, 1, "#3d3532", 0.5);
    if (td.kind === "ice") { for (x = 0; x < 16; x += 5) for (y = 0; y < 12; y += 4) rect((x + y) % 15, y, 3, 1, "#fff", 0.45); }
    if (td.kind === "log") { for (x = 2; x < 16; x += 4) rect(x + (hh(x, 0, 3) > 0.5 ? 1 : 0), 0, 1, 16, td.c2, 0.9); rect(0, 0, 1, 16, "#8a6340", 0.7); }
    if (td.kind === "leaves") { rect(0, 0, 16, 16, td.c); for (var k = 0; k < 14; k++) { var lx = Math.floor(hh(k, 0, 4) * 14), ly = Math.floor(hh(k, 1, 5) * 14); rect(lx, ly, 2, 2, k % 2 ? td.c2 : "#1f5a2c"); } }
    if (td.kind === "planks") { rect(0, 7, 16, 1, "#6e431f"); rect(0, 15, 16, 1, "#6e431f"); rect(3, 2, 1, 1, "#4a2c12"); rect(12, 10, 1, 1, "#4a2c12"); rect(0, 0, 16, 1, "#d79c60", 0.8); }
    if (td.kind === "ore") for (var j = 0; j < 4; j++) { var cx = 2 + Math.floor(hh(j, 3, 5) * 10), cy = 2 + Math.floor(hh(j, 4, 6) * 10); rect(cx, cy, 3, 2, td.c2); rect(cx, cy, 1, 1, "#fff", 0.85); rect(cx + 1, cy + 2, 1, 1, td.c2, 0.6); }
    if (id === T.FROSTROCK) for (var q = 0; q < 3; q++) { var qx = Math.floor(hh(q, 8, 2) * 12), qy = Math.floor(hh(q, 9, 3) * 12); rect(qx, qy, 3, 1, "#a8c8dc", 0.6); rect(qx + 2, qy + 1, 1, 2, "#a8c8dc", 0.6); }
    if (id === T.BEDROCK) for (var b = 0; b < 8; b++) rect(Math.floor(hh(b, 0, 6) * 14), Math.floor(hh(b, 1, 7) * 14), 2, 2, td.c2);
    if (td.solid && td.kind !== "leaves") { rect(0, 0, 16, 1, "#fff", 0.1); rect(0, 0, 1, 16, "#fff", 0.05); rect(0, 15, 16, 1, "#000", 0.22); rect(15, 0, 1, 16, "#000", 0.12); }
  }
  function icon(id) {
    var key = id === "pick" ? "pick" + S.tier : id;
    if (ICO[key]) return ICO[key];
    var c = document.createElement("canvas"); c.width = c.height = 32; var g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    if (id === "pick") {
      var pk = PICKS[S.tier - 1];
      g.strokeStyle = "#8a5a32"; g.lineWidth = 4; g.lineCap = "round"; g.beginPath(); g.moveTo(9, 26); g.lineTo(22, 10); g.stroke();
      g.strokeStyle = pk.c; g.lineWidth = 4; g.beginPath(); g.arc(18, 14, 10, Math.PI * 1.05, Math.PI * 1.75); g.stroke();
      g.strokeStyle = "#ffffff55"; g.lineWidth = 1.5; g.beginPath(); g.arc(18, 14, 11.5, Math.PI * 1.15, Math.PI * 1.55); g.stroke();
    } else if (ITEMS[id].gem) {
      var gc = ITEMS[id].gem; g.fillStyle = gc; g.beginPath(); g.moveTo(16, 4); g.lineTo(26, 14); g.lineTo(16, 28); g.lineTo(6, 14); g.closePath(); g.fill();
      g.fillStyle = "#ffffff88"; g.beginPath(); g.moveTo(16, 4); g.lineTo(21, 14); g.lineTo(16, 14); g.lineTo(11, 14); g.closePath(); g.fill();
      g.strokeStyle = "#00000055"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(16, 4); g.lineTo(26, 14); g.lineTo(16, 28); g.lineTo(6, 14); g.closePath(); g.stroke();
    } else { var t = ITEMS[id].tile; g.drawImage(ATLAS, 0, t * 16, 16, 16, 2, 2, 28, 28); }
    return (ICO[key] = c.toDataURL());
  }

  // ---------- PLAYER SPRITE (your avatar, gear included) ----------
  function mkSprite() {
    var key = S.animal + "|" + (function () { try { return JSON.stringify(Crystals.outfit()); } catch (e) { return ""; } })();
    if (key === spriteKey) return; spriteKey = key; sprite = null;
    try {
      var o = Object.assign({}, Crystals.outfit(), { animal: S.animal, nobg: true });
      var svg = AV.svg(o).replace('viewBox="0 0 200 200"', 'viewBox="22 4 156 156" width="156" height="156"');
      var im = new Image(); im.onload = function () { sprite = im; }; im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    } catch (e) {}
  }

  // ---------- SOUND (tiny synth, follows the site's sound switch) ----------
  var ac = null;
  function thud(f, vol) {
    try {
      if (typeof SFX !== "undefined" && SFX.on === false) return;
      ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume();
      var t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.type = "triangle"; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.09);
      g.gain.setValueAtTime(vol || 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.12);
    } catch (e) {}
  }
  var snd = function (n, a) { try { if (typeof SFX !== "undefined" && SFX[n]) SFX[n](a); } catch (e) {} };

  // ---------- EFFECTS ----------
  function chips(x, y, color, n, power) {
    if (reduce) n = Math.ceil(n / 3);
    for (var i = 0; i < n; i++) parts.push({ x: x, y: y, vx: (Math.random() - 0.5) * (power || 5), vy: -Math.random() * (power || 5) - 1, life: 0.5 + Math.random() * 0.4, max: 0.9, c: color, s: 2 + Math.random() * 3 });
  }
  function text(x, y, s, c) { texts.push({ x: x, y: y, life: 1.3, s: s, c: c }); }
  function toast(msg, color) {
    var el = $("sbxToast"); el.textContent = msg; el.style.setProperty("--tc", color || "#4ee6b4"); el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
  }
  function nag(msg) { if (performance.now() - nagT < 1800) return; nagT = performance.now(); toast(msg, "#f2c14e"); }
  function banner(title, desc) { bannerQ.push([title, desc]); if (!bannerBusy) nextBanner(); }
  function nextBanner() {
    var b = bannerQ.shift(), el = $("sbxBanner"); if (!b) { bannerBusy = false; return; }
    bannerBusy = true; el.innerHTML = "<small>Goal complete</small><b>" + esc(b[0]) + "</b><span>" + esc(b[1]) + "</span>";
    el.classList.remove("on"); void el.offsetWidth; el.classList.add("on"); snd("rise");
    setTimeout(function () { el.classList.remove("on"); setTimeout(nextBanner, 350); }, 2900);
  }

  // ---------- RULES ----------
  function dropQty(td) { return td.kind === "ore" ? 1 + (Math.random() < 0.6 ? 1 : 0) : 1; }
  function breakTile(x, y) {
    var id = get(x, y), td = TILES[id];
    setT(x, y, T.AIR); S.st.mined++;
    chips(x + 0.5, y + 0.5, td.kind === "ore" ? td.c2 : td.c, td.kind === "ore" ? 14 : 9, 6);
    thud(td.hard > 2 ? 110 : 160, 0.08);
    if (td.drop) { var n = dropQty(td); give(td.drop, n, x, y); if (td.kind === "ore") snd("coin"); }
    if (id === T.LOG && get(x, y - 1) === T.LOG) { /* upper trunk stays; keep it simple and forgiving */ }
  }
  function canPlace(tx, ty, item) {
    var id = get(tx, ty), td = ITEMS[item]; if (id !== T.AIR && id !== T.WATER) return false;
    if (ty < 1 || ty >= H - 3 || tx < 1 || tx >= W - 1) return false;
    var t = td.tile, solid = TILES[t].solid;
    if (solid && tx + 1 > p.x - PW / 2 && tx < p.x + PW / 2 && ty + 1 > p.y - PH && ty < p.y) return false;
    return TILES[get(tx - 1, ty)].solid || TILES[get(tx + 1, ty)].solid || TILES[get(tx, ty - 1)].solid || TILES[get(tx, ty + 1)].solid;
  }
  function place(tx, ty, item) {
    setT(tx, ty, ITEMS[item].tile); S.inv[item]--; S.st.placed++; if (item === "torch") S.st.torches++;
    chips(tx + 0.5, ty + 0.5, TILES[ITEMS[item].tile].c2 || "#fff", 4, 3); thud(item === "torch" ? 420 : 240, 0.05);
    if (S.inv[item] <= 0) { delete S.inv[item]; if (sel === item) sel = "pick"; }
    hbDirty = true; if (panelOpen) renderPanel();
  }
  function useTool(dt) {
    if (!aim.down || aim.tx < 0) { mine = null; return; }
    var tx = aim.tx, ty = aim.ty, dx = tx + 0.5 - p.x, dy = ty + 0.5 - (p.y - PH / 2);
    if (dx * dx + dy * dy > REACH * REACH) { mine = null; return; }
    if (sel === "pick") {
      var id = get(tx, ty), td = TILES[id];
      if (id === T.BEDROCK) { nag("Bedrock can't be broken."); mine = null; return; }
      if (id === T.AIR || !isFinite(td.hard)) { mine = null; return; }
      if (td.tier > S.tier) { nag("Needs the " + PICKS[td.tier - 2].n + " to break " + td.n + "."); mine = null; return; }
      if (!mine || mine.x !== tx || mine.y !== ty) mine = { x: tx, y: ty, p: 0, tick: 0 };
      mine.p += dt * PICKS[S.tier - 1].sp / td.hard; mine.tick -= dt;
      if (mine.tick <= 0) { mine.tick = 0.17; thud(150 + Math.random() * 50, 0.035); chips(tx + 0.5, ty + 0.5, td.kind === "ore" ? td.c2 : td.c, 1, 3); }
      if (mine.p >= 1) { breakTile(tx, ty); mine = null; }
    } else {
      cool -= dt; if (cool > 0) return; cool = 0.13;
      if ((S.inv[sel] || 0) > 0 && canPlace(tx, ty, sel)) place(tx, ty, sel);
    }
  }
  function craft(id) {
    var r = RECIPES.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    if (r.tier && S.tier >= r.tier) return;
    for (var k in r.cost) if ((S.inv[k] || 0) < r.cost[k]) { toast("Not enough " + ITEMS[k].n + ".", "#f2c14e"); return; }
    for (var c in r.cost) { S.inv[c] -= r.cost[c]; if (S.inv[c] <= 0) delete S.inv[c]; }
    if (r.tier) { S.tier = r.tier; ICO = {}; toast(r.n + " crafted. Dig faster!", PICKS[r.tier - 1].c); snd("open", "Epic"); chips(p.x, p.y - 1, PICKS[r.tier - 1].c, 30, 9); }
    else { for (var o in r.out) give(o, r.out[o]); toast("Crafted " + r.n, "#4ee6b4"); snd("coin"); }
    hbDirty = true; renderPanel(); save();
  }
  function checkGoals() {
    GOALS.forEach(function (g) { if (!S.ms[g.id] && g.f()) { S.ms[g.id] = 1; banner(g.n, g.d); } });
  }
  function respawn(msg) {
    var sp = world.spawn; p.x = sp.x; p.y = sp.y; p.vx = p.vy = 0;
    var guard = 0; while (boxHit(p.x, p.y) && guard++ < 120) p.y -= 1;
    cam.x = p.x; cam.y = p.y - 1; toast(msg, "#ff8a3d");
  }
  function reveal(all) {
    var cx = Math.floor(p.x), cy = Math.floor(p.y - 1), R = 9;
    for (var y = cy - R; y <= cy + R; y++) for (var x = cx - R; x <= cx + R; x++) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue; var dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= R * R + 2) ex[y * W + x] = 1;
    }
  }

  // ---------- PHYSICS ----------
  function approach(v, t, d) { return v < t ? Math.min(t, v + d) : Math.max(t, v - d); }
  function step(h, dir, jump) {
    var feetWet = TILES[get(Math.floor(p.x), Math.floor(p.y - 0.2))].kind === "water";
    p.wet = TILES[get(Math.floor(p.x), Math.floor(p.y - PH * 0.5))].kind === "water";
    var sp = p.wet ? 3.6 : 6.3, acc = p.on ? 70 : 34;
    p.vx = approach(p.vx, dir * sp, (dir ? acc : (p.on ? 60 : 8)) * h);
    p.vy = Math.min(p.wet ? 4 : 27, p.vy + (p.wet ? 13 : 40) * h);
    if (p.on || feetWet) p.coy = 0.1; else p.coy -= h;
    if (jump) { if (p.wet) p.vy = Math.max(p.vy - 52 * h, -5.2); else if (p.coy > 0) { p.vy = feetWet ? -9 : -14.2; p.coy = 0; p.on = false; } }
    // horizontal, with automatic one-block step-up
    var nx = clamp(p.x + p.vx * h, 1, W - 1);
    if (!boxHit(nx, p.y)) p.x = nx;
    else if ((p.on || feetWet) && !boxHit(nx, p.y - 1.001) && !boxHit(p.x, p.y - 1.001)) { p.x = nx; p.y -= 1; }
    else p.vx = 0;
    // vertical
    var ny = p.y + p.vy * h; p.on = false;
    if (!boxHit(p.x, ny)) p.y = ny;
    else if (p.vy > 0) { p.y = Math.floor(ny); var g = 0; while (boxHit(p.x, p.y) && g++ < 4) p.y -= 1; p.on = true; p.vy = 0; }
    else { p.y = Math.ceil(ny - PH) + PH; p.vy = 0; }
    if (p.y > H - 2) { p.y = H - 2.01; p.vy = 0; }
  }
  function update(dt) {
    S.time = (S.time + dt) % CYCLE;
    var dir = ((keys.r || tk.r) ? 1 : 0) - ((keys.l || tk.l) ? 1 : 0), jump = keys.j || tk.j;
    if (dir) p.face = dir;
    var sub = Math.ceil(dt / 0.02), h = dt / sub;
    for (var i = 0; i < sub; i++) step(h, dir, jump);
    p.walk += Math.abs(p.vx) * dt; if (p.wet) S.st.swim += dt;
    if (touches("lava")) respawn("Singed by lava! Back at camp.");
    var depth = Math.max(0, Math.floor(p.y - SURF)); if (depth > S.st.maxDepth) S.st.maxDepth = depth;
    var tcx = Math.floor(p.x), tcy = Math.floor(p.y - 1); if (tcx + "," + tcy !== exKey) { exKey = tcx + "," + tcy; reveal(); }
    cam.x += (p.x - cam.x) * Math.min(1, dt * 7); cam.y += (p.y - 1.1 - cam.y) * Math.min(1, dt * 6);
    var halfW = vw / 2 / ts, halfH = vh / 2 / ts;
    cam.x = W <= halfW * 2 ? W / 2 : clamp(cam.x, halfW, W - halfW); cam.y = H <= halfH * 2 ? H / 2 : clamp(cam.y, halfH, H - halfH + 2);
    // aim tile follows the camera while a finger or mouse is held still
    aim.tx = Math.floor((aim.mx - ox) / ts); aim.ty = Math.floor((aim.my - oy) / ts);
    if (aim.tx < 0 || aim.tx >= W || aim.ty < 0 || aim.ty >= H) aim.tx = -1;
    useTool(dt);
    // particles and floating text
    for (var k = parts.length - 1; k >= 0; k--) { var q = parts[k]; q.life -= dt; if (q.life <= 0) { parts.splice(k, 1); continue; } q.vy += 22 * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
    for (var m = texts.length - 1; m >= 0; m--) { texts[m].life -= dt; texts[m].y -= dt * 0.9; if (texts[m].life <= 0) texts.splice(m, 1); }
    // fireflies drift around you on swamp nights
    var night = 1 - daylight(S.time), nearSurface = p.y < col[clamp(tcx, 0, W - 1)] + 5 && bioAt() === 0;
    if (nearSurface && night > 0.4 && flies.length < 16 && !reduce) flies.push({ x: p.x + (Math.random() - 0.5) * 24, y: (col[clamp(tcx, 0, W - 1)] || SURF) - 1 - Math.random() * 5, ph: Math.random() * 6, a: 0 });
    for (var f = flies.length - 1; f >= 0; f--) { var fl = flies[f]; fl.ph += dt; fl.x += Math.cos(fl.ph * 1.3) * dt * 0.8; fl.y += Math.sin(fl.ph * 1.9) * dt * 0.6; fl.a = Math.min(1, fl.a + dt); if (!nearSurface || night < 0.3 || Math.abs(fl.x - p.x) > 16) flies.splice(f, 1); }
    // slow jobs: goals, HUD, save
    msT -= dt; if (msT <= 0) { msT = 0.6; checkGoals(); }
    hudT -= dt; if (hudT <= 0) { hudT = 0.25; hud(); }
    saveT += dt * 1000; if (saveT >= SAVE_MS) { saveT = 0; save(); }
  }

  // ---------- LIGHT ----------
  var LG = null, OP = null, LC = null, LCX = null, LID = null;
  function lightGrid(gx0, gy0, gw, gh, day, pcx, pcy) {
    var n = gw * gh, skyL = Math.round(day * 15), i, j;
    if (!LG || LG.length < n) { LG = new Uint8Array(n); OP = new Uint8Array(n); }
    for (j = 0; j < gh; j++) for (i = 0; i < gw; i++) {
      var X = gx0 + i, Y = gy0 + j, id = get(X, Y), L = TILES[id].light, c = j * gw + i;
      if (X >= 0 && X < W && Y < col[X] && skyL > L) L = skyL;
      LG[c] = L; OP[c] = TILES[id].solid ? 3 : 1;
    }
    var pi = pcx - gx0, pj = pcy - gy0; if (pi >= 0 && pi < gw && pj >= 0 && pj < gh) LG[pj * gw + pi] = Math.max(LG[pj * gw + pi], 10);
    for (var r = 0; r < 2; r++) {
      for (j = 0; j < gh; j++) for (i = 0; i < gw; i++) { var a = j * gw + i, v = LG[a]; if (i > 0 && LG[a - 1] - OP[a] > v) v = LG[a - 1] - OP[a]; if (j > 0 && LG[a - gw] - OP[a] > v) v = LG[a - gw] - OP[a]; LG[a] = v; }
      for (j = gh - 1; j >= 0; j--) for (i = gw - 1; i >= 0; i--) { var b = j * gw + i, w2 = LG[b]; if (i < gw - 1 && LG[b + 1] - OP[b] > w2) w2 = LG[b + 1] - OP[b]; if (j < gh - 1 && LG[b + gw] - OP[b] > w2) w2 = LG[b + gw] - OP[b]; LG[b] = w2; }
    }
  }

  // ---------- RENDER ----------
  var STARS = []; for (var si = 0; si < 80; si++) STARS.push({ x: Math.random(), y: Math.random() * 0.7, s: Math.random() * 1.6 + 0.5, p: Math.random() * 6 });
  var CRACKS = [[0.1, 0.2], [0.9, 0.15], [0.2, 0.9], [0.85, 0.8], [0.5, 0.05], [0.05, 0.55], [0.95, 0.5]];
  var BACKWALL = ["#261d17", "#2c1a17", "#1f2b34"], HILLS = [["#17392f", "#112c25"], ["#3b2019", "#2c1713"], ["#7fa3b8", "#5f8399"]];
  function render(now) {
    var t = S.time, day = daylight(t), g = ctx, i, j;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false;
    ox = Math.round(vw / 2 - cam.x * ts); oy = Math.round(vh / 2 - cam.y * ts);
    // sky
    var sk = skyAt(t), gr = g.createLinearGradient(0, 0, 0, vh); gr.addColorStop(0, rgb(sk[0])); gr.addColorStop(1, rgb(sk[1])); g.fillStyle = gr; g.fillRect(0, 0, vw, vh);
    var night = 1 - day;
    if (night > 0.25) { g.fillStyle = "#fff"; STARS.forEach(function (s) { g.globalAlpha = clamp((night - 0.25) / 0.45, 0, 1) * (0.55 + 0.45 * Math.sin(now / 700 + s.p)); g.fillRect(s.x * vw, s.y * vh, s.s, s.s); }); g.globalAlpha = 1; }
    var sunF = (t / 280), moonF = ((t - 280) / 200);
    if (t < 285) sky2(g, sunF, "#ffe9a8", "#ffd36a", 26); else if (t >= 280) sky2(g, clamp(moonF, 0, 1), "#eef3ff", "#9fb4ff", 20);
    var biome = world.bio[clamp(Math.floor(cam.x), 0, W - 1)], hc = HILLS[biome], nightC = [8, 14, 22];
    for (var L2 = 0; L2 < 2; L2++) {
      var par = 0.2 + L2 * 0.25, amp = 5 + L2 * 3, base = SURF - 4 + L2 * 3, f2 = 0.06 + L2 * 0.03, hexc = hc[L2];
      var cc = [parseInt(hexc.slice(1, 3), 16), parseInt(hexc.slice(3, 5), 16), parseInt(hexc.slice(5, 7), 16)];
      g.fillStyle = rgb(mixC(nightC, cc, 0.18 + 0.82 * day)); g.beginPath(); g.moveTo(0, vh);
      for (var sx = 0; sx <= vw + 14; sx += 14) { var wx = cam.x * par + (sx - vw / 2) / ts; g.lineTo(sx, oy + (base + Math.sin(wx * f2) * amp + Math.sin(wx * f2 * 2.3 + 1) * amp * 0.4) * ts); }
      g.lineTo(vw + 14, vh); g.closePath(); g.fill();
    }
    // tiles
    var X0 = Math.floor(-ox / ts), X1 = Math.floor((vw - ox) / ts), Y0 = Math.floor(-oy / ts), Y1 = Math.floor((vh - oy) / ts);
    glows.length = 0; var wob = Math.sin(now / 500);
    for (j = Y0; j <= Y1; j++) for (i = X0; i <= X1; i++) {
      var id = get(i, j), td = TILES[id], sx2 = ox + i * ts, sy = oy + j * ts;
      if (i < 0 || i >= W || j < 0 || j >= H) continue;
      var under = j >= col[i];
      if (id === T.AIR) { if (under) { g.fillStyle = BACKWALL[world.bio[i]]; g.fillRect(sx2, sy, ts, ts); } continue; }
      if (id === T.WATER) {
        g.fillStyle = "rgba(34,146,156,.62)"; g.fillRect(sx2, sy, ts, ts);
        if (get(i, j - 1) !== T.WATER) { g.fillStyle = "rgba(190,255,245,.55)"; g.fillRect(sx2, sy + Math.round(wob * 1.5 + 1.5), ts, 2); }
        continue;
      }
      if (id === T.LAVA) {
        g.fillStyle = "#ff5a1a"; g.fillRect(sx2, sy, ts, ts); g.fillStyle = "#ffb13b";
        g.fillRect(sx2 + ts * (0.15 + 0.1 * Math.sin(now / 420 + i)), sy + ts * 0.2, ts * 0.45, ts * 0.22); g.fillRect(sx2 + ts * (0.5 + 0.1 * Math.cos(now / 380 + j)), sy + ts * 0.6, ts * 0.38, ts * 0.2);
        if (get(i, j - 1) !== T.LAVA) { g.fillStyle = "#ffe08a"; g.fillRect(sx2, sy, ts, 2); }
        glows.push([sx2 + ts / 2, sy + ts / 2, "255,110,30", 3.2, 0.2]); continue;
      }
      if (!td.solid && under) { g.fillStyle = BACKWALL[world.bio[i]]; g.fillRect(sx2, sy, ts, ts); }
      var v = ((Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0) & 3;
      g.drawImage(ATLAS, v * 16, id * 16, 16, 16, sx2, sy, ts, ts);
      if (td.light >= 6) glows.push([sx2 + ts / 2, sy + ts / 2, id === T.TORCH ? "255,170,60" : id === T.CINDER ? "255,120,50" : "80,240,190", id === T.TORCH ? 4.2 : 2.6, id === T.TORCH ? 0.26 : 0.16]);
      if (td.kind === "ore" && !reduce && ((now / 90 + i * 7 + j * 3) | 0) % 41 === 0) { g.fillStyle = "#fff"; g.fillRect(sx2 + ts * 0.55, sy + ts * 0.25, 2, 2); }
    }
    // mining cracks
    if (mine) {
      var mx = ox + mine.x * ts, my = oy + mine.y * ts, nseg = 1 + Math.floor(mine.p * 6);
      g.strokeStyle = "rgba(0,0,0,.6)"; g.lineWidth = Math.max(1, ts / 14); g.beginPath();
      for (i = 0; i < nseg && i < CRACKS.length; i++) { g.moveTo(mx + ts * 0.5, my + ts * 0.5); g.lineTo(mx + ts * CRACKS[i][0], my + ts * CRACKS[i][1]); }
      g.stroke(); g.fillStyle = "rgba(255,255,255," + (0.08 + mine.p * 0.12) + ")"; g.fillRect(mx, my, ts, ts);
    }
    // player
    drawPlayer(g, now);
    // particles
    parts.forEach(function (q) { g.globalAlpha = clamp(q.life / q.max * 1.4, 0, 1); g.fillStyle = q.c; g.fillRect(ox + q.x * ts - q.s / 2, oy + q.y * ts - q.s / 2, q.s, q.s); }); g.globalAlpha = 1;
    // darkness (soft, built from a small light grid and stretched over the screen)
    var M = 14, gx0 = X0 - 1 - M, gy0 = Y0 - 1 - M, gw = X1 - X0 + 3 + M * 2, gh = Y1 - Y0 + 3 + M * 2;
    lightGrid(gx0, gy0, gw, gh, day, Math.floor(p.x), Math.floor(p.y - PH * 0.5));
    var vgw = X1 - X0 + 3, vgh = Y1 - Y0 + 3;
    if (!LC) { LC = document.createElement("canvas"); LCX = LC.getContext("2d"); }
    if (LC.width !== vgw || LC.height !== vgh) { LC.width = vgw; LC.height = vgh; LID = LCX.createImageData(vgw, vgh); }
    var dk = LID.data, dr = Math.round(lerp(6, 3, day)), dg = Math.round(lerp(9, 6, day)), db = Math.round(lerp(22, 12, day));
    for (j = 0; j < vgh; j++) for (i = 0; i < vgw; i++) {
      var lv = LG[(j + M) * gw + (i + M)], k = (j * vgw + i) * 4, al = 1 - Math.pow(Math.min(15, lv) / 15, 0.85);
      dk[k] = dr; dk[k + 1] = dg; dk[k + 2] = db; dk[k + 3] = Math.round(clamp(al, 0, 0.97) * 255);
    }
    LCX.putImageData(LID, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(LC, 0, 0, vgw, vgh, ox + (X0 - 1) * ts, oy + (Y0 - 1) * ts, vgw * ts, vgh * ts); g.imageSmoothingEnabled = false;
    // glows and fireflies sit on top of the darkness
    g.globalCompositeOperation = "lighter";
    for (i = 0; i < glows.length; i++) { var gl = glows[i], rad = gl[3] * ts, rg = g.createRadialGradient(gl[0], gl[1], 0, gl[0], gl[1], rad); rg.addColorStop(0, "rgba(" + gl[2] + "," + gl[4] + ")"); rg.addColorStop(1, "rgba(" + gl[2] + ",0)"); g.fillStyle = rg; g.fillRect(gl[0] - rad, gl[1] - rad, rad * 2, rad * 2); }
    flies.forEach(function (fl) { var fx = ox + fl.x * ts, fy = oy + fl.y * ts, a = fl.a * (0.5 + 0.5 * Math.sin(fl.ph * 3)), rg = g.createRadialGradient(fx, fy, 0, fx, fy, ts * 0.7); rg.addColorStop(0, "rgba(220,255,120," + 0.8 * a + ")"); rg.addColorStop(1, "rgba(220,255,120,0)"); g.fillStyle = rg; g.fillRect(fx - ts, fy - ts, ts * 2, ts * 2); });
    g.globalCompositeOperation = "source-over";
    // floating text
    g.font = "800 " + Math.max(11, Math.round(ts * 0.5)) + "px Nunito, system-ui, sans-serif"; g.textAlign = "center"; g.lineWidth = 3; g.strokeStyle = "rgba(0,0,0,.7)";
    texts.forEach(function (tx) { g.globalAlpha = clamp(tx.life * 1.5, 0, 1); g.fillStyle = tx.c; g.strokeText(tx.s, ox + tx.x * ts, oy + tx.y * ts); g.fillText(tx.s, ox + tx.x * ts, oy + tx.y * ts); }); g.globalAlpha = 1;
    // cursor
    if (!panelOpen && aim.tx >= 0 && (!coarse || aim.down)) {
      var ddx = aim.tx + 0.5 - p.x, ddy = aim.ty + 0.5 - (p.y - PH / 2), ok = ddx * ddx + ddy * ddy <= REACH * REACH;
      g.strokeStyle = ok ? "rgba(255,255,255,.75)" : "rgba(255,90,90,.55)"; g.lineWidth = 2; g.strokeRect(ox + aim.tx * ts + 1, oy + aim.ty * ts + 1, ts - 2, ts - 2);
    }
  }
  function sky2(g, f, c1, c2, r) {
    var x = vw * (0.08 + 0.84 * f), y = vh * 0.34 - Math.sin(f * Math.PI) * vh * 0.26, rg = g.createRadialGradient(x, y, 0, x, y, r * 3);
    rg.addColorStop(0, c2 + "aa"); rg.addColorStop(1, c2 + "00"); g.fillStyle = rg; g.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    g.fillStyle = c1; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
  }
  function drawPlayer(g, now) {
    var sx = ox + p.x * ts, sy = oy + p.y * ts, size = ts * 2.0, bob = p.on && Math.abs(p.vx) > 0.5 ? Math.sin(p.walk * 5) : 0, sq = 1 + bob * 0.05 + (p.vy < -2 ? 0.07 : 0) - (p.vy > 6 ? 0.05 : 0);
    g.save(); g.translate(sx, sy + ts * 0.14); g.scale(p.face, 1);
    g.fillStyle = "rgba(0,0,0,.25)"; g.beginPath(); g.ellipse(0, -ts * 0.1, ts * 0.45, ts * 0.12, 0, 0, 6.2832); g.fill();
    g.scale(1 / sq, sq); if (p.wet) g.globalAlpha = 0.85;
    if (sprite) g.drawImage(sprite, -size / 2, -size * 0.93, size, size);
    else { g.fillStyle = "#4ee6b4"; g.beginPath(); g.arc(0, -ts * 0.7, ts * 0.6, 0, 6.2832); g.fill(); }
    g.restore();
  }

  // ---------- HUD AND PANELS ----------
  function hud() {
    var b = bioAt(), bi = BIOMES[b], ph = phaseOf(S.time), depth = Math.max(0, Math.floor(p.y - SURF)), under = p.y > col[clamp(Math.floor(p.x), 0, W - 1)] + 2;
    $("sbxBiome").textContent = bi.n; $("sbxLoc").style.setProperty("--bc", bi.c);
    $("sbxSub").textContent = PHN[ph.id] + (under ? " \u00b7 depth " + depth : " \u00b7 surface");
    if (lastBio !== b) { if (lastBio !== -1) toast("Entering " + bi.n, bi.c); lastBio = b; }
    if (hbDirty) drawBar();
  }
  function drawBar() {
    hbDirty = false; var items = ["pick"].concat(hot()), html = "";
    items.forEach(function (id, i) {
      var cnt = id === "pick" ? "Lv" + S.tier : S.inv[id];
      html += '<button type="button" class="sbx-slot' + (sel === id ? " on" : "") + '" data-sel="' + id + '" aria-label="' + (id === "pick" ? PICKS[S.tier - 1].n : ITEMS[id].n + ", " + S.inv[id]) + '" aria-pressed="' + (sel === id) + '"><img alt="" src="' + icon(id) + '"><i>' + (i + 1) + '</i><b>' + esc(cnt) + '</b></button>';
    });
    $("sbxBar").innerHTML = html;
  }
  function costHtml(cost) {
    return Object.keys(cost).map(function (k) { var have = S.inv[k] || 0, ok = have >= cost[k]; return '<span class="' + (ok ? "ok" : "no") + '"><img alt="" src="' + icon(k) + '">' + have + "/" + cost[k] + " " + esc(ITEMS[k].n) + "</span>"; }).join("");
  }
  function renderPanel() {
    if (!panelOpen) return;
    var tabs = [["craft", "Craft"], ["bag", "Bag"], ["map", "Map"], ["goals", "Goals"], ["more", "Options"]];
    $("sbxTabs").innerHTML = tabs.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + "</button>"; }).join("");
    var h = "";
    if (tab === "craft") {
      h += '<p class="sbx-note">Your pick: <b style="color:' + PICKS[S.tier - 1].c + '">' + PICKS[S.tier - 1].n + "</b>. Better picks dig faster and open new rock.</p>";
      RECIPES.forEach(function (r) {
        var owned = r.tier && S.tier >= r.tier, can = !owned && Object.keys(r.cost).every(function (k) { return (S.inv[k] || 0) >= r.cost[k]; }), ic = r.tier ? "pick" + r.tier : Object.keys(r.out)[0];
        var im = r.tier ? (function () { var old = S.tier; S.tier = r.tier; var u = icon("pick"); S.tier = old; return u; })() : icon(ic);
        h += '<div class="sbx-card' + (owned ? " done" : "") + '"><img class="big" alt="" src="' + im + '"><div><b>' + esc(r.n) + "</b><small>" + esc(r.d) + '</small><div class="cost">' + costHtml(r.cost) + '</div></div><button type="button" class="btn' + (can ? "" : " ghost") + '" data-sx-craft="' + r.id + '"' + (owned ? " disabled" : "") + ">" + (owned ? "Owned" : "Craft") + "</button></div>";
      });
    } else if (tab === "bag") {
      var have = ORDER.filter(function (k) { return (S.inv[k] || 0) > 0; });
      h += have.length ? '<p class="sbx-note">Tap a block to hold it, then tap the world to build.</p><div class="sbx-bag">' + have.map(function (k) { var pl = ITEMS[k].tile !== undefined; return '<button type="button" class="sbx-it' + (sel === k ? " on" : "") + '"' + (pl ? ' data-hold="' + k + '"' : " disabled") + '><img alt="" src="' + icon(k) + '"><b>' + S.inv[k] + "</b><small>" + esc(ITEMS[k].n) + "</small></button>"; }).join("") + "</div>"
        : '<p class="sbx-note">Your bag is empty. Walk to a tree and hold on the trunk to chop it.</p>';
    } else if (tab === "map") {
      h += '<canvas id="sbxMap" width="480" height="220" aria-label="Map of the places you have explored"></canvas><p class="sbx-note">Dark areas are unexplored. Walk and dig to uncover the world.</p>';
    } else if (tab === "goals") {
      var done = GOALS.filter(function (g) { return S.ms[g.id]; }).length;
      h += '<p class="sbx-note"><b>' + done + " / " + GOALS.length + "</b> goals complete. Goals are bragging rights for now, with no coin or crystal payouts.</p><div class=\"sbx-goals\">" + GOALS.map(function (g) { return '<div class="sbx-goal' + (S.ms[g.id] ? " ok" : "") + '"><i aria-hidden="true">' + (S.ms[g.id] ? "&#10003;" : "") + "</i><div><b>" + esc(g.n) + "</b><small>" + esc(g.d) + "</small></div></div>"; }).join("") + "</div>";
    } else {
      var an = (typeof Crystals !== "undefined" && Crystals.animals) ? Crystals.animals : [{ id: "frog", name: "Boggy the Frog" }];
      h += '<h3>Play as</h3><div class="sbx-an">' + an.map(function (a) { var th = ""; try { th = AV.svg(Object.assign({}, Crystals.outfit(), { animal: a.id, nobg: true })).replace('viewBox="0 0 200 200"', 'viewBox="22 4 156 156"'); } catch (e) {} return '<button type="button" data-an="' + a.id + '" aria-pressed="' + (S.animal === a.id) + '" aria-label="' + esc(a.name) + '">' + th + "<small>" + esc(a.name.split(" ")[0]) + "</small></button>"; }).join("") + '</div><p class="sbx-note">Your equipped avatar gear shows in the world. Change it in the Armory.</p>';
      h += '<h3>View</h3><div class="sbx-row"><button type="button" class="btn ghost" data-zoom="-1" aria-label="Zoom out">Zoom out</button><b>' + Math.round(S.zoom * 100) + '%</b><button type="button" class="btn ghost" data-zoom="1" aria-label="Zoom in">Zoom in</button></div>';
      h += '<h3>World</h3><div class="sbx-row"><button type="button" class="btn ghost" data-camp>Back to camp</button><button type="button" class="btn ghost' + (confirmNew ? " warn" : "") + '" data-new>' + (confirmNew ? "Tap again to erase this world" : "Start a new world") + "</button></div>";
      h += '<p class="sbx-note">World seed ' + S.seed + ". Saved in this browser only for now. Shared servers and accounts come in a later stage.</p>";
    }
    $("sbxBody").innerHTML = h;
    var cur = document.querySelector("#sbxTabs [aria-selected=true]"); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest", inline: "center" });
    if (tab === "map") drawMap();
  }
  function drawMap() {
    var c = $("sbxMap"); if (!c) return; var g = c.getContext("2d"), im = g.createImageData(W, H), d = im.data, i;
    for (i = 0; i < W * H; i++) {
      var k = i * 4, x = i % W, y = (i / W) | 0, r = 0, gg = 0, b = 0, a = 255;
      if (ex[i]) { var id = tiles[i], td = TILES[id], hex; if (id === T.AIR) hex = y < col[x] ? "#2a5a6a" : "#0d1114"; else if (id === T.WATER) hex = "#2a8f95"; else hex = td.kind === "ore" ? td.c2 : td.c; if (hex.length === 4) hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]; r = parseInt(hex.slice(1, 3), 16); gg = parseInt(hex.slice(3, 5), 16); b = parseInt(hex.slice(5, 7), 16); }
      else { r = 6; gg = 10; b = 9; }
      d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = a;
    }
    var off = document.createElement("canvas"); off.width = W; off.height = H; off.getContext("2d").putImageData(im, 0, 0);
    g.imageSmoothingEnabled = false; g.fillStyle = "#050807"; g.fillRect(0, 0, c.width, c.height); g.drawImage(off, 0, 0, W, H, 0, 0, 480, 220);
    var px = p.x / W * 480, py = (p.y - 1) / H * 220; g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 5, 0, 6.2832); g.stroke(); g.fillStyle = "#f2c14e"; g.beginPath(); g.arc(px, py, 2.5, 0, 6.2832); g.fill();
  }
  function openPanel(t) { if (t) tab = t; panelOpen = true; confirmNew = false; $("sbxPanel").hidden = false; stageEl.classList.add("panel"); keys.l = keys.r = keys.j = 0; tk.l = tk.r = tk.j = 0; aim.down = false; mine = null; renderPanel(); }
  function closePanel() { panelOpen = false; $("sbxPanel").hidden = true; stageEl.classList.remove("panel"); $("sbxMenuBtn").focus({ preventScroll: true }); }

  // ---------- INPUT ----------
  function setAim(e) { var r = cv.getBoundingClientRect(); aim.mx = e.clientX - r.left; aim.my = e.clientY - r.top; }
  cv.addEventListener("pointerdown", function (e) {
    if (panelOpen || (e.pointerType === "mouse" && e.button !== 0)) return; e.preventDefault();
    if (aim.id !== null && aim.id !== e.pointerId && aim.down) return;
    aim.id = e.pointerId; aim.down = true; setAim(e); try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    $("sbxHint").classList.remove("on"); if (ac && ac.state === "suspended") ac.resume();
  });
  cv.addEventListener("pointermove", function (e) { if (e.pointerType === "mouse" || e.pointerId === aim.id) setAim(e); });
  var endAim = function (e) { if (e.pointerId === aim.id) { aim.down = false; aim.id = null; mine = null; if (e.pointerType !== "mouse") aim.tx = -1; } };
  cv.addEventListener("pointerup", endAim); cv.addEventListener("pointercancel", endAim); cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  [].forEach.call(document.querySelectorAll("#sbxPad [data-k]"), function (b) {
    var k = b.getAttribute("data-k"), on = function (e) { e.preventDefault(); tk[k] = 1; b.classList.add("on"); try { b.setPointerCapture(e.pointerId); } catch (x) {} $("sbxHint").classList.remove("on"); }, off = function () { tk[k] = 0; b.classList.remove("on"); };
    b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); b.addEventListener("lostpointercapture", off); b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  });
  window.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return; var k = e.key;
    if (k === "Escape" && panelOpen) { closePanel(); return; }
    if (k === "e" || k === "E") { panelOpen ? closePanel() : openPanel(); e.preventDefault(); return; }
    if (panelOpen) return;
    if (k === "ArrowLeft" || k === "a" || k === "A") keys.l = 1; else if (k === "ArrowRight" || k === "d" || k === "D") keys.r = 1;
    else if (k === " " || k === "ArrowUp" || k === "w" || k === "W") keys.j = 1;
    else if (k >= "1" && k <= "7") { var items = ["pick"].concat(hot()), id = items[+k - 1]; if (id) choose(id); }
    else if (k === "q" || k === "Q") { var h2 = hot(); choose(sel === "pick" ? (h2[0] || "pick") : "pick"); }
    else return; e.preventDefault(); $("sbxHint").classList.remove("on");
  });
  window.addEventListener("keyup", function (e) {
    var k = e.key; if (k === "ArrowLeft" || k === "a" || k === "A") keys.l = 0; else if (k === "ArrowRight" || k === "d" || k === "D") keys.r = 0; else if (k === " " || k === "ArrowUp" || k === "w" || k === "W") keys.j = 0;
  });
  window.addEventListener("blur", function () { keys.l = keys.r = keys.j = 0; tk.l = tk.r = tk.j = 0; aim.down = false; });
  $("sbxBar").addEventListener("click", function (e) { var b = e.target.closest("[data-sel]"); if (b) choose(b.getAttribute("data-sel")); });
  $("sbxMenuBtn").addEventListener("click", function () { panelOpen ? closePanel() : openPanel(); });
  $("sbxPanel").addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t) return;
    if (t.hasAttribute("data-close")) return closePanel();
    if (t.getAttribute("data-tab")) { tab = t.getAttribute("data-tab"); confirmNew = false; return renderPanel(); }
    if (t.getAttribute("data-sx-craft")) return craft(t.getAttribute("data-sx-craft"));
    if (t.getAttribute("data-hold")) { choose(t.getAttribute("data-hold")); return closePanel(); }
    if (t.getAttribute("data-an")) { S.animal = t.getAttribute("data-an"); mkSprite(); return renderPanel(); }
    if (t.hasAttribute("data-zoom")) { var Z = [0.8, 1, 1.25, 1.5, 2], zi = clamp(Z.indexOf(S.zoom) + +t.getAttribute("data-zoom"), 0, Z.length - 1); S.zoom = Z[zi]; resize(); return renderPanel(); }
    if (t.hasAttribute("data-camp")) { respawn("Back at camp."); return closePanel(); }
    if (t.hasAttribute("data-new")) { if (!confirmNew) { confirmNew = true; return renderPanel(); } confirmNew = false; var z = S.zoom, an = S.animal; start(Object.assign(fresh(Math.floor(Math.random() * 2e9) + 1), { zoom: z, animal: an })); save(); closePanel(); toast("A fresh world. Happy digging!", "#4ee6b4"); }
  });
  setInterval(function () { if (panelOpen && tab === "map") drawMap(); }, 1500);

  // ---------- LOOP, RESIZE, SAVE ----------
  function resize() {
    var r = stageEl.getBoundingClientRect(); vw = Math.max(200, Math.round(r.width)); vh = Math.max(200, Math.round(r.height)); dpr = Math.min(2.5, window.devicePixelRatio || 1);
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr); cv.style.width = vw + "px"; cv.style.height = vh + "px";
    ts = Math.max(12, Math.round(clamp(Math.max(vw, vh) / 34, 15, 40) * (S ? S.zoom : 1)));
  }
  var last = 0;
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    if (!document.hidden) { if (!panelOpen) update(dt); render(now); if (hbDirty) drawBar(); }
    requestAnimationFrame(loop);
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) save(); });
  window.addEventListener("pagehide", save);
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stageEl);

  buildAtlas(); load(); resize(); mkSprite(); drawBar();
  $("sbxHint").textContent = coarse ? "Use the arrows to walk. Press and hold a block to dig it." : "A / D walk, Space jumps. Hold the mouse on a block to dig. E opens your bag.";
  if (!S.st.mined) $("sbxHint").classList.add("on");
  setTimeout(function () { $("sbxHint").classList.remove("on"); }, 14000);
  requestAnimationFrame(loop);
  window.__sbx = { view: function () { return { ts: ts, ox: ox, oy: oy }; }, get S() { return S; }, p: p, get: get, tiles: function () { return tiles; }, world: function () { return world; }, choose: choose, craft: craft, openPanel: openPanel, give: give, reveal: reveal };
})();
