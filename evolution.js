// ===== SwampRealms: Evolution (Stage 2: Hatchery, eggs, creatures and evolution) =====
// Load AFTER cards.js, weapons.js, avatar.js, store.js, account.js, menu.js (see evolution.html).
// Everything lives inside this function so it can never clash with the globals in cards.js / store.js (meta, save, KEY, CS ...).
//
// SAVING: progress is stored INSIDE the crystals save as CS.evo (localStorage "swamp-crystals-v1"), which already syncs with accounts.
// Swamp Coins and Swamp Crystals are NOT touched. "Swamp Essence" is this game's own resource.
// CS.evo = { v, ess, tot, taps, hq, patch, hatch, crs:[{a:animalId, n:name, s:stage 0-2}], egg:{a,t:startMs,d:seconds}|null, seen }
(function () {
  "use strict";

  // ---------- TUNING (change numbers here) ----------
  var CFG = {
    tickMs: 250,            // game loop
    saveMs: 10000,          // autosave (also saves on every purchase and when the tab is hidden)
    offlineCap: 7200,       // most seconds of production that count while away (2 hours). Egg timers use real time.
    welcomeMin: 30,         // show the "welcome back" message after this many seconds away
    stageBonus: [0.10, 0.20, 0.35],   // production bonus each creature gives, by evolution stage (Hatchling, Juvenile, Mighty)
    hqBonus: [0, 0.25],     // production bonus by Swamp Hollow level (index = level - 1)
    patch: { max: 3, cost: [10, 60, 250], rate: [0.5, 1.5, 4] },   // Glowspore Patch: cost to reach each level, Essence per second at each level
    hq: { max: 2, cost: [0, 120] },                                  // Swamp Hollow: cost to reach each level (level 1 is free)
    hatch: { max: 1, cost: [150] },                                  // Hatchery: needs Swamp Hollow level 2
    egg: { cost: [100, 250, 600, 1500], secs: [30, 60, 120, 240] },  // by how many creatures you already own beyond the first
    evolve: { cost: [200, 900], needPatch: [0, 3] },                 // cost to reach Juvenile / Mighty; Mighty also needs a level 3 patch
    maxCreatures: 5
  };
  var STAGES = ["Hatchling", "Juvenile", "Mighty"];
  var OUTFIT = [{}, { neck: "scarf" }, { hat: "crown", neck: "cape" }];   // gear drawn on the creature at each stage (avatar.js ids)
  var SLOTS = [[31, 51.4, 19], [3, 66.7, 13], [22, 66.7, 13], [41, 66.7, 13], [60, 66.7, 13]];   // scene spots for creatures: left %, top %, width %
  var NAMES = { hq: "Swamp Hollow", patch: "Glowspore Patch", hatch: "Hatchery" };

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var reduce = function () { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); };
  var fmt = function (n) { return Math.floor(n).toLocaleString("en-US"); };
  var fmt1 = function (n) { return (Math.round(n * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 1 }); };
  var clock = function (s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  var ANI = (typeof Crystals !== "undefined" && Crystals.animals) ? Crystals.animals : [{ id: "frog", name: "Boggy the Frog" }];
  var aniOf = function (id) { return ANI.filter(function (a) { return a.id === id; })[0]; };
  var first = function (id) { var a = aniOf(id); return a ? a.name.split(" ")[0] : "Friend"; };
  var kind = function (id) { var a = aniOf(id); return a ? a.name.replace(/^.*? the /, "") : "Creature"; };

  // ---------- STATE (CS.evo) ----------
  var S = null, dirty = false, lastSaveAt = 0, lastTick = Date.now(), eggSeen = true;

  function num(v, d, lo, hi) { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; }
  function clean(o) {
    o = (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
    var ids = ANI.map(function (a) { return a.id; }), crs = [];
    if (Array.isArray(o.crs)) o.crs.slice(0, CFG.maxCreatures).forEach(function (c) {
      if (c && ids.indexOf(c.a) > -1 && !crs.some(function (x) { return x.a === c.a; }))
        crs.push({ a: c.a, n: typeof c.n === "string" && c.n ? c.n.slice(0, 24) : first(c.a), s: Math.floor(num(c.s, 0, 0, 2)) });
    });
    if (!crs.length) crs.push({ a: "frog", n: typeof o.cname === "string" && o.cname ? o.cname.slice(0, 24) : "Boggy", s: 0 });   // Stage 1 saves had one frog called cname
    var e = o.egg, egg = null;
    if (e && typeof e === "object" && ids.indexOf(e.a) > -1 && !crs.some(function (x) { return x.a === e.a; }) && crs.length < CFG.maxCreatures)
      egg = { a: e.a, t: num(e.t, Date.now(), 0, 4e12), d: num(e.d, 30, 1, 86400) };
    return {
      v: 2,
      ess: num(o.ess, 0, 0, 1e15), tot: num(o.tot, 0, 0, 1e18), taps: Math.floor(num(o.taps, 0, 0, 1e9)),
      hq: Math.floor(num(o.hq, 1, 1, CFG.hq.max)), patch: Math.floor(num(o.patch, 0, 0, CFG.patch.max)),
      hatch: Math.floor(num(o.hatch, 0, 0, 1)) && Math.floor(num(o.hq, 1, 1, CFG.hq.max)) >= 2 ? 1 : 0,
      crs: crs, egg: egg, seen: num(o.seen, Date.now(), 0, 4e12)
    };
  }
  function load() { try { Crystals.reload(); S = clean(Crystals.state.evo); } catch (e) { S = clean(null); } }
  function save(force) {
    var now = Date.now();
    if (!force && now - lastSaveAt < 1500) return;      // never hammer the shared save
    try { S.seen = now; Crystals.reload(); Crystals.state.evo = S; Crystals.save(); lastSaveAt = now; dirty = false; } catch (e) {}
  }

  // ---------- RULES ----------
  function mult() { return 1 + CFG.hqBonus[S.hq - 1] + S.crs.reduce(function (t, c) { return t + CFG.stageBonus[c.s]; }, 0); }
  function rate() { return S.patch ? CFG.patch.rate[S.patch - 1] * mult() : 0; }
  function tapGain() { return 1 + (S.hq - 1) + S.patch; }
  function lvlOf(id) { return S[id]; }
  var DEF = { hq: CFG.hq, patch: CFG.patch, hatch: CFG.hatch };

  function buildInfo(id) {   // the next purchase of a building: state is max | locked | ready | poor
    var lvl = lvlOf(id), c = DEF[id];
    if (lvl >= c.max) return { state: "max", lvl: lvl };
    var cost = c.cost[lvl];   // cost[i] is the price to reach level i+1
    if (id === "hq" && !S.patch) return { state: "locked", lvl: lvl, cost: cost, why: "Build the Glowspore Patch first" };
    if (id === "hatch" && S.hq < 2) return { state: "locked", lvl: lvl, cost: cost, why: "Upgrade Swamp Hollow to level 2 first" };
    return { state: S.ess >= cost ? "ready" : "poor", lvl: lvl, cost: cost };
  }
  function buy(id) {
    var b = buildInfo(id);
    if (b.state !== "ready") { toast(b.state === "locked" ? b.why : b.state === "max" ? "Already at the highest level for now." : "Not enough Swamp Essence yet."); return; }
    S.ess -= b.cost; S[id]++;
    var msg = S[id] === 1 && id !== "hq" ? NAMES[id] + " built!" : NAMES[id] + " upgraded to level " + S[id] + "!";
    var spot = id === "hq" ? "hq" : id === "patch" ? "p1" : "p2";
    flashScene(spot); burst(spot); chipRes(-b.cost); toast(msg, true);
    try { SFX.streak(); } catch (e) {}
    save(true); renderAll();
  }

  // eggs
  function eggReady() { return !!S.egg && Date.now() >= S.egg.t + S.egg.d * 1000; }
  function eggLeft() { return S.egg ? (S.egg.t + S.egg.d * 1000 - Date.now()) / 1000 : 0; }
  function eggInfo() {   // state: nohatch | full | empty | poor | inc | ready
    if (!S.hatch) return { state: "nohatch" };
    if (S.crs.length >= CFG.maxCreatures) return { state: "full" };
    if (S.egg) return { state: eggReady() ? "ready" : "inc" };
    var i = Math.min(S.crs.length - 1, CFG.egg.cost.length - 1);
    return { state: S.ess >= CFG.egg.cost[i] ? "empty" : "poor", cost: CFG.egg.cost[i], secs: CFG.egg.secs[i] };
  }
  function buyEgg() {
    var e = eggInfo();
    if (e.state !== "empty") { toast(e.state === "poor" ? "Not enough Swamp Essence yet." : "No egg can be bought right now."); return; }
    var have = S.crs.map(function (c) { return c.a; }), pool = ANI.filter(function (a) { return have.indexOf(a.id) < 0; });
    var pick = pool[Math.floor(Math.random() * pool.length)];
    S.ess -= e.cost; S.egg = { a: pick.id, t: Date.now(), d: e.secs }; eggSeen = false;
    chipRes(-e.cost); flashScene("p2"); toast("Egg placed in the Hatchery. It hatches in " + clock(e.secs) + ".", true);
    try { SFX.streak(); } catch (x) {}
    save(true); renderAll();
  }
  function hatch() {
    if (!eggReady()) return;
    var a = aniOf(S.egg.a); S.crs.push({ a: a.id, n: first(a.id), s: 0 }); S.egg = null; eggSeen = true;
    burst("p2"); toast(a.name + " hatched!", true);
    try { SFX.open("Epic"); } catch (x) {}
    save(true); renderAll();
    var el = document.querySelector('.evo-cr[data-c="' + (S.crs.length - 1) + '"]'); if (el) hop(el);
  }

  // evolution
  function evoInfo(i) {
    var c = S.crs[i];
    if (c.s >= 2) return { state: "max" };
    var cost = CFG.evolve.cost[c.s], np = CFG.evolve.needPatch[c.s];
    if (S.patch < np) return { state: "locked", cost: cost, why: "Needs Glowspore Patch level " + np };
    return { state: S.ess >= cost ? "ready" : "poor", cost: cost };
  }
  function evolve(i) {
    var c = S.crs[i], b = c && evoInfo(i);
    if (!c || b.state !== "ready") { toast(!c ? "" : b.state === "locked" ? b.why : b.state === "max" ? c.n + " is fully evolved." : "Not enough Swamp Essence yet."); return; }
    S.ess -= b.cost; c.s++;
    chipRes(-b.cost); toast(c.n + " evolved into a " + STAGES[c.s] + " " + kind(c.a) + "!", true);
    try { SFX.streak(); } catch (x) {}
    save(true); renderAll();
    burst([(SLOTS[i][0] + SLOTS[i][2] / 2) / 100, (SLOTS[i][1] + 6) / 100]);
    var el = document.querySelector('.evo-cr[data-c="' + i + '"]'); if (el) hop(el);
  }

  function pet(ev) {
    var g = tapGain();
    S.ess += g; S.tot += g; S.taps++; dirty = true;
    var r = $("evoScene").getBoundingClientRect(), x = ev && ev.clientX ? ev.clientX - r.left : r.width * 0.4, y = ev && ev.clientY ? ev.clientY - r.top : r.height * 0.6;
    floatText(x, y, "+" + g, "gold");
    var b = ev && ev.target && ev.target.closest ? ev.target.closest(".evo-cr") : null; if (b) hop(b);
    pop(); paintRes(); refresh();
  }
  function hop(b) { b.classList.remove("hop"); void b.offsetWidth; b.classList.add("hop"); }

  // ---------- TICK ----------
  function tick() {
    var now = Date.now(), dt = Math.max(0, (now - lastTick) / 1000); lastTick = now;
    var away = dt;
    dt = Math.min(dt, CFG.offlineCap);
    var gain = rate() * dt;
    if (gain > 0) { S.ess += gain; S.tot += gain; dirty = true; }
    if (away >= CFG.welcomeMin && gain >= 1) toast("Welcome back! Your patch collected " + fmt(gain) + " Essence while you were away.");
    if (S.egg && !eggSeen && eggReady()) {   // the egg just finished
      eggSeen = true; toast("Your egg is ready to hatch!", true); try { SFX.coin(); } catch (e) {}
      paintScene(); renderCreature(); renderRealm();
    }
    paintRes(); refresh();
    if (dirty && now - lastSaveAt > CFG.saveMs) save(false);
  }
  function ambient() {   // a little glowspore number drifts up from the patch while it produces
    if (!S.patch || document.hidden) return;
    var sc = $("evoScene"); if (!sc) return;
    var r = sc.getBoundingClientRect(); if (!r.width) return;
    floatText(r.width * (0.5 + 0.16 * Math.random()), r.height * 0.5, "+" + fmt1(rate() * 1.8), "mint", true);
  }

  // ---------- FEEDBACK ----------
  function paintRes() {
    $("evoEss").textContent = fmt(S.ess);
    var r = rate();
    $("evoRate").textContent = "+" + fmt1(r) + "/s"; $("evoRate").classList.toggle("off", !r);
    $("evoMult").textContent = "+" + Math.round((mult() - 1) * 100) + "% bonus";
  }
  function pop() { try { HudFX.pop($("evoEss")); } catch (e) {} }
  function chipRes(d) { try { HudFX.chip($("evoCount"), d, "gold", "below"); } catch (e) {} pop(); }
  function floatText(x, y, text, k, quiet) {
    if (reduce() && quiet) return;
    var sc = $("evoScene"), el = document.createElement("i");
    el.className = "evo-float " + (k || "gold"); el.textContent = text; el.style.left = x + "px"; el.style.top = y + "px"; el.setAttribute("aria-hidden", "true");
    sc.appendChild(el); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1200);
  }
  var SPOTS = { hq: [0.17, 0.544], p1: [0.6, 0.62], p2: [0.86, 0.62] };
  function burst(where) {
    if (reduce()) return;
    var sc = $("evoScene"), r = sc.getBoundingClientRect(), p = typeof where === "string" ? SPOTS[where] : where;
    for (var i = 0; i < 12; i++) {
      var s = document.createElement("i"), a = (i / 12) * Math.PI * 2, d = 38 + Math.random() * 30;
      s.className = "evo-spark"; s.style.left = r.width * p[0] + "px"; s.style.top = r.height * p[1] + "px";
      s.style.setProperty("--dx", Math.cos(a) * d + "px"); s.style.setProperty("--dy", Math.sin(a) * d - 10 + "px");
      sc.appendChild(s); (function (n) { setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 900); })(s);
    }
  }
  function flashScene(which) {
    var el = $({ hq: "hotHq", p1: "hotP1", p2: "hotP2" }[which]); if (!el) return;
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  }
  var toastT = 0;
  function toast(msg, good) {
    if (!msg) return;
    var t = $("evoToast"); t.textContent = msg; t.className = "evo-toast show" + (good ? " good" : "");
    clearTimeout(toastT); toastT = setTimeout(function () { t.className = "evo-toast"; }, 2800);
  }

  // ---------- SCENE ART (SVG, redrawn when something is built, upgraded or hatched) ----------
  function sceneSVG() {
    var hq2 = S.hq >= 2, p = S.patch;
    var shrooms = "";
    if (p) {
      var pts = [[232, 170, 1], [248, 176, 1.15], [262, 169, .9], [240, 160, .8], [256, 158, 1], [226, 178, .7], [270, 178, .75]], n = 2 + p * 2;
      for (var i = 0; i < Math.min(n, pts.length); i++) {
        var q = pts[i];
        shrooms += '<g transform="translate(' + q[0] + ' ' + q[1] + ') scale(' + q[2] + ')" class="evo-shroom" style="animation-delay:' + (i * .35) + 's"><rect x="-1.5" y="-2" width="3" height="10" rx="1.5" fill="#cfeee2"/><path d="M-9 -1a9 8 0 0118 0z" fill="url(#gP)"/><circle cx="-3" cy="-5" r="1.3" fill="#e9fff7" opacity=".8"/><circle cx="3" cy="-3" r="1" fill="#e9fff7" opacity=".7"/></g>';
      }
      if (p >= 3) shrooms += '<g transform="translate(250 150)"><path d="M0 -16l7 10-4 14h-6l-4-14z" fill="#8ef7d6" opacity=".9"/><path d="M0 -16l7 10-7 3z" fill="#fff" opacity=".35"/></g>';
    }
    var plot1 = p
      ? '<ellipse cx="248" cy="178" rx="52" ry="14" fill="#16301f"/><ellipse cx="248" cy="175" rx="48" ry="11" fill="#244a2b"/><ellipse cx="248" cy="172" rx="40" ry="8" fill="#2f6a37"/>' + shrooms + '<ellipse cx="248" cy="165" rx="34" ry="12" fill="url(#gGlow)" opacity="' + (0.35 + p * .15) + '"/>'
      : '<ellipse cx="248" cy="178" rx="52" ry="14" fill="#16301f"/><ellipse cx="248" cy="175" rx="48" ry="11" fill="#1f3d27"/><ellipse cx="248" cy="174" rx="38" ry="8" fill="none" stroke="#4ee6b4" stroke-opacity=".6" stroke-width="1.6" stroke-dasharray="5 5" class="evo-dash"/><path d="M248 166v16M240 174h16" stroke="#4ee6b4" stroke-width="3" stroke-linecap="round" opacity=".85"/>';
    var plot2;
    if (S.hatch) {   // the Hatchery: a straw nest, with the egg in it once you have bought one
      var st = S.egg ? (eggReady() ? "ready" : "inc") : "", egg = "";
      if (S.egg) egg = (st === "ready" ? '<circle cx="338" cy="164" r="22" fill="url(#gGlow2)"/>' : "") +
        '<g class="evo-egg ' + st + '"><ellipse cx="338" cy="165" rx="10" ry="13" fill="' + (st === "ready" ? "#ffe9a0" : "#eef3dd") + '"/><ellipse cx="338" cy="165" rx="10" ry="13" fill="url(#gShade)"/><circle cx="334" cy="161" r="1.8" fill="#4ee6b4" opacity=".8"/><circle cx="342" cy="168" r="2.2" fill="#4ee6b4" opacity=".7"/><circle cx="336" cy="172" r="1.4" fill="#f2c14e" opacity=".8"/></g>';
      plot2 = '<ellipse cx="338" cy="182" rx="46" ry="12" fill="#16301f"/><ellipse cx="338" cy="179" rx="42" ry="9" fill="#244a2b"/><ellipse cx="338" cy="177" rx="26" ry="8" fill="#6b4c25"/><ellipse cx="338" cy="175" rx="22" ry="6" fill="#8a6a3a"/><path d="M318 176q4-3 8 0M350 177q4-3 8 0M330 180q8-2 16 0" stroke="#c9a15a" stroke-width="1.4" fill="none" stroke-linecap="round"/>' + egg;
    } else if (hq2) {
      plot2 = '<ellipse cx="338" cy="182" rx="46" ry="12" fill="#16301f"/><ellipse cx="338" cy="179" rx="42" ry="9" fill="#1f3d27"/><ellipse cx="338" cy="178" rx="33" ry="7" fill="none" stroke="#f2c14e" stroke-opacity=".55" stroke-width="1.6" stroke-dasharray="4 5" class="evo-dash"/><path d="M338 171v14M331 178h14" stroke="#f2c14e" stroke-width="3" stroke-linecap="round" opacity=".85"/>';
    } else {
      plot2 = '<ellipse cx="338" cy="182" rx="46" ry="12" fill="#0f2119"/><ellipse cx="338" cy="179" rx="42" ry="9" fill="#13261d"/><g transform="translate(338 172)"><rect x="-7" y="-2" width="14" height="11" rx="2.5" fill="#2b3a33" stroke="#4ee6b4" stroke-opacity=".5"/><path d="M-4 -2v-3a4 4 0 018 0v3" fill="none" stroke="#6b8a7e" stroke-width="2"/></g>';
    }
    var hq = '<ellipse cx="75" cy="188" rx="72" ry="17" fill="#13281a"/><ellipse cx="75" cy="184" rx="66" ry="13" fill="#244a2b"/><ellipse cx="75" cy="181" rx="56" ry="9" fill="#2f6a37"/>';
    if (hq2) hq += '<rect x="30" y="112" width="90" height="26" rx="4" fill="#3b2a1a"/><path d="M24 114l51-30 51 30z" fill="#2c6b3a"/><path d="M24 114l51-30 51 30" fill="none" stroke="#7fd36a" stroke-opacity=".5" stroke-width="2"/><rect x="72" y="62" width="2.5" height="24" fill="#8a6a3a"/><path d="M74.5 62l16 5-16 6z" fill="#4ee6b4"/>';
    hq += '<rect x="36" y="138" width="78" height="44" rx="5" fill="#4a341f"/><rect x="36" y="138" width="78" height="8" rx="4" fill="#5d4326"/><path d="M28 140l47-34 47 34z" fill="#34803f"/><path d="M28 140l47-34 47 34" fill="none" stroke="#9de07a" stroke-opacity=".5" stroke-width="2"/><path d="M44 140q3 8 0 14M64 140q-3 7 1 12M88 140q3 9-1 14M104 140q-2 7 1 11" stroke="#6fcf6a" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/><path d="M62 182v-17a13 13 0 0126 0v17z" fill="#1a1208"/><path d="M65 182v-16a10 10 0 0120 0v16z" fill="#f2c14e" opacity=".85"/><circle cx="75" cy="165" r="22" fill="url(#gGlow2)" opacity=".7"/><rect x="42" y="152" width="14" height="12" rx="2" fill="#1a1208"/><rect x="44" y="154" width="10" height="8" rx="1.5" fill="#f2c14e" opacity=".7"/><rect x="94" y="152" width="14" height="12" rx="2" fill="#1a1208"/><rect x="96" y="154" width="10" height="8" rx="1.5" fill="#f2c14e" opacity=".7"/>';
    hq += '<g transform="translate(118 164)"><rect x="-1" y="-16" width="2.4" height="20" fill="#6b4a2a"/><circle cx="0" cy="-18" r="5" fill="#f2c14e"/><circle cx="0" cy="-18" r="12" fill="url(#gGlow2)" opacity=".7"/></g>';
    var flies = "";
    for (var f = 0; f < 7; f++) flies += '<circle class="evo-fly" cx="' + (30 + f * 52) + '" cy="' + (60 + (f * 37) % 90) + '" r="1.7" fill="#d6ff9a" style="animation-delay:' + (f * .8) + 's"/>';
    var trees = "";
    for (var t = 0; t < 9; t++) { var x = t * 50 - 10, h = 70 + (t * 29) % 40; trees += '<path d="M' + x + ' 150 L' + (x + 6) + ' ' + (150 - h) + ' L' + (x + 12) + ' 150z" fill="#0a1a14"/><path d="M' + (x + 6) + ' ' + (150 - h) + 'q-8 20-4 46M' + (x + 6) + ' ' + (150 - h + 10) + 'q9 18 5 40" stroke="#123828" stroke-width="2" fill="none"/>'; }
    var pads = "";
    SLOTS.forEach(function (s, i) { if (i < S.crs.length) pads += '<ellipse cx="' + ((s[0] + s[2] / 2) * 4) + '" cy="' + (s[1] * 3.4 - 50 + s[2] * 3.3) + '" rx="' + (s[2] * 2.3) + '" ry="' + (s[2] * .75) + '" fill="#1c4a2c" opacity=".9"/><ellipse cx="' + ((s[0] + s[2] / 2) * 4) + '" cy="' + (s[1] * 3.4 - 52 + s[2] * 3.3) + '" rx="' + (s[2] * 2.1) + '" ry="' + (s[2] * .6) + '" fill="#2f6a37" opacity=".9"/>'; });
    return '<svg viewBox="0 0 400 340" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs>' +
      '<linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#06100d"/><stop offset=".55" stop-color="#0f2c24"/><stop offset="1" stop-color="#1b4a3a"/></linearGradient>' +
      '<linearGradient id="gWater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#103a33"/><stop offset="1" stop-color="#050e0b"/></linearGradient>' +
      '<linearGradient id="gP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9ffe9"/><stop offset="1" stop-color="#27b88c"/></linearGradient>' +
      '<linearGradient id="gShade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>' +
      '<radialGradient id="gGlow"><stop offset="0" stop-color="#4ee6b4" stop-opacity=".8"/><stop offset="1" stop-color="#4ee6b4" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="gGlow2"><stop offset="0" stop-color="#f2c14e" stop-opacity=".8"/><stop offset="1" stop-color="#f2c14e" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="gMoon"><stop offset="0" stop-color="#e9fff6" stop-opacity=".95"/><stop offset=".25" stop-color="#bff5e2" stop-opacity=".5"/><stop offset="1" stop-color="#bff5e2" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="400" height="340" fill="url(#gSky)"/>' +
      '<path d="M0 70Q100 20 200 60T400 40V0H0z" fill="#4ee6b4" opacity=".07"/><path d="M0 100Q120 50 220 90T400 70V0H0z" fill="#6df0ff" opacity=".04"/>' +
      '<circle cx="322" cy="70" r="56" fill="url(#gMoon)"/><circle cx="322" cy="70" r="16" fill="#effff8"/><ellipse class="evo-ring" cx="322" cy="70" rx="44" ry="13" fill="none" stroke="#6df0ff" stroke-opacity=".55" stroke-width="1" stroke-dasharray="3 5" transform="rotate(-18 322 70)"/>' +
      '<g fill="#fff" opacity=".7"><circle cx="40" cy="26" r="1"/><circle cx="110" cy="16" r="1.2"/><circle cx="170" cy="38" r=".9"/><circle cx="240" cy="20" r="1"/><circle cx="380" cy="130" r=".9"/><circle cx="60" cy="70" r=".8"/><circle cx="140" cy="84" r="1"/><circle cx="215" cy="56" r=".8"/></g>' +
      '<g transform="translate(0 50)">' + trees + '<rect y="150" width="400" height="190" fill="url(#gWater)"/>' +
      '<g stroke="#6df0ff" stroke-opacity=".14" stroke-width="1" fill="none"><path d="M0 170H400M0 190H400M0 215H400M0 245H400M0 280H400M200 150L200 340M120 150L40 340M280 150L360 340M40 150L-80 340M360 150L480 340"/></g>' +
      '<g stroke="#4ee6b4" stroke-opacity=".2" stroke-width="1.2" fill="none"><path d="M10 205q20-5 40 0t40 0M180 232q25-6 50 0t50 0M290 212q20-4 40 0t40 0M20 240q25-5 50 0t50 0M120 270q25-6 50 0t50 0"/></g>' +
      hq + plot1 + plot2 + pads +
      '<g fill="#7fd36a" opacity=".85"><path d="M8 190q2-22 6-26-1 16 4 26zM392 196q-2-22-6-26 1 16-4 26zM178 250q2-18 5-22-1 14 3 22z"/></g>' + flies +
      '<ellipse class="evo-mist" cx="120" cy="196" rx="150" ry="14" fill="#bff5e2" opacity=".07"/></g></svg>';
  }
  function paintScene() {
    $("evoArt").innerHTML = sceneSVG();
    var h1 = $("hotP1"), h2 = $("hotP2");
    h1.classList.toggle("built", !!S.patch); h2.classList.toggle("locked", S.hq < 2);
    h1.setAttribute("aria-label", S.patch ? "Glowspore Patch, level " + S.patch : "Starter plot, empty. Tap to build.");
    h2.setAttribute("aria-label", S.hq < 2 ? "Second plot, locked until Swamp Hollow level 2" : !S.hatch ? "Second plot, empty. Tap to build the Hatchery." : eggReady() ? "Hatchery, egg ready. Tap to hatch." : S.egg ? "Hatchery, egg incubating" : "Hatchery, no egg");
    $("hotHq").setAttribute("aria-label", "Swamp Hollow, level " + S.hq);
  }
  function crArt(c) {
    try {
      var o = Object.assign({ animal: c.a, nobg: true }, OUTFIT[c.s]);
      return AV.svg(o).replace('viewBox="0 0 200 200"', 'viewBox="14 0 172 168"');
    } catch (e) { return "🐸"; }
  }
  function aura(c) { try { return AV.aura(Object.assign({}, OUTFIT[c.s])) || ""; } catch (e) { return ""; } }
  function paintCreatures() {   // the creatures standing in the swamp
    $("evoCrs").innerHTML = S.crs.map(function (c, i) {
      var s = SLOTS[i], au = aura(c);
      return '<button type="button" class="evo-cr" data-c="' + i + '" style="left:' + s[0] + '%;top:' + s[1] + '%;width:' + s[2] + '%" aria-label="Pet ' + esc(c.n) + ' the ' + STAGES[c.s] + ' ' + esc(kind(c.a)) + ' to collect Swamp Essence"><span class="evo-cr-art"' + (au ? ' style="--aura:' + au + '"' : "") + '>' + crArt(c) + '</span>' + (i === 0 ? '<span class="evo-cr-tip">Tap to pet</span>' : "") + '</button>';
    }).join("");
  }

  // ---------- PANELS ----------
  var pips = function (n, max) { var h = '<div class="evo-pips" aria-hidden="true">'; for (var i = 0; i < max; i++) h += '<i' + (i < n ? ' class="on"' : '') + '></i>'; return h + '</div>'; };
  function btnFor(id) {
    var b = buildInfo(id);
    if (b.state === "max") return '<button type="button" class="btn ghost" disabled>' + (id === "hatch" ? "Built" : "Max level") + '</button>';
    var label = (lvlOf(id) ? "Upgrade" : "Build") + ' <span class="evo-c"><span class="evo-orb sm" aria-hidden="true"></span>' + fmt(b.cost) + '</span>';
    if (b.state === "locked") return '<button type="button" class="btn ghost" data-buy="' + id + '" disabled>' + label + '</button><p class="evo-need">' + esc(b.why) + '</p>';
    return '<button type="button" class="btn" data-buy="' + id + '"' + (b.state === "ready" ? "" : " disabled") + '>' + label + '</button><div class="evo-bar2" data-prog="' + id + '"><i></i></div><p class="evo-need" data-need="' + id + '"></p>';
  }
  function renderBuild() {
    var p = S.patch, nextRate = p && p < CFG.patch.max ? CFG.patch.rate[p] * mult() : 0, h = "";
    h += '<article class="evo-card' + (S.hq >= CFG.hq.max ? " done" : "") + '"><div class="evo-ic hq" aria-hidden="true"></div><div class="evo-info"><h3>Swamp Hollow <em>Lv ' + S.hq + '/' + CFG.hq.max + '</em></h3><p>Your headquarters. Level 2 adds +25% production, stronger taps and opens the Hatchery plot.</p>' + pips(S.hq, CFG.hq.max) + '</div><div class="evo-act">' + btnFor("hq") + '</div></article>';
    h += '<article class="evo-card' + (p >= CFG.patch.max ? " done" : "") + '"><div class="evo-ic patch" aria-hidden="true"></div><div class="evo-info"><h3>Glowspore Patch <em>' + (p ? "Lv " + p + "/" + CFG.patch.max : "Not built") + '</em></h3><p>' +
      (p ? "Makes " + fmt1(rate()) + " Essence per second." + (nextRate ? " Next level: " + fmt1(nextRate) + "/s." : " Fully grown!") : "Your starter plot is empty. Build a patch to make Essence on its own.") + '</p>' + pips(p, CFG.patch.max) + '</div><div class="evo-act">' + btnFor("patch") + '</div></article>';
    h += '<article class="evo-card' + (S.hatch ? " done" : S.hq < 2 ? " locked" : "") + '"><div class="evo-ic ' + (S.hatch ? "egg" : S.hq < 2 ? "lock" : "plot") + '" aria-hidden="true"></div><div class="evo-info"><h3>Hatchery <em>' + (S.hatch ? "Built" : S.hq < 2 ? "Locked" : "Not built") + '</em></h3><p>' +
      (S.hatch ? "Buy eggs and hatch new creatures in the Creature tab." : "A nest on your second plot where eggs hatch into new swamp friends.") + '</p></div><div class="evo-act">' + btnFor("hatch") + '</div></article>';
    $("pane-build").innerHTML = h;
  }
  function eggCard() {
    var e = eggInfo(), n = S.crs.length, h;
    if (e.state === "nohatch") return '<article class="evo-card locked"><div class="evo-ic lock" aria-hidden="true"></div><div class="evo-info"><h3>Eggs <em>Locked</em></h3><p>' + (S.hq < 2 ? "Upgrade Swamp Hollow to level 2, then build the Hatchery." : "Build the Hatchery in the Build tab to hatch new creatures.") + '</p></div></article>';
    if (e.state === "full") return '<article class="evo-card done"><div class="evo-ic egg" aria-hidden="true"></div><div class="evo-info"><h3>Collection complete</h3><p>You have hatched every swamp creature. Evolve them to boost your production.</p></div></article>';
    if (e.state === "ready") return '<article class="evo-card done"><div class="evo-ic egg ready" aria-hidden="true"></div><div class="evo-info"><h3>Egg ready! <em>Mystery</em></h3><p>Something is moving inside. Tap hatch to meet it.</p></div><div class="evo-act"><button type="button" class="btn ready" data-hatch>Hatch egg</button></div></article>';
    if (e.state === "inc") return '<article class="evo-card"><div class="evo-ic egg" aria-hidden="true"></div><div class="evo-info"><h3>Incubating <em data-eggtime></em></h3><p>Your egg is warming up in the Hatchery. It keeps hatching while you are away.</p></div><div class="evo-act"><div class="evo-bar2" data-eggbar><i></i></div></div></article>';
    return '<article class="evo-card"><div class="evo-ic egg" aria-hidden="true"></div><div class="evo-info"><h3>Mystery egg <em>' + n + '/' + CFG.maxCreatures + ' creatures</em></h3><p>Place an egg in the Hatchery. It hatches into a swamp friend you do not have yet in ' + clock(e.secs) + '.</p></div><div class="evo-act"><button type="button" class="btn" data-egg disabled>Buy egg <span class="evo-c"><span class="evo-orb sm" aria-hidden="true"></span>' + fmt(e.cost) + '</span></button><div class="evo-bar2" data-prog="egg"><i></i></div><p class="evo-need" data-need="egg"></p></div></article>';
  }
  function renderCreature() {
    var h = eggCard();
    S.crs.forEach(function (c, i) {
      var b = evoInfo(i), au = aura(c), bonus = Math.round(CFG.stageBonus[c.s] * 100);
      var act = b.state === "max" ? '<button type="button" class="btn ghost" disabled>Fully evolved</button>'
        : b.state === "locked" ? '<button type="button" class="btn ghost" data-evolve="' + i + '" disabled>Evolve <span class="evo-c"><span class="evo-orb sm" aria-hidden="true"></span>' + fmt(b.cost) + '</span></button><p class="evo-need">' + esc(b.why) + '</p>'
        : '<button type="button" class="btn" data-evolve="' + i + '" disabled>Evolve to ' + STAGES[c.s + 1] + ' <span class="evo-c"><span class="evo-orb sm" aria-hidden="true"></span>' + fmt(b.cost) + '</span></button><div class="evo-bar2" data-prog="evo' + i + '"><i></i></div><p class="evo-need" data-need="evo' + i + '"></p>';
      h += '<article class="evo-card creature' + (b.state === "max" ? " done" : "") + '"><div class="evo-cav"' + (au ? ' style="--aura:' + au + '"' : "") + ' aria-hidden="true">' + crArt(c) + '</div><div class="evo-info"><h3>' + esc(c.n) + ' the ' + esc(kind(c.a)) + ' <em>' + STAGES[c.s] + '</em></h3><p>Stage ' + (c.s + 1) + ' of 3. Adds +' + bonus + '% production' + (c.s < 2 ? ", +" + Math.round(CFG.stageBonus[c.s + 1] * 100) + "% when evolved." : ". Fully grown!") + '</p>' + pips(c.s + 1, 3) + '</div><div class="evo-act">' + act + '</div></article>';
    });
    if (S.crs.length < 2 && S.hatch) h += '<article class="evo-card empty"><div class="evo-ic plot" aria-hidden="true"></div><div class="evo-info"><h3>Empty spot <em>Open</em></h3><p>Hatch an egg to fill this spot.</p></div></article>';
    $("pane-creature").innerHTML = h;
  }
  function renderRealm() {
    var goals = [["Build the Glowspore Patch", S.patch >= 1], ["Upgrade the patch to level " + CFG.patch.max, S.patch >= CFG.patch.max], ["Upgrade Swamp Hollow to level " + CFG.hq.max, S.hq >= CFG.hq.max],
      ["Build the Hatchery", !!S.hatch], ["Hatch a second creature", S.crs.length >= 2], ["Evolve a creature", S.crs.some(function (c) { return c.s >= 1; })]];
    var all = goals.every(function (g) { return g[1]; }), dn = goals.filter(function (g) { return g[1]; }).length;
    var h = '<article class="evo-card realm"><div class="evo-info"><h3>Your realm</h3><ul class="evo-stats"><li><span>Essence per second</span><b>' + fmt1(rate()) + '</b></li><li><span>Production bonus</span><b>+' + Math.round((mult() - 1) * 100) + '%</b></li><li><span>Essence earned, all time</span><b>' + fmt(S.tot) + '</b></li><li><span>Swamp Hollow</span><b>Level ' + S.hq + '</b></li><li><span>Creatures</span><b>' + S.crs.length + '/' + CFG.maxCreatures + '</b></li></ul></div></article>';
    h += '<article class="evo-card' + (all ? " done" : "") + '"><div class="evo-info"><h3>First steps <em>' + dn + '/' + goals.length + '</em></h3><ul class="evo-goals">' + goals.map(function (g) { return '<li class="' + (g[1] ? "ok" : "") + '"><i aria-hidden="true"></i>' + esc(g[0]) + '</li>'; }).join("") + '</ul>' +
      (all ? '<p class="evo-win">All first steps complete! Your swamp is thriving. New biomes and buildings are coming.</p>' : '<p>Finish these to complete the first stage of your realm.</p>') + '</div></article>';
    h += '<p class="evo-fine">Progress is saved on this device and in your account when you are signed in. <button type="button" class="evo-link" data-reset>Start over</button></p>';
    $("pane-realm").innerHTML = h;
  }
  function renderAll() { paintRes(); paintScene(); paintCreatures(); renderBuild(); renderCreature(); renderRealm(); refresh(); }

  // light update every tick: buttons enable themselves and bars fill, without rebuilding the DOM under a pressed finger
  function bar(key, have, cost) {
    var f = document.querySelector('[data-prog="' + key + '"] i'); if (f) f.style.width = Math.min(100, have / cost * 100) + "%";
    var n = document.querySelector('[data-need="' + key + '"]'); if (n) n.textContent = have >= cost ? "Ready!" : "Need " + fmt(Math.ceil(cost - have)) + " more Essence";
  }
  function refresh() {
    ["hq", "patch", "hatch"].forEach(function (id) {
      var b = buildInfo(id), btn = document.querySelector('[data-buy="' + id + '"]');
      if (!btn || b.state === "max" || b.state === "locked") return;
      var ok = b.state === "ready"; btn.disabled = !ok; btn.classList.toggle("ready", ok); bar(id, S.ess, b.cost);
    });
    var e = eggInfo(), eb = document.querySelector("[data-egg]");
    if (eb && e.cost) { eb.disabled = e.state !== "empty"; eb.classList.toggle("ready", e.state === "empty"); bar("egg", S.ess, e.cost); }
    if (e.state === "inc") {
      var f = document.querySelector("[data-eggbar] i"), t = document.querySelector("[data-eggtime]");
      if (f) f.style.width = Math.min(100, (1 - eggLeft() / S.egg.d) * 100) + "%"; if (t) t.textContent = clock(eggLeft()) + " left";
    }
    S.crs.forEach(function (c, i) {
      var b = evoInfo(i), btn = document.querySelector('[data-evolve="' + i + '"]');
      if (!btn || b.state === "max" || b.state === "locked") return;
      var ok = b.state === "ready"; btn.disabled = !ok; btn.classList.toggle("ready", ok); bar("evo" + i, S.ess, b.cost);
    });
    var h1 = $("hotP1"), h2 = $("hotP2");
    h1.classList.toggle("can", !S.patch && buildInfo("patch").state === "ready"); h1.setAttribute("data-tip", "Build");
    var hatchCan = eggReady(), buildCan = !S.hatch && S.hq >= 2 && buildInfo("hatch").state === "ready";
    h2.classList.toggle("can", hatchCan || buildCan); h2.setAttribute("data-tip", hatchCan ? "Hatch!" : "Build");
  }

  // ---------- NAVIGATION + EVENTS ----------
  function tab(name) {
    ["build", "creature", "realm"].forEach(function (n) { var on = n === name; $("tab-" + n).setAttribute("aria-selected", on); $("pane-" + n).hidden = !on; });
    try { sessionStorage.setItem("evo-tab", name); } catch (e) {}
  }
  function bind() {
    document.querySelector(".evo-nav").addEventListener("click", function (e) { var t = e.target.closest("[data-tab]"); if (t) tab(t.dataset.tab); });
    $("evoStage").addEventListener("click", function (e) {
      var b = e.target.closest("[data-buy]"); if (b) { buy(b.dataset.buy); return; }
      if (e.target.closest("[data-egg]")) { buyEgg(); return; }
      if (e.target.closest("[data-hatch]")) { hatch(); return; }
      var v = e.target.closest("[data-evolve]"); if (v) { evolve(Number(v.dataset.evolve)); return; }
      if (e.target.closest("[data-reset]") && confirm("Start your swamp over? This only resets SwampRealms: Evolution. Your coins, crystals, cards and avatar are not touched.")) {
        S = clean(null); S.seen = Date.now(); eggSeen = true; save(true); renderAll(); tab("build"); toast("Your swamp was reset.");
      }
    });
    $("evoCrs").addEventListener("click", function (e) { if (e.target.closest(".evo-cr")) pet(e); });
    $("hotHq").addEventListener("click", function () { tab("build"); toast("Swamp Hollow, level " + S.hq + (S.hq >= CFG.hq.max ? ". Highest level for now." : ".")); });
    $("hotP1").addEventListener("click", function () { tab("build"); if (!S.patch) { var b = buildInfo("patch"); toast(b.state === "ready" ? "Tap Build to plant your Glowspore Patch." : "Pet your creature to collect " + fmt(Math.ceil(b.cost - S.ess)) + " more Essence."); } else toast("Glowspore Patch, level " + S.patch + ". Making " + fmt1(rate()) + "/s."); });
    $("hotP2").addEventListener("click", function () {
      if (eggReady()) { hatch(); return; }
      if (S.hatch) { tab("creature"); toast(S.egg ? "Your egg is incubating. " + clock(eggLeft()) + " left." : "Buy an egg in the Creature tab."); return; }
      tab("build"); toast(S.hq < 2 ? "Locked. Upgrade Swamp Hollow to level 2." : "Build the Hatchery here.");
    });
    document.addEventListener("visibilitychange", function () { if (document.hidden) save(true); else tick(); });
    addEventListener("pagehide", function () { save(true); });
  }

  // ---------- START ----------
  function init() {
    load();
    var gap = (Date.now() - S.seen) / 1000;   // time since the last save counts as time away
    lastTick = Date.now() - Math.min(Math.max(gap, 0), CFG.offlineCap) * 1000;
    eggSeen = !S.egg || eggReady();   // an egg that finished while you were away is just shown as ready
    var hd = document.querySelector("header"), setTop = function () { if (hd) $("evoStage").style.setProperty("--evo-top", hd.offsetHeight + "px"); };
    setTop(); addEventListener("resize", setTop);
    renderAll(); bind();
    var t = "build"; try { t = sessionStorage.getItem("evo-tab") || "build"; } catch (e) {} tab(t === "creature" || t === "realm" ? t : "build");
    tick();
    if (!S.tot && !S.patch) toast("Welcome! Pet " + S.crs[0].n + " to collect your first Essence.");
    else if (eggReady()) toast("Your egg is ready to hatch!", true);
    setInterval(tick, CFG.tickMs);
    setInterval(ambient, 1800);
  }
  if (typeof Crystals === "undefined" || typeof AV === "undefined") {
    var m = document.createElement("p"); m.textContent = "The game could not start because a shared script failed to load. Reload the page.";
    var st = document.getElementById("evoStage"); if (st) st.appendChild(m);
  } else init();
})();
