// ===== SwampRealms: Delve (Stage 1: single-player dig-and-build sandbox) =====
// Load AFTER cards.js, weapons.js, avatar.js, store.js, account.js, menu.js and sandbox-world.js (see sandbox.html).
// Everything lives inside this function so it can never clash with globals in cards.js / store.js.
//
// SAVING: the whole game is one localStorage key, "swamp-delve-v1" (this browser only, NOT cloud-synced in Stage 1).
//   { v:2, trail (First Day Trail step), seed, e:"idx:tile,idx:tile" (only tiles you changed), ex:"run-length explored map", p:{x,y,f}, animal, inv:{item:n}, mru:[item],
//     tier (pick level 1-4), time (0-480 day clock), ms:{milestone:1}, st:{mined,placed,torches,wood,maxDepth,swim}, zoom }
// Swamp Coins and Swamp Crystals are never read or written. Nothing here pays out currency.
// WORLDS: each player (signed-in name, or "guest") has a list of world slots on this device. Index key "swamp-delve-worlds:<user>", one save per world "swamp-delve-w:<user>:<id>".
// The old single key below (swamp-delve-v1) is moved into the first slot once, then left untouched as a backup.
// Night: Dusk Bats dive at an armed player after dark; a Swamp Bed lets you sleep to dawn (S.bed = the bed you last slept in = your respawn point).
(function () {
  "use strict";
  if (typeof SbxWorld === "undefined") return;
  var SW = SbxWorld, W = SW.W, H = SW.H, SURF = SW.SURF, T = SW.T, TILES = SW.TILES, ITEMS = SW.ITEMS, ORDER = SW.ITEM_ORDER, BIOMES = SW.BIOMES, SC = typeof SbxCave !== "undefined" ? SbxCave : null;

  // ---------- TUNING ----------
  var KEY = "swamp-delve-v1", CYCLE = 480, REACH = 5.6, PW = 0.7, PH = 1.5, SAVE_MS = 8000;
  // health: tuning (a player has MAXHP; fall hits past FALL_SAFE speed, lava burns per second, then you heal after a calm spell)
  var MAXHP = 100, FALL_SAFE = 17, LAVA_DPS = 38, REGEN_WAIT = 4, REGEN_RATE = 2.5;
  var PICKS = [
    { n: "Bare Paws", c: "#8fd37a", sp: 0.55 }, { n: "Reed Pick", c: "#c9b58a", sp: 1 }, { n: "Glowspore Pick", c: "#4ee6b4", sp: 1.8 },
    { n: "Cinder Pick", c: "#ff8a3d", sp: 2.8 }, { n: "Frost Pick", c: "#7fd6ff", sp: 4.2 }
  ];
  // Weapons: their own track beside the picks (S.wpn 0-4). Each needs the one before it, the matching pick tier (need), and a Workbench (the Spear is made by hand).
  // dmg is stored for Stage 3 (Gloomlings); cd is seconds per swing. Nothing in the world takes damage yet.
  // Shovel: a second basic tool. Only digs soft ground (mud, moss, clay, ash, snow) and does it a bit faster than bare paws (0.55) but slower than the Reed Pick (1).
  var SHOVEL = { n: "Reed Shovel", c: "#c9b58a", sp: 0.85 }, SOFT = {};
  [T.MOSS, T.MUD, T.CLAY, T.ASH, T.SNOW].forEach(function (i) { SOFT[i] = 1; });
  // DURABILITY: every tool wears out. A block broken costs the pick or shovel 1 point (2 for hard rock like Basalt and Frostrock); each swing that hits something costs the weapon 1.
  // At 0 the tool is BROKEN, not lost: a broken pick digs like bare paws, a broken shovel or weapon cannot be used. Repair it in the Craft tab (Reed gear by hand, Glowspore and up next to a Workbench).
  // A newly crafted tool is at full durability. Saved in S.dur; older saves start with everything at full.
  var DUR = { pick: [0, 100, 180, 300, 480], shovel: 80, wpn: [0, 40, 70, 100, 150] };
  var REPAIR = { pick: [null, { stick: 2, fiber: 2 }, { spore: 4, wood: 3 }, { cinder: 5, basalt: 3 }, { crystal: 6, frostrock: 4 }], shovel: { stick: 1, fiber: 2 }, wpn: [null, { stick: 2, fiber: 2 }, { spore: 3, planks: 2 }, { cinder: 4, basalt: 3 }, { crystal: 5, frostrock: 3 }] };
  var WEAPONS = [
    { n: "No Weapon", c: "#8fd37a", dmg: 0, cd: 0 }, { n: "Reed Spear", c: "#c9b58a", dmg: 5, cd: 0.5 }, { n: "Glowspore Blade", c: "#4ee6b4", dmg: 9, cd: 0.42 },
    { n: "Cinder Cleaver", c: "#ff8a3d", dmg: 16, cd: 0.5 }, { n: "Frost Fang", c: "#7fd6ff", dmg: 26, cd: 0.34 }
  ];
  var RECIPES = [
    { id: "pick1", n: "Reed Pick", tier: 1, cost: { stick: 3, fiber: 3, pebble: 2 }, d: "Your first tool. Chops wood, digs clay and breaks stone." },
    { id: "shovel", n: "Reed Shovel", sh: 1, cost: { stick: 2, fiber: 2, pebble: 2 }, d: "A hand shovel for soft ground. Digs Mud, Moss, Clay, Ash and Snow a little faster than bare paws. It cannot break stone, wood or ore, so keep your pick too." },
    { id: "planks", n: "Planks (4)", out: { planks: 4 }, cost: { wood: 1 }, d: "Build walls, floors and bridges." },
    { id: "bench", n: "Bog Workbench", out: { bench: 1 }, cost: { wood: 10, fiber: 4 }, d: "Place it at camp. Better tools are made standing next to it." },
    { id: "bed", n: "Swamp Bed", out: { bed: 1 }, cost: { planks: 6, fiber: 6, leaves: 8 }, d: "Place it at camp. At night, stand next to it and sleep to skip to dawn, heal fully and set your respawn. Bats cannot hurt you while you sleep." },
    { id: "torch", n: "Torches (4)", out: { torch: 4 }, cost: { stick: 1, spore: 1 }, d: "Light up caves. Place next to a wall." },
    { id: "wpn1", n: "Reed Spear", wpn: 1, cost: { stick: 6, fiber: 3, pebble: 4 }, d: "Your first weapon. Hold it from the hotbar and swing. Damage 5." },
    { id: "door", n: "Swamp Door", out: { door: 1 }, cost: { planks: 6, fiber: 2 }, d: "A two-tall wooden door. Place it on the ground in a doorway. Walk into it to open it (it shuts behind you), tap it or press F to open or close it by hand, and hold on it to break it. Closed doors stop bugs, frogs and bats." },
    { id: "ladder", n: "Ladder (4)", out: { ladder: 4 }, cost: { planks: 3 }, d: "Stick it to a wall or stack it up or down. Hold Jump to climb up, S or Down to climb down (on a phone you slowly slide down when not climbing)." },
    { id: "chest", n: "Wooden Chest", out: { chest: 1 }, cost: { planks: 8, fiber: 2 }, d: "Place it at camp on solid ground. Tap it (or press F nearby) to open it and stash up to 30 kinds of items. Empty it before you pick it up." },
    { id: "chair", n: "Wooden Chair", out: { chair: 1 }, cost: { planks: 4, fiber: 1 }, d: "A simple chair for your camp. Place it on solid ground; it faces the way you are looking." },
    { id: "table", n: "Wooden Table", out: { table: 1 }, cost: { planks: 8, fiber: 2 }, d: "A small table. Place it on solid ground." },
    { id: "painting", n: "Painting", out: { painting: 1 }, cost: { planks: 2, fiber: 3 }, d: "Hang it on a wall (or any block). Every painting is a surprise: random coloured pixels." },
    { id: "pick2", n: "Glowspore Pick", tier: 2, bench: true, cost: { spore: 16, wood: 12 }, d: "Digs 1.8x faster. Breaks Basalt and Cinder Ore." },
    { id: "wpn2", n: "Glowspore Blade", wpn: 2, need: 2, bench: true, cost: { spore: 12, wood: 8, planks: 8, bugfrag: 3 }, d: "A glowing blade. Damage 9, quick swing. Needs the Glowspore Pick and Bramble Fragments from Bramble Bugs." },
    { id: "pick3", n: "Cinder Pick", tier: 3, bench: true, cost: { cinder: 20, basalt: 16, planks: 24 }, d: "Digs 2.8x faster. Breaks Frostrock and Frost Crystal." },
    { id: "wpn3", n: "Cinder Cleaver", wpn: 3, need: 3, bench: true, cost: { cinder: 16, basalt: 12, planks: 16, frogfrag: 3 }, d: "A heavy lava-veined cleaver. Damage 16. Needs the Cinder Pick and Frog Fragments from Swamp Frogs." },
    { id: "pick4", n: "Frost Pick", tier: 4, bench: true, cost: { crystal: 24, frostrock: 20, planks: 32 }, d: "The fastest pick in the swamp. Digs 4.2x faster." },
    { id: "wpn4", n: "Frost Fang", wpn: 4, need: 4, bench: true, cost: { crystal: 18, frostrock: 14, planks: 24, batwing: 4 }, d: "A razor ice blade. Damage 26, the fastest swing. Needs the Frost Pick and Bat Wings from Dusk Bats (they only come out at night)." }
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
    { id: "bug1", n: "Bug Squasher", d: "Defeat a Bramble Bug", f: function () { return S.st.bugs >= 1; } },
    { id: "frog1", n: "Frog Hopper", d: "Defeat a Swamp Frog", f: function () { return S.st.frogs >= 1; } },
    { id: "bug5", n: "Thorn Trouble", d: "Defeat 5 Bramble Bugs", f: function () { return S.st.bugs >= 5; } },
    { id: "frog5", n: "Croak Crusher", d: "Defeat 5 Swamp Frogs", f: function () { return S.st.frogs >= 5; } },
    { id: "wpn1", n: "Armed Paws", d: "Craft the Reed Spear", f: function () { return S.wpn >= 1; } },
    { id: "wpn2", n: "Spore Blade", d: "Craft the Glowspore Blade", f: function () { return S.wpn >= 2; } },
    { id: "wpn3", n: "Cinder Cleaver", d: "Craft the Cinder Cleaver", f: function () { return S.wpn >= 3; } },
    { id: "wpn4", n: "Frost Fang", d: "Craft the Frost Fang", f: function () { return S.wpn >= 4; } },
    { id: "bed1", n: "Bed Time", d: "Place a Swamp Bed", f: function () { return S.st.beds >= 1; } },
    { id: "door1", n: "Knock Knock", d: "Place a Swamp Door", f: function () { return S.st.doors >= 1; } },
    { id: "ladder1", n: "Up and Away", d: "Place a Ladder", f: function () { return S.st.ladders >= 1; } },
    { id: "chest1", n: "Pack Rat", d: "Place a Wooden Chest", f: function () { return S.st.chests >= 1; } },
    { id: "shovel1", n: "Dig It", d: "Craft the Reed Shovel", f: function () { return S.shovel >= 1; } },
    { id: "bat1", n: "Night Watch", d: "Defeat a Dusk Bat", f: function () { return S.st.bats >= 1; } },
    { id: "sleep1", n: "Sweet Dreams", d: "Sleep through a night", f: function () { return S.st.sleeps >= 1; } },
    { id: "bat10", n: "Bat Basher", d: "Defeat 10 Dusk Bats", f: function () { return S.st.bats >= 10; } },
    { id: "sleep5", n: "Well Rested", d: "Sleep through 5 nights", f: function () { return S.st.sleeps >= 5; } },
    { id: "build", n: "Builder", d: "Place 100 blocks", f: function () { return S.st.placed >= 100; } },
    { id: "deep", n: "Deep Diver", d: "Dig down to depth 50", f: function () { return S.st.maxDepth >= 50; } },
    { id: "decor1", n: "Home Sweet Home", d: "Place 3 pieces of furniture", f: function () { return S.st.decor >= 3; } },
    { id: "cave1", n: "Down the Hole", d: "Climb down into a cave", f: function () { return S.st.caves >= 1; } },
    { id: "cave2", n: "Rock Hound", d: "Break 25 rocks inside caves", f: function () { return S.st.cmined >= 25; } },
    { id: "cave3", n: "Spelunker", d: "Reach cave floor 5", f: function () { return S.st.caveDeep >= 5; } },
    { id: "cave4", n: "Cave Diver", d: "Reach cave floor 10", f: function () { return S.st.caveDeep >= 10; } }
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
    { id: "ember", n: "Cross into Ember Bog", d: "Walk east past the swamp edge. Basalt and Cinder Ore are next.", need: 1, v: function () { return (S.ms.ember || bioAt() === 1) ? 1 : 0; }, rw: null },
    { id: "spear", n: "Arm Yourself", d: "Craft the Reed Spear (Sticks, Fiber, Pebbles). Pick it in the hotbar and hold to swing. Enemies start to roam once you carry a weapon.", need: 1, v: function () { return S.wpn >= 1 ? 1 : 0; }, rw: { planks: 4 } },
    { id: "bug", n: "Squash a Bramble Bug", d: "Bramble Bugs prowl the swamp surface and dark caves. Strike them before they ram you.", need: 1, v: function () { return S.st.bugs; }, rw: { torch: 4 } },
    { id: "frog", n: "Hop to It", d: "A Swamp Frog warns with a ! then lashes its tongue low. Jump the tongue, then hit it while it is winded.", need: 1, v: function () { return S.st.frogs; }, rw: { planks: 6 } },
    { id: "blade", n: "Spore Blade", d: "Bring 3 Bramble Fragments from bugs to your Workbench and craft the Glowspore Blade.", need: 1, v: function () { return S.wpn >= 2 ? 1 : 0; }, rw: { torch: 6 } },
    { id: "bed", n: "Build a Bed", d: "Dusk Bats swoop down at night. Craft a Swamp Bed (Planks, Fiber, Leaves), select it in the hotbar and place it on solid ground near camp.", need: 1, v: function () { return S.st.beds; }, rw: { torch: 4 } },
    { id: "bats", n: "Night Watch", d: "When the sky goes dark, bats dive at you. Watch for the red eyes, step aside, then strike. Defeat 2 Dusk Bats.", need: 2, v: function () { return S.st.bats; }, rw: { planks: 6 } },
    { id: "sleep", n: "Sleep Tight", d: "At night, stand next to your bed and tap Sleep (or press F). You skip to dawn with full health, and the bed becomes your respawn point. Bats must be gone, or you need a roof overhead.", need: 1, v: function () { return S.st.sleeps; }, rw: { torch: 6 } },
    { id: "stash", n: "Stash Your Loot", d: "Craft a Wooden Chest (Planks, Fiber), place it near camp, open it (tap it or press F) and store 10 items.", need: 10, v: function () { return S.st.stashed; }, rw: { planks: 8, torch: 4 } }
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
  var p = { x: SW.SPAWNX + 0.5, y: 34, vx: 0, vy: 0, face: 1, on: false, coy: 0, wet: false, walk: 0 };
  var cam = { x: 40, y: 34 }, keys = { l: 0, r: 0, j: 0, d: 0, u: 0 }, tk = { l: 0, r: 0, j: 0, d: 0, u: 0 };
  var sel = "pick", mine = null, aim = { down: false, id: null, mx: 0, my: 0, tx: -1, ty: -1 }, cool = 0;
  var parts = [], texts = [], flies = [], glows = [];
  var hp = MAXHP, hurtT = 0, hurtGrace = 0, sinceHurt = 99, shake = 0, shownHp = -1, HVIG = null;
  var vw = 800, vh = 600, dpr = 1, ts = 28, ox = 0, oy = 0;
  var panelOpen = false, tab = "craft", hbDirty = true, lastBio = -1, hudT = 0, saveT = 0, msT = 0, nagT = 0, exKey = "", sprite = null, spriteKey = "", confirmNew = false;
  var ICO = {}, ATLAS, bannerQ = [], bannerBusy = false, guide = null, guideT = 0, trailKey = "", PCV = [], heldAmt = 0, heldPh = 0;

  // ---------- SAVE / LOAD ----------
  function rle(a) { var out = [], v = 0, n = 0; for (var i = 0; i < a.length; i++) { if (a[i] === v) n++; else { out.push(n); v = a[i]; n = 1; } } out.push(n); return out.join(","); }
  function unrle(s, a) { if (typeof s !== "string") return; var v = 0, i = 0, parts2 = s.split(","); for (var k = 0; k < parts2.length; k++) { var n = parseInt(parts2[k], 10) || 0; if (v) a.fill(1, i, Math.min(a.length, i + n)); i += n; v ^= 1; } }
  function defaultAnimal() { try { return Crystals.outfit().animal || "frog"; } catch (e) { return "frog"; } }
  function fresh(seed) { return { v: 2, wv: SW.WORLDVER, seed: seed, e: "", ex: "", p: null, animal: defaultAnimal(), inv: {}, mru: [], tier: 0, wpn: 0, trail: 0, hp: MAXHP, bed: null, shovel: 0, dur: { pick: 0, shovel: 0, wpn: 0 }, chests: {}, time: 60, ms: {}, st: { deaths: 0, mined: 0, placed: 0, torches: 0, wood: 0, maxDepth: 0, swim: 0, stick: 0, fiber: 0, pebble: 0, spore: 0, benches: 0, swings: 0, bugs: 0, frogs: 0, bats: 0, beds: 0, sleeps: 0, warned: 0, doors: 0, ladders: 0, chests: 0, stashed: 0, caves: 0, cmined: 0, caveDeep: 0, decor: 0 }, zoom: 1 }; }
  function clean(o) {
    if (!o || typeof o !== "object" || !o.seed) return null;
    var d = fresh(o.seed | 0 || 1);
    d.e = typeof o.e === "string" ? o.e : ""; d.ex = typeof o.ex === "string" ? o.ex : "";
    if (o.wv !== SW.WORLDVER) { d.e = ""; d.ex = ""; o = Object.assign({}, o, { p: null }); d.grown = true; }   // the world was rebuilt bigger: keep your items and progress, but old digging and map no longer line up
    if (o.p && isFinite(o.p.x) && isFinite(o.p.y)) d.p = { x: clamp(+o.p.x, 1, W - 1), y: clamp(+o.p.y, 2, H - 2), f: o.p.f < 0 ? -1 : 1 };
    if (typeof o.animal === "string") d.animal = o.animal;
    if (o.inv && typeof o.inv === "object") ORDER.forEach(function (k) { var n = Math.floor(+o.inv[k]); if (n > 0) d.inv[k] = Math.min(n, 99999); });
    if (Array.isArray(o.mru)) d.mru = o.mru.filter(function (k) { return ITEMS[k] && ITEMS[k].tile !== undefined; }).slice(0, 20);
    var tr = Math.floor(+o.tier); d.tier = clamp(isFinite(tr) ? tr : 1, o.v >= 2 ? 0 : 1, 4);
    var wp = Math.floor(+o.wpn); d.wpn = clamp(isFinite(wp) ? wp : 0, 0, WEAPONS.length - 1);
    d.trail = typeof o.trail === "number" ? clamp(Math.floor(o.trail), 0, TRAIL.length) : TRAIL.length;   // older saves skip the beginner Trail
    d.shovel = +o.shovel ? 1 : 0;
    d.dur = { pick: DUR.pick[d.tier] || 0, shovel: d.shovel ? DUR.shovel : 0, wpn: DUR.wpn[d.wpn] || 0 };   // older saves: everything at full
    if (o.dur && typeof o.dur === "object") { var dm = { pick: DUR.pick[d.tier] || 0, shovel: d.shovel ? DUR.shovel : 0, wpn: DUR.wpn[d.wpn] || 0 }; Object.keys(dm).forEach(function (k) { if (isFinite(+o.dur[k]) && o.dur[k] !== null) d.dur[k] = clamp(Math.floor(+o.dur[k]), 0, dm[k]); }); }
    d.hp = isFinite(+o.hp) && +o.hp > 0 ? Math.min(MAXHP, +o.hp) : MAXHP;   // older saves start at full health
    d.time = clamp(+o.time || 60, 0, CYCLE - 0.01);
    if (o.bed && isFinite(o.bed.x) && isFinite(o.bed.y)) d.bed = { x: clamp(Math.floor(o.bed.x), 0, W - 1), y: clamp(Math.floor(o.bed.y), 0, H - 1) };   // checked against the world on respawn
    if (o.chests && typeof o.chests === "object" && o.wv === SW.WORLDVER) Object.keys(o.chests).forEach(function (ck) {   // chest contents, keyed by "x,y" (dropped if the world was rebuilt)
      if (!/^\d+,\d+$/.test(ck) || !o.chests[ck] || typeof o.chests[ck] !== "object") return; var c = {};
      ORDER.forEach(function (k) { var n = Math.floor(+o.chests[ck][k]); if (n > 0) c[k] = Math.min(n, 99999); }); d.chests[ck] = c;
    });
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
    S = state; build(S); cave = null; trans = null; stageEl.classList.remove("cave");
    if (state.grown) { state.grown = false; setTimeout(function () { toast("The world grew! It is 3x wider, with Frostfen west and Ember Bog east. Your items are safe.", "#f2c14e"); }, 1200); }
    var sp = world.spawn; p.x = S.p ? S.p.x : sp.x; p.y = S.p ? S.p.y : sp.y; p.face = S.p ? S.p.f : 1; p.vx = p.vy = 0;
    var guard = 0; while (boxHit(p.x, p.y) && guard++ < 120) p.y -= 1;
    cam.x = p.x; cam.y = p.y - 1; sel = "pick"; mine = null; lastBio = -1; trailKey = ""; guide = null; tab = S.trail < TRAIL.length ? "trail" : "craft"; hbDirty = true; exKey = ""; spriteKey = ""; ICO = {};
    hp = S.hp; hurtT = hurtGrace = shake = 0; sinceHurt = 99; shownHp = -1; drawHp(); sleepT = 0; batT = 8; enemies.length = 0;
    reveal(true);
  }
  function save() {
    try {
      S.hp = Math.max(1, Math.round(hp));
      S.p = { x: +p.x.toFixed(2), y: +p.y.toFixed(2), f: p.face };
      S.e = Object.keys(edits).map(function (k) { return k + ":" + edits[k]; }).join(",");
      S.ex = rle(ex);
      localStorage.setItem(wkey(curId), JSON.stringify(S)); touchIdx(); saveFail = false;
    } catch (e) { if (!saveFail) { saveFail = true; try { toast("Could not save: browser storage is full or blocked. Delete a world you do not need.", "#ff8a3d"); } catch (x) {} } }
  }
  function load() {
    wIdx = readIdx();
    if (wIdx.list.length) curId = wIdx.last; else addWorld("My Swamp");
    start(readWorld(curId) || fresh(randSeed())); saveIdx();
  }

  // ---------- WORLDS: several saves per player ----------
  var WUSER = (function () { try { return (JSON.parse(localStorage.getItem("swamp-sync-v1")) || {}).user || "guest"; } catch (e) { return "guest"; } })();   // read once per page load
  var IDXKEY = "swamp-delve-worlds:" + WUSER, MAXW = 8, wIdx = null, curId = "", menuOpen = false, delAsk = "", saveFail = false;
  var wkey = function (id) { return "swamp-delve-w:" + WUSER + ":" + id; };
  var randSeed = function () { return Math.floor(Math.random() * 2e9) + 1; };
  var newId = function () { return "w" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); };
  function saveIdx() { try { localStorage.setItem(IDXKEY, JSON.stringify(wIdx)); } catch (e) {} }
  function readIdx() {
    var o = null; try { o = JSON.parse(localStorage.getItem(IDXKEY)); } catch (e) {}
    if (!o || !Array.isArray(o.list)) {
      o = { v: 1, last: "", n: 0, list: [] };
      try {   // one-time move of the old single save into the first slot (whoever opens Delve first on this device keeps it)
        var old = localStorage.getItem(KEY);
        if (old && !localStorage.getItem("swamp-delve-legacy-claimed")) { localStorage.setItem("swamp-delve-legacy-claimed", WUSER); var id = newId(); localStorage.setItem(wkey(id), old); o.n = 1; o.list.push({ id: id, name: "My Swamp", made: Date.now(), played: Date.now() }); o.last = id; }
      } catch (e) {}
    }
    o.list = o.list.filter(function (w) { return w && typeof w.id === "string"; }).slice(0, MAXW);
    if (!o.list.some(function (w) { return w.id === o.last; })) o.last = o.list.length ? o.list[0].id : "";
    return o;
  }
  function readWorld(id) { var o = null; try { o = clean(JSON.parse(localStorage.getItem(wkey(id)))); } catch (e) {} return o; }
  function addWorld(name) { wIdx.n++; var id = newId(); wIdx.list.push({ id: id, name: name || "World " + wIdx.n, made: Date.now(), played: Date.now() }); wIdx.last = curId = id; return id; }
  function curEntry() { return wIdx && wIdx.list.filter(function (x) { return x.id === curId; })[0]; }
  function touchIdx() {   // keep the little summary shown on the Worlds screen fresh
    var w = curEntry(); if (!w) return;
    w.played = Date.now(); w.tier = S.tier; w.wpn = S.wpn; w.trail = S.trail; w.sleeps = S.st.sleeps; w.goals = Object.keys(S.ms).length; w.depth = S.st.maxDepth; wIdx.last = curId; saveIdx();
  }
  function switchWorld(id) {
    if (id !== curId) { save(); curId = id; start(readWorld(id) || fresh(randSeed())); touchIdx(); toast("Loaded " + (curEntry() ? curEntry().name : "world") + ".", "#4ee6b4"); }
    closeWorlds();
  }
  function createWorld(name) {
    if (wIdx.list.length >= MAXW) { toast("You can keep " + MAXW + " worlds. Delete one first.", "#f2c14e"); return; }
    save(); var z = S.zoom, an = S.animal; addWorld(String(name || "").trim().slice(0, 24));
    start(Object.assign(fresh(randSeed()), { zoom: z, animal: an })); save(); closeWorlds(); toast("A fresh world: " + curEntry().name + ". Happy digging!", "#4ee6b4");
  }
  function deleteWorld(id) {
    try { localStorage.removeItem(wkey(id)); } catch (e) {}
    wIdx.list = wIdx.list.filter(function (w) { return w.id !== id; });
    if (id === curId) {
      var z = S.zoom, an = S.animal;
      if (wIdx.list.length) { var nx = wIdx.list.slice().sort(function (a, b) { return b.played - a.played; })[0]; curId = nx.id; start(readWorld(curId) || fresh(randSeed())); }
      else { addWorld("My Swamp"); start(Object.assign(fresh(randSeed()), { zoom: z, animal: an })); save(); }
    }
    saveIdx();
  }
  var wEl = document.createElement("div"); wEl.className = "sbx-worlds"; wEl.id = "sbxWorlds"; wEl.hidden = true; wEl.setAttribute("role", "dialog"); wEl.setAttribute("aria-label", "Your worlds"); stageEl.appendChild(wEl);
  function ago(t) { var m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; }
  function renderWorlds() {
    var list = wIdx.list.slice().sort(function (a, b) { return b.played - a.played; });
    var h = '<div class="sbx-wbox"><h2>Your Worlds</h2><p class="sbx-note">Each world saves on its own in this browser' + (WUSER !== "guest" ? " for " + esc(WUSER) : "") + ". Switch any time, or start a new one.</p><div class=\"sbx-wlist\">";
    list.forEach(function (w) {
      var cur = w.id === curId, sub = PICKS[w.tier || 0].n + (w.wpn ? " \u00b7 " + WEAPONS[w.wpn].n : "") + " \u00b7 " + (w.goals || 0) + " goals \u00b7 " + ago(w.played);
      h += '<div class="sbx-w' + (cur ? " cur" : "") + '"><div><b>' + esc(w.name) + (cur ? " (playing)" : "") + "</b><small>" + esc(sub) + '</small></div><div class="acts">'
        + '<button type="button" class="btn' + (cur ? "" : " ghost") + '" data-wl-play="' + w.id + '">' + (cur ? "Resume" : "Play") + "</button>"
        + '<button type="button" class="btn ghost" data-wl-ren="' + w.id + '" aria-label="Rename ' + esc(w.name) + '">Rename</button>'
        + '<button type="button" class="btn ghost' + (delAsk === w.id ? " warn" : "") + '" data-wl-del="' + w.id + '">' + (delAsk === w.id ? "Tap again to delete" : "Delete") + "</button></div></div>";
    });
    h += '</div><div class="sbx-wnew"><input id="sbxWName" type="text" maxlength="24" placeholder="Name your new world" aria-label="New world name" autocomplete="off"><button type="button" class="btn" data-wl-new>New world</button></div>'
      + '<div class="sbx-row"><button type="button" class="btn ghost" data-wl-close>Back to game</button><a class="btn ghost" href="arcade.html">Exit to Arcade</a></div></div>';
    var keep = $("sbxWName") ? $("sbxWName").value : ""; wEl.innerHTML = h; if (keep && $("sbxWName")) $("sbxWName").value = keep;
  }
  function openWorlds() {
    if (!wIdx) return; save(); if (panelOpen) closePanel();
    menuOpen = true; delAsk = ""; keys.l = keys.r = keys.j = 0; tk.l = tk.r = tk.j = 0; aim.down = false; mine = null; renderWorlds(); wEl.hidden = false;
  }
  function closeWorlds() { menuOpen = false; wEl.hidden = true; delAsk = ""; hbDirty = true; }
  wEl.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    var id = b.getAttribute("data-wl-play"); if (id) return switchWorld(id);
    if (b.hasAttribute("data-wl-close")) return closeWorlds();
    if (b.hasAttribute("data-wl-new")) { var inp = $("sbxWName"); createWorld(inp ? inp.value : ""); if (menuOpen) renderWorlds(); return; }
    var rn = b.getAttribute("data-wl-ren");
    if (rn) { var w = wIdx.list.filter(function (x) { return x.id === rn; })[0], nm = null; try { nm = window.prompt("Rename world", w.name); } catch (er) {} if (nm && nm.trim()) { w.name = nm.trim().slice(0, 24); saveIdx(); } return renderWorlds(); }
    var dl = b.getAttribute("data-wl-del");
    if (dl) { if (delAsk !== dl) { delAsk = dl; return renderWorlds(); } delAsk = ""; deleteWorld(dl); return renderWorlds(); }
  });
  wEl.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "sbxWName") { createWorld(e.target.value); if (menuOpen) renderWorlds(); } });

  // ---------- WORLD ACCESS ----------
  function get(x, y) { if (x < 0 || x >= W) return T.BEDROCK; if (y < 0) return T.AIR; if (y >= H) return T.BEDROCK; return tiles[y * W + x]; }
  // Natural trees are scenery: you and the enemies walk through untouched trunks and leaves (you can still chop them). Logs and leaves YOU placed stay solid.
  function blocks(x, y) {
    var id = get(x, y); if (!TILES[id].solid) return false;
    if ((id === T.LOG || id === T.LEAVES) && x >= 0 && x < W && y >= 0 && y < H && tiles[y * W + x] === orig[y * W + x]) return false;
    return true;
  }
  var opaque = function (id) { return TILES[id].solid && id !== T.LEAVES; };
  function recalc(x) {   // first row that counts as ground/roof (sets sky light and the dark backwall). World-generated trunks are scenery, so they never count: no backwall appears under a tree when you chop it.
    for (var y = 0; y < H; y++) { var i = y * W + x, id = tiles[i]; if (opaque(id) && !(id === T.LOG && id === orig[i])) { col[x] = y; return; } }
    col[x] = H;
  }
  function setT(x, y, id) {
    var i = y * W + x; tiles[i] = id;
    if (id === orig[i]) delete edits[i]; else edits[i] = id;
    recalc(x);
  }
  var bioAt = function () { return world.bio[clamp(Math.floor(p.x), 0, W - 1)]; };
  function boxHit(x, y) {
    var x0 = Math.floor(x - PW / 2 + 1e-4), x1 = Math.floor(x + PW / 2 - 1e-4), y0 = Math.floor(y - PH + 1e-4), y1 = Math.floor(y - 1e-4);
    for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) if (blocks(xx, yy)) return true;
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
  // ---------- DURABILITY ----------
  function durMax(k) { return k === "pick" ? DUR.pick[S.tier] || 0 : k === "shovel" ? (S.shovel ? DUR.shovel : 0) : DUR.wpn[S.wpn] || 0; }
  function durOf(k) { var v = S.dur[k], m = durMax(k); return v == null ? m : Math.min(v, m); }
  var toolName = function (k) { return k === "pick" ? PICKS[S.tier].n : k === "shovel" ? SHOVEL.n : WEAPONS[S.wpn].n; };
  var toolBroken = function (k) { return durMax(k) > 0 && durOf(k) <= 0; };
  function effTier() { return S.tier > 0 && durOf("pick") > 0 ? S.tier : 0; }   // a broken pick digs like bare paws
  function wear(k, n) {
    var m = durMax(k); if (m <= 0) return; var before = durOf(k), now = Math.max(0, before - n); S.dur[k] = now; hbDirty = true;
    if (panelOpen && tab === "craft") renderPanel();
    if (now <= 0 && before > 0) { toast("Your " + toolName(k) + " broke! Repair it in the Craft tab.", "#ff6b82"); thud(90, 0.12); chips(p.x, p.y - 1, "#c9b58a", 14, 6); mine = null; }
    else if (before > m * 0.2 && now <= m * 0.2) toast("Your " + toolName(k) + " is wearing out.", "#f2c14e");
  }
  function repairNeedsBench(k) { return k === "pick" ? S.tier >= 2 : k === "wpn" ? S.wpn >= 2 : false; }
  function repairCost(k) { return k === "pick" ? REPAIR.pick[S.tier] : k === "shovel" ? REPAIR.shovel : REPAIR.wpn[S.wpn]; }
  function repair(k) {
    var m = durMax(k); if (m <= 0 || durOf(k) >= m) return; var cost = repairCost(k); if (!cost) return;
    if (repairNeedsBench(k) && !nearBench()) { toast("Stand near a Bog Workbench to repair this.", "#f2c14e"); return; }
    for (var c in cost) if ((S.inv[c] || 0) < cost[c]) { toast("Not enough " + ITEMS[c].n + ".", "#f2c14e"); return; }
    for (var c2 in cost) { S.inv[c2] -= cost[c2]; if (S.inv[c2] <= 0) delete S.inv[c2]; }
    S.dur[k] = m; hbDirty = true; toast(toolName(k) + " repaired.", "#4ee6b4"); snd("coin"); chips(p.x, p.y - 1, "#4ee6b4", 12, 6); renderPanel(); save();
  }
  function bar() { return ["pick"].concat(S.wpn ? ["weapon"] : [], S.shovel ? ["shovel"] : [], hot()); }
  function hot() { return S.mru.filter(function (k) { return (S.inv[k] || 0) > 0; }).slice(0, 6); }
  function choose(id) {
    if (id === "pick") sel = "pick";
    else if (id === "weapon") { if (S.wpn) sel = "weapon"; }
    else if (id === "shovel") { if (S.shovel) sel = "shovel"; }
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
  // ---------- LEAF ART ----------
  // Foliage is built from small pointed leaves (lit top-left, a shadow pixel under each) instead of random squares. Interior tiles wrap, so canopies tile without seams.
  // LEAFATLAS holds every tile for each combination of open edges (mask: 1 top, 2 bottom, 4 left, 8 right): open edges get ragged leaf tips and a sunlit or shaded rim,
  // so a tree canopy has a rounded, leafy outline instead of a square block.
  var LEAFATLAS, LEAFC = ["#0f3320", "#1a4d2c", "#2a6b38", "#3a8a44", "#58b455", "#8ddb70", "#c6f59a"];
  function paintLeaf(g, ox, oy, v, mask) {
    var hh = function (x, y, s2) { return SW.hash(x + v * 16, y + 6 * 31, s2 + 6); };
    var px = function (x, y, c, a) { x = ((x % 16) + 16) % 16; y = ((y % 16) + 16) % 16; g.globalAlpha = a == null ? 1 : a; g.fillStyle = c; g.fillRect(ox + x, oy + y, 1, 1); g.globalAlpha = 1; };
    var x, y, k, i, d;
    g.fillStyle = LEAFC[0]; g.fillRect(ox, oy, 16, 16);                                   // deep shade between the leaves
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) if (hh(x, y, 2) > 0.45) px(x, y, LEAFC[1]);   // back foliage
    var shapeA = [[0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [3, 0]], shapeB = [[3, 1], [2, 0], [2, 1], [1, 0], [1, 1], [0, 0]];   // leaf pointing up-right / up-left
    for (var pass = 0; pass < 2; pass++) for (k = 0; k < 26; k++) {
      var cx = Math.floor(hh(k, 0, 4) * 16), cy = Math.floor(hh(k, 1, 5) * 16), sh = hh(k, 2, 6) > 0.5 ? shapeA : shapeB;
      var tone = clamp(0.3 + (1 - cy / 16) * 0.32 + (hh(k, 3, 7) - 0.5) * 0.5, 0, 0.99), ti = 2 + Math.floor(tone * 3.2);   // lighter toward the top of the tile
      if ((ti >= 4) !== (pass === 1)) continue;
      var body = LEAFC[ti], lite = LEAFC[Math.min(6, ti + 1)];
      sh.forEach(function (c) { px(cx + c[0], cy + c[1], c[1] === 0 ? lite : body); });
      px(cx + (sh === shapeA ? 1 : 2), cy + 2, LEAFC[Math.max(0, ti - 2)], 0.9);        // shadow under the leaf
      if (ti >= 4 && hh(k, 4, 8) > 0.55) px(cx + (sh === shapeA ? 2 : 1), cy, LEAFC[6], 0.85);   // sun glint on the tip
    }
    for (k = 0; k < 3; k++) px(Math.floor(hh(k, 9, 3) * 16), Math.floor(hh(k, 10, 3) * 16), LEAFC[0], 0.9);   // dark gaps
    if (hh(7, 7, 7) > 0.78) { px(6, 6, "#d9fff0"); px(7, 6, "#4ee6b4"); px(6, 7, "#4ee6b4", 0.6); }   // a glowspore caught in the leaves
    // open edges: ragged leaf tips, lit rim on the sunny top, shaded rim underneath
    var clearPx = function (x, y) { g.clearRect(ox + x, oy + y, 1, 1); };
    for (i = 0; i < 16; i++) {
      if (mask & 1) { d = hh(i, 0, 11) < 0.3 ? 0 : hh(i, 0, 12) < 0.65 ? 1 : 2; for (y = 0; y < d; y++) clearPx(i, y); if (d < 3) px(i, d, hh(i, 1, 13) > 0.35 ? LEAFC[5] : LEAFC[4]); px(i, d + 1, LEAFC[4], 0.5); }
      if (mask & 2) { d = hh(i, 2, 14) < 0.3 ? 0 : hh(i, 2, 15) < 0.65 ? 1 : 2; for (y = 0; y < d; y++) clearPx(i, 15 - y); px(i, 15 - d, LEAFC[0]); px(i, 14 - d, LEAFC[1], 0.8); }
      if (mask & 4) { d = hh(i, 3, 16) < 0.35 ? 0 : hh(i, 3, 17) < 0.7 ? 1 : 2; for (x = 0; x < d; x++) clearPx(x, i); px(d, i, LEAFC[3], 0.8); }
      if (mask & 8) { d = hh(i, 4, 18) < 0.35 ? 0 : hh(i, 4, 19) < 0.7 ? 1 : 2; for (x = 0; x < d; x++) clearPx(15 - x, i); px(15 - d, i, LEAFC[1], 0.9); }
    }
    // soften square corners where two open edges meet
    if ((mask & 1) && (mask & 4)) { clearPx(0, 0); clearPx(1, 0); clearPx(0, 1); }
    if ((mask & 1) && (mask & 8)) { clearPx(15, 0); clearPx(14, 0); clearPx(15, 1); }
    if ((mask & 2) && (mask & 4)) { clearPx(0, 15); clearPx(1, 15); clearPx(0, 14); }
    if ((mask & 2) && (mask & 8)) { clearPx(15, 15); clearPx(14, 15); clearPx(15, 14); }
  }
  function buildAtlas() {
    LEAFATLAS = document.createElement("canvas"); LEAFATLAS.width = 64; LEAFATLAS.height = 16 * 16;
    var lg = LEAFATLAS.getContext("2d"); for (var lm = 0; lm < 16; lm++) for (var lv = 0; lv < 4; lv++) paintLeaf(lg, lv * 16, lm * 16, lv, lm);
    ATLAS = document.createElement("canvas"); ATLAS.width = 64; ATLAS.height = 16 * TILES.length;
    var g = ATLAS.getContext("2d");
    TILES.forEach(function (td) { for (var v = 0; v < 4; v++) paint(g, td, v, td.id * 16); });
  }
  // ---------- PAINTINGS ----------
  // Each placed painting is drawn from its position, so it looks the same every time you load the world.
  // TO USE YOUR OWN IMAGES: add entries here, e.g. { src: "art/sunset.png" }. Square images work best (they are shrunk into a 12 x 12 frame).
  // Once the list has images, every painting shows one of them (picked by position) and random pixels are only used until the image has loaded.
  var PAINT_IMGS = [], PCACHE = {};
  function paintingCanvas(i, j) {
    var key = i + "," + j; if (PCACHE[key]) return PCACHE[key];
    var c = document.createElement("canvas"); c.width = c.height = 16; var g = c.getContext("2d"), img = PAINT_IMGS.length ? PAINT_IMGS[Math.floor(SW.hash(i, j, 77) * PAINT_IMGS.length)] : null, ready = true;
    g.fillStyle = "#6e431f"; g.fillRect(0, 0, 16, 16); g.fillStyle = "#c98c4f"; g.fillRect(1, 1, 14, 14); g.fillStyle = "#e4aa6c"; g.fillRect(1, 1, 14, 1); g.fillStyle = "#3a200d"; g.fillRect(2, 2, 12, 12);
    if (img) { if (!img.el) { img.el = new Image(); img.el.src = img.src; } ready = img.el.complete && img.el.naturalWidth > 0; if (ready) { g.imageSmoothingEnabled = false; g.drawImage(img.el, 2, 2, 12, 12); } }
    if (!img || !ready) {
      var base = SW.hash(i, j, 78) * 360;
      for (var y = 0; y < 6; y++) for (var x = 0; x < 6; x++) { var h = (base + SW.hash(i * 7 + x, j * 7 + y, 79) * 150) % 360, sat = 55 + SW.hash(x, y + j, 80) * 40, lt = 38 + SW.hash(x + i, y, 81) * 30; g.fillStyle = "hsl(" + Math.round(h) + "," + Math.round(sat) + "%," + Math.round(lt) + "%)"; g.fillRect(2 + x * 2, 2 + y * 2, 2, 2); }
    }
    g.fillStyle = "#fff"; g.globalAlpha = 0.14; g.fillRect(2, 2, 12, 1); g.globalAlpha = 1;
    if (ready) PCACHE[key] = c; return c;
  }
  // ---------- WOOD ART (swamp log + planks) ----------
  // Log: a rounded trunk (lit left edge, shaded right), cracked bark ridges, scars, knots, glowing swamp moss and the odd orange bracket fungus.
  function paintLog(rect, hh) {
    var cyl = ["#34200f", "#58381f", "#8a6038", "#9f7345", "#8a6038", "#7a5430", "#7a5430", "#6c4a2a", "#6c4a2a", "#5e4025", "#5e4025", "#52361f", "#52361f", "#452c19", "#35220f", "#26170c"], x, y, k;
    for (x = 0; x < 16; x++) rect(x, 0, 1, 16, cyl[x]);
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) { var r = hh(x, y, 1); if (r < 0.07) rect(x, y, 1, 1, "#000", 0.28); else if (r > 0.95) rect(x, y, 1, 1, "#d2a46a", 0.16); }
    for (k = 0; k < 10; k++) {
      var cx = 2 + Math.floor(hh(k, 0, 3) * 12), cy = Math.floor(hh(k, 1, 4) * 13), len = 3 + Math.floor(hh(k, 2, 5) * 6);
      rect(cx, cy, 1, len, "#2a190d", 0.75); if (cx < 9) rect(cx - 1, cy + 1, 1, Math.max(1, len - 2), "#b98a52", 0.3); else rect(cx + 1, cy + 1, 1, Math.max(1, len - 2), "#000", 0.2);
    }
    for (k = 0; k < 3; k++) rect(1 + Math.floor(hh(k, 6, 2) * 11), 1 + Math.floor(hh(k, 7, 2) * 13), 3, 1, "#2a190d", 0.5);
    if (hh(3, 3, 3) > 0.66) { rect(6, 5, 3, 1, "#2a190d"); rect(5, 6, 5, 4, "#2a190d"); rect(6, 10, 3, 1, "#2a190d"); rect(6, 7, 3, 2, "#8a5f36"); rect(7, 7, 1, 1, "#c49a62"); rect(5, 6, 1, 1, "#a37846", 0.6); }
    if (hh(5, 5, 5) > 0.4) { var my = 1 + Math.floor(hh(5, 6, 5) * 8); rect(2, my, 4, 2, "#3f8f3a"); rect(2, my, 2, 1, "#7ccf55"); rect(3, my + 2, 2, 1, "#2a6a2a"); rect(2, my + 3, 1, 1, "#3f8f3a", 0.8); rect(4, my, 1, 1, "#4ee6b4", 0.9); rect(2, my + 1, 1, 1, "#4ee6b4", 0.55); }
    if (hh(8, 8, 8) > 0.7) { rect(11, 11, 4, 2, "#e8903a"); rect(11, 11, 4, 1, "#ffd08a"); rect(12, 13, 3, 1, "#8a4a1a"); }
  }
  // Door: closed = framed planks with iron hinges, a round iron handle and a glowing swamp window up top; open = the slab swung back, seen edge-on against the left side of the doorway.
  function paintDoor(rect, hh, d) {
    var x, y;
    if (d.open) {
      rect(0, 0, 4, 16, "#b9793f"); rect(0, 0, 1, 16, "#dc9a58"); rect(3, 0, 1, 16, "#6e431f"); rect(4, 0, 1, 16, "#000", 0.18);
      for (y = 1; y < 16; y += 4) rect(1, y, 2, 1, "#8a5328", 0.8);
      rect(0, d.top ? 3 : 11, 4, 3, "#4a4a52"); rect(0, d.top ? 3 : 11, 4, 1, "#9aa0ac"); rect(2, d.top ? 4 : 12, 1, 1, "#1c1c22");
      if (d.top) rect(0, 0, 4, 1, "#2a190d");
      return;
    }
    rect(0, 0, 16, 16, "#9a6234");
    var boards = [[2, "#b9793f", "#dc9a58", "#8a5328"], [6, "#c4844a", "#e6a766", "#94592c"], [10, "#b9793f", "#dc9a58", "#8a5328"]];
    boards.forEach(function (b, i) {
      var bw = i === 2 ? 4 : 4;
      rect(b[0], 0, bw, 16, b[1]); rect(b[0], 0, 1, 16, b[2]); rect(b[0] + bw - 1, 0, 1, 16, b[3]);
      for (y = 0; y < 16; y++) if (hh(i, y, 5) > 0.8) rect(b[0] + 1 + Math.floor(hh(i, y, 6) * 2), y, 1, 1, "#000", 0.18);
    });
    rect(0, 0, 2, 16, "#3a200d"); rect(14, 0, 2, 16, "#3a200d"); rect(0, 0, 1, 16, "#5a3318"); rect(14, 0, 1, 16, "#24130a", 0.9);
    if (d.top) {
      rect(0, 0, 16, 2, "#3a200d"); rect(0, 0, 16, 1, "#5a3318");
      rect(4, 4, 8, 7, "#2a190d"); rect(5, 5, 6, 5, "#1f8f7e"); rect(5, 5, 6, 5, "#4ee6b4", 0.8); rect(5, 5, 6, 1, "#d8fff6", 0.8); rect(5, 5, 1, 5, "#bffcec", 0.7);
      rect(8, 5, 1, 5, "#2a190d"); rect(5, 7, 6, 1, "#2a190d"); rect(4, 11, 8, 1, "#6e431f");
      rect(0, 3, 3, 3, "#4a4a52"); rect(0, 3, 3, 1, "#9aa0ac"); rect(1, 4, 1, 1, "#1c1c22");
    } else {
      rect(2, 12, 12, 2, "#6e431f"); rect(2, 12, 12, 1, "#8a5328"); rect(2, 0, 12, 1, "#000", 0.14);
      rect(11, 1, 3, 3, "#2e2e34"); rect(11, 1, 3, 1, "#b8bcc8"); rect(12, 2, 1, 1, "#0e0e12"); rect(10, 2, 1, 1, "#2e2e34");
      rect(0, 10, 3, 3, "#4a4a52"); rect(0, 10, 3, 1, "#9aa0ac"); rect(1, 11, 1, 1, "#1c1c22");
      rect(0, 15, 16, 1, "#24130a");
    }
  }
  // Planks: two beveled boards, wood grain, staggered end joints, iron nails, and a faint glow of swamp moss in the seam.
  function paintPlanks(rect, hh) {
    var rows = [[0, "#b9793f", "#dc9a58", "#8a5328"], [8, "#c4844a", "#e6a766", "#94592c"]];
    rows.forEach(function (r, i) {
      var y0 = r[0], k;
      rect(0, y0, 16, 8, r[1]);
      for (k = 0; k < 7; k++) rect(Math.floor(hh(k, i + 4, 4) * 10), y0 + 1 + Math.floor(hh(k, i, 3) * 5), 3 + Math.floor(hh(k, i + 9, 5) * 8), 1, r[3], 0.35);
      for (k = 0; k < 4; k++) rect(Math.floor(hh(k, i + 14, 6) * 10), y0 + 1 + Math.floor(hh(k, i + 2, 7) * 5), 3 + Math.floor(hh(k, i + 7, 8) * 6), 1, r[2], 0.35);
      rect(0, y0, 16, 1, r[2], 0.9); rect(0, y0 + 1, 16, 1, r[2], 0.28);
      rect(0, y0 + 6, 16, 1, r[3], 0.5); rect(0, y0 + 7, 16, 1, "#5a3318");
      var jx = i ? 4 + Math.floor(hh(1, i, 6) * 3) : 10 + Math.floor(hh(1, i, 6) * 3);
      rect(jx, y0 + 1, 1, 6, "#5a3318", 0.9); rect(jx + 1, y0 + 1, 1, 5, r[2], 0.25);
      [2, 13].forEach(function (nx) { if (i === 0) { rect(nx, y0 + 3, 2, 2, "#2e2e34"); rect(nx, y0 + 3, 1, 1, "#b8bcc8"); } else rect(nx, y0 + 3, 1, 1, "#4a2a12", 0.9); });
      if (hh(i, 9, 9) > 0.85) { rect(7, y0 + 2, 3, 3, "#6a3f1c"); rect(8, y0 + 3, 1, 1, "#3a200d"); }
    });
    rect(15, 0, 1, 16, "#5a3318", 0.35);
    if (hh(0, 0, 7) > 0.55) { var mx = 3 + Math.floor(hh(0, 1, 7) * 8); rect(mx, 7, 3, 1, "#4ee6b4", 0.5); rect(mx + 1, 7, 1, 1, "#d8fff6", 0.7); }
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
    if (kind === "bed") {   // wooden frame, mossy-purple blanket, pillow
      rect(1, 13, 14, 2, "#6e431f"); rect(1, 15, 2, 1, "#4a2c14"); rect(13, 15, 2, 1, "#4a2c14");
      rect(1, 9, 14, 4, "#a8703c"); rect(1, 9, 14, 1, "#c98c4f");
      rect(2, 6, 12, 4, "#6b3fa0"); rect(2, 6, 12, 1, "#8d63c9"); rect(3, 7, 10, 1, "#7a4fb3"); rect(9, 7, 1, 3, "#4e2a7c"); rect(12, 8, 1, 2, "#4e2a7c");
      rect(2, 5, 4, 3, "#f1efb4"); rect(2, 5, 4, 1, "#ffffe0"); rect(3, 7, 2, 1, "#d6d28a");
      rect(1, 4, 1, 9, "#8a5a32"); rect(14, 7, 1, 6, "#8a5a32"); rect(7, 5, 2, 1, "#4ee6b4", 0.7);
      return;
    }
    if (kind === "glowcap") { rect(7, 9, 2, 7, "#cfe3cb"); rect(7, 9, 1, 7, "#f2fff0"); rect(4, 6, 8, 4, "#22a883"); rect(5, 5, 6, 2, "#4ee6b4"); rect(6, 4, 4, 1, "#9bfbe0"); rect(6, 7, 1, 1, "#d8fff6"); rect(9, 8, 1, 1, "#d8fff6"); rect(10, 6, 1, 1, "#d8fff6"); rect(3, 8, 1, 1, "#4ee6b4", 0.7); return; }
    if (kind === "vine") {
      [[3, 16, "#3f8f3a"], [8, 12, "#4aa043"], [12, 15, "#3a8434"]].forEach(function (c, n) { var len = c[1] - (hh(n, 0, 3) > 0.5 ? 2 : 0); rect(c[0], 0, 1, len, c[2]); rect(c[0] + 1, 0, 1, len - 4, "#2a6a2a", 0.8); for (var yy = 3; yy < len; yy += 4) { rect(c[0] - 1, yy, 1, 2, "#6ec35c"); rect(c[0] + 2, yy + 2, 1, 2, "#5fb24a"); } rect(c[0], len - 1, 1, 1, "#c8ff9a", 0.9); });
      return;
    }
    if (kind === "reed") { [[3, 9], [7, 14], [11, 10]].forEach(function (s) { rect(s[0], 16 - s[1], 1, s[1], "#4f8a3c"); rect(s[0] + 1, 16 - s[1] + 3, 1, s[1] - 3, "#3b6a2c"); rect(s[0] - 1, 16 - s[1] + 4, 1, 3, "#6aa347"); rect(s[0] + 2, 16 - s[1] + 6, 1, 3, "#6aa347"); }); rect(6, 1, 3, 5, "#6b4a2a"); rect(6, 1, 3, 1, "#a07a46"); rect(6, 1, 1, 5, "#8a6238"); rect(10, 5, 2, 4, "#6b4a2a"); rect(10, 5, 2, 1, "#a07a46"); return; }
    if (kind === "bloom") { rect(7, 9, 2, 7, "#3a2a2a"); rect(4, 11, 3, 1, "#3a2a2a"); rect(9, 12, 3, 1, "#3a2a2a"); rect(5, 5, 6, 5, "#e8541a"); rect(6, 4, 4, 2, "#ff8a3d"); rect(7, 6, 2, 3, "#ffd25a"); rect(7, 7, 2, 1, "#fff2b0"); rect(3, 3, 1, 1, "#ffb13b", 0.8); rect(12, 4, 1, 1, "#ffb13b", 0.8); rect(11, 1, 1, 1, "#ffb13b", 0.6); return; }
    if (kind === "spike") { rect(3, 7, 3, 9, "#7fd6f0"); rect(4, 4, 1, 3, "#cdf6ff"); rect(3, 7, 1, 9, "#cdf6ff", 0.8); rect(7, 2, 3, 14, "#9fe8ff"); rect(8, 0, 1, 2, "#e6fbff"); rect(7, 2, 1, 14, "#ffffff", 0.7); rect(9, 6, 1, 10, "#5fb8d6", 0.7); rect(11, 8, 3, 8, "#7fd6f0"); rect(12, 5, 1, 3, "#cdf6ff"); rect(11, 8, 1, 8, "#cdf6ff", 0.8); return; }
    if (kind === "hole") {   // a little stone-ringed burrow in the ground
      rect(2, 9, 12, 7, "#6b7276"); rect(3, 8, 10, 1, "#82898d"); rect(5, 7, 6, 1, "#82898d"); rect(2, 9, 1, 7, "#8f979b"); rect(13, 10, 1, 6, "#4a5054");
      rect(4, 10, 8, 6, "#08090a"); rect(5, 9, 6, 1, "#08090a"); rect(5, 11, 6, 5, "#14100c"); rect(6, 13, 1, 1, "#4ee6b4", 0.35); rect(9, 14, 1, 1, "#4ee6b4", 0.25);
      rect(1, 14, 2, 2, "#5a6064"); rect(13, 14, 2, 2, "#5a6064"); rect(4, 8, 1, 1, "#9aa3a8", 0.7); return;
    }
    if (kind === "chair") {   // side view: tall back on the left, seat, four legs (the left-facing chair is the mirror image)
      var fl = id === T.CHAIR_L, R2 = function (x2, y2, w2, h2, c2, a2) { rect(fl ? 16 - x2 - w2 : x2, y2, w2, h2, c2, a2); };
      R2(3, 2, 2, 12, "#a8703c"); R2(3, 2, 1, 12, "#dc9a58"); R2(4, 3, 1, 10, "#6e431f", 0.6); R2(3, 4, 5, 1, "#a8703c"); R2(3, 4, 5, 1, "#c98c4f", 0.6);
      R2(3, 9, 9, 2, "#c98c4f"); R2(3, 9, 9, 1, "#e4aa6c"); R2(3, 11, 9, 1, "#6e431f"); R2(10, 11, 2, 5, "#8a5a32"); R2(10, 11, 1, 5, "#a8703c"); R2(3, 12, 2, 4, "#8a5a32"); R2(3, 12, 1, 4, "#a8703c");
      R2(5, 8, 5, 1, "#8d63c9"); R2(5, 7, 4, 1, "#b58cff"); return;   // a little purple cushion
    }
    if (kind === "table") {
      rect(0, 6, 16, 3, "#c98c4f"); rect(0, 6, 16, 1, "#e4aa6c"); rect(0, 9, 16, 1, "#6e431f"); rect(1, 10, 14, 1, "#8a5a32");
      rect(2, 10, 2, 6, "#8a5a32"); rect(2, 10, 1, 6, "#a8703c"); rect(12, 10, 2, 6, "#8a5a32"); rect(12, 10, 1, 6, "#a8703c"); rect(4, 13, 8, 1, "#6e431f", 0.7);
      rect(10, 3, 3, 3, "#f1efb4"); rect(10, 3, 3, 1, "#ffffe0"); rect(13, 4, 1, 1, "#d6d28a"); rect(10, 5, 3, 1, "#d6d28a");   // a mug
      return;
    }
    if (kind === "painting") {   // the hotbar / bag sample; real paintings are drawn per spot by paintingCanvas()
      rect(1, 1, 14, 14, "#6e431f"); rect(2, 2, 12, 12, "#c98c4f"); rect(3, 3, 10, 10, "#3a200d");
      [["#e8541a", 3, 3], ["#ffd25a", 6, 3], ["#4ee6b4", 9, 3], ["#8d63c9", 3, 6], ["#2a8f95", 6, 6], ["#ff8fc0", 9, 6], ["#5fb24a", 3, 9], ["#7fd6ff", 6, 9], ["#f2c14e", 9, 9]].forEach(function (c) { rect(c[1], c[2], 4, 4, c[0]); });
      return;
    }
    if (kind === "door") { paintDoor(rect, hh, td.door); return; }
    if (kind === "chest") {   // iron-banded swamp chest with a brass lock and a little moss
      rect(1, 7, 14, 8, "#8a5328"); rect(1, 7, 14, 1, "#6e431f"); rect(1, 9, 14, 1, "#a8703c", 0.5); rect(1, 12, 14, 1, "#6e431f", 0.6);
      rect(1, 3, 14, 4, "#a8703c"); rect(2, 2, 12, 1, "#a8703c"); rect(2, 2, 12, 1, "#dc9a58"); rect(1, 3, 14, 1, "#c98c4f"); rect(1, 6, 14, 1, "#6e431f");
      rect(3, 2, 2, 13, "#4a4a52"); rect(11, 2, 2, 13, "#4a4a52"); rect(3, 2, 1, 13, "#9aa0ac"); rect(11, 2, 1, 13, "#9aa0ac");
      rect(7, 6, 2, 4, "#f2c14e"); rect(7, 6, 2, 1, "#fff2b0"); rect(8, 8, 1, 1, "#3a200d");
      rect(1, 15, 14, 1, "#2a190d"); rect(1, 3, 1, 12, "#000", 0.2); rect(14, 3, 1, 12, "#000", 0.25);
      rect(4, 3, 3, 1, "#3f8f3a"); rect(5, 3, 1, 1, "#4ee6b4");
      return;
    }
    if (kind === "ladder") {   // two wooden rails with rope-lashed rungs
      rect(2, 0, 3, 16, "#a8703c"); rect(2, 0, 1, 16, "#dc9a58"); rect(4, 0, 1, 16, "#6e431f"); rect(11, 0, 3, 16, "#a8703c"); rect(11, 0, 1, 16, "#dc9a58"); rect(13, 0, 1, 16, "#6e431f");
      [1, 5, 9, 13].forEach(function (y) { rect(5, y, 6, 2, "#c98c4f"); rect(5, y, 6, 1, "#e4aa6c"); rect(5, y + 2, 6, 1, "#000", 0.25); rect(2, y, 3, 1, "#c9b58a"); rect(11, y, 3, 1, "#c9b58a"); });
      return;
    }
    if (kind === "log") { paintLog(rect, hh); return; }
    if (kind === "planks") { paintPlanks(rect, hh); return; }
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
    if (kind === "leaves") paintLeaf(g, ox, oy, v, 0);
    if (kind === "ore") for (var j = 0; j < 4; j++) {
      var gx = 2 + Math.floor(hh(j, 3, 5) * 10), gy = 2 + Math.floor(hh(j, 4, 6) * 10);
      rect(gx - 1, gy - 1, 5, 4, td.c2, 0.22); rect(gx, gy, 3, 2, td.c2); rect(gx, gy, 1, 1, "#ffffff", 0.9); rect(gx + 2, gy + 1, 1, 1, "#000", 0.3); rect(gx + 1, gy + 2, 1, 1, td.c2, 0.7);
    }
    if (id === T.FROSTROCK) { for (k = 0; k < 3; k++) { var qx = 1 + Math.floor(hh(k, 8, 2) * 11), qy = 1 + Math.floor(hh(k, 9, 3) * 11); rect(qx, qy, 3, 1, "#b8d6e8", 0.7); rect(qx + 2, qy + 1, 1, 2, "#b8d6e8", 0.6); rect(qx, qy + 1, 1, 1, "#2d4558", 0.6); } rect(0, 0, 16, 1, "#dff3ff", 0.18); }
    if (id === T.BEDROCK) for (k = 0; k < 9; k++) rect(Math.floor(hh(k, 0, 6) * 14), Math.floor(hh(k, 1, 7) * 14), 2, 2, td.c2);
    if (td.solid && kind !== "leaves") rect(0, 15, 16, 1, "#000", 0.16);
  }
  // Each pick is styled after what it is made from: Reed (reed stalk + pebble head), Glowspore (glowing green crystal),
  // Cinder (charred handle, basalt head with lava veins), Frost (ice crystal). 32x32 canvas.
  function drawPickIcon(g, tier) {
    var P = [null,
      { h1: "#d8c48e", h2: "#a8905a", hl: "#f4e8bf", head: "#8e969b", head2: "#c3c9cc", edge: "#4a5256" },
      { h1: "#5a3d26", h2: "#3a2616", hl: "#8a6440", head: "#1fbf93", head2: "#9bfbe0", edge: "#0b5d48" },
      { h1: "#2a2024", h2: "#150f12", hl: "#5a464e", head: "#3b3036", head2: "#ff8a3d", edge: "#120c0f" },
      { h1: "#bfe9f7", h2: "#7fcfe8", hl: "#ffffff", head: "#7fd6ff", head2: "#e6fbff", edge: "#2f7fa3" }][tier];
    var line = function (x1, y1, x2, y2, c, w) { g.strokeStyle = c; g.lineWidth = w; g.lineCap = "round"; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    // handle
    line(6, 28, 19, 12, P.edge, 5.2); line(6, 28, 19, 12, P.h2, 3.8); line(6.4, 27.4, 18.6, 12.2, P.h1, 2.2); line(7, 26, 12, 19.8, P.hl, 1);
    var crescent = function (fill, stroke) {
      g.beginPath(); g.moveTo(3, 16); g.quadraticCurveTo(13, -1, 30, 9); g.quadraticCurveTo(15, 6.5, 8, 21); g.quadraticCurveTo(6, 19, 3, 16); g.closePath();
      g.fillStyle = fill; g.fill(); g.strokeStyle = stroke; g.lineWidth = 1.6; g.lineJoin = "round"; g.stroke();
    };
    if (tier === 1) {
      line(15, 18, 20, 12, "#4f8a3c", 3.4); line(10, 24, 14, 19, "#4f8a3c", 3); line(15.4, 17.6, 19.6, 12.4, "#8fd37a", 1);   // fiber lashings
      crescent(P.head, P.edge); g.strokeStyle = P.head2; g.lineWidth = 1.4; g.beginPath(); g.moveTo(7, 13.5); g.quadraticCurveTo(14, 5.5, 24, 8); g.stroke();
      g.fillStyle = "#5d666b"; g.fillRect(12, 8, 2, 2); g.fillRect(19, 9, 2, 1);
      line(15, 14, 21, 12.5, "#4f8a3c", 3.6); line(15.5, 13.8, 20.5, 12.7, "#8fd37a", 1.2);
    } else if (tier === 2) {
      g.shadowColor = "#4ee6b4"; g.shadowBlur = 7; crescent(P.head, P.edge); g.shadowBlur = 0;
      g.fillStyle = P.head2; [[11, 5.8, 12, 9], [18, 4.6, 19.2, 8.6]].forEach(function (c) { g.beginPath(); g.moveTo(c[0], c[3] + 1); g.lineTo(c[0] + 1.6, c[1]); g.lineTo(c[2] + 2.4, c[3] + 1); g.closePath(); g.fill(); });
      g.strokeStyle = P.head2; g.lineWidth = 1.3; g.beginPath(); g.moveTo(6.5, 14.5); g.quadraticCurveTo(14, 5, 26, 8.5); g.stroke();
      g.fillStyle = "#d8fff6"; g.fillRect(24, 5, 2, 2); g.fillRect(3, 12, 1.5, 1.5);   // glints
      g.fillStyle = "#4ee6b4"; g.fillRect(8, 24, 2, 2); g.fillRect(12, 28, 1.5, 1.5);  // spore specks on the handle
    } else if (tier === 3) {
      crescent(P.head, P.edge);
      g.strokeStyle = "#ff6a1f"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(6.5, 15); g.lineTo(11, 11); g.lineTo(14, 12); g.lineTo(19, 8); g.lineTo(25, 8.6); g.stroke();   // lava vein
      g.strokeStyle = "#ffc24a"; g.lineWidth = 0.8; g.stroke();
      g.shadowColor = "#ff8a3d"; g.shadowBlur = 6; g.fillStyle = "#ffb13b"; g.fillRect(28, 8, 2, 2); g.shadowBlur = 0;
      line(9, 24, 12, 20.5, "#ff6a1f", 1.2); line(14, 18, 16.5, 14.8, "#ff8a3d", 1);   // glowing cracks in the handle
      g.fillStyle = "#ffc24a"; g.fillRect(4, 8, 1.5, 1.5); g.fillRect(25, 2, 1.5, 1.5); g.fillRect(2, 22, 1.2, 1.2);   // embers
    } else {
      g.shadowColor = "#bff4ff"; g.shadowBlur = 8; crescent(P.head, P.edge); g.shadowBlur = 0;
      g.fillStyle = "rgba(255,255,255,.55)"; g.beginPath(); g.moveTo(5, 15); g.quadraticCurveTo(13, 3.5, 24, 7); g.quadraticCurveTo(14, 7.5, 8.5, 17.5); g.closePath(); g.fill();
      g.strokeStyle = P.edge; g.lineWidth = 0.9; g.beginPath(); g.moveTo(12, 8); g.lineTo(14, 11); g.moveTo(19, 7.4); g.lineTo(18, 10.2); g.stroke();   // ice facets
      g.fillStyle = "#fff"; g.fillRect(27, 5, 1.6, 4); g.fillRect(25.8, 6.2, 4, 1.6); g.fillRect(4, 8, 1, 3); g.fillRect(3, 9, 3, 1);   // sparkles
      line(8, 27, 11, 23.4, "#ffffffaa", 1.2);
    }
  }
  // Weapon art: same 32x32 box and grip corner as the picks, so it sits in the hand the same way (grip bottom-left, tip top-right).
  function drawShovelIcon(g) {   // same 32x32 box and grip corner as the picks: grip bottom-left, blade top-right
    var line = function (x1, y1, x2, y2, c, w) { g.strokeStyle = c; g.lineWidth = w; g.lineCap = "round"; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    line(6, 28, 20, 11, "#4a5256", 5.2); line(6, 28, 20, 11, "#a8905a", 3.8); line(6.4, 27.4, 19.6, 11.4, "#d8c48e", 2.2); line(7, 26, 12, 19.8, "#f4e8bf", 1);
    line(14, 19, 18, 14, "#4f8a3c", 3.2); line(14.4, 18.6, 17.6, 14.4, "#8fd37a", 1);   // fiber lashing
    g.save(); g.translate(20, 11); g.rotate(-0.88); g.lineJoin = "round";
    g.fillStyle = "#5d666b"; g.strokeStyle = "#4a5256"; g.lineWidth = 1.2; g.fillRect(0, -3.2, 3.4, 6.4); g.strokeRect(0, -3.2, 3.4, 6.4);   // iron collar
    g.beginPath(); g.moveTo(3.2, -3.6); g.quadraticCurveTo(12.5, -7.2, 14.2, 0); g.quadraticCurveTo(12.5, 7.2, 3.2, 3.6); g.closePath();
    var gr = g.createLinearGradient(0, -6, 0, 6); gr.addColorStop(0, "#c3c9cc"); gr.addColorStop(1, "#7d868b"); g.fillStyle = gr; g.fill(); g.strokeStyle = "#4a5256"; g.lineWidth = 1.5; g.stroke();
    g.strokeStyle = "rgba(255,255,255,.75)"; g.lineWidth = 1; g.beginPath(); g.moveTo(5, -2.4); g.quadraticCurveTo(10.5, -4.4, 12, -0.6); g.stroke();
    g.strokeStyle = "rgba(60,40,20,.45)"; g.lineWidth = 1; g.beginPath(); g.moveTo(6, 1.6); g.lineTo(11, 0.6); g.moveTo(6, 3); g.lineTo(9.5, 2.6); g.stroke();   // dirt stains
    g.restore();
  }
  function drawWeaponIcon(g, tier) {
    var P = [null,
      { h1: "#d8c48e", h2: "#a8905a", edge: "#4a5256", b1: "#8e969b", b2: "#e3e8ea" },
      { h1: "#5a3d26", h2: "#3a2616", edge: "#0b5d48", b1: "#1fbf93", b2: "#c8fff0" },
      { h1: "#2a2024", h2: "#150f12", edge: "#120c0f", b1: "#3b3036", b2: "#ff8a3d" },
      { h1: "#bfe9f7", h2: "#7fcfe8", edge: "#2f7fa3", b1: "#7fd6ff", b2: "#f2fdff" }][tier];
    if (!P) return;
    var line = function (x1, y1, x2, y2, c, w) { g.strokeStyle = c; g.lineWidth = w; g.lineCap = "round"; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    var blade = function (w, fill) {   // blade along the grip direction, from the guard near (13,19) to the tip (29,3)
      g.beginPath(); g.moveTo(12, 20); g.lineTo(13 - w, 19 - w); g.lineTo(29, 3); g.lineTo(13 + w, 19 + w); g.closePath();
      g.fillStyle = fill; g.fill(); g.strokeStyle = P.edge; g.lineWidth = 1.5; g.lineJoin = "round"; g.stroke();
    };
    if (tier === 1) {   // spear: long reed shaft, stone head, fibre lashing
      line(5, 29, 22, 10, P.edge, 5); line(5, 29, 22, 10, P.h2, 3.6); line(5.4, 28.4, 21.6, 10.4, P.h1, 1.8);
      g.beginPath(); g.moveTo(19, 13); g.lineTo(21, 7); g.lineTo(30, 2); g.lineTo(26, 11); g.lineTo(23, 14); g.closePath(); g.fillStyle = P.b1; g.fill(); g.strokeStyle = P.edge; g.lineWidth = 1.5; g.lineJoin = "round"; g.stroke();
      line(24, 5.6, 21.6, 11.4, P.b2, 1.1); line(18, 15, 24, 12, "#4f8a3c", 3.4); line(18.4, 14.7, 23.6, 12.3, "#8fd37a", 1);
      return;
    }
    line(5, 29, 12, 21, P.edge, 5.2); line(5, 29, 12, 21, P.h2, 3.8); line(5.4, 28.4, 11.6, 21.2, P.h1, 1.8);   // grip
    if (tier === 2) {
      g.shadowColor = "#4ee6b4"; g.shadowBlur = 7; blade(3.4, P.b1); g.shadowBlur = 0;
      line(14, 18, 27.5, 4.6, P.b2, 1.4); g.fillStyle = "#d8fff6"; g.fillRect(25, 8, 2, 2); g.fillRect(17, 6, 1.5, 1.5);
      line(8.5, 17, 16, 24, "#4ee6b4", 3); line(8.5, 17, 16, 24, "#9bfbe0", 1);   // glowing guard
    } else if (tier === 3) {
      blade(4.6, P.b1); g.strokeStyle = "#ff6a1f"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(14, 18); g.lineTo(17.5, 15); g.lineTo(19, 16.5); g.lineTo(23, 11); g.lineTo(26.5, 6.6); g.stroke();
      g.strokeStyle = "#ffc24a"; g.lineWidth = 0.8; g.stroke(); g.shadowColor = "#ff8a3d"; g.shadowBlur = 6; g.fillStyle = "#ffb13b"; g.fillRect(27, 3, 2.4, 2.4); g.shadowBlur = 0;
      line(8, 16.6, 16.6, 24.4, "#150f12", 3.6); line(8, 16.6, 16.6, 24.4, "#ff6a1f", 1.1);
      g.fillStyle = "#ffc24a"; g.fillRect(4, 9, 1.5, 1.5); g.fillRect(24, 1, 1.4, 1.4);
    } else {
      g.shadowColor = "#bff4ff"; g.shadowBlur = 8; blade(3.2, P.b1); g.shadowBlur = 0;
      g.fillStyle = "rgba(255,255,255,.6)"; g.beginPath(); g.moveTo(13, 18); g.lineTo(28, 3.6); g.lineTo(16, 18); g.closePath(); g.fill();
      line(8.4, 17.4, 16.4, 24.4, P.edge, 3.8); line(8.4, 17.4, 16.4, 24.4, P.b2, 1.8);
      g.fillStyle = "#fff"; g.fillRect(27, 7, 1.6, 4); g.fillRect(25.8, 8.2, 4, 1.6); g.fillRect(4, 11, 1, 3); g.fillRect(3, 12, 3, 1);
    }
  }
  function icon(id) {
    var key = id === "pick" ? "pick" + S.tier : id === "weapon" ? "weapon" + S.wpn : id;   // "shovel" is its own key
    if (ICO[key]) return ICO[key];
    var c = document.createElement("canvas"); c.width = c.height = 32; var g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    if (id === "pick" && S.tier === 0) {
      g.fillStyle = "#8fd37a"; g.strokeStyle = "#2f6b2a"; g.lineWidth = 1.5;
      [[16, 20, 7.5, 6.2], [7.5, 12.5, 2.9, 3.6], [13, 7.6, 2.9, 3.6], [19.5, 7.6, 2.9, 3.6], [25, 12.5, 2.9, 3.6]].forEach(function (e) { g.beginPath(); g.ellipse(e[0], e[1], e[2], e[3], 0, 0, 6.2832); g.fill(); g.stroke(); });
      g.fillStyle = "#c9f2b4"; g.beginPath(); g.ellipse(14, 18, 3, 2, -0.5, 0, 6.2832); g.fill();
    } else if (id === "pick") {
      drawPickIcon(g, S.tier);
    } else if (id === "shovel") {
      drawShovelIcon(g);
    } else if (id === "weapon") {
      drawWeaponIcon(g, S.wpn);
    } else if (/^wpn\d$/.test(id)) {
      drawWeaponIcon(g, +id.slice(3));
    } else if (ITEMS[id].mat) {
      var mt = ITEMS[id].mat; g.lineCap = "round";
      if (mt === "stick") { [[7, 26, 25, 7, "#8a5a32", 4], [10, 9, 24, 25, "#6a4426", 3.4]].forEach(function (l) { g.strokeStyle = l[4]; g.lineWidth = l[5]; g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.stroke(); }); g.strokeStyle = "#c9935a"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(8, 24); g.lineTo(23, 8); g.stroke(); }
      else if (mt === "fiber") { [["#4f8a3c", 10], ["#6aa347", 16], ["#3b6a2c", 22]].forEach(function (c) { g.strokeStyle = c[0]; g.lineWidth = 3.2; g.beginPath(); g.moveTo(c[1], 28); g.quadraticCurveTo(c[1] + (c[1] > 14 ? 6 : -6), 14, c[1] + (c[1] > 14 ? 3 : -3), 4); g.stroke(); }); g.strokeStyle = "#e8d9a8"; g.lineWidth = 3; g.beginPath(); g.moveTo(8, 19); g.lineTo(25, 19); g.stroke(); }
      else { [[11, 20, 8, 6, "#8e969b"], [21, 17, 6.5, 5, "#a7afb3"]].forEach(function (e) { g.fillStyle = e[4]; g.strokeStyle = "#00000066"; g.lineWidth = 1.5; g.beginPath(); g.ellipse(e[0], e[1], e[2], e[3], 0, 0, 6.2832); g.fill(); g.stroke(); g.fillStyle = "#ffffff66"; g.beginPath(); g.ellipse(e[0] - 2, e[1] - 2, e[2] * 0.4, e[3] * 0.3, 0, 0, 6.2832); g.fill(); }); }
    } else if (ITEMS[id].frag === "bug") {   // a chip of Bramble Bug shell with a thorn
      g.fillStyle = "#2a1432"; g.strokeStyle = "#12061a"; g.lineWidth = 1.5; g.lineJoin = "round";
      g.beginPath(); g.moveTo(4, 25); g.quadraticCurveTo(5, 10, 17, 9); g.lineTo(28, 25); g.closePath(); g.fill(); g.stroke();
      var sgb = g.createLinearGradient(0, 9, 0, 25); sgb.addColorStop(0, "#7a3d86"); sgb.addColorStop(1, "#3a1d42"); g.fillStyle = sgb; g.beginPath(); g.moveTo(6, 24); g.quadraticCurveTo(7, 12, 17, 11); g.lineTo(25, 24); g.closePath(); g.fill();
      g.strokeStyle = "#ff6b82"; g.lineWidth = 1.3; g.beginPath(); g.moveTo(12, 23); g.quadraticCurveTo(14, 17, 17, 13); g.stroke();
      g.fillStyle = "#f1e5d0"; g.strokeStyle = "#12061a"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(15, 12); g.lineTo(20, 2); g.lineTo(23, 14); g.closePath(); g.fill(); g.stroke(); g.fillStyle = "#ff6b82"; g.beginPath(); g.arc(20, 3.6, 1.7, 0, 6.2832); g.fill();
    } else if (ITEMS[id].frag === "frog") {   // a green frog scale with spots and a golden eye gem
      g.fillStyle = "#1c5e34"; g.strokeStyle = "#0e2f1a"; g.lineWidth = 1.5; g.lineJoin = "round";
      g.beginPath(); g.moveTo(16, 3); g.quadraticCurveTo(29, 14, 24, 25); g.quadraticCurveTo(16, 31, 8, 25); g.quadraticCurveTo(3, 14, 16, 3); g.closePath(); g.fill(); g.stroke();
      var sgf = g.createLinearGradient(0, 4, 0, 28); sgf.addColorStop(0, "#7ee08a"); sgf.addColorStop(1, "#2f9e52"); g.fillStyle = sgf; g.beginPath(); g.moveTo(16, 6); g.quadraticCurveTo(26, 15, 22, 24); g.quadraticCurveTo(16, 28, 10, 24); g.quadraticCurveTo(6, 15, 16, 6); g.closePath(); g.fill();
      g.fillStyle = "#2a8a47"; [[12, 17, 2], [19, 20, 1.6], [16, 12, 1.4]].forEach(function (d) { g.beginPath(); g.arc(d[0], d[1], d[2], 0, 6.2832); g.fill(); });
      g.fillStyle = "#f1efb4"; g.beginPath(); g.ellipse(16, 24, 5, 2, 0, 0, 3.1416); g.fill();
      g.fillStyle = "#ffd23f"; g.strokeStyle = "#0e2f1a"; g.lineWidth = 1; g.beginPath(); g.arc(16, 16, 3.4, 0, 6.2832); g.fill(); g.stroke(); g.fillStyle = "#12220f"; g.beginPath(); g.ellipse(16.5, 16, 0.9, 2.4, 0, 0, 6.2832); g.fill();
    } else if (ITEMS[id].frag === "bat") {   // a scalloped bat wing on a bone arm
      g.fillStyle = "#2a1744"; g.strokeStyle = "#12061a"; g.lineWidth = 1.5; g.lineJoin = "round";
      g.beginPath(); g.moveTo(4, 8); g.quadraticCurveTo(16, 2, 28, 10); g.lineTo(24, 16); g.quadraticCurveTo(22, 21, 19, 18); g.quadraticCurveTo(17, 25, 13, 20); g.quadraticCurveTo(10, 25, 8, 19); g.quadraticCurveTo(4, 17, 4, 8); g.closePath(); g.fill(); g.stroke();
      var sgw = g.createLinearGradient(0, 4, 0, 24); sgw.addColorStop(0, "#8d63c9"); sgw.addColorStop(1, "#3d2466"); g.fillStyle = sgw;
      g.beginPath(); g.moveTo(6, 9); g.quadraticCurveTo(16, 4, 26, 11); g.lineTo(22, 15); g.quadraticCurveTo(20, 19, 18, 16); g.quadraticCurveTo(16, 22, 13, 18); g.quadraticCurveTo(10, 22, 8, 17); g.quadraticCurveTo(5, 15, 6, 9); g.closePath(); g.fill();
      g.strokeStyle = "#e9dcff"; g.lineWidth = 1.3; g.beginPath(); g.moveTo(5, 9); g.quadraticCurveTo(16, 3, 27, 10); g.moveTo(6, 9); g.lineTo(13, 18); g.moveTo(27, 10); g.lineTo(18, 16); g.stroke();
      g.fillStyle = "#b58cff"; g.beginPath(); g.arc(7, 8, 1.6, 0, 6.2832); g.fill();
    } else if (ITEMS[id].gem) {
      var gc = ITEMS[id].gem; g.fillStyle = gc; g.beginPath(); g.moveTo(16, 4); g.lineTo(26, 14); g.lineTo(16, 28); g.lineTo(6, 14); g.closePath(); g.fill();
      g.fillStyle = "#ffffff88"; g.beginPath(); g.moveTo(16, 4); g.lineTo(21, 14); g.lineTo(16, 14); g.lineTo(11, 14); g.closePath(); g.fill();
      g.strokeStyle = "#00000055"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(16, 4); g.lineTo(26, 14); g.lineTo(16, 28); g.lineTo(6, 14); g.closePath(); g.stroke();
    } else if (id === "door") { g.imageSmoothingEnabled = false; g.drawImage(ATLAS, 0, T.DOOR_T * 16, 16, 16, 8, 1, 16, 15); g.drawImage(ATLAS, 0, T.DOOR_B * 16, 16, 16, 8, 16, 16, 15); }
    else { var t = ITEMS[id].tile; g.drawImage(ATLAS, 0, t * 16, 16, 16, 2, 2, 28, 28); }
    return (ICO[key] = c.toDataURL());
  }

  // ---------- PLAYER SPRITE (your avatar, gear included) ----------
  var spriteOutfit = null;
  function mkSprite() {   // the pixel full-body avatar (delve-avatar.js) is rebuilt whenever the Armory outfit or animal changes
    var key = S.animal + "|" + (function () { try { return JSON.stringify(Crystals.outfit()); } catch (e) { return ""; } })();
    if (key === spriteKey) return; spriteKey = key; sprite = null;
    try { spriteOutfit = Object.assign({}, Crystals.outfit(), { animal: S.animal }); } catch (e) { spriteOutfit = { animal: S.animal }; }
  }
  function getSprite() {
    if (typeof DelveAv === "undefined") return null;
    var sc = Math.max(1, Math.round(ts * 1.7 / 24));   // whole pixels per art pixel, so the art stays crisp
    if (!sprite || sprite.s !== sc) { try { sprite = DelveAv.sprite(spriteOutfit || { animal: S.animal }, S.animal, sc); } catch (e) { sprite = null; } }
    return sprite;
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
    if (td.kind === "door") {   // both halves go together and you get one Door back
      var db = td.door.top ? y + 1 : y; delete doorAuto[db * W + x];
      setT(x, db, T.AIR); if (db - 1 >= 0) setT(x, db - 1, T.AIR); S.st.mined++;
      chips(x + 0.5, db, "#b9793f", 10, 6); thud(170, 0.08); give("door", 1, x, y); return;
    }
    if (id === T.CHEST) delete S.chests[x + "," + y];
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
    if (item === "door") {
      if (ty < 2 || get(tx, ty - 1) !== T.AIR) { nag("A door needs two free tiles stacked up."); return false; }
      if (!TILES[get(tx, ty + 1)].solid) { nag("A door needs solid ground under it."); return false; }
      if (doorInTheWay(tx, ty)) { nag("Something is in the way."); return false; }
      return true;
    }
    if (item === "chest" && !TILES[get(tx, ty + 1)].solid) { nag("A chest needs solid ground under it."); return false; }
    if ((item === "chair" || item === "table") && !TILES[get(tx, ty + 1)].solid) { nag("Furniture needs solid ground under it."); return false; }
    if (item === "bed" && !TILES[get(tx, ty + 1)].solid) { nag("A bed needs solid ground under it."); return false; }
    if (solid && tx + 1 > p.x - PW / 2 && tx < p.x + PW / 2 && ty + 1 > p.y - PH && ty < p.y) return false;
    if (item === "ladder") { var lk = function (a, b) { var q = get(a, b); return TILES[q].solid || q === T.LADDER; }; return lk(tx - 1, ty) || lk(tx + 1, ty) || lk(tx, ty - 1) || lk(tx, ty + 1); }
    return TILES[get(tx - 1, ty)].solid || TILES[get(tx + 1, ty)].solid || TILES[get(tx, ty - 1)].solid || TILES[get(tx, ty + 1)].solid;
  }
  function place(tx, ty, item) {
    setT(tx, ty, ITEMS[item].tile); S.inv[item]--; S.st.placed++; if (item === "torch") S.st.torches++; if (item === "bench") S.st.benches++; if (item === "bed") S.st.beds++;
    if (item === "door") { setT(tx, ty - 1, T.DOOR_T); S.st.doors++; }
    if (item === "chair" || item === "table" || item === "painting") S.st.decor++;
    if (item === "chair" && p.face < 0) setT(tx, ty, T.CHAIR_L);
    if (item === "ladder") S.st.ladders++;
    if (item === "chest") S.st.chests++;
    chips(tx + 0.5, ty + 0.5, TILES[ITEMS[item].tile].c2 || "#fff", 4, 3); thud(item === "torch" ? 420 : 240, 0.05);
    if (S.inv[item] <= 0) { delete S.inv[item]; if (sel === item) sel = "pick"; }
    hbDirty = true; if (panelOpen) renderPanel();
  }
  // ---------- ENEMIES: Bramble Bug and Swamp Frog (the first two Swamp Realms Adventure enemies, rebuilt for Delve) ----------
  // Sizes are in tiles. dmg is health taken from you. They only roam once you carry a weapon (S.wpn >= 1), only in Murkwater Swamp, and drop the same Fragments the Adventure uses.
  var ENEMY = {
    bug: { n: "Bramble Bug", hp: 12, w: 1.1, h: 0.8, dmg: 9, glow: "#ff6b82", chip: "#9a52a8", frag: "bugfrag", chance: 0.6, max: 3 },
    frog: { n: "Swamp Frog", hp: 18, w: 0.95, h: 0.85, dmg: 12, body: 6, glow: "#4ee6b4", chip: "#6fe08a", frag: "frogfrag", chance: 0.6, max: 2 },
    bat: { n: "Dusk Bat", hp: 10, w: 0.9, h: 0.6, dmg: 6, glow: "#b58cff", chip: "#6a4a9a", frag: "batwing", chance: 0.5, max: 6 }   // hp +4 and dmg +2 per weapon tier (see newEnemy)
  };
  var FROG = { aggro: 5.5, reach: 2.5, wind: 0.5, lash: 0.2, recover: 0.95, hopV: 10, hopX: 3.2 };
  // Dusk Bat: a night-only flier. It spawns in the sky above you, drifts overhead, shows red eyes (wind-up), then dives in a straight line. Step aside during the dive.
  // from/to = clock times (0-480) when bats are out (late dusk to early dawn); a roof or the ground stops them, and at dawn they flap away.
  var BAT = { hover: 4, wind: 0.5, dive: 0.6, speed: 9.5, cruise: 4.2, from: 268, to: 446 };
  var enemies = [], spawnT = 6, swingQ = 0, batT = 8, sleepT = 0, slept = false, bedBtn = null;
  function eBoxHit(x, y, w, h) {
    var x0 = Math.floor(x - w / 2 + 1e-4), x1 = Math.floor(x + w / 2 - 1e-4), y0 = Math.floor(y - h + 1e-4), y1 = Math.floor(y - 1e-4);
    for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) if (blocks(xx, yy)) return true;
    return false;
  }
  function moveEnemy(e, dt, vx) {
    var wet = TILES[get(Math.floor(e.x), Math.floor(e.y - 0.3))].kind === "water";
    e.vy = Math.min(wet ? 3 : 20, e.vy + (wet ? 10 : 40) * dt);
    var nx = clamp(e.x + (vx + e.kv) * dt, 1, W - 1); e.kv *= Math.max(0, 1 - 9 * dt); if (Math.abs(e.kv) < 0.2) e.kv = 0; e.blocked = false;
    if (!eBoxHit(nx, e.y, e.w, e.h)) e.x = nx;
    else if (e.on && !eBoxHit(nx, e.y - 1.001, e.w, e.h) && !eBoxHit(e.x, e.y - 1.001, e.w, e.h)) { e.x = nx; e.y -= 1; }
    else e.blocked = true;
    var ny = e.y + e.vy * dt; e.on = false;
    if (!eBoxHit(e.x, ny, e.w, e.h)) e.y = ny;
    else if (e.vy > 0) { e.y = Math.floor(ny); var gg = 0; while (eBoxHit(e.x, e.y, e.w, e.h) && gg++ < 4) e.y -= 1; e.on = true; e.vy = 0; }
    else { e.y = Math.ceil(ny - e.h) + e.h; e.vy = 0; }
    if (e.y > H - 2) { e.y = H - 2.01; e.vy = 0; }
  }
  function overlapP(e) { return p.x + PW / 2 > e.x - e.w / 2 && p.x - PW / 2 < e.x + e.w / 2 && p.y > e.y - e.h && p.y - PH < e.y; }
  function shoved(e) { p.vx = (p.x >= e.x ? 1 : -1) * 6.5; p.vy = -6; p.on = false; }
  function newEnemy(k, x, y) {
    var d = ENEMY[k], hp0 = k === "bat" ? d.hp + 4 * S.wpn : d.hp; return { k: k, x: x, y: y, hx: x, vx: 0, vy: 0, kv: 0, on: false, dir: Math.random() < 0.5 ? -1 : 1, hp: hp0, mx: hp0, dmg: k === "bat" ? d.dmg + 2 * S.wpn : d.dmg, w: d.w, h: d.h, hurt: 0, dead: 0, def: false, st: k === "frog" ? "idle" : k === "bat" ? "hover" : "patrol", t: 1 + Math.random() * 2, tt: Math.random() * 6, cd: 0, ext: 0, hvx: 0, blocked: false, fl: Math.random() * 6, ph: Math.random() * 6, leave: 0, gone: false, ax: 0, ay: 0 };
  }
  function updateBug(e, dt) {
    var dx = p.x - e.x, near = Math.abs(dx) < 7.5 && Math.abs(p.y - e.y) < 3.2 && hp > 0, vx = 0;
    if (e.hurt > 0) vx = 0;
    else if (e.st === "retreat") { e.t -= dt; vx = e.dir * 2.4; if (e.t <= 0) e.st = "patrol"; }
    else if (near && e.cd <= 0) { e.st = "charge"; e.dir = dx >= 0 ? 1 : -1; vx = e.dir * 3.6; }
    else {
      e.st = "patrol"; e.t -= dt; if (e.t <= 0) { e.t = 2 + Math.random() * 3; if (Math.random() < 0.35) e.dir = -e.dir; }
      var ax = Math.floor(e.x + e.dir * 0.9); if (!blocks(ax, Math.floor(e.y + 0.3)) && !blocks(ax, Math.floor(e.y + 1.3))) e.dir = -e.dir;
      if (e.blocked) e.dir = -e.dir; vx = e.dir * 1.3;
    }
    moveEnemy(e, dt, vx);
    if (e.hurt <= 0 && e.cd <= 0 && overlapP(e) && hp > 0 && hurtGrace <= 0) { hurt(ENEMY.bug.dmg, "bug"); shoved(e); e.st = "retreat"; e.t = 0.9; e.dir = dx >= 0 ? -1 : 1; e.cd = 1.2; }
  }
  function updateFrog(e, dt) {
    var dx = p.x - e.x, near = Math.abs(dx) < FROG.aggro && Math.abs(p.y - e.y) < 3 && hp > 0, vx = 0;
    if (e.hurt > 0) { if (e.st === "wind" || e.st === "lash") { e.st = "idle"; e.t = 0.4; e.ext = 0; } vx = e.on ? 0 : e.hvx; }
    else if (e.on) {
      if (e.st === "hop") { e.st = "idle"; e.t = 0.4 + Math.random() * 0.5; }
      e.hvx = 0;
      if (e.st === "idle") {
        e.t -= dt;
        if (e.t <= 0) {
          if (near && e.cd <= 0) { e.st = "wind"; e.t = FROG.wind; e.dir = dx >= 0 ? 1 : -1; thud(520, 0.05); }
          else {
            if (near) e.dir = dx >= 0 ? 1 : -1; else if (Math.abs(e.x - e.hx) > 6) e.dir = e.hx > e.x ? 1 : -1; else if (Math.random() < 0.3) e.dir = -e.dir;
            e.st = "hop"; e.vy = -FROG.hopV; e.on = false; e.hvx = e.dir * FROG.hopX;
          }
        }
      } else if (e.st === "wind") { e.t -= dt; e.dir = dx >= 0 ? 1 : -1; if (e.t <= 0) { e.st = "lash"; e.t = FROG.lash; e.ext = 0; } }
      else if (e.st === "lash") { e.t -= dt; e.ext = Math.sin(Math.PI * clamp(1 - e.t / FROG.lash, 0, 1)); if (e.t <= 0) { e.st = "recover"; e.t = FROG.recover; e.cd = 1.5; e.ext = 0; } }
      else if (e.st === "recover") { e.t -= dt; if (e.t <= 0) { e.st = "idle"; e.t = 0.5; } }
    } else vx = e.hvx;
    moveEnemy(e, dt, vx);
    if (hp <= 0 || hurtGrace > 0 || e.hurt > 0) return;
    if (e.st === "lash" && e.ext > 0.08) {   // the tongue is a low strip along the ground: jump it
      var a = e.x + e.dir * 0.4, b = e.x + e.dir * (0.4 + FROG.reach * e.ext), l = Math.min(a, b), r = Math.max(a, b);
      if (p.x + PW / 2 > l && p.x - PW / 2 < r && p.y > e.y - 0.7 && p.y - PH < e.y - 0.15) { hurt(ENEMY.frog.dmg, "frog"); shoved(e); return; }
    }
    if (e.st !== "recover" && overlapP(e)) { hurt(ENEMY.frog.body, "frog"); shoved(e); }
  }
  var batNight = function (t) { return t >= BAT.from && t < BAT.to; };
  function batMax() { return clamp(1 + S.wpn + (S.time > 380 ? 1 : 0), 2, ENEMY.bat.max); }   // more bats as your weapons improve, and a few extra late in the night
  function moveBat(e, dt) {   // fliers ignore gravity but still stop at walls, roofs and the ground
    var nx = clamp(e.x + (e.vx + e.kv) * dt, 1, W - 1); e.kv *= Math.max(0, 1 - 9 * dt); if (Math.abs(e.kv) < 0.2) e.kv = 0; e.blocked = false;
    if (!eBoxHit(nx, e.y, e.w, e.h)) e.x = nx; else e.blocked = true;
    var ny = clamp(e.y + e.vy * dt, 1.2, H - 3);
    if (!eBoxHit(e.x, ny, e.w, e.h)) e.y = ny; else e.blocked = true;
  }
  function updateBat(e, dt) {
    var cx = p.x - e.x, cy = (p.y - PH * 0.55) - (e.y - e.h * 0.5), tvx = 0, tvy = 0, alive = hp > 0;
    e.fl += dt * (e.st === "dive" ? 16 : 11); e.dir = cx >= 0 ? 1 : -1;
    if (e.leave > 0) { e.leave -= dt; tvx = e.ph > 3 ? 3 : -3; tvy = -6; if (e.leave <= 0 || e.y < 1.6) e.gone = true; }   // dawn, or you dug down out of reach: flap away
    else if (e.hurt > 0) { tvx = 0; tvy = 0; }
    else if (e.st === "away") { e.t -= dt; tvx = -e.dir * 2.5; tvy = -3.2; if (e.t <= 0) e.st = "hover"; }
    else if (e.st === "wind") {
      e.t -= dt; tvx = Math.sin(e.tt * 60) * 0.8; tvy = -1;
      if (e.t <= 0) { var ax = p.x - e.x, ay = (p.y - PH * 0.5) - (e.y - e.h * 0.5), l = Math.max(0.5, Math.sqrt(ax * ax + ay * ay)); e.ax = ax / l * BAT.speed; e.ay = ay / l * BAT.speed; e.st = "dive"; e.t = BAT.dive; thud(300, 0.05); }
    } else if (e.st === "dive") { e.t -= dt; tvx = e.ax; tvy = e.ay; if (e.t <= 0 || e.blocked) { e.st = "away"; e.t = 0.8; e.cd = 1.5 + Math.random(); } }
    else {   // hover: lazy circles above you until its cooldown is up
      var tx = p.x + Math.sin(e.tt * 1.1 + e.ph) * 4, ty = p.y - PH - BAT.hover + Math.sin(e.tt * 2.3 + e.ph) * 0.8;
      tvx = clamp((tx - e.x) * 1.8, -BAT.cruise, BAT.cruise); tvy = clamp((ty - (e.y - e.h * 0.5)) * 1.8, -BAT.cruise, BAT.cruise);
      if (alive && e.cd <= 0 && Math.abs(cx) < 6.5 && cy > -1 && cy < 8) { e.st = "wind"; e.t = BAT.wind; thud(760, 0.05); }
    }
    var sm = Math.min(1, dt * (e.st === "dive" ? 30 : 5)); e.vx += (tvx - e.vx) * sm; e.vy += (tvy - e.vy) * sm;
    moveBat(e, dt);
    if (alive && e.hurt <= 0 && e.st === "dive" && hurtGrace <= 0 && overlapP(e)) { hurt(e.dmg, "bat"); shoved(e); e.st = "away"; e.t = 0.8; e.cd = 1.6 + Math.random(); }
  }
  function spawnBat() {
    var n = 0; enemies.forEach(function (e) { if (e.k === "bat" && !e.def && !e.leave) n++; }); if (n >= batMax()) return;
    var side = Math.random() < 0.5 ? -1 : 1, x = clamp(Math.floor(p.x + side * (vw / 2 / ts + 1 + Math.random() * 6)), 2, W - 3) + 0.5, cx = Math.floor(x);
    var y = Math.max(2, Math.min(col[cx] - 6 - Math.random() * 4, p.y - 8 - Math.random() * 3));   // swoops in from the sky above you
    if (eBoxHit(x, y, ENEMY.bat.w, ENEMY.bat.h)) return;
    enemies.push(newEnemy("bat", x, y));
    if (!S.st.warned) { S.st.warned = 1; toast("Bats come out at night! Craft a Swamp Bed and sleep to skip the night.", "#b58cff"); }
  }
  function damageEnemy(e, dmg, face) {
    if (e.def) return; e.hp -= dmg; e.hurt = 0.3; e.kv = face * (e.k === "bug" ? 6 : 5); text(e.x, e.y - e.h - 0.3, "-" + Math.round(dmg), "#ffe48a");
    chips(e.x, e.y - e.h * 0.5, ENEMY[e.k].chip, 8, 6); thud(180 + Math.random() * 60, 0.06);
    if (e.k === "bat" && e.hp > 0 && e.st !== "away") { e.st = "away"; e.t = 0.7; e.cd = 1.2; }   // a hit scares a bat off for a moment
    if (e.hp > 0) return;
    e.def = true; e.dead = 0.6; chips(e.x, e.y - e.h * 0.5, ENEMY[e.k].glow, 16, 8); snd("open", "Epic");
    var kills = e.k === "bug" ? ++S.st.bugs : e.k === "bat" ? ++S.st.bats : ++S.st.frogs, d = ENEMY[e.k];
    if (kills === 1 || Math.random() < d.chance) {   // loot: a Delve item, and the same Fragment is added to your Adventure bag
      give(d.frag, 1, e.x - 0.5, e.y - e.h - 0.9);
      try { if (typeof Fragments !== "undefined") Fragments.add(ITEMS[d.frag].frag, 1); } catch (er) {}
    }
    checkGoals();
  }
  function strike() {   // one weapon swing: hits every enemy in front of you
    if (toolBroken("wpn")) return;
    var reach = [0, 2.7, 2.2, 2.4, 2.4][S.wpn], f = p.face, xa = p.x - f * 0.3, xb = p.x + f * reach, lo = Math.min(xa, xb), hi = Math.max(xa, xb);
    var hits = 0;
    enemies.forEach(function (e) { if (!e.def && e.x + e.w / 2 > lo && e.x - e.w / 2 < hi && e.y > p.y - PH - (e.k === "bat" ? 1.2 : 0.5) && e.y - e.h < p.y + 0.3) { hits++; damageEnemy(e, WEAPONS[S.wpn].dmg, f); } });
    if (hits) wear("wpn", 1);
  }
  function spawnEnemy() {
    var cnt = { bug: 0, frog: 0 }; enemies.forEach(function (e) { if (!e.def && cnt[e.k] !== undefined) cnt[e.k]++; });
    if (cnt.bug + cnt.frog >= 4) return;
    var k = cnt.bug < ENEMY.bug.max && (cnt.frog >= ENEMY.frog.max || Math.random() < 0.6) ? "bug" : cnt.frog < ENEMY.frog.max ? "frog" : null; if (!k) return;
    var side = Math.random() < 0.5 ? -1 : 1, x = clamp(Math.floor(p.x + side * (vw / 2 / ts + 2 + Math.random() * 8)), 3, W - 4) + 0.5, y = -1, cx = Math.floor(x);
    if (world.bio[cx] !== 0) return;
    if (k === "bug" && Math.random() < 0.4) {   // some bugs lurk in dark caves
      for (var yy = Math.floor(p.y) - 8; yy <= Math.floor(p.y) + 8; yy++) if (!blocks(cx, yy) && !blocks(cx, yy - 1) && blocks(cx, yy + 1) && TILES[get(cx, yy)].kind !== "water" && yy > col[cx] + 3) { y = yy + 1; break; }
    } else { var cy = col[cx]; if (cy > 0 && cy < H && !blocks(cx, cy - 1) && TILES[get(cx, cy - 1)].kind !== "water") y = cy; }
    if (y < 0 || eBoxHit(x, y, ENEMY[k].w, ENEMY[k].h)) return;
    enemies.push(newEnemy(k, x, y));
  }
  function updateEnemies(dt) {
    if (panelOpen) return;
    spawnT -= dt; if (spawnT <= 0) { spawnT = 4 + Math.random() * 3; if (S.wpn >= 1) spawnEnemy(); }
    var underground = p.y > col[clamp(Math.floor(p.x), 0, W - 1)] + 7;
    batT -= dt; if (batT <= 0) { batT = (3.2 + Math.random() * 3) * (1 - 0.35 * clamp((S.time - BAT.from) / 150, 0, 1)); if (S.wpn >= 1 && batNight(S.time) && !underground) spawnBat(); }   // bats arrive faster as the night goes on
    enemies.forEach(function (e) { if (e.k === "bat" && !e.def && !e.leave && (!batNight(S.time) || underground)) e.leave = underground ? 4 : 3 + Math.random() * 2; });   // dawn, or you went underground
    if (swingQ > 0) { swingQ -= dt; if (swingQ <= 0) strike(); }
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i]; e.tt += dt; e.hurt = Math.max(0, e.hurt - dt); e.cd = Math.max(0, e.cd - dt);
      if (e.def) { e.dead -= dt; moveEnemy(e, dt, 0); if (e.dead <= 0) enemies.splice(i, 1); continue; }
      if (e.gone || Math.abs(e.x - p.x) > 38 || Math.abs(e.y - p.y) > 44) { if (e.gone) chips(e.x, e.y - e.h * 0.5, ENEMY.bat.chip, 6, 4); enemies.splice(i, 1); continue; }
      if (e.k === "bug") updateBug(e, dt); else if (e.k === "bat") updateBat(e, dt); else updateFrog(e, dt);
    }
  }
  function eGlow(g, x, y, r, col, a) {
    var c = parseInt(col.slice(1), 16), rr = (c >> 16) & 255, gg = (c >> 8) & 255, bb = c & 255, rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, "rgba(" + rr + "," + gg + "," + bb + ",1)"); rg.addColorStop(1, "rgba(" + rr + "," + gg + "," + bb + ",0)");
    g.globalAlpha = a; g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); g.globalAlpha = 1;
  }
  // The art is the Adventure's own Bramble Bug and Swamp Frog drawing code, drawn in a 30px-per-tile space.
  function drawBat(g, e, d, flash, h, pd) {   // front-on bat: flapping scalloped wings, little ears, eyes turn red when it is about to dive
    var up = e.st === "dive" ? 0.25 : Math.sin(e.fl), hot = e.st === "wind" || e.st === "dive";
    g.save(); g.translate(!e.def && h > 0 ? Math.sin(e.tt * 90) * 1.6 * h : 0, -9); g.scale(1 + 0.4 * pd, 1 - 0.7 * pd);
    if (!e.def) eGlow(g, 0, 0, hot ? 30 : 22, hot ? "#ff5a7a" : d.glow, hot ? 0.55 : 0.28);
    var wing = flash ? "#ffffff" : hot ? "#7b4fc0" : "#3d2466", edge = flash ? "#ffffff" : "#12061a", fur = flash ? "#ffffff" : "#2a1744";
    [-1, 1].forEach(function (s) {
      var tipY = -3 - up * 15, midY = -8 - up * 9;
      g.fillStyle = wing; g.strokeStyle = edge; g.lineWidth = 1.6; g.lineJoin = "round";
      g.beginPath(); g.moveTo(s * 4, -3); g.quadraticCurveTo(s * 13, midY - 4, s * 26, tipY); g.lineTo(s * 21, tipY + 9); g.lineTo(s * 15, 3 - up * 4); g.lineTo(s * 9, 1 - up * 2); g.lineTo(s * 5, 5); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = flash ? "#fff" : "rgba(181,140,255,.6)"; g.lineWidth = 1; g.beginPath(); g.moveTo(s * 5, -2); g.lineTo(s * 21, tipY + 9); g.moveTo(s * 5, -2); g.lineTo(s * 15, 3 - up * 4); g.stroke();
    });
    g.fillStyle = fur; g.strokeStyle = edge; g.lineWidth = 1.4;
    g.beginPath(); g.ellipse(0, 1, 5.2, 6.4, 0, 0, 7); g.fill(); g.stroke();
    [-1, 1].forEach(function (s) { g.beginPath(); g.moveTo(s * 1.5, -5); g.lineTo(s * 4.6, -12.5); g.lineTo(s * 5.2, -4.2); g.closePath(); g.fill(); g.stroke(); });
    g.fillStyle = flash ? "#fff" : hot ? "#ff3b5c" : "#ffe48a"; g.beginPath(); g.arc(-2.1, -1.5, 1.5, 0, 7); g.arc(2.1, -1.5, 1.5, 0, 7); g.fill();
    g.fillStyle = "#f6eedb"; g.beginPath(); g.moveTo(-1.6, 2.6); g.lineTo(-0.7, 5.4); g.lineTo(0.1, 2.6); g.moveTo(1.6, 2.6); g.lineTo(0.7, 5.4); g.lineTo(-0.1, 2.6); g.fill();
    g.restore();
  }
  function drawEnemy(g, e, now) {
    var sx = ox + e.x * ts, sy = oy + e.y * ts;
    if (sx < -ts * 3 || sx > vw + ts * 3 || sy < -ts * 3 || sy > vh + ts * 3) return;
    var f = e.dir, t = e.tt, pd = e.def ? 1 - e.dead / 0.6 : 0, h = Math.max(0, e.hurt) / 0.3, flash = e.hurt > 0.2 || e.def, d = ENEMY[e.k];
    g.save(); g.translate(sx, sy + ts * 0.04); g.scale(ts / 30, ts / 30);
    g.globalAlpha = 1 - pd * pd * 0.9;
    if (e.k !== "bat") { g.fillStyle = "rgba(0,0,0,.33)"; g.beginPath(); g.ellipse(0, 0, e.k === "bug" ? 19 : 17, 3.2, 0, 0, 7); g.fill(); }
    if (e.k === "bat") drawBat(g, e, d, flash, h, pd);
    else if (e.k === "bug") {
      var leg = t * 14;
      g.save(); g.translate(!e.def && h > 0 ? Math.sin(now / 1000 * 90) * 1.6 * h : 0, 0); g.rotate(-f * 0.22 * h); g.scale(f * (1 + 0.5 * pd + 0.16 * h), 1 - 0.75 * pd - 0.14 * h);
      if (!e.def) eGlow(g, 0, -2, 26, d.glow, 0.35);
      g.strokeStyle = flash ? "#ffe9ee" : "#2a1230"; g.lineWidth = 2.2; g.lineCap = "round";
      for (var i = 0; i < 3; i++) { var lx = -9 + i * 9, ph = (e.st === "patrol" || e.st === "charge" || e.st === "retreat") ? Math.sin(leg + i * 2.1) * 3 : 0; g.beginPath(); g.moveTo(lx, -7); g.lineTo(lx + ph, -1); g.stroke(); }
      var sg = g.createLinearGradient(0, -24, 0, -4); sg.addColorStop(0, flash ? "#fff" : "#5a2d62"); sg.addColorStop(1, flash ? "#ffd6df" : "#2a1432");
      g.fillStyle = sg; g.beginPath(); g.ellipse(0, -9, 17, 14, 0, Math.PI, 0); g.fill(); g.fillRect(-17, -9, 34, 6);
      g.fillStyle = flash ? "#ffe0e6" : "#f1e5d0";
      for (i = -2; i <= 2; i++) { var tx = i * 6.5, th = 7 + (2 - Math.abs(i)) * 2.6; g.beginPath(); g.moveTo(tx - 3, -17 + Math.abs(i) * 2.2); g.lineTo(tx, -17 - th + Math.abs(i) * 2.2); g.lineTo(tx + 3, -17 + Math.abs(i) * 2.2); g.fill(); g.fillStyle = flash ? "#fff" : "#ff6b82"; g.beginPath(); g.arc(tx, -17 - th + Math.abs(i) * 2.2 + 1, 1.6, 0, 7); g.fill(); g.fillStyle = flash ? "#ffe0e6" : "#f1e5d0"; }
      g.strokeStyle = flash ? "#fff" : "rgba(255,107,130,.4)"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-8, -6); g.quadraticCurveTo(-4, -15, -2, -20); g.moveTo(8, -6); g.quadraticCurveTo(5, -14, 3, -19); g.stroke();
      g.fillStyle = flash ? "#fff" : "#3a1d42"; g.beginPath(); g.ellipse(14, -8, 7.5, 6.5, 0, 0, 7); g.fill();
      g.fillStyle = e.st === "charge" ? "#ffd0c0" : "#ffb0a0"; g.beginPath(); g.ellipse(15.5, -9.5, 2.3, 3, 0, 0, 7); g.ellipse(11, -9.5, 1.9, 2.6, 0, 0, 7); g.fill();
      g.fillStyle = "#2a0d18"; g.beginPath(); g.arc(16, -9.3, 1, 0, 7); g.arc(11.4, -9.3, 0.9, 0, 7); g.fill();
      g.strokeStyle = "#2a0d18"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(9, -13.5); g.lineTo(14, -11.6); g.moveTo(19, -12.8); g.lineTo(14.5, -11.6); g.stroke();
      g.restore();
    } else {
      var wind = e.st === "wind", lash = e.st === "lash", rec = e.st === "recover", air = !e.on && !e.def, pw = wind ? 1 - e.t / FROG.wind : 0, sxx = 1, syy = 1;
      if (wind) { sxx = 1 + 0.12 * pw; syy = 1 - 0.14 * pw; } else if (rec) { sxx = 1.1; syy = 0.9 + 0.03 * Math.sin(t * 9); }
      else if (air) { var kk = clamp(-e.vy / 12, -1, 1); sxx = 1 - 0.1 * kk; syy = 1 + 0.16 * kk; } else if (e.st === "idle") syy = 1 + 0.05 * Math.sin(t * 4);
      g.save(); g.translate((h > 0 && !e.def) || wind ? Math.sin(t * (wind ? 70 : 90)) * (wind ? pw : 1.6 * h) : 0, 0);
      g.rotate(-f * 0.2 * h); g.scale(f * (sxx + 0.5 * pd + 0.14 * h), syy * (1 - 0.75 * pd) - 0.12 * h);
      if (!e.def) eGlow(g, 0, -10, wind ? 30 + 10 * pw : 24, wind || lash ? "#ffb347" : d.glow, wind ? 0.35 + 0.5 * pw : 0.2);
      var dk = flash ? "#f4ffe0" : "#1c5e34", md = flash ? "#ffffff" : "#3fc25f", lt = flash ? "#ffffff" : "#7ee08a", bel = flash ? "#ffffff" : "#f1efb4", spot = flash ? "#ffffff" : "#2a8a47";
      if (lash && e.ext > 0.02) { var L = FROG.reach * 30 * e.ext; g.strokeStyle = flash ? "#fff" : "#ff7e93"; g.lineWidth = 4; g.lineCap = "round"; g.beginPath(); g.moveTo(16, -10); g.lineTo(16 + L, -10); g.stroke(); g.fillStyle = flash ? "#fff" : "#ff9db0"; g.beginPath(); g.arc(16 + L, -10, 4.2, 0, 7); g.fill(); }
      g.fillStyle = md; g.beginPath(); g.ellipse(-8, -7, 9, 6.5, -0.3, 0, 7); g.fill(); g.strokeStyle = dk; g.lineWidth = 2; g.beginPath(); g.ellipse(-8, -7, 9, 6.5, -0.3, 0, 7); g.stroke();
      var kick = air ? (e.vy < 0 ? 1 : 0.4) : 0;
      g.fillStyle = lt; g.beginPath(); g.ellipse(-17 - kick * 6, -1.5 + kick * 2, 7, 2.4, 0, 0, 7); g.fill();
      g.strokeStyle = dk; g.lineWidth = 3.2; g.lineCap = "round"; g.beginPath(); g.moveTo(9, -5); g.lineTo(14 + (air ? 3 : 0), -1.5 + (air ? -3 : 0)); g.stroke();
      g.fillStyle = md; g.beginPath(); g.ellipse(0, -12, 15, 10, 0, 0, 7); g.fill();
      g.fillStyle = bel; g.beginPath(); g.ellipse(2, -7, 11, 4.2, 0, 0, Math.PI); g.fill();
      g.fillStyle = spot; [[-6, -17, 2.4], [0, -19, 1.8], [-11, -12, 2], [-3, -12, 1.6]].forEach(function (w2) { g.beginPath(); g.arc(w2[0], w2[1], w2[2], 0, 7); g.fill(); });
      g.fillStyle = flash ? "#fff" : "#ffd27a"; g.beginPath(); g.ellipse(12, -7, 4 + (wind ? 4 * pw : 0) + (lash ? 3 : 0), 3 + (wind ? 3.5 * pw : 0) + (lash ? 2 : 0), 0, 0, 7); g.fill();
      g.fillStyle = md; g.beginPath(); g.ellipse(12, -14, 9, 7, 0, 0, 7); g.fill();
      if (wind || lash) { g.fillStyle = "#2a0d18"; g.beginPath(); g.ellipse(19, -11, 5, 3.2 + (wind ? 1.6 * pw : 1.4), 0, 0, 7); g.fill(); }
      else { g.strokeStyle = "#12220f"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(8, -11); g.quadraticCurveTo(15, -8.5, 21, -12); g.stroke(); }
      [8, 15].forEach(function (ex) {
        g.fillStyle = flash ? "#fff" : (wind && Math.sin(t * 40) > 0 ? "#fff2a8" : "#ffd23f"); g.beginPath(); g.arc(ex, -21.5, 4.6, 0, 7); g.fill();
        g.strokeStyle = dk; g.lineWidth = 1.2; g.beginPath(); g.arc(ex, -21.5, 4.6, 0, 7); g.stroke();
        g.fillStyle = "#12220f"; g.beginPath();
        if (rec) { g.moveTo(ex - 2.2, -21.5); g.lineTo(ex + 2.2, -21.5); g.lineWidth = 1.4; g.stroke(); }
        else { g.ellipse(ex + (wind || lash ? 1.3 : 0.6), -21.5, 1.2, 3.4, 0, 0, 7); g.fill(); }
      });
      g.restore();
      if (rec && !e.def) { g.fillStyle = "#ffe9a0"; for (var si = 0; si < 3; si++) { var an = t * 6 + si * 2.1; g.beginPath(); g.arc(Math.cos(an) * 12, -34 + Math.sin(an) * 3.5, 1.8, 0, 7); g.fill(); } }
      if (wind) { g.fillStyle = "#ffcf7a"; g.strokeStyle = "rgba(0,0,0,.6)"; g.lineWidth = 3; g.font = "900 15px Nunito,sans-serif"; g.textAlign = "center"; g.strokeText("!", 0, -40 - Math.sin(t * 30) * 1.2); g.fillText("!", 0, -40 - Math.sin(t * 30) * 1.2); }
    }
    if (!e.def && e.hp < e.mx) {   // little health bar once it is hurt
      g.globalAlpha = 1; g.fillStyle = "rgba(0,0,0,.65)"; g.fillRect(-15, -(e.k === "bug" ? 41 : e.k === "bat" ? 30 : 49), 30, 5);
      g.fillStyle = e.hp / e.mx > 0.5 ? "#7dffb0" : e.hp / e.mx > 0.25 ? "#f2c14e" : "#ff6a5a"; g.fillRect(-14, -(e.k === "bug" ? 40 : e.k === "bat" ? 29 : 48), 28 * Math.max(0, e.hp / e.mx), 3);
    }
    g.restore();
  }
  function drawEnemies(g, now) { enemies.forEach(function (e) { drawEnemy(g, e, now); }); }

  // ---------- CHESTS ----------
  // S.chests["x,y"] = { itemId: count }. A chest holds up to CHEST_KINDS kinds of item. Tap it or press F nearby to open the Chest tab. A chest must be empty before you can pick it up.
  var CHEST_KINDS = 30, chestKey = "";
  function chestCount(key) { var c = S.chests[key], n = 0; if (c) for (var k in c) n += c[k]; return n; }
  function chestKinds(c) { return Object.keys(c).length; }
  function chestNear() {
    var cx = Math.floor(p.x), cy = Math.floor(p.y - 1), best = null, bd = 9, x, y, dx, dy, d;
    for (y = cy - 3; y <= cy + 3; y++) for (x = cx - 3; x <= cx + 3; x++) if (get(x, y) === T.CHEST) { dx = x + 0.5 - p.x; dy = y + 0.5 - (p.y - 0.7); d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { x: x, y: y }; } }
    return best;
  }
  function openChest(x, y) {
    if (get(x, y) !== T.CHEST) return false; var key = x + "," + y;
    if (!S.chests[key]) S.chests[key] = {};
    chestKey = key; snd("coin"); openPanel("chest"); return true;
  }
  function addInv(item, n) { S.inv[item] = (S.inv[item] || 0) + n; if (ITEMS[item].tile !== undefined && S.mru.indexOf(item) < 0) S.mru.push(item); hbDirty = true; }   // like give(), but without counting it as gathered
  function chestMove(item, all, dir) {   // dir "put": bag -> chest, "take": chest -> bag. all = whole stack
    var c = S.chests[chestKey]; if (!c || !ITEMS[item]) return;
    if (dir === "put") {
      var have = S.inv[item] || 0; if (have <= 0) return;
      if (!c[item] && chestKinds(c) >= CHEST_KINDS) { toast("This chest is full.", "#f2c14e"); return; }
      c[item] = Math.min(99999, (c[item] || 0) + have); S.st.stashed += have; delete S.inv[item]; if (sel === item) sel = "pick"; snd("coin");
    } else {
      var n = c[item] || 0; if (n <= 0) return; addInv(item, n); delete c[item];
    }
    hbDirty = true; renderPanel(); checkTrail();
  }
  function chestAll(dir) { var c = S.chests[chestKey]; if (!c) return; (dir === "put" ? ORDER.filter(function (k) { return (S.inv[k] || 0) > 0; }) : Object.keys(c)).forEach(function (k) { chestMove(k, true, dir); }); }
  // ---------- DOORS ----------
  // A door is two tiles (bottom + top) that always switch together. Closed halves are solid, open halves are not.
  // Walking into a closed door opens it and it shuts by itself shortly after you leave; tapping it (or pressing F nearby) opens/closes it by hand and it then stays as you left it.
  var doorAuto = {}, doorHoldKey = "", doorHoldT = 0;   // doorAuto: bottom-tile index -> seconds with nobody in the doorway
  function doorBase(x, y) { var td = TILES[get(x, y)]; if (td.kind !== "door") return null; return { x: x, y: td.door.top ? y + 1 : y }; }
  function doorInTheWay(bx, by) {   // you or an enemy is standing where a closed door would be
    if (p.x + PW / 2 > bx && p.x - PW / 2 < bx + 1 && p.y > by - 1 && p.y - PH < by + 1) return true;
    for (var i = 0; i < enemies.length; i++) { var e = enemies[i]; if (e.def) continue; if (e.x + e.w / 2 > bx && e.x - e.w / 2 < bx + 1 && e.y > by - 1 && e.y - e.h < by + 1) return true; }
    return false;
  }
  function setDoor(bx, by, open) { setT(bx, by, open ? T.DOORO_B : T.DOOR_B); if (by - 1 >= 0) setT(bx, by - 1, open ? T.DOORO_T : T.DOOR_T); thud(open ? 300 : 200, 0.05); chips(bx + 0.5, by - 0.5, "#c98c4f", 3, 2); }
  function toggleDoor(x, y, manual) {
    var b = doorBase(x, y); if (!b) return false;
    var open = TILES[get(b.x, b.y)].door.open, k = b.y * W + b.x;
    if (open && doorInTheWay(b.x, b.y)) { nag("Something is in the doorway."); return true; }
    setDoor(b.x, b.y, !open);
    if (!open && !manual) doorAuto[k] = 0; else delete doorAuto[k];
    return true;
  }
  function doorNear() {   // the closest door within about 2.5 tiles, or null
    var cx = Math.floor(p.x), cy = Math.floor(p.y - 1), best = null, bd = 6.5, x, y, dx, dy, d;
    for (y = cy - 3; y <= cy + 3; y++) for (x = cx - 3; x <= cx + 3; x++) {
      var td = TILES[get(x, y)]; if (td.kind !== "door" || td.door.top) continue;
      dx = x + 0.5 - p.x; dy = y - (p.y - 0.7); d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { x: x, y: y }; }
    }
    return best;
  }
  function updateDoors(dt, dir) {
    if (dir) {   // walking into a closed door opens it
      var fx = Math.floor(p.x + dir * (PW / 2 + 0.2));
      for (var yy = Math.floor(p.y - PH + 0.05); yy <= Math.floor(p.y - 0.05); yy++) { var td = TILES[get(fx, yy)]; if (td.kind === "door" && !td.door.open) { toggleDoor(fx, yy, false); break; } }
    }
    for (var k in doorAuto) {
      var bi = +k, bx = bi % W, by = (bi - bx) / W, tdb = TILES[tiles[bi]];
      if (tdb.kind !== "door" || !tdb.door.open) { delete doorAuto[k]; continue; }
      if (doorInTheWay(bx, by) || (Math.abs(p.x - (bx + 0.5)) < 1.4 && Math.abs(p.y - by) < 2 && dir)) doorAuto[k] = 0;
      else { doorAuto[k] += dt; if (doorAuto[k] > 0.8) { setDoor(bx, by, false); delete doorAuto[k]; } }
    }
  }
  function useTool(dt) {
    if (sel === "weapon") {   // swing: faces your aim, one swing per cooldown. Nothing takes damage until Stage 3 adds enemies.
      mine = null; if (!aim.down || !S.wpn) return;
      if (toolBroken("wpn")) { nag("Your weapon is broken. Repair it in the Craft tab."); return; }
      var wdx = aim.mx - (ox + p.x * ts); if (Math.abs(wdx) > ts * 0.3) p.face = wdx < 0 ? -1 : 1;
      cool -= dt; if (cool > 0) return; cool = WEAPONS[S.wpn].cd; S.st.swings++; swingQ = 0.1;
      thud(300 + S.wpn * 70, 0.04); for (var sk = 0; sk < 3; sk++) parts.push({ x: p.x + p.face * (0.9 + sk * 0.35), y: p.y - 1.1 - sk * 0.12, vx: p.face * 3, vy: -0.4, life: 0.22, max: 0.3, c: WEAPONS[S.wpn].c, s: 3 });
      return;
    }
    if (!aim.down || aim.tx < 0) { mine = null; doorHoldKey = ""; return; }
    var tx = aim.tx, ty = aim.ty, dx = tx + 0.5 - p.x, dy = ty + 0.5 - (p.y - PH / 2);
    if (dx * dx + dy * dy > REACH * REACH) { mine = null; return; }
    if (Math.abs(dx) > 0.35) p.face = dx < 0 ? -1 : 1;   // turn to face what you are digging or building
    if (sel === "pick" || sel === "shovel") {
      var id = get(tx, ty), td = TILES[id];
      if (id === T.BEDROCK) { nag("Bedrock can't be broken."); mine = null; return; }
      if (id === T.AIR || !isFinite(td.hard)) { mine = null; return; }
      if (sel === "shovel" && !SOFT[id]) { nag("A shovel only digs soft ground (mud, moss, clay, ash, snow). Use your pick for " + td.n + "."); mine = null; return; }
      if (sel === "shovel" && toolBroken("shovel")) { nag("Your shovel is broken. Repair it in the Craft tab."); mine = null; return; }
      if (sel === "pick" && td.tier > effTier()) { nag(S.tier >= td.tier ? "Your pick is broken. Repair it in the Craft tab." : "Needs the " + PICKS[td.tier].n + " to break " + td.n + "."); mine = null; return; }
      if (td.kind === "door" || td.kind === "chest") {   // a quick tap opens/closes the door, so breaking it needs a short hold first
        var dk = tx + "," + ty; if (doorHoldKey !== dk) { doorHoldKey = dk; doorHoldT = 0; }
        doorHoldT += dt; if (doorHoldT < 0.3) { mine = null; return; }
        if (td.kind === "chest" && chestCount(tx + "," + ty) > 0) { nag("Empty the chest before picking it up."); mine = null; return; }
      } else doorHoldKey = "";
      if (!mine || mine.x !== tx || mine.y !== ty) mine = { x: tx, y: ty, p: 0, tick: 0 };
      mine.p += dt * (sel === "shovel" ? SHOVEL.sp : PICKS[effTier()].sp) / td.hard; mine.tick -= dt;
      if (mine.tick <= 0) { mine.tick = 0.17; thud(150 + Math.random() * 50, 0.035); chips(tx + 0.5, ty + 0.5, td.kind === "ore" ? td.c2 : td.c, 1, 3); }
      if (mine.p >= 1) { breakTile(tx, ty); mine = null; if (sel === "shovel") wear("shovel", 1); else if (effTier() > 0) wear("pick", td.hard >= 2 ? 2 : 1); }
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
    if (r.wpn && S.wpn >= r.wpn) return;
    if (r.sh && S.shovel) return;
    if (r.tier && S.tier < r.tier - 1) { toast("Craft the " + PICKS[r.tier - 1].n + " first.", "#f2c14e"); return; }
    if (r.wpn && S.wpn < r.wpn - 1) { toast("Craft the " + WEAPONS[r.wpn - 1].n + " first.", "#f2c14e"); return; }
    if (r.need && S.tier < r.need) { toast("Needs the " + PICKS[r.need].n + " first.", "#f2c14e"); return; }
    if (r.bench && !nearBench()) { toast("Stand near a Bog Workbench to craft this.", "#f2c14e"); return; }
    for (var k in r.cost) if ((S.inv[k] || 0) < r.cost[k]) { toast("Not enough " + ITEMS[k].n + ".", "#f2c14e"); return; }
    for (var c in r.cost) { S.inv[c] -= r.cost[c]; if (S.inv[c] <= 0) delete S.inv[c]; }
    if (r.tier) { S.tier = r.tier; S.dur.pick = DUR.pick[r.tier]; ICO = {}; toast(r.n + " crafted. Dig faster!", PICKS[r.tier].c); snd("open", "Epic"); chips(p.x, p.y - 1, PICKS[r.tier].c, 30, 9); }
    else if (r.sh) { S.shovel = 1; S.dur.shovel = DUR.shovel; ICO = {}; toast(r.n + " crafted. Pick it in the hotbar to dig soft ground!", SHOVEL.c); snd("open", "Epic"); chips(p.x, p.y - 1, SHOVEL.c, 24, 8); }
    else if (r.wpn) { S.wpn = r.wpn; S.dur.wpn = DUR.wpn[r.wpn]; ICO = {}; toast(r.n + " crafted. Pick it in the hotbar and swing!", WEAPONS[r.wpn].c); snd("open", "Epic"); chips(p.x, p.y - 1, WEAPONS[r.wpn].c, 30, 9); }
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
  // ---------- HEALTH ----------
  function drawHp() {
    var v = Math.max(0, Math.ceil(hp)); if (v === shownHp) return; var was = shownHp; shownHp = v;
    var el = $("sbxHp"); if (!el) return; var pc = v / MAXHP * 100;
    el.querySelector(".fl").style.width = pc + "%"; el.querySelector(".gh").style.width = pc + "%"; el.querySelector("b").textContent = v;
    el.setAttribute("aria-valuenow", v); el.classList.toggle("low", pc <= 30); el.classList.toggle("mid", pc > 30 && pc <= 60);
    if (was > v && !reduce) { el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit"); }   // heart thumps when you take damage
  }
  function hurt(n, why, cont) {
    if (n <= 0) return; if (!cont && hurtGrace > 0) return;
    hp -= n; sinceHurt = 0; hurtT = Math.max(hurtT, cont ? 0.15 : 0.5);
    if (!cont) { hurtGrace = 0.5; shake = Math.min(1, n / 40); text(p.x, p.y - PH - 0.3, "-" + Math.round(n), "#ff6a5a"); thud(110, 0.07); }
    if (hp <= 0) faint(why);
  }
  function faint(why) {
    S.st.deaths++; hp = MAXHP; hurtT = hurtGrace = shake = 0; sinceHurt = 99;
    respawn(why === "lava" ? "Burned by lava! You woke up at camp." : "You passed out and woke up at camp.");
  }
  function respawn(msg) {
    if (cave) leaveCaveNow();
    enemies.length = 0; spawnT = 6; swingQ = 0; batT = 8;
    var sp = world.spawn, bd = S.bed && get(S.bed.x, S.bed.y) === T.BED ? S.bed : null; if (S.bed && !bd) S.bed = null;   // a broken bed is forgotten
    if (bd) { p.x = bd.x + 0.5; p.y = bd.y + 1; msg = msg.replace("at camp", "at your bed"); } else { p.x = sp.x; p.y = sp.y; }
    p.vx = p.vy = 0;
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

  // ---------- BEDS + SLEEP ----------
  var isNight = function (t) { return t >= 280 && t < 440; };
  function bedNear() {   // the closest placed bed within about 3.5 tiles, or null
    var cx = Math.floor(p.x), cy = Math.floor(p.y - 1), best = null, bd = 13, x, y, dx, dy, d;
    for (y = cy - 3; y <= cy + 3; y++) for (x = cx - 3; x <= cx + 3; x++) if (get(x, y) === T.BED) { dx = x + 0.5 - p.x; dy = y + 0.5 - (p.y - 0.7); d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { x: x, y: y }; } }
    return best;
  }
  function sheltered() { var x = Math.floor(p.x), y0 = Math.floor(p.y - PH); for (var y = y0 - 1; y >= Math.max(0, y0 - 5); y--) if (blocks(x, y)) return true; return false; }   // a roof within 5 tiles overhead
  function sleepBlock() {   // why you cannot sleep right now ("" = you can). A roof overhead means nothing outside can reach you.
    if (sheltered()) return "";
    for (var i = 0; i < enemies.length; i++) { var e = enemies[i]; if (!e.def && Math.abs(e.x - p.x) < 14 && Math.abs(e.y - p.y) < 10) return e.k === "bat" ? "Bats are circling! Drive them off, or get under a roof." : "Something is too close to sleep!"; }
    return "";
  }
  function trySleep() {
    if (sleepT > 0 || panelOpen || hp <= 0) return;
    if (!bedNear()) { nag("Stand next to a Swamp Bed to sleep."); return; }
    if (!isNight(S.time)) { nag("You can only sleep at night."); return; }
    var why = sleepBlock(); if (why) { nag(why); return; }
    var b = bedNear(); S.bed = { x: b.x, y: b.y }; sleepT = 0.001; slept = false;
    keys.l = keys.r = keys.j = 0; tk.l = tk.r = tk.j = 0; aim.down = false; mine = null; p.vx = 0; thud(200, 0.05);
  }
  function tickSleep(dt) {   // 0-0.6s fade out, black until 1.7s (the night is skipped at 1.2s), then fade back in
    sleepT += dt;
    if (!slept && sleepT >= 1.2) {
      slept = true; S.time = 446; S.st.sleeps++; hp = MAXHP; sinceHurt = 99; hurtT = hurtGrace = 0; drawHp();
      for (var i = enemies.length - 1; i >= 0; i--) if (enemies[i].k === "bat") enemies.splice(i, 1);
      batT = 10; checkGoals(); save();
    }
    if (sleepT >= 2.6) { sleepT = 0; toast("Good morning! Health restored. Your bed is now your respawn point.", "#f2c14e"); }
  }
  function drawBedPrompt(g, now) {   // a tappable pill above a nearby bed at night (tap it, or press F)
    bedBtn = null; if (panelOpen || sleepT > 0 || !isNight(S.time)) return;
    var b = bedNear(); if (!b) return;
    var no = sleepBlock(), label = no ? "Can't sleep yet" : (coarse ? "Sleep" : "Sleep (F)"), sx = ox + (b.x + 0.5) * ts, sy = oy + b.y * ts - ts * 0.9 + (reduce ? 0 : Math.sin(now / 300) * 2);
    g.font = "800 " + Math.max(12, Math.round(ts * 0.5)) + "px Nunito, system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    var w = g.measureText(label).width + ts * 1.1, h = Math.max(26, ts * 0.9), x0 = sx - w / 2, y0 = sy - h / 2;
    g.fillStyle = no ? "rgba(70,34,40,.88)" : "rgba(40,28,84,.9)"; g.strokeStyle = no ? "#ff8a7a" : "#b58cff"; g.lineWidth = 2;
    g.beginPath(); g.arc(x0 + h / 2, y0 + h / 2, h / 2, Math.PI / 2, Math.PI * 1.5); g.arc(x0 + w - h / 2, y0 + h / 2, h / 2, -Math.PI / 2, Math.PI / 2); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#f6eedb"; g.fillText(label, sx, sy + 1); g.textBaseline = "alphabetic";
    bedBtn = { x: x0, y: y0, w: w, h: h };
  }
  function drawSleepFade(g) {
    if (sleepT <= 0) return;
    var a = sleepT < 0.6 ? sleepT / 0.6 : sleepT < 1.7 ? 1 : Math.max(0, 1 - (sleepT - 1.7) / 0.9);
    g.globalAlpha = a * 0.97; g.fillStyle = "#04061a"; g.fillRect(0, 0, vw, vh);
    if (a > 0.5) { g.globalAlpha = a; g.fillStyle = "#cfd6ff"; g.font = "800 " + Math.round(clamp(vw / 16, 22, 46)) + "px Nunito, system-ui, sans-serif"; g.textAlign = "center"; g.fillText("Zzz...", vw / 2, vh / 2); }
    g.globalAlpha = 1;
  }

  // ---------- PHYSICS ----------
  function approach(v, t, d) { return v < t ? Math.min(t, v + d) : Math.max(t, v - d); }
  function onLadder() { var lx = Math.floor(p.x); for (var yy = Math.floor(p.y - PH * 0.9); yy <= Math.floor(p.y - 0.1); yy++) if (get(lx, yy) === T.LADDER) return true; return false; }
  function step(h, dir, jump) {
    var feetWet = TILES[get(Math.floor(p.x), Math.floor(p.y - 0.2))].kind === "water";
    p.wet = TILES[get(Math.floor(p.x), Math.floor(p.y - PH * 0.5))].kind === "water";
    var sp = p.wet ? 3.6 : 6.3, acc = p.on ? 70 : 34;
    p.vx = approach(p.vx, dir * sp, (dir ? acc : (p.on ? 60 : 8)) * h);
    p.vy = Math.min(p.wet ? 4 : 27, p.vy + (p.wet ? 13 : 40) * h);
    if (p.on || feetWet) p.coy = 0.1; else p.coy -= h;
    var lad = onLadder();
    if (lad) { p.vy = jump ? -4.8 : (keys.d || tk.d) ? 5.2 : (coarse ? 2.5 : 0); p.coy = 0; p.vx *= 0.9; }
    else if (jump) { if (p.wet) p.vy = Math.max(p.vy - 52 * h, -5.2); else if (p.coy > 0) { p.vy = feetWet ? -9 : -14.2; p.coy = 0; p.on = false; } }
    if (touches("lava")) { p.vy = Math.min(p.vy, 4); if (jump) p.vy = Math.max(p.vy - 50 * h, -5); }   // lava is thick: you sink slowly and can climb out
    // horizontal, with automatic one-block step-up
    var nx = clamp(p.x + p.vx * h, 1, W - 1);
    if (!boxHit(nx, p.y)) p.x = nx;
    else if ((p.on || feetWet) && !boxHit(nx, p.y - 1.001) && !boxHit(p.x, p.y - 1.001)) { p.x = nx; p.y -= 1; }
    else p.vx = 0;
    // vertical
    var ny = p.y + p.vy * h, vpre = p.vy; p.on = false;
    if (!boxHit(p.x, ny)) p.y = ny;
    else if (p.vy > 0) { p.y = Math.floor(ny); var g = 0; while (boxHit(p.x, p.y) && g++ < 4) p.y -= 1; p.on = true; p.vy = 0; if (vpre > FALL_SAFE && !p.wet) hurt(Math.round((vpre - FALL_SAFE) * 4), "fall"); if (vpre > 8) { p.land = Math.min(0.28, vpre / 70); dust(Math.min(10, Math.round(vpre / 3))); } }
    else { p.y = Math.ceil(ny - PH) + PH; p.vy = 0; }
    if (p.y > H - 2) { p.y = H - 2.01; p.vy = 0; }
  }
  var dustT = 0;
  function dust(n) { var id = get(Math.floor(p.x), Math.floor(p.y + 0.2)), c = TILES[id] && TILES[id].solid ? TILES[id].c : "#8a8a80"; chips(p.x - p.face * 0.15, p.y - 0.05, c, n, 3); }
  function update(dt) {
    if (sleepT > 0) {   // asleep: the world holds still while the screen fades; floating Z's keep drifting
      tickSleep(dt); for (var zi = texts.length - 1; zi >= 0; zi--) { texts[zi].life -= dt; texts[zi].y -= dt * 0.9; if (texts[zi].life <= 0) texts.splice(zi, 1); }
      if (sleepT > 0 && Math.random() < dt * 3) text(p.x + 0.4, p.y - PH - 0.1, "z", "#cfd6ff"); return;
    }
    S.time = (S.time + dt) % CYCLE;
    if (p.land) p.land = Math.max(0, p.land - dt * 2.2);
    dustT -= dt; if (dustT <= 0 && p.on && Math.abs(p.vx) > 4) { dustT = 0.12; dust(1); }
    var dir = ((keys.r || tk.r) ? 1 : 0) - ((keys.l || tk.l) ? 1 : 0), jump = keys.j || tk.j;
    if (dir) p.face = dir;
    updateDoors(dt, dir);
    var sub = Math.ceil(dt / 0.02), h = dt / sub;
    for (var i = 0; i < sub; i++) step(h, dir, jump);
    p.walk += Math.abs(p.vx) * dt; if (p.wet) S.st.swim += dt;
    if (touches("lava")) hurt(LAVA_DPS * dt, "lava", true);
    hurtT = Math.max(0, hurtT - dt); hurtGrace = Math.max(0, hurtGrace - dt); shake = Math.max(0, shake - dt * 3); sinceHurt += dt;
    if (hp < MAXHP && sinceHurt > REGEN_WAIT) hp = Math.min(MAXHP, hp + REGEN_RATE * dt);
    drawHp();
    var depth = Math.max(0, Math.floor(p.y - SURF)); if (depth > S.st.maxDepth) S.st.maxDepth = depth;
    var tcx = Math.floor(p.x), tcy = Math.floor(p.y - 1); if (tcx + "," + tcy !== exKey) { exKey = tcx + "," + tcy; reveal(); }
    cam.x += (p.x - cam.x) * Math.min(1, dt * 7); cam.y += (p.y - 1.1 - cam.y) * Math.min(1, dt * 6);
    var halfW = vw / 2 / ts, halfH = vh / 2 / ts;
    cam.x = W <= halfW * 2 ? W / 2 : clamp(cam.x, halfW, W - halfW); cam.y = H <= halfH * 2 ? H / 2 : clamp(cam.y, halfH, H - halfH + 2);
    // aim tile follows the camera while a finger or mouse is held still
    aim.tx = Math.floor((aim.mx - ox) / ts); aim.ty = Math.floor((aim.my - oy) / ts);
    if (aim.tx < 0 || aim.tx >= W || aim.ty < 0 || aim.ty >= H) aim.tx = -1;
    useTool(dt); updateEnemies(dt);
    var working = sel === "weapon" ? (aim.down && S.wpn > 0) : (!!mine || (aim.down && sel !== "pick" && sel !== "shovel" && aim.tx >= 0)); heldAmt += ((working ? 1 : 0) - heldAmt) * Math.min(1, dt * 12); if (working) heldPh += dt * (sel === "pick" || sel === "shovel" ? 5.4 : sel === "weapon" ? 1 / WEAPONS[S.wpn].cd : 3);
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
  function biomeMix(x) { var we = smoothW(SW.B_EMBER - 12, SW.B_EMBER + 12, x), wf = 1 - smoothW(SW.B_FROST - 12, SW.B_FROST + 12, x); return [1 - we - wf, we, wf]; }   // [swamp, ember, frost] weights
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
    if (shake > 0 && !reduce) { ox += Math.round((Math.random() - 0.5) * shake * 10); oy += Math.round((Math.random() - 0.5) * shake * 10); }
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
        else if (td.kind === "painting") g.drawImage(paintingCanvas(i, j), 0, 0, 16, 16, sx3, sy, ts, ts);
        else g.drawImage(ATLAS, v * 16, id * 16, 16, 16, sx3, sy, ts, ts);
      } else if (td.kind === "leaves") {
        var lo = function (a, b) { return !TILES[get(a, b)].solid; };
        var lmask = (lo(i, j - 1) ? 1 : 0) | (lo(i, j + 1) ? 2 : 0) | (lo(i - 1, j) ? 4 : 0) | (lo(i + 1, j) ? 8 : 0);
        g.drawImage(LEAFATLAS, v * 16, lmask * 16, 16, 16, sx3, sy, ts, ts);
      } else {
        g.drawImage(ATLAS, v * 16, id * 16, 16, 16, sx3, sy, ts, ts);
        // exposed faces get a lit rim on top and a shadow on the sides and bottom, so caves and cliffs read clearly
        var nT = !TILES[get(i, j - 1)].solid || get(i, j - 1) === T.LEAVES, nB = !TILES[get(i, j + 1)].solid, nL = !TILES[get(i - 1, j)].solid, nR = !TILES[get(i + 1, j)].solid;
        if (td.kind === "door") { /* the door art has its own frame and shading */ }
        else if (td.kind === "leaves") {
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
    drawEnemies(g, now);
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
    g.imageSmoothingEnabled = true; g.drawImage(VIG, 0, 0, vw, vh);
    var ha = Math.min(0.6, hurtT * 1.2) + (hp <= MAXHP * 0.3 ? (reduce ? 0.18 : 0.16 + 0.08 * Math.sin(now / 280)) : 0);
    if (ha > 0.01) { if (!HVIG) { HVIG = document.createElement("canvas"); HVIG.width = HVIG.height = 128; var hg = HVIG.getContext("2d"), hr = hg.createRadialGradient(64, 64, 34, 64, 64, 92); hr.addColorStop(0, "rgba(200,20,20,0)"); hr.addColorStop(1, "rgba(200,20,20,.9)"); hg.fillStyle = hr; hg.fillRect(0, 0, 128, 128); } g.globalAlpha = ha; g.drawImage(HVIG, 0, 0, vw, vh); g.globalAlpha = 1; }
    g.imageSmoothingEnabled = false;
    g.font = "800 " + Math.max(12, Math.round(ts * 0.52)) + "px Nunito, system-ui, sans-serif"; g.textAlign = "center"; g.lineWidth = 3.5; g.strokeStyle = "rgba(0,0,0,.75)"; g.lineJoin = "round";
    texts.forEach(function (tx) { g.globalAlpha = clamp(tx.life * 1.5, 0, 1); g.fillStyle = tx.c; g.strokeText(tx.s, ox + tx.x * ts, oy + tx.y * ts); g.fillText(tx.s, ox + tx.x * ts, oy + tx.y * ts); }); g.globalAlpha = 1;
    drawGuide(g, now);
    drawBedPrompt(g, now);
    drawHolePrompt(g, now);
    // cursor: animated corner brackets
    if (!panelOpen && aim.tx >= 0 && (!coarse || aim.down)) {
      var ddx = aim.tx + 0.5 - p.x, ddy = aim.ty + 0.5 - (p.y - PH / 2), ok = ddx * ddx + ddy * ddy <= REACH * REACH, cx0 = ox + aim.tx * ts, cy0 = oy + aim.ty * ts, L3 = ts * 0.3, pu = 1 + Math.sin(now / 160) * 0.06;
      g.strokeStyle = ok ? "rgba(255,244,200,.95)" : "rgba(255,90,90,.6)"; g.lineWidth = 2; g.beginPath();
      [[0, 0, 1, 1], [1, 0, -1, 1], [0, 1, 1, -1], [1, 1, -1, -1]].forEach(function (c) { var bx = cx0 + c[0] * ts + (c[0] ? 1 : -1) * (pu - 1) * ts, by = cy0 + c[1] * ts + (c[1] ? 1 : -1) * (pu - 1) * ts; g.moveTo(bx + c[2] * L3, by); g.lineTo(bx, by); g.lineTo(bx, by + c[3] * L3); });
      g.stroke();
    }
    drawSleepFade(g);
  }
  function sky2(g, f, c1, c2, r, now, moon) {
    var x = vw * (0.08 + 0.84 * f), y = vh * 0.34 - Math.sin(f * Math.PI) * vh * 0.26, rg = g.createRadialGradient(x, y, 0, x, y, r * 4.5);
    rg.addColorStop(0, c2 + "bb"); rg.addColorStop(0.35, c2 + "40"); rg.addColorStop(1, c2 + "00"); g.fillStyle = rg; g.fillRect(x - r * 4.5, y - r * 4.5, r * 9, r * 9);
    g.fillStyle = c1; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
    if (moon) { g.fillStyle = "rgba(120,140,190,.35)"; [[-0.3, -0.2, 0.28], [0.35, 0.15, 0.2], [-0.1, 0.45, 0.15]].forEach(function (c) { g.beginPath(); g.arc(x + c[0] * r, y + c[1] * r, c[2] * r, 0, 6.2832); g.fill(); }); }
    else { g.strokeStyle = "rgba(255,230,150,.35)"; g.lineWidth = 2; g.beginPath(); for (var k = 0; k < 10; k++) { var a = k / 10 * 6.2832 + now / 6000; g.moveTo(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35); g.lineTo(x + Math.cos(a) * r * 1.75, y + Math.sin(a) * r * 1.75); } g.stroke(); }
  }
  // The tool or block in your hand. The pick swings down while you dig; a held block bobs while you build.
  function heldCanvas(tier) {
    if (!PCV[tier]) { var c = document.createElement("canvas"); c.width = c.height = 32; drawPickIcon(c.getContext("2d"), tier); PCV[tier] = c; }
    return PCV[tier];
  }
  var SCV = null;
  function heldShovel() { if (!SCV) { SCV = document.createElement("canvas"); SCV.width = SCV.height = 32; drawShovelIcon(SCV.getContext("2d")); } return SCV; }
  var WCV = [];
  function heldWeapon(tier) {
    if (!WCV[tier]) { var c = document.createElement("canvas"); c.width = c.height = 32; drawWeaponIcon(c.getContext("2d"), tier); WCV[tier] = c; }
    return WCV[tier];
  }
  // Arm angle (phi: 0 = hanging, ~2.5 = raised overhead) and tool angle for the current swing, so the arm and the tool move as one
  function toolPose() {
    var sway = reduce ? 0 : Math.sin(p.walk * 5), moving = p.on && Math.abs(p.vx) > 0.5 ? 1 : 0;
    var kind = sel === "pick" || sel === "shovel" ? "pick" : sel === "weapon" ? "weapon" : "item", sw = 0, base = 0.15, k1 = -0.55, k2 = 1.9, amp = 0.06, has = false, ph;
    if (kind === "pick") { has = sel === "shovel" ? S.shovel >= 1 : S.tier >= 1; ph = heldPh % 1; sw = Math.sin(Math.min(1, ph / 0.55) * Math.PI * 0.5) * (ph < 0.55 ? 1 : 1 - (ph - 0.55) / 0.45); }
    else if (kind === "weapon") { has = S.wpn >= 1; ph = heldPh % 1; sw = Math.sin(Math.min(1, ph / 0.4) * Math.PI * 0.5) * (ph < 0.4 ? 1 : 1 - (ph - 0.4) / 0.6); base = 0.2; k1 = -0.7; k2 = 2.2; amp = 0.05; }
    else has = !!(ITEMS[sel] && ITEMS[sel].tile !== undefined);
    var ang = base + heldAmt * (k1 + sw * k2) + sway * amp * (1 - heldAmt), phi;
    if (kind === "item") phi = (has ? 0.85 : 0.3 + sway * 0.4 * moving) + heldAmt * Math.sin(heldPh * 6.28) * 0.3;
    else {
      var idle = has ? 0.38 + sway * 0.12 * moving : 0.3 + sway * 0.45 * moving, work = 2.5 - (base + k1 + sw * k2 + 0.4) * 0.8;
      phi = idle * (1 - heldAmt) + work * heldAmt;
    }
    return { ang: ang, phi: phi, has: has, kind: kind };
  }
  function drawHeld(g, hx, hy, tp) {
    g.shadowBlur = 0; g.shadowColor = "transparent";
    var sm = g.imageSmoothingEnabled;
    if (sel === "pick") {
      if (S.tier < 1) return;
      var tsz = ts * 1.35;
      g.save(); g.translate(hx, hy); g.rotate(tp.ang); g.imageSmoothingEnabled = true;
      g.drawImage(heldCanvas(S.tier), -tsz * 6 / 32, -tsz * 28 / 32, tsz, tsz); g.restore();
    } else if (sel === "shovel") {
      if (!S.shovel) return;
      var ssz = ts * 1.35;
      g.save(); g.translate(hx, hy); g.rotate(tp.ang); g.imageSmoothingEnabled = true;
      g.drawImage(heldShovel(), -ssz * 6 / 32, -ssz * 28 / 32, ssz, ssz); g.restore();
    } else if (sel === "weapon") {
      if (S.wpn < 1) return;
      var wsz = ts * 1.5;
      g.save(); g.translate(hx, hy); g.rotate(tp.ang); g.imageSmoothingEnabled = true;
      g.drawImage(heldWeapon(S.wpn), -wsz * 6 / 32, -wsz * 28 / 32, wsz, wsz); g.restore();
    } else if (ITEMS[sel] && ITEMS[sel].tile !== undefined) {
      var bob = heldAmt * Math.sin(heldPh * 6.28) * ts * 0.06, bs = ts * 0.55;
      g.save(); g.translate(hx + ts * 0.12, hy - ts * 0.1 + bob); g.imageSmoothingEnabled = false;
      g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(-bs / 2 - 1, -bs / 2 - 1, bs + 2, bs + 2);
      g.drawImage(ATLAS, 0, ITEMS[sel].tile * 16, 16, 16, -bs / 2, -bs / 2, bs, bs); g.restore();
    }
    g.imageSmoothingEnabled = sm;
  }
  function drawPlayer(g, now) {
    var sx = ox + p.x * ts, sy = oy + p.y * ts, bob = p.on && Math.abs(p.vx) > 0.5 ? Math.sin(p.walk * 5) : 0;
    var sq = 1 + bob * 0.03 + (p.vy < -2 ? 0.05 : 0) - (p.vy > 6 ? 0.04 : 0) - (p.land || 0);
    g.save(); g.translate(sx, sy + ts * 0.14); g.scale(p.face, 1);
    g.fillStyle = "rgba(0,0,0,.28)"; g.beginPath(); g.ellipse(0, -ts * 0.1, ts * 0.48, ts * 0.13, 0, 0, 6.2832); g.fill();
    g.scale(1 / sq, sq); if (p.wet) g.globalAlpha = 0.85;
    if (hurtT > 0 && (reduce || Math.floor(now / 70) % 2)) g.globalAlpha = 0.45;
    var SP = getSprite();
    if (SP) {
      var pose = !p.on ? (p.vy < 0 ? "jump" : "fall") : Math.abs(p.vx) > 0.5 ? "walk" + (Math.floor(p.walk / 0.8) % 4) : "idle" + (reduce ? 0 : Math.floor(now / 520) % 2);
      var fx = -SP.fw / 2, fy = -SP.footY - ts * 0.12, sh = SP.shoulder(pose), tp = toolPose(), sm0 = g.imageSmoothingEnabled;
      var gl2 = 1 - daylight(S.time);
      if (gl2 > 0.2 || p.y > col[clamp(Math.floor(p.x), 0, W - 1)] + 3) { g.shadowColor = "rgba(110,255,210,.45)"; g.shadowBlur = ts * 0.4; }
      g.imageSmoothingEnabled = false;
      g.drawImage(SP.frame(pose), fx, fy);
      var shx = fx + sh[0], shy = fy + sh[1];
      g.save(); g.translate(shx, shy); g.rotate(-tp.phi); g.drawImage(SP.arm, -SP.armPivot[0], -SP.armPivot[1]); g.restore();
      g.imageSmoothingEnabled = sm0;
      drawHeld(g, shx + SP.armLen * Math.sin(tp.phi), shy + SP.armLen * Math.cos(tp.phi), tp);
      try {   // rarity aura: a few twinkles around the avatar when the outfit is rare
        var ac = typeof AV !== "undefined" && AV.aura ? AV.aura(spriteOutfit || {}) : "";
        if (ac && !reduce) { g.shadowBlur = 0; g.shadowColor = "transparent"; g.fillStyle = ac; for (var ti = 0; ti < 3; ti++) { var ta = now / 1100 + ti * 2.1, tw = 0.5 + 0.5 * Math.sin(now / 260 + ti * 1.7), px = Math.max(2, Math.round(ts * 0.09)); g.globalAlpha = 0.25 + 0.6 * tw; g.fillRect(Math.cos(ta) * ts * 0.62 - px / 2, -ts * (0.9 + 0.35 * Math.sin(ta * 1.3)), px, px); } g.globalAlpha = 1; }
      } catch (e) {}
    } else { g.fillStyle = "#4ee6b4"; g.beginPath(); g.arc(0, -ts * 0.7, ts * 0.6, 0, 6.2832); g.fill(); }
    g.restore();
  }

  // ---------- CAVES (top-down, like the Stardew Valley mines) ----------
  // On the surface Delve is side-on. Tap a Cave Hole (or press F next to it) and you climb down into a cave seen from ABOVE:
  // walk up, down, left and right, break rocks and ore with your pick, place torches, and find the ladder down to the next floor.
  // While you are underground the surface is frozen (p, tiles and enemies are not touched), so leaving puts you back beside the hole.
  // Floors come from SbxCave.gen(runSeed, floor, biome). A new run seed is picked every time you enter, and floors stay in memory until you leave.
  // Floor 1's up ladder is the way out. Nothing in a cave is saved except your bag and stats (S.st.caves / cmined / caveDeep).
  var joy = { x: 0, y: 0 }, cave = null, trans = null, actBtn = null, cp = { x: 0, y: 0, vx: 0, vy: 0, face: 1 }, CAVE_REACH = 3.4, CAVE_SPEED = 5.2, CATLAS = [], CNODE = {};
  function joyReset() { joy.x = joy.y = 0; var jk = $("sbxJoyKnob"); if (jk) jk.style.transform = ""; }
  function stopInput() { joyReset(); keys.l = keys.r = keys.j = keys.u = keys.d = 0; tk.l = tk.r = tk.j = tk.u = tk.d = 0; aim.down = false; mine = null; }
  function holeNear() {   // the closest Cave Hole within about 4 tiles of you on the surface, or null
    var cx = Math.floor(p.x), cy = Math.floor(p.y - 1), best = null, bd = 4.3 * 4.3, x, y, dx, dy, d;
    for (y = cy - 3; y <= cy + 3; y++) for (x = cx - 4; x <= cx + 4; x++) if (get(x, y) === T.HOLE) { dx = x + 0.5 - p.x; dy = y + 0.5 - (p.y - 0.5); d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { x: x, y: y }; } }
    return best;
  }
  function enterCave(hx, hy) {
    if (!SC || cave || trans || sleepT > 0 || hp <= 0) return;
    var hb = world.bio[clamp(hx, 0, W - 1)];
    stopInput(); thud(150, 0.08);
    trans = { t: 0, done: false, mid: function () {
      cave = { hole: { x: hx, y: hy, b: hb }, run: ((Math.random() * 2e9) | 0) || 1, floors: {}, f: 0, F: null };
      S.st.caves++; enemies.length = 0; stageEl.classList.add("cave"); $("sbxHint").classList.remove("on");
      setFloor(1, "down"); save();
    } };
  }
  function setFloor(f, from) {
    var F = cave.floors[f] || (cave.floors[f] = SC.gen(cave.run, f, cave.hole.b));
    cave.f = f; cave.F = F;
    if (from === "up") {   // you climbed UP from the floor below: you pop out beside this floor's ladder down
      var o = [[0, 1], [0, -1], [-1, 0], [1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]], k, nx, ny; cp.x = F.down.x + 0.5; cp.y = F.down.y + 0.9;
      for (k = 0; k < o.length; k++) { nx = F.down.x + o[k][0]; ny = F.down.y + o[k][1]; if (!SC.solid(F, nx, ny)) { cp.x = nx + 0.5; cp.y = ny + 0.85; break; } }
    } else { cp.x = F.spawn.x; cp.y = F.spawn.y; }
    cp.vx = cp.vy = 0; cam.x = cp.x; cam.y = cp.y - 0.8; mine = null; parts.length = 0; texts.length = 0; hbDirty = true;
    if (f > S.st.caveDeep) S.st.caveDeep = f;
    var el = $("sbxBCard"); el.style.setProperty("--bc", BIOMES[F.biome].c); el.querySelector("b").textContent = "Floor " + f; el.querySelector("small").textContent = F.theme.n;
    el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
    hud(); checkGoals();
  }
  function leaveCaveNow() {
    if (!cave) return; var h = cave.hole; cave = null; stageEl.classList.remove("cave"); stopInput();
    p.x = h.x + 0.5; p.y = h.y + 1; p.vx = p.vy = 0; p.on = false; var guard = 0; while (boxHit(p.x, p.y) && guard++ < 8) p.y -= 1;
    enemies.length = 0; spawnT = 6; batT = 8; cam.x = p.x; cam.y = p.y - 1.1; parts.length = 0; texts.length = 0; lastBio = -1; hbDirty = true; hud(); save();
  }
  function ladderNear() {   // { k: "up" | "down" } for the ladder within about 2.6 cells of your feet, or null
    var F = cave.F, r = null;
    [[F.up, "up"], [F.down, "down"]].forEach(function (e) { var dx = e[0].x + 0.5 - cp.x, dy = e[0].y + 0.5 - (cp.y - 0.3), d = dx * dx + dy * dy; if (d <= 2.6 * 2.6 && (!r || d < r.d)) r = { k: e[1], d: d }; });
    return r;
  }
  function useLadder(k) {
    if (trans || !cave) return; stopInput(); thud(k === "up" ? 330 : 200, 0.07);
    if (k === "up") trans = { t: 0, done: false, mid: function () { if (cave.f <= 1) leaveCaveNow(); else setFloor(cave.f - 1, "up"); } };
    else trans = { t: 0, done: false, mid: function () { setFloor(cave.f + 1, "down"); save(); } };
  }
  function cBox(F, x, y) {   // does a body standing with its feet at (x, y) overlap a wall or rock? The footprint is small, so the head can pass in front of things
    var x0 = Math.floor(x - 0.26), x1 = Math.floor(x + 0.26), y0 = Math.floor(y - 0.32), y1 = Math.floor(y - 0.001);
    for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) if (SC.solid(F, xx, yy)) return true;
    return false;
  }
  function breakRock(x, y) {
    var F = cave.F, i = y * F.w + x, id = F.node[i], td = TILES[id]; F.node[i] = 0; S.st.mined++; S.st.cmined++;
    chips(x + 0.5, y + 0.5, td.kind === "ore" ? td.c2 : td.c, td.kind === "ore" ? 14 : 9, 6); thud(td.hard > 2 ? 110 : 160, 0.08);
    var n = dropQty(td); if (id === T.STONE && Math.random() < 0.5) n++;
    give(td.drop, n, x, y); if (td.kind === "ore") snd("coin");
    if (id === T.STONE && Math.random() < 0.12) give("pebble", 1, x, y - 0.55);
  }
  function caveTool(dt) {
    var F = cave.F; if (!aim.down || aim.tx < 0) { mine = null; return; }
    var tx = aim.tx, ty = aim.ty, i = ty * F.w + tx, dx = tx + 0.5 - cp.x, dy = ty + 0.5 - (cp.y - 0.4);
    if (dx * dx + dy * dy > CAVE_REACH * CAVE_REACH) { mine = null; return; }
    if (Math.abs(dx) > 0.3) cp.face = dx < 0 ? -1 : 1;
    var nid = F.node[i];
    if (nid) {
      var td = TILES[nid];
      if (sel !== "pick" && sel !== "shovel") { nag("Hold your pick to break rocks (press Q)."); mine = null; return; }
      if (sel === "shovel" && !SOFT[nid]) { nag("A shovel only digs soft things. Use your pick for " + td.n + "."); mine = null; return; }
      if (sel === "shovel" && toolBroken("shovel")) { nag("Your shovel is broken. Repair it in the Craft tab."); mine = null; return; }
      if (sel === "pick" && td.tier > effTier()) { nag(S.tier >= td.tier ? "Your pick is broken. Repair it in the Craft tab." : "Needs the " + PICKS[td.tier].n + " to break " + td.n + "."); mine = null; return; }
      if (!mine || mine.x !== tx || mine.y !== ty) mine = { x: tx, y: ty, p: 0, tick: 0 };
      mine.p += dt * (sel === "shovel" ? SHOVEL.sp : PICKS[effTier()].sp) / td.hard; mine.tick -= dt;
      if (mine.tick <= 0) { mine.tick = 0.17; thud(150 + Math.random() * 50, 0.035); chips(tx + 0.5, ty + 0.5, td.kind === "ore" ? td.c2 : td.c, 1, 3); }
      if (mine.p >= 1) { breakRock(tx, ty); mine = null; if (sel === "shovel") wear("shovel", 1); else if (effTier() > 0) wear("pick", td.hard >= 2 ? 2 : 1); }
      return;
    }
    mine = null; cool -= dt; if (cool > 0) return;
    if (F.torch[i]) { if (sel === "pick" || sel === "shovel") { cool = 0.25; F.torch[i] = 0; give("torch", 1, tx, ty); thud(300, 0.04); } return; }
    if (F.wall[i]) return;
    if (sel === "torch" && (S.inv.torch || 0) > 0) {
      if ((tx === F.up.x && ty === F.up.y) || (tx === F.down.x && ty === F.down.y)) return;
      cool = 0.2; F.torch[i] = 1; S.inv.torch--; S.st.torches++; S.st.placed++; chips(tx + 0.5, ty + 0.5, "#ffb13b", 4, 3); thud(420, 0.05);
      if (S.inv.torch <= 0) { delete S.inv.torch; if (sel === "torch") sel = "pick"; } hbDirty = true; if (panelOpen) renderPanel();
    } else if (sel !== "pick" && sel !== "shovel" && sel !== "weapon") { cool = 0.4; nag("Only torches can be placed in caves."); }
  }
  function caveUpdate(dt) {
    var F = cave.F, i;
    S.time = (S.time + dt) % CYCLE;
    var dx = ((keys.r || tk.r) ? 1 : 0) - ((keys.l || tk.l) ? 1 : 0), dy = ((keys.d || tk.d) ? 1 : 0) - ((keys.u || tk.u) ? 1 : 0), len = Math.sqrt(dx * dx + dy * dy) || 1, mag = 1;
    if (joy.x || joy.y) { dx = joy.x; dy = joy.y; mag = Math.min(1, Math.sqrt(dx * dx + dy * dy)); len = Math.sqrt(dx * dx + dy * dy) || 1; }   // analog stick: the further you push, the faster you walk
    cp.vx = approach(cp.vx, dx / len * CAVE_SPEED * mag, 70 * dt); cp.vy = approach(cp.vy, dy / len * CAVE_SPEED * mag, 70 * dt);
    if (Math.abs(dx) > 0.2) cp.face = dx < 0 ? -1 : 1;
    var sub = Math.ceil(dt / 0.02), h = dt / sub;
    for (i = 0; i < sub; i++) {
      var nx = cp.x + cp.vx * h; if (!cBox(F, nx, cp.y)) cp.x = nx; else cp.vx = 0;
      var ny = cp.y + cp.vy * h; if (!cBox(F, cp.x, ny)) cp.y = ny; else cp.vy = 0;
    }
    var spd = Math.sqrt(cp.vx * cp.vx + cp.vy * cp.vy); p.walk += spd * dt; p.vx = spd > 0.5 ? spd : 0; p.on = true; p.vy = 0; p.face = cp.face;
    hurtT = Math.max(0, hurtT - dt); hurtGrace = Math.max(0, hurtGrace - dt); shake = 0; sinceHurt += dt;
    if (hp < MAXHP && sinceHurt > REGEN_WAIT) hp = Math.min(MAXHP, hp + REGEN_RATE * dt);
    drawHp();
    cam.x += (cp.x - cam.x) * Math.min(1, dt * 8); cam.y += (cp.y - 0.8 - cam.y) * Math.min(1, dt * 8);
    var halfW = vw / 2 / ts, halfH = vh / 2 / ts;
    cam.x = F.w <= halfW * 2 ? F.w / 2 : clamp(cam.x, halfW, F.w - halfW); cam.y = F.h <= halfH * 2 ? F.h / 2 : clamp(cam.y, halfH, F.h - halfH);
    aim.tx = Math.floor((aim.mx - ox) / ts); aim.ty = Math.floor((aim.my - oy) / ts);
    if (aim.tx < 0 || aim.tx >= F.w || aim.ty < 0 || aim.ty >= F.h) aim.tx = -1;
    caveTool(dt);
    var working = !!mine; heldAmt += ((working ? 1 : 0) - heldAmt) * Math.min(1, dt * 12); if (working) heldPh += dt * 5.4;
    for (var k = parts.length - 1; k >= 0; k--) { var q = parts[k]; q.life -= dt; if (q.life <= 0) { parts.splice(k, 1); continue; } q.vy += 22 * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
    for (var m = texts.length - 1; m >= 0; m--) { texts[m].life -= dt; texts[m].y -= dt * 0.9; if (texts[m].life <= 0) texts.splice(m, 1); }
    msT -= dt; if (msT <= 0) { msT = 0.6; checkGoals(); }
    hudT -= dt; if (hudT <= 0) { hudT = 0.25; hud(); }
    saveT += dt * 1000; if (saveT >= SAVE_MS) { saveT = 0; save(); }
  }
  function tickTrans(dt) { trans.t += dt; if (!trans.done && trans.t >= 0.3) { trans.done = true; trans.mid(); } if (trans.t >= 0.6) trans = null; }
  function drawTrans() { if (!trans) return; var a = trans.t < 0.3 ? trans.t / 0.3 : Math.max(0, (0.6 - trans.t) / 0.3); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = "#03050a"; ctx.fillRect(0, 0, vw, vh); ctx.globalAlpha = 1; }

  // ---- cave art (all drawn in code, like the surface tiles) ----
  function caveAtlas(b) {   // 4 variants across; rows: floor, wall top, wall face
    if (CATLAS[b]) return CATLAS[b];
    var th = SC.THEMES[b], c = document.createElement("canvas"); c.width = 64; c.height = 48; var g = c.getContext("2d"), v, x, y, ry, ox2;
    for (v = 0; v < 4; v++) {
      ox2 = v * 16;
      var hh = function (px, py, s) { return SW.hash(px + v * 16, py + s * 7, 900 + b); };
      var R = function (px, py, w, h2, col, a) { g.globalAlpha = a == null ? 1 : a; g.fillStyle = col; g.fillRect(ox2 + px, ry + py, w, h2); g.globalAlpha = 1; };
      ry = 0; R(0, 0, 16, 16, th.floor);
      for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) { var r = hh(x, y, 1); if (r < 0.18) R(x, y, 1, 1, th.floor2, 0.7); else if (r > 0.9) R(x, y, 1, 1, "#000", 0.18); if (hh(x >> 2, y >> 2, 2) < 0.2) R(x, y, 1, 1, "#000", 0.07); }
      if (hh(3, 3, 5) > 0.55) { var px = 2 + Math.floor(hh(4, 4, 5) * 10), py = 2 + Math.floor(hh(5, 5, 5) * 10); R(px, py, 2, 1, th.floor2); R(px, py + 1, 2, 1, "#000", 0.25); }
      R(0, 15, 16, 1, "#000", 0.07); R(15, 0, 1, 16, "#000", 0.07);
      ry = 16; R(0, 0, 16, 16, th.top);
      for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) { var r2 = hh(x, y, 3); if (r2 < 0.2) R(x, y, 1, 1, th.topHi, 0.8); else if (r2 > 0.93) R(x, y, 1, 1, "#000", 0.3); }
      ry = 32; R(0, 0, 16, 16, th.face);
      for (x = 0; x < 16; x++) R(x, 0, 1, 16, hh(x, 0, 6) < 0.5 ? th.faceHi : th.faceLo, 0.2);
      for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) { var r3 = hh(x, y, 4); if (r3 < 0.14) R(x, y, 1, 1, th.faceHi, 0.55); else if (r3 > 0.92) R(x, y, 1, 1, th.faceLo, 0.8); }
      R(0, 0, 16, 3, th.faceHi, 0.5); R(0, 0, 16, 1, "#fff", 0.12); R(0, 5 + Math.floor(hh(1, 1, 7) * 5), 16, 1, th.faceLo, 0.45); R(0, 13, 16, 3, th.faceLo, 0.85); R(0, 12, 16, 1, th.faceLo, 0.4);
    }
    return (CATLAS[b] = c);
  }
  function caveNode(id, v) {   // a boulder (stone, clay, basalt, frostrock) or an ore-studded boulder, seen from above
    var key = id + ":" + v; if (CNODE[key]) return CNODE[key];
    var c = document.createElement("canvas"); c.width = c.height = 16; var g = c.getContext("2d"), td = TILES[id], ore = td.kind === "ore", base = td.c, acc = td.c2, x, y, mask = [];
    var hh = function (px, py, s) { return SW.hash(px + v * 19, py + id * 13, s + id); };
    var R = function (px, py, w, h2, col, a) { g.globalAlpha = a == null ? 1 : a; g.fillStyle = col; g.fillRect(px, py, w, h2); g.globalAlpha = 1; };
    R(2, 12, 12, 3, "#000", 0.28); R(3, 14, 10, 1, "#000", 0.2);
    for (y = 0; y < 16; y++) { mask[y] = []; for (x = 0; x < 16; x++) { var dx = (x - 7.5) / 6.7, dy = (y - 8) / 5.6; mask[y][x] = dx * dx + dy * dy + (hh(x, y, 1) - 0.5) * 0.4 < 1; } }
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
      if (!mask[y][x]) continue;
      var edge = !(mask[y - 1] && mask[y - 1][x]) || !mask[y][x - 1] || !mask[y][x + 1] || !(mask[y + 1] && mask[y + 1][x]), s = ((x - 7.5) / 6.7 + (y - 8) / 5.6);
      R(x, y, 1, 1, base); if (s < -0.5) R(x, y, 1, 1, "#fff", 0.2); else if (s > 0.55) R(x, y, 1, 1, "#000", 0.25);
      if (hh(x, y, 2) < 0.12) R(x, y, 1, 1, acc, ore ? 0.25 : 0.55); if (edge) R(x, y, 1, 1, "#000", 0.35);
    }
    if (ore) for (var j = 0; j < 4; j++) { var gx = 4 + Math.floor(hh(j, 3, 5) * 7), gy = 4 + Math.floor(hh(j, 4, 6) * 5); if (mask[gy][gx] && mask[gy + 1][gx + 1]) { R(gx - 1, gy - 1, 4, 4, acc, 0.2); R(gx, gy, 2, 2, acc); R(gx, gy, 1, 1, "#fff", 0.9); } }
    else if (id === T.CLAY) { R(4, 7, 8, 1, "#000", 0.14); R(5, 10, 6, 1, "#fff", 0.12); }
    else if (id === T.STONE) { R(5, 6, 1, 2, "#2d3236", 0.6); R(6, 8, 2, 1, "#2d3236", 0.6); }
    return (CNODE[key] = c);
  }
  function drawShaft(g, sx, sy) {   // the hole to the next floor: a stone rim, a dark pit and the top of a ladder
    g.fillStyle = "#2a2724"; g.fillRect(sx + ts * 0.06, sy + ts * 0.06, ts * 0.88, ts * 0.88); g.fillStyle = "#4a443e"; g.fillRect(sx + ts * 0.06, sy + ts * 0.06, ts * 0.88, Math.max(2, ts * 0.08));
    g.fillStyle = "#040506"; g.fillRect(sx + ts * 0.15, sy + ts * 0.15, ts * 0.7, ts * 0.7); g.fillStyle = "#0b0d0f"; g.fillRect(sx + ts * 0.15, sy + ts * 0.55, ts * 0.7, ts * 0.3);
    g.fillStyle = "#a8703c"; g.fillRect(sx + ts * 0.3, sy + ts * 0.15, ts * 0.07, ts * 0.45); g.fillRect(sx + ts * 0.63, sy + ts * 0.15, ts * 0.07, ts * 0.45);
    g.fillStyle = "#c98c4f"; [0.24, 0.37, 0.5].forEach(function (yy) { g.fillRect(sx + ts * 0.3, sy + ts * yy, ts * 0.4, Math.max(2, ts * 0.05)); });
  }
  function drawPill(g, now, label, sx, sy, no, fn) {   // a tappable pill above a ladder or hole (tap it, or press F)
    g.font = "800 " + Math.max(12, Math.round(ts * 0.5)) + "px Nunito, system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    sy += reduce ? 0 : Math.sin(now / 300) * 2;
    var w = g.measureText(label).width + ts * 1.1, h = Math.max(26, ts * 0.9), x0 = sx - w / 2, y0 = sy - h / 2;
    g.fillStyle = no ? "rgba(70,34,40,.88)" : "rgba(38,30,10,.92)"; g.strokeStyle = no ? "#ff8a7a" : "#f2c14e"; g.lineWidth = 2;
    g.beginPath(); g.arc(x0 + h / 2, y0 + h / 2, h / 2, Math.PI / 2, Math.PI * 1.5); g.arc(x0 + w - h / 2, y0 + h / 2, h / 2, -Math.PI / 2, Math.PI / 2); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#f6eedb"; g.fillText(label, sx, sy + 1); g.textBaseline = "alphabetic";
    actBtn = { x: x0, y: y0, w: w, h: h, fn: fn };
  }
  function drawHolePrompt(g, now) {   // surface: a pill above a nearby Cave Hole
    actBtn = null; if (panelOpen || sleepT > 0 || !SC || trans) return;
    var h = holeNear(); if (!h) return;
    drawPill(g, now, coarse ? "Enter cave" : "Enter cave (F)", ox + (h.x + 0.5) * ts, oy + h.y * ts - ts * 0.8, false, function () { enterCave(h.x, h.y); });
  }
  function drawCavePlayer(g, now) {
    var sx = ox + cp.x * ts, sy = oy + cp.y * ts, moving = p.vx > 0.5;
    g.save(); g.translate(sx, sy + ts * 0.14); g.scale(cp.face, 1);
    g.fillStyle = "rgba(0,0,0,.34)"; g.beginPath(); g.ellipse(0, -ts * 0.1, ts * 0.46, ts * 0.15, 0, 0, 6.2832); g.fill();
    if (hurtT > 0 && (reduce || Math.floor(now / 70) % 2)) g.globalAlpha = 0.45;
    var SP = getSprite();
    if (SP) {
      var pose = moving ? "walk" + (Math.floor(p.walk / 0.8) % 4) : "idle" + (reduce ? 0 : Math.floor(now / 520) % 2);
      var fx = -SP.fw / 2, fy = -SP.footY - ts * 0.12, sh = SP.shoulder(pose), tp = toolPose(), sm0 = g.imageSmoothingEnabled;
      g.imageSmoothingEnabled = false; g.drawImage(SP.frame(pose), fx, fy);
      var shx = fx + sh[0], shy = fy + sh[1];
      g.save(); g.translate(shx, shy); g.rotate(-tp.phi); g.drawImage(SP.arm, -SP.armPivot[0], -SP.armPivot[1]); g.restore();
      g.imageSmoothingEnabled = sm0; drawHeld(g, shx + SP.armLen * Math.sin(tp.phi), shy + SP.armLen * Math.cos(tp.phi), tp);
    } else { g.fillStyle = "#4ee6b4"; g.beginPath(); g.arc(0, -ts * 0.7, ts * 0.6, 0, 6.2832); g.fill(); }
    g.restore();
  }
  function renderCave(now) {
    var F = cave.F, th = F.theme, g = ctx, i, j, idx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false; actBtn = null;
    ox = Math.round(vw / 2 - cam.x * ts); oy = Math.round(vh / 2 - cam.y * ts);
    g.fillStyle = "#04060a"; g.fillRect(0, 0, vw, vh);
    var X0 = Math.max(0, Math.floor(-ox / ts)), X1 = Math.min(F.w - 1, Math.floor((vw - ox) / ts)), Y0 = Math.max(0, Math.floor(-oy / ts)), Y1 = Math.min(F.h - 1, Math.floor((vh - oy) / ts)), CA = caveAtlas(F.biome), W2 = F.w;
    var glows2 = [], srcs = [[cp.x, cp.y - 0.6, 7.2, 1]];
    for (j = Y0; j <= Y1; j++) for (i = X0; i <= X1; i++) {   // ground and walls
      idx = j * W2 + i; var sx = ox + i * ts, sy = oy + j * ts, v = ((Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0) & 3;
      if (F.wall[idx]) { var face = j + 1 < F.h && !F.wall[idx + W2]; g.drawImage(CA, v * 16, face ? 32 : 16, 16, 16, sx, sy, ts, ts); }
      else {
        g.drawImage(CA, v * 16, 0, 16, 16, sx, sy, ts, ts);
        if (j > 0 && F.wall[idx - W2]) { var sg = g.createLinearGradient(0, sy, 0, sy + ts * 0.5); sg.addColorStop(0, "rgba(0,0,0,.4)"); sg.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = sg; g.fillRect(sx, sy, ts, ts * 0.5); }
      }
    }
    // ladder up (against the wall above it), ladder down, lamp plants, torches
    var ux = ox + F.up.x * ts, uy = oy + F.up.y * ts;
    g.drawImage(ATLAS, 0, T.LADDER * 16, 16, 16, ux, uy - ts, ts, ts); g.drawImage(ATLAS, 0, T.LADDER * 16, 16, 16, ux, uy, ts, ts);
    if (cave.f === 1) { g.fillStyle = "rgba(255,244,190,.16)"; g.fillRect(ux, uy - ts, ts, ts * 2); srcs.push([F.up.x + 0.5, F.up.y + 0.5, 6, 0.85]); glows2.push([ux + ts / 2, uy, "255,240,180", 3.4, 0.22]); }
    drawShaft(g, ox + F.down.x * ts, oy + F.down.y * ts); srcs.push([F.down.x + 0.5, F.down.y + 0.5, 3.2, 0.55]);
    F.lamps.forEach(function (l) {
      if (l.x < X0 - 6 || l.x > X1 + 6 || l.y < Y0 - 6 || l.y > Y1 + 6) return;
      var lx = ox + l.x * ts, ly = oy + l.y * ts, lv = (l.x * 7 + l.y) & 3; g.drawImage(ATLAS, lv * 16, th.lamp * 16, 16, 16, lx, ly, ts, ts);
      glows2.push([lx + ts / 2, ly + ts / 2, th.glow, 3.2, 0.2]); srcs.push([l.x + 0.5, l.y + 0.5, 4.6, 0.8]);
    });
    var ey0 = Math.max(0, Y0 - 7), ey1 = Math.min(F.h - 1, Y1 + 7), ex0 = Math.max(0, X0 - 7), ex1 = Math.min(F.w - 1, X1 + 7);
    for (j = ey0; j <= ey1; j++) for (i = ex0; i <= ex1; i++) {   // torches give light; ore glows a little
      idx = j * W2 + i; var inView = i >= X0 && i <= X1 && j >= Y0 && j <= Y1;
      if (F.torch[idx]) { srcs.push([i + 0.5, j + 0.5, 6.8, 1]); if (inView) { g.drawImage(ATLAS, 0, T.TORCH * 16, 16, 16, ox + i * ts, oy + j * ts, ts, ts); glows2.push([ox + i * ts + ts / 2, oy + j * ts + ts / 2, "255,170,60", 4.2, 0.3]); } }
      else if (F.node[idx] && TILES[F.node[idx]].kind === "ore") { srcs.push([i + 0.5, j + 0.5, 2.6, 0.6]); if (inView) glows2.push([ox + i * ts + ts / 2, oy + j * ts + ts / 2, F.node[idx] === T.CINDER ? "255,120,50" : F.node[idx] === T.CRYSTAL ? "130,225,255" : "80,240,190", 2.2, 0.16]); }
    }
    // rocks and the player, drawn back to front
    var prow = Math.floor(cp.y), drawRocks = function (ja, jb) {
      for (var rj = ja; rj <= jb; rj++) for (var ri = X0; ri <= X1; ri++) {
        var rid = F.node[rj * W2 + ri]; if (!rid) continue;
        var rx = ox + ri * ts, ry2 = oy + rj * ts; g.drawImage(caveNode(rid, ((ri * 7 + rj * 13) & 1)), 0, 0, 16, 16, rx, ry2, ts, ts);
        if (TILES[rid].kind === "ore" && !reduce && ((now / 90 + ri * 7 + rj * 3) | 0) % 41 === 0) { g.fillStyle = "#fff"; g.fillRect(rx + ts * 0.55, ry2 + ts * 0.3, 2, 2); }
      }
    };
    drawRocks(Y0, Math.min(Y1, prow)); drawCavePlayer(g, now); drawRocks(Math.max(Y0, prow + 1), Y1);
    if (mine) {
      var mx = ox + mine.x * ts, my = oy + mine.y * ts, nseg = 1 + Math.floor(mine.p * 6);
      g.strokeStyle = "rgba(0,0,0,.65)"; g.lineWidth = Math.max(1, ts / 14); g.beginPath();
      for (i = 0; i < nseg && i < CRACKS.length; i++) { g.moveTo(mx + ts * 0.5, my + ts * 0.5); g.lineTo(mx + ts * CRACKS[i][0], my + ts * CRACKS[i][1]); }
      g.stroke(); g.fillStyle = "rgba(255,255,255," + (0.06 + mine.p * 0.16) + ")"; g.fillRect(mx, my, ts, ts);
    }
    parts.forEach(function (q) { g.globalAlpha = clamp(q.life / q.max * 1.4, 0, 1); g.fillStyle = q.c; g.fillRect(Math.round(ox + q.x * ts - q.s / 2), Math.round(oy + q.y * ts - q.s / 2), q.s, q.s); }); g.globalAlpha = 1;
    // darkness: one pixel per cell, stretched with smoothing so the light fades softly
    var gw = X1 - X0 + 1, gh = Y1 - Y0 + 1;
    if (!LC) { LC = document.createElement("canvas"); LCX = LC.getContext("2d"); }
    if (LC.width !== gw || LC.height !== gh) { LC.width = gw; LC.height = gh; LID = LCX.createImageData(gw, gh); }
    var dk = LID.data, tr = th.tint[0], tg = th.tint[1], tb = th.tint[2];
    for (j = 0; j < gh; j++) for (i = 0; i < gw; i++) {
      var cx = X0 + i + 0.5, cy = Y0 + j + 0.5, L = 0.07;
      for (var s = 0; s < srcs.length; s++) { var sc = srcs[s], ddx = cx - sc[0], ddy = cy - sc[1], d2 = ddx * ddx + ddy * ddy, rr = sc[2]; if (d2 < rr * rr) { var kk = 1 - Math.sqrt(d2) / rr, vv = sc[3] * Math.pow(kk, 1.2); if (vv > L) L = vv; } }
      var kx = (j * gw + i) * 4; dk[kx] = tr; dk[kx + 1] = tg; dk[kx + 2] = tb; dk[kx + 3] = Math.round(clamp(1 - L, 0, 0.94) * 255);
    }
    LCX.putImageData(LID, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(LC, 0, 0, gw, gh, ox + X0 * ts, oy + Y0 * ts, gw * ts, gh * ts);
    g.imageSmoothingEnabled = false; g.globalCompositeOperation = "lighter";
    for (i = 0; i < glows2.length; i++) { var gl = glows2[i], rad = gl[3] * ts, rg = g.createRadialGradient(gl[0], gl[1], 0, gl[0], gl[1], rad); rg.addColorStop(0, "rgba(" + gl[2] + "," + gl[4] + ")"); rg.addColorStop(1, "rgba(" + gl[2] + ",0)"); g.fillStyle = rg; g.fillRect(gl[0] - rad, gl[1] - rad, rad * 2, rad * 2); }
    g.globalCompositeOperation = "source-over";
    if (!VIG || VIG.width !== Math.max(2, Math.round(vw / 2))) buildVignette();
    g.imageSmoothingEnabled = true; g.drawImage(VIG, 0, 0, vw, vh); g.imageSmoothingEnabled = false;
    g.font = "800 " + Math.max(12, Math.round(ts * 0.52)) + "px Nunito, system-ui, sans-serif"; g.textAlign = "center"; g.lineWidth = 3.5; g.strokeStyle = "rgba(0,0,0,.75)"; g.lineJoin = "round";
    texts.forEach(function (tx) { g.globalAlpha = clamp(tx.life * 1.5, 0, 1); g.fillStyle = tx.c; g.strokeText(tx.s, ox + tx.x * ts, oy + tx.y * ts); g.fillText(tx.s, ox + tx.x * ts, oy + tx.y * ts); }); g.globalAlpha = 1;
    if (!panelOpen && !trans) {   // ladder prompt
      var ln = ladderNear();
      if (ln) { var lc = ln.k === "up" ? F.up : F.down; drawPill(g, now, (ln.k === "up" ? (cave.f <= 1 ? "Climb out" : "Go up") : "Go down") + (coarse ? "" : " (F)"), ox + (lc.x + 0.5) * ts, oy + lc.y * ts - ts * (ln.k === "up" ? 1.3 : 0.5), false, function () { useLadder(ln.k); }); }
    }
    if (!panelOpen && aim.tx >= 0 && (!coarse || aim.down)) {
      var qdx = aim.tx + 0.5 - cp.x, qdy = aim.ty + 0.5 - (cp.y - 0.4), ok = qdx * qdx + qdy * qdy <= CAVE_REACH * CAVE_REACH, cx0 = ox + aim.tx * ts, cy0 = oy + aim.ty * ts, L3 = ts * 0.3, pu = 1 + Math.sin(now / 160) * 0.06;
      g.strokeStyle = ok ? "rgba(255,244,200,.95)" : "rgba(255,90,90,.6)"; g.lineWidth = 2; g.beginPath();
      [[0, 0, 1, 1], [1, 0, -1, 1], [0, 1, 1, -1], [1, 1, -1, -1]].forEach(function (c) { var bx = cx0 + c[0] * ts + (c[0] ? 1 : -1) * (pu - 1) * ts, by = cy0 + c[1] * ts + (c[1] ? 1 : -1) * (pu - 1) * ts; g.moveTo(bx + c[2] * L3, by); g.lineTo(bx, by); g.lineTo(bx, by + c[3] * L3); });
      g.stroke();
    }
  }

  // ---------- HUD AND PANELS ----------
  function hud() {
    if (cave) { var cf = cave.F; $("sbxBiome").textContent = cf.theme.n + " \u00b7 Floor " + cave.f; $("sbxLoc").style.setProperty("--bc", BIOMES[cf.biome].c); $("sbxSub").textContent = cf.theme.sub; drawTrail(); if (hbDirty) drawBar(); return; }
    var b = bioAt(), bi = BIOMES[b], ph = phaseOf(S.time), depth = Math.max(0, Math.floor(p.y - SURF)), under = p.y > col[clamp(Math.floor(p.x), 0, W - 1)] + 2;
    $("sbxBiome").textContent = bi.n; $("sbxLoc").style.setProperty("--bc", bi.c);
    $("sbxSub").textContent = PHN[ph.id] + (under ? " \u00b7 depth " + depth : " \u00b7 surface");
    if (lastBio !== b) { bcard(bi, b); lastBio = b; }
    drawTrail();
    if (hbDirty) drawBar();
  }
  function drawBar() {
    hbDirty = false; var items = bar(), html = "";
    items.forEach(function (id, i) {
      var cnt = id === "pick" ? (S.tier ? "Lv" + S.tier : "Paws") : id === "weapon" ? "Lv" + S.wpn : id === "shovel" ? "Soft" : S.inv[id];
      var dk = id === "pick" ? (S.tier ? "pick" : "") : id === "weapon" ? "wpn" : id === "shovel" ? "shovel" : "", dpc = dk ? Math.round(durOf(dk) / durMax(dk) * 100) : -1, brk = dk && toolBroken(dk);
      if (brk) cnt = "Broken";
      html += '<button type="button" class="sbx-slot' + (sel === id ? " on" : "") + (dk ? " hasdur" : "") + (brk ? " brk" : "") + '" data-sel="' + id + '" aria-label="' + (dk ? "Durability " + dpc + " percent. " : "") + (id === "pick" ? PICKS[S.tier].n : id === "shovel" ? SHOVEL.n : id === "weapon" ? WEAPONS[S.wpn].n + ", damage " + WEAPONS[S.wpn].dmg : ITEMS[id].n + ", " + S.inv[id]) + '" aria-pressed="' + (sel === id) + '"><img alt="" src="' + icon(id) + '"><i>' + (i + 1) + '</i><b>' + esc(cnt) + '</b>' + (dk ? '<u class="dur' + (dpc <= 20 ? " bad" : dpc <= 50 ? " low" : "") + '" style="--d:' + dpc + '%"></u>' : "") + '</button>';
    });
    $("sbxBar").innerHTML = html;
  }
  function costHtml(cost) {
    return Object.keys(cost).map(function (k) { var have = S.inv[k] || 0, ok = have >= cost[k]; return '<span class="' + (ok ? "ok" : "no") + '"><img alt="" src="' + icon(k) + '">' + have + "/" + cost[k] + " " + esc(ITEMS[k].n) + "</span>"; }).join("");
  }
  function renderPanel() {
    if (!panelOpen) return;
    var tabs = [["trail", "Trail"], ["craft", "Craft"], ["bag", "Bag"], ["map", "Map"], ["goals", "Goals"], ["more", "Options"]];
    if (chestKey) tabs.splice(2, 0, ["chest", "Chest"]); else if (tab === "chest") tab = "bag";
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
      h += '<p class="sbx-note">Your tool: <b style="color:' + PICKS[S.tier].c + '">' + PICKS[S.tier].n + "</b>" + (S.wpn ? ". Weapon: <b style=\"color:" + WEAPONS[S.wpn].c + "\">" + WEAPONS[S.wpn].n + " (damage " + WEAPONS[S.wpn].dmg + ")</b>" : "") + ". " + (S.st.benches ? (nb ? "A Workbench is close, so you can craft anything." : "No Workbench nearby. Walk next to yours to craft better picks.") : "Better tools unlock new rock. A Workbench lets you craft the next picks.") + "</p>";
      var rk = [S.tier >= 1 ? "pick" : "", S.shovel ? "shovel" : "", S.wpn ? "wpn" : ""].filter(Boolean);
      if (rk.length) {
        h += "<h3>Repair</h3>";
        rk.forEach(function (k) {
          var m = durMax(k), cur = durOf(k), cost = repairCost(k), full = cur >= m, needB2 = repairNeedsBench(k) && !nearBench(), can2 = !full && Object.keys(cost).every(function (q) { return (S.inv[q] || 0) >= cost[q]; }) && !needB2;
          h += '<div class="sbx-card' + (full ? " done" : "") + '"><img class="big" alt="" src="' + icon(k === "wpn" ? "weapon" : k) + '"><div><b>' + esc(toolName(k)) + "</b><small>" + (cur <= 0 ? "Broken! " : "") + "Durability " + cur + " / " + m + (!full && needB2 ? ". Needs a Bog Workbench nearby." : "") + '</small><span class="bar dur' + (cur / m <= 0.2 ? " bad" : cur / m <= 0.5 ? " low" : "") + '"><i style="width:' + Math.round(cur / m * 100) + '%"></i></span>' + (full ? "" : '<div class="cost">' + costHtml(cost) + "</div>") + '</div><button type="button" class="btn' + (can2 ? "" : " ghost") + '" data-sx-repair="' + k + '"' + (full ? " disabled" : "") + ">" + (full ? "Sturdy" : "Repair") + "</button></div>";
        });
        h += "<h3>Craft</h3>";
      }
      RECIPES.forEach(function (r) {
        var owned = (r.tier && S.tier >= r.tier) || (r.wpn && S.wpn >= r.wpn) || (r.sh && S.shovel), lock = (r.tier && S.tier < r.tier - 1) || (r.wpn && (S.wpn < r.wpn - 1 || (r.need && S.tier < r.need))), needB = r.bench && !nb, can = !owned && !lock && Object.keys(r.cost).every(function (k) { return (S.inv[k] || 0) >= r.cost[k]; }), ic = r.tier ? "pick" + r.tier : r.wpn ? "wpn" + r.wpn : r.sh ? "shovel" : Object.keys(r.out)[0];
        var im = r.wpn ? icon("wpn" + r.wpn) : r.tier ? (function () { var old = S.tier; S.tier = r.tier; var u = icon("pick"); S.tier = old; return u; })() : icon(ic);
        var note = lock ? (r.wpn ? (S.wpn < r.wpn - 1 ? "Craft the " + WEAPONS[r.wpn - 1].n + " first." : "Needs the " + PICKS[r.need].n + " first.") : "Craft the " + PICKS[r.tier - 1].n + " first.") : (needB && !owned ? "Needs a Bog Workbench nearby." : r.d);
        h += '<div class="sbx-card' + (owned || lock ? " done" : "") + '"><img class="big" alt="" src="' + im + '"><div><b>' + esc(r.n) + "</b><small>" + esc(note) + '</small><div class="cost">' + costHtml(r.cost) + '</div></div><button type="button" class="btn' + (can && !needB ? "" : " ghost") + '" data-sx-craft="' + r.id + '"' + (owned || lock ? " disabled" : "") + ">" + (owned ? "Owned" : lock ? "Locked" : "Craft") + "</button></div>";
      });
    } else if (tab === "bag") {
      var have = ORDER.filter(function (k) { return (S.inv[k] || 0) > 0; });
      h += have.length ? '<p class="sbx-note">Tap a block to hold it, then tap the world to build.</p><div class="sbx-bag">' + have.map(function (k) { var pl = ITEMS[k].tile !== undefined; return '<button type="button" class="sbx-it' + (sel === k ? " on" : "") + '"' + (pl ? ' data-hold="' + k + '"' : " disabled") + '><img alt="" src="' + icon(k) + '"><b>' + S.inv[k] + "</b><small>" + esc(ITEMS[k].n) + "</small></button>"; }).join("") + "</div>"
        : '<p class="sbx-note">Your bag is empty. Walk to a tree and hold on the trunk to chop it.</p>';
    } else if (tab === "chest") {
      var cc = S.chests[chestKey] || {}, ck = Object.keys(cc), mine2 = ORDER.filter(function (k) { return (S.inv[k] || 0) > 0; }), btn = function (k, n, attr) { return '<button type="button" class="sbx-it" ' + attr + '="' + k + '"><img alt="" src="' + icon(k) + '"><b>' + n + "</b><small>" + esc(ITEMS[k].n) + "</small></button>"; };
      h += '<p class="sbx-note"><b>Wooden Chest</b> (' + ck.length + " of " + CHEST_KINDS + ' kinds). Tap an item to move the whole stack.</p>';
      h += '<h3>In the chest</h3>' + (ck.length ? '<div class="sbx-bag">' + ORDER.filter(function (k) { return cc[k]; }).map(function (k) { return btn(k, cc[k], "data-ch-take"); }).join("") + "</div>" : '<p class="sbx-note">Empty.</p>') + '<button type="button" class="btn ghost" data-ch-all="take"' + (ck.length ? "" : " disabled") + ">Take all</button>";
      h += '<h3>In your bag</h3>' + (mine2.length ? '<div class="sbx-bag">' + mine2.map(function (k) { return btn(k, S.inv[k], "data-ch-put"); }).join("") + "</div>" : '<p class="sbx-note">Your bag is empty.</p>') + '<button type="button" class="btn ghost" data-ch-all="put"' + (mine2.length ? "" : " disabled") + ">Store all</button>";
    } else if (tab === "map") {
      h += '<canvas id="sbxMap" width="720" height="140" aria-label="Map of the places you have explored"></canvas><p class="sbx-note">Dark areas are unexplored. Walk and dig to uncover the world.</p>';
    } else if (tab === "goals") {
      var done = GOALS.filter(function (g) { return S.ms[g.id]; }).length;
      h += '<p class="sbx-note"><b>' + done + " / " + GOALS.length + "</b> goals complete. Goals are bragging rights for now, with no coin or crystal payouts.</p><div class=\"sbx-goals\">" + GOALS.map(function (g) { return '<div class="sbx-goal' + (S.ms[g.id] ? " ok" : "") + '"><i aria-hidden="true">' + (S.ms[g.id] ? "&#10003;" : "") + "</i><div><b>" + esc(g.n) + "</b><small>" + esc(g.d) + "</small></div></div>"; }).join("") + "</div>";
    } else {
      var an = (typeof Crystals !== "undefined" && Crystals.animals) ? Crystals.animals : [{ id: "frog", name: "Boggy the Frog" }];
      h += '<h3>Play as</h3><div class="sbx-an">' + an.map(function (a) { var th = ""; try { th = '<img alt="" src="' + DelveAv.thumb(Object.assign({}, Crystals.outfit()), a.id, 3) + '">'; } catch (e) { try { th = AV.svg(Object.assign({}, Crystals.outfit(), { animal: a.id, nobg: true })).replace('viewBox="0 0 200 200"', 'viewBox="22 4 156 156"'); } catch (e2) {} } return '<button type="button" data-an="' + a.id + '" aria-pressed="' + (S.animal === a.id) + '" aria-label="' + esc(a.name) + '">' + th + "<small>" + esc(a.name.split(" ")[0]) + "</small></button>"; }).join("") + '</div><p class="sbx-note">Your equipped avatar gear shows in the world. Change it in the Armory.</p>';
      h += '<h3>View</h3><div class="sbx-row"><button type="button" class="btn ghost" data-zoom="-1" aria-label="Zoom out">Zoom out</button><b>' + Math.round(S.zoom * 100) + '%</b><button type="button" class="btn ghost" data-zoom="1" aria-label="Zoom in">Zoom in</button></div>';
      h += '<h3>Worlds</h3><p class="sbx-note">Playing: <b>' + esc(curEntry() ? curEntry().name : "My Swamp") + '</b>. Switch worlds, start a new one, or leave.</p><div class="sbx-row"><button type="button" class="btn ghost" data-camp>Back to camp</button><button type="button" class="btn" data-wl-open>Save &amp; exit to menu</button></div>';
      h += '<p class="sbx-note">World seed ' + S.seed + ". Every world saves automatically in this browser (not cloud-synced yet). Shared servers come in a later stage.</p>";
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
    g.imageSmoothingEnabled = false; g.fillStyle = "#050807"; g.fillRect(0, 0, c.width, c.height); g.drawImage(off, 0, 0, W, H, 0, 0, c.width, c.height);
    var px = p.x / W * c.width, py = (p.y - 1) / H * c.height; [[0, SW.B_FROST, 2], [SW.B_FROST, SW.B_EMBER, 0], [SW.B_EMBER, W, 1]].forEach(function (z) { g.fillStyle = BIOMES[z[2]].c; g.globalAlpha = 0.9; g.fillRect(z[0], 0, z[1] - z[0], 4); g.globalAlpha = 0.75; g.font = "800 17px Nunito,sans-serif"; g.textAlign = "center"; g.fillText(BIOMES[z[2]].n, (z[0] + z[1]) / 2, 24); g.globalAlpha = 1; });
    (world.holes || []).forEach(function (h) { if (!ex[h.y * W + h.x]) return; var hx = h.x / W * c.width, hy = h.y / H * c.height; g.fillStyle = "#050607"; g.strokeStyle = "#f2c14e"; g.lineWidth = 2.5; g.beginPath(); g.arc(hx, hy, 5, 0, 6.2832); g.fill(); g.stroke(); });
    g.strokeStyle = "#fff"; g.lineWidth = 3; g.beginPath(); g.arc(px, py, 9, 0, 6.2832); g.stroke(); g.fillStyle = "#f2c14e"; g.beginPath(); g.arc(px, py, 4.5, 0, 6.2832); g.fill();
  }
  function openPanel(t) { if (t) tab = t; panelOpen = true; confirmNew = false; $("sbxPanel").hidden = false; stageEl.classList.add("panel"); keys.l = keys.r = keys.j = 0; tk.l = tk.r = tk.j = 0; aim.down = false; mine = null; renderPanel(); }
  function closePanel() { panelOpen = false; if (chestKey) { chestKey = ""; if (tab === "chest") tab = "bag"; save(); } $("sbxPanel").hidden = true; stageEl.classList.remove("panel"); $("sbxMenuBtn").focus({ preventScroll: true }); }

  // ---------- INPUT ----------
  function setAim(e) { var r = cv.getBoundingClientRect(); aim.mx = e.clientX - r.left; aim.my = e.clientY - r.top - (e.pointerType === "mouse" ? 0 : clamp(ts * 1.3, 28, 44)); } // touch: aim sits just above the fingertip so your finger does not hide the target
  cv.addEventListener("pointerdown", function (e) {
    if (panelOpen || menuOpen || trans || (e.pointerType === "mouse" && e.button !== 0)) return; e.preventDefault();
    if (bedBtn) { var br = cv.getBoundingClientRect(), bx = e.clientX - br.left, by = e.clientY - br.top, pd = e.pointerType === "mouse" ? 4 : 12; if (bx >= bedBtn.x - pd && bx <= bedBtn.x + bedBtn.w + pd && by >= bedBtn.y - pd && by <= bedBtn.y + bedBtn.h + pd) { trySleep(); return; } }
    if (actBtn) { var ar = cv.getBoundingClientRect(), ax = e.clientX - ar.left, ay = e.clientY - ar.top, apd = e.pointerType === "mouse" ? 4 : 12; if (ax >= actBtn.x - apd && ax <= actBtn.x + actBtn.w + apd && ay >= actBtn.y - apd && ay <= actBtn.y + actBtn.h + apd) { actBtn.fn(); return; } }
    if (aim.id !== null && aim.id !== e.pointerId && aim.down) return;
    aim.id = e.pointerId; aim.down = true; setAim(e); aim.t0 = performance.now(); aim.dx = Math.floor((aim.mx - ox) / ts); aim.dy = Math.floor((aim.my - oy) / ts); aim.door = !cave && TILES[get(aim.dx, aim.dy)].kind === "door"; aim.chest = !cave && get(aim.dx, aim.dy) === T.CHEST; aim.hole = !cave && get(aim.dx, aim.dy) === T.HOLE;
    aim.lad = cave ? (aim.dx === cave.F.up.x && (aim.dy === cave.F.up.y || aim.dy === cave.F.up.y - 1) ? "up" : aim.dx === cave.F.down.x && aim.dy === cave.F.down.y ? "down" : "") : ""; try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    $("sbxHint").classList.remove("on"); if (ac && ac.state === "suspended") ac.resume();
  });
  cv.addEventListener("pointermove", function (e) { if (e.pointerType === "mouse" || e.pointerId === aim.id) setAim(e); });
  var endAim = function (e) {
    if (e.pointerId === aim.id && e.type === "pointerup" && performance.now() - aim.t0 < 260 && aim.door && TILES[get(aim.dx, aim.dy)].kind === "door") {   // quick tap on a door: open or close it
      var ddx = aim.dx + 0.5 - p.x, ddy = aim.dy + 0.5 - (p.y - PH / 2);
      if (ddx * ddx + ddy * ddy <= REACH * REACH) toggleDoor(aim.dx, aim.dy, true); else nag("That door is too far away.");
    }
    if (e.pointerId === aim.id && e.type === "pointerup" && performance.now() - aim.t0 < 260 && aim.chest && get(aim.dx, aim.dy) === T.CHEST) {   // quick tap on a chest: open it
      var cdx = aim.dx + 0.5 - p.x, cdy = aim.dy + 0.5 - (p.y - PH / 2);
      if (cdx * cdx + cdy * cdy <= REACH * REACH) openChest(aim.dx, aim.dy); else nag("That chest is too far away.");
    }
    if (e.pointerId === aim.id && e.type === "pointerup" && performance.now() - aim.t0 < 260) {   // quick tap on a Cave Hole or a cave ladder
      if (aim.hole && !cave && get(aim.dx, aim.dy) === T.HOLE) { var hdx = aim.dx + 0.5 - p.x, hdy = aim.dy + 0.5 - (p.y - PH / 2); if (hdx * hdx + hdy * hdy <= REACH * REACH) enterCave(aim.dx, aim.dy); else nag("Walk closer to the hole."); }
      else if (cave && aim.lad) { var lcc = aim.lad === "up" ? cave.F.up : cave.F.down, ldx = lcc.x + 0.5 - cp.x, ldy = lcc.y + 0.5 - (cp.y - 0.3); if (ldx * ldx + ldy * ldy <= CAVE_REACH * CAVE_REACH) useLadder(aim.lad); else nag("Walk closer to the ladder."); }
    }
    doorHoldKey = "";
    if (e.pointerId === aim.id) { aim.down = false; aim.id = null; mine = null; if (e.pointerType !== "mouse") aim.tx = -1; } };
  cv.addEventListener("pointerup", endAim); cv.addEventListener("pointercancel", endAim); cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  (function () {   // the analog stick (touch / small screens, caves only): drag anywhere inside the ring
    var base = $("sbxJoy"), knob = $("sbxJoyKnob"), id = null, R = 52; if (!base) return;
    function mv(e) {
      var r = base.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.sqrt(dx * dx + dy * dy) || 1, k = Math.min(1, d / R);
      var m = k < 0.14 ? 0 : (k - 0.14) / 0.86; joy.x = dx / d * m; joy.y = dy / d * m; knob.style.transform = "translate(" + (dx / d * Math.min(d, R)) + "px," + (dy / d * Math.min(d, R)) + "px)";
    }
    base.addEventListener("pointerdown", function (e) { e.preventDefault(); id = e.pointerId; try { base.setPointerCapture(id); } catch (x) {} base.classList.add("on"); $("sbxHint").classList.remove("on"); mv(e); });
    base.addEventListener("pointermove", function (e) { if (e.pointerId === id) mv(e); });
    var up = function (e) { if (e.pointerId !== id) return; id = null; base.classList.remove("on"); joyReset(); };
    base.addEventListener("pointerup", up); base.addEventListener("pointercancel", up); base.addEventListener("lostpointercapture", up); base.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  })();
  [].forEach.call(document.querySelectorAll("#sbxPad [data-k]"), function (b) {
    var k = b.getAttribute("data-k"), on = function (e) { e.preventDefault(); tk[k] = 1; b.classList.add("on"); try { b.setPointerCapture(e.pointerId); } catch (x) {} $("sbxHint").classList.remove("on"); }, off = function () { tk[k] = 0; b.classList.remove("on"); };
    b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); b.addEventListener("lostpointercapture", off); b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  });
  window.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return; var k = e.key;
    if (menuOpen) { if (k === "Escape") closeWorlds(); return; }
    if (k === "Escape" && panelOpen) { closePanel(); return; }
    if (k === "e" || k === "E") { panelOpen ? closePanel() : openPanel(); e.preventDefault(); return; }
    if (panelOpen) return;
    if (k === "ArrowLeft" || k === "a" || k === "A") keys.l = 1; else if (k === "ArrowRight" || k === "d" || k === "D") keys.r = 1;
    else if (k === "ArrowDown" || k === "s" || k === "S") keys.d = 1;
    else if (k === " " || k === "ArrowUp" || k === "w" || k === "W") { keys.j = 1; if (k !== " ") keys.u = 1; }
    else if (k >= "1" && k <= "9") { var items = bar(), id = items[+k - 1]; if (id) choose(id); }
    else if (k === "f" || k === "F") {
      if (cave) { var ln = ladderNear(); if (ln) useLadder(ln.k); else nag("Stand next to a ladder to use it."); }
      else { var skip = bedNear() && isNight(S.time), dn = skip ? null : doorNear(), cn = skip || dn ? null : chestNear(), hn = skip || dn || cn || !SC ? null : holeNear(); if (dn) toggleDoor(dn.x, dn.y, true); else if (cn) openChest(cn.x, cn.y); else if (hn) enterCave(hn.x, hn.y); else trySleep(); }
    }
    else if (k === "q" || k === "Q") { var h2 = hot(); choose(sel === "pick" ? (h2[0] || (S.wpn ? "weapon" : "pick")) : "pick"); }
    else return; e.preventDefault(); $("sbxHint").classList.remove("on");
  });
  window.addEventListener("keyup", function (e) {
    var k = e.key; if (k === "ArrowLeft" || k === "a" || k === "A") keys.l = 0; else if (k === "ArrowRight" || k === "d" || k === "D") keys.r = 0; else if (k === " " || k === "ArrowUp" || k === "w" || k === "W") { keys.j = 0; if (k !== " ") keys.u = 0; } else if (k === "ArrowDown" || k === "s" || k === "S") keys.d = 0;
  });
  window.addEventListener("blur", function () { keys.l = keys.r = keys.j = keys.u = keys.d = 0; tk.l = tk.r = tk.j = tk.u = tk.d = 0; aim.down = false; });
  $("sbxBar").addEventListener("click", function (e) { var b = e.target.closest("[data-sel]"); if (b) choose(b.getAttribute("data-sel")); });
  $("sbxTrail").addEventListener("click", function () { openPanel("trail"); });
  $("sbxMenuBtn").addEventListener("click", function () { panelOpen ? closePanel() : openPanel(); });
  $("sbxPanel").addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t) return;
    if (t.hasAttribute("data-close")) return closePanel();
    if (t.getAttribute("data-tab")) { tab = t.getAttribute("data-tab"); confirmNew = false; return renderPanel(); }
    if (t.hasAttribute("data-ch-take")) return chestMove(t.getAttribute("data-ch-take"), true, "take");
    if (t.hasAttribute("data-ch-put")) return chestMove(t.getAttribute("data-ch-put"), true, "put");
    if (t.hasAttribute("data-ch-all")) return chestAll(t.getAttribute("data-ch-all"));
    if (t.getAttribute("data-sx-repair")) return repair(t.getAttribute("data-sx-repair"));
    if (t.getAttribute("data-sx-craft")) return craft(t.getAttribute("data-sx-craft"));
    if (t.getAttribute("data-hold")) { choose(t.getAttribute("data-hold")); return closePanel(); }
    if (t.getAttribute("data-an")) { S.animal = t.getAttribute("data-an"); mkSprite(); return renderPanel(); }
    if (t.hasAttribute("data-zoom")) { var Z = [0.8, 1, 1.25, 1.5, 2], zi = clamp(Z.indexOf(S.zoom) + +t.getAttribute("data-zoom"), 0, Z.length - 1); S.zoom = Z[zi]; resize(); return renderPanel(); }
    if (t.hasAttribute("data-camp")) { respawn("Back at camp."); return closePanel(); }
    if (t.hasAttribute("data-wl-open")) return openWorlds();
  });
  setInterval(function () { if (panelOpen && tab === "map") drawMap(); }, 1500);

  // ---------- LOOP, RESIZE, SAVE ----------
  function resize() {
    var r = stageEl.getBoundingClientRect(); vw = Math.max(200, Math.round(r.width)); vh = Math.max(200, Math.round(r.height)); dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr); cv.style.width = vw + "px"; cv.style.height = vh + "px";
    ts = Math.max(12, Math.round(clamp(Math.max(vw, vh) / 34, coarse ? 24 : 15, 40) * (S ? S.zoom : 1)));
  }
  var last = 0, slowN = 0, frN = 0;
  function loop(now) {
    var raw = (now - last) / 1000 || 0.016, dt = Math.min(0.05, raw); last = now;
    // automatic quality: if a device is struggling for ~2 seconds, switch off the optional sparkle (ambient motes, aurora, glints)
    if (!document.hidden && raw < 0.5) { frN++; if (raw > 0.034) slowN++; if (frN >= 120) { if (slowN > 80) reduce = true; frN = slowN = 0; } }
    if (!document.hidden) { if (trans) tickTrans(dt); if (!panelOpen && !menuOpen && !trans) { if (cave) caveUpdate(dt); else update(dt); } if (cave) renderCave(now); else render(now); drawTrans(); if (hbDirty) drawBar(); }
    requestAnimationFrame(loop);
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) save(); });
  window.addEventListener("pagehide", save);
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stageEl);

  buildAtlas(); load(); resize(); mkSprite(); drawBar();
  $("sbxHint").textContent = S.trail === 0 ? (coarse ? "Use the arrows to walk. Hold your finger on tree leaves to gather Sticks." : "A / D walk, Space jumps. Hold the mouse on tree leaves to gather Sticks.") : coarse ? "Use the arrows to walk. Press and hold to dig; the target box sits just above your finger." : "A / D walk, Space jumps. Hold the mouse on a block to dig. E opens your bag.";
  if (!S.st.mined) $("sbxHint").classList.add("on");
  if (wIdx.list.length > 1) openWorlds();   // several worlds: let the player pick
  setTimeout(function () { $("sbxHint").classList.remove("on"); }, 14000);
  requestAnimationFrame(loop);
  window.__sbx = { get cave() { return cave; }, cp: cp, enterCave: enterCave, useLadder: useLadder, holeNear: holeNear, ladderNear: ladderNear, leaveCaveNow: leaveCaveNow, setFloor: setFloor, get trans() { return trans; }, blocks: blocks, worlds: function () { return wIdx; }, createWorld: createWorld, switchWorld: switchWorld, deleteWorld: deleteWorld, openWorlds: openWorlds, save: save, enemies: enemies, newEnemy: newEnemy, spawnBat: spawnBat, trySleep: trySleep, wear: wear, durOf: durOf, repair: repair, openChest: openChest, chestNear: chestNear, toggleDoor: toggleDoor, doorNear: doorNear, bedNear: bedNear, spawnEnemy: spawnEnemy, strike: strike, ENEMY: ENEMY, setHp: function (v) { hp = v; }, WEAPONS: WEAPONS, bar: bar, view: function () { return { ts: ts, ox: ox, oy: oy }; }, get S() { return S; }, p: p, get: get, tiles: function () { return tiles; }, world: function () { return world; }, choose: choose, craft: craft, openPanel: openPanel, give: give, reveal: reveal, trail: function () { return S.trail; }, TRAIL: TRAIL, checkTrail: checkTrail };
})();
