// ===== SwampRealms: Delve (Stage 1: single-player dig-and-build sandbox) =====
// Load AFTER cards.js, weapons.js, avatar.js, store.js, account.js, menu.js and sandbox-world.js (see sandbox.html).
// Everything lives inside this function so it can never clash with globals in cards.js / store.js.
//
// SAVING: the whole game is one localStorage key, "swamp-delve-v1" (this browser only, NOT cloud-synced in Stage 1).
//   { v:2, trail (First Day Trail step), seed, e:"idx:tile,idx:tile" (only tiles you changed), ex:"run-length explored map", p:{x,y,f}, animal, inv:{item:n}, mru:[item],
//     tier (pick level 1-4), time (0-480 day clock), ms:{milestone:1}, st:{mined,placed,torches,wood,maxDepth,swim}, zoom }
// BACKPACK: S.bag (0-2) adds extra bag slots (Reed Backpack +12, Bog Hauler Pack +24 in all); saved slot lists are the size invSize(S.bag).
// INVENTORY: S.slots is a Minecraft-style grid (INV_HOT hotbar slots first, then INV_MAIN bag slots; each null or {k,n}, stack limit per item). S.inv {item:n} is the running total of the slots and is what all crafting code reads; reslot() keeps the two in step. S.extra holds loot that did not fit.
// Swamp Coins and Swamp Crystals are never read or written. Nothing here pays out currency.
// WORLDS: each player (signed-in name, or "guest") has a list of world slots on this device. Index key "swamp-delve-worlds:<user>", one save per world "swamp-delve-w:<user>:<id>".
// The old single key below (swamp-delve-v1) is moved into the first slot once, then left untouched as a backup.
// Night: Dusk Bats dive at an armed player after dark; a Swamp Bed lets you sleep to dawn (S.bed = the bed you last slept in = your respawn point).
(function () {
  "use strict";
  if (typeof SbxWorld === "undefined") return;
  var SW = SbxWorld, W = SW.W, H = SW.H, SURF = SW.SURF, T = SW.T, TILES = SW.TILES, ITEMS = SW.ITEMS, ORDER = SW.ITEM_ORDER, BIOMES = SW.BIOMES, SC = typeof SbxCave !== "undefined" ? SbxCave : null;

  // ---------- TUNING ----------
  // inventory: 6 hotbar slots + 24 bag slots, 64 per stack (16 for furniture and other bulky things)
  var INV_HOT = 6, INV_MAIN = 24, INV_N = INV_HOT + INV_MAIN, INV_BASE = INV_N, STACK = 64, STACK_SMALL = 16, SMALL = {};
  ["bench", "bed", "door", "chest", "chair", "table", "painting", "flowerpot", "pot", "bucket", "barrel"].forEach(function (k) { SMALL[k] = 1; });
  Object.keys(ITEMS).forEach(function (k) { if (ITEMS[k].decor && k !== "flower") SMALL[k] = 1; });   // furniture and decor stack to 16
  // BACKPACKS: S.bag (0-2) is saved. Each pack adds bag slots on top of the base 30 (x = total extra slots). The extra slots sit at the end of S.slots (index INV_BASE and up),
  // so the hotbar and the base bag never move. A pack never shrinks (you keep it for good), so a saved slot list is always the size invSize(S.bag).
  var BAGS = [{ n: "No Backpack", x: 0, c: "#8fd37a" }, { n: "Reed Backpack", x: 12, c: "#c9a06a" }, { n: "Bog Hauler Pack", x: 24, c: "#4ee6b4" }];
  function invSize(b) { return INV_BASE + (BAGS[b | 0] ? BAGS[b | 0].x : 0); }
  function invN() { return S && S.slots ? S.slots.length : INV_BASE; }
  // WATERING CAN: a tool beside the pick (S.can 0/1, S.water 0..CAN.max, both saved). Hold it on water to fill it, hold it on a Swamp Flower, Cattail or Glowcap to water it:
  // after a few seconds the watered plant spreads a new one onto free ground within 2 tiles (never into a crowded patch). Pending growth lives in memory only (grow[]), the new plants are ordinary tile edits.
  var CAN = { n: "Watering Can", max: 12, c: "#6fb7d9" }, GROW_T = 4.5, PLANTS = {}, GROW_CROWD = 5;
  PLANTS[T.FLOWER] = 1; PLANTS[T.REED] = 1; PLANTS[T.GLOWCAP] = 1;
  var AVS = 0.85;   // how big avatars are drawn (1 = the old size). Applies to you; the hitbox (PW x PH) is unchanged.
  var WP_ICONS = ["dot", "home", "star", "heart", "skull", "pick", "chest", "flag", "cave", "tree", "crown", "sword"];
  var WP_MAX = 24, WP_COL = ["#ff6b82", "#f2c14e", "#4ee6b4", "#6fb6ff", "#c78bff", "#ff9a4a", "#ff4a4a", "#9be35a", "#3ad0ff", "#ff7ad9", "#f6eedb", "#8a8f99"], KEY = "swamp-delve-v1", CYCLE = 480, REACH = 5.6, PW = 0.7, PH = 1.5, SAVE_MS = 8000;
  // health: tuning (a player has MAXHP; fall hits past FALL_SAFE speed, lava burns per second, then you heal after a calm spell)
  var MAXHP = 100, FALL_SAFE = 21, FALL_DMG = 3.5, LAVA_DPS = 38, REGEN_WAIT = 4, REGEN_RATE = 2.5;
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
  var DUR = { pick: [0, 100, 180, 300, 480], shovel: 80, wpn: [0, 40, 70, 100, 150], arm: [0, 60, 110, 170, 260] };
  var REPAIR = { pick: [null, { stick: 2, fiber: 2 }, { spore: 4, wood: 3 }, { cinder: 5, basalt: 3 }, { crystal: 6, frostrock: 4 }], shovel: { stick: 1, fiber: 2 }, wpn: [null, { stick: 2, fiber: 2 }, { spore: 3, planks: 2 }, { cinder: 4, basalt: 3 }, { crystal: 5, frostrock: 3 }], arm: [null, { fiber: 3, leaves: 3 }, { spore: 4, fiber: 3 }, { cinder: 5, basalt: 3 }, { crystal: 6, frostrock: 4 }] };
  var WEAPONS = [
    { n: "No Weapon", c: "#8fd37a", dmg: 0, cd: 0 }, { n: "Reed Spear", c: "#c9b58a", dmg: 5, cd: 0.5 }, { n: "Glowspore Blade", c: "#4ee6b4", dmg: 9, cd: 0.42 },
    { n: "Cinder Cleaver", c: "#ff8a3d", dmg: 16, cd: 0.5 }, { n: "Frost Fang", c: "#7fd6ff", dmg: 26, cd: 0.34 }
  ];
  // Armor: a third track beside picks and weapons (S.arm 0-4). It is worn automatically once crafted, shows on your avatar and cuts the damage you take.
  // red = share of damage blocked (lava is only blocked at half strength). Each hit that hurts you wears it down; at 0 it is BROKEN (no protection) until repaired.
  var ARMORS = [
    { n: "No Armor", c: "#8fd37a", red: 0 }, { n: "Reed Vest", c: "#d3a96b", red: 0.12 }, { n: "Glowspore Mail", c: "#4ee6b4", red: 0.24 },
    { n: "Cinder Plate", c: "#ff8a3d", red: 0.36 }, { n: "Frost Plate", c: "#7fd6ff", red: 0.5 }
  ];
  // WORKBENCH LEVELS: S.bl (1-4, saved) is how far you have upgraded your Bog Workbench. It is one level for the whole world (every Workbench you place looks and works at that level).
  // Each upgrade costs materials from the biome BEFORE the one the new gear is for, so you have to finish a biome to gear up for the next:
  //   Lv1 Bog Workbench (Murkwater wood and fibre): Glowspore Pick, Glowspore Blade, Hauler Pack = the tools to cross into Ember Bog.
  //   Lv2 Glowspore Workbench (Murkwater loot: Glowspore, Clay, Stone, Bramble + Frog Fragments): Glowspore Mail, Cinder Pick, Cinder Cleaver.
  //   Lv3 Cinder Forge (Ember Bog loot: Cinder, Basalt, Ash): Cinder Plate, Frost Pick, Frost Fang.
  //   Lv4 Frost Workbench (Frostfen loot: Frost Crystal, Frostrock, Ice): Frost Plate.
  // A recipe needs a Workbench of at least its `bl` (no bl = level 1). TO ADD A LEVEL: push an entry here, raise the clamp in clean(), and give paint() a look for it.
  var BENCH_LV = [null,
    { n: "Bog Workbench", c: "#c98c4f", gives: "Reed gear, Glowspore Pick, Glowspore Blade, Hauler Pack" },
    { n: "Glowspore Workbench", c: "#4ee6b4", cost: { spore: 20, clay: 12, stone: 16, planks: 16, bugfrag: 3, frogfrag: 2 }, from: "Murkwater Swamp", gives: "Glowspore Mail, Cinder Pick, Cinder Cleaver" },
    { n: "Cinder Forge Workbench", c: "#ff8a3d", cost: { cinder: 24, basalt: 20, ash: 16, planks: 16 }, from: "Ember Bog", gives: "Cinder Plate, Frost Pick, Frost Fang" },
    { n: "Frost Workbench", c: "#7fd6ff", cost: { crystal: 24, frostrock: 20, ice: 12, planks: 16 }, from: "Frostfen", gives: "Frost Plate" }
  ];
  var benchLv = 1;   // the level the Workbench tile is painted at (kept in step with S.bl)
  var RECIPES = [
    { id: "pick1", n: "Reed Pick", tier: 1, cost: { stick: 3, fiber: 3, pebble: 2 }, d: "Your first tool. Chops wood, digs clay and breaks stone." },
    { id: "shovel", n: "Reed Shovel", sh: 1, cost: { stick: 2, fiber: 2, pebble: 2 }, d: "A hand shovel for soft ground. Digs Mud, Moss, Clay, Ash and Snow a little faster than bare paws. It cannot break stone, wood or ore, so keep your pick too." },
    { id: "can", n: "Watering Can", can: 1, cost: { planks: 4, fiber: 3, pebble: 2 }, d: "Pick it in the hotbar, hold it on the water to fill it, then hold it on a Swamp Flower, Cattail or Glowcap. A watered plant spreads a new one nearby after a few seconds. Holds 12 waterings. Comes full." },
    { id: "planks", n: "Planks (4)", out: { planks: 4 }, cost: { wood: 1 }, d: "Build walls, floors and bridges." },
    { id: "bench", n: "Bog Workbench", out: { bench: 1 }, cost: { wood: 10, fiber: 4 }, d: "Place it at camp, then tap it (or press F next to it) to open it. Better tools, armor and new stations are crafted in its window. Upgrade it as you win loot from each biome to unlock better armor and tools." },
    { id: "bed", n: "Swamp Bed", out: { bed: 1 }, cost: { planks: 6, fiber: 6, leaves: 8 }, d: "Place it at camp. At night, stand next to it and sleep to skip to dawn, heal fully and set your respawn. Bats cannot hurt you while you sleep." },
    { id: "torch", n: "Torches (4)", out: { torch: 4 }, cost: { stick: 1, spore: 1 }, d: "Light up caves. Place next to a wall." },
    { id: "wpn1", n: "Reed Spear", wpn: 1, cost: { stick: 6, fiber: 3, pebble: 4 }, d: "Your first weapon. Hold it from the hotbar and swing. Damage 5." },
    { id: "door", n: "Swamp Door", out: { door: 1 }, cost: { planks: 6, fiber: 2 }, d: "A two-tall wooden door. Place it on the ground in a doorway. Walk into it to open it (it shuts behind you), tap it or press F to open or close it by hand, and hold on it to break it. Closed doors stop bugs, frogs and bats." },
    { id: "ladder", n: "Ladder (4)", out: { ladder: 4 }, cost: { planks: 3 }, d: "Stick it to a wall or stack it up or down. Hold Jump to climb up, S or Down to climb down (on a phone you slowly slide down when not climbing)." },
    { id: "chest", n: "Wooden Chest", out: { chest: 1 }, cost: { planks: 8, fiber: 2 }, d: "Place it at camp on solid ground. Tap it (or press F nearby) to open it and stash up to 30 kinds of items. Empty it before you pick it up." },
    { id: "bag1", n: "Reed Backpack", bag: 1, cost: { fiber: 10, leaves: 6, stick: 4 }, d: "A woven reed pack you wear on your back. Adds 12 bag slots (42 in all). Made by hand, no Workbench needed." },
    { id: "w_plank", n: "Plank Wall (4)", out: { wall_plank: 4 }, cost: { planks: 1 }, d: "A back wall. Select it and tap an empty tile next to a block or another wall: it goes BEHIND you, so you can walk and decorate in front of it. Hold your pick on an empty walled tile to take a wall down." },
    { id: "w_log", n: "Log Wall (4)", out: { wall_log: 4 }, cost: { wood: 1 }, d: "Round vertical logs for a cabin look. A back wall you can walk in front of." },
    { id: "w_moss", n: "Mossy Wall (4)", out: { wall_moss: 4 }, cost: { mud: 2, leaves: 1 }, d: "Damp, mossy swamp stone. A back wall for burrows and cellars." },
    { id: "w_timber", n: "Timber Frame Wall (4)", out: { wall_timber: 4 }, bench: true, cost: { planks: 1, clay: 1 }, d: "Cream plaster in dark wooden frames, like a cottage. Needs a Bog Workbench nearby." },
    { id: "w_plaster", n: "Plaster Wall (4)", out: { wall_plaster: 4 }, bench: true, cost: { clay: 2, fiber: 1 }, d: "Smooth cream plaster. Needs a Bog Workbench nearby." },
    { id: "w_brick", n: "Stone Brick Wall (4)", out: { wall_brick: 4 }, bench: true, cost: { stone: 2 }, d: "Grey stone bricks for cellars and castles. Needs a Bog Workbench nearby." },
    { id: "decorbench", n: "Decor Workbench", out: { decorbench: 1 }, bench: true, cost: { planks: 14, fiber: 6, clay: 4 }, d: "Place it in your camp or house. Tap it (or press F next to it) to open its window, where all the furniture, lamps, garden pieces, building blocks and wall decor are crafted. Made at the Bog Workbench." },
    { id: "pick2", n: "Glowspore Pick", tier: 2, bench: true, cost: { spore: 16, wood: 12 }, d: "Digs 1.8x faster. Breaks Basalt and Cinder Ore." },
    { id: "bag2", n: "Bog Hauler Pack", bag: 2, need: 2, bench: true, cost: { fiber: 16, spore: 8, planks: 8, leaves: 12 }, d: "A big stitched pack with side pockets and a glowing buckle. Adds 12 more bag slots (54 in all). Needs the Reed Backpack and the Glowspore Pick." },
    { id: "wpn2", n: "Glowspore Blade", wpn: 2, need: 2, bench: true, cost: { spore: 12, wood: 8, planks: 8, bugfrag: 3 }, d: "A glowing blade. Damage 9, quick swing. Needs the Glowspore Pick and Bramble Fragments from Bramble Bugs." },
    { id: "pick3", n: "Cinder Pick", tier: 3, bench: true, bl: 2, cost: { cinder: 20, basalt: 16, planks: 24 }, d: "Digs 2.8x faster. Breaks Frostrock and Frost Crystal. Needs a Glowspore Workbench." },
    { id: "wpn3", n: "Cinder Cleaver", wpn: 3, need: 3, bench: true, bl: 2, cost: { cinder: 16, basalt: 12, planks: 16, frogfrag: 3 }, d: "A heavy lava-veined cleaver. Damage 16. Needs the Cinder Pick, Frog Fragments from Swamp Frogs and a Glowspore Workbench." },
    { id: "pick4", n: "Frost Pick", tier: 4, bench: true, bl: 3, cost: { crystal: 24, frostrock: 20, planks: 32 }, d: "The fastest pick in the swamp. Digs 4.2x faster. Needs a Cinder Forge Workbench." },
    { id: "wpn4", n: "Frost Fang", wpn: 4, need: 4, bench: true, bl: 3, cost: { crystal: 18, frostrock: 14, planks: 24, batwing: 4 }, d: "A razor ice blade. Damage 26, the fastest swing. Needs the Frost Pick and Bat Wings from Dusk Bats (they only come out at night). Needs a Cinder Forge Workbench." },
    { id: "arm1", n: "Reed Vest", arm: 1, cost: { fiber: 10, stick: 4, leaves: 6 }, d: "A woven vest of reed fibre. Blocks 12% of damage. Made by hand and worn right away." },
    { id: "arm2", n: "Glowspore Mail", arm: 2, need: 2, bench: true, bl: 2, cost: { spore: 14, planks: 10, fiber: 8, bugfrag: 2 }, d: "Teal armor with a glowing gem. Blocks 24% of damage. Needs the Reed Vest, the Glowspore Pick, Bramble Fragments and a Glowspore Workbench." },
    { id: "arm3", n: "Cinder Plate", arm: 3, need: 3, bench: true, bl: 3, cost: { cinder: 18, basalt: 14, planks: 12, frogfrag: 2 }, d: "Dark plate with a glowing lava seam. Blocks 36% of damage. Needs the Glowspore Mail, the Cinder Pick, Frog Fragments and a Cinder Forge Workbench." },
    { id: "arm4", n: "Frost Plate", arm: 4, need: 4, bench: true, bl: 4, cost: { crystal: 22, frostrock: 16, planks: 20, batwing: 3 }, d: "Crystal ice plate. Blocks half of all damage. Needs the Cinder Plate, the Frost Pick, Bat Wings and a Frost Workbench." }
  ];
  // ---- DECOR WORKBENCH: recipes made while standing next to a Decor Workbench (Decor tab in the bag) ----
  // TO ADD A NEW DECOR ITEM: (1) a tile() line + ITEMS entry + name in ITEM_ORDER and DECOR_FLOOR or DECOR_WALL in sandbox-world.js,
  // (2) a drawing for its "kind" in paint() below, (3) one line here. cat groups the cards. cost may use other decor items (pot, barrel ...) to build "creations".
  var DECOR = [
    { id: "d_chair", cat: "Furniture", n: "Wooden Chair", out: { chair: 1 }, cost: { planks: 4, fiber: 1 }, d: "Faces the way you are looking when you place it." },
    { id: "d_table", cat: "Furniture", n: "Wooden Table", out: { table: 1 }, cost: { planks: 8, fiber: 2 }, d: "A small table. Put chairs on each side." },
    { id: "d_stool", cat: "Furniture", n: "Stool", out: { stool: 1 }, cost: { planks: 2, fiber: 1 }, d: "A simple seat for a corner or a market stall." },
    { id: "d_shelf", cat: "Furniture", n: "Bookshelf", out: { bookshelf: 1 }, cost: { planks: 10, fiber: 4, stick: 2 }, d: "Rows of swamp-bound books." },
    { id: "d_rug", cat: "Furniture", n: "Reed Rug", out: { rug: 1 }, cost: { fiber: 10, leaves: 2 }, d: "A woven rug that lies flat on the floor." },
    { id: "d_bucket", cat: "Garden & Storage", n: "Wooden Bucket", out: { bucket: 1 }, cost: { planks: 3, fiber: 2 }, d: "Handy beside a well or a doorway." },
    { id: "d_pot", cat: "Garden & Storage", n: "Clay Pot", out: { pot: 1 }, cost: { clay: 6 }, d: "A round terracotta pot. It is also the base of the Clay Lantern." },
    { id: "d_barrel", cat: "Garden & Storage", n: "Barrel", out: { barrel: 1 }, cost: { planks: 8, fiber: 2 }, d: "A banded barrel. It is also the base of the Flower Planter." },
    { id: "d_fpot", cat: "Garden & Storage", n: "Flower Pot", out: { flowerpot: 1 }, cost: { pot: 1, flower: 1 }, d: "A Clay Pot with a Swamp Flower planted in it." },
    { id: "d_planter", cat: "Garden & Storage", n: "Flower Planter", out: { planter: 1 }, cost: { barrel: 1, flower: 3 }, d: "A Barrel overflowing with Swamp Flowers." },
    { id: "d_lantern", cat: "Lighting", n: "Clay Lantern", out: { lantern: 1 }, cost: { pot: 1, torch: 2, stick: 2 }, d: "A Clay Pot topped with a glass lamp. Gives off warm light." },
    { id: "d_campfire", cat: "Lighting", n: "Campfire", out: { campfire: 1 }, cost: { stick: 6, pebble: 6, torch: 1 }, d: "A ring of stones and a crackling fire. Gives off warm light." },
    { id: "d_painting", cat: "Wall decor", n: "Painting", out: { painting: 1 }, cost: { planks: 2, fiber: 3 }, d: "Hang it on a wall. Every painting is a surprise." },
    { id: "d_banner", cat: "Wall decor", n: "Swamp Banner", out: { banner: 1 }, cost: { fiber: 6, stick: 2, flower: 1 }, d: "A teal cloth banner. Hangs from a wall or a ceiling beam." },
    { id: "d_sign", cat: "Wall decor", n: "Wooden Sign", out: { sign: 1 }, cost: { planks: 3, stick: 1 }, d: "A little board to hang beside a door." },
    // ---- DECOR EXPANSION. bl = Workbench level needed (see BENCH_LV): Murkwater pieces need none, Ember Bog pieces the Glowspore Workbench (2), Frostfen pieces the Cinder Forge (3), the Throne the Frost Workbench (4). ----
    { id: "d_brick", cat: "Building blocks", n: "Stone Brick (4)", out: { brick: 4 }, cost: { stone: 4 }, d: "A solid block of grey stone bricks. Place it like Planks for walls, floors and chimneys." },
    { id: "d_thatch", cat: "Building blocks", n: "Reed Thatch (4)", out: { thatch: 4 }, cost: { fiber: 6, stick: 2 }, d: "Golden straw blocks for a cosy cottage roof." },
    { id: "d_glass", cat: "Building blocks", n: "Glowspore Glass (2)", out: { glass: 2 }, cost: { clay: 4, spore: 1 }, d: "A see-through teal pane. Put it in a wall for a window." },
    { id: "d_bbrick", cat: "Building blocks", n: "Basalt Brick (4)", out: { basaltbrick: 4 }, cost: { basalt: 4 }, bl: 2, d: "Dark bricks with faint hot cracks. Strong castle walls." },
    { id: "d_clamp", cat: "Building blocks", n: "Cinder Lamp Block", out: { cinderlamp: 1 }, cost: { cinder: 3, basalt: 2 }, bl: 2, d: "A solid block with a glowing ember core. A very bright light you can build into a wall or floor." },
    { id: "d_ibrick", cat: "Building blocks", n: "Frost Brick (4)", out: { icebrick: 4 }, cost: { ice: 4, frostrock: 2 }, bl: 3, d: "Pale blue ice bricks for glittering halls." },
    { id: "d_crlamp", cat: "Building blocks", n: "Crystal Lamp Block", out: { crystallamp: 1 }, cost: { crystal: 3, frostrock: 2 }, bl: 3, d: "A solid block around a glowing Frost Crystal. The brightest block light in the swamp." },
    { id: "d_wardrobe", cat: "Murkwater Showpieces", n: "Swamp Wardrobe", out: { wardrobe: 1 }, cost: { planks: 12, fiber: 4, clay: 2 }, d: "A tall two-door wardrobe for the bedroom." },
    { id: "d_fence", cat: "Murkwater Showpieces", n: "Wooden Fence (2)", out: { fence: 2 }, cost: { planks: 2, stick: 2 }, d: "Fence off a garden. A row of fences joins up." },
    { id: "d_bale", cat: "Murkwater Showpieces", n: "Reed Bale", out: { bale: 1 }, cost: { fiber: 12 }, d: "A tied bale of dried reeds. Good for a barn or a market." },
    { id: "d_well", cat: "Murkwater Showpieces", n: "Swamp Well", out: { well: 1 }, cost: { stone: 10, planks: 6, fiber: 2 }, d: "A stone well with a little roof and a bucket on a rope." },
    { id: "d_fountain", cat: "Murkwater Showpieces", n: "Mossy Fountain", out: { fountain: 1 }, cost: { stone: 12, clay: 4, spore: 2 }, d: "A moss-covered stone fountain for your garden." },
    { id: "d_cauldron", cat: "Murkwater Showpieces", n: "Bubbling Cauldron", out: { cauldron: 1 }, cost: { pot: 1, spore: 4, stick: 4 }, d: "A cauldron of glowing green brew over a small fire. Gives off a soft green light. Made from a Clay Pot." },
    { id: "d_glowpot", cat: "Murkwater Showpieces", n: "Glowcap Pot", out: { glowpot: 1 }, cost: { pot: 1, spore: 3 }, d: "A Clay Pot with a glowing mushroom. A gentle night-light." },
    { id: "d_hearth", cat: "Murkwater Showpieces", n: "Stone Hearth", out: { hearth: 1 }, cost: { stone: 14, stick: 6, torch: 2 }, d: "A stone fireplace with a roaring fire. Warm, bright light for your house." },
    { id: "d_frogstatue", cat: "Murkwater Showpieces", n: "Frog Statue", out: { frogstatue: 1 }, cost: { stone: 14, clay: 4, spore: 4 }, d: "A stone frog on a plinth with glowing gem eyes." },
    { id: "d_sconce", cat: "Murkwater Showpieces", n: "Glowspore Sconce", out: { sconce: 1 }, cost: { spore: 2, stick: 1, clay: 1 }, d: "Hangs on a wall and burns with a teal flame." },
    { id: "d_bugtrophy", cat: "Murkwater Showpieces", n: "Bramble Trophy", out: { bugtrophy: 1 }, cost: { bugfrag: 3, planks: 2, fiber: 1 }, d: "Show off your first kills: a Bramble Bug on a wooden plaque. Hangs on a wall." },
    { id: "d_frogtrophy", cat: "Murkwater Showpieces", n: "Frog Trophy", out: { frogtrophy: 1 }, cost: { frogfrag: 3, planks: 2, fiber: 1 }, d: "A Swamp Frog on a wooden plaque. Hangs on a wall." },
    { id: "d_brazier", cat: "Ember Bog Collection", n: "Cinder Brazier", out: { brazier: 1 }, cost: { basalt: 8, cinder: 6, stick: 2 }, bl: 2, d: "An iron bowl of roaring flame. One of the brightest lights you can make." },
    { id: "d_guardian", cat: "Ember Bog Collection", n: "Basalt Guardian", out: { guardian: 1 }, cost: { basalt: 16, cinder: 4, ash: 6 }, bl: 2, d: "A basalt knight statue with ember eyes and a lava seam. It guards your door." },
    { id: "d_emberlantern", cat: "Ember Bog Collection", n: "Ember Lantern", out: { emberlantern: 1 }, cost: { cinder: 4, planks: 2, torch: 2 }, bl: 2, d: "An iron-caged lantern full of glowing embers." },
    { id: "d_urn", cat: "Ember Bog Collection", n: "Ashen Urn", out: { urn: 1 }, cost: { clay: 4, ash: 8, cinder: 1 }, bl: 2, d: "A tall ash-grey urn with glowing ember bands." },
    { id: "d_anvil", cat: "Ember Bog Collection", n: "Cinder Anvil", out: { anvil: 1 }, cost: { basalt: 10, cinder: 4, planks: 4 }, bl: 2, d: "A blackened anvil with a hot top. Just for show, but it looks like it means business." },
    { id: "d_emberbanner", cat: "Ember Bog Collection", n: "Ember Banner", out: { emberbanner: 1 }, cost: { fiber: 6, cinder: 2, stick: 2 }, bl: 2, d: "A rust-red banner with a golden flame. Hangs from a wall or a ceiling beam." },
    { id: "d_icesculpt", cat: "Frostfen Collection", n: "Ice Sculpture", out: { icesculpt: 1 }, cost: { ice: 14, crystal: 3 }, bl: 3, d: "A cluster of glittering ice shards." },
    { id: "d_frostlantern", cat: "Frostfen Collection", n: "Frost Lantern", out: { frostlantern: 1 }, cost: { crystal: 4, ice: 4, planks: 2 }, bl: 3, d: "A crystal lantern with a cold blue flame." },
    { id: "d_frostbanner", cat: "Frostfen Collection", n: "Frost Banner", out: { frostbanner: 1 }, cost: { fiber: 6, crystal: 2, stick: 2 }, bl: 3, d: "A deep-blue banner with a white snowflake. Hangs from a wall or a ceiling beam." },
    { id: "d_chandelier", cat: "Frostfen Collection", n: "Crystal Chandelier", out: { chandelier: 1 }, cost: { crystal: 8, planks: 4, torch: 4, stick: 2 }, bl: 3, d: "A hanging ring of Frost Crystals and candle flames. Hangs from a wall or a ceiling beam. Very bright." },
    { id: "d_throne", cat: "Frostfen Collection", n: "Frostrock Throne", out: { throne: 1 }, cost: { frostrock: 14, crystal: 6, fiber: 6 }, bl: 4, d: "The grandest piece you can craft: a throne carved from Frostrock. Needs the fully upgraded Frost Workbench." }
  ];
  if (typeof SbxExtra !== "undefined") { RECIPES.push.apply(RECIPES, SbxExtra.RECIPES); DECOR.push.apply(DECOR, SbxExtra.DECOR); }   // Content Pack 1 (sandbox-extra.js)
  DECOR.forEach(function (r) { r.deco = 1; });
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
    { id: "wolf1", n: "Lone Wolf Down", d: "Defeat a Frost Wolf in Frostfen", f: function () { return S.st.wolves >= 1; } },
    { id: "gator1", n: "Gator Wrangler", d: "Defeat a Bog Gator (they lurk in swamp lakes once you have the Glowspore Blade)", f: function () { return S.st.gators >= 1; } },
    { id: "slime5", n: "Slime Time", d: "Pop 5 slimes (caves, or the surface at night)", f: function () { return S.st.slimes >= 5; } },
    { id: "wasp1", n: "Wasp Swatter", d: "Defeat an Ember Wasp in Ember Bog", f: function () { return S.st.wasps >= 1; } },
    { id: "ckill10", n: "Cave Crawler", d: "Defeat 10 creatures in the caves below the Cave Holes", f: function () { return S.st.ckills >= 10; } },
    { id: "cclear1", n: "Clean Sweep", d: "Clear every creature from a cave floor", f: function () { return S.st.cclear >= 1; } },
    { id: "cclear5", n: "Deep Delver", d: "Clear 5 cave floors", f: function () { return S.st.cclear >= 5; } },
    { id: "farm1", n: "Green Thumb", d: "Harvest a ripe crop", f: function () { return S.st.harvests >= 1; } },
    { id: "farm25", n: "Swamp Farmer", d: "Harvest 25 ripe crops", f: function () { return S.st.harvests >= 25; } },
    { id: "crops4", n: "Four Fields", d: "Harvest Swamp Carrots, Bog Potatoes, Fire Peppers and Frostberries", f: function () { return (S.st.cropbits & 15) === 15; } },
    { id: "cook5", n: "Swamp Chef", d: "Cook 5 meals at a Cooking Pot", f: function () { return S.st.cooked >= 5; } },
    { id: "gourmet", n: "Gourmet", d: "Eat 6 different cooked meals", f: function () { return Object.keys(S.ate).length >= 6; } },
    { id: "feast", n: "Feast of Three Lands", d: "Eat an Explorer's Feast", f: function () { return !!S.ate.feast; } },
    { id: "loot1", n: "Treasure Hunter", d: "Open a Cave Chest (they glow faintly in dark caves)", f: function () { return S.st.cchests >= 1; } },
    { id: "loot10", n: "Hoard of Gold", d: "Open 10 Cave Chests", f: function () { return S.st.cchests >= 10; } },
    { id: "pots20", n: "Pot Smasher", d: "Smash 20 Cave Pots", f: function () { return S.st.pots >= 20; } },
    { id: "hunter", n: "Monster Hunter", d: "Defeat one of every creature: bug, frog, bat, wolf, gator, slime and wasp", f: function () { return ["bugs", "frogs", "bats", "wolves", "gators", "slimes", "wasps"].every(function (k) { return S.st[k] >= 1; }); } },
    { id: "wpn1", n: "Armed Paws", d: "Craft the Reed Spear", f: function () { return S.wpn >= 1; } },
    { id: "wpn2", n: "Spore Blade", d: "Craft the Glowspore Blade", f: function () { return S.wpn >= 2; } },
    { id: "wpn3", n: "Cinder Cleaver", d: "Craft the Cinder Cleaver", f: function () { return S.wpn >= 3; } },
    { id: "wpn4", n: "Frost Fang", d: "Craft the Frost Fang", f: function () { return S.wpn >= 4; } },
    { id: "arm1", n: "Dressed Up", d: "Craft the Reed Vest", f: function () { return S.arm >= 1; } },
    { id: "arm2", n: "Spore Mail", d: "Craft the Glowspore Mail", f: function () { return S.arm >= 2; } },
    { id: "arm3", n: "Cinder Plate", d: "Craft the Cinder Plate", f: function () { return S.arm >= 3; } },
    { id: "arm4", n: "Frozen Solid", d: "Craft the Frost Plate", f: function () { return S.arm >= 4; } },
    { id: "dcraft30", n: "Grand Decorator", d: "Craft 30 pieces at the Decor Workbench", f: function () { return S.st.dcraft >= 30; } },
    { id: "throne", n: "Fit for a King", d: "Craft the Frostrock Throne", f: function () { return (S.inv.throne || 0) > 0; } },
    { id: "bench2", n: "Bench Boost", d: "Upgrade to the Glowspore Workbench", f: function () { return S.bl >= 2; } },
    { id: "bench3", n: "Forged in Ember", d: "Upgrade to the Cinder Forge Workbench", f: function () { return S.bl >= 3; } },
    { id: "bench4", n: "Frostbound Bench", d: "Upgrade to the Frost Workbench", f: function () { return S.bl >= 4; } },
    { id: "bed1", n: "Bed Time", d: "Place a Swamp Bed", f: function () { return S.st.beds >= 1; } },
    { id: "door1", n: "Knock Knock", d: "Place a Swamp Door", f: function () { return S.st.doors >= 1; } },
    { id: "ladder1", n: "Up and Away", d: "Place a Ladder", f: function () { return S.st.ladders >= 1; } },
    { id: "chest1", n: "Pack Rat", d: "Place a Wooden Chest", f: function () { return S.st.chests >= 1; } },
    { id: "bag1", n: "Pack Up", d: "Craft the Reed Backpack", f: function () { return S.bag >= 1; } },
    { id: "bag2", n: "Hauler", d: "Craft the Bog Hauler Pack", f: function () { return S.bag >= 2; } },
    { id: "can1", n: "Green Paws", d: "Water a plant with the Watering Can", f: function () { return S.st.watered >= 1; } },
    { id: "can2", n: "Gardener", d: "Water plants 20 times", f: function () { return S.st.watered >= 20; } },
    { id: "wall1", n: "Back Wall", d: "Place a back wall", f: function () { return S.st.walls >= 1; } },
    { id: "wall2", n: "Room Maker", d: "Place 40 back wall tiles", f: function () { return S.st.walls >= 40; } },
    { id: "shovel1", n: "Dig It", d: "Craft the Reed Shovel", f: function () { return S.shovel >= 1; } },
    { id: "bat1", n: "Night Watch", d: "Defeat a Dusk Bat", f: function () { return S.st.bats >= 1; } },
    { id: "sleep1", n: "Sweet Dreams", d: "Sleep through a night", f: function () { return S.st.sleeps >= 1; } },
    { id: "bat10", n: "Bat Basher", d: "Defeat 10 Dusk Bats", f: function () { return S.st.bats >= 10; } },
    { id: "sleep5", n: "Well Rested", d: "Sleep through 5 nights", f: function () { return S.st.sleeps >= 5; } },
    { id: "build", n: "Builder", d: "Place 100 blocks", f: function () { return S.st.placed >= 100; } },
    { id: "deep", n: "Deep Diver", d: "Dig down to depth 50", f: function () { return S.st.maxDepth >= 50; } },
    { id: "decor1", n: "Home Sweet Home", d: "Place 3 pieces of furniture", f: function () { return S.st.decor >= 3; } },
    { id: "dbench1", n: "Interior Designer", d: "Place a Decor Workbench", f: function () { return S.st.dbenches >= 1; } },
    { id: "dcraft5", n: "Cozy Corner", d: "Craft 5 pieces at the Decor Workbench", f: function () { return S.st.dcraft >= 5; } },
    { id: "dcraft15", n: "Master Decorator", d: "Craft 15 pieces at the Decor Workbench", f: function () { return S.st.dcraft >= 15; } },
    { id: "cave1", n: "Down the Hole", d: "Climb down into a cave", f: function () { return S.st.caves >= 1; } },
    { id: "cave2", n: "Rock Hound", d: "Break 25 rocks inside caves", f: function () { return S.st.cmined >= 25; } },
    { id: "cave3", n: "Spelunker", d: "Reach cave floor 5", f: function () { return S.st.caveDeep >= 5; } },
    { id: "bld1", n: "Knock Knock", d: "Step inside a building", f: function () { return S.st.bld >= 1; } },
    { id: "bld5", n: "House Call", d: "Visit 5 buildings", f: function () { return S.st.bld >= 5; } },
    { id: "cave4", n: "Cave Diver", d: "Reach cave floor 10", f: function () { return S.st.caveDeep >= 10; } }
  ];
  if (typeof SbxExtra !== "undefined") SbxExtra.GOALS.forEach(function (g) { GOALS.push({ id: g.id, n: g.n, d: g.d, f: function () { return g.f(S); } }); });
  // ---- THE TRAIL (Stage 1): a guided first-day path. Steps count from lifetime stats, so gathering ahead still counts. ----
  // tg = tile ids to point at on the surface, deep = how far below the surface still counts, rw = small item gift.
  var TRAIL_V1 = ["stick", "fiber", "pebble", "pick1", "wood", "bench", "spore", "lights", "pick2", "ember", "spear", "bug", "frog", "blade", "bed", "bats", "sleep", "stash", "benchup", "mail"];   // Trail order before the food steps (for old saves)
  var TRAIL = [
    { id: "stick", n: "Gather Sticks", d: "Hold on tree leaves to punch them. Leaves sometimes drop Sticks.", need: 5, v: function () { return S.st.stick; }, tg: [T.LEAVES], rw: null },
    { id: "fiber", n: "Gather Reed Fiber", d: "Snip cattails by the water or the vines hanging under tree leaves.", need: 3, v: function () { return S.st.fiber; }, tg: [T.REED, T.VINE], rw: { stick: 2 } },
    { id: "pebble", n: "Dig for Pebbles", d: "Dig mud with your paws. Pebbles pop out now and then.", need: 2, v: function () { return S.st.pebble; }, tg: [T.MOSS, T.MUD], rw: { fiber: 1 } },
    { id: "pick1", n: "Craft the Reed Pick", d: "Open your Journal (E or the Journal button), tap Craft, then make your first tool.", need: 1, v: function () { return S.tier >= 1 ? 1 : 0; }, rw: { planks: 6 } },
    { id: "wood", n: "Chop Wood", d: "Hold your pick on a tree trunk. You need 8 Wood.", need: 8, v: function () { return S.st.wood; }, tg: [T.LOG], deep: 8, rw: { fiber: 4 } },
    { id: "bench", n: "Build a Workbench", d: "Craft a Bog Workbench, select it in the hotbar, then tap the ground to place it.", need: 1, v: function () { return S.st.benches; }, rw: { torch: 4 } },
    { id: "spore", n: "Find Glowspore", d: "Dig down into the stone. Glowing green ore is Glowspore. Bring a torch.", need: 16, v: function () { return S.st.spore; }, rw: { wood: 4 } },
    { id: "lights", n: "Light the Dark", d: "Place 4 torches. They stick to walls and floors.", need: 4, v: function () { return S.st.torches; }, rw: { planks: 8 } },
    { id: "eat", n: "Grab a Bite", d: "Your hunger bar (under your health) slowly empties. Eat something: Redcap Mushrooms grow wild in the swamp. Pick food in the hotbar, then tap.", need: 1, v: function () { return S.st.eaten; }, rw: { seed_carrot: 4, farmland: 4 } },
    { id: "plant", n: "Plant a Garden", d: "Place Garden Soil on the ground (craft more from Mud and Leaves), then plant Swamp Carrot Seeds on top. Cattails drop more seeds. Watered crops grow twice as fast.", need: 3, v: function () { return S.st.planted; }, rw: { seed_potato: 2 } },
    { id: "harvest", n: "First Harvest", d: "When a crop shows its ripe produce, hold on it to pick it. You get food and seeds to plant again.", need: 1, v: function () { return S.st.harvests; }, rw: { stone: 8, clay: 4 } },
    { id: "cook", n: "Home Cooking", d: "Make a Cooking Pot at your Bog Workbench, place it, tap it and cook a meal. Cooked food fills you up far more than raw food and heals you.", need: 1, v: function () { return S.st.cooked; }, rw: { torch: 6 } },
    { id: "pick2", n: "Spore Smith", d: "Tap your Workbench to open it and craft the Glowspore Pick.", need: 1, v: function () { return S.tier >= 2 ? 1 : 0; }, rw: { torch: 6 } },
    { id: "ember", n: "Cross into Ember Bog", d: "Walk east past the swamp edge. Basalt and Cinder Ore are next.", need: 1, v: function () { return (S.ms.ember || bioAt() === 1) ? 1 : 0; }, rw: null },
    { id: "spear", n: "Arm Yourself", d: "Craft the Reed Spear (Sticks, Fiber, Pebbles). Pick it in the hotbar and hold to swing. Enemies start to roam once you carry a weapon.", need: 1, v: function () { return S.wpn >= 1 ? 1 : 0; }, rw: { planks: 4 } },
    { id: "bug", n: "Squash a Bramble Bug", d: "Bramble Bugs prowl the swamp surface and dark caves. Strike them before they ram you.", need: 1, v: function () { return S.st.bugs; }, rw: { torch: 4 } },
    { id: "frog", n: "Hop to It", d: "A Swamp Frog warns with a ! then lashes its tongue low. Jump the tongue, then hit it while it is winded.", need: 1, v: function () { return S.st.frogs; }, rw: { planks: 6 } },
    { id: "blade", n: "Spore Blade", d: "Bring 3 Bramble Fragments from bugs to your Workbench and craft the Glowspore Blade.", need: 1, v: function () { return S.wpn >= 2 ? 1 : 0; }, rw: { torch: 6 } },
    { id: "bed", n: "Build a Bed", d: "Dusk Bats swoop down at night. Craft a Swamp Bed (Planks, Fiber, Leaves), select it in the hotbar and place it on solid ground near camp.", need: 1, v: function () { return S.st.beds; }, rw: { torch: 4 } },
    { id: "bats", n: "Night Watch", d: "When the sky goes dark, bats dive at you. Watch for the red eyes, step aside, then strike. Defeat 2 Dusk Bats.", need: 2, v: function () { return S.st.bats; }, rw: { planks: 6 } },
    { id: "sleep", n: "Sleep Tight", d: "At night, stand next to your bed and tap Sleep (or press F). You skip to dawn with full health, and the bed becomes your respawn point. Bats must be gone, or you need a roof overhead.", need: 1, v: function () { return S.st.sleeps; }, rw: { torch: 6 } },
    { id: "stash", n: "Stash Your Loot", d: "Craft a Wooden Chest (Planks, Fiber), place it near camp, open it (tap it or press F) and store 10 items.", need: 10, v: function () { return S.st.stashed; }, rw: { planks: 8, torch: 4 } },
    { id: "benchup", n: "Level Up the Bench", d: "Armor for the next biome needs a better Workbench. Bring Glowspore, Clay, Stone and Bramble + Frog Fragments from Murkwater to your Workbench, tap it to open it and press Upgrade.", need: 2, v: function () { return S.bl; }, rw: { planks: 8 } },
    { id: "mail", n: "Suit Up", d: "Craft the Glowspore Mail at your upgraded Workbench before you push deep into Ember Bog.", need: 1, v: function () { return S.arm >= 2 ? 1 : 0; }, rw: { torch: 6 } }
  ];
  // Day counter: S.days counts finished day/night cycles in this world (saved with the world). Showing it is a per-device option.
  var SHOWDAYS = false; try { SHOWDAYS = localStorage.getItem("swamp-delve-daycount") === "1"; } catch (e) {}
  function advTime(dt) { var nt = S.time + dt; if (nt >= CYCLE) S.days = (S.days | 0) + Math.floor(nt / CYCLE); S.time = nt % CYCLE; }
  function dayTag() { return SHOWDAYS ? "Day " + (((S.days | 0) + 1)) + " \u00b7 " : ""; }
  var PHN = { day: "Day", dusk: "Dusk", night: "Night", dawn: "Dawn" };

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var lerp = function (a, b, k) { return a + (b - a) * k; };
  var reduce = matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = matchMedia && matchMedia("(pointer: coarse)").matches;
  // PERF: phones render at a lower pixel ratio and skip the costliest effects. If a device still struggles, the loop steps the quality down further and remembers it.
  var lowq = coarse, dprCap = coarse ? 1.5 : 2; try { if (localStorage.getItem("swamp-delve-q") === "1") dprCap = 1; } catch (e) {}
  var cv = $("sbxCv"), ctx = cv.getContext("2d");
  var stageEl = $("sbxStage");

  // ---------- STATE ----------
  var S, world, tiles, orig, edits, col, ex, walls, worigW, wedits, WALLITEM = {};
  Object.keys(ITEMS).forEach(function (k) { if (ITEMS[k].wall) WALLITEM[ITEMS[k].wall] = k; });
  var p = { x: SW.SPAWNX + 0.5, y: SURF, vx: 0, vy: 0, face: 1, on: false, coy: 0, wet: false, walk: 0 };
  var cam = { x: 40, y: SURF }, keys = { l: 0, r: 0, j: 0, d: 0, u: 0 }, tk = { l: 0, r: 0, j: 0, d: 0, u: 0 };
  var selSlot = -1, invSel = -1, invAsk = "", sel = "pick", mine = null, aim = { down: false, id: null, mx: 0, my: 0, tx: -1, ty: -1 }, cool = 0;
  var parts = [], texts = [], flies = [], glows = [];
  var hp = MAXHP, hurtT = 0, hurtGrace = 0, sinceHurt = 99, shake = 0, shownHp = -1, HVIG = null;
  var vw = 800, vh = 600, dpr = 1, ts = 28, ox = 0, oy = 0;
  var panelOpen = false, packOpen = false, mapOpen = false, tab = "craft", hbDirty = true, lastBio = -1, hudT = 0, saveT = 0, msT = 0, nagT = 0, exKey = "", sprite = null, spriteKey = "", confirmNew = false;
  var ICO = {}, ATLAS, bannerQ = [], bannerBusy = false, guide = null, guideT = 0, trailKey = "", PCV = [], heldAmt = 0, heldPh = 0;

  // ---------- SAVE / LOAD ----------
  function rle(a) { var out = [], v = 0, n = 0; for (var i = 0; i < a.length; i++) { if (a[i] === v) n++; else { out.push(n); v = a[i]; n = 1; } } out.push(n); return out.join(","); }
  function unrle(s, a) { if (typeof s !== "string") return; var v = 0, i = 0, parts2 = s.split(","); for (var k = 0; k < parts2.length; k++) { var n = parseInt(parts2[k], 10) || 0; if (v) a.fill(1, i, Math.min(a.length, i + n)); i += n; v ^= 1; } }
  function defaultAnimal() { try { return Crystals.outfit().animal || "frog"; } catch (e) { return "frog"; } }
  function fresh(seed) { return { v: 2, wv: SW.WORLDVER, seed: seed, e: "", ex: "", we: "", p: null, animal: defaultAnimal(), inv: {}, slots: emptySlots(0), extra: {}, bag: 0, can: 0, water: 0, mru: [], tier: 0, wpn: 0, arm: 0, bl: 1, trail: 0, hp: MAXHP, bed: null, shovel: 0, dur: { pick: 0, shovel: 0, wpn: 0, arm: 0 }, chests: {}, wp: [], time: 60, days: 0, ms: {}, st: { deaths: 0, mined: 0, placed: 0, torches: 0, wood: 0, maxDepth: 0, swim: 0, stick: 0, fiber: 0, pebble: 0, spore: 0, benches: 0, swings: 0, bugs: 0, frogs: 0, bats: 0, wolves: 0, gators: 0, slimes: 0, wasps: 0, seen: 0, cchests: 0, pots: 0, ckills: 0, cclear: 0, eaten: 0, planted: 0, harvests: 0, cooked: 0, cropbits: 0, htip: 0, beds: 0, sleeps: 0, warned: 0, doors: 0, ladders: 0, chests: 0, stashed: 0, caves: 0, cmined: 0, caveDeep: 0, decor: 0, dbenches: 0, dcraft: 0, watered: 0, grown: 0, walls: 0 }, zoom: 1, tv: 2, food: 100, nohunger: 0, farm: {}, ate: {} }; }
  function clean(o) {
    if (!o || typeof o !== "object" || !o.seed) return null;
    var d = fresh(o.seed | 0 || 1);
    d.e = typeof o.e === "string" ? o.e : ""; d.ex = typeof o.ex === "string" ? o.ex : "";
    if (o.wv !== SW.WORLDVER) { d.e = ""; d.ex = ""; o = Object.assign({}, o, { p: null }); d.grown = true; }   // the world was rebuilt bigger: keep your items and progress, but old digging and map no longer line up
    d.we = typeof o.we === "string" && o.wv === SW.WORLDVER ? o.we : "";
    if (o.p && isFinite(o.p.x) && isFinite(o.p.y)) d.p = { x: clamp(+o.p.x, 1, W - 1), y: clamp(+o.p.y, 2, H - 2), f: o.p.f < 0 ? -1 : 1 };
    if (typeof o.animal === "string") d.animal = o.animal;
    if (o.inv && typeof o.inv === "object") ORDER.forEach(function (k) { var n = Math.floor(+o.inv[k]); if (n > 0) d.inv[k] = Math.min(n, 99999); });
    var bg = Math.floor(+o.bag); d.bag = clamp(isFinite(bg) ? bg : 0, 0, BAGS.length - 1);   // older saves have no backpack
    d.slots = emptySlots(d.bag); d.extra = {};
    if (Array.isArray(o.slots) && o.slots.length === d.slots.length) {   // saved slot layout
      o.slots.forEach(function (sl, i) { if (sl && typeof sl.k === "string" && ITEMS[sl.k] && ORDER.indexOf(sl.k) > -1) { var n = clamp(Math.floor(+sl.n) || 0, 0, stackMax(sl.k)); if (n > 0) d.slots[i] = { k: sl.k, n: n }; } });
      if (o.extra && typeof o.extra === "object") ORDER.forEach(function (k) { var n = Math.floor(+o.extra[k]); if (n > 0) d.extra[k] = Math.min(n, 99999); });
    } else {   // older save (unlimited bag): the items you had on the hotbar go first, anything past the new limits waits in Overflow
      var first = (Array.isArray(o.mru) ? o.mru : []).filter(function (k) { return d.inv[k] > 0; }), seen = {};
      first.concat(ORDER).forEach(function (k) { if (seen[k] || !(d.inv[k] > 0)) return; seen[k] = 1; var rest = packInto(d.slots, k, d.inv[k]); if (rest > 0) d.extra[k] = rest; });
    }
    d.inv = totals(d.slots);
    if (Array.isArray(o.mru)) d.mru = o.mru.filter(function (k) { return ITEMS[k] && ITEMS[k].tile !== undefined; }).slice(0, 20);
    var tr = Math.floor(+o.tier); d.tier = clamp(isFinite(tr) ? tr : 1, o.v >= 2 ? 0 : 1, 4);
    var wp = Math.floor(+o.wpn); d.wpn = clamp(isFinite(wp) ? wp : 0, 0, WEAPONS.length - 1);
    var ar = Math.floor(+o.arm); d.arm = clamp(isFinite(ar) ? ar : 0, 0, ARMORS.length - 1);   // older saves have no armor
    var bl0 = Math.floor(+o.bl); d.bl = clamp(isFinite(bl0) ? bl0 : 1, 1, BENCH_LV.length - 1);
    RECIPES.forEach(function (r) { if (r.bl && ((r.tier && d.tier >= r.tier) || (r.wpn && d.wpn >= r.wpn) || (r.arm && d.arm >= r.arm))) d.bl = Math.max(d.bl, r.bl); });   // older saves keep the gear they already made
    d.trail = typeof o.trail === "number" ? clamp(Math.floor(o.trail), 0, TRAIL.length) : TRAIL.length;   // older saves skip the beginner Trail
    d.shovel = +o.shovel ? 1 : 0;
    d.can = +o.can ? 1 : 0; d.water = d.can ? clamp(Math.floor(+o.water) || 0, 0, CAN.max) : 0;
    d.dur = { pick: DUR.pick[d.tier] || 0, shovel: d.shovel ? DUR.shovel : 0, wpn: DUR.wpn[d.wpn] || 0, arm: DUR.arm[d.arm] || 0 };   // older saves: everything at full
    if (o.dur && typeof o.dur === "object") { var dm = { pick: DUR.pick[d.tier] || 0, shovel: d.shovel ? DUR.shovel : 0, wpn: DUR.wpn[d.wpn] || 0, arm: DUR.arm[d.arm] || 0 }; Object.keys(dm).forEach(function (k) { if (isFinite(+o.dur[k]) && o.dur[k] !== null) d.dur[k] = clamp(Math.floor(+o.dur[k]), 0, dm[k]); }); }
    d.hp = isFinite(+o.hp) && +o.hp > 0 ? Math.min(MAXHP, +o.hp) : MAXHP;   // older saves start at full health
    d.time = clamp(+o.time || 60, 0, CYCLE - 0.01);
    if (o.bed && isFinite(o.bed.x) && isFinite(o.bed.y)) d.bed = { x: clamp(Math.floor(o.bed.x), 0, W - 1), y: clamp(Math.floor(o.bed.y), 0, H - 1) };   // checked against the world on respawn
    if (o.chests && typeof o.chests === "object" && o.wv === SW.WORLDVER) Object.keys(o.chests).forEach(function (ck) {   // chest contents, keyed by "x,y" (dropped if the world was rebuilt)
      if (!/^\d+,\d+$/.test(ck) || !o.chests[ck] || typeof o.chests[ck] !== "object") return; var c = {};
      ORDER.forEach(function (k) { var n = Math.floor(+o.chests[ck][k]); if (n > 0) c[k] = Math.min(n, 99999); }); d.chests[ck] = c;
    });
    if (o.ms && typeof o.ms === "object") GOALS.forEach(function (g) { if (o.ms[g.id]) d.ms[g.id] = 1; });
    if (o.st && typeof o.st === "object") Object.keys(d.st).forEach(function (k) { d.st[k] = Math.max(0, Math.floor(+o.st[k]) || 0); });
    if (Array.isArray(o.wp) && o.wv === SW.WORLDVER) o.wp.slice(0, WP_MAX).forEach(function (w) {   // map waypoints (dropped if the world was rebuilt)
      if (w && isFinite(+w.x) && isFinite(+w.y)) d.wp.push({ x: clamp(Math.floor(+w.x), 0, W - 1), y: clamp(Math.floor(+w.y), 0, H - 1), c: clamp(Math.floor(+w.c) || 0, 0, WP_COL.length - 1), i: clamp(Math.floor(+w.i) || 0, 0, WP_ICONS.length - 1), n: String(w.n || "Waypoint").slice(0, 24) });
    });
    d.days = Math.max(0, Math.min(1e6, Math.floor(+o.days) || 0));
    d.zoom = [0.8, 1, 1.25, 1.5, 2].indexOf(+o.zoom) > -1 ? +o.zoom : 1;
    d.food = isFinite(+o.food) && o.food !== null && o.food !== undefined ? clamp(+o.food, 0, 100) : 100; d.nohunger = o.nohunger ? 1 : 0;
    if (o.ate && typeof o.ate === "object") Object.keys(o.ate).forEach(function (k) { if (ITEMS[k] && ITEMS[k].cooked) d.ate[k] = 1; });
    if (o.farm && typeof o.farm === "object" && o.wv === SW.WORLDVER) Object.keys(o.farm).forEach(function (k) { var f = o.farm[k]; if (/^\d+,\d+$/.test(k) && f && CROPS[f.c]) d.farm[k] = { c: f.c, g: Math.max(0, +f.g || 0), w: Math.max(0, +f.w || 0) }; });
    if (o.tv !== 2 && typeof o.trail === "number") {   // the Trail gained food steps: keep older saves on the step they had reached
      var oid = TRAIL_V1[clamp(Math.floor(o.trail), 0, TRAIL_V1.length)], ni = oid ? TRAIL.map(function (t) { return t.id; }).indexOf(oid) : -1; d.trail = oid ? (ni < 0 ? TRAIL.length : ni) : TRAIL.length;
    }
    return d;
  }
  function build(state) {
    world = SW.gen(state.seed); tiles = world.t; orig = tiles.slice(); edits = {};
    state.e.split(",").forEach(function (s) { var a = s.split(":"), i = parseInt(a[0], 10), id = parseInt(a[1], 10); if (i >= 0 && i < tiles.length && TILES[id]) { tiles[i] = id; if (id !== orig[i]) edits[i] = id; } });
    buildSMask();
    col = new Int16Array(W); for (var x = 0; x < W; x++) recalc(x);
    ex = new Uint8Array(W * H); unrle(state.ex, ex);
    walls = world.walls ? world.walls.slice() : new Uint8Array(W * H); worigW = walls.slice(); wedits = {};   // back walls: world-made ones plus only the ones you changed (S.we, "index:wallId" pairs, 0 = removed)
    (typeof state.we === "string" ? state.we : "").split(",").forEach(function (q) { var a = q.split(":"), wi = parseInt(a[0], 10), wd = parseInt(a[1], 10); if (wi >= 0 && wi < walls.length && (wd === 0 || (TILES[wd] && TILES[wd].kind === "wall"))) { walls[wi] = wd; if (wd !== worigW[wi]) wedits[wi] = wd; } });
  }
  function start(state) {
    S = state; benchLv = S.bl || 1; repaintBench(); grow.length = 0; canAcc = 0; build(S); cave = null; trans = null; resize(); stageEl.classList.remove("cave");
    if (state.grown) { state.grown = false; setTimeout(function () { toast("The world was rebuilt! Taller mountains, volcanoes, ice spires and deeper caves. Your items are safe.", "#f2c14e"); }, 1200); }
    var sp = world.spawn; p.x = S.p ? S.p.x : sp.x; p.y = S.p ? S.p.y : sp.y; p.face = S.p ? S.p.f : 1; p.vx = p.vy = 0;
    var guard = 0; while (boxHit(p.x, p.y) && guard++ < 120) p.y -= 1;
    cam.x = p.x; cam.y = p.y - 1; sel = "pick"; selSlot = -1; invSel = -1; mine = null; lastBio = -1; trailKey = ""; guide = null; tab = S.trail < TRAIL.length ? "trail" : "craft"; hbDirty = true; exKey = ""; spriteKey = ""; ICO = {};
    hp = S.hp; hurtT = hurtGrace = shake = 0; sinceHurt = 99; shownHp = -1; drawHp(); sleepT = 0; batT = 8; enemies.length = 0;
    reveal(true);
  }
  function save() {
    try {
      reslot(); S.hp = Math.max(1, Math.round(hp));
      S.p = { x: +p.x.toFixed(2), y: +p.y.toFixed(2), f: p.face };
      S.e = Object.keys(edits).map(function (k) { return k + ":" + edits[k]; }).join(",");
      S.ex = rle(ex); S.we = Object.keys(wedits).map(function (k) { return k + ":" + wedits[k]; }).join(",");
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
  // Generated buildings (the standalone structures) are scenery: you walk straight through their walls, roofs and doors as if they were in the background.
  // smask marks the footprint (built in build()); only tiles still equal to the generated world count, so anything you place or dig yourself behaves normally.
  var smask = null;
  function buildSMask() {
    smask = new Uint8Array(W * H); var ss = world.structs || [], i, x, y;
    function mark(x0, x1, y0, y1) { for (y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) smask[y * W + x] = 1; }
    for (i = 0; i < ss.length; i++) { var q = ss[i]; if (q.mx0 !== undefined) mark(q.mx0, q.mx1, q.my0, q.gy - 1); else mark(q.x0 - 1, q.x1 + 1, q.gy - q.bh - 7, q.gy - 1); }
  }
  function blocks(x, y) {
    var id = get(x, y); if (!TILES[id].solid) return false;
    if (smask && x >= 0 && x < W && y >= 0 && y < H && smask[y * W + x] && tiles[y * W + x] === orig[y * W + x]) return false;
    if ((id === T.LOG || id === T.LEAVES) && x >= 0 && x < W && y >= 0 && y < H && tiles[y * W + x] === orig[y * W + x]) return false;
    return true;
  }
  var opaque = function (id) { return TILES[id].solid && id !== T.LEAVES; };
  function recalc(x) {   // first row that counts as ground/roof (sets sky light and the dark backwall). World-generated trunks are scenery, so they never count: no backwall appears under a tree when you chop it.
    for (var y = 0; y < H; y++) { var i = y * W + x, id = tiles[i]; if (opaque(id) && !(id === T.LOG && id === orig[i]) && !(smask && smask[i] && id === orig[i])) { col[x] = y; return; } }   // generated buildings are scenery: sky light passes them
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
  // A grid of INV_N slots like Minecraft: slots 0..5 are the hotbar, 6..29 are the bag. Each slot is null or { k: item, n: count }, at most stackMax(k) per slot.
  // S.inv ({item: total}) is what crafting, building and repairs read and change. reslot() copies any change in S.inv back into the slots, so those places did not need to change.
  function emptySlots(b) { var a = [], n = invSize(b === undefined ? (S && S.bag) : b); for (var i = 0; i < n; i++) a.push(null); return a; }
  function stackMax(k) { return SMALL[k] ? STACK_SMALL : STACK; }
  function totals(sl) { var t = {}; sl.forEach(function (c) { if (c) t[c.k] = (t[c.k] || 0) + c.n; }); return t; }
  function packInto(sl, k, n) {   // put n of k into slots (top up stacks first, then empty slots, hotbar first). Returns how many did NOT fit
    var m = stackMax(k), i, c;
    for (i = 0; i < sl.length && n > 0; i++) { c = sl[i]; if (c && c.k === k && c.n < m) { var a = Math.min(n, m - c.n); c.n += a; n -= a; } }
    for (i = 0; i < sl.length && n > 0; i++) if (!sl[i]) { var b = Math.min(n, m); sl[i] = { k: k, n: b }; n -= b; }
    return n;
  }
  function takeFrom(sl, k, n, pref) {   // remove n of k: the slot you are holding first, then the bag from the back, the hotbar last
    var i, c;
    if (pref >= 0 && sl[pref] && sl[pref].k === k) { c = sl[pref]; var a = Math.min(n, c.n); c.n -= a; n -= a; if (c.n <= 0) sl[pref] = null; }
    for (i = sl.length - 1; i >= 0 && n > 0; i--) { c = sl[i]; if (c && c.k === k) { var b = Math.min(n, c.n); c.n -= b; n -= b; if (c.n <= 0) sl[i] = null; } }
  }
  function reslot() {   // make the slots match S.inv
    if (!S || !S.slots) return; var t = totals(S.slots), k, d, lost = 0;
    for (k in t) { d = (S.inv[k] || 0) - t[k]; if (d < 0) takeFrom(S.slots, k, -d, k === sel ? selSlot : -1); }
    for (k in S.inv) {
      d = (S.inv[k] || 0) - (t[k] || 0);
      if (d > 0) { var rest = packInto(S.slots, k, d); if (rest > 0) { S.inv[k] -= rest; S.extra[k] = (S.extra[k] || 0) + rest; lost += rest; } }
      if (S.inv[k] <= 0) delete S.inv[k];
    }
    if (lost) toast("Inventory full! The extra went to Overflow (open your inventory).", "#f2c14e");
  }
  function room(k) { reslot(); var m = stackMax(k), r = 0; S.slots.forEach(function (c) { if (!c) r += m; else if (c.k === k) r += m - c.n; }); return r; }
  function usedSlots() { reslot(); var n = 0; S.slots.forEach(function (c) { if (c) n++; }); return n; }
  function extraCount() { var n = 0; for (var k in S.extra) n += S.extra[k]; return n; }
  function addExtra(k, n) { S.extra[k] = Math.min(99999, (S.extra[k] || 0) + n); }
  function invFull(item) { if (item && room(item) > 0) return false; nag("Inventory full! Press E to make room."); return true; }
  function give(item, n, tx, ty, keep) {   // keep: loot that must never be lost (rewards, enemy drops). What does not fit waits in Overflow
    var fit = Math.min(n, room(item));
    if (fit > 0) {
      S.inv[item] = (S.inv[item] || 0) + fit; packInto(S.slots, item, fit);
      if (typeof S.st[item] === "number") S.st[item] += fit;
      if (ITEMS[item].tile !== undefined && S.mru.indexOf(item) < 0) S.mru.push(item);
      if (tx !== undefined) text(tx + 0.5, ty, "+" + fit + " " + ITEMS[item].n, ITEMS[item].gem || "#f6eedb");
    }
    if (fit < n) { if (keep) { addExtra(item, n - fit); toast("Inventory full! " + (n - fit) + " " + ITEMS[item].n + " went to Overflow.", "#f2c14e"); } else nag("Inventory full! Press E to make room."); }
    hbDirty = true; if (panelOpen) renderPanel(); return fit;
  }
  function moveSlot(a, b) {   // tap a, then tap b: move the stack, merge equal stacks, or swap
    var sl = S.slots, A = sl[a], B = sl[b]; if (a === b || !A) return;
    if (!B) { sl[b] = A; sl[a] = null; }
    else if (B.k === A.k) { var m = stackMax(A.k), mv = Math.min(A.n, m - B.n); B.n += mv; A.n -= mv; if (A.n <= 0) sl[a] = null; }
    else { sl[a] = B; sl[b] = A; }
    hbDirty = true; invAfter();
  }
  function splitSlot(a) {   // half of the stack goes into the first empty slot
    var A = S.slots[a]; if (!A || A.n < 2) return; var e = -1, i;
    for (i = 0; i < invN(); i++) if (!S.slots[i]) { e = i; break; }
    if (e < 0) { toast("No empty slot to split into.", "#f2c14e"); return; }
    var h = Math.floor(A.n / 2); A.n -= h; S.slots[e] = { k: A.k, n: h }; invSel = e; hbDirty = true; invAfter();
  }
  function quickMove(a) {   // hotbar -> bag, bag -> hotbar
    var A = S.slots[a]; if (!A) return; var toHot = a >= INV_HOT, lo = toHot ? 0 : INV_HOT, hi = toHot ? INV_HOT : invN(), m = stackMax(A.k), i;
    for (i = lo; i < hi && A.n > 0; i++) { var c = S.slots[i]; if (c && c.k === A.k && c.n < m) { var mv = Math.min(A.n, m - c.n); c.n += mv; A.n -= mv; } }
    for (i = lo; i < hi && A.n > 0; i++) if (!S.slots[i]) { S.slots[i] = { k: A.k, n: A.n }; A.n = 0; invSel = i; }
    if (A.n <= 0) S.slots[a] = null; else if (toHot) { var sw = selSlot >= 0 && selSlot < INV_HOT ? selSlot : 0; moveSlot(a, sw); invSel = sw; return; } else toast("Your backpack is full.", "#f2c14e");
    hbDirty = true; invAfter();
  }
  function tossSlot(a, all) {   // throw away one, or the whole stack (the stack asks twice)
    var A = S.slots[a]; if (!A) return;
    if (all && A.n > 1 && invAsk !== "t" + a) { invAsk = "t" + a; renderPanel(); return; }
    invAsk = ""; var k = A.k, n = all ? A.n : 1; A.n -= n; if (A.n <= 0) { S.slots[a] = null; invSel = -1; }
    S.inv[k] = (S.inv[k] || 0) - n; if (S.inv[k] <= 0) delete S.inv[k]; if (sel === k && !(S.inv[k] > 0)) { sel = "pick"; selSlot = -1; }
    snd("coin"); hbDirty = true; invAfter();
  }
  function sortInv() {   // tidy the bag (not the hotbar): merge stacks, then order like the item list
    var items = [], i; for (i = INV_HOT; i < invN(); i++) if (S.slots[i]) items.push(S.slots[i]); var t = {}; items.forEach(function (c) { t[c.k] = (t[c.k] || 0) + c.n; });
    for (i = INV_HOT; i < invN(); i++) S.slots[i] = null;
    var tmp = S.slots.slice(INV_HOT); ORDER.forEach(function (k) { if (t[k]) packInto(tmp, k, t[k]); }); for (i = 0; i < tmp.length; i++) S.slots[INV_HOT + i] = tmp[i];
    invSel = -1; hbDirty = true; invAfter();
  }
  function collectExtra(k) {
    var n = S.extra[k] || 0, fit = Math.min(n, room(k)); if (fit <= 0) { toast("No room yet. Free a slot first.", "#f2c14e"); return; }
    S.inv[k] = (S.inv[k] || 0) + fit; packInto(S.slots, k, fit); S.extra[k] -= fit; if (S.extra[k] <= 0) delete S.extra[k];
    hbDirty = true; invAfter();
  }
  function invAfter() { if (sel !== "pick" && sel !== "weapon" && sel !== "shovel" && sel !== "can" && !(S.inv[sel] > 0)) { sel = "pick"; selSlot = -1; } renderPanel(); }
  // ---------- DURABILITY ----------
  function durMax(k) { return k === "pick" ? DUR.pick[S.tier] || 0 : k === "shovel" ? (S.shovel ? DUR.shovel : 0) : k === "arm" ? DUR.arm[S.arm] || 0 : DUR.wpn[S.wpn] || 0; }
  function durOf(k) { var v = S.dur[k], m = durMax(k); return v == null ? m : Math.min(v, m); }
  var toolName = function (k) { return k === "pick" ? PICKS[S.tier].n : k === "shovel" ? SHOVEL.n : k === "arm" ? ARMORS[S.arm].n : WEAPONS[S.wpn].n; };
  var toolBroken = function (k) { return durMax(k) > 0 && durOf(k) <= 0; };
  function effTier() { return S.tier > 0 && durOf("pick") > 0 ? S.tier : 0; }   // a broken pick digs like bare paws
  function wear(k, n) {
    var m = durMax(k); if (m <= 0) return; var before = durOf(k), now = Math.max(0, before - n); S.dur[k] = now; hbDirty = true;
    if (panelOpen && tab === "craft") renderPanel();
    if (now <= 0 && before > 0) { toast("Your " + toolName(k) + " broke" + (k === "arm" ? " and no longer protects you" : "") + "! Repair it in the Craft tab.", "#ff6b82"); thud(90, 0.12); chips(p.x, p.y - 1, "#c9b58a", 14, 6); mine = null; }
    else if (before > m * 0.2 && now <= m * 0.2) toast("Your " + toolName(k) + " is wearing out.", "#f2c14e");
  }
  function repairNeedsBench(k) { return k === "pick" ? S.tier >= 2 : k === "wpn" ? S.wpn >= 2 : k === "arm" ? S.arm >= 2 : false; }
  function repairCost(k) { return k === "pick" ? REPAIR.pick[S.tier] : k === "shovel" ? REPAIR.shovel : k === "arm" ? REPAIR.arm[S.arm] : REPAIR.wpn[S.wpn]; }
  function repair(k) {
    var m = durMax(k); if (m <= 0 || durOf(k) >= m) return; var cost = repairCost(k); if (!cost) return;
    if (repairNeedsBench(k) && !nearBench()) { toast("Stand near a Bog Workbench to repair this.", "#f2c14e"); return; }
    for (var c in cost) if ((S.inv[c] || 0) < cost[c]) { toast("Not enough " + ITEMS[c].n + ".", "#f2c14e"); return; }
    for (var c2 in cost) { S.inv[c2] -= cost[c2]; if (S.inv[c2] <= 0) delete S.inv[c2]; }
    S.dur[k] = m; hbDirty = true; armKey = ""; toast(toolName(k) + " repaired.", "#4ee6b4"); snd("coin"); chips(p.x, p.y - 1, "#4ee6b4", 12, 6); renderPanel(); save();
  }
  function barEntries() {   // tools first (they do not use inventory slots), then the 6 hotbar slots
    reslot(); var e = [{ id: "pick", slot: -1 }]; if (S.wpn) e.push({ id: "weapon", slot: -1 }); if (S.shovel) e.push({ id: "shovel", slot: -1 }); if (S.can) e.push({ id: "can", slot: -1 });
    for (var i = 0; i < INV_HOT; i++) e.push({ id: S.slots[i] ? S.slots[i].k : "", slot: i });
    return e;
  }
  function hot() { var o = []; for (var i = 0; i < INV_HOT; i++) if (S.slots[i] && o.indexOf(S.slots[i].k) < 0) o.push(S.slots[i].k); return o; }
  function hotIndex(k) { for (var i = 0; i < INV_HOT; i++) if (S.slots[i] && S.slots[i].k === k) return i; return -1; }
  function choose(id, slot) {
    if (id === "pick") { sel = "pick"; selSlot = -1; }
    else if (id === "weapon") { if (S.wpn) { sel = "weapon"; selSlot = -1; } }
    else if (id === "shovel") { if (S.shovel) { sel = "shovel"; selSlot = -1; } }
    else if (id === "can") { if (S.can) { sel = "can"; selSlot = -1; } }
    else if ((S.inv[id] || 0) > 0 && ITEMS[id] && (ITEMS[id].tile !== undefined || ITEMS[id].food)) { sel = id; selSlot = slot != null && slot >= 0 ? slot : hotIndex(id); }
    mine = null; hbDirty = true;
  }

  // ---------- DAY / NIGHT ----------
  function phaseOf(t) { if (t < 240) return { id: "day", k: t / 240 }; if (t < 280) return { id: "dusk", k: (t - 240) / 40 }; if (t < 440) return { id: "night", k: (t - 280) / 160 }; return { id: "dawn", k: (t - 440) / 40 }; }
  function daylight(t) { var f = phaseOf(t); return f.id === "day" ? 1 : f.id === "dusk" ? 1 - 0.7 * f.k : f.id === "night" ? 0.3 : 0.3 + 0.7 * f.k; }
  var SKY = { day: [[16, 104, 120], [206, 232, 140]], dusk: [[70, 40, 110], [255, 150, 96]], night: [[6, 13, 36], [26, 90, 94]], dawn: [[44, 70, 130], [255, 176, 120]] };
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
    var lg = LEAFATLAS.getContext("2d", { willReadFrequently: true }); for (var lm = 0; lm < 16; lm++) for (var lv = 0; lv < 4; lv++) paintLeaf(lg, lv * 16, lm * 16, lv, lm);
    ATLAS = document.createElement("canvas"); ATLAS.width = 64; ATLAS.height = 16 * TILES.length;
    var g = ATLAS.getContext("2d", { willReadFrequently: true });
    TILES.forEach(function (td) { for (var v = 0; v < 4; v++) paint(g, td, v, td.id * 16); });
    gradeAtlas();
    buildSmooth();
  }
  // COLOUR PASS: a little more saturation and contrast on every tile, once at load (no darkening).
  function gradeStrip(g, x, y, w, h, sat, con) {
    var im = g.getImageData(x, y, w, h), d = im.data, i, r, gg, b, l;
    for (i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      r = d[i]; gg = d[i + 1]; b = d[i + 2]; l = 0.299 * r + 0.587 * gg + 0.114 * b;
      r = l + (r - l) * sat; gg = l + (gg - l) * sat; b = l + (b - l) * sat;
      r = (r - 128) * con + 128; gg = (gg - 128) * con + 128; b = (b - 128) * con + 128;
      d[i] = r < 0 ? 0 : r > 255 ? 255 : r; d[i + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg; d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
    g.putImageData(im, x, y);
  }
  function gradeOne(td) { if (ATLAS) gradeStrip(ATLAS.getContext("2d", { willReadFrequently: true }), 0, td.id * 16, 64, 16, 1.22, 1.07); }
  function gradeAtlas() { TILES.forEach(gradeOne); gradeStrip(LEAFATLAS.getContext("2d", { willReadFrequently: true }), 0, 0, 64, 256, 1.18, 1.06); }
  function repaintBench() {   // the Workbench tile looks different at each level; redraw just its strip of the atlas
    if (!ATLAS) return; var g = ATLAS.getContext("2d"); g.clearRect(0, T.BENCH * 16, 64, 16);
    for (var v = 0; v < 4; v++) paint(g, TILES[T.BENCH], v, T.BENCH * 16);
    gradeOne(TILES[T.BENCH]); if (SMATLAS) smTile(TILES[T.BENCH]);
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
    if (!d.open) {   // CLOSED: the door seen edge-on, a thin plank standing in the middle of the doorway
      var tx = 6;
      rect(tx, 0, 4, 16, "#b9793f"); rect(tx, 0, 1, 16, "#dc9a58"); rect(tx + 3, 0, 1, 16, "#6e431f"); rect(tx + 4, 0, 1, 16, "#000", 0.18); rect(tx - 1, 0, 1, 16, "#000", 0.12);
      for (y = 1; y < 16; y += 4) rect(tx + 1, y, 2, 1, "#8a5328", 0.8);
      rect(tx, d.top ? 3 : 11, 4, 3, "#4a4a52"); rect(tx, d.top ? 3 : 11, 4, 1, "#9aa0ac"); rect(tx + 2, d.top ? 4 : 12, 1, 1, "#1c1c22");
      if (d.top) rect(tx, 0, 4, 1, "#2a190d");
      return;
    }
    // OPEN: the door swung round to face you, the full wide panel
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
  function paintPlanks(rect, hh) {   // four bevelled boards with staggered joints, wood grain and a knot
    var tones = [["#dba663", "#f6ca90", "#a8713a"], ["#cf9553", "#edb978", "#9a6330"], ["#e3b273", "#fad6a2", "#b07a44"], ["#d49b58", "#f1be82", "#9f6934"]], joints = [5, 11, 2, 8];
    tones.forEach(function (t, i) {
      var y0 = i * 4, k, jx = joints[i];
      rect(0, y0, 16, 4, t[0]);
      for (k = 0; k < 4; k++) { var gx = Math.floor(hh(k, i + 3, 4) * 11), gy = y0 + 1 + Math.floor(hh(k, i, 3) * 2), gl = 3 + Math.floor(hh(k, i + 9, 5) * 7); rect(gx, gy, gl, 1, k % 2 ? t[2] : t[1], k % 2 ? 0.32 : 0.3); }
      rect(0, y0, 16, 1, t[1], 0.9); rect(0, y0 + 1, 16, 1, t[1], 0.16);
      rect(0, y0 + 2, 16, 1, t[2], 0.28); rect(0, y0 + 3, 16, 1, "#4a2a12", 0.92);
      rect(jx, y0, 1, 3, "#4a2a12", 0.95); rect(jx + 1, y0, 1, 3, t[1], 0.3);
    });
    rect(7, 5, 3, 2, "#6a3f1c"); rect(8, 5, 1, 1, "#34200d"); rect(6, 5, 1, 2, "#8a5328", 0.7);
    rect(0, 0, 1, 16, "#ffd9a0", 0.12); rect(15, 0, 1, 16, "#000", 0.14);
  }

  function paintWall(rect, hh, id, v) {   // 16x16 back wall pictures (4 variants each). They are drawn darker than blocks when placed (see drawWall)
    var x, y, k;
    if (typeof SbxExtra !== "undefined" && SbxExtra.WALL_ART[id]) { SbxExtra.WALL_ART[id](rect, hh, v); return; }
    if (id === T.W_PLANK) {   // horizontal boards with seams, staggered joints and a nail each
      for (k = 0; k < 4; k++) {
        var by = k * 4; rect(0, by, 16, 4, ["#7d5230", "#734a2a", "#80552f", "#76502c"][(k + v) & 3]); rect(0, by, 16, 1, "#96643a"); rect(0, by + 3, 16, 1, "#47290f");
        var jx = 2 + Math.floor(hh(k, 1, 5) * 11); rect(jx, by + 1, 1, 3, "#47290f"); rect((jx + 7) % 14 + 1, by + 1, 1, 1, "#2e1a09", 0.7);
        for (x = 0; x < 3; x++) rect(Math.floor(hh(k, x, 9) * 14), by + 1 + Math.floor(hh(x, k, 11) * 2), 3, 1, "#5e3b1f", 0.5);
      }
    } else if (id === T.W_LOG) {   // four upright logs, lit on the left, shaded on the right, with the odd knot
      for (k = 0; k < 4; k++) {
        var bx = k * 4; rect(bx, 0, 4, 16, "#6b4526"); rect(bx, 0, 1, 16, "#8a5a32"); rect(bx + 1, 0, 1, 16, "#7a502b", 0.6); rect(bx + 3, 0, 1, 16, "#3e2612");
        if (hh(k, 3, 4) > 0.55) { var ky = 2 + Math.floor(hh(k, 5, 6) * 11); rect(bx + 1, ky, 2, 2, "#2e1a09"); rect(bx + 1, ky, 1, 1, "#4a2f18"); }
      }
    } else if (id === T.W_BRICK) {   // grey bricks, 8 wide and 4 tall, every other row shifted
      rect(0, 0, 16, 16, "#2f373b");
      for (var r = 0; r < 4; r++) for (var b0 = -((r & 1) * 4); b0 < 16; b0 += 8) {
        var x0 = Math.max(0, b0), x1 = Math.min(16, b0 + 7), tone = ["#566066", "#4f595f", "#5d676d", "#525c62"][Math.floor(hh(b0 + 9, r, 3) * 4)];
        rect(x0, r * 4, x1 - x0, 3, tone); rect(x0, r * 4, x1 - x0, 1, "#7a858c", 0.55); if (hh(b0, r, 7) > 0.6) rect(x0 + 2, r * 4 + 1, 2, 1, "#3f484d", 0.6);
      }
    } else if (id === T.W_PLASTER) {   // creamy plaster with specks and a hairline crack now and then
      rect(0, 0, 16, 16, "#d8c8a2");
      for (k = 0; k < 14; k++) rect(Math.floor(hh(k, 1, 21) * 16), Math.floor(hh(k, 2, 22) * 16), 1, 1, hh(k, 3, 23) > 0.5 ? "#c4b389" : "#e8dcba");
      if (hh(1, 1, 24) > 0.65) { var cx = 3 + Math.floor(hh(2, 2, 25) * 9); rect(cx, 3, 1, 3, "#b8a77d", 0.8); rect(cx + 1, 6, 1, 3, "#b8a77d", 0.8); }
    } else if (id === T.W_MOSS) {   // damp dark mud brick with moss blotches
      rect(0, 0, 16, 16, "#3b4426");
      for (k = 0; k < 9; k++) { var mx = Math.floor(hh(k, 1, 31) * 14), my = Math.floor(hh(k, 2, 32) * 14), mc = ["#58742f", "#2a3320", "#7da34a", "#47592a"][Math.floor(hh(k, 3, 33) * 4)]; rect(mx, my, 2 + (k & 1), 2, mc, mc === "#7da34a" ? 0.6 : 1); }
      rect(0, 7, 16, 1, "#2a3320", 0.5); rect(0, 15, 16, 1, "#2a3320", 0.5);
    } else if (id === T.W_TIMBER) {   // plaster panel inside a dark wooden frame (the frames tile into a half-timbered wall)
      rect(0, 0, 16, 16, "#d6c59c");
      for (k = 0; k < 8; k++) rect(Math.floor(hh(k, 1, 41) * 16), Math.floor(hh(k, 2, 42) * 16), 1, 1, hh(k, 3, 43) > 0.5 ? "#c2b088" : "#e6d9b6");
      rect(0, 0, 16, 2, "#5a3a1e"); rect(0, 0, 2, 16, "#5a3a1e"); rect(0, 0, 16, 1, "#7a5230"); rect(0, 0, 1, 16, "#7a5230"); rect(2, 2, 14, 1, "#000", 0.14); rect(2, 2, 1, 14, "#000", 0.1);
    }
  }
  // ---------- DECOR EXPANSION ART: one 16x16 picture per new block / showpiece (kind name = key). Called from paint() with rect(x, y, w, h, colour, alpha), hh = tile hash, v = look 0-3. ----------
  var DECOR_ART = {
    brick: function (rect, hh) {   // grey stone bricks, staggered, with mortar
      rect(0, 0, 16, 16, "#80868a");
      [0, 5, 10].forEach(function (y, r) { rect(0, y, 16, 1, "#4d5256"); var jx = r % 2 ? 3 : 7; rect(jx, y + 1, 1, 4, "#4d5256"); rect(jx + 8 > 15 ? jx - 8 : jx + 8, y + 1, 1, 4, "#4d5256"); rect(0, y + 1, 16, 1, "#a3aaae", 0.35); });
      rect(0, 15, 16, 1, "#4d5256"); for (var k = 0; k < 8; k++) rect(Math.floor(hh(k, 1, 61) * 16), Math.floor(hh(k, 2, 62) * 16), 1, 1, hh(k, 3, 63) > 0.5 ? "#6a7075" : "#979ea2");
    },
    thatch: function (rect, hh) {   // layers of golden straw
      rect(0, 0, 16, 16, "#c9a85a");
      for (var y = 0; y < 16; y += 3) { rect(0, y, 16, 1, "#e6cf86"); rect(0, y + 2, 16, 1, "#9a7a38"); }
      for (var k = 0; k < 22; k++) rect(Math.floor(hh(k, 1, 71) * 16), Math.floor(hh(k, 2, 72) * 15), 1, 2, hh(k, 3, 73) > 0.5 ? "#b8984a" : "#f0dc9a");
    },
    glass: function (rect) {   // see-through teal pane with a bright frame and shine
      rect(0, 0, 16, 16, "#7fe8d0", 0.22); rect(0, 0, 16, 1, "#bffff0", 0.9); rect(0, 15, 16, 1, "#2aa88a", 0.9); rect(0, 0, 1, 16, "#bffff0", 0.8); rect(15, 0, 1, 16, "#2aa88a", 0.8);
      rect(8, 0, 1, 16, "#4ee6b4", 0.45); rect(0, 8, 16, 1, "#4ee6b4", 0.45); rect(3, 2, 2, 1, "#fff", 0.85); rect(2, 3, 1, 3, "#fff", 0.7); rect(11, 10, 2, 1, "#fff", 0.6); rect(10, 11, 1, 2, "#fff", 0.5);
    },
    basaltbrick: function (rect, hh) {   // dark basalt bricks with faint hot cracks
      rect(0, 0, 16, 16, "#3b3036");
      [0, 5, 10].forEach(function (y, r) { rect(0, y, 16, 1, "#1e171b"); var jx = r % 2 ? 3 : 7; rect(jx, y + 1, 1, 4, "#1e171b"); rect(jx + 8 > 15 ? jx - 8 : jx + 8, y + 1, 1, 4, "#1e171b"); rect(0, y + 1, 16, 1, "#55444d", 0.7); });
      rect(0, 15, 16, 1, "#1e171b"); for (var k = 0; k < 5; k++) rect(Math.floor(hh(k, 1, 81) * 15), Math.floor(hh(k, 2, 82) * 15), 1, 1, "#ff8a3d", 0.55);
    },
    cinderlamp: function (rect) {   // iron-framed block with a glowing ember core
      rect(0, 0, 16, 16, "#2a2228"); rect(1, 1, 14, 14, "#3b3036"); rect(2, 2, 12, 12, "#c9461a"); rect(3, 3, 10, 10, "#ff8a3d"); rect(5, 5, 6, 6, "#ffc24a"); rect(7, 7, 2, 2, "#fff6c2");
      rect(1, 1, 2, 2, "#8e969b"); rect(13, 1, 2, 2, "#8e969b"); rect(1, 13, 2, 2, "#8e969b"); rect(13, 13, 2, 2, "#8e969b"); rect(8, 2, 1, 12, "#2a2228", 0.55); rect(2, 8, 12, 1, "#2a2228", 0.55);
    },
    icebrick: function (rect, hh) {   // pale blue ice bricks
      rect(0, 0, 16, 16, "#9fd8ef");
      [0, 5, 10].forEach(function (y, r) { rect(0, y, 16, 1, "#5d90aa"); var jx = r % 2 ? 3 : 7; rect(jx, y + 1, 1, 4, "#5d90aa"); rect(jx + 8 > 15 ? jx - 8 : jx + 8, y + 1, 1, 4, "#5d90aa"); rect(0, y + 1, 16, 1, "#e8fbff", 0.6); });
      rect(0, 15, 16, 1, "#5d90aa"); for (var k = 0; k < 6; k++) rect(Math.floor(hh(k, 1, 91) * 15), Math.floor(hh(k, 2, 92) * 15), 1, 1, "#fff", 0.6);
    },
    crystallamp: function (rect) {   // frostrock frame around a glowing crystal
      rect(0, 0, 16, 16, "#5d7c93"); rect(1, 1, 14, 14, "#7c9db4"); rect(2, 2, 12, 12, "#3f6f94"); rect(3, 3, 10, 10, "#7fd6ff"); rect(5, 4, 6, 8, "#bff4ff"); rect(7, 3, 2, 10, "#fff"); rect(6, 6, 1, 4, "#e8fbff");
      rect(1, 1, 2, 2, "#bff4ff"); rect(13, 1, 2, 2, "#bff4ff"); rect(1, 13, 2, 2, "#bff4ff"); rect(13, 13, 2, 2, "#bff4ff");
    },
    fountain: function (rect) {   // stone basin, pillar, upper bowl and a spray of water
      rect(1, 12, 14, 4, "#8a9094"); rect(1, 11, 14, 1, "#b3babe"); rect(1, 15, 14, 1, "#5d6468"); rect(3, 10, 10, 2, "#4fb6c9"); rect(4, 10, 3, 1, "#9fe8f5");
      rect(7, 4, 2, 7, "#8a9094"); rect(7, 4, 1, 7, "#b3babe"); rect(4, 4, 8, 2, "#8a9094"); rect(4, 4, 8, 1, "#b3babe"); rect(5, 3, 6, 1, "#7fd6e0");
      rect(7, 0, 2, 3, "#bff4ff", 0.85); rect(5, 5, 1, 4, "#9fe8f5", 0.75); rect(10, 5, 1, 4, "#9fe8f5", 0.75); rect(2, 13, 3, 1, "#3f8f3a"); rect(11, 14, 3, 1, "#3f8f3a");
    },
    well: function (rect) {   // stone ring, wooden posts and roof, a bucket on a rope
      rect(2, 10, 12, 6, "#7f868a"); rect(2, 10, 12, 1, "#a3aaae"); rect(2, 13, 12, 1, "#5d6468"); rect(7, 10, 1, 6, "#5d6468", 0.7); rect(4, 11, 8, 1, "#1f4f5a"); rect(5, 11, 6, 1, "#2a8f95");
      rect(3, 3, 1, 8, "#8a5a32"); rect(12, 3, 1, 8, "#8a5a32"); rect(2, 1, 12, 2, "#9a6234"); rect(2, 1, 12, 1, "#c98c4f"); rect(4, 0, 8, 1, "#c98c4f");
      rect(8, 3, 1, 5, "#c9b58a"); rect(7, 8, 3, 2, "#b9793f"); rect(7, 8, 3, 1, "#dc9a58");
    },
    cauldron: function (rect, hh, v) {   // iron cauldron of green brew over a little fire
      rect(5, 14, 6, 2, "#ff7a1f"); rect(6, 13, 4, 1, "#ffc43a"); rect(3, 13, 2, 3, "#2a2a30"); rect(11, 13, 2, 3, "#2a2a30");
      rect(2, 6, 12, 7, "#3a3a42"); rect(3, 5, 10, 1, "#4a4a54"); rect(2, 5, 12, 1, "#5a5a66"); rect(2, 6, 2, 7, "#4a4a54"); rect(12, 6, 2, 7, "#2a2a30"); rect(3, 12, 10, 1, "#2a2a30");
      rect(3, 4, 10, 2, "#4ee6b4"); rect(4, 4, 3, 1, "#9bfbe0"); rect(5, 2, 2, 2, "#9bfbe0", 0.9); rect(9, 3, 1, 1, "#d8fff6"); rect(8, 1, 1, 1, "#d8fff6", 0.8); rect(11, 2, 1, 1, "#9bfbe0", 0.7);
    },
    fence: function (rect) {   // posts at the sides with two rails across, so a row of fences joins up
      rect(0, 7, 16, 2, "#c98c4f"); rect(0, 7, 16, 1, "#e4aa6c"); rect(0, 8, 16, 1, "#8a5a32"); rect(0, 12, 16, 2, "#c98c4f"); rect(0, 12, 16, 1, "#e4aa6c"); rect(0, 13, 16, 1, "#8a5a32");
      rect(1, 4, 3, 12, "#a8703c"); rect(1, 3, 3, 1, "#dc9a58"); rect(1, 4, 1, 12, "#c98c4f"); rect(3, 4, 1, 12, "#6e431f"); rect(12, 4, 3, 12, "#a8703c"); rect(12, 3, 3, 1, "#dc9a58"); rect(12, 4, 1, 12, "#c98c4f"); rect(14, 4, 1, 12, "#6e431f");
    },
    bale: function (rect, hh) {   // a tied bale of dried reeds
      rect(1, 6, 14, 10, "#c9b36a"); rect(1, 6, 14, 1, "#e6d08a"); rect(1, 15, 14, 1, "#8a7a38"); rect(1, 6, 1, 10, "#a8964f"); rect(14, 6, 1, 10, "#a8964f");
      for (var k = 0; k < 16; k++) rect(2 + Math.floor(hh(k, 1, 101) * 12), 7 + Math.floor(hh(k, 2, 102) * 8), 2, 1, hh(k, 3, 103) > 0.5 ? "#dcc67a" : "#a8964f");
      rect(5, 6, 1, 10, "#8a5a32"); rect(10, 6, 1, 10, "#8a5a32"); rect(3, 5, 1, 1, "#c9b36a"); rect(9, 4, 1, 2, "#e6d08a"); rect(12, 5, 1, 1, "#c9b36a");
    },
    glowpot: function (rect) {   // a clay pot with a glowing mushroom
      rect(4, 10, 8, 6, "#c46a3c"); rect(3, 9, 10, 2, "#d9794a"); rect(3, 9, 10, 1, "#e48a5c"); rect(11, 11, 1, 5, "#8a4524");
      rect(7, 6, 2, 4, "#cfe3cb"); rect(4, 3, 8, 4, "#22a883"); rect(5, 2, 6, 1, "#4ee6b4"); rect(6, 4, 1, 1, "#d8fff6"); rect(9, 3, 1, 1, "#d8fff6"); rect(10, 5, 1, 1, "#d8fff6"); rect(3, 5, 1, 1, "#4ee6b4", 0.6);
    },
    wardrobe: function (rect) {   // a tall two-door wardrobe
      rect(2, 0, 12, 16, "#8a5328"); rect(1, 0, 14, 1, "#c98c4f"); rect(3, 2, 5, 12, "#a8703c"); rect(8, 2, 5, 12, "#a8703c"); rect(3, 2, 5, 1, "#c98c4f"); rect(8, 2, 5, 1, "#c98c4f"); rect(8, 1, 1, 14, "#3a200d");
      rect(5, 4, 1, 8, "#8a5a32"); rect(10, 4, 1, 8, "#8a5a32"); rect(7, 8, 1, 2, "#f2c14e"); rect(9, 8, 1, 2, "#f2c14e"); rect(2, 15, 2, 1, "#4a2c14"); rect(12, 15, 2, 1, "#4a2c14");
    },
    hearth: function (rect) {   // a stone fireplace with a roaring fire
      rect(1, 2, 14, 14, "#6b7276"); rect(0, 1, 16, 2, "#8e969b"); rect(0, 1, 16, 1, "#b3babe"); rect(1, 6, 14, 1, "#4d5256", 0.6); rect(1, 11, 14, 1, "#4d5256", 0.6);
      rect(4, 5, 8, 11, "#1a1416"); rect(5, 5, 6, 1, "#2a2228"); rect(6, 10, 4, 6, "#ff7a1f"); rect(7, 8, 2, 4, "#ffc43a"); rect(7, 11, 2, 4, "#fff6c2"); rect(5, 14, 6, 2, "#6a4426"); rect(5, 14, 6, 1, "#8a5a32"); rect(5, 12, 1, 2, "#ff7a1f", 0.8);
    },
    frogstatue: function (rect) {   // a stone frog on a plinth with glowing gem eyes
      rect(3, 12, 10, 4, "#8e969b"); rect(3, 12, 10, 1, "#b3babe"); rect(3, 15, 10, 1, "#5d6468");
      rect(4, 6, 8, 6, "#7f868a"); rect(4, 6, 8, 1, "#a3aaae"); rect(4, 4, 3, 3, "#7f868a"); rect(9, 4, 3, 3, "#7f868a"); rect(4, 4, 3, 1, "#a3aaae"); rect(9, 4, 3, 1, "#a3aaae");
      rect(5, 5, 1, 1, "#4ee6b4"); rect(10, 5, 1, 1, "#4ee6b4"); rect(6, 9, 4, 1, "#4d5256"); rect(3, 10, 2, 2, "#7f868a"); rect(11, 10, 2, 2, "#7f868a"); rect(7, 7, 2, 1, "#a3aaae", 0.6);
    },
    brazier: function (rect) {   // an iron bowl blazing with fire
      rect(4, 12, 2, 4, "#2a2228"); rect(10, 12, 2, 4, "#2a2228"); rect(7, 13, 2, 3, "#2a2228"); rect(3, 9, 10, 3, "#3b3036"); rect(2, 8, 12, 1, "#55444d"); rect(3, 9, 10, 1, "#ff8a3d", 0.7);
      rect(4, 3, 8, 5, "#ff6a1f"); rect(5, 1, 6, 4, "#ffa133"); rect(6, 0, 4, 3, "#ffd86a"); rect(7, 4, 2, 4, "#fff1b0"); rect(3, 5, 1, 3, "#ff6a1f", 0.8); rect(12, 4, 1, 3, "#ff6a1f", 0.8); rect(2, 3, 1, 1, "#ffc24a", 0.7); rect(13, 2, 1, 1, "#ffc24a", 0.7);
    },
    guardian: function (rect) {   // a basalt knight statue with ember eyes and a seam of lava
      rect(3, 13, 10, 3, "#2a2228"); rect(3, 13, 10, 1, "#55444d"); rect(5, 6, 6, 8, "#3b3036"); rect(3, 6, 10, 2, "#55444d"); rect(3, 6, 10, 1, "#6b5560");
      rect(6, 2, 4, 4, "#3b3036"); rect(6, 2, 4, 1, "#55444d"); rect(7, 1, 2, 1, "#ff8a3d"); rect(6, 4, 1, 1, "#ff8a3d"); rect(9, 4, 1, 1, "#ff8a3d"); rect(7, 9, 2, 1, "#ff8a3d"); rect(7, 11, 2, 1, "#ff8a3d", 0.7);
      rect(12, 5, 1, 9, "#9aa0ac"); rect(11, 8, 3, 1, "#ff8a3d"); rect(12, 4, 1, 1, "#e8ecf2"); rect(3, 8, 2, 5, "#2a2228");
    },
    emberlantern: function (rect) {   // an iron-caged lantern full of embers
      rect(7, 0, 2, 2, "#2a2228"); rect(4, 2, 8, 1, "#3b3036"); rect(4, 2, 8, 10, "#2a2228"); rect(5, 3, 6, 8, "#ff8a3d"); rect(6, 4, 4, 6, "#ffc24a"); rect(7, 6, 2, 3, "#fff6c2"); rect(5, 3, 1, 8, "#ffb067", 0.7);
      rect(8, 3, 1, 8, "#2a2228", 0.6); rect(4, 12, 8, 1, "#55444d"); rect(5, 13, 6, 3, "#3b3036"); rect(5, 13, 6, 1, "#55444d");
    },
    urn: function (rect) {   // a tall ash-grey urn with glowing ember bands
      rect(4, 5, 8, 10, "#8a7a72"); rect(5, 4, 6, 1, "#8a7a72"); rect(6, 2, 4, 3, "#8a7a72"); rect(5, 2, 6, 1, "#a89990"); rect(5, 15, 6, 1, "#5d524c"); rect(4, 14, 8, 1, "#6f625b");
      rect(4, 8, 8, 1, "#ff8a3d"); rect(4, 11, 8, 1, "#ff8a3d", 0.7); rect(5, 5, 1, 9, "#fff", 0.2); rect(10, 5, 1, 9, "#000", 0.2); rect(7, 9, 2, 1, "#ffc24a");
    },
    anvil: function (rect) {   // a blackened anvil with a hot top
      rect(0, 6, 3, 1, "#4a4a54"); rect(2, 6, 12, 2, "#4a4a54"); rect(2, 6, 12, 1, "#6a6a78"); rect(13, 7, 2, 1, "#4a4a54"); rect(5, 8, 6, 3, "#3a3a42"); rect(3, 11, 10, 3, "#2a2a30"); rect(2, 14, 12, 2, "#55444d"); rect(2, 14, 12, 1, "#6b5560");
      rect(5, 6, 6, 1, "#ff8a3d"); rect(7, 5, 2, 1, "#ffc24a"); rect(9, 3, 1, 1, "#ffc24a", 0.8); rect(5, 2, 1, 1, "#ff8a3d", 0.7);
    },
    icesculpt: function (rect) {   // a cluster of ice shards on a frozen base
      rect(4, 13, 8, 3, "#7c9db4"); rect(4, 13, 8, 1, "#9fd8ef"); rect(7, 1, 3, 12, "#bff4ff"); rect(8, 0, 1, 1, "#fff"); rect(7, 2, 1, 9, "#fff", 0.55); rect(4, 5, 3, 8, "#9fd8ef"); rect(5, 4, 1, 1, "#e8fbff"); rect(10, 7, 3, 6, "#7fd6ff"); rect(11, 6, 1, 1, "#e8fbff");
      rect(3, 11, 1, 2, "#9fd8ef", 0.8); rect(13, 10, 1, 3, "#7fd6ff", 0.8);
    },
    frostlantern: function (rect) {   // a crystal lantern with a cold blue flame
      rect(7, 0, 2, 2, "#5d7c93"); rect(4, 2, 8, 1, "#7c9db4"); rect(4, 2, 8, 10, "#5d7c93"); rect(5, 3, 6, 8, "#7fd6ff"); rect(6, 4, 4, 6, "#bff4ff"); rect(7, 6, 2, 3, "#fff"); rect(5, 3, 1, 8, "#e8fbff", 0.6);
      rect(8, 3, 1, 8, "#5d7c93", 0.6); rect(4, 12, 8, 1, "#9fd8ef"); rect(5, 13, 6, 3, "#7c9db4"); rect(5, 13, 6, 1, "#bff4ff");
    },
    throne: function (rect) {   // a throne carved from Frostrock with crystal spikes and a gem
      rect(3, 0, 10, 12, "#5d7c93"); rect(4, 1, 8, 9, "#7c9db4"); rect(3, 0, 2, 2, "#bff4ff"); rect(11, 0, 2, 2, "#bff4ff"); rect(7, 0, 2, 1, "#e8fbff");
      rect(7, 3, 2, 3, "#7fd6ff"); rect(7, 3, 1, 1, "#fff"); rect(6, 6, 4, 1, "#bff4ff", 0.7); rect(2, 10, 12, 3, "#9fd8ef"); rect(2, 10, 12, 1, "#e8fbff"); rect(1, 8, 2, 8, "#5d7c93"); rect(13, 8, 2, 8, "#5d7c93"); rect(1, 8, 2, 1, "#bff4ff"); rect(13, 8, 2, 1, "#bff4ff");
      rect(3, 13, 2, 3, "#5d7c93"); rect(11, 13, 2, 3, "#5d7c93"); rect(4, 10, 8, 1, "#fff", 0.3);
    },
    sconce: function (rect) {   // an iron bracket holding a teal Glowspore flame
      rect(6, 10, 4, 2, "#4a4a52"); rect(7, 7, 2, 4, "#4a4a52"); rect(5, 6, 6, 2, "#6e431f"); rect(5, 6, 6, 1, "#8a5a32");
      rect(6, 2, 4, 4, "#4ee6b4"); rect(7, 1, 2, 2, "#9bfbe0"); rect(7, 3, 2, 2, "#e6fff8"); rect(5, 4, 1, 1, "#4ee6b4", 0.6); rect(10, 3, 1, 1, "#4ee6b4", 0.6);
    },
    bugtrophy: function (rect) {   // a wooden plaque with a mounted Bramble Bug
      rect(2, 2, 12, 12, "#8a5328"); rect(2, 2, 12, 1, "#c98c4f"); rect(3, 3, 10, 10, "#3a200d");
      rect(5, 6, 6, 4, "#9a52a8"); rect(5, 6, 6, 1, "#c68cd0"); rect(4, 7, 2, 2, "#7a3a88"); rect(4, 7, 1, 1, "#ff6b82"); rect(6, 5, 4, 1, "#c68cd0", 0.8); rect(5, 10, 1, 2, "#4a2c14"); rect(7, 10, 1, 2, "#4a2c14"); rect(9, 10, 1, 2, "#4a2c14"); rect(3, 3, 1, 1, "#f2c14e"); rect(12, 12, 1, 1, "#f2c14e");
    },
    frogtrophy: function (rect) {   // a wooden plaque with a mounted Swamp Frog
      rect(2, 2, 12, 12, "#8a5328"); rect(2, 2, 12, 1, "#c98c4f"); rect(3, 3, 10, 10, "#3a200d");
      rect(5, 7, 6, 4, "#6fe08a"); rect(5, 7, 6, 1, "#a8f5ba"); rect(5, 5, 2, 2, "#6fe08a"); rect(9, 5, 2, 2, "#6fe08a"); rect(6, 5, 1, 1, "#f2c14e"); rect(9, 5, 1, 1, "#f2c14e"); rect(6, 9, 4, 1, "#2a8f4a"); rect(4, 10, 2, 2, "#6fe08a"); rect(10, 10, 2, 2, "#6fe08a"); rect(3, 3, 1, 1, "#f2c14e"); rect(12, 12, 1, 1, "#f2c14e");
    },
    emberbanner: function (rect) {   // a rust-red banner with a golden flame
      rect(2, 1, 12, 1, "#8a5a32"); rect(1, 0, 1, 3, "#c98c4f"); rect(14, 0, 1, 3, "#c98c4f"); rect(3, 2, 10, 10, "#c9461a"); rect(3, 2, 10, 1, "#ff8a3d"); rect(3, 2, 1, 10, "#8a2a0e"); rect(12, 2, 1, 10, "#8a2a0e");
      rect(4, 12, 8, 1, "#c9461a"); rect(5, 13, 6, 1, "#c9461a"); rect(6, 14, 4, 1, "#c9461a"); rect(7, 15, 2, 1, "#c9461a");
      rect(7, 4, 2, 6, "#ffd86a"); rect(6, 6, 1, 3, "#ffa133"); rect(9, 6, 1, 3, "#ffa133"); rect(7, 3, 2, 1, "#fff1b0");
    },
    chandelier: function (rect) {   // a hanging ring of Frost Crystals and candle flames
      rect(7, 0, 2, 3, "#9aa0ac"); rect(1, 3, 14, 2, "#5d7c93"); rect(1, 3, 14, 1, "#9fd8ef"); rect(0, 4, 1, 1, "#5d7c93"); rect(15, 4, 1, 1, "#5d7c93");
      rect(2, 1, 1, 2, "#fff2b0"); rect(2, 0, 1, 1, "#ffd86a"); rect(13, 1, 1, 2, "#fff2b0"); rect(13, 0, 1, 1, "#ffd86a"); rect(5, 2, 1, 1, "#fff2b0"); rect(10, 2, 1, 1, "#fff2b0");
      rect(2, 5, 2, 4, "#bff4ff"); rect(2, 5, 1, 4, "#fff"); rect(5, 5, 2, 6, "#7fd6ff"); rect(5, 5, 1, 6, "#e8fbff"); rect(7, 5, 2, 9, "#bff4ff"); rect(7, 5, 1, 9, "#fff"); rect(10, 5, 2, 6, "#7fd6ff"); rect(10, 5, 1, 6, "#e8fbff"); rect(12, 5, 2, 4, "#bff4ff"); rect(12, 5, 1, 4, "#fff");
    },
    frostbanner: function (rect) {   // a deep-blue banner with a white snowflake
      rect(2, 1, 12, 1, "#8a5a32"); rect(1, 0, 1, 3, "#c98c4f"); rect(14, 0, 1, 3, "#c98c4f"); rect(3, 2, 10, 10, "#3a7fa8"); rect(3, 2, 10, 1, "#7fd6ff"); rect(3, 2, 1, 10, "#245a7a"); rect(12, 2, 1, 10, "#245a7a");
      rect(4, 12, 8, 1, "#3a7fa8"); rect(5, 13, 6, 1, "#3a7fa8"); rect(6, 14, 4, 1, "#3a7fa8"); rect(7, 15, 2, 1, "#3a7fa8");
      rect(7, 3, 2, 8, "#e8fbff"); rect(4, 6, 8, 2, "#e8fbff"); [[5, 4], [6, 5], [9, 5], [10, 4], [5, 9], [6, 8], [9, 8], [10, 9]].forEach(function (q) { rect(q[0], q[1], 1, 1, "#e8fbff"); }); rect(7, 6, 2, 2, "#7fd6ff");
    }
  };
  if (typeof SbxExtra !== "undefined") Object.assign(DECOR_ART, SbxExtra.ART);
  function paint(g, td, v, oy) {
    var id = td.id, ox = v * 16, kind = td.kind, hh = function (x, y, s) { return SW.hash(x + v * 16, y + id * 31, s + id); };
    var rect = function (x, y, w, h, c, a) { g.globalAlpha = a == null ? 1 : a; g.fillStyle = c; g.fillRect(ox + x, oy + y, w, h); g.globalAlpha = 1; };
    var x, y, k;
    if (id === T.AIR || id === T.WATER || id === T.LAVA) return;
    if (kind === "wall") { paintWall(rect, hh, id, v); return; }
    if (kind === "torch") { rect(7, 6, 2, 10, "#6a4426"); rect(7, 6, 1, 10, "#8a5a32"); rect(6, 2, 4, 5, "#ff7a1f"); rect(7, 1, 2, 3, "#ffc43a"); rect(7, 4, 2, 2, "#fff6c2"); rect(5, 5, 1, 1, "#ffb13b", 0.6); rect(10, 4, 1, 1, "#ffb13b", 0.6); return; }
    if (kind === "bench") {   // four looks, one per Workbench level (see BENCH_LV)
      var bL = benchLv, bTop = ["", "#c98c4f", "#c98c4f", "#3b3036", "#9fd8ef"][bL], bHi = ["", "#e4aa6c", "#7ff5d0", "#55444d", "#e8fbff"][bL], bLo = ["", "#6e431f", "#1f8f78", "#ff8a3d", "#5d7c93"][bL], bLeg = ["", "#8a5a32", "#8a5a32", "#4a3a40", "#7c9db4"][bL], bLegHi = ["", "#a8703c", "#4ee6b4", "#6b5560", "#bff4ff"][bL];
      rect(1, 7, 14, 3, bTop); rect(1, 7, 14, 1, bHi); rect(1, 10, 14, 1, bLo); rect(2, 11, 2, 5, bLeg); rect(12, 11, 2, 5, bLeg); rect(2, 11, 1, 5, bLegHi); rect(3, 13, 10, 1, bLo, 0.8);
      if (bL === 1) {
        rect(3, 5, 7, 2, "#3f8f3a"); rect(4, 4, 5, 1, "#5fb24a"); rect(4, 5, 2, 1, "#9be062"); rect(9, 5, 1, 2, "#2a6a2a");
        rect(11, 2, 1, 5, "#8a5a32"); rect(10, 2, 3, 1, "#c9b58a"); rect(6, 2, 2, 2, "#ff8fc0"); rect(6, 2, 1, 1, "#ffd0e6");
      } else if (bL === 2) {   // glowing Glowspore gems and a teal trim
        rect(3, 4, 2, 3, "#4ee6b4"); rect(3, 3, 2, 1, "#bffff0"); rect(7, 5, 2, 2, "#22a883"); rect(7, 4, 2, 1, "#4ee6b4"); rect(11, 3, 2, 4, "#4ee6b4"); rect(11, 2, 1, 1, "#d8fff6"); rect(9, 6, 1, 1, "#9bfbe0"); rect(5, 8, 1, 1, "#d8fff6"); rect(10, 8, 1, 1, "#d8fff6");
      } else if (bL === 3) {   // a dark basalt forge top with a lava seam and an anvil
        rect(6, 8, 4, 1, "#ff8a3d"); rect(3, 8, 1, 1, "#ffc24a"); rect(12, 8, 1, 1, "#ffc24a"); rect(4, 5, 8, 2, "#2a2228"); rect(5, 4, 6, 1, "#55444d"); rect(6, 3, 4, 1, "#3b3036"); rect(7, 5, 2, 1, "#ff8a3d"); rect(7, 4, 1, 1, "#ffc24a"); rect(12, 3, 1, 4, "#4a3a40"); rect(12, 2, 1, 1, "#ff8a3d");
      } else {   // frozen top with sprouting Frost Crystals
        rect(3, 3, 2, 4, "#bff4ff"); rect(3, 2, 1, 1, "#ffffff"); rect(6, 4, 2, 3, "#7fd6ff"); rect(6, 3, 1, 1, "#e8fbff"); rect(10, 1, 2, 6, "#bff4ff"); rect(10, 0, 1, 1, "#ffffff"); rect(13, 4, 1, 3, "#7fd6ff"); rect(5, 8, 1, 1, "#ffffff"); rect(9, 8, 1, 1, "#ffffff");
      }
      return;
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
    if (kind === "flower") {   // three stems with blooms; the colour comes from the variant (pink, yellow, blue, lilac)
      var FP = [["#ff6fb5", "#ffd1ea"], ["#ffd23f", "#fff2a8"], ["#6aa8ff", "#d3e6ff"], ["#c08cff", "#ece0ff"]][v & 3];
      [[4, 7, 0], [8, 10, 1], [12, 6, 2]].forEach(function (f) {
        var fx = f[0], fh = f[1], top = 16 - fh, pc2 = f[2] === 1 ? FP[0] : f[2] === 0 ? FP[1] : FP[0];
        rect(fx, top + 2, 1, fh - 2, "#3f8f3a"); rect(fx, top + 6, 1, fh - 6, "#2a6a2a", 0.6); rect(fx - 2 + (f[2] === 1 ? 0 : 1), top + 7, 2, 1, "#5fb24a"); rect(fx + 1, top + 9, 2, 1, "#5fb24a");
        rect(fx - 1, top, 3, 3, pc2); rect(fx, top - 1, 1, 1, pc2); rect(fx, top + 3, 1, 1, pc2); rect(fx, top + 1, 1, 1, "#ffe27a"); rect(fx - 1, top, 1, 1, "#fff", 0.45);
      }); return;
    }
    if (kind === "bucket") {   // a stave bucket with iron bands, a bail handle and a little water
      rect(3, 3, 1, 5, "#9aa0ac"); rect(12, 3, 1, 5, "#9aa0ac"); rect(3, 3, 10, 1, "#9aa0ac"); rect(4, 2, 8, 1, "#c9ced8");
      rect(3, 7, 10, 1, "#6e431f"); rect(4, 8, 8, 7, "#b9793f"); rect(4, 8, 8, 1, "#5fd0cf"); rect(5, 8, 3, 1, "#c8fffb"); rect(4, 9, 1, 6, "#dc9a58"); rect(11, 9, 1, 6, "#8a5a32");
      rect(7, 9, 1, 6, "#8a5a32"); rect(9, 9, 1, 6, "#8a5a32"); rect(4, 10, 8, 1, "#4a4a52"); rect(4, 13, 8, 1, "#4a4a52"); rect(4, 15, 8, 1, "#6e431f"); return;
    }
    if (kind === "pot") {   // a round terracotta pot with a gold zigzag band
      [[5, 6], [4, 8], [3, 10], [3, 10], [3, 10], [4, 8], [4, 8], [5, 6]].forEach(function (r2, k2) { rect(r2[0], 7 + k2, r2[1], 1, "#c46a3c"); rect(r2[0], 7 + k2, 1, 1, "#e48a5c"); rect(r2[0] + r2[1] - 1, 7 + k2, 1, 1, "#8a4524"); });
      rect(5, 5, 6, 2, "#d9794a"); rect(5, 5, 6, 1, "#f09a6a"); rect(6, 6, 4, 1, "#2a1408");
      [4, 6, 8, 10].forEach(function (zx, zi) { rect(zx, 10 + (zi % 2), 2, 1, "#f2c14e"); }); rect(5, 15, 6, 1, "#6e3418"); return;
    }
    if (kind === "flowerpot") {   // a small pot with soil and one bloom (colour from the variant)
      var FQ = [["#ff6fb5", "#ffd1ea"], ["#ffd23f", "#fff2a8"], ["#6aa8ff", "#d3e6ff"], ["#c08cff", "#ece0ff"]][v & 3];
      [[3, 10], [4, 8], [4, 8], [5, 6], [5, 6], [5, 6]].forEach(function (r2, k2) { rect(r2[0], 10 + k2, r2[1], 1, "#c46a3c"); rect(r2[0], 10 + k2, 1, 1, "#e48a5c"); rect(r2[0] + r2[1] - 1, 10 + k2, 1, 1, "#8a4524"); });
      rect(3, 10, 10, 2, "#d9794a"); rect(3, 10, 10, 1, "#f09a6a"); rect(4, 9, 8, 1, "#3a2a1a");
      rect(7, 4, 1, 5, "#3f8f3a"); rect(5, 6, 2, 1, "#5fb24a"); rect(8, 5, 2, 1, "#5fb24a");
      rect(5, 1, 5, 3, FQ[0]); rect(6, 0, 3, 5, FQ[0]); rect(7, 1, 1, 3, "#ffe27a"); rect(5, 1, 1, 1, FQ[1]); rect(6, 0, 1, 1, FQ[1]); return;
    }
    if (kind === "barrel") {   // a banded wooden barrel with a brass tap
      rect(4, 3, 8, 1, "#8a5a32"); rect(3, 4, 10, 11, "#9a6234"); rect(4, 15, 8, 1, "#6e431f"); rect(4, 4, 1, 11, "#c98c4f"); rect(11, 4, 1, 11, "#6e431f");
      rect(6, 4, 1, 11, "#6e431f", 0.7); rect(9, 4, 1, 11, "#6e431f", 0.7); rect(3, 6, 10, 1, "#4a4a52"); rect(3, 12, 10, 1, "#4a4a52"); rect(3, 6, 10, 1, "#9aa0ac", 0.25);
      rect(10, 9, 3, 1, "#f2c14e"); rect(12, 9, 1, 2, "#a8740a"); rect(4, 3, 8, 1, "#a8703c"); return;
    }
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
    if (kind === "decorbench") {   // a work table with a teal cloth runner, paint pots, a brush and a chisel
      rect(1, 8, 14, 3, "#c98c4f"); rect(1, 8, 14, 1, "#e4aa6c"); rect(1, 11, 14, 1, "#6e431f"); rect(2, 12, 2, 4, "#8a5a32"); rect(12, 12, 2, 4, "#8a5a32"); rect(2, 12, 1, 4, "#a8703c"); rect(4, 14, 8, 1, "#6e431f", 0.8);
      rect(4, 8, 8, 3, "#22a883"); rect(4, 8, 8, 1, "#4ee6b4"); rect(4, 10, 8, 1, "#1a8a6c");
      rect(2, 5, 3, 3, "#e8541a"); rect(2, 5, 3, 1, "#ff8a3d"); rect(6, 6, 3, 2, "#8d63c9"); rect(6, 6, 3, 1, "#b58cff");
      rect(11, 2, 1, 6, "#8a5a32"); rect(10, 1, 3, 2, "#f2c14e"); rect(13, 4, 1, 4, "#9aa0ac"); rect(13, 3, 1, 1, "#e4aa6c"); return;
    }
    if (kind === "stool") {
      rect(4, 8, 8, 2, "#c98c4f"); rect(4, 8, 8, 1, "#e4aa6c"); rect(4, 10, 8, 1, "#6e431f"); rect(5, 11, 2, 5, "#8a5a32"); rect(5, 11, 1, 5, "#a8703c"); rect(9, 11, 2, 5, "#8a5a32"); rect(6, 13, 4, 1, "#6e431f"); rect(5, 7, 6, 1, "#b58cff", 0.0); return;
    }
    if (kind === "rug") {   // flat woven rug with gold edges and fringe
      rect(1, 12, 14, 4, "#6b3fa0"); rect(1, 12, 14, 1, "#8d63c9"); rect(3, 13, 10, 2, "#22a883"); rect(3, 13, 10, 1, "#4ee6b4"); rect(2, 12, 1, 4, "#f2c14e"); rect(13, 12, 1, 4, "#f2c14e"); rect(7, 13, 2, 2, "#f2c14e"); rect(0, 13, 1, 2, "#e4d7a8"); rect(15, 13, 1, 2, "#e4d7a8"); return;
    }
    if (kind === "bookshelf") {
      rect(1, 0, 14, 16, "#8a5328"); rect(2, 1, 12, 14, "#3a200d"); rect(2, 5, 12, 1, "#a8703c"); rect(2, 10, 12, 1, "#a8703c"); rect(1, 15, 14, 1, "#6e431f"); rect(1, 0, 14, 1, "#c98c4f");
      var BK = ["#e8541a", "#4ee6b4", "#8d63c9", "#f2c14e", "#2a8f95", "#ff8fc0", "#5fb24a", "#7fd6ff"];
      [[1, 4], [6, 4], [11, 4]].forEach(function (rw, ri) { for (var bx = 2; bx < 14; bx += 2) { var bh = 3 - (hh(bx, ri, 4) > 0.6 ? 1 : 0), bc = BK[Math.floor(hh(bx, ri, 5) * BK.length)]; rect(bx, rw[0] + rw[1] - bh, 2, bh, bc); rect(bx, rw[0] + rw[1] - bh, 1, bh, "#fff", 0.25); } });
      return;
    }
    if (kind === "lantern") {   // clay pot base, glass lamp with a flame
      rect(5, 12, 6, 4, "#c46a3c"); rect(5, 12, 6, 1, "#e48a5c"); rect(10, 12, 1, 4, "#8a4524"); rect(6, 10, 4, 2, "#d9794a");
      rect(5, 2, 6, 8, "#6e431f"); rect(6, 3, 4, 6, "#ffcf5a"); rect(7, 4, 2, 4, "#fff6c2"); rect(5, 1, 6, 1, "#8a5a32"); rect(7, 0, 2, 1, "#6e431f"); rect(6, 3, 1, 6, "#fff", 0.25); return;
    }
    if (kind === "banner") {
      rect(2, 1, 12, 1, "#8a5a32"); rect(1, 0, 1, 3, "#c98c4f"); rect(14, 0, 1, 3, "#c98c4f"); rect(3, 2, 10, 10, "#22a883"); rect(3, 2, 10, 1, "#4ee6b4"); rect(3, 2, 1, 10, "#1a8a6c"); rect(12, 2, 1, 10, "#1a8a6c");
      rect(4, 12, 8, 1, "#22a883"); rect(5, 13, 6, 1, "#22a883"); rect(6, 14, 4, 1, "#22a883"); rect(7, 15, 2, 1, "#22a883");
      rect(7, 4, 2, 6, "#f2c14e"); rect(6, 6, 1, 2, "#f2c14e"); rect(9, 6, 1, 2, "#f2c14e"); rect(7, 3, 2, 1, "#fff2b0"); return;
    }
    if (kind === "sign") {
      rect(4, 0, 1, 4, "#c9b58a"); rect(11, 0, 1, 4, "#c9b58a"); rect(1, 4, 14, 8, "#c98c4f"); rect(1, 4, 14, 1, "#e4aa6c"); rect(1, 11, 14, 1, "#6e431f"); rect(1, 4, 1, 8, "#a8703c"); rect(14, 4, 1, 8, "#8a5a32");
      rect(3, 6, 8, 1, "#3a200d"); rect(3, 8, 10, 1, "#3a200d"); rect(12, 6, 1, 1, "#3f8f3a"); rect(3, 10, 5, 1, "#3a200d", 0.7); return;
    }
    if (kind === "planter") {   // a barrel overflowing with flowers (colours vary by spot)
      var FR = [["#ff6fb5", "#ffd1ea"], ["#ffd23f", "#fff2a8"], ["#6aa8ff", "#d3e6ff"], ["#c08cff", "#ece0ff"]][v & 3];
      rect(2, 9, 12, 7, "#9a6234"); rect(2, 9, 12, 1, "#c98c4f"); rect(2, 9, 1, 7, "#c98c4f"); rect(13, 9, 1, 7, "#6e431f"); rect(2, 12, 12, 1, "#4a4a52"); rect(2, 15, 12, 1, "#6e431f");
      rect(2, 6, 12, 3, "#3f8f3a"); rect(3, 5, 10, 1, "#5fb24a"); rect(4, 4, 2, 2, FR[0]); rect(4, 4, 1, 1, FR[1]); rect(8, 2, 2, 3, FR[0]); rect(8, 2, 1, 1, FR[1]); rect(11, 4, 2, 2, FR[0]); rect(6, 5, 1, 1, "#ffe27a"); rect(10, 5, 1, 1, "#ffe27a"); return;
    }
    if (kind === "campfire") {
      rect(2, 14, 12, 2, "#6b7276"); rect(2, 14, 12, 1, "#8e969b"); rect(3, 13, 2, 1, "#8e969b"); rect(11, 13, 2, 1, "#8e969b");
      rect(3, 12, 10, 2, "#6a4426"); rect(4, 11, 8, 1, "#8a5a32"); rect(5, 12, 6, 1, "#3a200d");
      rect(6, 5, 4, 7, "#ff7a1f"); rect(7, 3, 2, 4, "#ffc43a"); rect(7, 7, 2, 4, "#fff6c2"); rect(5, 8, 1, 3, "#ff7a1f"); rect(10, 8, 1, 3, "#ff7a1f"); rect(4, 6, 1, 1, "#ffb13b", 0.7); rect(11, 5, 1, 1, "#ffb13b", 0.7); return;
    }
    if (DECOR_ART[kind]) { DECOR_ART[kind](rect, hh, v); return; }
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
  // ---------- PIXEL TOOL ART ----------
  // Every tool, pack and the bare paws are 16x16 pixel sprites (same chunky look as the avatars). "r" holds rows of colour letters for the art only;
  // the dark outline ("o") is added automatically around it. Held tools, hotbar icons and Craft cards all use these same sprites.
  // Grip is bottom-left and the working end is top-right, so every tool sits in the paw the same way. Edit a sprite by changing its rows.
  var SPR = {
    "paw": { r: ["................", "................", "..bb..bb..bb.bb.", ".bahb.baab.baab.", ".baab.baab.baab.", "..bb...bb...bb..", "................", "....cccccccc....", "...chhaaaaaac...", "..caaaaaaaaaac..", "..caaaaaaaaaac..", "..caaaaaaaaaac..", "...caaaaaaaac...", "....cccccccc....", "................", "................"], p: {"a": "#8fd37a", "b": "#7bc66a", "c": "#4f9a45", "h": "#d4f7bf"}, o: "#1b3d19" },
    "pick1": { r: ["................", "................", "...bbbbb........", "..bbaacaabb.....", ".bbaa....acbb...", ".ba.......aaabb.", ".a.........aaab.", "...........aaac.", "..........hdaac.", ".........llh.c..", "........lel.....", ".......hdh......", "......hdh.......", ".....hdh........", "....hdh.........", "...hdh.........."], p: {"h": "#d8c48e", "H": "#f4e8bf", "d": "#a8905a", "a": "#8e969b", "b": "#c9cfd2", "c": "#5d666b", "l": "#4f8a3c", "e": "#8fd37a"}, o: "#1e1c18" },
    "pick2": { r: ["................", "..............e.", "...bbbbe..e.....", "..bbeaaabbb.....", ".bbaa....aaeb...", ".ba.......aaabb.", ".a.........aeab.", "...........aaac.", "..........hdaac.", ".........edh.c..", "........hdh.....", ".......hdh......", "......heh.......", ".....edh........", "....hdh.........", "...hdh.........."], p: {"h": "#6b4a30", "H": "#8a6440", "d": "#3a2616", "a": "#1fbf93", "b": "#9bfbe0", "c": "#0b7a5e", "e": "#e6fff8"}, o: "#06231c" },
    "pick3": { r: ["................", "................", "...bbbbb.....e..", "..bbaaaabbb.....", ".bblle...eabb...", ".ba.......laabb.", ".a.........eaab.", "...........alac.", "..........hdaac.", ".........hdh.c..", "........hdh.....", ".......hdh......", "......hdl.......", ".....hlh........", "....hdh.........", "...hdh.........."], p: {"h": "#3a2e34", "H": "#5a464e", "d": "#1c1418", "a": "#4a3c44", "b": "#6e5c66", "c": "#2a2026", "l": "#ff6a1f", "e": "#ffc24a"}, o: "#0c070a" },
    "pick4": { r: ["............e.e.", ".............e..", "...bbbbb......e.", "..beeaaabbb.....", ".bbaae...aabb...", ".ba.......aaebb.", ".a.........aaab.", "...........aaac.", "..........hdaac.", ".e.......hdh.c..", "e.e.....hdh.....", ".e.....hdh......", "......heh.......", ".....hdh........", "....hdh.........", "...hdh.........."], p: {"h": "#bfe9f7", "H": "#ffffff", "d": "#7fcfe8", "a": "#7fd6ff", "b": "#e6fbff", "c": "#3f9fc4", "e": "#ffffff"}, o: "#16465e" },
    "shovel": { r: ["................", "............bbbb", "..........bwwaab", ".........bwaagac", "........bwaagaac", "........bwagaac.", "........bagac...", "........bgc.....", ".......lel......", "......lel.......", ".....hd.........", "....hd..........", "...ld...........", "..hd............", ".ld.............", "kkd............."], p: {"h": "#e0cd96", "d": "#a8905a", "a": "#a3abb0", "b": "#dfe5e8", "c": "#5f686d", "g": "#7b848a", "l": "#4f8a3c", "e": "#8fd37a", "k": "#d8b24a", "w": "#ffffff"}, o: "#1e1c18" },
    "wpn1": {r: ["...............b", ".............bwa", "...........bwaac", "..........bwaac.", ".........bwaac..", "........bwac....", ".......lele.....", "......lele......", "......hd.fg.....", ".....hd.fgf.....", "....ld..ff......", "...hd..f........", "..ld............", ".hd.............", "hh..............", "................"], p: {"h": "#e0cd96", "d": "#a8905a", "a": "#a7b0b5", "b": "#e4eaed", "c": "#5d666b", "l": "#4f8a3c", "e": "#8fd37a", "f": "#d8573c", "g": "#ffb35a", "w": "#ffffff"}, o: "#1e1c18"},
    "wpn2": { r: ["..............bb", ".............bab", "............beac", "...........beac.", "..........beac..", ".........beac...", "....g...beac....", ".....g.beac.....", "...x..gggc......", ".......ggg......", "......hdg.g.....", ".....hdh........", "....hdh.........", "...ppp..........", "................", "................"], p: {"h": "#5a3d26", "d": "#3a2616", "a": "#1fbf93", "b": "#9bfbe0", "c": "#0b7a5e", "g": "#4ee6b4", "e": "#e6fff8", "p": "#2a1a0e", "x": "#4ee6b4"}, o: "#06231c" },
    "wpn3": { r: ["................", "...........bbwb.", "..........blaaac", ".........beaaaac", "........blaaaac.", ".......blaaaac..", "...g...bleaac...", "....g.gbaaac....", ".....gggaac.....", "....hggg.c......", "...ldh.g........", "..ldh...........", ".ldh............", ".hh.............", "................", "................"], p: {"h": "#4a3a40", "d": "#241a1e", "a": "#4a3c44", "b": "#7a6872", "c": "#2a2026", "g": "#ff8a3d", "l": "#ff6a1f", "e": "#ffd25a", "w": "#ffd25a"}, o: "#0c070a" },
    "wpn4": { r: [".............wwb", ".............baw", "............bwac", "...........bwac.", "..........bwacc.", "..x.g....bwaac..", "...x.g..bwac.c..", "......ggbac.....", ".......ggc......", "......hdg.g.....", ".....hdh........", "....hdh.........", "...hdh..........", "...hh...........", "................", "................"], p: {"h": "#bfe9f7", "d": "#7fcfe8", "a": "#7fd6ff", "b": "#e6fbff", "c": "#3f9fc4", "g": "#e6fbff", "w": "#ffffff", "x": "#ffffff"}, o: "#16465e" },
    "can": { r: ["................", "..............bb", ".............bwb", "............ab.c", "...hhhh....aa...", "..hdddh...aa....", "..ha..hhh.a.....", ".hh.bwwbbbaa....", ".h..awaaaaaa....", ".h..awaaaaac....", ".hd.awaaaaac....", "..hdaaaaaaac....", "...cccccccc.....", "................", "................", "................"], p: {"h": "#2f7ea6", "d": "#1d4a63", "a": "#4f9fc4", "b": "#8fd3ef", "c": "#2f7ea6", "w": "#cdeeff"}, o: "#10303f" },
    "bag1": { r: ["................", "......bbbb......", ".....bffffb.....", "....bffffffb....", "....bbbbbbbb....", "...saaaaaaaas...", "...saaaggaaas...", "...saaagggaas...", "...saaaaaaaas...", "...saadadadaas..", "...saaaaaaaas...", "...saaaaaaaas...", "....cccccccc....", "................", "................", "................"], p: {"a": "#b88a52", "b": "#6b4a26", "f": "#d3a96b", "s": "#5a3d20", "g": "#f2c14e", "d": "#8a6236", "c": "#6b4a26", "p": "#b88a52"}, o: "#2a1a0c" },
    "bag2": { r: ["................", "......bbbb......", ".....bffffb.....", "....bffffffb....", "....bbbbbbbb....", "...saaaaaaaas...", "...saaaggaaas...", "..psaaagggaasp..", "..psaaaaaaaasp..", "..psaadadadaasp.", "..psaaaaaaaasp..", "...saaaaaaaas...", "....cccccccc....", "................", "................", "................"], p: {"a": "#1f7a6a", "b": "#0f3f38", "f": "#2fb59a", "s": "#0b2a26", "g": "#7dffe0", "d": "#16574c", "c": "#0f3f38", "p": "#1f7a6a"}, o: "#04201c" }
  };
  var SPC = {};
  SPR = Object.assign(SPR, {
    "arm1": { r: ["................", "..aaa......aaa..", ".abbaa.cc.aabba.", ".abaaaa..aaaaba.", ".aaaaaaaaaaaaaa.", "..aabbalaabbaa..", "..aabbeblebbaa..", "..aabbblbbbbaa..", "...abbemlebba...", "...abbblmbbba...", "...aabbblbbaa...", "....aaaaaaaa....", "....ddddddddd...", "................", "................", "................"], p: {"a": "#a8814b", "b": "#d3a96b", "c": "#6b4a26", "m": "#b88a52", "d": "#6b4a26", "l": "#4f8a3c", "e": "#8fd37a"}, o: "#2a1a0c" },
    "arm2": { r: ["................", "..aaa......aaa..", ".abbaa.cc.aabba.", ".abwaaa..aaawba.", ".aaaaaaaaaaaaaa.", "..aabbaaaabbaa..", "..aabcbbbbcbaa..", "..aabbbbbbbbaa..", "...abbbggbbba...", "...abbbgwbbba...", "...aacbbbbcaa...", "....aaaaaaaa....", "....ddddddddd...", "................", "................", "................"], p: {"a": "#157a64", "b": "#1fbf93", "c": "#0b4d3e", "m": "#1fbf93", "d": "#0b4d3e", "g": "#4ee6b4", "w": "#e6fff8"}, o: "#04201c" },
    "arm3": { r: ["................", "..aaa......aaa..", ".albaa.cc.aabla.", ".abaaaa..aaaaba.", ".aaaaaaaaaaaaaa.", "..aalbaaaablaa..", "..aabbblbbbbaa..", "..aabbbblbbbaa..", "...abbbggbbba...", "...abbbgwbbba...", "...aabbbbbbaa...", "....aaaaaaaa....", "....dldddlddd...", "................", "................", "................"], p: {"a": "#3a2e34", "b": "#5a4a52", "c": "#1c1418", "m": "#4a3c44", "d": "#ff6a1f", "g": "#ff6a1f", "w": "#ffd25a", "l": "#ff8a3d"}, o: "#0c070a" },
    "arm4": { r: [".w............w.", "..waa......aaw..", ".abbaa.ww.aabba.", ".abaaaa..aaaaba.", ".aaaaaaaaaaaaaa.", "..aabbaaaabbaa..", "..aawbbbbbbwaa..", "..aabbbbbbbbaa..", "...abbbwwbbba...", "...abbbwwbbba...", "...aabbbbbbaa...", "....aaaaaaaa....", "....ddddddddd...", "................", "................", "................"], p: {"a": "#3f9fc4", "b": "#7fd6ff", "c": "#16465e", "m": "#bff0ff", "d": "#2f7fa3", "w": "#ffffff"}, o: "#16465e" }
  });
  // ----- material sprites: every loose material that used to show the plain diamond now has its own pixel art (same 16x16 style as the tools) -----
  SPR = Object.assign(SPR, {
    "spore": { r: ["................", "..w.........w...", "......bb........", ".....bwab..b....", ".....baac.bwa...", "..bb..cc..baac..", ".bwab......cc...", ".baac...bb...w..", "..cc...bwab.....", ".......baac.bb..", "..w.....cc.bwab.", ".........w.baac.", "............cc..", "................", "................", "................"], p: {"a": "#4ee6b4", "b": "#9bfbe0", "c": "#1fa37e", "w": "#e6fff8"}, o: "#06231c" },
    "cinder": { r: ["................", ".........c......", "........cac.....", ".......cabac....", "......cabbac....", ".....cabeebac...", ".....cabebbac...", "....cdabebbac...", "....cddabbaac...", "...cddaaabaac...", "...cdddaaaacc...", "....cddddacc....", ".....ccccc......", "................", "................", "................"], p: {"a": "#ff8a3d", "b": "#ffc24a", "c": "#b8420f", "d": "#3a2e34", "e": "#ffe08a"}, o: "#1c0a04" },
    "crystal": { r: ["................", ".......bb.......", "......bwab......", "......bwac......", ".....bwaac......", ".....bwaac..b...", "..b..bwaac.bab..", ".bab.baaac.bac..", ".baac.baac.bac..", ".baac.baacbaac..", ".bwac.baaccaac..", "..cc..cccc.cc...", "................", "................", "................", "................"], p: {"a": "#7fd6ff", "b": "#e6fbff", "c": "#3f9fc4", "w": "#ffffff"}, o: "#16465e" },
    "amber": { r: ["................", "................", ".....cccccc.....", "...ccbbaaaaac...", "..cbwbaaaaaaac..", "..cbaaaaddaaac..", "..caaaaaddddaac.", "..caaaadaddaaac.", "..caaaaaddaaaac.", "..caaaaaaaaaacc.", "...caaaaaaaacc..", "....cccccccc....", "................", "................", "................", "................"], p: {"a": "#f0a02c", "b": "#ffd25a", "c": "#b36a10", "d": "#5a3510", "w": "#fff1b8"}, o: "#2e1a05" },
    "bogiron": { r: ["................", "................", "................", ".....bbbbb......", "...bbbaaaabb....", "..bbaaeaaaaab...", "..baaaaaadaaab..", ".bbaadaaaaaaacb.", ".baaaaaaeaaaaacc", ".baaeaaaaaadaacc", ".bcaaaaaaaaaaac.", "..ccaadaaaaacc..", "...cccccccccc...", "................", "................", "................"], p: {"a": "#a9845f", "b": "#c9a47a", "c": "#6b4a30", "d": "#8a4a22", "e": "#d9792b"}, o: "#241408" },
    "sulfur": { r: ["................", "................", "........b.......", ".......bab......", "...b...bac..b...", "..bab..bac.bab..", "..bac.bbaacbac..", "..bac.baaacbac..", ".bbaacbaaaacaac.", ".baaacbaaaacaac.", ".baadaaaaaaaaac.", ".bcaaaaaadaaacc.", "..ccccccccccc...", "................", "................", "................"], p: {"a": "#e6d83a", "b": "#fff58a", "c": "#a89c14", "d": "#c9b81c"}, o: "#2e2a04" },
    "ruby": { r: ["................", "................", "................", "....bbbbbbbb....", "...bwwaaaaaab...", "..bwaaaaaaaaab..", ".bbbbbbbbbbbbbb.", ".baaaaabaaaaaac.", "..baaaabaaaaac..", "...baaabaaaac...", "....baabaaac....", ".....baaaac.....", "......bacc......", ".......cc.......", "................", "................"], p: {"a": "#e0364a", "b": "#ff7a88", "c": "#9a1428", "w": "#ffd0d6"}, o: "#2a040b" },
    "sapphire": { r: ["................", "................", ".....bbbbbb.....", "...bbwwaaaabb...", "..bwaaaaaaaaab..", "..baaaabbaaaac..", ".bwaaabaabaaaac.", ".baaaabaaabaaac.", ".baaaabaaabaaac.", ".bwaaaabbaaaaac.", "..baaaaaaaaaac..", "..cbaaaaaaaacc..", "...ccaaaaaacc...", ".....cccccc.....", "................", "................"], p: {"a": "#3f7fe6", "b": "#8fb8ff", "c": "#1f3f99", "w": "#d6e6ff"}, o: "#0a1438" },
    "moonstone": { r: ["................", "................", ".....bbbbbb.....", "...bbwwwaaabb...", "..bwwbbaaaaaab..", "..bwbaaaaaaaac..", ".bwbaaaaaaaaaac.", ".bwaaaaaaaaaaac.", ".bwaaaaaaaaaaac.", ".baaaaaaaaaaacc.", "..baaaaaaaaacc..", "..bcaaaaaaacc...", "...ccccccccc....", "................", "................", "................"], p: {"a": "#c9d2ff", "b": "#eef1ff", "c": "#8a94d6", "w": "#ffffff"}, o: "#232a5c" },
    "quartz": { r: ["................", ".......bb.......", "......bwab......", "......bwac......", ".....bwaac......", ".....bwaac......", ".....bwaac..b...", ".....bwaac.bab..", "....bbwaaacbac..", "....bwaaaaacac..", "....baaaaaaacc..", "....bcaaaaacc...", ".....cccccccc...", "................", "................", "................"], p: {"a": "#d6dde2", "b": "#ffffff", "c": "#8a959c", "w": "#f1f5f8"}, o: "#2e363b" },
    "amethyst": { r: ["................", "..........b.....", ".....b...bab....", "....bab..bac....", "....bac.bwac....", "....bac.bwac.b..", ".b..bacbbwaccab.", "bab.bbacbwaacac.", "bac.bwaacwaaacc.", "bacbbwaaaaaaac..", "bwaacaaaaaaacc..", ".caaaaaaaaaaac..", "..ccccccccccc...", "................", "................", "................"], p: {"a": "#a36bde", "b": "#d2a8ff", "c": "#6a3aa6", "w": "#ecd8ff"}, o: "#1e0e33" },
    "charcoal": { r: ["................", "................", "................", "......bb........", "....bbaabb......", "...baaaaaab.bb..", "..baaadaaaabbab.", "..baaaaaaaaaaac.", ".baadaaaaaadaac.", ".baaaaaaeaaaaac.", ".bcaaaadaaaaacc.", "..ccaaaaaaacc...", "....ccccccc.....", "................", "................", "................"], p: {"a": "#3a3a40", "b": "#6a6a74", "c": "#1c1c20", "d": "#26262c", "e": "#c8501a"}, o: "#000000" },
    "bone": { r: ["................", "................", "..........bbb...", ".........bwwab..", "........bwaab...", ".......bwaac....", "......bwaac.....", ".....bwaac......", "....bwaac.......", "...bwaac........", ".bbwaac.........", "bwwabc..........", "bwabb...........", ".bbb............", "................", "................"], p: {"a": "#e8e0c8", "b": "#fffbea", "c": "#a8a088", "w": "#ffffff"}, o: "#3a3524" },
    "fossil": { r: ["................", "................", "....bbbbbbbb....", "..bbaaaaaaaabb..", ".baaaccccccaaab.", ".baacaaaaaacaab.", ".bacaabbbbaacab.", ".bacabaaaabcaab.", ".bacabacccabaab.", ".bacabaabbabcab.", ".baacabbbbaacab.", ".bcaacccccaaacb.", "..ccaaaaaaaaacc.", "...cccccccccc...", "................", "................"], p: {"a": "#b09a76", "b": "#d4c49e", "c": "#7a6a4c"}, o: "#2a2214" },
    "ironingot": { r: ["................", "................", "................", "................", "....bbbbbbbbb...", "...bwwwbbbbbbc..", "..bwwbbbbbbbbac.", ".bbbbbbbbbbbbaac", ".baaaaaaaaaaaaac", ".baaaaaaaaaaaacc", ".bdaaaaaaaaaaac.", "..ccccccccccccc.", "................", "................", "................", "................"], p: {"a": "#aab2bd", "b": "#dfe5ea", "c": "#6c7580", "d": "#8a929c", "w": "#ffffff"}, o: "#1c2026" },
    "cloth": { r: ["................", "................", "................", "..bbbbbbbbbb....", ".bwwbbbbbbbbbc..", ".bwbbbbbbbbbbac.", ".bbbbbbbbbbbaac.", ".bddddddddddddc.", ".baaaaaaaaaaaac.", ".bddddddddddddc.", ".baaaaaaaaaaaac.", ".bcccccccccccc..", "..cc.c.c.c.c.c..", "................", "................", "................"], p: {"a": "#e8dcc0", "b": "#fff6e0", "c": "#b8a888", "d": "#c85a4a", "w": "#ffffff"}, o: "#3a3020" },
    "rope": { r: ["................", "................", "....bbbbbbb.....", "..bbaacaacabb...", ".bacb.....bcab..", ".bab.......bac..", "bab..........bab", "bac....bb....bac", "bab...bab....bab", ".bac..bac...bac.", ".bacb.bac..bacc.", "..bbaabaacabcc..", "....cbbaaccc....", "................", "................", "................"], p: {"a": "#c9a96a", "b": "#e6cf94", "c": "#8a6a36"}, o: "#2e220e" },
    "dyered": { r: ["................", "................", ".......hh.......", "......hddh......", ".......bb.......", "......bwwb......", ".....bwwaab.....", "....bwaaaaab....", "...bwaaaaaaab...", "...baaaaaaaac...", "...baaaeeaaac...", "...baaaeeaaac...", "...bcaaaaaacc...", "....ccccccc.....", "................", "................"], p: {"a": "#d6382e", "b": "#e6f2f5", "c": "#8a1810", "w": "#ffffff", "e": "#ff8a80", "h": "#a8814b", "d": "#6b4a26"}, o: "#2a0806" },
    "dyeblue": { r: ["................", "................", ".......hh.......", "......hddh......", ".......bb.......", "......bwwb......", ".....bwwaab.....", "....bwaaaaab....", "...bwaaaaaaab...", "...baaaaaaaac...", "...baaaeeaaac...", "...baaaeeaaac...", "...bcaaaaaacc...", "....ccccccc.....", "................", "................"], p: {"a": "#3a7fd8", "b": "#e6f2f5", "c": "#1a4a8a", "w": "#ffffff", "e": "#8fc0ff", "h": "#a8814b", "d": "#6b4a26"}, o: "#08162e" },
    "dyegreen": { r: ["................", "................", ".......hh.......", "......hddh......", ".......bb.......", "......bwwb......", ".....bwwaab.....", "....bwaaaaab....", "...bwaaaaaaab...", "...baaaaaaaac...", "...baaaeeaaac...", "...baaaeeaaac...", "...bcaaaaaacc...", "....ccccccc.....", "................", "................"], p: {"a": "#3aa84e", "b": "#e6f2f5", "c": "#1c6a2c", "w": "#ffffff", "e": "#8fe39c", "h": "#a8814b", "d": "#6b4a26"}, o: "#07200c" },
    "mortar": { r: ["................", "................", "................", "................", ".........h......", "........hdh.....", ".......hdh......", "...bbbhdh.......", "..bwabbdbbb.....", ".bwabbbbbbbab...", ".baaaaaaaaaaac..", "bwaaaaaaaaaaaac.", "baaaaaaaaaaaaaac", ".bcaaaaaaaaaacc.", "..cccccccccccc..", "................"], p: {"a": "#bdb9a8", "b": "#dcd8c8", "c": "#8a8676", "h": "#c9a96a", "d": "#8a6a36", "w": "#ffffff"}, o: "#2a2820" },
    "claybrick": { r: ["................", "................", "................", "................", "...bbbbbbbbbbb..", "..bwbbbbbbbbbac.", ".bbbbbbbbbbbbaac", ".baaaaaaaaaaaaac", ".baaaddaaaaddaac", ".baaaddaaaaddaac", ".bdaaaaaaaaaaaac", ".bcaaaaaaaaaaacc", "..ccccccccccccc.", "................", "................", "................"], p: {"a": "#c4573a", "b": "#e8856a", "c": "#8a3420", "d": "#a8452a", "w": "#ffc0a8"}, o: "#2a0f08" },
    "candle": { r: ["................", ".......yy.......", "......yffy......", "......yffy......", ".......fy.......", ".......dd.......", "......bbac......", "......bwac......", "......bwac......", "......bwac......", "....hhhhhhhh....", "...hddddddddh...", "....hhhhhhhh....", "................", "................", "................"], p: {"a": "#f6ecc8", "b": "#fff9e0", "c": "#c9bc8a", "d": "#3a2a1a", "f": "#ffb43a", "y": "#ffe680", "w": "#ffffff", "h": "#8a5a32"}, o: "#2a1a0a" }
  });
  // ----- loose-material and enemy-loot sprites: Stick, Reed Fiber, Pebble and the three Fragments used to be vector drawings; now they are 16x16 pixel art too -----
  SPR = Object.assign(SPR, {
    "stick": {r: ["................", "............bb..", "...........bwab.", "..........bwac..", "...b.....bwac...", "..bab...bwac....", "....babbwac.....", "......bwac......", ".....bwac.......", "....bwac........", "...bwac.........", "..bwac..........", ".bwac...........", ".bbc............", "................", "................"], p: {"a": "#a8703c", "b": "#c9935a", "c": "#6a4426", "w": "#e2b982"}, o: "#2a1a0c"},
    "fiber": {r: ["................", "..b.....b....b..", "..ba....ba..ba..", "..ba....ba..ba..", "...ba...ba.bac..", "...bac..ba.bac..", "....bac.ba.bac..", "....bac.bacbac..", ".....bacbacbc...", "......bbbbbb....", ".....dddddddd...", ".....eeeeeeee...", "......bbbbbb....", ".......bbbb.....", "................", "................"], p: {"a": "#6aa347", "b": "#8fd37a", "c": "#3b6a2c", "d": "#f0e4b8", "e": "#c9b87a"}, o: "#16300f"},
    "pebble": {r: ["................", "................", "................", "................", "................", "................", "......bbbb......", "....bbwwaab.....", "...bwwaaaaac....", "..bwaaaaaaaac...", "..baaaaaaaac.bb.", "..bcaaaaaaccbwac", "...cccaaaaccbaac", ".....cccccc.bccc", "................", "................"], p: {"a": "#8e969b", "b": "#b9c1c5", "c": "#5d6569", "w": "#e4e9ec"}, o: "#1c1f21"},
    "bugfrag": {r: ["................", "..........rr....", "..........dr....", ".........ddd....", "........bbdbb...", "......bbwaaabb..", ".....bwaaaaaaab.", "....bwaaeaaaaab.", "....baaaeaaaaac.", "...bcaaeaaaaaacc", "...bcaeaaaaaaacc", "...bccccccccccc.", "................", "................", "................", "................"], p: {"a": "#7a3d86", "b": "#a463b2", "c": "#3a1d42", "w": "#d9a5e6", "e": "#ff6b82", "d": "#f1e5d0", r: "#ff6b82"}, o: "#12061a"},
    "frogfrag": {r: ["................", ".......bb.......", "......bwab......", ".....bwaaab.....", "....bwaaaaac....", "...bwaaaaaaac...", "...bwaayyyaac...", "..bwaaypyyaaac..", "..baaaayyyaaaac.", "..baasaaaaasaac.", "...bcaaaaaaacc..", "....bccaaaccc...", ".....bccccc.....", "................", "................", "................"], p: {"a": "#3fb35f", "b": "#7ee08a", "c": "#1c5e34", "w": "#c8f5c8", "y": "#ffd23f", p: "#12220f", "s": "#2a8a47"}, o: "#0e2f1a"},
    "batwing": {r: ["................", "..........bbb...", "....bbbbbbbbbb..", "..bbwaaaaaaaaab.", ".bwaaeaaaaeaaaac", ".baaaaeaaaeaaacc", ".bcaaaaeaeaaacc.", "..bcaaaaeaaacc..", "..bccbcaeaacbcc.", "...bc.bccbc.bc..", "...b...bb...b...", "................", "................", "................", "................", "................"], p: {"a": "#6a43a8", "b": "#a37fe0", "c": "#3d2466", "w": "#e9dcff", "e": "#d9c4ff"}, o: "#12061a"}
  });
  // ----- farming and food sprites (generated, 16x16) -----
  SPR = Object.assign(SPR, {
    "carrot": { r: ["..............h.", "............gh..", "...........ggh.g", "...........ghgg.", "..........aggh..", ".........abaaa..", "........abaaa...", ".......abaca....", "......abcaa.....", ".....abaaa......", "....aaaaa.......", "....acaa........", "...aaaa.........", "..aaa...........", "...a............", "................"], p: {"a": "#ff8a2a", "b": "#ffc070", "c": "#c85a10", "g": "#3f9a3a", "h": "#7fd06a"}, o: "#3a1a06" },
    "potato": { r: ["................", "................", "................", "................", "................", ".....aaaaaa.....", "...abbbbbaaaa...", "...bbwbbbcaaa...", "..abbbbbbbaaaa..", "..aacbbbbaaaaa..", "..aaaaaaaaacaa..", "...aaaacaaaaa...", "...aaaaaaaaaa...", ".....aaaaaa.....", "................", "................"], p: {"a": "#c9934e", "b": "#e0b070", "c": "#7a5228", "w": "#f6e0b0"}, o: "#3a2410" },
    "pepper": { r: ["......h.........", ".....g..........", "....ggg.........", "..aaggg.........", "..aaaaa.........", "..aabaaa........", "...aabaaa.......", "....abaaa.......", "....aabaaa......", ".....aabaa......", "......abaaa.....", ".......aaaa.....", "........aaa.....", "..........aa....", "..........a.....", "................"], p: {"a": "#e8341c", "b": "#ff8a6a", "g": "#3f9a3a", "h": "#7fd06a"}, o: "#3a0a04" },
    "frostberry": { r: ["................", "........ghhh....", ".......gghhh....", ".......g........", "........g.......", "......wgaa......", "......aada......", "......addd......", "......aada......", "....aa....aa....", "...waaa..waaa...", "...aadd..aadd...", "...addd..addd...", "....aa....aa....", "................", "................"], p: {"a": "#5a8cff", "d": "#2a4ac8", "w": "#e8f4ff", "g": "#3f7a5a", "h": "#7fd0a0"}, o: "#0e1a40" },
    "rawmeat": { r: ["................", "................", "................", ".............ww.", "......faa...www.", "....ffaaaaaawww.", "...faaabbbaww...", "..aaabbbbbbbaa..", "..aaabbbbbbbaa..", "..aaabbbbbbbaa..", "..aaaaabbbaaaa..", "...aaaaaaaaaa...", "....aaaaaaaa....", ".......aa.......", "................", "................"], p: {"a": "#d8435a", "b": "#ff8a9a", "f": "#fff0f0", "w": "#f6eedb"}, o: "#3a0a12" },
    "grilledmeat": { r: ["................", "................", "................", ".............ww.", ".......aa...www.", "....aaaaaaaawww.", "...aabcbbcaac..c", "..aabcbbcbbcaac.", "..aabcbbcbbcaac.", "..aacbbcbbcaac..", "..aacaacaacaac..", "...caacaacaac...", "....aaaaaaaa....", ".......aa.......", "................", "................"], p: {"a": "#9a5228", "b": "#c9763e", "c": "#4a240e", "w": "#f6eedb"}, o: "#2a1206" },
    "roastcarrot": { r: ["................", "................", "................", ".........g......", "........g..g....", ".......aaag.....", ".....aaaaaaa....", "...aaaacaaaa....", "..aacaaaaaa.....", ".aaaaacaappp....", "..aaaaaqqqqqqp..", ".pqaaaqqqqqqqqp.", ".ppqqqqqqqqqqpp.", "..pppppppppppp..", "....pppppppp....", "................"], p: {"p": "#e8e4d8", "q": "#c8c2b0", "a": "#e06a1a", "c": "#6a2a08", "g": "#3f9a3a"}, o: "#2a1a0e" },
    "bakedpotato": { r: ["................", "................", "................", "................", "................", "................", "....aaawaaaa....", "...abbyyybbba...", "..aabbyyybbbaa..", "..aabbbbbbbbaa..", "..aacbbbbbbbaa..", "..aaaaaaaaacaa..", "...aaaaaaaaaa...", "....aaaaaaaa....", "................", "................"], p: {"a": "#8a5a2a", "b": "#f6e6b0", "y": "#ffd23f", "w": "#fff8d0", "c": "#5a3a18"}, o: "#2a1a0a" },
    "skewer": { r: ["................", "..............s.", ".............s..", "..........waa...", ".........aaaaa..", "..........bba...", ".......waa......", "......aaaaa.....", ".......bba......", "....waa.........", "...aaaaa........", "....bba.........", "...s............", "..s.............", ".s..............", "................"], p: {"s": "#a8703c", "a": "#d8342a", "w": "#ffffff", "b": "#f1e5d0"}, o: "#2a0a06" },
    "stew": { r: ["................", "................", "................", "................", "................", "................", "......ffff......", "...fffhffffff...", ".ffhxhhhhhfyfff.", ".rffffyffxffffr.", ".fkkffffffffkkf.", "...kkkkkkkkkk...", "....kkkkkkkk....", ".....kkkkkk.....", "......kkkk......", ".....kkkkkk....."], p: {"k": "#8a5a32", "r": "#c98c4f", "f": "#7a6a2a", "h": "#a89a4a", "x": "#ff8a2a", "y": "#d8c070"}, o: "#2a1a0a" },
    "chili": { r: ["................", "................", "................", "........s.......", ".......s........", "......s.........", "......ffff......", "...fffhffffff...", ".ffhxhhyhhfxfff.", ".rffffhffxffffr.", ".fkkffffffffkkf.", "...kkkkkkkkkk...", "....kkkkkkkk....", ".....kkkkkk.....", "......kkkk......", ".....kkkkkk....."], p: {"k": "#5a3a2a", "r": "#8a5a42", "f": "#c8301a", "h": "#ff6a3a", "x": "#7a1a0a", "y": "#f2c14e", "s": "#d0d0d0"}, o: "#1a0a06" },
    "berrypie": { r: ["................", "................", "................", "................", "................", ".......ccc......", "......ccac......", ".....ccaacc.....", ".....cawaacc....", "....ccaaaaacc...", "...ccaaaawaac...", "...cawaaaaawcc..", "..ccccccccccccc.", ".ddddddddddddddd", ".ccccccccccccccc", "................"], p: {"c": "#e0a85a", "d": "#f6d090", "a": "#4a6cff", "w": "#cfe0ff"}, o: "#3a2410" },
    "feast": { r: ["................", "................", "................", "................", "........g.......", ".......oo.......", ".......oo.......", "....mmmoo.......", ".wwmmmmooawaa...", "..mmmmmmmaaaa...", "..pmmmmmqaaaap..", ".pqqmmmqqqqqqqp.", ".pqqqqqqqqqqqqp.", ".pppqqqqqqqqppp.", "..pppppppppppp..", "................"], p: {"p": "#f2c14e", "q": "#d9a83a", "m": "#9a5228", "w": "#f6eedb", "a": "#4a6cff", "o": "#ff8a2a", "g": "#3f9a3a"}, o: "#2a1a06" },
    "seed_carrot": { r: ["................", "................", "................", "................", ".....ssssss.....", "....rrrrrrrr....", ".....ssssss.....", "....statttts....", "...sttttabtts...", "..sttabtttttts..", "..ssttttttatss..", "..sssttatttsss..", "...ssssssssss...", "....ssssssss....", "................", "................"], p: {"s": "#c9a46a", "t": "#e0c48a", "r": "#8a5a32", "a": "#ff8a2a", "b": "#ffd0a0"}, o: "#3a2410" },
    "seed_potato": { r: ["................", "................", "................", "................", ".....ssssss.....", "....rrrrrrrr....", ".....ssssss.....", "....statttts....", "...sttttabtts...", "..sttabtttttts..", "..ssttttttatss..", "..sssttatttsss..", "...ssssssssss...", "....ssssssss....", "................", "................"], p: {"s": "#c9a46a", "t": "#e0c48a", "r": "#8a5a32", "a": "#c9934e", "b": "#f0d0a0"}, o: "#3a2410" },
    "seed_pepper": { r: ["................", "................", "................", "................", ".....ssssss.....", "....rrrrrrrr....", ".....ssssss.....", "....statttts....", "...sttttabtts...", "..sttabtttttts..", "..ssttttttatss..", "..sssttatttsss..", "...ssssssssss...", "....ssssssss....", "................", "................"], p: {"s": "#c9a46a", "t": "#e0c48a", "r": "#8a5a32", "a": "#e8341c", "b": "#ffb0a0"}, o: "#3a2410" },
    "seed_frost": { r: ["................", "................", "................", "................", ".....ssssss.....", "....rrrrrrrr....", ".....ssssss.....", "....statttts....", "...sttttabtts...", "..sttabtttttts..", "..ssttttttatss..", "..sssttatttsss..", "...ssssssssss...", "....ssssssss....", "................", "................"], p: {"s": "#c9a46a", "t": "#e0c48a", "r": "#8a5a32", "a": "#4a7cff", "b": "#d0e0ff"}, o: "#3a2410" }
  });
  function sprCanvas(key) {   // 16x16 canvas for one sprite, cached
    if (SPC[key]) return SPC[key];
    var d = SPR[key], c = document.createElement("canvas"); c.width = c.height = 16; var g = c.getContext("2d"), on = {}, x, y;
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) { var ch = d.r[y].charAt(x); if (ch !== "." && d.p[ch]) on[x + "," + y] = d.p[ch]; }
    g.fillStyle = d.o;
    Object.keys(on).forEach(function (k) {
      var q = k.split(","), px = +q[0], py = +q[1];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) { var nx = px + o[0], ny = py + o[1]; if (nx >= 0 && ny >= 0 && nx < 16 && ny < 16 && !on[nx + "," + ny]) g.fillRect(nx, ny, 1, 1); });
    });
    Object.keys(on).forEach(function (k) { var q = k.split(","); g.fillStyle = on[k]; g.fillRect(+q[0], +q[1], 1, 1); });
    return (SPC[key] = c);
  }
  function drawSpr(g, key) { var W = g.canvas.width; g.imageSmoothingEnabled = false; g.drawImage(sprCanvas(key), 0, 0, W, W); }   // 16 -> 1x, 32 -> crisp 2x
  function drawPickIcon(g, tier) { drawSpr(g, tier > 0 ? "pick" + tier : "paw"); }
  function drawCanIcon(g) { drawSpr(g, "can"); }
  function drawBagIcon(g, t) { drawSpr(g, t >= 2 ? "bag2" : "bag1"); }
  function drawShovelIcon(g) { drawSpr(g, "shovel"); }
  function drawWeaponIcon(g, tier) { if (tier >= 1 && tier <= 4) drawSpr(g, "wpn" + tier); }
  function heldCan() { return sprCanvas("can"); }
  function icon(id) {
    var key = id === "pick" ? "pick" + S.tier : id === "weapon" ? "weapon" + S.wpn : id === "arm" ? "arm" + S.arm : id;   // "shovel" is its own key
    if (ICO[key]) return ICO[key];
    var c = document.createElement("canvas"); c.width = c.height = 32; var g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    if (id === "pick") {
      drawPickIcon(g, S.tier);
    } else if (id === "arm" || /^arm\d$/.test(id)) {
      drawSpr(g, id === "arm" ? "arm" + S.arm : id);
    } else if (id === "shovel") {
      drawShovelIcon(g);
    } else if (id === "weapon") {
      drawWeaponIcon(g, S.wpn);
    } else if (id === "can") {
      drawCanIcon(g);
    } else if (/^bag\d$/.test(id)) {
      drawBagIcon(g, +id.slice(3));
    } else if (/^wpn\d$/.test(id)) {
      drawWeaponIcon(g, +id.slice(3));
    } else if (SPR[id]) {   // Glowspore, Amber, Ruby, Rope, Candle ... all have their own pixel art now
      drawSpr(g, id);
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
    } else if (ITEMS[id].frag === "wolf") {   // a folded grey pelt with a pale belly stripe
      g.lineJoin = "round"; g.fillStyle = "#9aa8b4"; g.strokeStyle = "#2a323c"; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(5, 10); g.quadraticCurveTo(16, 4, 27, 10); g.lineTo(29, 22); g.quadraticCurveTo(16, 29, 3, 22); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = "#5d6c7a"; g.beginPath(); g.moveTo(7, 11); g.quadraticCurveTo(16, 7, 25, 11); g.lineTo(25, 14); g.quadraticCurveTo(16, 11, 7, 14); g.closePath(); g.fill();
      g.fillStyle = "#e8eef2"; g.beginPath(); g.ellipse(16, 21, 8, 3, 0, 0, 6.2832); g.fill();
      g.strokeStyle = "#cfdde6"; g.lineWidth = 1; [[8, 16], [13, 17], [19, 17], [24, 16]].forEach(function (q) { g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] + 2, q[1] - 2); g.stroke(); });
    } else if (ITEMS[id].frag === "gator") {   // a ridged green scute
      g.lineJoin = "round"; g.fillStyle = "#2f4f22"; g.strokeStyle = "#1a2412"; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(16, 3); g.lineTo(28, 14); g.lineTo(24, 28); g.lineTo(8, 28); g.lineTo(4, 14); g.closePath(); g.fill(); g.stroke();
      var sgg = g.createLinearGradient(0, 5, 0, 27); sgg.addColorStop(0, "#8ab85a"); sgg.addColorStop(1, "#3f6a2c"); g.fillStyle = sgg;
      g.beginPath(); g.moveTo(16, 6); g.lineTo(25, 14); g.lineTo(22, 25); g.lineTo(10, 25); g.lineTo(7, 14); g.closePath(); g.fill();
      g.fillStyle = "#2a3d1c"; g.beginPath(); g.moveTo(16, 8); g.lineTo(19, 16); g.lineTo(16, 23); g.lineTo(13, 16); g.closePath(); g.fill();
      g.fillStyle = "#c9e89a"; g.beginPath(); g.arc(14, 12, 1.4, 0, 6.2832); g.fill();
    } else if (ITEMS[id].frag === "slime") {   // a wobbly green ball of slime
      g.fillStyle = "#5ad04a"; g.strokeStyle = "#2a7a24"; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(5, 26); g.quadraticCurveTo(3, 8, 16, 6); g.quadraticCurveTo(29, 8, 27, 26); g.quadraticCurveTo(16, 29, 5, 26); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = "#2a7a24"; g.globalAlpha = 0.35; g.beginPath(); g.ellipse(14, 20, 6, 3.5, 0, 0, 6.2832); g.fill(); g.globalAlpha = 1;
      g.fillStyle = "#c8ffb8"; g.beginPath(); g.ellipse(11, 12, 3.5, 2.2, -0.5, 0, 6.2832); g.fill(); g.fillStyle = "#fff"; g.beginPath(); g.arc(10, 11, 1.2, 0, 6.2832); g.fill();
    } else if (ITEMS[id].frag === "wasp") {   // a curved black-and-amber stinger
      g.lineJoin = "round"; g.fillStyle = "#ffcf3a"; g.strokeStyle = "#1a1206"; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(6, 8); g.quadraticCurveTo(14, 4, 20, 10); g.quadraticCurveTo(24, 16, 27, 28); g.quadraticCurveTo(18, 20, 9, 16); g.quadraticCurveTo(4, 13, 6, 8); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = "#1a1206"; g.beginPath(); g.moveTo(11, 6.5); g.lineTo(14, 6); g.lineTo(12, 15); g.lineTo(9.5, 14.5); g.closePath(); g.fill(); g.beginPath(); g.moveTo(17, 8); g.lineTo(19.5, 10); g.lineTo(16.5, 18); g.lineTo(14.5, 16.5); g.closePath(); g.fill();
      g.fillStyle = "#ff8a3d"; g.beginPath(); g.arc(26.5, 27, 1.6, 0, 6.2832); g.fill();
    } else if (ITEMS[id].ico !== undefined) { g.imageSmoothingEnabled = false; g.drawImage(ATLAS, 0, ITEMS[id].ico * 16, 16, 16, 2, 2, 28, 28);
    } else if (ITEMS[id].gem) {
      var gc = ITEMS[id].gem; g.fillStyle = gc; g.beginPath(); g.moveTo(16, 4); g.lineTo(26, 14); g.lineTo(16, 28); g.lineTo(6, 14); g.closePath(); g.fill();
      g.fillStyle = "#ffffff88"; g.beginPath(); g.moveTo(16, 4); g.lineTo(21, 14); g.lineTo(16, 14); g.lineTo(11, 14); g.closePath(); g.fill();
      g.strokeStyle = "#00000055"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(16, 4); g.lineTo(26, 14); g.lineTo(16, 28); g.lineTo(6, 14); g.closePath(); g.stroke();
    } else if (id === "door") { g.imageSmoothingEnabled = false; g.drawImage(ATLAS, 0, T.DOORO_T * 16, 16, 16, 8, 1, 16, 15); g.drawImage(ATLAS, 0, T.DOORO_B * 16, 16, 16, 8, 16, 16, 15); }
    else { var t = ITEMS[id].tile; g.drawImage(ATLAS, 0, t * 16, 16, 16, 2, 2, 28, 28); }
    return (ICO[key] = c.toDataURL());
  }

  // ---------- PLAYER SPRITE (your avatar, gear included) ----------
  var spriteOutfit = null;
  function mkSprite() {   // the pixel full-body avatar (delve-avatar.js) is rebuilt whenever the Armory outfit or animal changes
    var key = S.animal + "|" + S.arm + "|" + (function () { try { return JSON.stringify(Crystals.outfit()); } catch (e) { return ""; } })();
    if (key === spriteKey) return; spriteKey = key; sprite = null;
    try { spriteOutfit = Object.assign({}, Crystals.outfit(), { animal: S.animal, arm: S.arm }); } catch (e) { spriteOutfit = { animal: S.animal, arm: S.arm }; }
  }
  function getSprite() {
    if (typeof DelveAv === "undefined") return null;
    var sc = cave ? Math.max(1, Math.floor(ts * 1.3 / 24)) : Math.max(1, Math.round(ts * 1.7 / 24));   // whole pixels per art pixel, so the art stays crisp; indoors you are drawn smaller so furniture and rocks look the right size next to you
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
  // Small pop-up in the bottom-right corner (stacks up to 3, each fades after ~3 s). Used for completed goals / trail steps and for defeated enemies.
  function popup(label, title, color, icon) {
    var box = $("sbxPops"); if (!box) return;
    var el = document.createElement("div"); el.className = "sbx-pop"; el.style.setProperty("--pc", color || "#f2c14e");
    el.innerHTML = "<i aria-hidden=\"true\">" + (icon || "\u2713") + "</i><small>" + esc(label) + "</small><b>" + esc(title) + "</b>";
    box.appendChild(el); while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 3300);
  }
  function banner(title, desc, label) { popup(label || "Goal complete", title + (desc ? " \u2022 " + desc : ""), "#f2c14e", "\u2713"); snd("rise"); }
  function nextBanner() {
    var b = bannerQ.shift(), el = $("sbxBanner"); if (!b) { bannerBusy = false; return; }
    bannerBusy = true; el.innerHTML = "<small>" + esc(b[2] || "Goal complete") + "</small><b>" + esc(b[0]) + "</b><span>" + esc(b[1]) + "</span>";
    el.classList.remove("on"); void el.offsetWidth; el.classList.add("on"); snd("rise");
    setTimeout(function () { el.classList.remove("on"); setTimeout(nextBanner, 350); }, 2900);
  }

  // ---------- RULES ----------
  function dropQty(td) { return td.kind === "ore" ? 1 + (Math.random() < 0.6 ? 1 : 0) : td.kind === "reed" || td.kind === "vine" ? 1 + (Math.random() < 0.5 ? 1 : 0) : 1; }
  function dropOf(td) { return td.kind === "door" ? "door" : td.drop; }
  function breakTile(x, y) {
    var id = get(x, y), td = TILES[id];
    if (td.kind === "door") {   // both halves go together and you get one Door back
      var db = td.door.top ? y + 1 : y; delete doorAuto[db * W + x];
      setT(x, db, T.AIR); if (db - 1 >= 0) setT(x, db - 1, T.AIR); S.st.mined++;
      chips(x + 0.5, db, "#b9793f", 10, 6); thud(170, 0.08); give("door", 1, x, y); return;
    }
    if (td.kind === "lootchest" && !S.chests[x + "," + y]) { var LL = rollLoot("chest", world.bio[x], lootTier(y)); LL.forEach(function (q) { give(q[0], q[1], x, y - 0.4); }); treasureFound(LL.length); }   // broken before it was opened: the loot spills out
    if (td.kind === "lootpot") { S.st.pots++; rollLoot("pot", world.bio[x], lootTier(y)).forEach(function (q) { give(q[0], q[1], x, y - 0.4); }); chips(x + 0.5, y + 0.5, "#b87444", 12, 6); thud(420, 0.06); checkGoals(); }
    if (isChest(id)) delete S.chests[x + "," + y];
    if ((td.kind === "farmland" || td.kind === "farmwet") && cropAt(x, y - 1)) { var tc = cropAt(x, y - 1); setT(x, y - 1, T.AIR); harvestCrop(x, y - 1, tc); }   // the crop on top comes with it
    setT(x, y, T.AIR); S.st.mined++;
    if (td.crop) harvestCrop(x, y, td);
    var SDROP = {}; SDROP[T.REED] = ["seed_carrot", 0.18]; SDROP[T.GLOWCAP] = ["seed_potato", 0.15]; SDROP[T.BLOOM] = ["seed_pepper", 0.2]; SDROP[T.SPIKE] = ["seed_frost", 0.2];
    if (SDROP[id] && ITEMS[SDROP[id][0]] && Math.random() < SDROP[id][1]) give(SDROP[id][0], 1, x, y - 0.6);   // wild plants sometimes drop crop seeds
    chips(x + 0.5, y + 0.5, td.kind === "ore" ? td.c2 : td.c, td.kind === "ore" ? 14 : 9, 6);
    thud(td.hard > 2 ? 110 : 160, 0.08);
    if (td.drop) { var n = dropQty(td); give(td.drop, n, x, y); if (td.kind === "ore") snd("coin"); }
    if (td.bonus) td.bonus.forEach(function (bq) { if (Math.random() < bq[1]) give(bq[0], bq[2] + Math.floor(Math.random() * (bq[3] - bq[2] + 1)), x, y - 0.4); });   // loot blocks (geode, fossil, cache)
    if (id === T.LEAVES && Math.random() < 0.5) give("stick", 1, x, y - 0.55);                                  // Stage 1: sticks from leaves
    else if ((id === T.MUD || id === T.MOSS) && Math.random() < 0.16) give("pebble", 1, x, y - 0.55);         // Stage 1: pebbles from mud
    if (id === T.LOG && get(x, y - 1) === T.LOG) { /* upper trunk stays; keep it simple and forgiving */ }
  }
  function canPlace(tx, ty, item) {
    var id = get(tx, ty), td = ITEMS[item]; if (id !== T.AIR && id !== T.WATER) return false;
    if (ty < 1 || ty >= H - 3 || tx < 1 || tx >= W - 1) return false;
    var t = td.tile, solid = TILES[t].solid;
    if (td.seed) { if (!soilKind(tx, ty + 1)) { nag("Plant seeds on top of Garden Soil."); return false; } return true; }
    if (item === "door") {
      if (ty < 2 || get(tx, ty - 1) !== T.AIR) { nag("A door needs two free tiles stacked up."); return false; }
      if (!TILES[get(tx, ty + 1)].solid) { nag("A door needs solid ground under it."); return false; }
      if (doorInTheWay(tx, ty)) { nag("Something is in the way."); return false; }
      return true;
    }
    if (item === "chest" && !TILES[get(tx, ty + 1)].solid) { nag("A chest needs solid ground under it."); return false; }
    var prule = ITEMS[item].put;   // decor: "floor" pieces stand on solid ground, "wall" pieces hang on a block beside or above them (see DECOR_FLOOR / DECOR_WALL in sandbox-world.js)
    if (prule === "floor" && !TILES[get(tx, ty + 1)].solid) { nag("That needs solid ground under it."); return false; }
    if (prule === "wall" && !(TILES[get(tx - 1, ty)].solid || TILES[get(tx + 1, ty)].solid || TILES[get(tx, ty - 1)].solid)) { nag("Hang this on a wall: it needs a block beside or above it."); return false; }
    if (item === "bed" && !TILES[get(tx, ty + 1)].solid) { nag("A bed needs solid ground under it."); return false; }
    if (solid && tx + 1 > p.x - PW / 2 && tx < p.x + PW / 2 && ty + 1 > p.y - PH && ty < p.y) return false;
    if (item === "ladder") { var lk = function (a, b) { var q = get(a, b); return TILES[q].solid || q === T.LADDER; }; return lk(tx - 1, ty) || lk(tx + 1, ty) || lk(tx, ty - 1) || lk(tx, ty + 1); }
    return TILES[get(tx - 1, ty)].solid || TILES[get(tx + 1, ty)].solid || TILES[get(tx, ty - 1)].solid || TILES[get(tx, ty + 1)].solid;
  }
  function setWall(x, y, id) { var i = y * W + x; walls[i] = id; if (id === worigW[i]) delete wedits[i]; else wedits[i] = id; }
  function canWall(tx, ty, wid) {   // walls go on the back layer: the front tile must be free (air or a decor piece), and the wall needs a block or another wall beside, above or below it
    if (tx < 1 || tx >= W - 1 || ty < 1 || ty >= H - 3) return false;
    var id = get(tx, ty); if (TILES[id].solid || id === T.WATER || id === T.LAVA) return false;
    if (walls[ty * W + tx] === wid) return false;
    var sup = function (a, b) { return TILES[get(a, b)].solid || hasW(a, b); };
    if (sup(tx - 1, ty) || sup(tx + 1, ty) || sup(tx, ty - 1) || sup(tx, ty + 1)) return true;
    nag("A wall needs a block or another wall next to it to attach to."); return false;
  }
  function placeWall(tx, ty, item) {
    var wid = ITEMS[item].wall, old = walls[ty * W + tx];
    if (old && old !== wid && WALLITEM[old]) addInv(WALLITEM[old], 1);   // swapping a wall hands the old one back
    setWall(tx, ty, wid); S.inv[item]--; S.st.walls++;
    chips(tx + 0.5, ty + 0.5, TILES[wid].c2 || "#fff", 4, 3); thud(210, 0.04);
    if (S.inv[item] <= 0) { delete S.inv[item]; if (sel === item) sel = "pick"; }
    hbDirty = true; if (panelOpen) renderPanel(); checkGoals();
  }
  function wallMine(dt, tx, ty) {   // hold your pick, shovel or paws on an empty tile with a wall behind it to take the wall down
    var wid = walls[ty * W + tx], item = WALLITEM[wid];
    if (item && room(item) <= 0) { invFull(); mine = null; return; }
    if (!mine || mine.x !== tx || mine.y !== ty) mine = { x: tx, y: ty, p: 0, tick: 0 };
    mine.p += dt * (sel === "shovel" ? SHOVEL.sp : PICKS[effTier()].sp) / 0.45; mine.tick -= dt;
    if (mine.tick <= 0) { mine.tick = 0.17; thud(180 + Math.random() * 40, 0.03); chips(tx + 0.5, ty + 0.5, TILES[wid].c2 || "#fff", 1, 3); }
    if (mine.p >= 1) { setWall(tx, ty, 0); chips(tx + 0.5, ty + 0.5, TILES[wid].c2 || "#fff", 8, 5); thud(200, 0.06); if (item) give(item, 1, tx, ty); mine = null; }
  }
  function place(tx, ty, item) {
    setT(tx, ty, ITEMS[item].tile); S.inv[item]--; S.st.placed++; if (item === "torch") S.st.torches++; if (item === "bench") S.st.benches++; if (item === "bed") S.st.beds++;
    if (item === "door") { setT(tx, ty - 1, T.DOOR_T); S.st.doors++; }
    if (ITEMS[item].decor) S.st.decor++; if (item === "decorbench") S.st.dbenches++;
    if (item === "chair" && p.face < 0) setT(tx, ty, T.CHAIR_L);
    if (item === "ladder") S.st.ladders++;
    if (ITEMS[item].seed) plantCrop(tx, ty, item);
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
    bat: { n: "Dusk Bat", hp: 10, w: 0.9, h: 0.6, dmg: 6, glow: "#b58cff", chip: "#6a4a9a", frag: "batwing", chance: 0.5, max: 6 },   // hp +4 and dmg +2 per weapon tier (see newEnemy)
    wolf: { n: "Frost Wolf", hp: 30, w: 1.3, h: 0.9, dmg: 15, glow: "#9fe8ff", chip: "#cfdde6", frag: "wolfpelt", chance: 0.6, max: 3 },
    gator: { n: "Bog Gator", hp: 42, w: 1.9, h: 0.7, dmg: 18, glow: "#a8e05a", chip: "#4d7a3a", frag: "gatorscale", chance: 0.65, max: 2 },
    slime: { n: "Slime", hp: 16, w: 0.9, h: 0.75, dmg: 7, glow: "#7dff6a", chip: "#5ad04a", frag: "slimeball", chance: 0.7, max: 4 },   // small slimes (from a split): hp 6, dmg 4
    wasp: { n: "Ember Wasp", hp: 12, w: 0.8, h: 0.6, dmg: 10, glow: "#ffcf3a", chip: "#e0a020", frag: "stinger", chance: 0.55, max: 3 }
  };
  var FROG = { aggro: 5.5, reach: 2.5, wind: 0.5, lash: 0.2, recover: 0.95, hopV: 10, hopX: 3.2 };
  // Dusk Bat: a night-only flier. It spawns in the sky above you, drifts overhead, shows red eyes (wind-up), then dives in a straight line. Step aside during the dive.
  // from/to = clock times (0-480) when bats are out (late dusk to early dawn); a roof or the ground stops them, and at dawn they flap away.
  var BAT = { hover: 4, wind: 0.5, dive: 0.6, speed: 9.5, cruise: 4.2, from: 268, to: 446 };
  // ---------- WILD CREATURES: Frost Wolf (Frostfen), Bog Gator (Murkwater water), slimes (caves everywhere + night surface), Ember Wasp (Ember Bog, daytime) ----------
  // Each one telegraphs before it attacks, so a careful player can always dodge:
  //   Wolf: stalks you, CROUCHES ("!") then lunges in a leap. Jump over it or step back.
  //   Gator: floats in lakes and crawls the shore, its JAWS OPEN, then it snaps forward a short way. Get out of reach.
  //   Slime: hops at you. Big slimes split into two small ones when popped.
  //   Wasp: buzzes around you, its body GLOWS RED, then it dashes straight at you. Step aside.
  var WOLF = { aggro: 9, lungeAt: 3.6, wind: 0.45, lungeV: 9.5, lungeUp: 7.5, recover: 0.85, walk: 1.5, run: 4.1, body: 5 };
  var GATOR = { aggro: 6.5, reach: 1.7, wind: 0.6, snap: 0.28, recover: 1.1, walk: 0.8, swim: 2.5, crawl: 1.9, roam: 10, body: 6 };
  var SLIME = { aggro: 9, hopV: 9.2, hopX: 3.3 };
  var WASP = { hover: 2.4, wind: 0.45, dash: 0.42, speed: 11, cruise: 4.8 };
  var SLIME_PAL = [   // by biome: Bog Slime, Magma Slime, Frost Slime
    { n: "Bog Slime", c: "#5ad04a", hi: "#9af58a", dk: "#2a7a24", glow: "#7dff6a" },
    { n: "Magma Slime", c: "#ff7a2a", hi: "#ffc24a", dk: "#a83a10", glow: "#ff8a3d" },
    { n: "Frost Slime", c: "#6ab8ff", hi: "#c8ecff", dk: "#2a5a9a", glow: "#9fe8ff" }
  ];
  var KSTAT = { bug: "bugs", frog: "frogs", bat: "bats", wolf: "wolves", gator: "gators", slime: "slimes", wasp: "wasps" };
  var FLIER = { bat: 1, wasp: 1 };
  var SEEN_TIP = {
    wolf: [1, "Frost Wolves hunt in pairs! When one crouches, jump over it or back away before it lunges.", "#9fe8ff"],
    gator: [2, "A Bog Gator lurks in the water! When its jaws open, get out of reach.", "#a8e05a"],
    slime: [4, "Slimes! Big ones split in two when you pop them.", "#7dff6a"],
    wasp: [8, "Ember Wasps! When one glows red it is about to dash at you: step aside.", "#ffcf3a"]
  };
  function updateWolf(e, dt) {
    var dx = p.x - e.x, near = Math.abs(dx) < WOLF.aggro && Math.abs(p.y - e.y) < 4 && hp > 0, vx = 0;
    if (e.hurt > 0) { if (e.st === "wind") e.st = "stalk"; vx = e.on ? 0 : e.hvx; }
    else if (e.st === "lunge") { e.t += dt; vx = e.hvx; if (e.on && e.t > 0.15) { e.st = "recover"; e.t = WOLF.recover; e.cd = 1.2; } }
    else if (e.st === "recover") { e.t -= dt; if (e.t <= 0) e.st = "stalk"; }
    else if (e.st === "wind") { e.t -= dt; e.dir = dx >= 0 ? 1 : -1; if (e.t <= 0) { e.st = "lunge"; e.t = 0; e.vy = -WOLF.lungeUp; e.on = false; e.hvx = e.dir * WOLF.lungeV; thud(240, 0.07); } }
    else if (near) {
      e.st = "stalk"; e.dir = dx >= 0 ? 1 : -1;
      if (Math.abs(dx) < WOLF.lungeAt && e.cd <= 0 && e.on) { e.st = "wind"; e.t = WOLF.wind; thud(130, 0.06); }
      else vx = Math.abs(dx) > 1 ? e.dir * WOLF.run : 0;
    } else {
      e.st = "patrol"; e.t -= dt; if (e.t <= 0) { e.t = 2 + Math.random() * 3; if (Math.random() < 0.35) e.dir = -e.dir; }
      var ax = Math.floor(e.x + e.dir * 1.0); if (!blocks(ax, Math.floor(e.y + 0.3)) && !blocks(ax, Math.floor(e.y + 1.3)) && !blocks(ax, Math.floor(e.y + 2.3))) e.dir = -e.dir;
      vx = e.dir * WOLF.walk;
    }
    if (e.blocked && e.on && vx && e.st !== "lunge") e.vy = -11.5;   // hop up a ledge while running
    e.mv = vx; moveEnemy(e, dt, vx);
    if (hp <= 0 || hurtGrace > 0 || e.hurt > 0 || !overlapP(e)) return;
    if (e.st === "lunge") { hurt(e.dmg, "wolf"); shoved(e); e.hvx *= 0.25; e.st = "recover"; e.t = WOLF.recover; e.cd = 1.4; }
    else if (e.st !== "recover") { hurt(WOLF.body, "wolf"); shoved(e); }
  }
  function gatorWet(e) { return TILES[get(Math.floor(e.x), Math.floor(e.y - 0.35))].kind === "water"; }
  function updateGator(e, dt) {
    var dx = p.x - e.x, near = Math.abs(dx) < GATOR.aggro && Math.abs(p.y - e.y) < 3 && hp > 0, vx = 0, wet = gatorWet(e); e.wet = wet;
    if (wet) e.vy = Math.min(e.vy, -1.5);   // floats: bobs along the surface with only its back, eyes and snout above the water
    if (e.hurt > 0) { if (e.st === "wind") { e.st = "stalk"; e.jaw = 0; } }
    else if (e.st === "wind") { e.t -= dt; e.dir = dx >= 0 ? 1 : -1; e.jaw = 0.6 * (1 - e.t / GATOR.wind); if (e.t <= 0) { e.st = "snap"; e.t = GATOR.snap; e.hvx = e.dir * 6.5; thud(160, 0.08); } }
    else if (e.st === "snap") { e.t -= dt; vx = e.hvx; e.jaw = 0.6 * Math.max(0, e.t / GATOR.snap - 0.3); if (e.t <= 0) { e.st = "recover"; e.t = GATOR.recover; e.cd = 1.5; e.jaw = 0; } }
    else if (e.st === "recover") { e.t -= dt; if (e.t <= 0) e.st = "lurk"; }
    else if (near) {
      e.st = "stalk"; e.dir = dx >= 0 ? 1 : -1; e.jaw = 0.05;
      if (Math.abs(dx) < GATOR.reach + e.w / 2 + 0.4 && e.cd <= 0) { e.st = "wind"; e.t = GATOR.wind; thud(90, 0.07); }
      else vx = e.dir * (wet ? GATOR.swim : GATOR.crawl);
    } else {
      e.st = "lurk"; e.jaw = 0; e.t -= dt; if (e.t <= 0) { e.t = 2.5 + Math.random() * 3; if (Math.random() < 0.4) e.dir = -e.dir; }
      if (Math.abs(e.x - e.hx) > GATOR.roam) e.dir = e.hx > e.x ? 1 : -1;   // never wanders far from its lake
      if (e.blocked) e.dir = -e.dir; vx = e.dir * (wet ? GATOR.walk : GATOR.walk * 0.7);
    }
    e.mv = vx; moveEnemy(e, dt, vx);
    if (hp <= 0 || hurtGrace > 0 || e.hurt > 0) return;
    if (e.st === "snap") {   // the jaws reach out in front of the head
      var a = e.x + e.dir * e.w * 0.3, b = e.x + e.dir * (e.w / 2 + GATOR.reach * 0.7), l = Math.min(a, b), r = Math.max(a, b);
      if (p.x + PW / 2 > l && p.x - PW / 2 < r && p.y > e.y - 1.1 && p.y - PH < e.y) { hurt(e.dmg, "gator"); shoved(e); e.st = "recover"; e.t = GATOR.recover; e.cd = 1.6; e.jaw = 0; return; }
    }
    if (e.st !== "recover" && overlapP(e)) { hurt(GATOR.body, "gator"); shoved(e); }
  }
  function updateSlime(e, dt) {
    var dx = p.x - e.x, near = Math.abs(dx) < SLIME.aggro && Math.abs(p.y - e.y) < 5 && hp > 0, sm = e.small ? 0.8 : 1;
    e.sq = Math.max(0, (e.sq || 0) - dt * 4);
    if (e.on) {
      if (e.st === "hop") { e.st = "rest"; e.t = (near ? 0.5 : 1.1) + Math.random() * 0.8; e.sq = 1; }
      e.hvx = 0;
      if (e.hurt <= 0) {
        e.t -= dt;
        if (e.t <= 0) {
          if (near) e.dir = dx >= 0 ? 1 : -1; else if (Math.abs(e.x - e.hx) > 7) e.dir = e.hx > e.x ? 1 : -1; else if (Math.random() < 0.4) e.dir = -e.dir;
          e.st = "hop"; e.vy = -SLIME.hopV * sm * (near ? 1 : 0.75); e.on = false; e.hvx = e.dir * SLIME.hopX * sm * (near ? 1.15 : 0.6);
        }
      }
    }
    moveEnemy(e, dt, e.on ? 0 : e.hvx);
    if (hp > 0 && hurtGrace <= 0 && e.hurt <= 0 && e.cd <= 0 && overlapP(e)) { hurt(e.dmg, "slime"); shoved(e); e.cd = 0.9; }
  }
  function updateWasp(e, dt) {
    var cx = p.x - e.x, cy = (p.y - PH * 0.55) - (e.y - e.h * 0.5), tvx = 0, tvy = 0, alive = hp > 0;
    e.fl += dt * 38; e.dir = e.st === "dash" ? (e.ax >= 0 ? 1 : -1) : cx >= 0 ? 1 : -1;
    if (e.leave > 0) { e.leave -= dt; tvx = e.ph > 3 ? 4 : -4; tvy = -5; if (e.leave <= 0 || e.y < 1.6) e.gone = true; }
    else if (e.hurt > 0) { tvx = 0; tvy = 0; }
    else if (e.st === "away") { e.t -= dt; tvx = -e.dir * 3; tvy = -2.6; if (e.t <= 0) e.st = "hover"; }
    else if (e.st === "wind") {
      e.t -= dt; tvx = Math.sin(e.tt * 70) * 1.2; tvy = Math.cos(e.tt * 55) * 0.8;
      if (e.t <= 0) { var ax = p.x - e.x, ay = (p.y - PH * 0.5) - (e.y - e.h * 0.5), l = Math.max(0.5, Math.sqrt(ax * ax + ay * ay)); e.ax = ax / l * WASP.speed; e.ay = ay / l * WASP.speed; e.st = "dash"; e.t = WASP.dash; thud(900, 0.04); }
    } else if (e.st === "dash") { e.t -= dt; tvx = e.ax; tvy = e.ay; if (e.t <= 0 || e.blocked) { e.st = "away"; e.t = 0.7; e.cd = 1.3 + Math.random(); } }
    else {   // hover: darts around beside you, a little above head height
      var side = Math.sin(e.tt * 0.7 + e.ph) > 0 ? 1 : -1, tx = p.x + side * 3.2 + Math.sin(e.tt * 3.1 + e.ph) * 0.8, ty = p.y - PH - WASP.hover + Math.sin(e.tt * 4.3 + e.ph) * 0.6;
      tvx = clamp((tx - e.x) * 2.4, -WASP.cruise, WASP.cruise); tvy = clamp((ty - (e.y - e.h * 0.5)) * 2.4, -WASP.cruise, WASP.cruise);
      if (alive && e.cd <= 0 && Math.abs(cx) < 6 && cy > -2 && cy < 6) { e.st = "wind"; e.t = WASP.wind; thud(1100, 0.03); }
    }
    var sm = Math.min(1, dt * (e.st === "dash" ? 30 : 6)); e.vx += (tvx - e.vx) * sm; e.vy += (tvy - e.vy) * sm;
    moveBat(e, dt);
    if (alive && e.hurt <= 0 && e.st === "dash" && hurtGrace <= 0 && overlapP(e)) { hurt(e.dmg, "wasp"); shoved(e); e.st = "away"; e.t = 0.7; e.cd = 1.5 + Math.random(); }
  }
  function waterNear(cx) { for (var q = -8; q <= 8; q++) { var xx = clamp(cx + q, 0, W - 1); if (get(xx, col[xx] - 1) === T.WATER) return xx; } return -1; }
  var grow = [], canBusy = false, canAcc = 0;
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
    var d = ENEMY[k], hp0 = k === "bat" ? d.hp + 4 * S.wpn : d.hp; return { k: k, x: x, y: y, hx: x, vx: 0, vy: 0, kv: 0, on: false, dir: Math.random() < 0.5 ? -1 : 1, hp: hp0, mx: hp0, dmg: k === "bat" ? d.dmg + 2 * S.wpn : d.dmg, w: d.w, h: d.h, hurt: 0, dead: 0, def: false, st: k === "frog" ? "idle" : k === "bat" || k === "wasp" ? "hover" : k === "gator" ? "lurk" : k === "slime" ? "rest" : "patrol", b: world.bio[clamp(Math.floor(x), 0, W - 1)], jaw: 0, sq: 0, mv: 0, wet: false, small: false, t: 1 + Math.random() * 2, tt: Math.random() * 6, cd: 0, ext: 0, hvx: 0, blocked: false, fl: Math.random() * 6, ph: Math.random() * 6, leave: 0, gone: false, ax: 0, ay: 0 };
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
    if (e.def) return; e.hp -= dmg; e.hurt = 0.3; e.kv = face * (e.k === "bug" ? 6 : e.k === "gator" ? 2.5 : e.k === "wolf" ? 4.5 : 5); text(e.x, e.y - e.h - 0.3, "-" + Math.round(dmg), "#ffe48a");
    chips(e.x, e.y - e.h * 0.5, ENEMY[e.k].chip, 8, 6); thud(180 + Math.random() * 60, 0.06);
    if (FLIER[e.k] && e.hp > 0 && e.st !== "away") { e.st = "away"; e.t = 0.7; e.cd = 1.2; }   // a hit scares a bat or wasp off for a moment
    if (e.k === "wolf" && e.st === "wind") e.st = "stalk";
    if (e.hp > 0) return;
    var d = ENEMY[e.k], sp = e.k === "slime" ? SLIME_PAL[e.b] || SLIME_PAL[0] : null;
    e.def = true; e.dead = 0.6; chips(e.x, e.y - e.h * 0.5, sp ? sp.glow : d.glow, 16, 8); snd("open", "Epic");
    if (e.k === "slime" && !e.small) {   // a big slime splits into two little ones
      [-1, 1].forEach(function (s2) { var kid = newEnemy("slime", clamp(e.x + s2 * 0.3, 1.5, W - 1.5), e.y); kid.small = true; kid.b = e.b; kid.w = 0.55; kid.h = 0.45; kid.hp = kid.mx = 6; kid.dmg = 4; kid.kv = s2 * 5; kid.vy = -6; kid.cd = 0.6; kid.t = 0.6; if (!eBoxHit(kid.x, kid.y, kid.w, kid.h)) enemies.push(kid); });
    }
    var kills = ++S.st[KSTAT[e.k]];
    var drop = (kills === 1 && !e.small) || Math.random() < d.chance * (e.small ? 0.35 : 1);
    popup("Enemy defeated", (sp ? (e.small ? "Little " : "") + sp.n : d.n) + (drop ? " \u2022 +1 " + ITEMS[d.frag].n : ""), sp ? sp.glow : d.glow, "\u2694");
    var MEAT = { frog: 0.35, wolf: 0.6, gator: 0.7 }; if (MEAT[e.k] && ITEMS.rawmeat && Math.random() < MEAT[e.k]) give("rawmeat", 1, e.x - 0.5, e.y - e.h - 1.3, true);
    if (drop) {   // loot: a Delve item, and (for bugs and frogs) the same Fragment is added to your Adventure bag
      give(d.frag, 1, e.x - 0.5, e.y - e.h - 0.9, true);
      try { if (typeof Fragments !== "undefined" && (e.k === "bug" || e.k === "frog")) Fragments.add(ITEMS[d.frag].frag, 1); } catch (er) {}
    }
    checkGoals();
  }
  function strike() {   // one weapon swing: hits every enemy in front of you
    if (toolBroken("wpn")) return;
    var reach = [0, 2.7, 2.2, 2.4, 2.4][S.wpn], f = p.face, xa = p.x - f * 0.3, xb = p.x + f * reach, lo = Math.min(xa, xb), hi = Math.max(xa, xb);
    var hits = 0;
    enemies.forEach(function (e) { if (!e.def && e.x + e.w / 2 > lo && e.x - e.w / 2 < hi && e.y > p.y - PH - (FLIER[e.k] ? 1.2 : 0.5) && e.y - e.h < p.y + 0.3) { hits++; damageEnemy(e, WEAPONS[S.wpn].dmg, f); } });
    if (hits) wear("wpn", 1);
  }
  function spawnEnemy() {   // one try every few seconds, just off screen: what can appear depends on the biome there, day or night, and whether you are underground
    var cnt = {}, tot = 0; enemies.forEach(function (e) { if (!e.def && e.k !== "bat") { cnt[e.k] = (cnt[e.k] || 0) + 1; tot++; } });
    if (tot >= 5) return;
    var side = Math.random() < 0.5 ? -1 : 1, x = clamp(Math.floor(p.x + side * (vw / 2 / ts + 2 + Math.random() * 8)), 3, W - 4) + 0.5, y = -1, cx = Math.floor(x);
    var b = world.bio[cx], night = batNight(S.time), under = p.y > col[clamp(Math.floor(p.x), 0, W - 1)] + 7, opts = [], tw = 0, wx = -1;
    function add(k, w) { if ((cnt[k] || 0) < ENEMY[k].max) { opts.push([k, w]); tw += w; } }
    if (b === 0) { add("bug", under ? 4 : 5); if (!under) add("frog", 3); if (S.wpn >= 2 && !under && (wx = waterNear(cx)) >= 0) add("gator", 3); }
    else if (b === 1) { if (!night && !under) add("wasp", 5); if (under) add("bug", 5); }   // Bramble Bugs also burrow through Ember Bog caves
    else add("wolf", under ? 5 : 4);   // Frost Wolves den in Frostfen caverns too
    if (under || night) add("slime", b === 0 ? 3 : 5);
    if (!opts.length) return;
    var r = Math.random() * tw, k = opts[0][0]; for (var q = 0; q < opts.length; q++) { r -= opts[q][1]; if (r <= 0) { k = opts[q][0]; break; } }
    if (k === "wasp") { var gy = col[cx]; y = Math.min(gy - 3 - Math.random() * 3, p.y - 3); if (y < 2) return; }
    else if (k === "gator") {   // in the lake, at the waterline (or on the shore right beside it)
      x = wx + 0.5; cx = wx; var wy = col[wx] - 1; while (wy > 0 && get(wx, wy - 1) === T.WATER) wy--; y = wy + 0.6;
    } else if (under ? k !== "gator" : (k === "bug" && Math.random() < 0.4)) {   // cave dwellers (when you are underground, everything spawns in the caves around you)
      for (var yy = Math.floor(p.y) - 8; yy <= Math.floor(p.y) + 8; yy++) if (!blocks(cx, yy) && !blocks(cx, yy - 1) && blocks(cx, yy + 1) && TILES[get(cx, yy)].kind !== "water" && yy > col[cx] + 3) { y = yy + 1; break; }
    } else {   // on the ground: try a few nearby columns (wide bodies like wolves need room on hilly ground)
      for (var tq = 0; tq < 7 && y < 0; tq++) {
        var tx = clamp(cx + (tq % 2 ? 1 : -1) * Math.ceil(tq / 2), 2, W - 3), cy = col[tx];
        if (cy <= 0 || cy >= H || blocks(tx, cy - 1) || TILES[get(tx, cy - 1)].kind === "water") continue;
        for (var up = 0; up <= 2; up++) if (!eBoxHit(tx + 0.5, cy - up, ENEMY[k].w, ENEMY[k].h)) { x = tx + 0.5; y = cy - up; break; }
      }
    }
    if (y < 0 || eBoxHit(x, y, ENEMY[k].w, ENEMY[k].h)) return;
    enemies.push(newEnemy(k, x, y));
    if (k === "wolf" && (cnt.wolf || 0) + 1 < ENEMY.wolf.max && !eBoxHit(x - side * 1.6, y, ENEMY.wolf.w, ENEMY.wolf.h)) enemies.push(newEnemy("wolf", x - side * 1.6, y));   // wolves come in pairs
    var tip = SEEN_TIP[k]; if (tip && !(S.st.seen & tip[0])) { S.st.seen |= tip[0]; toast(tip[1], tip[2]); }
  }
  function updateEnemies(dt) {
    if (panelOpen) return;
    var underground = p.y > col[clamp(Math.floor(p.x), 0, W - 1)] + 7;
    spawnT -= dt; if (spawnT <= 0) { spawnT = underground ? 2.6 + Math.random() * 2 : 4 + Math.random() * 3; if (S.wpn >= 1) spawnEnemy(); }   // caves are busier
    batT -= dt; if (batT <= 0) { batT = (3.2 + Math.random() * 3) * (1 - 0.35 * clamp((S.time - BAT.from) / 150, 0, 1)); if (S.wpn >= 1 && batNight(S.time) && !underground) spawnBat(); }   // bats arrive faster as the night goes on
    enemies.forEach(function (e) { if (e.k === "bat" && !e.def && !e.leave && (!batNight(S.time) || underground)) e.leave = underground ? 4 : 3 + Math.random() * 2; });   // dawn, or you went underground
    enemies.forEach(function (e) { if (e.k === "wasp" && !e.def && !e.leave && (batNight(S.time) || underground)) e.leave = 2.5 + Math.random() * 2; });   // wasps head home at night, or when you go underground
    if (swingQ > 0) { swingQ -= dt; if (swingQ <= 0) strike(); }
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i]; e.tt += dt; e.hurt = Math.max(0, e.hurt - dt); e.cd = Math.max(0, e.cd - dt);
      if (e.def) { e.dead -= dt; moveEnemy(e, dt, 0); if (e.dead <= 0) enemies.splice(i, 1); continue; }
      if (e.gone || Math.abs(e.x - p.x) > 38 || Math.abs(e.y - p.y) > 44) { if (e.gone) chips(e.x, e.y - e.h * 0.5, ENEMY[e.k].chip, 6, 4); enemies.splice(i, 1); continue; }
      if (e.k === "bug") updateBug(e, dt); else if (e.k === "bat") updateBat(e, dt); else if (e.k === "wolf") updateWolf(e, dt); else if (e.k === "gator") updateGator(e, dt); else if (e.k === "slime") updateSlime(e, dt); else if (e.k === "wasp") updateWasp(e, dt); else updateFrog(e, dt);
    }
  }
  // ---------- CAVE CREATURES (hole-cave floors, seen from above) ----------
  // Each floor is stocked once, the first time you reach it (only once you carry a weapon). Deeper floors hold more of them, and tougher ones.
  // Every biome has slimes and bats; Mudhollow adds Bramble Bugs, Cinder Hollow adds Ember Wasps, Frostvault adds Frost Wolves (floor 3 and down).
  // They reuse the surface art and attacks, flattened to top-down moves: slimes hop at you, bugs charge, bats and wasps circle then dive, wolves lunge.
  // Swing your weapon toward where you aim (tap or click) to hit everything in front of you. Clear a floor for a small reward.
  var CMOB = { slime: { r: 0.34, spd: 0, aggro: 7 }, bat: { r: 0.3, spd: 3.2, aggro: 8, fly: 1 }, bug: { r: 0.36, spd: 2.1, aggro: 7 }, wasp: { r: 0.28, spd: 3.8, aggro: 8, fly: 1 }, wolf: { r: 0.44, spd: 3.4, aggro: 8 } };
  var CREACH = [0, 1.9, 1.6, 1.8, 1.8], ckx = 0, cky = 0;
  function caveKinds(b, f) {
    var L = [["slime", 4], ["bat", 3]];
    if (b === 0) L.push(["bug", 4]); else if (b === 1) L.push(["wasp", 3]); else if (f >= 3) L.push(["wolf", 2]); else L.push(["slime", 2]);
    return L;
  }
  function stockFloor(F, f) {
    F.stocked = true; F.mobs = []; if (F.bld || S.wpn < 1) return;
    var n = Math.min(9, 2 + Math.floor(f * 0.6)), L = caveKinds(F.biome, f), tw = 0, free = [], i, x, y;
    L.forEach(function (q) { tw += q[1]; });
    for (i = 0; i < F.w * F.h; i++) {
      x = i % F.w; y = (i / F.w) | 0; if (SC.solid(F, x, y)) continue;
      var a = x + 0.5 - F.spawn.x, b2 = y + 0.5 - F.spawn.y, c = x - F.down.x, d = y - F.down.y;
      if (a * a + b2 * b2 > 64 && c * c + d * d > 9) free.push(i);
    }
    for (var m = 0; m < n && free.length; m++) {
      var r = Math.random() * tw, k = L[0][0]; for (var q = 0; q < L.length; q++) { r -= L[q][1]; if (r <= 0) { k = L[q][0]; break; } }
      var ci = free.splice(Math.floor(Math.random() * free.length), 1)[0];
      F.mobs.push(newCaveMob(k, ci % F.w + 0.5, ((ci / F.w) | 0) + 0.7, F, f));
    }
    F.mobN = F.mobs.length;
  }
  function newCaveMob(k, x, y, F, f) {
    var e = newEnemy(k, x, y), sc = 1 + 0.08 * (f - 1);
    e.b = F.biome; e.r = CMOB[k].r; e.hp = e.mx = Math.round(ENEMY[k].hp * sc); e.dmg = Math.round(ENEMY[k].dmg * (1 + 0.045 * (f - 1)));
    e.z = 0; e.kx = 0; e.ky = 0; e.ang = Math.random() * 6.28; e.wx = 0; e.wy = 0; e.hx = x; e.hy = y; e.cd = 1.2 + Math.random(); e.on = true; e.st = k === "slime" ? "rest" : FLIER[k] ? "hover" : "patrol"; e.t = Math.random() * 1.5;
    return e;
  }
  function mobFree(F, x, y, r, fly) {
    var x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r * 0.8), y1 = Math.floor(y - 0.001);
    for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) { if (xx < 0 || yy < 0 || xx >= F.w || yy >= F.h) return false; var i = yy * F.w + xx; if (F.wall[i] || (!fly && (F.node[i] || (F.sol && F.sol[i])))) return false; }
    return true;
  }
  function moveMob(F, m, dt, vx, vy) {   // fliers pass over boulders but not through walls
    var fly = !!CMOB[m.k].fly, sub = Math.ceil(dt / 0.02), h = dt / sub; m.blocked = false;
    m.kx *= Math.max(0, 1 - 8 * dt); m.ky *= Math.max(0, 1 - 8 * dt);
    for (var s = 0; s < sub; s++) {
      var nx = m.x + (vx + m.kx) * h, ny = m.y + (vy + m.ky) * h;
      if (mobFree(F, nx, m.y, m.r, fly)) m.x = nx; else { m.blocked = true; m.kx = 0; }
      if (mobFree(F, m.x, ny, m.r, fly)) m.y = ny; else { m.blocked = true; m.ky = 0; }
    }
  }
  function caveHurt(m, n) {   // the player takes a hit and is shoved away from the creature
    if (hurtGrace > 0 || hp <= 0) return false;
    var dx = cp.x - m.x, dy = cp.y - m.y, l = Math.sqrt(dx * dx + dy * dy) || 1; ckx = dx / l * 7; cky = dy / l * 7;
    hurt(n, m.k); return true;
  }
  function updateCaveMobs(dt) {
    var F = cave.F; if (!F.stocked) stockFloor(F, cave.f); if (!F.mobs || !F.mobs.length) return;
    for (var i = F.mobs.length - 1; i >= 0; i--) {
      var m = F.mobs[i], C = CMOB[m.k]; m.tt += dt; m.hurt = Math.max(0, m.hurt - dt); m.cd = Math.max(0, m.cd - dt);
      if (m.def) { m.dead -= dt; m.z = Math.max(0, m.z - dt * 3); moveMob(F, m, dt, 0, 0); if (m.dead <= 0) F.mobs.splice(i, 1); continue; }
      var dx = cp.x - m.x, dy = cp.y - m.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01, nx = dx / d, ny = dy / d, vx = 0, vy = 0, near = d < C.aggro && hp > 0, touch = d < m.r + 0.34;
      if (m.hurt > 0) { moveMob(F, m, dt, 0, 0); continue; }
      if (m.k === "slime") {
        m.sq = Math.max(0, (m.sq || 0) - dt * 4);
        if (m.st === "hop") {
          m.t += dt; var pr = m.t / 0.42; m.z = Math.sin(Math.PI * Math.min(1, pr)) * (m.small ? 0.3 : 0.45); m.on = false; m.vy = pr < 0.5 ? -6 : 6; vx = m.hvx; vy = m.hvy;
          if (pr >= 1) { m.st = "rest"; m.t = (near ? 0.45 : 1) + Math.random() * 0.7; m.z = 0; m.on = true; m.vy = 0; m.sq = 1; }
        } else {
          m.t -= dt; if (m.t <= 0) { var a = near ? Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.4 : Math.random() * 6.28, sp = (m.small ? 2.6 : 3.2) * (near ? 1.15 : 0.6); m.hvx = Math.cos(a) * sp; m.hvy = Math.sin(a) * sp; m.st = "hop"; m.t = 0; }
        }
        if (Math.abs(m.hvx) > 0.1) m.dir = m.hvx > 0 ? 1 : -1;
        moveMob(F, m, dt, vx, vy);
        if (touch && m.z < 0.2 && m.cd <= 0 && caveHurt(m, m.dmg)) m.cd = 0.9;
        continue;
      }
      if (C.fly) {   // bats and wasps: circle you, show the tell (red eyes / red glow), then dive in a straight line
        m.fl += dt * (m.k === "wasp" ? 38 : 11);
        var dive = m.k === "wasp" ? "dash" : "dive", spd = m.k === "wasp" ? 10.5 : 8.5;
        if (m.st === "away") { m.t -= dt; vx = -nx * 3; vy = -ny * 3; if (m.t <= 0) m.st = "hover"; }
        else if (m.st === "wind") { m.t -= dt; vx = Math.sin(m.tt * 60) * 0.8; if (m.t <= 0) { m.ax = nx * spd; m.ay = ny * spd; m.st = dive; m.t = 0.42; thud(m.k === "wasp" ? 900 : 300, 0.04); } }
        else if (m.st === dive) { m.t -= dt; vx = m.ax; vy = m.ay; if (m.t <= 0 || m.blocked) { m.st = "away"; m.t = 0.6; m.cd = 1.3 + Math.random(); } }
        else if (near) {
          m.ang += dt * (m.k === "wasp" ? 1.8 : 1.2); var orb = m.k === "wasp" ? 2.2 : 2.7, tx = cp.x + Math.cos(m.ang) * orb, ty = cp.y - 0.4 + Math.sin(m.ang) * orb * 0.7;
          vx = clamp((tx - m.x) * 2.2, -C.spd, C.spd); vy = clamp((ty - m.y) * 2.2, -C.spd, C.spd);
          if (m.cd <= 0 && d < 4.5) { m.st = "wind"; m.t = 0.45; thud(m.k === "wasp" ? 1100 : 760, 0.04); }
        } else { m.t -= dt; if (m.t <= 0) { var wa = Math.random() * 6.28; m.wx = Math.cos(wa) * 1.4; m.wy = Math.sin(wa) * 1.4; m.t = 1 + Math.random() * 2; } vx = m.wx; vy = m.wy; }
        m.dir = m.st === dive ? (m.ax >= 0 ? 1 : -1) : dx >= 0 ? 1 : -1;
        moveMob(F, m, dt, vx, vy); if (m.blocked && m.st !== dive) { m.wx = -m.wx; m.wy = -m.wy; }
        if (touch && m.st === dive && caveHurt(m, m.dmg)) { m.st = "away"; m.t = 0.6; m.cd = 1.4 + Math.random(); }
        continue;
      }
      // ground hunters: Bramble Bug (charges) and Frost Wolf (crouches, then lunges in a leap)
      var wolf = m.k === "wolf", go = wolf ? "lunge" : "charge", wind = wolf ? 0.45 : 0.35;
      if (m.st === "wind") { m.t -= dt; m.dir = dx >= 0 ? 1 : -1; if (m.t <= 0) { m.st = go; m.t = wolf ? 0.4 : 0.5; m.ax = nx * (wolf ? 9 : 7.5); m.ay = ny * (wolf ? 9 : 7.5); thud(wolf ? 240 : 200, 0.06); } }
      else if (m.st === go) { m.t -= dt; vx = m.ax; vy = m.ay; if (wolf) { m.z = Math.sin(Math.PI * clamp(1 - m.t / 0.4, 0, 1)) * 0.5; m.vy = m.t > 0.2 ? -6 : 6; } if (m.t <= 0 || m.blocked) { m.st = "retreat"; m.t = 0.55; m.cd = 1.2; m.z = 0; m.vy = 0; } }
      else if (m.st === "retreat") { m.t -= dt; vx = -nx * 1.6; vy = -ny * 1.6; if (m.t <= 0) m.st = "patrol"; }
      else if (near) {
        m.st = wolf ? "stalk" : "patrol"; vx = nx * C.spd; vy = ny * C.spd;
        if (d < (wolf ? 3.6 : 3.1) && m.cd <= 0) { m.st = "wind"; m.t = wind; thud(wolf ? 130 : 520, 0.05); vx = vy = 0; }
      } else { m.st = "patrol"; m.t -= dt; if (m.t <= 0) { var ga = Math.random() * 6.28; m.wx = Math.cos(ga) * C.spd * 0.4; m.wy = Math.sin(ga) * C.spd * 0.4; m.t = 1.2 + Math.random() * 2; } vx = m.wx; vy = m.wy; }
      if (Math.abs(vx) > 0.2 && m.st !== "wind") m.dir = vx > 0 ? 1 : -1;
      m.mv = Math.sqrt(vx * vx + vy * vy); moveMob(F, m, dt, vx, vy); if (m.blocked && m.st === "patrol") { m.wx = -m.wx; m.wy = -m.wy; }
      if (touch && m.cd <= 0 || (touch && m.st === go)) { if (caveHurt(m, m.st === go ? m.dmg : Math.ceil(m.dmg * 0.45))) { m.cd = 1; if (m.st === go) { m.st = "retreat"; m.t = 0.55; m.z = 0; } } }
    }
  }
  function caveSwing(dt) {   // weapon in a cave: a swing toward where you aim hits every creature in a cone in front of you
    if (!aim.down || !S.wpn) return;
    if (toolBroken("wpn")) { nag("Your weapon is broken. Repair it in the Craft tab."); return; }
    cool -= dt; if (cool > 0) return; cool = WEAPONS[S.wpn].cd; S.st.swings++;
    var ax = (aim.mx - ox) / ts - cp.x, ay = (aim.my - oy) / ts - (cp.y - 0.5), al = Math.sqrt(ax * ax + ay * ay) || 1; ax /= al; ay /= al; if (Math.abs(ax) > 0.15) cp.face = ax < 0 ? -1 : 1;
    thud(300 + S.wpn * 70, 0.04);
    for (var s2 = 0; s2 < 5; s2++) { var an = Math.atan2(ay, ax) + (s2 - 2) * 0.32; parts.push({ x: cp.x + Math.cos(an) * 1.1, y: cp.y - 0.5 + Math.sin(an) * 1.1, vx: Math.cos(an) * 2.5, vy: Math.sin(an) * 2.5 - 1, life: 0.2, max: 0.25, c: WEAPONS[S.wpn].c, s: 3 }); }
    var F = cave.F, hits = 0; if (!F.mobs) return;
    F.mobs.forEach(function (m) {
      if (m.def) return; var dx = m.x - cp.x, dy = (m.y - 0.3) - (cp.y - 0.5), d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      if (d > CREACH[S.wpn] + m.r || (dx * ax + dy * ay) / d < 0.2) return;
      hits++; damageCaveMob(m, WEAPONS[S.wpn].dmg, dx / d, dy / d);
    });
    if (hits) wear("wpn", 1);
  }
  function damageCaveMob(m, dmg, ux, uy) {
    var F = cave.F, d = ENEMY[m.k], sp = m.k === "slime" ? SLIME_PAL[m.b] || SLIME_PAL[0] : null;
    m.hp -= dmg; m.hurt = 0.3; m.kx = ux * 6; m.ky = uy * 6; text(m.x, m.y - 1, "-" + Math.round(dmg), "#ffe48a"); chips(m.x, m.y - 0.4, sp ? sp.c : d.chip, 8, 6); thud(180 + Math.random() * 60, 0.06);
    if (CMOB[m.k].fly && m.hp > 0) { m.st = "away"; m.t = 0.6; m.cd = 1.1; }
    if ((m.st === "wind") && m.hp > 0) m.st = "patrol";
    if (m.hp > 0) return;
    m.def = true; m.dead = 0.6; chips(m.x, m.y - 0.4, sp ? sp.glow : d.glow, 16, 8); snd("open", "Epic");
    if (m.k === "slime" && !m.small) [-1, 1].forEach(function (s2) {   // big slimes split in two
      var kid = newCaveMob("slime", m.x + s2 * 0.25, m.y, F, cave.f); kid.small = true; kid.r = 0.22; kid.hp = kid.mx = Math.round(6 * (1 + 0.08 * (cave.f - 1))); kid.dmg = Math.max(3, Math.round(m.dmg * 0.55)); kid.kx = s2 * 5 + uy * 2; kid.ky = -ux * 2; kid.cd = 0.6; kid.t = 0.5;
      if (mobFree(F, kid.x, kid.y, kid.r, false)) F.mobs.push(kid);
    });
    var kills = ++S.st[KSTAT[m.k]]; S.st.ckills++;
    var drop = (kills === 1 && !m.small) || Math.random() < d.chance * (m.small ? 0.35 : 1);
    popup("Enemy defeated", (sp ? (m.small ? "Little " : "") + sp.n : d.n) + (drop ? " • +1 " + ITEMS[d.frag].n : ""), sp ? sp.glow : d.glow, "⚔");
    if (drop) give(d.frag, 1, m.x - 0.5, m.y - 1);
    if (m.k === "wolf" && ITEMS.rawmeat && Math.random() < 0.6) give("rawmeat", 1, m.x - 0.5, m.y - 1.4);
    if (F.mobN && !F.mobs.some(function (q) { return !q.def; }) && !F.cleared) {   // floor cleared
      F.cleared = true; S.st.cclear++; var rw = 2 + Math.floor(cave.f / 3); give("torch", rw, cp.x - 0.5, cp.y - 1.2);
      popup("Floor cleared", "Floor " + cave.f + " • +" + rw + " Torches", "#f2c14e", "✦"); snd("rise");
    }
    checkGoals();
  }
  function drawCaveMobs(g, now, rj) {   // called per row from the cave renderer, so creatures sort in front of / behind rocks
    var F = cave.F; if (!F.mobs) return;
    F.mobs.forEach(function (m) {
      if (Math.floor(m.y) !== rj) return;
      var fly = CMOB[m.k].fly, lift = fly ? 0.55 + Math.sin(m.tt * 3 + m.ph) * 0.08 : m.z || 0, y0 = m.y;
      if (fly || lift > 0.02) { g.fillStyle = "rgba(0,0,0,.28)"; g.beginPath(); g.ellipse(ox + m.x * ts, oy + m.y * ts, ts * 0.34, ts * 0.11, 0, 0, 6.2832); g.fill(); }
      m.y = y0 - lift; drawEnemy(g, m, now); m.y = y0;
    });
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
  // ---- art for the wild creatures (30px per tile, origin at the feet, drawn facing right; drawEnemy flips for e.dir) ----
  function poly(g, pts) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); }
  function drawWolf(g, e, d, flash, h, pd) {
    var t = e.tt, wind = e.st === "wind", lunge = e.st === "lunge", run = Math.abs(e.mv) > 2.5, walk = Math.abs(e.mv) > 0.3, pw = wind ? clamp(1 - e.t / WOLF.wind, 0, 1) : 0;
    var fur = flash ? "#ffffff" : "#9aa8b4", dk = flash ? "#ffffff" : "#5d6c7a", lt = flash ? "#ffffff" : "#e8eef2", ln = flash ? "#ffffff" : "#2a323c";
    g.save(); g.translate(!e.def && h > 0 ? Math.sin(t * 90) * 1.6 * h : 0, 0);
    g.scale(e.dir * (1 + 0.5 * pd + 0.1 * h + (lunge ? 0.08 : 0)), (1 - 0.75 * pd) * (wind ? 1 - 0.16 * pw : lunge ? 0.94 : 1));
    if (lunge) g.rotate(e.vy < 0 ? -0.18 : 0.12);
    if (!e.def) eGlow(g, 0, -12, wind ? 30 : 24, wind || lunge ? "#ff6a5a" : d.glow, wind ? 0.25 + 0.4 * pw : 0.16);
    var ph = t * (run ? 17 : 9), sw = walk || run ? 1 : 0;
    g.lineCap = "round"; g.lineJoin = "round";
    [[-12, 0], [-7, 2.4], [7, 1.2], [12, 3.6]].forEach(function (L, i) {   // legs: far pair darker
      var a = Math.sin(ph + L[1]) * 4 * sw, far = i % 2 === 1; if (lunge) a = i < 2 ? -5 : 5;
      g.strokeStyle = far ? dk : fur; g.lineWidth = 3.4; g.beginPath(); g.moveTo(L[0], -10); g.lineTo(L[0] + a * 0.6, -4); g.lineTo(L[0] + a, -0.5); g.stroke();
    });
    g.strokeStyle = fur; g.lineWidth = 5; g.beginPath(); g.moveTo(-14, -15); g.quadraticCurveTo(-22, -15 - Math.sin(t * 5) * 2, -26, -22 + (wind ? 5 : 0)); g.stroke();   // bushy tail
    g.strokeStyle = lt; g.lineWidth = 2.4; g.beginPath(); g.moveTo(-22, -18); g.lineTo(-26, -22 + (wind ? 5 : 0)); g.stroke();
    g.fillStyle = fur; g.strokeStyle = ln; g.lineWidth = 1.6; g.beginPath(); g.ellipse(-1, -14, 15, 6.6, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = dk; g.beginPath(); g.ellipse(-3, -18, 11, 2.4, 0, 0, 7); g.fill();   // darker back stripe
    g.fillStyle = lt; g.beginPath(); g.ellipse(0, -10.5, 10, 2.6, 0, 0, 7); g.fill();
    g.fillStyle = lt; g.beginPath(); g.ellipse(11, -15, 6, 7, 0.3, 0, 7); g.fill();   // pale ruff
    var hy = wind ? 3 : 0;
    g.fillStyle = fur; g.strokeStyle = ln; g.lineWidth = 1.5;
    poly(g, [11, -26 + hy, 13.5, -33 + hy, 16, -25 + hy]); g.fill(); g.stroke();   // ears
    poly(g, [16, -25 + hy, 19, -31 + hy, 20, -23 + hy]); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(16, -21 + hy, 7, 5.8, 0, 0, 7); g.fill(); g.stroke();
    poly(g, [19, -24 + hy, 28, -19.5 + hy, 27.5, -16.5 + hy, 18, -16.5 + hy]); g.fill(); g.stroke();   // snout
    if (lunge || wind) { g.fillStyle = "#3a0d18"; poly(g, [19, -16.5 + hy, 27, -16.5 + hy, 23, -12.5 + hy]); g.fill(); g.fillStyle = "#f6eedb"; poly(g, [21, -16.5 + hy, 22, -14.6 + hy, 23, -16.5 + hy]); g.fill(); poly(g, [24.5, -16.5 + hy, 25.3, -15 + hy, 26.1, -16.5 + hy]); g.fill(); }
    g.fillStyle = "#1a1e24"; g.beginPath(); g.arc(27.6, -18.6 + hy, 1.6, 0, 7); g.fill();
    g.fillStyle = flash ? "#fff" : wind || lunge ? "#ff5a5a" : "#7fd6ff"; g.beginPath(); g.ellipse(18, -22.5 + hy, 2, 1.4, 0.2, 0, 7); g.fill();
    g.fillStyle = "#0c1018"; g.beginPath(); g.arc(18.6, -22.5 + hy, 0.8, 0, 7); g.fill();
    g.strokeStyle = ln; g.lineWidth = 1.2; g.beginPath(); g.moveTo(15.5, -25 + hy); g.lineTo(20, -23.6 + hy); g.stroke();   // brow
    g.restore();
    if (wind && !e.def) { g.fillStyle = "#ffcf7a"; g.strokeStyle = "rgba(0,0,0,.6)"; g.lineWidth = 3; g.font = "900 15px Nunito,sans-serif"; g.textAlign = "center"; g.strokeText("!", 0, -40 - Math.sin(t * 30) * 1.2); g.fillText("!", 0, -40 - Math.sin(t * 30) * 1.2); }
  }
  function drawGator(g, e, d, flash, h, pd) {
    var t = e.tt, jaw = e.jaw || 0, wind = e.st === "wind", walk = Math.abs(e.mv) > 0.3;
    var sk = flash ? "#ffffff" : "#4d7a3a", dk = flash ? "#ffffff" : "#2f4f22", lt = flash ? "#ffffff" : "#6e9a4a", bel = flash ? "#ffffff" : "#c9c98a", ln = flash ? "#ffffff" : "#1a2412";
    g.save(); g.translate(!e.def && h > 0 ? Math.sin(t * 90) * 1.6 * h : 0, e.wet && !e.def ? Math.sin(t * 2.4) * 0.8 : 0);
    g.scale(e.dir * (1 + 0.5 * pd + 0.08 * h), 1 - 0.75 * pd);
    if (!e.def) eGlow(g, 6, -6, wind ? 34 : 26, wind || e.st === "snap" ? "#ff6a5a" : d.glow, wind ? 0.35 : 0.12);
    g.lineCap = "round"; g.lineJoin = "round";
    var sw = Math.sin(t * (walk ? 7 : 1.6)) * (walk ? 4 : 1.5);
    g.fillStyle = sk; g.strokeStyle = ln; g.lineWidth = 1.5;
    poly(g, [-14, -10, -30, -5 + sw * 0.3, -32, -3 + sw * 0.4, -14, -2]); g.fill(); g.stroke();   // tail
    [[-12, 0], [-5, 2], [6, 1], [12, 3]].forEach(function (L, i) { var a = walk ? Math.sin(t * 8 + L[1]) * 3 : 0; g.strokeStyle = i % 2 ? dk : sk; g.lineWidth = 3.6; g.beginPath(); g.moveTo(L[0], -4); g.lineTo(L[0] + 2 + a, -0.5); g.stroke(); });
    g.fillStyle = sk; g.strokeStyle = ln; g.lineWidth = 1.6; g.beginPath(); g.ellipse(-1, -7, 16, 5.6, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = bel; g.beginPath(); g.ellipse(-1, -3.2, 12, 1.8, 0, 0, 7); g.fill();
    g.fillStyle = dk; for (var sx = -22; sx <= 10; sx += 4) { var by = sx < -14 ? -7.5 + (sx + 22) * 0.12 : -12.2; poly(g, [sx - 1.6, by + 1.6, sx, by - 1.6, sx + 1.6, by + 1.6]); g.fill(); }   // back scutes
    g.save(); g.translate(12, -6.5);   // head: the lower jaw swings open from a hinge behind the eye
    g.save(); g.rotate(jaw); g.fillStyle = lt; g.strokeStyle = ln; poly(g, [0, 0, 19, 0.6, 18, 3.2, 0, 4]); g.fill(); g.stroke();
    g.fillStyle = "#f6eedb"; for (var tx2 = 3; tx2 <= 16; tx2 += 3.2) { poly(g, [tx2, 0.4, tx2 + 1, -1.8, tx2 + 2, 0.6]); g.fill(); } g.restore();
    if (jaw > 0.12) { g.fillStyle = "#8a2030"; poly(g, [1, 0, 17, 0.2, Math.cos(jaw) * 17, Math.sin(jaw) * 17]); g.fill(); }
    g.fillStyle = sk; g.strokeStyle = ln; poly(g, [-1, -5.5, 6, -6.4, 20, -3.4, 20.5, 0.4, 0, 0.8]); g.fill(); g.stroke();
    g.fillStyle = "#f6eedb"; for (var tx3 = 4; tx3 <= 17; tx3 += 3.2) { poly(g, [tx3, 0.6, tx3 + 1, 2.8, tx3 + 2, 0.6]); g.fill(); }
    g.fillStyle = lt; g.beginPath(); g.arc(3.5, -6.6, 3.4, 0, 7); g.fill(); g.strokeStyle = ln; g.stroke();   // eye bump
    g.fillStyle = flash ? "#fff" : wind ? "#ff5a3a" : "#f2c14e"; g.beginPath(); g.ellipse(4, -7, 1.8, 1.5, 0, 0, 7); g.fill();
    g.fillStyle = "#0c1408"; g.beginPath(); g.ellipse(4.2, -7, 0.5, 1.4, 0, 0, 7); g.fill();
    g.fillStyle = ln; g.beginPath(); g.arc(18.5, -3.2, 0.8, 0, 7); g.fill();
    g.restore();
    g.restore();
    if (e.wet && !e.def) {   // the waterline: tint the part of the gator that is under the surface
      var wy = Math.floor(e.y - 1.5), xx = Math.floor(e.x); while (wy < e.y + 1 && get(xx, wy) !== T.WATER) wy++;
      var top = (wy - e.y) * 30; if (top < 2) { g.fillStyle = "rgba(42,143,149,.62)"; g.fillRect(-36, top, 72, 6 - top); g.fillStyle = "rgba(210,255,248,.6)"; g.fillRect(-36, top, 72, 1.5); }
    }
    if (wind && !e.def) { g.fillStyle = "#ffcf7a"; g.strokeStyle = "rgba(0,0,0,.6)"; g.lineWidth = 3; g.font = "900 15px Nunito,sans-serif"; g.textAlign = "center"; g.strokeText("!", e.dir * 18, -26 - Math.sin(t * 30) * 1.2); g.fillText("!", e.dir * 18, -26 - Math.sin(t * 30) * 1.2); }
  }
  function drawSlime(g, e, d, flash, h, pd) {
    var t = e.tt, P = SLIME_PAL[e.b] || SLIME_PAL[0], s0 = e.small ? 0.62 : 1, air = !e.on && !e.def, sxx = 1, syy = 1;
    if (air) { var k = clamp(-e.vy / 10, -1, 1); sxx = 1 - 0.14 * k; syy = 1 + 0.2 * k; } else { var q = e.sq || 0; sxx = 1 + 0.25 * q + 0.03 * Math.sin(t * 5); syy = 1 - 0.22 * q - 0.03 * Math.sin(t * 5); }
    g.save(); g.translate(!e.def && h > 0 ? Math.sin(t * 90) * 1.6 * h : 0, 0); g.scale(e.dir * s0 * sxx * (1 + 0.6 * pd), s0 * syy * (1 - 0.8 * pd));
    if (!e.def) eGlow(g, 0, -9, 26, P.glow, e.b === 1 ? 0.45 : 0.28);
    var body = flash ? "#ffffff" : P.c;
    g.globalAlpha *= 0.92; g.fillStyle = body; g.strokeStyle = flash ? "#fff" : P.dk; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(-14, 0); g.quadraticCurveTo(-15, -17, 0, -18); g.quadraticCurveTo(15, -17, 14, 0); g.closePath(); g.fill(); g.stroke();
    g.globalAlpha /= 0.92;
    g.fillStyle = flash ? "#fff" : P.dk; g.globalAlpha *= 0.35; g.beginPath(); g.ellipse(-3, -5, 6, 3.5, 0, 0, 7); g.fill(); g.globalAlpha /= 0.35;   // the core
    g.fillStyle = flash ? "#fff" : P.hi; g.beginPath(); g.ellipse(-6, -13, 4, 2.4, -0.5, 0, 7); g.fill(); g.fillStyle = "rgba(255,255,255,.75)"; g.beginPath(); g.arc(-7.5, -14, 1.3, 0, 7); g.fill();
    g.fillStyle = "#14200f"; g.beginPath(); g.ellipse(3, -9, 1.8, 2.6, 0, 0, 7); g.ellipse(9, -9, 1.6, 2.4, 0, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(3.5, -10, 0.7, 0, 7); g.arc(9.4, -10, 0.6, 0, 7); g.fill();
    g.strokeStyle = "#14200f"; g.lineWidth = 1.3; g.beginPath(); g.arc(6, -5.5, 2.2, 0.2, Math.PI - 0.2); g.stroke();
    if (e.b === 2) { g.fillStyle = flash ? "#fff" : "#e9f6ff"; poly(g, [-6, -17, -4, -21, -2, -17.5]); g.fill(); poly(g, [2, -18, 4, -22.5, 6, -17.5]); g.fill(); }   // frost slimes wear little ice spikes
    if (e.b === 1 && !e.def && Math.sin(t * 3) > 0.6) { g.fillStyle = "#ffe48a"; g.beginPath(); g.arc(-9 + Math.sin(t * 7) * 3, -20 - (t * 20 % 6), 1.2, 0, 7); g.fill(); }   // magma sparks
    g.restore();
  }
  function drawWasp(g, e, d, flash, h, pd) {
    var t = e.tt, hot = e.st === "wind" || e.st === "dash", flap = Math.abs(Math.sin(e.fl)), curl = e.st === "wind" ? 0.55 : e.st === "dash" ? 0.35 : 0.1;
    g.save(); g.translate(!e.def && h > 0 ? Math.sin(t * 90) * 1.6 * h : 0, -9); g.scale(e.dir * (1 + 0.4 * pd), 1 - 0.7 * pd);
    if (!e.def) eGlow(g, 0, 0, hot ? 28 : 20, hot ? "#ff3b2a" : d.glow, hot ? 0.55 : 0.25);
    g.fillStyle = flash ? "rgba(255,255,255,.9)" : "rgba(220,240,255,.55)"; g.strokeStyle = "rgba(255,255,255,.8)"; g.lineWidth = 1;
    g.beginPath(); g.ellipse(-1, -7 - flap * 2, 7, 2.6 + flap * 2.6, -0.5, 0, 7); g.fill(); g.stroke();   // wings: a blur of beats
    g.beginPath(); g.ellipse(3, -8 - flap * 2, 6, 2.2 + flap * 2.2, -0.2, 0, 7); g.fill(); g.stroke();
    g.save(); g.translate(-2, 0); g.rotate(curl);   // the striped abdomen and stinger curl forward before a dash
    var ab = flash ? "#ffffff" : hot ? "#ff9a3a" : "#ffcf3a";
    g.fillStyle = ab; g.strokeStyle = "#1a1206"; g.lineWidth = 1.4; g.beginPath(); g.ellipse(-6, 1, 8, 5, 0.25, 0, 7); g.fill(); g.stroke();
    g.fillStyle = "#1a1206"; [[-9, 1.6], [-5, 1.6], [-1.5, 1.4]].forEach(function (b2) { g.save(); g.translate(b2[0], 1); g.rotate(0.25); g.fillRect(-b2[1] / 2, -4.4, b2[1], 8.8); g.restore(); });
    g.fillStyle = flash ? "#fff" : "#2a1a0a"; poly(g, [-13.5, 2.5, -19, 4.5, -13.5, 4.8]); g.fill();
    g.restore();
    g.fillStyle = flash ? "#fff" : "#3a2a12"; g.strokeStyle = "#1a1206"; g.lineWidth = 1.2; g.beginPath(); g.ellipse(3, -1, 4.6, 3.8, 0, 0, 7); g.fill(); g.stroke();   // thorax
    g.fillStyle = flash ? "#fff" : "#ffcf3a"; g.beginPath(); g.ellipse(9, -2, 3.6, 3.4, 0, 0, 7); g.fill(); g.stroke();   // head
    g.fillStyle = flash ? "#fff" : hot ? "#ff2a1a" : "#3a1206"; g.beginPath(); g.ellipse(10.4, -2.6, 2, 2.4, 0, 0, 7); g.fill();
    g.strokeStyle = "#1a1206"; g.lineWidth = 1; g.beginPath(); g.moveTo(9, -5); g.quadraticCurveTo(11, -10, 14, -10); g.moveTo(10, -5); g.quadraticCurveTo(13, -8, 15, -7.5); g.stroke();
    g.strokeStyle = "#1a1206"; g.lineWidth = 1.1; for (var lg = 0; lg < 3; lg++) { g.beginPath(); g.moveTo(1 + lg * 2.4, 2); g.lineTo(lg * 2.4 - 0.5, 6 + Math.sin(t * 9 + lg) * 0.8); g.stroke(); }
    g.restore();
  }
  var SHADOW = { bug: 19, frog: 17, wolf: 21, gator: 27, slime: 14 }, HBAR = { bug: 41, bat: 30, frog: 49, wolf: 44, gator: 30, slime: 32, wasp: 30 };
  function drawEnemy(g, e, now) {
    var sx = ox + e.x * ts, sy = oy + e.y * ts;
    if (sx < -ts * 3 || sx > vw + ts * 3 || sy < -ts * 3 || sy > vh + ts * 3) return;
    var f = e.dir, t = e.tt, pd = e.def ? 1 - e.dead / 0.6 : 0, h = Math.max(0, e.hurt) / 0.3, flash = e.hurt > 0.2 || e.def, d = ENEMY[e.k];
    g.save(); g.translate(sx, sy + ts * 0.04); g.scale(ts / 30, ts / 30);
    g.globalAlpha = 1 - pd * pd * 0.9;
    if (!FLIER[e.k] && !e.wet) { g.fillStyle = "rgba(0,0,0,.33)"; g.beginPath(); g.ellipse(0, 0, (SHADOW[e.k] || 17) * (e.small ? 0.6 : 1), 3.2, 0, 0, 7); g.fill(); }
    if (e.k === "bat") drawBat(g, e, d, flash, h, pd);
    else if (e.k === "wolf") drawWolf(g, e, d, flash, h, pd);
    else if (e.k === "gator") drawGator(g, e, d, flash, h, pd);
    else if (e.k === "slime") drawSlime(g, e, d, flash, h, pd);
    else if (e.k === "wasp") drawWasp(g, e, d, flash, h, pd);
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
      g.globalAlpha = 1; g.fillStyle = "rgba(0,0,0,.65)"; var hb = (HBAR[e.k] || 49) * (e.small ? 0.6 : 1); g.fillRect(-15, -hb, 30, 5);
      g.fillStyle = e.hp / e.mx > 0.5 ? "#7dffb0" : e.hp / e.mx > 0.25 ? "#f2c14e" : "#ff6a5a"; g.fillRect(-14, -hb + 1, 28 * Math.max(0, e.hp / e.mx), 3);
    }
    g.restore();
  }
  function drawEnemies(g, now) { enemies.forEach(function (e) { drawEnemy(g, e, now); }); }

  // ---------- FARMING ----------
  // S.farm["x,y"] = { c: crop key, g: growth seconds into the current stage, w: seconds of water left }. Crops grow all the time (even in a cave),
  // 2x as fast while watered (Watering Can on the crop or its soil), and 1.4x in their home biome. Sleeping through the night grows them too.
  // Hold on a crop to pick it: ripe crops give food and seeds, unripe ones just give the seed back.
  var CROPS = (typeof SbxExtra !== "undefined" && SbxExtra.CROPS) || {}, SEEDOF = (typeof SbxExtra !== "undefined" && SbxExtra.SEEDS) || {}, farmT = 0, WET_S = 120;
  function cropAt(x, y) { var td = TILES[get(x, y)]; return td && td.crop ? td : null; }
  function soilKind(x, y) { var k = TILES[get(x, y)].kind; return k === "farmland" || k === "farmwet"; }
  function setSoil(x, y, wet) { var k = TILES[get(x, y)].kind; if (k === "farmland" && wet) setT(x, y, T.X_farmwet); else if (k === "farmwet" && !wet) setT(x, y, T.X_farmland); }
  function plantCrop(x, y, seedItem) { S.farm[x + "," + y] = { c: ITEMS[seedItem].seed, g: 0, w: 0 }; S.st.planted++; checkTrail(); checkGoals(); }
  function farmStep(sec) {
    Object.keys(S.farm).forEach(function (key) {
      var e = S.farm[key], q = key.split(","), x = +q[0], y = +q[1], td = cropAt(x, y), C = td && CROPS[td.crop];
      if (!C || td.crop !== e.c) { delete S.farm[key]; return; }
      var rate = (e.w > 0 ? 2 : 1) * (world.bio[x] === C.b ? 1.4 : 1);
      if (td.stage < 4) {
        e.g += sec * rate;
        while (e.g >= C.t && td.stage < 4) { e.g -= C.t; setT(x, y, C.tiles[td.stage]); td = TILES[C.tiles[td.stage]]; if (td.stage === 4 && !cave && Math.abs(x - p.x) < 24 && Math.abs(y - p.y) < 16) chips(x + 0.5, y + 0.4, C.fruit, 8, 4); }
        if (td.stage === 4) e.g = 0;
      }
      if (e.w > 0) { e.w -= sec; if (e.w <= 0) { e.w = 0; setSoil(x, y + 1, false); } }
    });
  }
  function tickFarm(dt) { farmT += dt; if (farmT >= 1) { var s2 = farmT; farmT = 0; farmStep(s2); } }
  function harvestCrop(x, y, td) {
    var C = CROPS[td.crop], key = x + "," + y, e = S.farm[key], sd = SEEDOF[td.crop]; delete S.farm[key];
    if (e && e.w > 0) setSoil(x, y + 1, false);
    if (!C) return;
    if (td.stage < 4) { if (sd) give(sd, 1, x, y - 0.4); return; }   // picked too early: just the seed back
    var n = C.yld[0] + Math.floor(Math.random() * (C.yld[1] - C.yld[0] + 1)), ns = C.sd[0] + Math.floor(Math.random() * (C.sd[1] - C.sd[0] + 1));
    give(C.produce, n, x, y - 0.4); if (sd) give(sd, ns, x, y - 0.8);
    S.st.harvests++; S.st.cropbits |= { carrot: 1, potato: 2, pepper: 4, frost: 8 }[td.crop] || 0; snd("coin"); checkTrail(); checkGoals();
  }
  function cropNear(tx, ty) {   // the watering target: a crop under your finger, on the soil you pointed at, or right beside it
    if (cropAt(tx, ty)) return { x: tx, y: ty }; if (cropAt(tx, ty - 1)) return { x: tx, y: ty - 1 };
    for (var y = ty - 1; y <= ty + 1; y++) for (var x = tx - 1; x <= tx + 1; x++) if (cropAt(x, y)) return { x: x, y: y };
    return null;
  }
  // ---------- FOOD AND HUNGER ----------
  // S.food 0-100: drains about 100 every 12 minutes of play (sleeping costs a little too). Eat by picking food in the hotbar and tapping, or "Eat" in the backpack.
  // 80+ = well fed: health comes back 60% faster.  Under 25 = hungry: health stops coming back.  0 = starving: you slowly lose health, but never below 10.
  // Hunger can be switched off per world in the Options tab.
  var HUNGER_RATE = 100 / 720, starveT = 0, shownFood = -1;
  function meX() { return cave ? cp.x : p.x; }
  function meY() { return cave ? cp.y - 1.4 : p.y - PH - 0.3; }
  function regenMul() { if (S.nohunger) return 1; return S.food >= 80 ? 1.6 : S.food < 25 ? 0 : 1; }
  function drawFood() {
    var el = $("sbxFood"); if (!el) return; el.hidden = !!S.nohunger; if (S.nohunger) return;
    var v = Math.max(0, Math.ceil(S.food)); if (v === shownFood) return; shownFood = v;
    el.querySelector(".fl").style.width = v + "%"; el.querySelector("b").textContent = v; el.setAttribute("aria-valuenow", v);
    el.classList.toggle("low", v < 25); el.classList.toggle("mid", v >= 25 && v < 50); el.classList.toggle("full", v >= 80);
  }
  function tickHunger(dt) {
    if (S.nohunger) { drawFood(); return; }
    var was = S.food; S.food = Math.max(0, S.food - dt * HUNGER_RATE);
    if (was >= 50 && S.food < 50 && !(S.st.htip & 1)) { S.st.htip |= 1; toast("Getting hungry! Pick food in the hotbar and tap to eat. Cattails drop carrot seeds, and Redcap Mushrooms are edible.", "#f2c14e"); }
    if (was >= 25 && S.food < 25) toast("You are hungry: your health stops coming back until you eat.", "#f2a14e");
    if (was > 0 && S.food <= 0) toast("Starving! Eat something soon.", "#ff7a5a");
    if (S.food <= 0) { starveT += dt; if (starveT >= 3) { starveT = 0; if (hp > 10) { hp = Math.max(10, hp - 3); sinceHurt = 0; hurtT = 0.3; text(meX(), meY(), "-3 hungry", "#ff9a5a"); drawHp(); } } } else starveT = 0;
    drawFood();
  }
  function eat(k) {
    var it = ITEMS[k]; if (!it || !it.food || !(S.inv[k] > 0)) return;
    if ((S.nohunger || S.food >= 99) && hp >= MAXHP) { nag(S.nohunger ? "You are already at full health." : "You are full."); return; }
    S.inv[k]--; if (S.inv[k] <= 0) { delete S.inv[k]; if (sel === k) sel = "pick"; } reslot();
    if (!S.nohunger) S.food = Math.min(100, S.food + it.food);
    if (it.heal) { hp = Math.min(MAXHP, hp + it.heal); drawHp(); }
    S.st.eaten++; if (it.cooked) S.ate[k] = 1; shownFood = -1; drawFood();
    text(meX(), meY(), "+" + it.food + " food" + (it.heal ? "  +" + it.heal + " hp" : ""), "#ffd27a"); thud(560, 0.04);
    for (var q = 0; q < 6; q++) parts.push({ x: meX() + (Math.random() - 0.5) * 0.5, y: (cave ? cp.y - 0.9 : p.y - 1.1), vx: (Math.random() - 0.5) * 2, vy: -1.5 - Math.random(), life: 0.4, max: 0.5, c: "#e0b070", s: 3 });
    hbDirty = true; checkTrail(); checkGoals(); if (panelOpen) renderPanel();
  }
  function useFood(dt) { mine = null; if (!aim.down) return; cool -= dt; if (cool > 0) return; cool = 0.7; eat(sel); }
  // ---------- CHESTS ----------
  // S.chests["x,y"] = { itemId: count }. A chest holds up to CHEST_KINDS kinds of item. Tap it or press F nearby to open the Chest tab. A chest must be empty before you can pick it up.
  var CHEST_KINDS = 30, chestKey = "";
  // Cave Chests (content pack) work like Wooden Chests, but are found in caves and come filled: the loot is rolled the first time one is opened (or broken unopened).
  function isChest(id) { return id === T.CHEST || TILES[id].kind === "lootchest"; }
  function lootTier(y) { var d = y - SURF; return d < 35 ? 0 : d < 80 ? 1 : 2; }
  function rollLoot(kind, b, tier) { return typeof SbxExtra !== "undefined" && SbxExtra.loot ? SbxExtra.loot(kind, b, tier) : [["torch", 4]]; }
  function treasureFound(n) { S.st.cchests++; popup("Treasure found", "Cave Chest \u2022 " + n + " kinds of loot", "#f2c14e", "\u2726"); snd("open", "Epic"); checkGoals(); }
  function chestCount(key) { var c = S.chests[key], n = 0; if (c) for (var k in c) n += c[k]; return n; }
  function chestKinds(c) { return Object.keys(c).length; }
  function chestNear() {
    var cx = Math.floor(p.x), cy = Math.floor(p.y - 1), best = null, bd = 9, x, y, dx, dy, d;
    for (y = cy - 3; y <= cy + 3; y++) for (x = cx - 3; x <= cx + 3; x++) if (isChest(get(x, y))) { dx = x + 0.5 - p.x; dy = y + 0.5 - (p.y - 0.7); d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { x: x, y: y }; } }
    return best;
  }
  function openChest(x, y) {
    var cid = get(x, y); if (!isChest(cid)) return false; var key = x + "," + y;
    if (!S.chests[key]) {
      S.chests[key] = {};
      if (TILES[cid].kind === "lootchest") { var L = rollLoot("chest", world.bio[x], lootTier(y)); L.forEach(function (q) { S.chests[key][q[0]] = q[1]; }); chips(x + 0.5, y + 0.3, "#f2c14e", 18, 7); treasureFound(L.length); }
    }
    chestKey = key; snd("coin"); openPanel("chest"); return true;
  }
  function addInv(item, n) { var fit = Math.min(n, room(item)); if (fit > 0) { S.inv[item] = (S.inv[item] || 0) + fit; packInto(S.slots, item, fit); if (ITEMS[item].tile !== undefined && S.mru.indexOf(item) < 0) S.mru.push(item); } hbDirty = true; return fit; }   // like give(), but without counting it as gathered; returns how many fit
  function chestMove(item, all, dir) {   // dir "put": bag -> chest, "take": chest -> bag. all = whole stack
    var c = S.chests[chestKey]; if (!c || !ITEMS[item]) return;
    if (dir === "put") {
      var have = S.inv[item] || 0; if (have <= 0) return;
      if (!c[item] && chestKinds(c) >= CHEST_KINDS) { toast("This chest is full.", "#f2c14e"); return; }
      c[item] = Math.min(99999, (c[item] || 0) + have); S.st.stashed += have; delete S.inv[item]; if (sel === item) sel = "pick"; snd("coin");
    } else {
      var n = c[item] || 0; if (n <= 0) return; var fit = addInv(item, n);
      if (fit <= 0) { toast("Your inventory is full.", "#f2c14e"); return; }
      if (fit < n) { c[item] = n - fit; toast("Inventory full. " + (n - fit) + " " + ITEMS[item].n + " stayed in the chest.", "#f2c14e"); } else delete c[item];
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
    var sd = sdoorAt(x, y); if (sd) { if (manual) enterBuilding(sd); return true; }   // a building door never swings: tap it or press F to go inside
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
  function plantNear(tx, ty) {   // the watering target: the plant under your finger, or the closest one touching that tile
    var best = null, bd = 1e9, x, y, d;
    for (y = ty - 1; y <= ty + 1; y++) for (x = tx - 1; x <= tx + 1; x++) if (PLANTS[get(x, y)]) { d = (x - tx) * (x - tx) + (y - ty) * (y - ty); if (d < bd) { bd = d; best = { x: x, y: y, id: get(x, y) }; } }
    return best;
  }
  function useCan(dt, tx, ty) {
    var id = get(tx, ty), spx = p.x + p.face * 0.8, spy = p.y - 1.05;
    if (id === T.WATER) {   // fill up
      if (S.water >= CAN.max) { nag("Your Watering Can is full."); return; }
      canBusy = true; canAcc += dt * 5;
      if (canAcc >= 1) { var add = Math.floor(canAcc); canAcc -= add; S.water = Math.min(CAN.max, S.water + add); hbDirty = true; thud(380 + Math.random() * 120, 0.025); if (S.water >= CAN.max) toast("Watering Can full.", CAN.c); }
      if (Math.random() < dt * 30) parts.push({ x: tx + 0.2 + Math.random() * 0.6, y: ty + 0.3, vx: (Math.random() - 0.5) * 1.5, vy: -2.5 - Math.random() * 2, life: 0.5, max: 0.6, c: "#8fe0ff", s: 3 });
      return;
    }
    var cr = cropNear(tx, ty);
    if (cr) {   // water a crop: it grows twice as fast for a while and its soil turns dark
      if (S.water <= 0) { nag("Your Watering Can is empty. Hold it on the water to fill it."); return; }
      canBusy = true; if (Math.random() < dt * 40) parts.push({ x: spx, y: spy, vx: (cr.x + 0.5 - spx) * 2.2 + (Math.random() - 0.5), vy: -1 + Math.random(), life: 0.55, max: 0.6, c: "#8fe0ff", s: 3 });
      var fe = S.farm[cr.x + "," + cr.y]; if (fe && fe.w > WET_S - 3) return;   // already soaked
      cool -= dt; if (cool > 0) return; cool = 0.4;
      S.water--; hbDirty = true; S.st.watered++; thud(520, 0.02); chips(cr.x + 0.5, cr.y + 0.6, "#8fe0ff", 6, 3);
      if (fe) { fe.w = WET_S; setSoil(cr.x, cr.y + 1, true); }
      checkGoals(); return;
    }
    var pl = plantNear(tx, ty);
    if (!pl) { nag("Water a crop, a Swamp Flower, a Cattail or a Glowcap. Fill up at the water."); return; }
    if (S.water <= 0) { nag("Your Watering Can is empty. Hold it on the water to fill it."); return; }
    canBusy = true;
    if (Math.random() < dt * 40) parts.push({ x: spx, y: spy, vx: (pl.x + 0.5 - spx) * 2.2 + (Math.random() - 0.5), vy: -1 + Math.random(), life: 0.55, max: 0.6, c: "#8fe0ff", s: 3 });
    cool -= dt; if (cool > 0) return; cool = 0.4;
    S.water--; hbDirty = true; S.st.watered++; thud(520, 0.02); chips(pl.x + 0.5, pl.y + 0.5, "#8fe0ff", 6, 3);
    var gq = null; for (var gi = 0; gi < grow.length; gi++) if (grow[gi].x === pl.x && grow[gi].y === pl.y) gq = grow[gi];
    if (gq) gq.t = GROW_T + Math.random() * 1.5; else grow.push({ x: pl.x, y: pl.y, id: pl.id, t: GROW_T + Math.random() * 1.5 });
    checkGoals();
  }
  function updateGrow(dt) {   // watered plants spread: a new one pops up on free ground within 2 tiles, unless the patch is already crowded
    for (var i = grow.length - 1; i >= 0; i--) {
      var q = grow[i]; q.t -= dt; if (q.t > 0) continue; grow.splice(i, 1);
      if (get(q.x, q.y) !== q.id) continue;
      var same = 0, x, y, spots = [], dx, dy, offs = [0, -1, 1];
      for (y = q.y - 2; y <= q.y + 2; y++) for (x = q.x - 3; x <= q.x + 3; x++) if (get(x, y) === q.id) same++;
      if (same >= GROW_CROWD) { nag("That patch is already thriving."); continue; }
      for (dx = -2; dx <= 2; dx++) { if (!dx) continue; for (var oi = 0; oi < 3; oi++) { dy = offs[oi]; var nx = q.x + dx, ny = q.y + dy; if (nx < 1 || nx >= W - 1 || ny < 1) continue; if (get(nx, ny) === T.AIR && TILES[get(nx, ny + 1)].solid) { spots.push({ x: nx, y: ny }); break; } } }
      if (!spots.length) continue;
      var sp = spots[Math.floor(Math.random() * spots.length)]; setT(sp.x, sp.y, q.id); S.st.grown++;
      chips(sp.x + 0.5, sp.y + 0.5, TILES[q.id].c2 || "#ff6fb5", 10, 4); thud(260, 0.04);
      for (var k = 0; k < 4; k++) parts.push({ x: sp.x + 0.5, y: sp.y + 0.4, vx: (Math.random() - 0.5) * 1.6, vy: -2 - Math.random() * 1.5, life: 0.6, max: 0.7, c: "#e8ffb0", s: 3 });
    }
  }
  function useTool(dt) {
    canBusy = false;
    if (sel === "weapon") {   // swing: faces your aim, one swing per cooldown. Nothing takes damage until Stage 3 adds enemies.
      mine = null; if (!aim.down || !S.wpn) return;
      if (toolBroken("wpn")) { nag("Your weapon is broken. Repair it in the Craft tab."); return; }
      var wdx = aim.mx - (ox + p.x * ts); if (Math.abs(wdx) > ts * 0.3) p.face = wdx < 0 ? -1 : 1;
      cool -= dt; if (cool > 0) return; cool = WEAPONS[S.wpn].cd; S.st.swings++; swingQ = 0.1;
      thud(300 + S.wpn * 70, 0.04); for (var sk = 0; sk < 3; sk++) parts.push({ x: p.x + p.face * (0.9 + sk * 0.35), y: p.y - 1.1 - sk * 0.12, vx: p.face * 3, vy: -0.4, life: 0.22, max: 0.3, c: WEAPONS[S.wpn].c, s: 3 });
      return;
    }
    if (ITEMS[sel] && ITEMS[sel].food && ITEMS[sel].tile === undefined) { useFood(dt); return; }   // holding food: tap to eat
    if (!aim.down || aim.tx < 0) { mine = null; doorHoldKey = ""; return; }
    var tx = aim.tx, ty = aim.ty, dx = tx + 0.5 - p.x, dy = ty + 0.5 - (p.y - PH / 2);
    if (dx * dx + dy * dy > REACH * REACH) { mine = null; return; }
    if (Math.abs(dx) > 0.35) p.face = dx < 0 ? -1 : 1;   // turn to face what you are digging or building
    if (sel === "can") { useCan(dt, tx, ty); return; }
    if (sel === "pick" || sel === "shovel") {
      var id = get(tx, ty), td = TILES[id];
      if (id === T.AIR && walls[ty * W + tx]) { wallMine(dt, tx, ty); return; }
      if (id === T.BEDROCK) { nag("Bedrock can't be broken."); mine = null; return; }
      if (id === T.AIR || !isFinite(td.hard)) { mine = null; return; }
      if (sdoorAt(tx, ty)) { nag("Tap the door to go inside."); mine = null; return; }
      if (sel === "shovel" && !SOFT[id]) { nag("A shovel only digs soft ground (mud, moss, clay, ash, snow). Use your pick for " + td.n + "."); mine = null; return; }
      if (sel === "shovel" && toolBroken("shovel")) { nag("Your shovel is broken. Repair it in the Craft tab."); mine = null; return; }
      if (sel === "pick" && td.tier > effTier()) { nag(S.tier >= td.tier ? "Your pick is broken. Repair it in the Craft tab." : "Needs the " + PICKS[td.tier].n + " to break " + td.n + "."); mine = null; return; }
      var dro = dropOf(td); if (dro && room(dro) <= 0) { invFull(); mine = null; return; }
      if (td.kind === "door" || td.kind === "chest" || td.kind === "lootchest") {   // a quick tap opens/closes the door, so breaking it needs a short hold first
        var dk = tx + "," + ty; if (doorHoldKey !== dk) { doorHoldKey = dk; doorHoldT = 0; }
        doorHoldT += dt; if (doorHoldT < 0.3) { mine = null; return; }
        if ((td.kind === "chest" || td.kind === "lootchest") && chestCount(tx + "," + ty) > 0) { nag("Empty the chest before picking it up."); mine = null; return; }
      } else doorHoldKey = "";
      if (!mine || mine.x !== tx || mine.y !== ty) mine = { x: tx, y: ty, p: 0, tick: 0 };
      mine.p += dt * (sel === "shovel" ? SHOVEL.sp : PICKS[effTier()].sp) / td.hard; mine.tick -= dt;
      if (mine.tick <= 0) { mine.tick = 0.17; thud(150 + Math.random() * 50, 0.035); chips(tx + 0.5, ty + 0.5, td.kind === "ore" ? td.c2 : td.c, 1, 3); }
      if (mine.p >= 1) { breakTile(tx, ty); mine = null; if (sel === "shovel") wear("shovel", 1); else if (effTier() > 0) wear("pick", td.hard >= 2 ? 2 : 1); }
    } else {
      cool -= dt; if (cool > 0) return; cool = 0.13;
      if (ITEMS[sel] && ITEMS[sel].wall) { if ((S.inv[sel] || 0) > 0 && canWall(tx, ty, ITEMS[sel].wall)) placeWall(tx, ty, sel); return; }
      if ((S.inv[sel] || 0) > 0 && canPlace(tx, ty, sel)) place(tx, ty, sel);
    }
  }
  // ---------- CRAFTING STATIONS: tap (or press F next to) a Workbench, Decor Workbench, Furnace, Loom or Mason's Table to open its own window ----------
  // Every recipe that needs a station lives ONLY in that station's window (stnOf below); the Journal's Craft tab keeps the hand-made recipes.
  // While a station window is open, that station counts as "near" (stnOpen), so you can craft from anywhere you were able to tap it.
  // TO ADD A STATION: an entry here (tile kind in `kind`), and give its recipes a way to map to the key in stnOf().
  var STATIONS = {
    bench: { n: "Bog Workbench", sh: "Workbench", kind: "bench", ic: "bench", c: "#c98c4f", d: "Tools, weapons, armor, walls and new crafting stations. Upgrade it with loot from each biome to unlock better gear." },
    decor: { n: "Decor Workbench", sh: "Decor Bench", kind: "decorbench", ic: "decorbench", c: "#7fc9a0", d: "Furniture, lamps, garden pieces, building blocks and wall decor." },
    furnace: { n: "Stone Furnace", sh: "Furnace", kind: "furnace", ic: "furnace", c: "#ff9a4a", d: "Smelt Bog Iron into ingots, fire clay into bricks and melt glass and gems into glowing blocks." },
    loom: { n: "Weaver's Loom", sh: "Loom", kind: "loom", ic: "loom", c: "#e8d9a8", d: "Weave Bog Cotton into cloth." },
    mason: { n: "Mason's Table", sh: "Mason's Table", kind: "masontable", ic: "masontable", c: "#b8c2c8", d: "Cut stone, bricks, shingles and quartz into building blocks and floors." },
    cook: { n: "Cooking Pot", sh: "Cooking Pot", kind: "cookpot", ic: "cookpot", c: "#ff9a4a", d: "Cook crops, mushrooms and meat into meals that fill your hunger bar and heal you." }
  }, STN_ORDER = ["bench", "decor", "cook", "furnace", "loom", "mason"], KIND_STN = {}, stnOpen = null, stnCat = {}, stnReady = false;
  STN_ORDER.forEach(function (k) { KIND_STN[STATIONS[k].kind] = k; });
  function stnOf(r) { return r.deco ? "decor" : r.stn ? r.stn : r.bench ? "bench" : ""; }   // which station a recipe is made at ("" = by hand, in the Journal)
  function stnName(k) { return k === "bench" ? BENCH_LV[S.bl].n : STATIONS[k].n; }
  function stnColor(k) { return k === "bench" ? BENCH_LV[S.bl].c : STATIONS[k].c; }
  function stnKeyAt(x, y) { if (cave) return ""; var t = TILES[get(x, y)]; return (t && KIND_STN[t.kind]) || ""; }
  function stnHeld(k) { return !!(stnOpen && stnOpen.k === k && stnKeyAt(stnOpen.x, stnOpen.y) === k); }   // the open station window still has its station
  function stationNear(maxD) {   // the closest station tile to the player (for the F key and the "Open" pill)
    if (cave) return null; var cx = Math.floor(p.x), cy = Math.floor(p.y - 1), best = null, bd = (maxD || 3) * (maxD || 3), x, y, k, dx, dy, d;
    for (y = cy - 3; y <= cy + 3; y++) for (x = cx - 4; x <= cx + 4; x++) if ((k = stnKeyAt(x, y))) { dx = x + 0.5 - p.x; dy = y + 0.5 - (p.y - 0.7); d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { k: k, x: x, y: y }; } }
    return best;
  }
  function decorNear() {
    if (stnHeld("decor")) return true;
    if (cave) return false; var cx = Math.floor(p.x), cy = Math.floor(p.y - 1);
    for (var y = cy - 3; y <= cy + 3; y++) for (var x = cx - 5; x <= cx + 5; x++) if (get(x, y) === T.DECORBENCH) return true;
    return false;
  }
  function decorBenchAt() {
    var cx = Math.floor(p.x), cy = Math.floor(p.y - 1), best = null, bd = 1e9;
    for (var y = cy - 3; y <= cy + 3; y++) for (var x = cx - 5; x <= cx + 5; x++) if (get(x, y) === T.DECORBENCH) { var dx = x + 0.5 - p.x, dy = y + 0.5 - (p.y - 0.7), d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { x: x, y: y }; } }
    return best;
  }
  function nearBench() {
    if (stnHeld("bench")) return true;
    var cx = Math.floor(p.x), cy = Math.floor(p.y - 1);
    for (var y = cy - 4; y <= cy + 4; y++) for (var x = cx - 7; x <= cx + 7; x++) if (get(x, y) === T.BENCH) return true;
    return false;
  }
  function nearStn(k) {   // Content Pack 1 crafting stations: Stone Furnace, Weaver's Loom, Mason's Table
    if (stnHeld(k)) return true;
    var tk = SbxExtra.STNTILE[k], cx = Math.floor(p.x), cy = Math.floor(p.y - 1);
    for (var y = cy - 4; y <= cy + 4; y++) for (var x = cx - 7; x <= cx + 7; x++) if (TILES[get(x, y)].kind === tk) return true;
    return false;
  }
  function craft(id) {
    var r = RECIPES.concat(DECOR).filter(function (x) { return x.id === id; })[0]; if (!r) return;
    if (r.deco && !decorNear()) { toast("Stand next to a Decor Workbench to craft this.", "#f2c14e"); return; }
    if (r.tier && S.tier >= r.tier) return;
    if (r.wpn && S.wpn >= r.wpn) return;
    if (r.arm && S.arm >= r.arm) return;
    if (r.sh && S.shovel) return;
    if (r.can && S.can) return;
    if (r.bag && S.bag >= r.bag) return;
    if (r.bag && S.bag < r.bag - 1) { toast("Make the " + BAGS[r.bag - 1].n + " first.", "#f2c14e"); return; }
    if (r.tier && S.tier < r.tier - 1) { toast("Craft the " + PICKS[r.tier - 1].n + " first.", "#f2c14e"); return; }
    if (r.wpn && S.wpn < r.wpn - 1) { toast("Craft the " + WEAPONS[r.wpn - 1].n + " first.", "#f2c14e"); return; }
    if (r.arm && S.arm < r.arm - 1) { toast("Craft the " + ARMORS[r.arm - 1].n + " first.", "#f2c14e"); return; }
    if (r.need && S.tier < r.need) { toast("Needs the " + PICKS[r.need].n + " first.", "#f2c14e"); return; }
    if (r.bl && S.bl < r.bl) { toast("Upgrade your Workbench to the " + BENCH_LV[r.bl].n + " first.", "#f2c14e"); return; }
    if (r.bench && !nearBench()) { toast("Stand near a Bog Workbench to craft this.", "#f2c14e"); return; }
    if (r.stn && !nearStn(r.stn)) { toast("Stand near a " + SbxExtra.STN[r.stn] + " to craft this.", "#f2c14e"); return; }
    for (var k in r.cost) if ((S.inv[k] || 0) < r.cost[k]) { toast("Not enough " + ITEMS[k].n + ".", "#f2c14e"); return; }
    if (r.out) {   // the crafted items must fit once the ingredients are used up
      reslot(); var sim = S.slots.map(function (c) { return c ? { k: c.k, n: c.n } : null; }), q;
      for (q in r.cost) takeFrom(sim, q, r.cost[q], -1);
      for (q in r.out) if (packInto(sim, q, r.out[q]) > 0) { toast("Not enough room in your inventory.", "#f2c14e"); return; }
    }
    for (var c in r.cost) { S.inv[c] -= r.cost[c]; if (S.inv[c] <= 0) delete S.inv[c]; }
    reslot();
    if (r.tier) { S.tier = r.tier; S.dur.pick = DUR.pick[r.tier]; ICO = {}; toast(r.n + " crafted. Dig faster!", PICKS[r.tier].c); snd("open", "Epic"); chips(p.x, p.y - 1, PICKS[r.tier].c, 30, 9); }
    else if (r.sh) { S.shovel = 1; S.dur.shovel = DUR.shovel; ICO = {}; toast(r.n + " crafted. Pick it in the hotbar to dig soft ground!", SHOVEL.c); snd("open", "Epic"); chips(p.x, p.y - 1, SHOVEL.c, 24, 8); }
    else if (r.can) { S.can = 1; S.water = CAN.max; ICO = {}; toast(r.n + " crafted. Pick it in the hotbar, then water flowers!", CAN.c); snd("open", "Epic"); chips(p.x, p.y - 1, CAN.c, 24, 8); checkGoals(); }
    else if (r.bag) {   // a backpack: more bag slots at the end of the list, then anything waiting in Overflow moves in
      S.bag = r.bag; while (S.slots.length < invSize(S.bag)) S.slots.push(null);
      var moved = 0; Object.keys(S.extra).forEach(function (ek) { var fit = Math.min(S.extra[ek], room(ek)); if (fit > 0) { S.inv[ek] = (S.inv[ek] || 0) + fit; packInto(S.slots, ek, fit); S.extra[ek] -= fit; moved += fit; if (S.extra[ek] <= 0) delete S.extra[ek]; } });
      toast(r.n + " crafted. +" + (BAGS[S.bag].x - BAGS[S.bag - 1].x) + " bag slots (" + S.slots.length + " in all)!" + (moved ? " " + moved + " Overflow items moved in." : ""), BAGS[S.bag].c); snd("open", "Epic"); chips(p.x, p.y - 1, BAGS[S.bag].c, 26, 8); checkGoals();
    }
    else if (r.arm) { S.arm = r.arm; S.dur.arm = DUR.arm[r.arm]; ICO = {}; armKey = ""; spriteKey = ""; toast(r.n + " crafted and worn. You take " + Math.round(ARMORS[r.arm].red * 100) + "% less damage!", ARMORS[r.arm].c); snd("open", "Epic"); chips(p.x, p.y - 1, ARMORS[r.arm].c, 30, 9); checkGoals(); }
    else if (r.wpn) { S.wpn = r.wpn; S.dur.wpn = DUR.wpn[r.wpn]; ICO = {}; toast(r.n + " crafted. Pick it in the hotbar and swing!", WEAPONS[r.wpn].c); snd("open", "Epic"); chips(p.x, p.y - 1, WEAPONS[r.wpn].c, 30, 9); }
    else { for (var o in r.out) give(o, r.out[o], undefined, undefined, true); if (r.deco) { S.st.dcraft++; checkGoals(); } if (r.stn === "cook") { S.st.cooked++; checkTrail(); checkGoals(); } toast(r.id === "bench" ? "Workbench made! Pick it in the hotbar, then tap the ground." : "Crafted " + r.n, "#4ee6b4"); snd("coin"); }
    hbDirty = true; renderPanel(); save();
  }
  function upgradeBench() {   // spend loot from the last biome to raise the Workbench one level (needs a Workbench close by)
    var nx = S.bl + 1, L = BENCH_LV[nx]; if (!L) return;
    if (!nearBench()) { toast("Stand near a Bog Workbench to upgrade it.", "#f2c14e"); return; }
    for (var k in L.cost) if ((S.inv[k] || 0) < L.cost[k]) { toast("Not enough " + ITEMS[k].n + ".", "#f2c14e"); return; }
    for (var c in L.cost) { S.inv[c] -= L.cost[c]; if (S.inv[c] <= 0) delete S.inv[c]; }
    reslot(); S.bl = nx; benchLv = nx; repaintBench(); ICO = {};
    toast("Workbench upgraded: " + L.n + "! Unlocks " + L.gives + ".", L.c); snd("open", "Epic"); chips(p.x, p.y - 1, L.c, 34, 10);
    hbDirty = true; checkGoals(); renderPanel(); save();
  }
  function rewardText(rw) { return Object.keys(rw).map(function (k) { return "+" + rw[k] + " " + ITEMS[k].n; }).join(", "); }
  function checkTrail() {
    var st;
    while ((st = TRAIL[S.trail]) && st.v() >= st.need) {
      S.trail++; trailKey = "";
      if (st.rw) for (var k in st.rw) give(k, st.rw[k], undefined, undefined, true);
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
    el.title = "Trail " + (S.trail + 1) + " of " + TRAIL.length; el.innerHTML = "<b>" + esc(st.n) + "</b><em>" + v + "/" + st.need + '</em><span class="bar"><i style="width:' + Math.round(v / st.need * 100) + '%"></i></span>';
  }
  function checkGoals() {
    checkTrail();
    GOALS.forEach(function (g) { if (!S.ms[g.id] && g.f()) { S.ms[g.id] = 1; banner(g.n, g.d); } });
  }
  // ---------- HEALTH ----------
  var armKey = "";
  function drawArm() {   // little armor badge under the health bar: icon + how much is left
    var el = $("sbxArm"); if (!el) return; var k = S.arm + ":" + (S.arm ? durOf("arm") : 0); if (k === armKey) return; armKey = k;
    if (!S.arm) { el.hidden = true; return; }
    var m = durMax("arm"), cur = durOf("arm"), pc = Math.round(cur / m * 100);
    el.hidden = false; el.className = "shd" + (cur <= 0 ? " brk" : pc <= 25 ? " bad" : pc <= 50 ? " low" : "");
    el.title = ARMORS[S.arm].n + (cur <= 0 ? " (broken)" : " blocks " + Math.round(ARMORS[S.arm].red * 100) + "%");
    el.innerHTML = '<img alt="" src="' + sprCanvas("arm" + S.arm).toDataURL() + '"><b>' + (cur <= 0 ? "Broken" : pc + "%") + "</b>";
  }
  function drawHp() {
    drawArm();
    var v = Math.max(0, Math.ceil(hp)); if (v === shownHp) return; var was = shownHp; shownHp = v;
    var el = $("sbxHp"); if (!el) return; var pc = v / MAXHP * 100;
    el.querySelector(".fl").style.width = pc + "%"; el.querySelector(".gh").style.width = pc + "%"; el.querySelector("b").textContent = v;
    el.setAttribute("aria-valuenow", v); el.classList.toggle("low", pc <= 30); el.classList.toggle("mid", pc > 30 && pc <= 60);
    if (was > v && !reduce) { el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit"); }   // heart thumps when you take damage
  }
  function hurt(n, why, cont) {
    if (n <= 0) return; if (!cont && hurtGrace > 0) return;
    if (S.arm > 0 && durOf("arm") > 0) {   // armor blocks a share of the hit (half as much against lava) and wears down on every real hit
      var blocked = n * ARMORS[S.arm].red * (why === "lava" ? 0.5 : 1); n -= blocked;
      if (!cont) { wear("arm", n >= 14 ? 2 : 1); armKey = ""; if (blocked >= 1) text((cave ? cp.x : p.x) + 0.5, cave ? cp.y - 1.3 : p.y - PH - 0.1, "-" + Math.round(blocked) + " blocked", "#7fd6ff"); }
    }
    hp -= n; sinceHurt = 0; hurtT = Math.max(hurtT, cont ? 0.15 : 0.5);
    if (!cont) { hurtGrace = 0.5; shake = Math.min(1, n / 40); text(cave ? cp.x : p.x, cave ? cp.y - 1.5 : p.y - PH - 0.3, "-" + Math.round(n), "#ff6a5a"); thud(110, 0.07); }
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
  function sheltered() { var x = Math.floor(p.x), y0 = Math.floor(p.y - PH); for (var y = y0 - 1; y >= Math.max(0, y0 - 5); y--) if (blocks(x, y) || (smask && smask[y * W + x] && TILES[tiles[y * W + x]].solid)) return true; return false; }   // a roof within 5 tiles overhead
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
      farmStep(150); if (!S.nohunger) S.food = Math.max(0, S.food - 12); shownFood = -1;   // the night passes: crops grow and you wake up a little hungry
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
    else if (p.vy > 0) { p.y = Math.floor(ny); var g = 0; while (boxHit(p.x, p.y) && g++ < 4) p.y -= 1; p.on = true; p.vy = 0; if (vpre > FALL_SAFE && !p.wet) hurt(Math.round((vpre - FALL_SAFE) * FALL_DMG), "fall"); if (vpre > 8) { p.land = Math.min(0.28, vpre / 70); dust(Math.min(10, Math.round(vpre / 3))); } }
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
    advTime(dt);
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
    if (hp < MAXHP && sinceHurt > REGEN_WAIT) hp = Math.min(MAXHP, hp + REGEN_RATE * regenMul() * dt);
    drawHp();
    var depth = Math.max(0, Math.floor(p.y - SURF)); if (depth > S.st.maxDepth) S.st.maxDepth = depth;
    var tcx = Math.floor(p.x), tcy = Math.floor(p.y - 1); if (tcx + "," + tcy !== exKey) { exKey = tcx + "," + tcy; reveal(); }
    cam.x += (p.x - cam.x) * Math.min(1, dt * 7); cam.y += (p.y - 1.1 - cam.y) * Math.min(1, dt * 6);
    var halfW = vw / 2 / ts, halfH = vh / 2 / ts;
    cam.x = W <= halfW * 2 ? W / 2 : clamp(cam.x, halfW, W - halfW); cam.y = H <= halfH * 2 ? H / 2 : clamp(cam.y, halfH, H - halfH + 2);
    // aim tile follows the camera while a finger or mouse is held still
    aim.tx = Math.floor((aim.mx - ox) / ts); aim.ty = Math.floor((aim.my - oy) / ts);
    if (aim.tx < 0 || aim.tx >= W || aim.ty < 0 || aim.ty >= H) aim.tx = -1;
    useTool(dt); updateGrow(dt); updateEnemies(dt); tickFarm(dt); tickHunger(dt);
    var working = sel === "weapon" ? (aim.down && S.wpn > 0) : sel === "can" ? canBusy : (!!mine || (aim.down && sel !== "pick" && sel !== "shovel" && aim.tx >= 0)); heldAmt += ((working ? 1 : 0) - heldAmt) * Math.min(1, dt * 12); if (working) heldPh += dt * (sel === "pick" || sel === "shovel" ? 5.4 : sel === "weapon" ? 1 / WEAPONS[S.wpn].cd : 3);
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
      LG[c] = L; OP[c] = TILES[id].solid && !(smask && X >= 0 && X < W && Y >= 0 && Y < H && smask[Y * W + X] && tiles[Y * W + X] === orig[Y * W + X]) ? 3 : 1;
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
  var HILLS = [[[28, 98, 108], [18, 72, 86], [10, 50, 62]], [[150, 62, 40], [108, 44, 30], [66, 28, 22]], [[176, 214, 240], [130, 176, 214], [92, 138, 178]]];
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
  function hasW(x, y) { return x >= 0 && x < W && y >= 0 && y < H && walls[y * W + x] > 0; }
  function drawWall(g, wl, i, j, sx, sy) {   // a back wall tile: its picture, pushed back with a dark wash, with a soft edge where the wall stops so rooms read as rooms
    var v = ((Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0) & 3, e = Math.max(1, Math.round(ts / 11));
    g.drawImage(ATLAS, v * 16, wl * 16, 16, 16, sx, sy, ts, ts);
    g.fillStyle = "rgba(6,12,10,.4)"; g.fillRect(sx, sy, ts, ts);
    g.fillStyle = "rgba(0,0,0,.3)";
    if (!hasW(i - 1, j) && !TILES[get(i - 1, j)].solid) g.fillRect(sx, sy, e, ts);
    if (!hasW(i + 1, j) && !TILES[get(i + 1, j)].solid) g.fillRect(sx + ts - e, sy, e, ts);
    if (!hasW(i, j - 1) && !TILES[get(i, j - 1)].solid) g.fillRect(sx, sy, ts, e);
    if (!hasW(i, j + 1) && !TILES[get(i, j + 1)].solid) g.fillRect(sx, sy + ts - e, ts, e);
  }
  // ===== SMOOTH SPRITES: every pixel sprite (plants, mushrooms, torches, furniture, ore gems ...) is re-drawn once at 4x with rounded "melted" edges and a dark outline,
  // like the Adventure art. SMATLAS mirrors ATLAS at 4x size (cell = 64px). Opaque blocks (bricks, planks ...) stay crisp pixel art but get the same edge shading as the ground.
  var SMATLAS = null, SMOP = {}, SMGEM = {}, SMOK = false, SMS = 4;
  var SMCRISP = true;   // true: plants, ladders, furniture and ore gems are drawn as crisp pixel art (same as the hotbar). false: the old blurred, melted, outlined look
  function gooCanvas(src, sx, sy, sw, sh, S, pad, gemTd) {   // returns a (sw*S + pad*2) square canvas holding the smoothed, outlined version of a sprite cell
    var N = sw * S + pad * 2, a = document.createElement("canvas"), b = document.createElement("canvas"), out = document.createElement("canvas"); a.width = a.height = b.width = b.height = out.width = out.height = N;
    var ag = a.getContext("2d", { willReadFrequently: true }), bg = b.getContext("2d", { willReadFrequently: true }), og = out.getContext("2d");
    if (gemTd) {   // ore: keep only the gem pixels (the rock behind is drawn as smooth ground)
      var t16 = document.createElement("canvas"); t16.width = sw; t16.height = sh; var tg = t16.getContext("2d", { willReadFrequently: true }); tg.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
      var im = tg.getImageData(0, 0, sw, sh), d = im.data, c2 = hexRgb(gemTd.c2);
      for (var q = 0; q < d.length; q += 4) { var r = d[q], gg = d[q + 1], bb = d[q + 2], dist = Math.abs(r - c2[0]) + Math.abs(gg - c2[1]) + Math.abs(bb - c2[2]), sat = Math.max(r, gg, bb) - Math.min(r, gg, bb), lum = 0.299 * r + 0.587 * gg + 0.114 * bb; if (!(dist < 150 || sat > 70 || lum > 215)) d[q + 3] = 0; }
      tg.putImageData(im, 0, 0); ag.imageSmoothingEnabled = true; ag.drawImage(t16, 0, 0, sw, sh, pad, pad, sw * S, sh * S);
    } else { ag.imageSmoothingEnabled = true; ag.drawImage(src, sx, sy, sw, sh, pad, pad, sw * S, sh * S); }
    if (SMOK) { bg.filter = "blur(" + (S * 0.6).toFixed(1) + "px)"; bg.drawImage(a, 0, 0); bg.filter = "none"; } else bg.drawImage(a, 0, 0);
    var id2 = bg.getImageData(0, 0, N, N), dd = id2.data;
    for (var k = 0; k < dd.length; k += 4) { var al = dd[k + 3] / 255; al = al < 0.3 ? 0 : al > 0.62 ? 1 : (al - 0.3) / 0.32; dd[k + 3] = al * 255; }
    bg.putImageData(id2, 0, 0);
    var sil = document.createElement("canvas"); sil.width = sil.height = N; var sg = sil.getContext("2d"); sg.drawImage(b, 0, 0); sg.globalCompositeOperation = "source-in"; sg.fillStyle = "rgba(12,6,20,.9)"; sg.fillRect(0, 0, N, N);
    og.drawImage(b, 0, 0);
    var hl = document.createElement("canvas"); hl.width = hl.height = N; var hg2 = hl.getContext("2d"); hg2.drawImage(b, 0, 0); hg2.globalCompositeOperation = "source-atop"; var lgg = hg2.createLinearGradient(0, 0, 0, N); lgg.addColorStop(0, "rgba(255,255,255,.18)"); lgg.addColorStop(0.5, "rgba(255,255,255,0)"); lgg.addColorStop(1, "rgba(0,0,30,.22)"); hg2.fillStyle = lgg; hg2.fillRect(0, 0, N, N); og.drawImage(hl, 0, 0);   // soft light from above
    return out;
  }
  function hexRgb(h) { h = h.replace("#", ""); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function smTile(td) {
    var ag = ATLAS.getContext("2d", { willReadFrequently: true }), d = ag.getImageData(0, td.id * 16, 16, 16).data, op = true, x;
    for (x = 0; x < 16; x++) { if (d[(x) * 4 + 3] < 250 || d[(15 * 16 + x) * 4 + 3] < 250 || d[(x * 16) * 4 + 3] < 250 || d[(x * 16 + 15) * 4 + 3] < 250) { op = false; break; } }
    SMOP[td.id] = op; var gem = td.kind === "ore" && Math.abs(hexRgb(td.c)[0] - hexRgb(td.c2)[0]) + Math.abs(hexRgb(td.c)[1] - hexRgb(td.c2)[1]) + Math.abs(hexRgb(td.c)[2] - hexRgb(td.c2)[2]) > 90; SMGEM[td.id] = gem;
    var g = SMATLAS.getContext("2d");
    g.clearRect(0, td.id * 64, 256, 64);
    if (op && !gem) return;
    if (SMCRISP) {
      for (var v2 = 0; v2 < 4; v2++) {
        if (!gem) { g.drawImage(ATLAS, v2 * 16, td.id * 16, 16, 16, v2 * 64, td.id * 64, 16, 16); continue; }
        var gc = document.createElement("canvas"); gc.width = gc.height = 16; var gx = gc.getContext("2d", { willReadFrequently: true }); gx.drawImage(ATLAS, v2 * 16, td.id * 16, 16, 16, 0, 0, 16, 16);
        var gi = gx.getImageData(0, 0, 16, 16), gd = gi.data, gc2 = hexRgb(td.c2);   // ore: keep only the gem pixels, the rock behind is the ground
        for (var gq = 0; gq < gd.length; gq += 4) { var gr = gd[gq], gg2 = gd[gq + 1], gb = gd[gq + 2], gdist = Math.abs(gr - gc2[0]) + Math.abs(gg2 - gc2[1]) + Math.abs(gb - gc2[2]), gsat = Math.max(gr, gg2, gb) - Math.min(gr, gg2, gb), glum = 0.299 * gr + 0.587 * gg2 + 0.114 * gb; if (!(gdist < 150 || gsat > 70 || glum > 215)) gd[gq + 3] = 0; }
        gx.putImageData(gi, 0, 0); g.drawImage(gc, v2 * 64, td.id * 64);
      }
      return;
    }
    for (var v = 0; v < 4; v++) { var c = gooCanvas(ATLAS, v * 16, td.id * 16, 16, 16, 4, 0, gem ? td : null); g.drawImage(c, v * 64, td.id * 64); }
  }
  function buildSmooth() {
    try { var tc = document.createElement("canvas").getContext("2d"); tc.filter = "blur(1px)"; SMOK = tc.filter === "blur(1px)"; } catch (e) { SMOK = false; }
    SMATLAS = document.createElement("canvas"); SMATLAS.width = 256; SMATLAS.height = 64 * TILES.length;
    TILES.forEach(function (td) { if (td.id !== T.AIR && !NATC[td.id] && td.kind !== "leaves" && td.kind !== "water" && td.kind !== "lava") smTile(td); });
  }
  function smDraw(g, v, id, sx0, sy0, sw, sh, dx, dy, dw, dh) {
    if (SMCRISP) { g.imageSmoothingEnabled = false; g.drawImage(SMATLAS, v * 64 + sx0, id * 64 + sy0, sw, sh, dx, dy, dw, dh); return; }
    g.imageSmoothingEnabled = true; g.drawImage(SMATLAS, v * 64 + sx0 * 4, id * 64 + sy0 * 4, sw * 4, sh * 4, dx, dy, dw, dh); g.imageSmoothingEnabled = false;
  }
  function orePal(td) { var c = td.c; return c === "#3b3036" ? T.BASALT : c === "#5d7c93" ? T.FROSTROCK : T.STONE; }
  // ===== ADVENTURE LOOK: natural terrain is drawn as smooth shaded shapes (plum soil gradient, round pebbles, minty grass lip, blobby leaves) instead of pixel tiles =====
  var NATC = {}; NATC[T.MOSS] = NATC[T.MUD] = [[74, 56, 78], [20, 14, 30]]; NATC[T.CLAY] = [[132, 100, 104], [44, 30, 44]]; NATC[T.STONE] = [[104, 122, 144], [28, 36, 54]];
  NATC[T.BASALT] = [[78, 56, 82], [20, 13, 28]]; NATC[T.ASH] = [[118, 102, 112], [34, 26, 40]]; NATC[T.SNOW] = [[240, 250, 255], [150, 192, 218]]; NATC[T.ICE] = [[176, 234, 252], [60, 122, 176]];
  NATC[T.FROSTROCK] = [[110, 146, 178], [26, 44, 70]]; NATC[T.BEDROCK] = [[40, 34, 52], [10, 8, 16]];
  if (T.X_peat) NATC[T.X_peat] = [[84, 60, 66], [24, 14, 26]]; if (T.X_silt) NATC[T.X_silt] = [[150, 140, 128], [48, 40, 52]];
  if (T.X_obsidian) NATC[T.X_obsidian] = [[84, 60, 116], [18, 10, 30]]; if (T.X_permafrost) NATC[T.X_permafrost] = [[168, 204, 226], [58, 100, 140]];
  function mixRgb(a, b, k) { return "rgb(" + ((a[0] + (b[0] - a[0]) * k) | 0) + "," + ((a[1] + (b[1] - a[1]) * k) | 0) + "," + ((a[2] + (b[2] - a[2]) * k) | 0) + ")"; }

  // PERF: the soft edge shading used to build several gradient objects per tile per frame. They are now painted once per tile size into tiny canvases and stamped.
  var SHC = { ts: 0 }, BWS = {}, WST = [], GSPR = {};
  function shadeC(key, id, j, pal, d0, d1) {
    if (SHC.ts !== ts) SHC = { ts: ts };
    var c = SHC[key]; if (c) return c;
    c = SHC[key] = document.createElement("canvas");
    var w = ts, h = ts, q, gr, x0 = 0, y0 = 0, x1 = 0, y1 = 0, a, b;
    switch (key.charAt(0) === "s" ? "soil" : key) {
      case "t30": h = Math.ceil(ts * 0.3); y1 = h; a = "rgba(255,255,240,.34)"; b = "rgba(255,255,240,0)"; break;
      case "t34": h = Math.ceil(ts * 0.34); y1 = h; a = "rgba(255,255,235,.3)"; b = "rgba(255,255,235,0)"; break;
      case "t34n": h = Math.ceil(ts * 0.34); y1 = h; a = "rgba(255,255,240,.34)"; b = "rgba(255,255,240,0)"; break;
      case "bot": h = Math.ceil(ts * 0.45); y0 = h; a = "rgba(0,0,10,.38)"; b = "rgba(0,0,10,0)"; break;
      case "rt": w = Math.ceil(ts * 0.7); x1 = w; a = "rgba(0,0,12,.34)"; b = "rgba(0,0,12,0)"; break;
      case "lf": w = Math.ceil(ts * 0.7); x0 = w; a = "rgba(0,0,12,.34)"; b = "rgba(0,0,12,0)"; break;
      case "moss": h = Math.ceil(ts * 0.7); y1 = h; a = "rgba(63,174,120,.35)"; b = "rgba(63,174,120,0)"; break;
      case "lava": y1 = h; a = "#ff7a22"; b = "#d93c0a"; break;
      case "soil": y1 = h; a = mixRgb(pal[0], pal[1], d0); b = mixRgb(pal[0], pal[1], d1); break;
      case "log": x1 = w; break;
    }
    c.width = w; c.height = h; q = c.getContext("2d");
    gr = q.createLinearGradient(x0, y0, x1, y1);
    if (key === "log") { gr.addColorStop(0, "#2e1c18"); gr.addColorStop(0.22, "#6a4838"); gr.addColorStop(0.5, "#8a6450"); gr.addColorStop(0.78, "#5b4038"); gr.addColorStop(1, "#271713"); }
    else { gr.addColorStop(0, a); gr.addColorStop(1, b); }
    q.fillStyle = gr; q.fillRect(0, 0, w, h);
    return c;
  }
  function soilC(id, j, pal, d0, d1) { return shadeC("s" + id + "_" + j, id, j, pal, d0, d1); }
  function bwStr(b, sh) { var k = b * 100 + sh + 50, v = BWS[k]; if (!v) { var c = BACKWALL[b]; v = BWS[k] = "rgb(" + clamp(c[0] + sh, 0, 255) + "," + clamp(c[1] + sh, 0, 255) + "," + clamp(c[2] + sh, 0, 255) + ")"; } return v; }
  // PERF: glows are one soft white-to-clear sprite per colour, scaled and faded, instead of a new radial gradient per light per frame.
  function glowSpr(c) { var v = GSPR[c]; if (!v) { v = GSPR[c] = document.createElement("canvas"); v.width = v.height = 64; var q = v.getContext("2d"), rg = q.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, "rgba(" + c + ",1)"); rg.addColorStop(1, "rgba(" + c + ",0)"); q.fillStyle = rg; q.fillRect(0, 0, 64, 64); } return v; }
  function drawGlows(g, arr) {
    g.imageSmoothingEnabled = true;
    for (var i = 0; i < arr.length; i++) { var gl = arr[i], rad = gl[3] * ts; g.globalAlpha = Math.min(1, gl[4]); g.drawImage(glowSpr(gl[2]), gl[0] - rad, gl[1] - rad, rad * 2, rad * 2); }
    g.globalAlpha = 1; g.imageSmoothingEnabled = false;
  }
  function natTile(g, id, i, j, sx, sy) {
    var pal = NATC[id], d0 = clamp((j - SURF) / 46, 0, 1), d1 = clamp((j + 1 - SURF) / 46, 0, 1), hh = function (k) { return SW.hash(i, j, k); };
    g.drawImage(soilC(id, j, pal, d0, d1), sx, sy);
    var hi = mixRgb(pal[0], [255, 255, 255], 0.14), n = 2 + (hh(1) > 0.5 ? 1 : 0), k;
    for (k = 0; k < n; k++) {   // round pebbles with a soft shadow underneath
      var px = sx + ts * (0.15 + hh(k * 3 + 2) * 0.7), py = sy + ts * (0.15 + hh(k * 3 + 3) * 0.7), pr = ts * (0.07 + hh(k * 3 + 4) * 0.09);
      g.fillStyle = "rgba(0,0,0,.22)"; g.beginPath(); g.ellipse(px + 1, py + pr * 0.5, pr * 1.1, pr * 0.8, 0, 0, 6.2832); g.fill();
      g.fillStyle = hi; g.globalAlpha = 0.55 * (1 - d0 * 0.6); g.beginPath(); g.ellipse(px, py, pr, pr * 0.8, 0, 0, 6.2832); g.fill(); g.globalAlpha = 1;
    }
    var nT = !TILES[get(i, j - 1)].solid || get(i, j - 1) === T.LEAVES, nB = !TILES[get(i, j + 1)].solid, nL = !TILES[get(i - 1, j)].solid, nR = !TILES[get(i + 1, j)].solid;
    if (id === T.MOSS && nT) {   // minty grass lip with scalloped underside, highlight and tufts (like the Adventure ground)
      g.fillStyle = "#2f9a6a"; g.fillRect(sx, sy - ts * 0.04, ts, ts * 0.16);
      for (k = 0; k < 3; k++) { g.beginPath(); g.arc(sx + ts * ((k + 0.5) / 3) + (hh(k + 20) - 0.5) * ts * 0.1, sy + ts * 0.1, ts * (0.15 + hh(k + 30) * 0.05), 0, 6.2832); g.fill(); }
      g.fillStyle = "#3fae78"; g.fillRect(sx, sy - ts * 0.04, ts, ts * 0.09);
      g.fillStyle = "rgba(155,245,191,.65)"; g.fillRect(sx, sy - ts * 0.04, ts, Math.max(1, ts * 0.04));
      if (hh(40) > 0.55) { g.fillStyle = "#58d68b"; var tx = sx + ts * (0.2 + hh(41) * 0.6); g.beginPath(); g.moveTo(tx - 2, sy); g.lineTo(tx, sy - ts * 0.3); g.lineTo(tx + 2, sy); g.fill(); g.beginPath(); g.moveTo(tx + 1, sy); g.lineTo(tx + 4, sy - ts * 0.22); g.lineTo(tx + 4, sy); g.fill(); }
      g.drawImage(shadeC("moss"), sx, sy);
      if (nL) { g.fillStyle = "#2f9a6a"; g.fillRect(sx, sy, ts * 0.1, ts * 0.4); } if (nR) { g.fillStyle = "#2f9a6a"; g.fillRect(sx + ts * 0.9, sy, ts * 0.1, ts * 0.4); }
    } else if (nT) { g.drawImage(shadeC("t34n"), sx, sy); }
    edgeShade(g, i, j, sx, sy, nB, nL, nR);
  }
  function edgeShade(g, i, j, sx, sy, nB, nL, nR) {
    if (nB) { var bgc = shadeC("bot"); g.drawImage(bgc, sx, sy + ts - bgc.height); }
    if (nR && j >= col[i + 1]) g.drawImage(shadeC("rt"), sx + ts, sy);
    if (nL && j >= col[i - 1]) { var lfc = shadeC("lf"); g.drawImage(lfc, sx - lfc.width, sy); }
  }
  function natLog(g, i, j, sx, sy) {   // round trunk: dark bark edges, lit centre, bark grooves and the odd knot
    g.drawImage(shadeC("log"), sx, sy); g.fillStyle = "rgba(20,10,8,.45)";
    for (var k = 0; k < 3; k++) { var gx = sx + ts * (0.2 + SW.hash(i, 0, k + 50) * 0.6), y0 = sy + ts * SW.hash(i, j, k + 60) * 0.4; g.fillRect(gx, y0, Math.max(1, ts * 0.05), ts * (0.4 + SW.hash(i, j, k + 70) * 0.5)); }
    if (SW.hash(i, j, 80) > 0.8) { g.fillStyle = "#3a2420"; g.beginPath(); g.ellipse(sx + ts * 0.5, sy + ts * 0.5, ts * 0.16, ts * 0.22, 0, 0, 6.2832); g.fill(); g.fillStyle = "rgba(255,200,150,.25)"; g.fillRect(sx + ts * 0.4, sy + ts * 0.34, ts * 0.1, 2); }
    g.fillStyle = "rgba(255,230,190,.12)"; g.fillRect(sx + ts * 0.42, sy, ts * 0.08, ts);
  }
  // ---- Tree leaves (Adventure look) ----
  // Each leaf tile is painted once per (open-edge mask, variant, tile size) into a small cached canvas, then stamped every frame.
  // Overlapping pointed leaves in four tones (dark back layer, mid, light, sunlit tips) with a soft shadow under each leaf. Open edges get a scalloped,
  // rounded silhouette instead of a square block: a lit rim on top, a deep shadow underneath, and light/dark sides. Leaf shapes wrap around the tile
  // so neighbouring tiles blend into one canopy with no visible grid.
  var LEAFCACHE = {}, LEAFKEY = 0, LEAFVARIANTS = 6;
  function buildLeafTile(mask, v, S) {
    var cv = document.createElement("canvas"); cv.width = cv.height = S;
    var g = cv.getContext("2d"), seed = ((v + 1) * 7919 + mask * 131) >>> 0, TAU = 6.2832, bumps = [], k;
    g.scale(S, S);
    function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
    // silhouette: an inset block plus round bumps along every open edge
    var ins = 0.17, r = 0.26, x0 = mask & 4 ? ins : 0, y0 = mask & 1 ? ins : 0, x1 = mask & 8 ? 1 - ins : 1, y1 = mask & 2 ? 1 - ins : 1, cr = 0.3;
    g.beginPath();
    if (g.roundRect) g.roundRect(x0, y0, x1 - x0, y1 - y0, [mask & 1 && mask & 4 ? cr : 0, mask & 1 && mask & 8 ? cr : 0, mask & 2 && mask & 8 ? cr : 0, mask & 2 && mask & 4 ? cr : 0]);   // round the outer corners
    else g.rect(x0, y0, x1 - x0, y1 - y0);
    [1, 2, 4, 8].forEach(function (side) {
      if (!(mask & side)) return;
      for (var q = 0; q < 3; q++) {
        var t = (q + 0.5) / 3 + (rnd() - 0.5) * 0.1, dd = r * (1 + 0.3 * rnd()), rr = r * (0.9 + 0.22 * rnd());
        var bx = side === 4 ? dd : side === 8 ? 1 - dd : t, by = side === 1 ? dd : side === 2 ? 1 - dd : t;
        g.moveTo(bx + rr, by); g.arc(bx, by, rr, 0, TAU); bumps.push([side, bx, by, rr]);
      }
    });
    g.save(); g.clip();
    g.fillStyle = "#1d7249"; g.fillRect(0, 0, 1, 1);
    function leaf(cx, cy, len, ang, col, shadow) {
      var ca = Math.cos(ang), sa = Math.sin(ang), w = len * 0.5, ox, oy;
      for (ox = -1; ox <= 1; ox++) for (oy = -1; oy <= 1; oy++) {
        var bx = cx + ox, by = cy + oy;
        if (bx + len < 0 || bx - len > 1 || by + len < 0 || by - len > 1) continue;
        for (var pass = shadow ? 0 : 1; pass < 2; pass++) {
          var sx = bx + (pass ? 0 : 0.025), sy = by + (pass ? 0 : 0.035), tx = sx + ca * len, ty = sy + sa * len, mx = sx + ca * len * 0.5, my = sy + sa * len * 0.5;
          g.fillStyle = pass ? col : "rgba(0,28,18,.45)";
          g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(mx - sa * w, my + ca * w, tx, ty); g.quadraticCurveTo(mx + sa * w, my - ca * w, sx, sy); g.fill();
        }
      }
    }
    function up() { return -1.5708 + (rnd() - 0.5) * 2.6; }
    for (k = 0; k < 7; k++) leaf(rnd(), rnd(), 0.5, rnd() * TAU, "#0e4a32", false);       // deep back layer
    for (k = 0; k < 11; k++) leaf(rnd(), rnd(), 0.36, up(), "#23895a", true);              // body
    for (k = 0; k < 9; k++) leaf(rnd(), rnd(), 0.3, up(), "#3fb274", true);                // lit leaves
    for (k = 0; k < 5; k++) leaf(rnd() * 0.75, rnd() * 0.75, 0.2, -1.5708 + (rnd() - 0.5) * 2, "#8fe8a0", false);   // sunlit tips toward the top-left
    if (rnd() < 0.4) { g.fillStyle = "rgba(235,255,190,.85)"; g.fillRect(0.15 + rnd() * 0.65, 0.12 + rnd() * 0.5, 0.05, 0.05); }
    // light and shade on the open edges
    var lg;
    if (mask & 1) { lg = g.createLinearGradient(0, 0, 0, 0.4); lg.addColorStop(0, "rgba(215,255,170,.5)"); lg.addColorStop(1, "rgba(215,255,170,0)"); g.fillStyle = lg; g.fillRect(0, 0, 1, 0.4); }
    if (mask & 2) { lg = g.createLinearGradient(0, 1, 0, 0.55); lg.addColorStop(0, "rgba(0,25,12,.6)"); lg.addColorStop(1, "rgba(0,25,12,0)"); g.fillStyle = lg; g.fillRect(0, 0.55, 1, 0.45); }
    if (mask & 4) { lg = g.createLinearGradient(0, 0, 0.28, 0); lg.addColorStop(0, "rgba(200,255,170,.22)"); lg.addColorStop(1, "rgba(200,255,170,0)"); g.fillStyle = lg; g.fillRect(0, 0, 0.28, 1); }
    if (mask & 8) { lg = g.createLinearGradient(1, 0, 0.72, 0); lg.addColorStop(0, "rgba(0,25,12,.4)"); lg.addColorStop(1, "rgba(0,25,12,0)"); g.fillStyle = lg; g.fillRect(0.72, 0, 0.28, 1); }
    if (!(mask & 15)) { g.fillStyle = "rgba(0,28,14,.14)"; g.fillRect(0, 0, 1, 1); }                  // buried in the canopy: a touch darker
    g.lineWidth = 0.028;
    bumps.forEach(function (b) {                                                                // scalloped rim: sunlit on top and left, dark underneath and right
      var a0 = b[0] === 1 ? 3.3 : b[0] === 2 ? 0.15 : b[0] === 4 ? 2.2 : -0.9, a1 = a0 + (b[0] === 1 ? 2.6 : b[0] === 2 ? 2.8 : 2.2);
      g.strokeStyle = b[0] === 1 || b[0] === 4 ? "rgba(190,255,150,.65)" : "rgba(4,30,18,.55)";
      g.beginPath(); g.arc(b[1], b[2], b[3] * 0.93, a0, a1); g.stroke();
    });
    g.globalCompositeOperation = "destination-out"; g.fillStyle = "#000";
    [[16, 0, 0], [32, 1, 0], [64, 0, 1], [128, 1, 1]].forEach(function (c) { if (mask & c[0]) { g.beginPath(); g.arc(c[1], c[2], 0.3, 0, TAU); g.fill(); } });
    g.restore();
    return cv;
  }
  function natLeaf(g, i, j, sx, sy, mask) {
    var S = Math.max(2, Math.round(ts * dpr)), v = Math.floor(SW.hash(i, j, 90) * LEAFVARIANTS) % LEAFVARIANTS, key = mask * 8 + v;
    if (LEAFKEY !== S) { LEAFCACHE = {}; LEAFKEY = S; }
    var cv = LEAFCACHE[key] || (LEAFCACHE[key] = buildLeafTile(mask, v, S));
    g.drawImage(cv, 0, 0, S, S, sx, sy, ts, ts);
  }
  function ridgeLine(wx, seg, sd) {   // 0..1 low-poly mountain line: a peak every `seg` tiles, a valley between, straight edges for a crisp look
    var u = wx / seg * 2, k = Math.floor(u), f = u - k, hv = function (n) { return n & 1 ? SW.hash(n, sd, 9) * 0.35 : 0.55 + SW.hash(n, sd, 9) * 0.45; };
    return hv(k) + (hv(k + 1) - hv(k)) * f;
  }
  function horizon(cx) {   // the average ground line around the camera (smooth, so the backdrop glides instead of jumping)
    var sum = 0, n = 0, x0 = Math.floor(cx); for (var q = -48; q <= 48; q += 4) { var c = col[clamp(x0 + q, 0, W - 1)]; if (c < H) { sum += c; n++; } }
    return n ? sum / n : SURF;
  }
  function render(now) {
    var t = S.time, day = daylight(t), g = ctx, i, j, night = 1 - day, ph = phaseOf(t);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false;
    ox = Math.round(vw / 2 - cam.x * ts); oy = Math.round(vh / 2 - cam.y * ts);
    if (shake > 0 && !reduce) { ox += Math.round((Math.random() - 0.5) * shake * 10); oy += Math.round((Math.random() - 0.5) * shake * 10); }
    var HZ = horizon(cam.x), bw = biomeMix(cam.x), above = clamp(1 - (cam.y - (HZ + 3)) / 9, 0, 1);   // HZ: the local ground line, so valleys and peaks both get sky
    // --- sky: three-stop gradient, stars, sun/moon, clouds, aurora ---
    var sk = skyAt(t), gr = g.createLinearGradient(0, 0, 0, vh), mid = mixC(sk[0], sk[1], 0.55);
    var dxa = Math.max(0, Math.floor(-ox / ts)), dxb = Math.min(W - 1, Math.floor((vw - ox) / ts)), dtop = Math.floor(-oy / ts), dmx = 0, dq;
    for (dq = dxa; dq <= dxb; dq++) if (col[dq] > dmx) dmx = col[dq];
    var deepV = dtop > dmx + 1;   // PERF: every pixel is underground, so the sky, hills and clouds could not be seen: just a flat colour behind any water
    if (deepV) { g.fillStyle = rgb(sk[1]); g.fillRect(0, 0, vw, vh); }
    else {
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
    // --- two far mountain ranges: crisp low-poly ridgelines with snow caps, fading into the sky (behind the hills) ---
    for (var FL = 0; FL < 2; FL++) {
      var fpar = FL ? 0.09 : 0.035, famp = FL ? 20 : 34, fbase = HZ - (FL ? 4 : 8), fmix = FL ? 0.5 : 0.7, fsd = 61 + FL * 7, fpts = [];
      var fm = mixArr([HILLS[0][FL], HILLS[1][FL], HILLS[2][FL]], bw), fmc = mixC(mixC(fm, [120, 150, 190], 0.25), sk[1], fmix);
      for (var fx2 = -16; fx2 <= vw + 26; fx2 += 10) {
        var fwx = cam.x * fpar + (fx2 - vw / 2) / ts + FL * 500;
        fpts.push(fx2, oy + (fbase - (ridgeLine(fwx, 30, fsd) * 0.8 + ridgeLine(fwx, 9, fsd + 3) * 0.2) * famp * (0.8 + bw[2] * 0.3 - bw[0] * 0.2)) * ts);
      }
      g.fillStyle = rgb(mixC([8, 14, 24], fmc, 0.25 + 0.75 * day)); g.beginPath(); g.moveTo(-16, vh);
      for (var fq = 0; fq < fpts.length; fq += 2) g.lineTo(fpts[fq], fpts[fq + 1]);
      g.lineTo(vw + 16, vh); g.closePath(); g.fill();
      if (bw[1] < 0.85) {   // snow caps: everything above a ragged snow line (Ember Bog's ash peaks stay bare)
        var snl = oy + (fbase - famp * 0.6) * ts, sa2 = (FL ? 0.7 : 0.85) * (1 - bw[1]);
        g.fillStyle = "rgba(" + Math.round(lerp(120, 236, day)) + "," + Math.round(lerp(135, 244, day)) + "," + Math.round(lerp(175, 255, day)) + "," + sa2.toFixed(2) + ")"; g.beginPath();
        for (fq = 0; fq < fpts.length; fq += 2) g.lineTo(fpts[fq], fpts[fq + 1]);
        for (fq = fpts.length - 2; fq >= 0; fq -= 2) { var jy = snl + ((fq / 2) % 3 === 1 ? ts * 0.9 : (fq / 2) % 3 === 2 ? ts * 0.3 : -ts * 0.2); g.lineTo(fpts[fq], Math.max(fpts[fq + 1], jy)); }
        g.closePath(); g.fill();
      }
    }
    // --- three parallax hill layers in the colours and shapes of the biome you are in ---
    for (var L2 = 0; L2 < 3; L2++) {
      var par = 0.12 + L2 * 0.2, amp = 5 + L2 * 3.5, base = HZ - 3 + L2 * 3.5, f2 = 0.045 + L2 * 0.03, cc = mixArr([HILLS[0][L2], HILLS[1][L2], HILLS[2][L2]], bw);
      var fog = mixC(cc, sk[1], 0.5 - L2 * 0.2); cc = mixC(cc, fog, 0.55 * (1 - L2 * 0.3));
      g.fillStyle = rgb(mixC([6, 12, 20], cc, 0.2 + 0.8 * day)); g.beginPath(); g.moveTo(0, vh);
      for (var sx2 = 0; sx2 <= vw + 12; sx2 += 12) {
        var wx = cam.x * par + (sx2 - vw / 2) / ts, sm = Math.sin(wx * f2) * amp + Math.sin(wx * f2 * 2.3 + 1) * amp * 0.4;
        var jag = (1 - Math.abs(Math.sin(wx * f2 * 1.7 + L2))) * amp * 1.1, pk = Math.abs(Math.sin(wx * f2 * 1.2 + L2 * 2)) * amp * 1.0;
        g.lineTo(sx2, oy + (base + sm * bw[0] + (jag - amp * 0.4) * bw[1] - (pk - amp * 0.3) * bw[2]) * ts);
      }
      g.lineTo(vw + 12, vh); g.closePath(); g.fill();
      // mist pooled on top of this layer: farther layers fade into the sky colour (atmospheric perspective)
      var fy0 = oy + (base - amp * 1.6) * ts, fgr = g.createLinearGradient(0, fy0, 0, fy0 + ts * 9);
      fgr.addColorStop(0, "rgba(" + (sk[1][0] | 0) + "," + (sk[1][1] | 0) + "," + (sk[1][2] | 0) + ",0)"); fgr.addColorStop(0.45, "rgba(" + (sk[1][0] | 0) + "," + (sk[1][1] | 0) + "," + (sk[1][2] | 0) + "," + ((0.3 - L2 * 0.07) * above).toFixed(3) + ")"); fgr.addColorStop(1, "rgba(" + (sk[1][0] | 0) + "," + (sk[1][1] | 0) + "," + (sk[1][2] | 0) + ",0)");
      g.fillStyle = fgr; g.fillRect(0, fy0, vw, ts * 9);
      if (L2 === 1 && bw[0] > 0.25) {   // giant mangrove silhouettes standing on the middle hills
        var tcol = mixC(cc, [8, 24, 28], 0.45), rim = mixC(cc, sk[1], 0.45), k0 = Math.floor((cam.x * par - vw / ts) / 16) - 1, k1 = Math.ceil((cam.x * par + vw / ts) / 16) + 1;
        for (var tk = k0; tk <= k1; tk++) {
          var tx = tk * 16 + SW.hash(tk, 3, 9) * 8, th = 11 + SW.hash(tk, 4, 9) * 9, tw = 5.5 + SW.hash(tk, 5, 9) * 4, tsx = vw / 2 + (tx - cam.x * par) * ts, tby = oy + (base + 3) * ts, tty = tby - th * ts;
          if (tsx < -tw * ts * 2 || tsx > vw + tw * ts * 2) continue;
          g.globalAlpha = bw[0] * above; g.fillStyle = rgb(tcol);
          g.beginPath(); g.moveTo(tsx - ts * 0.9, tby); g.quadraticCurveTo(tsx - ts * 0.35, tby - th * ts * 0.5, tsx - ts * 0.3, tty); g.lineTo(tsx + ts * 0.3, tty); g.quadraticCurveTo(tsx + ts * 0.35, tby - th * ts * 0.5, tsx + ts * 0.9, tby); g.fill();
          for (var cb = 0; cb < 4; cb++) { var cxx = tsx + (cb - 1.5) * tw * ts * 0.42, cyy = tty + Math.abs(cb - 1.5) * ts * 0.9; g.beginPath(); g.ellipse(cxx, cyy, tw * ts * 0.5, tw * ts * 0.26, 0, 0, 6.2832); g.fill(); }
          g.fillStyle = rgb(rim); g.globalAlpha = bw[0] * above * 0.5; g.beginPath(); g.ellipse(tsx - tw * ts * 0.1, tty - tw * ts * 0.12, tw * ts * 0.55, tw * ts * 0.07, 0, 0, 6.2832); g.fill();
          g.globalAlpha = bw[0] * above * 0.8; g.strokeStyle = rgb(tcol); g.lineWidth = Math.max(1, ts * 0.07);
          for (var vn = 0; vn < 6; vn++) { var vx = tsx + (vn - 2.5) * tw * ts * 0.2, vl = (1.2 + SW.hash(tk, vn, 11) * 2.8) * ts; g.beginPath(); g.moveTo(vx, tty + ts * 0.8); g.lineTo(vx + Math.sin(now / 1400 + vn + tk) * ts * 0.12, tty + ts * 0.8 + vl); g.stroke(); }
          g.globalAlpha = 1;
        }
      }
      if (bw[2] > 0.4 && L2 < 2) { /* snowy caps */ g.fillStyle = "rgba(255,255,255," + (0.35 * day * bw[2]) + ")"; g.fillRect(0, 0, 0, 0); }
    }
    var hz = oy + (HZ - 1) * ts, fg = g.createLinearGradient(0, hz - ts * 7, 0, hz + ts * 1.5), fc = sk[1];
    fg.addColorStop(0, "rgba(" + (fc[0] | 0) + "," + (fc[1] | 0) + "," + (fc[2] | 0) + ",0)"); fg.addColorStop(1, "rgba(" + (fc[0] | 0) + "," + (fc[1] | 0) + "," + (fc[2] | 0) + "," + (0.4 * above) + ")");
    g.fillStyle = fg; g.fillRect(0, hz - ts * 7, vw, ts * 8.5);
    }
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
      var id = tiles[j * W + i], td = TILES[id], sx3 = ox + i * ts, sy = oy + j * ts, under = j >= col[i] && j > world.top[i];   // cave wall only below the natural ground line: air under a roof, eave or overhang you build stays open sky
      if (id === T.AIR) {
        if (walls[j * W + i]) { drawWall(g, walls[j * W + i], i, j, sx3, sy); continue; }
        if (under) {
          var bwc = BACKWALL[world.bio[i]], nb = (TILES[get(i - 1, j)].solid ? 1 : 0) + (TILES[get(i + 1, j)].solid ? 1 : 0) + (TILES[get(i, j - 1)].solid ? 1 : 0) + (TILES[get(i, j + 1)].solid ? 1 : 0), sh = ((i * 7 + j * 13) & 3) * 2 - nb * 5;
          g.fillStyle = bwStr(world.bio[i], sh); g.fillRect(sx3, sy, ts, ts);
          g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(sx3 + ts * 0.18, sy + ts * 0.2, ts * 0.12, ts * 0.12); g.fillRect(sx3 + ts * 0.62, sy + ts * 0.66, ts * 0.1, ts * 0.1);
        }
        continue;
      }
      if (id === T.WATER) {
        var top = get(i, j - 1) !== T.WATER, dd = 0; if (!top) { dd = 1; while (dd < 6 && get(i, j - dd - 1) === T.WATER) dd++; }
        g.fillStyle = WST[dd] || (WST[dd] = "rgba(" + (52 - dd * 6) + "," + (170 - dd * 14) + "," + (178 - dd * 8) + "," + (0.62 + dd * 0.04) + ")"); g.fillRect(sx3, sy, ts, ts);
        if (top) { var wy = Math.round(wob * 1.5 + Math.sin(i * 0.9 + now / 400) * 1.2 + 2); g.fillStyle = "rgba(210,255,248,.7)"; g.fillRect(sx3, sy + wy, ts, 2); g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(sx3, sy, ts, wy); }
        else if (!reduce && ((i * 31 + j * 17 + (now / 380 | 0)) % 11) === 0) { g.fillStyle = "rgba(190,255,248,.22)"; g.fillRect(sx3 + ts * 0.2, sy + ts * 0.4, ts * 0.5, 2); }
        continue;
      }
      if (id === T.LAVA) {
        g.drawImage(shadeC("lava"), sx3, sy);
        g.fillStyle = "#ffc24a"; g.fillRect(sx3 + ts * (0.1 + 0.12 * Math.sin(now / 420 + i)), sy + ts * 0.18, ts * 0.5, ts * 0.2); g.fillRect(sx3 + ts * (0.45 + 0.12 * Math.cos(now / 380 + j)), sy + ts * 0.58, ts * 0.4, ts * 0.18);
        g.fillStyle = "rgba(90,20,6,.5)"; g.fillRect(sx3 + ts * ((i * 37 % 7) / 9), sy + ts * 0.82, ts * 0.22, ts * 0.12);
        if (get(i, j - 1) !== T.LAVA) { g.fillStyle = "#ffe9a0"; g.fillRect(sx3, sy, ts, Math.max(2, edge)); if (!reduce && ((i * 13 + (now / 600 | 0)) % 9) === 0) { g.fillStyle = "#fff2b0"; g.fillRect(sx3 + ts * 0.4, sy - ts * 0.25 - ((now / 20) % 6), 3, 3); } }
        if (!lowq || !(i & 1)) glows.push([sx3 + ts / 2, sy + ts / 2, "255,110,30", 3.6, lowq ? 0.4 : 0.24]); continue;
      }
      var v = ((Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0) & 3;
      if (!td.solid) {
        if (walls[j * W + i]) drawWall(g, walls[j * W + i], i, j, sx3, sy);
        else if (under) { g.fillStyle = bwStr(world.bio[i], 0); g.fillRect(sx3, sy, ts, ts); }
        if (td.kind === "vine") { var vhalf = Math.round(ts / 2), vo = Math.round(Math.sin(now / 900 + i * 1.7) * ts * 0.08); smDraw(g, v, id, 0, 0, 16, 8, sx3, sy, ts, vhalf); smDraw(g, v, id, 0, 8, 16, 8, sx3 + vo, sy + vhalf, ts, ts - vhalf); }
        else if (td.kind === "reed" || td.kind === "bloom" || td.kind === "glowcap" || td.kind === "flower" || td.sway) { var half = Math.round(ts / 2), off = Math.round(sw * ts * 0.06 * (1 + (i % 3) * 0.3)); smDraw(g, v, id, 0, 8, 16, 8, sx3, sy + half, ts, ts - half); smDraw(g, v, id, 0, 0, 16, 8, sx3 + off, sy, ts, half); }
        else if (td.kind === "painting") g.drawImage(paintingCanvas(i, j), 0, 0, 16, 16, sx3, sy, ts, ts);
        else if (SMOP[id]) g.drawImage(ATLAS, v * 16, id * 16, 16, 16, sx3, sy, ts, ts);
        else smDraw(g, v, id, 0, 0, 16, 16, sx3, sy, ts, ts);
      } else if (td.kind === "leaves") {
        var lo = function (a, b) { return !TILES[get(a, b)].solid; };
        var lmask = (lo(i, j - 1) ? 1 : 0) | (lo(i, j + 1) ? 2 : 0) | (lo(i - 1, j) ? 4 : 0) | (lo(i + 1, j) ? 8 : 0);
        lmask |= (!(lmask & 5) && lo(i - 1, j - 1) ? 16 : 0) | (!(lmask & 9) && lo(i + 1, j - 1) ? 32 : 0) | (!(lmask & 6) && lo(i - 1, j + 1) ? 64 : 0) | (!(lmask & 10) && lo(i + 1, j + 1) ? 128 : 0);   // inner corners get a rounded notch
        natLeaf(g, i, j, sx3, sy, lmask);
      } else {
        if (NATC[id]) { natTile(g, id, i, j, sx3, sy); continue; }
        if (id === T.LOG) { natLog(g, i, j, sx3, sy); }
        else if (SMGEM[id]) { natTile(g, orePal(td), i, j, sx3, sy); smDraw(g, v, id, 0, 0, 16, 16, sx3, sy, ts, ts); }
        else g.drawImage(ATLAS, v * 16, id * 16, 16, 16, sx3, sy, ts, ts);
        // exposed faces get a lit rim on top and a shadow on the sides and bottom, so caves and cliffs read clearly
        var nT = !TILES[get(i, j - 1)].solid || get(i, j - 1) === T.LEAVES, nB = !TILES[get(i, j + 1)].solid, nL = !TILES[get(i - 1, j)].solid, nR = !TILES[get(i + 1, j)].solid;
        if (td.kind === "door" || id === T.LOG || SMGEM[id]) { /* the door art has its own frame and shading */ }
        else if (td.kind === "leaves") {
          if (nT) { g.fillStyle = "rgba(190,255,150,.22)"; g.fillRect(sx3, sy, ts, edge); }
          if (nB) { g.fillStyle = "rgba(0,20,5,.32)"; g.fillRect(sx3, sy + ts - edge * 1.5, ts, edge * 1.5); }
        } else {
          if (nT && td.kind !== "moss" && td.kind !== "snow") { g.drawImage(shadeC("t30"), sx3, sy); }
          g.fillStyle = "rgba(0,0,0,.3)"; if (nB) g.fillRect(sx3, sy + ts - edge, ts, edge); if (nL) g.fillRect(sx3, sy, edge, ts); if (nR) g.fillRect(sx3 + ts - edge, sy, edge, ts);
          if (td.kind !== "door" && td.light < 3) {   // rounded 3D shading: a bright bevel on the lit top and a soft shadow thrown onto whatever is next to the block
            if (nT) g.drawImage(shadeC("t34"), sx3, sy);
            if (nB) { var bgc = shadeC("bot"); g.drawImage(bgc, sx3, sy + ts - bgc.height); }
            if (nR && j >= col[i + 1]) g.drawImage(shadeC("rt"), sx3 + ts, sy);
            if (nL && j >= col[i - 1]) { var lfc = shadeC("lf"); g.drawImage(lfc, sx3 - lfc.width, sy); }
          }
        }
      }
      if (td.light >= 3 && td.solid === false || td.light >= 6) glows.push([sx3 + ts / 2, sy + ts / 2, td.glow ? td.glow : id === T.TORCH || id === T.LANTERN || id === T.CAMPFIRE ? "255,170,60" : id === T.CINDER || id === T.BLOOM ? "255,120,50" : id === T.SPIKE || id === T.CRYSTAL ? "130,225,255" : "80,240,190", td.gr ? td.gr : id === T.TORCH ? 4.6 : id === T.CAMPFIRE ? 5 : id === T.LANTERN ? 4.2 : 2.7, td.ga ? td.ga : id === T.TORCH ? 0.3 : id === T.CAMPFIRE ? 0.33 : id === T.LANTERN ? 0.26 : 0.17]);
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
    if (day > 0.6 && above > 0.05 && !lowq) { g.globalCompositeOperation = "soft-light"; var sg2 = g.createLinearGradient(0, 0, 0, vh); sg2.addColorStop(0, "rgba(255,226,150," + (0.2 * above * day).toFixed(3) + ")"); sg2.addColorStop(1, "rgba(255,226,150,0)"); g.fillStyle = sg2; g.fillRect(0, 0, vw, vh); g.globalCompositeOperation = "source-over"; }
    // dusk/dawn colour grade over the open air
    if ((ph.id === "dusk" || ph.id === "dawn") && above > 0) { g.globalCompositeOperation = lowq ? "source-over" : "soft-light"; g.fillStyle = "rgba(255,130,70," + ((lowq ? 0.16 : 0.55) * Math.sin(ph.k * Math.PI) * above) + ")"; g.fillRect(0, 0, vw, vh); g.globalCompositeOperation = "source-over"; }
    g.imageSmoothingEnabled = false;
    g.globalCompositeOperation = "lighter";
    drawGlows(g, glows);
    g.imageSmoothingEnabled = true; flies.forEach(function (fl) { var fx = ox + fl.x * ts, fy = oy + fl.y * ts, a = fl.a * (0.5 + 0.5 * Math.sin(fl.ph * 3)); g.globalAlpha = 0.85 * a; g.drawImage(glowSpr("220,255,120"), fx - ts * 0.8, fy - ts * 0.8, ts * 1.6, ts * 1.6); }); g.globalAlpha = 1; g.imageSmoothingEnabled = false;
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
  function heldCanvas(tier) { return sprCanvas("pick" + tier); }
  function heldShovel() { return sprCanvas("shovel"); }
  function heldWeapon(tier) { return sprCanvas("wpn" + tier); }
  // Arm angle (phi: 0 = hanging, ~2.5 = raised overhead) and tool angle for the current swing, so the arm and the tool move as one
  function toolPose() {
    var sway = reduce ? 0 : Math.sin(p.walk * 5), moving = p.on && Math.abs(p.vx) > 0.5 ? 1 : 0;
    if (sel === "can") return { ang: heldAmt * 0.8 + sway * 0.03 * (1 - heldAmt), phi: (S.can >= 1 ? 0.95 + sway * 0.1 * moving : 0.3) + heldAmt * 0.45, has: S.can >= 1, kind: "can" };   // held out in front, tipping forward to pour
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
    var hpx = Math.max(1, Math.round(ts * 1.7 / 24));   // one avatar art pixel; tools are drawn a touch smaller than that so they read as small, neat props
    var put = function (cv, k, gx, gy) { var z = hpx * k; g.save(); g.translate(hx, hy); g.rotate(tp.ang); g.imageSmoothingEnabled = false; g.drawImage(cv, -gx * z, -gy * z, 16 * z, 16 * z); g.restore(); };   // (gx, gy) = the grip cell that sits in the paw
    if (sel === "pick") {
      if (S.tier < 1) return;
      put(heldCanvas(S.tier), 0.8, 4, 12);
    } else if (sel === "shovel") {
      if (!S.shovel) return;
      put(heldShovel(), 0.8, 4, 12);
    } else if (sel === "can") {
      if (!S.can) return;
      put(heldCan(), 0.8, 3, 9.5);
    } else if (sel === "weapon") {
      if (S.wpn < 1) return;
      put(heldWeapon(S.wpn), 0.85, 4, 11.5);
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
    g.scale(1 / sq, sq); g.scale(AVS, AVS); if (p.wet) g.globalAlpha = 0.85;
    if (hurtT > 0 && (reduce || Math.floor(now / 70) % 2)) g.globalAlpha = 0.45;
    var SP = getSprite();
    if (SP) {
      var pose = !p.on ? (p.vy < 0 ? "jump" : "fall") : Math.abs(p.vx) > 0.5 ? "walk" + (Math.floor(p.walk / 0.8) % 4) : "idle" + (reduce ? 0 : Math.floor(now / 520) % 2);
      var fx = -SP.fw / 2, fy = -SP.footY - ts * 0.12, sh = SP.shoulder(pose), tp = toolPose(), sm0 = g.imageSmoothingEnabled;
      var gl2 = 1 - daylight(S.time);
      if (!lowq && (gl2 > 0.2 || p.y > col[clamp(Math.floor(p.x), 0, W - 1)] + 3)) { g.shadowColor = "rgba(110,255,210,.45)"; g.shadowBlur = ts * 0.4; }
      g.imageSmoothingEnabled = false;
      if (S.bag > 0) {   // the backpack, on the back (the side away from the way you face), drawn first so the body overlaps it
        var bs = SP.s, by0 = fy + SP.footY - 31 * bs + 13 * bs, bx0 = fx + 1.5 * bs, big = S.bag >= 2, bc = big ? "#1f7a6a" : "#b88a52", bd = big ? "#0f3f38" : "#6b4a26", bf = big ? "#2fb59a" : "#d3a96b";
        g.fillStyle = bd; g.fillRect(bx0 - bs * 0.6, by0 - bs * 0.6, bs * 6.2, bs * 10.2);
        g.fillStyle = bc; g.fillRect(bx0, by0, bs * 5, bs * 9);
        g.fillStyle = bf; g.fillRect(bx0, by0, bs * 5, bs * 2.6);
        if (big) { g.fillStyle = bd; g.fillRect(bx0 - bs * 1.4, by0 + bs * 3.4, bs * 1.6, bs * 4); g.fillStyle = bc; g.fillRect(bx0 - bs * 0.9, by0 + bs * 3.9, bs * 1.1, bs * 3); g.fillStyle = "#7dffe0"; g.fillRect(bx0 + bs * 1.8, by0 + bs * 1.6, bs * 1.4, bs * 1.6); }
        else { g.fillStyle = "#f2c14e"; g.fillRect(bx0 + bs * 1.8, by0 + bs * 1.6, bs * 1.4, bs * 1.6); }
      }
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
  // ---- buildings (world.structs, see buildStructures in sandbox-world.js) ----
  function sdoorAt(x, y) {   // the building whose door covers this cell (either half), or null
    var L = world.structs; if (!L) return null;
    for (var i = 0; i < L.length; i++) { var s = L[i]; if (x === s.dx && (y === s.gy - 1 || y === s.gy - 2)) return s; }
    return null;
  }
  function structNear() {   // the building door within about 2.5 tiles of you, or null
    var L = world.structs, best = null, bd = 6.5; if (!L) return null;
    for (var i = 0; i < L.length; i++) { var s = L[i]; if (Math.abs(s.dx - p.x) > 4) continue; var dx = s.dx + 0.5 - p.x, dy = s.gy - 1 - (p.y - 0.7), d = dx * dx + dy * dy; if (d < bd) { bd = d; best = s; } }
    return best;
  }
  function enterBuilding(s) {
    if (!SC || cave || trans || sleepT > 0 || hp <= 0 || !s) return;
    stopInput(); thud(210, 0.08);
    trans = { t: 0, done: false, mid: function () {
      cave = { hole: { x: s.outX, y: s.gy - 1, b: s.b }, bld: s, run: s.id + 1, floors: {}, f: 0, F: null };
      S.st.bld = (S.st.bld || 0) + 1; enemies.length = 0; stageEl.classList.add("cave"); $("sbxHint").classList.remove("on");
      setFloor(1, "down"); save();
    } };
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
    var F = cave.floors[f] || (cave.floors[f] = cave.bld ? SC.interior(cave.bld.kind, cave.bld.b, cave.bld.id, cave.run) : SC.gen(cave.run, f, cave.hole.b));
    cave.f = f; cave.F = F;
    if (from === "up") {   // you climbed UP from the floor below: you pop out beside this floor's ladder down
      var o = [[0, 1], [0, -1], [-1, 0], [1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]], k, nx, ny; cp.x = F.down.x + 0.5; cp.y = F.down.y + 0.9;
      for (k = 0; k < o.length; k++) { nx = F.down.x + o[k][0]; ny = F.down.y + o[k][1]; if (!SC.solid(F, nx, ny)) { cp.x = nx + 0.5; cp.y = ny + 0.85; break; } }
    } else { cp.x = F.spawn.x; cp.y = F.spawn.y; }
    resize(); cp.vx = cp.vy = 0; cam.x = cp.x; cam.y = cp.y - 0.8; mine = null; parts.length = 0; texts.length = 0; hbDirty = true;
    if (!F.bld && f > S.st.caveDeep) S.st.caveDeep = f;
    var el = $("sbxBCard"); el.style.setProperty("--bc", BIOMES[F.biome].c); el.querySelector("b").textContent = F.bld ? F.theme.n : "Floor " + f; el.querySelector("small").textContent = F.bld ? F.theme.sub : F.theme.n;
    el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
    hud(); checkGoals();
  }
  function leaveCaveNow() {
    if (!cave) return; var h = cave.hole; cave = null; resize(); stageEl.classList.remove("cave"); stopInput();
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
    if (td.kind === "lootchest" || td.kind === "lootpot") {   // hole-cave treasure: deeper floors hold better loot
      var ct = cave.f < 5 ? 0 : cave.f < 12 ? 1 : 2, cb = cave.hole ? cave.hole.b : 0, CL = rollLoot(td.kind === "lootchest" ? "chest" : "pot", cb, ct);
      CL.forEach(function (q) { give(q[0], q[1], x, y); });
      if (td.kind === "lootchest") { chips(x + 0.5, y + 0.5, "#f2c14e", 18, 7); treasureFound(CL.length); } else { S.st.pots++; thud(420, 0.06); checkGoals(); }
      return;
    }
    var n = dropQty(td); if (id === T.STONE && Math.random() < 0.5) n++;
    give(td.drop, n, x, y); if (td.kind === "ore") snd("coin");
    if (id === T.STONE && Math.random() < 0.12) give("pebble", 1, x, y - 0.55);
  }
  function caveTool(dt) {
    var F = cave.F; if (sel === "weapon") { mine = null; caveSwing(dt); return; }
    if (ITEMS[sel] && ITEMS[sel].food && ITEMS[sel].tile === undefined) { useFood(dt); return; }
    if (!aim.down || aim.tx < 0) { mine = null; return; }
    var tx = aim.tx, ty = aim.ty, i = ty * F.w + tx, dx = tx + 0.5 - cp.x, dy = ty + 0.5 - (cp.y - 0.4);
    if (dx * dx + dy * dy > CAVE_REACH * CAVE_REACH) { mine = null; return; }
    if (Math.abs(dx) > 0.3) cp.face = dx < 0 ? -1 : 1;
    var nid = F.node[i];
    if (nid) {
      var td = TILES[nid];
      if (sel !== "pick" && sel !== "shovel") { nag("Hold your pick to break rocks (press Q)."); mine = null; return; }
      if (td.drop && td.kind !== "lootchest" && room(td.drop) <= 0) { invFull(); mine = null; return; }
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
    if (F.torch[i]) { if (sel === "pick" || sel === "shovel") { if (invFull("torch")) { cool = 0.5; return; } cool = 0.25; F.torch[i] = 0; give("torch", 1, tx, ty); thud(300, 0.04); } return; }
    if (F.wall[i] || (F.sol && F.sol[i])) return;
    if (sel === "torch" && (S.inv.torch || 0) > 0) {
      if ((tx === F.up.x && ty === F.up.y) || (tx === F.down.x && ty === F.down.y)) return;
      cool = 0.2; F.torch[i] = 1; S.inv.torch--; S.st.torches++; S.st.placed++; chips(tx + 0.5, ty + 0.5, "#ffb13b", 4, 3); thud(420, 0.05);
      if (S.inv.torch <= 0) { delete S.inv.torch; if (sel === "torch") sel = "pick"; } hbDirty = true; if (panelOpen) renderPanel();
    } else if (sel !== "pick" && sel !== "shovel" && sel !== "weapon" && sel !== "can") { cool = 0.4; nag("Only torches can be placed in caves."); }
  }
  function caveUpdate(dt) {
    var F = cave.F, i;
    advTime(dt);
    var dx = ((keys.r || tk.r) ? 1 : 0) - ((keys.l || tk.l) ? 1 : 0), dy = ((keys.d || tk.d) ? 1 : 0) - ((keys.u || tk.u) ? 1 : 0), len = Math.sqrt(dx * dx + dy * dy) || 1, mag = 1;
    if (joy.x || joy.y) { dx = joy.x; dy = joy.y; mag = Math.min(1, Math.sqrt(dx * dx + dy * dy)); len = Math.sqrt(dx * dx + dy * dy) || 1; }   // analog stick: the further you push, the faster you walk
    cp.vx = approach(cp.vx, dx / len * CAVE_SPEED * mag, 70 * dt); cp.vy = approach(cp.vy, dy / len * CAVE_SPEED * mag, 70 * dt);
    if (Math.abs(dx) > 0.2) cp.face = dx < 0 ? -1 : 1;
    var sub = Math.ceil(dt / 0.02), h = dt / sub;
    for (i = 0; i < sub; i++) {
      var nx = cp.x + (cp.vx + ckx) * h; if (!cBox(F, nx, cp.y)) cp.x = nx; else { cp.vx = 0; ckx = 0; }
      var ny = cp.y + (cp.vy + cky) * h; if (!cBox(F, cp.x, ny)) cp.y = ny; else { cp.vy = 0; cky = 0; }
    }
    var spd = Math.sqrt(cp.vx * cp.vx + cp.vy * cp.vy); p.walk += spd * dt; p.vx = spd > 0.5 ? spd : 0; p.on = true; p.vy = 0; p.face = cp.face;
    hurtT = Math.max(0, hurtT - dt); hurtGrace = Math.max(0, hurtGrace - dt); shake = 0; sinceHurt += dt;
    if (hp < MAXHP && sinceHurt > REGEN_WAIT) hp = Math.min(MAXHP, hp + REGEN_RATE * regenMul() * dt);
    drawHp();
    cam.x += (cp.x - cam.x) * Math.min(1, dt * 8); cam.y += (cp.y - 0.8 - cam.y) * Math.min(1, dt * 8);
    var halfW = vw / 2 / ts, halfH = vh / 2 / ts;
    cam.x = F.w <= halfW * 2 ? F.w / 2 : clamp(cam.x, halfW, F.w - halfW); cam.y = F.h <= halfH * 2 ? F.h / 2 : clamp(cam.y, halfH, F.h - halfH);
    aim.tx = Math.floor((aim.mx - ox) / ts); aim.ty = Math.floor((aim.my - oy) / ts);
    if (aim.tx < 0 || aim.tx >= F.w || aim.ty < 0 || aim.ty >= F.h) aim.tx = -1;
    ckx *= Math.max(0, 1 - 9 * dt); cky *= Math.max(0, 1 - 9 * dt); tickFarm(dt); tickHunger(dt);
    caveTool(dt); if (!F.bld && !trans) updateCaveMobs(dt);
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
      if (th.plank) { for (y = 3; y < 16; y += 4) R(0, y, 16, 1, "#000", 0.22); R(2 + (v * 5) % 12, 0, 1, 4, "#000", 0.2); R(9 - (v * 3) % 7, 4, 1, 4, "#000", 0.2); R(5 + (v * 7) % 9, 8, 1, 4, "#000", 0.2); R(11 - v, 12, 1, 4, "#000", 0.2); }
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
    if (td.kind === "lootchest" || td.kind === "lootpot") { g.globalAlpha = 0.3; g.fillStyle = "#000"; g.fillRect(2, 13, 12, 3); g.globalAlpha = 1; g.imageSmoothingEnabled = false; g.drawImage(ATLAS, 0, id * 16, 16, 16, 0, 0, 16, 16); return (CNODE[key] = c); }   // treasure: the same art as on the surface
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
    actBtn = null; if (panelOpen || sleepT > 0 || trans) return;
    var h = SC ? holeNear() : null; if (!h) { var sn = SC ? structNear() : null; if (sn) { drawPill(g, now, (coarse ? "Enter " : "Enter ") + sn.name + (coarse ? "" : " (F)"), ox + (sn.dx + 0.5) * ts, oy + (sn.gy - 3.4) * ts, false, function () { enterBuilding(sn); }); return; }
      var sq = bedNear() && isNight(S.time) || doorNear() || chestNear() ? null : stationNear(2.2); if (sq) drawPill(g, now, "Open " + STATIONS[sq.k].sh + (coarse ? "" : " (F)"), ox + (sq.x + 0.5) * ts, oy + sq.y * ts - ts * 0.8, false, function () { openStn(sq.k, sq.x, sq.y); }); return; }
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
    var X0 = Math.max(0, Math.floor(-ox / ts)), X1 = Math.min(F.w - 1, Math.floor((vw - ox) / ts)), Y0 = Math.max(0, Math.floor(-oy / ts)), Y1 = Math.min(F.h - 1, Math.floor((vh - oy) / ts)), CA = caveAtlas(F.bi != null ? F.bi : F.biome), W2 = F.w;
    var glows2 = [], srcs = [[cp.x, cp.y - 0.6, 7.2, 1]];
    for (j = Y0; j <= Y1; j++) for (i = X0; i <= X1; i++) {   // ground and walls
      idx = j * W2 + i; var sx = ox + i * ts, sy = oy + j * ts, v = ((Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0) & 3;
      if (F.wall[idx]) { var face = j + 1 < F.h && !F.wall[idx + W2]; g.drawImage(CA, v * 16, face ? 32 : 16, 16, 16, sx, sy, ts, ts); }
      else {
        g.drawImage(CA, v * 16, 0, 16, 16, sx, sy, ts, ts);
        if (j > 0 && F.wall[idx - W2]) { var sg = g.createLinearGradient(0, sy, 0, sy + ts * 0.5); sg.addColorStop(0, "rgba(0,0,0,.4)"); sg.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = sg; g.fillRect(sx, sy, ts, ts * 0.5); }
      }
    }
    var ux = ox + F.up.x * ts, uy = oy + F.up.y * ts;
    if (F.bld) {   // inside a building: rugs on the floor, the exit door in the bottom wall with a doormat and daylight spilling in
      F.flat.forEach(function (e) {
        var fx = ox + e.x * ts, fy = oy + e.y * ts;
        if (e.id === T.LAVA || e.id === T.WATER) {   // liquids in a stone-rimmed basin, with a slow shimmer
          var lv = e.id === T.LAVA, ph2 = Math.sin(now / (lv ? 500 : 800) + e.x * 1.3 + e.y * 0.7);
          g.fillStyle = lv ? "#3a2a2e" : "#5a7488"; g.fillRect(fx, fy, ts, ts);
          g.fillStyle = lv ? "#e8501a" : "#2f8fa8"; g.fillRect(fx + ts * 0.08, fy + ts * 0.08, ts * 0.84, ts * 0.84);
          g.fillStyle = lv ? "#ffb13b" : "#7fd6e8"; g.fillRect(fx + ts * (0.2 + 0.1 * ph2), fy + ts * 0.3, ts * 0.32, ts * 0.1); g.fillRect(fx + ts * (0.5 - 0.1 * ph2), fy + ts * 0.62, ts * 0.26, ts * 0.08);
          if (lv && ph2 > 0.7) { g.fillStyle = "#fff2b0"; g.fillRect(fx + ts * 0.45, fy + ts * 0.4, ts * 0.08, ts * 0.08); }
          return;
        }
        g.drawImage(ATLAS, 0, e.id * 16, 16, 16, fx, fy, ts, ts);
      });
      if (F.wins) { var dl = daylight(S.time); F.wins.forEach(function (e) {   // windows: a soft shaft of daylight falls across the floor below them (dimmer at night)
        var wx = ox + e.x * ts, wy = oy + (e.y + 1) * ts, L = ts * 3.4, sg2 = g.createLinearGradient(0, wy, 0, wy + L);
        sg2.addColorStop(0, "rgba(255,240,205," + (0.05 + 0.2 * dl).toFixed(3) + ")"); sg2.addColorStop(1, "rgba(255,240,205,0)");
        g.fillStyle = sg2; g.beginPath(); g.moveTo(wx + ts * 0.08, wy); g.lineTo(wx + ts * 0.92, wy); g.lineTo(wx + ts * 1.55, wy + L); g.lineTo(wx - ts * 0.55, wy + L); g.closePath(); g.fill();
        srcs.push([e.x + 0.5, e.y + 2.1, 3.6, 0.25 + 0.45 * dl]);
      }); }
      g.fillStyle = "#3a2216"; g.fillRect(ux, uy, ts, ts);
      g.drawImage(ATLAS, 0, T.DOORO_T * 16, 16, 16, ux, uy, ts, ts / 2); g.drawImage(ATLAS, 0, T.DOORO_B * 16, 16, 16, ux, uy + ts / 2, ts, ts / 2);
      g.fillStyle = "rgba(120,40,40,.7)"; g.fillRect(ux + ts * 0.12, uy - ts * 0.55, ts * 0.76, ts * 0.45); g.fillStyle = "rgba(255,225,170,.18)"; g.fillRect(ux, uy - ts * 1.5, ts, ts * 1.5);
      srcs.push([F.up.x + 0.5, F.up.y - 0.2, 5, 0.8]); glows2.push([ux + ts / 2, uy - ts * 0.3, "255,225,170", 3, 0.2]);
    } else {
    g.drawImage(ATLAS, 0, T.LADDER * 16, 16, 16, ux, uy - ts, ts, ts); g.drawImage(ATLAS, 0, T.LADDER * 16, 16, 16, ux, uy, ts, ts); }
    if (!F.bld && cave.f === 1) { g.fillStyle = "rgba(255,244,190,.16)"; g.fillRect(ux, uy - ts, ts, ts * 2); srcs.push([F.up.x + 0.5, F.up.y + 0.5, 6, 0.85]); glows2.push([ux + ts / 2, uy, "255,240,180", 3.4, 0.22]); }
    if (!F.bld) { drawShaft(g, ox + F.down.x * ts, oy + F.down.y * ts); srcs.push([F.down.x + 0.5, F.down.y + 0.5, 3.2, 0.55]); }
    else F.deco.forEach(function (e) { var td = TILES[e.id], gl = td.glow; if (e.flat) { if (e.id === T.LAVA) srcs.push([e.x + 0.5, e.y + 0.5, 2.4, 0.7]); return; }   // floor tiles never light the room (the lava troughs glow a little)
      if (e.id === T.TORCH) { srcs.push([e.x + 0.5, e.y + 0.5, 6, 1]); glows2.push([ox + (e.x + 0.5) * ts, oy + (e.y + 0.5) * ts, "255,170,60", 4.2, 0.3]); } else if (td.light || gl) { srcs.push([e.x + 0.5, e.y + 0.5, (td.gr || 3) * 1.3, 0.85]); if (gl) glows2.push([ox + (e.x + 0.5) * ts, oy + (e.y + 0.5) * ts, gl, td.gr || 3, td.ga || 0.2]); } });
    F.lamps.forEach(function (l) {
      if (l.x < X0 - 6 || l.x > X1 + 6 || l.y < Y0 - 6 || l.y > Y1 + 6) return;
      var lx = ox + l.x * ts, ly = oy + l.y * ts, lv = (l.x * 7 + l.y) & 3; g.drawImage(ATLAS, lv * 16, th.lamp * 16, 16, 16, lx, ly, ts, ts);
      glows2.push([lx + ts / 2, ly + ts / 2, th.glow, 3.2, 0.2]); srcs.push([l.x + 0.5, l.y + 0.5, 4.6, 0.8]);
    });
    var ey0 = Math.max(0, Y0 - 7), ey1 = Math.min(F.h - 1, Y1 + 7), ex0 = Math.max(0, X0 - 7), ex1 = Math.min(F.w - 1, X1 + 7);
    for (j = ey0; j <= ey1; j++) for (i = ex0; i <= ex1; i++) {   // torches give light; ore glows a little
      idx = j * W2 + i; var inView = i >= X0 && i <= X1 && j >= Y0 && j <= Y1;
      if (F.torch[idx]) { srcs.push([i + 0.5, j + 0.5, 6.8, 1]); if (inView) { g.drawImage(ATLAS, 0, T.TORCH * 16, 16, 16, ox + i * ts, oy + j * ts, ts, ts); glows2.push([ox + i * ts + ts / 2, oy + j * ts + ts / 2, "255,170,60", 4.2, 0.3]); } }
      else if (F.node[idx] && TILES[F.node[idx]].kind === "lootchest") { srcs.push([i + 0.5, j + 0.5, 2.4, 0.5]); if (inView) glows2.push([ox + i * ts + ts / 2, oy + j * ts + ts / 2, "255,200,90", 2.4, 0.2]); }
      else if (F.node[idx] && TILES[F.node[idx]].kind === "ore") { srcs.push([i + 0.5, j + 0.5, 2.6, 0.6]); if (inView) glows2.push([ox + i * ts + ts / 2, oy + j * ts + ts / 2, F.node[idx] === T.CINDER ? "255,120,50" : F.node[idx] === T.CRYSTAL ? "130,225,255" : "80,240,190", 2.2, 0.16]); }
    }
    // rocks and the player, drawn back to front
    var prow = Math.floor(cp.y), drawRocks = function (ja, jb) {
      for (var rj = ja; rj <= jb; rj++) {
      if (F.dr && F.dr[rj]) F.dr[rj].forEach(function (e) { if (e.x >= X0 && e.x <= X1) g.drawImage(ATLAS, 0, e.id * 16, 16, 16, ox + e.x * ts, oy + e.y * ts, ts, ts); });
      for (var ri = X0; ri <= X1; ri++) {
        var rid = F.node[rj * W2 + ri]; if (!rid) continue;
        var rx = ox + ri * ts, ry2 = oy + rj * ts; g.drawImage(caveNode(rid, ((ri * 7 + rj * 13) & 1)), 0, 0, 16, 16, rx, ry2, ts, ts);
        if (TILES[rid].kind === "ore" && !reduce && ((now / 90 + ri * 7 + rj * 3) | 0) % 41 === 0) { g.fillStyle = "#fff"; g.fillRect(rx + ts * 0.55, ry2 + ts * 0.3, 2, 2); }
      }
      drawCaveMobs(g, now, rj); }
    };
    if (F.mobs) F.mobs.forEach(function (m) { if (!m.def) srcs.push([m.x, m.y - 0.4, 1.7, 0.32]); });   // creatures glow faintly, so you can just make them out in the dark
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
      var cx = X0 + i + 0.5, cy = Y0 + j + 0.5, L = F.amb || 0.07;
      for (var s = 0; s < srcs.length; s++) { var sc = srcs[s], ddx = cx - sc[0], ddy = cy - sc[1], d2 = ddx * ddx + ddy * ddy, rr = sc[2]; if (d2 < rr * rr) { var kk = 1 - Math.sqrt(d2) / rr, vv = sc[3] * Math.pow(kk, 1.2); if (vv > L) L = vv; } }
      var kx = (j * gw + i) * 4; dk[kx] = tr; dk[kx + 1] = tg; dk[kx + 2] = tb; dk[kx + 3] = Math.round(clamp(1 - L, 0, 0.94) * 255);
    }
    LCX.putImageData(LID, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(LC, 0, 0, gw, gh, ox + X0 * ts, oy + Y0 * ts, gw * ts, gh * ts);
    g.imageSmoothingEnabled = false; g.globalCompositeOperation = "lighter";
    drawGlows(g, glows2);
    g.globalCompositeOperation = "source-over";
    if (!VIG || VIG.width !== Math.max(2, Math.round(vw / 2))) buildVignette();
    g.imageSmoothingEnabled = true; g.drawImage(VIG, 0, 0, vw, vh); g.imageSmoothingEnabled = false;
    g.font = "800 " + Math.max(12, Math.round(ts * 0.52)) + "px Nunito, system-ui, sans-serif"; g.textAlign = "center"; g.lineWidth = 3.5; g.strokeStyle = "rgba(0,0,0,.75)"; g.lineJoin = "round";
    texts.forEach(function (tx) { g.globalAlpha = clamp(tx.life * 1.5, 0, 1); g.fillStyle = tx.c; g.strokeText(tx.s, ox + tx.x * ts, oy + tx.y * ts); g.fillText(tx.s, ox + tx.x * ts, oy + tx.y * ts); }); g.globalAlpha = 1;
    if (!panelOpen && !trans) {   // ladder prompt
      var ln = ladderNear();
      if (ln) { var lc = ln.k === "up" ? F.up : F.down; drawPill(g, now, (ln.k === "up" ? (F.bld ? "Leave" : cave.f <= 1 ? "Climb out" : "Go up") : "Go down") + (coarse ? "" : " (F)"), ox + (lc.x + 0.5) * ts, oy + lc.y * ts - ts * (ln.k === "up" ? 1.3 : 0.5), false, function () { useLadder(ln.k); }); }
    }
    if (!panelOpen && aim.tx >= 0 && (!coarse || aim.down)) {
      var qdx = aim.tx + 0.5 - cp.x, qdy = aim.ty + 0.5 - (cp.y - 0.4), ok = qdx * qdx + qdy * qdy <= CAVE_REACH * CAVE_REACH, cx0 = ox + aim.tx * ts, cy0 = oy + aim.ty * ts, L3 = ts * 0.3, pu = 1 + Math.sin(now / 160) * 0.06;
      g.strokeStyle = ok ? "rgba(255,244,200,.95)" : "rgba(255,90,90,.6)"; g.lineWidth = 2; g.beginPath();
      [[0, 0, 1, 1], [1, 0, -1, 1], [0, 1, 1, -1], [1, 1, -1, -1]].forEach(function (c) { var bx = cx0 + c[0] * ts + (c[0] ? 1 : -1) * (pu - 1) * ts, by = cy0 + c[1] * ts + (c[1] ? 1 : -1) * (pu - 1) * ts; g.moveTo(bx + c[2] * L3, by); g.lineTo(bx, by); g.lineTo(bx, by + c[3] * L3); });
      g.stroke();
    }
  }

  // ---------- HUD AND PANELS ----------
  var HUDC = {}; function hudSet(id, v) { if (HUDC[id] !== v) { HUDC[id] = v; $(id).textContent = v; } }   // PERF: rewriting identical text 4x a second re-blurred and re-laid-out the HUD
  function hud() {
    if (cave) { var cf = cave.F; $("sbxBiome").textContent = cf.bld ? cf.theme.n : cf.theme.n + " \u00b7 Floor " + cave.f; $("sbxLoc").style.setProperty("--bc", BIOMES[cf.biome].c); $("sbxSub").textContent = dayTag() + (cf.bld ? "Inside" : cf.theme.sub); drawTrail(); if (hbDirty) drawBar(); return; }
    var b = bioAt(), bi = BIOMES[b], ph = phaseOf(S.time), depth = Math.max(0, Math.floor(p.y - SURF)), under = p.y > col[clamp(Math.floor(p.x), 0, W - 1)] + 2;
    hudSet("sbxBiome", bi.n); if (HUDC.bc !== bi.c) { HUDC.bc = bi.c; $("sbxLoc").style.setProperty("--bc", bi.c); }
    hudSet("sbxSub", dayTag() + (SHOWDAYS && ph.id === "day" ? "Daytime" : PHN[ph.id]) + (under ? " \u00b7 depth " + depth : " \u00b7 surface"));
    if (lastBio !== b) { bcard(bi, b); lastBio = b; }
    drawTrail();
    if (hbDirty) drawBar();
  }
  function drawBar() {
    hbDirty = false; var items = barEntries(), html = "";
    if (sel !== "pick" && sel !== "weapon" && sel !== "shovel" && sel !== "can") { if (!(S.inv[sel] > 0)) { sel = "pick"; selSlot = -1; } else if (!(S.slots[selSlot] && S.slots[selSlot].k === sel)) selSlot = hotIndex(sel); }
    items.forEach(function (en, i) {
      var id = en.id, on = en.slot >= 0 ? (id && sel === id && selSlot === en.slot) : sel === id;
      if (!id) { html += '<button type="button" class="sbx-slot empty" disabled aria-label="Empty hotbar slot"><i>' + (i + 1) + "</i></button>"; return; }
      var cnt = id === "pick" ? (S.tier ? "Lv" + S.tier : "Paws") : id === "weapon" ? "Lv" + S.wpn : id === "shovel" ? "Soft" : id === "can" ? S.water + "/" + CAN.max : S.slots[en.slot].n;
      var dk = id === "pick" ? (S.tier ? "pick" : "") : id === "weapon" ? "wpn" : id === "shovel" ? "shovel" : "", dpc = dk ? Math.round(durOf(dk) / durMax(dk) * 100) : -1, brk = dk && toolBroken(dk);
      if (brk) cnt = "Broken";
      html += '<button type="button" class="sbx-slot' + (on ? " on" : "") + (dk ? " hasdur" : "") + (brk ? " brk" : "") + '" data-sel="' + id + '" data-slot="' + en.slot + '" aria-label="' + (dk ? "Durability " + dpc + " percent. " : "") + (id === "pick" ? PICKS[S.tier].n : id === "shovel" ? SHOVEL.n : id === "can" ? CAN.n + ", " + S.water + " of " + CAN.max + " water" : id === "weapon" ? WEAPONS[S.wpn].n + ", damage " + WEAPONS[S.wpn].dmg : ITEMS[id].n + ", " + S.slots[en.slot].n) + '" aria-pressed="' + on + '"><img alt="" src="' + icon(id) + '"><i>' + (i + 1) + '</i><b>' + esc(cnt) + '</b>' + (dk ? '<u class="dur' + (dpc <= 20 ? " bad" : dpc <= 50 ? " low" : "") + '" style="--d:' + dpc + '%"></u>' : "") + '</button>';
    });
    $("sbxBar").innerHTML = html;
    var bb = $("sbxPackBtn"); bb.classList.toggle("full", S.slots.every(Boolean));
  }
  function costHtml(cost) {
    return Object.keys(cost).map(function (k) { var have = S.inv[k] || 0, ok = have >= cost[k]; return '<span class="' + (ok ? "ok" : "no") + '"><img alt="" src="' + icon(k) + '">' + have + "/" + cost[k] + " " + esc(ITEMS[k].n) + "</span>"; }).join("");
  }
  // ---------- CRAFT BROWSER: category tabs, each split into sub-categories, every list sorted by progression ----------
  // CRAFT_GROUPS gives each recipe id its "Category|Sub-category" (order here = order of the sub-category chips). A recipe id that is not listed lands in Decor > More.
  // Inside a sub-category recipes are sorted by progression: Workbench level needed, then gear tier, then station / material cost.
  var CRAFT_CATS = ["Tools", "Gear", "Food", "Stations", "Materials", "Building", "Walls", "Furniture", "Lighting", "Garden", "Decor"], CRAFT_MAP = {}, CRAFT_SUBS = {}, CRAFT_ALL = null, ccat = "Tools", csub = "", cready = false;
  [
    ["Tools|Pickaxes", "pick1 pick2 pick3 pick4"],
    ["Tools|Melee Weapons", "wpn1 wpn2 wpn3 wpn4"],
    ["Tools|Utility", "shovel can"],
    ["Gear|Armor", "arm1 arm2 arm3 arm4"],
    ["Gear|Backpacks", "bag1 bag2"],
    ["Stations|Workbenches", "bench decorbench"],
    ["Stations|Crafting Stations", "x_cookpot x_furnace x_loom x_mason"],
    ["Food|Farming", "x_farmland"],
    ["Food|Quick Meals", "x_roastcarrot x_bakedpotato x_skewer x_grilledmeat"],
    ["Food|Hearty Meals", "x_chili x_stew x_berrypie x_feast"],
    ["Materials|Fibre & Cloth", "x_rope x_cloth x_furcloth x_candle"],
    ["Materials|Dyes", "x_dyered x_dyeblue x_dyegreen"],
    ["Materials|Smelted & Fired", "x_ingot x_claybrick x_mortar"],
    ["Building|Basics", "planks ladder door"],
    ["Building|Stone & Brick", "d_brick x_cobble x_redbrick x_mossbrick x_plaster d_bbrick d_ibrick x_permabrick x_obsbrick x_moonbrick x_quartzblock x_quartzpillar"],
    ["Building|Glass & Lamp Blocks", "d_glass x_stainedred x_stainedblue x_stainedgreen d_clamp d_crlamp x_rubylamp x_sapphirelamp x_amberblock x_amethystblock"],
    ["Building|Metal", "x_ironblock x_bars"],
    ["Building|Floors & Roofs", "x_parquet x_checker d_thatch x_shinglered x_shingleblue"],
    ["Walls|Basic Walls", "w_plank w_log w_moss"],
    ["Walls|Cottage & Stone", "w_timber w_plaster w_brick x_w_redbrick x_w_cobble"],
    ["Walls|Fancy Walls", "x_w_quartz x_w_obsidian x_w_frost x_w_amber"],
    ["Walls|Wallpaper & Panels", "x_w_stripe x_w_floral x_w_panel"],
    ["Furniture|Seating", "d_chair d_stool x_sofa d_throne"],
    ["Furniture|Tables & Desks", "d_table x_desk"],
    ["Furniture|Storage", "chest d_shelf d_wardrobe x_dresser x_crate x_sack d_barrel d_bucket"],
    ["Furniture|Beds & Rugs", "bed d_rug"],
    ["Furniture|Clocks & Curios", "x_harp x_clock x_globe x_telescope"],
    ["Lighting|Torches & Fires", "torch x_slimetorch d_campfire d_hearth x_bonfire d_brazier"],
    ["Lighting|Lanterns & Lamps", "d_lantern d_sconce d_emberlantern d_frostlantern x_hanginglantern x_streetlamp x_mushlamp x_lavalamp"],
    ["Lighting|Candles & Chandeliers", "x_candelabra d_chandelier x_fairylights"],
    ["Garden|Pots & Planters", "d_pot d_fpot d_planter d_glowpot"],
    ["Garden|Structures", "d_fence d_bale d_well d_fountain"],
    ["Garden|Curios", "x_scarecrow x_gravestone x_totem d_cauldron d_urn"],
    ["Decor|Wall Art", "d_painting d_banner d_sign d_emberbanner d_frostbanner x_mirror x_worldmap x_wreath x_tap_swamp x_tap_ember x_tap_frost"],
    ["Decor|Trophies & Armory", "d_bugtrophy d_frogtrophy x_battrophy x_antlers x_weaponrack x_armorstand x_shield x_swords x_wolftrophy x_gatortrophy x_waspnest x_slimejar"],
    ["Decor|Statues & Showpieces", "d_frogstatue d_guardian d_icesculpt x_snowman x_obelisk d_anvil x_aquarium"]
  ].forEach(function (g) { var ps = g[0].split("|"); (CRAFT_SUBS[ps[0]] = CRAFT_SUBS[ps[0]] || []).push(ps[1]); g[1].split(" ").forEach(function (id) { CRAFT_MAP[id] = g[0]; }); });
  function recRank(r) { var c = 0, k; for (k in r.cost) c += r.cost[k]; return (r.bl || 0) * 100000 + (r.tier || r.wpn || r.arm || r.bag || 0) * 1000 + (r.stn ? 50 : 0) + (r.bench ? 20 : 0) + c; }
  function craftAll() {
    if (CRAFT_ALL) return CRAFT_ALL;
    CRAFT_ALL = RECIPES.concat(DECOR);
    CRAFT_ALL.forEach(function (r) { var ps = (CRAFT_MAP[r.id] || "Decor|More").split("|"); r.cat2 = ps[0]; r.sub = ps[1]; r.rank = recRank(r); });
    var si = function (r) { var i = (CRAFT_SUBS[r.cat2] || []).indexOf(r.sub); return i < 0 ? 99 : i; };
    CRAFT_ALL.sort(function (a, b) { return CRAFT_CATS.indexOf(a.cat2) - CRAFT_CATS.indexOf(b.cat2) || si(a) - si(b) || a.rank - b.rank; });
    return CRAFT_ALL;
  }
  function recStatus(r) {   // owned / locked / affordable / ready-to-craft-right-now for one recipe (gear recipes and Decor Workbench recipes)
    var afford = Object.keys(r.cost).every(function (k) { return (S.inv[k] || 0) >= r.cost[k]; });
    if (r.deco) { var dl = !!(r.bl && S.bl < r.bl), nd = !decorNear(); return { owned: false, lock: dl, lock0: false, needB: nd, can: afford && !dl, ready: afford && !dl && !nd }; }
    var owned = !!((r.tier && S.tier >= r.tier) || (r.wpn && S.wpn >= r.wpn) || (r.arm && S.arm >= r.arm) || (r.sh && S.shovel) || (r.bag && S.bag >= r.bag) || (r.can && S.can)),
      lock0 = !!((r.tier && S.tier < r.tier - 1) || (r.bag && (S.bag < r.bag - 1 || (r.need && S.tier < r.need))) || (r.wpn && (S.wpn < r.wpn - 1 || (r.need && S.tier < r.need))) || (r.arm && (S.arm < r.arm - 1 || (r.need && S.tier < r.need)))),
      lock = lock0 || !!(r.bl && S.bl < r.bl), needB = !!(r.bench && !nearBench()), can = !owned && !lock && afford;
    return { owned: owned, lock: lock, lock0: lock0, needB: needB, can: can, ready: can && !needB && !(r.stn && !nearStn(r.stn)) };
  }
  function recCard(r) {
    var st = recStatus(r), im, note;
    if (r.deco) {
      im = icon(Object.keys(r.out)[0]);
      note = st.lock ? "Needs the " + BENCH_LV[r.bl].n + " (tap your Bog Workbench to upgrade it)." : r.d;
    } else {
      im = r.arm ? icon("arm" + r.arm) : r.wpn ? icon("wpn" + r.wpn) : r.tier ? (function () { var old = S.tier; S.tier = r.tier; var u = icon("pick"); S.tier = old; return u; })() : icon(r.sh ? "shovel" : r.can ? "can" : r.bag ? "bag" + r.bag : Object.keys(r.out)[0]);
      note = st.lock && !st.lock0 ? "Upgrade your Workbench to the " + BENCH_LV[r.bl].n + " first." : st.lock ? (r.bag ? (S.bag < r.bag - 1 ? "Make the " + BAGS[r.bag - 1].n + " first." : "Needs the " + PICKS[r.need].n + " first.") : r.arm ? (S.arm < r.arm - 1 ? "Craft the " + ARMORS[r.arm - 1].n + " first." : "Needs the " + PICKS[r.need].n + " first.") : r.wpn ? (S.wpn < r.wpn - 1 ? "Craft the " + WEAPONS[r.wpn - 1].n + " first." : "Needs the " + PICKS[r.need].n + " first.") : "Craft the " + PICKS[r.tier - 1].n + " first.") : (st.needB && !st.owned ? "Needs a Bog Workbench nearby." : r.stn && !nearStn(r.stn) ? "Needs a " + SbxExtra.STN[r.stn] + " nearby. " + r.d : r.d);
    }
    return '<div class="sbx-card' + (st.owned || st.lock ? " done" : "") + '"><img class="big" alt="" src="' + im + '"><div><b>' + esc(r.n) + "</b><small>" + esc(note) + '</small><div class="cost">' + costHtml(r.cost) + '</div></div><button type="button" class="btn' + (st.ready ? "" : " ghost") + '" data-sx-craft="' + r.id + '"' + (st.owned || st.lock ? " disabled" : "") + ">" + (st.owned ? "Owned" : st.lock ? "Locked" : "Craft") + "</button></div>";
  }
  function handAll() { return craftAll().filter(function (r) { return !stnOf(r); }); }   // the Journal only lists what you make by hand
  function handCats() { var all = handAll(); return CRAFT_CATS.filter(function (c) { return c === "Stations" || all.some(function (r) { return r.cat2 === c; }); }); }
  function craftBar() {   // sticky category chips + sub-category chips + the Ready-only switch
    var all = handAll(), cats = handCats(), rd = {}, sr = {}, subs = [];
    if (cats.indexOf(ccat) < 0) ccat = cats[0];
    all.forEach(function (r) { var ok = recStatus(r).ready; if (ok) rd[r.cat2] = (rd[r.cat2] || 0) + 1; if (r.cat2 === ccat) { if (subs.indexOf(r.sub) < 0) subs.push(r.sub); if (ok) sr[r.sub] = (sr[r.sub] || 0) + 1; } });
    if (csub && subs.indexOf(csub) < 0) csub = "";
    return '<div class="sbx-cbar"><div class="sbx-cats" role="tablist" aria-label="Craft categories">' + cats.map(function (c) { return '<button type="button" role="tab" class="' + (c === ccat ? "on" : "") + '" data-cc="' + esc(c) + '" aria-selected="' + (c === ccat) + '">' + esc(c) + (rd[c] ? "<i>" + rd[c] + "</i>" : "") + "</button>"; }).join("")
      + '</div><div class="sbx-subs" aria-label="Sub-categories"><button type="button" class="rdy' + (cready ? " on" : "") + '" data-cready="1" aria-pressed="' + cready + '">Ready</button><button type="button" class="' + (!csub ? "on" : "") + '" data-cs="">All</button>' + subs.map(function (c) { return '<button type="button" class="' + (c === csub ? "on" : "") + '" data-cs="' + esc(c) + '">' + esc(c) + (sr[c] ? "<i>" + sr[c] + "</i>" : "") + "</button>"; }).join("")
      + '</div></div>';
  }
  function repairHtml(f, atBench) {   // repair cards: hand repairs in the Journal, Glowspore-and-up repairs in the Workbench window
    var rk = [S.tier >= 1 ? "pick" : "", S.shovel ? "shovel" : "", S.wpn ? "wpn" : "", S.arm ? "arm" : ""].filter(Boolean).filter(function (k) { return repairNeedsBench(k) === atBench && (!f || f(k)); });
    if (!rk.length) return "";
    var h = "<h3>Repair</h3>";
    rk.forEach(function (k) {
      var m = durMax(k), cur = durOf(k), cost = repairCost(k), full = cur >= m, needB2 = repairNeedsBench(k) && !nearBench(), can2 = !full && Object.keys(cost).every(function (q) { return (S.inv[q] || 0) >= cost[q]; }) && !needB2;
      h += '<div class="sbx-card' + (full ? " done" : "") + '"><img class="big" alt="" src="' + icon(k === "wpn" ? "weapon" : k) + '"><div><b>' + esc(toolName(k)) + "</b><small>" + (cur <= 0 ? "Broken! " : "") + "Durability " + cur + " / " + m + (!full && needB2 ? ". Needs a Bog Workbench nearby." : "") + '</small><span class="bar dur' + (cur / m <= 0.2 ? " bad" : cur / m <= 0.5 ? " low" : "") + '"><i style="width:' + Math.round(cur / m * 100) + '%"></i></span>' + (full ? "" : '<div class="cost">' + costHtml(cost) + "</div>") + '</div><button type="button" class="btn' + (can2 ? "" : " ghost") + '" data-sx-repair="' + k + '"' + (full ? " disabled" : "") + ">" + (full ? "Sturdy" : "Repair") + "</button></div>";
    });
    return h + (atBench ? "" : "<h3>Craft</h3>");
  }
  function stationNearK(k) {   // a placed station of kind k within tapping reach (the Journal's "Open" buttons)
    if (cave) return null; var cx = Math.floor(p.x), cy = Math.floor(p.y - 1), best = null, bd = REACH * REACH, x, y, dx, dy, d;
    for (y = cy - 6; y <= cy + 6; y++) for (x = cx - 6; x <= cx + 6; x++) if (stnKeyAt(x, y) === k) { dx = x + 0.5 - p.x; dy = y + 0.5 - (p.y - PH / 2); d = dx * dx + dy * dy; if (d <= bd) { bd = d; best = { k: k, x: x, y: y }; } }
    return best;
  }
  function benchUpCard() {   // the Workbench level + Upgrade button (top of the Workbench window)
    var cb = BENCH_LV[S.bl], nbl = BENCH_LV[S.bl + 1], nb = nearBench();
    return '<h3>Workbench level</h3><div class="sbx-card"><img class="big" alt="" src="' + icon("bench") + '"><div><b style="color:' + cb.c + '">' + esc(cb.n) + " (level " + S.bl + " of " + (BENCH_LV.length - 1) + ")</b><small>" + esc(nbl ? "Next: the " + nbl.n + " unlocks " + nbl.gives + ". Needs loot from " + nbl.from + "." : "Fully upgraded. Everything can be crafted here.") + "</small>" + (nbl ? '<div class="cost">' + costHtml(nbl.cost) + "</div>" : "") + "</div>" + (nbl ? '<button type="button" class="btn' + (nb && Object.keys(nbl.cost).every(function (k) { return (S.inv[k] || 0) >= nbl.cost[k]; }) ? "" : " ghost") + '" data-sx-bup="1">Upgrade</button>' : '<button type="button" class="btn ghost" disabled>Maxed</button>') + "</div>";
  }
  // ---------- STATION WINDOW: its own pop-up with only the recipes made at that station ----------
  function stnRecs(k) { return craftAll().filter(function (r) { return stnOf(r) === k; }); }
  function renderStn() {
    var k = stnOpen.k;
    if (stnKeyAt(stnOpen.x, stnOpen.y) !== k) { closeStn(); return; }   // it was broken or swapped while open
    var D = STATIONS[k], recs = stnRecs(k), cats = [], rd = {}, total = 0, h = "", sc = stnCat[k] || "";
    recs.forEach(function (r) { if (cats.indexOf(r.cat2) < 0) cats.push(r.cat2); if (recStatus(r).ready) { rd[r.cat2] = (rd[r.cat2] || 0) + 1; total++; } });
    if (sc && cats.indexOf(sc) < 0) sc = stnCat[k] = "";
    $("sbxStnBox").style.setProperty("--stn", stnColor(k));
    $("sbxStnTitle").innerHTML = '<img alt="" src="' + icon(D.ic) + '"><span>' + esc(stnName(k)) + "<small>" + (total ? total + " ready to craft" : recs.length + " recipes") + "</small></span>";
    h += '<div class="sbx-cbar"><div class="sbx-cats" role="tablist" aria-label="Station categories"><button type="button" class="rdy' + (stnReady ? " on" : "") + '" data-stready="1" aria-pressed="' + stnReady + '">Ready' + (total ? "<i>" + total + "</i>" : "") + "</button>"
      + (cats.length > 1 ? '<button type="button" role="tab" class="' + (!sc ? "on" : "") + '" data-stc="" aria-selected="' + !sc + '">All</button>' + cats.map(function (c) { return '<button type="button" role="tab" class="' + (c === sc ? "on" : "") + '" data-stc="' + esc(c) + '" aria-selected="' + (c === sc) + '">' + esc(c) + (rd[c] ? "<i>" + rd[c] + "</i>" : "") + "</button>"; }).join("") : "")
      + "</div></div>";
    h += '<p class="sbx-note">' + esc(D.d) + "</p>";
    if (k === "bench" && !sc && !stnReady) h += benchUpCard() + repairHtml(null, true);
    var shown = recs.filter(function (r) { return (!sc || r.cat2 === sc) && (!stnReady || recStatus(r).ready); }), last = "";
    if (!shown.length) h += '<p class="sbx-note">' + (stnReady ? "Nothing here can be crafted right now. Turn off Ready to see everything." : "Nothing here yet.") + "</p>";
    shown.forEach(function (r) { var gh = cats.length > 1 && !sc ? r.cat2 + " · " + r.sub : r.sub; if (gh !== last) { last = gh; h += "<h3>" + esc(gh) + "</h3>"; } h += recCard(r); });
    var bd = $("sbxStnBody"), oc = bd.querySelector(".sbx-cats"), ol = oc ? oc.scrollLeft : 0, st = bd.scrollTop; bd.innerHTML = h; bd.scrollTop = st;
    var row = bd.querySelector(".sbx-cats"); if (row) { row.scrollLeft = ol; var on = row.querySelector("[data-stc].on"); if (on && (on.offsetLeft < row.scrollLeft || on.offsetLeft + on.offsetWidth > row.scrollLeft + row.clientWidth)) row.scrollLeft = on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2; }
  }
  function openStn(k, x, y) {
    if (mapOpen) closeMap(); if (packOpen) closePack(); if (panelOpen && !stnOpen) closePanel();
    var same = stnOpen && stnOpen.x === x && stnOpen.y === y;
    stnOpen = { k: k, x: x, y: y }; panelOpen = true; confirmNew = false; $("sbxStn").hidden = false; stageEl.classList.add("panel");
    keys.l = keys.r = keys.j = 0; tk.l = tk.r = tk.j = 0; aim.down = false; mine = null; snd("coin");
    renderStn(); if (!same) $("sbxStnBody").scrollTop = 0;
    var xb = $("sbxStn").querySelector(".sbx-x"); if (xb) xb.focus({ preventScroll: true });
  }
  function closeStn() { stnOpen = null; panelOpen = false; $("sbxStn").hidden = true; stageEl.classList.remove("panel"); $("sbxMenuBtn").focus({ preventScroll: true }); }
  function tapStation(x, y) {   // quick tap on a station tile
    var k = stnKeyAt(x, y); if (!k) return false;
    var dx = x + 0.5 - p.x, dy = y + 0.5 - (p.y - PH / 2);
    if (dx * dx + dy * dy <= REACH * REACH) openStn(k, x, y); else nag("Walk closer to the " + stnName(k) + ".");
    return true;
  }
  function bagHtml() {
    var h = "";
      reslot(); var used = usedSlots(), cell = function (i) {
        var c = S.slots[i], on = invSel === i;
        return '<button type="button" class="sbx-is' + (c ? "" : " empty") + (on ? " on" : "") + (i < INV_HOT ? " hot" : "") + (c && sel === c.k && selSlot === i ? " held" : "") + '" data-is="' + i + '" aria-pressed="' + on + '" aria-label="' + (c ? ITEMS[c.k].n + ", " + c.n + (i < INV_HOT ? ", hotbar slot " + (i + 1) : "") : (i < INV_HOT ? "Empty hotbar slot " + (i + 1) : "Empty slot")) + '">' + (c ? '<img alt="" src="' + icon(c.k) + '"><b>' + c.n + "</b>" : "") + (i < INV_HOT ? "<i>" + (i + 1) + "</i>" : "") + "</button>";
      }, cur2 = invSel >= 0 ? S.slots[invSel] : null, g1 = "", g2 = "", i2;
      var g3 = ""; for (i2 = INV_HOT; i2 < INV_BASE; i2++) g1 += cell(i2); for (i2 = INV_BASE; i2 < invN(); i2++) g3 += cell(i2);
      for (i2 = 0; i2 < INV_HOT; i2++) g2 += cell(i2);
      h += '<p class="sbx-note"><span class="' + (used >= invN() ? "invfull" : "") + '">' + used + " / " + invN() + " slots used</span>. Each slot holds up to " + STACK + " (" + STACK_SMALL + " for furniture). Tap a slot, then tap another to move, swap or merge stacks." + (S.bag ? " You are wearing the " + BAGS[S.bag].n + " (+" + BAGS[S.bag].x + " slots)." : " Craft a Backpack to carry more.") + "</p>";
      h += '<div class="sbx-inv"><div class="sbx-igrid">' + g1 + '</div>' + (g3 ? "<h3>" + esc(BAGS[S.bag].n) + '</h3><div class="sbx-igrid pack">' + g3 + "</div>" : "") + '<h3>Hotbar</h3><div class="sbx-igrid hot">' + g2 + "</div></div>";
      h += '<div class="sbx-iinfo">' + (cur2 ? '<div><img alt="" src="' + icon(cur2.k) + '"><span><b>' + esc(ITEMS[cur2.k].n) + "</b><small>" + cur2.n + " of " + stackMax(cur2.k) + "</small></span></div>" : "<div><span><small>No slot selected. Tap an item to select it.</small></span></div>")
        + '<div class="acts"><button type="button" class="btn ghost" data-iact="swap"' + (cur2 ? "" : " disabled") + ">" + (invSel >= INV_HOT ? "To hotbar" : "To pack") + '</button>'
        + (cur2 && ITEMS[cur2.k].tile !== undefined ? '<button type="button" class="btn" data-iact="hold">Hold</button>' : "")
        + (cur2 && ITEMS[cur2.k].food ? '<button type="button" class="btn" data-iact="eat">Eat</button>' : "")
        + '<button type="button" class="btn ghost" data-iact="split"' + (cur2 && cur2.n > 1 ? "" : " disabled") + '>Split</button>'
        + '<button type="button" class="btn ghost" data-iact="toss1"' + (cur2 ? "" : " disabled") + '>Toss 1</button>'
        + '<button type="button" class="btn ghost' + (cur2 && invAsk === "t" + invSel ? " warn" : "") + '" data-iact="tossall"' + (cur2 ? "" : " disabled") + ">" + (cur2 && invAsk === "t" + invSel ? "Tap again" : "Toss all") + '</button>'
        + '<button type="button" class="btn ghost" data-iact="sort">Sort</button></div></div>';
      var ek = ORDER.filter(function (k) { return S.extra[k] > 0; });
      if (ek.length) h += "<h3>Overflow</h3><p class=\"sbx-note\">These did not fit. Free a slot, then collect them.</p><div class=\"sbx-bag\">" + ek.map(function (k) { return '<button type="button" class="sbx-it" data-iextra="' + k + '"><img alt="" src="' + icon(k) + '"><b>' + S.extra[k] + "</b><small>" + esc(ITEMS[k].n) + " \u00b7 collect</small></button>"; }).join("") + "</div>";
      if (!used && !ek.length) h += '<p class="sbx-note">Your inventory is empty. Walk to a tree and hold on the leaves to gather Sticks.</p>';
    return h;
  }
  function renderPack() {
    var h = bagHtml(), t = $("sbxPackTitle"); if (t) t.innerHTML = "Backpack <small>" + usedSlots() + " / " + invN() + "</small>";
    var bd = $("sbxPackBody"), st = bd.scrollTop; bd.innerHTML = h; bd.scrollTop = st;
  }
  function renderPanel() {
    if (!panelOpen) return;
    if (stnOpen) return renderStn();
    if (packOpen) return renderPack();
    if (mapOpen) return;
    if (tab === "bag" || tab === "map") tab = "craft";
    var tabs = [["trail", "Trail"], ["craft", "Craft"], ["map", "Map"], ["goals", "Goals"], ["more", "Options"]];
    if (chestKey) tabs.splice(2, 0, ["chest", "Chest"]); else if (tab === "chest") tab = "craft";
    if (tab === "decor") { tab = "craft"; ccat = "Furniture"; csub = ""; }   // the Decor Workbench now opens the Craft tab on Furniture
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
      h += craftBar();
      if (ccat === "Tools" || ccat === "Gear" || ccat === "Stations") h += '<p class="sbx-note">Your tool: <b style="color:' + PICKS[S.tier].c + '">' + PICKS[S.tier].n + "</b>" + (S.wpn ? ". Weapon: <b style=\"color:" + WEAPONS[S.wpn].c + "\">" + WEAPONS[S.wpn].n + " (damage " + WEAPONS[S.wpn].dmg + ")</b>" : "") + (S.arm ? ". Armor: <b style=\"color:" + ARMORS[S.arm].c + "\">" + ARMORS[S.arm].n + " (blocks " + Math.round(ARMORS[S.arm].red * 100) + "%)</b>" : "") + ". " + (S.st.benches ? "Better picks, weapons and armor are made at your Workbench: tap it (or press F next to it) to open it." : "Only simple gear is made by hand. Craft a Bog Workbench, place it, then tap it to open it and make better tools.") + "</p>";
      if (ccat === "Stations") {
        h += '<h3>Crafting stations</h3><p class="sbx-note">Recipes that need a station only show up in that station\'s window. Place one, then tap it (or press F next to it) to open it.</p>';
        STN_ORDER.forEach(function (k) {
          var D = STATIONS[k], recs = craftAll().filter(function (r) { return stnOf(r) === k; }); if (!recs.length || !ITEMS[D.ic]) return;
          var here = stationNearK(k), maker = craftAll().filter(function (r) { return r.out && r.out[D.ic]; })[0], how = maker ? (stnOf(maker) ? "Make it at the " + STATIONS[stnOf(maker)].n + "." : "Made by hand below.") : "";
          h += '<div class="sbx-card"><img class="big" alt="" src="' + icon(D.ic) + '"><div><b style="color:' + stnColor(k) + '">' + esc(stnName(k)) + "</b><small>" + esc(D.d + " " + recs.length + " recipes. " + how) + '</small></div><button type="button" class="btn' + (here ? "" : " ghost") + '" data-stn-open="' + k + '"' + (here ? "" : " disabled") + ">" + (here ? "Open" : "Not near") + "</button></div>";
        });
        h += "<h3>Make by hand</h3>";
      }
      h += repairHtml(function (k) { return ccat === "Tools" ? k !== "arm" : ccat === "Gear" && k === "arm"; }, false);
      var shown = handAll().filter(function (r) { return r.cat2 === ccat && (!csub || r.sub === csub) && (!cready || recStatus(r).ready); }), lastSub = "";
      if (!shown.length) h += '<p class="sbx-note">' + (cready ? "Nothing in here can be crafted right now. Turn off Ready to see everything." : "Nothing here is made by hand. Open a crafting station to see its recipes.") + "</p>";
      shown.forEach(function (r) { if (!csub && r.sub !== lastSub) { lastSub = r.sub; h += "<h3>" + esc(r.sub) + "</h3>"; } h += recCard(r); });
    } else if (tab === "chest") {
      var cc = S.chests[chestKey] || {}, ck = Object.keys(cc), mine2 = ORDER.filter(function (k) { return (S.inv[k] || 0) > 0; }), btn = function (k, n, attr) { return '<button type="button" class="sbx-it" ' + attr + '="' + k + '"><img alt="" src="' + icon(k) + '"><b>' + n + "</b><small>" + esc(ITEMS[k].n) + "</small></button>"; };
      var ckx = chestKey.split(","), cname = TILES[get(+ckx[0], +ckx[1])].kind === "lootchest" ? "Cave Chest" : "Wooden Chest";
      h += '<p class="sbx-note"><b>' + cname + '</b> (' + ck.length + " of " + CHEST_KINDS + ' kinds). Tap an item to move the whole stack.</p>';
      h += '<h3>In the chest</h3>' + (ck.length ? '<div class="sbx-bag">' + ORDER.filter(function (k) { return cc[k]; }).map(function (k) { return btn(k, cc[k], "data-ch-take"); }).join("") + "</div>" : '<p class="sbx-note">Empty.</p>') + '<button type="button" class="btn ghost" data-ch-all="take"' + (ck.length ? "" : " disabled") + ">Take all</button>";
      h += '<h3>In your backpack</h3>' + (mine2.length ? '<div class="sbx-bag">' + mine2.map(function (k) { return btn(k, S.inv[k], "data-ch-put"); }).join("") + "</div>" : '<p class="sbx-note">Your backpack is empty.</p>') + '<button type="button" class="btn ghost" data-ch-all="put"' + (mine2.length ? "" : " disabled") + ">Store all</button>";
    } else if (tab === "goals") {
      var done = GOALS.filter(function (g) { return S.ms[g.id]; }).length;
      h += '<p class="sbx-note"><b>' + done + " / " + GOALS.length + "</b> goals complete. Goals are bragging rights for now, with no coin or crystal payouts.</p><div class=\"sbx-goals\">" + GOALS.map(function (g) { return '<div class="sbx-goal' + (S.ms[g.id] ? " ok" : "") + '"><i aria-hidden="true">' + (S.ms[g.id] ? "&#10003;" : "") + "</i><div><b>" + esc(g.n) + "</b><small>" + esc(g.d) + "</small></div></div>"; }).join("") + "</div>";
    } else {
      var an = (typeof Crystals !== "undefined" && Crystals.animals) ? Crystals.animals : [{ id: "frog", name: "Boggy the Frog" }];
      h += '<h3>Play as</h3><div class="sbx-an">' + an.map(function (a) { var th = ""; try { th = '<img alt="" src="' + DelveAv.thumb(Object.assign({}, Crystals.outfit()), a.id, 3) + '">'; } catch (e) { try { th = AV.svg(Object.assign({}, Crystals.outfit(), { animal: a.id, nobg: true })).replace('viewBox="0 0 200 200"', 'viewBox="22 4 156 156"'); } catch (e2) {} } return '<button type="button" data-an="' + a.id + '" aria-pressed="' + (S.animal === a.id) + '" aria-label="' + esc(a.name) + '">' + th + "<small>" + esc(a.name.split(" ")[0]) + "</small></button>"; }).join("") + '</div><p class="sbx-note">Your equipped avatar gear shows in the world. Change it in the Armory.</p>';
      h += '<h3>View</h3><div class="sbx-row"><button type="button" class="btn ghost" data-zoom="-1" aria-label="Zoom out">Zoom out</button><b>' + Math.round(S.zoom * 100) + '%</b><button type="button" class="btn ghost" data-zoom="1" aria-label="Zoom in">Zoom in</button></div>';
      h += '<h3>Day counter</h3><p class="sbx-note">Show which in-game day you are on, under the biome name. This world is on day <b>' + (((S.days | 0) + 1)) + '</b>. The count is saved with the world; the on/off choice is saved on this device.</p><div class="sbx-row"><button type="button" class="btn' + (SHOWDAYS ? "" : " ghost") + '" data-daytoggle aria-pressed="' + SHOWDAYS + '">Day counter: ' + (SHOWDAYS ? "On" : "Off") + '</button></div>';
      h += '<h3>Hunger</h3><p class="sbx-note">With hunger on, your food bar slowly empties: eat to stay well fed (faster healing). Turn it off for a relaxed game. Saved with this world.</p><div class="sbx-row"><button type="button" class="btn' + (S.nohunger ? " ghost" : "") + '" data-hungertoggle aria-pressed="' + !S.nohunger + '">Hunger: ' + (S.nohunger ? "Off" : "On") + '</button></div>';
      h += '<h3>Touch controls</h3><p class="sbx-note">Size of the walk stick, arrows, jump button, hotbar, backpack and journal buttons. Saved on this device.</p><div class="sbx-row"><button type="button" class="btn ghost" data-ui="-1" aria-label="Smaller controls">Smaller</button><b>' + Math.round(UIS * 100) + '%</b><button type="button" class="btn ghost" data-ui="1" aria-label="Bigger controls">Bigger</button><button type="button" class="btn ghost" data-ui="0" aria-label="Reset control size">Reset</button></div>';
      h += '<h3>Worlds</h3><p class="sbx-note">Playing: <b>' + esc(curEntry() ? curEntry().name : "My Swamp") + '</b>. Switch worlds, start a new one, or leave.</p><div class="sbx-row"><button type="button" class="btn ghost" data-camp>Back to camp</button><button type="button" class="btn" data-wl-open>Save &amp; exit to menu</button></div>';
      h += '<p class="sbx-note">World seed ' + S.seed + ". Every world saves automatically in this browser (not cloud-synced yet). Shared servers come in a later stage.</p>";
    }
    var oc = document.querySelector(".sbx-cats"), os = document.querySelector(".sbx-subs"), ol1 = oc ? oc.scrollLeft : 0, ol2 = os ? os.scrollLeft : 0;
    $("sbxBody").innerHTML = h;
    [[".sbx-cats", ol1], [".sbx-subs", ol2]].forEach(function (q) { var row = document.querySelector(q[0]); if (!row) return; row.scrollLeft = q[1]; var on = row.querySelector(".on"); if (on && (on.offsetLeft < row.scrollLeft || on.offsetLeft + on.offsetWidth > row.scrollLeft + row.clientWidth)) row.scrollLeft = on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2; });
    var cur = document.querySelector("#sbxTabs [aria-selected=true]"); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest", inline: "center" });
  }
  // ---------- FULL-SCREEN MAP: zoom, drag, and waypoints ----------
  var M = { s: 1, cx: 0, cy: 0, cw: 0, ch: 0, dpr: 1, pts: {}, drag: null, pinch: null, sel: -1, img: null, imgT: -1e9 };
  function mapMin() { return Math.max(0.2, M.cw / W); }
  function mapClamp() { M.s = clamp(M.s, mapMin(), 44); M.cx = clamp(M.cx, 0, W); M.cy = clamp(M.cy, 0, H); }
  function mapSize() {
    var c = $("sbxMapC"), r = c.getBoundingClientRect(); M.cw = Math.max(200, r.width); M.ch = Math.max(160, r.height); M.dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(M.cw * M.dpr); c.height = Math.round(M.ch * M.dpr);
  }
  function mapImg() {   // the explored world, one pixel per tile (rebuilt about twice a second while the map is open)
    var now = performance.now(); if (M.img && now - M.imgT < 500) return M.img; M.imgT = now;
    var off = M.img || document.createElement("canvas"); off.width = W; off.height = H; var g = off.getContext("2d"), im = g.createImageData(W, H), d = im.data, i;
    for (i = 0; i < W * H; i++) {
      var k = i * 4, x = i % W, y = (i / W) | 0, r = 6, gg = 10, b = 9;
      if (ex[i]) { var id = tiles[i], td = TILES[id], hex; if (id === T.AIR) hex = y < col[x] ? "#2a5a6a" : "#0d1114"; else if (id === T.WATER) hex = "#2a8f95"; else hex = td.kind === "ore" ? td.c2 : td.c; if (hex.length === 4) hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]; r = parseInt(hex.slice(1, 3), 16); gg = parseInt(hex.slice(3, 5), 16); b = parseInt(hex.slice(5, 7), 16); }
      d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = 255;
    }
    g.putImageData(im, 0, 0); return (M.img = off);
  }
  function m2s(x, y) { return [(x - M.cx) * M.s + M.cw / 2, (y - M.cy) * M.s + M.ch / 2]; }
  function s2m(x, y) { return [(x - M.cw / 2) / M.s + M.cx, (y - M.ch / 2) / M.s + M.cy]; }
  function zoomAt(px, py, ns) { var w = s2m(px, py); M.s = clamp(ns, mapMin(), 44); M.cx = w[0] - (px - M.cw / 2) / M.s; M.cy = w[1] - (py - M.ch / 2) / M.s; mapClamp(); }
  function mapFit() { M.s = mapMin(); M.cx = W / 2; M.cy = H / 2; mapClamp(); }
  function mapMe() { M.s = Math.max(M.s, clamp(M.cw / 260, mapMin(), 44)); M.cx = p.x; M.cy = p.y; mapClamp(); }
  function drawMapView() {
    var c = $("sbxMapC"); if (!c || !mapOpen) return; var g = c.getContext("2d"), s = M.s;
    g.setTransform(M.dpr, 0, 0, M.dpr, 0, 0); g.fillStyle = "#03080a"; g.fillRect(0, 0, M.cw, M.ch);
    var o0 = m2s(0, 0), o1 = m2s(W, H); g.imageSmoothingEnabled = false; g.drawImage(mapImg(), 0, 0, W, H, o0[0], o0[1], o1[0] - o0[0], o1[1] - o0[1]);
    g.strokeStyle = "#4ee6b455"; g.lineWidth = 1.5; g.strokeRect(o0[0], o0[1], o1[0] - o0[0], o1[1] - o0[1]);
    if (s >= 6) {   // tile grid when zoomed right in, every 10 tiles
      g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 1; g.beginPath(); var gx0 = Math.max(0, Math.floor(s2m(0, 0)[0] / 10) * 10), gx1 = Math.min(W, s2m(M.cw, 0)[0]), gy0 = Math.max(0, Math.floor(s2m(0, 0)[1] / 10) * 10), gy1 = Math.min(H, s2m(0, M.ch)[1]), q;
      for (q = gx0; q <= gx1; q += 10) { var a = m2s(q, 0)[0]; g.moveTo(a, o0[1]); g.lineTo(a, o1[1]); }
      for (q = gy0; q <= gy1; q += 10) { var b2 = m2s(0, q)[1]; g.moveTo(o0[0], b2); g.lineTo(o1[0], b2); }
      g.stroke();
    }
    g.textAlign = "center"; g.font = "800 13px Nunito,sans-serif";
    [[0, SW.B_FROST, 2], [SW.B_FROST, SW.B_EMBER, 0], [SW.B_EMBER, W, 1]].forEach(function (z) {
      var l = m2s(z[0], 0)[0], r = m2s(z[1], 0)[0]; g.fillStyle = BIOMES[z[2]].c; g.globalAlpha = 0.9; g.fillRect(Math.max(l, 0), o0[1], Math.min(r, M.cw) - Math.max(l, 0), 4); g.globalAlpha = 0.85;
      if (r > 0 && l < M.cw) g.fillText(BIOMES[z[2]].n, (Math.max(l, 0) + Math.min(r, M.cw)) / 2, Math.max(o0[1] + 20, 78)); g.globalAlpha = 1;
    });
    (world.structs || []).forEach(function (s2) { if (!ex[s2.doorY * W + s2.dx]) return; var q = m2s(s2.x0 + s2.w / 2, s2.gy - 1); g.fillStyle = "#e8d9a8"; g.strokeStyle = "#050607"; g.lineWidth = 1.6; g.fillRect(q[0] - 4, q[1] - 4, 8, 7); g.strokeRect(q[0] - 4, q[1] - 4, 8, 7); });
    (world.holes || []).forEach(function (hh) { if (!ex[hh.y * W + hh.x]) return; var q = m2s(hh.x, hh.y); g.fillStyle = "#050607"; g.strokeStyle = "#f2c14e"; g.lineWidth = 1.6; g.beginPath(); g.arc(q[0], q[1], 3.4, 0, 6.2832); g.fill(); g.stroke(); });
    var pq = m2s(p.x, p.y - 1), pulse = 9 + Math.sin(performance.now() / 260) * 1.6;
    g.strokeStyle = "#fff"; g.lineWidth = 2.6; g.beginPath(); g.arc(pq[0], pq[1], pulse, 0, 6.2832); g.stroke(); g.fillStyle = "#f2c14e"; g.beginPath(); g.arc(pq[0], pq[1], 4.6, 0, 6.2832); g.fill();
    g.textAlign = "left"; g.font = "800 12px Nunito,sans-serif"; g.textBaseline = "middle";
    (S.wp || []).forEach(function (w, i) {   // waypoint pins: a pointed drop with a ring, name beside it when selected or zoomed in
      var q = m2s(w.x + 0.5, w.y + 0.5), col = WP_COL[w.c], on = i === M.sel; if (q[0] < -30 || q[0] > M.cw + 30 || q[1] < -30 || q[1] > M.ch + 30) return;
      g.save(); g.translate(q[0], q[1]); g.fillStyle = "rgba(0,0,0,.45)"; g.beginPath(); g.ellipse(0, 1, 6, 2.2, 0, 0, 6.2832); g.fill();
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-13, -14, -9, -27, 0, -27); g.bezierCurveTo(9, -27, 13, -14, 0, 0); g.closePath();
      g.fillStyle = col; g.fill(); g.lineWidth = on ? 3 : 2; g.strokeStyle = on ? "#fff" : "#06100d"; g.stroke();
      g.fillStyle = "#06100d"; g.beginPath(); g.arc(0, -17, 6.4, 0, 6.2832); g.fill(); g.save(); g.translate(0, -17); wpGlyph(g, WP_ICONS[w.i || 0], 4.4, "#ffffff"); g.restore();
      if (on || s >= 5) { var tw = g.measureText(w.n).width; g.fillStyle = "rgba(4,10,8,.82)"; g.fillRect(12, -30, tw + 12, 20); g.fillStyle = "#f6eedb"; g.fillText(w.n, 18, -20); }
      g.restore();
    });
    g.textBaseline = "alphabetic";
    $("sbxMapInfo").textContent = (S.wp.length ? S.wp.length + " / " + WP_MAX + " waypoints" : "No waypoints yet") + " · " + (M.s / mapMin()).toFixed(1) + "x";
  }
  // Waypoint icons: little vector glyphs drawn centred on (0,0) in a box about 2r wide. Used on the map pins and on the picker buttons.
  var WP_ICON_NAMES = { dot: "Dot", home: "Home", star: "Star", heart: "Heart", skull: "Danger", pick: "Mine", chest: "Treasure", flag: "Flag", cave: "Cave", tree: "Tree", crown: "Crown", sword: "Battle" };
  function wpGlyph(g, k, r, fg) {
    g.fillStyle = fg; g.strokeStyle = fg; g.lineJoin = "round"; g.lineCap = "round"; var i, a;
    g.beginPath();
    if (k === "dot") { g.arc(0, 0, r * 0.55, 0, 6.2832); g.fill(); }
    else if (k === "home") { g.moveTo(-r, -0.05 * r); g.lineTo(0, -r); g.lineTo(r, -0.05 * r); g.lineTo(0.72 * r, -0.05 * r); g.lineTo(0.72 * r, r); g.lineTo(-0.72 * r, r); g.lineTo(-0.72 * r, -0.05 * r); g.closePath(); g.fill(); g.clearRect(-0.22 * r, 0.3 * r, 0.44 * r, 0.7 * r); }
    else if (k === "star") { for (i = 0; i < 10; i++) { a = -Math.PI / 2 + i * Math.PI / 5; var rr = i % 2 ? r * 0.45 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); }
    else if (k === "heart") { g.moveTo(0, r); g.bezierCurveTo(-1.3 * r, 0, -0.9 * r, -1.05 * r, 0, -0.42 * r); g.bezierCurveTo(0.9 * r, -1.05 * r, 1.3 * r, 0, 0, r); g.fill(); }
    else if (k === "skull") { g.arc(0, -0.15 * r, 0.82 * r, 0, 6.2832); g.fill(); g.fillRect(-0.45 * r, 0.4 * r, 0.9 * r, 0.55 * r); g.globalCompositeOperation = "destination-out"; g.beginPath(); g.arc(-0.33 * r, -0.15 * r, 0.24 * r, 0, 6.2832); g.arc(0.33 * r, -0.15 * r, 0.24 * r, 0, 6.2832); g.fill(); g.fillRect(-0.06 * r, 0.5 * r, 0.12 * r, 0.45 * r); g.globalCompositeOperation = "source-over"; }
    else if (k === "pick") { g.lineWidth = r * 0.3; g.moveTo(-0.75 * r, 0.85 * r); g.lineTo(0.35 * r, -0.3 * r); g.stroke(); g.beginPath(); g.lineWidth = r * 0.34; g.moveTo(-0.6 * r, -0.65 * r); g.quadraticCurveTo(0.35 * r, -1.05 * r, 0.95 * r, 0.1 * r); g.stroke(); }
    else if (k === "chest") { g.fillRect(-0.95 * r, -0.2 * r, 1.9 * r, 1.1 * r); g.beginPath(); g.moveTo(-0.95 * r, -0.25 * r); g.quadraticCurveTo(0, -1.1 * r, 0.95 * r, -0.25 * r); g.fill(); g.clearRect(-0.95 * r, -0.28 * r, 1.9 * r, 0.14 * r); g.clearRect(-0.14 * r, -0.1 * r, 0.28 * r, 0.36 * r); }
    else if (k === "flag") { g.lineWidth = r * 0.24; g.moveTo(-0.6 * r, r); g.lineTo(-0.6 * r, -r); g.stroke(); g.beginPath(); g.moveTo(-0.55 * r, -r); g.lineTo(0.95 * r, -0.62 * r); g.lineTo(-0.55 * r, -0.15 * r); g.closePath(); g.fill(); }
    else if (k === "cave") { g.moveTo(-r, r); g.lineTo(-r, -0.1 * r); g.quadraticCurveTo(-r, -r, 0, -r); g.quadraticCurveTo(r, -r, r, -0.1 * r); g.lineTo(r, r); g.closePath(); g.fill(); g.globalCompositeOperation = "destination-out"; g.beginPath(); g.moveTo(-0.5 * r, r); g.lineTo(-0.5 * r, 0.1 * r); g.quadraticCurveTo(-0.5 * r, -0.5 * r, 0, -0.5 * r); g.quadraticCurveTo(0.5 * r, -0.5 * r, 0.5 * r, 0.1 * r); g.lineTo(0.5 * r, r); g.closePath(); g.fill(); g.globalCompositeOperation = "source-over"; }
    else if (k === "tree") { g.moveTo(0, -r); g.lineTo(0.85 * r, 0.45 * r); g.lineTo(-0.85 * r, 0.45 * r); g.closePath(); g.fill(); g.fillRect(-0.16 * r, 0.4 * r, 0.32 * r, 0.6 * r); }
    else if (k === "crown") { g.moveTo(-r, 0.7 * r); g.lineTo(-r, -0.55 * r); g.lineTo(-0.5 * r, 0); g.lineTo(0, -0.85 * r); g.lineTo(0.5 * r, 0); g.lineTo(r, -0.55 * r); g.lineTo(r, 0.7 * r); g.closePath(); g.fill(); }
    else if (k === "sword") { g.lineWidth = r * 0.26; g.moveTo(-0.7 * r, 0.7 * r); g.lineTo(0.85 * r, -0.85 * r); g.stroke(); g.beginPath(); g.lineWidth = r * 0.22; g.moveTo(-0.75 * r, 0.15 * r); g.lineTo(-0.15 * r, 0.75 * r); g.stroke(); }
  }
  var WPI_URL = {};
  function wpIconUrl(k, col) { var key = k + col; if (WPI_URL[key]) return WPI_URL[key]; var c = document.createElement("canvas"); c.width = c.height = 40; var g = c.getContext("2d"); g.translate(20, 20); wpGlyph(g, k, 13, col); return (WPI_URL[key] = c.toDataURL()); }
  function wpText(w) {
    var dx = Math.round(w.x - p.x), dy = Math.round(w.y - p.y);
    return (Math.abs(dx) < 2 ? "right here sideways" : Math.abs(dx) + " tiles " + (dx > 0 ? "east" : "west")) + " · " + (Math.abs(dy) < 2 ? "same depth" : Math.abs(dy) + " " + (dy > 0 ? "down" : "up"));
  }
  function mapCard() {
    var cd = $("sbxMapCard"), w = M.sel >= 0 ? S.wp[M.sel] : null; if (!w) { cd.hidden = true; return; }
    cd.hidden = false;
    var keep = document.activeElement && document.activeElement.id === "sbxWpName";   // re-rendering while typing would lose the cursor: only refresh the rest
    var head = '<div class="wp-top"><span class="wp-pin" style="background:' + WP_COL[w.c] + '"><img alt="" src="' + wpIconUrl(WP_ICONS[w.i || 0], "#ffffff") + '"></span><div class="wp-meta"><input id="sbxWpName" type="text" maxlength="24" value="' + esc(w.n) + '" aria-label="Waypoint name" spellcheck="false"><small>' + esc(wpText(w)) + '</small></div><button type="button" class="btn ghost" data-mc="go">Centre</button><button type="button" class="btn warn" data-mc="del">Remove</button></div>';
    var cols = '<div class="wp-row" role="group" aria-label="Colour">' + WP_COL.map(function (c, n) { return '<button type="button" class="wp-sw' + (n === w.c ? " on" : "") + '" data-wpc="' + n + '" style="background:' + c + '" aria-label="Colour ' + (n + 1) + '" aria-pressed="' + (n === w.c) + '"></button>'; }).join("") + "</div>";
    var ics = '<div class="wp-row" role="group" aria-label="Icon">' + WP_ICONS.map(function (k, n) { return '<button type="button" class="wp-ic' + (n === (w.i || 0) ? " on" : "") + '" data-wpi="' + n + '" title="' + WP_ICON_NAMES[k] + '" aria-label="' + WP_ICON_NAMES[k] + '" aria-pressed="' + (n === (w.i || 0)) + '"><img alt="" src="' + wpIconUrl(k, n === (w.i || 0) ? "#06100d" : "#f6eedb") + '"></button>'; }).join("") + "</div>";
    if (keep) { var sm = cd.querySelector(".wp-meta small"); if (sm) sm.textContent = wpText(w); var pin = cd.querySelector(".wp-pin"); if (pin) pin.style.background = WP_COL[w.c]; return; }
    cd.innerHTML = head + cols + ics;
  }
  function mapTap(x, y) {
    var i, best = -1, bd = 22 * 22;
    (S.wp || []).forEach(function (w, n) { var q = m2s(w.x + 0.5, w.y + 0.5), dx = q[0] - x, dy = q[1] - 13 - y, d = Math.min(dx * dx + dy * dy, dx * dx + (q[1] - y) * (q[1] - y)); if (d < bd) { bd = d; best = n; } });
    if (best >= 0) { M.sel = best; mapCard(); return; }
    var w2 = s2m(x, y), tx = Math.floor(w2[0]), ty = Math.floor(w2[1]); if (tx < 0 || ty < 0 || tx >= W || ty >= H) return;
    if (S.wp.length >= WP_MAX) { toast("Waypoint limit reached (" + WP_MAX + "). Remove one first.", "#f2c14e"); return; }
    var used = {}; S.wp.forEach(function (w) { var m2 = /^Waypoint (\d+)$/.exec(w.n); if (m2) used[m2[1]] = 1; }); for (i = 1; used[i]; i++);
    var col = 0, cnt = {}; S.wp.forEach(function (w) { cnt[w.c] = (cnt[w.c] || 0) + 1; }); WP_COL.forEach(function (_, ci) { if ((cnt[ci] || 0) < (cnt[col] || 0)) col = ci; });
    S.wp.push({ x: tx, y: ty, c: col, i: 0, n: "Waypoint " + i }); M.sel = S.wp.length - 1; snd("coin"); save(); mapCard();
  }
  function mapDelete() { if (M.sel < 0) return; S.wp.splice(M.sel, 1); M.sel = -1; snd("open"); save(); mapCard(); }
  function openMap() {
    if (mapOpen) return; if (packOpen) closePack(); else if (panelOpen) closePanel();
    mapOpen = true; panelOpen = true; M.sel = -1; M.img = null; M.pts = {}; M.drag = M.pinch = null; $("sbxMapV").hidden = false; stageEl.classList.add("panel"); keys.l = keys.r = keys.j = 0; tk.l = tk.r = tk.j = 0; aim.down = false; mine = null;
    mapSize(); M.s = clamp(M.cw / 300, mapMin(), 44); M.cx = p.x; M.cy = p.y; mapClamp(); mapCard(); drawMapView();
  }
  function closeMap() { mapOpen = false; panelOpen = false; $("sbxMapV").hidden = true; stageEl.classList.remove("panel"); M.pts = {}; M.drag = M.pinch = null; $("sbxMenuBtn").focus({ preventScroll: true }); }
  (function () {
    var c = $("sbxMapC"), V = $("sbxMapV");
    function pt(e) { var r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    c.addEventListener("pointerdown", function (e) {
      e.preventDefault(); try { c.setPointerCapture(e.pointerId); } catch (x) {} var q = pt(e); M.pts[e.pointerId] = q; var ids = Object.keys(M.pts);
      if (ids.length === 1) M.drag = { x: q.x, y: q.y, cx: M.cx, cy: M.cy, t: performance.now(), moved: false };
      else if (ids.length === 2) { var a = M.pts[ids[0]], b = M.pts[ids[1]]; M.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: M.s }; if (M.drag) M.drag.moved = true; }
    });
    c.addEventListener("pointermove", function (e) {
      if (!M.pts[e.pointerId]) return; var q = pt(e); M.pts[e.pointerId] = q; var ids = Object.keys(M.pts);
      if (ids.length >= 2 && M.pinch) { var a = M.pts[ids[0]], b = M.pts[ids[1]]; zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, M.pinch.s * (Math.hypot(a.x - b.x, a.y - b.y) / M.pinch.d)); }
      else if (M.drag) { var dx = q.x - M.drag.x, dy = q.y - M.drag.y; if (!M.drag.moved && Math.hypot(dx, dy) > 6) M.drag.moved = true; if (M.drag.moved) { M.cx = M.drag.cx - dx / M.s; M.cy = M.drag.cy - dy / M.s; mapClamp(); } }
    });
    var up = function (e) {
      if (!M.pts[e.pointerId]) return; var q = M.pts[e.pointerId], was = Object.keys(M.pts).length; delete M.pts[e.pointerId];
      if (e.type === "pointerup" && was === 1 && M.drag && !M.drag.moved && performance.now() - M.drag.t < 700) mapTap(q.x, q.y);
      if (!Object.keys(M.pts).length) M.drag = null; M.pinch = null;
      if (Object.keys(M.pts).length === 1) { var k = Object.keys(M.pts)[0]; M.drag = { x: M.pts[k].x, y: M.pts[k].y, cx: M.cx, cy: M.cy, t: 0, moved: true }; }
    };
    c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up); c.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    c.addEventListener("wheel", function (e) { e.preventDefault(); var q = pt(e); zoomAt(q.x, q.y, M.s * (e.deltaY < 0 ? 1.25 : 0.8)); }, { passive: false });
    V.addEventListener("click", function (e) {
      var t = e.target.closest("button"); if (!t) return;
      if (t.hasAttribute("data-mclose")) return closeMap();
      var z = t.getAttribute("data-mz"); if (z) { if (z === "in") zoomAt(M.cw / 2, M.ch / 2, M.s * 1.6); else if (z === "out") zoomAt(M.cw / 2, M.ch / 2, M.s / 1.6); else if (z === "me") mapMe(); else mapFit(); return; }
      if (t.hasAttribute("data-wpc") && M.sel >= 0) { S.wp[M.sel].c = +t.getAttribute("data-wpc"); snd("coin"); save(); return mapCard(); }
      if (t.hasAttribute("data-wpi") && M.sel >= 0) { S.wp[M.sel].i = +t.getAttribute("data-wpi"); snd("coin"); save(); return mapCard(); }
      var m = t.getAttribute("data-mc"); if (m === "del") return mapDelete(); if (m === "go" && M.sel >= 0) { var w = S.wp[M.sel]; M.cx = w.x; M.cy = w.y; M.s = Math.max(M.s, clamp(M.cw / 140, mapMin(), 44)); mapClamp(); }
    });
    V.addEventListener("input", function (e) { if (e.target.id !== "sbxWpName" || M.sel < 0) return; S.wp[M.sel].n = e.target.value.slice(0, 24); });
    V.addEventListener("change", function (e) { if (e.target.id !== "sbxWpName" || M.sel < 0) return; var w = S.wp[M.sel]; w.n = (e.target.value.trim() || "Waypoint").slice(0, 24); e.target.value = w.n; save(); });
    V.addEventListener("keydown", function (e) { if (e.target.id === "sbxWpName" && (e.key === "Enter" || e.key === "Escape")) { e.target.blur(); e.stopPropagation(); } }, true);
    window.addEventListener("resize", function () { if (mapOpen) { mapSize(); mapClamp(); } });
    if (window.ResizeObserver) new ResizeObserver(function () { if (mapOpen) { mapSize(); mapClamp(); } }).observe(V);
  })();
  function openPanel(t) { if (stnOpen) { stnOpen = null; $("sbxStn").hidden = true; } if (packOpen) { packOpen = false; $("sbxPack").hidden = true; } if (mapOpen) { mapOpen = false; $("sbxMapV").hidden = true; } if (t) tab = t; if (tab === "map") tab = "craft"; panelOpen = true; confirmNew = false; $("sbxPanel").hidden = false; stageEl.classList.add("panel"); keys.l = keys.r = keys.j = 0; tk.l = tk.r = tk.j = 0; aim.down = false; mine = null; renderPanel(); }
  function openPack() {
    if (mapOpen) closeMap(); else if (panelOpen && !packOpen) closePanel();
    packOpen = true; panelOpen = true; invSel = -1; invAsk = ""; $("sbxPack").hidden = false; stageEl.classList.add("panel"); keys.l = keys.r = keys.j = 0; tk.l = tk.r = tk.j = 0; aim.down = false; mine = null; renderPack();
  }
  function closePack() { packOpen = false; panelOpen = false; $("sbxPack").hidden = true; stageEl.classList.remove("panel"); $("sbxPackBtn").focus({ preventScroll: true }); }
  function closePanel() { if (stnOpen) return closeStn(); if (mapOpen) return closeMap(); if (packOpen) return closePack(); panelOpen = false; if (chestKey) { chestKey = ""; if (tab === "chest") tab = "craft"; save(); } $("sbxPanel").hidden = true; stageEl.classList.remove("panel"); $("sbxMenuBtn").focus({ preventScroll: true }); }

  // ---------- INVENTORY SCREEN ----------
  function invClick(i, shift) {
    invAsk = "";
    if (shift) { if (S.slots[i]) quickMove(i); return; }
    if (invSel < 0 || !S.slots[invSel]) { invSel = S.slots[i] ? i : -1; return renderPanel(); }
    if (invSel === i) { invSel = -1; return renderPanel(); }
    var from = invSel; invSel = i; moveSlot(from, i);
  }
  function invAct(a) {
    var c = invSel >= 0 ? S.slots[invSel] : null; if (!c && a !== "sort") return;
    if (a !== "tossall") invAsk = "";
    if (a === "swap") quickMove(invSel);
    else if (a === "split") splitSlot(invSel);
    else if (a === "toss1") tossSlot(invSel, false);
    else if (a === "tossall") tossSlot(invSel, true);
    else if (a === "sort") sortInv();
    else if (a === "eat") { eat(c.k); if (!S.slots[invSel]) invSel = -1; }
    else if (a === "hold") { var k = c.k, at = invSel; if (at >= INV_HOT) { quickMove(at); at = hotIndex(k); } choose(k, at); closePanel(); }
  }
  [$("sbxPanel"), $("sbxPack")].forEach(function (el) { el.addEventListener("contextmenu", function (e) {   // right-click a slot: split the stack in half
    var b = e.target.closest("[data-is]"); if (!b) return; e.preventDefault(); var i = +b.getAttribute("data-is"); if (S.slots[i] && S.slots[i].n > 1) { invSel = i; splitSlot(i); }
  });
  el.addEventListener("click", function (e) { var b = e.target.closest("[data-is]"); if (b && e.shiftKey) { e.stopImmediatePropagation(); invClick(+b.getAttribute("data-is"), true); } }, true); });

  // ---------- INPUT ----------
  function setAim(e) { var r = cv.getBoundingClientRect(); aim.mx = e.clientX - r.left; aim.my = e.clientY - r.top - (e.pointerType === "mouse" ? 0 : clamp(ts * 1.3, 28, 44)); } // touch: aim sits just above the fingertip so your finger does not hide the target
  cv.addEventListener("pointerdown", function (e) {
    if (panelOpen || menuOpen || trans || (e.pointerType === "mouse" && e.button !== 0)) return; e.preventDefault();
    if (bedBtn) { var br = cv.getBoundingClientRect(), bx = e.clientX - br.left, by = e.clientY - br.top, pd = e.pointerType === "mouse" ? 4 : 12; if (bx >= bedBtn.x - pd && bx <= bedBtn.x + bedBtn.w + pd && by >= bedBtn.y - pd && by <= bedBtn.y + bedBtn.h + pd) { trySleep(); return; } }
    if (actBtn) { var ar = cv.getBoundingClientRect(), ax = e.clientX - ar.left, ay = e.clientY - ar.top, apd = e.pointerType === "mouse" ? 4 : 12; if (ax >= actBtn.x - apd && ax <= actBtn.x + actBtn.w + apd && ay >= actBtn.y - apd && ay <= actBtn.y + actBtn.h + apd) { actBtn.fn(); return; } }
    if (aim.id !== null && aim.id !== e.pointerId && aim.down) return;
    aim.id = e.pointerId; aim.down = true; setAim(e); aim.t0 = performance.now(); aim.dx = Math.floor((aim.mx - ox) / ts); aim.dy = Math.floor((aim.my - oy) / ts); aim.door = !cave && TILES[get(aim.dx, aim.dy)].kind === "door"; aim.chest = !cave && isChest(get(aim.dx, aim.dy)); aim.hole = !cave && get(aim.dx, aim.dy) === T.HOLE; aim.stn = stnKeyAt(aim.dx, aim.dy);
    aim.lad = cave ? (aim.dx === cave.F.up.x && (aim.dy === cave.F.up.y || aim.dy === cave.F.up.y - 1) ? "up" : aim.dx === cave.F.down.x && aim.dy === cave.F.down.y ? "down" : "") : ""; try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    $("sbxHint").classList.remove("on"); if (ac && ac.state === "suspended") ac.resume();
  });
  cv.addEventListener("pointermove", function (e) { if (e.pointerType === "mouse" || e.pointerId === aim.id) setAim(e); });
  var endAim = function (e) {
    if (e.pointerId === aim.id && e.type === "pointerup" && performance.now() - aim.t0 < 260 && aim.door && TILES[get(aim.dx, aim.dy)].kind === "door") {   // quick tap on a door: open or close it
      var ddx = aim.dx + 0.5 - p.x, ddy = aim.dy + 0.5 - (p.y - PH / 2);
      if (ddx * ddx + ddy * ddy <= REACH * REACH) toggleDoor(aim.dx, aim.dy, true); else nag("That door is too far away.");
    }
    if (e.pointerId === aim.id && e.type === "pointerup" && performance.now() - aim.t0 < 260 && aim.stn && stnKeyAt(aim.dx, aim.dy) === aim.stn) tapStation(aim.dx, aim.dy);   // quick tap on a crafting station: open its window
    if (e.pointerId === aim.id && e.type === "pointerup" && performance.now() - aim.t0 < 260 && aim.chest && isChest(get(aim.dx, aim.dy))) {   // quick tap on a chest: open it
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
      var r = base.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.sqrt(dx * dx + dy * dy) || 1, k = Math.min(1, d / (R * UIS));
      var m = k < 0.14 ? 0 : (k - 0.14) / 0.86; joy.x = dx / d * m; joy.y = dy / d * m; knob.style.transform = "translate(" + (dx / d * Math.min(d, R * UIS) / UIS) + "px," + (dy / d * Math.min(d, R * UIS) / UIS) + "px)";
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
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;   // typing a name never moves you or closes the map
    if (menuOpen) { if (k === "Escape") closeWorlds(); return; }
    if (k === "Escape" && panelOpen) { closePanel(); return; }
    if (k === "e" || k === "E") { if (packOpen || mapOpen || stnOpen) { closePanel(); openPanel(); } else if (panelOpen) closePanel(); else openPanel(); e.preventDefault(); return; }
    if (k === "m" || k === "M") { mapOpen ? closeMap() : openMap(); e.preventDefault(); return; }
    if (mapOpen && (k === "+" || k === "=")) { zoomAt(M.cw / 2, M.ch / 2, M.s * 1.4); e.preventDefault(); return; }
    if (mapOpen && (k === "-" || k === "_")) { zoomAt(M.cw / 2, M.ch / 2, M.s / 1.4); e.preventDefault(); return; }
    if (k === "b" || k === "B") { packOpen ? closePack() : openPack(); e.preventDefault(); return; }
    if (panelOpen) return;
    if (k === "ArrowLeft" || k === "a" || k === "A") keys.l = 1; else if (k === "ArrowRight" || k === "d" || k === "D") keys.r = 1;
    else if (k === "ArrowDown" || k === "s" || k === "S") keys.d = 1;
    else if (k === " " || k === "ArrowUp" || k === "w" || k === "W") { keys.j = 1; if (k !== " ") keys.u = 1; }
    else if (k >= "1" && k <= "9") { var en = barEntries()[+k - 1]; if (en && en.id) choose(en.id, en.slot); }
    else if (k === "f" || k === "F") {
      if (cave) { var ln = ladderNear(); if (ln) useLadder(ln.k); else nag("Stand next to a ladder to use it."); }
      else { var skip = bedNear() && isNight(S.time), dn = skip ? null : doorNear(), cn = skip || dn ? null : chestNear(), wn = skip || dn || cn ? null : stationNear(3), hn = skip || dn || cn || wn || !SC ? null : holeNear(); if (dn) toggleDoor(dn.x, dn.y, true); else if (cn) openChest(cn.x, cn.y); else if (wn) openStn(wn.k, wn.x, wn.y); else if (hn) enterCave(hn.x, hn.y); else trySleep(); }
    }
    else if (k === "q" || k === "Q") { var h2 = hot(); choose(sel === "pick" ? (h2[0] || (S.wpn ? "weapon" : "pick")) : "pick"); }
    else return; e.preventDefault(); $("sbxHint").classList.remove("on");
  });
  window.addEventListener("keyup", function (e) {
    var k = e.key; if (k === "ArrowLeft" || k === "a" || k === "A") keys.l = 0; else if (k === "ArrowRight" || k === "d" || k === "D") keys.r = 0; else if (k === " " || k === "ArrowUp" || k === "w" || k === "W") { keys.j = 0; if (k !== " ") keys.u = 0; } else if (k === "ArrowDown" || k === "s" || k === "S") keys.d = 0;
  });
  window.addEventListener("blur", function () { keys.l = keys.r = keys.j = keys.u = keys.d = 0; tk.l = tk.r = tk.j = tk.u = tk.d = 0; aim.down = false; });
  $("sbxBar").addEventListener("click", function (e) { var b = e.target.closest("[data-sel]"); if (b) choose(b.getAttribute("data-sel"), +b.getAttribute("data-slot")); });
  $("sbxTrail").addEventListener("click", function () { openPanel("trail"); });
  $("sbxMenuBtn").addEventListener("click", function () { if (packOpen || mapOpen || stnOpen) { closePanel(); openPanel(); } else if (panelOpen) closePanel(); else openPanel(); });
  $("sbxPackBtn").addEventListener("click", function () { packOpen ? closePack() : openPack(); });
  $("sbxPack").addEventListener("click", function (e) { if (e.target === this) closePack(); });
  function panelClick(e) {
    var t = e.target.closest("button"); if (!t) return;
    if (t.hasAttribute("data-close")) return closePanel();
    if (t.getAttribute("data-tab") === "map") return openMap();
    if (t.getAttribute("data-tab")) { tab = t.getAttribute("data-tab"); confirmNew = false; return renderPanel(); }
    if (t.hasAttribute("data-cc")) { ccat = t.getAttribute("data-cc"); csub = ""; renderPanel(); $("sbxBody").scrollTop = 0; return; }
    if (t.hasAttribute("data-cs")) { csub = t.getAttribute("data-cs"); renderPanel(); $("sbxBody").scrollTop = 0; return; }
    if (t.hasAttribute("data-cready")) { cready = !cready; renderPanel(); return; }
    if (t.hasAttribute("data-stc") && stnOpen) { stnCat[stnOpen.k] = t.getAttribute("data-stc"); renderPanel(); $("sbxStnBody").scrollTop = 0; return; }
    if (t.hasAttribute("data-stready") && stnOpen) { stnReady = !stnReady; renderPanel(); return; }
    if (t.getAttribute("data-stn-open")) { var so = stationNearK(t.getAttribute("data-stn-open")); if (so) openStn(so.k, so.x, so.y); else nag("Walk closer to it first."); return; }
    if (t.hasAttribute("data-ch-take")) return chestMove(t.getAttribute("data-ch-take"), true, "take");
    if (t.hasAttribute("data-ch-put")) return chestMove(t.getAttribute("data-ch-put"), true, "put");
    if (t.hasAttribute("data-ch-all")) return chestAll(t.getAttribute("data-ch-all"));
    if (t.getAttribute("data-sx-repair")) return repair(t.getAttribute("data-sx-repair"));
    if (t.hasAttribute("data-sx-bup")) return upgradeBench();
    if (t.getAttribute("data-sx-craft")) return craft(t.getAttribute("data-sx-craft"));
    if (t.hasAttribute("data-is")) return invClick(+t.getAttribute("data-is"));
    if (t.getAttribute("data-iact")) return invAct(t.getAttribute("data-iact"));
    if (t.getAttribute("data-iextra")) return collectExtra(t.getAttribute("data-iextra"));
    if (t.getAttribute("data-hold")) { choose(t.getAttribute("data-hold")); return closePanel(); }
    if (t.getAttribute("data-an")) { S.animal = t.getAttribute("data-an"); mkSprite(); return renderPanel(); }
    if (t.hasAttribute("data-hungertoggle")) { S.nohunger = S.nohunger ? 0 : 1; if (!S.nohunger && S.food < 50) S.food = 50; shownFood = -1; drawFood(); save(); return renderPanel(); }
    if (t.hasAttribute("data-daytoggle")) { SHOWDAYS = !SHOWDAYS; try { localStorage.setItem("swamp-delve-daycount", SHOWDAYS ? "1" : "0"); } catch (e) {} hud(); return renderPanel(); }
    if (t.hasAttribute("data-ui")) { var uv = +t.getAttribute("data-ui"); setUi(uv === 0 ? 1 : UIS + uv * 0.1); return renderPanel(); }
    if (t.hasAttribute("data-zoom")) { var Z = [0.8, 1, 1.25, 1.5, 2], zi = clamp(Z.indexOf(S.zoom) + +t.getAttribute("data-zoom"), 0, Z.length - 1); S.zoom = Z[zi]; resize(); return renderPanel(); }
    if (t.hasAttribute("data-camp")) { respawn("Back at camp."); return closePanel(); }
    if (t.hasAttribute("data-wl-open")) return openWorlds();
  }
  $("sbxPanel").addEventListener("click", panelClick); $("sbxPack").addEventListener("click", panelClick); $("sbxStn").addEventListener("click", panelClick);
  $("sbxStn").addEventListener("click", function (e) { if (e.target === this) closeStn(); });

  // ---------- LOOP, RESIZE, SAVE ----------
  function resize() {
    var r = stageEl.getBoundingClientRect(); vw = Math.max(200, Math.round(r.width)); vh = Math.max(200, Math.round(r.height)); dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr); cv.style.width = vw + "px"; cv.style.height = vh + "px";
    ts = Math.max(12, Math.round(clamp(Math.max(vw, vh) / 34, coarse ? 24 : 15, 40) * (S ? S.zoom : 1)));
    if (cave && cave.F) ts = caveTs();
    fitDock();
  }
  // Inside buildings and caves the tile size is a whole multiple of 16 (so every pixel of art is the same size and stays crisp), and buildings are zoomed so the room fills the screen.
  function caveTs() {
    var F = cave.F, k;
    if (cave.bld) k = Math.floor(Math.min((vw - 40) / F.w, (vh - 150) / F.h) / 16); else k = Math.round(Math.max(vw, vh) / 22 / 16);
    return clamp(k, 3, cave.bld ? 5 : 4) * 16;
  }
  // Control size (joystick, arrows, jump, hotbar, menu buttons): a per-device setting kept outside the world saves. CSS reads it as --cs.
  var UIS = 1; try { UIS = +localStorage.getItem("swamp-delve-ui") || 1; } catch (e) {}
  function setUi(v) { UIS = clamp(Math.round(v * 10) / 10, 0.6, 1.8); stageEl.style.setProperty("--cs", UIS); fitDock(); try { localStorage.setItem("swamp-delve-ui", String(UIS)); } catch (e) {} }
  function fitDock() { var d = document.querySelector(".sbx-dock"); if (d && d.offsetWidth) d.style.setProperty("--ds", Math.min(UIS, (stageEl.clientWidth - 12) / d.offsetWidth)); }   // the hotbar grows with the setting only as far as the screen is wide enough
  var last = 0, slowN = 0, frN = 0, lastDraw = 0;
  function loop(now) {
    var paused = (panelOpen || menuOpen) && !trans;
    if (now - lastDraw < (paused ? 100 : 10)) { requestAnimationFrame(loop); return; }   // PERF: 120/144 Hz screens draw every other frame; a paused game (menus open) redraws about 10 times a second
    lastDraw = now;
    var raw = (now - last) / 1000 || 0.016, dt = Math.min(0.05, raw); last = now;
    // automatic quality: if a device is struggling for ~2 seconds, switch off the optional sparkle (ambient motes, aurora, glints)
    if (!paused && !document.hidden && raw < 0.5) { frN++; if (raw > 0.026) slowN++; if (frN >= 90) { if (slowN > 55) { if (dprCap > 1) { dprCap = 1; try { localStorage.setItem("swamp-delve-q", "1"); } catch (e) {} resize(); } else reduce = true; } frN = slowN = 0; } }
    if (!document.hidden) { if (trans) tickTrans(dt); if (!panelOpen && !menuOpen && !trans) { if (cave) caveUpdate(dt); else update(dt); } if (cave) renderCave(now); else render(now); drawTrans(); if (hbDirty) drawBar(); if (mapOpen) drawMapView(); }
    requestAnimationFrame(loop);
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) save(); });
  window.addEventListener("pagehide", save);
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stageEl);

  buildAtlas(); load(); resize(); stageEl.style.setProperty("--cs", (UIS = clamp(UIS, 0.6, 1.8))); mkSprite(); drawBar();
  $("sbxHint").textContent = S.trail === 0 ? (coarse ? "Use the arrows to walk. Hold your finger on tree leaves to gather Sticks." : "A / D walk, Space jumps. Hold the mouse on tree leaves to gather Sticks.") : coarse ? "Use the arrows to walk. Press and hold to dig; the target box sits just above your finger." : "A / D walk, Space jumps. Hold the mouse on a block to dig. E opens your Journal, B your Backpack.";
  if (!S.st.mined) $("sbxHint").classList.add("on");
  if (wIdx.list.length > 1) openWorlds();   // several worlds: let the player pick
  setTimeout(function () { $("sbxHint").classList.remove("on"); }, 14000);
  requestAnimationFrame(loop);
  window.__sbx = { enterBuilding: enterBuilding, structNear: structNear, structs: function () { return world.structs; }, get cave() { return cave; }, cp: cp, enterCave: enterCave, useLadder: useLadder, holeNear: holeNear, ladderNear: ladderNear, leaveCaveNow: leaveCaveNow, setFloor: setFloor, get trans() { return trans; }, blocks: blocks, worlds: function () { return wIdx; }, createWorld: createWorld, switchWorld: switchWorld, deleteWorld: deleteWorld, openWorlds: openWorlds, save: save, enemies: enemies, newEnemy: newEnemy, spawnBat: spawnBat, trySleep: trySleep, wear: wear, durOf: durOf, repair: repair, openChest: openChest, chestNear: chestNear, toggleDoor: toggleDoor, doorNear: doorNear, bedNear: bedNear, spawnEnemy: spawnEnemy, strike: strike, ENEMY: ENEMY, setHp: function (v) { hp = v; }, WEAPONS: WEAPONS, bar: function () { return barEntries().map(function (e) { return e.id; }).filter(Boolean); }, room: room, reslot: reslot, view: function () { return { ts: ts, ox: ox, oy: oy }; }, get S() { return S; }, p: p, get: get, tiles: function () { return tiles; }, world: function () { return world; }, choose: choose, craft: craft, openPanel: openPanel, give: give, reveal: reveal, trail: function () { return S.trail; }, TRAIL: TRAIL, checkTrail: checkTrail, farmStep: farmStep, eat: eat, clean: clean, colAt: function (x) { return col[x]; }, setT: setT };
})();
