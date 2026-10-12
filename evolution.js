// ===== SwampRealms: Evolution (Stage 4: Realms - Ember Bog and Frostfen, cinematics, daily gifts, next-goal pill) =====
// Load AFTER cards.js, weapons.js, avatar.js, store.js, account.js, menu.js and evolution-fx.js (see evolution.html).
// Everything lives inside this function so it can never clash with the globals in cards.js / store.js (meta, save, KEY, CS ...).
//
// SAVING: progress is stored INSIDE the crystals save as CS.evo (localStorage "swamp-crystals-v1"), which already syncs with accounts.
// Swamp Coins and Swamp Crystals are NOT touched. "Swamp Essence" is this game's own resource.
// CS.evo = { v:4, ess, tot, taps, hq, patch, hatch, lamp, fert, fc, gc, bs, rl (realms unlocked 1-3), at (realm you are in), em, fr (landmark levels), ds, bd, dl, dc (daily gift streak, best, last day, claims),
//            crs:[{a:animalId, n:name, s:stage 0-2, m:mutation id}], egg:{a,t:startMs,d:seconds}|null, seen }
(function () {
  "use strict";

  // ---------- TUNING (change numbers here) ----------
  var CFG = {
    tickMs: 250,            // game loop
    saveMs: 10000,          // autosave (also saves on every purchase and when the tab is hidden)
    offlineCap: 7200,       // most seconds of production that count while away (2 hours). Egg timers use real time.
    welcomeMin: 30,         // show the "welcome back" message after this many seconds away
    backMin: 120,           // away this long (and 50+ Essence earned) and the welcome back becomes a full card
    stageBonus: [0.10, 0.20, 0.35],   // production bonus each creature gives, by evolution stage (Hatchling, Juvenile, Mighty)
    hqBonus: [0, 0.25, 0.6],     // production bonus by Swamp Hollow level (index = level - 1)
    patch: { max: 5, cost: [10, 60, 250, 1200, 5000], rate: [0.5, 1.5, 4, 10, 24] },   // Glowspore Patch: cost to reach each level, Essence per second at each level
    hq: { max: 3, cost: [0, 120, 3000] },                                  // Swamp Hollow: cost to reach each level (level 1 is free)
    hatch: { max: 1, cost: [150] },                                  // Hatchery: needs Swamp Hollow level 2
    egg: { cost: [100, 250, 600, 1500], secs: [30, 60, 120, 240] },  // by how many creatures you already own beyond the first
    evolve: { cost: [200, 900], needPatch: [0, 3] },                 // cost to reach Juvenile / Mighty; Mighty also needs a level 3 patch
    maxCreatures: 5,
    lamp: { max: 3, cost: [400, 1500, 6000] },      // Firefly Lantern (needs Hollow 2; level 3 needs Hollow 3)
    fertBonus: 0.04,        // Compost Heap: production bonus per level (endless, cost 6000 x 1.38^level)
    achBonus: 0.02,         // Swamp Journal: production bonus per entry
    dayTap: 2, nightSpore: 1.5, cycle: 240,   // day: taps x2; night: Glowspores x1.5 (see PH for phase lengths)
    fire: { gapDay: [30, 55], gapNight: [10, 20], life: 7, gold: 0.06, frenzy: 20, secs: 12, min: 5, chainMs: 9000, chainMax: 10 },   // fireflies
    realmBonus: 0.15,       // production bonus for each extra realm you unlock
    gift: { mult: [1, 1.2, 1.5, 2, 2.5, 3, 5], baseSecs: 90, min: 100, frenzy: 60, minTot: 100 }   // daily gift: Essence = max(min, 90 s of production) x mult[day]; day 7 also starts a 60 s Frenzy
  };
  var BIO = [   // realms. k = save key of the landmark level, lm.cost / lm.rate = per landmark level. Swamp has no landmark (it has the Patch).
    { id: "swamp", n: "Murkwater Swamp", tag: "Where it all began", c: "#4ee6b4", pad: ["#1c4a2c", "#2f6a37"] },
    { id: "ember", n: "Ember Bog", tag: "Hot springs and cinder blooms", c: "#ff8a3d", pad: ["#4a2418", "#8a4528"], k: "em", unlock: 25000, need: "Needs Swamp Hollow level 3 and Glowspore Patch level 5",
      lm: { n: "Cinder Geyser", max: 4, cost: [6000, 22000, 70000, 220000], rate: [40, 110, 280, 700] } },
    { id: "frost", n: "Frostfen", tag: "Aurora lights over frozen reeds", c: "#7fd6ff", pad: ["#5fa3c0", "#cdeefa"], k: "fr", unlock: 600000, need: "Needs Cinder Geyser level 2",
      lm: { n: "Aurora Lotus", max: 4, cost: [150000, 500000, 1600000, 5000000], rate: [500, 1400, 3600, 9000] } }
  ];
  var STAGES = ["Hatchling", "Juvenile", "Mighty"];
  var OUTFIT = [{}, { neck: "scarf" }, { hat: "crown", neck: "cape" }];   // gear drawn on the creature at each stage (avatar.js ids)
  var SLOTS = [[31, 51.4, 19], [4, 71, 12.5], [17.5, 71, 12.5], [51, 72, 12.5], [64, 72, 12.5]];   // scene spots for creatures: left %, top %, width %
  var NAMES = { hq: "Swamp Hollow", patch: "Glowspore Patch", hatch: "Hatchery", lamp: "Firefly Lantern", fert: "Compost Heap", em: "Cinder Geyser", fr: "Aurora Lotus" };
  var MUT = {   // permanent mutations, chosen when a creature becomes a Juvenile; values are [Juvenile, Mighty]
    glow: { n: "Glow-Skin", v: [0.12, 0.24], d: "+12% production (+24% when Mighty)" },
    grip: { n: "Strong Paws", v: [0.4, 0.8], d: "+40% tap power (+80% when Mighty)" },
    lucky: { n: "Lucky Charm", v: [0.5, 1], d: "+50% firefly rewards and more fireflies (+100% when Mighty)" },
    night: { n: "Night Owl", v: [0.3, 0.6], d: "+30% production at night (+60% when Mighty)" }
  };
  var PAIR = { frog: ["glow", "lucky"], donkey: ["grip", "glow"], owl: ["night", "lucky"], monkey: ["grip", "night"], elephant: ["glow", "night"] };
  var PH = [{ id: "day", n: "Day", len: 90 }, { id: "dusk", n: "Dusk", len: 30 }, { id: "night", n: "Night", len: 90 }, { id: "dawn", n: "Dawn", len: 30 }];

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var reduce = function () { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); };
  var fmt = function (n) { return Math.floor(n).toLocaleString("en-US"); };
  var fmt1 = function (n) { return (Math.round(n * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 1 }); };
  var fmtK = function (n) {   // compact for big numbers (costs, HUD)
    n = Math.floor(n); if (n < 1e6) return n.toLocaleString("en-US");
    var u = [["T", 1e12], ["B", 1e9], ["M", 1e6]];
    for (var i = 0; i < u.length; i++) if (n >= u[i][1]) { var v = n / u[i][1]; return (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10) + u[i][0]; }
    return String(n);
  };
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
        crs.push({ a: c.a, n: typeof c.n === "string" && c.n ? c.n.slice(0, 24) : first(c.a), s: Math.floor(num(c.s, 0, 0, 2)), m: (PAIR[c.a] || []).indexOf(c.m) > -1 && num(c.s, 0, 0, 2) >= 1 ? c.m : "" });
    });
    if (!crs.length) crs.push({ a: "frog", n: typeof o.cname === "string" && o.cname ? o.cname.slice(0, 24) : "Boggy", s: 0, m: "" });   // Stage 1 saves had one frog called cname
    var rl = Math.floor(num(o.rl, 1, 1, BIO.length));
    var e = o.egg, egg = null;
    if (e && typeof e === "object" && ids.indexOf(e.a) > -1 && !crs.some(function (x) { return x.a === e.a; }) && crs.length < CFG.maxCreatures)
      egg = { a: e.a, t: num(e.t, Date.now(), 0, 4e12), d: num(e.d, 30, 1, 86400) };
    return {
      v: 4,
      ess: num(o.ess, 0, 0, 1e15), tot: num(o.tot, 0, 0, 1e18), taps: Math.floor(num(o.taps, 0, 0, 1e9)),
      hq: Math.floor(num(o.hq, 1, 1, CFG.hq.max)), patch: Math.floor(num(o.patch, 0, 0, CFG.patch.max)),
      hatch: Math.floor(num(o.hatch, 0, 0, 1)) && Math.floor(num(o.hq, 1, 1, CFG.hq.max)) >= 2 ? 1 : 0,
      crs: crs, egg: egg, seen: num(o.seen, Date.now(), 0, 4e12),
      lamp: Math.floor(num(o.hq, 1, 1, CFG.hq.max)) >= 2 ? Math.floor(num(o.lamp, 0, 0, CFG.lamp.max)) : 0, fert: Math.floor(num(o.fert, 0, 0, 999)),
      fc: Math.floor(num(o.fc, 0, 0, 1e9)), gc: Math.floor(num(o.gc, 0, 0, 1e9)), bs: Math.floor(num(o.bs, 0, 0, CFG.fire.chainMax)),
      rl: rl, at: Math.floor(num(o.at, 0, 0, rl - 1)),
      em: rl >= 2 ? Math.floor(num(o.em, 0, 0, BIO[1].lm.max)) : 0, fr: rl >= 3 ? Math.floor(num(o.fr, 0, 0, BIO[2].lm.max)) : 0,
      ds: Math.floor(num(o.ds, 0, 0, 7)), bd: Math.floor(num(o.bd, 0, 0, 7)), dc: Math.floor(num(o.dc, 0, 0, 1e6)), dl: typeof o.dl === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.dl) ? o.dl : ""
    };
  }
  function load() { try { Crystals.reload(); S = clean(Crystals.state.evo); } catch (e) { S = clean(null); } }
  function save(force) {
    var now = Date.now();
    if (!force && now - lastSaveAt < 1500) return;      // never hammer the shared save
    try { S.seen = now; Crystals.reload(); Crystals.state.evo = S; Crystals.save(); lastSaveAt = now; dirty = false; } catch (e) {}
  }

  // ---------- RULES ----------
  var frenzyEnd = 0, chain = 0, lastCatch = 0, nextFire = 0, lastPh = "", achSeen = [], pickFor = null, entryDue = true, awayInfo = null, travelling = false, lastGiftCheck = 0;
  function fx() { return typeof EvoFX !== "undefined" ? EvoFX : null; }
  var frenzy = function () { return Date.now() < frenzyEnd; };
  function phase() {
    var t = (Date.now() / 1000) % CFG.cycle, acc = 0;
    for (var i = 0; i < PH.length; i++) { acc += PH[i].len; if (t < acc) return { id: PH[i].id, n: PH[i].n, left: acc - t }; }
    return { id: "day", n: "Day", left: 1 };
  }
  function mv(k) { return S.crs.reduce(function (t, c) { return t + (c.m === k && c.s >= 1 ? MUT[k].v[c.s - 1] : 0); }, 0); }   // total of one mutation across creatures
  var ACH = [
    { n: "Gentle Hands", d: "Pet 100 times", f: function () { return S.taps >= 100; } },
    { n: "Sore Fingers", d: "Pet 1,000 times", f: function () { return S.taps >= 1000; } },
    { n: "Spore Farmer", d: "Glowspore Patch level 3", f: function () { return S.patch >= 3; } },
    { n: "Fully Grown", d: "Glowspore Patch level 5", f: function () { return S.patch >= 5; } },
    { n: "Home Sweet Hollow", d: "Swamp Hollow level 3", f: function () { return S.hq >= 3; } },
    { n: "Full House", d: "Own all 5 creatures", f: function () { return S.crs.length >= 5; } },
    { n: "Mighty Friend", d: "Evolve a creature to Mighty", f: function () { return S.crs.some(function (c) { return c.s >= 2; }); } },
    { n: "Mutant Squad", d: "Give 3 creatures a mutation", f: function () { return S.crs.filter(function (c) { return c.m; }).length >= 3; } },
    { n: "Firefly Catcher", d: "Catch 10 fireflies", f: function () { return S.fc >= 10; } },
    { n: "Wisp Master", d: "Catch 100 fireflies", f: function () { return S.fc >= 100; } },
    { n: "Golden Touch", d: "Catch a golden firefly", f: function () { return S.gc >= 1; } },
    { n: "Chain Reaction", d: "Reach a 5 firefly chain", f: function () { return S.bs >= 5; } },
    { n: "Lantern Keeper", d: "Firefly Lantern level 3", f: function () { return S.lamp >= 3; } },
    { n: "Compost King", d: "Compost Heap level 10", f: function () { return S.fert >= 10; } },
    { n: "Swamp Tycoon", d: "Earn 100,000 Essence", f: function () { return S.tot >= 100000; } },
    { n: "Daily Habit", d: "Claim 3 daily gifts", f: function () { return S.dc >= 3; } },
    { n: "Week Streak", d: "Reach a 7 day gift streak", f: function () { return S.bd >= 7; } },
    { n: "Explorer", d: "Unlock Ember Bog", f: function () { return S.rl >= 2; } },
    { n: "Frostbitten", d: "Unlock Frostfen", f: function () { return S.rl >= 3; } },
    { n: "Geyser Keeper", d: "Cinder Geyser level 4", f: function () { return S.em >= 4; } },
    { n: "Lotus Bloom", d: "Aurora Lotus level 4", f: function () { return S.fr >= 4; } },
    { n: "Million Club", d: "Earn 1,000,000 Essence", f: function () { return S.tot >= 1000000; } }
  ];
  function achDone() { return ACH.filter(function (a) { return a.f(); }).map(function (a) { return a.n; }); }
  function achTick() {
    var d = achDone(); if (d.length <= achSeen.length) { achSeen = d; return; }
    var fresh = d.filter(function (n) { return achSeen.indexOf(n) < 0; }); achSeen = d;
    if (fresh.length) { toast("Journal: " + fresh[0] + "! +" + Math.round(CFG.achBonus * 100) + "% production", true); try { SFX.coin(); } catch (e) {} save(true); renderRealm(); }
  }
  function mult() { return 1 + (S.rl - 1) * CFG.realmBonus + CFG.hqBonus[S.hq - 1] + S.crs.reduce(function (t, c) { return t + CFG.stageBonus[c.s]; }, 0) + mv("glow") + achDone().length * CFG.achBonus + S.fert * CFG.fertBonus; }
  function boost() { return (frenzy() ? 2 : 1) * (phase().id === "night" ? CFG.nightSpore + mv("night") : 1); }
  function lmRate() { return (S.em ? BIO[1].lm.rate[S.em - 1] : 0) + (S.fr ? BIO[2].lm.rate[S.fr - 1] : 0); }
  function rateBase() { return ((S.patch ? CFG.patch.rate[S.patch - 1] : 0) + lmRate()) * mult(); }
  function rate() { return rateBase() * boost(); }
  function tapGain() { var b = (1 + (S.hq - 1) + S.patch + S.em * 4 + S.fr * 12) * (1 + mv("grip")); if (phase().id === "day") b *= CFG.dayTap; if (frenzy()) b *= 2; return Math.max(1, Math.round(b)); }
  function lvlOf(id) { return S[id]; }
  var DEF = { hq: CFG.hq, patch: CFG.patch, hatch: CFG.hatch, lamp: CFG.lamp, fert: { max: 999 }, em: BIO[1].lm, fr: BIO[2].lm };
  function costOf(id, l) { return id === "fert" ? Math.round(6000 * Math.pow(1.38, l)) : DEF[id].cost[l]; }

  function buildInfo(id) {   // the next purchase of a building: state is max | locked | ready | poor
    var lvl = lvlOf(id), c = DEF[id];
    if (lvl >= c.max) return { state: "max", lvl: lvl };
    var cost = costOf(id, lvl), why = "";
    if (id === "hq" && !S.patch) why = "Build the Glowspore Patch first";
    else if (id === "hq" && lvl >= 2 && S.patch < 4) why = "Grow the Glowspore Patch to level 4 first";
    else if (id === "patch" && lvl === 3 && S.hq < 2) why = "Upgrade Swamp Hollow to level 2 first";
    else if (id === "patch" && lvl === 4 && S.hq < 3) why = "Upgrade Swamp Hollow to level 3 first";
    else if (id === "hatch" && S.hq < 2) why = "Upgrade Swamp Hollow to level 2 first";
    else if (id === "lamp" && lvl === 0 && S.hq < 2) why = "Upgrade Swamp Hollow to level 2 first";
    else if (id === "lamp" && lvl === 2 && S.hq < 3) why = "Upgrade Swamp Hollow to level 3 first";
    else if (id === "fert" && S.patch < 5) why = "Grow the Glowspore Patch to level 5 first";
    else if (id === "em" && S.rl < 2) why = "Unlock Ember Bog first";
    else if (id === "fr" && S.rl < 3) why = "Unlock Frostfen first";
    if (why) return { state: "locked", lvl: lvl, cost: cost, why: why };
    return { state: S.ess >= cost ? "ready" : "poor", lvl: lvl, cost: cost };
  }
  function buy(id) {
    var b = buildInfo(id);
    if (b.state !== "ready") { toast(b.state === "locked" ? b.why : b.state === "max" ? "Already at the highest level for now." : "Not enough Swamp Essence yet."); return; }
    S.ess -= b.cost; S[id]++;
    var msg = S[id] === 1 && id !== "hq" && id !== "fert" ? NAMES[id] + " built!" : NAMES[id] + " upgraded to level " + S[id] + "!";
    var spot = id === "hq" ? "hq" : id === "patch" || id === "fert" ? "p1" : id === "lamp" ? "lamp" : id === "em" || id === "fr" ? "lm" : "p2";
    if ((id === "em" || id === "fr") && S.at !== (id === "em" ? 1 : 2)) spot = "p1";
    flashScene(spot); burst(spot); chipRes(-b.cost); toast(msg, true);
    if (S[id] > 1 && fx()) fx().atmo.burst(SPOTS[spot][0], SPOTS[spot][1], BIO[S.at].c, 20);
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
    var a = aniOf(S.egg.a); S.crs.push({ a: a.id, n: first(a.id), s: 0, m: "" }); S.egg = null; eggSeen = true;
    var nc = S.crs[S.crs.length - 1];
    save(true); renderAll();
    var el = document.querySelector('.evo-cr[data-c="' + (S.crs.length - 1) + '"]'); if (el) hop(el);
    if (fx()) {
      fx().cine($("evoStage"), { kind: "hatch", color: "#f2c14e", art: crArt(nc), kicker: "New friend", title: a.name + " hatched!", sub: "A new swamp friend joins your realm.",
        lines: ["Adds +" + Math.round(CFG.stageBonus[0] * 100) + "% production", "Evolve it to grow stronger"], btn: "Say hello",
        sound: function () { SFX.charge(); setTimeout(function () { SFX.tear(); }, 1050); setTimeout(function () { SFX.open("Epic"); }, 1200); } });
    } else { burst("p2"); toast(a.name + " hatched!", true); try { SFX.open("Epic"); } catch (x) {} }
  }

  // evolution
  function evoInfo(i) {
    var c = S.crs[i];
    if (c.s >= 2) return { state: "max" };
    var cost = CFG.evolve.cost[c.s], np = CFG.evolve.needPatch[c.s];
    if (S.patch < np) return { state: "locked", cost: cost, why: "Needs Glowspore Patch level " + np };
    return { state: S.ess >= cost ? "ready" : "poor", cost: cost };
  }
  function evolve(i, m) {
    var c = S.crs[i], b = c && evoInfo(i);
    if (!c || b.state !== "ready") { toast(!c ? "" : b.state === "locked" ? b.why : b.state === "max" ? c.n + " is fully evolved." : "Not enough Swamp Essence yet."); return; }
    if (c.s === 0 && !m) { openPick(i, true); return; }   // the first evolution asks for a mutation
    S.ess -= b.cost; c.s++; if (m) c.m = m;
    closePick();
    chipRes(-b.cost);
    save(true); renderAll();
    burst([(SLOTS[i][0] + SLOTS[i][2] / 2) / 100, (SLOTS[i][1] + 6) / 100]);
    var el = document.querySelector('.evo-cr[data-c="' + i + '"]'); if (el) hop(el);
    if (fx()) {
      var au = aura(c), mighty = c.s >= 2, ln = ["Production bonus is now +" + Math.round(CFG.stageBonus[c.s] * 100) + "%"];
      if (m) ln.push(MUT[m].n + ": " + MUT[m].d);
      fx().cine($("evoStage"), { kind: "evolve", color: mighty ? "#f2c14e" : "#4ee6b4", art: '<span class="cn-aura"' + (au ? ' style="--aura:' + au + '"' : "") + '>' + crArt(c) + '</span>',
        kicker: "Evolved", title: c.n + " is " + (mighty ? "Mighty!" : "a Juvenile!"), sub: STAGES[c.s] + " " + esc(kind(c.a)), lines: ln, btn: "Awesome!",
        sound: function () { SFX.charge(); setTimeout(function () { SFX.open(mighty ? "Legendary" : "Epic"); }, 800); } });
    } else { toast(c.n + " evolved into a " + STAGES[c.s] + " " + kind(c.a) + "!", true); try { SFX.streak(); } catch (x) {} }
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
    var gain = away > 6 ? rateBase() * dt * 1.1 : rate() * dt;   // away: no day/night or Frenzy, a small flat bonus instead
    if (gain > 0) { S.ess += gain; S.tot += gain; dirty = true; }
    if (away >= CFG.backMin && gain >= 50) { awayInfo = { gain: gain, secs: Math.min(away, CFG.offlineCap) }; entryDue = true; }
    else if (away >= CFG.welcomeMin && gain >= 1) toast("Welcome back! Your swamp collected " + fmtK(gain) + " Essence while you were away.");
    if (!entryDue && now - lastGiftCheck > 60000) { lastGiftCheck = now; if (S.tot >= CFG.gift.minTot && giftInfo().due) entryDue = true; }
    if (entryDue) entry();
    if (S.egg && !eggSeen && eggReady()) {   // the egg just finished
      eggSeen = true; toast("Your egg is ready to hatch!", true); try { SFX.coin(); } catch (e) {}
      paintScene(); renderCreature(); renderRealm();
    }
    fireTick(); achTick();
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
    $("evoEss").textContent = S.ess >= 1e7 ? fmtK(S.ess) : fmt(S.ess);
    var r = rate();
    $("evoRate").textContent = "+" + (r >= 1e5 ? fmtK(r) : fmt1(r)) + "/s"; $("evoRate").classList.toggle("off", !r);
    $("evoMult").textContent = "+" + Math.round((mult() - 1) * 100) + "% bonus";
    paintPhase();
  }
  function paintPhase() {
    var p = phase(), sc = $("evoScene"), now = Date.now();
    if (sc.getAttribute("data-ph") !== p.id) sc.setAttribute("data-ph", p.id);
    var txt = p.n + (p.id === "day" ? " · taps x" + CFG.dayTap : p.id === "night" ? " · output x" + (CFG.nightSpore + mv("night")).toFixed(1) : ""), t = $("evoPhase");
    if (t.textContent !== txt) t.textContent = txt;
    if (lastPh && lastPh !== p.id && (p.id === "night" || p.id === "day")) toast(p.id === "night" ? "Night falls. Glowspores glow and fireflies come out." : "The sun rises. Your taps are twice as strong.");
    lastPh = p.id;
    var fz = $("evoFz");
    if (frenzy()) { fz.hidden = false; fz.textContent = "Frenzy x2 · " + Math.ceil((frenzyEnd - now) / 1000) + "s"; }
    else if (chain > 1 && now - lastCatch < CFG.fire.chainMs) { fz.hidden = false; fz.textContent = "Chain x" + chain; }
    else fz.hidden = true;
  }

  // ---------- FIREFLIES ----------
  function fireGap() {
    var g = phase().id === "night" ? CFG.fire.gapNight : CFG.fire.gapDay, k = 1 - 0.2 * S.lamp - Math.min(0.3, mv("lucky") * 0.2);
    return (g[0] + Math.random() * (g[1] - g[0])) * k * 1000;
  }
  function spawnWisp(delay) {
    setTimeout(function () {
      var sc = $("evoScene"); if (!sc || document.hidden) return;
      var gold = Math.random() < CFG.fire.gold + 0.04 * S.lamp, dir = Math.random() < 0.5, dur = CFG.fire.life + Math.random() * 2;
      var el = document.createElement("button"); el.type = "button"; el.className = "evo-wisp" + (gold ? " gold" : ""); el.dataset.gold = gold ? "1" : "";
      el.setAttribute("aria-label", gold ? "Golden firefly. Tap to catch it." : "Firefly. Tap to catch it.");
      el.style.setProperty("--y", (12 + Math.random() * 36) + "%"); el.style.setProperty("--x0", dir ? "-8%" : "98%"); el.style.setProperty("--x1", dir ? "98%" : "-8%"); el.style.setProperty("--dur", dur + "s");
      el.innerHTML = "<i></i>"; sc.appendChild(el);
      el._t = setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, dur * 1000 + 300);
    }, delay || 0);
  }
  function fireTick() {
    var now = Date.now(); if (document.hidden || S.tot < 25) return;
    if (!nextFire) { nextFire = now + fireGap(); return; }
    if (now < nextFire) return;
    if (document.querySelectorAll(".evo-wisp").length >= 4) { nextFire = now + 3000; return; }
    var swarm = phase().id === "night" && Math.random() < 0.3, n = swarm ? 3 : 1;
    for (var i = 0; i < n; i++) spawnWisp(i * 700);
    if (swarm) toast("A swarm of fireflies drifts by!");
    nextFire = now + fireGap();
  }
  function catchWisp(el) {
    var gold = !!el.dataset.gold, now = Date.now(), sc = $("evoScene"), r = sc.getBoundingClientRect(), w = el.getBoundingClientRect();
    var x = w.left + w.width / 2 - r.left, y = w.top + w.height / 2 - r.top;
    chain = (chain > 0 && now - lastCatch < CFG.fire.chainMs) ? Math.min(CFG.fire.chainMax, chain + 1) : 1; lastCatch = now;
    var base = Math.max(CFG.fire.min, rateBase() * CFG.fire.secs + tapGain() * 3);
    var g = Math.round(base * (1 + 0.1 * (chain - 1)) * (1 + mv("lucky")) * (gold ? 3 : 1));
    S.ess += g; S.tot += g; S.fc++; if (gold) S.gc++; if (chain > S.bs) S.bs = chain; dirty = true;
    clearTimeout(el._t); if (el.parentNode) el.parentNode.removeChild(el);
    floatText(x, y, "+" + fmt(g), "gold"); if (chain > 1) floatText(x, y - 24, "Chain x" + chain, "mint");
    burst([x / r.width, y / r.height]);
    if (gold) {
      var secs = CFG.fire.frenzy + 5 * S.lamp; frenzyEnd = now + secs * 1000;
      toast("Golden firefly! Frenzy: double production for " + secs + "s.", true); try { SFX.open("Epic"); } catch (e) {}
    } else { try { SFX.coin(); } catch (e) {} }
    paintRes(); refresh();
  }

  // ---------- MUTATION PICKER ----------
  function openPick(i, evo) {
    var c = S.crs[i], box = $("evoPick"); if (!c || !box) return;
    pickFor = { i: i, evo: !!evo };
    box.innerHTML = '<div class="evo-pick-box" role="document"><h3>Mutate ' + esc(c.n) + '</h3><p>Choose one trait. It is permanent and grows stronger when ' + esc(c.n) + ' becomes Mighty.' + (evo ? " Evolving costs " + fmt(CFG.evolve.cost[0]) + " Essence." : "") + '</p>' +
      (PAIR[c.a] || []).map(function (k) { return '<button type="button" class="evo-opt m-' + k + '" data-pick="' + k + '"><b>' + MUT[k].n + '</b><span>' + MUT[k].d + '</span></button>'; }).join("") +
      '<button type="button" class="btn ghost" data-pickx>Not now</button></div>';
    box.hidden = false;
    var f = box.querySelector(".evo-opt"); if (f) f.focus();
  }
  function closePick() { var box = $("evoPick"); if (box) { box.hidden = true; box.innerHTML = ""; } pickFor = null; }
  function chooseMut(k) {
    if (!pickFor) return; var i = pickFor.i, evo = pickFor.evo, c = S.crs[i];
    if (!c || (PAIR[c.a] || []).indexOf(k) < 0) { closePick(); return; }
    if (evo) { evolve(i, k); return; }   // evolve() closes the picker itself
    if (c.m || c.s < 1) { closePick(); return; }
    c.m = k; closePick(); toast(c.n + " mutated: " + MUT[k].n + "!", true); try { SFX.open("Epic"); } catch (e) {}
    save(true); renderAll();
  }
  function pop() { try { HudFX.pop($("evoEss")); } catch (e) {} }
  function chipRes(d) { try { HudFX.chip($("evoCount"), d, "gold", "below"); } catch (e) {} pop(); }
  function floatText(x, y, text, k, quiet) {
    if (reduce() && quiet) return;
    var sc = $("evoScene"), el = document.createElement("i");
    el.className = "evo-float " + (k || "gold"); el.textContent = text; el.style.left = x + "px"; el.style.top = y + "px"; el.setAttribute("aria-hidden", "true");
    sc.appendChild(el); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1200);
  }
  var SPOTS = { hq: [0.17, 0.544], p1: [0.6, 0.62], p2: [0.86, 0.62], lamp: [0.515, 0.5], lm: [0.75, 0.56] };
  function burst(where) {
    if (reduce()) return;
    var sc = $("evoScene"), r = sc.getBoundingClientRect(), p = typeof where === "string" ? SPOTS[where] : where;
    if (fx()) { fx().atmo.burst(p[0], p[1], BIO[S.at].c, 30); return; }
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
  function padsSVG(c1, c2) {   // the little platforms under each creature (same math for every realm)
    var o = "";
    SLOTS.forEach(function (s, i) { if (i < S.crs.length) o += '<ellipse cx="' + ((s[0] + s[2] / 2) * 4) + '" cy="' + (s[1] * 3.4 - 50 + s[2] * 3.3) + '" rx="' + (s[2] * 2.3) + '" ry="' + (s[2] * .75) + '" fill="' + c1 + '" opacity=".9"/><ellipse cx="' + ((s[0] + s[2] / 2) * 4) + '" cy="' + (s[1] * 3.4 - 52 + s[2] * 3.3) + '" rx="' + (s[2] * 2.1) + '" ry="' + (s[2] * .6) + '" fill="' + c2 + '" opacity=".9"/>'; });
    return o;
  }
  function sceneSVG() {
    var hq2 = S.hq >= 2, p = S.patch;
    var shrooms = "";
    if (p) {
      var pts = [[232, 170, 1], [248, 176, 1.15], [262, 169, .9], [240, 160, .8], [256, 158, 1], [226, 178, .7], [270, 178, .75], [218, 172, .8], [278, 172, .8], [252, 182, .9]], n = 2 + p * 2;
      for (var i = 0; i < Math.min(n, pts.length); i++) {
        var q = pts[i];
        shrooms += '<g transform="translate(' + q[0] + ' ' + q[1] + ') scale(' + q[2] + ')" class="evo-shroom" style="animation-delay:' + (i * .35) + 's"><rect x="-1.5" y="-2" width="3" height="10" rx="1.5" fill="#cfeee2"/><path d="M-9 -1a9 8 0 0118 0z" fill="url(#gP)"/><circle cx="-3" cy="-5" r="1.3" fill="#e9fff7" opacity=".8"/><circle cx="3" cy="-3" r="1" fill="#e9fff7" opacity=".7"/></g>';
      }
      if (p >= 5) shrooms += '<g transform="translate(224 150) scale(.7)"><path d="M0 -16l7 10-4 14h-6l-4-14z" fill="#ffe08a" opacity=".9"/></g>';
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
    var lampG = "";
    if (S.lamp) lampG = '<g transform="translate(206 182)"><ellipse cx="0" cy="2" rx="13" ry="4" fill="#16301f"/><rect x="-1.5" y="-56" width="3" height="58" rx="1.5" fill="#6b4a2a"/><path d="M-9 -58h18l-3-9h-12z" fill="#2c6b3a"/><rect x="-6" y="-58" width="12" height="12" rx="3" fill="#f2c14e" opacity=".9"/><circle class="evo-lamp" cx="0" cy="-52" r="' + (16 + S.lamp * 8) + '" fill="url(#gGlow2)" opacity=".75"/></g>';
    var pads = padsSVG(BIO[0].pad[0], BIO[0].pad[1]);
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
      hq + plot1 + plot2 + lampG + pads +
      '<g fill="#7fd36a" opacity=".85"><path d="M8 190q2-22 6-26-1 16 4 26zM392 196q-2-22-6-26 1 16-4 26zM178 250q2-18 5-22-1 14 3 22z"/></g>' + flies +
      '<ellipse class="evo-mist" cx="120" cy="196" rx="150" ry="14" fill="#bff5e2" opacity=".07"/></g></svg>';
  }
  function paintScene() {
    var bio = BIO[S.at], st = $("evoStage"), sc = $("evoScene");
    st.setAttribute("data-bio", bio.id); sc.setAttribute("data-bio", bio.id); st.style.setProperty("--bc", bio.c);
    $("evoArt").innerHTML = bio.id === "swamp" || !fx() ? sceneSVG() : fx().biomeSVG(bio.id, { lm: S[bio.k], pads: padsSVG(bio.pad[0], bio.pad[1]) });
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
      return '<button type="button" class="evo-cr s' + c.s + '" data-c="' + i + '" style="left:' + s[0] + '%;top:' + s[1] + '%;width:' + s[2] + '%" aria-label="Pet ' + esc(c.n) + ' the ' + STAGES[c.s] + ' ' + esc(kind(c.a)) + ' to collect Swamp Essence"><span class="evo-cr-art"' + (au ? ' style="--aura:' + au + '"' : "") + '>' + crArt(c) + '</span>' + (c.m ? '<span class="evo-mdot m-' + c.m + '" aria-hidden="true"></span>' : "") + (i === 0 ? '<span class="evo-cr-tip">Tap to pet</span>' : "") + '</button>';
    }).join("");
  }

  // ---------- PANELS ----------
  var pips = function (n, max) { var h = '<div class="evo-pips" aria-hidden="true">'; for (var i = 0; i < max; i++) h += '<i' + (i < n ? ' class="on"' : '') + '></i>'; return h + '</div>'; };
  function btnFor(id) {
    var b = buildInfo(id);
    if (b.state === "max") return '<button type="button" class="btn ghost" disabled>' + (id === "hatch" ? "Built" : "Max level") + '</button>';
    var label = (lvlOf(id) ? "Upgrade" : "Build") + ' <span class="evo-c"><span class="evo-orb sm" aria-hidden="true"></span>' + fmtK(b.cost) + '</span>';
    if (b.state === "locked") return '<button type="button" class="btn ghost" data-buy="' + id + '" disabled>' + label + '</button><p class="evo-need">' + esc(b.why) + '</p>';
    return '<button type="button" class="btn" data-buy="' + id + '"' + (b.state === "ready" ? "" : " disabled") + '>' + label + '</button><div class="evo-bar2" data-prog="' + id + '"><i></i></div><p class="evo-need" data-need="' + id + '"></p>';
  }
  function renderBuild() {
    var p = S.patch, nextRate = p && p < CFG.patch.max ? CFG.patch.rate[p] * mult() : 0, h = "";
    h += '<article class="evo-card' + (S.hq >= CFG.hq.max ? " done" : "") + '"><div class="evo-ic hq" aria-hidden="true"></div><div class="evo-info"><h3>Swamp Hollow <em>Lv ' + S.hq + '/' + CFG.hq.max + '</em></h3><p>Your headquarters. Level 2: +25% production, stronger taps, opens the Hatchery and Lantern. Level 3: +60%.</p>' + pips(S.hq, CFG.hq.max) + '</div><div class="evo-act">' + btnFor("hq") + '</div></article>';
    h += '<article class="evo-card' + (p >= CFG.patch.max ? " done" : "") + '"><div class="evo-ic patch" aria-hidden="true"></div><div class="evo-info"><h3>Glowspore Patch <em>' + (p ? "Lv " + p + "/" + CFG.patch.max : "Not built") + '</em></h3><p>' +
      (p ? "Makes " + fmt1(rate()) + " Essence per second." + (nextRate ? " Next level: " + fmt1(nextRate) + "/s." : " Fully grown!") : "Your starter plot is empty. Build a patch to make Essence on its own.") + '</p>' + pips(p, CFG.patch.max) + '</div><div class="evo-act">' + btnFor("patch") + '</div></article>';
    h += '<article class="evo-card' + (S.hatch ? " done" : S.hq < 2 ? " locked" : "") + '"><div class="evo-ic ' + (S.hatch ? "egg" : S.hq < 2 ? "lock" : "plot") + '" aria-hidden="true"></div><div class="evo-info"><h3>Hatchery <em>' + (S.hatch ? "Built" : S.hq < 2 ? "Locked" : "Not built") + '</em></h3><p>' +
      (S.hatch ? "Buy eggs and hatch new creatures in the Creature tab." : "A nest on your second plot where eggs hatch into new swamp friends.") + '</p></div><div class="evo-act">' + btnFor("hatch") + '</div></article>';
    var lb = S.lamp ? "Lv " + S.lamp + "/" + CFG.lamp.max : S.hq < 2 ? "Locked" : "Not built";
    h += '<article class="evo-card' + (S.lamp >= CFG.lamp.max ? " done" : S.hq < 2 ? " locked" : "") + '"><div class="evo-ic lamp" aria-hidden="true"></div><div class="evo-info"><h3>Firefly Lantern <em>' + lb + '</em></h3><p>Calls fireflies faster, makes golden ones more common and stretches Frenzy. Tap fireflies for Essence.</p>' + pips(S.lamp, CFG.lamp.max) + '</div><div class="evo-act">' + btnFor("lamp") + '</div></article>';
    h += '<article class="evo-card' + (S.patch < 5 ? " locked" : "") + '"><div class="evo-ic fert" aria-hidden="true"></div><div class="evo-info"><h3>Compost Heap <em>' + (S.fert ? "Lv " + S.fert : S.patch < 5 ? "Locked" : "Endless") + '</em></h3><p>Rich compost for the whole swamp. Every level adds +' + Math.round(CFG.fertBonus * 100) + '% production, forever.</p></div><div class="evo-act">' + btnFor("fert") + '</div></article>';
    $("pane-build").innerHTML = h;
  }
  function eggCard() {
    var e = eggInfo(), n = S.crs.length, h;
    if (e.state === "nohatch") return '<article class="evo-card locked"><div class="evo-ic lock" aria-hidden="true"></div><div class="evo-info"><h3>Eggs <em>Locked</em></h3><p>' + (S.hq < 2 ? "Upgrade Swamp Hollow to level 2, then build the Hatchery." : "Build the Hatchery in the Build tab to hatch new creatures.") + '</p></div></article>';
    if (e.state === "full") return '<article class="evo-card done"><div class="evo-ic egg" aria-hidden="true"></div><div class="evo-info"><h3>Collection complete</h3><p>You have hatched every swamp creature. Evolve them to boost your production.</p></div></article>';
    if (e.state === "ready") return '<article class="evo-card done"><div class="evo-ic egg ready" aria-hidden="true"></div><div class="evo-info"><h3>Egg ready! <em>Mystery</em></h3><p>Something is moving inside. Tap hatch to meet it.</p></div><div class="evo-act"><button type="button" class="btn ready" data-hatch>Hatch egg</button></div></article>';
    if (e.state === "inc") return '<article class="evo-card"><div class="evo-ic egg" aria-hidden="true"></div><div class="evo-info"><h3>Incubating <em data-eggtime></em></h3><p>Your egg is warming up in the Hatchery. It keeps hatching while you are away.</p></div><div class="evo-act"><div class="evo-bar2" data-eggbar><i></i></div></div></article>';
    return '<article class="evo-card"><div class="evo-ic egg" aria-hidden="true"></div><div class="evo-info"><h3>Mystery egg <em>' + n + '/' + CFG.maxCreatures + ' creatures</em></h3><p>Place an egg in the Hatchery. It hatches into a swamp friend you do not have yet in ' + clock(e.secs) + '.</p></div><div class="evo-act"><button type="button" class="btn" data-egg disabled>Buy egg <span class="evo-c"><span class="evo-orb sm" aria-hidden="true"></span>' + fmtK(e.cost) + '</span></button><div class="evo-bar2" data-prog="egg"><i></i></div><p class="evo-need" data-need="egg"></p></div></article>';
  }
  function renderCreature() {
    var h = eggCard();
    S.crs.forEach(function (c, i) {
      var b = evoInfo(i), au = aura(c), bonus = Math.round(CFG.stageBonus[c.s] * 100);
      var act = b.state === "max" ? '<button type="button" class="btn ghost" disabled>Fully evolved</button>'
        : b.state === "locked" ? '<button type="button" class="btn ghost" data-evolve="' + i + '" disabled>Evolve <span class="evo-c"><span class="evo-orb sm" aria-hidden="true"></span>' + fmtK(b.cost) + '</span></button><p class="evo-need">' + esc(b.why) + '</p>'
        : '<button type="button" class="btn" data-evolve="' + i + '" disabled>Evolve to ' + STAGES[c.s + 1] + ' <span class="evo-c"><span class="evo-orb sm" aria-hidden="true"></span>' + fmtK(b.cost) + '</span></button><div class="evo-bar2" data-prog="evo' + i + '"><i></i></div><p class="evo-need" data-need="evo' + i + '"></p>';
      if (c.s >= 1 && !c.m) act += '<button type="button" class="btn ready" data-mut="' + i + '">Choose mutation</button>';
      var mt = c.m ? '<span class="evo-mut m-' + c.m + '">' + MUT[c.m].n + '</span><p class="evo-mdesc">' + MUT[c.m].d + '</p>' : '<span class="evo-mut">' + (c.s ? "No mutation yet" : "Mutates when it evolves") + '</span>';
      h += '<article class="evo-card creature' + (b.state === "max" ? " done" : "") + '"><div class="evo-cav"' + (au ? ' style="--aura:' + au + '"' : "") + ' aria-hidden="true">' + crArt(c) + '</div><div class="evo-info"><h3>' + esc(c.n) + ' the ' + esc(kind(c.a)) + ' <em>' + STAGES[c.s] + '</em></h3><p>Stage ' + (c.s + 1) + ' of 3. Adds +' + bonus + '% production' + (c.s < 2 ? ", +" + Math.round(CFG.stageBonus[c.s + 1] * 100) + "% when evolved." : ". Fully grown!") + '</p>' + pips(c.s + 1, 3) + mt + '</div><div class="evo-act">' + act + '</div></article>';
    });
    if (S.crs.length < 2 && S.hatch) h += '<article class="evo-card empty"><div class="evo-ic plot" aria-hidden="true"></div><div class="evo-info"><h3>Empty spot <em>Open</em></h3><p>Hatch an egg to fill this spot.</p></div></article>';
    $("pane-creature").innerHTML = h;
  }
  function renderRealm() {
    var goals = [["Build the Glowspore Patch", S.patch >= 1], ["Upgrade the patch to level " + CFG.patch.max, S.patch >= CFG.patch.max], ["Upgrade Swamp Hollow to level " + CFG.hq.max, S.hq >= CFG.hq.max],
      ["Build the Hatchery", !!S.hatch], ["Hatch a second creature", S.crs.length >= 2], ["Evolve a creature", S.crs.some(function (c) { return c.s >= 1; })], ["Build the Firefly Lantern", S.lamp >= 1], ["Unlock Ember Bog", S.rl >= 2], ["Unlock Frostfen", S.rl >= 3]];
    var all = goals.every(function (g) { return g[1]; }), dn = goals.filter(function (g) { return g[1]; }).length, jn = achDone().length, ph = phase();
    var tile = function (v, l, k) { return '<div class="evo-tile ' + (k || "") + '"><b>' + v + '</b><span>' + l + '</span></div>'; };
    var gi = giftInfo(), h = '';
    h += '<article class="evo-card gift' + (gi.due ? "" : " done") + '"><div class="evo-info"><h3>Daily Swamp Gift <em>' + (gi.due ? "Ready" : "Streak " + S.ds + "/7") + '</em></h3><p>' +
      (gi.due ? "Day " + gi.day + " of 7: " + fmtK(gi.amt) + " Essence" + (gi.day === 7 ? " and a 1 minute Frenzy" : "") + ". Come back every day to keep your streak going." : "Claimed today. Come back tomorrow for day " + (S.ds >= 7 ? 1 : S.ds + 1) + ".") + '</p>' + pips(S.ds, 7) + '</div>' +
      (gi.due ? '<div class="evo-act"><button type="button" class="btn ready" data-gift>Open gift</button></div>' : "") + '</article>';
    h += '<section class="evo-tiles" aria-label="Realm stats">' + tile(fmt1(rate()), "Essence per second", "mint") + tile("+" + Math.round((mult() - 1) * 100) + "%", "Production bonus", "gold") + tile(fmt(S.tot), "Earned, all time") + tile(S.crs.length + "/" + CFG.maxCreatures, "Creatures") + tile(fmt(S.fc), "Fireflies caught") + tile("x" + S.bs, "Best chain") + '</section>';
    h += '<article class="evo-card"><div class="evo-info"><h3>Swamp rhythm <em>' + ph.n + '</em></h3><p><b>Day:</b> taps are twice as strong. <b>Night:</b> everything you make is 50% bigger and fireflies come out. Chain fireflies for more Essence; a golden one starts a Frenzy.</p></div></article>';
    h += '<article class="evo-card' + (jn === ACH.length ? " done" : "") + '"><div class="evo-info"><h3>Swamp Journal <em>' + jn + '/' + ACH.length + '</em></h3><p>Every entry adds +' + Math.round(CFG.achBonus * 100) + '% production.</p><ul class="evo-badges">' + ACH.map(function (a) { return '<li class="' + (a.f() ? "ok" : "") + '"><i aria-hidden="true"></i><span>' + esc(a.n) + '<small>' + esc(a.d) + '</small></span></li>'; }).join("") + '</ul></div></article>';
    h += '<article class="evo-card' + (all ? " done" : "") + '"><div class="evo-info"><h3>First steps <em>' + dn + '/' + goals.length + '</em></h3><ul class="evo-goals">' + goals.map(function (g) { return '<li class="' + (g[1] ? "ok" : "") + '"><i aria-hidden="true"></i>' + esc(g[0]) + '</li>'; }).join("") + '</ul>' +
      (all ? '<p class="evo-win">All first steps complete! Your realm is thriving. Bosses and prestige are coming next.</p>' : '<p>Finish these to complete the first stage of your realm.</p>') + '</div></article>';
    h += '<p class="evo-fine">Progress is saved on this device and in your account when you are signed in. <button type="button" class="evo-link" data-reset>Start over</button></p>';
    $("pane-realm").innerHTML = h;
  }
  function renderAll() { paintRes(); paintScene(); paintCreatures(); renderBuild(); renderCreature(); renderWorlds(); renderRealm(); refresh(); }

  // light update every tick: buttons enable themselves and bars fill, without rebuilding the DOM under a pressed finger
  function bar(key, have, cost) {
    var f = document.querySelector('[data-prog="' + key + '"] i'); if (f) f.style.width = Math.min(100, have / cost * 100) + "%";
    var n = document.querySelector('[data-need="' + key + '"]'); if (n) n.textContent = have >= cost ? "Ready!" : "Need " + fmtK(Math.ceil(cost - have)) + " more Essence";
  }
  function refresh() {
    ["hq", "patch", "hatch", "lamp", "fert", "em", "fr"].forEach(function (id) {
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
    for (var ri = 1; ri < BIO.length; ri++) {
      var rb = realmInfo(ri), rbtn = document.querySelector('[data-unlock="' + ri + '"]');
      if (rb.state === "ready" || rb.state === "poor") { if (rbtn) { rbtn.disabled = rb.state !== "ready"; rbtn.classList.toggle("ready", rb.state === "ready"); } bar("rl" + ri, S.ess, rb.cost); }
    }
    paintGoal(); paintDots();
    var lmc = $("hotLm"); if (lmc) { var lid = BIO[S.at].k; lmc.classList.toggle("can", !!lid && buildInfo(lid).state === "ready"); lmc.setAttribute("data-tip", S[lid] ? "Upgrade" : "Build"); }
    var h1 = $("hotP1"), h2 = $("hotP2");
    h1.classList.toggle("can", !S.patch && buildInfo("patch").state === "ready"); h1.setAttribute("data-tip", "Build");
    var hatchCan = eggReady(), buildCan = !S.hatch && S.hq >= 2 && buildInfo("hatch").state === "ready";
    h2.classList.toggle("can", hatchCan || buildCan); h2.setAttribute("data-tip", hatchCan ? "Hatch!" : "Build");
  }


  // ---------- REALMS, DAILY GIFT, NEXT GOAL, ENTRY CARDS ----------
  function realmInfo(i) {
    var b = BIO[i]; if (i < S.rl) return { state: "owned" };
    if (i > S.rl) return { state: "locked", why: "Unlock " + BIO[i - 1].n + " first", cost: b.unlock };
    var ok = i === 1 ? (S.hq >= 3 && S.patch >= 5) : S.em >= 2;
    if (!ok) return { state: "locked", why: b.need, cost: b.unlock };
    return { state: S.ess >= b.unlock ? "ready" : "poor", cost: b.unlock };
  }
  function unlockRealm(i) {
    var b = BIO[i], r = realmInfo(i);
    if (r.state !== "ready") { toast(r.state === "locked" ? r.why : r.state === "owned" ? "Already unlocked." : "Not enough Swamp Essence yet."); return; }
    S.ess -= r.cost; S.rl = i + 1; chipRes(-r.cost); save(true); renderAll();
    var go = function () { travel(i); };
    if (fx()) fx().cine($("evoStage"), { kind: "realm", color: b.c, art: '<span class="cn-orbm t-' + b.id + '"></span>', kicker: "New realm discovered", title: b.n, sub: esc(b.tag),
      lines: ["+" + Math.round(CFG.realmBonus * 100) + "% production, forever", "Build the " + b.lm.n + " to make " + fmtK(b.lm.rate[0]) + "+ Essence per second"], btn: "Travel there", btn2: "Later", onGo: go,
      sound: function () { SFX.rise(); setTimeout(function () { SFX.open("Legendary"); }, 700); } });
    else { toast(b.n + " unlocked!", true); go(); }
  }
  function travel(i) {
    if (travelling || i === S.at || i >= S.rl) return;
    var b = BIO[i], sc = $("evoScene");
    var go = function () { S.at = i; paintScene(); paintCreatures(); renderWorlds(); if (fx()) fx().atmo.set(b.id); save(true); refresh(); };
    if (!fx()) { go(); toast("Travelled to " + b.n + "."); return; }
    travelling = true; try { SFX.rise(); } catch (e) {}
    fx().iris(sc, b.c, go);
    setTimeout(function () { fx().zone(sc, b.n, b.tag, b.c); travelling = false; }, fx().reduce() ? 50 : 1300);
  }
  function renderWorlds() {
    var h = '';
    BIO.forEach(function (b, i) {
      var r = i === 0 ? { state: "owned" } : realmInfo(i), here = i === S.at, owned = r.state === "owned", lm = b.lm, act = "", info = "";
      if (owned && !here) act += '<button type="button" class="btn" data-travel="' + i + '">Travel to ' + esc(b.n) + '</button>';
      if (owned && lm) {
        var l = S[b.k], rate = l ? lm.rate[l - 1] * mult() : 0, nx = l < lm.max ? lm.rate[l] * mult() : 0;
        info = '<p class="evo-lm-info"><b>' + lm.n + '</b> ' + (l ? "Lv " + l + "/" + lm.max : "Not built") + ' · ' + (l ? "makes " + fmt1(rate) + "/s" : "makes " + fmt1(lm.rate[0] * mult()) + "/s once built") + (l && nx ? ", next level " + fmt1(nx) + "/s" : "") + '</p>' + pips(l, lm.max);
        act += btnFor(b.k);
      } else if (owned) {
        info = '<p class="evo-lm-info">Your home realm. Glowspore Patch, Hollow and Hatchery are in the Build tab.</p>';
      } else if (r.state === "locked") {
        act = '<button type="button" class="btn ghost" disabled>Unlock <span class="evo-c"><span class="evo-orb sm" aria-hidden="true"></span>' + fmtK(r.cost) + '</span></button><p class="evo-need">' + esc(r.why) + '</p>';
      } else {
        act = '<button type="button" class="btn" data-unlock="' + i + '"' + (r.state === "ready" ? "" : " disabled") + '>Unlock <span class="evo-c"><span class="evo-orb sm" aria-hidden="true"></span>' + fmtK(r.cost) + '</span></button><div class="evo-bar2" data-prog="rl' + i + '"><i></i></div><p class="evo-need" data-need="rl' + i + '"></p>';
      }
      h += '<article class="evo-card world' + (here ? " here" : "") + (r.state === "locked" ? " locked" : owned ? "" : " avail") + '" style="--c:' + b.c + '"><div class="evo-wthumb t-' + b.id + '" aria-hidden="true">' + (r.state === "locked" ? '<i class="lk"></i>' : "") + '</div><div class="evo-info"><h3>' + esc(b.n) + ' <em>' + (here ? "You are here" : owned ? "Unlocked" : "Locked") + '</em></h3><p>' + esc(b.tag) + '.' + (i ? " +" + Math.round(CFG.realmBonus * 100) + "% production." : "") + '</p>' + info + '</div><div class="evo-act">' + act + '</div></article>';
    });
    h += '<article class="evo-card locked world"><div class="evo-wthumb t-void" aria-hidden="true"><i class="lk"></i></div><div class="evo-info"><h3>Starfall Marsh <em>Coming soon</em></h3><p>Something is falling from the sky over a distant marsh. Bosses and prestige are on the way.</p></div></article>';
    $("pane-worlds").innerHTML = h;
  }

  function todayStr(off) { var d = new Date(); if (off) d.setDate(d.getDate() + off); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function giftAmt(day) { return Math.round(Math.max(CFG.gift.min, rateBase() * CFG.gift.baseSecs) * CFG.gift.mult[day - 1]); }
  function giftInfo() {
    if (S.dl === todayStr(0)) return { due: false, day: S.ds };
    var day = S.dl === todayStr(-1) ? (S.ds >= 7 ? 1 : S.ds + 1) : 1;
    return { due: true, day: day, amt: giftAmt(day) };
  }
  function claimGift(day) {
    var g = giftInfo(); if (!g.due) return;
    var amt = g.amt; S.ess += amt; S.tot += amt; S.dl = todayStr(0); S.ds = g.day; if (g.day > S.bd) S.bd = g.day; S.dc++;
    if (g.day === 7) frenzyEnd = Date.now() + CFG.gift.frenzy * 1000;
    chipRes(amt); toast("Daily gift: +" + fmtK(amt) + " Essence" + (g.day === 7 ? " and a Frenzy!" : "!"), true);
    try { SFX.coin(); } catch (e) {}
    save(true); renderAll();
  }
  function giftCine(g, extra) {
    var row = '<div class="gift-row" aria-hidden="true">'; for (var i = 1; i <= 7; i++) row += '<span class="' + (i < g.day ? "done" : i === g.day ? "today" : "") + '"><b>' + (i === 7 ? "&#9733;" : i) + '</b></span>'; row += '</div>';
    var ln = [g.day === 1 ? "Come back every day to build your streak" : "Streak: " + g.day + " days. Don't break it!"]; if (extra) ln.push(extra);
    if (g.day === 7) ln.push("Day 7 also starts a 1 minute Frenzy");
    var el = fx().cine($("evoStage"), { kind: "gift", color: "#f2c14e", art: row, kicker: "Day " + g.day + " of 7", title: "Daily Swamp Gift", sub: '<b class="cn-num">0</b> Essence', lines: ln, btn: "Claim gift", onGo: function () { claimGift(g.day); },
      sound: function () { SFX.rise(); } });
    setTimeout(function () { fx().count(el.querySelector(".cn-num"), g.amt, 1300); }, 450);
  }
  function backCine(a) {
    var m = Math.floor(a.secs / 60), dur = m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + " min";
    var ln = []; if (eggReady()) ln.push("Your egg is ready to hatch!"); var nx = nextGoal(); if (nx) ln.push("Next goal: " + nx.t);
    var el = fx().cine($("evoStage"), { kind: "back", color: "#4ee6b4", art: '<span class="cn-orbm"></span>', kicker: "Welcome back", title: "Your swamp kept working", sub: '<b class="cn-num">0</b> Essence in ' + dur, lines: ln, btn: "Collect",
      sound: function () { SFX.coin(); } });
    setTimeout(function () { fx().count(el.querySelector(".cn-num"), a.gain, 1200); }, 450);
  }
  function entry() {
    if (!fx() || fx().isOpen() || pickFor) return;   // try again on the next tick
    entryDue = false; var a = awayInfo; awayInfo = null;
    if (S.tot < 30) return;
    var g = giftInfo();
    if (g.due && S.tot >= CFG.gift.minTot) giftCine(g, a ? "Welcome back: +" + fmtK(a.gain) + " Essence while you were away" : "");
    else if (a) backCine(a);
  }

  function goalList() {
    var L = [], add = function (t, cost, tab) { L.push({ t: t, cost: cost, tab: tab }); }, ok = function (b) { return b.state === "ready" || b.state === "poor"; };
    ["hq", "patch", "hatch", "lamp"].forEach(function (id) { var b = buildInfo(id); if (ok(b)) add((lvlOf(id) ? "Upgrade " : "Build ") + NAMES[id], b.cost, "build"); });
    var e = eggInfo(); if (e.state === "empty" || e.state === "poor") add("Buy a mystery egg", e.cost, "creature");
    S.crs.forEach(function (c, i) { var b = evoInfo(i); if (ok(b)) add("Evolve " + c.n, b.cost, "creature"); });
    for (var i = 1; i < BIO.length; i++) if (i === S.rl) { var r = realmInfo(i); if (ok(r)) add("Unlock " + BIO[i].n, r.cost, "worlds"); }
    ["em", "fr"].forEach(function (id) { var b = buildInfo(id); if (ok(b)) add((S[id] ? "Upgrade " : "Build ") + NAMES[id], b.cost, "worlds"); });
    if (!L.length) { var f = buildInfo("fert"); if (ok(f)) add("Upgrade Compost Heap", f.cost, "build"); }
    return L;
  }
  function nextGoal() { var L = goalList(); if (!L.length) return null; L.sort(function (a, b) { return a.cost - b.cost; }); return L[0]; }
  var goalTxt = "";
  function paintGoal() {
    var el = $("evoGoal"), g = nextGoal(); if (!el) return;
    if (!g) { el.hidden = true; return; }
    var p = Math.min(1, S.ess / g.cost), txt = p >= 1 ? "Ready: " + g.t : "Next: " + g.t + " · " + Math.floor(p * 100) + "%";
    el.hidden = false; el.style.setProperty("--p", (p * 100).toFixed(1) + "%"); el.classList.toggle("ready", p >= 1); el.dataset.tab = g.tab;
    if (txt !== goalTxt) { el.querySelector("span").textContent = txt; goalTxt = txt; }
  }
  function paintDots() {
    var on = function (k, v) { var b = $("tab-" + k); if (b) b.classList.toggle("dot", !!v); };
    var rd = function (id) { return buildInfo(id).state === "ready"; }, e = eggInfo();
    on("build", ["hq", "patch", "hatch", "lamp"].some(rd) || (S.patch >= 5 && S.hq >= 3 && S.lamp >= 3 && rd("fert")));
    on("creature", eggReady() || e.state === "empty" && S.ess >= e.cost || S.crs.some(function (c, i) { return evoInfo(i).state === "ready" || (c.s >= 1 && !c.m); }));
    on("worlds", ["em", "fr"].some(rd) || (S.rl < BIO.length && realmInfo(S.rl).state === "ready"));
    on("realm", giftInfo().due && S.tot >= CFG.gift.minTot);
  }

  // ---------- NAVIGATION + EVENTS ----------
  function tab(name) {
    ["build", "creature", "worlds", "realm"].forEach(function (n) { var on = n === name; $("tab-" + n).setAttribute("aria-selected", on); $("pane-" + n).hidden = !on; });
    if (name === "realm") renderRealm();
    if (name === "worlds") renderWorlds();
    var pn = $("pane-" + name); pn.classList.remove("enter"); void pn.offsetWidth;
    Array.prototype.forEach.call(pn.children, function (c, i) { c.style.setProperty("--i", Math.min(i, 9)); });
    pn.classList.add("enter"); clearTimeout(pn._t); pn._t = setTimeout(function () { pn.classList.remove("enter"); }, 1000);
    try { sessionStorage.setItem("evo-tab", name); } catch (e) {}
  }
  function bind() {
    document.querySelector(".evo-nav").addEventListener("click", function (e) { var t = e.target.closest("[data-tab]"); if (t) tab(t.dataset.tab); });
    $("evoStage").addEventListener("click", function (e) {
      var w = e.target.closest(".evo-wisp"); if (w) { catchWisp(w); return; }
      var pk = e.target.closest("[data-pick]"); if (pk) { chooseMut(pk.dataset.pick); return; }
      if (e.target.closest("[data-pickx]")) { closePick(); return; }
      var mu = e.target.closest("[data-mut]"); if (mu) { openPick(Number(mu.dataset.mut), false); return; }
      var b = e.target.closest("[data-buy]"); if (b) { buy(b.dataset.buy); return; }
      if (e.target.closest("[data-egg]")) { buyEgg(); return; }
      var ul = e.target.closest("[data-unlock]"); if (ul) { unlockRealm(Number(ul.dataset.unlock)); return; }
      var tv = e.target.closest("[data-travel]"); if (tv) { travel(Number(tv.dataset.travel)); return; }
      if (e.target.closest("[data-gift]")) { var gg = giftInfo(); if (gg.due && fx()) giftCine(gg); return; }
      var gl = e.target.closest("#evoGoal"); if (gl) { tab(gl.dataset.tab || "build"); return; }
      if (e.target.closest("[data-hatch]")) { hatch(); return; }
      var v = e.target.closest("[data-evolve]"); if (v) { evolve(Number(v.dataset.evolve)); return; }
      if (e.target.closest("[data-reset]") && confirm("Start your swamp over? This only resets SwampRealms: Evolution. Your coins, crystals, cards and avatar are not touched.")) {
        S = clean(null); S.seen = Date.now(); eggSeen = true; frenzyEnd = 0; chain = 0; achSeen = []; save(true); if (fx()) fx().atmo.set("swamp"); renderAll(); tab("build"); toast("Your swamp was reset.");
      }
    });
    $("evoCrs").addEventListener("click", function (e) { if (e.target.closest(".evo-cr")) pet(e); });
    $("hotLm").addEventListener("click", function () {
      var b = BIO[S.at]; tab("worlds"); if (!b.lm) return;
      toast(S[b.k] ? b.lm.n + ", level " + S[b.k] + ". Making " + fmt1(b.lm.rate[S[b.k] - 1] * mult()) + "/s." : "Build the " + b.lm.n + " in the Worlds tab.");
    });
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

  function setupExtras() {
    var pk = document.createElement("div"); pk.id = "evoPick"; pk.className = "evo-pick"; pk.hidden = true; pk.setAttribute("role", "dialog"); pk.setAttribute("aria-modal", "true"); pk.setAttribute("aria-label", "Choose a mutation");
    $("evoStage").appendChild(pk);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePick(); });
    achSeen = achDone(); lastPh = phase().id;
  }

  // ---------- START ----------
  function init() {
    load();
    var gap = (Date.now() - S.seen) / 1000;   // time since the last save counts as time away
    lastTick = Date.now() - Math.min(Math.max(gap, 0), CFG.offlineCap) * 1000;
    eggSeen = !S.egg || eggReady();   // an egg that finished while you were away is just shown as ready
    var hd = document.querySelector("header"), setTop = function () { if (hd) $("evoStage").style.setProperty("--evo-top", hd.offsetHeight + "px"); };
    setTop(); addEventListener("resize", setTop);
    renderAll(); bind(); setupExtras();
    var t = "build"; try { t = sessionStorage.getItem("evo-tab") || "build"; } catch (e) {} tab(t === "creature" || t === "realm" || t === "worlds" ? t : "build");
    if (fx()) fx().atmo.start($("evoScene"), BIO[S.at].id);
    tick();
    if (!S.tot && !S.patch) toast("Welcome! Pet " + S.crs[0].n + " to collect your first Essence.");
    else if (eggReady()) toast("Your egg is ready to hatch!", true);
    setInterval(tick, CFG.tickMs);
    setInterval(ambient, 1800);
    setInterval(function () {   // the creatures are alive: every few seconds one of them does a little wiggle
      if (document.hidden || reduce()) return;
      var all = document.querySelectorAll(".evo-cr"); if (!all.length) return;
      var c = all[Math.floor(Math.random() * all.length)]; c.classList.remove("wig"); void c.offsetWidth; c.classList.add("wig");
    }, 4200);
  }
  if (typeof Crystals === "undefined" || typeof AV === "undefined") {
    var m = document.createElement("p"); m.textContent = "The game could not start because a shared script failed to load. Reload the page.";
    var st = document.getElementById("evoStage"); if (st) st.appendChild(m);
  } else init();
})();
