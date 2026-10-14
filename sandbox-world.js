// ===== SwampRealms: Delve - world data and generator (Stage 1) =====
// Pure data + terrain generation, no DOM. Global: SbxWorld (also module.exports so it can be tested in Node).
// The same seed always builds the same world. Player edits are stored separately as a small diff (see sandbox.js).
(function (root) {
  "use strict";
  // World size in tiles and the average surface row. The world is a long open map and you start in the MIDDLE:
  // Frostfen lies west (left), Murkwater Swamp is the home area, Ember Bog lies east (right). Each area is 720 tiles wide (2160 in all, 3x the old world).
  // WORLDVER 4: the world was rebuilt bigger. Saves from an older version keep items and progress but not their digging, map or chests (see clean() in sandbox.js).
  var W = 2160, H = 140, SURF = 34, WORLDVER = 4, B_FROST = 720, B_EMBER = 1440, SPAWNX = 1080;
  var T = { AIR: 0, MOSS: 1, MUD: 2, CLAY: 3, STONE: 4, LOG: 5, LEAVES: 6, WATER: 7, BASALT: 8, LAVA: 9, ASH: 10, SNOW: 11, ICE: 12, FROSTROCK: 13, SPORE: 14, CINDER: 15, CRYSTAL: 16, BEDROCK: 17, PLANKS: 18, TORCH: 19, GLOWCAP: 20, REED: 21, BLOOM: 22, SPIKE: 23, VINE: 24, BENCH: 25, BED: 26, DOOR_B: 27, DOOR_T: 28, DOORO_B: 29, DOORO_T: 30, LADDER: 31, CHEST: 32, HOLE: 33, CHAIR: 34, CHAIR_L: 35, TABLE: 36, PAINTING: 37, FLOWER: 38, BUCKET: 39, POT: 40, FLOWERPOT: 41, BARREL: 42, DECORBENCH: 43, STOOL: 44, RUG: 45, BOOKSHELF: 46, LANTERN: 47, BANNER: 48, SIGN: 49, PLANTER: 50, CAMPFIRE: 51, W_PLANK: 52, W_LOG: 53, W_BRICK: 54, W_PLASTER: 55, W_MOSS: 56, W_TIMBER: 57, BRICK: 58, THATCH: 59, GLASS: 60, BASALTBRICK: 61, CINDERLAMP: 62, ICEBRICK: 63, CRYSTALLAMP: 64, FOUNTAIN: 65, WELL: 66, CAULDRON: 67, FENCE: 68, BALE: 69, GLOWPOT: 70, WARDROBE: 71, HEARTH: 72, FROGSTATUE: 73, BRAZIER: 74, GUARDIAN: 75, EMBERLANTERN: 76, URN: 77, ANVIL: 78, ICESCULPT: 79, FROSTLANTERN: 80, THRONE: 81, SCONCE: 82, BUGTROPHY: 83, FROGTROPHY: 84, EMBERBANNER: 85, CHANDELIER: 86, FROSTBANNER: 87, MDOOR: 88, RAIDBANNER: 89, MWIN: 90, MROOF: 91 };

  // Tile table, indexed by id.  hard = seconds to mine with the starter pick (Infinity = cannot be mined),
  // tier = lowest pick tier that can mine it, drop = item id you get, light = light level it gives off (0-15),
  // solid = blocks movement, c/c2 = base and speckle colours used by the tile painter.
  var TILES = [];
  function tile(id, n, c, c2, hard, tier, drop, solid, light, kind) { TILES[id] = { id: id, n: n, c: c, c2: c2, hard: hard, tier: tier, drop: drop, solid: solid, light: light || 0, kind: kind || "" }; }
  tile(T.AIR, "Air", "#000", "#000", Infinity, 0, null, false);
  tile(T.MOSS, "Mossy Mud", "#4a3a28", "#5d4833", 0.5, 1, "mud", true, 0, "moss");
  tile(T.MUD, "Mud", "#4a3a28", "#5d4833", 0.5, 1, "mud", true);
  tile(T.CLAY, "Clay", "#8b7a62", "#a08d72", 0.6, 1, "clay", true);
  tile(T.STONE, "Stone", "#6b7276", "#82898d", 1.3, 1, "stone", true);
  tile(T.LOG, "Swamp Log", "#5e4024", "#2e1d10", 0.9, 1, "wood", true, 0, "log");
  tile(T.LEAVES, "Leaves", "#2f7a3c", "#46a352", 0.15, 1, "leaves", true, 0, "leaves");
  tile(T.WATER, "Water", "#2a8f95", "#5fd0cf", Infinity, 0, null, false, 0, "water");
  tile(T.BASALT, "Basalt", "#3b3036", "#55444d", 2.2, 2, "basalt", true);
  tile(T.LAVA, "Lava", "#ff6a1f", "#ffc24a", Infinity, 0, null, false, 13, "lava");
  tile(T.ASH, "Ash Soil", "#6d625d", "#877b74", 0.5, 1, "ash", true, 0, "ash");
  tile(T.SNOW, "Snow", "#e9f6fb", "#c8e4ef", 0.35, 1, "snow", true, 0, "snow");
  tile(T.ICE, "Ice", "#9fd8ef", "#d2f2fc", 0.8, 1, "ice", true, 0, "ice");
  tile(T.FROSTROCK, "Frostrock", "#5d7c93", "#7c9db4", 3.0, 3, "frostrock", true);
  tile(T.SPORE, "Glowspore Ore", "#6b7276", "#4ee6b4", 1.4, 1, "spore", true, 8, "ore");
  tile(T.CINDER, "Cinder Ore", "#3b3036", "#ff8a3d", 2.4, 2, "cinder", true, 7, "ore");
  tile(T.CRYSTAL, "Frost Crystal Ore", "#5d7c93", "#bff4ff", 3.2, 3, "crystal", true, 8, "ore");
  tile(T.BEDROCK, "Bedrock", "#1c1a22", "#2c2934", Infinity, 99, null, true);
  tile(T.PLANKS, "Planks", "#b9793f", "#dc9a58", 0.8, 1, "planks", true, 0, "planks");
  tile(T.TORCH, "Torch", "#000", "#ffb13b", 0.05, 1, "torch", false, 13, "torch");
  tile(T.GLOWCAP, "Glowcap", "#000", "#4ee6b4", 0.1, 1, "spore", false, 6, "glowcap");
  tile(T.REED, "Cattail", "#000", "#6aa347", 0.05, 1, null, false, 0, "reed");
  tile(T.BLOOM, "Ember Bloom", "#000", "#ff8a3d", 0.05, 1, null, false, 5, "bloom");
  tile(T.SPIKE, "Frost Spike", "#000", "#9fe8ff", 0.05, 1, null, false, 3, "spike");
  tile(T.VINE, "Hanging Vine", "#000", "#3f8f3a", 0.05, 1, null, false, 0, "vine");

  tile(T.BENCH, "Bog Workbench", "#000", "#c98c4f", 0.4, 0, "bench", false, 0, "bench");
  tile(T.BED, "Swamp Bed", "#000", "#8d63c9", 0.4, 0, "bed", false, 0, "bed");   // sleep in it at night: skips to dawn, heals, sets your respawn
  // Doors are two tiles tall (bottom + top). Closed halves are solid; open halves are not, so you walk through. Either half drops one Door.
  tile(T.DOOR_B, "Swamp Door", "#9a6234", "#c98c4f", 0.6, 1, "door", true, 0, "door");
  tile(T.DOOR_T, "Swamp Door", "#9a6234", "#c98c4f", 0.6, 1, "door", true, 0, "door");
  tile(T.DOORO_B, "Open Door", "#9a6234", "#c98c4f", 0.6, 1, "door", false, 0, "door");
  tile(T.DOORO_T, "Open Door", "#9a6234", "#c98c4f", 0.6, 1, "door", false, 0, "door");
  TILES[T.DOOR_B].door = { top: false, open: false, other: T.DOOR_T, toggle: T.DOORO_B }; TILES[T.DOOR_T].door = { top: true, open: false, other: T.DOOR_B, toggle: T.DOORO_T };
  TILES[T.DOORO_B].door = { top: false, open: true, other: T.DOORO_T, toggle: T.DOOR_B }; TILES[T.DOORO_T].door = { top: true, open: true, other: T.DOORO_B, toggle: T.DOOR_T };
  tile(T.LADDER, "Ladder", "#000", "#b9793f", 0.1, 0, "ladder", false, 0, "ladder");   // climb it: Jump goes up, S / Down goes down
  tile(T.CHEST, "Wooden Chest", "#000", "#a8703c", 0.5, 0, "chest", false, 0, "chest");   // stores items; tap it or press F nearby to open it
  // Furniture: plain decoration, not solid, breaks by hand and gives the item back. Chairs face the way you were looking when you placed them.
  // A Painting shows random coloured pixels, different at every spot (see paintingCanvas in sandbox.js: it can show your own images instead).
  tile(T.CHAIR, "Wooden Chair", "#000", "#b9793f", 0.4, 0, "chair", false, 0, "chair");
  tile(T.CHAIR_L, "Wooden Chair", "#000", "#b9793f", 0.4, 0, "chair", false, 0, "chair");
  tile(T.TABLE, "Wooden Table", "#000", "#b9793f", 0.4, 0, "table", false, 0, "table");
  tile(T.PAINTING, "Painting", "#000", "#c98c4f", 0.3, 0, "painting", false, 0, "painting");
  // Village knick-knacks: small, not solid, break by hand and give themselves back. They need solid ground under them to be placed.
  // Flowers come in four colours (chosen by position, like leaves) and sway in the wind like cattails.
  tile(T.FLOWER, "Swamp Flower", "#000", "#ff6fb5", 0.05, 0, "flower", false, 0, "flower");
  tile(T.BUCKET, "Wooden Bucket", "#000", "#b9793f", 0.3, 0, "bucket", false, 0, "bucket");
  tile(T.POT, "Clay Pot", "#000", "#c46a3c", 0.3, 0, "pot", false, 0, "pot");
  tile(T.FLOWERPOT, "Flower Pot", "#000", "#c46a3c", 0.3, 0, "flowerpot", false, 0, "flowerpot");
  tile(T.BARREL, "Barrel", "#000", "#9a6234", 0.4, 0, "barrel", false, 0, "barrel");
  // Decor Workbench pieces (see DECOR in sandbox.js). All are non-solid, break by hand and give themselves back. To add one: a tile line here, an ITEMS entry + ITEM_ORDER + DECOR_FLOOR / DECOR_WALL below,
  // a drawing in paint() (sandbox.js) and a recipe in DECOR (sandbox.js).
  tile(T.DECORBENCH, "Decor Workbench", "#000", "#7fc9a0", 0.4, 0, "decorbench", false, 0, "decorbench");
  tile(T.STOOL, "Stool", "#000", "#b9793f", 0.3, 0, "stool", false, 0, "stool");
  tile(T.RUG, "Reed Rug", "#000", "#8d63c9", 0.2, 0, "rug", false, 0, "rug");
  tile(T.BOOKSHELF, "Bookshelf", "#000", "#a8703c", 0.5, 0, "bookshelf", false, 0, "bookshelf");
  tile(T.LANTERN, "Clay Lantern", "#000", "#ffb13b", 0.3, 0, "lantern", false, 12, "lantern");
  tile(T.BANNER, "Swamp Banner", "#000", "#22a883", 0.2, 0, "banner", false, 0, "banner");
  tile(T.SIGN, "Wooden Sign", "#000", "#c98c4f", 0.2, 0, "sign", false, 0, "sign");
  tile(T.PLANTER, "Flower Planter", "#000", "#5fb24a", 0.4, 0, "planter", false, 0, "planter");
  tile(T.CAMPFIRE, "Campfire", "#000", "#ff7a1f", 0.3, 0, "campfire", false, 13, "campfire");

  // ---- DECOR EXPANSION: new solid building blocks and a themed set of showpieces for each biome (see DECOR in sandbox.js for the recipes and the Workbench level each needs) ----
  // Blocks are solid and place like Planks (they are NOT decor, so they stack to 64). Showpieces are non-solid decor. light = glow level; tile.glow = "r,g,b" tints the glow, gr/ga = its radius and strength.
  tile(T.BRICK, "Stone Brick", "#80868a", "#a3aaae", 1.2, 1, "brick", true, 0, "brick");
  tile(T.THATCH, "Reed Thatch", "#c9a85a", "#e0c177", 0.4, 1, "thatch", true, 0, "thatch");
  tile(T.GLASS, "Glowspore Glass", "#7fe8d0", "#bffff0", 0.3, 1, "glass", true, 0, "glass");
  tile(T.BASALTBRICK, "Basalt Brick", "#3b3036", "#55444d", 1.6, 1, "basaltbrick", true, 0, "basaltbrick");
  tile(T.CINDERLAMP, "Cinder Lamp Block", "#2a2228", "#ff8a3d", 1.2, 1, "cinderlamp", true, 14, "cinderlamp");
  tile(T.ICEBRICK, "Frost Brick", "#9fd8ef", "#e8fbff", 1.2, 1, "icebrick", true, 0, "icebrick");
  tile(T.CRYSTALLAMP, "Crystal Lamp Block", "#5d7c93", "#bff4ff", 1.2, 1, "crystallamp", true, 14, "crystallamp");
  tile(T.FOUNTAIN, "Mossy Fountain", "#000", "#4fb6c9", 0.5, 0, "fountain", false, 0, "fountain");
  tile(T.WELL, "Swamp Well", "#000", "#7f868a", 0.5, 0, "well", false, 0, "well");
  tile(T.CAULDRON, "Bubbling Cauldron", "#000", "#4ee6b4", 0.4, 0, "cauldron", false, 8, "cauldron");
  tile(T.FENCE, "Wooden Fence", "#000", "#c98c4f", 0.3, 0, "fence", false, 0, "fence");
  tile(T.BALE, "Reed Bale", "#000", "#c9b36a", 0.3, 0, "bale", false, 0, "bale");
  tile(T.GLOWPOT, "Glowcap Pot", "#000", "#4ee6b4", 0.3, 0, "glowpot", false, 7, "glowpot");
  tile(T.WARDROBE, "Swamp Wardrobe", "#000", "#a8703c", 0.5, 0, "wardrobe", false, 0, "wardrobe");
  tile(T.HEARTH, "Stone Hearth", "#000", "#ff7a1f", 0.5, 0, "hearth", false, 13, "hearth");
  tile(T.FROGSTATUE, "Frog Statue", "#000", "#8e969b", 0.5, 0, "frogstatue", false, 3, "frogstatue");
  tile(T.BRAZIER, "Cinder Brazier", "#000", "#ff6a1f", 0.4, 0, "brazier", false, 14, "brazier");
  tile(T.GUARDIAN, "Basalt Guardian", "#000", "#55444d", 0.5, 0, "guardian", false, 3, "guardian");
  tile(T.EMBERLANTERN, "Ember Lantern", "#000", "#ff8a3d", 0.3, 0, "emberlantern", false, 12, "emberlantern");
  tile(T.URN, "Ashen Urn", "#000", "#8a7a72", 0.3, 0, "urn", false, 0, "urn");
  tile(T.ANVIL, "Cinder Anvil", "#000", "#4a4a54", 0.5, 0, "anvil", false, 5, "anvil");
  tile(T.ICESCULPT, "Ice Sculpture", "#000", "#bff4ff", 0.4, 0, "icesculpt", false, 4, "icesculpt");
  tile(T.FROSTLANTERN, "Frost Lantern", "#000", "#7fd6ff", 0.3, 0, "frostlantern", false, 12, "frostlantern");
  tile(T.THRONE, "Frostrock Throne", "#000", "#9fd8ef", 0.6, 0, "throne", false, 5, "throne");
  tile(T.SCONCE, "Glowspore Sconce", "#000", "#4ee6b4", 0.2, 0, "sconce", false, 10, "sconce");
  tile(T.BUGTROPHY, "Bramble Trophy", "#000", "#9a52a8", 0.2, 0, "bugtrophy", false, 0, "bugtrophy");
  tile(T.FROGTROPHY, "Frog Trophy", "#000", "#6fe08a", 0.2, 0, "frogtrophy", false, 0, "frogtrophy");
  tile(T.EMBERBANNER, "Ember Banner", "#000", "#ff8a3d", 0.2, 0, "emberbanner", false, 0, "emberbanner");
  tile(T.CHANDELIER, "Crystal Chandelier", "#000", "#bff4ff", 0.3, 0, "chandelier", false, 14, "chandelier");
  tile(T.FROSTBANNER, "Frost Banner", "#000", "#7fd6ff", 0.2, 0, "frostbanner", false, 0, "frostbanner");
  [[T.CINDERLAMP, "255,130,50", 4.4, 0.3], [T.CRYSTALLAMP, "170,235,255", 4.4, 0.3], [T.CAULDRON, "80,240,190", 3, 0.2], [T.GLOWPOT, "80,240,190", 2.6, 0.17], [T.HEARTH, "255,170,60", 5, 0.33], [T.BRAZIER, "255,130,50", 5.2, 0.36],
   [T.EMBERLANTERN, "255,150,60", 4.2, 0.28], [T.ANVIL, "255,120,50", 2, 0.12], [T.ICESCULPT, "150,225,255", 2.2, 0.14], [T.FROSTLANTERN, "150,225,255", 4.2, 0.28], [T.THRONE, "150,225,255", 2.2, 0.12], [T.SCONCE, "80,240,190", 3.6, 0.24],
   [T.CHANDELIER, "180,235,255", 5.2, 0.34], [T.FROGSTATUE, "80,240,190", 2, 0.12], [T.GUARDIAN, "255,120,50", 2, 0.12]].forEach(function (g) { TILES[g[0]].glow = g[1]; TILES[g[0]].gr = g[2]; TILES[g[0]].ga = g[3]; });
  // BACK WALLS (Terraria style): a second layer BEHIND the blocks. These ids are never placed as blocks; the wall layer (walls[] in sandbox.js) stores the tile id of the wall art, so the
  // same ids give the item icons and the atlas pictures. You walk in front of a wall, and furniture and decor stand in front of it. To add one: an id in T, a line here,
  // an ITEMS entry (wall: id) + ITEM_ORDER, a picture in paintWall() (sandbox.js) and a recipe in RECIPES (sandbox.js).
  tile(T.W_PLANK, "Plank Wall", "#7d5230", "#96643a", 0.5, 0, "wall_plank", false, 0, "wall");
  tile(T.W_LOG, "Log Wall", "#6b4526", "#8a5a32", 0.5, 0, "wall_log", false, 0, "wall");
  tile(T.W_BRICK, "Stone Brick Wall", "#566066", "#7a858c", 0.5, 0, "wall_brick", false, 0, "wall");
  tile(T.W_PLASTER, "Plaster Wall", "#d8c8a2", "#e8dcba", 0.5, 0, "wall_plaster", false, 0, "wall");
  tile(T.W_MOSS, "Mossy Wall", "#3b4426", "#58742f", 0.5, 0, "wall_moss", false, 0, "wall");
  tile(T.W_TIMBER, "Timber Frame Wall", "#d6c59c", "#5a3a1e", 0.5, 0, "wall_timber", false, 0, "wall");
  // Swamp Manor pieces (the Swamp Dwellers' mansion, see buildManor). Scenery only: never craftable, cannot be broken. MWIN glows amber, so the windows are lit at night.
  tile(T.MDOOR, "Manor Door", "#4a2c16", "#7a4a26", Infinity, 0, null, true, 6, "mdoor");
  tile(T.RAIDBANNER, "Dweller Banner", "#7a1f1a", "#c2362b", Infinity, 0, null, true, 0, "raidbanner");
  tile(T.MWIN, "Manor Window", "#2a1c10", "#ffb13b", Infinity, 0, null, true, 9, "mwin");
  tile(T.MROOF, "Manor Shingles", "#2b2a33", "#43414f", Infinity, 0, null, true, 0, "mroof");
  TILES[T.MWIN].glow = "255,170,60"; TILES[T.MWIN].gr = 3.2; TILES[T.MWIN].ga = 0.22;
  TILES[T.MDOOR].glow = "255,150,50"; TILES[T.MDOOR].gr = 3; TILES[T.MDOOR].ga = 0.14;
  // Cave Hole: a little burrow in the ground. It cannot be broken or built on; tap it (or press F nearby) to climb down into a top-down cave (see sandbox-cave.js).
  tile(T.HOLE, "Cave Hole", "#000", "#1a1410", Infinity, 0, null, false, 2, "hole");
  // Stage 1 (Paws to Pick): bare paws can break soft things; a pick is needed for wood, clay, stone and ore.
  [T.MOSS, T.MUD, T.ASH, T.SNOW, T.LEAVES, T.TORCH, T.GLOWCAP, T.REED, T.BLOOM, T.SPIKE, T.VINE].forEach(function (i) { TILES[i].tier = 0; });
  TILES[T.REED].drop = "fiber"; TILES[T.VINE].drop = "fiber";   // cattails are rare on some seeds, so hanging vines give fiber too

  // Items. tile = the block it places (undefined = material only). mat = how the icon is drawn for loose materials.
  var ITEMS = {
    wood: { n: "Wood", tile: T.LOG }, mud: { n: "Mud", tile: T.MUD }, clay: { n: "Clay", tile: T.CLAY }, stone: { n: "Stone", tile: T.STONE },
    planks: { n: "Planks", tile: T.PLANKS }, torch: { n: "Torch", tile: T.TORCH }, leaves: { n: "Leaves", tile: T.LEAVES },
    snow: { n: "Snow", tile: T.SNOW }, ice: { n: "Ice", tile: T.ICE }, basalt: { n: "Basalt", tile: T.BASALT }, ash: { n: "Ash Soil", tile: T.ASH },
    frostrock: { n: "Frostrock", tile: T.FROSTROCK },
    stick: { n: "Stick", mat: "stick" }, fiber: { n: "Reed Fiber", mat: "fiber" }, pebble: { n: "Pebble", mat: "pebble" }, bench: { n: "Bog Workbench", tile: T.BENCH }, bed: { n: "Swamp Bed", tile: T.BED }, door: { n: "Swamp Door", tile: T.DOOR_B }, ladder: { n: "Ladder", tile: T.LADDER }, chest: { n: "Wooden Chest", tile: T.CHEST }, chair: { n: "Wooden Chair", tile: T.CHAIR }, table: { n: "Wooden Table", tile: T.TABLE }, painting: { n: "Painting", tile: T.PAINTING },
    flower: { n: "Swamp Flower", tile: T.FLOWER }, bucket: { n: "Wooden Bucket", tile: T.BUCKET }, pot: { n: "Clay Pot", tile: T.POT }, flowerpot: { n: "Flower Pot", tile: T.FLOWERPOT }, barrel: { n: "Barrel", tile: T.BARREL },
    spore: { n: "Glowspore", gem: "#4ee6b4" }, cinder: { n: "Cinder Shard", gem: "#ff8a3d" }, crystal: { n: "Frost Crystal", gem: "#bff4ff" },
    bugfrag: { n: "Bramble Fragment", frag: "bug" }, frogfrag: { n: "Frog Fragment", frag: "frog" },   // enemy loot, same names as the Adventure Fragments
    batwing: { n: "Bat Wing", frag: "bat" }   // Dusk Bat loot (Delve only: the Adventure has no bat Fragment, so Fragments.add ignores it)
  };
  Object.assign(ITEMS, {
    wall_plank: { n: "Plank Wall", tile: T.W_PLANK, wall: T.W_PLANK }, wall_log: { n: "Log Wall", tile: T.W_LOG, wall: T.W_LOG }, wall_brick: { n: "Stone Brick Wall", tile: T.W_BRICK, wall: T.W_BRICK },
    wall_plaster: { n: "Plaster Wall", tile: T.W_PLASTER, wall: T.W_PLASTER }, wall_moss: { n: "Mossy Wall", tile: T.W_MOSS, wall: T.W_MOSS }, wall_timber: { n: "Timber Frame Wall", tile: T.W_TIMBER, wall: T.W_TIMBER }
  });
  Object.assign(ITEMS, {
    decorbench: { n: "Decor Workbench", tile: T.DECORBENCH }, stool: { n: "Stool", tile: T.STOOL }, rug: { n: "Reed Rug", tile: T.RUG }, bookshelf: { n: "Bookshelf", tile: T.BOOKSHELF },
    lantern: { n: "Clay Lantern", tile: T.LANTERN }, banner: { n: "Swamp Banner", tile: T.BANNER }, sign: { n: "Wooden Sign", tile: T.SIGN }, planter: { n: "Flower Planter", tile: T.PLANTER }, campfire: { n: "Campfire", tile: T.CAMPFIRE }
  });
  Object.assign(ITEMS, {
    brick: { n: "Stone Brick", tile: T.BRICK }, thatch: { n: "Reed Thatch", tile: T.THATCH }, glass: { n: "Glowspore Glass", tile: T.GLASS }, basaltbrick: { n: "Basalt Brick", tile: T.BASALTBRICK },
    cinderlamp: { n: "Cinder Lamp Block", tile: T.CINDERLAMP }, icebrick: { n: "Frost Brick", tile: T.ICEBRICK }, crystallamp: { n: "Crystal Lamp Block", tile: T.CRYSTALLAMP },
    fountain: { n: "Mossy Fountain", tile: T.FOUNTAIN }, well: { n: "Swamp Well", tile: T.WELL }, cauldron: { n: "Bubbling Cauldron", tile: T.CAULDRON }, fence: { n: "Wooden Fence", tile: T.FENCE }, bale: { n: "Reed Bale", tile: T.BALE },
    glowpot: { n: "Glowcap Pot", tile: T.GLOWPOT }, wardrobe: { n: "Swamp Wardrobe", tile: T.WARDROBE }, hearth: { n: "Stone Hearth", tile: T.HEARTH }, frogstatue: { n: "Frog Statue", tile: T.FROGSTATUE },
    brazier: { n: "Cinder Brazier", tile: T.BRAZIER }, guardian: { n: "Basalt Guardian", tile: T.GUARDIAN }, emberlantern: { n: "Ember Lantern", tile: T.EMBERLANTERN }, urn: { n: "Ashen Urn", tile: T.URN }, anvil: { n: "Cinder Anvil", tile: T.ANVIL },
    icesculpt: { n: "Ice Sculpture", tile: T.ICESCULPT }, frostlantern: { n: "Frost Lantern", tile: T.FROSTLANTERN }, throne: { n: "Frostrock Throne", tile: T.THRONE },
    sconce: { n: "Glowspore Sconce", tile: T.SCONCE }, bugtrophy: { n: "Bramble Trophy", tile: T.BUGTROPHY }, frogtrophy: { n: "Frog Trophy", tile: T.FROGTROPHY },
    emberbanner: { n: "Ember Banner", tile: T.EMBERBANNER }, chandelier: { n: "Crystal Chandelier", tile: T.CHANDELIER }, frostbanner: { n: "Frost Banner", tile: T.FROSTBANNER }
  });
  // Where each decor item may be placed. floor = needs solid ground right under it. wall = hangs on a block beside it or above it (never just resting on the ground).
  // Anything flagged here counts as decor (stack of 16 in the inventory, counts for the "furniture" goals). The village generator uses the same rules.
  var DECOR_FLOOR = ["chair", "table", "bucket", "pot", "flowerpot", "barrel", "flower", "decorbench", "stool", "rug", "bookshelf", "lantern", "planter", "campfire", "fountain", "well", "cauldron", "fence", "bale", "glowpot", "wardrobe", "hearth", "frogstatue", "brazier", "guardian", "emberlantern", "urn", "anvil", "icesculpt", "frostlantern", "throne"],
    DECOR_WALL = ["painting", "banner", "sign", "sconce", "bugtrophy", "frogtrophy", "emberbanner", "chandelier", "frostbanner"];
  DECOR_FLOOR.forEach(function (k) { ITEMS[k].decor = 1; ITEMS[k].put = "floor"; });
  DECOR_WALL.forEach(function (k) { ITEMS[k].decor = 1; ITEMS[k].put = "wall"; });
  var ITEM_ORDER = ["stick", "fiber", "pebble", "wood", "planks", "wall_plank", "wall_log", "wall_timber", "wall_plaster", "wall_brick", "wall_moss", "bench", "bed", "door", "ladder", "chest", "chair", "table", "painting", "flower", "flowerpot", "pot", "bucket", "barrel", "decorbench", "stool", "rug", "bookshelf", "lantern", "banner", "sign", "planter", "campfire", "brick", "thatch", "glass", "basaltbrick", "cinderlamp", "icebrick", "crystallamp", "fountain", "well", "cauldron", "fence", "bale", "glowpot", "wardrobe", "hearth", "frogstatue", "brazier", "guardian", "emberlantern", "urn", "anvil", "icesculpt", "frostlantern", "throne", "sconce", "bugtrophy", "frogtrophy", "emberbanner", "chandelier", "frostbanner", "torch", "mud", "clay", "stone", "leaves", "ash", "basalt", "snow", "ice", "frostrock", "spore", "cinder", "crystal", "bugfrag", "frogfrag", "batwing"];
  var BIOMES = [
    { id: "swamp", n: "Murkwater Swamp", c: "#4ee6b4" },
    { id: "ember", n: "Ember Bog", c: "#ff8a3d" },
    { id: "frost", n: "Frostfen", c: "#7fd6ff" }
  ];

  // ---------- noise ----------
  function hash(x, y, s) {
    var h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, o) {
    var t = 0, a = 0.5, f = 1, n = 0;
    for (var i = 0; i < (o || 3); i++) { t += vnoise(x * f, y * f, s + i * 17) * a; n += a; a *= 0.5; f *= 2; }
    return t / n;
  }
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function smooth(a, b, x) { var k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); }

  // ---------- village ----------
  // Murkwater Swamp (the home area) gets one village: a flat plateau with five plank houses (7 or 9 tiles wide) and a plaza between the
  // second and third. Every house has a door in BOTH side walls so people can walk straight through the village, a lamp beside each door,
  // and a bed, table, chairs and a painting inside. It is built after the trees and decorations and only uses hash() (never rnd()),
  // so all earlier terrain, trees and holes stay exactly as they were. The villagers themselves (swamp avatars) live in sandbox.js.
  function buildVillage(t, top, bio, seed, walls) {
    var GY = SURF, WL = SURF + 2, BL = 7, i, x, y, ws = [], gaps = [3, 9, 3, 3], L = 6;
    for (i = 0; i < 5; i++) { ws.push(hash(i, 701, seed) < 0.5 ? 7 : 9); L += ws[i]; }
    for (i = 0; i < 4; i++) L += gaps[i];
    // a spot where the whole village, its slopes and a small margin lie inside Murkwater and clear of the flat spawn area; try the side
    // opposite the first Cave Hole first, then the other side
    var vs = hash(7, 0, seed) < 0.5 ? -1 : 1, sides = [vs, -vs], dists = [56, 52, 60, 48, 64], spot = null, si, di;
    for (si = 0; si < 2 && !spot; si++) for (di = 0; di < dists.length && !spot; di++) {
      var cx = SPAWNX + sides[si] * dists[di], left = cx - Math.floor(L / 2), right = left + L - 1, f0 = left - BL - 2, f1 = right + BL + 2;
      var ok = f0 > B_FROST + 8 && f1 < B_EMBER - 8 && (f1 < SPAWNX - 14 || f0 > SPAWNX + 14);
      for (x = f0; ok && x <= f1; x++) if (bio[x] !== 0) ok = false;
      if (ok) spot = { cx: cx, left: left, right: right, f0: f0, f1: f1 };
    }
    if (!spot) return null;
    function put(px, py, id) { if (px >= 0 && px < W && py >= 0 && py < H) t[py * W + px] = id; }
    function wput(px, py, id) { if (walls && px >= 0 && px < W && py >= 0 && py < H) walls[py * W + px] = id; }
    // decor goes through the same rules a player follows: floor pieces need solid ground right under them, wall pieces need a block beside or above them, lamps need something to hang on.
    // A piece that would float or land on something else is simply not placed.
    function solidAt(px, py) { return px >= 0 && px < W && py >= 0 && py < H && TILES[t[py * W + px]].solid; }
    function decor(px, py, id, rule) {
      if (px < 0 || px >= W || py < 1 || py >= H || t[py * W + px] !== T.AIR) return false;
      if (rule === "floor" && !solidAt(px, py + 1)) return false;
      if (rule === "wall" && !(solidAt(px - 1, py) || solidAt(px + 1, py) || solidAt(px, py - 1))) return false;
      if (rule === "any" && !(solidAt(px - 1, py) || solidAt(px + 1, py) || solidAt(px, py - 1) || solidAt(px, py + 1))) return false;
      t[py * W + px] = id; return true;
    }
    var isTree = function (id) { return id === T.LEAVES || id === T.LOG || id === T.VINE; };
    // 1. flatten the plateau (ground row = GY) and ease it into the old terrain over BL columns; clear trees and plants above it
    var xa = spot.left - BL, xb = spot.right + BL, stack = [];
    for (x = xa; x <= xb; x++) {
      var old = top[x], d = x < spot.left ? spot.left - x : x > spot.right ? x - spot.right : 0;
      var th = d === 0 ? GY : Math.round(GY + (old - GY) * smooth(0, 1, d / (BL + 1)));
      th = Math.max(18, Math.min(60, th));
      var lo = Math.min(old, th);
      for (y = 0; y < lo; y++) {
        var id0 = t[y * W + x]; if (id0 === T.AIR || id0 === T.WATER) continue;
        t[y * W + x] = y >= WL ? T.WATER : T.AIR; if (isTree(id0)) stack.push(x, y);
      }
      if (th < old) for (y = th; y < old; y++) t[y * W + x] = y === th ? T.MOSS : T.MUD;
      else { for (y = old; y < th; y++) t[y * W + x] = y >= WL ? T.WATER : T.AIR; t[th * W + x] = T.MOSS; }
      top[x] = th;
    }
    // trees that reached into the cleared ground are removed whole (leaves and trunk that touch a removed tile), within a few columns of the slopes
    var fa = xa - 8, fb = xb + 8;
    while (stack.length) {
      var qy = stack.pop(), qx = stack.pop();
      for (var ddy = -1; ddy <= 1; ddy++) for (var ddx = -1; ddx <= 1; ddx++) {
        var nx = qx + ddx, ny = qy + ddy; if (nx < fa || nx > fb || ny < 0 || ny >= H) continue;
        if (isTree(t[ny * W + nx])) { t[ny * W + nx] = ny >= WL ? T.WATER : T.AIR; stack.push(nx, ny); }
      }
    }
    // 2. houses, left to right: H0 H1 | plaza | H2 H3 H4
    var houses = [], hx = spot.left + 3;
    for (i = 0; i < 5; i++) {
      var w = ws[i], x0 = hx, x1 = x0 + w - 1, n = w - 2, flip = hash(i, 702, seed) < 0.5;
      for (x = x0 + 1; x < x1; x++) put(x, GY, T.PLANKS);                       // plank floor
      for (y = GY - 3; y < GY; y++) { put(x0, y, T.PLANKS); put(x1, y, T.PLANKS); }   // side walls, rows GY-3..GY-1
      put(x0 - 1, GY - 4, T.PLANKS); put(x1 + 1, GY - 4, T.PLANKS);               // roof: three stepped rows with a small overhang
      for (x = x0; x <= x1; x++) put(x, GY - 4, T.PLANKS);
      for (x = x0 + 1; x <= x1 - 1; x++) put(x, GY - 5, T.PLANKS);
      for (x = x0 + 3; x <= x1 - 3; x++) put(x, GY - 6, T.PLANKS);
      var wst = [T.W_TIMBER, T.W_PLANK, T.W_PLASTER, T.W_LOG, T.W_TIMBER][i];   // each house has its own back wall, so the rooms read as rooms
      for (y = GY - 3; y < GY; y++) for (x = x0 + 1; x < x1; x++) wput(x, y, wst);
      put(x0, GY - 1, T.DOOR_B); put(x0, GY - 2, T.DOOR_T); put(x1, GY - 1, T.DOOR_B); put(x1, GY - 2, T.DOOR_T);   // a door in each wall, plank lintel above it
      decor(x0 - 1, GY - 2, T.TORCH, "any"); decor(x1 + 1, GY - 2, T.TORCH, "any");   // a lamp on the outside next to each door (it hangs on the door frame)
      decor(x0 + (w - 1) / 2, GY - 3, T.TORCH, "any");                              // and one hanging under the roof, so the inside is lit
      var at = function (j) { return x0 + 1 + (flip ? n - 1 - j : j); }, face = function (right) { return (right !== flip) ? T.CHAIR : T.CHAIR_L; };
      // inside: the cells next to the two doors stay clear (that is the walkway). Bed, then a chair facing the table, a second chair on bigger houses, and a store barrel or pot in the spare cell.
      decor(at(1), GY - 1, T.BED, "floor");
      decor(at(3), GY - 1, T.TABLE, "floor"); decor(at(2), GY - 1, face(true), "floor");
      if (n >= 7) { decor(at(4), GY - 1, face(false), "floor"); decor(at(5), GY - 1, hash(i, 708, seed) < 0.5 ? T.BARREL : T.POT, "floor"); }
      // paintings hang on the wall above a doorway (row GY-3 is the wall's top row, touching the end wall and the roof), never in mid-air
      decor(at(0), GY - 3, T.PAINTING, "wall"); if (n >= 7 && hash(i, 703, seed) < 0.6) decor(at(n - 1), GY - 3, T.PAINTING, "wall");
      houses.push({ x: x0, w: w, doors: [x0, x1] });
      hx = x1 + 1 + (gaps[i] || 0);
    }
    // 3. a little swamp life on the open ground: glowcaps, cattails and wild flowers, a lamp on each side of the plaza, and a market stall in the middle
    //    (a table for a counter with a barrel, pot, bucket and flower pot around it). Wild plants sit on the ground; nothing is put in front of a door.
    var pc = houses[2].x - 1 - Math.floor(gaps[1] / 2), mk = {};
    mk[pc - 2] = T.BARREL; mk[pc - 1] = T.POT; mk[pc] = T.TABLE; mk[pc + 1] = T.BUCKET; mk[pc + 2] = T.FLOWERPOT;
    // knick-knacks beside the paths, not on them: one barrel or bucket halfway along each short lane between houses, and a flower pot at each end of the village
    [0, 2, 3].forEach(function (g) { var hh2 = houses[g], mid = hh2.x + hh2.w + 1; decor(mid, GY - 1, hash(g, 705, seed) < 0.5 ? T.BARREL : T.BUCKET, "floor"); });
    decor(houses[0].x - 3, GY - 1, T.FLOWERPOT, "floor"); decor(houses[4].x + houses[4].w + 2, GY - 1, T.FLOWERPOT, "floor");
    for (x = spot.left; x <= spot.right; x++) {
      if (houses.some(function (h) { return x >= h.x - 1 && x <= h.x + h.w; })) continue;
      var r = hash(x, 704, seed); if (t[(GY - 1) * W + x] !== T.AIR) continue;
      if (Math.abs(x - pc) === 3) decor(x, GY - 1, T.TORCH, "floor");
      else if (mk[x]) decor(x, GY - 1, mk[x], "floor");
      else if (r < 0.08) decor(x, GY - 1, T.GLOWCAP, "floor"); else if (r < 0.18) decor(x, GY - 1, T.REED, "floor"); else if (r < 0.48) decor(x, GY - 1, T.FLOWER, "floor");
    }
    return { cx: spot.cx, x0: spot.left, x1: spot.right, f0: spot.f0, f1: spot.f1, gy: GY, plaza: pc, houses: houses };
  }

  // ---------- swamp manor ----------
  // The Swamp Dwellers' Manor: a medium mansion (41 tiles wide, 25 tall counting the chimney) at the EAST edge of Murkwater, the last big thing before Ember Bog.
  // It is SCENERY, like the natural trees: you walk straight past it in front of the walls (blocks() in sandbox.js ignores its tiles), nothing in it can be mined,
  // and the only way in is the front door (the player taps "Enter" near it). Every tile it owns is flagged in the returned mask `scen` (1 = manor tile).
  // Built with hash() only, so no earlier terrain, tree or village changes. Layout, left to right: west wing | centre hall (3 storeys) | east wing.
  //   rows (GY = ground row): wings stand GY-1..GY-8 under a 5-row stepped roof; the hall stands GY-1..GY-15 under a 7-row roof with a chimney and an attic window.
  function buildManor(t, top, bio, seed, walls, village) {
    var GY = SURF, WL = SURF + 2, BL = 6, MW = 41, x, y, i, spot = null;
    // 1. find a spot: the whole manor and its slopes inside Murkwater, as far east as possible, clear of the village
    for (var fx1 = B_EMBER - 10; fx1 > B_EMBER - 60 && !spot; fx1--) {
      var f1 = fx1, right = f1 - BL - 1, left = right - MW + 1, f0 = left - BL - 1, ok = f0 > SPAWNX + 20;
      for (x = f0; ok && x <= f1; x++) if (bio[x] !== 0) ok = false;
      if (ok && village && !(f1 < village.f0 - 4 || f0 > village.f1 + 4)) ok = false;
      if (ok) spot = { left: left, right: right, f0: f0, f1: f1 };
    }
    if (!spot) return null;
    var scen = new Uint8Array(W * H), X0 = spot.left, cx = X0 + 20;
    function inb(px, py) { return px >= 0 && px < W && py >= 0 && py < H; }
    function put(px, py, id) { if (inb(px, py)) { t[py * W + px] = id; scen[py * W + px] = 1; } }
    function wput(px, py, id) { if (walls && inb(px, py)) walls[py * W + px] = id; }
    var isTree = function (id) { return id === T.LEAVES || id === T.LOG || id === T.VINE; };
    // 2. flatten the plateau (ground row = GY) and ease it into the old terrain over BL columns, clearing trees and plants (same recipe as the village)
    var xa = spot.left - BL, xb = spot.right + BL, stack = [];
    for (x = xa; x <= xb; x++) {
      var old = top[x], d = x < spot.left ? spot.left - x : x > spot.right ? x - spot.right : 0;
      var th = d === 0 ? GY : Math.round(GY + (old - GY) * smooth(0, 1, d / (BL + 1)));
      th = Math.max(18, Math.min(60, th));
      var lo = Math.min(old, th);
      for (y = 0; y < lo; y++) {
        var id0 = t[y * W + x]; if (id0 === T.AIR || id0 === T.WATER) continue;
        t[y * W + x] = y >= WL ? T.WATER : T.AIR; if (isTree(id0)) stack.push(x, y);
      }
      if (th < old) for (y = th; y < old; y++) t[y * W + x] = y === th ? T.MOSS : T.MUD;
      else { for (y = old; y < th; y++) t[y * W + x] = y >= WL ? T.WATER : T.AIR; t[th * W + x] = T.MOSS; }
      top[x] = th;
    }
    var fa = xa - 8, fb = xb + 8;
    while (stack.length) {
      var qy = stack.pop(), qx = stack.pop();
      for (var ddy = -1; ddy <= 1; ddy++) for (var ddx = -1; ddx <= 1; ddx++) {
        var nx = qx + ddx, ny = qy + ddy; if (nx < fa || nx > fb || ny < 0 || ny >= H) continue;
        if (isTree(t[ny * W + nx])) { t[ny * W + nx] = ny >= WL ? T.WATER : T.AIR; stack.push(nx, ny); }
      }
    }
    // 3. plinth: a stone-brick foundation row one tile wider than the walls
    for (x = X0 - 1; x <= X0 + MW; x++) put(x, GY, T.BRICK);
    // 4. wings (10 wide each) and the hall (21 wide). Body = plank, with a log band between storeys and plaster behind everything (so lamps and fences have a wall to stand on).
    var wings = [X0, X0 + 31];
    function body(xl, xr, topRow) {
      for (y = GY - 1; y >= topRow; y--) for (x = xl; x <= xr; x++) { put(x, y, T.PLANKS); wput(x, y, T.W_PLASTER); }
    }
    function roof(xl, xr, rows) {   // rows = [[xl offset, xr offset] per row from the eaves up]; each row is shingles
      rows.forEach(function (r, k) { for (x = xl + r[0]; x <= xr + r[1]; x++) put(x, rows.base - k, T.MROOF); });
    }
    wings.forEach(function (wx) {
      var wr = wx + 9;
      body(wx, wr, GY - 8);
      for (x = wx; x <= wr; x++) put(x, GY - 8, T.LOG);   // top beam
      var rw = [[-1, 1], [0, 0], [1, -1], [2, -2], [3, -3], [4, -4]]; rw.base = GY - 9;
      roof(wx, wr, rw);
      [2, 7].forEach(function (o) { put(wx + o, GY - 6, T.MWIN); put(wx + o, GY - 5, T.MWIN); });
      put(wx + 4, GY - 4, T.RAIDBANNER); put(wx + 5, GY - 4, T.RAIDBANNER); put(wx + 4, GY - 3, T.RAIDBANNER); put(wx + 5, GY - 3, T.RAIDBANNER);
    });
    var hl = X0 + 10, hr = X0 + 30;
    body(hl, hr, GY - 15);
    for (x = hl; x <= hr; x++) { put(x, GY - 8, T.LOG); put(x, GY - 15, T.LOG); }   // storey bands
    var rh = [[-1, 1], [0, 0], [1, -1], [3, -3], [5, -5], [7, -7], [9, -9]]; rh.base = GY - 16;
    roof(hl, hr, rh);
    // chimney (right of the apex) and an attic window under the peak
    for (y = GY - 24; y <= GY - 19; y++) { put(cx + 3, y, T.BRICK); put(cx + 4, y, T.BRICK); }
    put(cx, GY - 19, T.MWIN); put(cx, GY - 20, T.MWIN);
    // hall windows: four on the ground floor, five on the second storey, three on the top floor
    [-9, -5, 5, 9].forEach(function (o) { put(cx + o, GY - 6, T.MWIN); put(cx + o, GY - 5, T.MWIN); });
    [-8, -4, 0, 4, 8].forEach(function (o) { put(cx + o, GY - 13, T.MWIN); put(cx + o, GY - 12, T.MWIN); });
    [-6, 6].forEach(function (o) { put(cx + o, GY - 11, T.MWIN); put(cx + o, GY - 10, T.MWIN); });
    // 5. front door: three wide, three tall, under a shingled porch roof with a little fence on top; torches and banners either side
    for (y = GY - 3; y <= GY - 1; y++) for (x = cx - 1; x <= cx + 1; x++) put(x, y, T.MDOOR);
    for (x = cx - 3; x <= cx + 3; x++) { put(x, GY - 5, T.MROOF); put(x, GY - 6, T.FENCE); }
    put(cx - 2, GY - 3, T.TORCH); put(cx + 2, GY - 3, T.TORCH);
    [cx - 3, cx + 3].forEach(function (bx) { put(bx, GY - 4, T.RAIDBANNER); put(bx, GY - 3, T.RAIDBANNER); });
    put(cx, GY - 8, T.RAIDBANNER); put(cx, GY - 7, T.RAIDBANNER);   // house sigil over the door, hanging from the storey band
    // 6. front garden: a lamp at each end of the plinth and planters either side of the steps (floor pieces on the solid plinth/ground)
    [X0 - 3, X0 + MW + 2].forEach(function (lx) { if (TILES[t[GY * W + lx]].solid && t[(GY - 1) * W + lx] === T.AIR) put(lx, GY - 1, T.LANTERN); });
    [cx - 6, cx + 6].forEach(function (px) { put(px, GY - 1, T.PLANTER); });
    return { x0: X0, x1: X0 + MW - 1, f0: spot.f0, f1: spot.f1, cx: cx, gy: GY, top: GY - 24,
             door: { x0: cx - 1, x1: cx + 1, y0: GY - 3, y1: GY - 1 }, scen: scen };
  }

  // ---------- generator ----------
  function gen(seed) {
    seed = (seed | 0) || 1;
    var walls = new Uint8Array(W * H), t = new Uint8Array(W * H), top = new Int16Array(W), bio = new Uint8Array(W), rnd = mulberry(seed ^ 0x9e3779b9);
    var WL = SURF + 2, LAVAL = SURF + 5, ICEL = SURF + 3, x, y;
    // 1. surface height and biome per column
    for (x = 0; x < W; x++) {
      var hs = SURF + 1.5 + (fbm(x * 0.05, 0, seed, 3) - 0.5) * 13;
      var he = SURF - 2 + (fbm(x * 0.05, 3.3, seed + 5, 3) - 0.5) * 18;
      var hf = SURF - 1 + (fbm(x * 0.04, 7.7, seed + 9, 3) - 0.5) * 14;
      var wE = smooth(B_EMBER - 8, B_EMBER + 8, x), wF = 1 - smooth(B_FROST - 8, B_FROST + 8, x);
      var h = hs * (1 - wE - wF) + he * wE + hf * wF;
      // OPEN WORLD: a slow, wide swell on top of the local bumps gives each area real hills, ridges and basins (swamp basins fill into lakes, Frostfen basins freeze over).
      var mw = (1 - wE - wF) * 0.8 + wE * 0.6 + wF * 1.1;
      h += (fbm(x * 0.011, 21.7, seed + 13, 3) - 0.5) * 26 * mw;
      h = SURF + (h - SURF) * smooth(3, 12, Math.abs(x - SPAWNX));   // flat, dry start area around the spawn
      top[x] = Math.max(18, Math.min(60, Math.round(h)));
      var bx = x + (vnoise(x * 0.08, 0, seed + 3) - 0.5) * 14;
      bio[x] = bx < B_FROST ? 2 : bx < B_EMBER ? 0 : 1;   // west Frostfen, middle Murkwater, east Ember Bog
      if (bio[x] === 1) top[x] = Math.min(top[x], LAVAL - 2);   // Ember ground never dips into the lava level, so a long walk east is never cut off by a surface lava lake
    }
    // 2. ground, ores, caves, liquids
    for (x = 0; x < W; x++) {
      var b = bio[x], tp = top[x];
      for (y = 0; y < H; y++) {
        var id = T.AIR, d = y - tp;
        if (y < tp) {
          if (b === 0 && y >= WL) id = T.WATER;
          else if (b === 1 && y >= LAVAL) id = T.LAVA;
          else if (b === 2 && y >= ICEL) id = T.ICE;
        } else if (y >= H - 2 || (y === H - 3 && rnd() < 0.55)) id = T.BEDROCK;
        else if (d === 0) id = [T.MOSS, T.ASH, T.SNOW][b];
        else {
          var soil = 4 + Math.floor(vnoise(x * 0.2, y * 0.2, seed + 2) * 3);
          if (d <= soil) { id = [T.MUD, T.ASH, T.SNOW][b]; if (b === 2 && d >= 3) id = T.ICE; }
          else if (b === 0) id = (d < 30 && d >= 3 && fbm(x * 0.09, y * 0.09, seed + 11, 3) > 0.62) ? T.CLAY : T.STONE;
          else if (b === 1) id = d < 12 ? T.STONE : T.BASALT;
          else id = T.FROSTROCK;
          if (id === T.STONE && d >= 5 && fbm(x * 0.2 + 40, y * 0.2, seed + 21, 2) > 0.7) id = T.SPORE;
          if (id === T.BASALT && fbm(x * 0.22, y * 0.22 + 9, seed + 31, 2) > 0.68) id = T.CINDER;
          if (id === T.FROSTROCK && fbm(x * 0.22 + 5, y * 0.22, seed + 41, 2) > 0.68) id = T.CRYSTAL;
          if (d >= 7 && y < H - 6) {
            var cave = fbm(x * 0.06, y * 0.06, seed + 51, 3) > 0.7 || (d >= 9 && Math.abs(fbm(x * 0.035 + 100, y * 0.07 + 50, seed + 61, 2) - 0.5) < 0.03);
            if (cave) id = y >= (b === 1 ? H - 40 : H - 18) ? T.LAVA : T.AIR;
          }
        }
        t[y * W + x] = id;
      }
    }
    // 3. swamp trees and glowcaps (a second pass guarantees enough Wood on every seed)
    function plant(x) {
      // the first rnd() call matches the old generator so terrain and tree spacing stay the same; all new variety is hash-based
      var tp2 = top[x], th = 4 + Math.floor(rnd() * 4), cy = tp2 - th - 1, hs = function (a) { return hash(x, 300 + a, seed); };
      function put(px, py, id) { if (px < 0 || px >= W || py < 0) return; var i = py * W + px; if (t[i] === T.AIR) t[i] = id; }
      function blob(cx, cy2, rx, ry) {
        for (var dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) for (var dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++)
          if (dx * dx / (rx * rx) + dy * dy / (ry * ry) <= 1 + (hash(cx + dx, cy2 + dy, seed + 9) - 0.5) * 0.45) put(cx + dx, cy2 + dy, T.LEAVES);
      }
      var lean = hs(1) < 0.5 ? -1 : 1;
      blob(x, cy, 3, 2.2); blob(x + lean * 2, cy + 1, 2.2, 1.6); blob(x - lean * 2, cy + 1, 1.8, 1.4); blob(x, cy - 2, 1.9, 1.3);
      if (th >= 5 && hs(5) < 0.65) {                       // a side branch you can stand on
        var side = hs(6) < 0.5 ? -1 : 1, by = tp2 - 2 - Math.floor(th / 2);
        put(x + side, by, T.LOG); put(x + side * 2, by, T.LOG); blob(x + side * 3, by - 1, 1.8, 1.3);
      }
      for (var k = 1; k <= th + 1; k++) { var ti = (tp2 - k) * W + x; if (t[ti] === T.AIR || t[ti] === T.LEAVES) t[ti] = T.LOG; }
      for (var sd = -1; sd <= 1; sd += 2) {               // flared roots at the base
        var px = x + sd;
        if (px > 0 && px < W - 1 && TILES[t[tp2 * W + px]].solid && hs(2 + sd) < 0.8) put(px, tp2 - 1, T.LOG);
      }
      for (var vx = x - 4; vx <= x + 4; vx++) {            // hanging vines under the leaves
        if (vx < 1 || vx >= W - 1 || hash(vx, 400, seed) > 0.5) continue;
        var lb = -1; for (var vy = cy - 3; vy <= cy + 5; vy++) if (t[vy * W + vx] === T.LEAVES) lb = vy;
        if (lb < 0) continue;
        var len = 1 + Math.floor(hash(vx, 401, seed) * 3);
        for (var q = 1; q <= len; q++) if (lb + q < top[vx]) put(vx, lb + q, T.VINE);
      }
    }
    var lastTree = -9, trees = [];
    for (x = 3; x < W - 3; x++) {
      if (bio[x] !== 0 || top[x] > WL) continue;
      if (x - lastTree > 4 && rnd() < 0.24) { lastTree = x; trees.push(x); plant(x); }
      else if (x - lastTree > 1 && rnd() < 0.16 && t[(top[x] - 1) * W + x] === T.AIR) t[(top[x] - 1) * W + x] = T.GLOWCAP;
    }
    for (x = SPAWNX - 34; x < SPAWNX + 34 && trees.length < 10; x += 3) {
      if (top[x] > WL || trees.some(function (q) { return Math.abs(q - x) < 5; })) continue;
      trees.push(x); plant(x);
    }
    // 4. surface decorations (hash-based, so they never disturb the terrain random sequence)
    for (x = 2; x < W - 2; x++) {
      var sy = top[x] - 1, r = hash(x, 91, seed), bb = bio[x];
      if (sy < 1 || t[sy * W + x] !== T.AIR || t[top[x] * W + x] === T.WATER) continue;
      if (bb === 0 && r < 0.26) t[sy * W + x] = T.REED;
      else if (bb === 1 && r < 0.16) t[sy * W + x] = T.BLOOM;
      else if (bb === 2 && r < 0.18) t[sy * W + x] = T.SPIKE;
    }
    // 4b. the village (see buildVillage above)
    var village = buildVillage(t, top, bio, seed, walls);
    // 4c. the Swamp Manor (see buildManor above), built after the village and only with hash()
    var manorRes = buildManor(t, top, bio, seed, walls, village), manor = manorRes, scen = manorRes ? manorRes.scen : null;
    // 5. cave holes: a few little burrows on dry ground in every area (hash-based again, so terrain and trees never change).
    // One lies a short walk from the spawn so every world has a cave to find; the rest are spread about 36 columns apart.
    var holes = [];
    function holeOk(hx) {
      if (hx < 8 || hx >= W - 8) return false;
      var sy = top[hx] - 1; if (sy < 3 || !TILES[t[top[hx] * W + hx]].solid) return false;
      var g0 = t[sy * W + hx]; if (g0 !== T.AIR && g0 !== T.REED && g0 !== T.BLOOM && g0 !== T.SPIKE && g0 !== T.GLOWCAP) return false;
      if (t[(sy - 1) * W + hx] !== T.AIR || t[(sy - 2) * W + hx] !== T.AIR) return false;
      if (Math.abs(SPAWNX - hx) < 9) return false;
      if (village && hx >= village.f0 && hx <= village.f1) return false;
      if (manor && hx >= manor.f0 - 2 && hx <= manor.f1 + 2) return false;
      for (var k = 0; k < holes.length; k++) if (Math.abs(holes[k].x - hx) < 14) return false;
      return Math.abs(top[hx - 1] - top[hx]) <= 1 && Math.abs(top[hx + 1] - top[hx]) <= 1;
    }
    function addHole(hx) { var sy = top[hx] - 1; t[sy * W + hx] = T.HOLE; holes.push({ x: hx, y: sy, b: bio[hx] }); }
    var side = hash(7, 0, seed) < 0.5 ? 1 : -1;
    for (x = 0; x < 30; x++) { var gx = SPAWNX + side * (12 + x); if (holeOk(gx)) { addHole(gx); break; } }
    for (var cx0 = 0; cx0 < W; cx0 += 36) {
      var start = cx0 + Math.floor(hash(cx0, 8, seed) * 36);
      for (x = 0; x < 14; x++) { var hx = (start + x) % W; if (holeOk(hx)) { addHole(hx); break; } }
    }
    holes.sort(function (a, b) { return a.x - b.x; });
    return { W: W, H: H, seed: seed, t: t, walls: walls, top: top, bio: bio, holes: holes, village: village, manor: manor, scen: scen, spawn: { x: SPAWNX + 0.5, y: top[SPAWNX] } };
  }

  var api = { W: W, H: H, SURF: SURF, WORLDVER: WORLDVER, B_FROST: B_FROST, B_EMBER: B_EMBER, SPAWNX: SPAWNX, T: T, TILES: TILES, ITEMS: ITEMS, ITEM_ORDER: ITEM_ORDER, DECOR_FLOOR: DECOR_FLOOR, DECOR_WALL: DECOR_WALL, BIOMES: BIOMES, gen: gen, hash: hash, mulberry: mulberry };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SbxWorld = api;
})(typeof window !== "undefined" ? window : this);
