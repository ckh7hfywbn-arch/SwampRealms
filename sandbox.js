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
  // inventory: 9 hotbar slots + 21 bag slots (tools sit in slots too), 64 per stack (16 for furniture and other bulky things)
  var INV_HOT = 9, INV_MAIN = 21, INV_N = INV_HOT + INV_MAIN, INV_BASE = INV_N, STACK = 64, STACK_SMALL = 16, SMALL = {};
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
    { n: "Cinder Pick", c: "#ff8a3d", sp: 2.8 }, { n: "Frost Pick", c: "#7fd6ff", sp: 4.2 }, { n: "Swampking Pick", c: "#c06aff", sp: 6 }
  ];
  // Weapons: their own track beside the picks (S.wpn 0-4). Each needs the one before it, the matching pick tier (need), and a Workbench (the Spear is made by hand).
  // dmg is stored for Stage 3 (Gloomlings); cd is seconds per swing. Nothing in the world takes damage yet.
  // Shovel: a second basic tool. Only digs soft ground (mud, moss, clay, ash, snow) and does it a bit faster than bare paws (0.55) but slower than the Reed Pick (1).
  var SHOVEL = { n: "Reed Shovel", c: "#c9b58a", sp: 0.85 }, SOFT = {};
  [T.MOSS, T.MUD, T.CLAY, T.ASH, T.SNOW].forEach(function (i) { SOFT[i] = 1; });
  // DURABILITY: every tool wears out. A block broken costs the pick or shovel 1 point (2 for hard rock like Basalt and Frostrock); each swing that hits something costs the weapon 1.
  // At 0 the tool is BROKEN, not lost: a broken pick digs like bare paws, a broken shovel or weapon cannot be used. Repair it in the Craft tab (Reed gear by hand, Glowspore and up next to a Workbench).
  // A newly crafted tool is at full durability. Saved in S.dur; older saves start with everything at full.
  var DUR = { pick: [0, 100, 180, 300, 480, 700], shovel: 80, wpn: [0, 40, 70, 100, 150, 240], arm: [0, 60, 110, 170, 260, 400] };
  var REPAIR = { pick: [null, { stick: 2, fiber: 2 }, { spore: 4, wood: 3 }, { cinder: 5, basalt: 3 }, { crystal: 6, frostrock: 4 }, { ironingot: 4, crystal: 5, moonstone: 1 }], shovel: { stick: 1, fiber: 2 }, wpn: [null, { stick: 2, fiber: 2 }, { spore: 3, planks: 2 }, { cinder: 4, basalt: 3 }, { crystal: 5, frostrock: 3 }, { ironingot: 3, crystal: 4, ruby: 1 }], arm: [null, { fiber: 3, leaves: 3 }, { spore: 4, fiber: 3 }, { cinder: 5, basalt: 3 }, { crystal: 6, frostrock: 4 }, { ironingot: 4, crystal: 5, sapphire: 1 }] };
  // DIFFICULTY SETTING (S.diff, saved with each world, applied on top of the HARD base tuning further down, changeable any time in Settings): 0 Easy, 1 Medium (the normal game), 2 Hard.
  //   dmg: damage you take   ehp: creature and boss health   hunger: how fast the food bar empties   spawn: time between creature spawns
  //   loss: on Hard, passing out costs you a share of each stack of loose materials (tools, gear, potions, trophies and summons are safe)
  var DIFF = [
    { n: "Easy", c: "#7fd06a", dmg: 0.6, ehp: 0.75, hunger: 0.7, spawn: 1.4, loss: 0, d: "Creatures hit softer and have less health, hunger drains slower and fewer creatures show up." },
    { n: "Medium", c: "#f2c14e", dmg: 1, ehp: 1, hunger: 1, spawn: 1, loss: 0, d: "The game as it was made to be played." },
    { n: "Hard", c: "#ff6b82", dmg: 1.3, ehp: 1.25, hunger: 1.25, spawn: 0.8, loss: 0.2, d: "Creatures hit harder, have more health and show up more often, hunger drains faster, and passing out loses a fifth of your loose materials." }
  ];
  var TROPHY = { queenchitin: 1, wyrmscale: 1, alphamane: 1, realmshard: 1, ruby: 1, sapphire: 1, moonstone: 1, amethyst: 1, amber: 1 };
  function dif() { return DIFF[S && S.diff >= 0 && S.diff <= 2 ? S.diff : 1]; }
  var WEAPONS = [
    { n: "No Weapon", c: "#8fd37a", dmg: 0, cd: 0 }, { n: "Reed Spear", c: "#c9b58a", dmg: 5, cd: 0.5 }, { n: "Glowspore Blade", c: "#4ee6b4", dmg: 9, cd: 0.42 },
    { n: "Cinder Cleaver", c: "#ff8a3d", dmg: 16, cd: 0.5 }, { n: "Frost Fang", c: "#7fd6ff", dmg: 26, cd: 0.34 }, { n: "Swampking Blade", c: "#c06aff", dmg: 40, cd: 0.32 }
  ];
  // Armor: a third track beside picks and weapons (S.arm 0-4). It is worn automatically once crafted, shows on your avatar and cuts the damage you take.
  // red = share of damage blocked (lava is only blocked at half strength). Each hit that hurts you wears it down; at 0 it is BROKEN (no protection) until repaired.
  var ARMORS = [
    { n: "No Armor", c: "#8fd37a", red: 0 }, { n: "Reed Vest", c: "#d3a96b", red: 0.12 }, { n: "Glowspore Mail", c: "#4ee6b4", red: 0.24 },
    { n: "Cinder Plate", c: "#ff8a3d", red: 0.36 }, { n: "Frost Plate", c: "#7fd6ff", red: 0.5 }, { n: "Swampking Plate", c: "#c06aff", red: 0.62 }
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
    { id: "pick5", n: "Swampking Pick", tier: 5, bench: true, bl: 4, cost: { queenchitin: 1, wyrmscale: 1, alphamane: 1, ironingot: 6, crystal: 12, moonstone: 2 }, d: "Digs 6x faster, and it is the only pick that can break Realmstone, the glowing ore near the very bottom of the world. Made with all three boss trophies at a Frost Workbench." },
    { id: "wpn4", n: "Frost Fang", wpn: 4, need: 4, bench: true, bl: 3, cost: { crystal: 18, frostrock: 14, planks: 24, batwing: 4 }, d: "A razor ice blade. Damage 26, the fastest swing. Needs the Frost Pick and Bat Wings from Dusk Bats (they only come out at night). Needs a Cinder Forge Workbench." },
    { id: "arm1", n: "Reed Vest", arm: 1, cost: { fiber: 10, stick: 4, leaves: 6 }, d: "A woven vest of reed fibre. Blocks 12% of damage. Made by hand and worn right away." },
    { id: "arm2", n: "Glowspore Mail", arm: 2, need: 2, bench: true, bl: 2, cost: { spore: 14, planks: 10, fiber: 8, bugfrag: 2 }, d: "Teal armor with a glowing gem. Blocks 24% of damage. Needs the Reed Vest, the Glowspore Pick, Bramble Fragments and a Glowspore Workbench." },
    { id: "arm3", n: "Cinder Plate", arm: 3, need: 3, bench: true, bl: 3, cost: { cinder: 18, basalt: 14, planks: 12, frogfrag: 2 }, d: "Dark plate with a glowing lava seam. Blocks 36% of damage. Needs the Glowspore Mail, the Cinder Pick, Frog Fragments and a Cinder Forge Workbench." },
    { id: "arm4", n: "Frost Plate", arm: 4, need: 4, bench: true, bl: 4, cost: { crystal: 22, frostrock: 16, planks: 20, batwing: 3 }, d: "Crystal ice plate. Blocks half of all damage. Needs the Cinder Plate, the Frost Pick, Bat Wings and a Frost Workbench." },
    { id: "wpn5", n: "Swampking Blade", wpn: 5, need: 4, bench: true, bl: 4, cost: { queenchitin: 2, wyrmscale: 2, alphamane: 2, ironingot: 6, ruby: 1, crystal: 10 }, d: "Forged from all three boss trophies. Damage 40 and the fastest swing in the realm. Needs the Frost Fang and a Frost Workbench." },
    { id: "arm5", n: "Swampking Plate", arm: 5, need: 4, bench: true, bl: 4, cost: { queenchitin: 2, wyrmscale: 2, alphamane: 2, ironingot: 8, sapphire: 1, crystal: 12 }, d: "Royal plate of chitin, scale and mane. Blocks 62% of damage. Needs the Frost Plate, all three boss trophies and a Frost Workbench." },
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
  // ==================================================================================================
  // QUESTS: the story of Delve. One main quest line in six chapters (S.qi = index into MAIN), told by Old Croaker,
  // plus side quests (S.ms[id] = done) that open up chapter by chapter. Every quest counts from lifetime stats,
  // so doing things early still counts. Rewards are items. TO ADD A QUEST: one line in MAIN (with ch) or SIDE.
  //   tg = tile ids the guide ring points at on the surface, deep = how far below the surface still counts, rw = reward.
  // ==================================================================================================
  function mk(id) { return (S.mk && S.mk[id]) || 0; }   // how many times a recipe was crafted
  function vis(k) { return !!(S.vis && S.vis[k]); }      // places visited: "b0".."b2" biomes, "k_<kind>" buildings
  function inv(k) { return S.inv[k] || 0; }
  var MAIN_V1 = ["stick", "fiber", "pebble", "pick1", "wood", "bench", "lights", "eat", "plant", "harvest", "cook", "bed", "door", "sleep", "stash", "spore", "pick2", "spear", "bug", "frog", "blade", "hole", "sweep", "benchup", "mail", "ember", "wasp", "pick3", "furnace", "iron", "cleaver", "forge", "bench3", "plate", "frost", "wolf", "pick4", "fang", "shrine", "berry", "bench4", "fplate", "deep10", "hoard", "hunter", "feast", "gems", "heart", "restore"];   // MAIN order before fishing and animals (old saves)
  var CHAPTERS = [
    { n: "Washed Up in Murkwater", c: "#4ee6b4", s: "You wake on a mossy bank with mud in your fur. A deep, croaky voice drifts out of the reeds: “Easy now, little one. I'm Old Croaker. The Heart of the Swamp, the great crystal that kept these lands glowing, has gone dark, and the swamp is fading with it. Bringing it back will take tools, shelter and a lot of courage. Let's start small: sticks, fibre, stone. Every delver starts with bare paws.”", rw: { torch: 6, planks: 8 } },
    { n: "A Place to Call Home", c: "#7dd65a", s: "“Not bad at all!” croaks Old Croaker. “But a delver needs more than a pick. You'll need food in your belly, a garden that grows while you're away, and a bed to sleep through the dark. Nights bring the Dusk Bats. Build yourself a real home, and the swamp will start to feel like yours.”", rw: { seed_potato: 3, farmland: 6, torch: 6 } },
    { n: "The Glow Beneath", c: "#22d3a6", s: "“Deep under the mud there's still a little light left: Glowspore. It's the last of the Heart's glow, soaked into the stone. Dig it, forge it, and arm yourself, because the creatures of the swamp have grown restless since the dark came. The Cave Holes lead further down than anyone's dared to go.”", rw: { torch: 10, ironingot: 2 } },
    { n: "Embers in the East", c: "#ff8a3d", s: "“East of the swamp lies Ember Bog, where the ground smoulders and the rivers run with fire. Its fire has been cooling too, and the Ember Wasps are angry about it. Forge a hotter pick, learn to smelt iron, and find the old Forges and Keeps. The bog's Ruby fire is one of the three lights the Heart needs.”", rw: { charcoal: 6, ironingot: 3 } },
    { n: "The Frozen Fen", c: "#7fd6ff", s: "“Far to the west is Frostfen, white and silent. Frost Wolves hunt there in pairs. Under the ice sleep the Frost Sapphire and the pale Moonstone, the cold lights of the Heart. Dress warm, keep your blade sharp, and visit the old Shrines. They remember the Heart.”", rw: { frostberry: 4, torch: 8 } },
    { n: "Heart of the Swamp", c: "#f2c14e", s: "“You've walked all three lands, little one. Now gather their lights: Ember Ruby, Frost Sapphire and Moonstone, bound with Glowspore, Cinder and Frost Crystal. Prove yourself in the deep caves, then shape the Heart of the Swamp at your Decor Workbench and set it down at home. Then the swamp will glow again.”", rw: null },
    { n: "The Realm Gate", c: "#8affe0", s: "\u201cThe Heart glows again, and listen... the stone itself is humming.\u201d Old Croaker presses an ear to the ground. \u201cFar below, near the bottom of the world, lies Realmstone: the stone between worlds. Forge a pick fit for a king, dig it up, and raise a Realm Gate. Feed it the trophies of the three bosses and the three lights of the lands, and it will open. Where it leads... even I don't know. Something much bigger than this little swamp.\u201d", rw: { torch: 10 } },
    { n: "Epilogue: Beyond the Swamp", c: "#c06aff", s: "Light pours out of the gate and you step into it. For a moment you float in a sky of a thousand colours, and far off you can see other worlds hanging like lanterns, all joined to one great island in the middle: the Swamp Realms Dimension, the place between every realm. Then the light lets go and you tumble back onto the moss beside the gate. Old Croaker is grinning. \u201cSo it's real! This swamp was only the beginning, little one. When the way beyond is ready, you'll be the first through. Until then, the swamp is yours.\u201d", rw: null }
  ];
  var MAIN = [
    // ---- Chapter 1: bare paws to a workbench ----
    { ch: 0, id: "stick", n: "Gather Sticks", d: "Hold on tree leaves to punch them. Leaves sometimes drop Sticks.", need: 5, v: function () { return S.st.stick; }, tg: [T.LEAVES] },
    { ch: 0, id: "fiber", n: "Gather Reed Fiber", d: "Snip cattails by the water, or the vines hanging under tree leaves.", need: 3, v: function () { return S.st.fiber; }, tg: [T.REED, T.VINE], rw: { stick: 2 } },
    { ch: 0, id: "pebble", n: "Dig for Pebbles", d: "Dig mud with your paws. Pebbles pop out now and then.", need: 2, v: function () { return S.st.pebble; }, tg: [T.MOSS, T.MUD], rw: { fiber: 1 } },
    { ch: 0, id: "pick1", n: "Craft the Reed Pick", d: "Open your Journal (E or the Journal button), tap Craft, then make your first tool.", need: 1, v: function () { return S.tier >= 1 ? 1 : 0; }, rw: { planks: 6 } },
    { ch: 0, id: "wood", n: "Chop Wood", d: "Hold your pick on a tree trunk. You need 8 Wood.", need: 8, v: function () { return S.st.wood; }, tg: [T.LOG], deep: 8, rw: { fiber: 4 } },
    { ch: 0, id: "bench", n: "Build a Workbench", d: "Craft a Bog Workbench in the Journal, pick it in the hotbar, then tap the ground to place it. Tap it later to open it.", need: 1, v: function () { return S.st.benches; }, rw: { torch: 4 } },
    { ch: 0, id: "lights", n: "Light the Dark", d: "Place 4 torches. They stick to walls and floors. More torches are made from Sticks and Glowspore.", need: 4, v: function () { return S.st.torches; }, rw: { planks: 8 } },
    // ---- Chapter 2: food, farm and shelter ----
    { ch: 1, id: "eat", n: "Grab a Bite", d: "Your hunger bar (under your health) slowly empties. Redcap Mushrooms grow wild in the swamp. Pick food in the hotbar, then tap to eat.", need: 1, v: function () { return S.st.eaten; }, rw: { seed_carrot: 4, farmland: 4 } },
    { ch: 1, id: "plant", n: "Plant a Garden", d: "Till grass with a Reed Hoe (made by hand) or place Garden Soil, then plant Swamp Carrot Seeds on top. Watered crops grow twice as fast.", need: 3, v: function () { return S.st.planted; }, rw: { seed_potato: 2 } },
    { ch: 1, id: "harvest", n: "First Harvest", d: "When a crop shows its ripe produce, hold on it to pick it. You get food, plus seeds to plant again.", need: 1, v: function () { return S.st.harvests; }, rw: { stone: 8, clay: 4 } },
    { ch: 1, id: "cook", n: "Home Cooking", d: "Make a Cooking Pot at your Bog Workbench, place it, tap it and cook a meal. Cooked food fills you up far more than raw food, and it heals you.", need: 1, v: function () { return S.st.cooked; }, rw: { torch: 6 } },
    { ch: 1, id: "bed", n: "Build a Bed", d: "Craft a Swamp Bed (Planks, Fiber, Leaves) and place it on solid ground near camp.", need: 1, v: function () { return S.st.beds; }, rw: { torch: 4 } },
    { ch: 1, id: "door", n: "Close the Door", d: "Craft a Swamp Door and place it in a doorway. Closed doors keep bugs, frogs and bats out.", need: 1, v: function () { return S.st.doors; }, rw: { planks: 6 } },
    { ch: 1, id: "sleep", n: "Sleep Tight", d: "At night, stand next to your bed and tap Sleep (or press F). You wake at dawn with full health, and the bed becomes your respawn point.", need: 1, v: function () { return S.st.sleeps; }, rw: { torch: 6 } },
    { ch: 1, id: "stash", n: "Stash Your Loot", d: "Craft a Wooden Chest, place it at camp, open it and store 10 items.", need: 10, v: function () { return S.st.stashed; }, rw: { planks: 8 } },
    { ch: 1, id: "fishing", n: "Gone Fishing", d: "Craft a Reed Fishing Rod by hand, pick it in the hotbar and tap a lake to cast. When the bobber dips and a ! shows, tap again to reel in.", need: 1, v: function () { return S.st.fish; }, rw: { bogminnow: 2, stick: 2 } },
    { ch: 1, id: "tame", n: "A New Friend", d: "Wild Bog Ducks and Mud Pigs wander the swamp. Hold their favourite food (seeds for ducks, carrots or potatoes for pigs) and tap one to tame it.", need: 1, v: function () { return S.st.tamed; }, rw: { trough: 1, seed_carrot: 3 } },
    // ---- Chapter 3: Glowspore, weapons and the caves ----
    { ch: 2, id: "spore", n: "Find Glowspore", d: "Dig down into the stone. The glowing green ore is Glowspore. Collect 16.", need: 16, v: function () { return S.st.spore; }, rw: { wood: 4 } },
    { ch: 2, id: "pick2", n: "Spore Smith", d: "Tap your Workbench to open it and craft the Glowspore Pick.", need: 1, v: function () { return S.tier >= 2 ? 1 : 0; }, rw: { torch: 6 } },
    { ch: 2, id: "spear", n: "Arm Yourself", d: "Craft the Reed Spear (Sticks, Fiber, Pebbles), pick it in the hotbar and hold to swing. Creatures start to roam once you carry a weapon.", need: 1, v: function () { return S.wpn >= 1 ? 1 : 0; }, rw: { planks: 4 } },
    { ch: 2, id: "bug", n: "Squash a Bramble Bug", d: "Bramble Bugs prowl the swamp and its caves. Strike them before they ram you.", need: 1, v: function () { return S.st.bugs; }, rw: { torch: 4 } },
    { ch: 2, id: "frog", n: "Hop to It", d: "A Swamp Frog warns with a ! and then lashes its tongue low. Jump the tongue, then hit it while it's winded.", need: 1, v: function () { return S.st.frogs; }, rw: { planks: 6 } },
    { ch: 2, id: "blade", n: "Spore Blade", d: "Bring 3 Bramble Fragments to your Workbench and craft the Glowspore Blade.", need: 1, v: function () { return S.wpn >= 2 ? 1 : 0; }, rw: { torch: 6 } },
    { ch: 2, id: "hole", n: "Down the Hole", d: "Find a Cave Hole on the surface and climb down. Each floor has rocks, treasure and creatures.", need: 1, v: function () { return S.st.caves; }, rw: { torch: 6 } },
    { ch: 2, id: "sweep", n: "Clean Sweep", d: "Defeat every creature on one cave floor.", need: 1, v: function () { return S.st.cclear; }, rw: { ironingot: 1, torch: 4 } },
    { ch: 2, id: "benchup", n: "Level Up the Bench", d: "Bring Glowspore, Clay, Stone and Bramble and Frog Fragments to your Workbench, open it and press Upgrade.", need: 2, v: function () { return S.bl; }, rw: { planks: 8 } },
    { ch: 2, id: "mail", n: "Suit Up", d: "Craft the Glowspore Mail at your upgraded Workbench.", need: 1, v: function () { return S.arm >= 2 ? 1 : 0; }, rw: { torch: 6 } },
    { ch: 2, id: "queen", n: "Queen of Thorns", d: "Craft a Bramble Lure at your Glowspore Workbench, then use it in Murkwater Swamp. Defeat the Bramble Queen: dodge her charge, then strike while she's dazed.", need: 1, v: function () { return S.st.boss & 1 ? 1 : 0; }, rw: { ironingot: 2, torch: 6 } },
    // ---- Chapter 4: Ember Bog ----
    { ch: 3, id: "ember", n: "Cross into Ember Bog", d: "Walk east past the swamp's edge into the smouldering bog.", need: 1, v: function () { return vis("b1") ? 1 : 0; }, rw: { wood: 6 } },
    { ch: 3, id: "wasp", n: "Wasp Swatter", d: "Ember Wasps glow red just before they dash. Step aside, then strike. Defeat one.", need: 1, v: function () { return S.st.wasps; }, rw: { torch: 4 } },
    { ch: 3, id: "pick3", n: "Cinder Smith", d: "Mine Cinder Ore and Basalt, then craft the Cinder Pick at your Workbench.", need: 1, v: function () { return S.tier >= 3 ? 1 : 0; }, rw: { planks: 8 } },
    { ch: 3, id: "furnace", n: "Fire Up a Furnace", d: "Craft a Stone Furnace at your Workbench and place it near camp.", need: 1, v: function () { return mk("x_furnace"); }, rw: { charcoal: 4 } },
    { ch: 3, id: "iron", n: "Iron Age", d: "Smelt an Iron Ingot at the Stone Furnace (Bog Iron from deep swamp stone, plus Charcoal).", need: 1, v: function () { return mk("x_ingot"); }, rw: { bogiron: 4 } },
    { ch: 3, id: "cleaver", n: "Cinder Cleaver", d: "Craft the Cinder Cleaver. You'll need Frog Fragments.", need: 1, v: function () { return S.wpn >= 3 ? 1 : 0; }, rw: { torch: 6 } },
    { ch: 3, id: "forge", n: "Old Fires", d: "Step inside a Cinder Forge or an Ashen Keep in Ember Bog.", need: 1, v: function () { return vis("k_forge") || vis("k_keep") ? 1 : 0; }, rw: { cinder: 6 } },
    { ch: 3, id: "aerie", n: "Above the Embers", d: "Something floats high in the sky over Ember Bog: the Cinder Aerie. Stand over its glowing Thermal Vent to ride the updraft up, climb the ziggurat and open the chest at the top.", need: 1, v: function () { return S.wings ? 1 : 0; }, rw: { firearrow: 12 } },
    { ch: 3, id: "bench3", n: "Forged in Ember", d: "Upgrade your Workbench to the Cinder Forge Workbench with loot from Ember Bog.", need: 3, v: function () { return S.bl; }, rw: { planks: 10 } },
    { ch: 3, id: "plate", n: "Cinder Plate", d: "Craft the Cinder Plate armor.", need: 1, v: function () { return S.arm >= 3 ? 1 : 0; }, rw: { torch: 6 } },
    { ch: 3, id: "wyrm", n: "The Fire Below", d: "Craft an Ember Idol at your Cinder Forge Workbench and use it in Ember Bog. Defeat the Magma Wyrm: watch where the ground cracks, and hit it when it comes up.", need: 1, v: function () { return S.st.boss & 2 ? 1 : 0; }, rw: { ironingot: 3, charcoal: 6 } },
    // ---- Chapter 5: Frostfen ----
    { ch: 4, id: "frost", n: "Into the Frozen Fen", d: "Walk west past the swamp into Frostfen.", need: 1, v: function () { return vis("b2") ? 1 : 0; }, rw: { torch: 6 } },
    { ch: 4, id: "wolf", n: "Lone Wolf Down", d: "Frost Wolves crouch before they lunge. Jump over them or back away, then strike. Defeat one.", need: 1, v: function () { return S.st.wolves; }, rw: { rawmeat: 2 } },
    { ch: 4, id: "pick4", n: "Frost Smith", d: "Mine Frostrock and Frost Crystal, then craft the Frost Pick.", need: 1, v: function () { return S.tier >= 4 ? 1 : 0; }, rw: { planks: 10 } },
    { ch: 4, id: "fang", n: "Frost Fang", d: "Craft the Frost Fang. Dusk Bats drop the Bat Wings it needs.", need: 1, v: function () { return S.wpn >= 4 ? 1 : 0; }, rw: { torch: 6 } },
    { ch: 4, id: "shrine", n: "What the Ice Remembers", d: "Step inside a Frozen Shrine or a Frost Lodge.", need: 1, v: function () { return vis("k_shrine") || vis("k_lodge") ? 1 : 0; }, rw: { crystal: 4 } },
    { ch: 4, id: "berry", n: "Cold Harvest", d: "Grow and harvest a Frostberry. Frost Spikes drop the seeds, and they grow fastest in Frostfen.", need: 1, v: function () { return S.st.cropbits & 8 ? 1 : 0; }, rw: { seed_frost: 2 } },
    { ch: 4, id: "bench4", n: "Frostbound Bench", d: "Upgrade your Workbench to the Frost Workbench.", need: 4, v: function () { return S.bl; }, rw: { planks: 12 } },
    { ch: 4, id: "fplate", n: "Frozen Solid", d: "Craft the Frost Plate armor.", need: 1, v: function () { return S.arm >= 4 ? 1 : 0; }, rw: { torch: 8 } },
    { ch: 4, id: "alpha", n: "Leader of the Pack", d: "Craft a Frost Horn at your Frost Workbench and blow it in Frostfen. Defeat the Frost Alpha: jump its ice shards and step out from under the icicles.", need: 1, v: function () { return S.st.boss & 4 ? 1 : 0; }, rw: { crystal: 6, rawmeat: 3 } },
    // ---- Chapter 6: the finale ----
    { ch: 5, id: "deep10", n: "Into the Deep", d: "Reach floor 10 below a Cave Hole.", need: 10, v: function () { return S.st.caveDeep; }, rw: { ironingot: 2 } },
    { ch: 5, id: "hoard", n: "Lost Treasures", d: "Open 5 Cave Chests.", need: 5, v: function () { return S.st.cchests; }, rw: { amethyst: 2 } },
    { ch: 5, id: "hunter", n: "Monster Hunter", d: "Defeat one of every creature: bug, frog, bat, wolf, gator, slime and wasp.", need: 7, v: function () { return ["bugs", "frogs", "bats", "wolves", "gators", "slimes", "wasps"].filter(function (k) { return S.st[k] >= 1; }).length; }, rw: { torch: 10 } },
    { ch: 5, id: "feast", n: "Feast of Three Lands", d: "Cook and eat an Explorer's Feast (a stew, a chili and a tart).", need: 1, v: function () { return S.ate.feast ? 1 : 0; }, rw: { roastcarrot: 3 } },
    { ch: 5, id: "gems", n: "The Three Lights", d: "Hold 2 Ember Rubies, 2 Frost Sapphires and 2 Moonstones.", need: 3, v: function () { return mk("x_swampheart") ? 3 : (inv("ruby") >= 2 ? 1 : 0) + (inv("sapphire") >= 2 ? 1 : 0) + (inv("moonstone") >= 2 ? 1 : 0); } },
    { ch: 5, id: "heart", n: "Shape the Heart", d: "Craft the Heart of the Swamp at the Decor Workbench (Legendary).", need: 1, v: function () { return mk("x_swampheart"); } },
    { ch: 5, id: "restore", n: "Restore the Swamp", d: "Place the Heart of the Swamp at your camp.", need: 1, v: function () { return S.st.heart; }, rw: { torch: 20 } },
    // ---- Chapter 7: the Realm Gate ----
    { ch: 6, id: "pick5", n: "Fit for a King", d: "Craft the Swampking Pick at your Frost Workbench. It takes one trophy from each boss.", need: 1, v: function () { return S.tier >= 5 ? 1 : 0; }, rw: { torch: 8 } },
    { ch: 6, id: "realm", n: "Stone Between Worlds", d: "Dig down to the very bottom of the world and mine 8 Realmstone with the Swampking Pick.", need: 8, v: function () { return S.st.realm; }, rw: { ironingot: 3 } },
    { ch: 6, id: "gate", n: "Raise the Gate", d: "Craft a Realm Gate at your Frost Workbench and place it in the open.", need: 1, v: function () { return S.st.gatepl; }, rw: { torch: 6 } },
    { ch: 6, id: "wake", n: "Light Every Socket", d: "Tap the gate and offer the three boss trophies, a Ruby, a Sapphire, a Moonstone and 8 Realm Shards. Then awaken it.", need: 1, v: function () { return S.st.gatewake; } },
    { ch: 6, id: "through", n: "Step Through", d: "Tap the awakened gate and step through.", need: 1, v: function () { return S.st.gatein ? 1 : 0; } }
  ];
  MAIN.forEach(function (q) { if (q.rw) Object.keys(q.rw).forEach(function (k) { if (!ITEMS[k]) delete q.rw[k]; }); });
  CHAPTERS.forEach(function (c) { if (c.rw) Object.keys(c.rw).forEach(function (k) { if (!ITEMS[k]) delete c.rw[k]; }); });
  // Side quests: cat groups them, ch = the chapter they open in. ids match the old Goals, so finished goals stay finished.
  function sq(id, cat, ch, n, d, need, v, rw) { return { id: id, cat: cat, ch: ch, n: n, d: d, need: need, v: v, rw: rw }; }
  function st(k) { return function () { return S.st[k] || 0; }; }
  var SIDE = [
    sq("croak", "Explorer", 0, "Say Hello", "Find Old Croaker at the camp (a few steps west of where you woke up) and tap him to talk.", 1, st("talks"), { roastcarrot: 2 }),
    sq("dig", "Explorer", 0, "First Dig", "Mine your first block.", 1, st("mined"), { pebble: 2 }),
    sq("swim", "Explorer", 0, "Wet Paws", "Swim in the swamp.", 2, st("swim"), { fiber: 3 }),
    sq("bld1", "Explorer", 0, "Knock Knock", "Step inside a building.", 1, st("bld"), { torch: 2 }),
    sq("bld5", "Explorer", 2, "House Call", "Visit 5 buildings.", 5, st("bld"), { planks: 10 }),
    sq("allkinds", "Explorer", 4, "Grand Tour", "Step inside all seven kinds of building.", 7, function () { return ["cabin", "tower", "farm", "forge", "keep", "lodge", "shrine"].filter(function (k) { return vis("k_" + k); }).length; }, { amethyst: 3 }),
    sq("deep", "Explorer", 1, "Deep Diver", "Dig down to depth 50.", 50, st("maxDepth"), { torch: 6 }),
    sq("wood", "Builder", 0, "Timber!", "Collect 10 Wood.", 10, st("wood"), { planks: 4 }),
    sq("ladder1", "Builder", 1, "Up and Away", "Place a Ladder.", 1, st("ladders"), { planks: 3 }),
    sq("wall1", "Builder", 1, "Back Wall", "Place a back wall.", 1, st("walls"), { wall_plank: 8 }),
    sq("wall2", "Builder", 2, "Room Maker", "Place 40 back wall tiles.", 40, st("walls"), { wall_log: 12 }),
    sq("lights", "Builder", 1, "Night Light", "Place 10 Torches.", 10, st("torches"), { torch: 6 }),
    sq("build", "Builder", 1, "Builder", "Place 100 blocks.", 100, st("placed"), { planks: 16 }),
    sq("build500", "Builder", 3, "Master Builder", "Place 500 blocks.", 500, st("placed"), { cobble: 16, redbrick: 16 }),
    sq("stand1", "Decorator", 1, "Hall of Armor", "Dress an Armor Stand in armor or a weapon you have made.", 1, st("stands"), { planks: 6 }),
    sq("stand3", "Decorator", 3, "The Armory", "Have 3 dressed Armor Stands at once.", 3, st("stands"), { ironingot: 2 }),
    sq("decor1", "Decorator", 1, "Home Sweet Home", "Place 3 pieces of furniture.", 3, st("decor"), { flower: 2 }),
    sq("dbench1", "Decorator", 1, "Interior Designer", "Place a Decor Workbench.", 1, st("dbenches"), { planks: 6 }),
    sq("dcraft5", "Decorator", 1, "Cozy Corner", "Craft 5 pieces at the Decor Workbench.", 5, st("dcraft"), { candle: 4 }),
    sq("dcraft15", "Decorator", 2, "Master Decorator", "Craft 15 pieces at the Decor Workbench.", 15, st("dcraft"), { cloth: 3 }),
    sq("dcraft30", "Decorator", 3, "Grand Decorator", "Craft 30 pieces at the Decor Workbench.", 30, st("dcraft"), { amberblock: 4 }),
    sq("throne", "Decorator", 4, "Fit for a King", "Craft the Frostrock Throne.", 1, function () { return mk("d_throne") || inv("throne") ? 1 : 0; }, { moonstone: 1 }),
    sq("bag1", "Crafter", 0, "Pack Up", "Craft the Reed Backpack.", 1, function () { return S.bag >= 1 ? 1 : 0; }, { fiber: 4 }),
    sq("bag2", "Crafter", 2, "Hauler", "Craft the Bog Hauler Pack.", 1, function () { return S.bag >= 2 ? 1 : 0; }, { rope: 3 }),
    sq("shovel1", "Crafter", 0, "Dig It", "Craft the Reed Shovel.", 1, function () { return S.shovel ? 1 : 0; }, { pebble: 3 }),
    sq("bow1", "Hunter", 1, "Sharpshooter", "Craft the Reed Slingshot.", 1, function () { return S.bow >= 1 ? 1 : 0; }, { pebble: 10 }),
    sq("arrow25", "Hunter", 2, "Bullseye", "Hit 25 creatures with shots.", 25, st("arrowhits"), { arrow: 12 }),
    sq("bow3", "Hunter", 3, "Ember Archer", "Craft the Ember Longbow.", 1, function () { return S.bow >= 3 ? 1 : 0; }, { firearrow: 12 }),
    sq("brew1", "Farmer & Cook", 2, "Bubble and Brew", "Build a Brewing Stand and drink a potion.", 1, st("drunk"), { bottle: 3 }),
    sq("brew7", "Farmer & Cook", 4, "Master Brewer", "Drink every kind of potion.", 8, function () { return Object.keys(POTIONS).filter(function (k) { return S.mk["drank_" + k]; }).length; }, { ruby: 1, sapphire: 1 }),
    sq("gem1", "Crafter", 2, "Set in Stone", "Set a gem into your gear at a Jeweler's Table.", 1, st("socketed"), { quartz: 2 }),
    sq("gem4", "Crafter", 4, "Fully Jeweled", "Have a gem in all four gear sockets.", 4, function () { return ["wpn", "arm", "pick", "bow"].filter(function (k) { return S.gems[k]; }).length; }, { amethyst: 2 }),
    sq("tree3", "Farmer & Cook", 1, "Green Fingers", "Grow 3 trees from Saplings.", 3, st("treesgrown"), { sapling: 2, fiber: 4 }),
    sq("stain1", "Builder", 1, "A Fresh Coat", "Stain 10 wooden blocks.", 10, st("stained"), { planks: 10 }),
    sq("stain8", "Decorator", 3, "Every Shade of Wood", "Use all eight wood stains.", 8, function () { return STAINS.filter(function (q, i) { return S.mk["stain_" + i]; }).length; }, { swamptoken: 4 }),
    sq("witch1", "Hunter", 2, "Hex Breaker", "Defeat a Bog Witch. They roam Murkwater at night.", 1, st("witches"), { bottle: 3 }),
    sq("witch5", "Hunter", 3, "Coven Crasher", "Defeat 5 Bog Witches.", 5, st("witches"), { tonic_heal: 2 }),
    sq("whut1", "Explorer", 2, "Something Bubbling", "Step inside a Witch Hut, deep in Murkwater.", 1, function () { return S.vis.k_witchhut ? 1 : 0; }, { bottle: 4 }),
    sq("whut2", "Explorer", 3, "Witch's Hoard", "Raid a Witch's Chest.", 1, st("wchests"), { hexdust: 2 }),
    sq("glide500", "Explorer", 3, "Riding the Thermals", "Glide 500 tiles with the Emberfly Wings.", 500, st("glided"), { tonic_leap: 1 }),
    sq("spider10", "Hunter", 2, "Arachnophobe", "Defeat 10 Cave Spiders. They lurk under every land.", 10, st("spiders"), { silk: 4, torch: 6 }),
    sq("king5", "Crafter", 5, "Long Live the King", "Craft the Swampking Plate and the Swampking Blade.", 2, function () { return (S.arm >= 5 ? 1 : 0) + (S.wpn >= 5 ? 1 : 0); }, { swamptoken: 10, feast: 1 }),
    sq("arm1", "Crafter", 0, "Dressed Up", "Craft the Reed Vest.", 1, function () { return S.arm >= 1 ? 1 : 0; }, { fiber: 4 }),
    sq("x_cloth", "Crafter", 2, "Weaver", "Weave Cloth on a Weaver's Loom.", 1, function () { return mk("x_cloth") + mk("x_furcloth") || inv("cloth") ? 1 : 0; }, { cotton: 3 }),
    sq("x_mason", "Crafter", 3, "Master Mason", "Cut Red Brick, Quartz Blocks and Obsidian Brick.", 3, function () { return (mk("x_redbrick") ? 1 : 0) + (mk("x_quartzblock") ? 1 : 0) + (mk("x_obsbrick") ? 1 : 0); }, { mortar: 4 }),
    sq("x_glass", "Crafter", 3, "Stained Glass Window", "Make all three stained glass colours.", 3, function () { return (mk("x_stainedred") ? 1 : 0) + (mk("x_stainedblue") ? 1 : 0) + (mk("x_stainedgreen") ? 1 : 0); }, { glass: 4 }),
    sq("hoe1", "Farmer & Cook", 1, "Hoe Down", "Till 12 tiles of ground with a hoe.", 12, st("tilled"), { seed_potato: 3 }),
    sq("hoe2", "Farmer & Cook", 2, "Swing and Sow", "Harvest 25 ripe crops with a hoe (it replants for you).", 25, st("hoeharv"), { ironingot: 1, seed_pepper: 2 }),
    sq("can1", "Farmer & Cook", 1, "Green Paws", "Water a plant with the Watering Can.", 1, st("watered"), { seed_carrot: 2 }),
    sq("can2", "Farmer & Cook", 1, "Gardener", "Water plants 20 times.", 20, st("watered"), { farmland: 6 }),
    sq("farm25", "Farmer & Cook", 2, "Swamp Farmer", "Harvest 25 ripe crops.", 25, st("harvests"), { seed_potato: 4 }),
    sq("crops4", "Farmer & Cook", 4, "Four Fields", "Harvest Swamp Carrots, Bog Potatoes, Fire Peppers and Frostberries.", 4, function () { var b = S.st.cropbits || 0, n = 0; for (var q = 1; q <= 8; q *= 2) if (b & q) n++; return n; }, { seed_pepper: 2, seed_frost: 2 }),
    sq("cook5", "Farmer & Cook", 1, "Swamp Chef", "Cook 5 meals at a Cooking Pot.", 5, st("cooked"), { rawmeat: 2 }),
    sq("gourmet", "Farmer & Cook", 3, "Gourmet", "Eat 6 different cooked meals.", 6, function () { return Object.keys(S.ate).length; }, { stew: 1 }),
    sq("boss1", "Hunter", 2, "Big Game", "Defeat a boss. Craft a summon item at the Workbench and use it in its home land.", 1, st("bossk"), { torch: 8, ironingot: 1 }),
    sq("boss3", "Hunter", 4, "Slayer of Three", "Defeat the Bramble Queen, the Magma Wyrm and the Frost Alpha.", 3, function () { return (S.st.boss & 1 ? 1 : 0) + (S.st.boss & 2 ? 1 : 0) + (S.st.boss & 4 ? 1 : 0); }, { moonstone: 1, ruby: 1, sapphire: 1 }),
    sq("boss10", "Hunter", 5, "Boss Rush", "Defeat 10 bosses (fighting the same one again counts).", 10, st("bossk"), { amethyst: 3 }),
    sq("bug5", "Hunter", 2, "Thorn Trouble", "Defeat 5 Bramble Bugs.", 5, st("bugs"), { torch: 4 }),
    sq("frog5", "Hunter", 2, "Croak Crusher", "Defeat 5 Swamp Frogs.", 5, st("frogs"), { rawmeat: 2 }),
    sq("bat1", "Hunter", 1, "Night Watch", "Defeat a Dusk Bat.", 1, st("bats"), { torch: 3 }),
    sq("bat10", "Hunter", 2, "Bat Basher", "Defeat 10 Dusk Bats.", 10, st("bats"), { batwing: 2 }),
    sq("slime5", "Hunter", 2, "Slime Time", "Pop 5 slimes (caves, or the surface at night).", 5, st("slimes"), { slimeball: 2 }),
    sq("gator1", "Hunter", 2, "Gator Wrangler", "Defeat a Bog Gator. They lurk in swamp lakes once you have the Glowspore Blade.", 1, st("gators"), { gatorscale: 1 }),
    sq("wasp5", "Hunter", 3, "Hive Breaker", "Defeat 5 Ember Wasps.", 5, st("wasps"), { stinger: 2 }),
    sq("wolf5", "Hunter", 4, "Pack Leader", "Defeat 5 Frost Wolves.", 5, st("wolves"), { wolfpelt: 2 }),
    sq("sleep5", "Hunter", 2, "Well Rested", "Sleep through 5 nights.", 5, st("sleeps"), { torch: 4 }),
    sq("cave2", "Delver", 2, "Rock Hound", "Break 25 rocks inside the Cave Holes.", 25, st("cmined"), { torch: 4 }),
    sq("cave3", "Delver", 2, "Spelunker", "Reach cave floor 5.", 5, st("caveDeep"), { ironingot: 1 }),
    sq("ckill10", "Delver", 2, "Cave Crawler", "Defeat 10 creatures in the Cave Holes.", 10, st("ckills"), { torch: 6 }),
    sq("cclear5", "Delver", 3, "Deep Delver", "Clear 5 cave floors.", 5, st("cclear"), { amethyst: 2 }),
    sq("cave15", "Delver", 5, "Abyss Walker", "Reach cave floor 15.", 15, st("caveDeep"), { moonstone: 1, ruby: 1 }),
    sq("loot1", "Delver", 2, "Treasure Hunter", "Open a Cave Chest. They glow faintly in dark caves.", 1, st("cchests"), { torch: 3 }),
    sq("loot10", "Delver", 4, "Hoard of Gold", "Open 10 Cave Chests.", 10, st("cchests"), { quartz: 3 }),
    sq("pots20", "Delver", 2, "Pot Smasher", "Smash 20 Cave Pots.", 20, st("pots"), { candle: 4 }),
    sq("trap10", "Angler", 2, "Trapper", "Collect 10 fish from Fish Traps.", 10, st("trapped"), { rope: 2, bogminnow: 2 }),
    sq("home1", "Explorer", 1, "No Place Like Home", "Use a Homeward Shell to go home.", 1, st("homes"), { fiber: 4 }),
    sq("bait10", "Angler", 1, "Bait and Wait", "Catch 10 fish using bait (Earthworms from mud and grass, or Fireflies).", 10, st("baited"), { firefly: 2, rope: 1 }),
    sq("ffly10", "Collector", 1, "Glow Catcher", "Catch 10 fireflies with a Bug Net on swamp nights.", 10, st("fireflies"), { glass: 2 }),
    sq("scoop10", "Builder", 1, "Bucket Brigade", "Scoop up 10 buckets of water or lava.", 10, st("scooped"), { planks: 8 }),
    sq("fish10", "Angler", 1, "Fishmonger", "Catch 10 fish.", 10, st("fish"), { bogminnow: 3 }),
    sq("fish50", "Angler", 3, "Master Angler", "Catch 50 fish.", 50, st("fish"), { rope: 4 }),
    sq("rarefish", "Angler", 2, "Rare Catch", "Catch a rare fish: a Glowfin (best at night), a Crystal Carp or a Cinderfish.", 1, st("rarefish"), { glowfin: 1 }),
    sq("fishdex", "Angler", 4, "Fish Collector", "Catch all nine kinds of fish (swamp water, Frostfen ice and Ember Bog lava).", 9, function () { return FISH_ALL.filter(function (k) { return S.fdex[k]; }).length; }, { moonstone: 1, ruby: 1 }),
    sq("lavafish", "Angler", 3, "Lava Angler", "Catch a fish in lava with the Ember Rod.", 1, st("lavafish"), { charcoal: 4 }),
    sq("fishloot", "Angler", 2, "Sunken Treasure", "Fish up treasure from the depths.", 1, st("fishloot"), { candle: 3 }),
    sq("boot", "Angler", 1, "One Boot Short", "Fish up an Old Boot.", 1, st("boots"), { fiber: 3 }),
    sq("pets3", "Rancher", 1, "Little Farm", "Tame 3 animals.", 3, st("tamed"), { trough: 1 }),
    sq("allpets", "Rancher", 4, "Menagerie", "Own a Bog Duck, a Mud Pig and a Frost Goat.", 3, function () { return ["duck", "pig", "goat"].filter(function (k) { return S.pets.some(function (q) { return q.k === k; }); }).length; }, { goatmilk: 2 }),
    sq("collect20", "Rancher", 2, "Farm Fresh", "Collect 20 eggs, truffles or milk from your animals.", 20, st("collected"), { seed_potato: 4 }),
    sq("baby1", "Rancher", 2, "Growing Family", "Feed two happy animals of the same kind side by side to get a baby.", 1, st("babies"), { duckegg: 3 }),
    sq("charm1", "Collector", 2, "Lucky Charm", "Craft your first charm and wear it.", 1, function () { return S.charms.on.length ? 1 : 0; }, { rope: 2 }),
    sq("charm8", "Collector", 5, "Charmed, I'm Sure", "Own all eleven charms.", 11, function () { return Object.keys(S.charms.own).length; }, { amethyst: 2, feast: 1 }),
    sq("bty1", "Collector", 1, "Odd Job", "Finish one of Old Croaker's bounties and claim it.", 1, st("bounties"), { torch: 6 }),
    sq("bty25", "Collector", 2, "Swamp's Handyfrog", "Claim 25 bounties.", 25, st("bounties"), { amethyst: 1, ironingot: 2 }),
    sq("shop1", "Collector", 1, "Swap Meet", "Trade Croaker Tokens for something in his Swap Shop.", 1, st("shopbuys"), { seed_carrot: 3 }),
    sq("x_amber", "Collector", 2, "Amber Eyes", "Mine Amber from a swamp ore vein.", 1, function () { return inv("amber") ? 1 : 0; }, { torch: 3 }),
    sq("x_geode", "Collector", 2, "Geode Cracker", "Crack open a Geode.", 1, function () { return inv("quartz") || inv("amethyst") ? 1 : 0; }, { torch: 3 }),
    sq("x_fossil", "Collector", 2, "Fossil Hunter", "Dig up a Fossil.", 1, function () { return inv("fossil") ? 1 : 0; }, { bone: 3 })
  ];
  SIDE.forEach(function (q) { if (q.rw) Object.keys(q.rw).forEach(function (k) { if (!ITEMS[k]) delete q.rw[k]; }); });
  var SIDE_CATS = ["Explorer", "Builder", "Decorator", "Crafter", "Farmer & Cook", "Angler", "Rancher", "Hunter", "Delver", "Collector"];
  var GOALS = SIDE, TRAIL = MAIN;   // older names, still used by a few helpers
  function curCh() { return MAIN[S.qi] ? MAIN[S.qi].ch : CHAPTERS.length - 1; }
  function chQuests(c) { return MAIN.filter(function (q) { return q.ch === c; }); }
  function sideOpen(q) { return q.ch <= curCh(); }
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
  function fresh(seed) { return { v: 2, wv: SW.WORLDVER, seed: seed, e: "", ex: "", we: "", p: null, animal: defaultAnimal(), inv: {}, slots: emptySlots(0), extra: {}, bag: 0, can: 0, water: 0, mru: [], tier: 0, wpn: 0, arm: 0, bow: 0, bl: 1, trail: 0, hp: MAXHP, bed: null, shovel: 0, dur: { pick: 0, shovel: 0, wpn: 0, arm: 0 }, chests: {}, wp: [], time: 60, days: 0, ms: {}, st: { deaths: 0, mined: 0, placed: 0, torches: 0, wood: 0, maxDepth: 0, swim: 0, stick: 0, fiber: 0, pebble: 0, spore: 0, benches: 0, swings: 0, bugs: 0, frogs: 0, bats: 0, wolves: 0, gators: 0, witches: 0, spiders: 0, slimes: 0, wasps: 0, seen: 0, cchests: 0, pots: 0, ckills: 0, cclear: 0, heart: 0, fish: 0, rarefish: 0, fishloot: 0, boots: 0, lavafish: 0, tamed: 0, collected: 0, babies: 0, talks: 0, realm: 0, stained: 0, wchests: 0, glided: 0, drunk: 0, socketed: 0, saplings: 0, treesgrown: 0, shots: 0, arrowhits: 0, trapped: 0, homes: 0, gatepl: 0, gatewake: 0, gatein: 0, scooped: 0, fireflies: 0, baited: 0, stands: 0, tilled: 0, hoeharv: 0, charmswap: 0, boss: 0, bossk: 0, summons: 0, bounties: 0, shopbuys: 0, eaten: 0, planted: 0, harvests: 0, cooked: 0, cropbits: 0, htip: 0, beds: 0, sleeps: 0, warned: 0, doors: 0, ladders: 0, chests: 0, stashed: 0, caves: 0, cmined: 0, caveDeep: 0, decor: 0, dbenches: 0, dcraft: 0, watered: 0, grown: 0, walls: 0 }, zoom: 1, tv: 2, qv: 4, rod: 0, hoe: 0, bucket: 0, bkt: "", net: 0, cg: 0, diff: 1, wings: 0, stain: {}, wstain: {}, whut: {}, wloot: {}, stands: {}, traps: {}, gates: {}, saps: {}, pity: {}, fx: {}, gems: { wpn: "", arm: "", pick: "", bow: "" }, done: 0, gv: 1, bossOn: "", wx: null, charms: { own: {}, on: [] }, bty: { day: -1, wk: -1, d: [], w: null, rr: 0, full: 0 }, pets: [], fdex: {}, qi: 0, qch: -1, mk: {}, vis: {}, food: 100, nohunger: 0, farm: {}, ate: {} }; }
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
    var tr = Math.floor(+o.tier); d.tier = clamp(isFinite(tr) ? tr : 1, o.v >= 2 ? 0 : 1, PICKS.length - 1);
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
    if (o.mk && typeof o.mk === "object") Object.keys(o.mk).forEach(function (k) { var n = Math.floor(+o.mk[k]); if (n > 0) d.mk[k] = n; });
    if (o.vis && typeof o.vis === "object") Object.keys(o.vis).forEach(function (k) { if (o.vis[k]) d.vis[k] = 1; });
    if (o.ms && o.ms.ember) d.vis.b1 = 1; if (o.ms && o.ms.frost) d.vis.b2 = 1;
    d.rod = clamp(Math.floor(+o.rod) || 0, 0, 2); d.hoe = clamp(Math.floor(+o.hoe) || 0, 0, 3); d.bucket = clamp(Math.floor(+o.bucket) || 0, 0, 2); d.bkt = o.bkt === "water" || (o.bkt === "lava" && d.bucket >= 2) ? o.bkt : ""; d.bow = clamp(Math.floor(+o.bow) || 0, 0, 3); d.net = o.net ? 1 : 0; ["whut", "wloot"].forEach(function (mk3) { var src3 = o[mk3]; if (src3 && typeof src3 === "object" && o.wv === SW.WORLDVER) Object.keys(src3).forEach(function (k) { var v = Math.floor(+src3[k]); if (/^\d+$/.test(k) && v >= -1 && v < 1e6) d[mk3][k] = v; }); });
    ["stain", "wstain"].forEach(function (mk2) { var src = o[mk2]; if (src && typeof src === "object" && o.wv === SW.WORLDVER) Object.keys(src).forEach(function (k) { var v = Math.floor(+src[k]); if (/^\d+$/.test(k) && v >= 0 && v < STAINS.length) d[mk2][k] = v; }); });
    if (o.saps && typeof o.saps === "object" && o.wv === SW.WORLDVER) Object.keys(o.saps).forEach(function (k) { if (/^\d+,\d+$/.test(k)) d.saps[k] = clamp(+o.saps[k] || 0, 0, 600); });
    if (o.pity && typeof o.pity === "object") Object.keys(o.pity).forEach(function (k) { if (ITEMS[k]) d.pity[k] = clamp(Math.floor(+o.pity[k]) || 0, 0, 9); });
    if (o.gems && typeof o.gems === "object") ["wpn", "arm", "pick", "bow"].forEach(function (k) { if (GEMS.indexOf(o.gems[k]) > -1) d.gems[k] = o.gems[k]; });
    if (o.fx && typeof o.fx === "object") Object.keys(FXN).forEach(function (k) { var v = +o.fx[k]; if (v > 0) d.fx[k] = Math.min(v, 600); });
    d.cg = clamp(Math.floor(+o.cg) || 0, 0, 63); d.diff = o.diff === 0 || o.diff === 2 ? o.diff : 1; d.wings = o.wings ? 1 : 0; d.done = o.done ? 1 : 0; d.gv = o.gv ? 1 : 0;
    if (o.gates && typeof o.gates === "object" && o.wv === SW.WORLDVER) Object.keys(o.gates).forEach(function (k) { var v = o.gates[k]; if (/^\d+,\d+$/.test(k) && v) { var oo = {}; GATE_OFFER.forEach(function (q) { if (v.o && v.o[q[0]]) oo[q[0]] = 1; }); d.gates[k] = { o: oo, on: v.on && GATE_OFFER.every(function (q) { return oo[q[0]]; }) ? 1 : 0 }; } });
    if (o.traps && typeof o.traps === "object" && o.wv === SW.WORLDVER) Object.keys(o.traps).forEach(function (k) { var v = o.traps[k]; if (/^\d+,\d+$/.test(k) && v) d.traps[k] = { f: (Array.isArray(v.f) ? v.f : []).filter(function (f) { return ITEMS[f]; }).slice(0, TRAP_MAX), t: clamp(+v.t || 0, 0, TRAP_T) }; });
    if (o.stands && typeof o.stands === "object" && o.wv === SW.WORLDVER) Object.keys(o.stands).forEach(function (k) { var v = o.stands[k]; if (/^\d+,\d+$/.test(k) && v) d.stands[k] = { a: clamp(Math.floor(+v.a) || 0, 0, 5), w: clamp(Math.floor(+v.w) || 0, 0, 5) }; });
    if (typeof o.bossOn === "string" && ITEMS[o.bossOn] && ITEMS[o.bossOn].summon) d.bossOn = o.bossOn;
    if (o.charms && typeof o.charms === "object") { if (o.charms.own) Object.keys(CHARMS).forEach(function (k) { if (o.charms.own[k]) d.charms.own[k] = 1; }); if (Array.isArray(o.charms.on)) o.charms.on.forEach(function (k) { if (d.charms.own[k] && d.charms.on.indexOf(k) < 0 && d.charms.on.length < 3) d.charms.on.push(k); }); }
    if (o.wx && WX_LEN[o.wx.k] && isFinite(+o.wx.t)) d.wx = { k: o.wx.k, t: clamp(+o.wx.t, 1, 600), n: clamp(+o.wx.n || 0, 0, 1) };
    if (o.bty && typeof o.bty === "object") {   // Old Croaker's bounties
      var okb = function (b) { if (!b || typeof b.id !== "string" || !isFinite(+b.need) || !isFinite(+b.b)) return null; var rw = {}; if (b.rw && typeof b.rw === "object") Object.keys(b.rw).forEach(function (k) { var n = Math.floor(+b.rw[k]); if (ITEMS[k] && n > 0) rw[k] = Math.min(n, 99); }); return { id: b.id.slice(0, 12), need: Math.max(1, Math.floor(+b.need)), b: Math.max(0, Math.floor(+b.b)), tk: clamp(Math.floor(+b.tk) || 2, 1, 20), rw: rw, done: b.done ? 1 : 0, told: b.told ? 1 : 0 }; };
      d.bty = { day: Math.floor(+o.bty.day) || -1, wk: Math.floor(+o.bty.wk) || -1, d: Array.isArray(o.bty.d) ? o.bty.d.map(okb).filter(Boolean).slice(0, 3) : [], w: okb(o.bty.w), rr: clamp(Math.floor(+o.bty.rr) || 0, 0, 9), full: o.bty.full ? 1 : 0 };
    }
    if (o.fdex && typeof o.fdex === "object") Object.keys(o.fdex).forEach(function (k) { if (ITEMS[k]) d.fdex[k] = 1; });
    if (Array.isArray(o.pets) && o.wv === SW.WORLDVER) o.pets.slice(0, PET_MAX).forEach(function (q) {   // tamed animals (dropped if the world was rebuilt)
      if (!q || !ANIM[q.k] || !isFinite(+q.x) || !isFinite(+q.y)) return;
      var a = newAnimal(q.k, clamp(+q.x, 2, W - 2), clamp(+q.y, 2, H - 3), true); a.hx = isFinite(+q.hx) ? +q.hx : a.x; a.fed = clamp(+q.fed || 0, 0, FED_S); a.pr = Math.max(0, +q.pr || 0); a.rdy = clamp(Math.floor(+q.rdy) || 0, 0, 3);
      a.nm = String(q.nm || ANIM[q.k].n).slice(0, 20); a.baby = Math.max(0, +q.baby || 0); if (a.baby) { a.w *= 0.6; a.h *= 0.6; } a.love = Math.max(0, +q.love || 0); d.pets.push(a);
    });
    if (o.qv === 1) {   // quest list v1: Chapter 2 gained "Gone Fishing" and "A New Friend", so map the saved quest by its id
      var oid = MAIN_V1[clamp(Math.floor(+o.qi) || 0, 0, MAIN_V1.length)], ni = oid ? MAIN.map(function (q) { return q.id; }).indexOf(oid) : MAIN.length; o = Object.assign({}, o, { qi: ni < 0 ? MAIN.length : ni, qv: 2 });
    }
    if (o.qv === 2) {   // quest list v2: chapters 3-5 each gained a boss quest at the end, so map the saved quest by its id
      var oid2 = MAIN.filter(function (q) { return !BOSS[q.id]; }).map(function (q) { return q.id; })[clamp(Math.floor(+o.qi) || 0, 0, 999)], ni2 = oid2 ? MAIN.map(function (q) { return q.id; }).indexOf(oid2) : MAIN.length; o = Object.assign({}, o, { qi: ni2 < 0 ? MAIN.length : ni2, qv: 3 });
    }
    if (o.qv === 3) {   // quest list v3: Chapter 4 gained "Above the Embers", so map the saved quest by its id
      var oid3 = MAIN.filter(function (q) { return q.id !== "aerie"; }).map(function (q) { return q.id; })[clamp(Math.floor(+o.qi) || 0, 0, 999)], ni3 = oid3 ? MAIN.map(function (q) { return q.id; }).indexOf(oid3) : MAIN.length; o = Object.assign({}, o, { qi: ni3 < 0 ? MAIN.length : ni3, qv: 4 });
    }
    if (o.qv === 4) { d.qi = clamp(Math.floor(+o.qi) || 0, 0, MAIN.length); d.qch = clamp(Math.floor(+o.qch), -1, CHAPTERS.length - 1); if (!isFinite(d.qch)) d.qch = -1; }
    else d.qv = 0;   // a save from before the quest system: start() fast-forwards it (see quests)
    return d;
  }
  function build(state) {
    world = SW.gen(state.seed); tiles = world.t; liftStructs(tiles, world.walls); orig = tiles.slice(); edits = {};
    state.e.split(",").forEach(function (s) { var a = s.split(":"), i = parseInt(a[0], 10), id = parseInt(a[1], 10); if (i >= 0 && i < tiles.length && TILES[id]) { tiles[i] = id; if (id !== orig[i]) edits[i] = id; } });
    smask = null;   // buildings are pictures now (see BUILDING PICTURES), so nothing in the grid is scenery
    col = new Int16Array(W); for (var x = 0; x < W; x++) recalc(x);
    ex = new Uint8Array(W * H); unrle(state.ex, ex);
    walls = world.walls ? world.walls.slice() : new Uint8Array(W * H); worigW = walls.slice(); wedits = {};   // back walls: world-made ones plus only the ones you changed (S.we, "index:wallId" pairs, 0 = removed)
    (typeof state.we === "string" ? state.we : "").split(",").forEach(function (q) { var a = q.split(":"), wi = parseInt(a[0], 10), wd = parseInt(a[1], 10); if (wi >= 0 && wi < walls.length && (wd === 0 || (TILES[wd] && TILES[wd].kind === "wall"))) { walls[wi] = wd; if (wd !== worigW[wi]) wedits[wi] = wd; } });
  }
  function start(state) {
    S = state; if (S.bossOn) { S.inv[S.bossOn] = (S.inv[S.bossOn] || 0) + 1; var rb = S.bossOn; S.bossOn = ""; setTimeout(function () { toast("The fight was left unfinished, so your " + ITEMS[rb].n + " is back in your bag.", "#f2c14e"); }, 1500); }
    benchLv = S.bl || 1; repaintBench(); grow.length = 0; canAcc = 0; build(S); cave = null; trans = null; resize(); stageEl.classList.remove("cave");
    if (state.grown) { state.grown = false; setTimeout(function () { toast("The world was rebuilt! Taller mountains, volcanoes, ice spires and deeper caves. Your items are safe.", "#f2c14e"); }, 1200); }
    var sp = world.spawn; p.x = S.p ? S.p.x : sp.x; p.y = S.p ? S.p.y : sp.y; p.face = S.p ? S.p.f : 1; p.vx = p.vy = 0;
    var guard = 0; while (boxHit(p.x, p.y) && guard++ < 120) p.y -= 1;
    if (!S.qv) { S.qv = 4; S.qi = 0; checkTrail(true); S.qch = curCh() - 1; }   // an older save: every quest already done counts, silently, then the current chapter's story is shown
    npc.ok = false; npc.chk = 0; cam.x = p.x; cam.y = p.y - 1; sel = "pick"; selSlot = -1; reslot(); bare = !(S.tier >= 1); if (!bare) selSlot = hotIndex("t_pick"); invSel = -1; mine = null; lastBio = -1; trailKey = ""; guide = null; tab = S.qi < MAIN.length ? "quests" : "craft"; hbDirty = true;
    storyQ.length = 0; if (S.qch < curCh()) { S.qch = curCh(); storyQ.push(curCh()); setTimeout(showStory, 900); } else if (!S.gv && MAIN[S.qi] && MAIN[S.qi].ch === CHAPTERS.length - 2) { storyQ.push(CHAPTERS.length - 2); setTimeout(showStory, 900); }   // an old save that had already finished: the Realm Gate chapter is new to it
    S.gv = 1; exKey = ""; spriteKey = ""; ICO = {};
    hp = S.hp; hurtT = hurtGrace = shake = 0; sinceHurt = 99; shownHp = -1; drawHp(); sleepT = 0; batT = 8; enemies.length = 0; bshots.length = 0; bossBarKey = "x";
    reveal(true);
  }
  function save() {
    if (MP.on && MP.role === "guest") { mpSaveChar(); cloudDirty(); return; }
    try {
      reslot(); S.hp = Math.max(1, Math.round(hp));
      S.p = { x: +p.x.toFixed(2), y: +p.y.toFixed(2), f: p.face };
      S.e = Object.keys(edits).map(function (k) { return k + ":" + edits[k]; }).join(",");
      S.ex = rle(ex); S.we = Object.keys(wedits).map(function (k) { return k + ":" + wedits[k]; }).join(",");
      localStorage.setItem(wkey(curId), JSON.stringify(S)); cloudDirty(); touchIdx(); saveFail = false;
    } catch (e) { if (!saveFail) { saveFail = true; try { toast("Could not save: browser storage is full or blocked. Delete a world you do not need.", "#ff8a3d"); } catch (x) {} } }
  }
  function load() {
    wIdx = readIdx();
    if (wIdx.list.length) curId = wIdx.last; else addWorld("My Swamp");
    start(readWorld(curId) || fresh(randSeed())); saveIdx(); cloudInit();
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
    w.played = Date.now(); w.diff = S.diff; w.tier = S.tier; w.wpn = S.wpn; w.trail = S.qi; w.ch = curCh(); w.sleeps = S.st.sleeps; w.goals = Object.keys(S.ms).length; w.depth = S.st.maxDepth; wIdx.last = curId; saveIdx();
  }
  function switchWorld(id) {
    if (MP.on || MP.ws) mpLeave();
    if (id !== curId) { bossGone(); save(); curId = id; start(readWorld(id) || fresh(randSeed())); touchIdx(); toast("Loaded " + (curEntry() ? curEntry().name : "world") + ".", "#4ee6b4"); }
    closeWorlds(); if (titleOpen) closeTitle();
  }
  var newDiff = 1;
  function createWorld(name) {
    if (wIdx.list.length >= MAXW) { toast("You can keep " + MAXW + " worlds. Delete one first.", "#f2c14e"); return; }
    if (MP.on || MP.ws) mpLeave();
    bossGone(); save(); var z = S.zoom, an = S.animal; addWorld(String(name || "").trim().slice(0, 24));
    start(Object.assign(fresh(randSeed()), { zoom: z, animal: an, diff: newDiff })); save(); closeWorlds(); if (titleOpen) closeTitle(); toast("A fresh world: " + curEntry().name + " (" + DIFF[newDiff].n + "). Happy digging!", "#4ee6b4");
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
    var h = '<div class="sbx-wbox"><h2>Your Worlds</h2><p class="sbx-note">Each world saves on its own in this browser' + (WUSER !== "guest" ? " for " + esc(WUSER) : "") + ". Switch any time, or start a new one.</p>" + cloudSection() + "<div class=\"sbx-wlist\">";
    list.forEach(function (w) {
      var cur = w.id === curId, sub = (w.diff === 0 ? "Easy \u00b7 " : w.diff === 2 ? "Hard \u00b7 " : "") + PICKS[w.tier || 0].n + (w.wpn ? " \u00b7 " + WEAPONS[w.wpn].n : "") + " \u00b7 " + (w.ch != null ? "Chapter " + Math.min(6, w.ch + 1) : (w.goals || 0) + " goals") + " \u00b7 " + ago(w.played);
      h += '<div class="sbx-w' + (cur ? " cur" : "") + '"><div><b>' + esc(w.name) + (cur ? " (playing)" : "") + "</b><small>" + esc(sub) + "</small>" + cloudBadge(w) + '</div><div class="acts">'
        + '<button type="button" class="btn' + (cur ? "" : " ghost") + '" data-fs-start data-wl-play="' + w.id + '">' + (cur ? "Resume" : "Play") + "</button>"
        + '<button type="button" class="btn ghost" data-wl-ren="' + w.id + '" aria-label="Rename ' + esc(w.name) + '">Rename</button>'
        + '<button type="button" class="btn ghost' + (delAsk === w.id ? " warn" : "") + '" data-wl-del="' + w.id + '">' + (delAsk === w.id ? "Tap again to delete" : "Delete") + "</button></div></div>";
    });
    h += '</div><div class="sbx-wnew"><input id="sbxWName" type="text" maxlength="24" placeholder="Name your new world" aria-label="New world name" autocomplete="off"><button type="button" class="btn" data-fs-start data-wl-new>New world</button></div>'
      + '<div class="sbx-row sbx-diff wl-diff" role="group" aria-label="Difficulty for the new world"><span>New world difficulty</span>' + DIFF.map(function (D, i) { return '<button type="button" class="btn' + (newDiff === i ? "" : " ghost") + '" data-wl-diff="' + i + '" aria-pressed="' + (newDiff === i) + '" style="--dc:' + D.c + '">' + D.n + "</button>"; }).join("") + "</div>"
      + (titleOpen ? '<div class="wl-foot"><button type="button" class="btn" data-wl-close>Back</button></div></div>' : '<div class="wl-foot"><button type="button" class="btn" data-wl-close>Back to game</button><button type="button" class="btn ghost" data-wl-mp>Play together</button><button type="button" class="btn ghost" data-wl-title>Main menu</button></div></div>');
    var keep = $("sbxWName") ? $("sbxWName").value : ""; wEl.innerHTML = h; if (keep && $("sbxWName")) $("sbxWName").value = keep;
  }
  function openWorlds() {
    if (!wIdx) return; save(); if (panelOpen) closePanel();
    menuOpen = true; delAsk = ""; keys.l = keys.r = keys.j = 0; tk.l = tk.r = tk.j = 0; aim.down = false; mine = null; renderWorlds(); wEl.hidden = false;
  }
  function closeWorlds() { menuOpen = false; wEl.hidden = true; delAsk = ""; hbDirty = true; }
  wEl.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (cloudClick(b)) return;
    var id = b.getAttribute("data-wl-play"); if (id) return switchWorld(id);
    if (b.hasAttribute("data-wl-close")) return closeWorlds();
    if (b.hasAttribute("data-wl-title")) { closeWorlds(); if (MP.on || MP.ws) mpLeave(); return openTitle(); }
    if (b.hasAttribute("data-wl-mp")) { closeWorlds(); return openMPV(); }
    if (b.hasAttribute("data-wl-diff")) { newDiff = clamp(+b.getAttribute("data-wl-diff") || 0, 0, 2); return renderWorlds(); }
    if (b.hasAttribute("data-wl-new")) { var inp = $("sbxWName"); createWorld(inp ? inp.value : ""); if (menuOpen) renderWorlds(); return; }
    var rn = b.getAttribute("data-wl-ren");
    if (rn) { var w = wIdx.list.filter(function (x) { return x.id === rn; })[0], nm = null; try { nm = window.prompt("Rename world", w.name); } catch (er) {} if (nm && nm.trim()) { w.name = nm.trim().slice(0, 24); w.cdirty = 1; w.cgen = (w.cgen || 0) + 1; saveIdx(); if (CLOUD.state === "on") CLOUD.t = performance.now() + 2000; } return renderWorlds(); }
    var dl = b.getAttribute("data-wl-del");
    if (dl) { if (delAsk !== dl) { delAsk = dl; return renderWorlds(); } delAsk = ""; deleteWorld(dl); return renderWorlds(); }
  });
  wEl.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "sbxWName") { createWorld(e.target.value); if (menuOpen) renderWorlds(); } });

  // ---------- CLOUD SAVES (when signed in to a SwampRealms account) ----------
  // Every world is also backed up to your account (worker.js, /api/delve): about 15 seconds after it changes, from the Worlds menu
  // ("Back up now"), and when you leave the page. On another device your cloud worlds show up in the Worlds menu, ready to download, and a
  // world you already have is quietly updated if the cloud copy is newer and you have not changed it here.
  // Each upload names the cloud version it was based on (crev). If another device saved the same world in between, nothing is overwritten:
  // the Worlds menu asks which copy to keep. World index entries keep: crev (cloud version), cdirty (changed since the last backup),
  // cgen (counts local saves), csync (time of the last backup), conflict (the newer cloud version, while you decide).
  var CLOUD = { state: WUSER === "guest" ? "guest" : "checking", list: [], t: 0, busy: false, err: "", last: 0, told: {}, delAsk: "" };
  function cloudCall(method, path, body, keep) {
    var o = { method: method, credentials: "same-origin", cache: "no-store", keepalive: !!keep };
    if (body) { o.headers = { "content-type": "application/json" }; o.body = JSON.stringify(body); }
    return fetch(path, o).then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }, function () { return { s: r.status, j: null }; }); }, function () { return { s: 0, j: null }; });
  }
  function saveHash(o) {   // a fingerprint of a save that ignores what changes just by standing around (clock, weather, position, health, hunger)
    var t = typeof o === "string" ? (function () { try { return JSON.parse(o); } catch (e) { return {}; } })() : o;
    var str = JSON.stringify(Object.assign({}, t, { p: 0, time: 0, hp: 0, food: 0, days: 0, wx: 0 })), h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36) + str.length.toString(36);
  }
  function wEntry(id) { return wIdx && wIdx.list.filter(function (x) { return x.id === id; })[0]; }
  function cloudInit() {
    if (CLOUD.state === "guest") return;
    cloudCall("GET", "/api/delve").then(function (r) {
      if (r.s === 401) { CLOUD.state = "signedout"; return; }
      if (r.s !== 200 || !r.j || !Array.isArray(r.j.worlds)) { CLOUD.state = "off"; return; }
      CLOUD.state = "on"; CLOUD.list = r.j.worlds; cloudReconcile(); if (menuOpen) renderWorlds();
    });
  }
  function cloudReconcile() {
    wIdx.list.forEach(function (e) {
      var cw = CLOUD.list.filter(function (q) { return q.wid === e.id; })[0];
      if (!cw) { if (!e.crev) e.cdirty = 1; return; }   // never backed up (or deleted from the cloud): back it up
      if (cw.rev > (e.crev || 0)) { if (!e.cdirty) cloudPull(e.id, true); else e.conflict = cw.rev; }
    });
    saveIdx(); CLOUD.t = performance.now() + 3000;
  }
  function cloudDirty() {   // called from save(): this world changed, back it up soon
    var e = curEntry(); if (!e || CLOUD.state === "checking") return;   // the save made while the page loads is not a change
    if (e.chash && saveHash(S) === e.chash) return;   // nothing that matters changed since the last backup
    e.cdirty = 1; e.cgen = (e.cgen || 0) + 1;
    if (CLOUD.state === "on" && !CLOUD.t) CLOUD.t = performance.now() + 15000;
  }
  function tickCloud() {
    if (CLOUD.state !== "on" || CLOUD.busy || !CLOUD.t || performance.now() < CLOUD.t) return;
    var next = wIdx.list.filter(function (e) { return e.cdirty && !e.conflict && !CLOUD.told["big" + e.id]; })[0];
    CLOUD.t = 0; if (next) cloudPush(next.id);
  }
  function cloudPush(id, keep) {
    var e = wEntry(id); if (!e || CLOUD.state !== "on") return Promise.resolve(false);
    if (id === curId) save();
    var data = null; try { data = localStorage.getItem(wkey(id)); } catch (er) {} if (!data) return Promise.resolve(false);
    if (keep && data.length > 60000) return Promise.resolve(false);   // a page that is closing can only send a small upload
    var gen = e.cgen || 0; CLOUD.busy = true;
    return cloudCall("PUT", "/api/delve/" + encodeURIComponent(id), { name: e.name, data: data, baseRev: e.crev || 0 }, keep).then(function (r) {
      CLOUD.busy = false;
      if (r.s === 200 && r.j) {
        e.crev = r.j.rev; e.csync = Date.now(); e.cdirty = (e.cgen || 0) !== gen ? 1 : 0; if (!e.cdirty) e.chash = saveHash(data); CLOUD.last = e.csync; CLOUD.err = "";
        var cw = CLOUD.list.filter(function (q) { return q.wid === id; })[0]; if (cw) { cw.rev = r.j.rev; cw.updated = r.j.updated; cw.name = e.name; cw.size = data.length; } else CLOUD.list.push({ wid: id, name: e.name, rev: r.j.rev, updated: r.j.updated, size: data.length });
        saveIdx(); if (wIdx.list.some(function (q) { return q.cdirty && !q.conflict; })) CLOUD.t = performance.now() + 4000;
        if (menuOpen) renderWorlds(); return true;
      }
      if (r.s === 409 && r.j && r.j.error === "conflict") {
        e.conflict = r.j.rev || 1; saveIdx();
        if (!CLOUD.told[id]) { CLOUD.told[id] = 1; toast("“" + e.name + "” was changed on another device. Open Worlds to choose which copy to keep.", "#f2c14e"); }
      } else if (r.s === 401) CLOUD.state = "signedout";
      else if (r.s === 413 || r.s === 409) { CLOUD.err = (r.j && r.j.error) || "The cloud could not take this world."; CLOUD.told["big" + id] = 1; }
      else { CLOUD.err = "Could not reach the cloud. Trying again soon."; CLOUD.t = performance.now() + 60000; }
      if (menuOpen) renderWorlds(); return false;
    });
  }
  function cloudPull(id, quiet) {
    CLOUD.busy = true;
    return cloudCall("GET", "/api/delve/" + encodeURIComponent(id)).then(function (r) {
      CLOUD.busy = false;
      if (r.s !== 200 || !r.j || typeof r.j.data !== "string") { CLOUD.err = "Could not download that world."; if (menuOpen) renderWorlds(); return false; }
      var ok = null; try { ok = clean(JSON.parse(r.j.data)); } catch (er) {} if (!ok) { CLOUD.err = "That cloud world could not be read."; if (menuOpen) renderWorlds(); return false; }
      var e = wEntry(id);
      if (!e) { if (wIdx.list.length >= MAXW) { CLOUD.err = "You can keep " + MAXW + " worlds on this device. Delete one first."; if (menuOpen) renderWorlds(); return false; } e = { id: id, name: r.j.name || "World", made: Date.now(), played: r.j.updated || Date.now() }; wIdx.list.push(e); }
      try { localStorage.setItem(wkey(id), r.j.data); } catch (er) { CLOUD.err = "Not enough browser storage to download it."; if (menuOpen) renderWorlds(); return false; }
      e.name = r.j.name || e.name; e.crev = r.j.rev; e.cdirty = 0; e.conflict = 0; e.chash = saveHash(ok); e.csync = Date.now(); e.tier = ok.tier; e.wpn = ok.wpn; e.trail = ok.qi; e.ch = MAIN[ok.qi] ? MAIN[ok.qi].ch : CHAPTERS.length - 1; saveIdx();
      if (id === curId) { start(ok); e.cdirty = 0; saveIdx(); toast(quiet ? "This world was updated from your cloud save." : "Loaded the cloud copy of " + e.name + ".", "#4ee6b4"); }
      else if (!quiet) toast("Downloaded " + e.name + ".", "#4ee6b4");
      if (menuOpen) renderWorlds(); return true;
    });
  }
  function cloudDelete(id) {
    cloudCall("DELETE", "/api/delve/" + encodeURIComponent(id)).then(function (r) {
      if (r.s === 200) { CLOUD.list = CLOUD.list.filter(function (q) { return q.wid !== id; }); var e = wEntry(id); if (e) { e.crev = 0; e.cdirty = 1; saveIdx(); } }
      if (menuOpen) renderWorlds();
    });
  }
  function cloudBadge(w) {
    if (CLOUD.state !== "on") return "";
    if (w.conflict) return '<div class="cl-cf"><span>This world was also changed on another device. Which copy should stay?</span><button type="button" class="btn ghost" data-cl-keep="' + w.id + '">Keep this device\'s</button><button type="button" class="btn ghost" data-cl-use="' + w.id + '">Use the cloud copy</button></div>';
    return '<em class="cl-b' + (w.cdirty ? " wait" : "") + '">' + (w.cdirty ? "Not backed up yet" : "Backed up " + ago(w.csync || Date.now())) + "</em>";
  }
  function cloudSection() {
    var h = '<div class="sbx-cloud">';
    if (CLOUD.state === "guest") return h + '<b>Cloud saves</b><span>Sign in (top right) to back up your worlds to your account and keep playing them on any device.</span></div>';
    if (CLOUD.state === "checking") return h + "<b>Cloud saves</b><span>Checking your account…</span></div>";
    if (CLOUD.state === "signedout") return h + "<b>Cloud saves</b><span>Your sign-in ran out. Sign in again to keep backing up your worlds.</span></div>";
    if (CLOUD.state === "off") return h + '<b>Cloud saves</b><span>Cloud saves are not available right now. Your worlds are still saved in this browser.</span><button type="button" class="btn ghost" data-cl-retry>Try again</button></div>';
    var only = CLOUD.list.filter(function (q) { return !wEntry(q.wid); }), dirty = wIdx.list.filter(function (q) { return q.cdirty && !q.conflict; }).length;
    var cfs = wIdx.list.filter(function (q) { return q.conflict; }).length;
    h += "<b>Cloud saves: on for " + esc(WUSER) + "</b><span>" + (cfs ? cfs + " world" + (cfs > 1 ? "s need" : " needs") + " you to pick which copy to keep (below). " : "") + (dirty ? dirty + " world" + (dirty > 1 ? "s" : "") + " waiting to back up." : "All worlds backed up" + (CLOUD.last ? " · last " + ago(CLOUD.last) : "") + ".") + "</span>"
      + (CLOUD.err ? '<span class="cl-err">' + esc(CLOUD.err) + "</span>" : "")
      + '<button type="button" class="btn ghost" data-cl-now' + (CLOUD.busy ? " disabled" : "") + ">Back up now</button>";
    if (only.length) h += '<div class="cl-only"><small>In your cloud, not on this device</small>' + only.map(function (q) {
      return '<div class="sbx-w"><div><b>' + esc(q.name) + "</b><small>Saved " + ago(q.updated) + " · " + Math.max(1, Math.round(q.size / 1024)) + ' KB</small></div><div class="acts"><button type="button" class="btn" data-cl-get="' + q.wid + '">Download</button><button type="button" class="btn ghost' + (CLOUD.delAsk === q.wid ? " warn" : "") + '" data-cl-del="' + q.wid + '">' + (CLOUD.delAsk === q.wid ? "Tap again to delete" : "Delete") + "</button></div></div>";
    }).join("") + "</div>";
    return h + "</div>";
  }
  function cloudClick(b) {
    if (b.hasAttribute("data-cl-now")) { wIdx.list.forEach(function (e) { if (!e.conflict && (e.cdirty || !e.crev)) e.cdirty = 1; }); CLOUD.err = ""; CLOUD.told = {}; var first = wIdx.list.filter(function (e) { return e.cdirty && !e.conflict; })[0]; if (first) cloudPush(first.id); else { CLOUD.last = Date.now(); renderWorlds(); } return true; }
    if (b.hasAttribute("data-cl-retry")) { CLOUD.state = "checking"; renderWorlds(); cloudInit(); return true; }
    var k = b.getAttribute("data-cl-keep"); if (k) { var e = wEntry(k); e.crev = e.conflict; e.conflict = 0; e.cdirty = 1; CLOUD.told[k] = 0; cloudPush(k); return true; }
    var u = b.getAttribute("data-cl-use"); if (u) { cloudPull(u); return true; }
    var gt = b.getAttribute("data-cl-get"); if (gt) { cloudPull(gt); return true; }
    var dl = b.getAttribute("data-cl-del"); if (dl) { if (CLOUD.delAsk !== dl) { CLOUD.delAsk = dl; renderWorlds(); return true; } CLOUD.delAsk = ""; cloudDelete(dl); return true; }
    return false;
  }
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
    mpTileEdit(x, y, id); var i = y * W + x; tiles[i] = id;
    if (S.stain && S.stain[i] !== undefined && !STAINABLE[id]) delete S.stain[i];   // broken or replaced: the stain goes with it (an opening door keeps its stain)
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
  // A grid of INV_N slots like Minecraft: slots 0..8 are the 9-slot hotbar, 9..29 are the bag. Tools are items too (t_pick, t_weapon ... see TOOL ITEMS), one per slot. Each slot is null or { k: item, n: count }, at most stackMax(k) per slot.
  // S.inv ({item: total}) is what crafting, building and repairs read and change. reslot() copies any change in S.inv back into the slots, so those places did not need to change.
  function emptySlots(b) { var a = [], n = invSize(b === undefined ? (S && S.bag) : b); for (var i = 0; i < n; i++) a.push(null); return a; }
  function stackMax(k) { return ITEMS[k] && ITEMS[k].tool ? 1 : SMALL[k] ? STACK_SMALL : STACK; }
  // ---------- TOOL ITEMS ----------
  // Your tools sit in inventory slots like any item (one per slot), so the 9-slot hotbar is yours to arrange. They stay tied to your progress:
  // a tool item exists while you own that tool (S.tier, S.wpn, S.shovel, S.can, S.rod), its name follows your best version, and it can't be
  // thrown away or put in a chest. Picking a tool slot selects that tool (sel = "pick", "weapon" ...); an empty slot means bare paws.
  var TOOLKEY = { pick: "t_pick", weapon: "t_weapon", shovel: "t_shovel", can: "t_can", rod: "t_rod", hoe: "t_hoe", bucket: "t_bucket", net: "t_net", bow: "t_bow" };
  Object.keys(TOOLKEY).forEach(function (t) { ITEMS[TOOLKEY[t]] = { n: t, tool: t }; ORDER.unshift(TOOLKEY[t]); });
  function toolOwned(t) { return t === "pick" ? S.tier >= 1 : t === "weapon" ? S.wpn >= 1 : t === "shovel" ? !!S.shovel : t === "can" ? !!S.can : t === "rod" ? S.rod >= 1 : t === "hoe" ? S.hoe >= 1 : t === "bucket" ? S.bucket >= 1 : t === "net" ? S.net >= 1 : t === "bow" ? S.bow >= 1 : false; }
  function syncTools() {
    Object.keys(TOOLKEY).forEach(function (t) {
      var k = TOOLKEY[t], own = toolOwned(t);
      if (own && !(S.inv[k] > 0) && !(S.extra[k] > 0)) S.inv[k] = 1;
      if (!own) { delete S.inv[k]; delete S.extra[k]; }
      if (S.inv[k] > 1) S.inv[k] = 1;
    });
    ITEMS.t_pick.n = PICKS[S.tier] ? PICKS[S.tier].n : "Pickaxe"; ITEMS.t_weapon.n = WEAPONS[S.wpn] ? WEAPONS[S.wpn].n : "Weapon"; ITEMS.t_shovel.n = SHOVEL.n; ITEMS.t_can.n = CAN.n; ITEMS.t_rod.n = S.rod >= 2 ? "Ember Rod" : "Reed Fishing Rod";
    if (ITEMS.t_hoe) ITEMS.t_hoe.n = typeof HOES !== "undefined" && HOES[S.hoe] ? HOES[S.hoe].n : "Hoe";
    ITEMS.t_bucket.n = (typeof BUCKETS !== "undefined" && BUCKETS[S.bucket] ? BUCKETS[S.bucket].n : "Bucket") + (S.bkt ? " of " + (S.bkt === "water" ? "Water" : "Lava") : ""); ITEMS.t_net.n = "Bug Net"; if (ITEMS.t_bow) ITEMS.t_bow.n = typeof BOWS !== "undefined" && BOWS[S.bow] ? BOWS[S.bow].n : "Bow";
  }
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
    if (!S || !S.slots) return; if (S.inv.emberwings > 0 && typeof claimWings === "function") claimWings(); syncTools(); var t = totals(S.slots), k, d, lost = 0;
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
  function invAfter() { if (!TOOLKEY[sel] && !(S.inv[sel] > 0)) { sel = "pick"; selSlot = -1; } renderPanel(); }
  // ---------- DURABILITY ----------
  function durMax(k) { return k === "pick" ? DUR.pick[S.tier] || 0 : k === "shovel" ? (S.shovel ? DUR.shovel : 0) : k === "arm" ? DUR.arm[S.arm] || 0 : DUR.wpn[S.wpn] || 0; }
  function durOf(k) { var v = S.dur[k], m = durMax(k); return v == null ? m : Math.min(v, m); }
  var toolName = function (k) { return k === "pick" ? PICKS[S.tier].n : k === "shovel" ? SHOVEL.n : k === "arm" ? ARMORS[S.arm].n : WEAPONS[S.wpn].n; };
  var toolBroken = function (k) { return durMax(k) > 0 && durOf(k) <= 0; };
  function effTier() { return !bare && S.tier > 0 && durOf("pick") > 0 ? S.tier : 0; }   // a broken pick digs like bare paws
  function wear(k, n) {
    if (k === "pick" && gem("pick", "sapphire") && Math.random() < 0.35) return;   // a Sapphire in the pick: it wears out slower
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
    for (var c in cost) if (haveIt(c) < cost[c]) { toast("Not enough " + ITEMS[c].n + ".", "#f2c14e"); return; }
    payCost(cost); reslot();
    S.dur[k] = m; hbDirty = true; armKey = ""; toast(toolName(k) + " repaired.", "#4ee6b4"); snd("coin"); chips(p.x, p.y - 1, "#4ee6b4", 12, 6); renderPanel(); save();
  }
  function barEntries() {   // the 9 hotbar slots (tool items show as their tool: "pick", "weapon" ...)
    reslot(); var e = [];
    for (var i = 0; i < INV_HOT; i++) { var c = S.slots[i]; e.push({ id: c ? (ITEMS[c.k] && ITEMS[c.k].tool) || c.k : "", slot: i }); }
    return e;
  }
  function hot() { var o = []; for (var i = 0; i < INV_HOT; i++) if (S.slots[i] && o.indexOf(S.slots[i].k) < 0) o.push(S.slots[i].k); return o; }
  function hotIndex(k) { for (var i = 0; i < INV_HOT; i++) if (S.slots[i] && S.slots[i].k === k) return i; return -1; }
  // Any item can be held; materials that do nothing on their own dig with bare paws.
  var bare = false;   // holding nothing (an empty hotbar slot): you dig and pick with bare paws even if you own a pick
  function choose(id, slot) {
    bare = false;
    if (id === "hand") { sel = "pick"; bare = true; selSlot = slot != null ? slot : -1; }
    else if (TOOLKEY[id]) { if (toolOwned(id)) { sel = id; selSlot = slot != null && slot >= 0 ? slot : hotIndex(TOOLKEY[id]); } else if (id === "pick") { sel = "pick"; bare = true; selSlot = -1; } mine = null; hbDirty = true; return; }
    else if (id === "weapon") { if (S.wpn) { sel = "weapon"; selSlot = -1; } }
    else if (id === "shovel") { if (S.shovel) { sel = "shovel"; selSlot = -1; } }
    else if (id === "can") { if (S.can) { sel = "can"; selSlot = -1; } }
    else if (id === "rod") { if (S.rod) { sel = "rod"; selSlot = -1; } }
    else if ((S.inv[id] || 0) > 0 && ITEMS[id] && ITEMS[id].tool) { return choose(ITEMS[id].tool, slot); }
    else if ((S.inv[id] || 0) > 0 && ITEMS[id]) { sel = id; selSlot = slot != null && slot >= 0 ? slot : hotIndex(id); }
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
  // ----- fishing and ranching sprites (generated, 16x16) -----
  SPR = Object.assign(SPR, {
    "bogminnow": { r: ["................", "................", "................", "........f.......", ".......fff......", ".f...aaaaaaa....", ".ff.aaaaaaaaa...", ".ffaaaaaaaaaea..", ".ffaaaaaaaaaaa..", ".ffaabbbbbbbbf..", ".ff.abbbbbbbb...", ".f...aaaaaaa....", "................", "................", "................", "................"], p: {"a": "#8aa86a", "b": "#d8e0a8", "f": "#5a7a4a", "e": "#12220f"}, o: "#1a2410" },
    "catfish": { r: ["................", "................", "................", "........f.......", ".......fff......", ".f...aaaaaaa....", ".ff.aaaaasaaa...", ".ffaaasaaaaaea..", ".ffaaaaaaasaaa..", ".ffaabbbbbbbbf..", ".ff.abbbbbbbb...", ".f...aaaaaaa....", "................", "................", "................", "................"], p: {"a": "#7a6248", "b": "#c8b48a", "f": "#4a3a28", "e": "#12220f", "s": "#3a2a18"}, o: "#1a120a" },
    "glowfin": { r: ["................", "................", "................", "........f.......", ".......fff......", ".f...aaaaaaa....", ".ff.aaaaaaaaa...", ".ffaaaaaaaaaea..", ".ffaaaaaaaaaaa..", ".ffaabbbbbbbbf..", ".ff.abbbbbbbb...", ".f...aaaaaaa....", "................", "................", "................", "................"], p: {"a": "#4ee6b4", "b": "#d4fff6", "f": "#22a883", "e": "#06231c"}, o: "#063a2c" },
    "frosttrout": { r: ["................", "................", "................", "........f.......", ".......fff......", ".f...aaaaaaa....", ".ff.aaaasaaaa...", ".ffaaasaaasaea..", ".ffaaaasaaaaaa..", ".ffaabbbbbbbbf..", ".ff.abbbbbbbb...", ".f...aaaaaaa....", "................", "................", "................", "................"], p: {"a": "#9fc8e0", "b": "#f0f8ff", "f": "#5a8aa8", "e": "#0e1a28", "s": "#ff9aa8"}, o: "#16283a" },
    "icepike": { r: ["................", "................", "................", "................", "................", "................", "...f.........a..", ".afaaaaaaaaaaae.", ".faaaaaaaaaaaaaa", ".afbababababaaa.", "...f.........a..", "................", "................", "................", "................", "................"], p: {"a": "#6a9ac0", "b": "#d0e8f8", "f": "#3a6a90", "e": "#0e1a28"}, o: "#10203a" },
    "crystalcarp": { r: ["................", "................", "................", "........f.......", ".......fff......", ".f...aaaaaaa....", ".ff.aaaaaaaaa...", ".ffaaasaasaaea..", ".ffaaaaaaaaaaa..", ".ffaabbbsbbbbf..", ".ff.abbbbbbbb...", ".f...aaaaaaa....", "................", "................", "................", "................"], p: {"a": "#bff4ff", "b": "#ffffff", "f": "#7fd6ff", "e": "#2a5a9a", "s": "#ffffff"}, o: "#2a4a6a" },
    "magmaeel": { r: ["................", "................", "................", "................", "................", "................", "...f.........a..", ".afaaaaaaaaaaae.", ".faaaaaaaaaaaaaa", ".afbababababaaa.", "...f.........a..", "................", "................", "................", "................", "................"], p: {"a": "#c83a1a", "b": "#ffb13b", "f": "#7a1a0a", "e": "#ffe48a"}, o: "#2a0806" },
    "emberkoi": { r: ["................", "................", "................", "........f.......", ".......fff......", ".f...aaaaaaa....", ".ff.aasaaasaa...", ".ffaaaaaaaaaea..", ".ffaaaaaasaaaa..", ".ffaabbbbbbbbf..", ".ff.abbbbbbbb...", ".f...aaaaaaa....", "................", "................", "................", "................"], p: {"a": "#ff8a3d", "b": "#ffe0b0", "f": "#e8341c", "e": "#2a0806", "s": "#ffffff"}, o: "#3a1406" },
    "cinderfish": { r: ["................", "................", "................", "........f.......", ".......fff......", ".f...aaaaaaa....", ".ff.aaaaaaaaa...", ".ffaaasaasaaea..", ".ffaaaaaaaaaaa..", ".ffaabbbbbbbbf..", ".ff.abbbbbbbb...", ".f...aaaaaaa....", "................", "................", "................", "................"], p: {"a": "#3a3036", "b": "#ff8a3d", "f": "#ff5a1a", "e": "#ffe48a", "s": "#ffb13b"}, o: "#140a0a" },
    "oldboot": { r: ["................", "................", "....ddddddd.....", ".....abaaa......", ".....abaaa......", ".....abaaa......", ".....abaaa......", ".....abaaa......", ".....abaaa...g..", ".....abaaa..g...", ".....aaaaaaaaa..", ".....aaaawawaa..", ".....aaaaaaaaa..", ".....dddddddddd.", "................", "................"], p: {"a": "#6a4a32", "b": "#8a6a4a", "d": "#3a2416", "w": "#c8b48a", "g": "#3f9a3a"}, o: "#1a0e06" },
    "rod1": { r: ["................", ".............tt.", ".............sl.", "............s.l.", "...........t..l.", "..........s...l.", ".........s....l.", "........ts....l.", ".......ss.....l.", "......ss......l.", "....rtr......kk.", "....rwr.........", "....rrr.........", "...s............", "..s.............", "................"], p: {"s": "#a8703c", "t": "#e8dcc0", "r": "#6a6a74", "w": "#d0d0d8", "l": "#f6eedb", "k": "#c8c8d0"}, o: "#2a1a0a" },
    "rod2": { r: ["................", ".............tt.", ".............sl.", "............s.l.", "...........t..l.", "..........s...l.", ".........s....l.", "........ts....l.", ".......ss.....l.", "......ss......l.", "....rtr......kk.", "....rwr.........", "....rrr.........", "...s............", "..s.............", "................"], p: {"s": "#3a3036", "t": "#ff8a3d", "r": "#ff5a1a", "w": "#ffe48a", "l": "#ffd0a0", "k": "#ffb13b"}, o: "#140806" },
    "duckegg": { r: ["................", "................", "................", "................", "......aaaa......", ".....awaaaa.....", "....awwwaaaa....", "....awwwaaaa....", "....awwwaaaa....", "....aawaaaaa....", "....aaaaaaaa....", "....aaaaasaa....", "....aasaaaaa....", ".....aaaaaa.....", "......aaaa......", "................"], p: {"a": "#e8e0c8", "w": "#ffffff", "s": "#a8c0a0"}, o: "#5a5440" },
    "truffle": { r: ["................", "................", "................", "................", "................", "......aaaa......", "....aadaaaaa....", "....abbbaaaa....", "...aabbbaadaa...", "...adaaaaaaaa...", "...aaaaaaaaaa...", "....aaadadaa....", "....aaaaaaaa....", "......aaaa......", "................", "................"], p: {"a": "#5a3a2a", "b": "#8a6a4a", "d": "#2a1a10"}, o: "#160a06" },
    "goatmilk": { r: ["................", "......cccc......", "......aaaa......", "......aaaa......", ".....aaaaaa.....", ".....awaaaa.....", ".....awaaaa.....", ".....awaaaa.....", ".....bbbbbb.....", ".....bwbbbb.....", ".....bbbbbb.....", ".....aaaaaa.....", ".....aaaaaa.....", ".....aaaaaa.....", "................", "................"], p: {"a": "#f6f6f0", "b": "#7fb6e0", "c": "#c86a3a", "w": "#ffffff"}, o: "#5a5a60" },
    "grilledfish": { r: ["................", "................", "................", "................", "................", "................", ".a..............", "..a.aabbbaa.....", "...abcbbbbbe....", "..aaaabbcaaa....", ".apqaaaaaaaqqp..", ".pqqqqqqqqqqqqp.", ".ppqqqqqqqqqqpp.", "..pppppppppppp..", "....pppppppp....", "................"], p: {"p": "#e8e4d8", "q": "#c8c2b0", "a": "#b8763e", "b": "#e0a868", "c": "#5a2a10", "e": "#12220f"}, o: "#2a1a0e" },
    "catstew": { r: ["................", "................", "................", "................", "................", "................", "......ffff......", "...fffhffffff...", ".ffhxhhhhhfxfff.", ".rffffzffyffffr.", ".fkkffffffffkkf.", "...kkkkkkkkkk...", "....kkkkkkkk....", ".....kkkkkk.....", "......kkkk......", ".....kkkkkk....."], p: {"k": "#8a5a32", "r": "#c98c4f", "f": "#9a7a4a", "h": "#c8a870", "x": "#c8b48a", "y": "#ff8a2a", "z": "#e0b070"}, o: "#2a1a0a" },
    "chowder": { r: ["................", "................", "................", "................", "................", "................", "......ffff......", "...fffhffffff...", ".ffhxhhhhhfxfff.", ".rffffyffyffffr.", ".fkkffffffffkkf.", "...kkkkkkkkkk...", "....kkkkkkkk....", ".....kkkkkk.....", "......kkkk......", ".....kkkkkk....."], p: {"k": "#5a7a9a", "r": "#8ab0d0", "f": "#f0eadc", "h": "#ffffff", "x": "#ff9aa8", "y": "#c9934e"}, o: "#1a2a3a" },
    "spicyeel": { r: ["................", "................", "................", "................", "............h...", "...........gg...", "...........gg...", "..aa..aa..agg...", ".aabababababa...", "..aaaaaaaaaaaa..", "..pqaaqqaaqqap..", ".pqqqqqqqqqqqqp.", ".ppqqqqqqqqqqpp.", "..pppppppppppp..", "....pppppppp....", "................"], p: {"p": "#e8e4d8", "q": "#c8c2b0", "a": "#a83a1a", "b": "#ffb13b", "g": "#e8341c", "h": "#3f9a3a"}, o: "#2a0806" },
    "omelette": { r: ["................", "................", "................", "................", "................", "................", ".....aaaaaa.....", "...aaayyryaaa...", "...aagyyyyyaa...", "...aaayyyygaa...", "..paaaaaaaaaap..", ".pqqqaaaaaaqqqp.", ".ppqqqqqqqqqqpp.", "..pppppppppppp..", "....pppppppp....", "................"], p: {"p": "#e8e4d8", "q": "#c8c2b0", "a": "#ffe08a", "y": "#fff2b0", "g": "#3f9a3a", "r": "#e8341c"}, o: "#3a2a0a" },
    "truffleroast": { r: ["................", "................", "................", "................", "................", "................", "......m.........", "....mmmmm.bt....", ".wwmmmmmmbbbtt..", "...mmmmmmtbttt..", "..pqmmmmmttdtt..", ".pqqqqmqqqqtqqp.", ".ppqqqqqqqqqqpp.", "..pppppppppppp..", "....pppppppp....", "................"], p: {"p": "#e8e4d8", "q": "#c8c2b0", "m": "#9a5228", "w": "#f6eedb", "t": "#5a3a2a", "b": "#8a6a4a", "d": "#2a1a10"}, o: "#2a1206" },
    "milkshake": { r: ["................", "..........s.....", ".........ss.....", "....cccccscc....", ".....cccssc.....", ".....cwwswc.....", ".....cwwwwc.....", ".....cabaac.....", ".....caaaac.....", ".....caaabc.....", ".....caaaac.....", ".....cabaac.....", ".....caaaac.....", ".....cccccc.....", ".....cccccc.....", "................"], p: {"c": "#bfe8ff", "a": "#c8a8ff", "w": "#ffffff", "b": "#4a6cff", "s": "#ff6b82"}, o: "#2a3a5a" },
    "fishchips": { r: ["................", "................", "................", "................", "................", "................", "...........c....", ".a.aaaaa.c.c....", "..aaaaaa.c.c....", "...aaaaapcpc....", "..paaaaaqccccp..", ".pqqqqqqqccqcqp.", ".ppqqqqqqqcqcpp.", "..pppppppppppp..", "....pppppppp....", "................"], p: {"p": "#e8e4d8", "q": "#c8c2b0", "a": "#e0a040", "c": "#ffd23f"}, o: "#3a2408" }
  });
  SPR = Object.assign(SPR, {   // Croaker Token
    "swamptoken": { r: ["................", ".....oooooo.....", "...ooyyyyyyoo...", "..oyyYYYYYYyyo..", "..oyYYggYggYyo..", ".oyYYgwgYgwgYyo.", ".oyYYgggYgggYyo.", ".oyYgggggggggyo.", ".oyYgkgggggkgyo.", ".oyYYgkkkkkgYyo.", ".oyYYYgggggYYyo.", "..oyYYYYYYYYyo..", "..oyyYYYYYYyyo..", "...ooyyyyyyoo...", ".....oooooo.....", "................"], p: { "o": "#8a5a10", "y": "#f2c14e", "Y": "#ffe08a", "g": "#3fae5e", "w": "#ffffff", "k": "#12220f" }, o: "#5a3a08" }
  });
  SPR = Object.assign(SPR, {   // boss summons and boss materials
    "lure_queen": { r: ["................", "......gg........", ".....gppg.......", "....gpPPpg......", "....gpPPpg..t...", "...gppppppg.t...", "...gpprrppgt....", "...gppprppg.....", "....gppppg......", "....tgggg.......", "...t..ff........", "..t...ff........", "......ff........", "......ff........", ".....ffff.......", "................"], p: {"g": "#2f5a2a", "p": "#8a3aa0", "P": "#c06aff", "r": "#ff6b82", "t": "#3f7a2a", "f": "#c9b58a"}, o: "#16300f" },
    "idol_wyrm": { r: ["................", ".....hh..hh.....", "....h.hhhh.h....", "......bbbb......", ".....bbbbbb.....", ".....beebeb.....", ".....bbbbbb.....", "......bjjb......", ".....bbbbbb.....", "....bbrbbrbb....", "....bbbbbbbb....", ".....bbrrbb.....", "....ssssssss....", "...ssssssssss...", "...SSSSSSSSSS...", "................"], p: {"h": "#2a1008", "b": "#4a2418", "e": "#ffd23f", "j": "#ff6a1f", "r": "#ff8a3d", "s": "#6b6f74", "S": "#4a4e52"}, o: "#1a0804" },
    "horn_alpha": { r: ["................", "................", "..............w.", ".............ww.", "............wcw.", "..........wwcw..", "........wwwcw...", "......wwwccw....", "....wwwcccw.....", "...wwccccw......", "..bwcccww.......", "..bbwww.........", "..bb............", "...b............", "................", "................"], p: {"w": "#e8f2f8", "c": "#9fe8ff", "b": "#6b4a26"}, o: "#3a5a6e" },
    "queenchitin": { r: ["................", "................", ".....pppp.......", "...ppPPPPpp.....", "..pPPPpPPPPp....", "..pPPppPPPPPp...", ".pPPpppPPPPPp...", ".pPppppppPPPp...", ".ppppprpppPPp...", ".pppprrrppppp...", "..ppppprppppp...", "..ppppppppppp...", "...ppppppppp....", ".....ppppp......", "................", "................"], p: {"p": "#5a2468", "P": "#9a52a8", "r": "#ff6b82"}, o: "#2a0c34" },
    "wyrmscale": { r: ["................", "................", "......oooo......", "....oorrrroo....", "...orryyyyrro...", "...oryyyyyyro...", "..orryyyyyyrro..", "..orryyyyyyrro..", "..oorryyyyrroo..", "...oorryyrroo...", "....oorrrroo....", ".....oorroo.....", "......oooo......", ".......oo.......", "................", "................"], p: {"o": "#4a2418", "r": "#ff6a1f", "y": "#ffd23f"}, o: "#1a0804" },
    "alphamane": { r: ["................", "......c.........", ".....cwc..c.....", "....cwwwccwc....", "...cwwwwwwwwc...", "..cwwwwbwwwwwc..", "..cwwwbbbwwwwc..", ".cwwwwbwwwwwwwc.", ".cwwwwwwwwbwwwc.", "..cwwwwwwbbbwc..", "..cwwwwwwwbwwc..", "...cwwwwwwwwc...", "....ccwwwwcc....", "......cccc......", "................", "................"], p: {"c": "#9fe8ff", "w": "#e8f2f8", "b": "#b8ccda"}, o: "#3a7aa8" }
  });
  SPR = Object.assign(SPR, {   // hoes
    "hoe1": { r: ["................", "........bbbbbb..", "........bwmmmb..", "........bmmmmb..", ".........bbbbb..", "...........hd...", "..........hd....", ".........hd.....", "........hd......", ".......hd.......", "......hd........", ".....hd.........", "....hd..........", "...hd...........", "..hd............", "................"], p: {"b": "#4a4e52", "m": "#8e969b", "w": "#cfd6dd", "h": "#b88a52", "d": "#6b4a26"}, o: "#2a1c0e" },
    "hoe2": { r: ["................", "........bbbbbb..", "........bwmmmb..", "........bmmgmb..", ".........bbbbb..", "...........hd...", "..........hd....", ".........hd.....", "........hd......", ".......hd.......", "......hd........", ".....hd.........", "....hd..........", "...hd...........", "..hd............", "................"], p: {"b": "#0f5a46", "m": "#2fb59a", "w": "#bff4e4", "g": "#4ee6b4", "h": "#8a6a4a", "d": "#4a3220"}, o: "#0b1a14" },
    "hoe3": { r: ["................", ".......bbbbbbb..", ".......bwwmmmb..", ".......bmmmmmb..", "........bbbbbb..", "...........hd...", "..........hd....", ".........hd.....", "........hd......", ".......hd.......", "......hd........", ".....hd.........", "....hd..........", "...hd...........", "..hd............", "................"], p: {"b": "#5a6470", "m": "#b8c4cc", "w": "#f2f6fa", "h": "#6b4a26", "d": "#3a2416"}, o: "#1a1410" }
  });
  SPR = Object.assign(SPR, {   // bucket, bug net, bait
    "bkt_w": { r: ["................", "....hhhhhhhh....", "...h........h...", "..h..........h..", "..rrrrrrrrrrrr..", "..rccccccccccrr.", "..rccccccccccr..", "..wwwwwwwwwwww..", "..rccccccccccr..", "...rccccccccr...", "...rccccccccr...", "...wwwwwwwwww...", "...rccccccccr...", "....rrrrrrrr....", "................", "................"], p: {"h": "#6b4a26", "r": "#7a5230", "w": "#4a3220", "c": "#3a2a1a"}, o: "#1a1410" },
    "bkt_ww": { r: ["................", "....hhhhhhhh....", "...h........h...", "..h..........h..", "..rrrrrrrrrrrr..", "..rccccccccccrr.", "..rccccccccccr..", "..wwwwwwwwwwww..", "..rccccccccccr..", "...rccccccccr...", "...rccccccccr...", "...wwwwwwwwww...", "...rccccccccr...", "....rrrrrrrr....", "................", "................"], p: {"h": "#6b4a26", "r": "#7a5230", "w": "#4a3220", "c": "#4ab8d8"}, o: "#1a1410" },
    "bkt_i": { r: ["................", "....hhhhhhhh....", "...h........h...", "..h..........h..", "..rrrrrrrrrrrr..", "..rccccccccccrr.", "..rccccccccccr..", "..wwwwwwwwwwww..", "..rccccccccccr..", "...rccccccccr...", "...rccccccccr...", "...wwwwwwwwww...", "...rccccccccr...", "....rrrrrrrr....", "................", "................"], p: {"h": "#5a5a5a", "r": "#6b7276", "w": "#3a4046", "c": "#2a2e32"}, o: "#1a1410" },
    "bkt_iw": { r: ["................", "....hhhhhhhh....", "...h........h...", "..h..........h..", "..rrrrrrrrrrrr..", "..rccccccccccrr.", "..rccccccccccr..", "..wwwwwwwwwwww..", "..rccccccccccr..", "...rccccccccr...", "...rccccccccr...", "...wwwwwwwwww...", "...rccccccccr...", "....rrrrrrrr....", "................", "................"], p: {"h": "#5a5a5a", "r": "#6b7276", "w": "#3a4046", "c": "#4ab8d8"}, o: "#1a1410" },
    "bkt_il": { r: ["................", "....hhhhhhhh....", "...h........h...", "..h..........h..", "..rrrrrrrrrrrr..", "..rccccccccccrr.", "..rccccccccccr..", "..wwwwwwwwwwww..", "..rccccccccccr..", "...rccccccccr...", "...rccccccccr...", "...wwwwwwwwww...", "...rccccccccr...", "....rrrrrrrr....", "................", "................"], p: {"h": "#5a5a5a", "r": "#6b7276", "w": "#3a4046", "c": "#ff8a3d"}, o: "#1a1410" },
    "net": { r: ["............mmm.", "...........m...m", "..........m.n.n.", ".........m.n.n.m", ".........mn.n.nm", ".........m.n.n.m", "..........mn.nm.", "...........mmm..", "..........hd....", ".........hd.....", "........hd......", ".......hd.......", "......hd........", ".....hd.........", "....hd..........", "................"], p: {"m": "#c9b58a", "n": "#e8e0c8", "h": "#b88a52", "d": "#6b4a26"}, o: "#2a1c0e" },
    "earthworm": { r: ["................", "................", "................", "................", ".........pp.....", "........pqqp....", ".......pq..qp...", "......pq....p...", ".....pq.........", "....pq..........", "...pqq..........", "...pp...........", "................", "................", "................", "................"], p: {"p": "#c0607a", "q": "#e898a8"}, o: "#4a1a24" },
    "firefly": { r: ["................", "................", "......w..w......", ".......ww.......", "......wbbw......", ".....w.bb.w.....", "........y.......", "......yyyy......", ".....yyggyy.....", "......yggy......", ".......gg.......", "................", "................", "................", "................", "................"], p: {"w": "#e8f4ff", "b": "#3a3020", "y": "#dcff78", "g": "#9aff3a"}, o: "#2a3a10" }
  });
  SPR = Object.assign(SPR, {   // Homeward Shell
    "homeshell": { r: ["................", "................", ".......ooo......", ".....oolllo.....", "....olpppllo....", "...olpllpplo....", "...olplpplo.....", "...olpplplo.....", "...ollpplo......", "....olllo.......", "....oooo.ww.....", "........w..w....", ".........ww.....", "................", "................", "................"], p: {"o": "#8a5a6a", "l": "#f2c8d0", "p": "#e0a0b8", "w": "#bff4e4"}, o: "#3a1a24" }
  });
  SPR = Object.assign(SPR, {   // tier-5 Swampking gear
    "arm5": { r: [".d............d.", "..daa......aad..", ".abbaa.dd.aabba.", ".abaaaa..aaaaba.", ".aaaaaaaaaaaaaa.", "..aabbaaaabbaa..", "..aadbbbbbbdaa..", "..aabbbmmbbbaa..", "...abbgwwgbba...", "...abbbggbbba...", "...aabbbbbbaa...", "....aaaaaaaa....", "....ddddddddd...", "................", "................", "................"], p: {"a": "#5a2a7a", "b": "#c06aff", "d": "#ffd23f", "w": "#fff4c0", "g": "#ff8a3d", "m": "#9fe8ff"}, o: "#2a1438" },
    "wpn5": { r: [".............wwb", ".............baw", "............bwac", "...........bwac.", "..........bwacc.", "..x.g....bwaac..", "...x.g..bwac.c..", "......ggbac.....", ".......ggc......", "......hdg.g.....", ".....hdh........", "....hdh.........", "...hdh..........", "...hh...........", "................", "................"], p: {"h": "#6b4a26", "d": "#3a2a1a", "a": "#c06aff", "b": "#f2e0ff", "c": "#5a2a7a", "g": "#ffd23f", "w": "#ffffff", "x": "#ff8a3d"}, o: "#2a1438" }
  });
  SPR = Object.assign(SPR, {   // tier-5 pick
    "pick5": { r: [".............e.e", "..............e.", "...bbbbb......e.", "..beeaaabbb.....", ".bbaae...aabb...", ".ba.......aaebb.", ".a.........aaab.", "...........aaac.", "..........hdaac.", ".e.......hdh.c..", "e.e.....hdh.....", ".e.....hdh......", "......heh.......", ".....hdh........", "....hdh.........", "...hdh.........."], p: {"h": "#6b4a26", "d": "#3a2a1a", "a": "#c06aff", "b": "#f2e0ff", "c": "#5a2a7a", "e": "#ffd23f"}, o: "#2a1438" }
  });
  SPR = Object.assign(SPR, {   // ranged weapons and ammo
    "bow1": { r: ["................", "...hh.....hh....", "..hddh...hddh...", "..hd.h...h.dh...", "...hhhhhhhhh....", "......hdh.......", "......hdh.......", "......hdh.......", "......hdh.......", ".......h........", "................", "................", "................", "................", "................", "................"], p: {"h": "#c9b58a", "d": "#8a6a3a"}, o: "#3a2a1a" },
    "bow2": { r: ["......hh........", ".......hd.......", "........hd......", "........h.d.....", ".........h.d....", ".........h..d...", ".........h..d...", ".........h..d...", ".........h..d...", ".........h..d...", ".........h.d....", "........h.d.....", "........hd......", ".......hd.......", "......hh........", "................"], p: {"h": "#a8814b", "d": "#e8e0c8"}, o: "#3a2a1a" },
    "bow3": { r: ["......rr........", ".......hd.......", "........hd......", "........h.d.....", ".........h.d....", ".........y..d...", ".........h..d...", ".........r..d...", ".........h..d...", ".........y..d...", ".........h.d....", "........h.d.....", "........hd......", ".......hd.......", "......rr........", "................"], p: {"h": "#5a4a52", "d": "#ffd25a", "r": "#ff6a1f", "y": "#ffd23f"}, o: "#1c1418" },
    "arrow": { r: ["................", "............ww..", "...........wsw..", "..........wsw...", ".........hsw....", "........hh......", ".......hh.......", "......hh........", ".....hh.........", "....hh..........", "..ffh...........", "..ff............", "..f.............", "................", "................", "................"], p: {"h": "#8a6a3a", "s": "#cfd6dc", "w": "#ffffff", "f": "#e8e0c8"}, o: "#2a1c0e" },
    "firearrow": { r: ["............yr..", "...........yry..", "..........yry...", ".........hyr....", "........hh......", ".......hh.......", "......hh........", ".....hh.........", "....hh..........", "...hh...........", "..ffh...........", "..ff............", "..f.............", "................", "................", "................"], p: {"h": "#8a6a3a", "y": "#ffd23f", "r": "#ff6a1f", "f": "#ff8a3d"}, o: "#3a1408" }
  });
  SPR = Object.assign(SPR, {   // wood stain tins and sandpaper
    "stain_walnut": {"r": ["................", "................", "................", "....oooooooo....", "...ommmmmmmmo...", "...oLLLLLLLLo...", "...oLwLLLLLLo...", "...oLLLLLLLLo...", "...oLLLLLLDDo...", "...oLLLLLLDDo...", "...oLLLLLLLLo...", "...ommmmmmmmo...", "....oooooooo....", "................", "................", "................"], "p": {"o": "#2a2a30", "m": "#9aa4ac", "L": "#5a3519", "w": "#ffffff66", "D": "#00000033"}, "o": "#16161a"},
    "stain_ebony": {"r": ["................", "................", "................", "....oooooooo....", "...ommmmmmmmo...", "...oLLLLLLLLo...", "...oLwLLLLLLo...", "...oLLLLLLLLo...", "...oLLLLLLDDo...", "...oLLLLLLDDo...", "...oLLLLLLLLo...", "...ommmmmmmmo...", "....oooooooo....", "................", "................", "................"], "p": {"o": "#2a2a30", "m": "#9aa4ac", "L": "#2a2422", "w": "#ffffff66", "D": "#00000033"}, "o": "#16161a"},
    "stain_honey": {"r": ["................", "................", "................", "....oooooooo....", "...ommmmmmmmo...", "...oLLLLLLLLo...", "...oLwLLLLLLo...", "...oLLLLLLLLo...", "...oLLLLLLDDo...", "...oLLLLLLDDo...", "...oLLLLLLLLo...", "...ommmmmmmmo...", "....oooooooo....", "................", "................", "................"], "p": {"o": "#2a2a30", "m": "#9aa4ac", "L": "#c8862e", "w": "#ffffff66", "D": "#00000033"}, "o": "#16161a"},
    "stain_mahogany": {"r": ["................", "................", "................", "....oooooooo....", "...ommmmmmmmo...", "...oLLLLLLLLo...", "...oLwLLLLLLo...", "...oLLLLLLLLo...", "...oLLLLLLDDo...", "...oLLLLLLDDo...", "...oLLLLLLLLo...", "...ommmmmmmmo...", "....oooooooo....", "................", "................", "................"], "p": {"o": "#2a2a30", "m": "#9aa4ac", "L": "#7a2418", "w": "#ffffff66", "D": "#00000033"}, "o": "#16161a"},
    "stain_white": {"r": ["................", "................", "................", "....oooooooo....", "...ommmmmmmmo...", "...oLLLLLLLLo...", "...oLwLLLLLLo...", "...oLLLLLLLLo...", "...oLLLLLLDDo...", "...oLLLLLLDDo...", "...oLLLLLLLLo...", "...ommmmmmmmo...", "....oooooooo....", "................", "................", "................"], "p": {"o": "#2a2a30", "m": "#9aa4ac", "L": "#e8e2d4", "w": "#ffffff66", "D": "#00000033"}, "o": "#16161a"},
    "stain_sage": {"r": ["................", "................", "................", "....oooooooo....", "...ommmmmmmmo...", "...oLLLLLLLLo...", "...oLwLLLLLLo...", "...oLLLLLLLLo...", "...oLLLLLLDDo...", "...oLLLLLLDDo...", "...oLLLLLLLLo...", "...ommmmmmmmo...", "....oooooooo....", "................", "................", "................"], "p": {"o": "#2a2a30", "m": "#9aa4ac", "L": "#5a7a4a", "w": "#ffffff66", "D": "#00000033"}, "o": "#16161a"},
    "stain_blue": {"r": ["................", "................", "................", "....oooooooo....", "...ommmmmmmmo...", "...oLLLLLLLLo...", "...oLwLLLLLLo...", "...oLLLLLLLLo...", "...oLLLLLLDDo...", "...oLLLLLLDDo...", "...oLLLLLLLLo...", "...ommmmmmmmo...", "....oooooooo....", "................", "................", "................"], "p": {"o": "#2a2a30", "m": "#9aa4ac", "L": "#3a5a74", "w": "#ffffff66", "D": "#00000033"}, "o": "#16161a"},
    "stain_plum": {"r": ["................", "................", "................", "....oooooooo....", "...ommmmmmmmo...", "...oLLLLLLLLo...", "...oLwLLLLLLo...", "...oLLLLLLLLo...", "...oLLLLLLDDo...", "...oLLLLLLDDo...", "...oLLLLLLLLo...", "...ommmmmmmmo...", "....oooooooo....", "................", "................", "................"], "p": {"o": "#2a2a30", "m": "#9aa4ac", "L": "#6a3a72", "w": "#ffffff66", "D": "#00000033"}, "o": "#16161a"},
    "sandpaper": {"r": ["................", "................", "................", "...oooooooooo...", "...oSSsSSSsSo...", "...oSsSSsSSSo...", "...oSSSsSSsSo...", "...osSSSSsSSo...", "...oSSsSSSSso...", "...oSSSSsSSSo...", "...oooooooooo...", "................", "................", "................", "................", "................"], "p": {"o": "#8a6a3a", "S": "#e8d8b0", "s": "#b8a47a"}, "o": "#3a2a1a"}
  });
  SPR = Object.assign(SPR, {   // Emberfly Wings
    "emberwings": {"r": ["................", "................", "..oo........oo..", ".oyyo......oyyo.", "oyywyo....oywyyo", "oyyyyyo..oyyyyyo", "oryyyyyooyyyyyro", ".orryyy.yyyyrro.", "..orrr.oo.rrro..", "...ooo.oo.ooo...", "......o..o......", "................", "................", "................", "................", "................"], "p": {"o": "#7a2a10", "y": "#ffb04a", "w": "#fff4c0", "r": "#ff6a1f"}, "o": "#3a1408"}
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
  function drawWeaponIcon(g, tier) { if (tier >= 1 && tier <= 5) drawSpr(g, "wpn" + tier); }
  function heldCan() { return sprCanvas("can"); }
  function icon(id) {
    if (ITEMS[id] && ITEMS[id].tool) return icon(ITEMS[id].tool);
    var key = id === "bow" ? "bow" + Math.max(1, S.bow) : id === "bucket" ? bucketKey() : id === "hoe" ? "hoe" + Math.max(1, S.hoe) : id === "rod" ? "rod" + Math.max(1, S.rod) : id === "pick" ? "pick" + S.tier : id === "weapon" ? "weapon" + S.wpn : id === "arm" ? "arm" + S.arm : id;   // "shovel" is its own key
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
    } else if (id === "bucket") {
      drawSpr(g, bucketKey());
    } else if (id === "bow") {
      drawSpr(g, "bow" + Math.max(1, S.bow));
    } else if (id === "hoe") {
      drawSpr(g, "hoe" + Math.max(1, S.hoe));
    } else if (id === "rod") {
      drawSpr(g, "rod" + Math.max(1, S.rod));
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
    else { var t = ITEMS[id].tile; if (MATF[t]) g.drawImage(matIcon(t), 2, 2); else g.drawImage(ATLAS, 0, t * 16, 16, 16, 2, 2, 28, 28); }
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
    if (!spriteKey || spriteKey.split("|")[1] !== String(S.arm)) mkSprite();   // new armor (crafted, or changed by a save load) shows straight away
    var sc = cave ? Math.max(1, Math.floor(ts * 1.3 / 24)) : Math.max(1, Math.round(ts * 1.7 / 24));   // whole pixels per art pixel, so the art stays crisp; indoors you are drawn smaller so furniture and rocks look the right size next to you
    if (!sprite || sprite.s !== sc) { try { sprite = DelveAv.sprite(spriteOutfit || { animal: S.animal }, S.animal, sc); } catch (e) { sprite = null; } }
    return sprite;
  }

  // ---------- SOUND (tiny synth, follows the site's sound switch) ----------
  var ac = null, gestured = false;   // browsers only allow sound after the first tap or key press
  ["pointerdown", "keydown", "touchstart"].forEach(function (ev) { window.addEventListener(ev, function () { gestured = true; }, { once: true, capture: true }); });
  function thud(f, vol) {
    try {
      if (typeof SFX !== "undefined" && SFX.on === false) return;
      if (!gestured && !ac) return;
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
  // Toasts queue up instead of overwriting each other: each one gets at least ~1.7 s on screen, repeats are dropped, and at most 3 wait.
  var toastQ = [], toastUntil = 0, toastCur = "";
  function toast(msg, color) {
    var now = performance.now();
    if (msg === toastCur && now < toastUntil + 400) return;
    if (toastQ.some(function (q) { return q[0] === msg; })) return;
    if (now < toastUntil) { toastQ.push([msg, color]); if (toastQ.length > 3) toastQ.shift(); return; }
    showToast(msg, color);
  }
  function showToast(msg, color) {
    var el = $("sbxToast"); toastCur = msg; el.textContent = msg; el.style.setProperty("--tc", color || "#4ee6b4"); el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
    toastUntil = performance.now() + (toastQ.length ? 1700 : 2300);
  }
  function pumpToasts() { if (toastQ.length && performance.now() >= toastUntil) { var q = toastQ.shift(); showToast(q[0], q[1]); } }
  var BSUB = ["Mud, mangroves and glowing spores", "Basalt, lava and Cinder Ore", "Frostrock and Frost Crystal"];
  function bcard(bi, b) {
    var el = $("sbxBCard"); el.style.setProperty("--bc", bi.c); el.querySelector("b").textContent = bi.n; el.querySelector("small").textContent = BSUB[b];
    el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
  }
  function nag(msg) { if (performance.now() - nagT < 1800) return; nagT = performance.now(); toast(msg, "#f2c14e"); }
  // Small pop-ups in the bottom-right corner. They queue: at most 2 show at once, one new one every ~0.9 s, and none while a window
  // (Journal, backpack, station...) is open, so they never cover what you are reading. A big pile collapses into "+N more".
  var popQ = [], popNext = 0;
  function popup(label, title, color, icon) { popQ.push([label, title, color, icon]); if (popQ.length > 6) { var extra = popQ.length - 4; popQ.splice(3, extra, ["More progress", "+" + extra + " more \u2014 see your Journal", "#f2c14e", "\u2605"]); } }
  function pumpPops() {
    var box = $("sbxPops"); if (!box || !popQ.length || panelOpen || menuOpen || performance.now() < popNext || box.children.length >= 2) return;
    var q = popQ.shift(), el = document.createElement("div"); el.className = "sbx-pop"; el.style.setProperty("--pc", q[2] || "#f2c14e");
    el.innerHTML = "<i aria-hidden=\"true\">" + (q[3] || "\u2713") + "</i><small>" + esc(q[0]) + "</small><b>" + esc(q[1]) + "</b>";
    box.appendChild(el); popNext = performance.now() + 900;
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 3100);
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
    if (id === T.REALMORE) { S.st.realm++; if (S.st.realm === 1) toast("Realmstone! It hums like it wants to be somewhere else.", "#8affe0"); }
    if (td.kind === "realmgate") brokeGate(x, y);
    if (td.kind === "fishtrap" && S.traps[x + "," + y]) { emptyTrap(x, y, true); delete S.traps[x + "," + y]; }
    if ((id === T.MUD || id === T.MOSS || id === T.X_peat) && Math.random() < 0.06 && ITEMS.earthworm) give("earthworm", 1, x, y - 0.4);   // bait for fishing
    if (td.kind === "door") {   // both halves go together and you get one Door back
      var db = td.door.top ? y + 1 : y; delete doorAuto[db * W + x];
      setT(x, db, T.AIR); if (db - 1 >= 0) setT(x, db - 1, T.AIR); S.st.mined++;
      chips(x + 0.5, db, "#b9793f", 10, 6); thud(170, 0.08); give("door", 1, x, y); return;
    }
    if (td.kind === "lootchest" && !S.chests[x + "," + y]) { var LL = x + "," + y === aerieKey() ? aerieLoot() : rollLoot("chest", world.bio[x], lootTier(y)); LL.forEach(function (q) { give(q[0], q[1], x, y - 0.4); }); treasureFound(LL.length); }   // broken before it was opened: the loot spills out
    if (td.kind === "lootpot") { S.st.pots++; rollLoot("pot", world.bio[x], lootTier(y)).forEach(function (q) { give(q[0], q[1], x, y - 0.4); }); chips(x + 0.5, y + 0.5, "#b87444", 12, 6); thud(420, 0.06); checkGoals(); }
    if (isChest(id)) delete S.chests[x + "," + y];
    if ((td.kind === "farmland" || td.kind === "farmwet") && cropAt(x, y - 1)) { var tc = cropAt(x, y - 1); setT(x, y - 1, T.AIR); harvestCrop(x, y - 1, tc); }   // the crop on top comes with it
    setT(x, y, T.AIR); S.st.mined++;
    if (td.crop) harvestCrop(x, y, td);
    var SDROP = {}; SDROP[T.REED] = ["seed_carrot", 0.18]; SDROP[T.GLOWCAP] = ["seed_potato", 0.15]; SDROP[T.BLOOM] = ["seed_pepper", 0.2]; SDROP[T.SPIKE] = ["seed_frost", 0.2];
    if (SDROP[id] && ITEMS[SDROP[id][0]] && Math.random() < SDROP[id][1]) give(SDROP[id][0], 1, x, y - 0.6);   // wild plants sometimes drop crop seeds
    chips(x + 0.5, y + 0.5, td.kind === "ore" ? td.c2 : td.c, td.kind === "ore" ? 14 : 9, 6);
    thud(td.hard > 2 ? 110 : 160, 0.08);
    if (td.drop) { var n = dropQty(td); give(td.drop, n, x, y); if (td.kind === "ore") { snd("coin"); if (gem("pick", "amethyst") && Math.random() < 0.15) { give(td.drop, 1, x, y); text(x + 0.5, y, "x2", "#e0a0ff"); } } }
    if (td.bonus) td.bonus.forEach(function (bq) { if (Math.random() < bq[1]) give(bq[0], bq[2] + Math.floor(Math.random() * (bq[3] - bq[2] + 1)), x, y - 0.4); });   // loot blocks (geode, fossil, cache)
    if (id === T.LEAVES && Math.random() < 0.5) give("stick", 1, x, y - 0.55);
    if (id === T.LEAVES && ITEMS.sapling && Math.random() < 0.06) give("sapling", 1, x + 0.3, y - 0.55);   // trees grow back now                                  // Stage 1: sticks from leaves
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
    if (item === "sapling") { var sg = get(tx, ty + 1); if (sg !== T.MOSS && sg !== T.MUD && sg !== T.SNOW && sg !== T.ASH && sg !== T.X_peat) { nag("Plant saplings on mud, moss, snow or ash."); return false; } }
    var prule = ITEMS[item].put;   // decor: "floor" pieces stand on solid ground, "wall" pieces hang on a block beside or above them (see DECOR_FLOOR / DECOR_WALL in sandbox-world.js)
    if (prule === "floor" && !TILES[get(tx, ty + 1)].solid) { nag("That needs solid ground under it."); return false; }
    if (prule === "wall" && !(TILES[get(tx - 1, ty)].solid || TILES[get(tx + 1, ty)].solid || TILES[get(tx, ty - 1)].solid)) { nag("Hang this on a wall: it needs a block beside or above it."); return false; }
    if (item === "bed" && !TILES[get(tx, ty + 1)].solid) { nag("A bed needs solid ground under it."); return false; }
    if (solid && tx + 1 > p.x - PW / 2 && tx < p.x + PW / 2 && ty + 1 > p.y - PH && ty < p.y) return false;
    if (item === "ladder") { var lk = function (a, b) { var q = get(a, b); return TILES[q].solid || q === T.LADDER; }; return lk(tx - 1, ty) || lk(tx + 1, ty) || lk(tx, ty - 1) || lk(tx, ty + 1); }
    return TILES[get(tx - 1, ty)].solid || TILES[get(tx + 1, ty)].solid || TILES[get(tx, ty - 1)].solid || TILES[get(tx, ty + 1)].solid;
  }
  function setWall(x, y, id) { mpWallEdit(x, y, id); var i = y * W + x; walls[i] = id; if (S.wstain && S.wstain[i] !== undefined && !WSTAINABLE[id]) delete S.wstain[i]; if (id === worigW[i]) delete wedits[i]; else wedits[i] = id; }
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
    mine.p += dt * (sel === "shovel" ? SHOVEL.sp : PICKS[effTier()].sp) * (hasCharm("miner") ? 1.25 : 1) * (fx("mine") ? 1.4 : 1) * gemDig() / 0.45; mine.tick -= dt;
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
    if (item === "realmgate") placedGate(tx, ty);
    if (item === "sapling") { S.saps[tx + "," + ty] = SAP_T[0] + Math.random() * (SAP_T[1] - SAP_T[0]); S.st.saplings++; }
    if (item === "jeweltable" && !S.st.socketed) toast("Tap the Jeweler's Table to set gems into your gear.", "#e0a0ff");
    if (item === "fishtrap") { S.traps[tx + "," + ty] = { f: [], t: 0 }; if (!trapWet(tx, ty)) toast("A Fish Trap only catches fish under water. Put it on the bottom of a lake.", "#f2c14e"); }
    if (item === "swampheart" && !S.st.heart) { S.st.heart = 1; chips(tx + 0.5, ty + 0.3, "#4ee6b4", 40, 12); snd("open", "Epic"); checkGoals(); }
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
    wasp: { n: "Ember Wasp", hp: 12, w: 0.8, h: 0.6, dmg: 10, glow: "#ffcf3a", chip: "#e0a020", frag: "stinger", chance: 0.55, max: 3 },
    spider: { n: "Cave Spider", hp: 20, w: 0.95, h: 0.6, dmg: 8, glow: "#ff4a6a", chip: "#4a3a4a", frag: "silk", chance: 0.65, max: 3 },   // hangs from cave ceilings and drops on you; its pounce webs you
    witch: { n: "Bog Witch", hp: 46, w: 0.9, h: 1.6, dmg: 9, glow: "#b06aff", chip: "#7a4a9a", frag: "hexdust", chance: 0.7, max: 1 }   // keeps her distance, lobs hex bottles, blinks away when you get close
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
  var KSTAT = { bug: "bugs", frog: "frogs", bat: "bats", wolf: "wolves", gator: "gators", slime: "slimes", wasp: "wasps", witch: "witches", spider: "spiders" };
  var FLIER = { bat: 1, wasp: 1 };
  var SEEN_TIP = {
    wolf: [1, "Frost Wolves hunt in pairs! When one crouches, jump over it or back away before it lunges.", "#9fe8ff"],
    gator: [2, "A Bog Gator lurks in the water! When its jaws open, get out of reach.", "#a8e05a"],
    slime: [4, "Slimes! Big ones split in two when you pop them.", "#7dff6a"],
    wasp: [8, "Ember Wasps! When one glows red it is about to dash at you: step aside.", "#ffcf3a"],
    spider: [32, "A Cave Spider! They hang from cave ceilings and drop when you pass under. Watch for the silk threads, and dodge the pounce or you will be webbed.", "#ff4a6a"],
    witch: [16, "A Bog Witch! She lobs hex bottles from a distance and blinks away if you rush her. Dodge the bottles, then strike.", "#b06aff"]
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
    var d = ENEMY[k], hp0 = Math.max(1, Math.round((k === "bat" ? d.hp + 4 * S.wpn : d.hp) * dif().ehp)); return { k: k, x: x, y: y, hx: x, vx: 0, vy: 0, kv: 0, on: false, dir: Math.random() < 0.5 ? -1 : 1, hp: hp0, mx: hp0, dmg: k === "bat" ? d.dmg + 2 * S.wpn : d.dmg, w: d.w, h: d.h, hurt: 0, dead: 0, def: false, st: k === "frog" ? "idle" : k === "bat" || k === "wasp" ? "hover" : k === "gator" ? "lurk" : k === "slime" ? "rest" : "patrol", b: world.bio[clamp(Math.floor(x), 0, W - 1)], jaw: 0, sq: 0, mv: 0, wet: false, small: false, t: 1 + Math.random() * 2, tt: Math.random() * 6, cd: 0, ext: 0, hvx: 0, blocked: false, fl: Math.random() * 6, ph: Math.random() * 6, leave: 0, gone: false, ax: 0, ay: 0 };
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
    if (MP.on && MP.role === "guest") { if (e.def) return; mpSend({ t: "hit", i: e.nid, d: dmg, f: face }); e.hurt = 0.3; text(e.x, e.y - e.h - 0.3, "-" + Math.round(dmg), "#ffe48a"); chips(e.x, e.y - e.h * 0.5, ENEMY[e.k].chip, 6, 5); thud(180 + Math.random() * 60, 0.06); return; }   // the host applies it
    if (e.boss) return damageBoss(e, dmg, face);
    if (e.def) return; e.hp -= dmg; e.hurt = 0.3; e.kv = face * (e.k === "bug" ? 6 : e.k === "gator" ? 2.5 : e.k === "wolf" ? 4.5 : 5); text(e.x, e.y - e.h - 0.3, "-" + Math.round(dmg), "#ffe48a");
    chips(e.x, e.y - e.h * 0.5, ENEMY[e.k].chip, 8, 6); thud(180 + Math.random() * 60, 0.06);
    if (FLIER[e.k] && e.hp > 0 && e.st !== "away") { e.st = "away"; e.t = 0.7; e.cd = 1.2; }   // a hit scares a bat or wasp off for a moment
    if (e.k === "wolf" && e.st === "wind") e.st = "stalk";
    if (e.hp > 0) return;
    if (e.home !== undefined) S.whut[e.home] = S.days | 0;   // a Witch Hut's owner: back tomorrow
    var d = ENEMY[e.k], sp = e.k === "slime" ? SLIME_PAL[e.b] || SLIME_PAL[0] : null;
    e.def = true; e.dead = 0.6; chips(e.x, e.y - e.h * 0.5, sp ? sp.glow : d.glow, 16, 8); snd("open", "Epic");
    if (MP.role === "host" && e.lastHit && MP.peers[e.lastHit]) mpSend({ t: "kill", to: e.lastHit, k: e.k, small: !!e.small });
    if (e.k === "slime" && !e.small) {   // a big slime splits into two little ones
      [-1, 1].forEach(function (s2) { var kid = newEnemy("slime", clamp(e.x + s2 * 0.3, 1.5, W - 1.5), e.y); kid.small = true; kid.b = e.b; kid.w = 0.55; kid.h = 0.45; kid.hp = kid.mx = 6; kid.dmg = 4; kid.kv = s2 * 5; kid.vy = -6; kid.cd = 0.6; kid.t = 0.6; if (!eBoxHit(kid.x, kid.y, kid.w, kid.h)) enemies.push(kid); });
    }
    var kills = ++S.st[KSTAT[e.k]];
    var drop = pityDrop(d.frag, (kills === 1 && !e.small) || Math.random() < d.chance * (e.small ? 0.35 : 1));
    popup("Enemy defeated", (sp ? (e.small ? "Little " : "") + sp.n : d.n) + (drop ? " \u2022 +1 " + ITEMS[d.frag].n : ""), sp ? sp.glow : d.glow, "\u2694");
    if (e.k === "witch" && Math.random() < 0.3) { var pks = Object.keys(POTIONS), pk = pks[Math.floor(Math.random() * pks.length)]; give(pk, 1, e.x - 0.5, e.y - e.h - 1.3, true); }   // something from her bag
    var MEAT = { frog: 0.35, wolf: 0.6, gator: 0.7 }; if (MEAT[e.k] && ITEMS.rawmeat && Math.random() < MEAT[e.k]) give("rawmeat", 1, e.x - 0.5, e.y - e.h - 1.3, true);
    if (drop) {   // loot: a Delve item, and (for bugs and frogs) the same Fragment is added to your Adventure bag
      give(d.frag, 1, e.x - 0.5, e.y - e.h - 0.9, true);
      try { if (typeof Fragments !== "undefined" && (e.k === "bug" || e.k === "frog")) Fragments.add(ITEMS[d.frag].frag, 1); } catch (er) {}
    }
    checkGoals();
  }
  function strike() {   // one weapon swing: hits every enemy in front of you
    if (toolBroken("wpn")) return;
    var reach = [0, 2.7, 2.2, 2.4, 2.4, 2.6][S.wpn], f = p.face, xa = p.x - f * 0.3, xb = p.x + f * reach, lo = Math.min(xa, xb), hi = Math.max(xa, xb);
    var hits = 0;
    enemies.forEach(function (e) { if (!e.def && !e.u && e.x + e.w / 2 > lo && e.x - e.w / 2 < hi && e.y > p.y - PH - (FLIER[e.k] ? 1.2 : 0.5) && e.y - e.h < p.y + 0.3) { hits++; e.lastHit = 0; damageEnemy(e, wDmg(), f); } }); gemLeech(hits);
    hits += mpStrikePlayers(lo, hi, wDmg(), f);
    if (hits) wear("wpn", 1);
  }
  function spawnEnemy() {   // one try every few seconds, just off screen: what can appear depends on the biome there, day or night, and whether you are underground
    var cnt = {}, tot = 0; enemies.forEach(function (e) { if (!e.def && e.k !== "bat") { cnt[e.k] = (cnt[e.k] || 0) + 1; tot++; } });
    if (tot >= 5) return;
    var side = Math.random() < 0.5 ? -1 : 1, x = clamp(Math.floor(p.x + side * (vw / 2 / ts + 2 + Math.random() * 8)), 3, W - 4) + 0.5, y = -1, cx = Math.floor(x);
    var b = world.bio[cx], night = batNight(S.time), under = p.y > col[clamp(Math.floor(p.x), 0, W - 1)] + 7, opts = [], tw = 0, wx = -1;
    function add(k, w) { if ((cnt[k] || 0) < ENEMY[k].max) { opts.push([k, w]); tw += w; } }
    if (b === 0) { add("bug", under ? 4 : 5); if (!under) add("frog", 3); if (!under && night && S.wpn >= 2) add("witch", 1.4); if (S.wpn >= 2 && !under && (wx = waterNear(cx)) >= 0) add("gator", 3); }
    else if (b === 1) { if (!night && !under) add("wasp", 5); if (under) add("bug", 5); }   // Bramble Bugs also burrow through Ember Bog caves
    else add("wolf", under ? 5 : 4);   // Frost Wolves den in Frostfen caverns too
    if (under || night) add("slime", b === 0 ? 3 : 5);
    if (under) add("spider", 4);   // Cave Spiders, under every land
    if (!opts.length) return;
    var r = Math.random() * tw, k = opts[0][0]; for (var q = 0; q < opts.length; q++) { r -= opts[q][1]; if (r <= 0) { k = opts[q][0]; break; } }
    if (k === "spider") { var cy0 = spiderCeiling(cx, p.y); if (cy0 > 0) { var sp0 = newEnemy("spider", x, cy0 + 1.1); sp0.st = "hang"; sp0.ay = cy0; enemies.push(sp0); var tip0 = SEEN_TIP.spider; if (!(S.st.seen & tip0[0])) { S.st.seen |= tip0[0]; toast(tip0[1], tip0[2]); } return; } }
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
    if (panelOpen && !MP.on) return;
    if (MP.on && MP.role === "guest") { mpGhostStep(dt); return; }   // a guest only mirrors the host's creatures
    var underground = p.y > col[clamp(Math.floor(p.x), 0, W - 1)] + 7;
    spawnT -= dt; if (spawnT <= 0) { spawnT = (underground ? 2.3 + Math.random() * 1.8 : 3.5 + Math.random() * 2.6) * dif().spawn; if (S.wpn >= 1 && !activeBoss()) spawnEnemy(); }   // caves are busier
    batT -= dt; if (batT <= 0) { batT = (3.2 + Math.random() * 3) * (1 - 0.35 * clamp((S.time - BAT.from) / 150, 0, 1)); if (S.wpn >= 1 && batNight(S.time) && !underground && !activeBoss()) spawnBat(); }   // bats arrive faster as the night goes on
    enemies.forEach(function (e) { if (e.k === "bat" && !e.def && !e.leave && (!batNight(S.time) || underground)) e.leave = underground ? 4 : 3 + Math.random() * 2; });   // dawn, or you went underground
    enemies.forEach(function (e) { if (e.k === "wasp" && !e.def && !e.leave && (batNight(S.time) || underground)) e.leave = 2.5 + Math.random() * 2; });   // wasps head home at night, or when you go underground
    if (swingQ > 0) { swingQ -= dt; if (swingQ <= 0) strike(); }
    updateShots(dt); stepArrows(dt); witchHomes(dt);
    if (glideDist >= 1) { S.st.glided += Math.floor(glideDist); glideDist -= Math.floor(glideDist); }
    if (world.aerie && !S.vis.aerie && !cave && Math.abs(p.x - world.aerie.cx) < 26) { S.vis.aerie = 1; toast("Something floats in the sky above! Stand over the glowing Thermal Vent to ride its updraft up.", "#ffb04a"); }
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i]; e.tt += dt; e.hurt = Math.max(0, e.hurt - dt); e.cd = Math.max(0, e.cd - dt);
      if (e.def) { e.dead -= dt; moveEnemy(e, dt, 0); if (e.dead <= 0) enemies.splice(i, 1); continue; }
      if (e.gone || (!e.boss && (Math.abs(e.x - p.x) > 38 || Math.abs(e.y - p.y) > 44))) { if (e.gone) chips(e.x, e.y - e.h * 0.5, ENEMY[e.k].chip, 6, 4); enemies.splice(i, 1); continue; }
      mpRun(e, function () { if (e.boss) updBoss(e, dt); else if (e.k === "bug") updateBug(e, dt); else if (e.k === "bat") updateBat(e, dt); else if (e.k === "wolf") updateWolf(e, dt); else if (e.k === "gator") updateGator(e, dt); else if (e.k === "slime") updateSlime(e, dt); else if (e.k === "wasp") updateWasp(e, dt); else if (e.k === "witch") updateWitch(e, dt); else if (e.k === "spider") updateSpider(e, dt); else updateFrog(e, dt); });
    }
  }
  // ---------- CAVE CREATURES (hole-cave floors, seen from above) ----------
  // Each floor is stocked once, the first time you reach it (only once you carry a weapon). Deeper floors hold more of them, and tougher ones.
  // Every biome has slimes and bats; Mudhollow adds Bramble Bugs, Cinder Hollow adds Ember Wasps, Frostvault adds Frost Wolves (floor 3 and down).
  // They reuse the surface art and attacks, flattened to top-down moves: slimes hop at you, bugs charge, bats and wasps circle then dive, wolves lunge.
  // Swing your weapon toward where you aim (tap or click) to hit everything in front of you. Clear a floor for a small reward.
  var CMOB = { spider: { r: 0.34, spd: 3, aggro: 7.5 }, slime: { r: 0.34, spd: 0, aggro: 7 }, bat: { r: 0.3, spd: 3.2, aggro: 8, fly: 1 }, bug: { r: 0.36, spd: 2.1, aggro: 7 }, wasp: { r: 0.28, spd: 3.8, aggro: 8, fly: 1 }, wolf: { r: 0.44, spd: 3.4, aggro: 8 } };
  var CREACH = [0, 1.9, 1.6, 1.8, 1.8, 2], ckx = 0, cky = 0;
  function caveKinds(b, f) {
    var L = [["slime", 4], ["bat", 3], ["spider", 3]];   // Cave Spiders live under every land
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
    e.b = F.biome; e.r = CMOB[k].r; e.hp = e.mx = Math.max(1, Math.round(ENEMY[k].hp * sc * dif().ehp)); e.dmg = Math.round(ENEMY[k].dmg * (1 + 0.045 * (f - 1)));
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
      var wolf = m.k === "wolf" || m.k === "spider", go = wolf ? "lunge" : "charge", wind = m.k === "spider" ? 0.3 : wolf ? 0.45 : 0.35;
      if (m.st === "wind") { m.t -= dt; m.dir = dx >= 0 ? 1 : -1; if (m.t <= 0) { m.st = go; m.t = wolf ? 0.4 : 0.5; m.ax = nx * (wolf ? 9 : 7.5); m.ay = ny * (wolf ? 9 : 7.5); thud(wolf ? 240 : 200, 0.06); } }
      else if (m.st === go) { m.t -= dt; vx = m.ax; vy = m.ay; if (wolf) { m.z = Math.sin(Math.PI * clamp(1 - m.t / 0.4, 0, 1)) * 0.5; m.vy = m.t > 0.2 ? -6 : 6; } if (m.t <= 0 || m.blocked) { m.st = "retreat"; m.t = 0.55; m.cd = 1.2; m.z = 0; m.vy = 0; } }
      else if (m.st === "retreat") { m.t -= dt; vx = -nx * 1.6; vy = -ny * 1.6; if (m.t <= 0) m.st = "patrol"; }
      else if (near) {
        m.st = wolf ? "stalk" : "patrol"; vx = nx * C.spd; vy = ny * C.spd;
        if (d < (wolf ? 3.6 : 3.1) && m.cd <= 0) { m.st = "wind"; m.t = wind; thud(wolf ? 130 : 520, 0.05); vx = vy = 0; }
      } else { m.st = "patrol"; m.t -= dt; if (m.t <= 0) { var ga = Math.random() * 6.28; m.wx = Math.cos(ga) * C.spd * 0.4; m.wy = Math.sin(ga) * C.spd * 0.4; m.t = 1.2 + Math.random() * 2; } vx = m.wx; vy = m.wy; }
      if (Math.abs(vx) > 0.2 && m.st !== "wind") m.dir = vx > 0 ? 1 : -1;
      m.mv = Math.sqrt(vx * vx + vy * vy); moveMob(F, m, dt, vx, vy); if (m.blocked && m.st === "patrol") { m.wx = -m.wx; m.wy = -m.wy; }
      if (touch && m.cd <= 0 || (touch && m.st === go)) { if (caveHurt(m, m.st === go ? m.dmg : Math.ceil(m.dmg * 0.45))) { if (m.k === "spider" && m.st === go) webbed(1.6); m.cd = 1; if (m.st === go) { m.st = "retreat"; m.t = 0.55; m.z = 0; } } }
    }
  }
  function caveSwing(dt) {   // weapon in a cave: a swing toward where you aim hits every creature in a cone in front of you
    if (!aim.down || !S.wpn) return;
    if (toolBroken("wpn")) { nag("Your weapon is broken. Repair it in the Craft tab."); return; }
    cool -= dt; if (cool > 0) return; cool = wCd(); S.st.swings++;
    var ax = (aim.mx - ox) / ts - cp.x, ay = (aim.my - oy) / ts - (cp.y - 0.5), al = Math.sqrt(ax * ax + ay * ay) || 1; ax /= al; ay /= al; if (Math.abs(ax) > 0.15) cp.face = ax < 0 ? -1 : 1;
    thud(300 + S.wpn * 70, 0.04);
    for (var s2 = 0; s2 < 5; s2++) { var an = Math.atan2(ay, ax) + (s2 - 2) * 0.32; parts.push({ x: cp.x + Math.cos(an) * 1.1, y: cp.y - 0.5 + Math.sin(an) * 1.1, vx: Math.cos(an) * 2.5, vy: Math.sin(an) * 2.5 - 1, life: 0.2, max: 0.25, c: WEAPONS[S.wpn].c, s: 3 }); }
    var F = cave.F, hits = 0; if (!F.mobs) return;
    F.mobs.forEach(function (m) {
      if (m.def) return; var dx = m.x - cp.x, dy = (m.y - 0.3) - (cp.y - 0.5), d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      if (d > CREACH[S.wpn] + m.r || (dx * ax + dy * ay) / d < 0.2) return;
      hits++; damageCaveMob(m, wDmg(), dx / d, dy / d); gemLeech(1);
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
    var drop = pityDrop(d.frag, (kills === 1 && !m.small) || Math.random() < d.chance * (m.small ? 0.35 : 1));
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
  var SHADOW = { bug: 19, frog: 17, wolf: 21, gator: 27, slime: 14, witch: 13, spider: 16 }, HBAR = { bug: 41, bat: 30, frog: 49, wolf: 44, gator: 30, slime: 32, wasp: 30, witch: 62, spider: 30 };
  function drawEnemy(g, e, now) {
    if (e.boss) return drawBoss(g, e, now);
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
    else if (e.k === "witch") drawWitch(g, e, d, flash, h, pd);
    else if (e.k === "spider") drawSpider(g, e, d, flash, h, pd);
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
  function plantCrop(x, y, seedItem) { S.farm[x + "," + y] = { c: ITEMS[seedItem].seed, g: 0, w: 0 }; if (MP.on && MP.role === "guest") mpSend({ t: "farm", k: x + "," + y, c: ITEMS[seedItem].seed }); S.st.planted++; checkTrail(); checkGoals(); }
  function farmStep(sec) {
    tickTraps(sec); tickSaps(sec);
    Object.keys(S.farm).forEach(function (key) {
      var e = S.farm[key], q = key.split(","), x = +q[0], y = +q[1], td = cropAt(x, y), C = td && CROPS[td.crop];
      if (!C || td.crop !== e.c) { delete S.farm[key]; return; }
      if (e.w < 20 && sprinkled(x, y)) { e.w = WET_S; setSoil(x, y + 1, true); }   // a Sprinkler nearby
      var rate = (e.w > 0 ? 2 : 1) * (world.bio[x] === C.b ? 1.4 : 1) * (hasCharm("thumb") ? 1.25 : 1);
      if (td.stage < 4) {
        e.g += sec * rate;
        while (e.g >= C.t && td.stage < 4) { e.g -= C.t; setT(x, y, C.tiles[td.stage]); td = TILES[C.tiles[td.stage]]; if (td.stage === 4 && !cave && Math.abs(x - p.x) < 24 && Math.abs(y - p.y) < 16) chips(x + 0.5, y + 0.4, C.fruit, 8, 4); }
        if (td.stage === 4) e.g = 0;
      }
      if (e.w > 0) { e.w -= sec; if (e.w <= 0) { e.w = 0; setSoil(x, y + 1, false); } }
    });
  }
  function tickFarm(dt) { if (MP.on && MP.role === "guest") return; farmT += dt; if (farmT >= 1) { var s2 = farmT; farmT = 0; farmStep(s2); } }
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
  var HUNGER_RATE = 100 / 620, starveT = 0, shownFood = -1;
  function meX() { return cave ? cp.x : p.x; }
  function meY() { return cave ? cp.y - 1.4 : p.y - PH - 0.3; }
  function regenMul() { var hc = (hasCharm("hearty") ? 1.2 : 1) * (gem("arm", "amethyst") ? 1.25 : 1); if (S.nohunger) return hc; return (S.food >= 80 ? 1.6 : S.food < 25 ? 0 : 1) * hc; }
  function drawFood() {
    var el = $("sbxFood"); if (!el) return; el.hidden = !!S.nohunger; if (S.nohunger) return;
    var v = Math.max(0, Math.ceil(S.food)); if (v === shownFood) return; shownFood = v;
    el.querySelector(".fl").style.width = v + "%"; el.querySelector("b").textContent = v; el.setAttribute("aria-valuenow", v);
    el.classList.toggle("low", v < 25); el.classList.toggle("mid", v >= 25 && v < 50); el.classList.toggle("full", v >= 80);
  }
  function tickHunger(dt) {
    if (S.nohunger) { drawFood(); return; }
    var was = S.food; S.food = Math.max(0, S.food - dt * HUNGER_RATE * (hasCharm("hearty") ? 0.65 : 1) * (gem("arm", "amber") ? 0.85 : 1) * dif().hunger);
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
  // ---------- FISHING ----------
  // Pick the rod (S.rod: 1 Reed Rod, 2 Ember Rod) and tap water to cast. The bobber floats... when it dips and a "!" shows, tap again quickly to reel in.
  // Tapping too early pulls the line in. The Reed Rod fishes water, and also through Frostfen ice; the Ember Rod can fish in lava too.
  // What bites depends on the liquid, the biome, night time (Glowfins love the dark) and depth (cave pools hold more rare fish).
  var fishing = null, rodPrev = false, ROD_REACH = 7.5;
  var FISHTAB = {
    water: [["bogminnow", 55], ["catfish", 32], ["glowfin", 0]],
    ice: [["frosttrout", 55], ["icepike", 32], ["crystalcarp", 0]],
    lava: [["emberkoi", 52], ["magmaeel", 35], ["cinderfish", 0]]
  };
  var FISH_ALL = ["bogminnow", "catfish", "glowfin", "frosttrout", "icepike", "crystalcarp", "emberkoi", "magmaeel", "cinderfish"];
  function liquidAt(x, y) { var id = get(x, y); return id === T.WATER ? "water" : id === T.LAVA ? "lava" : id === T.ICE || id === T.X_permafrost ? "ice" : ""; }
  function castTarget(tx, ty) {   // the liquid's surface cell at (or just below) where you tapped
    for (var y = ty; y <= ty + 3; y++) { var lq = liquidAt(tx, y); if (lq) { var top = y; while (top > 0 && liquidAt(tx, top - 1) === lq) top--; if (lq === "ice" && get(tx, top - 1) !== T.AIR) return null; return { x: tx, y: top, lq: lq }; } if (blocks(tx, y)) break; }
    return null;
  }
  function useRod(dt) {
    mine = null; var press = aim.down && !rodPrev; rodPrev = aim.down;
    if (!fishing) {
      if (!press || aim.tx < 0) return;
      var c = castTarget(aim.tx, aim.ty);
      if (!c) { nag("Tap water to cast your line" + (S.rod >= 2 ? " (or lava)." : ". In Frostfen you can fish through the ice.")); return; }
      if (c.lq === "lava" && S.rod < 2) { nag("Lava would burn this rod. Craft the Ember Rod to fish in lava."); return; }
      var dx = c.x + 0.5 - p.x, dy = c.y - (p.y - PH / 2); if (dx * dx + dy * dy > ROD_REACH * ROD_REACH) { nag("That's too far to cast."); return; }
      p.face = dx < 0 ? -1 : 1;
      var bait = takeBait();
      fishing = { x: c.x, y: c.y, lq: c.lq, ph: "wait", bait: bait[1], t: (2.5 + Math.random() * 5) * fishBiteMul() * bait[0], bob: 0 };
      thud(520, 0.04); chips(c.x + 0.5, c.y + 0.1, c.lq === "lava" ? "#ffb13b" : "#bff4ff", 6, 3); return;
    }
    var fx = fishing.x + 0.5 - p.x, fy = fishing.y - (p.y - PH / 2);
    if (fx * fx + fy * fy > (ROD_REACH + 2) * (ROD_REACH + 2) || !liquidAt(fishing.x, fishing.y)) { fishing = null; nag("Your line came loose."); return; }
    fishing.t -= dt; fishing.bob += dt;
    if (fishing.ph === "wait") {
      if (press) { fishing = null; nag("Too early! Wait for the bobber to dip and the ! to show."); thud(300, 0.03); return; }
      if (fishing.t <= 0) { fishing.ph = "bite"; fishing.t = S.rod >= 2 ? 1.0 : 0.85; thud(760, 0.06); chips(fishing.x + 0.5, fishing.y, "#ffffff", 5, 3); }
    } else if (fishing.ph === "bite") {
      if (press) return landFish();
      if (fishing.t <= 0) { fishing.ph = "wait"; fishing.t = (2 + Math.random() * 4) * fishBiteMul(); nag("It got away! Wait for the next bite."); }
    }
  }
  function landFish() {
    var F = fishing, x = F.x, y = F.y; fishing = null;
    var under = y > col[clamp(x, 0, W - 1)] + 6, night = isNight(S.time), r = Math.random();
    if (r < 0.04) { var L = rollLoot("pot", world.bio[x], under ? 1 : 0); L.forEach(function (q) { give(q[0], q[1], x, y - 0.6); }); popup("Fished up treasure!", L.map(function (q) { return ITEMS[q[0]].n; }).join(", "), "#f2c14e", "✦"); S.st.fishloot++; snd("open", "Epic"); checkGoals(); return; }
    if (r < 0.1) { give("oldboot", 1, x, y - 0.6); nag("Just an Old Boot..."); S.st.boots++; checkGoals(); return; }
    var tab = FISHTAB[F.lq], rare = 0.07 + (F.bait || 0) + (under ? 0.05 : 0) + (hasCharm("angler") ? 0.06 : 0) + (night && F.lq === "water" ? 0.08 : 0), k;
    if (Math.random() < rare) k = tab[2][0];
    else { var tw = tab[0][1] + tab[1][1], rr = Math.random() * tw; k = rr < tab[0][1] ? tab[0][0] : tab[1][0]; }
    give(k, 1, x, y - 0.6, true); S.st.fish++; S.fdex[k] = 1; if (F.lq === "lava") S.st.lavafish++;
    chips(x + 0.5, y, F.lq === "lava" ? "#ff8a3d" : "#8fe0ff", 14, 6); thud(420, 0.06);
    if (k === tab[2][0]) { S.st.rarefish++; popup("Rare catch!", ITEMS[k].n, "#c78bff", "★"); snd("open", "Epic"); } else snd("coin");
    checkTrail(); checkGoals();
  }
  function drawFishing(g, now) {
    if (!fishing || cave) return;
    var bite = fishing.ph === "bite", bx = ox + (fishing.x + 0.5) * ts, by = oy + fishing.y * ts + (bite ? ts * 0.22 : Math.sin(fishing.bob * 2.4) * ts * 0.05);
    var tx = ox + (p.x + p.face * 1.15) * ts, ty = oy + (p.y - 2.05) * ts;   // the rod tip
    g.strokeStyle = "rgba(246,238,219,.75)"; g.lineWidth = Math.max(1, ts / 22); g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo((tx + bx) / 2, Math.max(ty, by) + ts * 0.6, bx, by); g.stroke();
    var r = ts * 0.16; g.fillStyle = "#ffffff"; g.beginPath(); g.arc(bx, by - r * 0.4, r, Math.PI, 0); g.fill(); g.fillStyle = "#e8341c"; g.beginPath(); g.arc(bx, by - r * 0.4, r, 0, Math.PI); g.fill();
    g.strokeStyle = "#1a1206"; g.lineWidth = 1; g.beginPath(); g.arc(bx, by - r * 0.4, r, 0, 6.2832); g.stroke();
    if (bite) {
      g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 2; var rr = ts * (0.3 + (1 - fishing.t) * 0.4); g.beginPath(); g.ellipse(bx, by, rr, rr * 0.3, 0, 0, 6.2832); g.stroke();
      g.font = "900 " + Math.round(ts * 0.8) + "px Nunito,sans-serif"; g.textAlign = "center"; g.lineWidth = 4; g.strokeStyle = "rgba(0,0,0,.7)"; g.fillStyle = "#ffcf3a";
      var ey = by - ts * 0.9 - Math.abs(Math.sin(now / 80)) * ts * 0.15; g.strokeText("!", bx, ey); g.fillText("!", bx, ey);
    }
  }

  // ---------- ANIMALS TO RAISE ----------
  // Wild Bog Ducks, Mud Pigs and Frost Goats wander their biomes (they never fight). Hold an animal's favourite food and tap it to feed it:
  // after a feed or three it is tamed (S.pets). A fed animal stays happy for a day and makes something every couple of minutes: tap it to collect.
  // Hold its favourite food and it follows you; let go and it settles where it stands, or beside the nearest Feeding Trough.
  // Two happy adults of the same kind fed close together can have a baby (it grows up in a few minutes).
  var ANIM = {
    duck: { n: "Bog Duck", b: [0], w: 0.8, h: 0.75, spd: 1.3, fav: ["seed_carrot", "seed_potato", "seed_pepper", "seed_frost"], favN: "any seeds", prod: "duckegg", every: 100, names: ["Puddles", "Quackers", "Mossy", "Dewdrop", "Bean", "Waddles"] },
    pig: { n: "Mud Pig", b: [0, 1], w: 1.1, h: 0.85, spd: 1.0, fav: ["carrot", "potato"], favN: "carrots or potatoes", prod: "truffle", every: 140, names: ["Truffles", "Mudsy", "Hamlet", "Pickle", "Rosie", "Biscuit"] },
    goat: { n: "Frost Goat", b: [2], w: 1.0, h: 1.05, spd: 1.4, fav: ["frostberry", "leaves"], favN: "frostberries or leaves", prod: "goatmilk", every: 130, names: ["Snowball", "Flurry", "Pebble", "Juniper", "Frostbite", "Clover"] }
  };
  var wilds = [], animT = 3, FED_S = 480, PET_MAX = 24;
  function newAnimal(k, x, y, tame) { var A = ANIM[k]; return { k: k, x: x, y: y, vx: 0, vy: 0, kv: 0, on: false, w: A.w, h: A.h, dir: Math.random() < 0.5 ? -1 : 1, t: 1 + Math.random() * 2, st: "idle", tt: Math.random() * 6, tame: !!tame, hx: x, fed: 0, pr: 0, rdy: 0, nm: "", baby: 0, love: 0, tm: 0, fol: false, hop: 0 }; }
  function allAnimals() { return S.pets.concat(wilds); }
  function spawnWild() {
    if (cave || wilds.length >= 3 || p.y > col[clamp(Math.floor(p.x), 0, W - 1)] + 6) return;
    var side = Math.random() < 0.5 ? -1 : 1, cx = clamp(Math.floor(p.x + side * (vw / 2 / ts + 3 + Math.random() * 8)), 3, W - 4), b = world.bio[cx], opts = [];
    Object.keys(ANIM).forEach(function (k) { if (ANIM[k].b.indexOf(b) >= 0) opts.push(k); }); if (!opts.length) return;
    var k = opts[Math.floor(Math.random() * opts.length)], cy = col[cx];
    if (cy <= 1 || cy >= H || blocks(cx, cy - 1) || TILES[get(cx, cy - 1)].kind === "water" || TILES[get(cx, cy)].kind === "water") return;
    var a = newAnimal(k, cx + 0.5, cy, false); if (eBoxHit(a.x, a.y, a.w, a.h)) return;
    wilds.push(a);
    if (!(S.st.seen & 16)) { S.st.seen |= 16; toast("A wild " + ANIM[k].n + "! Hold " + ANIM[k].favN + " and tap it to tame it.", "#f2c14e"); }
  }
  function troughNear(x, y) { if (T.X_trough === undefined) return null; for (var d = 0; d <= 8; d++) for (var s2 = -1; s2 <= 1; s2 += 2) { var xx = Math.floor(x) + d * s2; for (var yy = Math.floor(y) - 3; yy <= Math.floor(y) + 2; yy++) if (get(xx, yy) === T.X_trough) return xx + 0.5; } return null; }
  function updateAnimals(dt) { if (MP.on && MP.role === "guest") return;
    if (cave) return;
    animT -= dt; if (animT <= 0) { animT = 6 + Math.random() * 5; spawnWild(); }
    for (var i = wilds.length - 1; i >= 0; i--) if (Math.abs(wilds[i].x - p.x) > 55 || Math.abs(wilds[i].y - p.y) > 40) wilds.splice(i, 1);
    allAnimals().forEach(function (a) {
      var A = ANIM[a.k]; if (!A) return; a.tt += dt; a.love = Math.max(0, a.love - dt);
      if (a.tame) {
        if (a.fed > 0) { a.fed = Math.max(0, a.fed - dt); if (!a.baby && a.rdy < 3) { a.pr += dt; if (a.pr >= A.every) { a.pr = 0; a.rdy++; } } }
        if (a.baby > 0) { a.baby = Math.max(0, a.baby - dt); if (!a.baby) { a.w = A.w; a.h = A.h; } }
      }
      var far = Math.abs(a.x - p.x) > 60 || Math.abs(a.y - p.y) > 45; if (far) return;   // far away: only the timers run
      var dx = p.x - a.x, d = Math.abs(dx), lead = a.tame && A.fav.indexOf(sel) >= 0 && d < 14 && Math.abs(p.y - a.y) < 6, vx = 0, sp = A.spd * (a.baby ? 1.2 : 1);
      if (lead) { a.fol = true; if (d > 1.6) { a.dir = dx > 0 ? 1 : -1; vx = a.dir * Math.min(4.2, sp * 2.6); a.st = "walk"; } else a.st = "idle"; }
      else {
        if (a.fol) { a.fol = false; var tr = troughNear(a.x, a.y); a.hx = tr !== null ? tr : a.x; }   // let go: settle here, or by a trough
        a.t -= dt;
        if (a.t <= 0) { if (a.st === "walk") { a.st = "idle"; a.t = 1.5 + Math.random() * 3; } else { a.st = "walk"; a.t = 1 + Math.random() * 2.5; a.dir = a.tame && Math.abs(a.x - a.hx) > 4 ? (a.hx > a.x ? 1 : -1) : Math.random() < 0.5 ? -1 : 1; } }
        if (a.st === "walk") {
          var ax = Math.floor(a.x + a.dir * (a.w / 2 + 0.3)); if (!blocks(ax, Math.floor(a.y + 0.3)) && !blocks(ax, Math.floor(a.y + 1.3)) || TILES[get(ax, Math.floor(a.y + 0.3))].kind === "water" && a.k !== "duck") { a.dir = -a.dir; }
          if (a.tame && Math.abs(a.x + a.dir - a.hx) > 6) a.dir = a.hx > a.x ? 1 : -1;
          vx = a.dir * sp;
        }
      }
      if (a.blocked && a.on && vx) { a.vy = -9.5; }   // hop up a step
      if (a.on && a.st === "walk" && a.k === "goat" && Math.random() < dt * 0.4) a.vy = -7;   // goats love a little jump
      moveEnemy(a, dt, vx); a.mv = vx;
    });
  }
  function animalAt(wx, wy) {   // the animal under a point (world tiles), or null
    var all = allAnimals(), best = null, bd = 9;
    for (var i = 0; i < all.length; i++) { var a = all[i], pad = 0.35; if (wx > a.x - a.w / 2 - pad && wx < a.x + a.w / 2 + pad && wy > a.y - a.h - pad && wy < a.y + 0.2) { var d = Math.abs(wx - a.x); if (d < bd) { bd = d; best = a; } } }
    return best;
  }
  function animalNear() { var all = allAnimals(), best = null, bd = 2.6; all.forEach(function (a) { var d = Math.abs(a.x - p.x) + Math.abs(a.y - p.y) * 0.6; if (d < bd) { bd = d; best = a; } }); return best; }
  function hearts(a, n, c) { for (var q = 0; q < n; q++) parts.push({ x: a.x + (Math.random() - 0.5) * a.w, y: a.y - a.h - 0.1, vx: (Math.random() - 0.5) * 1.5, vy: -2.4 - Math.random() * 1.5, life: 0.8, max: 0.9, c: c || "#ff6b9a", s: 4 }); }
  function petName(k) { var L = ANIM[k].names, used = {}; S.pets.forEach(function (q) { used[q.nm] = 1; }); for (var i = 0; i < L.length; i++) if (!used[L[i]]) return L[i]; return ANIM[k].n.split(" ")[1] + " " + (S.pets.length + 1); }
  function useAnimal(a) {
    var A = ANIM[a.k], dx = a.x - p.x, dy = a.y - p.y; if (dx * dx + dy * dy > REACH * REACH) { nag("Walk closer to the " + A.n + "."); return; }
    var holding = A.fav.indexOf(sel) >= 0 && (S.inv[sel] || 0) > 0;
    if (a.tame) {
      if (a.rdy > 0) { var n = a.rdy; a.rdy = 0; give(A.prod, n, a.x - 0.5, a.y - a.h - 0.6, true); S.st.collected += n; hearts(a, 3, "#ffe48a"); snd("coin"); checkGoals(); save(); return; }
      if (holding) {
        if (a.fed > FED_S * 0.75) { nag(a.nm + " isn't hungry right now."); return; }
        eatFrom(sel); a.fed = FED_S; hearts(a, 5); thud(560, 0.04); toast(a.nm + " is happy! It will make " + ITEMS[A.prod].n + "s for a day.", "#ff9ac2");
        if (!a.baby && !a.love) {   // a friend nearby? a baby might come along
          var mate = S.pets.filter(function (q) { return q !== a && q.k === a.k && q.tame && !q.baby && !q.love && q.fed > 0 && Math.abs(q.x - a.x) < 5 && Math.abs(q.y - a.y) < 3; })[0];
          if (mate && S.pets.filter(function (q) { return q.k === a.k; }).length < 8 && S.pets.length < PET_MAX) {
            var kid = newAnimal(a.k, (a.x + mate.x) / 2, Math.min(a.y, mate.y), true); kid.baby = 300; kid.w = A.w * 0.6; kid.h = A.h * 0.6; kid.hx = kid.x; kid.nm = petName(a.k); kid.fed = FED_S;
            if (!eBoxHit(kid.x, kid.y, kid.w, kid.h)) { S.pets.push(kid); a.love = mate.love = 600; hearts(kid, 10); popup("A baby " + A.n + "!", kid.nm + " joins your farm", "#ff9ac2", "♥"); S.st.babies++; }
          }
        }
        checkGoals(); save(); return;
      }
      var mins = a.fed > 0 ? Math.ceil((A.every - a.pr) / 60) : 0;
      toast(a.nm + " the " + A.n + (a.baby ? " (baby)" : "") + ": " + (a.baby ? "still growing up." : a.fed > 0 ? "happy. Next " + ITEMS[A.prod].n + " in about " + mins + " min." : "hungry. Feed it " + A.favN + "."), "#ff9ac2");
      return;
    }
    if (!holding) { toast("A wild " + A.n + ". Hold " + A.favN + " and tap it to tame it.", "#f2c14e"); return; }
    if (S.pets.length >= PET_MAX) { nag("Your farm is full (" + PET_MAX + " animals)."); return; }
    eatFrom(sel); a.tm++; hearts(a, 2); thud(500, 0.03);
    if (Math.random() < 0.4 || a.tm >= 3) {
      wilds.splice(wilds.indexOf(a), 1); a.tame = true; a.nm = petName(a.k); a.hx = a.x; a.fed = FED_S; S.pets.push(a); S.st.tamed++;
      hearts(a, 12); popup("Tamed!", a.nm + " the " + A.n, "#ff9ac2", "♥"); snd("open", "Epic");
      if (S.st.tamed === 1) setTimeout(function () { toast("Hold " + A.favN + " and " + a.nm + " follows you. Let go near a Feeding Trough and it stays there.", "#ff9ac2"); }, 1800);
      checkTrail(); checkGoals(); save();
    } else nag("The " + A.n + " sniffs the food... give it a little more.");
  }
  function eatFrom(k) { S.inv[k]--; if (S.inv[k] <= 0) { delete S.inv[k]; if (sel === k) sel = "pick"; } reslot(); hbDirty = true; }
  function drawAnimals(g, now) { allAnimals().forEach(function (a) { drawAnimal(g, a, now); }); }
  function drawAnimal(g, a, now) {
    var sx = ox + a.x * ts, sy = oy + a.y * ts; if (sx < -ts * 3 || sx > vw + ts * 3 || sy < -ts * 3 || sy > vh + ts * 3) return;
    var t = a.tt, walk = Math.abs(a.mv || 0) > 0.2, bob = walk ? Math.abs(Math.sin(t * 9)) * 1.4 : Math.sin(t * 2) * 0.4, sc = a.baby ? 0.62 : 1;
    g.save(); g.translate(sx, sy + ts * 0.04); g.scale(ts / 30, ts / 30);
    g.fillStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.ellipse(0, 0, 14 * sc * a.w, 3, 0, 0, 7); g.fill();
    g.save(); g.scale(a.dir * sc, sc); g.translate(0, -bob); g.lineJoin = "round"; g.lineCap = "round";
    var leg = function (x0, ph, c, len) { var sw = walk ? Math.sin(t * 9 + ph) * 3 : 0; g.strokeStyle = c; g.lineWidth = 3; g.beginPath(); g.moveTo(x0, -len); g.lineTo(x0 + sw, bob - 0.5); g.stroke(); };
    if (a.k === "duck") {
      leg(-2, 0, "#ff8a2a", 6); leg(2, 3, "#e8701a", 6);
      g.fillStyle = "#ff8a2a"; g.fillRect(-4 + (walk ? Math.sin(t * 9) * 3 : 0), -1 + bob, 4, 1.5); g.fillRect(1 + (walk ? Math.sin(t * 9 + 3) * 3 : 0), -1 + bob, 4, 1.5);
      g.fillStyle = "#8a6a4a"; g.strokeStyle = "#3a2416"; g.lineWidth = 1.6; g.beginPath(); g.ellipse(-1, -11, 10, 6.5, -0.1, 0, 7); g.fill(); g.stroke();
      g.fillStyle = "#b8936a"; g.beginPath(); g.ellipse(-1, -8.5, 7, 3, 0, 0, 7); g.fill();
      g.fillStyle = "#5a4430"; g.beginPath(); g.moveTo(-10, -12); g.lineTo(-15, -15); g.lineTo(-10, -9); g.closePath(); g.fill();   // tail
      g.fillStyle = "#6a5038"; g.beginPath(); g.ellipse(-2, -12, 6, 3.5, -0.2, 0, 7); g.fill();   // wing
      g.fillStyle = "#1f8f7e"; g.strokeStyle = "#0e3a32"; g.beginPath(); g.ellipse(7, -19, 4.6, 4.4, 0, 0, 7); g.fill(); g.stroke();   // teal head
      g.fillStyle = "#f6eedb"; g.fillRect(4, -16, 5, 1.4);   // neck ring
      g.fillStyle = "#ffb13b"; g.beginPath(); g.moveTo(10.5, -20); g.lineTo(16, -18.5); g.lineTo(10.5, -17); g.closePath(); g.fill();
      g.fillStyle = "#12220f"; g.beginPath(); g.arc(8.4, -20.4, 1.1, 0, 7); g.fill();
    } else if (a.k === "pig") {
      leg(-6, 0, "#c47a6a", 5); leg(-2, 2, "#a8645a", 5); leg(5, 1, "#c47a6a", 5); leg(8, 3, "#a8645a", 5);
      g.fillStyle = "#e8a090"; g.strokeStyle = "#7a3a30"; g.lineWidth = 1.6; g.beginPath(); g.ellipse(0, -11, 12, 7, 0, 0, 7); g.fill(); g.stroke();
      g.fillStyle = "#7a5a3a"; [[-5, -13, 3.2], [3, -8, 2.6], [-1, -15, 2], [6, -14, 1.8]].forEach(function (m) { g.beginPath(); g.arc(m[0], m[1], m[2], 0, 7); g.fill(); });   // mud spots
      g.strokeStyle = "#c47a6a"; g.lineWidth = 1.8; g.beginPath(); g.moveTo(-12, -13); g.quadraticCurveTo(-16, -16, -14, -18); g.quadraticCurveTo(-12, -19, -13, -16); g.stroke();   // curly tail
      g.fillStyle = "#e8a090"; g.strokeStyle = "#7a3a30"; g.beginPath(); g.ellipse(11, -13, 6, 5.5, 0, 0, 7); g.fill(); g.stroke();
      g.fillStyle = "#d48878"; g.beginPath(); g.moveTo(8, -18); g.lineTo(10, -22); g.lineTo(12, -18); g.closePath(); g.fill(); g.stroke();   // ear
      g.fillStyle = "#f0b4a4"; g.beginPath(); g.ellipse(16.5, -12, 2.6, 2.4, 0, 0, 7); g.fill(); g.stroke();
      g.fillStyle = "#7a3a30"; g.fillRect(16, -13, 0.9, 1.8); g.fillRect(17.4, -13, 0.9, 1.8);
      g.fillStyle = "#12220f"; g.beginPath(); g.arc(12.6, -15, 1, 0, 7); g.fill();
    } else {
      leg(-6, 0, "#8a8f99", 7); leg(-3, 2, "#6a6f79", 7); leg(4, 1, "#8a8f99", 7); leg(7, 3, "#6a6f79", 7);
      g.fillStyle = "#f0f4f8"; g.strokeStyle = "#7a8a9a"; g.lineWidth = 1.6; g.beginPath(); g.ellipse(0, -13, 11, 6.5, 0, 0, 7); g.fill(); g.stroke();
      g.fillStyle = "#ffffff"; [[-6, -16], [-1, -18], [4, -17], [-3, -11], [3, -11]].forEach(function (m) { g.beginPath(); g.arc(m[0], m[1], 3, 0, 7); g.fill(); });   // fluffy coat
      g.fillStyle = "#e0e6ec"; g.beginPath(); g.moveTo(-11, -15); g.lineTo(-14, -18); g.lineTo(-10, -12); g.closePath(); g.fill();
      g.fillStyle = "#e8eef2"; g.strokeStyle = "#7a8a9a"; g.beginPath(); g.ellipse(10, -20, 4.6, 4, 0.3, 0, 7); g.fill(); g.stroke();
      g.fillStyle = "#d0d8e0"; g.beginPath(); g.ellipse(13.5, -18, 3, 2.4, 0.3, 0, 7); g.fill();
      g.strokeStyle = "#8a7a60"; g.lineWidth = 2; g.beginPath(); g.moveTo(9, -23); g.quadraticCurveTo(6, -28, 2, -26); g.stroke();   // horn
      g.fillStyle = "#e8eef2"; g.beginPath(); g.moveTo(11, -15); g.lineTo(12.5, -10); g.lineTo(13.5, -15); g.closePath(); g.fill();   // beard
      g.fillStyle = "#12220f"; g.beginPath(); g.arc(11.5, -21, 1, 0, 7); g.fill();
    }
    g.restore();
    if (a.tame) {   // product ready bubble, and a name tag when you are close
      var top = -(a.h * 30 * sc) - 10;
      if (a.rdy > 0) {
        var im = icon(ANIM[a.k].prod), byy = top - 12 + Math.sin(now / 300) * 1.5; g.fillStyle = "rgba(10,20,16,.85)"; g.strokeStyle = "#f2c14e"; g.lineWidth = 1.5;
        g.beginPath(); g.arc(0, byy, 9, 0, 7); g.fill(); g.stroke(); if (im) { var imo = imgOf(im); if (imo) g.drawImage(imo, -7, byy - 7, 14, 14); }
        if (a.rdy > 1) { g.fillStyle = "#f2c14e"; g.font = "900 8px Nunito,sans-serif"; g.textAlign = "center"; g.fillText("x" + a.rdy, 10, byy + 9); }
      } else if (Math.abs(a.x - p.x) < 4 && Math.abs(a.y - p.y) < 3) {
        g.font = "800 9px Nunito,sans-serif"; g.textAlign = "center"; var tw = g.measureText(a.nm).width + 10; g.fillStyle = "rgba(10,20,16,.75)"; g.fillRect(-tw / 2, top - 8, tw, 12);
        g.fillStyle = a.fed > 0 ? "#ff9ac2" : "#f6eedb99"; g.fillText((a.fed > 0 ? "♥ " : "") + a.nm, 0, top + 1);
      }
    }
    g.restore();
  }
  var IMGC = {};
  function imgOf(url) { var im = IMGC[url]; if (!im) { im = IMGC[url] = new Image(); im.src = url; } return im.complete ? im : null; }
  // ---------- OLD CROAKER ----------
  // The old frog who tells the story lives at the spawn camp, a few steps west of where you wake up. Tap him (or press F beside him) to talk.
  // He hints at your current quest, hands out a gift for every chapter you finish (S.cg bit c = claimed), and shares swamp wisdom.
  // A gold "!" floats over him while a gift is waiting, and a "..." while you are close.
  var npc = { x: 0, y: 0, t: 0, face: 1, blink: 2, chk: 0, ok: false }, talkN = 0;
  var CG = [   // chapter gifts: given when you talk to him after finishing chapter c
    { seed_potato: 3, torch: 8, planks: 10, roastcarrot: 2 },
    { rawmeat: 3, seed_pepper: 2, bogminnow: 3, stone: 12 },
    { charcoal: 6, crystal: 4, bogiron: 6, roastcarrot: 3 },
    { ironingot: 4, cinder: 8, seed_frost: 3, chili: 2 },
    { amethyst: 2, frostberry: 6, ironingot: 4, berrypie: 2 },
    { feast: 2, ruby: 1, sapphire: 1, moonstone: 1 }
  ];
  var CROAK_HI = ["Ribbit! Good to see you, little one.", "Ah, there you are. Sit a while.", "Hrrrm. Mind the mud, it's deeper than it looks.", "Back again? Splendid, splendid.", "The reeds told me you were coming."];
  var CROAK_TIPS = [
    "Torches keep the Dusk Bugs away from your camp at night.",
    "Watered crops grow twice as fast. A crop in its home land grows faster still.",
    "Fish bite more often at the edges of big lakes, and rare fish like the dark.",
    "A tamed duck lays eggs if you keep her fed. Two fed friends side by side may surprise you.",
    "Hold your pick on a block to dig. Harder stone wants a better pick.",
    "Cave Chests deep down hold the best loot, but the deep holds the meanest bats too.",
    "Cooked meals fill you up and mend your wounds. Raw carrots only fill you a little.",
    "Sleep in a bed and you'll wake there if the swamp gets the better of you.",
    "Slimes split when they're angry. Hit them fast!",
    "Ember Wasps hate the cold. Frost Wolves hate the fire. Nobody likes an alligator.",
    "Your map remembers where you've been. Mark the good spots with a waypoint.",
    "Upgrade your Workbench to craft fancier things. Check the Craft tab for what it needs.",
    "Pigs dig truffles, goats give milk. Feed them at a Feeding Trough and they stay happy.",
    "In Frostfen you can fish right through the ice.",
    "Old buildings are full of treasure, and a few of them have stairs going down.",
    "Each land has a boss. Craft its summon at the Workbench, and fight it on open ground with a full belly.",
    "When the Bramble Queen rams a wall she sees stars. That is when to hit her hardest!",
    "Swamp rain waters your crops for you. And fish bite quicker when the weather turns.",
    "Boss trophies make fine charms. Wear one and you will feel the difference.",
    "A hoe turns grass into garden soil, and it harvests and replants ripe crops in one swing.",
    "Dig in the mud and you will find worms. Fish can never say no to a worm. Or a firefly!",
    "Far from home? A Homeward Shell hums you straight back to your bed.",
    "They say a ruin floats in the sky over Ember Bog, and that hot air rises from a vent beneath it. Ride it up!",
    "Running low on trees? Leaves drop Saplings now and then. Plant one and it grows back into a tree.",
    "A Brewing Stand and a few Glass Bottles go a long way. Try a Miner's Draught before a long dig."
  ];
  function npcSpot() {   // where he stands: the first solid floor with headroom near the camp (rechecked now and then, in case you build there)
    var sx = Math.floor(world.spawn.x) - 4;
    for (var d = 0; d < 6; d++) for (var sg = -1; sg <= 1; sg += 2) {
      var x = clamp(sx + sg * d, 1, W - 2), t0 = world.top[x];
      for (var y = Math.max(3, t0 - 14); y < Math.min(H - 1, t0 + 6); y++) {
        var id = get(x, y); if (!blocks(x, y) || id === T.LEAVES || id === T.LOG) continue;
        if (!blocks(x, y - 1) && !blocks(x, y - 2)) { npc.x = x + 0.5; npc.y = y; npc.ok = true; return; }
      }
    }
    npc.ok = false;
  }
  function giftsWaiting() { var n = [], c = Math.min(curCh(), CG.length); for (var i = 0; i < c; i++) if (!(S.cg & (1 << i))) n.push(i); return n; }
  function updateNpc(dt) {
    if (cave) return; npc.t += dt; npc.chk -= dt;
    if (npc.chk <= 0) { npc.chk = 2; npcSpot(); }
    npc.blink -= dt; if (npc.blink < -0.14) npc.blink = 2 + Math.random() * 3;
    if (Math.abs(p.x - npc.x) < 8) npc.face = p.x < npc.x ? -1 : 1;
  }
  function npcAt(wx, wy) { return npc.ok && !cave && Math.abs(wx - npc.x) < 0.8 && wy > npc.y - 1.9 && wy < npc.y + 0.2; }
  function npcNear() { return npc.ok && !cave && Math.abs(npc.x - p.x) < 2.6 && Math.abs(npc.y - p.y) < 2.5; }
  function drawNpc(g, now) {
    if (!npc.ok || cave) return;
    var sx = ox + npc.x * ts, sy = oy + npc.y * ts; if (sx < -ts * 3 || sx > vw + ts * 3 || sy < -ts * 4 || sy > vh + ts * 3) return;
    var t = npc.t, br = reduce ? 0 : Math.sin(t * 1.6) * 0.8, near = npcNear();
    g.save(); g.translate(sx, sy + ts * 0.04); g.scale(ts / 30, ts / 30); g.lineJoin = "round"; g.lineCap = "round";
    g.fillStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.ellipse(0, 0, 15, 3.2, 0, 0, 7); g.fill();
    g.save(); g.scale(npc.face, 1);
    // walking stick (behind), with a little lantern-moss tuft on top
    g.strokeStyle = "#5a3a20"; g.lineWidth = 2.6; g.beginPath(); g.moveTo(14, 0); g.lineTo(12.5, -34); g.stroke();
    g.strokeStyle = "#7a5230"; g.lineWidth = 1; g.beginPath(); g.moveTo(13.5, -2); g.lineTo(12.2, -32); g.stroke();
    g.fillStyle = "#4ee6b4"; g.globalAlpha = 0.75 + 0.25 * Math.sin(now / 400); g.beginPath(); g.arc(12.3, -35.5, 2.6, 0, 7); g.fill(); g.globalAlpha = 1;
    // legs: big squat frog feet
    g.fillStyle = "#2f9a4c"; g.strokeStyle = "#174a28"; g.lineWidth = 1.6;
    [-7, 6].forEach(function (fx) { g.beginPath(); g.ellipse(fx, -2.5, 6, 3, 0, 0, 7); g.fill(); g.stroke(); });
    g.translate(0, -br * 0.4);
    // body, belly and a mossy shawl
    g.fillStyle = "#3a9e58"; g.beginPath(); g.ellipse(0, -13, 13, 11 + br * 0.2, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = "#e6e0a8"; g.beginPath(); g.ellipse(1.5, -10, 8.5, 7, 0, 0, 7); g.fill();
    g.fillStyle = "#6a7a2a"; g.strokeStyle = "#3a4416"; g.beginPath(); g.moveTo(-13, -17); g.quadraticCurveTo(0, -11, 13, -17); g.lineTo(11, -21); g.quadraticCurveTo(0, -17, -11, -21); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#f2c14e"; g.beginPath(); g.arc(4, -15.5, 1.6, 0, 7); g.fill();   // a gold clasp
    // arm on the stick
    g.strokeStyle = "#2f8a46"; g.lineWidth = 3.4; g.beginPath(); g.moveTo(7, -16); g.quadraticCurveTo(11, -14, 12.6, -20); g.stroke();
    // head
    g.fillStyle = "#3fae5e"; g.strokeStyle = "#174a28"; g.lineWidth = 1.6; g.beginPath(); g.ellipse(1, -27, 12, 8, 0, 0, 7); g.fill(); g.stroke();
    [-5, 7].forEach(function (ex) {
      g.fillStyle = "#3fae5e"; g.beginPath(); g.arc(ex, -33, 4.6, 0, 7); g.fill(); g.stroke();
      if (npc.blink < 0) { g.strokeStyle = "#12220f"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(ex - 2.6, -33); g.lineTo(ex + 2.6, -33); g.stroke(); g.strokeStyle = "#174a28"; g.lineWidth = 1.6; }
      else { g.fillStyle = "#ffd23f"; g.beginPath(); g.arc(ex, -33, 3, 0, 7); g.fill(); g.fillStyle = "#12220f"; g.fillRect(ex - 0.6 + npc.face * 0.3, -34.6, 1.6, 3.2); }
    });
    // big white bushy brows and a droopy moustache: he's very old
    g.fillStyle = "#f4f0e2"; g.strokeStyle = "#a8a290"; g.lineWidth = 0.8;
    [-5, 7].forEach(function (ex) { g.beginPath(); g.moveTo(ex - 5.5, -36); g.quadraticCurveTo(ex, -41.5, ex + 5.5, -37); g.quadraticCurveTo(ex, -38.5, ex - 5.5, -36); g.fill(); g.stroke(); });
    g.beginPath(); g.moveTo(-2, -24); g.quadraticCurveTo(-8, -23, -9, -18); g.quadraticCurveTo(-5, -21, 1, -22.5); g.quadraticCurveTo(7, -21, 11, -18); g.quadraticCurveTo(10, -23, 4, -24); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = "#12220f"; g.lineWidth = 1.3; g.beginPath(); g.moveTo(-5, -25); g.quadraticCurveTo(1, -23, 8, -25.5); g.stroke();
    // a reed straw hat
    g.fillStyle = "#d8b45a"; g.strokeStyle = "#7a5a1e"; g.lineWidth = 1.2; g.beginPath(); g.ellipse(1, -39.5, 11, 2.6, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-5, -40); g.quadraticCurveTo(1, -50, 7, -40); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#c0503a"; g.fillRect(-4.6, -42.6, 11.2, 1.8);
    g.restore();
    // bubble: a gift is waiting, or you're close enough to talk
    var gw = giftsWaiting().length + btyReady(), by = -60 + (reduce ? 0 : Math.sin(now / 320) * 1.6);
    if (gw || near) {
      g.fillStyle = "rgba(10,20,16,.88)"; g.strokeStyle = gw ? "#f2c14e" : "#4ee6b4"; g.lineWidth = 1.6;
      g.beginPath(); g.ellipse(0, by, gw ? 8 : 10, 7.5, 0, 0, 7); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-2, by + 7); g.lineTo(0, by + 11); g.lineTo(2, by + 7); g.fill();
      g.fillStyle = gw ? "#f2c14e" : "#bff4e4"; g.font = "900 " + (gw ? 12 : 10) + "px Nunito,sans-serif"; g.textAlign = "center"; g.fillText(gw ? "!" : "...", 0, by + (gw ? 4.5 : 2));
    }
    if (near) { g.font = "800 9px Nunito,sans-serif"; g.textAlign = "center"; var tw = g.measureText("Old Croaker").width + 10; g.fillStyle = "rgba(10,20,16,.75)"; g.fillRect(-tw / 2, 4, tw, 12); g.fillStyle = "#ffe9a8"; g.fillText("Old Croaker", 0, 13); }
    g.restore();
  }
  function questLine(q) {   // what he says about your current quest
    var v = Math.min(q.v(), q.need);
    return "“" + q.d + "”" + (q.need > 1 ? " (" + v + " of " + q.need + ")" : "");
  }
  function talkCroaker() {
    var el = $("sbxStory"); if (!el) return;
    if (mapOpen) closeMap(); if (packOpen) closePack(); if (panelOpen && storyOpen < 0) closePanel();
    S.st.talks++; talkN++; talkView = "main"; rollBounties();
    storyOpen = 100; panelOpen = true; el.hidden = false; stageEl.classList.add("panel"); keys.l = keys.r = keys.j = 0; tk.l = tk.r = tk.j = 0; aim.down = false; mine = null;
    renderTalk(true); checkGoals(); save();
  }
  function renderTalk(first) {
    var c = curCh(), C = CHAPTERS[c], q = MAIN[S.qi], gifts = giftsWaiting(), h = "";
    $("sbxStoryBox").style.setProperty("--qc", C.c);
    if (talkView === "bty" || talkView === "shop") { $("sbxStoryBox").innerHTML = talkView === "bty" ? renderBty() : renderShop(); var b2 = $("sbxStoryBox").querySelector("[data-talk^=claim],[data-story-close]"); if (b2) b2.focus({ preventScroll: true }); return; }
    h += '<div class="st-croak" aria-hidden="true">' + CROAK_SVG + "</div><small>Old Croaker</small>";
    if (gifts.length) {
      var gc = gifts[0], G = CG[gc];
      h += "<h2>A gift for you!</h2><p>“You finished <b>" + esc(CHAPTERS[gc].n) + "</b>. I've been saving this for a delver like you. Go on, take it!”</p>"
        + '<div class="st-gift">' + Object.keys(G).filter(function (k) { return ITEMS[k]; }).map(function (k) { return '<span><img alt="" src="' + icon(k) + '">' + G[k] + " " + esc(ITEMS[k].n) + "</span>"; }).join("") + "</div>"
        + '<button type="button" class="btn" data-talk="gift">Take the gift' + (gifts.length > 1 ? " (" + gifts.length + " waiting)" : "") + "</button>";
    } else {
      h += "<h2 class=\"st-hi\">" + esc(CROAK_HI[(talkN + S.days) % CROAK_HI.length]) + "</h2>";
      if (q) h += '<div class="st-next"><span>Your quest: ' + esc(C.n) + "</span><b>" + esc(q.n) + "</b><em>" + esc(questLine(q)) + "</em></div>";
      else h += "<p>“You've brought the Heart back. The swamp is singing again! Wander as you like, little one. There's always more to find.”</p>";
      h += '<p class="st-tip"><b>Swamp wisdom:</b> ' + esc(CROAK_TIPS[(talkN * 7 + S.days) % CROAK_TIPS.length]) + "</p>";
      if (btyOpen()) { var rd = btyReady(); h += '<button type="button" class="btn st-bbtn' + (rd ? " ready" : "") + '" data-talk="bty">' + (rd ? rd + " bounty reward" + (rd > 1 ? "s" : "") + " to claim!" : "Bounties and Swap Shop") + "</button>"; }
      else h += '<p class="st-tip"><b>Bounties:</b> “Settle in first, little one. Once you have finished Chapter 1, I will have odd jobs for you every day.”</p>';
      h += '<div class="st-row"><button type="button" class="btn ghost" data-talk="story">Retell the story</button><button type="button" class="btn ghost" data-talk="log">Quest log</button><button type="button" class="btn" data-story-close>Bye for now</button></div>';
    }
    $("sbxStoryBox").innerHTML = h;
    if (first && gestured) snd("rise");
    var bt = $("sbxStoryBox").querySelector("[data-talk=gift],[data-story-close]"); if (bt) bt.focus({ preventScroll: true });
  }
  function talkAct(a) {
    if (a === "gift") {
      var gs = giftsWaiting(); if (!gs.length) return renderTalk();
      var gc = gs[0], G = CG[gc]; S.cg |= 1 << gc; giveRw(G); snd("open", "Epic");
      popup("Gift from Old Croaker", rewardText(Object.keys(G).reduce(function (o, k) { if (ITEMS[k]) o[k] = G[k]; return o; }, {})), CHAPTERS[gc].c, "✦");
      checkGoals(); save(); renderTalk();
    } else if (a === "story") { closeStory(); storyQ.length = 0; setTimeout(function () { showStory(curCh()); }, 120); }
    else if (a === "log") { closeStory(); tab = "quests"; openPanel("quests"); }
    else if (a === "bty" || a === "shop" || a === "main") { talkView = a; renderTalk(); }
    else if (a.indexOf("claim:") === 0) { claimBty(a.slice(6)); renderTalk(); }
    else if (a.indexOf("reroll:") === 0) { rerollBty(a.slice(7)); renderTalk(); }
    else if (a.indexOf("buy:") === 0) { buyShop(a.slice(4)); renderTalk(); }
  }
  // ---------- BOUNTIES (Old Croaker's daily and weekly jobs) ----------
  // From Chapter 2 on, Old Croaker posts 3 daily bounties (new ones every real-world day) and 1 bigger weekly bounty (every Monday).
  // Each one counts a lifetime stat from the moment it was posted (S.bty.d[i].b = the stat then). Finish it, then talk to him to claim
  // Croaker Tokens and a few items. Claim all three dailies for a bonus token. One free reroll a day.
  // Tokens are spent in his Swap Shop. S.bty = { day, wk, d: [3 dailies], w: weekly, rr: rerolls used today, full: daily bonus taken }.
  var BTY = [   // id, text (n = amount), stat, [need at chapter 1, extra per chapter], min chapter, extra condition
    { id: "mine", t: "Dig {n} blocks", s: "mined", n: [120, 40], c: 1 },
    { id: "wood", t: "Chop {n} Wood", s: "wood", n: [16, 4], c: 1 },
    { id: "place", t: "Place {n} blocks", s: "placed", n: [50, 15], c: 1 },
    { id: "torch", t: "Place {n} torches", s: "torches", n: [5, 1], c: 1 },
    { id: "plant", t: "Plant {n} crops", s: "planted", n: [8, 2], c: 1 },
    { id: "harv", t: "Harvest {n} ripe crops", s: "harvests", n: [5, 1], c: 1 },
    { id: "cook", t: "Cook {n} meals", s: "cooked", n: [3, 1], c: 1 },
    { id: "eat", t: "Eat {n} things", s: "eaten", n: [4, 1], c: 1 },
    { id: "fish", t: "Catch {n} fish", s: "fish", n: [4, 1], c: 1, ok: function () { return S.rod > 0; } },
    { id: "prod", t: "Collect {n} eggs, truffles or milk", s: "collected", n: [3, 1], c: 1, ok: function () { return S.pets.length > 0; } },
    { id: "bugs", t: "Defeat {n} Bramble Bugs", s: "bugs", n: [5, 1], c: 2 },
    { id: "frogs", t: "Defeat {n} Swamp Frogs", s: "frogs", n: [3, 1], c: 2 },
    { id: "slime", t: "Defeat {n} slimes", s: "slimes", n: [4, 1], c: 2 },
    { id: "bats", t: "Defeat {n} Dusk Bats", s: "bats", n: [3, 1], c: 2 },
    { id: "cave", t: "Clear {n} cave floor", s: "cclear", n: [1, 0], c: 2 },
    { id: "chest", t: "Open {n} Cave Chests", s: "cchests", n: [2, 0], c: 2 },
    { id: "wasps", t: "Defeat {n} Ember Wasps", s: "wasps", n: [3, 1], c: 3 },
    { id: "gator", t: "Defeat {n} Bog Gators", s: "gators", n: [2, 0], c: 3 },
    { id: "wolf", t: "Defeat {n} Frost Wolves", s: "wolves", n: [3, 1], c: 4 },
    { id: "rare", t: "Catch {n} rare fish", s: "rarefish", n: [1, 0], c: 3, ok: function () { return S.rod > 0; } }
  ];
  var BTYW = [   // weekly: bigger jobs
    { id: "wmine", t: "Dig {n} blocks", s: "mined", n: [800, 200], c: 1 },
    { id: "wfish", t: "Catch {n} fish", s: "fish", n: [25, 5], c: 1, ok: function () { return S.rod > 0; } },
    { id: "wcook", t: "Cook {n} meals", s: "cooked", n: [15, 3], c: 1 },
    { id: "wharv", t: "Harvest {n} ripe crops", s: "harvests", n: [25, 5], c: 1 },
    { id: "whunt", t: "Defeat {n} creatures", s: "_kills", n: [30, 8], c: 2 },
    { id: "wcave", t: "Clear {n} cave floors", s: "cclear", n: [4, 1], c: 2 },
    { id: "wboss", t: "Defeat {n} bosses", s: "bossk", n: [2, 0], c: 3, ok: function () { return S.st.boss > 0; } }
  ];
  var BTY_POOL = [   // item rewards, by chapter reached (one is picked per bounty)
    [{ seed_carrot: 4 }, { torch: 8 }, { planks: 12 }, { roastcarrot: 2 }, { seed_potato: 3 }],
    [{ seed_pepper: 2 }, { grilledmeat: 2 }, { stone: 16 }, { rope: 2 }, { bogminnow: 3 }],
    [{ spore: 8 }, { charcoal: 6 }, { bogiron: 4 }, { stew: 1 }, { crystal: 2 }],
    [{ ironingot: 2 }, { cinder: 8 }, { chili: 2 }, { seed_frost: 2 }],
    [{ ironingot: 3 }, { crystal: 6 }, { berrypie: 1 }, { amethyst: 1 }],
    [{ amethyst: 1 }, { feast: 1 }, { ironingot: 4 }]
  ];
  var BSHOP = [   // the Swap Shop: [item, how many, token price, min chapter]
    ["seed_carrot", 6, 1, 1], ["seed_potato", 4, 1, 1], ["seed_pepper", 3, 2, 1], ["seed_frost", 3, 3, 3], ["torch", 16, 1, 1],
    ["ironingot", 3, 3, 2], ["feast", 1, 4, 3], ["lure_queen", 1, 5, 2], ["idol_wyrm", 1, 8, 3], ["horn_alpha", 1, 10, 4],
    ["amethyst", 1, 5, 3], ["ruby", 1, 9, 4], ["sapphire", 1, 9, 4], ["moonstone", 1, 9, 4], ["goldfrog", 1, 25, 1]
  ];
  BSHOP = BSHOP.filter(function (q) { return ITEMS[q[0]]; });
  BTY_POOL.forEach(function (L) { L.forEach(function (o) { Object.keys(o).forEach(function (k) { if (!ITEMS[k]) delete o[k]; }); }); });
  var BTY_CH = 1, talkView = "main", btyChk = 0;
  function dayKey() { var d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); }
  function weekKey(dk) { return Math.floor((dk + 3) / 7); }   // weeks start on Monday
  function btyStat(s) { return s === "_kills" ? ["bugs", "frogs", "bats", "wolves", "gators", "slimes", "wasps", "witches", "spiders"].reduce(function (a, k) { return a + (S.st[k] || 0); }, 0) : (S.st[s] || 0); }
  function btyOpen() { return curCh() >= BTY_CH; }
  function makeBty(list, avoid, weekly) {
    var c = curCh(), opts = list.filter(function (q) { return q.c <= c && avoid.indexOf(q.id) < 0 && (!q.ok || q.ok()); }); if (!opts.length) opts = list.filter(function (q) { return q.c <= 1; });
    var q = opts[Math.floor(Math.random() * opts.length)], need = q.n[0] + q.n[1] * Math.max(0, Math.min(c, 5) - 1);
    if (!weekly && need > 6) need = Math.round(need / 5) * 5;
    var pool = BTY_POOL[Math.min(c, BTY_POOL.length - 1)], rw = Object.assign({}, pool[Math.floor(Math.random() * pool.length)]);
    if (weekly) { var pool2 = BTY_POOL[Math.min(c + 1, BTY_POOL.length - 1)]; Object.assign(rw, pool2[Math.floor(Math.random() * pool2.length)]); }
    return { id: q.id, need: need, b: btyStat(q.s), tk: weekly ? 8 : need >= 5 && q.c >= 2 ? 3 : 2, rw: rw, done: 0 };
  }
  function btyDef(b) { var all = BTY.concat(BTYW); for (var i = 0; i < all.length; i++) if (all[i].id === b.id) return all[i]; return BTY[0]; }
  function btyProg(b) { return Math.max(0, Math.min(b.need, btyStat(btyDef(b).s) - b.b)); }
  function btyText(b) { return btyDef(b).t.replace("{n}", b.need); }
  function rollBounties() {
    if (!btyOpen()) return;
    var dk = dayKey(), wk = weekKey(dk), B = S.bty;
    if (B.day !== dk || B.d.length !== 3) { B.day = dk; B.rr = 0; B.full = 0; B.d = []; for (var i = 0; i < 3; i++) B.d.push(makeBty(BTY, B.d.map(function (q) { return q.id; }), false)); }
    if (B.wk !== wk || !B.w) { B.wk = wk; B.w = makeBty(BTYW, [], true); }
  }
  function btyReady() { if (!btyOpen() || !S.bty.d.length) return 0; return S.bty.d.concat(S.bty.w ? [S.bty.w] : []).filter(function (b) { return !b.done && btyProg(b) >= b.need; }).length; }
  function tickBounties(dt) {   // once a second: roll a new day's bounties, and say so when one is finished
    btyChk -= dt; if (btyChk > 0) return; btyChk = 1;
    if (!btyOpen()) return; rollBounties();
    S.bty.d.concat(S.bty.w ? [S.bty.w] : []).forEach(function (b) { if (!b.done && !b.told && btyProg(b) >= b.need) { b.told = 1; toast("Bounty done: " + btyText(b) + "! Visit Old Croaker to claim it.", "#f2c14e"); } });
  }
  function claimBty(i) {
    var b = i === "w" ? S.bty.w : S.bty.d[+i]; if (!b || b.done || btyProg(b) < b.need) return;
    b.done = 1; S.st.bounties++; var rw = Object.assign({ swamptoken: b.tk }, b.rw); giveRw(rw);
    var all = S.bty.d.every(function (q) { return q.done; });
    if (all && !S.bty.full) { S.bty.full = 1; give("swamptoken", 2, undefined, undefined, true); popup("All of today's bounties!", "+2 Croaker Tokens bonus", "#f2c14e", "✦"); }
    else popup("Bounty claimed", rewardText(rw), "#f2c14e", "✦");
    snd("coin"); checkGoals(); save();
  }
  function rerollBty(i) {
    if (S.bty.rr >= 1) { nag("Only one reroll a day. Come back tomorrow!"); return; }
    var b = S.bty.d[+i]; if (!b || b.done) return; S.bty.rr++;
    S.bty.d[+i] = makeBty(BTY, S.bty.d.map(function (q) { return q.id; }), false); thud(500, 0.04); save();
  }
  function buyShop(i) {
    var q = BSHOP[+i]; if (!q || curCh() < q[3]) return;
    if ((S.inv.swamptoken || 0) < q[2]) { nag("Not enough Croaker Tokens."); return; }
    S.inv.swamptoken -= q[2]; if (S.inv.swamptoken <= 0) delete S.inv.swamptoken; give(q[0], q[1], undefined, undefined, true); S.st.shopbuys++;
    snd("coin"); toast("Swapped for " + q[1] + " " + ITEMS[q[0]].n + "!", "#f2c14e"); reslot(); checkGoals(); save();
  }
  function btyCard(b, key, weekly) {
    var pr = btyProg(b), ok = pr >= b.need, rw = Object.assign({ swamptoken: b.tk }, b.rw);
    return '<div class="st-bty' + (b.done ? " done" : ok ? " ready" : "") + (weekly ? " wk" : "") + '"><div class="bt-top"><b>' + esc(btyText(b)) + "</b><em>" + (b.done ? "Claimed" : pr + " / " + b.need) + "</em></div>"
      + '<span class="bar"><i style="width:' + Math.round(pr / b.need * 100) + '%"></i></span><div class="bt-rw">' + Object.keys(rw).map(function (k) { return '<span><img alt="" src="' + icon(k) + '">' + rw[k] + "</span>"; }).join("")
      + (b.done ? "" : ok ? '<button type="button" class="btn" data-talk="claim:' + key + '">Claim</button>' : !weekly && S.bty.rr < 1 ? '<button type="button" class="btn ghost" data-talk="reroll:' + key + '">Reroll</button>' : "") + "</div></div>";
  }
  function renderBty() {
    rollBounties(); var B = S.bty, tk = S.inv.swamptoken || 0, h = '<div class="st-croak" aria-hidden="true">' + CROAK_SVG + "</div><small>Old Croaker's bounties</small><h2 class=\"st-hi\">Odd jobs around the swamp</h2>";
    h += '<p class="st-tok"><img alt="" src="' + icon("swamptoken") + '"><b>' + tk + "</b> Croaker Token" + (tk === 1 ? "" : "s") + "</p>";
    h += '<div class="st-bhead">Today <em>New jobs at midnight' + (B.full ? " · bonus claimed" : " · finish all 3 for +2 tokens") + "</em></div>" + B.d.map(function (b, i) { return btyCard(b, i, false); }).join("");
    if (B.w) h += '<div class="st-bhead">This week <em>New job every Monday</em></div>' + btyCard(B.w, "w", true);
    h += '<div class="st-row"><button type="button" class="btn ghost" data-talk="shop">Swap Shop</button><button type="button" class="btn ghost" data-talk="main">Back</button><button type="button" class="btn" data-story-close>Bye for now</button></div>';
    return h;
  }
  function renderShop() {
    var tk = S.inv.swamptoken || 0, c = curCh(), h = '<div class="st-croak" aria-hidden="true">' + CROAK_SVG + "</div><small>Old Croaker's Swap Shop</small><h2 class=\"st-hi\">“Tokens for treasures!”</h2>";
    h += '<p class="st-tok"><img alt="" src="' + icon("swamptoken") + '"><b>' + tk + "</b> Croaker Token" + (tk === 1 ? "" : "s") + '</p><div class="st-shop">';
    BSHOP.forEach(function (q, i) {
      var lock = c < q[3], can = !lock && tk >= q[2];
      h += '<button type="button" class="sh-it' + (lock ? " lock" : "") + '" data-talk="buy:' + i + '"' + (can ? "" : " disabled") + ' aria-label="' + esc(q[1] + " " + ITEMS[q[0]].n + " for " + q[2] + " tokens" + (lock ? ", unlocks in chapter " + (q[3] + 1) : "")) + '"><img alt="" src="' + icon(q[0]) + '"><b>' + (q[1] > 1 ? q[1] + " " : "") + esc(ITEMS[q[0]].n) + "</b><em>" + (lock ? "Chapter " + (q[3] + 1) : q[2] + (q[2] === 1 ? " token" : " tokens")) + "</em></button>";
    });
    h += '</div><div class="st-row"><button type="button" class="btn ghost" data-talk="bty">Bounties</button><button type="button" class="btn ghost" data-talk="main">Back</button><button type="button" class="btn" data-story-close>Bye for now</button></div>';
    return h;
  }
  // ---------- BOSSES ----------
  // Three chapter bosses, each called with a summon item crafted at the Workbench and used (pick it in the hotbar, tap) in its home land:
  //   Bramble Queen (Murkwater, Bramble Lure): charges in a line after a shudder ("!"), lobs thorn volleys, calls Bramble Bugs. She is DAZED after
  //     ramming a wall or finishing a charge: hits then deal 50% more.
  //   Magma Wyrm (Ember Bog, Ember Idol): swims through the ground (watch the dust), cracks the ground glowing, then bursts out in a leap or rears up to spit fire.
  //     It can only be hit while it is above ground.
  //   Frost Alpha (Frostfen, Frost Horn): stalks you, crouches then pounces (the landing sends ice shards along the ground: jump them), howls down icicles
  //     (watch their shadows) and calls Frost Wolves, and breathes frost up close.
  // Every boss gets ENRAGED under 40% health: faster, with more shots. Pass out or run far away and it leaves (the summon item is given back).
  // First kills set S.st.boss bits (1 queen, 2 wyrm, 4 alpha); S.st.bossk counts every boss kill.
  var BOSS = {
    queen: { n: "Bramble Queen", sub: "Queen of the Thorn Burrows", b: 0, hp: 260, w: 3.3, h: 2.1, dmg: 16, c: "#ff6b82", chip: "#9a52a8", item: "lure_queen", bit: 1, loot: { queenchitin: 3, spore: 12, bugfrag: 6, amethyst: 1, ironingot: 2 } },
    wyrm: { n: "Magma Wyrm", sub: "The Fire Under Ember Bog", b: 1, hp: 540, w: 2.3, h: 2.0, dmg: 22, c: "#ff8a3d", chip: "#ff5a1f", item: "idol_wyrm", bit: 2, loot: { wyrmscale: 3, cinder: 14, ruby: 1, ironingot: 4, charcoal: 8 } },
    alpha: { n: "Frost Alpha", sub: "Leader of the Frostfen Pack", b: 2, hp: 1150, w: 3.9, h: 2.3, dmg: 28, c: "#9fe8ff", chip: "#cfdde6", item: "horn_alpha", bit: 4, loot: { alphamane: 3, crystal: 10, sapphire: 1, moonstone: 1, wolfpelt: 4 } }
  };
  var BIO_NAMES = ["Murkwater Swamp", "Ember Bog", "Frostfen"];
  Object.keys(BOSS).forEach(function (k) { var B = BOSS[k]; ENEMY[k] = { n: B.n, hp: B.hp, w: B.w, h: B.h, dmg: B.dmg, glow: B.c, chip: B.chip, frag: null, chance: 0, max: 0 }; Object.keys(B.loot).forEach(function (q) { if (!ITEMS[q]) delete B.loot[q]; }); });
  // DIFFICULTY: everything is a little tougher than the base numbers above (creatures +15% health and damage, bosses +15% health and +10% damage).
  var HARD = { hp: 1.15, dmg: 1.15, bossHp: 1.15, bossDmg: 1.1 };
  Object.keys(ENEMY).forEach(function (k) { var d = ENEMY[k]; if (BOSS[k]) { BOSS[k].hp = d.hp = Math.round(BOSS[k].hp * HARD.bossHp); BOSS[k].dmg = d.dmg = Math.round(BOSS[k].dmg * HARD.bossDmg); } else { d.hp = Math.round(d.hp * HARD.hp); d.dmg = Math.round(d.dmg * HARD.dmg); } });
  var bshots = [], sumPrev = false, bossBarKey = "";
  function activeBoss() { for (var i = 0; i < enemies.length; i++) if (enemies[i].boss && !enemies[i].def) return enemies[i]; return null; }
  function minions() { var n = 0; enemies.forEach(function (q) { if (q.minion && !q.def) n++; }); return n; }
  function surfAt(x) { var cx = clamp(Math.floor(x), 0, W - 1), y = col[cx]; while (y < H - 1 && (get(cx, y) === T.LEAVES || get(cx, y) === T.LOG || !blocks(cx, y))) y++; return y; }
  function shoot(x, y, vx, vy, o) { bshots.push(Object.assign({ x: x, y: y, vx: vx, vy: vy, g: 0, r: 0.28, dmg: 10, k: "thorn", life: 4, wait: 0, why: "boss" }, o)); }
  function newBoss(k, x, y) {
    var B = BOSS[k], e = newEnemy("bug", x, y);
    Object.assign(e, { k: k, boss: 1, w: B.w, h: B.h, hp: Math.round(B.hp * dif().ehp), mx: Math.round(B.hp * dif().ehp), dmg: B.dmg, st: "intro", t: 1.8, cd: 1.5, dir: p.x < x ? -1 : 1, rage: 0, u: false, hist: [], dust: 0 });
    return e;
  }
  function useSummon(dt) {
    mine = null; var press = aim.down && !sumPrev; sumPrev = aim.down; if (!press) return;
    var it = ITEMS[sel], k = it && it.summon, B = BOSS[k]; if (!B) return;
    if (MP.on && MP.role === "guest") { nag("Only the host can call a boss in this world."); return; }
    if (cave) { nag("Bosses only answer the call on the surface world."); return; }
    if (activeBoss()) { nag("Finish this fight first!"); return; }
    if (world.bio[clamp(Math.floor(p.x), 0, W - 1)] !== B.b) { nag("The " + it.n + " only works in " + BIO_NAMES[B.b] + "."); return; }
    if (!S.wpn) { nag("You'll want a weapon for this!"); return; }
    var side = p.face || 1, x = clamp(p.x + side * 9, 4, W - 5), y = -1;
    if (k === "wyrm") { x = clamp(p.x + side * 7, 4, W - 5); y = surfAt(x) + 2; }
    else for (var tq = 0; tq < 12 && y < 0; tq++) {
      var tx = clamp(Math.floor(x) + (tq % 2 ? 1 : -1) * Math.ceil(tq / 2), 3, W - 4), cy = surfAt(tx);
      for (var up = 0; up <= 3; up++) if (!eBoxHit(tx + 0.5, cy - up, B.w, B.h)) { x = tx + 0.5; y = cy - up; break; }
    }
    if (y < 0) { x = p.x + side * 3; y = p.y; }
    S.inv[sel]--; if (S.inv[sel] <= 0) { delete S.inv[sel]; sel = "pick"; } reslot(); hbDirty = true; S.bossOn = B.item;   // given back if the page closes mid-fight
    var e = newBoss(k, x, y); if (k === "wyrm") { e.u = true; e.st = "under"; e.t = 1.4; }
    enemies.forEach(function (q) { if (!q.boss && !q.def && Math.abs(q.x - p.x) < 20) q.gone = true; });   // the small fry scatter
    enemies.push(e); shake = 0.8; snd("open", "Epic"); thud(80, 0.12);
    popup(B.n + " awakens!", B.sub, B.c, "☠"); S.st.summons++; save();
  }
  function bossLeaves(e, why) {
    var B = BOSS[e.k]; e.gone = true; bshots.length = 0; S.bossOn = "";
    enemies.forEach(function (q) { if (q.minion) q.gone = true; });
    give(B.item, 1, undefined, undefined, true);
    toast("The " + B.n + (why === "far" ? " lost your trail and went back to its lair." : " went back to its lair.") + " Your " + ITEMS[B.item].n + " is back in your bag.", B.c);
  }
  function bossGone() { enemies.forEach(function (e) { if (e.boss && !e.def && !e.gone) bossLeaves(e, "faint"); }); bshots.length = 0; }
  function damageBoss(e, dmg, face) {
    var B = BOSS[e.k]; if (e.def || e.u || e.st === "intro") return;
    if (e.st === "dazed") dmg = Math.round(dmg * 1.5);
    if (hasCharm("king")) dmg = Math.round(dmg * 1.25);   // the Swampking Sigil
    if (gem("wpn", "moonstone")) dmg = Math.round(dmg * 1.3);
    e.hp -= dmg; e.hurt = 0.16; e.kv = face * 1.2; text(e.x, e.y - e.h - 0.4, "-" + Math.round(dmg) + (e.st === "dazed" ? "!" : ""), e.st === "dazed" ? "#ffb13b" : "#ffe48a");
    chips(e.x, e.y - e.h * 0.5, B.chip, 8, 6); thud(150 + Math.random() * 50, 0.06);
    if (e.hp > 0) { if (!e.rage && e.hp < e.mx * 0.4) { e.rage = 1; shake = 0.6; toast("The " + B.n + " is enraged!", B.c); thud(70, 0.12); } return; }
    e.def = true; e.dead = 1.6; e.u = false; bshots.length = 0; S.bossOn = ""; shake = 1; chips(e.x, e.y - e.h * 0.5, B.c, 30, 10);
    enemies.forEach(function (q) { if (q.minion && !q.def) q.gone = true; });
    var first = !(S.st.boss & B.bit); S.st.boss |= B.bit; S.st.bossk++; if (MP.role === "host" && MP.npeers) mpSend({ t: "bosswin", k: e.k });
    var L = Object.assign({}, B.loot); if (first) L[B.item] = 0;
    Object.keys(L).forEach(function (q, i) { if (L[q] > 0) setTimeout(function () { give(q, L[q], e.x - 0.5 + (i - 2) * 0.4, e.y - e.h - 0.8, true); }, 250 + i * 140); });
    setTimeout(function () { banner(B.n + " defeated!", (first ? "First victory! " : "") + rewardText(L), "Boss"); snd("open", "Epic"); }, 500);
    checkTrail(); checkGoals(); save();
  }
  function bossContact(e, n) { if (hurtGrace <= 0 && hp > 0 && overlapP(e)) { hurt(Math.round(n), e.k); shoved(e); return true; } return false; }
  function updBoss(e, dt) {
    var B = BOSS[e.k], sp = e.rage ? 1.35 : 1;
    if (Math.abs(e.x - p.x) > 46 || Math.abs(e.y - p.y) > 40) { bossLeaves(e, "far"); return; }
    e.t -= dt; var h0 = e.hist[0]; if (!h0 || Math.abs(h0[0] - e.x) + Math.abs(h0[1] - e.y) > 0.08) { e.hist.unshift([e.x, e.y]); if (e.hist.length > 160) e.hist.pop(); }
    if (e.k === "queen") updQueen(e, dt, B, sp); else if (e.k === "wyrm") updWyrm(e, dt, B, sp); else updAlpha(e, dt, B, sp);
  }
  function updQueen(e, dt, B, sp) {
    var dx = p.x - e.x, ad = Math.abs(dx), vx = 0;
    if (e.st === "intro") { if (e.t <= 0) { e.st = "walk"; e.cd = 1; } }
    else if (e.st === "walk") {
      e.dir = dx >= 0 ? 1 : -1; vx = ad > 1.2 ? e.dir * 1.8 * sp : 0; if (e.blocked && e.on) e.vy = -12;
      if (e.cd <= 0) {
        var r = Math.random();
        if (e.hp < e.mx * 0.6 && minions() < 2 && r < 0.25) { e.st = "brood"; e.t = 0.9; }
        else if (ad < 10 && r < 0.62) { e.st = "wind"; e.t = 0.75 / sp; thud(200, 0.05); }
        else { e.st = "volley"; e.t = 0.6; }
      }
    } else if (e.st === "wind") { if (e.t <= 0) { e.st = "charge"; e.t = 1.25; thud(120, 0.09); } }
    else if (e.st === "charge") {
      vx = e.dir * 10 * sp; if (e.on && Math.random() < 0.5) parts.push({ x: e.x - e.dir * 1.2, y: e.y - 0.1, vx: -e.dir * 2, vy: -1.5, life: 0.4, max: 0.4, c: "#7a5a3a", s: 3 });
      if (e.blocked || e.t <= 0) { e.st = "dazed"; e.t = 1.6; if (e.blocked) { shake = 0.5; chips(e.x + e.dir * 1.3, e.y - 0.8, "#a08060", 12, 6); thud(90, 0.1); } }
    } else if (e.st === "dazed") { if (e.t <= 0) { e.st = "walk"; e.cd = 1.4 / sp; } }
    else if (e.st === "volley") {
      if (e.t <= 0) {
        var n = e.rage ? 7 : 5, x0 = e.x + e.dir * 0.9, y0 = e.y - e.h * 0.9, g2 = 18, Tm = 0.95;
        for (var i = 0; i < n; i++) { var tx = p.x + (i - (n - 1) / 2) * 1.5; shoot(x0, y0, (tx - x0) / Tm, ((p.y - 0.6 - y0) - 0.5 * g2 * Tm * Tm) / Tm, { g: g2, dmg: 9, k: "thorn" }); }
        thud(420, 0.05); e.st = "walk"; e.cd = 2.2 / sp;
      }
    } else if (e.st === "brood") {
      if (e.t <= 0) {
        [-1, 1].forEach(function (s2) { var bx = clamp(e.x + s2 * 1.8, 2, W - 2); if (!eBoxHit(bx, e.y, ENEMY.bug.w, ENEMY.bug.h)) { var m = newEnemy("bug", bx, e.y); m.minion = true; m.vy = -6; enemies.push(m); chips(bx, e.y - 0.4, "#9a52a8", 8, 4); } });
        e.st = "walk"; e.cd = 2;
      }
    }
    moveEnemy(e, dt, vx);
    if (e.st !== "dazed" && e.st !== "intro") bossContact(e, e.st === "charge" ? B.dmg * 1.4 : B.dmg * 0.7);
  }
  function updWyrm(e, dt, B, sp) {
    var dx = p.x - e.x, s0 = surfAt(e.x);
    if (e.st === "under") {
      e.u = true; e.x = clamp(e.x + clamp(dx, -1, 1) * 5.5 * sp * dt, 2, W - 2); e.y = s0 + 2.2;
      e.dust -= dt; if (e.dust <= 0) { e.dust = 0.07; parts.push({ x: e.x + (Math.random() - 0.5) * 0.8, y: s0, vx: (Math.random() - 0.5) * 2, vy: -2 - Math.random() * 2, life: 0.5, max: 0.5, c: "#8a6a5a", s: 3 }); }
      if (e.t <= 0 && Math.abs(dx) < 6) { e.st = "crack"; e.t = 0.7 / sp; thud(90, 0.08); }
      else if (e.t < -3) { e.st = "crack"; e.t = 0.7 / sp; }
    } else if (e.st === "crack") {
      e.y = s0 + 2.2; e.dust -= dt; if (e.dust <= 0) { e.dust = 0.04; parts.push({ x: e.x + (Math.random() - 0.5) * 1.6, y: s0, vx: (Math.random() - 0.5) * 3, vy: -3 - Math.random() * 3, life: 0.45, max: 0.45, c: Math.random() < 0.5 ? "#ff8a3d" : "#ffd23f", s: 3 }); }
      if (e.t <= 0) {
        e.u = false; shake = 0.4; chips(e.x, s0, "#ff8a3d", 14, 8);
        if (Math.random() < (e.rage ? 0.5 : 0.62)) { e.st = "leap"; e.y = s0 + 0.5; e.vy = -17; e.lv = clamp((p.x - e.x) / 1.4, -7, 7); }
        else { e.st = "spit"; e.y = s0 + 0.3; e.t = 2; e.shots = e.rage ? 4 : 3; e.cd = 0.45; }
      }
    } else if (e.st === "leap") {
      e.vy += 26 * dt; e.x = clamp(e.x + e.lv * dt, 2, W - 2); e.y += e.vy * dt; e.dir = e.lv >= 0 ? 1 : -1;
      if (e.vy > 0 && e.y > surfAt(e.x) + 1.4) { e.st = "under"; e.t = 1.4 + Math.random() * 0.8; chips(e.x, surfAt(e.x), "#ff8a3d", 10, 6); shake = 0.3; }
    } else if (e.st === "spit") {
      e.y = s0 + 0.3; e.dir = dx >= 0 ? 1 : -1;
      if (e.cd <= 0 && e.shots > 0) { e.shots--; e.cd = 0.5 / sp; var hx = e.x + e.dir * 0.8, hy = e.y - e.h, Tm = 0.8; shoot(hx, hy, (p.x - hx) / Tm, ((p.y - 0.8 - hy) - 0.5 * 8 * Tm * Tm) / Tm, { g: 8, dmg: 13, k: "fire", r: 0.36 }); thud(260, 0.05); }
      if (e.t <= 0) { e.st = "under"; e.u = true; e.t = 1.2 + Math.random(); chips(e.x, s0, "#ff8a3d", 8, 5); }
    } else if (e.st === "intro") { if (e.t <= 0) { e.st = "under"; e.t = 1; } }
    if (!e.u) bossContact(e, B.dmg);
  }
  function updAlpha(e, dt, B, sp) {
    var dx = p.x - e.x, ad = Math.abs(dx), vx = 0;
    if (e.st === "intro") { if (e.t <= 0) { e.st = "stalk"; e.cd = 1; } }
    else if (e.st === "stalk") {
      e.dir = dx >= 0 ? 1 : -1; vx = ad > 5 ? e.dir * 3 * sp : ad < 3 ? -e.dir * 1.4 : 0; if (e.blocked && e.on) e.vy = -12;
      if (e.cd <= 0 && e.on) {
        var r = Math.random();
        if (ad < 4.5 && r < 0.3) { e.st = "breathwind"; e.t = 0.5; }
        else if (r < 0.62) { e.st = "crouch"; e.t = 0.6 / sp; thud(180, 0.05); }
        else { e.st = "howl"; e.t = 1.1; thud(330, 0.08); }
      }
    } else if (e.st === "crouch") { if (e.t <= 0) { e.st = "pounce"; e.vy = -13; e.on = false; e.pv = clamp(dx / 1.0, -11, 11); e.air = 0; } }
    else if (e.st === "pounce") {
      vx = e.pv; e.air += dt;
      if (e.on && e.air > 0.15) {
        shake = 0.5; chips(e.x, e.y, "#cfeaff", 16, 7); thud(100, 0.1);
        [-1, 1].forEach(function (s2) { shoot(e.x + s2 * 1.4, e.y - 0.3, s2 * 8.5 * sp, 0, { k: "shard", dmg: 14, life: 1, r: 0.3, ground: 1 }); });
        e.st = "stalk"; e.cd = 1.7 / sp;
      }
    } else if (e.st === "howl") {
      if (e.t <= 0) {
        var n = e.rage ? 8 : 5;
        for (var i = 0; i < n; i++) { var ix = p.x + (i - (n - 1) / 2) * 1.7 + (Math.random() - 0.5) * 0.6; shoot(ix, p.y - 8, 0, 0, { k: "ice", g: 30, dmg: 15, wait: 0.75 + i * 0.1, r: 0.3 }); }
        if (e.hp < e.mx * 0.7 && minions() < 2) [-1, 1].forEach(function (s2) { var wx = clamp(p.x + s2 * 9, 3, W - 3), wy = surfAt(wx); if (!eBoxHit(wx, wy, ENEMY.wolf.w, ENEMY.wolf.h)) { var m = newEnemy("wolf", wx, wy); m.minion = true; enemies.push(m); } });
        e.st = "stalk"; e.cd = 2 / sp;
      }
    } else if (e.st === "breathwind") { if (e.t <= 0) { e.st = "breath"; e.t = 1.1; } }
    else if (e.st === "breath") {
      for (var q = 0; q < 3; q++) parts.push({ x: e.x + e.dir * 1.7, y: e.y - e.h * 0.75, vx: e.dir * (6 + Math.random() * 4), vy: (Math.random() - 0.5) * 2.4, life: 0.5, max: 0.5, c: Math.random() < 0.5 ? "#e8f8ff" : "#9fe8ff", s: 4 });
      var fx = (p.x - e.x) * e.dir; if (fx > 0 && fx < 5.2 && Math.abs(p.y - e.y) < 1.8 && hurtGrace <= 0 && hp > 0) hurt(10, "alpha");
      if (e.t <= 0) { e.st = "stalk"; e.cd = 1.5 / sp; }
    }
    moveEnemy(e, dt, vx);
    if (e.st !== "intro") bossContact(e, e.st === "pounce" ? B.dmg : B.dmg * 0.6);
  }
  function updateShots(dt) {
    for (var i = bshots.length - 1; i >= 0; i--) {
      var s = bshots[i];
      if (s.wait > 0) { s.wait -= dt; continue; }
      s.life -= dt; s.vy += s.g * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.ground) { var gy = surfAt(s.x); if (Math.abs(gy - s.y) < 2) s.y = gy - 0.3; }
      var hitR = MP.role === "host" && MP.npeers ? mpShotHit(s) : false, hitP = hp > 0 && s.x + s.r > p.x - PW / 2 && s.x - s.r < p.x + PW / 2 && s.y + s.r > p.y - PH && s.y - s.r < p.y;
      if (hitP && hurtGrace <= 0) { hurt(s.dmg, s.why); p.vx = (s.vx >= 0 ? 1 : -1) * 4; }
      if (hitP || hitR || s.life <= 0 || (!s.ground && blocks(Math.floor(s.x), Math.floor(s.y))) || (s.ground && blocks(Math.floor(s.x + Math.sign(s.vx) * 0.3), Math.floor(s.y)))) {
        if (s.k === "hex") { chips(s.x, s.y, "#b06aff", 14, 6); chips(s.x, s.y, "#cfeaf2", 5, 4); thud(1500, 0.03); if (hitP) { hexSlow = 2.5; toast("Hexed! You are slowed for a moment.", "#b06aff"); } }
        else chips(s.x, s.y, s.k === "fire" ? "#ff8a3d" : s.k === "thorn" ? "#7ad06a" : "#cfeaff", 6, 4); bshots.splice(i, 1);
      }
    }
  }
  function drawShots(g, now) {
    bshots.forEach(function (s) {
      var sx = ox + s.x * ts, sy = oy + s.y * ts; g.save(); g.translate(sx, sy); g.scale(ts / 30, ts / 30);
      if (s.wait > 0) {   // icicle telegraph: a shadow on the ground, and the icicle forming up high
        var gy = (surfAt(s.x) - s.y) * 30, a = 1 - s.wait / 1.6; g.fillStyle = "rgba(20,40,60," + (0.25 + 0.35 * a) + ")"; g.beginPath(); g.ellipse(0, gy, 6 + 4 * a, 2.2, 0, 0, 7); g.fill();
        g.globalAlpha = 0.5 + 0.5 * a;
      }
      if (s.k === "hex") {   // a spinning bottle of purple hex
        g.rotate(now / 90); g.fillStyle = "rgba(176,106,255,.3)"; g.beginPath(); g.arc(0, 0, 10, 0, 7); g.fill();
        g.fillStyle = "#cfeaf2"; g.fillRect(-4, -6, 8, 11); g.fillStyle = "#b06aff"; g.fillRect(-4, -1, 8, 6); g.fillStyle = "#8a6a3a"; g.fillRect(-2, -9, 4, 3);
      } else if (s.k === "fire") {
        g.fillStyle = "rgba(255,120,40,.35)"; g.beginPath(); g.arc(0, 0, 13, 0, 7); g.fill();
        g.fillStyle = "#ff6a1f"; g.beginPath(); g.arc(0, 0, 8, 0, 7); g.fill(); g.fillStyle = "#ffd23f"; g.beginPath(); g.arc(-1, -1, 4.5, 0, 7); g.fill();
      } else if (s.k === "thorn") {
        g.rotate(Math.atan2(s.vy, s.vx)); g.fillStyle = "#3f7a2a"; g.strokeStyle = "#1f3a14"; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(10, 0); g.lineTo(-6, -3.5); g.lineTo(-3, 0); g.lineTo(-6, 3.5); g.closePath(); g.fill(); g.stroke(); g.fillStyle = "#c06aff"; g.fillRect(-5, -1, 4, 2);
      } else if (s.k === "ice") {
        g.fillStyle = "#e8f8ff"; g.strokeStyle = "#5aa8d8"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-4.5, -12); g.lineTo(4.5, -12); g.lineTo(0, 10); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = "#9fe8ff"; g.fillRect(-1, -11, 2, 12);
      } else {
        g.fillStyle = "#cfeaff"; g.strokeStyle = "#5aa8d8"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-7, 8); g.lineTo(-2, -9); g.lineTo(1, 2); g.lineTo(4, -6); g.lineTo(7, 8); g.closePath(); g.fill(); g.stroke();
      }
      g.restore();
    });
  }
  function drawBossBar() {
    var e = activeBoss(), el = $("sbxBoss"); if (!el) return;
    var key = e ? e.k + ":" + Math.max(0, Math.ceil(e.hp)) + ":" + e.rage : "";
    if (key === bossBarKey) return; bossBarKey = key; el.hidden = !e; stageEl.classList.toggle("bossfight", !!e); if (!e) return;
    var B = BOSS[e.k]; el.style.setProperty("--bc", B.c); el.classList.toggle("rage", !!e.rage);
    el.querySelector("b").textContent = B.n + (e.rage ? " (enraged)" : ""); el.querySelector("i").style.width = Math.max(0, e.hp / e.mx * 100) + "%"; el.querySelector("em").textContent = Math.max(0, Math.ceil(e.hp)) + " / " + e.mx;
  }
  function drawBoss(g, e, now) {
    var sx = ox + e.x * ts, sy = oy + e.y * ts; if (sx < -ts * 6 || sx > vw + ts * 6 || sy < -ts * 6 || sy > vh + ts * 8) return;
    var t = e.tt, fl = e.hurt > 0.08, pd = e.def ? 1 - e.dead / 1.6 : 0;
    if (e.k === "wyrm") return drawWyrm(g, e, now, fl, pd);
    g.save(); g.translate(sx, sy + ts * 0.04); g.scale(ts / 30, ts / 30);
    if (pd) { g.globalAlpha = Math.max(0, 1 - pd); g.translate(0, pd * 6); }
    g.fillStyle = "rgba(0,0,0,.32)"; g.beginPath(); g.ellipse(0, 0, e.w * 13, 4.5, 0, 0, 7); g.fill();
    var jit = (e.st === "wind" || e.st === "crouch" || e.st === "breathwind") && !reduce ? Math.sin(now / 22) * 1.4 : 0;
    g.translate(jit, 0); g.scale(e.dir, 1); g.lineJoin = "round"; g.lineCap = "round";
    g.scale(1.28, 1.28); if (e.k === "queen") drawQueen(g, e, t, now, fl); else drawAlpha(g, e, t, now, fl);
    g.restore();
    if ((e.st === "wind" || e.st === "crouch") && !e.def) { g.save(); g.translate(sx, sy - e.h * ts - ts * 0.9); g.fillStyle = "#ff5a3a"; g.font = "900 " + Math.round(ts * 0.8) + "px Nunito,sans-serif"; g.textAlign = "center"; g.fillText("!", 0, 0); g.restore(); }
    if (e.st === "dazed" && !reduce) { g.save(); g.translate(sx + e.dir * ts * 1.1, sy - e.h * ts - ts * 0.2); for (var q = 0; q < 3; q++) { var a = now / 200 + q * 2.1; g.fillStyle = "#ffe48a"; g.font = "900 " + Math.round(ts * 0.45) + "px Nunito,sans-serif"; g.fillText("★", Math.cos(a) * ts * 0.6, Math.sin(a) * ts * 0.2); } g.restore(); }
  }
  function drawQueen(g, e, t, now, fl) {
    var walk = e.st === "walk" || e.st === "charge", sp = e.st === "charge" ? 22 : 9, ang = e.st === "wind" || e.st === "charge";
    for (var l = 0; l < 6; l++) {   // six legs
      var lx = -26 + l * 10, sw = walk ? Math.sin(t * sp + l * 1.7) * 4 : 0; g.strokeStyle = l % 2 ? "#3a1a44" : "#4a2456"; g.lineWidth = 3.4;
      g.beginPath(); g.moveTo(lx, -14); g.lineTo(lx + sw - 3, -7); g.lineTo(lx + sw, 0); g.stroke();
    }
    g.fillStyle = fl ? "#ffffff" : "#5a2468"; g.strokeStyle = "#2a0c34"; g.lineWidth = 2;   // abdomen and shell
    g.beginPath(); g.ellipse(-12, -24, 26, 17, -0.08, 0, 7); g.fill(); g.stroke();
    if (!fl) { g.fillStyle = "#8a3aa0"; g.beginPath(); g.ellipse(-14, -30, 18, 8, -0.1, 0, 7); g.fill(); g.strokeStyle = "#2a0c34"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-12, -40); g.lineTo(-12, -9); g.stroke(); }
    g.fillStyle = "#2f5a2a"; g.strokeStyle = "#16300f"; g.lineWidth = 1.2;   // bramble thorns along the back
    [[-34, -30], [-26, -38], [-16, -41], [-6, -40], [3, -35]].forEach(function (q, i) { g.beginPath(); g.moveTo(q[0] - 3, q[1] + 2); g.lineTo(q[0] + (i % 2 ? 1 : -1), q[1] - 9); g.lineTo(q[0] + 3, q[1] + 2); g.closePath(); g.fill(); g.stroke(); });
    g.fillStyle = "#ff6b82"; [[-28, -22], [-8, -18], [-20, -14]].forEach(function (q) { g.beginPath(); g.arc(q[0], q[1], 2.2, 0, 7); g.fill(); });   // glowing spots
    g.fillStyle = fl ? "#ffffff" : "#4a1c56"; g.strokeStyle = "#2a0c34"; g.lineWidth = 2; g.beginPath(); g.ellipse(18, -20, 14, 12, 0, 0, 7); g.fill(); g.stroke();   // head
    g.strokeStyle = "#1a0820"; g.lineWidth = 3; var mo = e.st === "volley" ? 4 : Math.sin(t * 6) * 1.5;   // mandibles
    g.beginPath(); g.moveTo(28, -16); g.quadraticCurveTo(37, -18 - mo, 35, -9); g.stroke(); g.beginPath(); g.moveTo(28, -11); g.quadraticCurveTo(37, -6 + mo, 33, -2); g.stroke();
    var ec = ang ? "#ff3a3a" : "#ff6b82"; g.fillStyle = ec; g.shadowColor = ec; g.shadowBlur = lowq ? 0 : 8; g.beginPath(); g.arc(22, -24, 3.2, 0, 7); g.fill(); g.beginPath(); g.arc(14, -25, 2.6, 0, 7); g.fill(); g.shadowBlur = 0;
    g.strokeStyle = "#3a1a44"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(16, -31); g.quadraticCurveTo(20, -44, 30, -42); g.stroke(); g.beginPath(); g.moveTo(22, -31); g.quadraticCurveTo(30, -40, 36, -34); g.stroke();   // antennae
    g.fillStyle = "#f2c14e"; g.strokeStyle = "#8a5a10"; g.lineWidth = 1.2;   // her crown
    g.beginPath(); g.moveTo(9, -30); g.lineTo(9, -37); g.lineTo(13, -33); g.lineTo(17, -40); g.lineTo(21, -33); g.lineTo(25, -37); g.lineTo(25, -30); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#ff3a5a"; g.beginPath(); g.arc(17, -33, 1.6, 0, 7); g.fill();
  }
  function drawAlpha(g, e, t, now, fl) {
    var walk = e.st === "stalk" && Math.abs(e.vx || 0) >= 0, low = e.st === "crouch" ? 6 : 0, howl = e.st === "howl", air = e.st === "pounce" && !e.on, bob = Math.sin(t * 7) * (walk ? 1.2 : 0.4);
    g.translate(0, low);
    var legs = [[-26, 0], [-16, 2], [16, 1], [26, 3]];
    legs.forEach(function (q, i) { var sw = air ? (i < 2 ? -6 : 6) : Math.sin(t * 8 + q[1]) * 4; g.strokeStyle = i % 2 ? "#a8c0d0" : "#cfe0ea"; g.lineWidth = 5; g.beginPath(); g.moveTo(q[0], -20); g.lineTo(q[0] + sw, -low - 1); g.stroke(); });
    g.fillStyle = fl ? "#ffffff" : "#dfeaf2"; g.strokeStyle = "#5a7a8e"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-40, -36); g.quadraticCurveTo(-56, -50, -50, -30); g.quadraticCurveTo(-46, -26, -38, -28); g.closePath(); g.fill(); g.stroke();   // tail
    g.beginPath(); g.ellipse(0, -28 + bob, 36, 13, 0, 0, 7); g.fill(); g.stroke();   // body
    g.fillStyle = "#b8ccda"; g.beginPath(); g.ellipse(4, -22 + bob, 24, 6, 0, 0, 7); g.fill();
    g.fillStyle = "#9fe8ff"; g.strokeStyle = "#3a7aa8"; g.lineWidth = 1.2;   // icy mane spikes
    for (var m = 0; m < 6; m++) { var mx = 6 + m * 5, my = -38 + bob + Math.abs(m - 2) * 1.5; g.beginPath(); g.moveTo(mx - 4, my + 6); g.lineTo(mx - 2, my - 9 - (m === 2 ? 4 : 0)); g.lineTo(mx + 3, my + 6); g.closePath(); g.fill(); g.stroke(); }
    g.save(); g.translate(34, -34 + bob); if (howl) g.rotate(-0.7); else if (e.st === "breath" || e.st === "breathwind") g.rotate(0.12);
    g.fillStyle = fl ? "#ffffff" : "#e8f2f8"; g.strokeStyle = "#5a7a8e"; g.lineWidth = 2; g.beginPath(); g.ellipse(0, 0, 13, 10, 0, 0, 7); g.fill(); g.stroke();   // head
    g.beginPath(); g.moveTo(8, -3); g.lineTo(24, 1); g.lineTo(23, 6); g.lineTo(6, 8); g.closePath(); g.fill(); g.stroke();   // snout
    g.fillStyle = "#2a3a4a"; g.beginPath(); g.arc(23, 2, 2.2, 0, 7); g.fill();
    var open = howl || e.st === "breath"; if (open) { g.fillStyle = "#3a1a24"; g.beginPath(); g.moveTo(10, 6); g.lineTo(22, 6); g.lineTo(12, 12); g.closePath(); g.fill(); }
    g.fillStyle = "#dfeaf2"; g.strokeStyle = "#5a7a8e"; g.beginPath(); g.moveTo(-6, -7); g.lineTo(-4, -20); g.lineTo(3, -8); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-1, -8); g.lineTo(3, -19); g.lineTo(7, -7); g.closePath(); g.fill(); g.stroke();   // ears
    var ec = e.rage ? "#ff5a7a" : "#3ad8ff"; g.fillStyle = ec; g.shadowColor = ec; g.shadowBlur = lowq ? 0 : 8; g.beginPath(); g.ellipse(6, -2, 2.8, 1.8, -0.2, 0, 7); g.fill(); g.shadowBlur = 0;
    g.fillStyle = "#7fd6ff"; g.strokeStyle = "#3a7aa8"; g.lineWidth = 1; g.beginPath(); g.moveTo(-8, -9); g.lineTo(-6, -17); g.lineTo(-3, -11); g.lineTo(0, -19); g.lineTo(3, -11); g.lineTo(-2, -8); g.closePath(); g.fill(); g.stroke();   // ice crown
    g.restore();
  }
  function drawWyrm(g, e, now, fl, pd) {
    var H0 = e.hist, n = 11, segs = [], acc = 0, gap = 0.62;   // body segments sit every 0.62 tiles along the path the head took
    for (var hi = 1; hi < H0.length && segs.length < n; hi++) { var ddx = H0[hi][0] - H0[hi - 1][0], ddy = H0[hi][1] - H0[hi - 1][1]; acc += Math.sqrt(ddx * ddx + ddy * ddy); if (acc >= gap) { acc = 0; segs.push(H0[hi]); } }
    for (var i = segs.length; i >= 1; i--) {   // parts inside the ground are hidden
      var q = segs[i - 1];
      if (blocks(Math.floor(q[0]), Math.floor(q[1] - 0.4))) continue;
      var r = (19 - i * 1.05) * ts / 30, sx2 = ox + q[0] * ts, sy2 = oy + (q[1] - 0.8) * ts;
      g.globalAlpha = pd ? Math.max(0, 1 - pd) : 1;
      g.fillStyle = fl ? "#ffffff" : i % 2 ? "#3a1a14" : "#4a2418"; g.strokeStyle = "#1a0804"; g.lineWidth = Math.max(1, ts / 18); g.beginPath(); g.arc(sx2, sy2, r, 0, 7); g.fill(); g.stroke();
      g.fillStyle = "#ff6a1f"; g.beginPath(); g.arc(sx2, sy2 - r * 0.15, r * 0.45, 0, 7); g.fill();
      g.fillStyle = "#ffd23f"; g.globalAlpha *= 0.6 + 0.4 * Math.sin(now / 160 + i); g.beginPath(); g.arc(sx2, sy2 - r * 0.2, r * 0.2, 0, 7); g.fill(); g.globalAlpha = 1;
    }
    if (e.u && !e.def) {   // underground: a glowing crack where it will come up
      if (e.st === "crack") { var cx = ox + e.x * ts, cy = oy + surfAt(e.x) * ts; g.save(); g.globalAlpha = 0.55 + 0.45 * Math.sin(now / 50); g.strokeStyle = "#ffb13b"; g.lineWidth = Math.max(2, ts / 10); g.beginPath(); g.moveTo(cx - ts, cy); g.lineTo(cx - ts * 0.4, cy - ts * 0.1); g.lineTo(cx, cy + ts * 0.05); g.lineTo(cx + ts * 0.5, cy - ts * 0.1); g.lineTo(cx + ts, cy); g.stroke(); g.restore(); }
      return;
    }
    var hs = ox + e.x * ts, hy = oy + (e.y - 0.95) * ts; g.save(); g.translate(hs, hy); g.scale(ts / 30 * 1.45, ts / 30 * 1.45);
    if (pd) g.globalAlpha = Math.max(0, 1 - pd);
    var up = e.st === "leap" ? Math.atan2(e.vy, e.lv * 3) : 0; g.scale(e.dir, 1); g.rotate(e.st === "leap" ? up * 0.6 * e.dir * e.dir : 0);
    g.fillStyle = fl ? "#ffffff" : "#4a2418"; g.strokeStyle = "#1a0804"; g.lineWidth = 2; g.beginPath(); g.ellipse(0, 0, 18, 14, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(8, -8); g.lineTo(28, -3); g.lineTo(27, 3); g.lineTo(8, 4); g.closePath(); g.fill(); g.stroke();   // upper jaw
    var jaw = e.st === "spit" ? 5 + Math.sin(now / 80) * 2 : 2; g.beginPath(); g.moveTo(6, 5); g.lineTo(24, 5 + jaw); g.lineTo(6, 12); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#ffd23f"; g.beginPath(); g.moveTo(8, 4); g.lineTo(26, 4); g.lineTo(24, 4 + jaw * 0.6); g.lineTo(8, 6); g.closePath(); g.fill();   // fire inside the mouth
    g.fillStyle = "#e8d8c0"; [12, 17, 22].forEach(function (tx) { g.beginPath(); g.moveTo(tx, 3); g.lineTo(tx + 1.5, 6); g.lineTo(tx + 3, 3); g.fill(); });
    g.fillStyle = "#2a1008"; g.strokeStyle = "#1a0804"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-6, -10); g.quadraticCurveTo(-16, -26, -2, -30); g.quadraticCurveTo(-10, -20, 0, -12); g.closePath(); g.fill(); g.stroke();   // horns
    g.beginPath(); g.moveTo(2, -12); g.quadraticCurveTo(0, -26, 12, -26); g.quadraticCurveTo(4, -20, 8, -11); g.closePath(); g.fill(); g.stroke();
    var ec = e.rage ? "#fff06a" : "#ffb13b"; g.fillStyle = ec; g.shadowColor = "#ff6a1f"; g.shadowBlur = lowq ? 0 : 10; g.beginPath(); g.ellipse(8, -5, 3.6, 2.4, 0.2, 0, 7); g.fill(); g.shadowBlur = 0;
    g.fillStyle = "#ff6a1f"; [[-8, -2], [-2, 6], [-12, 6]].forEach(function (q) { g.beginPath(); g.arc(q[0], q[1], 2.4, 0, 7); g.fill(); });
    g.restore();
  }
  // ---------- MINI-MAP (top right, under health and food) ----------
  // A small live view of the explored world around you: you in the middle, plus waypoints, cave holes, your bed, Old Croaker, pets and bosses.
  // Tap it to open the full World Map. It can be switched off in Options (saved on this device). Hidden inside hole caves.
  var MINI = { on: true, t: 0, off: null, og: null, img: null, rgb: {}, tw: 64, th: 40 };
  try { MINI.on = localStorage.getItem("swamp-delve-minimap") !== "0"; } catch (e) {}
  function hexRgb(hex) {
    var c = MINI.rgb[hex]; if (c) return c; var h = hex.length === 4 ? "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3] : hex;
    return (MINI.rgb[hex] = [parseInt(h.slice(1, 3), 16) || 0, parseInt(h.slice(3, 5), 16) || 0, parseInt(h.slice(5, 7), 16) || 0]);
  }
  function drawMini() {
    var cv = $("sbxMini"); if (!cv) return; var show = MINI.on && !cave && !!world; if (cv.hidden === show) cv.hidden = !show; if (!show) return;
    var now = performance.now(); if (now - MINI.t < 250) return; MINI.t = now;
    var tw = MINI.tw, th = MINI.th, x0 = Math.round(p.x - tw / 2), y0 = Math.round(p.y - 2 - th / 2);
    if (!MINI.img) { MINI.off = document.createElement("canvas"); MINI.off.width = tw; MINI.off.height = th; MINI.og = MINI.off.getContext("2d"); MINI.img = MINI.og.createImageData(tw, th); }
    var d = MINI.img.data;
    for (var yy = 0; yy < th; yy++) for (var xx = 0; xx < tw; xx++) {
      var x = x0 + xx, y = y0 + yy, k = (yy * tw + xx) * 4, r = 6, g2 = 10, b = 9;
      if (x >= 0 && x < W && y >= 0 && y < H) {
        var i = y * W + x;
        if (ex[i]) { var id = tiles[i]; if (id === T.AIR && PICT && PICT[i]) id = PICT[i]; var td = TILES[id], hex = id === T.AIR ? (y < col[x] ? "#2a5a6a" : "#0d1114") : id === T.WATER ? "#2a8f95" : td.kind === "ore" ? td.c2 : td.c; if (hex === "#000") hex = td.c2 || "#2a5a6a"; var c = hexRgb(hex); r = c[0]; g2 = c[1]; b = c[2]; }
      }
      d[k] = r; d[k + 1] = g2; d[k + 2] = b; d[k + 3] = 255;
    }
    MINI.og.putImageData(MINI.img, 0, 0);
    var dpr = Math.min(2, window.devicePixelRatio || 1), cw = cv.clientWidth || 140, ch = cv.clientHeight || 88;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    var g = cv.getContext("2d"), sx = cw / tw, sy = ch / th; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false; g.drawImage(MINI.off, 0, 0, cw, ch);
    function at(wx, wy) { var q = [(wx - x0) * sx, (wy - y0) * sy]; return q[0] < -4 || q[0] > cw + 4 || q[1] < -4 || q[1] > ch + 4 ? null : q; }
    function dot(q, r2, fill, ring) { if (!q) return; g.beginPath(); g.arc(q[0], q[1], r2, 0, 6.2832); g.fillStyle = fill; g.fill(); if (ring) { g.lineWidth = 1.2; g.strokeStyle = ring; g.stroke(); } }
    (world.holes || []).forEach(function (hh) { if (ex[hh.y * W + hh.x]) dot(at(hh.x + 0.5, hh.y), 2.2, "#050607", "#f2c14e"); });
    if (S.bed) { var bq = at(S.bed.x + 0.5, S.bed.y + 0.5); if (bq) { g.fillStyle = "#b58cff"; g.fillRect(bq[0] - 2.5, bq[1] - 2, 5, 4); } }
    (S.wp || []).forEach(function (w) { dot(at(w.x + 0.5, w.y + 0.5), 2.8, WP_COL[w.c] || "#f2c14e", "#06100d"); });
    S.pets.forEach(function (a) { dot(at(a.x, a.y - 0.3), 1.6, "#ff9ac2"); });
    if (npc.ok) dot(at(npc.x, npc.y - 1), 3, "#3fae5e", giftsWaiting().length + btyReady() ? "#f2c14e" : "#bff4e4");
    var bo = activeBoss(); if (bo) dot(at(bo.x, bo.y - bo.h / 2), 3.4 + Math.sin(now / 200), BOSS[bo.k].c, "#fff");
    var pq = at(p.x, p.y - 1); dot(pq, 3.2, "#f2c14e", "#fff");
    if (pq) { g.fillStyle = "#fff"; g.beginPath(); g.moveTo(pq[0] + p.face * 6, pq[1]); g.lineTo(pq[0] + p.face * 3.6, pq[1] - 2.2); g.lineTo(pq[0] + p.face * 3.6, pq[1] + 2.2); g.closePath(); g.fill(); }
  }
  // ---------- AMBIENT MUSIC ----------
  // A soft generative tune made on the fly with the Web Audio API (no files). Each land has its own scale and sound:
  // Murkwater: warm marimba-ish plucks; Ember Bog: a darker, lower mode; Frostfen: bright bells. Underground and at night it slows down and gets lower.
  // A boss fight switches to a tense pulse. It follows the site's sound switch, and has its own On/Off and volume in Options (saved on this device).
  var MUS = { on: true, vol: 0.5, out: null, flt: null, dl: null, nextT: 0, step: 0, deg: 0, pad: 0, mood: "" };
  try { MUS.on = localStorage.getItem("swamp-delve-music") !== "0"; var mv = parseFloat(localStorage.getItem("swamp-delve-musicvol")); if (isFinite(mv)) MUS.vol = clamp(mv, 0, 1); } catch (e) {}
  var SCALES = {   // semitones above the root, root frequency, voice
    swamp: { root: 146.83, s: [0, 3, 5, 7, 10, 12, 15, 17], wave: "triangle", beat: 0.5 },
    ember: { root: 130.81, s: [0, 1, 5, 7, 8, 12, 13, 17], wave: "sawtooth", beat: 0.58 },
    frost: { root: 196.0, s: [0, 2, 4, 7, 9, 12, 14, 16], wave: "sine", beat: 0.52 },
    deep: { root: 110.0, s: [0, 3, 5, 7, 10, 12], wave: "sine", beat: 0.8 },
    boss: { root: 110.0, s: [0, 1, 3, 7, 8, 12], wave: "square", beat: 0.3 }
  };
  function musicMood() {
    if (activeBoss()) return "boss";
    if (cave || p.y > col[clamp(Math.floor(p.x), 0, W - 1)] + 7) return "deep";
    return ["swamp", "ember", "frost"][world.bio[clamp(Math.floor(p.x), 0, W - 1)]] || "swamp";
  }
  function musicOut() {
    if (MUS.out || !ac) return MUS.out;
    try {
      MUS.out = ac.createGain(); MUS.out.gain.value = 0; MUS.flt = ac.createBiquadFilter(); MUS.flt.type = "lowpass"; MUS.flt.frequency.value = 2400;
      MUS.dl = ac.createDelay(1); MUS.dl.delayTime.value = 0.36; var fb = ac.createGain(); fb.gain.value = 0.32; var wet = ac.createGain(); wet.gain.value = 0.35;
      MUS.flt.connect(MUS.out); MUS.flt.connect(MUS.dl); MUS.dl.connect(fb); fb.connect(MUS.dl); MUS.dl.connect(wet); wet.connect(MUS.out); MUS.out.connect(ac.destination);
    } catch (e) { MUS.out = null; }
    return MUS.out;
  }
  function musNote(f, t, len, wave, vol) {
    var o = ac.createOscillator(), g = ac.createGain(); o.type = wave; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.04, len * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(MUS.flt); o.start(t); o.stop(t + len + 0.05);
  }
  function musPad(f, t, len, vol) {
    [1, 1.5, 2.003].forEach(function (m, i) {
      var o = ac.createOscillator(), g = ac.createGain(); o.type = "sine"; o.frequency.setValueAtTime(f * m, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol / (i + 1), t + len * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(MUS.flt); o.start(t); o.stop(t + len + 0.05);
    });
  }
  function tickMusic() {
    var want = MUS.on && gestured && !(typeof SFX !== "undefined" && SFX.on === false) && !document.hidden && !!world;
    if (!want) { if (MUS.out && ac) MUS.out.gain.setTargetAtTime(0, ac.currentTime, 0.4); return; }
    try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); } catch (e) { return; }
    if (!musicOut()) return;
    var mood = musicMood(), Sc = SCALES[mood], night = isNight(S.time), now = ac.currentTime;
    MUS.out.gain.setTargetAtTime(0.16 * MUS.vol * (night ? 0.8 : 1), now, 0.6);
    MUS.flt.frequency.setTargetAtTime(mood === "deep" ? 900 : mood === "boss" ? 1800 : night ? 1500 : 2600, now, 0.5);
    if (mood !== MUS.mood) { MUS.mood = mood; MUS.nextT = Math.max(MUS.nextT, now + 0.2); MUS.step = 0; }
    if (MUS.nextT < now) MUS.nextT = now + 0.05;
    var beat = Sc.beat * (night && mood !== "boss" ? 1.3 : 1);
    while (MUS.nextT < now + 0.35) {
      var t = MUS.nextT, st = MUS.step++;
      if (mood === "boss") {   // a tense, driving pulse
        if (st % 2 === 0) musNote(Sc.root / 2, t, 0.22, "triangle", 0.5);
        if (st % 4 === 2 || Math.random() < 0.25) musNote(Sc.root * Math.pow(2, Sc.s[Math.floor(Math.random() * Sc.s.length)] / 12), t, 0.18, Sc.wave, 0.12);
        if (st % 16 === 0) musPad(Sc.root, t, beat * 16, 0.18);
      } else {
        if (st % 16 === 0) musPad(Sc.root / (mood === "deep" ? 2 : 1) * (MUS.pad++ % 2 ? Math.pow(2, 5 / 12) : 1), t, beat * 16, 0.12);
        if (Math.random() > (mood === "deep" ? 0.55 : 0.38)) {   // a melody that wanders up and down the scale
          MUS.deg = clamp(MUS.deg + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)], 0, Sc.s.length - 1);
          var f = Sc.root * Math.pow(2, Sc.s[MUS.deg] / 12) * (mood === "frost" ? 2 : 1);
          musNote(f, t, beat * (mood === "frost" ? 3 : 2.2), Sc.wave, Sc.wave === "sawtooth" ? 0.07 : Sc.wave === "sine" ? 0.32 : 0.22);
          if (mood === "swamp" && Math.random() < 0.2) musNote(f * 1.5, t + beat / 2, beat * 1.4, "triangle", 0.1);
        }
      }
      MUS.nextT += beat;
    }
  }
  // ---------- WEATHER ----------
  // One weather for the whole world (S.wx = { k: "calm" | "wet" | "storm", t: seconds left, n: 0-1 how strong it is right now }), and each land shows it its own way:
  //   Murkwater: rain, then thunderstorms (lightning at night is spectacular).  Frostfen: snow, then blizzards.  Ember Bog: ash fall, then ember storms.
  // Gameplay: swamp rain waters every crop under open sky (it grows twice as fast), and fish bite sooner in rain or snow.
  // Storms darken the sky. Weather only shows above ground. Weather effects can be switched off in Options (saved on this device).
  var WX = { on: true, drops: [], flash: 0, bolt: null, nextBolt: 6, snd: null, sndG: null, waterT: 0 };
  try { WX.on = localStorage.getItem("swamp-delve-weather") !== "0"; } catch (e) {}
  var WX_LEN = { calm: [240, 540], wet: [120, 240], storm: [90, 170] }, WX_NAMES = [["Rain", "Thunderstorm"], ["Ash fall", "Ember storm"], ["Snow", "Blizzard"]];
  function wxNew(k) { var L = WX_LEN[k]; S.wx = { k: k, t: L[0] + Math.random() * (L[1] - L[0]), n: S.wx ? S.wx.n : 0 }; }
  function wxTarget() { return !S.wx || S.wx.k === "calm" ? 0 : S.wx.k === "wet" ? 0.6 : 1; }
  function wxLabel() {   // for the HUD: what the weather is called where you are standing (empty when calm)
    if (!WX.on || cave || !S.wx || S.wx.n < 0.25) return "";
    return WX_NAMES[bioAt()][S.wx.k === "storm" && S.wx.n > 0.7 ? 1 : 0];
  }
  function wxOpenSky(x, y) { return col[clamp(x, 0, W - 1)] >= y; }   // nothing solid above (x, y)
  function tickWeather(dt) {
    if (!S.wx) wxNew("calm");
    var w = S.wx; w.t -= dt;
    if (w.t <= 0) wxNew(w.k === "calm" ? "wet" : w.k === "wet" ? (Math.random() < 0.45 ? "storm" : "calm") : "wet");
    var tg = WX.on ? wxTarget() : 0; w.n += clamp(tg - w.n, -dt / 25, dt / 25);   // fades in and out over about 25 seconds
    if (w.n > 0.3) {   // swamp rain waters crops that are under open sky
      WX.waterT -= dt;
      if (WX.waterT <= 0) {
        WX.waterT = 2;
        Object.keys(S.farm).forEach(function (key) { var q = key.split(","), x = +q[0], y = +q[1], e = S.farm[key]; if (world.bio[x] !== 0 || !wxOpenSky(x, y)) return; if (e.w < 40) { e.w = 40; setSoil(x, y + 1, true); } });
      }
    }
    if (w.k === "storm" && w.n > 0.7 && !cave && bioAt() !== 1) {   // lightning (not in Ember Bog: it gets ember bursts instead)
      WX.nextBolt -= dt;
      if (WX.nextBolt <= 0) {
        WX.nextBolt = 5 + Math.random() * 9; WX.flash = 1;
        var bx = p.x + (Math.random() - 0.5) * (vw / ts) * 0.9; WX.bolt = { x: bx, y: col[clamp(Math.floor(bx), 0, W - 1)], t: 0.35, seed: Math.random() * 1000 };
        var dly = 0.3 + Math.random() * 1.2; setTimeout(function () { thud(55, 0.11); setTimeout(function () { thud(40, 0.08); }, 160); }, dly * 1000);
      }
    }
    WX.flash = Math.max(0, WX.flash - dt * 3); if (WX.bolt) { WX.bolt.t -= dt; if (WX.bolt.t <= 0) WX.bolt = null; }
    tickRainSound();
  }
  function fishBiteMul() { return (S.wx && S.wx.n > 0.3 && !cave ? 0.7 : 1) * (hasCharm("angler") ? 0.65 : 1) * (fx("fish") ? 0.6 : 1); }
  function tickRainSound() {   // a soft filtered-noise hiss for rain / blizzard wind, following the music switch
    var want = WX.on && MUS.on && gestured && ac && S.wx && S.wx.n > 0.05 && !cave && !(typeof SFX !== "undefined" && SFX.on === false) && !document.hidden;
    var above = p.y <= col[clamp(Math.floor(p.x), 0, W - 1)] + 4, lvl = want && above ? S.wx.n * MUS.vol * (bioAt() === 1 ? 0.25 : 0.55) : 0;
    if (!lvl && !WX.snd) return;
    try {
      if (!WX.snd) {
        var len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0), last = 0;
        for (var i = 0; i < len; i++) { last = last * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = last; }
        WX.snd = ac.createBufferSource(); WX.snd.buffer = buf; WX.snd.loop = true;
        var f = ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1400; f.Q.value = 0.6; WX.sndF = f;
        WX.sndG = ac.createGain(); WX.sndG.gain.value = 0; WX.snd.connect(f); f.connect(WX.sndG); WX.sndG.connect(ac.destination); WX.snd.start();
      }
      WX.sndF.frequency.setTargetAtTime(bioAt() === 2 ? 600 : 1400, ac.currentTime, 1);
      WX.sndG.gain.setTargetAtTime(lvl * 0.09, ac.currentTime, 0.8);
    } catch (e) {}
  }
  function drawWeather(g, now, day, above) {
    var w = S.wx; if (!WX.on || !w || cave) return;
    var n = w.n * above; if (n < 0.02 && WX.flash <= 0) return;
    var b = bioAt(), storm = w.k === "storm" && w.n > 0.7, want = Math.round((lowq ? 70 : 170) * n * (b === 2 && storm ? 1.6 : 1)), L = WX.drops, dt = WX.ln ? clamp((now - WX.ln) / 1000, 0, 0.05) : 1 / 60; WX.ln = now;
    while (L.length < want) L.push({ x: Math.random() * vw, y: Math.random() * vh, z: 0.5 + Math.random() * 0.5, ph: Math.random() * 6.28 });
    if (L.length > want) L.length = want;
    var wind = (storm ? 1 : 0.35) * (b === 2 ? 1.6 : 1), lit = 0.35 + 0.65 * day;
    if (n > 0.05) { g.fillStyle = b === 1 ? "rgba(60,40,30," + (0.18 * n).toFixed(3) + ")" : b === 2 ? "rgba(200,220,236," + ((storm ? 0.26 : 0.08) * n).toFixed(3) + ")" : "rgba(20,30,44," + ((storm ? 0.32 : 0.16) * n).toFixed(3) + ")"; g.fillRect(0, 0, vw, vh); }
    g.save();
    if (b === 0) {   // rain: thin slanted streaks
      g.strokeStyle = "rgba(200,228,255," + (0.8 * lit).toFixed(3) + ")"; g.lineWidth = 1.4; g.lineCap = "round"; g.beginPath();
      L.forEach(function (d) { var sp = 900 * d.z; d.y += sp * dt; d.x += sp * dt * wind * 0.25; if (d.y > vh) { d.y = -10; d.x = Math.random() * (vw + 100) - 100; } if (d.x > vw) d.x -= vw + 50; g.moveTo(d.x, d.y); g.lineTo(d.x - 4 * wind * d.z, d.y - 20 * d.z); });
      g.stroke();
    } else if (b === 2) {   // snow: drifting flakes
      var shade = "rgba(110,150,190," + (0.55 * lit).toFixed(3) + ")", flake = "rgba(255,255,255," + (0.95 * lit).toFixed(3) + ")";
      L.forEach(function (d) { var sp = (storm ? 160 : 60) * d.z; d.y += sp * dt; d.x += (Math.sin(now / 700 + d.ph) * 30 + wind * (storm ? 260 : 40)) * dt; if (d.y > vh) { d.y = -6; d.x = Math.random() * vw; } if (d.x > vw + 6) d.x = -6; if (d.x < -6) d.x = vw + 6;
        var sz = d.z * (storm ? 3.6 : 3.2); g.fillStyle = shade; g.fillRect(d.x + 1, d.y + 1, sz, sz); g.fillStyle = flake; g.fillRect(d.x, d.y, sz, sz); });
      if (storm) { g.strokeStyle = "rgba(255,255,255," + (0.35 * lit * n).toFixed(3) + ")"; g.lineWidth = 1; g.beginPath(); for (var ws = 0; ws < 14; ws++) { var wy = (ws * 97 + now * 0.05) % vh, wx = (ws * 211 + now * 0.9) % (vw + 200) - 100; g.moveTo(wx, wy); g.lineTo(wx + 60, wy + 4); } g.stroke(); }
    } else {   // ash: grey flakes, and in an ember storm some glowing embers
      L.forEach(function (d, i) { var hot = storm && i % 3 === 0, sp = (hot ? 90 : 45) * d.z; d.y += sp * dt; d.x += (Math.sin(now / 900 + d.ph) * 20 + 25 * wind) * dt; if (d.y > vh) { d.y = -6; d.x = Math.random() * vw; } if (d.x > vw + 6) d.x = -6;
        if (hot) { g.fillStyle = "rgba(255," + (140 + Math.round(60 * Math.sin(now / 120 + d.ph))) + ",60,0.9)"; g.fillRect(d.x, d.y, 2.4, 2.4); } else { g.fillStyle = "rgba(120,110,105," + (0.6 * lit).toFixed(3) + ")"; g.fillRect(d.x, d.y, 2.2 * d.z, 2.2 * d.z); } });
    }
    g.restore();
    if (WX.bolt) {   // a jagged bolt from the top of the screen to the ground
      var B = WX.bolt, x = ox + B.x * ts, y1 = Math.min(vh, oy + B.y * ts), segs = 9, r = B.seed;
      g.save(); g.strokeStyle = "rgba(235,245,255," + Math.min(1, B.t * 4).toFixed(3) + ")"; g.lineWidth = 2.5; g.shadowColor = "#bfe4ff"; g.shadowBlur = lowq ? 0 : 14; g.beginPath(); g.moveTo(x, 0);
      for (var s = 1; s <= segs; s++) { r = (r * 9301 + 49297) % 233280; g.lineTo(x + (r / 233280 - 0.5) * 40, y1 * s / segs); } g.stroke(); g.restore();
    }
    if (WX.flash > 0) { g.fillStyle = "rgba(230,240,255," + (WX.flash * 0.45 * above).toFixed(3) + ")"; g.fillRect(0, 0, vw, vh); }
  }
  // ---------- CHARMS ----------
  // Little trinkets worn on a cord. Craft each one once (Craft tab > Gear > Charms), then wear up to 2 of them from the top of your backpack
  // (3 once you have beaten all three bosses). S.charms = { own: { key: 1 }, on: [keys being worn] }.
  // Their effects are applied where each thing happens: walk speed (step), double jump (step), lava (update), fishing (useRod / landFish),
  // crops (farmStep), loot (rollLoot), hunger (tickHunger), digging (the three mine.p lines).
  var CHARMS = {
    bramble: { n: "Bramble Charm", d: "Walk 15% faster.", c: "#c06aff", g: "#ff6b82" },
    alpha: { n: "Alpha Charm", d: "Jump a second time in mid-air.", c: "#9fe8ff", g: "#e8f8ff" },
    magma: { n: "Magma Charm", d: "Lava burns you 70% less.", c: "#ff8a3d", g: "#ffd23f" },
    miner: { n: "Miner's Charm", d: "Dig 25% faster.", c: "#b58cff", g: "#e2d0ff" },
    angler: { n: "Angler's Charm", d: "Fish bite 35% sooner, and rare fish are more common.", c: "#4ee6b4", g: "#d4fff6" },
    thumb: { n: "Green Thumb Charm", d: "Crops grow 25% faster.", c: "#7fd06a", g: "#ff8a2a" },
    hearty: { n: "Hearty Charm", d: "Hunger drains 35% slower, and health comes back 20% faster.", c: "#ff6a5a", g: "#ffd0c8" },
    lucky: { n: "Lucky Clover", d: "Treasure is more generous: chests, pots and fished-up treasure sometimes give an extra find.", c: "#3fae5e", g: "#f2c14e" },
    glow: { n: "Firefly Charm", d: "You glow softly, lighting up dark caves and nights around you.", c: "#d8ff6a", g: "#fffbd0" },
    tide: { n: "Tidecaller Charm", d: "Swim 60% faster.", c: "#4ab8d8", g: "#d4f6ff" },
    king: { n: "Swampking Sigil", d: "Hit bosses 25% harder and take 20% less damage from them.", c: "#c06aff", g: "#ffd23f" }
  };
  function charmSlots() { return (S.st.boss & 7) === 7 ? 3 : 2; }
  function hasCharm(k) { return S.charms.on.indexOf(k) > -1; }
  function wearCharm(k) {
    if (!S.charms.own[k]) return;
    var i = S.charms.on.indexOf(k);
    if (i > -1) { S.charms.on.splice(i, 1); toast("Took off the " + CHARMS[k].n + ".", "#f6eedb"); }
    else if (S.charms.on.length >= charmSlots()) { nag("You can wear " + charmSlots() + " charms" + (charmSlots() < 3 ? ". Beat all three bosses to wear a third." : ".") + " Take one off first."); return; }
    else { S.charms.on.push(k); toast("Wearing the " + CHARMS[k].n + ": " + CHARMS[k].d, CHARMS[k].c); snd("coin"); }
    S.st.charmswap++; checkGoals(); save();
  }
  function charmHtml() {
    var own = Object.keys(CHARMS).filter(function (k) { return S.charms.own[k]; }), n = charmSlots();
    var worn = S.charms.on.map(function (k) { return CHARMS[k].n.replace(/ Charm$/, ""); }).join(", ");
    var h = '<details class="sbx-charms"' + (charmOpen === null ? (own.length <= 3 ? " open" : "") : charmOpen ? " open" : "") + '><summary class="ch-head"><b>Charms</b><em>' + (worn ? esc(worn) + " · " : "") + S.charms.on.length + " / " + n + " worn</em></summary>";
    if (!own.length) return h + '<p class="sbx-note">No charms yet. Craft them in the Craft tab (Gear &gt; Charms). Most need boss trophies.</p></details>';
    h += '<div class="ch-list">' + own.map(function (k) {
      var C = CHARMS[k], on = hasCharm(k);
      return '<button type="button" class="ch-it' + (on ? " on" : "") + '" data-charm="' + k + '" aria-pressed="' + on + '" style="--cc:' + C.c + '"><img alt="" src="' + icon("charm_" + k) + '"><span><b>' + esc(C.n) + "</b><small>" + esc(C.d) + "</small></span><i>" + (on ? "Worn" : "Wear") + "</i></button>";
    }).join("") + "</div></details>";
    return h;
  }
  var charmOpen = null;   // the backpack's Charms box: null = automatic (open while you own 3 or fewer)
  document.addEventListener("toggle", function (e) { if (e.target && e.target.classList && e.target.classList.contains("sbx-charms")) charmOpen = e.target.open; }, true);
  // a pendant sprite per charm: a cord, a metal frame, and a gem in the charm's colours
  function charmSprite(k) {
    var C = CHARMS[k];
    return { r: ["....c......c....", ".....c....c.....", "......c..c......", ".......cc.......", "......mmmm......", ".....mGGGGm.....", "....mGgGGGGm....", "...mGGgGGGGGm...", "...mGGGGGGGGm...", "...mGGGGGGgGm...", "....mGGGGGgm....", ".....mGGGGm.....", "......mmmm......", ".......mm.......", "........m.......", "................"],
      p: { c: "#8a6a4a", m: "#e8c46a", G: C.c, g: C.g }, o: "#2a1c0e" };
  }
  Object.keys(CHARMS).forEach(function (k) { SPR["charm_" + k] = charmSprite(k); });
  // ---------- COLLECTION LOG (Journal > Log) ----------
  // Everything you have found, caught, grown, cooked, tamed and beaten in this world, with "?" for what is still out there. Read-only: it is all
  // worked out from the save (lifetime stats, the fish log, crop bits, meals eaten, pets, charms and boss bits).
  function logHtml() {
    var st = S.st, kills = Object.keys(KSTAT).reduce(function (a, k) { return a + (st[KSTAT[k]] || 0); }, 0);
    var tile = function (img, name, sub, got, cc) { return '<div class="lg-it' + (got ? "" : " no") + '"' + (cc ? ' style="--lc:' + cc + '"' : "") + '>' + (got ? '<img alt="" src="' + img + '">' : '<span class="q">?</span>') + "<b>" + esc(got ? name : "???") + "</b>" + (sub && got ? "<em>" + esc(sub) + "</em>" : "") + "</div>"; };
    var sect = function (title, done, all, inner) { return '<h3>' + title + ' <small class="lg-n">' + done + " / " + all + '</small></h3><div class="lg-grid">' + inner + "</div>"; };
    var h = '<div class="lg-stats">' + [
      ["Days", (S.days | 0) + 1], ["Deepest", (st.maxDepth | 0) + " m"], ["Dug", st.mined], ["Placed", st.placed], ["Defeated", kills], ["Bosses", st.bossk],
      ["Fish", st.fish], ["Harvests", st.harvests], ["Meals", st.cooked], ["Bounties", st.bounties], ["Cave floors", st.caveDeep], ["Naps", st.sleeps]
    ].map(function (q) { return "<div><b>" + (q[1] || 0) + "</b><span>" + q[0] + "</span></div>"; }).join("") + "</div>";
    var cre = Object.keys(KSTAT), creN = cre.filter(function (k) { return st[KSTAT[k]] > 0; }).length;
    h += sect("Creatures", creN, cre.length, cre.map(function (k) { var d = ENEMY[k], n = st[KSTAT[k]] || 0; return tile(icon(d.frag), d.n, n + " defeated", n > 0, d.glow); }).join(""));
    var bk = Object.keys(BOSS), bN = bk.filter(function (k) { return st.boss & BOSS[k].bit; }).length;
    h += sect("Bosses", bN, bk.length, bk.map(function (k) { var B = BOSS[k], m = { queen: "queenchitin", wyrm: "wyrmscale", alpha: "alphamane" }[k]; return tile(icon(m), B.n, BIO_NAMES[B.b], !!(st.boss & B.bit), B.c); }).join(""));
    var fN = FISH_ALL.filter(function (k) { return S.fdex[k]; }).length;
    h += sect("Fish", fN, FISH_ALL.length, FISH_ALL.map(function (k) { return tile(icon(k), ITEMS[k].n, "", !!S.fdex[k], "#7fd6ff"); }).join(""));
    var crops = [["carrot", 1], ["potato", 2], ["pepper", 4], ["frostberry", 8]], cN = crops.filter(function (q) { return st.cropbits & q[1]; }).length;
    h += sect("Crops grown", cN, crops.length, crops.map(function (q) { return ITEMS[q[0]] ? tile(icon(q[0]), ITEMS[q[0]].n, "", !!(st.cropbits & q[1]), "#7fd06a") : ""; }).join(""));
    var meals = ORDER.filter(function (k) { return ITEMS[k] && ITEMS[k].cooked; }), mN = meals.filter(function (k) { return S.ate[k]; }).length;
    h += sect("Meals tasted", mN, meals.length, meals.map(function (k) { return tile(icon(k), ITEMS[k].n, "", !!S.ate[k], "#ffb13b"); }).join(""));
    var ak = Object.keys(ANIM), aN = ak.filter(function (k) { return S.pets.some(function (a) { return a.k === k; }); }).length;
    h += sect("Animal friends", aN, ak.length, ak.map(function (k) { var n = S.pets.filter(function (a) { return a.k === k; }).length; return tile(icon(ANIM[k].prod), ANIM[k].n, n + " at home", n > 0, "#ff9ac2"); }).join(""));
    var ck = Object.keys(CHARMS), chN = ck.filter(function (k) { return S.charms.own[k]; }).length;
    h += sect("Charms", chN, ck.length, ck.map(function (k) { return tile(icon("charm_" + k), CHARMS[k].n, hasCharm(k) ? "Worn" : "", !!S.charms.own[k], CHARMS[k].c); }).join(""));
    var total = creN + bN + fN + cN + mN + aN + chN, max = cre.length + bk.length + FISH_ALL.length + crops.length + meals.length + ak.length + ck.length;
    return '<div class="lg-top"><b>Collection Log</b><span class="bar"><i style="width:' + Math.round(total / max * 100) + '%"></i></span><em>' + total + " / " + max + " found</em></div>" + h;
  }
  // ---------- MULTIPLAYER (co-op rooms; the server side is DelveRoom in worker.js) ----------
  // The HOST's game runs the world: creatures, bosses, crops, time and weather. Up to 3 friends join with a room code (or from the public list).
  // A guest brings their CHARACTER along (inventory, gear, quests, charms, stats: the keys in MP_CHAR) and plays in the host's world, which is
  // kept in memory only. While a guest plays, their character is saved back into their own world slot, so nothing is lost when they leave.
  // Messages (JSON): me (look), p (player state), set / wall (tile edits, batched), tick (host: creatures, shots, its own state), env (time, weather),
  //   hit (guest hit a creature), dmg (a creature hit a guest), kill / bosswin (reward a guest), pvp (player hit), farm / water, chat, cfg (PvP switch).
  // Creatures always chase the nearest player: the host runs each creature's brain with that player standing in for "you" (mpRun).
  var MP_CHAR = ["inv", "slots", "extra", "bag", "can", "water", "tier", "wpn", "arm", "hp", "shovel", "dur", "st", "ms", "mk", "ate", "fdex", "rod", "hoe", "bucket", "bkt", "net", "bow", "fx", "gems", "wings", "charms", "food", "animal", "qi", "qch", "qv", "cg", "bty", "mru", "zoom"];
  var MP = { on: false, role: "", ws: null, code: "", id: 0, peers: {}, npeers: 0, pvp: false, pub: false, room: "", hostName: "", own: null, applying: false,
    sets: [], walls: [], flushT: 0, sendT: 0, tickT: 0, envT: 0, metaT: 0, last: "", proxy: null, proxyE: null, nid: 0, chat: [], say: "", sayT: 0, status: "", err: "", list: null, view: "home" };
  var mpName = ""; try { mpName = localStorage.getItem("swamp-delve-mpname") || ""; } catch (e) {}
  function mpSend(o) { if (MP.ws && MP.ws.readyState === 1) try { MP.ws.send(JSON.stringify(o)); } catch (e) {} }
  function mpUrl(code, role, name) { return (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/mp/ws/" + code + "?role=" + role + "&name=" + encodeURIComponent(name || ""); }
  function mpMe() { mpSend({ t: "me", name: MP.myName, animal: S.animal, outfit: spriteOutfit || null }); }
  function mpPeer(id) { return MP.peers[id] || (MP.peers[id] = { id: id, name: "Player", x: p.x, y: p.y, tx: p.x, ty: p.y, vx: 0, vy: 0, on: true, face: 1, walk: 0, a: 0.3, hp: MAXHP, cave: 0, grace: 0, sp: null }); }
  function mpCount() { MP.npeers = Object.keys(MP.peers).length; }
  // ---- hosting ----
  function mpHost(pub, pvp) {
    if (MP.on) return; if (CLOUD.state === "guest") { MP.err = "Sign in (top right) to host your world."; renderMP(); return; }
    MP.err = ""; MP.status = "Opening your world…"; renderMP();
    var e = curEntry();
    cloudCall("POST", "/api/mp/host", { name: e ? e.name : "My Swamp", pub: !!pub, pvp: !!pvp }).then(function (r) {
      if (r.s !== 200 || !r.j || !r.j.code) { MP.status = ""; MP.err = (r.j && r.j.error) || "Multiplayer isn't available right now."; renderMP(); return; }
      MP.code = r.j.code; MP.pub = !!pub; MP.pvp = !!pvp; MP.room = e ? e.name : "My Swamp"; MP.myName = WUSER; mpConnect("host");
    });
  }
  function worldSnap() {
    save(); var o = null; try { o = JSON.parse(localStorage.getItem(wkey(curId))); } catch (e) {} if (!o) return null;
    MP_CHAR.forEach(function (k) { delete o[k]; }); o.bossOn = ""; o.pets = []; return JSON.stringify(o);
  }
  // ---- joining ----
  function mpJoin(code, name) {
    if (MP.on) return; code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 6) { MP.err = "Room codes are 6 letters and numbers."; renderMP(); return; }
    name = String(name || "").trim().slice(0, 16); if (WUSER === "guest" && name.length < 2) { MP.err = "Pick a name (at least 2 letters) so your friends know who you are."; renderMP(); return; }
    try { localStorage.setItem("swamp-delve-mpname", name); } catch (e) {} mpName = name;
    MP.err = ""; MP.status = "Looking for that world…"; renderMP();
    cloudCall("GET", "/api/mp/room/" + code).then(function (r) {
      if (r.s !== 200 || !r.j) { MP.status = ""; MP.err = (r.j && r.j.error) || "Multiplayer isn't available right now."; renderMP(); return; }
      MP.code = code; MP.room = r.j.name; MP.hostName = r.j.host; MP.pvp = !!r.j.pvp; MP.myName = WUSER !== "guest" ? WUSER : name; MP.status = "Joining " + r.j.host + "'s world…"; renderMP(); mpConnect("guest", name);
    });
  }
  function mpConnect(role, name) {
    var ws; try { ws = new WebSocket(mpUrl(MP.code, role, name)); } catch (e) { MP.status = ""; MP.err = "Could not connect."; renderMP(); return; }
    MP.ws = ws; MP.role = role; MP.peers = {}; MP.npeers = 0;
    ws.onmessage = function (ev) { var m = null; try { m = JSON.parse(ev.data); } catch (e) {} if (m) try { mpOn(m); } catch (e) { if (window.console) console.error(e); } };
    ws.onclose = function (ev) { if (MP.ws !== ws) return; var was = MP.on, why = MP.why || (ev.code === 4002 ? "You were removed from the world by the host." : ev.code === 4003 ? "The host closed their world." : was ? "Lost the connection to the world." : MP.err || "Could not connect to that world."); MP.ws = null; mpEnd(why); };
  }
  function mpOn(m) {
    var q;
    if (m.t === "error") { MP.why = m.m; MP.err = m.m; return; }
    if (m.t === "hello") {
      MP.id = m.id; (m.players || []).forEach(function (pl) { var q2 = mpPeer(pl.id); q2.name = pl.name; q2.role = pl.role; }); mpCount();
      if (MP.role === "host") { MP.on = true; MP.status = ""; if (titleOpen) closeTitle(); toast("Your world is open! Room code " + MP.code + ".", "#4ee6b4"); mpMeta(); renderMP(); }
      mpMe(); return;
    }
    if (m.t === "join") { q = mpPeer(m.id); q.name = m.name; q.role = m.role; mpCount(); mpMe(); if (MP.on) toast(m.name + " joined the world!", "#4ee6b4"); addChat("", m.name + " joined."); if (MP.role === "host") { var w = worldSnap(); if (w) mpSend({ t: "welcome", to: m.id, world: w, pvp: MP.pvp, room: MP.room, host: MP.myName, wv: SW.WORLDVER }); mpMeta(); } renderMP(); return; }
    if (m.t === "leave") { q = MP.peers[m.id]; if (q) { toast(q.name + " left the world.", "#f6eedb"); addChat("", q.name + " left."); } delete MP.peers[m.id]; mpCount(); if (MP.role === "host") mpMeta(); renderMP(); return; }
    if (m.t === "welcome" && MP.role === "guest" && !MP.on) return mpEnterGuest(m);
    if (m.t === "me") { q = mpPeer(m.from); q.name = String(m.name || q.name).slice(0, 16); q.animal = m.animal; q.outfit = m.outfit; q.sp = null; return; }
    if (m.t === "p") { q = mpPeer(m.from); mpState(q, m); return; }
    if (m.t === "set") { MP.applying = true; for (var i = 0; i + 2 < m.L.length; i += 3) if (m.L[i] >= 0 && m.L[i] < W && m.L[i + 1] >= 0 && m.L[i + 1] < H && TILES[m.L[i + 2]]) setT(m.L[i], m.L[i + 1], m.L[i + 2]); MP.applying = false; return; }
    if (m.t === "wall") { MP.applying = true; for (var j = 0; j + 2 < m.L.length; j += 3) if (m.L[j] >= 0 && m.L[j] < W && m.L[j + 1] >= 0 && m.L[j + 1] < H) setWall(m.L[j], m.L[j + 1], m.L[j + 2]); MP.applying = false; return; }
    if (m.t === "chat") { q = mpPeer(m.from); var txt = String(m.m || "").slice(0, 80); q.say = txt; q.sayT = 5; addChat(q.name, txt); return; }
    if (m.t === "cfg") { MP.pvp = !!m.pvp; toast("The host turned PvP " + (MP.pvp ? "ON: players can hit each other." : "off."), MP.pvp ? "#ff8a7a" : "#4ee6b4"); renderMP(); return; }
    if (MP.role === "guest") {
      if (m.t === "tick") { mpGhosts(m); if (m.h) mpState(mpPeer(m.from), m.h); return; }
      if (m.t === "env") { S.time = m.time; if (m.wx) S.wx = m.wx; S.days = m.days | 0; return; }
      if (m.t === "dmg") { if (!cave) { hurt(m.n, m.why || "hit"); if (m.kx) { p.vx = m.kx * 6.5; p.vy = -6; p.on = false; } } return; }
      if (m.t === "kill") return mpKill(m);
      if (m.t === "bosswin") return mpBossWin(m.k);
    } else if (MP.role === "host") {
      if (m.t === "hit") { var e = mpEnemy(m.i); if (e && !e.def) { e.lastHit = m.from; damageEnemy(e, clamp(+m.d || 0, 0, 60), m.f < 0 ? -1 : 1); } return; }
      if (m.t === "farm" && typeof m.k === "string" && CROPS[m.c]) { if (!S.farm[m.k]) S.farm[m.k] = { c: m.c, g: 0, w: 0 }; return; }
      if (m.t === "water" && S.farm[m.k]) { S.farm[m.k].w = WET_S; return; }
    }
    if (m.t === "pvp" && MP.pvp && !cave) { hurt(clamp(+m.d || 0, 0, 60), "pvp"); p.vx = (m.f < 0 ? -1 : 1) * 6.5; p.vy = -5; p.on = false; return; }
  }
  function mpState(q, m) {
    if (Math.abs(m.x - q.x) > 8 || Math.abs(m.y - q.y) > 8) { q.x = m.x; q.y = m.y; }
    q.tx = m.x; q.ty = m.y; q.vx = m.vx || 0; q.vy = m.vy || 0; q.on = !!m.on; q.face = m.f < 0 ? -1 : 1; q.walk = m.w || 0; q.a = m.a || 0.3; q.hp = m.hp == null ? q.hp : m.hp; q.cave = m.c ? 1 : 0; q.seen = performance.now();
  }
  // ---- a guest enters the host's world ----
  function mpEnterGuest(m) {
    if (m.wv !== SW.WORLDVER) { MP.why = "That world is from a different version of Delve. Both players should refresh the page."; try { MP.ws.close(); } catch (e) {} return; }
    var hostS = null; try { hostS = clean(JSON.parse(m.world)); } catch (e) {}
    if (!hostS) { MP.why = "Could not read the host's world."; try { MP.ws.close(); } catch (e) {} return; }
    save(); var keep = JSON.parse(JSON.stringify(S));
    MP.own = { id: curId }; MP.on = true; if (titleOpen) closeTitle(); MP.pvp = !!m.pvp; MP.room = m.room || MP.room; MP.hostName = m.host || MP.hostName; MP.status = "";
    MP_CHAR.forEach(function (k) { if (keep[k] !== undefined) hostS[k] = keep[k]; }); hostS.pets = []; hostS.bossOn = "";
    start(hostS); enemies.length = 0; bshots.length = 0; closeMPV();
    toast("You joined " + MP.hostName + "'s world! Your backpack and gear came with you.", "#4ee6b4"); addChat("", "Joined " + MP.hostName + "'s world. Press Enter to chat."); renderMP();
  }
  function mpSaveChar() {   // guest: write the character back into your own world slot (the host's world is never saved here)
    if (!MP.own) return; reslot(); S.hp = Math.max(1, Math.round(hp));
    var own = null; try { own = JSON.parse(localStorage.getItem(wkey(MP.own.id))); } catch (e) {} if (!own) return;
    MP_CHAR.forEach(function (k) { if (S[k] !== undefined) own[k] = S[k]; });
    try { localStorage.setItem(wkey(MP.own.id), JSON.stringify(own)); } catch (e) {}
  }
  function mpLeave() { if (!MP.ws && !MP.on) return; MP.why = MP.role === "host" ? "You closed your world to visitors." : "You left the world."; var w = MP.ws; MP.ws = null; try { if (w) w.close(1000, "bye"); } catch (e) {} mpEnd(MP.why); }
  function mpEnd(why) {
    var wasGuest = MP.role === "guest" && MP.on, wasOn = MP.on;
    if (wasGuest) { mpSaveChar(); }
    MP.on = false; MP.role = ""; MP.peers = {}; MP.npeers = 0; MP.ws = null; MP.code = wasOn ? "" : MP.code; MP.status = ""; MP.why = ""; MP.sets.length = 0; MP.walls.length = 0;
    if (wasGuest) { var own = readWorld(MP.own.id); MP.own = null; if (own) start(own); enemies.length = 0; bshots.length = 0; }
    if (why && (wasOn || !MP.err)) { if (!wasOn) MP.err = why; toast(why, "#f2c14e"); }
    if (wasOn) addChat("", why || "Disconnected.");
    renderMP(); hbDirty = true;
  }
  function mpMeta() { if (MP.role === "host") { mpSend({ t: "meta", pub: MP.pub, pvp: MP.pvp }); MP.metaT = 45; } }
  // ---- creatures: the host's real ones, mirrored on guests as "ghosts" ----
  function mpEnemy(nid) { for (var i = 0; i < enemies.length; i++) if (enemies[i].nid === nid) return enemies[i]; return null; }
  function enSnap(e) {
    if (!e.nid) e.nid = ++MP.nid; var o = {};
    for (var k in e) { var v = e[k]; if (k === "hist" || k === "tt" || k === "lastHit") continue; if (typeof v === "number") o[k] = Math.round(v * 100) / 100; else if (typeof v === "string" || typeof v === "boolean") o[k] = v; }
    return o;
  }
  function mpGhosts(m) {
    var seen = {};
    (m.en || []).forEach(function (o) {
      seen[o.nid] = 1; var g = mpEnemy(o.nid);
      if (!g) { g = Object.assign({ tt: 0, hist: [] }, o); g.gx = o.x; g.gy = o.y; enemies.push(g); return; }
      var gx = o.x, gy = o.y; delete o.x; delete o.y; Object.assign(g, o); g.gx = gx; g.gy = gy;
      if (Math.abs(gx - g.x) > 6 || Math.abs(gy - g.y) > 6) { g.x = gx; g.y = gy; }
    });
    for (var i = enemies.length - 1; i >= 0; i--) if (!seen[enemies[i].nid]) enemies.splice(i, 1);
    bshots.length = 0; (m.sh || []).forEach(function (s) { bshots.push({ k: s[0], x: s[1], y: s[2], vx: s[3], vy: s[4], wait: s[5], r: s[6], g: s[7], ground: s[8], life: 2 }); });
  }
  function mpGhostStep(dt) {   // guests: glide the mirrored creatures toward their latest positions (the host decides everything else)
    var k = Math.min(1, dt * 12);
    enemies.forEach(function (e) {
      e.tt += dt; if (e.gx === undefined) return; e.x += (e.gx - e.x) * k; e.y += (e.gy - e.y) * k;
      if (e.hurt > 0) e.hurt = Math.max(0, e.hurt - dt);
      if (e.boss && e.hist) { var h0 = e.hist[0]; if (!h0 || Math.abs(h0[0] - e.x) + Math.abs(h0[1] - e.y) > 0.08) { e.hist.unshift([e.x, e.y]); if (e.hist.length > 160) e.hist.pop(); } }
    });
    if (swingQ > 0) { swingQ -= dt; if (swingQ <= 0) strike(); }
    bshots.forEach(function (s) { if (s.wait > 0) { s.wait -= dt; return; } s.vy += (s.g || 0) * dt; s.x += s.vx * dt; s.y += s.vy * dt; });
  }
  function mpRun(e, fn) {   // host: run one creature's brain with the nearest player standing in as "you"
    if (MP.role !== "host" || !MP.npeers) return fn();
    var best = null, bd = cave ? 1e9 : Math.abs(e.x - p.x) + Math.abs(e.y - p.y) * 0.7;
    for (var id in MP.peers) { var q = MP.peers[id]; if (q.cave || q.hp <= 0 || !q.seen) continue; var d = Math.abs(e.x - q.x) + Math.abs(e.y - q.y) * 0.7; if (d < bd) { bd = d; best = q; } }
    if (!best) return fn();
    var sv = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, on: p.on, hp: hp, hg: hurtGrace };
    p.x = best.x; p.y = best.y; p.vx = best.vx; p.vy = best.vy; p.on = best.on; hp = best.hp; hurtGrace = best.grace; MP.proxy = best; MP.proxyE = e;
    try { fn(); } finally { best.grace = hurtGrace; p.x = sv.x; p.y = sv.y; p.vx = sv.vx; p.vy = sv.vy; p.on = sv.on; hp = sv.hp; hurtGrace = sv.hg; MP.proxy = null; MP.proxyE = null; }
  }
  function mpProxyHurt(n, why) {   // a creature hit the player it was chasing on the host's screen: tell that player
    var q = MP.proxy, e = MP.proxyE; if (hurtGrace > 0) return; hurtGrace = 0.5;
    mpSend({ t: "dmg", to: q.id, n: Math.round(n), why: why, kx: e ? (q.x >= e.x ? 1 : -1) : 0 });
  }
  function mpShotHit(s) {   // host: does a boss shot hit a visiting player?
    for (var id in MP.peers) {
      var q = MP.peers[id]; if (q.cave || q.hp <= 0 || !q.seen) continue;
      if (s.x + s.r > q.x - PW / 2 && s.x - s.r < q.x + PW / 2 && s.y + s.r > q.y - PH && s.y - s.r < q.y) { if (!(q.grace > 0)) { q.grace = 0.5; mpSend({ t: "dmg", to: q.id, n: s.dmg, why: s.why, kx: s.vx >= 0 ? 1 : -1 }); } return true; }
    }
    return false;
  }
  function mpKill(m) {   // guest: you landed the last hit, so the kill counts for you too
    var d = ENEMY[m.k]; if (!d || !KSTAT[m.k]) return;
    var kills = ++S.st[KSTAT[m.k]], drop = pityDrop(d.frag, (kills === 1 && !m.small) || Math.random() < d.chance * (m.small ? 0.35 : 1));
    if (drop && d.frag) give(d.frag, 1, undefined, undefined, true);
    var MEAT = { frog: 0.35, wolf: 0.6, gator: 0.7 }; if (MEAT[m.k] && ITEMS.rawmeat && Math.random() < MEAT[m.k]) give("rawmeat", 1, undefined, undefined, true);
    popup("Enemy defeated", d.n + (drop && d.frag ? " • +1 " + ITEMS[d.frag].n : ""), d.glow, "⚔"); checkTrail(); checkGoals();
  }
  function mpBossWin(k) {   // guest: you were there when the boss fell, so you get the reward too
    var B = BOSS[k]; if (!B) return; var first = !(S.st.boss & B.bit); S.st.boss |= B.bit; S.st.bossk++;
    var L = Object.assign({}, B.loot); Object.keys(L).forEach(function (q) { give(q, L[q], undefined, undefined, true); });
    banner(B.n + " defeated!", (first ? "First victory! " : "") + rewardText(L), "Co-op boss"); snd("open", "Epic"); checkTrail(); checkGoals(); save();
  }
  // ---- the per-frame network step ----
  function mpTick(dt) {
    if (!MP.ws) return;
    for (var id in MP.peers) { var q = MP.peers[id], k = Math.min(1, dt * 14); q.x += (q.tx - q.x) * k; q.y += (q.ty - q.y) * k; q.grace = Math.max(0, (q.grace || 0) - dt); if (q.sayT > 0) q.sayT -= dt; }
    if (MP.sayT > 0) MP.sayT -= dt;
    if (!MP.on) return;
    MP.flushT -= dt;
    if (MP.flushT <= 0) { MP.flushT = 0.1; if (MP.sets.length) { mpSend({ t: "set", L: MP.sets }); MP.sets = []; } if (MP.walls.length) { mpSend({ t: "wall", L: MP.walls }); MP.walls = []; } }
    var tp = toolPose(), me = { x: +p.x.toFixed(2), y: +p.y.toFixed(2), vx: +p.vx.toFixed(1), vy: +p.vy.toFixed(1), on: p.on ? 1 : 0, f: p.face, w: +p.walk.toFixed(1), a: +tp.phi.toFixed(2), hp: Math.round(hp), c: cave ? 1 : 0 };
    if (MP.role === "host") {
      if (!MP.npeers) return;
      MP.tickT -= dt;
      if (MP.tickT <= 0) {
        MP.tickT = 0.125;
        var en = cave ? [] : enemies.filter(function (e) { return !e.gone; }).map(enSnap);
        var sh = bshots.map(function (s) { return [s.k, +s.x.toFixed(2), +s.y.toFixed(2), +s.vx.toFixed(2), +s.vy.toFixed(2), +(s.wait || 0).toFixed(2), s.r, s.g || 0, s.ground ? 1 : 0]; });
        mpSend({ t: "tick", h: me, en: en, sh: sh });
      }
      MP.envT -= dt; if (MP.envT <= 0) { MP.envT = 2; mpSend({ t: "env", time: +S.time.toFixed(2), wx: S.wx, days: S.days }); }
      MP.metaT -= dt; if (MP.metaT <= 0) mpMeta();
    } else {
      MP.sendT -= dt; var key = JSON.stringify(me);
      if (MP.sendT <= 0 && (key !== MP.last || MP.sendT < -1.5)) { MP.sendT = 0.125; MP.last = key; me.t = "p"; mpSend(me); }
    }
  }
  function mpTileEdit(x, y, id) { if (MP.on && !MP.applying) MP.sets.push(x, y, id); }
  function mpWallEdit(x, y, id) { if (MP.on && !MP.applying) MP.walls.push(x, y, id); }
  function mpStrikePlayers(lo, hi, dmg, f) {   // PvP: your swing also hits other players in front of you
    if (!MP.on || !MP.pvp || cave) return 0; var n = 0;
    for (var id in MP.peers) { var q = MP.peers[id]; if (q.cave || q.hp <= 0) continue; if (q.x + PW / 2 > lo && q.x - PW / 2 < hi && Math.abs(q.y - p.y) < 1.6) { n++; mpSend({ t: "pvp", to: q.id, d: dmg, f: f }); chips(q.x, q.y - 0.9, "#ff8a7a", 8, 5); text(q.x, q.y - PH - 0.2, "-" + dmg, "#ff8a7a"); } }
    return n;
  }
  // ---- drawing other players ----
  function drawRemotes(g, now) {
    if (!MP.on) return;
    for (var id in MP.peers) {
      var q = MP.peers[id]; if (q.cave || !q.seen) continue;
      var sx = ox + q.x * ts, sy = oy + q.y * ts; if (sx < -ts * 3 || sx > vw + ts * 3 || sy < -ts * 4 || sy > vh + ts * 3) continue;
      var sc = Math.max(1, Math.round(ts * 1.7 / 24));
      if (typeof DelveAv !== "undefined" && (!q.sp || q.sp.s !== sc)) { try { q.sp = DelveAv.sprite(q.outfit || { animal: q.animal || S.animal }, q.animal || S.animal, sc); } catch (e) { q.sp = null; } }
      var SP = q.sp; g.save(); g.translate(sx, sy + ts * 0.14);
      g.fillStyle = "rgba(0,0,0,.28)"; g.beginPath(); g.ellipse(0, -ts * 0.1, ts * 0.48, ts * 0.13, 0, 0, 6.2832); g.fill();
      g.save(); g.scale(q.face, 1); g.scale(AVS, AVS);
      if (SP) {
        var pose = !q.on ? (q.vy < 0 ? "jump" : "fall") : Math.abs(q.vx) > 0.5 ? "walk" + (Math.floor(q.walk / 0.8) % 4) : "idle" + (reduce ? 0 : Math.floor(now / 520) % 2);
        var fx = -SP.fw / 2, fy = -SP.footY - ts * 0.12, sh = SP.shoulder(pose), sm0 = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
        g.drawImage(SP.frame(pose), fx, fy); g.save(); g.translate(fx + sh[0], fy + sh[1]); g.rotate(-q.a); g.drawImage(SP.arm, -SP.armPivot[0], -SP.armPivot[1]); g.restore(); g.imageSmoothingEnabled = sm0;
      } else { g.fillStyle = "#3fae5e"; g.fillRect(-ts * 0.35, -ts * 1.3, ts * 0.7, ts * 1.2); }
      g.restore();
      var top = -ts * 1.75, nm = q.name || "Player"; g.font = "800 " + Math.max(10, Math.round(ts * 0.36)) + "px Nunito,sans-serif"; g.textAlign = "center";
      var tw = g.measureText(nm).width + 12; g.fillStyle = "rgba(6,14,11,.78)"; g.fillRect(-tw / 2, top - 13, tw, 16); g.fillStyle = q.role === "host" ? "#ffe9a8" : "#bff4e4"; g.fillText(nm, 0, top);
      g.fillStyle = "#3a1414"; g.fillRect(-tw / 2, top + 4, tw, 3); g.fillStyle = q.hp > 30 ? "#4ee6b4" : "#ff6a5a"; g.fillRect(-tw / 2, top + 4, tw * clamp(q.hp / MAXHP, 0, 1), 3);
      if (q.sayT > 0 && q.say) mpBubble(g, q.say, top - 20, q.sayT);
      g.restore();
    }
    if (MP.sayT > 0 && MP.say && !cave) { g.save(); g.translate(ox + p.x * ts, oy + p.y * ts + ts * 0.14); mpBubble(g, MP.say, -ts * 1.75 - 6, MP.sayT); g.restore(); }
  }
  function mpBubble(g, txt, y, life) {
    g.font = "700 12px Nunito,sans-serif"; g.textAlign = "center"; var w = Math.min(220, g.measureText(txt).width + 16);
    g.globalAlpha = Math.min(1, life * 2); g.fillStyle = "rgba(246,238,219,.95)"; g.strokeStyle = "#0b1a14"; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(-w / 2 + 8, y - 22); g.lineTo(w / 2 - 8, y - 22); g.quadraticCurveTo(w / 2, y - 22, w / 2, y - 14); g.lineTo(w / 2, y - 8); g.quadraticCurveTo(w / 2, y, w / 2 - 8, y); g.lineTo(5, y); g.lineTo(0, y + 6); g.lineTo(-5, y); g.lineTo(-w / 2 + 8, y); g.quadraticCurveTo(-w / 2, y, -w / 2, y - 8); g.lineTo(-w / 2, y - 14); g.quadraticCurveTo(-w / 2, y - 22, -w / 2 + 8, y - 22); g.fill(); g.stroke();
    g.fillStyle = "#12220f"; g.fillText(txt.length > 34 ? txt.slice(0, 33) + "…" : txt, 0, y - 7); g.globalAlpha = 1;
  }
  // ---- chat ----
  function addChat(who, txt) { MP.chat.push({ who: who, txt: txt, t: performance.now() }); if (MP.chat.length > 30) MP.chat.shift(); drawChat(); }
  function drawChat() {
    var el = $("sbxChatLog"); if (!el) return; var now = performance.now(), open = !$("sbxChat").hidden;
    var lines = MP.chat.filter(function (c) { return open || now - c.t < 9000; }).slice(-6);
    el.innerHTML = lines.map(function (c) { return "<div>" + (c.who ? "<b>" + esc(c.who) + ":</b> " : "<i>") + esc(c.txt) + (c.who ? "" : "</i>") + "</div>"; }).join(""); el.hidden = !MP.on || !lines.length;
  }
  function openChat() { if (!MP.on) return; var c = $("sbxChat"); c.hidden = false; var i = $("sbxChatIn"); i.value = ""; i.focus(); keys.l = keys.r = keys.j = 0; drawChat(); }
  function sendChat() {
    var i = $("sbxChatIn"), t = String(i.value || "").trim().slice(0, 80); $("sbxChat").hidden = true; i.blur();
    if (t && MP.on) { mpSend({ t: "chat", m: t }); MP.say = t; MP.sayT = 5; addChat(MP.myName || "You", t); } drawChat();
  }
  // ---- the Play Together window ----
  function openMPV() { if (panelOpen) closePanel(); if (menuOpen) closeWorlds(); MP.err = MP.on ? "" : MP.err; $("sbxMPV").hidden = false; stageEl.classList.add("panel"); keys.l = keys.r = keys.j = 0; aim.down = false; mine = null; renderMP(); if (!MP.on) mpRefreshList(); }
  function closeMPV() { var el = $("sbxMPV"); if (!el || el.hidden) return; el.hidden = true; if (!panelOpen) stageEl.classList.remove("panel"); }
  function mpRefreshList() { MP.list = null; renderMP(); cloudCall("GET", "/api/mp/list").then(function (r) { MP.list = r.s === 200 && r.j && r.j.rooms ? r.j.rooms : (r.s === 503 ? "off" : []); renderMP(); }); }
  function renderMP() {
    var box = $("sbxMPBox"); if (!box || $("sbxMPV").hidden) { drawMPChip(); return; }
    var h = '<div class="sbx-phead"><h2>Play together</h2><button type="button" class="sbx-x" data-mp="close" aria-label="Close">&times;</button></div><div class="sbx-body mp-body">';
    if (MP.on) {
      var pl = [{ id: MP.id, name: (MP.myName || "You") + " (you)", role: MP.role }].concat(Object.keys(MP.peers).map(function (k) { return MP.peers[k]; }));
      h += '<div class="mp-code"><small>' + (MP.role === "host" ? "Your world is open" : "Playing in " + esc(MP.hostName || "a friend") + "'s world") + "</small><b>" + esc(MP.code) + '</b><button type="button" class="btn ghost" data-mp="copy">Copy code</button></div>';
      h += "<h3>Players " + pl.length + " / 4</h3><div class=\"mp-pl\">" + pl.map(function (q) { return "<div><span class=\"dot" + (q.role === "host" ? " host" : "") + "\"></span><b>" + esc(q.name) + "</b>" + (q.role === "host" ? "<em>Host</em>" : "") + (MP.role === "host" && q.id !== MP.id ? '<button type="button" class="btn ghost" data-mp-kick="' + q.id + '">Kick</button>' : "") + "</div>"; }).join("") + "</div>";
      if (MP.role === "host") h += '<div class="sbx-row"><button type="button" class="btn' + (MP.pub ? "" : " ghost") + '" data-mp="pub">Public: ' + (MP.pub ? "On" : "Off") + '</button><button type="button" class="btn' + (MP.pvp ? "" : " ghost") + '" data-mp="pvp">PvP: ' + (MP.pvp ? "On" : "Off") + "</button></div>";
      else h += '<p class="sbx-note">PvP is ' + (MP.pvp ? "<b>on</b>: other players can hit you." : "off.") + " Creatures, bosses, crops and the weather are run by the host. Your backpack, gear and quests are saved to your own world as you play.</p>";
      h += '<p class="sbx-note">Press <b>Enter</b> (or the chat button) to talk.</p><div class="sbx-row"><button type="button" class="btn ghost" data-mp="chat">Chat</button><button type="button" class="btn ghost warn" data-mp="leave">' + (MP.role === "host" ? "Close to visitors" : "Leave world") + "</button></div>";
    } else if (MP.ws || MP.status) {
      h += '<p class="mp-wait">' + esc(MP.status || "Connecting…") + '</p><div class="sbx-row"><button type="button" class="btn ghost" data-mp="leave">Cancel</button></div>';
    } else {
      if (MP.err) h += '<p class="mp-err">' + esc(MP.err) + "</p>";
      h += "<h3>Host this world</h3>";
      if (WUSER === "guest") h += '<p class="sbx-note">Sign in (top right) to open your world to friends. You can still join other worlds below.</p>';
      else h += '<p class="sbx-note">Up to 3 friends can join <b>' + esc(curEntry() ? curEntry().name : "this world") + '</b> with a room code. You run the world: creatures, bosses, crops and weather.</p><div class="mp-opts"><label><input type="checkbox" id="mpPub"> List it publicly</label><label><input type="checkbox" id="mpPvp"> Allow PvP</label></div><div class="sbx-row"><button type="button" class="btn" data-mp="host">Open my world</button></div>';
      h += '<h3>Join a friend</h3><div class="mp-join"><input id="mpCode" type="text" maxlength="6" placeholder="Room code" autocomplete="off" autocapitalize="characters" aria-label="Room code">' + (WUSER === "guest" ? '<input id="mpName" type="text" maxlength="16" placeholder="Your name" value="' + esc(mpName) + '" aria-label="Your name">' : "") + '<button type="button" class="btn" data-mp="join">Join</button></div>';
      h += '<h3>Public worlds <button type="button" class="btn ghost mp-ref" data-mp="refresh">Refresh</button></h3>';
      if (MP.list === null) h += '<p class="sbx-note">Looking…</p>';
      else if (MP.list === "off") h += '<p class="sbx-note">Multiplayer isn\'t set up on this server yet.</p>';
      else if (!MP.list.length) h += '<p class="sbx-note">No public worlds open right now. Open yours!</p>';
      else h += '<div class="mp-list">' + MP.list.map(function (r) { return '<div class="sbx-w"><div><b>' + esc(r.name) + "</b><small>" + esc(r.host_name) + " · " + r.players + " / 4" + (r.pvp ? " · PvP" : "") + '</small></div><div class="acts"><button type="button" class="btn"' + (r.players >= 4 ? " disabled" : "") + ' data-mp-join="' + r.code + '">' + (r.players >= 4 ? "Full" : "Join") + "</button></div></div>"; }).join("") + "</div>";
    }
    box.innerHTML = h + "</div>"; drawMPChip();
  }
  function drawMPChip() {
    var c = $("sbxMPChip"); if (!c) return; c.hidden = !MP.on;
    if (MP.on) c.innerHTML = '<span class="dot"></span>' + esc(MP.code) + " · " + (MP.npeers + 1) + '/4<button type="button" data-mp="chat" aria-label="Chat">Chat</button>';
  }
  function mpClick(e) {
    var b = e.target.closest("[data-mp],[data-mp-kick],[data-mp-join]"); if (!b) { if (e.target === $("sbxMPV")) closeMPV(); return; }
    var a = b.getAttribute("data-mp"), kid = b.getAttribute("data-mp-kick"), jc = b.getAttribute("data-mp-join");
    if (kid) { mpSend({ t: "kick", id: +kid }); return; }
    if (jc) { mpJoin(jc, $("mpName") ? $("mpName").value : mpName); return; }
    if (a === "close") return closeMPV();
    if (a === "host") return mpHost($("mpPub") && $("mpPub").checked, $("mpPvp") && $("mpPvp").checked);
    if (a === "join") return mpJoin($("mpCode").value, $("mpName") ? $("mpName").value : mpName);
    if (a === "refresh") return mpRefreshList();
    if (a === "leave") { if (MP.ws && !MP.on) { var w = MP.ws; MP.ws = null; MP.status = ""; try { w.close(); } catch (er) {} renderMP(); return; } return mpLeave(); }
    if (a === "copy") { try { navigator.clipboard.writeText(MP.code); toast("Room code copied.", "#4ee6b4"); } catch (er) {} return; }
    if (a === "pub") { MP.pub = !MP.pub; mpMeta(); return renderMP(); }
    if (a === "pvp") { MP.pvp = !MP.pvp; mpMeta(); mpSend({ t: "cfg", pvp: MP.pvp }); toast("PvP " + (MP.pvp ? "on" : "off") + ".", MP.pvp ? "#ff8a7a" : "#4ee6b4"); return renderMP(); }
    if (a === "chat") { closeMPV(); return openChat(); }
  }
  // ---------- HOE ----------
  // S.hoe = 0 (none) .. 3. Tap grass, mud or other soft ground (or the air just above it) to till it into Garden Soil, 1 / 3 / 5 tiles wide.
  // Tap crops to harvest every ripe one in the hoe's width, and each is replanted at once if you carry its seeds. The Iron Hoe sometimes finds an extra crop.
  var HOES = [null, { n: "Reed Hoe", w: 1 }, { n: "Glowspore Hoe", w: 3 }, { n: "Iron Hoe", w: 5, bonus: 0.3 }];
  var TILLABLE = {}; [T.MOSS, T.MUD, T.CLAY, T.ASH, T.SNOW, T.X_peat, T.X_silt].forEach(function (id) { if (id !== undefined) TILLABLE[id] = 1; });
  var hoePrev = false;
  function useHoe(dt) {
    mine = null; var press = aim.down && !hoePrev; hoePrev = aim.down; if (!press || aim.tx < 0) return;
    var tx = aim.tx, ty = aim.ty, ddx = tx + 0.5 - p.x, ddy = ty + 0.5 - (p.y - PH / 2); if (ddx * ddx + ddy * ddy > REACH * REACH) { nag("That's too far away."); return; }
    if (Math.abs(ddx) > 0.35) p.face = ddx < 0 ? -1 : 1; heldPh = 0.3;
    var Ho = HOES[S.hoe], half = (Ho.w - 1) / 2, x, n = 0;
    var cy = cropAt(tx, ty) ? ty : cropAt(tx, ty - 1) ? ty - 1 : -1;
    if (cy >= 0) {   // harvest (and replant) the ripe crops across the hoe
      for (x = tx - half; x <= tx + half; x++) {
        var td = cropAt(x, cy); if (!td || td.stage !== 4) continue;
        var c = td.crop, sd = SEEDOF[c]; harvestCrop(x, cy, td); setT(x, cy, T.AIR); n++; chips(x + 0.5, cy + 0.4, CROPS[c] ? CROPS[c].fruit : "#7fd06a", 6, 4);
        if (Ho.bonus && Math.random() < Ho.bonus && CROPS[c]) give(CROPS[c].produce, 1, x, cy - 1.2);
        if (sd && (S.inv[sd] || 0) > 0 && soilKind(x, cy + 1) && get(x, cy) === T.AIR) { S.inv[sd]--; if (S.inv[sd] <= 0) delete S.inv[sd]; setT(x, cy, CROPS[c].tiles[0]); plantCrop(x, cy, sd); }
      }
      if (!n) nag("Not ripe yet. Ripe crops show their fruit or flowers."); else { S.st.hoeharv += n; reslot(); hbDirty = true; thud(380, 0.05); }
      return;
    }
    var gy = TILLABLE[get(tx, ty)] ? ty : (!blocks(tx, ty) && TILLABLE[get(tx, ty + 1)]) ? ty + 1 : -1;
    if (gy < 0) { nag(soilKind(tx, ty) || soilKind(tx, ty + 1) ? "That's already Garden Soil. Plant seeds on top!" : "Use the hoe on grass, mud or other soft ground to make Garden Soil."); return; }
    for (x = tx - half; x <= tx + half; x++) {
      if (!TILLABLE[get(x, gy)]) continue; var up = TILES[get(x, gy - 1)];
      if (up.solid || up.crop || up.kind === "door" || up.kind === "chest") continue;
      if (get(x, gy - 1) !== T.AIR && get(x, gy - 1) !== T.WATER) setT(x, gy - 1, T.AIR);   // grass tufts and flowers on top are cleared away
      setT(x, gy, T.X_farmland); chips(x + 0.5, gy + 0.1, "#7a5236", 5, 3); n++;
    }
    if (n) { S.st.tilled += n; thud(220, 0.05); checkTrail(); checkGoals(); } else nag("Clear the space above the ground first.");
  }
  // ---------- ARMOR STANDS ----------
  // A wooden mannequin (Decor Workbench). Tap it, or press F beside it, to dress it in any armor and weapon tier you have made.
  // S.stands["x,y"] = { a: armor tier (0 = none), w: weapon tier (0 = none) }. The outfit is drawn over the stand, a little taller than one tile.
  var standAt = null;
  function isStand(x, y) { var td = TILES[get(x, y)]; return !!td && td.kind === "armorstand"; }
  function standNear() {
    if (cave) return null; var bx = Math.floor(p.x), by = Math.floor(p.y - 1), best = null, bd = 9;
    for (var y = by - 2; y <= by + 2; y++) for (var x = bx - 2; x <= bx + 2; x++) if (isStand(x, y)) { var d = Math.abs(x + 0.5 - p.x) + Math.abs(y + 0.5 - (p.y - 1)); if (d < bd) { bd = d; best = { x: x, y: y }; } }
    return best;
  }
  function openStand(x, y) {
    var el = $("sbxStory"); if (!el) return;
    if (MP.on && MP.role === "guest") { nag("Only the host can dress the armor stands in this world."); return; }
    if (mapOpen) closeMap(); if (packOpen) closePack(); if (panelOpen && storyOpen < 0) closePanel();
    standAt = { x: x, y: y }; storyOpen = 200; panelOpen = true; el.hidden = false; stageEl.classList.add("panel"); keys.l = keys.r = keys.j = 0; aim.down = false; mine = null;
    renderStand(); snd("coin");
  }
  function renderStand() {
    var key = standAt.x + "," + standAt.y, st = S.stands[key] || { a: 0, w: 0 }, h = "";
    $("sbxStoryBox").style.setProperty("--qc", st.a ? ARMORS[st.a].c : "#c9a46a");
    h += '<div class="st-stand" aria-hidden="true"><img alt="" src="' + standPreview(st) + '"></div><small>Armor Stand</small><h2 class="st-hi">' + (st.a || st.w ? esc((st.a ? ARMORS[st.a].n : "") + (st.a && st.w ? " + " : "") + (st.w ? WEAPONS[st.w].n : "")) : "Dress it up") + "</h2>";
    h += '<p class="st-tip">Show off the gear you have made. This doesn\'t take anything from you: you keep wearing your own.</p>';
    h += '<div class="st-bhead">Armor</div><div class="st-pick">' + [0, 1, 2, 3, 4, 5].map(function (t) { var own = t === 0 || S.arm >= t; return '<button type="button" class="' + (st.a === t ? "on" : "") + '" data-stand="a:' + t + '"' + (own ? "" : " disabled") + ">" + (t ? '<img alt="" src="' + icon("arm" + t) + '">' : "") + "<span>" + (t ? (own ? esc(ARMORS[t].n) : "Not made yet") : "None") + "</span></button>"; }).join("") + "</div>";
    h += '<div class="st-bhead">Weapon</div><div class="st-pick">' + [0, 1, 2, 3, 4, 5].map(function (t) { var own = t === 0 || S.wpn >= t; return '<button type="button" class="' + (st.w === t ? "on" : "") + '" data-stand="w:' + t + '"' + (own ? "" : " disabled") + ">" + (t ? '<img alt="" src="' + icon("wpn" + t) + '">' : "") + "<span>" + (t ? (own ? esc(WEAPONS[t].n) : "Not made yet") : "None") + "</span></button>"; }).join("") + "</div>";
    h += '<div class="st-row"><button type="button" class="btn ghost" data-stand="best">Best I have</button><button type="button" class="btn" data-story-close>Done</button></div>';
    $("sbxStoryBox").innerHTML = h;
  }
  function standAct(a) {
    var key = standAt.x + "," + standAt.y, st = S.stands[key] || (S.stands[key] = { a: 0, w: 0 });
    if (a === "best") { st.a = S.arm; st.w = S.wpn; }
    else { var q = a.split(":"), t = clamp(+q[1] || 0, 0, 5); if (q[0] === "a" && t <= S.arm) st.a = t; if (q[0] === "w" && t <= S.wpn) st.w = t; }
    S.st.stands = Math.max(S.st.stands, Object.keys(S.stands).filter(function (k) { var v = S.stands[k]; return v.a || v.w; }).length);
    thud(520, 0.04); checkGoals(); save(); renderStand();
  }
  var STPV = {};
  function standPreview(st) {   // a little picture of the dressed stand for the window
    var k = st.a + "_" + st.w; if (STPV[k]) return STPV[k];
    var c = document.createElement("canvas"); c.width = 96; c.height = 120; var g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    paintStand(g, 48, 116, 4, st); return (STPV[k] = c.toDataURL());
  }
  function paintStand(g, cx, by, px, st) {   // by = bottom of the stand, px = size of one art pixel
    g.save(); g.imageSmoothingEnabled = false;
    g.fillStyle = "#5a3a20"; g.fillRect(cx - 5 * px, by - 2 * px, 10 * px, 2 * px); g.fillStyle = "#8a5a32"; g.fillRect(cx - 4 * px, by - 3 * px, 8 * px, 1 * px);   // base
    g.fillStyle = "#7a5230"; g.fillRect(cx - 1 * px, by - 15 * px, 2 * px, 13 * px);   // pole
    g.fillStyle = "#c9a46a"; g.fillRect(cx - 5 * px, by - 22 * px, 10 * px, 8 * px); g.fillStyle = "#a8844e"; g.fillRect(cx - 5 * px, by - 15 * px, 10 * px, 1 * px);   // torso
    g.fillStyle = "#8a6a3a"; g.fillRect(cx - 7 * px, by - 22 * px, 2 * px, 6 * px); g.fillRect(cx + 5 * px, by - 22 * px, 2 * px, 6 * px);   // arms
    g.fillStyle = "#d8b47a"; g.fillRect(cx - 3 * px, by - 27 * px, 6 * px, 5 * px); g.fillStyle = "#a8844e"; g.fillRect(cx - 1 * px, by - 22 * px, 2 * px, 1 * px);   // head
    if (st.a) { var ac = sprCanvas("arm" + st.a); g.drawImage(ac, cx - 8 * px, by - 28 * px, 16 * px, 16 * px); }
    if (st.w) { var wc = sprCanvas("wpn" + st.w); g.save(); g.translate(cx + 8 * px, by - 14 * px); g.rotate(-0.5); g.drawImage(wc, -8 * px, -14 * px, 14 * px, 14 * px); g.restore(); }
    g.restore();
  }
  function drawStands(g, X0, X1, Y0, Y1) {   // the outfits, drawn over the stand tiles in view
    for (var key in S.stands) {
      var q = key.split(","), x = +q[0], y = +q[1], st = S.stands[key];
      if (x < X0 - 1 || x > X1 + 1 || y < Y0 - 2 || y > Y1 + 1) continue;
      if (!isStand(x, y)) { delete S.stands[key]; continue; }
      if (!st.a && !st.w) continue;
      paintStand(g, ox + (x + 0.5) * ts, oy + (y + 1) * ts, ts / 15, st);
    }
  }
  // ---------- BUCKET, BUG NET AND BAIT ----------
  // Bucket (S.bucket 1 wooden, 2 iron; S.bkt = "" | "water" | "lava"): tap water (or lava, iron only) to scoop one tile up, tap an empty space to pour it.
  //   A full water bucket tipped onto crops waters three of them at once.
  // Bug Net (S.net): on swamp nights, tap a firefly to catch it. Fireflies light Firefly Jars and make great bait.
  // Bait: carrying Earthworms (dug up from mud and grass now and then) or Fireflies, each cast uses one: fish bite much sooner, and rare fish come more often.
  var BUCKETS = [null, { n: "Wooden Bucket" }, { n: "Iron Bucket", lava: 1 }];
  var bktPrev = false, netPrev = false;
  function bucketKey() { return "bkt_" + (S.bucket >= 2 ? "i" : "w") + (S.bkt === "water" ? "w" : S.bkt === "lava" ? "l" : ""); }
  function useBucket(dt) {
    mine = null; var press = aim.down && !bktPrev; bktPrev = aim.down; if (!press || aim.tx < 0) return;
    var tx = aim.tx, ty = aim.ty, ddx = tx + 0.5 - p.x, ddy = ty + 0.5 - (p.y - PH / 2); if (ddx * ddx + ddy * ddy > REACH * REACH) { nag("That's too far away."); return; }
    if (Math.abs(ddx) > 0.35) p.face = ddx < 0 ? -1 : 1;
    var id = get(tx, ty);
    if (!S.bkt) {
      if (id === T.WATER || (id === T.LAVA && S.bucket >= 2)) { setT(tx, ty, T.AIR); S.bkt = id === T.WATER ? "water" : "lava"; S.st.scooped++; chips(tx + 0.5, ty + 0.5, id === T.WATER ? "#8fe0ff" : "#ff8a3d", 8, 4); thud(300, 0.05); ICO = {}; hbDirty = true; checkGoals(); }
      else nag(id === T.LAVA ? "Lava would burn a wooden bucket. Make the Iron Bucket." : "Tap water to fill the bucket.");
      return;
    }
    if (S.bkt === "water") {   // tip it over crops: water up to three of them
      var cr = cropNear(tx, ty);
      if (cr) { var nw = 0; for (var x = cr.x - 1; x <= cr.x + 1; x++) { var key = x + "," + cr.y, fe = S.farm[key]; if (fe) { fe.w = WET_S; setSoil(x, cr.y + 1, true); nw++; if (MP.on && MP.role === "guest") mpSend({ t: "water", k: key }); } } if (nw) { S.bkt = ""; S.st.watered += nw; chips(cr.x + 0.5, cr.y, "#8fe0ff", 14, 5); thud(380, 0.05); ICO = {}; hbDirty = true; checkGoals(); return; } }
    }
    if (id !== T.AIR) { nag("Pour it into an empty space."); return; }
    setT(tx, ty, S.bkt === "water" ? T.WATER : T.LAVA); chips(tx + 0.5, ty + 0.5, S.bkt === "water" ? "#8fe0ff" : "#ff8a3d", 10, 4); thud(240, 0.05); S.bkt = ""; ICO = {}; hbDirty = true;
  }
  function useNet(dt) {
    mine = null; var press = aim.down && !netPrev; netPrev = aim.down; if (!press) return;
    var wx = (aim.mx - ox) / ts, wy = (aim.my - oy) / ts, ddx = wx - p.x, ddy = wy - (p.y - PH / 2); if (ddx * ddx + ddy * ddy > (REACH + 1) * (REACH + 1)) { nag("That's too far away."); return; }
    p.face = ddx < 0 ? -1 : 1; heldPh = 0.3; thud(700, 0.02);
    for (var i = 0; i < flies.length; i++) {
      var fl = flies[i], fx = fl.x - wx, fy = fl.y - wy;
      if (fx * fx + fy * fy < 1.6) { flies.splice(i, 1); give("firefly", 1, fl.x - 0.5, fl.y - 0.3); S.st.fireflies++; chips(fl.x, fl.y, "#dcff78", 10, 3); snd("coin"); checkGoals(); return; }
    }
    if (!flies.length) nag("Fireflies come out on swamp nights, close to the ground.");
  }
  function takeBait() {   // one Earthworm or Firefly per cast, if you carry any: [bite time multiplier, extra rare chance]
    var k = (S.inv.earthworm || 0) > 0 ? "earthworm" : (S.inv.firefly || 0) > 0 ? "firefly" : ""; if (!k) return [1, 0];
    S.inv[k]--; if (S.inv[k] <= 0) delete S.inv[k]; reslot(); hbDirty = true; S.st.baited++;
    if (!(S.st.htip & 2)) { S.st.htip |= 2; toast("Baited the hook with " + (k === "firefly" ? "a Firefly" : "an Earthworm") + "! Bait makes fish bite sooner and brings rare fish.", "#7fd6ff"); }
    return k === "firefly" ? [0.5, isNight(S.time) ? 0.1 : 0.06] : [0.6, 0.04];
  }
  // ---------- SPRINKLERS, FISH TRAPS, HOMEWARD SHELL ----------
  // Sprinkler (placed like furniture): keeps every crop within 3 tiles to each side (one row up or down) watered, so they grow twice as fast.
  // Fish Trap: place it on the bottom of a lake or pond. It catches a fish about every two minutes while it is in water, up to 4.
  //   Tap it (or press F) to empty it; hold to pick it up. S.traps["x,y"] = { f: [fish ids], t: seconds towards the next catch }.
  // Homeward Shell: hold it and tap. After a moment you are carried home, to your bed (or the camp if you have no bed). One use each.
  var TRAP_MAX = 4, TRAP_T = 120, homeT = 0, homeLock = false;
  function sprinkled(x, y) { for (var yy = y - 1; yy <= y + 1; yy++) for (var xx = x - 3; xx <= x + 3; xx++) if (get(xx, yy) === T.X_sprinkler) return true; return false; }
  function isTrap(x, y) { var td = TILES[get(x, y)]; return !!td && td.kind === "fishtrap"; }
  function trapWet(x, y) { return get(x - 1, y) === T.WATER || get(x + 1, y) === T.WATER || get(x, y - 1) === T.WATER; }
  function tickTraps(sec) {
    Object.keys(S.traps).forEach(function (key) {
      var q = key.split(","), x = +q[0], y = +q[1], tr = S.traps[key];
      if (!isTrap(x, y)) { delete S.traps[key]; return; }
      if (tr.f.length >= TRAP_MAX || !trapWet(x, y)) return;
      tr.t += sec; if (tr.t < TRAP_T) return; tr.t = 0;
      var tab = FISHTAB.water, rr = Math.random(), k = rr < 0.06 ? tab[2][0] : rr < 0.6 ? tab[0][0] : tab[1][0];
      if (world.bio[x] === 2) { var ft = FISHTAB.ice; k = rr < 0.06 ? ft[2][0] : rr < 0.6 ? ft[0][0] : ft[1][0]; }
      tr.f.push(k);
    });
  }
  function trapNear() {
    if (cave) return null; var bx = Math.floor(p.x), by = Math.floor(p.y - 1), best = null, bd = 9;
    for (var y = by - 2; y <= by + 3; y++) for (var x = bx - 2; x <= bx + 2; x++) if (isTrap(x, y)) { var d = Math.abs(x + 0.5 - p.x) + Math.abs(y + 0.5 - (p.y - 1)); if (d < bd) { bd = d; best = { x: x, y: y }; } }
    return best;
  }
  function emptyTrap(x, y, quiet) {
    var key = x + "," + y, tr = S.traps[key] || (S.traps[key] = { f: [], t: 0 });
    if (!tr.f.length) { if (!quiet) nag(trapWet(x, y) ? "Nothing yet. Check back in a little while." : "A Fish Trap only works under water. Place it on the bottom of a lake."); return; }
    tr.f.forEach(function (k) { give(k, 1, x, y - 0.6, true); S.fdex[k] = 1; S.st.fish++; S.st.trapped++; });
    chips(x + 0.5, y + 0.5, "#8fe0ff", 10, 4); snd("coin"); tr.f = []; checkTrail(); checkGoals(); save();
  }
  function drawTraps(g, X0, X1, Y0, Y1) {
    for (var key in S.traps) {
      var q = key.split(","), x = +q[0], y = +q[1], tr = S.traps[key]; if (!tr.f.length || x < X0 - 1 || x > X1 + 1 || y < Y0 - 2 || y > Y1 + 1) continue;
      var bx = ox + (x + 0.5) * ts, byy = oy + (y - 0.4) * ts + Math.sin(performance.now() / 300) * 2, r = Math.max(9, ts * 0.32), im = imgOf(icon(tr.f[tr.f.length - 1]));
      g.fillStyle = "rgba(10,20,16,.85)"; g.strokeStyle = "#8fe0ff"; g.lineWidth = 1.5; g.beginPath(); g.arc(bx, byy, r, 0, 7); g.fill(); g.stroke();
      if (im) g.drawImage(im, bx - r * 0.75, byy - r * 0.75, r * 1.5, r * 1.5);
      if (tr.f.length > 1) { g.fillStyle = "#8fe0ff"; g.font = "900 " + Math.round(r * 0.8) + "px Nunito,sans-serif"; g.textAlign = "center"; g.fillText("x" + tr.f.length, bx + r, byy + r); }
    }
  }
  function useHome(dt) {
    mine = null;
    if (!aim.down) homeLock = false;
    if (homeLock) return;
    if (!aim.down) { if (homeT > 0) { homeT = 0; toast("The shell went quiet.", "#f6eedb"); } return; }
    if (cave) { if (!homeT) nag("The shell needs open sky. Use it on the surface."); return; }
    if (activeBoss()) { if (!homeT) nag("Not in the middle of a boss fight!"); return; }
    if (!homeT) { homeT = 0.01; thud(660, 0.04); }
    homeT += dt; if (Math.random() < 0.5) parts.push({ x: p.x + (Math.random() - 0.5), y: p.y - Math.random() * 1.6, vx: 0, vy: -1.5, life: 0.6, max: 0.6, c: "#bff4e4", s: 3 });
    if (homeT < 1.2) return;
    homeT = 0; homeLock = true; S.inv[sel]--; if (S.inv[sel] <= 0) { delete S.inv[sel]; sel = "pick"; } reslot(); hbDirty = true;
    var sp = world.spawn, bd = S.bed && get(S.bed.x, S.bed.y) === T.BED ? S.bed : null;
    chips(p.x, p.y - 1, "#bff4e4", 20, 6);
    if (bd) { p.x = bd.x + 0.5; p.y = bd.y + 1; } else { p.x = sp.x; p.y = sp.y; }
    p.vx = p.vy = 0; var gg = 0; while (boxHit(p.x, p.y) && gg++ < 60) p.y -= 1; cam.x = p.x; cam.y = p.y - 1;
    chips(p.x, p.y - 1, "#bff4e4", 24, 7); snd("open", "Epic"); S.st.homes++; toast(bd ? "Home to your bed!" : "Home to camp!", "#4ee6b4"); checkGoals(); save();
  }
  // ---------- THE REALM GATE (the end of the first world) ----------
  // Craft a Realm Gate at a Frost Workbench and place it. Tap it (or press F) to open it: offer the three boss trophies, the three lights
  // (Ember Ruby, Frost Sapphire, Moonstone) and 8 Realm Shards, one socket at a time. With every socket lit you can awaken the gate, and
  // stepping through finishes the first world (S.done = 1, the epilogue plays) and leads on to the Swamp Realms Dimension.
  // S.gates["x,y"] = { o: { item: 1 offered }, on: 0/1 }. Breaking a gate hands back everything offered to it.
  var GATE_OFFER = [
    ["queenchitin", 1, "#ff6b82"], ["wyrmscale", 1, "#ff8a3d"], ["alphamane", 1, "#9fe8ff"],
    ["ruby", 1, "#e0364a"], ["sapphire", 1, "#3f7fe6"], ["moonstone", 1, "#c9d2ff"], ["realmshard", 8, "#8affe0"]
  ];
  var gateAt = null, gateFx = 0;
  function isJewel(x, y) { var td = TILES[get(x, y)]; return !!td && td.kind === "jeweltable"; }
  function jewelNear() { if (cave) return null; var bx = Math.floor(p.x), by = Math.floor(p.y - 1); for (var y = by - 1; y <= by + 2; y++) for (var x = bx - 2; x <= bx + 2; x++) if (isJewel(x, y)) return { x: x, y: y }; return null; }
  function isGate(x, y) { var td = TILES[get(x, y)]; return !!td && td.kind === "realmgate"; }
  function gateOf(x, y) { var k = x + "," + y; return S.gates[k] || (S.gates[k] = { o: {}, on: 0 }); }
  function gateFull(g) { return GATE_OFFER.every(function (o) { return g.o[o[0]]; }); }
  function gateNear() {
    if (cave) return null; var bx = Math.floor(p.x), by = Math.floor(p.y - 1), best = null, bd = 9;
    for (var y = by - 2; y <= by + 3; y++) for (var x = bx - 2; x <= bx + 2; x++) if (isGate(x, y)) { var d = Math.abs(x + 0.5 - p.x) + Math.abs(y + 0.5 - (p.y - 1)); if (d < bd) { bd = d; best = { x: x, y: y }; } }
    return best;
  }
  function openGate(x, y) {
    var el = $("sbxStory"); if (!el) return;
    if (MP.on && MP.role === "guest") { nag("Only the host can work the Realm Gate in this world."); return; }
    if (mapOpen) closeMap(); if (packOpen) closePack(); if (panelOpen && storyOpen < 0) closePanel();
    gateAt = { x: x, y: y }; storyOpen = 201; panelOpen = true; el.hidden = false; stageEl.classList.add("panel"); keys.l = keys.r = keys.j = 0; aim.down = false; mine = null;
    renderGate(); snd("open", "Rare");
  }
  function renderGate() {
    var g = gateOf(gateAt.x, gateAt.y), n = GATE_OFFER.filter(function (o) { return g.o[o[0]]; }).length, h = "";
    $("sbxStoryBox").style.setProperty("--qc", "#8affe0");
    h += '<small>' + (g.on ? "The gate is awake" : n + " of " + GATE_OFFER.length + " sockets lit") + '</small><h2 class="st-hi">Realm Gate</h2>';
    if (S.done && g.on) h += '<p class="st-tip">The way is open. Beyond it waits the <b>Swamp Realms Dimension</b>, the place between all worlds. It is still taking shape... check back soon!</p>';
    else if (g.on) h += '<p class="st-tip">The gate hums with light from all three lands. Step through when you are ready.</p>';
    else h += '<p class="st-tip">Light every socket to wake the gate: the trophies of the three bosses, the three lights of the lands, and <b>8 Realm Shards</b> from the Realmstone near the bottom of the world.</p>';
    h += '<div class="st-gate">' + GATE_OFFER.map(function (o) {
      var k = o[0], done = !!g.o[k], have = inv(k);
      return '<div class="gt-it' + (done ? " on" : "") + '" style="--gc:' + o[2] + '"><img alt="" src="' + icon(k) + '"><span><b>' + esc(ITEMS[k].n) + (o[1] > 1 ? " x" + o[1] : "") + '</b><em>' + (done ? "Socket lit" : "You have " + have) + '</em></span>'
        + (done ? '<i aria-hidden="true">✔</i>' : '<button type="button" class="btn' + (have >= o[1] ? "" : " ghost") + '" data-gate="o:' + k + '"' + (have >= o[1] ? "" : " disabled") + '>Offer</button>') + '</div>';
    }).join("") + '</div>';
    h += '<div class="st-row st-row2">' + (g.on ? '<button type="button" class="btn" data-gate="go">' + (S.done ? "Step through again" : "Step through") + '</button>' : '<button type="button" class="btn' + (gateFull(g) ? "" : " ghost") + '" data-gate="wake"' + (gateFull(g) ? "" : " disabled") + '>Awaken the gate</button>') + '<button type="button" class="btn ghost" data-story-close>Close</button></div>';
    $("sbxStoryBox").innerHTML = h;
  }
  function gateAct(a) {
    var g = gateOf(gateAt.x, gateAt.y), gx = gateAt.x + 0.5, gy = gateAt.y - 1.2;
    if (a.indexOf("o:") === 0) {
      var k = a.slice(2), o = GATE_OFFER.filter(function (q) { return q[0] === k; })[0]; if (!o || g.o[k]) return;
      if (inv(k) < o[1]) { nag("You need " + o[1] + " " + ITEMS[k].n + "."); return; }
      S.inv[k] -= o[1]; if (S.inv[k] <= 0) delete S.inv[k]; reslot(); hbDirty = true; g.o[k] = 1;
      chips(gx, gy, o[2], 16, 6); snd("coin"); thud(520, 0.05); save();
    } else if (a === "wake" && gateFull(g) && !g.on) {
      g.on = 1; S.st.gatewake = 1; gateFx = 2; chips(gx, gy, "#8affe0", 60, 14); snd("open", "Epic"); toast("The Realm Gate awakens!", "#8affe0"); checkTrail(); checkGoals(); save();
    } else if (a === "go" && g.on) { closeStory(); enterGate(); return; }
    renderGate();
  }
  function enterGate() {   // a bright fade, then the epilogue; you come back out beside the gate
    var fx = document.createElement("div"); fx.className = "sbx-gatefx"; stageEl.appendChild(fx); snd("open", "Epic");
    requestAnimationFrame(function () { fx.classList.add("on"); });
    setTimeout(function () {
      var first = !S.done; S.done = 1; S.st.gatein = (S.st.gatein || 0) + 1; save();
      checkTrail();
      if (!first || MAIN[S.qi]) { storyQ.length = 0; storyQ.push(CHAPTERS.length - 1); showStory(); }   // the epilogue (checkTrail tells it itself when this was the last main quest)
      setTimeout(function () { fx.classList.remove("on"); setTimeout(function () { if (fx.parentNode) fx.parentNode.removeChild(fx); }, 900); }, 400);
    }, 1300);
  }
  function placedGate(tx, ty) { S.gates[tx + "," + ty] = { o: {}, on: 0 }; S.st.gatepl = 1; checkTrail(); toast("The Realm Gate stands. Tap it to see what it needs.", "#8affe0"); }
  function brokeGate(x, y) {
    var g = S.gates[x + "," + y]; if (!g) return;
    GATE_OFFER.forEach(function (o) { if (g.o[o[0]]) give(o[0], o[1], x, y - 0.6, true); });
    delete S.gates[x + "," + y];
  }
  function drawGates(g, X0, X1, Y0, Y1) {   // the stone arch, its sockets, and the swirling portal once it is awake
    var now = performance.now() / 1000;
    for (var key in S.gates) {
      var q = key.split(","), x = +q[0], y = +q[1], G = S.gates[key]; if (x < X0 - 3 || x > X1 + 3 || y < Y0 - 1 || y > Y1 + 5) continue;
      if (!isGate(x, y)) continue;
      var cx = ox + (x + 0.5) * ts, by = oy + (y + 1) * ts, u = ts / 16, w = 44 * u, hgt = 64 * u, top = by - hgt;
      g.save();
      if (G.on) {   // the portal
        var rr = g.createRadialGradient(cx, top + hgt * 0.5, 2 * u, cx, top + hgt * 0.5, w * 0.5);
        rr.addColorStop(0, "rgba(255,255,255,.95)"); rr.addColorStop(0.35, "rgba(138,255,224,.85)"); rr.addColorStop(0.75, "rgba(192,106,255,.7)"); rr.addColorStop(1, "rgba(40,20,60,.6)");
        g.fillStyle = rr; g.beginPath(); g.ellipse(cx, top + hgt * 0.54, w * 0.36, hgt * 0.4, 0, 0, 7); g.fill();
        g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 1.5 * u;
        for (var sw = 0; sw < 3; sw++) { g.beginPath(); g.ellipse(cx, top + hgt * 0.54, w * (0.12 + sw * 0.08), hgt * (0.14 + sw * 0.08), now * (1.2 + sw * 0.5) + sw, 0.3, 4); g.stroke(); }
        if (!reduce && Math.random() < 0.3) parts.push({ x: x + 0.5 + (Math.random() - 0.5) * 2, y: y - 1.5 + (Math.random() - 0.5) * 2.5, vx: 0, vy: -0.8, life: 0.8, max: 0.8, c: Math.random() < 0.5 ? "#8affe0" : "#c06aff", s: 2 });
      } else { g.fillStyle = "rgba(20,14,34,.55)"; g.beginPath(); g.ellipse(cx, top + hgt * 0.54, w * 0.36, hgt * 0.4, 0, 0, 7); g.fill(); }
      // pillars and arch
      g.fillStyle = "#3a3450"; g.fillRect(cx - w * 0.5, top + hgt * 0.18, 8 * u, hgt * 0.82); g.fillRect(cx + w * 0.5 - 8 * u, top + hgt * 0.18, 8 * u, hgt * 0.82);
      g.fillStyle = "#5a5274"; g.fillRect(cx - w * 0.5, top + hgt * 0.18, 3 * u, hgt * 0.82); g.fillRect(cx + w * 0.5 - 8 * u, top + hgt * 0.18, 3 * u, hgt * 0.82);
      g.strokeStyle = "#3a3450"; g.lineWidth = 8 * u; g.beginPath(); g.ellipse(cx, top + hgt * 0.3, w * 0.5 - 4 * u, hgt * 0.26, 0, Math.PI, 0); g.stroke();
      g.strokeStyle = "#5a5274"; g.lineWidth = 2 * u; g.beginPath(); g.ellipse(cx, top + hgt * 0.3, w * 0.5 - 1 * u, hgt * 0.26 + 3 * u, 0, Math.PI, 0); g.stroke();
      g.fillStyle = "#2a2440"; g.fillRect(cx - w * 0.58, by - 5 * u, w * 1.16, 5 * u); g.fillStyle = "#4a4262"; g.fillRect(cx - w * 0.58, by - 5 * u, w * 1.16, 1.5 * u);
      // seven sockets around the arch
      GATE_OFFER.forEach(function (o, i) {
        var ang = Math.PI + (i + 0.5) / GATE_OFFER.length * Math.PI, sx = cx + Math.cos(ang) * (w * 0.5 - 4 * u), sy = top + hgt * 0.3 + Math.sin(ang) * hgt * 0.26, lit = G.o[o[0]];
        if (lit) { g.shadowColor = o[2]; g.shadowBlur = 8 * u; }
        g.fillStyle = lit ? o[2] : "#1a1626"; g.beginPath(); g.arc(sx, sy, 2.6 * u, 0, 7); g.fill(); g.shadowBlur = 0;
      });
      g.restore();
    }
  }
  // ---------- RANGED WEAPONS ----------
  // A fourth gear track, S.bow 0-3: Reed Slingshot (shoots Pebbles), Bogwood Bow and Ember Longbow (shoot Arrows; Fire Arrows hit harder and
  // set the target burning). Hold the tool and tap (or hold) toward a target: one shot per cooldown, flying in an arc on the surface and
  // straight in caves. Shots stop at solid blocks. Ammo comes from your bag: Fire Arrows are used first, then plain Arrows.
  var BOWS = [null,
    { n: "Reed Slingshot", c: "#c9b58a", dmg: 4, cd: 0.55, sp: 17, g: 20, ammo: ["pebble"] },
    { n: "Bogwood Bow", c: "#a8814b", dmg: 11, cd: 0.6, sp: 23, g: 12, ammo: ["firearrow", "arrow"] },
    { n: "Ember Longbow", c: "#ff8a3d", dmg: 20, cd: 0.5, sp: 29, g: 8, ammo: ["firearrow", "arrow"] }
  ];
  var arrows = [], burns = [];
  function bowAmmo() { var B = BOWS[S.bow]; if (!B) return null; for (var i = 0; i < B.ammo.length; i++) if (inv(B.ammo[i]) > 0) return B.ammo[i]; return null; }
  function ammoCount() { var B = BOWS[S.bow]; if (!B) return 0; var n = 0; B.ammo.forEach(function (k) { n += inv(k); }); return n; }
  function useBow(dt) {
    mine = null; cool -= dt; if (!aim.down || !S.bow) return;
    var B = BOWS[S.bow], inCave = !!cave, px0 = inCave ? cp.x : p.x, py0 = inCave ? cp.y - 0.5 : p.y - 1.15;
    var tx = (aim.mx - ox) / ts, ty = (aim.my - oy) / ts, dx = tx - px0, dy = ty - py0, d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (Math.abs(dx) > 0.2) { if (inCave) cp.face = dx < 0 ? -1 : 1; else p.face = dx < 0 ? -1 : 1; }
    if (cool > 0) return;
    var am = bowAmmo();
    if (!am) { cool = 0.6; nag(S.bow === 1 ? "Out of Pebbles. Dig mud or stone for more." : "Out of Arrows. Craft some from Sticks, Pebbles and Fiber."); return; }
    cool = B.cd * (gem("bow", "sapphire") ? 0.85 : 1); if (!(gem("bow", "amethyst") && Math.random() < 0.25)) { S.inv[am]--; if (S.inv[am] <= 0) { delete S.inv[am]; reslot(); } } hbDirty = true; S.st.shots++;
    var fire = am === "firearrow", sp = B.sp * (gem("bow", "moonstone") ? 1.3 : 1), lift = inCave ? 0 : Math.min(0.35, d * 0.012);   // aim a little high on long shots so the arc lands near where you tapped
    var ux = dx / d, uy = dy / d - lift, ul = Math.sqrt(ux * ux + uy * uy); ux /= ul; uy /= ul;
    arrows.push({ x: px0 + ux * 0.5, y: py0 + uy * 0.5, vx: ux * sp, vy: uy * sp, g: inCave ? 0 : B.g, dmg: Math.round((B.dmg + (fire ? 6 : 0)) * (gem("bow", "ruby") ? 1.2 : gem("bow", "amber") ? 1.1 : 1)), fire: fire, peb: am === "pebble", life: 2.2, cave: inCave });
    thud(S.bow === 1 ? 420 : 260, 0.04);
  }
  function burnStep(dt) {
    for (var i = burns.length - 1; i >= 0; i--) {
      var b = burns[i]; b.t -= dt; b.tick -= dt;
      if (b.e.def || b.e.gone || b.t <= 0) { burns.splice(i, 1); continue; }
      if (b.tick <= 0) { b.tick = 0.6; if (b.cave) damageCaveMob(b.e, 2, 0, 0); else damageEnemy(b.e, 2, 0); chips(b.e.x, b.e.y - (b.cave ? 0.3 : b.e.h * 0.5), "#ff8a3d", 4, 3); }
    }
  }
  function arrowHit(a, e, cv) {
    var f = a.vx >= 0 ? 1 : -1;
    if (cv) { var l = Math.sqrt(a.vx * a.vx + a.vy * a.vy) || 1; damageCaveMob(e, a.dmg, a.vx / l, a.vy / l); } else { e.lastHit = 0; damageEnemy(e, a.dmg, f); }
    if (a.fire) { var have = burns.filter(function (b) { return b.e === e; })[0]; if (have) have.t = 3; else burns.push({ e: e, t: 3, tick: 0.6, cave: cv }); }
    S.st.arrowhits++;
  }
  function stepArrows(dt) {
    burnStep(dt);
    for (var i = arrows.length - 1; i >= 0; i--) {
      var a = arrows[i], gone = false;
      if (a.cave !== !!cave) { arrows.splice(i, 1); continue; }
      var sub = Math.ceil(dt / 0.012), h = dt / sub;
      for (var k = 0; k < sub && !gone; k++) {
        a.vy += a.g * h; a.x += a.vx * h; a.y += a.vy * h; a.life -= h;
        if (a.life <= 0) { gone = true; break; }
        if (a.cave) {
          var F = cave.F; if (!mobFree(F, a.x, a.y, 0.05, true)) { gone = true; chips(a.x, a.y, a.peb ? "#9a9088" : "#c9a46a", 4, 3); break; }
          (F.mobs || []).forEach(function (m) { if (gone || m.def) return; var mx = m.x - a.x, my = (m.y - 0.3) - a.y; if (mx * mx + my * my < (m.r + 0.18) * (m.r + 0.18)) { arrowHit(a, m, true); gone = true; } });
        } else {
          if (blocks(Math.floor(a.x), Math.floor(a.y))) { gone = true; chips(a.x, a.y, a.peb ? "#9a9088" : "#c9a46a", 4, 3); break; }
          enemies.forEach(function (e) { if (gone || e.def || e.u) return; var top = e.y - e.h - (FLIER[e.k] ? 0.2 : 0); if (a.x > e.x - e.w / 2 - 0.1 && a.x < e.x + e.w / 2 + 0.1 && a.y > top - 0.1 && a.y < e.y + 0.1) { arrowHit(a, e, false); gone = true; } });
        }
      }
      if (gone) arrows.splice(i, 1);
    }
  }
  function drawArrows(g, cv) {
    arrows.forEach(function (a) {
      if (a.cave !== cv) return;
      var sx = ox + a.x * ts, sy = oy + a.y * ts, u = ts / 16; g.save(); g.translate(sx, sy);
      if (a.peb) { g.fillStyle = "#8a8078"; g.beginPath(); g.arc(0, 0, 1.6 * u, 0, 7); g.fill(); g.fillStyle = "#b8aea4"; g.fillRect(-0.8 * u, -0.8 * u, u, u); }
      else {
        g.rotate(Math.atan2(a.vy, a.vx)); g.fillStyle = "#8a6a3a"; g.fillRect(-6 * u, -0.5 * u, 10 * u, u);
        g.fillStyle = a.fire ? "#ffd23f" : "#cfd6dc"; g.beginPath(); g.moveTo(6 * u, 0); g.lineTo(3.5 * u, -1.6 * u); g.lineTo(3.5 * u, 1.6 * u); g.closePath(); g.fill();
        g.fillStyle = a.fire ? "#ff6a1f" : "#e8e0c8"; g.fillRect(-7 * u, -1.5 * u, 2 * u, u); g.fillRect(-7 * u, 0.5 * u, 2 * u, u);
        if (a.fire && !reduce && Math.random() < 0.5) parts.push({ x: a.x, y: a.y, vx: 0, vy: -1, life: 0.25, max: 0.25, c: Math.random() < 0.5 ? "#ff8a3d" : "#ffd23f", s: 2 });
      }
      g.restore();
    });
  }
  // ---------- POTIONS (Brewing Stand) ----------
  // Brew at a Brewing Stand: each potion is a Glass Bottle plus plants, crops or critters. Hold one and tap to drink it; you keep the bottle.
  // Timed effects live in S.fx = { key: seconds left } (saved), shown as chips above your health. Drinking the same one again resets its timer.
  //   heal: Healing Tonic (instant 40 health)   mine: dig 40% faster   speed: walk and swim 25% faster   night: see far in the dark
  //   fire: lava burns 80% less   hide: take 20% less damage   fish: fish bite 40% sooner
  var POTIONS = {
    tonic_heal: { fx: "", heal: 40, c: "#ff5a6a", d: "Heals 40 health right away." },
    tonic_mine: { fx: "mine", t: 180, c: "#b58cff", d: "Dig 40% faster for 3 minutes." },
    tonic_speed: { fx: "speed", t: 180, c: "#ffd23f", d: "Walk and swim 25% faster for 3 minutes." },
    tonic_night: { fx: "night", t: 240, c: "#d8ff6a", d: "See much farther in the dark for 4 minutes." },
    tonic_fire: { fx: "fire", t: 180, c: "#ff8a3d", d: "Lava burns you 80% less for 3 minutes." },
    tonic_hide: { fx: "hide", t: 180, c: "#7fd6ff", d: "Take 20% less damage for 3 minutes." },
    tonic_fish: { fx: "fish", t: 300, c: "#4ee6b4", d: "Fish bite 40% sooner for 5 minutes." },
    tonic_leap: { fx: "leap", t: 180, c: "#d08aff", d: "Jump 30% higher for 3 minutes." }
  };
  var FXN = { mine: "Mining", speed: "Swiftness", night: "Night Eye", fire: "Emberguard", hide: "Ironhide", fish: "Angler", leap: "Leaping" }, fxKey = "";
  function fx(k) { return !!(S.fx && S.fx[k] > 0); }
  function tickFx(dt) {
    if (hexSlow > 0) hexSlow -= dt;
    var ch = false; for (var k in S.fx) { S.fx[k] -= dt; if (S.fx[k] <= 0) { delete S.fx[k]; ch = true; toast((FXN[k] || k) + " wore off.", "#f6eedb"); } }
    drawFx(ch);
  }
  function drawFx(force) {
    var el = $("sbxFx"); if (!el) return;
    var ks = Object.keys(S.fx || {}), key = ks.map(function (k) { return k + Math.ceil(S.fx[k] / 5); }).join("|");
    if (!force && key === fxKey) return; fxKey = key; el.hidden = !ks.length;
    el.innerHTML = ks.map(function (k) {
      var pk = Object.keys(POTIONS).filter(function (q) { return POTIONS[q].fx === k; })[0], t = Math.ceil(S.fx[k]), mm = Math.floor(t / 60), ss = t % 60;
      return '<span class="fx-chip" style="--fc:' + (pk ? POTIONS[pk].c : "#fff") + '" title="' + esc(FXN[k] || k) + '"><img alt="" src="' + icon(pk || "bottle") + '"><b>' + mm + ":" + (ss < 10 ? "0" : "") + ss + "</b></span>";
    }).join("");
  }
  function drink(k) {
    var P = POTIONS[k]; if (!P || !(S.inv[k] > 0)) return;
    if (P.heal && hp >= MAXHP) { nag("You are already at full health."); return; }
    S.inv[k]--; if (S.inv[k] <= 0) { delete S.inv[k]; if (sel === k) sel = "pick"; } give("bottle", 1, p.x, p.y - 1, true); reslot(); hbDirty = true;
    if (P.heal) { hp = Math.min(MAXHP, hp + P.heal); drawHp(); }
    if (P.fx) { S.fx[P.fx] = P.t; drawFx(true); }
    S.st.drunk++; S.mk["drank_" + k] = 1; chips(cave ? cp.x : p.x, (cave ? cp.y : p.y) - 1.2, P.c, 14, 5); snd("rise");
    toast(ITEMS[k].n + ": " + P.d, P.c); checkGoals(); save();
  }
  var drankAt = 0;
  function useDrink(dt) { mine = null; var now = performance.now(); if (!aim.down || now - drankAt < 800) return; drankAt = now; drink(sel); }   // its own timer: the shared tool cooldown only ticks while that tool is held
  function potionSprite(c) {
    return { r: ["................", "......oooo......", "......mmmm......", ".......oo.......", ".......gg.......", "......oggo......", ".....oggggo.....", "....ogwggggo....", "....ogLLLLLo....", "....oLLwLLLo....", "....oLLLLLLo....", "....oLLLLLDo....", ".....oLLLDo.....", "......oooo......", "................", "................"],
      p: { o: "#2a3a44", m: "#8a6a3a", g: "#cfeaf2", w: "#ffffff", L: c, D: "#00000055" }, o: "#16222a" };
  }
  SPR.bottle = potionSprite("#e8f6fa"); Object.keys(POTIONS).forEach(function (k) { SPR[k] = potionSprite(POTIONS[k].c); });
  // ---------- GEM SOCKETS (Jeweler's Table) ----------
  // Each piece of gear has one socket: S.gems = { wpn, arm, pick, bow } = gem item id or "". Socket a gem at a Jeweler's Table (tap it):
  // it costs the gem and 1 Quartz Shard. Swapping hands the old gem back. The bonus depends on the gem and on which gear it is in.
  var GEMS = ["amber", "ruby", "sapphire", "amethyst", "moonstone"];
  var GEMFX = {
    wpn: { amber: "+10% damage", ruby: "+20% damage", sapphire: "Swings 15% faster", amethyst: "Heal 1 health per hit", moonstone: "+30% damage to bosses" },
    arm: { amber: "Hunger drains 15% slower", ruby: "Lava burns 40% less", sapphire: "Blocks 8% more damage", amethyst: "Health comes back 25% faster", moonstone: "Take 20% less damage at night" },
    pick: { amber: "Dig 10% faster", ruby: "Dig 20% faster", sapphire: "Wears out 35% slower", amethyst: "15% chance of double ore", moonstone: "Dig 30% faster in caves" },
    bow: { amber: "+10% damage", ruby: "+20% damage", sapphire: "Shoots 15% faster", amethyst: "25% chance to save ammo", moonstone: "Shots fly 30% faster" }
  };
  var GEM_SLOTS = [["wpn", "Weapon"], ["arm", "Armor"], ["pick", "Pickaxe"], ["bow", "Ranged"]], jewelAt = null;
  function gem(sl, k) { return !!(S.gems && S.gems[sl] === k); }
  function slotOwned(sl) { return sl === "wpn" ? S.wpn >= 1 : sl === "arm" ? S.arm >= 1 : sl === "pick" ? S.tier >= 1 : S.bow >= 1; }
  function slotName(sl) { return sl === "wpn" ? WEAPONS[S.wpn].n : sl === "arm" ? ARMORS[S.arm].n : sl === "pick" ? PICKS[S.tier].n : BOWS[S.bow] ? BOWS[S.bow].n : "Ranged weapon"; }
  function wDmg() { return WEAPONS[S.wpn].dmg * (gem("wpn", "ruby") ? 1.2 : gem("wpn", "amber") ? 1.1 : 1); }
  function wCd() { return WEAPONS[S.wpn].cd * (gem("wpn", "sapphire") ? 0.85 : 1); }
  function gemLeech(hits) { if (hits > 0 && gem("wpn", "amethyst") && hp > 0 && hp < MAXHP) { hp = Math.min(MAXHP, hp + hits); drawHp(); } }
  function armRed() { return Math.min(0.85, ARMORS[S.arm].red + (gem("arm", "sapphire") ? 0.08 : 0)); }
  function gemDig() { return (gem("pick", "ruby") ? 1.2 : gem("pick", "amber") ? 1.1 : 1) * (gem("pick", "moonstone") && cave ? 1.3 : 1); }
  function openJewel(x, y) {
    var el = $("sbxStory"); if (!el) return;
    if (mapOpen) closeMap(); if (packOpen) closePack(); if (panelOpen && storyOpen < 0) closePanel();
    jewelAt = { x: x, y: y }; storyOpen = 202; panelOpen = true; el.hidden = false; stageEl.classList.add("panel"); keys.l = keys.r = keys.j = 0; aim.down = false; mine = null;
    renderJewel(); snd("coin");
  }
  function renderJewel() {
    var h = "", q = inv("quartz");
    $("sbxStoryBox").style.setProperty("--qc", "#e0a0ff");
    h += '<small>Gem sockets</small><h2 class="st-hi">Jeweler\'s Table</h2><p class="st-tip">Each piece of gear has one socket. Socketing costs the gem and <b>1 Quartz Shard</b> (you have ' + q + "). Swapping gives the old gem back.</p>";
    GEM_SLOTS.forEach(function (sl) {
      var k = sl[0], own = slotOwned(k), cur = S.gems[k];
      h += '<div class="st-bhead">' + sl[1] + "<em>" + (own ? esc(slotName(k)) + (cur ? " · " + esc(GEMFX[k][cur]) : " · empty") : "Not made yet") + "</em></div>";
      h += '<div class="st-gems">' + GEMS.map(function (g2) {
        var on = cur === g2, can = own && !on && inv(g2) > 0 && q > 0;
        return '<button type="button" class="' + (on ? "on" : "") + '" data-jewel="' + k + ":" + g2 + '"' + (can ? "" : " disabled") + ' title="' + esc(ITEMS[g2].n + ": " + GEMFX[k][g2]) + '"><img alt="" src="' + icon(g2) + '"><span>' + esc(GEMFX[k][g2]) + "</span><i>" + (on ? "In" : "x" + inv(g2)) + "</i></button>";
      }).join("") + "</div>";
    });
    h += '<div class="st-row"><button type="button" class="btn" data-story-close>Done</button></div>';
    $("sbxStoryBox").innerHTML = h;
  }
  function jewelAct(a) {
    var q = a.split(":"), sl = q[0], g2 = q[1]; if (!GEMFX[sl] || GEMS.indexOf(g2) < 0) return;
    if (!slotOwned(sl) || S.gems[sl] === g2) return;
    if (inv(g2) < 1 || inv("quartz") < 1) { nag("You need the gem and a Quartz Shard."); return; }
    var old = S.gems[sl]; S.inv[g2]--; if (S.inv[g2] <= 0) delete S.inv[g2]; S.inv.quartz--; if (S.inv.quartz <= 0) delete S.inv.quartz;
    if (old) give(old, 1, p.x, p.y - 1, true);
    S.gems[sl] = g2; S.st.socketed++; reslot(); hbDirty = true; ICO = {};
    chips(p.x, p.y - 1.2, ITEMS[g2].gem || "#e0a0ff", 16, 6); snd("open", "Rare"); toast(ITEMS[g2].n + " set in your " + slotName(sl) + ": " + GEMFX[sl][g2] + ".", "#e0a0ff");
    checkGoals(); save(); renderJewel();
  }
  // ---------- QUEST HELPER (the first chapters) ----------
  // Keeps a new player moving: quests that ask you to craft something know their recipe (QRC). When you can make it, the Journal button
  // glows and a tip says so; tapping the quest tracker (or "Show me") opens the Journal right at that recipe. If a Chapter 1-2 quest makes
  // no progress for a while, a tip card repeats what to do. The first dusk gets a warning. Tips can be closed; each shows once per quest.
  var QRC = { pick1: "pick1", bench: "bench", lights: "torch", bed: "bed", door: "door", stash: "chest", fishing: "x_rod1", plant: "x_hoe1", cook: "x_cookpot" };
  var qh = { id: "", v: -1, t: 0, tick: 0, said: {}, stuck: {} }, tipT = 0;
  function recById(id) { var all = craftAll(); for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; }
  function showTip(msg, rc, color) {
    var el = $("sbxTip"); if (!el) return;
    el.style.setProperty("--tc", color || "#f2c14e");
    el.innerHTML = '<p>' + esc(msg) + "</p>" + (rc ? '<button type="button" class="btn" data-tip="show">Show me</button>' : "") + '<button type="button" class="tip-x" data-tip="x" aria-label="Close tip">×</button>';
    el.setAttribute("data-rc", rc || ""); el.hidden = false; tipT = 14;
  }
  function hideTip() { var el = $("sbxTip"); if (el) el.hidden = true; tipT = 0; }
  function openCraftTo(id) {   // the Journal's Craft tab, scrolled to one recipe, which flashes
    var r = recById(id); if (!r) return openPanel("quests");
    var k = stnOf(r);
    if (k) {   // made at a station: open it if one is in reach, otherwise say where
      var sn = stationNearK(k); if (sn) { openStn(k, sn.x, sn.y); flashRec(id, "sbxStn"); return; }
      toast("Make the " + r.n + " at your " + (k === "bench" ? "Bog Workbench" : STATIONS[k].n) + ". Walk up to it and tap it.", "#f2c14e"); return;
    }
    ccat = r.cat2 || ccat; csub = r.sub || ""; cready = false; openPanel("craft"); flashRec(id, "sbxPanel");
  }
  function flashRec(id, root) {
    setTimeout(function () {
      var b = document.querySelector("#" + root + ' [data-sx-craft="' + id + '"]'), card = b && b.closest(".sbx-card"); if (!card) return;
      try { card.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" }); } catch (e) { card.scrollIntoView(); }
      card.classList.add("flash"); setTimeout(function () { card.classList.remove("flash"); }, 2600);
    }, 60);
  }
  function questHelp(dt) {
    if (tipT > 0) { tipT -= dt; if (tipT <= 0) hideTip(); }
    qh.tick -= dt; if (qh.tick > 0) return; qh.tick = 0.5;
    var q = MAIN[S.qi], btn = $("sbxMenuBtn");
    // the first dusk
    if (!cave && !(S.st.htip & 2) && phaseOf(S.time).id === "dusk") { S.st.htip |= 2; showTip(S.st.beds ? "The sun is setting. Sleep in your bed to skip the night, or stay near torchlight: Dusk Bats hunt in the dark." : "The sun is setting! Dusk Bats come out at night. Light torches around camp, and craft a Swamp Bed soon so you can sleep through the dark.", "", "#b58cff"); }
    if (!q) { if (btn) btn.classList.remove("pulse"); return; }
    var v = Math.floor(q.v());
    if (q.id !== qh.id) { if (qh.id && S.qi > 0) $("sbxHint").classList.remove("on"); qh.id = q.id; qh.v = v; qh.t = 0; }   // the opening controls hint goes once the first quest is done
    if (v !== qh.v) { qh.v = v; qh.t = 0; } else if (!panelOpen && !sleepT) qh.t += 0.5;
    var rc = QRC[q.id], r = rc && recById(rc), st = r && recStatus(r), ready = !!(st && st.ready && !st.owned && !stnOf(r));
    if (btn) btn.classList.toggle("pulse", ready && !panelOpen);
    if (ready && !qh.said[q.id] && !panelOpen) { qh.said[q.id] = 1; showTip("You have everything for the " + r.n + "! Open your Journal (" + (coarse ? "the book button" : "E") + ") or tap Show me.", rc, "#4ee6b4"); }
    if (q.ch <= 1 && qh.t >= 70 && !qh.stuck[q.id] && !panelOpen) { qh.stuck[q.id] = 1; showTip("Tip for “" + q.n + "”: " + q.d, rc && r ? rc : "", "#f2c14e"); }
  }
  // ---------- PACING: saplings and bad-luck protection ----------
  // Trees were finite (about 900 log tiles in a world), so leaves now drop Saplings. Plant one on mud, moss or snow with open sky above:
  // it grows into a tree in about 3-5 minutes while you are in the world (S.saps["x,y"] = seconds left). Frostfen saplings grow pines.
  // Creature drops (Fragments, Bat Wings, pelts...) are random; after 3 misses in a row the next kill always drops (S.pity[frag]).
  var SAP_T = [180, 300];
  function pityDrop(frag, drop) {
    if (!frag) return drop; S.pity = S.pity || {};
    if (drop) { S.pity[frag] = 0; return true; }
    S.pity[frag] = (S.pity[frag] || 0) + 1; if (S.pity[frag] >= 4) { S.pity[frag] = 0; return true; } return false;
  }
  function sapRoom(x, y, h) { for (var yy = y - h - 3; yy <= y; yy++) for (var xx = x - 1; xx <= x + 1; xx++) { if (yy < 1) return false; var id = get(xx, yy); if (id !== T.AIR && !(xx === x && yy === y) && !TILES[id].sway) return false; } return true; }
  function growTree(x, y) {   // y = the sapling tile, the trunk starts there
    var pine = world.bio[x] === 2, th = pine ? 6 + Math.floor(Math.random() * 3) : 4 + Math.floor(Math.random() * 3);
    if (!sapRoom(x, y, th)) return false;
    var leaf = function (xx, yy) { if (get(xx, yy) === T.AIR || TILES[get(xx, yy)].sway) setT(xx, yy, T.LEAVES); };
    for (var k = 0; k < th; k++) setT(x, y - k, T.LOG);
    var top = y - th;
    if (pine) { var P = [0, 1, 1, 2, 1, 2, 3, 2, 3]; for (var r = 0; r < Math.min(9, th - 1); r++) for (var dx = -P[r]; dx <= P[r]; dx++) leaf(x + dx, top + r); }
    else { for (var dy = -2; dy <= 2; dy++) for (var dx2 = -3; dx2 <= 3; dx2++) if (dx2 * dx2 / 9 + dy * dy / 4.4 <= 1.05) leaf(x + dx2, top + dy); leaf(x, top - 3); }
    chips(x + 0.5, y - th * 0.5, "#7fd06a", 20, 6); S.st.treesgrown++; return true;
  }
  function tickSaps(sec) {
    Object.keys(S.saps).forEach(function (key) {
      var q = key.split(","), x = +q[0], y = +q[1];
      if (get(x, y) !== T.X_sapling) { delete S.saps[key]; return; }
      S.saps[key] -= sec; if (S.saps[key] > 0) return;
      if (growTree(x, y)) { delete S.saps[key]; if (Math.abs(x - p.x) < 30 && !cave) toast("A sapling grew into a tree!", "#7fd06a"); }
      else S.saps[key] = 30;   // something is in the way: try again later
    });
  }
  // ---------- WOOD STAINS ----------
  // Hold a stain and tap (or drag across) placed wood: Planks, Parquet, doors, ladders, fences, wooden furniture, and wooden back walls.
  // Only the wood-coloured pixels change, so books, cloth and metal keep their colours. Sandpaper takes a stain off again.
  // S.stain[tileIndex] / S.wstain[tileIndex] = stain number (saved with the world). A stain goes away when the block is broken or replaced.
  var STAINS = [
    { k: "stain_walnut", n: "Walnut", p: ["#24140a", "#4e2e16", "#7e5230"] },
    { k: "stain_ebony", n: "Ebony", p: ["#0e0b0b", "#26201e", "#4a403a"] },
    { k: "stain_honey", n: "Honey Oak", p: ["#6e4010", "#c0802c", "#f0c46a"] },
    { k: "stain_mahogany", n: "Mahogany", p: ["#360c08", "#74221a", "#ae4a32"] },
    { k: "stain_white", n: "Whitewash", p: ["#7e786c", "#c4bdae", "#f4f0e6"] },
    { k: "stain_sage", n: "Sage", p: ["#24341e", "#4a663c", "#86a46a"] },
    { k: "stain_blue", n: "Bog Blue", p: ["#16263a", "#365672", "#6a92b0"] },
    { k: "stain_plum", n: "Plum", p: ["#26102c", "#56285e", "#8a5a96"] }
  ];
  var STAIN_OF = {}; STAINS.forEach(function (q, i) { STAIN_OF[q.k] = i; });
  var STAIN_KINDS = { planks: 1, parquet: 1, door: 1, ladder: 1, chair: 1, table: 1, chest: 1, stool: 1, bookshelf: 1, sign: 1, fence: 1, wardrobe: 1, dresser: 1, desk: 1, crate: 1, trough: 1, weaponrack: 1, barrel: 1 };
  var STAINABLE = {}, WSTAINABLE = {};
  Object.keys(TILES).forEach(function (id) { var t = TILES[id]; if (!t) return; if (STAIN_KINDS[t.kind]) STAINABLE[id] = 1; if (t.kind === "wall" && /plank|timber|wood/i.test(t.n || "")) WSTAINABLE[id] = 1; });
  var STC = {}, stainLast = "";
  function isStainTool(k) { return STAIN_OF[k] !== undefined || k === "sandpaper"; }
  function hexRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function stainCanvas(id, v, si) {   // the atlas cell with its wood-coloured pixels remapped onto the stain's dark / mid / light colours
    var key = id + ":" + v + ":" + si; if (STC[key]) return STC[key];
    var c = document.createElement("canvas"); c.width = c.height = 16; var g = c.getContext("2d");
    g.drawImage(ATLAS, v * 16, id * 16, 16, 16, 0, 0, 16, 16);
    var im = g.getImageData(0, 0, 16, 16), d = im.data, P = STAINS[si].p.map(hexRgb), lo = 1, hi = 0, wood = [], i;
    for (i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 20) { wood.push(0); continue; }
      var r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, sat = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1) + 1e-6), h = 0;
      if (mx !== mn) { h = mx === r ? ((gg - b) / (mx - mn)) % 6 : mx === gg ? (b - r) / (mx - mn) + 2 : (r - gg) / (mx - mn) + 4; h *= 60; if (h < 0) h += 360; }
      var isWood = (h >= 4 && h <= 62 && sat >= 0.12 && l <= 0.93) || (l < 0.18 && r >= b);   // browns and tans (and the darkest wood lines)
      wood.push(isWood ? 1 : 0); if (isWood) { lo = Math.min(lo, l); hi = Math.max(hi, l); }
    }
    var span = Math.max(0.12, hi - lo);
    for (i = 0; i < d.length; i += 4) {
      if (!wood[i / 4]) continue;
      var r2 = d[i] / 255, g2 = d[i + 1] / 255, b2 = d[i + 2] / 255, l2 = (Math.max(r2, g2, b2) + Math.min(r2, g2, b2)) / 2, t = Math.min(1, Math.max(0, (l2 - lo) / span)), A, B, k;
      if (t < 0.5) { A = P[0]; B = P[1]; k = t * 2; } else { A = P[1]; B = P[2]; k = (t - 0.5) * 2; }
      d[i] = A[0] + (B[0] - A[0]) * k; d[i + 1] = A[1] + (B[1] - A[1]) * k; d[i + 2] = A[2] + (B[2] - A[2]) * k;
    }
    g.putImageData(im, 0, 0); return (STC[key] = c);
  }
  function drawStain(g, i, j, sx3, sy) {   // called after the normal cell is drawn: paint the stained version on top
    var ix = j * W + i, si = S.stain[ix], id = tiles[ix], v = ((Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0) & 3;
    if (si !== undefined && STAINABLE[id]) {
      var td = TILES[id], vv = SMOP[id] || td.solid ? v : 0; g.imageSmoothingEnabled = false;
      if (MATF[id]) { matTile(g, id, i, j, sx3, sy, si); return; }
      if (td.kind === "door" || td.kind === "ladder" || td.kind === "fence") { matWood(g, td, i, j, sx3, sy, si); return; }   // ADVENTURE LOOK blocks: the same shapes in the stain's colours (they carry their own outline)
      g.drawImage(stainCanvas(id, vv, si), 0, 0, 16, 16, sx3, sy, ts, ts);
      if (td.solid && td.kind !== "door") {   // keep the block's edge shading
        if (!TILES[get(i, j - 1)].solid) g.drawImage(shadeC("t34"), sx3, sy);
        g.fillStyle = "rgba(0,0,0,.3)"; if (!TILES[get(i, j + 1)].solid) g.fillRect(sx3, sy + ts - CELL.edge, ts, CELL.edge); if (!TILES[get(i - 1, j)].solid) g.fillRect(sx3, sy, CELL.edge, ts); if (!TILES[get(i + 1, j)].solid) g.fillRect(sx3 + ts - CELL.edge, sy, CELL.edge, ts);
      }
    }
  }
  function drawWallStain(g, wl, i, j, sx, sy) {
    var si = S.wstain[j * W + i]; if (si === undefined || !WSTAINABLE[wl]) return false;
    if (MATF[wl]) { matWall(g, wl, i, j, sx, sy, si); return true; }
    var v = ((Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0) & 3; g.imageSmoothingEnabled = false;
    g.drawImage(stainCanvas(wl, v, si), 0, 0, 16, 16, sx, sy, ts, ts); return true;
  }
  function useStain(dt) {
    mine = null; aim.door = false; aim.stn = ""; aim.chest = false;   // holding a stain: taps paint instead of opening things
    if (!aim.down) { stainLast = ""; return; }
    if (cave) { nag("Wood stain is for your buildings on the surface."); return; }
    if (MP.on && MP.role === "guest") { nag("Wood stain works in your own world for now."); return; }
    var tx = aim.tx, ty = aim.ty; if (tx < 0) return;
    var key = tx + "," + ty; if (key === stainLast) return; stainLast = key;
    var ddx = tx + 0.5 - p.x, ddy = ty + 0.5 - (p.y - PH / 2); if (ddx * ddx + ddy * ddy > REACH * REACH) { nag("That is too far away."); return; }
    var ix = ty * W + tx, id = tiles[ix], wl = walls[ix], sand = sel === "sandpaper", si = STAIN_OF[sel];
    var front = !!STAINABLE[id], back = !front && !TILES[id].solid && wl && WSTAINABLE[wl];
    if (!front && !back) { nag(sand ? "Sandpaper takes the stain off stained wood." : "Stain only works on wood: Planks, doors, ladders, fences, wooden furniture and wooden walls."); return; }
    var map = front ? S.stain : S.wstain;
    // doors are two tiles: stain (or sand) both halves together
    var cells = [ix]; if (front && TILES[id].kind === "door") { [ix - W, ix + W].forEach(function (q) { if (q >= 0 && q < W * H && TILES[tiles[q]] && TILES[tiles[q]].kind === "door") cells.push(q); }); }
    if (sand) {
      if (map[ix] === undefined) return;
      cells.forEach(function (q) { delete map[q]; });
    } else {
      if (map[ix] === si) return;
      cells.forEach(function (q) { map[q] = si; });
      S.st.stained += cells.length; S.mk["stain_" + si] = 1;
    }
    S.inv[sel]--; if (S.inv[sel] <= 0) { delete S.inv[sel]; sel = "pick"; reslot(); } hbDirty = true;
    chips(tx + 0.5, ty + 0.5, sand ? "#e8dcc0" : STAINS[si].p[1], 6, 3); thud(sand ? 520 : 340, 0.03);
    checkGoals(); save();
  }
  // ---------- BOG WITCH ----------
  // A Murkwater night creature (and, later, the owner of the Witch Huts). She keeps 5-8 tiles away, winds up and lobs a hex bottle in an arc
  // that bursts where it lands (a direct hit also slows you for a moment), and blinks a few tiles away in a puff if you get within reach.
  var WITCH = { aggro: 13, near: 5, far: 8, wind: 0.55, cd: [2.1, 3.2], blinkCd: 4, speed: 2.2 }, hexSlow = 0;
  function updateWitch(e, dt) {
    var dx = p.x - e.x, ad = Math.abs(dx), dy = p.y - e.y, near = ad < WITCH.aggro && Math.abs(dy) < 6 && hp > 0, vx = 0;
    e.bcd = (e.bcd || 0) - dt; e.cd -= 0;   // (e.cd is ticked by updateEnemies)
    if (e.hurt > 0) { vx = 0; }
    else if (e.st === "wind" && !(near && ad < 2.4 && e.bcd <= 0)) {   // (rushing her mid-throw makes her blink instead)
      e.t -= dt; e.dir = dx >= 0 ? 1 : -1;
      if (e.t <= 0) {   // throw: aim an arc that lands on you
        var T2 = clamp(ad / 7, 0.55, 1.15), g2 = 16, sx = e.x + e.dir * 0.4, sy = e.y - e.h + 0.2, ty = p.y - PH * 0.5;
        shoot(sx, sy, (p.x - sx) / T2, (ty - sy - 0.5 * g2 * T2 * T2) / T2, { g: g2, r: 0.3, dmg: e.dmg, k: "hex", life: 3, why: "witch" });
        thud(700, 0.04); e.st = "idle"; e.cd = WITCH.cd[0] + Math.random() * (WITCH.cd[1] - WITCH.cd[0]);
      }
    } else if (near) {
      e.dir = dx >= 0 ? 1 : -1;
      if (ad < 2.4 && e.bcd <= 0) {   // too close: blink away
        e.st = "idle";
        var dir2 = dx >= 0 ? -1 : 1, nx = e.x + dir2 * (4.5 + Math.random() * 2), ny = -1;
        for (var tq = 0; tq < 6 && ny < 0; tq++) { var tx = clamp(Math.floor(nx) + (tq % 2 ? 1 : -1) * Math.ceil(tq / 2), 2, W - 3), cy = col[tx]; if (cy > 0 && !blocks(tx, cy - 1) && !blocks(tx, cy - 2) && TILES[get(tx, cy - 1)].kind !== "water") { nx = tx + 0.5; ny = cy; } }
        if (ny > 0) { chips(e.x, e.y - 0.8, "#b06aff", 14, 6); e.x = nx; e.y = ny; e.vy = 0; chips(e.x, e.y - 0.8, "#b06aff", 14, 6); thud(1200, 0.03); e.bcd = WITCH.blinkCd; }
        else e.bcd = 1;
      } else if (e.cd <= 0 && ad < 11) { e.st = "wind"; e.t = WITCH.wind; }
      else if (ad < WITCH.near) vx = -e.dir * WITCH.speed;   // back off
      else if (ad > WITCH.far) vx = e.dir * WITCH.speed * 0.8;   // creep closer
    } else { e.t -= dt; if (e.t <= 0) { e.t = 1.5 + Math.random() * 2; e.wv = Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? -1 : 1) * 0.9; } vx = e.wv || 0; if (vx) e.dir = vx > 0 ? 1 : -1; }
    moveEnemy(e, dt, vx);
  }
  function drawWitch(g, e, d, flash, h, pd) {
    var t = e.tt, f = e.dir, wind = e.st === "wind", bob = Math.sin(t * 2.6) * 0.8;
    g.save(); g.translate(!e.def && h > 0 ? Math.sin(t * 90) * 1.6 * h : 0, 0); g.scale(f * (1 + 0.4 * pd), 1 - 0.7 * pd);
    if (!e.def) eGlow(g, 0, -26, wind ? 30 : 22, wind ? "#d08aff" : d.glow, wind ? 0.5 : 0.28);
    var robe = flash ? "#ffffff" : "#4a2a62", robe2 = flash ? "#f0e0ff" : "#2e1a40", skin = flash ? "#fff" : "#7fbf5a";
    // robe (a wide bell that sways), sleeves, belt
    g.fillStyle = robe; g.strokeStyle = "#140a1c"; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-11 + Math.sin(t * 3) * 1.2, 0); g.lineTo(11 + Math.sin(t * 3 + 1) * 1.2, 0); g.lineTo(5, -28 + bob); g.lineTo(-5, -28 + bob); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = robe2; g.fillRect(-10, -3, 20, 3); g.fillStyle = flash ? "#fff" : "#c8901e"; g.fillRect(-5, -17 + bob, 10, 2.2);
    // the throwing arm (raised with a glowing bottle while winding up)
    g.save(); g.translate(4, -24 + bob); g.rotate(wind ? -2.3 + Math.sin(t * 20) * 0.1 : 0.5); g.fillStyle = robe; g.fillRect(-2, 0, 4, 11); g.fillStyle = skin; g.fillRect(-1.5, 10, 3, 3);
    if (wind) { g.fillStyle = "#cfeaf2"; g.fillRect(-2.5, 12, 5, 6); g.fillStyle = "#b06aff"; g.fillRect(-2.5, 14.5, 5, 3.5); eGlow(g, 0, 15, 10, "#d08aff", 0.6); }
    g.restore();
    // head: green face, long nose, glowing eyes, wild grey hair
    g.fillStyle = flash ? "#fff" : "#9a9aa4"; g.beginPath(); g.ellipse(-2, -31 + bob, 8, 5, 0, 0, 7); g.fill();
    g.fillStyle = skin; g.strokeStyle = "#1a2a10"; g.beginPath(); g.ellipse(0, -33 + bob, 6, 6.5, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(5, -34 + bob); g.lineTo(10, -31 + bob); g.lineTo(5, -31 + bob); g.closePath(); g.fill();
    g.fillStyle = flash ? "#fff" : "#ffd23f"; g.fillRect(1, -36 + bob, 2.4, 2); g.fillRect(-3.4, -36 + bob, 2.4, 2);
    // the hat: a wide brim and a crooked point
    g.fillStyle = flash ? "#fff" : "#1e1228"; g.strokeStyle = "#08040c";
    g.beginPath(); g.ellipse(0, -38 + bob, 11, 2.6, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-6, -38.5 + bob); g.lineTo(6, -38.5 + bob); g.lineTo(2, -48 + bob); g.lineTo(-4, -55 + bob + Math.sin(t * 2) * 1); g.lineTo(-2, -47 + bob); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = flash ? "#fff" : "#b06aff"; g.fillRect(-5.5, -41 + bob, 11, 2);
    g.restore();
  }
  // ---------- WITCH HUTS ----------
  // Up to 3 Witch Huts stand in the wilds of Murkwater (world gen, kind "witchhut"). A Bog Witch lives at each one: she is out by her hut
  // whenever you come near (day or night), and if you beat her she is back the next day (S.whut[hut id] = the day she was beaten).
  // Inside, a Witch's Chest holds potions, bottles and odd ingredients; it refills 3 days after you raid it (S.wloot[hut id] = the day).
  var WCHEST = { x: 10, y: 8 }, witchT = 0;
  function witchHomes(dt) {
    witchT -= dt; if (witchT > 0 || cave || !world.structs || S.wpn < 1) return; witchT = 2;
    world.structs.forEach(function (h) {
      if (h.kind !== "witchhut" || Math.abs(h.dx - p.x) > 40 || Math.abs(h.gy - p.y) > 30) return;
      if (S.whut[h.id] !== undefined && S.whut[h.id] >= (S.days | 0)) return;   // beaten today
      if (enemies.some(function (e) { return e.home === h.id && !e.def; })) return;
      var x = h.outX + (h.side || 1) * 1.5, y = -1, tx = Math.floor(x);
      for (var up = 0; up <= 3 && y < 0; up++) { var cy = col[tx] - up; if (cy > 0 && !eBoxHit(tx + 0.5, cy, ENEMY.witch.w, ENEMY.witch.h)) y = cy; }
      if (y < 0) return;
      var m = newEnemy("witch", tx + 0.5, y); m.home = h.id; enemies.push(m);
      if (!S.vis.k_witchhut_seen) { S.vis.k_witchhut_seen = 1; toast("A Witch Hut! Its owner does not like visitors. Beat her, then see what she keeps inside.", "#b06aff"); }
    });
  }
  function witchChestReady(id) { return S.wloot[id] === undefined || (S.days | 0) >= S.wloot[id] + 3; }
  function witchLoot(x, y) {
    var id = cave.bld.id, pk = Object.keys(POTIONS), L = [["bottle", 2 + Math.floor(Math.random() * 3)], [pk[Math.floor(Math.random() * pk.length)], 1], [pk[Math.floor(Math.random() * pk.length)], 1], ["hexdust", 1 + Math.floor(Math.random() * 2)]];
    var odd = [["glowshroom", 3], ["redcap", 3], ["firefly", 2], ["earthworm", 3], ["amethyst", 1], ["marshlily", 2], ["frostbell", 1]];
    for (var k = 0; k < 2; k++) L.push(odd[Math.floor(Math.random() * odd.length)]);
    if (Math.random() < 0.25) L.push(["tonic_leap", 1]);
    L = L.filter(function (q) { return ITEMS[q[0]]; });
    L.forEach(function (q) { give(q[0], q[1], x, y, true); });
    S.wloot[id] = S.days | 0; S.st.wchests++; chips(x + 0.5, y + 0.5, "#b06aff", 22, 8); snd("open", "Rare");
    toast("The Witch's Chest! It will fill up again in a few days.", "#b06aff"); treasureFound(L.length); checkGoals(); save();
  }
  // ---------- EMBERFLY WINGS and the CINDER AERIE ----------
  // The Cinder Aerie floats high over Ember Bog (world.aerie). Its Thermal Vent's hot updraft lifts anyone standing over it up to the deck,
  // and the chest on the ziggurat's crown holds the Emberfly Wings: a cloak of glowing ember-dragonfly wings (S.wings = 1).
  // With the wings, hold Jump while falling to glide: you fall slowly and travel faster, and an updraft carries a glider higher still.
  // Gliding also takes the sting out of a landing (no fall damage). The wings do nothing in caves or under water.
  var GLIDE = { fall: 2.1, speed: 1.35 }, gliding = false, glideDist = 0;
  function aerieKey() { var A = world.aerie; return A ? A.cx + "," + A.cy : ""; }
  function inUpdraft(x, y) {
    var A = world.aerie; if (!A || cave) return false;
    return Math.abs(x - (A.vx + 0.5)) < 1.6 && y <= A.vy + 1.2 && y > A.y - 4;
  }
  function aerieLoot(key) { return [["emberwings", 1], ["ruby", 1], ["firearrow", 12], ["cinder", 10], ["tonic_fire", 1]].filter(function (q) { return ITEMS[q[0]]; }); }
  function claimWings() {   // the wings go on as soon as they reach your bag
    if (!(S.inv.emberwings > 0)) return;
    delete S.inv.emberwings; if (S.wings) return;
    S.wings = 1; S.st.wings = 1; chips(p.x, p.y - 1, "#ffb04a", 30, 9); snd("open", "Epic");
    popup("New gear", "Emberfly Wings", "#ffb04a", "✦"); toast("Emberfly Wings! Hold Jump while falling to glide. Ride updrafts to soar.", "#ffb04a");
    checkTrail(); checkGoals(); save();
  }
  function drawWings(g, sx, sy, now) {   // spread behind you while gliding; folded otherwise
    if (!S.wings || cave) return;
    var u = ts / 16, open = gliding ? 1 : 0, fl = Math.sin(now / 90) * (gliding ? 0.08 : 0.02);
    g.save(); g.translate(sx, sy - ts * 1.05); g.scale(p.face, 1);
    for (var side2 = -1; side2 <= 1; side2 += 2) {
      g.save(); g.scale(side2, 1); g.rotate((open ? -0.15 : 0.9) + fl * side2);
      var len = (open ? 15 : 7) * u, wid = (open ? 4.2 : 2.4) * u;
      var gr = g.createLinearGradient(0, 0, len, 0); gr.addColorStop(0, "rgba(255,200,90,.9)"); gr.addColorStop(1, "rgba(255,110,40,.35)");
      g.fillStyle = gr; g.strokeStyle = "rgba(255,240,190,.8)"; g.lineWidth = Math.max(1, u * 0.6);
      g.beginPath(); g.ellipse(len * 0.55, -wid * 0.5, len * 0.55, wid, -0.12, 0, 7); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(len * 0.48, wid * 0.9, len * 0.45, wid * 0.8, 0.18, 0, 7); g.fill(); g.stroke();
      g.restore();
    }
    g.restore();
    if (gliding && !reduce && Math.random() < 0.4) parts.push({ x: p.x - p.face * 0.6 + (Math.random() - 0.5) * 1.6, y: p.y - 1.1, vx: -p.face * 1.5, vy: 0.6, life: 0.5, max: 0.5, c: Math.random() < 0.5 ? "#ffb04a" : "#ffe08a", s: 2 });
  }
  // ---------- BACKGROUND TEXTURES ----------
  // Underground back walls are 16x16 pixel-art textures made once per biome x depth band x variant (36 tiny canvases) and stamped
  // per cell, so they cost about the same as the old flat fill: rock strata, pebbles and cracks, roots and moss near the surface in
  // Murkwater, glowing ember veins in Ember Bog, ice flecks in Frostfen. Deeper bands are darker and cooler.
  var BWT = {};
  function bwTex(b, band, v) {
    var key = b * 1000 + band * 100 + v, c = BWT[key]; if (c) return c;
    c = BWT[key] = document.createElement("canvas"); c.width = c.height = 16; var q = c.getContext("2d"), im = q.createImageData(16, 16), d = im.data;
    var base = BACKWALL[b], lift = band === 0 ? 7 : band === 1 ? 0 : -9, cool = band === 2 ? 4 : 0, hh = function (x, y, k) { return SW.hash(x + v * 17, y + band * 31, 977 + k + b * 13); };
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      var n = (hh(x >> 1, y >> 1, 1) - 0.5) * 9 + (hh(x, y, 2) - 0.5) * 5;
      var strata = (y === 4 + ((hh(x >> 2, 0, 3) * 2) | 0) || y === 11 + ((hh(x >> 2, 1, 4) * 2) | 0)) ? -7 : 0;
      var i4 = (y * 16 + x) * 4;
      d[i4] = clamp(base[0] + lift + n + strata - cool, 0, 255); d[i4 + 1] = clamp(base[1] + lift + n + strata, 0, 255); d[i4 + 2] = clamp(base[2] + lift + n + strata + cool, 0, 255); d[i4 + 3] = 255;
    }
    q.putImageData(im, 0, 0);
    var R = function (x, y, w, h, col, a) { q.globalAlpha = a == null ? 1 : a; q.fillStyle = col; q.fillRect(x, y, w, h); q.globalAlpha = 1; };
    var lt = "rgb(" + clamp(base[0] + lift + 16, 0, 255) + "," + clamp(base[1] + lift + 16, 0, 255) + "," + clamp(base[2] + lift + 16, 0, 255) + ")";
    for (var k = 0; k < 1 + (v & 1) + (v > 5 ? 1 : 0); k++) {   // pebbles: a lit top and a dark underside
      var px = 1 + Math.floor(hh(k, 5, 6) * 13), py = 1 + Math.floor(hh(k, 6, 7) * 13);
      R(px, py, 2, 2, lt, 0.55); R(px, py + 2, 2, 1, "#000", 0.25);
    }
    if (v % 3 !== 2) {   // a hairline crack
      var cx2 = Math.floor(hh(9, 9, 8) * 12) + 2, cy2 = Math.floor(hh(9, 8, 9) * 10) + 2;
      for (var s2 = 0; s2 < 5; s2++) { R(cx2, cy2, 1, 1, "#000", 0.3); cx2 += hh(s2, 3, 10) < 0.5 ? 1 : 0; cy2 += 1; if (cx2 > 15 || cy2 > 15) break; }
    }
    if (b === 0 && band === 0 && v < 2) { R(2 + v * 6, 0, 1, 4, "#5a3a20", 0.55); R(3 + v * 6, 3, 1, 3, "#5a3a20", 0.45); R(9 - v * 4, 13, 2, 1, "#3f6a3a", 0.5); }   // roots and a little moss
    if (b === 1 && band === 2 && v === 0) { var ex = 3 + Math.floor(hh(1, 1, 11) * 8); for (var e2 = 0; e2 < 6; e2++) R(ex + (e2 >> 1), 6 + e2, 1, 1, e2 & 1 ? "#ff8a3d" : "#ff5a1f", 0.55); }   // an ember vein, deep down
    else if (b === 1 && band === 1 && v === 0) R(5 + Math.floor(hh(2, 2, 12) * 6), 9, 1, 1, "#ff7a2f", 0.35);   // a faint ember fleck
    if (b === 2 && (v === 1 || v === 5 || (band === 2 && v < 4))) { R(4 + v * 3, 3, 1, 1, "#d8f0ff", 0.55); R(11 - v, 9, 1, 1, "#bfe6ff", 0.5); R(7, 13, 1, 1, "#ffffff", 0.35); }   // ice flecks
    return c;
  }
  function drawBackRock(g, i, j, sx3, sy) {
    var b = world.bio[i], depth = j - world.top[i], band = depth < 12 ? 0 : depth < 40 ? 1 : 2, v = ((Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 3) & 7;
    g.drawImage(bwTex(b, band, v), 0, 0, 16, 16, sx3, sy, ts, ts);
    var e = ts * 0.17;   // soft shadows where open space meets solid rock, so tunnels read as carved
    g.fillStyle = "rgba(0,0,0,.26)";
    if (TILES[get(i, j - 1)].solid) g.fillRect(sx3, sy, ts, e);
    if (TILES[get(i - 1, j)].solid) g.fillRect(sx3, sy, e, ts);
    if (TILES[get(i + 1, j)].solid) g.fillRect(sx3 + ts - e, sy, e, ts);
    if (TILES[get(i, j + 1)].solid) { g.fillStyle = "rgba(0,0,0,.14)"; g.fillRect(sx3, sy + ts - e * 0.6, ts, e * 0.6); }
  }
  // Far scenery details that each biome gets on top of the hills: Frostfen pines, Ember Bog dead trees and volcanoes, daytime sunbeams.
  function drawPines(g, cc, par, base, a, now) {
    var col2 = rgb(mixC(cc, [10, 22, 34], 0.4)), k0 = Math.floor((cam.x * par - vw / ts) / 6) - 1, k1 = Math.ceil((cam.x * par + vw / ts) / 6) + 1;
    g.globalAlpha = a; g.fillStyle = col2;
    for (var k = k0; k <= k1; k++) {
      if (SW.hash(k, 21, 9) < 0.25) continue;
      var tx = k * 6 + SW.hash(k, 22, 9) * 4, th = 6 + SW.hash(k, 23, 9) * 6, sx = vw / 2 + (tx - cam.x * par) * ts, by = oy + (base + 2.5) * ts;
      if (sx < -ts * 4 || sx > vw + ts * 4) continue;
      for (var tier = 0; tier < 3; tier++) { var ty = by - th * ts * (0.35 + tier * 0.27), hw = ts * (2.2 - tier * 0.55); g.beginPath(); g.moveTo(sx - hw, ty + ts * 1.6); g.lineTo(sx, ty - ts * 1.2); g.lineTo(sx + hw, ty + ts * 1.6); g.closePath(); g.fill(); }
      g.fillRect(sx - ts * 0.18, by - th * ts * 0.35 + ts * 1.6, ts * 0.36, th * ts * 0.35);
    }
    g.globalAlpha = 1;
  }
  function drawSnags(g, cc, par, base, a) {
    var k0 = Math.floor((cam.x * par - vw / ts) / 11) - 1, k1 = Math.ceil((cam.x * par + vw / ts) / 11) + 1;
    g.globalAlpha = a; g.strokeStyle = rgb(mixC(cc, [20, 8, 6], 0.55)); g.lineCap = "round";
    for (var k = k0; k <= k1; k++) {
      if (SW.hash(k, 31, 9) < 0.4) continue;
      var tx = k * 11 + SW.hash(k, 32, 9) * 6, th = 5 + SW.hash(k, 33, 9) * 5, sx = vw / 2 + (tx - cam.x * par) * ts, by = oy + (base + 2.5) * ts, s1 = SW.hash(k, 34, 9) < 0.5 ? -1 : 1;
      if (sx < -ts * 4 || sx > vw + ts * 4) continue;
      g.lineWidth = Math.max(1.5, ts * 0.28); g.beginPath(); g.moveTo(sx, by); g.lineTo(sx + s1 * ts * 0.3, by - th * ts); g.stroke();
      g.lineWidth = Math.max(1, ts * 0.14); g.beginPath(); g.moveTo(sx + s1 * ts * 0.15, by - th * ts * 0.55); g.lineTo(sx + s1 * ts * 1.6, by - th * ts * 0.8); g.moveTo(sx + s1 * ts * 0.25, by - th * ts * 0.8); g.lineTo(sx - s1 * ts * 1.1, by - th * ts * 1.05); g.stroke();
    }
    g.globalAlpha = 1;
  }
  function drawVolcanoes(g, HZ, sk, day, a, now) {
    var par = 0.05, k0 = Math.floor((cam.x * par - vw / ts) / 60) - 1, k1 = Math.ceil((cam.x * par + vw / ts) / 60) + 1;
    for (var k = k0; k <= k1; k++) {
      var tx = k * 60 + SW.hash(k, 41, 9) * 24, hgt = 8 + SW.hash(k, 42, 9) * 5, wid = hgt * 1.5, sx = vw / 2 + (tx - cam.x * par) * ts, by = oy + (HZ - 4) * ts, ty = by - hgt * ts, cw = ts * 1.1;
      if (sx < -wid * ts * 1.2 || sx > vw + wid * ts * 1.2) continue;
      g.globalAlpha = a; g.fillStyle = rgb(mixC(mixC([70, 36, 34], sk[1], 0.6), [10, 6, 10], 0.2 + 0.5 * (1 - day)));
      g.beginPath(); g.moveTo(sx - wid * ts, by); g.lineTo(sx - cw, ty); g.lineTo(sx + cw, ty); g.lineTo(sx + wid * ts, by); g.closePath(); g.fill();
      g.strokeStyle = "rgba(255,110,40," + (0.25 + 0.45 * (1 - day)).toFixed(2) + ")"; g.lineWidth = Math.max(1, ts * 0.12);   // lava runs down the flank
      g.beginPath(); g.moveTo(sx - cw * 0.3, ty); g.lineTo(sx - wid * ts * 0.25, ty + hgt * ts * 0.45); g.lineTo(sx - wid * ts * 0.32, ty + hgt * ts * 0.7); g.moveTo(sx + cw * 0.4, ty); g.lineTo(sx + wid * ts * 0.18, ty + hgt * ts * 0.35); g.stroke();
      g.globalCompositeOperation = "lighter"; g.globalAlpha = a * (0.35 + 0.4 * (1 - day)); var gs = glowSpr("255,110,40"); g.drawImage(gs, sx - cw * 3, ty - cw * 2, cw * 6, cw * 4); g.globalCompositeOperation = "source-over";
      if (!reduce) for (var pf = 0; pf < 5; pf++) {   // smoke puffs rising off the crater and drifting away
        var lifeT = ((now / 1000 * 0.12 + pf / 5 + SW.hash(k, 43, 9)) % 1), r = ts * (0.8 + lifeT * 2.4);
        g.globalAlpha = a * 0.28 * (1 - lifeT); g.fillStyle = day > 0.5 ? "#8a7f7a" : "#3a3236";
        g.beginPath(); g.arc(sx + lifeT * ts * 6 + Math.sin(lifeT * 6 + pf) * ts, ty - lifeT * ts * 8, r, 0, 6.2832); g.fill();
      }
      g.globalAlpha = 1;
    }
  }
  function drawSunbeams(g, day, above, bw, now) {
    var a = (day - 0.55) / 0.45 * above * (1 - bw[1] * 0.7); if (a <= 0.02) return;
    g.globalCompositeOperation = "lighter";
    for (var k = 0; k < 4; k++) {
      var x0 = ((k * 0.27 + 0.08 + Math.sin(now / 9000 + k) * 0.03) % 1) * vw - cam.x * ts * 0.02 % vw, w0 = vw * (0.025 + (k % 2) * 0.018), sl = vh * 0.32;
      var gr = g.createLinearGradient(0, 0, 0, vh * 0.8); gr.addColorStop(0, "rgba(255,244,205," + (0.032 * a).toFixed(3) + ")"); gr.addColorStop(0.55, "rgba(255,244,205," + (0.014 * a).toFixed(3) + ")"); gr.addColorStop(1, "rgba(255,244,205,0)");
      g.fillStyle = gr; g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + w0, 0); g.lineTo(x0 + w0 + sl, vh * 0.85); g.lineTo(x0 + sl - w0 * 0.4, vh * 0.85); g.closePath(); g.fill();
    }
    g.globalCompositeOperation = "source-over";
  }
  // ---------- CAVE SPIDER ----------
  // Under every land. In the side-view tunnels under the surface it hangs from the ceiling on a silk thread (st "hang"), drops when you
  // walk underneath, then skitters after you, crouches and pounces. A pounce that lands webs you (slowed for a moment). In the top-down
  // Cave Hole floors it is a ground hunter that crouches and pounces too (see updateCaveMobs).
  var SPIDER = { speed: 4.2, pounceX: 7.5, pounceY: -7, crouch: 0.32, cd: 1.4 };
  function webbed(t) { hexSlow = Math.max(hexSlow, t); if (!(S.st.seen & 64)) { S.st.seen |= 64; toast("Webbed! You are slowed for a moment.", "#d8d0e8"); } }
  function updateSpider(e, dt) {
    var dx = p.x - e.x, ad = Math.abs(dx), dy = p.y - e.y, vx = 0, alive = hp > 0;
    if (e.st === "hang") {   // dangling on its thread, bobbing; drops when you pass beneath
      e.vy = 0; e.y = e.ay + 1.1 + Math.sin(e.tt * 1.6) * 0.25; e.dir = dx >= 0 ? 1 : -1;
      if (e.hurt > 0 || (alive && ad < 2.4 && dy > 0 && dy < 8)) { e.st = "drop"; thud(500, 0.03); }
      return;
    }
    if (e.hurt > 0) { vx = 0; }
    else if (e.st === "crouch") { e.t -= dt; e.dir = dx >= 0 ? 1 : -1; if (e.t <= 0 && e.on) { e.st = "pounce"; e.vy = SPIDER.pounceY; e.on = false; e.hvx = e.dir * SPIDER.pounceX; thud(700, 0.04); } }
    else if (e.st === "pounce") { vx = e.hvx; if (e.on && e.vy >= 0) { e.st = "skitter"; e.cd = SPIDER.cd; } }
    else if (e.st === "drop") { if (e.on) { e.st = "skitter"; e.cd = 0.5; } }
    else {
      var near = alive && ad < 9 && Math.abs(dy) < 4;
      if (near) { e.st = "skitter"; e.dir = dx >= 0 ? 1 : -1; vx = e.dir * SPIDER.speed * (ad < 1 ? 0.3 : 1); if (ad < 3.2 && e.cd <= 0 && e.on) { e.st = "crouch"; e.t = SPIDER.crouch; vx = 0; } }
      else { e.st = "patrol"; e.t -= dt; if (e.t <= 0) { e.t = 1.5 + Math.random() * 2.5; if (Math.random() < 0.4) e.dir = -e.dir; } vx = e.dir * 1.4; if (e.blocked) e.dir = -e.dir; }
    }
    moveEnemy(e, dt, vx);
    if (alive && e.hurt <= 0 && hurtGrace <= 0 && overlapP(e)) {
      if (e.st === "pounce") { hurt(e.dmg, "spider"); webbed(1.8); shoved(e); e.st = "skitter"; e.cd = SPIDER.cd; }
      else if (e.cd <= 0) { hurt(Math.ceil(e.dmg * 0.5), "spider"); shoved(e); e.cd = 1; }
    }
  }
  function spiderCeiling(cx, py) {   // a ceiling spot near your depth in this column: open air under a solid block, with room to hang
    for (var yy = Math.floor(py) - 9; yy <= Math.floor(py) + 6; yy++) if (blocks(cx, yy - 1) && !blocks(cx, yy) && !blocks(cx, yy + 1) && !blocks(cx, yy + 2) && yy > col[cx] + 3 && TILES[get(cx, yy)].kind !== "water") return yy;
    return -1;
  }
  function drawSpider(g, e, d, flash, h, pd) {
    var t = e.tt, f = e.dir, crouch = e.st === "crouch" || e.st === "wind", mv = /skitter|pounce|patrol|stalk|lunge|retreat/.test(e.st);
    var PAL = [["#3a3242", "#6fd06a"], ["#40261e", "#ff7a2f"], ["#38485a", "#9fe8ff"]][e.b] || ["#2a2430", "#6fd06a"], body = flash ? "#ffffff" : PAL[0], mark = flash ? "#ffe0e6" : PAL[1];
    if (e.st === "hang" && !cave && e.ay !== undefined) {   // the silk thread up to the ceiling
      g.strokeStyle = "rgba(240,240,250,.85)"; g.lineWidth = 1.1; g.beginPath(); g.moveTo(0, -10); g.lineTo(0, -10 - (e.y - e.ay) * 30); g.stroke();
    }
    g.save(); g.translate(!e.def && h > 0 ? Math.sin(t * 90) * 1.6 * h : 0, crouch ? 2 : 0); g.scale(f * 1.3 * (1 + 0.4 * pd), 1.3 * (1 - 0.7 * pd) * (crouch ? 0.85 : 1));
    if (!e.def) eGlow(g, 2, -8, crouch ? 26 : 20, d.glow, crouch ? 0.5 : 0.3);
    g.strokeStyle = flash ? "#ffffff" : "#120c14"; g.lineWidth = 1.8; g.lineCap = "round";
    for (var i = 0; i < 4; i++) {   // eight legs: two rows of four, scuttling out of phase
      var ph = mv ? Math.sin(t * 22 + i * 1.6) * 3 : Math.sin(t * 2 + i) * 0.6, lx = -6 + i * 4.2;
      [-1, 1].forEach(function (sd) {
        var kx = lx + sd * (4 + i * 0.6) + (sd > 0 ? ph : -ph) * 0.5, ky = -12 - (i === 1 || i === 2 ? 2 : 0);
        g.beginPath(); g.moveTo(lx, -6); g.lineTo(kx, ky); g.lineTo(kx + sd * 3 + ph * 0.3, 0); g.stroke();
      });
    }
    var bg = g.createLinearGradient(0, -16, 0, -2); bg.addColorStop(0, flash ? "#fff" : "#6a5e72"); bg.addColorStop(1, body);
    g.fillStyle = bg; g.strokeStyle = "#0a060c"; g.lineWidth = 1.2;
    g.beginPath(); g.ellipse(-5, -8, 8, 6.5, -0.15, 0, 7); g.fill(); g.stroke();   // abdomen
    g.fillStyle = mark; g.beginPath(); g.moveTo(-7, -12); g.lineTo(-4, -9); g.lineTo(-7, -6); g.lineTo(-10, -9); g.closePath(); g.fill();   // the marking on its back
    g.fillStyle = body; g.beginPath(); g.ellipse(5, -6.5, 5, 4.2, 0, 0, 7); g.fill(); g.stroke();   // head
    g.fillStyle = flash ? "#fff" : crouch ? "#ff2a3a" : "#ff6a7a"; [[7, -8], [9, -7.2], [6.5, -6], [8.6, -5.4]].forEach(function (q) { g.fillRect(q[0], q[1], 1.6, 1.4); });   // four little red eyes
    g.restore();
  }
  // ---------- MAIN MENU (title screen) ----------
  // The page opens on the main menu: the DELVE logo over your own world, with the camera drifting slowly along the surface (nothing
  // moves, spawns or gets hungry while it is open). Continue drops you back where you left off; New world, Worlds, Play together and
  // Options open the usual windows on top of it. Escape (or the back arrow at the top left) brings the menu back during play.
  var titleOpen = true, titleEl = $("sbxTitle"), TC = { dir: 1, logoT: 0, how: false, shown: false }, hintShown = false;
  var TT_IC = {
    play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
    "new": '<path d="M12 5v14M5 12h14"/>',
    worlds: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.3 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.3-3.8-8.5S9.4 5.9 12 3.5z"/>',
    mp: '<circle cx="8.5" cy="9" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M3 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M14.5 14.3c2.6-.3 5.1 1.2 5.8 4.7"/>',
    opts: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3L5.5 5.5"/>',
    how: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 014.8.9c0 1.7-2.4 2.2-2.4 3.7M12 17.2v.1"/>'
  };
  function ttIcon(k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + TT_IC[k] + "</svg>"; }
  function titleIsNew() { return !S.st.mined && !S.qi && wIdx && wIdx.list.length <= 1; }
  function titleSub() {
    var w = curEntry(), bits = [w ? w.name : "Your world"];
    if (S.diff === 0) bits.push("Easy"); else if (S.diff === 2) bits.push("Hard");
    bits.push(S.qi >= MAIN.length ? "Story complete" : "Chapter " + Math.min(CHAPTERS.length - 1, curCh() + 1));
    if (S.tier) bits.push(PICKS[S.tier].n);
    return bits.join(" · ");
  }
  function renderTitle() {
    var B = $("sbxTBtns"); if (!B) return; titleEl.classList.toggle("how", TC.how);
    if (TC.how) {
      B.innerHTML = '<div class="tt-how" role="group" aria-label="How to play">'
        + '<h2>How to play</h2>'
        + '<div class="tt-hcols"><div><h3>Keyboard and mouse</h3><dl>'
        + '<dt>A D or ← →</dt><dd>Walk</dd><dt>Space or W</dt><dd>Jump, climb ladders</dd><dt>Hold mouse</dt><dd>Dig, chop, place, attack</dd>'
        + '<dt>F</dt><dd>Doors, chests, caves, beds</dd><dt>E</dt><dd>Journal: quests and crafting</dd><dt>B</dt><dd>Backpack</dd><dt>M</dt><dd>World map</dd><dt>1 to 9</dt><dd>Hotbar</dd><dt>G</dt><dd>Full screen</dd><dt>Esc</dt><dd>This menu</dd></dl></div>'
        + '<div><h3>Touch</h3><dl><dt>Stick or arrows</dt><dd>Walk</dd><dt>Jump button</dt><dd>Jump, climb ladders</dd><dt>Hold a block</dt><dd>Dig, chop, place, attack</dd><dt>Tap the hotbar</dt><dd>Switch tools</dd><dt>Book button</dt><dd>Journal: quests and crafting</dd><dt>Back arrow</dt><dd>This menu</dd></dl></div></div>'
        + '<p class="tt-hnote">Not sure what to do next? Old Croaker’s quests in the Journal always point the way, and a gold ring marks what to dig.</p>'
        + '<button type="button" class="tt-back" data-tt="back">' + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Back</button></div>';
      return;
    }
    var nw = titleIsNew(), n = wIdx ? wIdx.list.length : 1;
    B.innerHTML = '<button type="button" class="tt-play" data-tt="play" data-fs-start><span class="tt-pi">' + ttIcon("play") + '</span><span class="tt-pt"><b>' + (nw ? "Start digging" : "Continue") + "</b><small>" + esc(nw ? "Your swamp is ready" : titleSub()) + "</small></span></button>"
      + '<nav class="tt-list" aria-label="Main menu">'
      + '<button type="button" data-tt="new">' + ttIcon("new") + "<span>New world</span></button>"
      + '<button type="button" data-tt="worlds">' + ttIcon("worlds") + "<span>Worlds</span><em>" + n + "</em></button>"
      + '<button type="button" data-tt="mp">' + ttIcon("mp") + "<span>Play together</span></button>"
      + '<button type="button" data-tt="opts">' + ttIcon("opts") + "<span>Options</span></button>"
      + '<button type="button" data-tt="how">' + ttIcon("how") + "<span>How to play</span></button></nav>";
  }
  function drawTitleLogo(now) {
    var cv = $("sbxLogo"); if (!cv || typeof DelveLogo === "undefined") return;
    var b = vw < 520 ? Math.max(6, Math.min(11, Math.floor((vw - 36) / 38))) : vh < 560 ? 9 : 13;
    if (TC.b !== b) { TC.b = b; titleEl.style.setProperty("--lb", b + "px"); }   // the logo has a 2-block margin for its glow: CSS pulls it left by that much so the letters line up with the buttons
    DelveLogo.draw(cv, { b: b, t: reduce ? 0 : now, dpr: Math.min(2, window.devicePixelRatio || 1) });
  }
  function titleCamTarget() {   // keep the ground a little below the middle of the screen
    var halfH = vh / 2 / ts, sum = 0, n = 0;
    for (var i = -14; i <= 14; i += 2) { sum += col[clamp(Math.floor(cam.x + i), 0, W - 1)]; n++; }
    return sum / n - halfH * (vw < 520 ? 0.05 : 0.3);
  }
  function titleTick(dt, now) {
    if (!panelOpen && !menuOpen && $("sbxMPV").hidden) {
      var halfW = vw / 2 / ts, halfH = vh / 2 / ts;
      cam.x += TC.dir * 1.25 * dt; if (cam.x > W - halfW - 4) TC.dir = -1; else if (cam.x < halfW + 4) TC.dir = 1;
      cam.y += (titleCamTarget() - cam.y) * Math.min(1, dt * 0.7);
      cam.x = clamp(cam.x, halfW, W - halfW); cam.y = clamp(cam.y, halfH, H - halfH + 2);
    }
    if (now - TC.logoT > 90) { TC.logoT = now; drawTitleLogo(now); }
  }
  function openTitle() {
    if (titleOpen || MP.on || MP.ws) return;
    bossGone(); save(); if (panelOpen) closePanel(); if (menuOpen) closeWorlds(); closeMPV();
    keys.l = keys.r = keys.j = keys.d = keys.u = 0; tk.l = tk.r = tk.j = 0; aim.down = false; mine = null;
    titleOpen = true; TC.how = false; stageEl.classList.add("title"); titleEl.hidden = false; titleEl.classList.remove("in"); void titleEl.offsetWidth; titleEl.classList.add("in");
    cam.y = titleCamTarget(); renderTitle(); drawTitleLogo(performance.now());
    var pb = titleEl.querySelector(".tt-play"); if (pb) pb.focus({ preventScroll: true });
  }
  function closeTitle() {
    if (!titleOpen) return;
    titleOpen = false; TC.how = false; titleEl.hidden = true; stageEl.classList.remove("title"); hbDirty = true; lastBio = -1; touchIdx();
    if (!hintShown) { hintShown = true; if (!S.st.mined) { $("sbxHint").classList.add("on"); setTimeout(function () { $("sbxHint").classList.remove("on"); }, 14000); } }
    if (storyQ.length && storyOpen < 0) setTimeout(showStory, 500);
    try { cv.focus({ preventScroll: true }); } catch (e) {}
  }
  function titleAct(k) {
    if (k === "play") return closeTitle();
    if (k === "how") { TC.how = true; renderTitle(); var bb = titleEl.querySelector("[data-tt=back]"); if (bb) bb.focus({ preventScroll: true }); return; }
    if (k === "back") { TC.how = false; renderTitle(); var hb = titleEl.querySelector("[data-tt=how]"); if (hb) hb.focus({ preventScroll: true }); return; }
    if (k === "worlds" || k === "new") { openWorlds(); if (k === "new") setTimeout(function () { var i = $("sbxWName"); if (i) i.focus(); }, 30); return; }
    if (k === "mp") return openMPV();
    if (k === "opts") return openPanel("more");
  }
  function titleKey(e) {
    var k = e.key;
    if (k === "Escape" && TC.how) { e.preventDefault(); return titleAct("back"); }
    if (k === "ArrowDown" || k === "ArrowUp" || k === "s" || k === "w" || k === "S" || k === "W") {
      var bs = [].slice.call(titleEl.querySelectorAll("button")), i = bs.indexOf(document.activeElement), d = (k === "ArrowDown" || k === "s" || k === "S") ? 1 : -1;
      var n = bs.length; if (n) { bs[i < 0 ? (d > 0 ? 0 : n - 1) : (i + d + n) % n].focus({ preventScroll: true }); e.preventDefault(); }
      return;
    }
    if ((k === "Enter" || k === " ") && !(document.activeElement && titleEl.contains(document.activeElement))) { e.preventDefault(); return titleAct("play"); }
  }
  titleEl.addEventListener("click", function (e) { var b = e.target.closest("[data-tt]"); if (b) titleAct(b.getAttribute("data-tt")); });
  (function () {   // the back arrow at the top left opens this menu (it is still a plain link to the Arcade when scripts are off, or while playing together)
    var a = document.querySelector(".sbx-ibtns a[href='arcade.html']"); if (!a) return;
    a.setAttribute("aria-label", "Main menu"); a.title = "Main menu (Esc)";
    a.addEventListener("click", function (e) { if (MP.on || MP.ws) return; e.preventDefault(); openTitle(); });
  })();
  // ---------- CHESTS ----------
  // S.chests["x,y"] = { itemId: count }. A chest holds up to CHEST_KINDS kinds of item. Tap it or press F nearby to open the Chest tab. A chest must be empty before you can pick it up.
  var CHEST_KINDS = 30, chestKey = "";
  // Cave Chests (content pack) work like Wooden Chests, but are found in caves and come filled: the loot is rolled the first time one is opened (or broken unopened).
  function isChest(id) { return id === T.CHEST || TILES[id].kind === "lootchest"; }
  function lootTier(y) { var d = y - SURF; return d < 35 ? 0 : d < 80 ? 1 : 2; }
  function rollLoot(kind, b, tier) {
    var one = function () { return typeof SbxExtra !== "undefined" && SbxExtra.loot ? SbxExtra.loot(kind, b, tier) : [["torch", 4]]; }, L = one();
    if (S.charms && hasCharm("lucky") && Math.random() < 0.45) L = L.concat(one().slice(0, 1));   // the Lucky Clover: sometimes one extra find
    return L;
  }
  function treasureFound(n) { S.st.cchests++; popup("Treasure found", "Cave Chest \u2022 " + n + " kinds of loot", "#f2c14e", "\u2726"); snd("open", "Epic"); checkGoals(); }
  function chestCount(key) { var c = S.chests[key], n = 0; if (c) for (var k in c) n += c[k]; return n; }
  function chestKinds(c) { return Object.keys(c).length; }
  function chestNear() {
    var cx = Math.floor(p.x), cy = Math.floor(p.y - 1), best = null, bd = 9, x, y, dx, dy, d;
    for (y = cy - 3; y <= cy + 3; y++) for (x = cx - 3; x <= cx + 3; x++) if (isChest(get(x, y))) { dx = x + 0.5 - p.x; dy = y + 0.5 - (p.y - 0.7); d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { x: x, y: y }; } }
    return best;
  }
  function openChest(x, y) {
    if (MP.on && MP.role === "guest") { nag("Only the host can open chests in this world."); return; }
    var cid = get(x, y); if (!isChest(cid)) return false; var key = x + "," + y;
    if (!S.chests[key]) {
      S.chests[key] = {};
      if (TILES[cid].kind === "lootchest") { var L = key === aerieKey() ? aerieLoot() : rollLoot("chest", world.bio[x], lootTier(y)); L.forEach(function (q) { S.chests[key][q[0]] = q[1]; }); chips(x + 0.5, y + 0.3, "#f2c14e", 18, 7); treasureFound(L.length); }
    }
    chestKey = key; snd("coin"); openPanel("chest"); return true;
  }
  function addInv(item, n) { var fit = Math.min(n, room(item)); if (fit > 0) { S.inv[item] = (S.inv[item] || 0) + fit; packInto(S.slots, item, fit); if (ITEMS[item].tile !== undefined && S.mru.indexOf(item) < 0) S.mru.push(item); } hbDirty = true; return fit; }   // like give(), but without counting it as gathered; returns how many fit
  function chestMove(item, all, dir) {
    if (ITEMS[item] && ITEMS[item].tool) { nag("Tools stay with you."); return; }   // dir "put": bag -> chest, "take": chest -> bag. all = whole stack
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
  function chestAll(dir) { var c = S.chests[chestKey]; if (!c) return; (dir === "put" ? ORDER.filter(function (k) { return (S.inv[k] || 0) > 0 && !ITEMS[k].tool; }) : Object.keys(c)).forEach(function (k) { chestMove(k, true, dir); }); }
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
      if (fe) { fe.w = WET_S; setSoil(cr.x, cr.y + 1, true); if (MP.on && MP.role === "guest") mpSend({ t: "water", k: cr.x + "," + cr.y }); }
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
      cool -= dt; if (cool > 0) return; cool = wCd(); S.st.swings++; swingQ = 0.1;
      thud(300 + S.wpn * 70, 0.04); for (var sk = 0; sk < 3; sk++) parts.push({ x: p.x + p.face * (0.9 + sk * 0.35), y: p.y - 1.1 - sk * 0.12, vx: p.face * 3, vy: -0.4, life: 0.22, max: 0.3, c: WEAPONS[S.wpn].c, s: 3 });
      return;
    }
    if (aim.down && aim.tx >= 0 && (animalAt((aim.mx - ox) / ts, (aim.my - oy) / ts) || npcAt((aim.mx - ox) / ts, (aim.my - oy) / ts))) { mine = null; return; }   // tapping an animal (handled on release)
    if (sel === "rod") { useRod(dt); return; }
    if (sel === "hoe") { useHoe(dt); return; }
    if (sel === "bucket") { useBucket(dt); return; }
    if (sel === "net") { useNet(dt); return; }
    if (sel === "bow") { useBow(dt); return; }
    if (ITEMS[sel] && ITEMS[sel].summon) { useSummon(dt); return; }
    if (ITEMS[sel] && ITEMS[sel].home) { useHome(dt); return; }
    if (POTIONS[sel]) { useDrink(dt); return; }
    if (isStainTool(sel)) { useStain(dt); return; }
    if (ITEMS[sel] && ITEMS[sel].food && ITEMS[sel].tile === undefined) { useFood(dt); return; }   // holding food: tap to eat
    if (!aim.down || aim.tx < 0) { mine = null; doorHoldKey = ""; return; }
    var tx = aim.tx, ty = aim.ty, dx = tx + 0.5 - p.x, dy = ty + 0.5 - (p.y - PH / 2);
    if (dx * dx + dy * dy > REACH * REACH) { mine = null; return; }
    if (Math.abs(dx) > 0.35) p.face = dx < 0 ? -1 : 1;   // turn to face what you are digging or building
    if (sel === "can") { useCan(dt, tx, ty); return; }
    var pk = TILES[get(tx, ty)], plantHit = sel !== "pick" && sel !== "shovel" && !!pk && !pk.crop && (pk.kind === "leaves" || (!pk.solid && (pk.kind === "reed" || pk.kind === "flower" || pk.kind === "bloom" || pk.kind === "glowcap" || pk.kind === "vine" || pk.sway)));
    var pawItem = ITEMS[sel] && ITEMS[sel].tile === undefined && !ITEMS[sel].wall && !ITEMS[sel].tool;   // a plain material in hand: dig like bare paws
    if (pawItem && !plantHit) plantHit = true;
    if (sel === "pick" || sel === "shovel" || plantHit) {
      var id = get(tx, ty), td = TILES[id];
      if (id === T.AIR && walls[ty * W + tx]) { wallMine(dt, tx, ty); return; }
      if (id === T.BEDROCK) { nag("Bedrock can't be broken."); mine = null; return; }
      if (id === T.AIR || !isFinite(td.hard)) { mine = null; return; }
      if (sdoorAt(tx, ty)) { nag("Tap the door to go inside."); mine = null; return; }
      if (sel === "shovel" && !SOFT[id]) { nag("A shovel only digs soft ground (mud, moss, clay, ash, snow). Use your pick for " + td.n + "."); mine = null; return; }
      if (sel === "shovel" && toolBroken("shovel")) { nag("Your shovel is broken. Repair it in the Craft tab."); mine = null; return; }
      if (sel === "pick" && td.tier > effTier()) { nag(S.tier >= td.tier ? "Your pick is broken. Repair it in the Craft tab." : "Needs the " + PICKS[td.tier].n + " to break " + td.n + "."); mine = null; return; }
      if (plantHit && sel !== "pick" && td.tier > 0) { nag("Hold your pick to break " + td.n + "."); mine = null; return; }
      var dro = dropOf(td); if (dro && room(dro) <= 0) { invFull(); mine = null; return; }
      if (td.kind === "door" || td.kind === "chest" || td.kind === "lootchest") {   // a quick tap opens/closes the door, so breaking it needs a short hold first
        var dk = tx + "," + ty; if (doorHoldKey !== dk) { doorHoldKey = dk; doorHoldT = 0; }
        doorHoldT += dt; if (doorHoldT < 0.3) { mine = null; return; }
        if ((td.kind === "chest" || td.kind === "lootchest") && chestCount(tx + "," + ty) > 0) { nag("Empty the chest before picking it up."); mine = null; return; }
      } else if (td.kind === "armorstand" || td.kind === "fishtrap" || td.kind === "realmgate" || td.kind === "jeweltable") { var sk2 = tx + "," + ty; if (doorHoldKey !== sk2) { doorHoldKey = sk2; doorHoldT = 0; } doorHoldT += dt; if (doorHoldT < 0.35) { mine = null; return; } }   // a tap dresses it, a hold picks it up
      else doorHoldKey = "";
      if (!mine || mine.x !== tx || mine.y !== ty) mine = { x: tx, y: ty, p: 0, tick: 0 };
      mine.p += dt * (sel === "shovel" ? SHOVEL.sp : PICKS[plantHit && sel !== "pick" ? 0 : effTier()].sp) * (hasCharm("miner") ? 1.25 : 1) * (fx("mine") ? 1.4 : 1) * gemDig() / td.hard; mine.tick -= dt;
      if (mine.tick <= 0) { mine.tick = 0.17; thud(150 + Math.random() * 50, 0.035); chips(tx + 0.5, ty + 0.5, td.kind === "ore" ? td.c2 : td.c, 1, 3); }
      if (mine.p >= 1) { breakTile(tx, ty); mine = null; if (sel === "shovel") wear("shovel", 1); else if (effTier() > 0 && !plantHit) wear("pick", td.hard >= 2 ? 2 : 1); }
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
    cook: { n: "Cooking Pot", sh: "Cooking Pot", kind: "cookpot", ic: "cookpot", c: "#ff9a4a", d: "Cook crops, mushrooms and meat into meals that fill your hunger bar and heal you." },
    brew: { n: "Brewing Stand", sh: "Brewing Stand", kind: "brewstand", ic: "brewstand", c: "#c06aff", d: "Brew potions from plants, crops and critters. Hold a potion and tap to drink it; you keep the bottle." }
  }, STN_ORDER = ["bench", "decor", "cook", "brew", "furnace", "loom", "mason"], KIND_STN = {}, stnOpen = null, stnCat = {}, stnReady = false;
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
    if (r.rod && S.rod >= r.rod) return;
    if (r.charm && S.charms.own[r.charm]) return;
    if (r.hoe && S.hoe >= r.hoe) return;
    if (r.bucket && S.bucket >= r.bucket) return;
    if (r.bucket && S.bucket < r.bucket - 1) { toast("Make the Wooden Bucket first.", "#f2c14e"); return; }
    if (r.net && S.net >= r.net) return;
    if (r.bow && S.bow >= r.bow) return;
    if (r.hoe && S.hoe < r.hoe - 1) { toast("Make the " + HOES[r.hoe - 1].n + " first.", "#f2c14e"); return; }
    if (r.bow && S.bow < r.bow - 1) { toast("Make the " + BOWS[r.bow - 1].n + " first.", "#f2c14e"); return; }
    if (r.rod && S.rod < r.rod - 1) { toast("Make the Reed Fishing Rod first.", "#f2c14e"); return; }
    if (r.bag && S.bag >= r.bag) return;
    if (r.bag && S.bag < r.bag - 1) { toast("Make the " + BAGS[r.bag - 1].n + " first.", "#f2c14e"); return; }
    if (r.tier && S.tier < r.tier - 1) { toast("Craft the " + PICKS[r.tier - 1].n + " first.", "#f2c14e"); return; }
    if (r.wpn && S.wpn < r.wpn - 1) { toast("Craft the " + WEAPONS[r.wpn - 1].n + " first.", "#f2c14e"); return; }
    if (r.arm && S.arm < r.arm - 1) { toast("Craft the " + ARMORS[r.arm - 1].n + " first.", "#f2c14e"); return; }
    if (r.need && S.tier < r.need) { toast("Needs the " + PICKS[r.need].n + " first.", "#f2c14e"); return; }
    if (r.bl && S.bl < r.bl) { toast("Upgrade your Workbench to the " + BENCH_LV[r.bl].n + " first.", "#f2c14e"); return; }
    if (r.bench && !nearBench()) { toast("Stand near a Bog Workbench to craft this.", "#f2c14e"); return; }
    if (r.stn && !nearStn(r.stn)) { toast("Stand near a " + SbxExtra.STN[r.stn] + " to craft this.", "#f2c14e"); return; }
    for (var k in r.cost) if (haveIt(k) < r.cost[k]) { toast("Not enough " + ITEMS[k].n + ".", "#f2c14e"); return; }
    if (r.out) {   // the crafted items must fit once the ingredients are used up
      reslot(); var sim = S.slots.map(function (c) { return c ? { k: c.k, n: c.n } : null; }), q;
      for (q in r.cost) takeFrom(sim, q, Math.min(S.inv[q] || 0, r.cost[q]), -1);
      for (q in r.out) if (packInto(sim, q, r.out[q]) > 0) { toast("Not enough room in your inventory.", "#f2c14e"); return; }
    }
    var fromChests = payCost(r.cost);
    reslot();
    if (r.tier) { S.tier = r.tier; S.dur.pick = DUR.pick[r.tier]; ICO = {}; toast(r.n + " crafted. Dig faster!", PICKS[r.tier].c); snd("open", "Epic"); chips(p.x, p.y - 1, PICKS[r.tier].c, 30, 9); }
    else if (r.sh) { S.shovel = 1; S.dur.shovel = DUR.shovel; ICO = {}; toast(r.n + " crafted. Pick it in the hotbar to dig soft ground!", SHOVEL.c); snd("open", "Epic"); chips(p.x, p.y - 1, SHOVEL.c, 24, 8); }
    else if (r.charm) { S.charms.own[r.charm] = 1; var wore = S.charms.on.length < charmSlots(); if (wore) S.charms.on.push(r.charm); toast(r.n + " crafted! " + CHARMS[r.charm].d + (wore ? " (Now wearing it.)" : " Wear it from the top of your backpack."), CHARMS[r.charm].c); snd("open", "Epic"); chips(p.x, p.y - 1, CHARMS[r.charm].c, 24, 8); checkGoals(); }
    else if (r.bucket) { S.bucket = r.bucket; ICO = {}; toast(r.n + " crafted! Tap water" + (r.bucket >= 2 ? " or lava" : "") + " to scoop it, tap an empty space to pour.", "#8fe0ff"); snd("open", "Epic"); chips(p.x, p.y - 1, "#8fe0ff", 20, 7); checkGoals(); }
    else if (r.bow) { S.bow = r.bow; ICO = {}; toast(r.n + " crafted! Pick it in the hotbar and tap toward a target to shoot" + (r.bow === 1 ? " Pebbles." : " Arrows."), BOWS[r.bow].c); snd("open", "Epic"); chips(p.x, p.y - 1, BOWS[r.bow].c, 20, 7); checkGoals(); }
    else if (r.net) { S.net = r.net; ICO = {}; toast(r.n + " crafted! On swamp nights, tap fireflies to catch them.", "#dcff78"); snd("open", "Epic"); chips(p.x, p.y - 1, "#dcff78", 20, 7); checkGoals(); }
    else if (r.hoe) { S.hoe = r.hoe; ICO = {}; toast(r.n + " crafted! Pick it in the hotbar and tap grass or mud to make Garden Soil" + (HOES[r.hoe].w > 1 ? " (" + HOES[r.hoe].w + " tiles at a time)" : "") + ". Tap ripe crops to harvest and replant.", "#c9e07a"); snd("open", "Epic"); chips(p.x, p.y - 1, "#c9e07a", 24, 8); checkGoals(); }
    else if (r.rod) { S.rod = r.rod; ICO = {}; toast(r.n + " crafted! Pick it in the hotbar and tap " + (r.rod >= 2 ? "water or lava" : "water") + " to cast.", "#7fd6ff"); snd("open", "Epic"); chips(p.x, p.y - 1, "#7fd6ff", 24, 8); }
    else if (r.can) { S.can = 1; S.water = CAN.max; ICO = {}; toast(r.n + " crafted. Pick it in the hotbar, then water flowers!", CAN.c); snd("open", "Epic"); chips(p.x, p.y - 1, CAN.c, 24, 8); checkGoals(); }
    else if (r.bag) {   // a backpack: more bag slots at the end of the list, then anything waiting in Overflow moves in
      S.bag = r.bag; while (S.slots.length < invSize(S.bag)) S.slots.push(null);
      var moved = 0; Object.keys(S.extra).forEach(function (ek) { var fit = Math.min(S.extra[ek], room(ek)); if (fit > 0) { S.inv[ek] = (S.inv[ek] || 0) + fit; packInto(S.slots, ek, fit); S.extra[ek] -= fit; moved += fit; if (S.extra[ek] <= 0) delete S.extra[ek]; } });
      toast(r.n + " crafted. +" + (BAGS[S.bag].x - BAGS[S.bag - 1].x) + " bag slots (" + S.slots.length + " in all)!" + (moved ? " " + moved + " Overflow items moved in." : ""), BAGS[S.bag].c); snd("open", "Epic"); chips(p.x, p.y - 1, BAGS[S.bag].c, 26, 8); checkGoals();
    }
    else if (r.arm) { S.arm = r.arm; S.dur.arm = DUR.arm[r.arm]; ICO = {}; armKey = ""; spriteKey = ""; toast(r.n + " crafted and worn. You take " + Math.round(ARMORS[r.arm].red * 100) + "% less damage!", ARMORS[r.arm].c); snd("open", "Epic"); chips(p.x, p.y - 1, ARMORS[r.arm].c, 30, 9); checkGoals(); }
    else if (r.wpn) { S.wpn = r.wpn; S.dur.wpn = DUR.wpn[r.wpn]; ICO = {}; toast(r.n + " crafted. Pick it in the hotbar and swing!", WEAPONS[r.wpn].c); snd("open", "Epic"); chips(p.x, p.y - 1, WEAPONS[r.wpn].c, 30, 9); }
    else { if (fromChests) text(p.x, p.y - PH - 0.6, "used " + fromChests + " from chests", "#e8d9a8"); for (var o in r.out) give(o, r.out[o], undefined, undefined, true); if (r.deco) { S.st.dcraft++; checkGoals(); } if (r.stn === "cook") { S.st.cooked++; checkTrail(); checkGoals(); } toast(r.id === "bench" ? "Workbench made! Pick it in the hotbar, then tap the ground." : "Crafted " + r.n, "#4ee6b4"); snd("coin"); }
    S.mk[r.id] = (S.mk[r.id] || 0) + 1; checkGoals();
    hbDirty = true; renderPanel(); save();
  }
  function upgradeBench() {   // spend loot from the last biome to raise the Workbench one level (needs a Workbench close by)
    var nx = S.bl + 1, L = BENCH_LV[nx]; if (!L) return;
    if (!nearBench()) { toast("Stand near a Bog Workbench to upgrade it.", "#f2c14e"); return; }
    for (var k in L.cost) if (haveIt(k) < L.cost[k]) { toast("Not enough " + ITEMS[k].n + ".", "#f2c14e"); return; }
    payCost(L.cost);
    reslot(); S.bl = nx; benchLv = nx; repaintBench(); ICO = {};
    toast("Workbench upgraded: " + L.n + "! Unlocks " + L.gives + ".", L.c); snd("open", "Epic"); chips(p.x, p.y - 1, L.c, 34, 10);
    hbDirty = true; checkGoals(); renderPanel(); save();
  }
  function rewardText(rw) { return Object.keys(rw).map(function (k) { return "+" + rw[k] + " " + ITEMS[k].n; }).join(", "); }
  function giveRw(rw) { if (rw) for (var k in rw) if (ITEMS[k]) give(k, rw[k], undefined, undefined, true); }
  function checkTrail(silent) {   // the main quest line: finish quests in order; finishing a chapter shows the next chapter's story
    var q, guard = 0;
    while ((q = MAIN[S.qi]) && q.v() >= q.need && guard++ < 99) {
      var ch0 = q.ch, list = chQuests(ch0), pos = list.indexOf(q) + 1; S.qi++; trailKey = "";
      if (silent) continue;
      giveRw(q.rw);
      banner(q.n, q.rw ? "Reward: " + rewardText(q.rw) : "Quest complete!", "Chapter " + (ch0 + 1) + " \u00b7 quest " + pos + " of " + list.length);
      if (ch0 === 0 && MAIN[S.qi] && MAIN[S.qi].ch === 0) { var nq = MAIN[S.qi]; setTimeout(function () { if (MAIN[S.qi] === nq && !panelOpen) showTip("Next: " + nq.n + ". " + nq.d, QRC[nq.id] || "", CHAPTERS[0].c); }, 1600); }
      var ch1 = curCh();
      if (ch1 !== ch0) {
        var C = CHAPTERS[ch0]; giveRw(C.rw);
        setTimeout(function () { popup("Chapter complete", C.n + (C.rw ? " \u2022 " + rewardText(C.rw) : ""), C.c, "\u2605"); snd("open", "Epic"); }, 900);
        if (S.qch < ch1) { S.qch = ch1; storyQ.length = 0; storyQ.push(ch1); setTimeout(showStory, 2200); }   // several chapters at once: only the newest story is told
      }
      save();
    }
  }
  // ---- story cards: Old Croaker tells each chapter's story when it begins (and you can reread it from the Quests tab) ----
  var storyQ = [], storyOpen = -1;
  function showStory(c) {
    if (c === undefined) { if (!storyQ.length) return; if (panelOpen || titleOpen || trans || sleepT > 0) { setTimeout(showStory, 1200); return; } c = storyQ.shift(); }
    var C = CHAPTERS[c], last = c === CHAPTERS.length - 1, el = $("sbxStory"); if (!C || !el) return;
    if (mapOpen) closeMap(); if (packOpen) closePack(); if (panelOpen && storyOpen < 0) closePanel();
    storyOpen = c; panelOpen = true; el.hidden = false; stageEl.classList.add("panel"); keys.l = keys.r = keys.j = 0; tk.l = tk.r = tk.j = 0; aim.down = false; mine = null;
    $("sbxStoryBox").style.setProperty("--qc", C.c);
    var nq = chQuests(c), first = nq[0];
    $("sbxStoryBox").innerHTML = '<div class="st-croak" aria-hidden="true">' + CROAK_SVG + '</div><small>' + (last ? "World complete \u2605 The end of the beginning" : "Chapter " + (c + 1) + " of " + (CHAPTERS.length - 1)) + "</small><h2>" + esc(C.n) + "</h2><p>" + esc(C.s) + "</p>"
      + (first ? '<div class="st-next"><span>First quest</span><b>' + esc(first.n) + "</b><em>" + esc(first.d) + "</em></div>" : "")
      + '<button type="button" class="btn" data-story-close>' + (last ? "Keep exploring" : c === 0 ? "Let's begin" : "Onward!") + "</button>";
    if (gestured) snd("rise"); var bt = el.querySelector("[data-story-close]"); if (bt) bt.focus({ preventScroll: true });
  }
  function closeStory() { storyOpen = -1; panelOpen = false; $("sbxStory").hidden = true; stageEl.classList.remove("panel"); if (storyQ.length) setTimeout(showStory, 400); }
  var CROAK_SVG = '<svg viewBox="0 0 64 64"><ellipse cx="32" cy="42" rx="24" ry="17" fill="#3fc25f" stroke="#1c5e34" stroke-width="2.5"/><ellipse cx="32" cy="48" rx="15" ry="7" fill="#f1efb4"/><circle cx="19" cy="24" r="9" fill="#3fc25f" stroke="#1c5e34" stroke-width="2.5"/><circle cx="45" cy="24" r="9" fill="#3fc25f" stroke="#1c5e34" stroke-width="2.5"/><circle cx="19" cy="24" r="5" fill="#ffd23f"/><circle cx="45" cy="24" r="5" fill="#ffd23f"/><path d="M17 23h4M43 23h4" stroke="#12220f" stroke-width="2.2" stroke-linecap="round"/><path d="M20 40q12 8 24 0" fill="none" stroke="#12220f" stroke-width="2.2" stroke-linecap="round"/><path d="M12 16q7-9 14-3M38 13q7-6 14 3" fill="none" stroke="#e8e4d8" stroke-width="3" stroke-linecap="round"/><circle cx="27" cy="33" r="1.4" fill="#1c5e34"/><circle cx="37" cy="33" r="1.4" fill="#1c5e34"/></svg>';
  function findGuide() {
    var st = MAIN[S.qi]; guide = null; if (!st || !st.tg) return;
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
    if (!guide || panelOpen || titleOpen) return;
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
  function bestSide() {   // the open side quest closest to done (shown in the tracker once the story is over)
    var best = null, br = -1; SIDE.forEach(function (q) { if (S.ms[q.id] || !sideOpen(q)) return; var r = Math.min(1, q.v() / q.need); if (r > br) { br = r; best = q; } }); return best;
  }
  function drawTrail() {   // the HUD quest tracker: the current main quest (or, after the story, a side quest)
    var el = $("sbxTrail"), q = MAIN[S.qi], side = !q; if (side) q = bestSide();
    if (!q) { if (!el.hidden) el.hidden = true; return; }
    var v = Math.min(q.need, Math.floor(q.v())), key = q.id + ":" + v; if (key === trailKey) return; trailKey = key;
    el.hidden = false; el.style.setProperty("--qc", side ? "#c78bff" : CHAPTERS[q.ch].c);
    el.title = side ? "Side quest" : "Chapter " + (q.ch + 1) + ": " + CHAPTERS[q.ch].n;
    el.innerHTML = "<small>" + (side ? "Side quest" : "Ch " + (q.ch + 1) + " \u00b7 Quest") + "</small><b>" + esc(q.n) + "</b><em>" + v + "/" + q.need + '</em><span class="bar"><i style="width:' + Math.round(v / q.need * 100) + '%"></i></span>';
  }
  function checkGoals() {
    if (!cave && world) { var bb = world.bio[clamp(Math.floor(p.x), 0, W - 1)]; if (!S.vis["b" + bb]) { S.vis["b" + bb] = 1; trailKey = ""; } }
    checkTrail();
    var got = [];
    SIDE.forEach(function (q) { if (!S.ms[q.id] && sideOpen(q) && q.v() >= q.need) { S.ms[q.id] = 1; giveRw(q.rw); got.push(q); } });
    if (got.length > 2) popup("Side quests complete", got.length + " quests \u2022 rewards added to your bag", "#c78bff", "\u2713");
    else got.forEach(function (q) { banner(q.n, q.rw ? "Reward: " + rewardText(q.rw) : q.d, "Side quest complete"); });
    if (got.length) trailKey = "";
  }
  // ---------- HEALTH ----------
  var armKey = "";
  function drawArm() {   // little armor badge under the health bar: icon + how much is left
    var el = $("sbxArm"); if (!el) return; var k = S.arm + ":" + (S.arm ? durOf("arm") : 0); if (k === armKey) return; armKey = k;
    if (!S.arm) { el.hidden = true; if (el.parentNode) el.parentNode.title = ""; return; }
    var m = durMax("arm"), cur = durOf("arm"), pc = Math.round(cur / m * 100);
    el.hidden = false; el.className = "shd" + (cur <= 0 ? " brk" : pc <= 25 ? " bad" : pc <= 50 ? " low" : "");
    el.style.setProperty("--ap", Math.max(0, Math.min(100, pc)));   // the ring around the heart: how much armor durability is left
    var tip = ARMORS[S.arm].n + (cur <= 0 ? " (broken)" : ": " + pc + "% durability, blocks " + Math.round(armRed() * 100) + "%");
    if (el.parentNode) el.parentNode.title = tip;
    var ai = el.querySelector(".ai"); if (ai && ai.dataset.k !== String(S.arm)) { ai.dataset.k = S.arm; ai.innerHTML = '<img alt="" src="' + sprCanvas("arm" + S.arm).toDataURL() + '">'; }
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
    if (MP.proxy) return mpProxyHurt(n, why);   // a creature on the host's screen hit a visiting player
    if (n <= 0) return; if (!cont && hurtGrace > 0) return;
    n *= dif().dmg;   // difficulty
    if (hasCharm("king") && (why === "boss" || BOSS[why])) n *= 0.8;   // the Swampking Sigil
    if (fx("hide")) n *= 0.8;   // Ironhide Brew
    if (gem("arm", "moonstone") && isNight(S.time) && !cave) n *= 0.8;
    if (S.arm > 0 && durOf("arm") > 0) {   // armor blocks a share of the hit (half as much against lava) and wears down on every real hit
      var blocked = n * armRed() * (why === "lava" ? 0.5 : 1); n -= blocked;
      if (!cont) { wear("arm", n >= 14 ? 2 : 1); armKey = ""; if (blocked >= 1) text((cave ? cp.x : p.x) + 0.5, cave ? cp.y - 1.3 : p.y - PH - 0.1, "-" + Math.round(blocked) + " blocked", "#7fd6ff"); }
    }
    hp -= n; sinceHurt = 0; hurtT = Math.max(hurtT, cont ? 0.15 : 0.5);
    if (!cont) { hurtGrace = 0.5; shake = Math.min(1, n / 40); text(cave ? cp.x : p.x, cave ? cp.y - 1.5 : p.y - PH - 0.3, "-" + Math.round(n), "#ff6a5a"); thud(110, 0.07); }
    if (hp <= 0) faint(why);
  }
  function faint(why) {
    S.st.deaths++; hp = MAXHP; hurtT = hurtGrace = shake = 0; sinceHurt = 99;
    var lost = 0, L = dif().loss;
    if (L > 0) Object.keys(S.inv).forEach(function (k) {   // Hard: a share of each stack of loose materials is lost
      var it = ITEMS[k]; if (!it || it.tool || it.summon || it.home || POTIONS[k] || TROPHY[k] || !(S.inv[k] > 1)) return;
      var n = Math.floor(S.inv[k] * L); if (n > 0) { S.inv[k] -= n; lost += n; }
    });
    if (lost) { reslot(); hbDirty = true; }
    respawn((why === "lava" ? "Burned by lava! You woke up at camp." : "You passed out and woke up at camp.") + (lost ? " (Hard: you lost " + lost + " loose materials.)" : ""));
  }
  function respawn(msg) {
    if (cave) leaveCaveNow();
    bossGone(); enemies.length = 0; spawnT = 6; swingQ = 0; batT = 8;
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
    if (activeBoss()) return "Not with a boss on the loose!";
    if (sheltered()) return "";
    for (var i = 0; i < enemies.length; i++) { var e = enemies[i]; if (!e.def && Math.abs(e.x - p.x) < 14 && Math.abs(e.y - p.y) < 10) return e.k === "bat" ? "Bats are circling! Drive them off, or get under a roof." : "Something is too close to sleep!"; }
    return "";
  }
  function trySleep() {
    if (MP.on && MP.role === "guest") { if (bedNear()) nag("Only the host can sleep through the night in their world."); return; }
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
    var sp = (p.wet ? 3.6 * (hasCharm("tide") ? 1.6 : 1) : 6.3) * (hasCharm("bramble") ? 1.15 : 1) * (fx("speed") ? 1.25 : 1) * (hexSlow > 0 ? 0.55 : 1), acc = p.on ? 70 : 34;
    p.vx = approach(p.vx, dir * sp, (dir ? acc : (p.on ? 60 : 8)) * h);
    p.vy = Math.min(p.wet ? 4 : 27, p.vy + (p.wet ? 13 : 40) * h);
    if (p.on || feetWet) p.coy = 0.1; else p.coy -= h;
    var lad = onLadder();
    if (lad) { p.vy = jump ? -4.8 : (keys.d || tk.d) ? 5.2 : (coarse ? 2.5 : 0); p.coy = 0; p.vx *= 0.9; }
    else if (jump) { if (p.wet) p.vy = Math.max(p.vy - 52 * h, -5.2); else if (p.coy > 0) { p.vy = (feetWet ? -9 : -14.2) * (fx("leap") ? 1.3 : 1); p.coy = 0; p.on = false; } else if (p.air2 && !p.jprev && hasCharm("alpha")) { p.air2 = false; p.vy = -12.6; chips(p.x, p.y - 0.1, "#cfeaff", 8, 4); thud(640, 0.03); } }   // the Alpha Charm's second jump
    if (p.on || lad || p.wet) p.air2 = true;
    var upd = !lad && !p.wet && inUpdraft(p.x, p.y);
    gliding = !!(S.wings && jump && !p.on && !lad && !p.wet && !cave && (p.vy > 0 || upd));
    if (upd) p.vy = approach(p.vy, gliding ? -17 : -14, 80 * h);   // the hot updraft over a Thermal Vent
    else if (gliding) { p.vy = Math.min(p.vy, GLIDE.fall); p.vx = approach(p.vx, dir * sp * GLIDE.speed, 24 * h); glideDist += Math.abs(p.vx) * h; }
    p.jprev = !!jump;   // per physics step, so one press is one jump
    if (touches("lava")) { p.vy = Math.min(p.vy, 4); if (jump) p.vy = Math.max(p.vy - 50 * h, -5); }   // lava is thick: you sink slowly and can climb out
    // horizontal, with automatic one-block step-up
    var nx = clamp(p.x + p.vx * h, 1, W - 1);
    if (!boxHit(nx, p.y)) p.x = nx;
    else if ((p.on || feetWet) && !boxHit(nx, p.y - 1.001) && !boxHit(p.x, p.y - 1.001)) { p.x = nx; p.y -= 1; }
    else p.vx = 0;
    // vertical
    var ny = p.y + p.vy * h, vpre = p.vy; p.on = false;
    if (!boxHit(p.x, ny)) p.y = ny;
    else if (p.vy > 0) { p.y = Math.floor(ny); var g = 0; while (boxHit(p.x, p.y) && g++ < 4) p.y -= 1; p.on = true; p.vy = 0; if (vpre > FALL_SAFE && !p.wet && !gliding) hurt(Math.round((vpre - FALL_SAFE) * FALL_DMG), "fall"); if (vpre > 8) { p.land = Math.min(0.28, vpre / 70); dust(Math.min(10, Math.round(vpre / 3))); } }
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
    advTime(dt); tickWeather(dt);
    if (p.land) p.land = Math.max(0, p.land - dt * 2.2);
    dustT -= dt; if (dustT <= 0 && p.on && Math.abs(p.vx) > 4) { dustT = 0.12; dust(1); }
    var dir = ((keys.r || tk.r) ? 1 : 0) - ((keys.l || tk.l) ? 1 : 0), jump = keys.j || tk.j;
    if (dir) p.face = dir;
    updateDoors(dt, dir);
    var sub = Math.ceil(dt / 0.02), h = dt / sub;
    for (var i = 0; i < sub; i++) step(h, dir, jump);
    p.walk += Math.abs(p.vx) * dt; if (p.wet) S.st.swim += dt;
    if (touches("lava")) hurt(LAVA_DPS * dt * (hasCharm("magma") ? 0.3 : 1) * (fx("fire") ? 0.2 : 1) * (gem("arm", "ruby") ? 0.6 : 1), "lava", true);
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
    useTool(dt); updateGrow(dt); updateEnemies(dt); updateAnimals(dt); updateNpc(dt); tickBounties(dt); tickFarm(dt); tickHunger(dt); tickFx(dt); questHelp(dt); if (fishing && sel !== "rod") fishing = null;
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
  // ---------- BUILDING PICTURES ----------
  // The buildings you can enter are not blocks in the world. When a world is built, each one's blocks and back walls are lifted out of the tile grid
  // into a picture (s.pic: its rectangle, tile ids and wall ids), and the ground around it is left as plain land. The picture is painted once
  // (with the same art as real blocks, see drawCell) into a small cached canvas, re-painted only when the zoom changes, and drawn behind
  // everything you build, so you walk past in front of it. Its lamps still glow and light up the dark. A building is entered at its door (structNear).
  var PIC_MAX = 10, picUse = 0, PICT = null;   // PICT: building tile per world cell, for the maps
  function liftStructs(t, wl) {   // world gen output -> pictures; the cells become air with no back wall
    PICT = new Uint16Array(W * H);
    (world.structs || []).forEach(function (q) {
      var x0 = q.mx0 !== undefined ? q.mx0 : q.x0 - 1, x1 = q.mx0 !== undefined ? q.mx1 : q.x1 + 1, y0 = q.mx0 !== undefined ? q.my0 : q.gy - q.bh - 7, y1 = q.gy - 1;
      x0 = clamp(x0, 0, W - 1); x1 = clamp(x1, 0, W - 1); y0 = clamp(y0, 0, H - 1); y1 = clamp(y1, 0, H - 1);
      var w = x1 - x0 + 1, h = y1 - y0 + 1, P = { x0: x0, y0: y0, w: w, h: h, t: new Uint16Array(w * h), wl: new Uint8Array(w * h), lt: [], cv: null, cts: 0, gl: [], used: 0 }, any = false;
      for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
        var gi = (y0 + yy) * W + x0 + xx, k = yy * w + xx, id = t[gi], wv = wl ? wl[gi] : 0;
        if (id === T.WATER || id === T.LAVA) id = T.AIR;
        if (id !== T.AIR) { P.t[k] = id; PICT[gi] = id; t[gi] = T.AIR; any = true; if (TILES[id].light > 0) P.lt.push([x0 + xx, y0 + yy, TILES[id].light]); }
        if (wv) { P.wl[k] = wv; wl[gi] = 0; any = true; }
      }
      if (any) q.pic = P;
    });
  }
  function structCanvas(P) {
    P.used = ++picUse;
    if (P.cv && P.cts === ts) return P.cv;
    var live = (world.structs || []).filter(function (q) { return q.pic && q.pic.cv; });
    if (live.length >= PIC_MAX) { live.sort(function (a, b) { return a.pic.used - b.pic.used; }); live[0].pic.cv = null; }   // keep only the most recently seen pictures in memory
    var cv = document.createElement("canvas"), w = P.w, h = P.h; cv.width = w * ts; cv.height = h * ts; var c = cv.getContext("2d"); c.imageSmoothingEnabled = false;
    // put the building back into the world for a moment, so edge shading and wall borders see their real neighbours
    var keepT = [], keepW = [], k, xx, yy, gi;
    for (yy = 0; yy < h; yy++) for (xx = 0; xx < w; xx++) { k = yy * w + xx; gi = (P.y0 + yy) * W + P.x0 + xx; keepT.push(tiles[gi]); keepW.push(walls[gi]); if (P.t[k]) tiles[gi] = P.t[k]; if (P.wl[k]) walls[gi] = P.wl[k]; }
    var g0 = glows.length, cw0 = CELL.wob, ce0 = CELL.edge, cs0 = CELL.sw; CELL.wob = 0; CELL.edge = Math.max(1, Math.round(ts / 9)); CELL.sw = 0;
    try { for (yy = 0; yy < h; yy++) for (xx = 0; xx < w; xx++) { k = yy * w + xx; if (P.t[k] || P.wl[k]) drawCell(c, P.x0 + xx, P.y0 + yy, xx * ts, yy * ts, 0); } }
    finally {
      for (yy = 0; yy < h; yy++) for (xx = 0; xx < w; xx++) { gi = (P.y0 + yy) * W + P.x0 + xx; tiles[gi] = keepT[yy * w + xx]; walls[gi] = keepW[yy * w + xx]; }
      CELL.wob = cw0; CELL.edge = ce0; CELL.sw = cs0;
    }
    P.gl = glows.splice(g0).map(function (q) { return [P.x0 + q[0] / ts, P.y0 + q[1] / ts, q[2], q[3], q[4]]; });   // its lamps, as world positions
    P.cv = cv; P.cts = ts; return cv;
  }
  function drawStructs(g, X0, X1, Y0, Y1) {
    var L = world.structs; if (!L) return;
    for (var i = 0; i < L.length; i++) {
      var P = L[i].pic; if (!P || P.x0 > X1 + 1 || P.x0 + P.w < X0 - 1 || P.y0 > Y1 + 1 || P.y0 + P.h < Y0 - 1) continue;
      var cv = structCanvas(P); g.imageSmoothingEnabled = false; g.drawImage(cv, ox + P.x0 * ts, oy + P.y0 * ts);
      for (var q = 0; q < P.gl.length; q++) { var G = P.gl[q]; glows.push([ox + G[0] * ts, oy + G[1] * ts, G[2], G[3], G[4]]); }
    }
  }
  // ---------- ONE CELL OF THE WORLD: its back wall and its tile, drawn at (sx3, sy). Used by the main view and to paint building pictures. ----------
  var CELL = { wob: 0, edge: 1, sw: 0 };
  function drawCell(g, i, j, sx3, sy, now) { drawCell0(g, i, j, sx3, sy, now); if (S.stain[j * W + i] !== undefined) drawStain(g, i, j, sx3, sy); }
  function drawCell0(g, i, j, sx3, sy, now) {
    if (tiles[j * W + i] === T.X_thermalvent && now && !reduce && Math.random() < 0.5) parts.push({ x: i + 0.5 + (Math.random() - 0.5) * 2.4, y: j + 0.3, vx: (Math.random() - 0.5) * 0.6, vy: -7 - Math.random() * 5, life: 1.6, max: 1.6, c: Math.random() < 0.5 ? "#ffb04a" : "#ffe9b0", s: 2 });
    if (tiles[j * W + i] === T.X_sprinkler && now && !reduce && Math.random() < 0.08) parts.push({ x: i + 0.5 + (Math.random() - 0.5) * 0.4, y: j + 0.1, vx: (Math.random() - 0.5) * 5, vy: -2 - Math.random() * 2, life: 0.5, max: 0.5, c: "#bfeeff", s: 2 });
      var id = tiles[j * W + i], td = TILES[id], under = j >= col[i] && j > world.top[i];   // cave wall only below the natural ground line: air under a roof, eave or overhang you build stays open sky
      if (id === T.AIR) {
        if (walls[j * W + i]) { drawWall(g, walls[j * W + i], i, j, sx3, sy); return; }
        if (under) drawBackRock(g, i, j, sx3, sy);   // textured cave back wall (see BACKGROUND TEXTURES)
        return;
      }
      if (id === T.WATER) {
        var top = get(i, j - 1) !== T.WATER, dd = 0; if (!top) { dd = 1; while (dd < 6 && get(i, j - dd - 1) === T.WATER) dd++; }
        g.fillStyle = WST[dd] || (WST[dd] = "rgba(" + (52 - dd * 6) + "," + (170 - dd * 14) + "," + (178 - dd * 8) + "," + (0.62 + dd * 0.04) + ")"); g.fillRect(sx3, sy, ts, ts);
        if (top) { var wy = Math.round(CELL.wob * 1.5 + Math.sin(i * 0.9 + now / 400) * 1.2 + 2); g.fillStyle = "rgba(210,255,248,.7)"; g.fillRect(sx3, sy + wy, ts, 2); g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(sx3, sy, ts, wy); }
        else if (!reduce && ((i * 31 + j * 17 + (now / 380 | 0)) % 11) === 0) { g.fillStyle = "rgba(190,255,248,.22)"; g.fillRect(sx3 + ts * 0.2, sy + ts * 0.4, ts * 0.5, 2); }
        return;
      }
      if (id === T.LAVA) {
        g.drawImage(shadeC("lava"), sx3, sy);
        g.fillStyle = "#ffc24a"; g.fillRect(sx3 + ts * (0.1 + 0.12 * Math.sin(now / 420 + i)), sy + ts * 0.18, ts * 0.5, ts * 0.2); g.fillRect(sx3 + ts * (0.45 + 0.12 * Math.cos(now / 380 + j)), sy + ts * 0.58, ts * 0.4, ts * 0.18);
        g.fillStyle = "rgba(90,20,6,.5)"; g.fillRect(sx3 + ts * ((i * 37 % 7) / 9), sy + ts * 0.82, ts * 0.22, ts * 0.12);
        if (get(i, j - 1) !== T.LAVA) { g.fillStyle = "#ffe9a0"; g.fillRect(sx3, sy, ts, Math.max(2, CELL.edge)); if (!reduce && ((i * 13 + (now / 600 | 0)) % 9) === 0) { g.fillStyle = "#fff2b0"; g.fillRect(sx3 + ts * 0.4, sy - ts * 0.25 - ((now / 20) % 6), 3, 3); } }
        if (!lowq || !(i & 1)) glows.push([sx3 + ts / 2, sy + ts / 2, "255,110,30", 3.6, lowq ? 0.4 : 0.24]); return;
      }
      var v = ((Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0) & 3;
      if (!td.solid) {
        if (walls[j * W + i]) drawWall(g, walls[j * W + i], i, j, sx3, sy);
        else if (under) drawBackRock(g, i, j, sx3, sy);
        if (td.kind === "vine") { var vhalf = Math.round(ts / 2), vo = Math.round(Math.sin(now / 900 + i * 1.7) * ts * 0.08); smDraw(g, v, id, 0, 0, 16, 8, sx3, sy, ts, vhalf); smDraw(g, v, id, 0, 8, 16, 8, sx3 + vo, sy + vhalf, ts, ts - vhalf); }
        else if (td.kind === "reed" || td.kind === "bloom" || td.kind === "glowcap" || td.kind === "flower" || td.sway) { var half = Math.round(ts / 2), off = Math.round(CELL.sw * ts * 0.06 * (1 + (i % 3) * 0.3)); smDraw(g, v, id, 0, 8, 16, 8, sx3, sy + half, ts, ts - half); smDraw(g, v, id, 0, 0, 16, 8, sx3 + off, sy, ts, half); }
        else if (td.kind === "painting") g.drawImage(paintingCanvas(i, j), 0, 0, 16, 16, sx3, sy, ts, ts);
        else if (td.kind === "door" || td.kind === "ladder" || td.kind === "fence") matWood(g, td, i, j, sx3, sy);
        else if (SMOP[id]) g.drawImage(ATLAS, v * 16, id * 16, 16, 16, sx3, sy, ts, ts);
        else smDraw(g, v, id, 0, 0, 16, 16, sx3, sy, ts, ts);
      } else if (td.kind === "leaves") {
        var lo = function (a, b) { return !TILES[get(a, b)].solid; };
        var lmask = (lo(i, j - 1) ? 1 : 0) | (lo(i, j + 1) ? 2 : 0) | (lo(i - 1, j) ? 4 : 0) | (lo(i + 1, j) ? 8 : 0);
        lmask |= (!(lmask & 5) && lo(i - 1, j - 1) ? 16 : 0) | (!(lmask & 9) && lo(i + 1, j - 1) ? 32 : 0) | (!(lmask & 6) && lo(i - 1, j + 1) ? 64 : 0) | (!(lmask & 10) && lo(i + 1, j + 1) ? 128 : 0);   // inner corners get a rounded notch
        natLeaf(g, i, j, sx3, sy, lmask);
      } else {
        if (NATC[id]) { natTile(g, id, i, j, sx3, sy); return; }
        if (id === T.LOG) { natLog(g, i, j, sx3, sy); }
        else if (SMGEM[id]) { natTile(g, orePal(td), i, j, sx3, sy); smDraw(g, v, id, 0, 0, 16, 16, sx3, sy, ts, ts); }
        else if (td.kind === "door") matWood(g, td, i, j, sx3, sy);
        else if (MATF[id]) { if (MATF[id].f === "glass") { if (walls[j * W + i]) drawWall(g, walls[j * W + i], i, j, sx3, sy); else if (under) drawBackRock(g, i, j, sx3, sy); } matTile(g, id, i, j, sx3, sy); }   // ADVENTURE LOOK building blocks (glass shows what is behind it)
        else g.drawImage(ATLAS, v * 16, id * 16, 16, 16, sx3, sy, ts, ts);
        // exposed faces get a lit rim on top and a shadow on the sides and bottom, so caves and cliffs read clearly
        var nT = !TILES[get(i, j - 1)].solid || get(i, j - 1) === T.LEAVES, nB = !TILES[get(i, j + 1)].solid, nL = !TILES[get(i - 1, j)].solid, nR = !TILES[get(i + 1, j)].solid;
        if (td.kind === "door" || id === T.LOG || SMGEM[id] || (MATF[id] && MATF[id].f === "glass")) { /* the door art has its own frame and shading */ }
        else if (td.kind === "leaves") {
          if (nT) { g.fillStyle = "rgba(190,255,150,.22)"; g.fillRect(sx3, sy, ts, CELL.edge); }
          if (nB) { g.fillStyle = "rgba(0,20,5,.32)"; g.fillRect(sx3, sy + ts - CELL.edge * 1.5, ts, CELL.edge * 1.5); }
        } else {
          if (!MATF[id]) {   // (building blocks draw their own outline)
            if (nT && td.kind !== "moss" && td.kind !== "snow") { g.drawImage(shadeC("t30"), sx3, sy); }
            g.fillStyle = "rgba(0,0,0,.3)"; if (nB) g.fillRect(sx3, sy + ts - CELL.edge, ts, CELL.edge); if (nL) g.fillRect(sx3, sy, CELL.edge, ts); if (nR) g.fillRect(sx3 + ts - CELL.edge, sy, CELL.edge, ts);
          }
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
  function lightGrid(gx0, gy0, gw, gh, day, pcx, pcy) {
    var n = gw * gh, skyL = Math.round(day * 15), i, j;
    if (!LG || LG.length < n) { LG = new Uint8Array(n); OP = new Uint8Array(n); }
    for (j = 0; j < gh; j++) for (i = 0; i < gw; i++) {
      var X = gx0 + i, Y = gy0 + j, id = get(X, Y), L = TILES[id].light, c = j * gw + i;
      if (X >= 0 && X < W && Y < col[X] && skyL > L) L = skyL;
      LG[c] = L; OP[c] = TILES[id].solid && !(smask && X >= 0 && X < W && Y >= 0 && Y < H && smask[Y * W + X] && tiles[Y * W + X] === orig[Y * W + X]) ? 3 : 1;
    }
    var pi = pcx - gx0, pj = pcy - gy0; if (pi >= 0 && pi < gw && pj >= 0 && pj < gh) LG[pj * gw + pi] = Math.max(LG[pj * gw + pi], fx("night") ? 15 : hasCharm("glow") ? 15 : 10);
    if (fx("night")) for (var nj = Math.max(0, pj - 9); nj <= Math.min(gh - 1, pj + 9); nj++) for (var ni = Math.max(0, pi - 12); ni <= Math.min(gw - 1, pi + 12); ni++) { var nc = nj * gw + ni; if (LG[nc] < 8) LG[nc] = 8; }   // Night Eye: everything near you is dimly visible
    (world.structs || []).forEach(function (q) { var P = q.pic; if (!P || !P.lt.length || P.x0 > gx0 + gw || P.x0 + P.w < gx0 || P.y0 > gy0 + gh || P.y0 + P.h < gy0) return; P.lt.forEach(function (l) { var li = l[0] - gx0, lj = l[1] - gy0; if (li >= 0 && li < gw && lj >= 0 && lj < gh) LG[lj * gw + li] = Math.max(LG[lj * gw + li], l[2]); }); });   // building lamps
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
    if (!drawWallStain(g, wl, i, j, sx, sy)) { if (MATF[wl]) matWall(g, wl, i, j, sx, sy); else g.drawImage(ATLAS, v * 16, wl * 16, 16, 16, sx, sy, ts, ts); }
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
  // ===== ADVENTURE LOOK: building blocks =====
  // Planks, roofs, bricks, cobble, plaster, glass and the back walls are drawn as clean, flat-shaded shapes (like the Swamp Adventure art)
  // instead of 16x16 pixel tiles: long boards with thin seams and staggered joints, rounded roof shingles, tidy running-bond bricks, and
  // glass that joins into one big window with muntins between the panes. Patterns repeat every tile (or every few tiles, keyed by position),
  // so a wall reads as one surface. A dark outline is drawn only where the material meets something different.
  // Each look is painted once per (block, pattern variant, outline sides, tile size) into a small cached canvas and stamped, so it costs
  // the same per frame as the old pixel art. Wood stains reuse the same shapes with the stain's colours.
  var MATF = {}, MATC = { ts: 0 };
  function defMat(name, fam, pal, o) { var id = T[name]; if (id === undefined) return; MATF[id] = Object.assign({ f: fam, p: pal }, o || {}); }
  // palettes: l light, b base, d dark, g seam / gap / mortar, o outline
  defMat("PLANKS", "boards", { l: "#dca36a", b: "#c58a52", d: "#a46c3c", g: "#5a3418", o: "#2c180a" });
  defMat("THATCH", "thatch", { l: "#ecd28c", b: "#d5b064", d: "#b38a44", g: "#6e5226", o: "#33240e" });
  defMat("X_shinglered", "shingle", { l: "#ea7a5a", b: "#cc5236", d: "#a63a26", g: "#5c1a12", o: "#2e0c08" });
  defMat("X_shingleblue", "shingle", { l: "#86a8d0", b: "#5a7ca6", d: "#42618a", g: "#1f2f48", o: "#0e1626" });
  defMat("BRICK", "brick", { l: "#b4bcc2", b: "#98a1a8", d: "#7d868d", g: "#4c5459", o: "#22282c" }, { rows: 2, bw: 1 });
  defMat("X_redbrick", "brick", { l: "#d97a5e", b: "#bd5a40", d: "#9a422e", g: "#5a2a20", o: "#2a120c" }, { rows: 4, bw: 0.5 });
  defMat("BASALTBRICK", "brick", { l: "#6a5a6a", b: "#524452", d: "#3e323e", g: "#1a141a", o: "#0c080c" }, { rows: 2, bw: 1, ember: 1 });
  defMat("ICEBRICK", "brick", { l: "#d4f2fc", b: "#a8dcf0", d: "#86c2dc", g: "#4f86a2", o: "#1f4458" }, { rows: 2, bw: 1, shine: 1 });
  defMat("X_mossbrick", "brick", { l: "#a9b1a6", b: "#8a9488", d: "#6e786c", g: "#3c4438", o: "#1a2018" }, { rows: 2, bw: 1, moss: 1 });
  defMat("X_obsidianbrick", "brick", { l: "#6a50a0", b: "#4c3a78", d: "#382a5a", g: "#140c22", o: "#08040e" }, { rows: 2, bw: 1, shine: 1 });
  defMat("X_permabrick", "brick", { l: "#b4cede", b: "#90aec2", d: "#7494aa", g: "#3e5a6e", o: "#1a2a36" }, { rows: 2, bw: 1 });
  defMat("X_moonbrick", "brick", { l: "#e4e8fb", b: "#bcc4e6", d: "#9aa4cc", g: "#5c6690", o: "#262c48" }, { rows: 2, bw: 1, shine: 1 });
  defMat("X_cobble", "cobble", { l: "#b0b6ba", b: "#929a9e", d: "#737b80", g: "#3e4548", o: "#1c2124" });
  defMat("X_plasterblock", "smooth", { l: "#f4ead0", b: "#e6d7b2", d: "#d2c196", g: "#b8a678", o: "#4a3f2a" });
  defMat("X_quartzblock", "panel", { l: "#ffffff", b: "#eef2f5", d: "#cdd6dd", g: "#aab6c0", o: "#4a5660" });
  defMat("X_amberblock", "panel", { l: "#ffe08a", b: "#f2a83a", d: "#c97a1a", g: "#8a4e0a", o: "#3a2006" }, { glow: 1 });
  defMat("X_ironblock", "panel", { l: "#d6dce3", b: "#a8b0ba", d: "#7e8792", g: "#545c66", o: "#22272e" }, { rivets: 1 });
  defMat("X_amethystblock", "panel", { l: "#e2c2ff", b: "#a874e0", d: "#7c4cb8", g: "#4a2a78", o: "#1e0e34" }, { facets: 1 });
  defMat("X_checker", "checker", { l: "#f2eee2", b: "#e2ddcc", d: "#33343c", g: "#22232a", o: "#101116" });
  defMat("GLASS", "glass", { l: "#d8fff4", b: "rgba(110,226,196,.42)", d: "#3fae92", g: "#5a3a22", o: "#24160c" });
  defMat("X_stainedred", "glass", { l: "#ffd0c8", b: "rgba(226,70,56,.5)", d: "#a82a20", g: "#3a2a2a", o: "#1a1010" });
  defMat("X_stainedblue", "glass", { l: "#d0e4ff", b: "rgba(64,132,226,.5)", d: "#2a5aa8", g: "#2a2e3a", o: "#10141c" });
  defMat("X_stainedgreen", "glass", { l: "#d2f6da", b: "rgba(64,176,84,.5)", d: "#2a7a3a", g: "#2a3a2a", o: "#101a10" });
  // back walls (drawn darker behind everything by drawWall)
  defMat("W_PLANK", "vboards", { l: "#b88452", b: "#9c6a3e", d: "#80542e", g: "#3e2410", o: "#22140a" });
  defMat("W_LOG", "logs", { l: "#9a6e4c", b: "#7a5236", d: "#5a3a24", g: "#2a1a10", o: "#160c06" });
  defMat("W_BRICK", "brick", { l: "#98a1a8", b: "#7d868d", d: "#666e74", g: "#3c4246", o: "#1c2022" }, { rows: 2, bw: 1 });
  defMat("W_PLASTER", "smooth", { l: "#efe2c2", b: "#ddcca4", d: "#c8b68a", g: "#a8966c", o: "#4a3f2a" });
  defMat("W_MOSS", "mosswall", { l: "#6a8a44", b: "#4a6232", d: "#344826", g: "#222e18", o: "#10160a" });
  defMat("W_TIMBER", "timber", { l: "#efe2c2", b: "#ddcca4", d: "#c8b68a", g: "#5a3a1e", o: "#2a1a0c" });
  defMat("W_redbrick", "brick", { l: "#b4604a", b: "#9a4a36", d: "#7e3828", g: "#4a221a", o: "#22100a" }, { rows: 4, bw: 0.5 });
  defMat("W_quartz", "smooth", { l: "#f6f8fa", b: "#e2e8ec", d: "#cad3da", g: "#aab6c0", o: "#4a5660" });
  defMat("W_obsidian", "brick", { l: "#5a4488", b: "#3e2e62", d: "#2c2046", g: "#120a1e", o: "#08040e" }, { rows: 2, bw: 1 });
  defMat("W_frost", "brick", { l: "#c4e2f2", b: "#9cc4d8", d: "#7ea6bc", g: "#4a7088", o: "#1f3646" }, { rows: 2, bw: 1 });
  defMat("W_amber", "smooth", { l: "#f6b84a", b: "#dc9028", d: "#b8701a", g: "#7a4610", o: "#3a2006" });
  defMat("W_stripe", "stripes", { l: "#e8dfb8", b: "#d8cfa6", d: "#4aa85a", g: "#3a8a4a", o: "#2a2416" });
  defMat("W_floral", "floral", { l: "#ffd2e8", b: "#d6e6c6", d: "#ff7ab8", g: "#7ab86a", o: "#2a3424" });
  defMat("W_panel", "vboards", { l: "#6e4628", b: "#583620", d: "#462a18", g: "#22140a", o: "#140a04" });
  defMat("W_cobble", "cobble", { l: "#7c8488", b: "#646c70", d: "#50575a", g: "#2c3234", o: "#16191a" });
  function matVar(F, i, j) {   // which repeat of the pattern this cell shows
    switch (F.f) {
      case "boards": return ((i % 3) + 3 + 2 * (j % 3)) % 3;
      case "vboards": return ((j % 3) + 3 + 2 * (i % 3)) % 3;
      case "glass": return ((i - j) % 4 + 4) % 4;
      case "timber": return (i & 1) | ((j & 1) << 1);
      default: return (i & 1) | ((j & 1) << 1);
    }
  }
  function mhash(a, b, c) { return SW.hash(a, b, c + 911); }
  function mrr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
  function mvgrad(g, y0, y1, a, b, c) { var gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, a); gr.addColorStop(c ? 0.5 : 1, b); if (c) gr.addColorStop(1, c); return gr; }
  function mhgrad(g, x0, x1, a, b, c) { var gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, a); gr.addColorStop(c ? 0.5 : 1, b); if (c) gr.addColorStop(1, c); return gr; }
  function paintMat(F, P, v, mask, S) {   // mask: 1 top, 2 bottom, 4 left, 8 right = sides that meet a different block (outline there)
    var cv = document.createElement("canvas"); cv.width = cv.height = S; var g = cv.getContext("2d"), k, c, x, y, h, w;
    var ln = Math.max(1, Math.round(S / 20)), R = function (n) { return Math.round(n); };
    switch (F.f) {
      case "boards": case "vboards": {
        var vert = F.f === "vboards";
        if (vert) { g.save(); g.translate(S, 0); g.rotate(Math.PI / 2); }   // vertical boards: the same drawing turned on its side
        for (k = 0; k < 2; k++) {
          var y0 = R(k * S / 2), y1 = R((k + 1) * S / 2);
          g.fillStyle = mvgrad(g, y0, y1, P.l, P.b, P.d); g.fillRect(0, y0, S, y1 - y0);
          g.fillStyle = "rgba(255,255,255,.16)"; g.fillRect(0, y0, S, Math.max(1, R(S / 26)));
          g.fillStyle = "rgba(70,36,14,.18)"; g.fillRect(0, R(y0 + (y1 - y0) * (k ? 0.36 : 0.62)), S, 1); g.fillRect(0, R(y0 + (y1 - y0) * (k ? 0.74 : 0.3)), S, 1);
          g.fillStyle = P.g; g.fillRect(0, y1 - ln, S, ln);
          if ((v + k) % 3 === 0) {   // a joint where one board ends and the next begins, with a nail either side
            g.fillStyle = P.g; g.fillRect(0, y0, ln, y1 - y0); g.fillStyle = "rgba(255,255,255,.14)"; g.fillRect(ln, y0, 1, y1 - y0 - ln);
            g.fillStyle = P.g; g.beginPath(); g.arc(ln + S * 0.07, (y0 + y1 - ln) / 2, Math.max(1, S / 34), 0, 6.2832); g.fill();
          }
          if ((v + 1 + k) % 3 === 0) { g.fillStyle = P.g; g.beginPath(); g.arc(S - S * 0.07, (y0 + y1 - ln) / 2, Math.max(1, S / 34), 0, 6.2832); g.fill(); }
        }
        if (vert) g.restore();
        break;
      }
      case "logs": {   // stacked round logs, two per tile
        g.fillStyle = P.g; g.fillRect(0, 0, S, S);
        for (k = 0; k < 2; k++) { var ly = R(k * S / 2) + 1, lh = R(S / 2) - 2; g.fillStyle = mvgrad(g, ly, ly + lh, P.d, P.l, P.d); mrr(g, -2, ly, S + 4, lh, lh / 2.2); g.fill(); g.fillStyle = "rgba(0,0,0,.14)"; g.fillRect(0, R(ly + lh * 0.62), S, 1); }
        break;
      }
      case "shingle": {   // rounded roof shingles, two rows per tile, every other row shifted half a shingle
        g.fillStyle = P.g; g.fillRect(0, 0, S, S); var gp = Math.max(1, R(S / 28));
        for (k = 0; k < 2; k++) {
          var sy = R(k * S / 2), sh = R(S / 2), off = k ? S / 4 : 0;
          for (c = -1; c < 3; c++) {
            x = c * S / 2 + off; var tone = (mhash(c + (v & 1) * 2, k, 1) - 0.5) * 0.12;
            g.save(); g.globalAlpha = 1; mrr(g, R(x + gp / 2), sy, R(S / 2 - gp), sh - gp, [0, 0, S * 0.12, S * 0.12]); g.clip();
            g.fillStyle = mvgrad(g, sy, sy + sh, P.d, P.b, P.l); g.fillRect(x, sy, S / 2, sh);
            if (tone) { g.fillStyle = tone > 0 ? "rgba(255,255,255," + tone + ")" : "rgba(0,0,0," + (-tone) + ")"; g.fillRect(x, sy, S / 2, sh); }
            g.fillStyle = "rgba(0,0,0,.22)"; g.fillRect(x, sy, S / 2, Math.max(1, R(sh * 0.16)));   // shadow from the row above
            g.fillStyle = "rgba(255,255,255,.22)"; g.fillRect(x, sy + sh - gp - Math.max(1, R(S / 24)), S / 2, Math.max(1, R(S / 24)));   // lit lower rim
            g.restore();
          }
        }
        break;
      }
      case "thatch": {   // straw bundles in rows, strands showing
        g.fillStyle = P.g; g.fillRect(0, 0, S, S);
        for (k = 0; k < 2; k++) {
          var ty = R(k * S / 2), th = R(S / 2), toff = k ? S / 6 : 0;
          for (c = -1; c < 4; c++) {
            x = c * S / 3 + toff; g.save(); mrr(g, R(x) + 1, ty, R(S / 3) - 1, th, [0, 0, S * 0.14, S * 0.14]); g.clip();
            g.fillStyle = mvgrad(g, ty, ty + th, P.d, P.b, P.l); g.fillRect(x, ty, S / 3, th);
            g.fillStyle = "rgba(110,80,30,.32)"; for (var st = 1; st < 4; st++) g.fillRect(R(x + st * S / 12), ty + R(th * 0.18), 1, R(th * 0.7));
            g.fillStyle = "rgba(255,250,210,.28)"; g.fillRect(R(x + S / 24), ty + R(th * 0.25), 1, R(th * 0.55));
            g.fillStyle = "rgba(0,0,0,.2)"; g.fillRect(x, ty, S / 3, Math.max(1, R(th * 0.14)));
            g.restore();
          }
        }
        break;
      }
      case "brick": {   // running bond with even mortar lines
        var rows = F.rows || 2, bw = F.bw || 1, m = Math.max(1, R(S / 22)); g.fillStyle = P.g; g.fillRect(0, 0, S, S);
        for (k = 0; k < rows; k++) {
          var by = R(k * S / rows), bh = R((k + 1) * S / rows) - by, Rg = ((v >> 1) & 1) * rows + k, boff = (Rg & 1) ? bw / 2 : 0;
          for (c = -1; c * bw < 1 + bw; c++) {
            x = (c * bw + boff) * S; if (x >= S || x + bw * S <= 0) continue;
            var bi = (((v & 1) * Math.round(1 / bw) + c) % 4 + 4) % 4, btone = (mhash(bi, Rg & 3, 3) - 0.5) * 0.14;
            mrr(g, R(x + m / 2), by + Math.ceil(m / 2), R(bw * S - m), bh - m, Math.max(1, S * 0.05));
            g.fillStyle = mvgrad(g, by, by + bh, P.l, P.b, P.d); g.fill();
            if (btone) { g.fillStyle = btone > 0 ? "rgba(255,255,255," + btone + ")" : "rgba(0,0,0," + (-btone) + ")"; g.fill(); }
            g.fillStyle = "rgba(255,255,255,.2)"; g.fillRect(R(x + m), by + Math.ceil(m / 2), R(bw * S - m * 2), 1);
            if (F.ember && mhash(bi, Rg & 3, 9) > 0.7) { g.fillStyle = "rgba(255,138,61,.75)"; g.fillRect(R(x + bw * S * 0.3), by + bh - m - 1, R(bw * S * 0.4), 1); }
            if (F.shine && mhash(bi, Rg & 3, 11) > 0.5) { g.fillStyle = "rgba(255,255,255,.28)"; g.fillRect(R(x + bw * S * 0.15), by + R(bh * 0.3), Math.max(1, R(S / 18)), Math.max(1, R(S / 18))); }
          }
        }
        if (F.moss) {   // soft moss clumps creeping over the top edges
          for (k = 0; k < 3; k++) { var mx = S * (0.15 + mhash(v, k, 13) * 0.7), my = S * (k < 2 ? 0.02 : 0.5), mr = S * (0.12 + mhash(v, k, 14) * 0.08); g.fillStyle = "#4f8a3a"; g.beginPath(); g.ellipse(mx, my + mr * 0.3, mr * 1.3, mr * 0.7, 0, 0, 6.2832); g.fill(); g.fillStyle = "#6fae4a"; g.beginPath(); g.ellipse(mx - mr * 0.2, my + mr * 0.1, mr * 0.8, mr * 0.4, 0, 0, 6.2832); g.fill(); }
        }
        break;
      }
      case "cobble": {   // rounded stones set in dark mortar
        g.fillStyle = P.g; g.fillRect(0, 0, S, S);
        var LAY = [[[0.04, 0.04, 0.5, 0.44], [0.58, 0.04, 0.38, 0.3], [0.04, 0.52, 0.32, 0.44], [0.4, 0.52, 0.56, 0.2], [0.58, 0.38, 0.38, 0.12], [0.4, 0.76, 0.56, 0.2]], [[0.04, 0.04, 0.34, 0.36], [0.42, 0.04, 0.54, 0.4], [0.04, 0.44, 0.56, 0.52], [0.64, 0.48, 0.32, 0.48]]][v & 1];
        LAY.forEach(function (q, n) { var qx = R(q[0] * S), qy = R(q[1] * S), qw = R(q[2] * S), qh = R(q[3] * S); mrr(g, qx, qy, qw, qh, Math.min(qw, qh) * 0.38); g.fillStyle = mvgrad(g, qy, qy + qh, P.l, P.b, P.d); g.fill(); if (mhash(v, n, 5) > 0.5) { g.fillStyle = "rgba(0,0,0,.08)"; g.fill(); } g.fillStyle = "rgba(255,255,255,.22)"; g.fillRect(qx + R(qw * 0.22), qy + 1, R(qw * 0.4), 1); });
        break;
      }
      case "smooth": case "mosswall": {
        g.fillStyle = mvgrad(g, 0, S, P.l, P.b); g.fillRect(0, 0, S, S);
        if (F.f === "mosswall") { for (k = 0; k < 4; k++) { g.fillStyle = k & 1 ? P.d : P.l; g.globalAlpha = 0.45; g.beginPath(); g.ellipse(S * mhash(v, k, 21), S * mhash(v, k, 22), S * (0.12 + mhash(v, k, 23) * 0.12), S * (0.08 + mhash(v, k, 24) * 0.08), 0, 0, 6.2832); g.fill(); } g.globalAlpha = 1; }
        break;
      }
      case "panel": {   // a bevelled block, one per tile
        g.fillStyle = P.g; g.fillRect(0, 0, S, S); var pi = Math.max(1, R(S / 16));
        mrr(g, pi, pi, S - pi * 2, S - pi * 2, S * 0.08); g.fillStyle = mvgrad(g, pi, S - pi, P.l, P.b, P.d); g.fill();
        mrr(g, R(S * 0.2), R(S * 0.2), R(S * 0.6), R(S * 0.6), S * 0.06); g.fillStyle = "rgba(255,255,255,.12)"; g.fill();
        g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(pi * 2, pi, S - pi * 4, Math.max(1, R(S / 22)));
        if (F.rivets) { g.fillStyle = P.d; [[0.18, 0.18], [0.82, 0.18], [0.18, 0.82], [0.82, 0.82]].forEach(function (q) { g.beginPath(); g.arc(S * q[0], S * q[1], Math.max(1.2, S / 22), 0, 6.2832); g.fill(); }); g.fillStyle = "rgba(255,255,255,.55)"; [[0.17, 0.17], [0.81, 0.17], [0.17, 0.81], [0.81, 0.81]].forEach(function (q) { g.fillRect(R(S * q[0]), R(S * q[1]), 1, 1); }); }
        if (F.glow) { var rg2 = g.createRadialGradient(S * 0.4, S * 0.38, 0, S * 0.4, S * 0.38, S * 0.45); rg2.addColorStop(0, "rgba(255,248,210,.6)"); rg2.addColorStop(1, "rgba(255,248,210,0)"); g.fillStyle = rg2; g.fillRect(0, 0, S, S); }
        if (F.facets) { g.fillStyle = "rgba(255,255,255,.22)"; g.beginPath(); g.moveTo(S * 0.2, S * 0.2); g.lineTo(S * 0.8, S * 0.2); g.lineTo(S * 0.5, S * 0.5); g.fill(); g.fillStyle = "rgba(0,0,0,.14)"; g.beginPath(); g.moveTo(S * 0.2, S * 0.8); g.lineTo(S * 0.8, S * 0.8); g.lineTo(S * 0.5, S * 0.5); g.fill(); }
        break;
      }
      case "lamp": {   // a dark frame with a glowing core
        g.fillStyle = mvgrad(g, 0, S, P.d, P.g); g.fillRect(0, 0, S, S); var li = R(S * 0.18);
        mrr(g, li, li, S - li * 2, S - li * 2, S * 0.1); var rg3 = g.createRadialGradient(S * 0.5, S * 0.45, 0, S * 0.5, S * 0.5, S * 0.42); rg3.addColorStop(0, P.l); rg3.addColorStop(0.55, P.b); rg3.addColorStop(1, P.d); g.fillStyle = rg3; g.fill();
        g.fillStyle = "rgba(255,255,255,.6)"; g.fillRect(li + R(S * 0.08), li + R(S * 0.06), R(S * 0.16), Math.max(1, R(S / 22)));
        g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(0, 0, S, Math.max(1, R(S / 22)));
        break;
      }
      case "checker": {
        for (k = 0; k < 4; k++) { var qx2 = (k & 1) * S / 2, qy2 = (k >> 1) * S / 2, dark = ((k & 1) ^ (k >> 1)) === 1; g.fillStyle = dark ? mvgrad(g, qy2, qy2 + S / 2, "#44454e", P.d) : mvgrad(g, qy2, qy2 + S / 2, P.l, P.b); g.fillRect(R(qx2), R(qy2), Math.ceil(S / 2), Math.ceil(S / 2)); }
        g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(0, 0, S, 1); g.fillRect(0, R(S / 2), S, 1);
        break;
      }
      case "stripes": { g.fillStyle = P.b; g.fillRect(0, 0, S, S); g.fillStyle = P.d; g.fillRect(R(S * 0.12), 0, R(S * 0.1), S); g.fillRect(R(S * 0.62), 0, R(S * 0.1), S); g.fillStyle = P.l; g.fillRect(R(S * 0.36), 0, R(S * 0.06), S); g.fillRect(R(S * 0.86), 0, R(S * 0.06), S); break; }
      case "floral": {
        g.fillStyle = P.b; g.fillRect(0, 0, S, S);
        [[0.25, 0.25], [0.75, 0.75]].forEach(function (q, n) { var fx = S * q[0], fy = S * q[1], fr = S * 0.07; g.fillStyle = P.g; g.fillRect(R(fx - 1), R(fy), 1, R(S * 0.16)); g.fillStyle = n ? P.d : P.l; for (var pt = 0; pt < 5; pt++) { var a = pt * 1.2566; g.beginPath(); g.arc(fx + Math.cos(a) * fr, fy + Math.sin(a) * fr, fr * 0.75, 0, 6.2832); g.fill(); } g.fillStyle = "#ffe27a"; g.beginPath(); g.arc(fx, fy, fr * 0.6, 0, 6.2832); g.fill(); });
        break;
      }
      case "timber": {   // plaster between dark beams, with a brace across some panels (Tudor style)
        g.fillStyle = mvgrad(g, 0, S, P.l, P.b); g.fillRect(0, 0, S, S); var bmw = Math.max(2, R(S * 0.14));
        g.fillStyle = P.g; if (!(v & 1)) g.fillRect(0, 0, bmw, S); if (!(v & 2)) g.fillRect(0, 0, S, bmw);
        if (v === 3) { g.save(); g.strokeStyle = P.g; g.lineWidth = bmw; g.beginPath(); g.moveTo(-1, S + 1); g.lineTo(S + 1, -1); g.stroke(); g.restore(); }
        g.fillStyle = "rgba(255,255,255,.12)"; if (!(v & 1)) g.fillRect(bmw - 1, 0, 1, S);
        break;
      }
      case "glass": {   // a clear pane: the back wall or sky shows through
        g.fillStyle = P.b; g.fillRect(0, 0, S, S);
        g.save(); g.beginPath(); g.rect(0, 0, S, S); g.clip(); g.fillStyle = "rgba(255,255,255,.2)";
        [0.3, 0.62].forEach(function (b0, n) { for (var q = -2; q <= 2; q++) { var U = (b0 + 4 * q - v) * S, bwid = S * (n ? 0.12 : 0.22); if (U > S * 1.4 || U + bwid < -S * 1.4) continue; g.beginPath(); g.moveTo(U, 0); g.lineTo(U + bwid, 0); g.lineTo(U + bwid - S, S); g.lineTo(U - S, S); g.fill(); } });
        g.restore();
        var mu = Math.max(1, R(S / 26)); g.fillStyle = P.g;   // muntins between panes
        if (!(mask & 1)) g.fillRect(0, 0, S, mu); if (!(mask & 2)) g.fillRect(0, S - mu, S, mu); if (!(mask & 4)) g.fillRect(0, 0, mu, S); if (!(mask & 8)) g.fillRect(S - mu, 0, mu, S);
        var fr2 = Math.max(2, R(S * 0.1));   // a wooden frame where the window ends
        g.fillStyle = mvgrad(g, 0, S, "#8a5a32", "#6e431f");
        if (mask & 1) g.fillRect(0, 0, S, fr2); if (mask & 2) g.fillRect(0, S - fr2, S, fr2); if (mask & 4) g.fillRect(0, 0, fr2, S); if (mask & 8) g.fillRect(S - fr2, 0, fr2, S);
        g.fillStyle = "rgba(255,255,255,.35)"; if (mask & 1) g.fillRect(mask & 4 ? fr2 : 0, fr2, S, 1); if (mask & 4) g.fillRect(fr2, mask & 1 ? fr2 : 0, 1, S);
        break;
      }
    }
    // outline where this material meets something else (Adventure-style crisp edge)
    if (F.f !== "glass") {
      var ow = Math.max(1, R(S / 16)); g.fillStyle = P.o;
      if (mask & 1) g.fillRect(0, 0, S, ow); if (mask & 2) g.fillRect(0, S - ow, S, ow); if (mask & 4) g.fillRect(0, 0, ow, S); if (mask & 8) g.fillRect(S - ow, 0, ow, S);
      if (mask & 1) { g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(mask & 4 ? ow : 0, ow, S, Math.max(1, R(S / 22))); }
    } else {
      var ow2 = Math.max(1, R(S / 18)); g.fillStyle = P.o;
      if (mask & 1) g.fillRect(0, 0, S, ow2); if (mask & 2) g.fillRect(0, S - ow2, S, ow2); if (mask & 4) g.fillRect(0, 0, ow2, S); if (mask & 8) g.fillRect(S - ow2, 0, ow2, S);
    }
    return cv;
  }
  function matCanvas(id, v, mask, si) {   // si: a wood stain index (its colours replace the material's) or undefined
    if (MATC.ts !== ts) MATC = { ts: ts };
    var key = id * 4096 + v * 64 + mask + (si === undefined ? 0 : (si + 1) * 1e7), c = MATC[key]; if (c) return c;
    var F = MATF[id], P = F.p;
    if (si !== undefined && STAINS[si]) { var sp = STAINS[si].p; P = { l: sp[2], b: sp[1], d: mixHex(sp[1], sp[0], 0.5), g: sp[0], o: mixHex(sp[0], "#000000", 0.55) }; }
    return (MATC[key] = paintMat(F, P, v, mask, ts));
  }
  function mixHex(a, b, k) { var A = hexRgb(a), B = hexRgb(b); return "rgb(" + Math.round(A[0] + (B[0] - A[0]) * k) + "," + Math.round(A[1] + (B[1] - A[1]) * k) + "," + Math.round(A[2] + (B[2] - A[2]) * k) + ")"; }
  function matMask(id, i, j, isWall) {   // sides where the neighbour is a different block (or, for walls, a different wall)
    var F = MATF[id], same = isWall ? function (a, b) { return walls[b * W + a] === id || (a < 0 || a >= W); } : function (a, b) { var n = get(a, b); return n === id || (F.f === "glass" && MATF[n] && MATF[n].f === "glass"); };
    return (same(i, j - 1) ? 0 : 1) | (same(i, j + 1) ? 0 : 2) | (same(i - 1, j) ? 0 : 4) | (same(i + 1, j) ? 0 : 8);
  }
  // lamp blocks: a dark frame around a glowing core
  defMat("CINDERLAMP", "lamp", { l: "#ffd28a", b: "#ff8a3d", d: "#3b3036", g: "#2a2228", o: "#120c10" });
  defMat("CRYSTALLAMP", "lamp", { l: "#ffffff", b: "#bff4ff", d: "#5d7c93", g: "#3e5668", o: "#16222c" });
  defMat("X_rubylamp", "lamp", { l: "#ffd0d6", b: "#ff5a6a", d: "#3b3036", g: "#2a2228", o: "#120c10" });
  defMat("X_sapphirelamp", "lamp", { l: "#e0ecff", b: "#7fa8ff", d: "#5d7c93", g: "#3e5668", o: "#16222c" });
  // ---- doors, ladders and fences in the same clean wood ----
  var WOOD = { l: "#d79c62", b: "#b9793f", d: "#8a5328", g: "#4a2a14", o: "#24130a" }, WDC = { ts: 0 };
  function woodPal(si) { if (si === undefined || !STAINS[si]) return WOOD; var sp = STAINS[si].p; return { l: sp[2], b: sp[1], d: mixHex(sp[1], sp[0], 0.5), g: sp[0], o: mixHex(sp[0], "#000000", 0.55) }; }
  function woodCanvas(kind, mask, si, top) {   // kind: "dc" closed door, "do" open door, "lad" ladder, "fen" fence
    if (WDC.ts !== ts) WDC = { ts: ts };
    var key = kind + mask + (top ? "t" : "b") + (si === undefined ? "" : "s" + si); if (WDC[key]) return WDC[key];
    var S = ts, cv = document.createElement("canvas"); cv.width = cv.height = S; var g = cv.getContext("2d"), P = woodPal(si), R = Math.round, ow = Math.max(1, R(S / 16)), k;
    var bar = function (x, y, w, h, r, vert) { mrr(g, R(x) - ow, R(y) - ow, R(w) + ow * 2, R(h) + ow * 2, r + ow); g.fillStyle = P.o; g.fill(); mrr(g, R(x), R(y), R(w), R(h), r); g.fillStyle = vert ? mhgrad(g, x, x + w, P.l, P.b, P.d) : mvgrad(g, y, y + h, P.l, P.b, P.d); g.fill(); };
    var iron = function (x, y, w, h) { g.fillStyle = "#2c2c34"; g.fillRect(R(x), R(y), R(w), R(h)); g.fillStyle = "rgba(255,255,255,.3)"; g.fillRect(R(x), R(y), R(w), 1); };
    if (kind === "do") {   // the door swung open to face you: boards in a frame, a round window up top, iron straps and a ring handle
      g.fillStyle = P.o; g.fillRect(0, 0, S, S);
      for (k = 0; k < 3; k++) { var bx = R(S * (0.1 + k * 0.27)), bw2 = R(S * 0.27); g.fillStyle = mhgrad(g, bx, bx + bw2, P.l, P.b, P.d); g.fillRect(bx, top ? R(S * 0.08) : 0, bw2 - Math.max(1, R(S / 28)), S - (top ? R(S * 0.08) : 0)); }
      iron(S * 0.1, top ? S * 0.74 : S * 0.2, S * 0.62, Math.max(2, S * 0.08)); if (!top) iron(S * 0.1, S * 0.72, S * 0.62, Math.max(2, S * 0.08));
      if (top) { var cx = S * 0.5, cy = S * 0.42, r = S * 0.22; g.fillStyle = P.o; g.beginPath(); g.arc(cx, cy, r + ow * 1.5, 0, 6.2832); g.fill(); g.fillStyle = "#3fae92"; g.beginPath(); g.arc(cx, cy, r, 0, 6.2832); g.fill(); g.fillStyle = "rgba(216,255,244,.55)"; g.beginPath(); g.arc(cx - r * 0.3, cy - r * 0.3, r * 0.35, 0, 6.2832); g.fill(); g.fillStyle = P.o; g.fillRect(R(cx - ow / 2), R(cy - r), ow, R(r * 2)); g.fillRect(R(cx - r), R(cy - ow / 2), R(r * 2), ow); }
      else { g.strokeStyle = "#f2c14e"; g.lineWidth = Math.max(1.5, S / 16); g.beginPath(); g.arc(S * 0.74, S * 0.42, S * 0.08, 0, 6.2832); g.stroke(); }
      g.fillStyle = "rgba(255,255,255,.14)"; g.fillRect(R(S * 0.1), 0, 1, S);
    } else if (kind === "dc") {   // closed: the door seen edge-on, a thick board standing in the doorway
      bar(S * 0.36, top ? S * 0.04 : 0, S * 0.28, top ? S * 0.96 : S, top ? [S * 0.06, S * 0.06, 0, 0] : 0, true);
      iron(S * 0.36, top ? S * 0.22 : S * 0.66, S * 0.28, Math.max(2, S * 0.1));
    } else if (kind === "lad") {   // two rails, two rungs lashed with rope
      for (k = 0; k < 2; k++) bar(S * (0.22 + k * 0.46), S * (0.15 + k * 0.5), S * 0.56, S * 0.1, S * 0.04, false);
      bar(S * 0.12, -ow * 2, S * 0.13, S + ow * 4, 0, true); bar(S * 0.75, -ow * 2, S * 0.13, S + ow * 4, 0, true);
      g.fillStyle = "#d8c08a"; [[0.12, 0.17], [0.75, 0.17], [0.12, 0.67], [0.75, 0.67]].forEach(function (q) { g.fillRect(R(S * q[0]), R(S * q[1]), R(S * 0.13), Math.max(1, R(S / 22))); g.fillRect(R(S * q[0]), R(S * q[1] + S * 0.05), R(S * 0.13), Math.max(1, R(S / 22))); });
    } else if (kind === "fen") {   // a post with rails out to whichever side has a neighbour
      var L = mask & 4, Rt = mask & 8;
      [0.36, 0.66].forEach(function (yy) { var x0 = L ? 0 : S * 0.42, x1 = Rt ? S : S * 0.58; if (x1 > x0) bar(x0, S * yy, x1 - x0, S * 0.1, 0, false); });
      bar(S * 0.4, S * 0.16, S * 0.2, S * 0.84 + ow, [S * 0.1, S * 0.1, 0, 0], true);
    }
    return (WDC[key] = cv);
  }
  function matWood(g, td, i, j, sx, sy, si) {   // returns true if this cell was a door / ladder / fence and has been drawn
    var k = td.kind;
    if (k === "door") { g.drawImage(woodCanvas(td.door.open ? "do" : "dc", 0, si, td.door.top), sx, sy); return true; }
    if (k === "ladder") { g.drawImage(woodCanvas("lad", 0, si), sx, sy); return true; }
    if (k === "fence") { var lf = get(i - 1, j), rf = get(i + 1, j), m = ((TILES[lf].kind === "fence" || TILES[lf].solid) ? 4 : 0) | ((TILES[rf].kind === "fence" || TILES[rf].solid) ? 8 : 0); g.drawImage(woodCanvas("fen", m, si), sx, sy); return true; }
    return false;
  }
  function matIcon(t) {   // a 28px picture of a building block for the hotbar and backpack
    var F = MATF[t], c = document.createElement("canvas"); c.width = c.height = 28; var g = c.getContext("2d");
    g.drawImage(paintMat(F, F.p, 0, 15, 28), 0, 0); return c;
  }
  function matTile(g, id, i, j, sx, sy, si) { g.drawImage(matCanvas(id, matVar(MATF[id], i, j), matMask(id, i, j, false), si), sx, sy); }
  function matWall(g, wl, i, j, sx, sy, si) { g.drawImage(matCanvas(wl, matVar(MATF[wl], i, j), matMask(wl, i, j, true), si), sx, sy); }
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
    if (bw[1] > 0.2 && above > 0.05) drawVolcanoes(g, HZ, sk, day, bw[1] * above, now);   // Ember Bog: smoking volcanoes on the horizon
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
      if (L2 === 1 && bw[2] > 0.25) drawPines(g, cc, par, base, bw[2] * above, now);   // Frostfen pine forests
      if (L2 >= 1 && bw[1] > 0.25) drawSnags(g, cc, par, base + (L2 === 2 ? 1 : 0), bw[1] * above * (L2 === 2 ? 0.9 : 0.6));   // Ember Bog dead trees
    }
    var hz = oy + (HZ - 1) * ts, fg = g.createLinearGradient(0, hz - ts * 7, 0, hz + ts * 1.5), fc = sk[1];
    fg.addColorStop(0, "rgba(" + (fc[0] | 0) + "," + (fc[1] | 0) + "," + (fc[2] | 0) + ",0)"); fg.addColorStop(1, "rgba(" + (fc[0] | 0) + "," + (fc[1] | 0) + "," + (fc[2] | 0) + "," + (0.4 * above) + ")");
    g.fillStyle = fg; g.fillRect(0, hz - ts * 7, vw, ts * 8.5);
    }
    if (!deepV && !lowq && !reduce) drawSunbeams(g, day, above, bw, now);
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
    glows.length = 0; CELL.wob = Math.sin(now / 500); CELL.edge = Math.max(1, Math.round(ts / 9)); CELL.sw = Math.sin(now / 700);
    drawStructs(g, X0, X1, Y0, Y1);   // buildings first: they are pictures behind everything you build
    for (j = Y0; j <= Y1; j++) for (i = X0; i <= X1; i++) {
      if (i < 0 || i >= W || j < 0 || j >= H) continue;
      drawCell(g, i, j, ox + i * ts, oy + j * ts, now);
    }
    if (!cave) { drawGates(g, X0, X1, Y0, Y1); drawStands(g, X0, X1, Y0, Y1); drawTraps(g, X0, X1, Y0, Y1); }
    // mining cracks and a pulse on the tile being dug
    if (mine) {
      var mx = ox + mine.x * ts, my = oy + mine.y * ts, nseg = 1 + Math.floor(mine.p * 6);
      g.strokeStyle = "rgba(0,0,0,.65)"; g.lineWidth = Math.max(1, ts / 14); g.beginPath();
      for (i = 0; i < nseg && i < CRACKS.length; i++) { g.moveTo(mx + ts * 0.5, my + ts * 0.5); g.lineTo(mx + ts * CRACKS[i][0], my + ts * CRACKS[i][1]); }
      g.stroke(); g.fillStyle = "rgba(255,255,255," + (0.06 + mine.p * 0.16) + ")"; g.fillRect(mx, my, ts, ts);
    }
    drawNpc(g, now); drawAnimals(g, now); drawEnemies(g, now); drawShots(g, now); drawArrows(g, false); drawBossBar(); drawMini(); tickMusic(); tickCloud();
    drawRemotes(g, now); drawPlayer(g, now); drawFishing(g, now);
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
    drawWeather(g, now, day, above);
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
    if (sel === "bucket") return { ang: 0.05, phi: 0.7, has: S.bucket >= 1, kind: "can" };
    if (sel === "net") return { ang: -0.6 + heldAmt * 0.9, phi: 1.2 + heldAmt * 0.6, has: S.net >= 1, kind: "can" };
    if (sel === "bow") return { ang: -0.15, phi: 1.35, has: S.bow >= 1, kind: "can" };   // held out, aimed
    if (sel === "rod") return { ang: -0.25 + (fishing && fishing.ph === "bite" ? -0.35 : 0) + sway * 0.03, phi: 0.95 + sway * 0.08 * moving, has: S.rod >= 1, kind: "can" };   // held out over the water
    if (sel === "can") return { ang: heldAmt * 0.8 + sway * 0.03 * (1 - heldAmt), phi: (S.can >= 1 ? 0.95 + sway * 0.1 * moving : 0.3) + heldAmt * 0.45, has: S.can >= 1, kind: "can" };   // held out in front, tipping forward to pour
    var kind = sel === "pick" || sel === "shovel" || sel === "hoe" ? "pick" : sel === "weapon" ? "weapon" : "item", sw = 0, base = 0.15, k1 = -0.55, k2 = 1.9, amp = 0.06, has = false, ph;
    if (kind === "pick") { has = sel === "shovel" ? S.shovel >= 1 : sel === "hoe" ? S.hoe >= 1 : S.tier >= 1 && !bare; ph = heldPh % 1; sw = Math.sin(Math.min(1, ph / 0.55) * Math.PI * 0.5) * (ph < 0.55 ? 1 : 1 - (ph - 0.55) / 0.45); }
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
    } else if (sel === "rod") {
      if (!S.rod) return;
      put(sprCanvas("rod" + S.rod), 0.95, 3, 13);
    } else if (sel === "bucket") {
      if (!S.bucket) return;
      put(sprCanvas(bucketKey()), 0.7, 8, 2);
    } else if (sel === "net") {
      if (!S.net) return;
      put(sprCanvas("net"), 0.9, 3, 13);
    } else if (sel === "bow") {
      if (!S.bow) return;
      put(sprCanvas("bow" + S.bow), 0.85, 6, 9);
    } else if (sel === "hoe") {
      if (!S.hoe) return;
      put(sprCanvas("hoe" + S.hoe), 0.85, 3, 13);
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
    drawWings(g, sx, sy + ts * 0.14, now);   // behind the body
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
    if (activeBoss()) { nag("You can't slip away in the middle of a boss fight!"); return; }
    stopInput(); thud(210, 0.08);
    trans = { t: 0, done: false, mid: function () {
      cave = { hole: { x: s.outX, y: s.gy - 1, b: s.b }, bld: s, run: s.id + 1, floors: {}, f: 0, F: null };
      S.st.bld = (S.st.bld || 0) + 1; S.vis["k_" + s.kind] = 1; enemies.length = 0; stageEl.classList.add("cave"); $("sbxHint").classList.remove("on");
      setFloor(1, "down"); save();
    } };
  }
  function enterCave(hx, hy) {
    if (!SC || cave || trans || sleepT > 0 || hp <= 0) return;
    if (activeBoss()) { nag("You can't slip away in the middle of a boss fight!"); return; }
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
    if (cave.bld && cave.bld.kind === "witchhut" && T.X_lootchest !== undefined) { var wci = WCHEST.y * F.w + WCHEST.x; F.node[wci] = witchChestReady(cave.bld.id) ? T.X_lootchest : 0; }
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
    if (td.kind === "lootchest" && cave.bld && cave.bld.kind === "witchhut") { witchLoot(x, y); return; }
    if (td.kind === "lootchest" || td.kind === "lootpot") {   // hole-cave treasure: deeper floors hold better loot
      var ct = cave.f < 5 ? 0 : cave.f < 12 ? 1 : 2, cb = cave.hole ? cave.hole.b : 0, CL = rollLoot(td.kind === "lootchest" ? "chest" : "pot", cb, ct);
      CL.forEach(function (q) { give(q[0], q[1], x, y); });
      if (td.kind === "lootchest") { chips(x + 0.5, y + 0.5, "#f2c14e", 18, 7); treasureFound(CL.length); } else { S.st.pots++; thud(420, 0.06); checkGoals(); }
      return;
    }
    var n = dropQty(td); if (id === T.STONE && Math.random() < 0.5) n++;
    give(td.drop, n, x, y); if (td.kind === "ore") { snd("coin"); if (gem("pick", "amethyst") && Math.random() < 0.15) give(td.drop, 1, x, y); }
    if (id === T.STONE && Math.random() < 0.12) give("pebble", 1, x, y - 0.55);
  }
  function caveTool(dt) {
    var F = cave.F; if (sel === "weapon") { mine = null; caveSwing(dt); return; }
    if (sel === "bow") { useBow(dt); return; }
    if (ITEMS[sel] && ITEMS[sel].food && ITEMS[sel].tile === undefined) { useFood(dt); return; }
    if (POTIONS[sel]) { useDrink(dt); return; }
    if (isStainTool(sel)) { useStain(dt); return; }
    if (ITEMS[sel] && ITEMS[sel].summon) { mine = null; if (aim.down) nag("Bosses only answer the call on the surface world."); return; }
    if (ITEMS[sel] && ITEMS[sel].home) { mine = null; if (aim.down) nag("The shell needs open sky. Use it on the surface."); return; }
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
      mine.p += dt * (sel === "shovel" ? SHOVEL.sp : PICKS[effTier()].sp) * (hasCharm("miner") ? 1.25 : 1) * (fx("mine") ? 1.4 : 1) * gemDig() / td.hard; mine.tick -= dt;
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
    } else if (sel !== "pick" && sel !== "shovel" && sel !== "weapon" && sel !== "can" && sel !== "rod" && sel !== "hoe" && sel !== "bucket" && sel !== "net" && sel !== "bow") { cool = 0.4; nag("Only torches can be placed in caves."); }
  }
  function caveUpdate(dt) {
    var F = cave.F, i;
    advTime(dt);
    var dx = ((keys.r || tk.r) ? 1 : 0) - ((keys.l || tk.l) ? 1 : 0), dy = ((keys.d || tk.d) ? 1 : 0) - ((keys.u || tk.u) ? 1 : 0), len = Math.sqrt(dx * dx + dy * dy) || 1, mag = 1;
    if (joy.x || joy.y) { dx = joy.x; dy = joy.y; mag = Math.min(1, Math.sqrt(dx * dx + dy * dy)); len = Math.sqrt(dx * dx + dy * dy) || 1; }   // analog stick: the further you push, the faster you walk
    var csp = CAVE_SPEED * (hasCharm("bramble") ? 1.15 : 1) * (fx("speed") ? 1.25 : 1) * (hexSlow > 0 ? 0.55 : 1); cp.vx = approach(cp.vx, dx / len * csp * mag, 70 * dt); cp.vy = approach(cp.vy, dy / len * csp * mag, 70 * dt);
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
    ckx *= Math.max(0, 1 - 9 * dt); cky *= Math.max(0, 1 - 9 * dt); tickFarm(dt); tickHunger(dt); tickFx(dt); tickWeather(dt); tickBounties(dt);
    caveTool(dt); stepArrows(dt); if (!F.bld && !trans) updateCaveMobs(dt);
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
    var glows2 = [], srcs = [[cp.x, cp.y - 0.6, fx("night") ? 12 : hasCharm("glow") ? 9 : 7.2, 1]];
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
    drawRocks(Y0, Math.min(Y1, prow)); drawCavePlayer(g, now); drawRocks(Math.max(Y0, prow + 1), Y1); drawArrows(g, true);
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
    hudSet("sbxSub", dayTag() + (SHOWDAYS && ph.id === "day" ? "Daytime" : PHN[ph.id]) + (under ? " \u00b7 depth " + depth : " \u00b7 " + (wxLabel() || "surface")));
    if (lastBio !== b) { bcard(bi, b); lastBio = b; }
    drawTrail();
    if (hbDirty) drawBar();
  }
  function drawBar() {
    hbDirty = false; var items = barEntries(), html = "";
    if (!TOOLKEY[sel]) { if (!(S.inv[sel] > 0)) { sel = "pick"; selSlot = -1; } else if (!(S.slots[selSlot] && S.slots[selSlot].k === sel)) selSlot = hotIndex(sel); }
    items.forEach(function (en, i) {
      var id = en.id, on = en.slot >= 0 ? (id && sel === id && selSlot === en.slot) : sel === id && !(id === "pick" && bare);
      if (!id) { html += '<button type="button" class="sbx-slot empty' + (bare && selSlot === en.slot ? " on" : "") + '" data-sel="hand" data-slot="' + en.slot + '" aria-pressed="' + (bare && selSlot === en.slot) + '" aria-label="Empty hotbar slot: hold nothing"><i>' + (i + 1) + "</i></button>"; return; }
      var cnt = id === "pick" ? (S.tier ? "Lv" + S.tier : "Paws") : id === "weapon" ? "Lv" + S.wpn : id === "shovel" ? "Soft" : id === "can" ? S.water + "/" + CAN.max : id === "rod" ? (S.rod >= 2 ? "Lava" : "Rod") : id === "hoe" ? "Lv" + S.hoe : id === "bucket" ? (S.bkt === "water" ? "Water" : S.bkt === "lava" ? "Lava" : "Empty") : id === "net" ? "Net" : id === "bow" ? "x" + ammoCount() : S.slots[en.slot].n;
      var dk = id === "pick" ? (S.tier ? "pick" : "") : id === "weapon" ? "wpn" : id === "shovel" ? "shovel" : "", dpc = dk ? Math.round(durOf(dk) / durMax(dk) * 100) : -1, brk = dk && toolBroken(dk);
      if (brk) cnt = "Broken";
      html += '<button type="button" class="sbx-slot' + (on ? " on" : "") + (dk ? " hasdur" : "") + (brk ? " brk" : "") + '" data-sel="' + id + '" data-slot="' + en.slot + '" aria-label="' + (dk ? "Durability " + dpc + " percent. " : "") + (id === "pick" ? PICKS[S.tier].n : id === "shovel" ? SHOVEL.n : id === "can" ? CAN.n + ", " + S.water + " of " + CAN.max + " water" : id === "weapon" ? WEAPONS[S.wpn].n + ", damage " + WEAPONS[S.wpn].dmg : id === "rod" ? (S.rod >= 2 ? "Ember Rod" : "Reed Fishing Rod") : id === "hoe" ? (HOES[S.hoe] ? HOES[S.hoe].n : "Hoe") : id === "bucket" || id === "net" || id === "bow" ? ITEMS["t_" + id].n : ITEMS[id].n + ", " + S.slots[en.slot].n) + '" aria-pressed="' + on + '"><img alt="" src="' + icon(id) + '"><i>' + (i + 1) + '</i><b>' + esc(cnt) + '</b>' + (dk ? '<u class="dur' + (dpc <= 20 ? " bad" : dpc <= 50 ? " low" : "") + '" style="--d:' + dpc + '%"></u>' : "") + '</button>';
    });
    $("sbxBar").innerHTML = html;
    var bb = $("sbxPackBtn"); bb.classList.toggle("full", S.slots.every(Boolean));
  }
  // ---------- CRAFTING FROM NEARBY CHESTS ----------
  // Crafting, upgrading the Workbench and repairing count the items in your backpack PLUS every chest within CHEST_PULL tiles of you,
  // and when you craft, ingredients come out of your backpack first, then out of those chests (nearest first). Not in hole caves,
  // and not as a multiplayer guest (the host's chests are theirs).
  var CHEST_PULL = 10, poolC = null, poolT = 0;
  function nearChestKeys() {
    if (cave || (MP.on && MP.role === "guest")) return [];
    return Object.keys(S.chests).map(function (key) { var q = key.split(","), x = +q[0], y = +q[1]; return { key: key, x: x, y: y, d: Math.abs(x + 0.5 - p.x) + Math.abs(y + 0.5 - (p.y - 1)) }; })
      .filter(function (c) { return Math.abs(c.x + 0.5 - p.x) <= CHEST_PULL && Math.abs(c.y + 0.5 - (p.y - 1)) <= CHEST_PULL && isChest(get(c.x, c.y)); })
      .sort(function (a, b) { return a.d - b.d; });
  }
  function chestPool() {   // item -> how many are in nearby chests (worked out at most a few times a second)
    var now = performance.now(); if (poolC && now - poolT < 250) return poolC; poolT = now;
    var P = {}; nearChestKeys().forEach(function (c) { var cc = S.chests[c.key]; for (var k in cc) if (cc[k] > 0) P[k] = (P[k] || 0) + cc[k]; });
    return (poolC = P);
  }
  function poolDirty() { poolC = null; }
  function haveIt(k) { return (S.inv[k] || 0) + (chestPool()[k] || 0); }
  function canPay(cost) { for (var k in cost) if (haveIt(k) < cost[k]) return false; return true; }
  function payCost(cost) {   // backpack first, then the nearest chests
    var used = 0;
    for (var k in cost) {
      var need = cost[k], fromBag = Math.min(S.inv[k] || 0, need);
      if (fromBag) { S.inv[k] -= fromBag; if (S.inv[k] <= 0) delete S.inv[k]; need -= fromBag; }
      if (need > 0) nearChestKeys().forEach(function (c) { var cc = S.chests[c.key]; if (need <= 0 || !cc[k]) return; var t = Math.min(cc[k], need); cc[k] -= t; need -= t; used += t; if (cc[k] <= 0) delete cc[k]; });
    }
    poolDirty(); if (used && chestKey && panelOpen) renderPanel();
    return used;
  }
  function costHtml(cost) {
    var pool = chestPool();
    return Object.keys(cost).map(function (k) { var bag = S.inv[k] || 0, have = bag + (pool[k] || 0), ok = have >= cost[k], fromC = bag < cost[k] && pool[k] > 0; return '<span class="' + (ok ? "ok" : "no") + (fromC ? " fromchest" : "") + '"' + (fromC ? ' title="Includes ' + Math.min(pool[k], cost[k] - bag) + ' from nearby chests"' : "") + '><img alt="" src="' + icon(k) + '">' + have + "/" + cost[k] + " " + esc(ITEMS[k].n) + (fromC ? '<i class="chs" aria-label="from chests"></i>' : "") + "</span>"; }).join("");
  }
  // ---------- CRAFT BROWSER: category tabs, each split into sub-categories, every list sorted by progression ----------
  // CRAFT_GROUPS gives each recipe id its "Category|Sub-category" (order here = order of the sub-category chips). A recipe id that is not listed lands in Decor > More.
  // Inside a sub-category recipes are sorted by progression: Workbench level needed, then gear tier, then station / material cost.
  var CRAFT_CATS = ["Tools", "Gear", "Food", "Stations", "Materials", "Building", "Walls", "Furniture", "Lighting", "Garden", "Decor"], CRAFT_MAP = {}, CRAFT_SUBS = {}, CRAFT_ALL = null, ccat = "Tools", csub = "", cready = false;
  [
    ["Tools|Pickaxes", "pick1 pick2 pick3 pick4 pick5"],
    ["Tools|Melee Weapons", "wpn1 wpn2 wpn3 wpn4 wpn5"],
    ["Tools|Utility", "shovel can x_hoe1 x_hoe2 x_hoe3 x_bucket1 x_bucket2 x_net x_rod1 x_rod2 x_homeshell"],
    ["Tools|Ranged Weapons", "x_bow1 x_bow2 x_bow3 x_arrow x_firearrow"],
    ["Gear|Armor", "arm1 arm2 arm3 arm4 arm5"],
    ["Gear|Backpacks", "bag1 bag2"],
    ["Gear|Boss Summons", "x_lure x_idol x_horn"],
    ["Gear|Charms", "x_ch_bramble x_ch_magma x_ch_alpha x_ch_miner x_ch_angler x_ch_thumb x_ch_hearty x_ch_lucky x_ch_glow x_ch_tide x_ch_king"],
    ["Stations|Workbenches", "bench decorbench"],
    ["Stations|Crafting Stations", "x_cookpot x_brewstand x_furnace x_loom x_mason"],
    ["Potions|Bottles", "x_bottle"],
    ["Gear|Jewelry", "x_jeweltable"],
    ["Building|Wood Stains", "x_stain_walnut x_stain_ebony x_stain_honey x_stain_mahogany x_stain_white x_stain_sage x_stain_blue x_stain_plum x_sandpaper"],
    ["Potions|Restoring", "x_tonic_heal x_tonic_hide x_tonic_fire"],
    ["Potions|Adventuring", "x_tonic_mine x_tonic_speed x_tonic_night x_tonic_fish x_tonic_leap"],
    ["Food|Farming", "x_farmland x_sprinkler x_trough x_fishtrap"],
    ["Food|Quick Meals", "x_roastcarrot x_bakedpotato x_skewer x_grilledmeat x_grilledfish x_omelette x_milkshake"],
    ["Food|Hearty Meals", "x_fishchips x_catstew x_chowder x_spicyeel x_truffleroast x_chili x_stew x_berrypie x_feast"],
    ["Materials|Fibre & Cloth", "x_rope x_cloth x_furcloth x_candle"],
    ["Materials|Dyes", "x_dyered x_dyeblue x_dyegreen"],
    ["Materials|Smelted & Fired", "x_charcoal x_ingot x_claybrick x_mortar"],
    ["Materials|Silk", "x_silkrope"],
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
    ["Decor|Wall Art", "d_painting d_banner d_sign d_emberbanner d_frostbanner x_mirror x_worldmap x_wreath x_tap_swamp x_tap_ember x_tap_frost x_fishtrophy"],
    ["Decor|Trophies & Armory", "d_bugtrophy d_frogtrophy x_battrophy x_antlers x_weaponrack x_armorstand x_shield x_swords x_wolftrophy x_gatortrophy x_waspnest x_slimejar"],
    ["Decor|Legendary", "x_swampheart"],
    ["Decor|Spooky", "x_cobweb"],
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
    var afford = canPay(r.cost);
    if (r.deco) { var dl = !!(r.bl && S.bl < r.bl), nd = !decorNear(); return { owned: false, lock: dl, lock0: false, needB: nd, can: afford && !dl, ready: afford && !dl && !nd }; }
    var owned = !!((r.tier && S.tier >= r.tier) || (r.wpn && S.wpn >= r.wpn) || (r.arm && S.arm >= r.arm) || (r.sh && S.shovel) || (r.bag && S.bag >= r.bag) || (r.can && S.can) || (r.rod && S.rod >= r.rod) || (r.charm && S.charms.own[r.charm]) || (r.hoe && S.hoe >= r.hoe) || (r.bucket && S.bucket >= r.bucket) || (r.net && S.net >= r.net) || (r.bow && S.bow >= r.bow)),
      lock0 = !!((r.bow && S.bow < r.bow - 1) || (r.rod && S.rod < r.rod - 1) || (r.hoe && S.hoe < r.hoe - 1) || (r.bucket && S.bucket < r.bucket - 1) || (r.tier && S.tier < r.tier - 1) || (r.bag && (S.bag < r.bag - 1 || (r.need && S.tier < r.need))) || (r.wpn && (S.wpn < r.wpn - 1 || (r.need && S.tier < r.need))) || (r.arm && (S.arm < r.arm - 1 || (r.need && S.tier < r.need)))),
      lock = lock0 || !!(r.bl && S.bl < r.bl), needB = !!(r.bench && !nearBench()), can = !owned && !lock && afford;
    return { owned: owned, lock: lock, lock0: lock0, needB: needB, can: can, ready: can && !needB && !(r.stn && !nearStn(r.stn)) };
  }
  function recCard(r) {
    var st = recStatus(r), im, note;
    if (r.deco) {
      im = icon(Object.keys(r.out)[0]);
      note = st.lock ? "Needs the " + BENCH_LV[r.bl].n + " (tap your Bog Workbench to upgrade it)." : r.d;
    } else {
      im = r.arm ? icon("arm" + r.arm) : r.wpn ? icon("wpn" + r.wpn) : r.tier ? (function () { var old = S.tier; S.tier = r.tier; var u = icon("pick"); S.tier = old; return u; })() : icon(r.sh ? "shovel" : r.can ? "can" : r.charm ? "charm_" + r.charm : r.hoe ? "hoe" + r.hoe : r.bucket ? (r.bucket >= 2 ? "bkt_i" : "bkt_w") : r.net ? "net" : r.bow ? "bow" + r.bow : r.rod ? "rod" + r.rod : r.bag ? "bag" + r.bag : Object.keys(r.out)[0]);
      note = st.lock && !st.lock0 ? "Upgrade your Workbench to the " + BENCH_LV[r.bl].n + " first." : st.lock ? (r.bag ? (S.bag < r.bag - 1 ? "Make the " + BAGS[r.bag - 1].n + " first." : "Needs the " + PICKS[r.need].n + " first.") : r.arm ? (S.arm < r.arm - 1 ? "Craft the " + ARMORS[r.arm - 1].n + " first." : "Needs the " + PICKS[r.need].n + " first.") : r.wpn ? (S.wpn < r.wpn - 1 ? "Craft the " + WEAPONS[r.wpn - 1].n + " first." : "Needs the " + PICKS[r.need].n + " first.") : r.rod ? "Craft the Reed Fishing Rod first." : r.hoe ? "Craft the " + HOES[r.hoe - 1].n + " first." : r.bucket ? "Craft the Wooden Bucket first." : r.bow ? "Craft the " + BOWS[r.bow - 1].n + " first." : "Craft the " + PICKS[r.tier - 1].n + " first.") : (st.needB && !st.owned ? "Needs a Bog Workbench nearby." : r.stn && !nearStn(r.stn) ? "Needs a " + SbxExtra.STN[r.stn] + " nearby. " + r.d : r.d);
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
      var m = durMax(k), cur = durOf(k), cost = repairCost(k), full = cur >= m, needB2 = repairNeedsBench(k) && !nearBench(), can2 = !full && canPay(cost) && !needB2;
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
  function stnRecs(k) {   // the station's own recipes, then everything you can make by hand (so you never have to leave the station window)
    var all = craftAll(), own = all.filter(function (r) { return stnOf(r) === k; });
    var hand = all.filter(function (r) { return stnOf(r) === "" && !r.charm && !(r.tier && S.tier >= r.tier); }).map(function (r) { var w = Object.create(r); w.cat2 = "By hand"; w.sub = r.cat2 + " \u00b7 " + r.sub; return w; });
    return own.concat(hand);
  }
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
    var nch = nearChestKeys().length;
    h += '<p class="sbx-note">' + esc(D.d) + (nch ? ' <b class="stn-ch">Also using ' + nch + " nearby chest" + (nch > 1 ? "s" : "") + ".</b>" : "") + "</p>";
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
        return '<button type="button" class="sbx-is' + (c ? "" : " empty") + (on ? " on" : "") + (i < INV_HOT ? " hot" : "") + (c && sel === c.k && selSlot === i ? " held" : "") + '" data-is="' + i + '" aria-pressed="' + on + '" aria-label="' + (c ? ITEMS[c.k].n + ", " + c.n + (i < INV_HOT ? ", hotbar slot " + (i + 1) : "") : (i < INV_HOT ? "Empty hotbar slot " + (i + 1) : "Empty slot")) + '">' + (c ? '<img alt="" src="' + icon(c.k) + '">' + (ITEMS[c.k].tool ? "" : "<b>" + c.n + "</b>") : "") + (i < INV_HOT ? "<i>" + (i + 1) + "</i>" : "") + "</button>";
      }, cur2 = invSel >= 0 ? S.slots[invSel] : null, g1 = "", g2 = "", i2;
      var g3 = ""; for (i2 = INV_HOT; i2 < INV_BASE; i2++) g1 += cell(i2); for (i2 = INV_BASE; i2 < invN(); i2++) g3 += cell(i2);
      for (i2 = 0; i2 < INV_HOT; i2++) g2 += cell(i2);
      var fillPc = Math.round(used / invN() * 100);
      h += '<div class="pk-cap' + (used >= invN() ? " full" : used >= invN() - 3 ? " near" : "") + '"><span class="bar"><i style="width:' + fillPc + '%"></i></span><b>' + used + " / " + invN() + "</b><small>" + (S.bag ? esc(BAGS[S.bag].n) + " +" + BAGS[S.bag].x : "Craft a Backpack for more room") + "</small></div>"
        + '<p class="sbx-note pk-tip">Tap an item to pick it. Drag onto another slot to move, swap or merge. Stacks hold ' + STACK + " (" + STACK_SMALL + " for furniture).</p>";
      h += '<div class="sbx-inv"><div class="sbx-igrid">' + g1 + '</div>' + (g3 ? "<h3>" + esc(BAGS[S.bag].n) + '</h3><div class="sbx-igrid pack">' + g3 + "</div>" : "") + '<h3>Hotbar</h3><div class="sbx-igrid hot">' + g2 + "</div></div>";
      var tool2 = cur2 && ITEMS[cur2.k].tool;
      h += '<div class="sbx-iinfo' + (cur2 ? " sel" : "") + '">' + (cur2 ? '<div><img alt="" src="' + icon(cur2.k) + '"><span><b>' + esc(ITEMS[cur2.k].n) + "</b><small>" + (tool2 ? "Tool" : cur2.n + " of " + stackMax(cur2.k)) + "</small></span></div>" : '<div class="pk-none"><span><small>Pick an item to see what you can do with it.</small></span></div>')
        + '<div class="acts">'
        + (cur2 ? '<button type="button" class="btn" data-iact="hold">' + (tool2 ? "Use" : "Hold") + "</button>"
          + (ITEMS[cur2.k].food ? '<button type="button" class="btn" data-iact="eat">Eat</button>' : "")
          + '<button type="button" class="btn ghost" data-iact="swap">' + (invSel >= INV_HOT ? "To hotbar" : "To bag") + "</button>"
          + (cur2.n > 1 ? '<button type="button" class="btn ghost" data-iact="split">Split</button>' : "")
          + (tool2 ? "" : '<button type="button" class="btn ghost" data-iact="toss1">Drop 1</button><button type="button" class="btn ghost' + (invAsk === "t" + invSel ? " warn" : "") + '" data-iact="tossall">' + (invAsk === "t" + invSel ? "Tap again" : "Drop all") + "</button>")
          : "")
        + '<button type="button" class="btn ghost pk-sort" data-iact="sort">Sort</button></div></div>';
      var ek = ORDER.filter(function (k) { return S.extra[k] > 0; });
      if (ek.length) h += "<h3>Overflow</h3><p class=\"sbx-note\">These did not fit. Free a slot, then collect them.</p><div class=\"sbx-bag\">" + ek.map(function (k) { return '<button type="button" class="sbx-it" data-iextra="' + k + '"><img alt="" src="' + icon(k) + '"><b>' + S.extra[k] + "</b><small>" + esc(ITEMS[k].n) + " \u00b7 collect</small></button>"; }).join("") + "</div>";
      if (!used && !ek.length) h += '<p class="sbx-note">Your inventory is empty. Walk to a tree and hold on the leaves to gather Sticks.</p>';
    return h;
  }
  function renderPack() {
    var h = charmHtml() + bagHtml(), t = $("sbxPackTitle"); if (t) t.innerHTML = "Backpack <small>" + usedSlots() + " / " + invN() + "</small>";
    var bd = $("sbxPackBody"), st = bd.scrollTop; bd.innerHTML = h; bd.scrollTop = st;
  }
  function renderPanel() {
    if (!panelOpen) return;
    if (stnOpen) return renderStn();
    if (packOpen) return renderPack();
    if (mapOpen) return;
    if (tab === "bag" || tab === "map") tab = "craft";
    if (tab === "trail" || tab === "goals") tab = "quests";
    var tabs = [["quests", "Quests"], ["log", "Log"], ["craft", "Craft"], ["map", "Map"], ["more", "Options"]];
    if (chestKey) tabs.splice(2, 0, ["chest", "Chest"]); else if (tab === "chest") tab = "craft";
    if (tab === "decor") { tab = "craft"; ccat = "Furniture"; csub = ""; }   // the Decor Workbench now opens the Craft tab on Furniture
    $("sbxTabs").innerHTML = tabs.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + "</button>"; }).join("");
    var h = "";
    if (tab === "quests") {
      var c = curCh(), C = CHAPTERS[c], cl = chQuests(c), cdone = cl.filter(function (q) { return MAIN.indexOf(q) < S.qi; }).length, epi = c === CHAPTERS.length - 1;
      var qrow = function (q, state, sideQ) {   // state: "ok" done, "cur" current, "next" later
        var v = Math.min(q.need, Math.floor(q.v())), rw = q.rw && Object.keys(q.rw).length ? q.rw : null;
        return '<div class="sbx-goal' + (state === "ok" ? " ok" : state === "cur" ? " cur" : state === "next" ? " later" : "") + (sideQ ? " side" : "") + '"><i aria-hidden="true">' + (state === "ok" ? "&#10003;" : state === "cur" ? "&#9733;" : "") + "</i><div><b>" + esc(q.n) + "</b>"
          + (state !== "next" ? "<small>" + esc(q.d) + "</small>" : "")
          + (state === "cur" || sideQ && state !== "ok" ? '<span class="bar"><i style="width:' + Math.round(v / q.need * 100) + '%"></i></span><em>' + v + " / " + q.need + "</em>" : "")
          + (rw && state !== "ok" && state !== "next" ? '<small class="rw">Reward: ' + esc(rewardText(rw)) + "</small>" : "") + "</div></div>";
      };
      h += '<div class="sbx-qch" style="--qc:' + C.c + '"><div class="qc-top"><span class="qc-frog" aria-hidden="true">' + CROAK_SVG + "</span><div><small>" + (epi ? "Story complete" : "Chapter " + (c + 1) + " of " + (CHAPTERS.length - 1)) + "</small><b>" + esc(C.n) + "</b></div></div>"
        + "<p>" + esc(C.s.length > 170 ? C.s.slice(0, C.s.lastIndexOf(" ", 165)) + "\u2026" : C.s) + '</p><div class="qc-row"><button type="button" class="btn ghost" data-story="' + c + '">Read the story</button>'
        + (epi ? "" : '<span class="bar"><i style="width:' + Math.round(cdone / cl.length * 100) + '%"></i></span><em>' + cdone + " / " + cl.length + "</em>") + "</div></div>";
      if (btyOpen()) { rollBounties(); var bl2 = S.bty.d.concat(S.bty.w ? [S.bty.w] : []), bdn = bl2.filter(function (b) { return b.done; }).length, brd = btyReady(); h += '<div class="sbx-btycard"><img alt="" src="' + icon("swamptoken") + '"><div><b>Croaker\'s bounties</b><span>' + (brd ? brd + " ready to claim. Visit Old Croaker at camp!" : bdn + " of " + bl2.length + " claimed · " + bl2.filter(function (b) { return !b.done; }).map(function (b) { return btyText(b) + " (" + btyProg(b) + "/" + b.need + ")"; }).slice(0, 2).join(", ")) + "</span></div></div>"; }
      if (!epi) h += '<h3>Main quests</h3><div class="sbx-goals">' + cl.map(function (q) { var n2 = MAIN.indexOf(q); return qrow(q, n2 < S.qi ? "ok" : n2 === S.qi ? "cur" : "next"); }).join("") + "</div>"
        + (C.rw && Object.keys(C.rw).length ? '<p class="sbx-note">Finish the chapter for: <b>' + esc(rewardText(C.rw)) + "</b></p>" : "");
      if (c > 0) h += '<details class="sbx-qpast"><summary>Earlier chapters (' + c + ")</summary>" + CHAPTERS.slice(0, c).map(function (P, n2) { return '<div class="qp"><i>&#10003;</i><span>' + (n2 + 1) + ". " + esc(P.n) + '</span><button type="button" class="btn ghost" data-story="' + n2 + '">Story</button></div>'; }).join("") + "</details>";
      var open = SIDE.filter(function (q) { return sideOpen(q); }), sdone = SIDE.filter(function (q) { return S.ms[q.id]; }), locked = SIDE.length - open.length;
      h += "<h3>Side quests</h3><p class=\"sbx-note\"><b>" + sdone.length + " / " + SIDE.length + "</b> done." + (locked ? " " + locked + " more open up as the story goes on." : "") + "</p>";
      SIDE_CATS.forEach(function (cat) {
        var act = open.filter(function (q) { return q.cat === cat && !S.ms[q.id]; }).sort(function (a2, b2) { return b2.v() / b2.need - a2.v() / a2.need; });
        if (!act.length) return;
        h += '<div class="sbx-qcat">' + esc(cat) + '</div><div class="sbx-goals">' + act.map(function (q) { return qrow(q, "", true); }).join("") + "</div>";
      });
      if (sdone.length) h += '<details class="sbx-qpast"><summary>Completed side quests (' + sdone.length + ")</summary><div class=\"sbx-goals\">" + sdone.map(function (q) { return qrow(q, "ok", true); }).join("") + "</div></details>";
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
    } else if (tab === "log") {
      h += logHtml();
    } else if (tab === "chest") {
      var cc = S.chests[chestKey] || {}, ck = Object.keys(cc), mine2 = ORDER.filter(function (k) { return (S.inv[k] || 0) > 0 && !ITEMS[k].tool; }), btn = function (k, n, attr) { return '<button type="button" class="sbx-it" ' + attr + '="' + k + '"><img alt="" src="' + icon(k) + '"><b>' + n + "</b><small>" + esc(ITEMS[k].n) + "</small></button>"; };
      var ckx = chestKey.split(","), cname = TILES[get(+ckx[0], +ckx[1])].kind === "lootchest" ? "Cave Chest" : "Wooden Chest";
      h += '<p class="sbx-note"><b>' + cname + '</b> (' + ck.length + " of " + CHEST_KINDS + ' kinds). Tap an item to move the whole stack.</p>';
      h += '<h3>In the chest</h3>' + (ck.length ? '<div class="sbx-bag">' + ORDER.filter(function (k) { return cc[k]; }).map(function (k) { return btn(k, cc[k], "data-ch-take"); }).join("") + "</div>" : '<p class="sbx-note">Empty.</p>') + '<button type="button" class="btn ghost" data-ch-all="take"' + (ck.length ? "" : " disabled") + ">Take all</button>";
      h += '<h3>In your backpack</h3>' + (mine2.length ? '<div class="sbx-bag">' + mine2.map(function (k) { return btn(k, S.inv[k], "data-ch-put"); }).join("") + "</div>" : '<p class="sbx-note">Your backpack is empty.</p>') + '<button type="button" class="btn ghost" data-ch-all="put"' + (mine2.length ? "" : " disabled") + ">Store all</button>";
    } else {
      var an = (typeof Crystals !== "undefined" && Crystals.animals) ? Crystals.animals : [{ id: "frog", name: "Boggy the Frog" }];
      // Options: grouped cards. Each setting is one row: a name, a one-line hint, and its control on the right.
      var sw = function (attr, on, label) { return '<button type="button" class="op-sw' + (on ? " on" : "") + '" ' + attr + ' role="switch" aria-checked="' + !!on + '" aria-label="' + esc(label) + '"><i></i></button>'; };
      var stp = function (attr, val, label) { return '<span class="op-stp"><button type="button" class="btn ghost" ' + attr.replace("%", "-1") + ' aria-label="' + esc(label) + ' down">&minus;</button><b>' + val + '</b><button type="button" class="btn ghost" ' + attr.replace("%", "1") + ' aria-label="' + esc(label) + ' up">+</button></span>'; };
      var row = function (name, hint, ctl) { return '<div class="op-row"><div><b>' + name + "</b>" + (hint ? "<small>" + hint + "</small>" : "") + "</div>" + ctl + "</div>"; };
      var card = function (title, body) { return '<section class="op-card"><h3>' + title + "</h3>" + body + "</section>"; };
      h += card("This world",
        row(esc(curEntry() ? curEntry().name : "My Swamp"), "Day " + ((S.days | 0) + 1) + " · saves automatically", '<span class="op-btns"><button type="button" class="btn ghost" data-camp>Back to camp</button><button type="button" class="btn" data-wl-open>Worlds</button></span>')
        + row("Difficulty", esc(dif().d), '<span class="sbx-diff op-seg">' + DIFF.map(function (D, i) { return '<button type="button" class="btn' + (S.diff === i ? "" : " ghost") + '" data-diff="' + i + '" aria-pressed="' + (S.diff === i) + '" style="--dc:' + D.c + '">' + D.n + "</button>"; }).join("") + "</span>")
        + row("Hunger", "Your food bar slowly empties. Off for a relaxed game.", sw("data-hungertoggle", !S.nohunger, "Hunger"))
        + row("Day counter", "Show the in-game day under the biome name.", sw("data-daytoggle", SHOWDAYS, "Day counter")));
      h += card("Play as", '<div class="sbx-an">' + an.map(function (a) { var th = ""; try { th = '<img alt="" src="' + DelveAv.thumb(Object.assign({}, Crystals.outfit()), a.id, 3) + '">'; } catch (e) { try { th = AV.svg(Object.assign({}, Crystals.outfit(), { animal: a.id, nobg: true })).replace('viewBox="0 0 200 200"', 'viewBox="22 4 156 156"'); } catch (e2) {} } return '<button type="button" data-an="' + a.id + '" aria-pressed="' + (S.animal === a.id) + '" aria-label="' + esc(a.name) + '">' + th + "<small>" + esc(a.name.split(" ")[0]) + "</small></button>"; }).join("") + '</div><p class="sbx-note op-foot">Your avatar gear comes from the Armory.</p>');
      h += card("Sound &amp; screen",
        row("Music", "Changes with the land you are in.", '<span class="op-btns">' + (MUS.on ? stp('data-musvol="%"', Math.round(MUS.vol * 100) + "%", "Music volume") : "") + sw("data-musictoggle", MUS.on, "Music") + "</span>")
        + row("Weather", "Rain, snow and ash. Waters crops, and fish bite sooner.", sw("data-wxtoggle", WX.on, "Weather"))
        + row("Mini-map", "Tap it to open the World Map.", sw("data-minitoggle", MINI.on, "Mini-map"))
        + row("Zoom", "How close the camera is.", stp('data-zoom="%"', Math.round(S.zoom * 100) + "%", "Zoom"))
        + row("Control size", "Touch stick, buttons, hotbar and HUD.", '<span class="op-btns">' + stp('data-ui="%"', Math.round(UIS * 100) + "%", "Control size") + '<button type="button" class="btn ghost op-mini" data-ui="0" aria-label="Reset control size">Reset</button></span>'));
      h += card("Play together", row(MP.on ? (MP.role === "host" ? "Room " + esc(MP.code) : "Visiting") : "Multiplayer", MP.on ? (MP.role === "host" ? (MP.npeers + 1) + " / 4 players in your world." : "You are in " + esc(MP.hostName) + "'s world.") : "Open your world to up to 3 friends, or join theirs.", '<button type="button" class="btn" data-mpopen>' + (MP.on ? "Manage" : "Play together") + "</button>"));
      h += '<p class="sbx-note op-seed">World seed ' + S.seed + "</p>";
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
      if (ex[i]) { var id = tiles[i]; if (id === T.AIR && PICT && PICT[i]) id = PICT[i]; var td = TILES[id], hex; if (id === T.AIR) hex = y < col[x] ? "#2a5a6a" : "#0d1114"; else if (id === T.WATER) hex = "#2a8f95"; else hex = td.kind === "ore" ? td.c2 : td.c; if (hex.length === 4) hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]; r = parseInt(hex.slice(1, 3), 16); gg = parseInt(hex.slice(3, 5), 16); b = parseInt(hex.slice(5, 7), 16); }
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
    if (npc.ok) {   // Old Croaker's camp: a little frog face (gold ring while he has a gift for you)
      var cq = m2s(npc.x, npc.y - 1), gw2 = giftsWaiting().length + btyReady(); g.fillStyle = "#06100d"; g.strokeStyle = gw2 ? "#f2c14e" : "#bff4e4"; g.lineWidth = gw2 ? 2.4 : 1.6;
      g.beginPath(); g.arc(cq[0], cq[1], 8, 0, 6.2832); g.fill(); g.stroke(); g.fillStyle = "#3fae5e"; g.beginPath(); g.ellipse(cq[0], cq[1] + 1.5, 5.6, 3.8, 0, 0, 6.2832); g.fill();
      [-2.8, 2.8].forEach(function (ex) { g.fillStyle = "#3fae5e"; g.beginPath(); g.arc(cq[0] + ex, cq[1] - 2.4, 2.4, 0, 6.2832); g.fill(); g.fillStyle = "#ffd23f"; g.beginPath(); g.arc(cq[0] + ex, cq[1] - 2.4, 1.3, 0, 6.2832); g.fill(); });
    }
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
  function openPanel(t) { if (storyOpen >= 0) { storyOpen = -1; $("sbxStory").hidden = true; } if (stnOpen) { stnOpen = null; $("sbxStn").hidden = true; } if (packOpen) { packOpen = false; $("sbxPack").hidden = true; } if (mapOpen) { mapOpen = false; $("sbxMapV").hidden = true; } if (t) tab = t; if (tab === "map") tab = "craft"; panelOpen = true; confirmNew = false; $("sbxPanel").hidden = false; stageEl.classList.add("panel"); keys.l = keys.r = keys.j = 0; tk.l = tk.r = tk.j = 0; aim.down = false; mine = null; renderPanel(); }
  function openPack() {
    if (mapOpen) closeMap(); else if (panelOpen && !packOpen) closePanel();
    packOpen = true; panelOpen = true; invSel = -1; invAsk = ""; $("sbxPack").hidden = false; stageEl.classList.add("panel"); keys.l = keys.r = keys.j = 0; tk.l = tk.r = tk.j = 0; aim.down = false; mine = null; renderPack();
  }
  function closePack() { packOpen = false; panelOpen = false; $("sbxPack").hidden = true; stageEl.classList.remove("panel"); $("sbxPackBtn").focus({ preventScroll: true }); }
  function closePanel() { if (storyOpen >= 0) return closeStory(); if (stnOpen) return closeStn(); if (mapOpen) return closeMap(); if (packOpen) return closePack(); panelOpen = false; if (chestKey) { chestKey = ""; if (tab === "chest") tab = "craft"; save(); } $("sbxPanel").hidden = true; stageEl.classList.remove("panel"); $("sbxMenuBtn").focus({ preventScroll: true }); }

  // ---------- INVENTORY SCREEN ----------
  function invClick(i, shift) {
    invAsk = "";
    if (shift) { if (S.slots[i]) quickMove(i); return; }
    invSel = invSel === i || !S.slots[i] ? -1 : i; renderPanel();   // a tap only shows what the item is; moving takes a drag (see INVENTORY DRAG)
  }
  // ---------- INVENTORY DRAG: press on an item and drag it onto another slot to move it, merge equal stacks, or swap ----------
  var idrag = null, idragJust = false;
  function dragEnd(drop, e) {
    var D = idrag; idrag = null; if (!D) return;
    if (D.ghost && D.ghost.parentNode) D.ghost.parentNode.removeChild(D.ghost);
    [].forEach.call(document.querySelectorAll(".sbx-is.drop, .sbx-is.lift, .sbx-slot.drop, .sbx-slot.lift"), function (b) { b.classList.remove("drop"); b.classList.remove("lift"); });
    if (!D.on) return;
    idragJust = true; setTimeout(function () { idragJust = false; }, 0);
    if (!drop) return;
    var el = document.elementFromPoint(e.clientX, e.clientY), t = el && el.closest && el.closest("[data-is],.sbx-slot[data-slot]");
    if (!t) return;
    var to = slotOfEl(t); if (to < 0 || to === D.from || !S.slots[D.from]) return;
    invAsk = ""; invSel = to; moveSlot(D.from, to); snd("coin");
  }
  function slotOfEl(b) { return b.hasAttribute("data-is") ? +b.getAttribute("data-is") : +b.getAttribute("data-slot"); }   // backpack slots use data-is, hotbar slots data-slot (-1 = a tool)
  [$("sbxPanel"), $("sbxPack"), $("sbxBar")].forEach(function (el) {
    el.addEventListener("pointerdown", function (e) {
      if (e.button && e.pointerType === "mouse") return;
      var b = e.target.closest("[data-is],.sbx-slot[data-slot]"); if (!b) return; var i = slotOfEl(b); if (!(i >= 0) || !S.slots[i]) return;
      idrag = { from: i, x0: e.clientX, y0: e.clientY, id: e.pointerId, on: false, ghost: null, src: b, th: e.pointerType === "mouse" ? 5 : 9 };
    });
    el.addEventListener("click", function (e) { if (idragJust) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);   // a finished drag is not also a tap
  });
  window.addEventListener("pointermove", function (e) {
    var D = idrag; if (!D || e.pointerId !== D.id) return;
    if (!D.on) {
      if (Math.abs(e.clientX - D.x0) + Math.abs(e.clientY - D.y0) < D.th) return;
      var c = S.slots[D.from]; if (!c) { idrag = null; return; }
      D.on = true; D.src.classList.add("lift");
      var g = document.createElement("div"); g.className = "sbx-drag"; g.innerHTML = '<img alt="" src="' + icon(c.k) + '"><b>' + c.n + "</b>"; document.body.appendChild(g); D.ghost = g;
    }
    e.preventDefault();
    D.ghost.style.transform = "translate(" + (e.clientX - 26) + "px," + (e.clientY - 26) + "px)";
    var el = document.elementFromPoint(e.clientX, e.clientY), t = el && el.closest && el.closest("[data-is],.sbx-slot[data-slot]"); if (t && !(slotOfEl(t) >= 0)) t = null;
    [].forEach.call(document.querySelectorAll(".sbx-is.drop, .sbx-slot.drop"), function (b) { if (b !== t) b.classList.remove("drop"); });
    if (t && t !== D.src) t.classList.add("drop");
  }, { passive: false });
  window.addEventListener("pointerup", function (e) { if (idrag && e.pointerId === idrag.id) dragEnd(true, e); });
  window.addEventListener("pointercancel", function (e) { if (idrag && e.pointerId === idrag.id) dragEnd(false, e); });
  function invAct(a) {
    var c = invSel >= 0 ? S.slots[invSel] : null; if (!c && a !== "sort") return;
    if (a !== "tossall") invAsk = "";
    if (a === "swap") quickMove(invSel);
    else if (a === "split") splitSlot(invSel);
    else if ((a === "toss1" || a === "tossall") && ITEMS[c.k].tool) nag("Tools can't be thrown away.");
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
    if (e.pointerId === aim.id && e.type === "pointerup" && performance.now() - aim.t0 < 260 && aim.door && !isStainTool(sel) && TILES[get(aim.dx, aim.dy)].kind === "door") {   // quick tap on a door: open or close it
      var ddx = aim.dx + 0.5 - p.x, ddy = aim.dy + 0.5 - (p.y - PH / 2);
      if (ddx * ddx + ddy * ddy <= REACH * REACH) toggleDoor(aim.dx, aim.dy, true); else nag("That door is too far away.");
    }
    if (e.pointerId === aim.id && e.type === "pointerup" && performance.now() - aim.t0 < 260 && aim.stn && !isStainTool(sel) && stnKeyAt(aim.dx, aim.dy) === aim.stn) tapStation(aim.dx, aim.dy);   // quick tap on a crafting station: open its window
    if (e.pointerId === aim.id && e.type === "pointerup" && performance.now() - aim.t0 < 300 && !cave && !isStainTool(sel)) { var an = animalAt((aim.mx - ox) / ts, (aim.my - oy) / ts); if (npcAt((aim.mx - ox) / ts, (aim.my - oy) / ts)) { talkCroaker(); aim.chest = false; } else if (an) { useAnimal(an); aim.chest = false; } else if (aim.tx >= 0 && isStand(aim.tx, aim.ty)) { openStand(aim.tx, aim.ty); aim.chest = false; } else if (aim.tx >= 0 && isTrap(aim.tx, aim.ty)) { emptyTrap(aim.tx, aim.ty); aim.chest = false; } else if (aim.tx >= 0 && isGate(aim.tx, aim.ty)) { openGate(aim.tx, aim.ty); aim.chest = false; } else if (aim.tx >= 0 && isJewel(aim.tx, aim.ty)) { openJewel(aim.tx, aim.ty); aim.chest = false; } }   // quick tap on an animal
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
    if (k === "Escape" && !$("sbxMPV").hidden) { closeMPV(); return; }
    if (titleOpen) { if (panelOpen) { if (k === "Escape") closePanel(); } else titleKey(e); return; }
    if (k === "Escape" && !panelOpen && !mapOpen && !MP.on && !MP.ws && !trans) { openTitle(); e.preventDefault(); return; }
    if (k === "Enter" && MP.on && !panelOpen) { openChat(); e.preventDefault(); return; }
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
    else if (k >= "1" && k <= "9") { var en = barEntries()[+k - 1]; if (en && en.id) choose(en.id, en.slot); else if (en && en.slot >= 0) choose("hand", en.slot); }
    else if (k === "f" || k === "F") {
      if (cave) { var ln = ladderNear(); if (ln) useLadder(ln.k); else nag("Stand next to a ladder to use it."); }
      else { var skip = bedNear() && isNight(S.time), dn = skip ? null : doorNear(), cn = skip || dn ? null : chestNear(), nn = !skip && !dn && !cn && npcNear(), sn = !skip && !dn && !cn && !nn && standNear(), tn = !skip && !dn && !cn && !nn && !sn && trapNear(), gn = !skip && !dn && !cn && !nn && !sn && !tn && gateNear(), jn = !skip && !dn && !cn && !nn && !sn && !tn && !gn && jewelNear(), an2 = skip || dn || cn || nn || sn || tn || gn || jn ? null : animalNear(), wn = skip || dn || cn || an2 ? null : stationNear(3), hn = skip || dn || cn || wn || !SC ? null : holeNear(); if (dn) toggleDoor(dn.x, dn.y, true); else if (cn) openChest(cn.x, cn.y); else if (nn) talkCroaker(); else if (sn) openStand(sn.x, sn.y); else if (tn) emptyTrap(tn.x, tn.y); else if (gn) openGate(gn.x, gn.y); else if (jn) openJewel(jn.x, jn.y); else if (an2) useAnimal(an2); else if (wn) openStn(wn.k, wn.x, wn.y); else if (hn) enterCave(hn.x, hn.y); else trySleep(); }
    }
    else if (k === "q" || k === "Q") { var h2 = hot(); choose(sel === "pick" ? (h2[0] || (S.wpn ? "weapon" : "pick")) : "pick"); }
    else return; e.preventDefault(); $("sbxHint").classList.remove("on");
  });
  window.addEventListener("keyup", function (e) {
    var k = e.key; if (k === "ArrowLeft" || k === "a" || k === "A") keys.l = 0; else if (k === "ArrowRight" || k === "d" || k === "D") keys.r = 0; else if (k === " " || k === "ArrowUp" || k === "w" || k === "W") { keys.j = 0; if (k !== " ") keys.u = 0; } else if (k === "ArrowDown" || k === "s" || k === "S") keys.d = 0;
  });
  window.addEventListener("blur", function () { keys.l = keys.r = keys.j = keys.u = keys.d = 0; tk.l = tk.r = tk.j = tk.u = tk.d = 0; aim.down = false; });
  $("sbxBar").addEventListener("click", function (e) { var b = e.target.closest("[data-sel]"); if (b) choose(b.getAttribute("data-sel"), +b.getAttribute("data-slot")); });
  $("sbxTrail").addEventListener("click", function () { var q = MAIN[S.qi], rc = q && QRC[q.id], r = rc && recById(rc); if (r && !recStatus(r).owned) openCraftTo(rc); else openPanel("quests"); });
  $("sbxTip").addEventListener("click", function (e) { var b = e.target.closest("[data-tip]"); if (!b) return; var rc = $("sbxTip").getAttribute("data-rc"); hideTip(); if (b.getAttribute("data-tip") === "show" && rc) openCraftTo(rc); });
  $("sbxMenuBtn").addEventListener("click", function () { if (packOpen || mapOpen || stnOpen) { closePanel(); openPanel(); } else if (panelOpen) closePanel(); else openPanel(); });
  $("sbxPackBtn").addEventListener("click", function () { packOpen ? closePack() : openPack(); });
  $("sbxPack").addEventListener("click", function (e) { if (e.target === this) closePack(); });
  function panelClick(e) {
    var t = e.target.closest("button"); if (!t) return;
    if (t.hasAttribute("data-close")) return closePanel();
    if (t.hasAttribute("data-charm")) { wearCharm(t.getAttribute("data-charm")); if (packOpen) renderPack(); if (panelOpen) renderPanel(); return; }
    if (t.hasAttribute("data-story")) { var sc = +t.getAttribute("data-story"); closePanel(); return showStory(sc); }
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
    if (t.hasAttribute("data-diff")) { var dv = clamp(+t.getAttribute("data-diff") || 0, 0, 2); if (MP.on && MP.role === "guest") { nag("The host picks the difficulty in their world."); return; } S.diff = dv; toast("Difficulty: " + DIFF[dv].n + ". " + DIFF[dv].d, DIFF[dv].c); save(); return renderPanel(); }
    if (t.hasAttribute("data-hungertoggle")) { S.nohunger = S.nohunger ? 0 : 1; if (!S.nohunger && S.food < 50) S.food = 50; shownFood = -1; drawFood(); save(); return renderPanel(); }
    if (t.hasAttribute("data-musictoggle")) { MUS.on = !MUS.on; try { localStorage.setItem("swamp-delve-music", MUS.on ? "1" : "0"); } catch (e) {} return renderPanel(); }
    if (t.hasAttribute("data-musvol")) { MUS.vol = clamp(Math.round((MUS.vol + 0.1 * +t.getAttribute("data-musvol")) * 10) / 10, 0, 1); try { localStorage.setItem("swamp-delve-musicvol", String(MUS.vol)); } catch (e) {} return renderPanel(); }
    if (t.hasAttribute("data-mpopen")) { closePanel(); return openMPV(); }
    if (t.hasAttribute("data-wxtoggle")) { WX.on = !WX.on; WX.drops.length = 0; try { localStorage.setItem("swamp-delve-weather", WX.on ? "1" : "0"); } catch (e) {} return renderPanel(); }
    if (t.hasAttribute("data-minitoggle")) { MINI.on = !MINI.on; MINI.t = 0; try { localStorage.setItem("swamp-delve-minimap", MINI.on ? "1" : "0"); } catch (e) {} return renderPanel(); }
    if (t.hasAttribute("data-daytoggle")) { SHOWDAYS = !SHOWDAYS; try { localStorage.setItem("swamp-delve-daycount", SHOWDAYS ? "1" : "0"); } catch (e) {} hud(); return renderPanel(); }
    if (t.hasAttribute("data-ui")) { var uv = +t.getAttribute("data-ui"); setUi(uv === 0 ? 1 : UIS + uv * 0.1); return renderPanel(); }
    if (t.hasAttribute("data-zoom")) { var Z = [0.8, 1, 1.25, 1.5, 2], zi = clamp(Z.indexOf(S.zoom) + +t.getAttribute("data-zoom"), 0, Z.length - 1); S.zoom = Z[zi]; resize(); return renderPanel(); }
    if (t.hasAttribute("data-camp")) { respawn("Back at camp."); return closePanel(); }
    if (t.hasAttribute("data-wl-open")) return openWorlds();
  }
  $("sbxPanel").addEventListener("click", panelClick); $("sbxPack").addEventListener("click", panelClick); $("sbxStn").addEventListener("click", panelClick);
  $("sbxMPV").addEventListener("click", mpClick); $("sbxMPChip").addEventListener("click", function (e) { if (e.target.closest("[data-mp=chat]")) return openChat(); openMPV(); });
  $("sbxChatIn").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); sendChat(); } else if (e.key === "Escape") { e.preventDefault(); $("sbxChat").hidden = true; e.target.blur(); drawChat(); } e.stopPropagation(); });
  $("sbxChatGo").addEventListener("click", sendChat);
  setInterval(drawChat, 2000);
  $("sbxMPV").addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "mpCode") { e.preventDefault(); mpJoin(e.target.value, $("mpName") ? $("mpName").value : mpName); } });
  $("sbxMini").addEventListener("click", function () { if (!panelOpen && !cave) openMap(); });
  $("sbxMini").addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && !panelOpen && !cave) { e.preventDefault(); openMap(); } });
  $("sbxStory").addEventListener("click", function (e) { var jb = e.target.closest("[data-jewel]"); if (jb && jewelAt && storyOpen === 202) { if (!jb.disabled) jewelAct(jb.getAttribute("data-jewel")); return; } var gb = e.target.closest("[data-gate]"); if (gb && gateAt && storyOpen === 201) { if (!gb.disabled) gateAct(gb.getAttribute("data-gate")); return; } var sb = e.target.closest("[data-stand]"); if (sb && standAt) { standAct(sb.getAttribute("data-stand")); return; } var ta = e.target.closest("[data-talk]"); if (ta) { talkAct(ta.getAttribute("data-talk")); return; } if (e.target === this || e.target.closest("[data-story-close]")) closeStory(); });
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
    var paused = (panelOpen || menuOpen || titleOpen) && !trans && !MP.on;
    if (now - lastDraw < (titleOpen && !panelOpen && !menuOpen ? 15 : paused ? 100 : 10)) { requestAnimationFrame(loop); return; }   // PERF: 120/144 Hz screens draw every other frame; a paused game (menus open) redraws about 10 times a second
    lastDraw = now;
    var raw = (now - last) / 1000 || 0.016, dt = Math.min(0.05, raw); last = now;
    if (!titleOpen) { pumpToasts(); pumpPops(); }
    // automatic quality: if a device is struggling for ~2 seconds, switch off the optional sparkle (ambient motes, aurora, glints)
    if (!paused && !document.hidden && raw < 0.5) { frN++; if (raw > 0.026) slowN++; if (frN >= 90) { if (slowN > 55) { if (dprCap > 1) { dprCap = 1; try { localStorage.setItem("swamp-delve-q", "1"); } catch (e) {} resize(); } else reduce = true; } frN = slowN = 0; } }
    if (!document.hidden) { if (trans) tickTrans(dt); if ((MP.on || (!panelOpen && !menuOpen)) && !trans && !titleOpen) { if (cave) caveUpdate(dt); else update(dt); } else if (titleOpen && !cave && !trans) titleTick(dt, now); mpTick(dt); if (cave) renderCave(now); else render(now); drawTrans(); if (hbDirty) drawBar(); if (mapOpen) drawMapView(); }
    requestAnimationFrame(loop);
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) save(); });
  window.addEventListener("pagehide", function () { save(); var e = curEntry(); if (CLOUD.state === "on" && e && e.cdirty && !e.conflict && !CLOUD.busy) cloudPush(curId, true); });
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stageEl);

  buildAtlas(); load(); resize(); stageEl.style.setProperty("--cs", (UIS = clamp(UIS, 0.6, 1.8))); mkSprite(); drawBar();
  $("sbxHint").textContent = S.qi === 0 ? (coarse ? "Use the arrows to walk. Hold your finger on tree leaves to gather Sticks." : "A / D walk, Space jumps. Hold the mouse on tree leaves to gather Sticks.") : coarse ? "Use the arrows to walk. Press and hold to dig; the target box sits just above your finger." : "A / D walk, Space jumps. Hold the mouse on a block to dig. E opens your Journal, B your Backpack.";
  stageEl.classList.add("title"); titleEl.hidden = false; cam.x = p.x; cam.y = titleCamTarget(); renderTitle(); drawTitleLogo(performance.now());
  window.__sbxReady = true; if (window.__dlDone) window.__dlDone();   // tell the loading screen the world is built
  // UI feel: a soft tick on every button in a window (follows the sound switch), and mouse-wheel scrolling across the category chip rows
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button"); if (!b || b.disabled) return;
    if (!b.closest("#sbxPanel, #sbxPack, #sbxStn, #sbxStory, #sbxWorlds, #sbxTip, #sbxMPV, #sbxTitle")) return;
    thud(b.classList.contains("op-sw") ? (b.classList.contains("on") ? 520 : 760) : 640 + Math.random() * 120, 0.018);
  }, true);
  document.addEventListener("wheel", function (e) {
    var row = e.target.closest && e.target.closest(".sbx-cats, .sbx-subs"); if (!row || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
    if (row.scrollWidth <= row.clientWidth) return; row.scrollLeft += e.deltaY; e.preventDefault();
  }, { passive: false });
  requestAnimationFrame(loop);
  window.__sbx = { setWall: setWall, get titleOpen() { return titleOpen; }, openTitle: openTitle, closeTitle: closeTitle, cam: cam, exAll: function () { ex.fill(1); }, hurt: function (n, w) { hurt(n, w); }, get hp() { return hp; }, craftAll: function () { return craftAll(); }, BENCH_LV: BENCH_LV, PICKS: PICKS, dropQty: dropQty, openJewel: openJewel, wDmg: function () { return wDmg(); }, armRed: function () { return armRed(); }, openGate: openGate, gateAct: gateAct, gates: function () { return S.gates; }, curCh: function () { return curCh(); }, place: place, breakTile: breakTile, tickTraps: tickTraps, emptyTrap: emptyTrap, sprinkled: sprinkled, trapNear: trapNear, plantCrop: plantCrop, enterBuilding: enterBuilding, structNear: structNear, structs: function () { return world.structs; }, get cave() { return cave; }, cp: cp, enterCave: enterCave, useLadder: useLadder, holeNear: holeNear, ladderNear: ladderNear, leaveCaveNow: leaveCaveNow, setFloor: setFloor, get trans() { return trans; }, blocks: blocks, worlds: function () { return wIdx; }, createWorld: createWorld, switchWorld: switchWorld, deleteWorld: deleteWorld, openWorlds: openWorlds, save: save, enemies: enemies, newEnemy: newEnemy, spawnBat: spawnBat, trySleep: trySleep, wear: wear, durOf: durOf, repair: repair, openChest: openChest, chestNear: chestNear, toggleDoor: toggleDoor, doorNear: doorNear, bedNear: bedNear, spawnEnemy: spawnEnemy, strike: strike, ENEMY: ENEMY, setHp: function (v) { hp = v; }, WEAPONS: WEAPONS, bar: function () { return barEntries().map(function (e) { return e.id; }).filter(Boolean); }, room: room, reslot: reslot, view: function () { return { ts: ts, ox: ox, oy: oy }; }, get S() { return S; }, p: p, get: get, tiles: function () { return tiles; }, world: function () { return world; }, choose: choose, craft: craft, openPanel: openPanel, give: give, reveal: reveal, trail: function () { return S.trail; }, TRAIL: TRAIL, checkTrail: checkTrail, farmStep: farmStep, eat: eat, clean: clean, wilds: function () { return wilds; }, newAnimal: newAnimal, useAnimal: useAnimal, get fishing() { return fishing; }, standNear: standNear, openStand: openStand, flies: function () { return flies; }, aim: aim, get sel() { return sel; }, get bare() { return bare; }, npc: npc, openStn: openStn, MP: MP, mpHost: mpHost, mpJoin: mpJoin, mpLeave: mpLeave, openMPV: openMPV, openChat: openChat, CHARMS: CHARMS, wearCharm: wearCharm, hasCharm: hasCharm, WX: WX, wxNew: wxNew, wxLabel: wxLabel, CLOUD: CLOUD, cloudPush: cloudPush, cloudPull: cloudPull, wIdx: function () { return wIdx; }, curId: function () { return curId; }, MUS: MUS, MINI: MINI, musicMood: musicMood, rollBounties: rollBounties, btyReady: btyReady, claimBty: claimBty, buyShop: buyShop, BSHOP: BSHOP, renderTalk: renderTalk, activeBoss: activeBoss, newBoss: newBoss, bshots: bshots, BOSS: BOSS, useSummon: useSummon, talkCroaker: talkCroaker, giftsWaiting: giftsWaiting, MAIN: MAIN, SIDE: SIDE, showStory: showStory, get qi() { return S.qi; }, colAt: function (x) { return col[x]; }, setT: setT };
})();
