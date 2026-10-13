// ===== SwampRealms: Delve (Stage 1: single-player dig-and-build sandbox) =====
// Load AFTER cards.js, weapons.js, avatar.js, store.js, account.js, menu.js and sandbox-world.js (see sandbox.html).
// Everything lives inside this function so it can never clash with globals in cards.js / store.js.
//
// SAVING: the whole game is one localStorage key, "swamp-delve-v1" (this browser only, NOT cloud-synced in Stage 1).
//   { v:2, trail (First Day Trail step), seed, e:"idx:tile,idx:tile" (only tiles you changed), ex:"run-length explored map", p:{x,y,f}, animal, inv:{item:n}, mru:[item],
//     tier (pick level 1-4), time (0-480 day clock), ms:{milestone:1}, st:{mined,placed,torches,wood,maxDepth,swim}, zoom }
// Swamp Coins and Swamp Crystals are never read or written. Nothing here pays out currency.
(function () {
  "use strict";
  if (typeof SbxWorld === "undefined") return;
  var SW = SbxWorld, W = SW.W, H = SW.H, SURF = SW.SURF, T = SW.T, TILES = SW.TILES, ITEMS = SW.ITEMS, ORDER = SW.ITEM_ORDER, BIOMES = SW.BIOMES;

  // ---------- TUNING ----------
  var KEY = "swamp-delve-v1", CYCLE = 480, REACH = 5.6, PW = 0.7, PH = 1.5, SAVE_MS = 8000;
  var PICKS = [
    { n: "Bare Paws", c: "#8fd37a", sp: 0.55 }, { n: "Reed Pick", c: "#c9b58a", sp: 1 }, { n: "Glowspore Pick", c: "#4ee6b4", sp: 1.8 },
    { n: "Cinder Pick", c: "#ff8a3d", sp: 2.8 }, { n: "Frost Pick", c: "#7fd6ff", sp: 4.2 }
  ];
  var RECIPES = [
    { id: "pick1", n: "Reed Pick", tier: 1, cost: { stick: 3, fiber: 3, pebble: 2 }, d: "Your first tool. Chops wood, digs clay and breaks stone." },
    { id: "planks", n: "Planks (4)", out: { planks: 4 }, cost: { wood: 1 }, d: "Build walls, floors and bridges." },
    { id: "bench", n: "Bog Workbench", out: { bench: 1 }, cost: { wood: 10, fiber: 4 }, d: "Place it at camp. Better tools are made standing next to it." },
    { id: "torch", n: "Torches (4)", out: { torch: 4 }, cost: { stick: 1, spore: 1 }, d: "Light up caves. Place next to a wall." },
    { id: "pick2", n: "Glowspore Pick", tier: 2, bench: true, cost: { spore: 16, wood: 12 }, d: "Digs 1.8x faster. Breaks Basalt and Cinder Ore." },
    { id: "pick3", n: "Cinder Pick", tier: 3, bench: true, cost: { cinder: 20, basalt: 16, planks: 24 }, d: "Digs 2.8x faster. Breaks Frostrock and Frost Crystal." },
    { id: "pick4", n: "Frost Pick", tier: 4, bench: true, cost: { crystal: 24, frostrock: 20, planks: 32 }, d: "The fastest pick in the swamp. Digs 4.2x faster." }
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
  // ---- THE TRAIL (Stage 1): a guided first-day path. Steps count from lifetime stats, so gathering ahead still counts. ----
  // tg = tile ids to point at on the surface, deep = how far below the surface still counts, rw = small item gift.
  var TRAIL = [
    { id: "stick", n: "Gather Sticks", d: "Hold on tree leaves to punch them. Leaves sometimes drop Sticks.", need: 5, v: function () { return S.st.stick; }, tg: [T.LEAVES], rw: null },
    { id: "fiber", n: "Gather Reed Fiber", d: "Snip cattails by the water or the vines hanging under tree leaves.", need: 3, v: function () { return S.st.fiber; }, tg: [T.REED, T.VINE], rw: { stick: 2 } },
    { id: "pebble", n: "Dig for Pebbles", d: "Dig mud with your paws. Pebbles pop out now and then.", need: 2, v: function () { return S.st.pebble; }, tg: [T.MOSS, T.MUD], rw: { fiber: 1 } },
    { id: "pick1", n: "Craft the Reed Pick", d: "Open the bag (E or the bag button), tap Craft, then make your first tool.", need: 1, v: function () { return S.tier >= 1 ? 1 : 0; }, rw: { planks: 6 } },
    { id: "wood", n: "Chop Wood", d: "Hold your pick on a tree trunk. You need 8 Wood.", need: 8, v: function () { return S.st.wood; }, tg: [T.LOG], deep: 8, rw: { fiber: 4 } },
    { id: "bench", n: "Build a Workbench", d: "Craft a Bog Workbench, select it in the hotbar, then tap the ground to place it.", need: 1, v: function () { return S.st.benches; }, rw: { torch: 4 } },
    { id: "spore", n: "Find Glowspore", d: "Dig down into the stone. Glowing green ore is Glowspore. Bring a torch.", need: 16, v: function () { return S.st.spore; }, rw: { wood: 4 } },
    { id: "lights", n: "Light the Dark", d: "Place 4 torches. They stick to walls and floors.", need: 4, v: function () { return S.st.torches; }, rw: { planks: 8 } },
    { id: "pick2", n: "Spore Smith", d: "Stand near your Workbench and craft the Glowspore Pick.", need: 1, v: function () { return S.tier >= 2 ? 1 : 0; }, rw: { torch: 6 } },
    { id: "ember", n: "Cross into Ember Bog", d: "Walk east past the swamp edge. Basalt and Cinder Ore are next.", need: 1, v: function () { return (S.ms.ember || bioAt() === 1) ? 1 : 0; }, rw: null }
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
  var ICO = {}, ATLAS, bannerQ = [], bannerBusy = false, guide = null, guideT = 0, trailKey = "";

  // ---------- SAVE / LOAD ----------
  function rle(a) { var out = [], v = 0, n = 0; for (var i = 0; i < a.length; i++) { if (a[i] === v) n++; else { out.push(n); v = a[i]; n = 1; } } out.push(n); return out.join(","); }
  function unrle(s, a) { if (typeof s !== "string") return; var v = 0, i = 0, parts2 = s.split(","); for (var k = 0; k < parts2.length; k++) { var n = parseInt(parts2[k], 10) || 0; if (v) a.fill(1, i, Math.min(a.length, i + n)); i += n; v ^= 1; } }
  function defaultAnimal() { try { return Crystals.outfit().animal || "frog"; } catch (e) { return "frog"; } }
  function fresh(seed) { return { v: 2, seed: seed, e: "", ex: "", p: null, animal: defaultAnimal(), inv: {}, mru: [], tier: 0, trail: 0, time: 60, ms: {}, st: { mined: 0, placed: 0, torches: 0, wood: 0, maxDepth: 0, swim: 0, stick: 0, fiber: 0, pebble: 0, spore: 0, benches: 0 }, zoom: 1 }; }
  function clean(o) {
    if (!o || typeof o !== "object" || !o.seed) return null;
    var d = fresh(o.seed | 0 || 1);
    d.e = typeof o.e === "string" ? o.e : ""; d.ex = typeof o.ex === "string" ? o.ex : "";
    if (o.p && isFinite(o.p.x) && isFinite(o.p.y)) d.p = { x: clamp(+o.p.x, 1, W - 1), y: clamp(+o.p.y, 2, H - 2), f: o.p.f < 0 ? -1 : 1 };
    if (typeof o.animal === "string") d.animal = o.animal;
    if (o.inv && typeof o.inv === "object") ORDER.forEach(function (k) { var n = Math.floor(+o.inv[k]); if (n > 0) d.inv[k] = Math.min(n, 99999); });
    if (Array.isArray(o.mru)) d.mru = o.mru.filter(function (k) { return ITEMS[k] && ITEMS[k].tile !== undefined; }).slice(0, 20);
    var tr = Math.floor(+o.tier); d.tier = clamp(isFinite(tr) ? tr : 1, o.v >= 2 ? 0 : 1, 4);
    d.trail = typeof o.trail === "number" ? clamp(Math.floor(o.trail), 0, TRAIL.length) : TRAIL.length;   // older saves skip the beginner Trail
    d.time = clamp(+o.time || 60, 0, CYCLE - 0.01);
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
    cam.x = p.x; cam.y = p.y - 1; sel = "pick"; mine = null; lastBio = -1; trailKey = ""; guide = null; tab = S.trail < TRAIL.length ? "trail" : "craft"; hbDirty = true; exKey = ""; spriteKey = ""; ICO = {};
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
    if (typeof S.st[item] === "number") S.st[item] += n;
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
    var id = td.id, ox = v * 16, kind = td.kind, hh = function (x, y, s) { return SW.hash(x + v * 16, y + id * 31, s + id); };
    var rect = function (x, y, w, h, c, a) { g.globalAlpha = a == null ? 1 : a; g.fillStyle = c; g.fillRect(ox + x, oy + y, w, h); g.globalAlpha = 1; };
    var x, y, k;
    if (id === T.AIR || id === T.WATER || id === T.LAVA) return;
    if (kind === "torch") { rect(7, 6, 2, 10, "#6a4426"); rect(7, 6, 1, 10, "#8a5a32"); rect(6, 2, 4, 5, "#ff7a1f"); rect(7, 1, 2, 3, "#ffc43a"); rect(7, 4, 2, 2, "#fff6c2"); rect(5, 5, 1, 1, "#ffb13b", 0.6); rect(10, 4, 1, 1, "#ffb13b", 0.6); return; }
    if (kind === "bench") {
      rect(1, 7, 14, 3, "#c98c4f"); rect(1, 7, 14, 1, "#e4aa6c"); rect(1, 10, 14, 1, "#6e431f"); rect(2, 11, 2, 5, "#8a5a32"); rect(12, 11, 2, 5, "#8a5a32"); rect(2, 11, 1, 5, "#a8703c"); rect(3, 13, 10, 1, "#6e431f", 0.8);
      rect(3, 5, 7, 2, "#3f8f3a"); rect(4, 4, 5, 1, "#5fb24a"); rect(4, 5, 2, 1, "#9be062"); rect(9, 5, 1, 2, "#2a6a2a");
      rect(11, 2, 1, 5, "#8a5a32"); rect(10, 2, 3, 1, "#c9b58a"); rect(6, 2, 2, 2, "#ff8fc0"); rect(6, 2, 1, 1, "#ffd0e6"); return;
    }
    if (kind === "glowcap") { rect(7, 9, 2, 7, "#cfe3cb"); rect(7, 9, 1, 7, "#f2fff0"); rect(4, 6, 8, 4, "#22a883"); rect(5, 5, 6, 2, "#4ee6b4"); rect(6, 4, 4, 1, "#9bfbe0"); rect(6, 7, 1, 1, "#d8fff6"); rect(9, 8, 1, 1, "#d8fff6"); rect(10, 6, 1, 1, "#d8fff6"); rect(3, 8, 1, 1, "#4ee6b4", 0.7); return; }
    if (kind === "vine") {
      [[3, 16, "#3f8f3a"], [8, 12, "#4aa043"], [12, 15, "#3a8434"]].forEach(function (c, n) { var len = c[1] - (hh(n, 0, 3) > 0.5 ? 2 : 0); rect(c[0], 0, 1, len, c[2]); rect(c[0] + 1, 0, 1, len - 4, "#2a6a2a", 0.8); for (var yy = 3; yy < len; yy += 4) { rect(c[0] - 1, yy, 1, 2, "#6ec35c"); rect(c[0] + 2, yy + 2, 1, 2, "#5fb24a"); } rect(c[0], len - 1, 1, 1, "#c8ff9a", 0.9); });
      return;
    }
    if (kind === "reed") { [[3, 9], [7, 14], [11, 10]].forEach(function (s) { rect(s[0], 16 - s[1], 1, s[1], "#4f8a3c"); rect(s[0] + 1, 16 - s[1] + 3, 1, s[1] - 3, "#3b6a2c"); rect(s[0] - 1, 16 - s[1] + 4, 1, 3, "#6aa347"); rect(s[0] + 2, 16 - s[1] + 6, 1, 3, "#6aa347"); }); rect(6, 1, 3, 5, "#6b4a2a"); rect(6, 1, 3, 1, "#a07a46"); rect(6, 1, 1, 5, "#8a6238"); rect(10, 5, 2, 4, "#6b4a2a"); rect(10, 5, 2, 1, "#a07a46"); return; }
    if (kind === "bloom") { rect(7, 9, 2, 7, "#3a2a2a"); rect(4, 11, 3, 1, "#3a2a2a"); rect(9, 12, 3, 1, "#3a2a2a"); rect(5, 5, 6, 5, "#e8541a"); rect(6, 4, 4, 2, "#ff8a3d"); rect(7, 6, 2, 3, "#ffd25a"); rect(7, 7, 2, 1, "#fff2b0"); rect(3, 3, 1, 1, "#ffb13b", 0.8); rect(12, 4, 1, 1, "#ffb13b", 0.8); rect(11, 1, 1, 1, "#ffb13b", 0.6); return; }
    if (kind === "spike") { rect(3, 7, 3, 9, "#7fd6f0"); rect(4, 4, 1, 3, "#cdf6ff"); rect(3, 7, 1, 9, "#cdf6ff", 0.8); rect(7, 2, 3, 14, "#9fe8ff"); rect(8, 0, 1, 2, "#e6fbff"); rect(7, 2, 1, 14, "#ffffff", 0.7); rect(9, 6, 1, 10, "#5fb8d6", 0.7); rect(11, 8, 3, 8, "#7fd6f0"); rect(12, 5, 1, 3, "#cdf6ff"); rect(11, 8, 1, 8, "#cdf6ff", 0.8); return; }
    rect(0, 0, 16, 16, td.c);
    // two-scale noise gives a hand-painted look: coarse blotches plus fine speckle
    var sc = kind === "ore" ? "#ffffff" : td.c2, sa = kind === "ore" ? 0.08 : 0.5;
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
      var cb = hh(x >> 1, y >> 1, 11), r = hh(x, y, 1);
      if (cb < 0.22) rect(x, y, 1, 1, "#000", 0.13); else if (cb > 0.82) rect(x, y, 1, 1, sc, 0.14);
      if (r < 0.16) rect(x, y, 1, 1, sc, sa); else if (r > 0.9) rect(x, y, 1, 1, "#000", 0.2);
    }
    if (id === T.MUD || kind === "moss") { for (k = 0; k < 3; k++) { var px = 1 + Math.floor(hh(k, 2, 5) * 12), py = 5 + Math.floor(hh(k, 3, 6) * 9); rect(px, py, 2, 1, "#7a6248", 0.8); rect(px, py + 1, 2, 1, "#2a1f15", 0.6); } if (hh(1, 1, 7) > 0.5) { rect(3, 8, 1, 3, "#2e2218", 0.7); rect(4, 10, 1, 2, "#2e2218", 0.7); } }
    if (kind === "moss") for (x = 0; x < 16; x++) { var d = 3 + Math.floor(hh(x, 0, 7) * 3); rect(x, 0, 1, d, "#3a8434"); rect(x, 0, 1, 2, "#5fb24a"); rect(x, 0, 1, 1, "#9be062"); if (hh(x, 1, 8) > 0.55) { rect(x, d, 1, 1 + (hh(x, 2, 3) > 0.7 ? 1 : 0), "#3a8434"); } }
    if (id === T.CLAY) { rect(0, 4, 16, 1, "#000", 0.12); rect(0, 9, 16, 1, "#fff", 0.1); rect(0, 13, 16, 1, "#000", 0.1); }
    if (id === T.STONE) { for (k = 0; k < 2; k++) { var cx = 2 + Math.floor(hh(k, 4, 2) * 9), cy = 2 + Math.floor(hh(k, 5, 3) * 9); rect(cx, cy, 1, 1, "#2d3236", 0.7); rect(cx + 1, cy + 1, 1, 1, "#2d3236", 0.7); rect(cx + 1, cy + 2, 1, 2, "#2d3236", 0.7); rect(cx - 1, cy, 1, 1, "#9aa3a8", 0.4); } rect(0, 11, 16, 1, "#000", 0.08); }
    if (id === T.BASALT) { rect(5, 0, 1, 16, "#000", 0.28); rect(11, 0, 1, 16, "#000", 0.28); rect(6, 0, 1, 16, "#8a7480", 0.15); for (k = 0; k < 3; k++) if (hh(k, 6, 4) > 0.45) rect(1 + Math.floor(hh(k, 7, 5) * 13), 1 + Math.floor(hh(k, 8, 6) * 13), 1, 2, "#ff6a1f", 0.55); }
    if (kind === "ash") { for (k = 0; k < 4; k++) rect(Math.floor(hh(k, 5, 3) * 14), Math.floor(hh(k, 6, 4) * 14), 2, 1, "#3d3532", 0.55); if (hh(2, 2, 9) > 0.4) rect(Math.floor(hh(3, 3, 9) * 14), Math.floor(hh(4, 4, 9) * 14), 1, 1, "#ff8a3d", 0.85); }
    if (kind === "snow") { rect(0, 0, 16, 4, "#ffffff"); for (x = 0; x < 16; x++) if (hh(x, 2, 9) > 0.45) rect(x, 4, 1, 1, "#ffffff"); rect(0, 3, 16, 1, "#bfe2f0", 0.8); rect(Math.floor(hh(1, 1, 3) * 13), 8, 1, 1, "#ffffff", 0.9); rect(Math.floor(hh(2, 2, 3) * 13), 12, 1, 1, "#ffffff", 0.9); }
    if (kind === "ice") { for (y = 0; y < 16; y++) rect(0, y, 16, 1, "#ffffff", (15 - y) / 15 * 0.22); for (x = 0; x < 16; x += 5) for (y = 0; y < 12; y += 4) rect((x + y) % 14, y, 3, 1, "#fff", 0.5); rect(2, 2, 2, 2, "#fff", 0.7); rect(11, 9, 1, 1, "#fff", 0.9); }
    if (kind === "log") { for (x = 2; x < 16; x += 4) rect(x + (hh(x, 0, 3) > 0.5 ? 1 : 0), 0, 1, 16, td.c2, 0.9); rect(0, 0, 1, 16, "#a37846", 0.55); rect(15, 0, 1, 16, "#000", 0.25); if (hh(3, 3, 3) > 0.4) { rect(6, 7, 3, 3, "#3a2514"); rect(7, 8, 1, 1, "#7a5230"); } if (hh(5, 5, 5) > 0.45) { rect(1, 3, 3, 2, "#3f8f3a"); rect(1, 3, 1, 1, "#7ccf55"); rect(2, 5, 1, 1, "#3f8f3a"); } if (hh(6, 6, 6) > 0.6) { rect(11, 11, 3, 2, "#3f8f3a"); rect(12, 11, 1, 1, "#7ccf55"); } }
    if (kind === "leaves") { rect(0, 0, 16, 16, td.c); for (k = 0; k < 22; k++) { var lx = Math.floor(hh(k, 0, 4) * 14), ly = Math.floor(hh(k, 1, 5) * 14), m = k % 3; rect(lx, ly, 2, 2, m === 0 ? td.c2 : m === 1 ? "#1f5a2c" : "#6ec35c"); } for (k = 0; k < 6; k++) rect(Math.floor(hh(k, 9, 2) * 14), Math.floor(hh(k, 10, 2) * 14), 1, 1, "#c8ff9a", 0.85); rect(0, 12, 16, 4, "#0f3a1c", 0.28); rect(0, 0, 16, 2, "#9be062", 0.18); if (hh(7, 7, 7) > 0.8) { rect(6, 6, 2, 2, "#d9fff0"); rect(6, 6, 1, 1, "#4ee6b4"); } }
    if (kind === "planks") { rect(0, 7, 16, 1, "#6e431f"); rect(0, 15, 16, 1, "#6e431f"); rect(0, 0, 16, 1, "#e4aa6c", 0.8); rect(0, 8, 16, 1, "#e4aa6c", 0.5); rect(3, 2, 1, 1, "#3c230f"); rect(12, 10, 1, 1, "#3c230f"); rect(5, 4, 4, 1, "#8c5a2e", 0.7); rect(8, 12, 5, 1, "#8c5a2e", 0.7); }
    if (kind === "ore") for (var j = 0; j < 4; j++) {
      var gx = 2 + Math.floor(hh(j, 3, 5) * 10), gy = 2 + Math.floor(hh(j, 4, 6) * 10);
      rect(gx - 1, gy - 1, 5, 4, td.c2, 0.22); rect(gx, gy, 3, 2, td.c2); rect(gx, gy, 1, 1, "#ffffff", 0.9); rect(gx + 2, gy + 1, 1, 1, "#000", 0.3); rect(gx + 1, gy + 2, 1, 1, td.c2, 0.7);
    }
    if (id === T.FROSTROCK) { for (k = 0; k < 3; k++) { var qx = 1 + Math.floor(hh(k, 8, 2) * 11), qy = 1 + Math.floor(hh(k, 9, 3) * 11); rect(qx, qy, 3, 1, "#b8d6e8", 0.7); rect(qx + 2, qy + 1, 1, 2, "#b8d6e8", 0.6); rect(qx, qy + 1, 1, 1, "#2d4558", 0.6); } rect(0, 0, 16, 1, "#dff3ff", 0.18); }
    if (id === T.BEDROCK) for (k = 0; k < 9; k++) rect(Math.floor(hh(k, 0, 6) * 14), Math.floor(hh(k, 1, 7) * 14), 2, 2, td.c2);
    if (td.solid && kind !== "leaves") rect(0, 15, 16, 1, "#000", 0.16);
  }
  function icon(id) {
    var key = id === "pick" ? "pick" + S.tier : id;
    if (ICO[key]) return ICO[key];
    var c = document.createElement("canvas"); c.width = c.height = 32; var g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    if (id === "pick" && S.tier === 0) {
      g.fillStyle = "#8fd37a"; g.strokeStyle = "#2f6b2a"; g.lineWidth = 1.5;
      [[16, 20, 7.5, 6.2], [7.5, 12.5, 2.9, 3.6], [13, 7.6, 2.9, 3.6], [19.5, 7.6, 2.9, 3.6], [25, 12.5, 2.9, 3.6]].forEach(function (e) { g.beginPath(); g.ellipse(e[0], e[1], e[2], e[3], 0, 0, 6.2832); g.fill(); g.stroke(); });
      g.fillStyle = "#c9f2b4"; g.beginPath(); g.ellipse(14, 18, 3, 2, -0.5, 0, 6.2832); g.fill();
    } else if (id === "pick") {
      var pk = PICKS[S.tier];
      g.strokeStyle = "#8a5a32"; g.lineWidth = 4; g.lineCap = "round"; g.beginPath(); g.moveTo(9, 26); g.lineTo(22, 10); g.stroke();
      g.strokeStyle = pk.c; g.lineWidth = 4; g.beginPath(); g.arc(18, 14, 10, Math.PI * 1.05, Math.PI * 1.75); g.stroke();
      g.strokeStyle = "#ffffff55"; g.lineWidth = 1.5; g.beginPath(); g.arc(18, 14, 11.5, Math.PI * 1.15, Math.PI * 1.55); g.stroke();
    } else if (ITEMS[id].mat) {
      var mt = ITEMS[id].mat; g.lineCap = "round";
      if (mt === "stick") { [[7, 26, 25, 7, "#8a5a32", 4], [10, 9, 24, 25, "#6a4426", 3.4]].forEach(function (l) { g.strokeStyle = l[4]; g.lineWidth = l[5]; g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.stroke(); }); g.strokeStyle = "#c9935a"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(8, 24); g.lineTo(23, 8); g.stroke(); }
      else if (mt === "fiber") { [["#4f8a3c", 10], ["#6aa347", 16], ["#3b6a2c", 22]].forEach(function (c) { g.strokeStyle = c[0]; g.lineWidth = 3.2; g.beginPath(); g.moveTo(c[1], 28); g.quadraticCurveTo(c[1] + (c[1] > 14 ? 6 : -6), 14, c[1] + (c[1] > 14 ? 3 : -3), 4); g.stroke(); }); g.strokeStyle = "#e8d9a8"; g.lineWidth = 3; g.beginPath(); g.moveTo(8, 19); g.lineTo(25, 19); g.stroke(); }
      else { [[11, 20, 8, 6, "#8e969b"], [21, 17, 6.5, 5, "#a7afb3"]].forEach(function (e) { g.fillStyle = e[4]; g.strokeStyle = "#00000066"; g.lineWidth = 1.5; g.beginPath(); g.ellipse(e[0], e[1], e[2], e[3], 0, 0, 6.2832); g.fill(); g.stroke(); g.fillStyle = "#ffffff66"; g.beginPath(); g.ellipse(e[0] - 2, e[1] - 2, e[2] * 0.4, e[3] * 0.3, 0, 0, 6.2832); g.fill(); }); }
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
  var BSUB = ["Mud, mangroves and glowing spores", "Basalt, lava and Cinder Ore", "Frostrock and Frost Crystal"];
  function bcard(bi, b) {
    var el = $("sbxBCard"); el.style.setProperty("--bc", bi.c); el.querySelector("b").textContent = bi.n; el.querySelector("small").textContent = BSUB[b];
    el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
  }
  function nag(msg) { if (performance.now() - nagT < 1800) return; nagT = performance.now(); toast(msg, "#f2c14e"); }
  function banner(title, desc, label) { bannerQ.push([title, desc, label]); if (!bannerBusy) nextBanner(); }
  function nextBanner() {
    var b = bannerQ.shift(), el = $("sbxBanner"); if (!b) { bannerBusy = false; return; }
    bannerBusy = true; el.innerHTML = "<small>" + esc(b[2] || "Goal complete") + "</small><b>" + esc(b[0]) + "</b><span>" + esc(b[1]) + "</span>";
    el.classList.remove("on"); void el.offsetWidth; el.classList.add("on"); snd("rise");
    setTimeout(function () { el.classList.remove("on"); setTimeout(nextBanner, 350); }, 2900);
  }

  // ---------- RULES ----------
  function dropQty(td) { return td.kind === "ore" ? 1 + (Math.random() < 0.6 ? 1 : 0) : td.kind === "reed" || td.kind === "vine" ? 1 + (Math.random() < 0.5 ? 1 : 0) : 1; }
  function breakTile(x, y) {
    var id = get(x, y), td = TILES[id];
    setT(x, y, T.AIR); S.st.mined++;
    chips(x + 0.5, y + 0.5, td.kind === "ore" ? td.c2 : td.c, td.kind === "ore" ? 14 : 9, 6);
    thud(td.hard > 2 ? 110 : 160, 0.08);
    if (td.drop) { var n = dropQty(td); give(td.drop, n, x, y); if (td.kind === "ore") snd("coin"); }
    if (id === T.LEAVES && Math.random() < 0.5) give("stick", 1, x, y - 0.55);                                  // Stage 1: sticks from leaves
    else if ((id === T.MUD || id === T.MOSS) && Math.random() < 0.16) give("pebble", 1, x, y - 0.55);         // Stage 1: pebbles from mud
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
    setT(tx, ty, ITEMS[item].tile); S.inv[item]--; S.st.placed++; if (item === "torch") S.st.torches++; if (item === "bench") S.st.benches++;
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
      if (td.tier > S.tier) { nag("Needs the " + PICKS[td.tier].n + " to break " + td.n + "."); mine = null; return; }
      if (!mine || mine.x !== tx || mine.y !== ty) mine = { x: tx, y: ty, p: 0, tick: 0 };
      mine.p += dt * PICKS[S.tier].sp / td.hard; mine.tick -= dt;
      if (mine.tick <= 0) { mine.tick = 0.17; thud(150 + Math.random() * 50, 0.035); chips(tx + 0.5, ty + 0.5, td.kind === "ore" ? td.c2 : td.c, 1, 3); }
      if (mine.p >= 1) { breakTile(tx, ty); mine = null; }
    } else {
      cool -= dt; if (cool > 0) return; cool = 0.13;
      if ((S.inv[sel] || 0) > 0 && canPlace(tx, ty, sel)) place(tx, ty, sel);
    }
  }
  function nearBench() {
    var cx = Math.floor(p.x), cy = Math.floor(p.y - 1);
    for (var y = cy - 4; y <= cy + 4; y++) for (var x = cx - 7; x <= cx + 7; x++) if (get(x, y) === T.BENCH) return true;
    return false;
  }
  function craft(id) {
    var r = RECIPES.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    if (r.tier && S.tier >= r.tier) return;
    if (r.tier && S.tier < r.tier - 1) { toast("Craft the " + PICKS[r.tier - 1].n + " first.", "#f2c14e"); return; }
    if (r.bench && !nearBench()) { toast("Stand near a Bog Workbench to craft this.", "#f2c14e"); return; }
    for (var k in r.cost) if ((S.inv[k] || 0) < r.cost[k]) { toast("Not enough " + ITEMS[k].n + ".", "#f2c14e"); return; }
    for (var c in r.cost) { S.inv[c] -= r.cost[c]; if (S.inv[c] <= 0) delete S.inv[c]; }
    if (r.tier) { S.tier = r.tier; ICO = {}; toast(r.n + " crafted. Dig faster!", PICKS[r.tier].c); snd("open", "Epic"); chips(p.x, p.y - 1, PICKS[r.tier].c, 30, 9); }
    else { for (var o in r.out) give(o, r.out[o]); toast(r.id === "bench" ? "Workbench made! Pick it in the hotbar, then tap the ground." : "Crafted " + r.n, "#4ee6b4"); snd("coin"); }
    hbDirty = true; renderPanel(); save();
  }
  function rewardText(rw) { return Object.keys(rw).map(function (k) { return "+" + rw[k] + " " + ITEMS[k].n; }).join(", "); }
  function checkTrail() {
    var st;
    while ((st = TRAIL[S.trail]) && st.v() >= st.need) {
      S.trail++; trailKey = "";
      if (st.rw) for (var k in st.rw) give(st.rw[k] ? k : k, st.rw[k]);
      banner(st.n, st.rw ? "Reward: " + rewardText(st.rw) : "Nice work!", S.trail >= TRAIL.length ? "Trail complete" : "Trail step " + S.trail + " of " + TRAIL.length);
      if (S.trail >= TRAIL.length) setTimeout(function () { toast("First Day Trail done! Keep delving.", "#f2c14e"); }, 3600);
      save();
    }
  }
  function findGuide() {
    var st = TRAIL[S.trail]; guide = null; if (!st || !st.tg) return;
    var cx = Math.floor(p.x), cy = Math.floor(p.y - 1), best = 1e9, x, y;
    for (x = Math.max(0, cx - 28); x <= Math.min(W - 1, cx + 28); x++) {
      for (y = Math.max(0, cy - 16); y <= Math.min(H - 1, cy + 16); y++) {
        if (y > col[x] + (st.deep || 0)) break;
        if (st.tg.indexOf(tiles[y * W + x]) < 0) continue;
        var d = (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y); if (d < best) { best = d; guide = { x: x, y: y }; }
      }
    }
  }
  function drawGuide(g, now) {
    if (!guide || panelOpen) return;
    var sx = ox + (guide.x + 0.5) * ts, sy = oy + (guide.y + 0.5) * ts, pu = reduce ? 0 : Math.sin(now / 260), m = 26;
    if (sx > m && sx < vw - m && sy > m && sy < vh - m) {
      g.strokeStyle = "rgba(242,193,78," + (0.75 + pu * 0.2) + ")"; g.lineWidth = 3; g.beginPath(); g.arc(sx, sy, ts * (0.62 + pu * 0.1), 0, 6.2832); g.stroke();
      g.strokeStyle = "rgba(255,244,200,.35)"; g.lineWidth = 1.5; g.beginPath(); g.arc(sx, sy, ts * (0.9 + pu * 0.12), 0, 6.2832); g.stroke();
    } else {
      var ang = Math.atan2(sy - vh / 2, sx - vw / 2), ex2 = clamp(vw / 2 + Math.cos(ang) * vw, m, vw - m), ey2 = clamp(vh / 2 + Math.sin(ang) * vh, m + 50, vh - m - 90);
      g.save(); g.translate(ex2, ey2); g.rotate(ang); g.fillStyle = "rgba(242,193,78,.92)"; g.strokeStyle = "rgba(0,0,0,.6)"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(14, 0); g.lineTo(-8, -10); g.lineTo(-4, 0); g.lineTo(-8, 10); g.closePath(); g.stroke(); g.fill(); g.restore();
    }
  }
  function drawTrail() {
    var el = $("sbxTrail"), st = TRAIL[S.trail];
    if (!st) { if (!el.hidden) el.hidden = true; return; }
    var v = Math.min(st.need, st.v()), key = S.trail + ":" + v; if (key === trailKey) return; trailKey = key;
    el.hidden = false;
    el.innerHTML = "<small>Trail " + (S.trail + 1) + " of " + TRAIL.length + "</small><b>" + esc(st.n) + '</b><span class="bar"><i style="width:' + Math.round(v / st.need * 100) + '%"></i></span><em>' + v + " / " + st.need + "</em>";
  }
  function checkGoals() {
    checkTrail();
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
    var ny = p.y + p.vy * h, vpre = p.vy; p.on = false;
    if (!boxHit(p.x, ny)) p.y = ny;
    else if (p.vy > 0) { p.y = Math.floor(ny); var g = 0; while (boxHit(p.x, p.y) && g++ < 4) p.y -= 1; p.on = true; p.vy = 0; if (vpre > 8) { p.land = Math.min(0.28, vpre / 70); dust(Math.min(10, Math.round(vpre / 3))); } }
    else { p.y = Math.ceil(ny - PH) + PH; p.vy = 0; }
    if (p.y > H - 2) { p.y = H - 2.01; p.vy = 0; }
  }
  var dustT = 0;
  function dust(n) { var id = get(Math.floor(p.x), Math.floor(p.y + 0.2)), c = TILES[id] && TILES[id].solid ? TILES[id].c : "#8a8a80"; chips(p.x - p.face * 0.15, p.y - 0.05, c, n, 3); }
  function update(dt) {
    S.time = (S.time + dt) % CYCLE;
    if (p.land) p.land = Math.max(0, p.land - dt * 2.2);
    dustT -= dt; if (dustT <= 0 && p.on && Math.abs(p.vx) > 4) { dustT = 0.12; dust(1); }
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
    guideT -= dt; if (guideT <= 0) { guideT = 0.45; findGuide(); }
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
  var STARS = []; for (var si = 0; si < 90; si++) STARS.push({ x: Math.random(), y: Math.random() * 0.72, s: Math.random() * 1.7 + 0.5, p: Math.random() * 6, b: Math.random() < 0.12 });
  var CLOUDS = []; for (var ci = 0; ci < 7; ci++) CLOUDS.push({ x: Math.random() * 1.5, y: 0.06 + Math.random() * 0.3, s: 0.6 + Math.random() * 0.9, sp: 0.006 + Math.random() * 0.01 });
  var CRACKS = [[0.1, 0.2], [0.9, 0.15], [0.2, 0.9], [0.85, 0.8], [0.5, 0.05], [0.05, 0.55], [0.95, 0.5]];
  var BACKWALL = [[38, 29, 23], [46, 26, 23], [30, 42, 52]];
  var HILLS = [[[34, 78, 66], [22, 58, 48], [14, 40, 33]], [[92, 44, 34], [66, 32, 26], [44, 22, 18]], [[158, 196, 220], [120, 160, 190], [88, 124, 156]]];
  var VIG = null, MOTE = []; for (var mi = 0; mi < 46; mi++) MOTE.push({ u: Math.random(), v: Math.random(), w: Math.random(), s: 0.5 + Math.random() });
  var smoothW = function (a, b, x) { var k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  function biomeMix(x) { var w1 = smoothW(72, 88, x), w2 = smoothW(152, 168, x); return [1 - w1, w1 * (1 - w2), w1 * w2]; }
  function mixArr(arrs, w) { var o = [0, 0, 0]; for (var i = 0; i < 3; i++) for (var c = 0; c < 3; c++) o[c] += arrs[i][c] * w[i]; return o; }
  function buildVignette() {
    VIG = document.createElement("canvas"); VIG.width = Math.max(2, Math.round(vw / 2)); VIG.height = Math.max(2, Math.round(vh / 2));
    var g = VIG.getContext("2d"), rg = g.createRadialGradient(VIG.width / 2, VIG.height / 2, Math.min(VIG.width, VIG.height) * 0.38, VIG.width / 2, VIG.height / 2, Math.max(VIG.width, VIG.height) * 0.78);
    rg.addColorStop(0, "rgba(2,6,10,0)"); rg.addColorStop(1, "rgba(2,6,10,.55)"); g.fillStyle = rg; g.fillRect(0, 0, VIG.width, VIG.height);
  }
  function cloud(g, x, y, s, col, a) {
    g.globalAlpha = a; g.fillStyle = col; var r = 16 * s;
    [[0, 0, 1.6], [1.3, 0.3, 1.2], [-1.4, 0.35, 1.1], [0.5, -0.5, 1.1], [2.4, 0.55, 0.8]].forEach(function (b) { g.beginPath(); g.ellipse(x + b[0] * r, y + b[1] * r, r * b[2] * 1.15, r * b[2] * 0.62, 0, 0, 6.2832); g.fill(); });
    g.globalAlpha = 1;
  }
  function render(now) {
    var t = S.time, day = daylight(t), g = ctx, i, j, night = 1 - day, ph = phaseOf(t);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false;
    ox = Math.round(vw / 2 - cam.x * ts); oy = Math.round(vh / 2 - cam.y * ts);
    var bw = biomeMix(cam.x), above = clamp(1 - (cam.y - (SURF + 3)) / 9, 0, 1);
    // --- sky: three-stop gradient, stars, sun/moon, clouds, aurora ---
    var sk = skyAt(t), gr = g.createLinearGradient(0, 0, 0, vh), mid = mixC(sk[0], sk[1], 0.55);
    gr.addColorStop(0, rgb(sk[0])); gr.addColorStop(0.6, rgb(mid)); gr.addColorStop(1, rgb(sk[1])); g.fillStyle = gr; g.fillRect(0, 0, vw, vh);
    if (night > 0.25) {
      var sa = clamp((night - 0.25) / 0.45, 0, 1);
      STARS.forEach(function (s) { var tw = 0.55 + 0.45 * Math.sin(now / 650 + s.p); g.globalAlpha = sa * tw; g.fillStyle = "#fff"; g.fillRect(s.x * vw, s.y * vh, s.s, s.s); if (s.b) { g.globalAlpha = sa * tw * 0.5; g.fillRect(s.x * vw - 3, s.y * vh + s.s / 2 - 0.5, 7 + s.s, 1); g.fillRect(s.x * vw + s.s / 2 - 0.5, s.y * vh - 3, 1, 7 + s.s); } }); g.globalAlpha = 1;
    }
    var sunF = t / 280, moonF = clamp((t - 280) / 200, 0, 1);
    if (t < 285) sky2(g, sunF, "#fff0b8", "#ffcf5a", 26, now); else sky2(g, moonF, "#f2f6ff", "#9fb4ff", 20, now, true);
    var cg = mixC([255, 255, 255], [255, 170, 130], ph.id === "dusk" || ph.id === "dawn" ? 0.7 : 0); cg = mixC([40, 52, 90], cg, day);
    CLOUDS.forEach(function (c) { var cx = ((c.x + now * c.sp / 1000) % 1.5 - 0.25) * vw - cam.x * ts * 0.04; cloud(g, cx, c.y * vh, c.s * Math.max(1, ts / 22), rgb(cg), 0.5 * (0.35 + 0.65 * day) * above); });
    var aw = bw[2] * night * above;
    if (aw > 0.05 && !reduce) {
      g.globalCompositeOperation = "lighter";
      [["80,255,190", 0.22, 0.0], ["120,160,255", 0.3, 1.7], ["200,120,255", 0.38, 3.1]].forEach(function (a, k) {
        var gg = g.createLinearGradient(0, vh * 0.05, 0, vh * (a[1] + 0.32)); gg.addColorStop(0, "rgba(" + a[0] + ",0)"); gg.addColorStop(0.45, "rgba(" + a[0] + "," + (0.42 * aw) + ")"); gg.addColorStop(1, "rgba(" + a[0] + ",0)");
        g.fillStyle = gg; g.beginPath(); g.moveTo(0, vh * a[1]);
        for (var sx = 0; sx <= vw + 20; sx += 20) g.lineTo(sx, vh * a[1] + Math.sin(sx * 0.012 + now / 2200 + a[2]) * vh * 0.05 + Math.sin(sx * 0.03 - now / 1700) * vh * 0.015);
        g.lineTo(vw + 20, vh * (a[1] + 0.34)); g.lineTo(0, vh * (a[1] + 0.34)); g.closePath(); g.fill();
      }); g.globalCompositeOperation = "source-over";
    }
    // --- three parallax hill layers in the colours and shapes of the biome you are in ---
    for (var L2 = 0; L2 < 3; L2++) {
      var par = 0.12 + L2 * 0.2, amp = 5 + L2 * 3.5, base = SURF - 3 + L2 * 3.5, f2 = 0.045 + L2 * 0.03, cc = mixArr([HILLS[0][L2], HILLS[1][L2], HILLS[2][L2]], bw);
      var fog = mixC(cc, sk[1], 0.5 - L2 * 0.2); cc = mixC(cc, fog, 0.55 * (1 - L2 * 0.3));
      g.fillStyle = rgb(mixC([6, 12, 20], cc, 0.2 + 0.8 * day)); g.beginPath(); g.moveTo(0, vh);
      for (var sx2 = 0; sx2 <= vw + 12; sx2 += 12) {
        var wx = cam.x * par + (sx2 - vw / 2) / ts, sm = Math.sin(wx * f2) * amp + Math.sin(wx * f2 * 2.3 + 1) * amp * 0.4;
        var jag = (1 - Math.abs(Math.sin(wx * f2 * 1.7 + L2))) * amp * 1.1, pk = Math.abs(Math.sin(wx * f2 * 1.2 + L2 * 2)) * amp * 1.0;
        g.lineTo(sx2, oy + (base + sm * bw[0] + (jag - amp * 0.4) * bw[1] - (pk - amp * 0.3) * bw[2]) * ts);
      }
      g.lineTo(vw + 12, vh); g.closePath(); g.fill();
      if (bw[2] > 0.4 && L2 < 2) { /* snowy caps */ g.fillStyle = "rgba(255,255,255," + (0.35 * day * bw[2]) + ")"; g.fillRect(0, 0, 0, 0); }
    }
    var hz = oy + (SURF - 1) * ts, fg = g.createLinearGradient(0, hz - ts * 7, 0, hz + ts * 1.5), fc = sk[1];
    fg.addColorStop(0, "rgba(" + (fc[0] | 0) + "," + (fc[1] | 0) + "," + (fc[2] | 0) + ",0)"); fg.addColorStop(1, "rgba(" + (fc[0] | 0) + "," + (fc[1] | 0) + "," + (fc[2] | 0) + "," + (0.4 * above) + ")");
    g.fillStyle = fg; g.fillRect(0, hz - ts * 7, vw, ts * 8.5);
    // --- ambient air: swamp spores, drifting embers, falling snow ---
    if (!reduce && above > 0.05) {
      for (i = 0; i < MOTE.length; i++) {
        var m = MOTE[i], kind = m.w < bw[0] ? 0 : m.w < bw[0] + bw[1] ? 1 : 2, tt = now / 1000;
        if (kind === 0) { var mx = ((m.u * vw + Math.sin(tt * 0.5 * m.s + m.v * 9) * 18 + tt * 5 * m.s) % vw + vw) % vw, my = vh * 0.2 + ((m.v * vh * 0.62 - tt * 6 * m.s) % (vh * 0.62) + vh * 0.62) % (vh * 0.62); g.fillStyle = "rgba(120,255,210," + (0.5 * above * (0.4 + 0.6 * night)) + ")"; g.fillRect(mx, my, 2, 2); }
        else if (kind === 1) { var ex2 = ((m.u * vw + Math.sin(tt * m.s + m.v * 7) * 22) % vw + vw) % vw, ey = vh - ((m.v * vh * 1.2 + tt * 26 * m.s) % (vh * 1.1)); g.fillStyle = "rgba(255," + (120 + m.v * 90 | 0) + ",50," + (0.75 * above) + ")"; g.fillRect(ex2, ey, 2, 2); }
        else { var fx = ((m.u * vw + Math.sin(tt * 0.8 * m.s + m.v * 9) * 16) % vw + vw) % vw, fy = ((m.v * vh + tt * 22 * m.s) % vh); g.fillStyle = "rgba(255,255,255," + (0.8 * above) + ")"; g.fillRect(fx, fy, 2, 2); }
      }
    }
    // --- terrain ---
    var X0 = Math.floor(-ox / ts), X1 = Math.floor((vw - ox) / ts), Y0 = Math.floor(-oy / ts), Y1 = Math.floor((vh - oy) / ts);
    glows.length = 0; var wob = Math.sin(now / 500), edge = Math.max(1, Math.round(ts / 9)), sw = Math.sin(now / 700);
    for (j = Y0; j <= Y1; j++) for (i = X0; i <= X1; i++) {
      if (i < 0 || i >= W || j < 0 || j >= H) continue;
      var id = tiles[j * W + i], td = TILES[id], sx3 = ox + i * ts, sy = oy + j * ts, under = j >= col[i];
      if (id === T.AIR) {
        if (under) {
          var bwc = BACKWALL[world.bio[i]], nb = (TILES[get(i - 1, j)].solid ? 1 : 0) + (TILES[get(i + 1, j)].solid ? 1 : 0) + (TILES[get(i, j - 1)].solid ? 1 : 0) + (TILES[get(i, j + 1)].solid ? 1 : 0), sh = ((i * 7 + j * 13) & 3) * 2 - nb * 5;
          g.fillStyle = "rgb(" + clamp(bwc[0] + sh, 0, 255) + "," + clamp(bwc[1] + sh, 0, 255) + "," + clamp(bwc[2] + sh, 0, 255) + ")"; g.fillRect(sx3, sy, ts, ts);
          g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(sx3 + ts * 0.18, sy + ts * 0.2, ts * 0.12, ts * 0.12); g.fillRect(sx3 + ts * 0.62, sy + ts * 0.66, ts * 0.1, ts * 0.1);
        }
        continue;
      }
      if (id === T.WATER) {
        var top = get(i, j - 1) !== T.WATER, dd = 0; if (!top) { dd = 1; while (dd < 6 && get(i, j - dd - 1) === T.WATER) dd++; }
        g.fillStyle = "rgba(" + (52 - dd * 6) + "," + (170 - dd * 14) + "," + (178 - dd * 8) + "," + (0.62 + dd * 0.04) + ")"; g.fillRect(sx3, sy, ts, ts);
        if (top) { var wy = Math.round(wob * 1.5 + Math.sin(i * 0.9 + now / 400) * 1.2 + 2); g.fillStyle = "rgba(210,255,248,.7)"; g.fillRect(sx3, sy + wy, ts, 2); g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(sx3, sy, ts, wy); }
        else if (!reduce && ((i * 31 + j * 17 + (now / 380 | 0)) % 11) === 0) { g.fillStyle = "rgba(190,255,248,.22)"; g.fillRect(sx3 + ts * 0.2, sy + ts * 0.4, ts * 0.5, 2); }
        continue;
      }
      if (id === T.LAVA) {
        var lg = g.createLinearGradient(0, sy, 0, sy + ts); lg.addColorStop(0, "#ff7a22"); lg.addColorStop(1, "#d93c0a"); g.fillStyle = lg; g.fillRect(sx3, sy, ts, ts);
        g.fillStyle = "#ffc24a"; g.fillRect(sx3 + ts * (0.1 + 0.12 * Math.sin(now / 420 + i)), sy + ts * 0.18, ts * 0.5, ts * 0.2); g.fillRect(sx3 + ts * (0.45 + 0.12 * Math.cos(now / 380 + j)), sy + ts * 0.58, ts * 0.4, ts * 0.18);
        g.fillStyle = "rgba(90,20,6,.5)"; g.fillRect(sx3 + ts * ((i * 37 % 7) / 9), sy + ts * 0.82, ts * 0.22, ts * 0.12);
        if (get(i, j - 1) !== T.LAVA) { g.fillStyle = "#ffe9a0"; g.fillRect(sx3, sy, ts, Math.max(2, edge)); if (!reduce && ((i * 13 + (now / 600 | 0)) % 9) === 0) { g.fillStyle = "#fff2b0"; g.fillRect(sx3 + ts * 0.4, sy - ts * 0.25 - ((now / 20) % 6), 3, 3); } }
        glows.push([sx3 + ts / 2, sy + ts / 2, "255,110,30", 3.6, 0.24]); continue;
      }
      var v = ((Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0) & 3;
      if (!td.solid) {
        if (under) { g.fillStyle = "rgb(" + BACKWALL[world.bio[i]].join(",") + ")"; g.fillRect(sx3, sy, ts, ts); }
        if (td.kind === "vine") { var vhalf = Math.round(ts / 2), vo = Math.round(Math.sin(now / 900 + i * 1.7) * ts * 0.08); g.drawImage(ATLAS, v * 16, id * 16, 16, 8, sx3, sy, ts, vhalf); g.drawImage(ATLAS, v * 16, id * 16 + 8, 16, 8, sx3 + vo, sy + vhalf, ts, ts - vhalf); }
        else if (td.kind === "reed" || td.kind === "bloom" || td.kind === "glowcap") { var half = Math.round(ts / 2), off = Math.round(sw * ts * 0.06 * (1 + (i % 3) * 0.3)); g.drawImage(ATLAS, v * 16, id * 16 + 8, 16, 8, sx3, sy + half, ts, ts - half); g.drawImage(ATLAS, v * 16, id * 16, 16, 8, sx3 + off, sy, ts, half); }
        else g.drawImage(ATLAS, v * 16, id * 16, 16, 16, sx3, sy, ts, ts);
      } else {
        g.drawImage(ATLAS, v * 16, id * 16, 16, 16, sx3, sy, ts, ts);
        // exposed faces get a lit rim on top and a shadow on the sides and bottom, so caves and cliffs read clearly
        var nT = !TILES[get(i, j - 1)].solid || get(i, j - 1) === T.LEAVES, nB = !TILES[get(i, j + 1)].solid, nL = !TILES[get(i - 1, j)].solid, nR = !TILES[get(i + 1, j)].solid;
        if (td.kind === "leaves") {
          if (nT) { g.fillStyle = "rgba(190,255,150,.22)"; g.fillRect(sx3, sy, ts, edge); }
          if (nB) { g.fillStyle = "rgba(0,20,5,.32)"; g.fillRect(sx3, sy + ts - edge * 1.5, ts, edge * 1.5); }
        } else {
          if (nT && td.kind !== "moss" && td.kind !== "snow") { g.fillStyle = "rgba(255,255,255,.2)"; g.fillRect(sx3, sy, ts, edge); }
          g.fillStyle = "rgba(0,0,0,.3)"; if (nB) g.fillRect(sx3, sy + ts - edge, ts, edge); if (nL) g.fillRect(sx3, sy, edge, ts); if (nR) g.fillRect(sx3 + ts - edge, sy, edge, ts);
        }
      }
      if (td.light >= 3 && td.solid === false || td.light >= 6) glows.push([sx3 + ts / 2, sy + ts / 2, id === T.TORCH ? "255,170,60" : id === T.CINDER || id === T.BLOOM ? "255,120,50" : id === T.SPIKE || id === T.CRYSTAL ? "130,225,255" : "80,240,190", id === T.TORCH ? 4.6 : 2.7, id === T.TORCH ? 0.3 : 0.17]);
      if (td.kind === "ore" && !reduce && ((now / 90 + i * 7 + j * 3) | 0) % 41 === 0) { g.fillStyle = "#fff"; g.fillRect(sx3 + ts * 0.55, sy + ts * 0.25, 2, 2); g.fillRect(sx3 + ts * 0.55 - 1, sy + ts * 0.25 + 0.5, 4, 1); g.fillRect(sx3 + ts * 0.55 + 0.5, sy + ts * 0.25 - 1, 1, 4); }
    }
    // mining cracks and a pulse on the tile being dug
    if (mine) {
      var mx = ox + mine.x * ts, my = oy + mine.y * ts, nseg = 1 + Math.floor(mine.p * 6);
      g.strokeStyle = "rgba(0,0,0,.65)"; g.lineWidth = Math.max(1, ts / 14); g.beginPath();
      for (i = 0; i < nseg && i < CRACKS.length; i++) { g.moveTo(mx + ts * 0.5, my + ts * 0.5); g.lineTo(mx + ts * CRACKS[i][0], my + ts * CRACKS[i][1]); }
      g.stroke(); g.fillStyle = "rgba(255,255,255," + (0.06 + mine.p * 0.16) + ")"; g.fillRect(mx, my, ts, ts);
    }
    drawPlayer(g, now);
    parts.forEach(function (q) { g.globalAlpha = clamp(q.life / q.max * 1.4, 0, 1); g.fillStyle = q.c; g.fillRect(Math.round(ox + q.x * ts - q.s / 2), Math.round(oy + q.y * ts - q.s / 2), q.s, q.s); }); g.globalAlpha = 1;
    // --- darkness: small light grid stretched with smoothing, tinted deeper blue-violet the further down you go ---
    var M = 14, gx0 = X0 - 1 - M, gy0 = Y0 - 1 - M, gw = X1 - X0 + 3 + M * 2, gh = Y1 - Y0 + 3 + M * 2;
    lightGrid(gx0, gy0, gw, gh, day, Math.floor(p.x), Math.floor(p.y - PH * 0.5));
    var vgw = X1 - X0 + 3, vgh = Y1 - Y0 + 3;
    if (!LC) { LC = document.createElement("canvas"); LCX = LC.getContext("2d"); }
    if (LC.width !== vgw || LC.height !== vgh) { LC.width = vgw; LC.height = vgh; LID = LCX.createImageData(vgw, vgh); }
    var dk = LID.data, deep = clamp((cam.y - SURF) / 60, 0, 1), dr = Math.round(lerp(lerp(6, 3, day), 12, deep)), dg = Math.round(lerp(lerp(9, 6, day), 6, deep)), db = Math.round(lerp(lerp(22, 12, day), 26, deep));
    for (j = 0; j < vgh; j++) for (i = 0; i < vgw; i++) {
      var lv = LG[(j + M) * gw + (i + M)], k = (j * vgw + i) * 4, al = 1 - Math.pow(Math.min(15, lv) / 15, 0.85);
      dk[k] = dr; dk[k + 1] = dg; dk[k + 2] = db; dk[k + 3] = Math.round(clamp(al, 0, 0.97) * 255);
    }
    LCX.putImageData(LID, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(LC, 0, 0, vgw, vgh, ox + (X0 - 1) * ts, oy + (Y0 - 1) * ts, vgw * ts, vgh * ts);
    // dusk/dawn colour grade over the open air
    if ((ph.id === "dusk" || ph.id === "dawn") && above > 0) { g.globalCompositeOperation = "soft-light"; g.fillStyle = "rgba(255,130,70," + (0.55 * Math.sin(ph.k * Math.PI) * above) + ")"; g.fillRect(0, 0, vw, vh); g.globalCompositeOperation = "source-over"; }
    g.imageSmoothingEnabled = false;
    g.globalCompositeOperation = "lighter";
    for (i = 0; i < glows.length; i++) { var gl = glows[i], rad = gl[3] * ts, rg = g.createRadialGradient(gl[0], gl[1], 0, gl[0], gl[1], rad); rg.addColorStop(0, "rgba(" + gl[2] + "," + gl[4] + ")"); rg.addColorStop(1, "rgba(" + gl[2] + ",0)"); g.fillStyle = rg; g.fillRect(gl[0] - rad, gl[1] - rad, rad * 2, rad * 2); }
    flies.forEach(function (fl) { var fx = ox + fl.x * ts, fy = oy + fl.y * ts, a = fl.a * (0.5 + 0.5 * Math.sin(fl.ph * 3)), rg = g.createRadialGradient(fx, fy, 0, fx, fy, ts * 0.8); rg.addColorStop(0, "rgba(220,255,120," + 0.85 * a + ")"); rg.addColorStop(1, "rgba(220,255,120,0)"); g.fillStyle = rg; g.fillRect(fx - ts, fy - ts, ts * 2, ts * 2); });
    g.globalCompositeOperation = "source-over";
    if (!VIG || VIG.width !== Math.max(2, Math.round(vw / 2))) buildVignette();
    g.imageSmoothingEnabled = true; g.drawImage(VIG, 0, 0, vw, vh); g.imageSmoothingEnabled = false;
    g.font = "800 " + Math.max(12, Math.round(ts * 0.52)) + "px Nunito, system-ui, sans-serif"; g.textAlign = "center"; g.lineWidth = 3.5; g.strokeStyle = "rgba(0,0,0,.75)"; g.lineJoin = "round";
    texts.forEach(function (tx) { g.globalAlpha = clamp(tx.life * 1.5, 0, 1); g.fillStyle = tx.c; g.strokeText(tx.s, ox + tx.x * ts, oy + tx.y * ts); g.fillText(tx.s, ox + tx.x * ts, oy + tx.y * ts); }); g.globalAlpha = 1;
    drawGuide(g, now);
    // cursor: animated corner brackets
    if (!panelOpen && aim.tx >= 0 && (!coarse || aim.down)) {
      var ddx = aim.tx + 0.5 - p.x, ddy = aim.ty + 0.5 - (p.y - PH / 2), ok = ddx * ddx + ddy * ddy <= REACH * REACH, cx0 = ox + aim.tx * ts, cy0 = oy + aim.ty * ts, L3 = ts * 0.3, pu = 1 + Math.sin(now / 160) * 0.06;
      g.strokeStyle = ok ? "rgba(255,244,200,.95)" : "rgba(255,90,90,.6)"; g.lineWidth = 2; g.beginPath();
      [[0, 0, 1, 1], [1, 0, -1, 1], [0, 1, 1, -1], [1, 1, -1, -1]].forEach(function (c) { var bx = cx0 + c[0] * ts + (c[0] ? 1 : -1) * (pu - 1) * ts, by = cy0 + c[1] * ts + (c[1] ? 1 : -1) * (pu - 1) * ts; g.moveTo(bx + c[2] * L3, by); g.lineTo(bx, by); g.lineTo(bx, by + c[3] * L3); });
      g.stroke();
    }
  }
  function sky2(g, f, c1, c2, r, now, moon) {
    var x = vw * (0.08 + 0.84 * f), y = vh * 0.34 - Math.sin(f * Math.PI) * vh * 0.26, rg = g.createRadialGradient(x, y, 0, x, y, r * 4.5);
    rg.addColorStop(0, c2 + "bb"); rg.addColorStop(0.35, c2 + "40"); rg.addColorStop(1, c2 + "00"); g.fillStyle = rg; g.fillRect(x - r * 4.5, y - r * 4.5, r * 9, r * 9);
    g.fillStyle = c1; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
    if (moon) { g.fillStyle = "rgba(120,140,190,.35)"; [[-0.3, -0.2, 0.28], [0.35, 0.15, 0.2], [-0.1, 0.45, 0.15]].forEach(function (c) { g.beginPath(); g.arc(x + c[0] * r, y + c[1] * r, c[2] * r, 0, 6.2832); g.fill(); }); }
    else { g.strokeStyle = "rgba(255,230,150,.35)"; g.lineWidth = 2; g.beginPath(); for (var k = 0; k < 10; k++) { var a = k / 10 * 6.2832 + now / 6000; g.moveTo(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35); g.lineTo(x + Math.cos(a) * r * 1.75, y + Math.sin(a) * r * 1.75); } g.stroke(); }
  }
  function drawPlayer(g, now) {
    var sx = ox + p.x * ts, sy = oy + p.y * ts, size = ts * 2.0, bob = p.on && Math.abs(p.vx) > 0.5 ? Math.sin(p.walk * 5) : 0;
    var sq = 1 + bob * 0.05 + (p.vy < -2 ? 0.07 : 0) - (p.vy > 6 ? 0.05 : 0) - (p.land || 0);
    g.save(); g.translate(sx, sy + ts * 0.14); g.scale(p.face, 1);
    g.fillStyle = "rgba(0,0,0,.28)"; g.beginPath(); g.ellipse(0, -ts * 0.1, ts * 0.48, ts * 0.13, 0, 0, 6.2832); g.fill();
    g.scale(1 / sq, sq); if (p.wet) g.globalAlpha = 0.85;
    if (sprite) { var gl2 = 1 - daylight(S.time); if (gl2 > 0.2 || p.y > col[clamp(Math.floor(p.x), 0, W - 1)] + 3) { g.shadowColor = "rgba(110,255,210,.55)"; g.shadowBlur = ts * 0.5; } g.drawImage(sprite, -size / 2, -size * 0.93, size, size); }
    else { g.fillStyle = "#4ee6b4"; g.beginPath(); g.arc(0, -ts * 0.7, ts * 0.6, 0, 6.2832); g.fill(); }
    g.restore();
  }

  // ---------- HUD AND PANELS ----------
  function hud() {
    var b = bioAt(), bi = BIOMES[b], ph = phaseOf(S.time), depth = Math.max(0, Math.floor(p.y - SURF)), under = p.y > col[clamp(Math.floor(p.x), 0, W - 1)] + 2;
    $("sbxBiome").textContent = bi.n; $("sbxLoc").style.setProperty("--bc", bi.c);
    $("sbxSub").textContent = PHN[ph.id] + (under ? " \u00b7 depth " + depth : " \u00b7 surface");
    if (lastBio !== b) { bcard(bi, b); lastBio = b; }
    drawTrail();
    if (hbDirty) drawBar();
  }
  function drawBar() {
    hbDirty = false; var items = ["pick"].concat(hot()), html = "";
    items.forEach(function (id, i) {
      var cnt = id === "pick" ? (S.tier ? "Lv" + S.tier : "Paws") : S.inv[id];
      html += '<button type="button" class="sbx-slot' + (sel === id ? " on" : "") + '" data-sel="' + id + '" aria-label="' + (id === "pick" ? PICKS[S.tier].n : ITEMS[id].n + ", " + S.inv[id]) + '" aria-pressed="' + (sel === id) + '"><img alt="" src="' + icon(id) + '"><i>' + (i + 1) + '</i><b>' + esc(cnt) + '</b></button>';
    });
    $("sbxBar").innerHTML = html;
  }
  function costHtml(cost) {
    return Object.keys(cost).map(function (k) { var have = S.inv[k] || 0, ok = have >= cost[k]; return '<span class="' + (ok ? "ok" : "no") + '"><img alt="" src="' + icon(k) + '">' + have + "/" + cost[k] + " " + esc(ITEMS[k].n) + "</span>"; }).join("");
  }
  function renderPanel() {
    if (!panelOpen) return;
    var tabs = [["trail", "Trail"], ["craft", "Craft"], ["bag", "Bag"], ["map", "Map"], ["goals", "Goals"], ["more", "Options"]];
    $("sbxTabs").innerHTML = tabs.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + "</button>"; }).join("");
    var h = "";
    if (tab === "trail") {
      var cur = TRAIL[S.trail];
      h += '<p class="sbx-note"><b>The First Day Trail.</b> ' + (cur ? "Step " + (S.trail + 1) + " of " + TRAIL.length + ". Follow it from bare paws to your first glowing pick." : "All " + TRAIL.length + " steps done. More chapters are coming.") + "</p>";
      h += '<div class="sbx-goals">' + TRAIL.map(function (t, n) {
        var done = n < S.trail, now2 = n === S.trail, v = now2 ? Math.min(t.need, t.v()) : 0;
        return '<div class="sbx-goal' + (done ? " ok" : "") + (now2 ? " cur" : "") + '"><i aria-hidden="true">' + (done ? "&#10003;" : n + 1) + "</i><div><b>" + esc(n <= S.trail ? t.n : "???") + "</b><small>" + esc(n <= S.trail ? t.d : "Finish the step before this to reveal it.") + "</small>"
          + (now2 ? '<span class="bar"><i style="width:' + Math.round(v / t.need * 100) + '%"></i></span><em>' + v + " / " + t.need + "</em>" : "")
          + (t.rw && n <= S.trail && !done ? '<small class="rw">Reward: ' + esc(rewardText(t.rw)) + "</small>" : "") + "</div></div>";
      }).join("") + "</div>";
    } else if (tab === "craft") {
      var nb = nearBench();
      h += '<p class="sbx-note">Your tool: <b style="color:' + PICKS[S.tier].c + '">' + PICKS[S.tier].n + "</b>. " + (S.st.benches ? (nb ? "A Workbench is close, so you can craft anything." : "No Workbench nearby. Walk next to yours to craft better picks.") : "Better tools unlock new rock. A Workbench lets you craft the next picks.") + "</p>";
      RECIPES.forEach(function (r) {
        var owned = r.tier && S.tier >= r.tier, lock = r.tier && S.tier < r.tier - 1, needB = r.bench && !nb, can = !owned && !lock && Object.keys(r.cost).every(function (k) { return (S.inv[k] || 0) >= r.cost[k]; }), ic = r.tier ? "pick" + r.tier : Object.keys(r.out)[0];
        var im = r.tier ? (function () { var old = S.tier; S.tier = r.tier; var u = icon("pick"); S.tier = old; return u; })() : icon(ic);
        var note = lock ? "Craft the " + PICKS[r.tier - 1].n + " first." : (needB && !owned ? "Needs a Bog Workbench nearby." : r.d);
        h += '<div class="sbx-card' + (owned || lock ? " done" : "") + '"><img class="big" alt="" src="' + im + '"><div><b>' + esc(r.n) + "</b><small>" + esc(note) + '</small><div class="cost">' + costHtml(r.cost) + '</div></div><button type="button" class="btn' + (can && !needB ? "" : " ghost") + '" data-sx-craft="' + r.id + '"' + (owned || lock ? " disabled" : "") + ">" + (owned ? "Owned" : lock ? "Locked" : "Craft") + "</button></div>";
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
  $("sbxTrail").addEventListener("click", function () { openPanel("trail"); });
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
    var r = stageEl.getBoundingClientRect(); vw = Math.max(200, Math.round(r.width)); vh = Math.max(200, Math.round(r.height)); dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr); cv.style.width = vw + "px"; cv.style.height = vh + "px";
    ts = Math.max(12, Math.round(clamp(Math.max(vw, vh) / 34, 15, 40) * (S ? S.zoom : 1)));
  }
  var last = 0, slowN = 0, frN = 0;
  function loop(now) {
    var raw = (now - last) / 1000 || 0.016, dt = Math.min(0.05, raw); last = now;
    // automatic quality: if a device is struggling for ~2 seconds, switch off the optional sparkle (ambient motes, aurora, glints)
    if (!document.hidden && raw < 0.5) { frN++; if (raw > 0.034) slowN++; if (frN >= 120) { if (slowN > 80) reduce = true; frN = slowN = 0; } }
    if (!document.hidden) { if (!panelOpen) update(dt); render(now); if (hbDirty) drawBar(); }
    requestAnimationFrame(loop);
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) save(); });
  window.addEventListener("pagehide", save);
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stageEl);

  buildAtlas(); load(); resize(); mkSprite(); drawBar();
  $("sbxHint").textContent = S.trail === 0 ? (coarse ? "Use the arrows to walk. Hold your finger on tree leaves to gather Sticks." : "A / D walk, Space jumps. Hold the mouse on tree leaves to gather Sticks.") : coarse ? "Use the arrows to walk. Press and hold a block to dig it." : "A / D walk, Space jumps. Hold the mouse on a block to dig. E opens your bag.";
  if (!S.st.mined) $("sbxHint").classList.add("on");
  setTimeout(function () { $("sbxHint").classList.remove("on"); }, 14000);
  requestAnimationFrame(loop);
  window.__sbx = { view: function () { return { ts: ts, ox: ox, oy: oy }; }, get S() { return S; }, p: p, get: get, tiles: function () { return tiles; }, world: function () { return world; }, choose: choose, craft: craft, openPanel: openPanel, give: give, reveal: reveal, trail: function () { return S.trail; }, TRAIL: TRAIL, checkTrail: checkTrail };
})();
