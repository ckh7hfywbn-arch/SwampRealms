// ===== SwampRealms: Delve - world data and generator (Stage 1) =====
// Pure data + terrain generation, no DOM. Global: SbxWorld (also module.exports so it can be tested in Node).
// The same seed always builds the same world. Player edits are stored separately as a small diff (see sandbox.js).
(function (root) {
  "use strict";
  // World size in tiles and the average surface row. The world is a long open map and you start in the MIDDLE:
  // Frostfen lies west (left), Murkwater Swamp is the home area, Ember Bog lies east (right). Each area is 720 tiles wide (2160 in all, 3x the old world).
  // H 200 / SURF 72: there are ~58 rows of sky above the average ground line for mountains, and ~126 rows of underground below it.
  // WORLDVER 5 (big-sky terrain) / WORLDVER 4 (the world was rebuilt bigger): Saves from an older version keep items and progress but not their digging, map or chests (see clean() in sandbox.js).
  // ENDLESS WORLD (WORLDVER 8): the original 2160-column map is the middle of a world WORLD_W wide. The land on each side is made in
  // segments of random biomes (one biome each, 480-720 columns) as you walk towards them (genChunk), so it costs nothing until explored.
  // The generator itself works on any width: W / B_FROST / B_EMBER / SPAWNX below are the settings of the map being generated right now.
  var CORE_W = 2160, EXT = 5040, WORLD_W = CORE_W + EXT * 2;
  var W = CORE_W, H = 200, SURF = 72, WORLDVER = 8, B_FROST = 720, B_EMBER = 1440, SPAWNX = 1080, GEN_EDGE = null, GEN_AERIE = true, GEN_VAR = 0, GEN_SPARSE = 0;   // GEN_SPARSE: worlds made from now on have fewer buildings and landmarks (old saves keep theirs exactly)
  var T = { AIR: 0, MOSS: 1, MUD: 2, CLAY: 3, STONE: 4, LOG: 5, LEAVES: 6, WATER: 7, BASALT: 8, LAVA: 9, ASH: 10, SNOW: 11, ICE: 12, FROSTROCK: 13, SPORE: 14, CINDER: 15, CRYSTAL: 16, BEDROCK: 17, PLANKS: 18, TORCH: 19, GLOWCAP: 20, REED: 21, BLOOM: 22, SPIKE: 23, VINE: 24, BENCH: 25, BED: 26, DOOR_B: 27, DOOR_T: 28, DOORO_B: 29, DOORO_T: 30, LADDER: 31, CHEST: 32, HOLE: 33, CHAIR: 34, CHAIR_L: 35, TABLE: 36, PAINTING: 37, FLOWER: 38, BUCKET: 39, POT: 40, FLOWERPOT: 41, BARREL: 42, DECORBENCH: 43, STOOL: 44, RUG: 45, BOOKSHELF: 46, LANTERN: 47, BANNER: 48, SIGN: 49, PLANTER: 50, CAMPFIRE: 51, W_PLANK: 52, W_LOG: 53, W_BRICK: 54, W_PLASTER: 55, W_MOSS: 56, W_TIMBER: 57, BRICK: 58, THATCH: 59, GLASS: 60, BASALTBRICK: 61, CINDERLAMP: 62, ICEBRICK: 63, CRYSTALLAMP: 64, FOUNTAIN: 65, WELL: 66, CAULDRON: 67, FENCE: 68, BALE: 69, GLOWPOT: 70, WARDROBE: 71, HEARTH: 72, FROGSTATUE: 73, BRAZIER: 74, GUARDIAN: 75, EMBERLANTERN: 76, URN: 77, ANVIL: 78, ICESCULPT: 79, FROSTLANTERN: 80, THRONE: 81, SCONCE: 82, BUGTROPHY: 83, FROGTROPHY: 84, EMBERBANNER: 85, CHANDELIER: 86, FROSTBANNER: 87 };

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
  tile(T.PLANKS, "Planks", "#d29a58", "#edb978", 0.8, 1, "planks", true, 0, "planks");
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
  // Knick-knacks: small, not solid, break by hand and give themselves back. They need solid ground under them to be placed.
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
  // Cave Hole: a little burrow in the ground. It cannot be broken or built on; tap it (or press F nearby) to climb down into a top-down cave (see sandbox-cave.js).
  tile(T.HOLE, "Mine Shaft", "#000", "#1a1410", Infinity, 0, null, false, 2, "hole");
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
batwing: { n: "Bat Wing", frag: "bat" },
    wolfpelt: { n: "Wolf Pelt", frag: "wolf" }, gatorscale: { n: "Gator Scale", frag: "gator" }, slimeball: { n: "Slime Ball", frag: "slime" }, stinger: { n: "Wasp Stinger", frag: "wasp" }   // loot from the Frost Wolf, Bog Gator, slimes and Ember Wasp   // Dusk Bat loot (Delve only: the Adventure has no bat Fragment, so Fragments.add ignores it)
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
  // Anything flagged here counts as decor (stack of 16 in the inventory, counts for the "furniture" goals). Generated buildings follow the same rules.
  var DECOR_FLOOR = ["chair", "table", "bucket", "pot", "flowerpot", "barrel", "flower", "decorbench", "stool", "rug", "bookshelf", "lantern", "planter", "campfire", "fountain", "well", "cauldron", "fence", "bale", "glowpot", "wardrobe", "hearth", "frogstatue", "brazier", "guardian", "emberlantern", "urn", "anvil", "icesculpt", "frostlantern", "throne"],
    DECOR_WALL = ["painting", "banner", "sign", "sconce", "bugtrophy", "frogtrophy", "emberbanner", "chandelier", "frostbanner"];
  DECOR_FLOOR.forEach(function (k) { ITEMS[k].decor = 1; ITEMS[k].put = "floor"; });
  DECOR_WALL.forEach(function (k) { ITEMS[k].decor = 1; ITEMS[k].put = "wall"; });
  var ITEM_ORDER = ["stick", "fiber", "pebble", "wood", "planks", "wall_plank", "wall_log", "wall_timber", "wall_plaster", "wall_brick", "wall_moss", "bench", "bed", "door", "ladder", "chest", "chair", "table", "painting", "flower", "flowerpot", "pot", "bucket", "barrel", "decorbench", "stool", "rug", "bookshelf", "lantern", "banner", "sign", "planter", "campfire", "brick", "thatch", "glass", "basaltbrick", "cinderlamp", "icebrick", "crystallamp", "fountain", "well", "cauldron", "fence", "bale", "glowpot", "wardrobe", "hearth", "frogstatue", "brazier", "guardian", "emberlantern", "urn", "anvil", "icesculpt", "frostlantern", "throne", "sconce", "bugtrophy", "frogtrophy", "emberbanner", "chandelier", "frostbanner", "torch", "mud", "clay", "stone", "leaves", "ash", "basalt", "snow", "ice", "frostrock", "spore", "cinder", "crystal", "bugfrag", "frogfrag", "batwing", "wolfpelt", "gatorscale", "slimeball", "stinger"];
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

  // ---------- structures (redesign: blueprints built from the Content Pack blocks) ----------
  // Standalone buildings scattered through every biome, each on a small levelled pad. Walk up to the door and tap it (or press F) to go inside:
  // the inside is a top-down room built by SbxCave.interior(kind). The door is a DOOR_B/DOOR_T pair in a side wall; sandbox.js knows it is a
  // building door through world.structs, so it never swings open and cannot be picked up. Every generated building tile is walk-past scenery
  // (sandbox.js masks the bounds mx0..mx1 x my0..gy-1), so roofs, chimneys, balconies and porches never trap the player.
  // Blueprints use Content Pack blocks (cobble, plaster, shingles, stained glass, iron bars, quartz pillars, lamp blocks ...) with plain fallbacks,
  // and back walls (walls[]) behind open areas (belfries, colonnades, banners, loft doors) so you can see "into" them.
  // It only uses hash() (never rnd()), and runs AFTER the cave holes, so terrain, trees and holes stay where they were.
  // kind ids (SbxCave.interior): cabin, tower, farm (swamp) / forge, keep (ember) / lodge, shrine (frost)
  var STRUCT_KINDS = [
    { k: "cabin", n: "Reed Cabin", b: 0, w: 11, bh: 5 },
    { k: "tower", n: "Old Watchtower", b: 0, w: 5, bh: 12 },
    { k: "farm", n: "Swamp Farmstead", b: 0, w: 9, bh: 5, yard: 8 },
    { k: "forge", n: "Cinder Forge", b: 1, w: 11, bh: 5 },
    { k: "keep", n: "Ashen Keep", b: 1, w: 9, bh: 8 },
    { k: "lodge", n: "Frost Lodge", b: 2, w: 11, bh: 5 },
    { k: "shrine", n: "Frozen Shrine", b: 2, w: 9, bh: 7 },
    { k: "witchhut", n: "Witch Hut", b: 0, w: 7, bh: 4, solo: 1 },   // solo: not picked by the slot loop below; placed in its own pass at the end, so the other buildings stay where they were
    // NEW BUILDINGS (nw: only in land made after they were added, so old saves keep their land; sub: needs that land type, see BIOME VARIANTS)
    { k: "tavern", n: "The Soggy Log Tavern", b: 0, w: 13, bh: 7, nw: 1, sub: 0 },
    { k: "igloo", n: "Snow Igloo", b: 2, w: 7, bh: 4, nw: 1, sub: 0 },
    { k: "teahouse", n: "Blossom Tea House", b: 0, w: 11, bh: 5, nw: 1, sub: 1 },
    { k: "suntemple", n: "Sun Temple", b: 1, w: 13, bh: 7, nw: 1, sub: 1 }
  ];
  function buildStructures(t, top, bio, seed, holes, walls, sub, nw) {
    var out = [], WLv = SURF + 3, slot, x, y, i;
    function M(name, fb) { var v = T["X_" + name]; return v !== undefined ? v : fb; }   // a Content Pack block, or a plain fallback
    function WM(name, fb) { var v = T["W_" + name]; return v !== undefined ? v : fb; }   // a back wall
    function solidAt(px, py) { return px >= 0 && px < W && py >= 0 && py < H && TILES[t[py * W + px]].solid; }
    function soft(id) { return id === T.AIR || id === T.REED || id === T.BLOOM || id === T.SPIKE || id === T.GLOWCAP || id === T.FLOWER || (TILES[id] && !TILES[id].solid && TILES[id].kind !== "water" && TILES[id].kind !== "lava"); }
    function tryPlace(cx, ki) {
      var K = STRUCT_KINDS[ki], w = K.w, x0 = cx - Math.floor(w / 2), x1 = x0 + w - 1, yd = K.yard || 0, lo = x0 - 3 - yd, hi = x1 + 3 + yd, mn = 999, mx = -999, q, yy;
      if (lo < 10 || hi > W - 10) return null;
      if (Math.abs(SPAWNX - cx) < w + 20 + yd) return null;
      for (q = 0; q < holes.length; q++) if (holes[q].x >= lo - 2 && holes[q].x <= hi + 2) return null;
      for (q = 0; q < out.length; q++) if (lo <= out[q].mx1 + 8 && hi >= out[q].mx0 - 8) return null;
      for (x = lo; x <= hi; x++) {
        if (bio[x] !== K.b) return null;
        if (K.sub !== undefined && sub && (sub[x] ? 1 : 0) !== K.sub) return null;
        var tp = top[x]; if (tp < 26 || tp > WLv) return null;
        if (!TILES[t[tp * W + x]].solid) return null;
        for (yy = Math.max(0, tp - 14); yy < tp; yy++) { var id0 = t[yy * W + x]; if (id0 === T.WATER || id0 === T.LAVA) return null; }
        if (tp < mn) mn = tp; if (tp > mx) mx = tp;
      }
      if (mx - mn > (yd ? 6 : 5)) return null;
      return { K: K, ki: ki, x0: x0, x1: x1, lo: lo, hi: hi, gy: mn };
    }
    function build(P, idx) {
      var K = P.K, gy = P.gy, x0 = P.x0, x1 = P.x1, w = K.w, bh = K.bh, side = hash(idx, 731, seed) < 0.5 ? -1 : 1, yy, xx;
      var bx0 = x0, bx1 = x1, by0 = gy - 1;   // running bounds of everything built (for the walk-past mask)
      function put(px, py, id) { if (px >= 0 && px < W && py >= 1 && py < H) { t[py * W + px] = id; if (px < bx0) bx0 = px; if (px > bx1) bx1 = px; if (py < by0) by0 = py; } }
      function air(px, py, wid) { put(px, py, T.AIR); if (wid && walls) walls[py * W + px] = wid; }
      function wallAt(px, py, wid) { if (walls && px >= 0 && px < W && py >= 0 && py < H) walls[py * W + px] = wid; }
      function fill(xa, xb, ya, yb, id) { for (var y2 = ya; y2 <= yb; y2++) for (var x2 = xa; x2 <= xb; x2++) put(x2, y2, id); }
      function decoOut(px, id) { if (solidAt(px, gy) && t[(gy - 1) * W + px] === T.AIR) put(px, gy - 1, id); }   // a piece standing on the ground outside
      // gable: rows step in 1 tile per row from the eave line (xa..xb at row yb) up to a single ridge tile. edge = the 2-thick roof line, fillId = the gable wall inside it.
      function gable(xa, xb, yb, edge, fillId, ridge, snow) {
        for (var r = 0; ; r++) {
          var L = xa + r, R = xb - r, yR = yb - r; if (L > R) return yR + 1;
          if (r === 0 || R - L <= 2) { for (var x2 = L; x2 <= R; x2++) put(x2, yR, R - L <= 0 ? ridge : edge); if (snow && R - L <= 2) put(L + Math.floor((R - L) / 2), yR - 1, T.SNOW); if (R - L <= 0) return yR; continue; }
          put(L, yR, snow ? T.SNOW : edge); put(L + 1, yR, edge); put(R, yR, snow ? T.SNOW : edge); put(R - 1, yR, edge);
          for (var x3 = L + 2; x3 <= R - 2; x3++) put(x3, yR, fillId);
        }
      }
      function chimney(cx, yFrom, hgt, mat, cap) { for (var y2 = yFrom; y2 > yFrom - hgt; y2--) put(cx, y2, mat); put(cx - 1, yFrom - hgt, cap); put(cx, yFrom - hgt, cap); put(cx + 1, yFrom - hgt, cap); }
      function windowAt(xa, ya, ww, hh2, glass, sill) { fill(xa, xa + ww - 1, ya, ya + hh2 - 1, glass); if (sill) for (var x2 = xa - 1; x2 <= xa + ww; x2++) put(x2, ya + hh2, sill); }
      // 1. level pad: ground row = gy across the pad, fill low columns up with the biome's own ground, clear plants above
      for (xx = P.lo; xx <= P.hi; xx++) {
        var old = top[xx], gt = t[old * W + xx], below = t[(old + 1) * W + xx];
        for (yy = gy; yy < old; yy++) t[yy * W + xx] = yy === gy ? gt : (TILES[below].solid ? below : T.MUD);
        for (yy = Math.max(1, gy - 24); yy < gy; yy++) if (soft(t[yy * W + xx])) t[yy * W + xx] = T.AIR;
        top[xx] = gy;
      }
      for (xx = Math.max(0, P.lo - 4); xx <= Math.min(W - 1, P.hi + 4); xx++) for (yy = 1; yy < gy; yy++) { var tid = t[yy * W + xx]; if (tid === T.LOG || tid === T.LEAVES || tid === T.VINE) t[yy * W + xx] = T.AIR; }
      // ramps: fill the ground just outside the pad up so no step next to it is taller than 2 tiles (always walkable)
      [-1, 1].forEach(function (dir) {
        for (var rx = dir < 0 ? P.lo - 1 : P.hi + 1, n2 = 0; n2 < 30 && rx > 1 && rx < W - 2; n2++, rx += dir) {
          var want = top[rx - dir] + 2; if (top[rx] <= want) break;
          var gt2 = t[top[rx] * W + rx]; for (yy = want; yy < top[rx]; yy++) t[yy * W + rx] = yy === want ? gt2 : T.MUD;
          var plant2 = t[(top[rx] - 1) * W + rx]; top[rx] = want; if (soft(plant2)) t[(want - 1) * W + rx] = T.AIR;
        }
      });
      var dx = side < 0 ? x0 : x1, ox2 = dx + side, far = side < 0 ? x1 + 1 : x0 - 1, top0 = gy - bh, cx = x0 + Math.floor(w / 2), h1 = function (k) { return hash(idx, 740 + k, seed); };
      var COB = M("cobble", T.STONE), PLAS = M("plasterblock", T.PLANKS), SHR = M("shinglered", T.THATCH), SHB = M("shingleblue", T.BASALTBRICK), RBR = M("redbrick", T.BRICK), MOSSB = M("mossbrick", T.BRICK);
      var OBS = M("obsidianbrick", T.BASALTBRICK), PERM = M("permabrick", T.ICEBRICK), QZ = M("quartzblock", T.ICEBRICK), QP = M("quartzpillar", T.ICEBRICK), MOON = M("moonbrick", T.ICEBRICK), BARS = M("ironbars", T.GLASS), IRON = M("ironblock", T.BASALT);
      var GL = T.GLASS, GLR = M("stainedred", T.GLASS), GLB = M("stainedblue", T.GLASS), GLG = M("stainedgreen", T.GLASS), RUBY = M("rubylamp", T.CINDERLAMP), SAPH = M("sapphirelamp", T.CRYSTALLAMP), HL = M("hanginglantern", T.LANTERN);
      var lamp = T.TORCH;
      var GRD = [T.MOSS, T.ASH, T.SNOW][K.b] || T.MUD;   // the ground under every building stays the natural biome ground (no sunken footing)
      if (K.k === "witchhut") {   // a crooked little hut: log posts, dark planks, a round green window, a sagging thatch roof with a bent tip and a crooked chimney
        fill(x0, x1, gy - 1, gy - 1, MOSSB);
        fill(x0, x1, top0, gy - 2, T.PLANKS); [x0, x1].forEach(function (px) { fill(px, px, top0, gy - 2, T.LOG); }); fill(x0, x1, top0, top0, T.LOG);
        put(cx, gy - 4, GLG); put(cx, gy - 3, GLG); put(cx - 1, gy - 3, T.LOG); put(cx + 1, gy - 3, T.LOG);
        var wr = gable(x0 - 1, x1 + 1, top0 - 1, T.THATCH, T.THATCH, T.THATCH);
        put(cx + side, wr - 1, T.THATCH); put(cx + side * 2, wr - 2, T.THATCH); put(cx + side * 3, wr - 2, T.THATCH);   // the bent hat-tip of the roof
        chimney(side < 0 ? x1 - 1 : x0 + 1, top0 - 2, 3, COB, T.STONE);
        lamp = M("mushlamp", T.TORCH);
        decoOut(ox2 + side, T.CAULDRON); decoOut(far - side, T.GLOWPOT); decoOut(far - side * 2, M("slimejar", T.BARREL)); decoOut(far - side * 3, T.FENCE);
      } else if (K.k === "tavern") {   // a two-storey Tudor inn: cobble ground floor with big windows, a jettied plaster upper floor, a mossy thatch roof, a hanging sign
        fill(x0, x1, gy - 1, gy - 1, COB);
        fill(x0, x1, gy - 4, gy - 2, T.PLANKS); [x0, cx, x1].forEach(function (px) { fill(px, px, gy - 4, gy - 2, T.LOG); });
        windowAt(x0 + 2, gy - 4, 2, 2, GL, T.PLANKS); windowAt(x1 - 3, gy - 4, 2, 2, GL, T.PLANKS);
        fill(x0 - 1, x1 + 1, gy - 5, gy - 5, T.LOG);   // the jetty beam
        fill(x0 - 1, x1 + 1, top0, gy - 6, PLAS); [x0 - 1, x0 + 3, cx, x1 - 3, x1 + 1].forEach(function (px) { fill(px, px, top0, gy - 6, T.LOG); });
        put(x0 + 1, gy - 6, GL); put(x0 + 5, gy - 6, GLR); put(x1 - 5, gy - 6, GLR); put(x1 - 1, gy - 6, GL);
        fill(x0 - 1, x1 + 1, top0 - 1, top0 - 1, T.LOG);
        gable(x0 - 2, x1 + 2, top0 - 2, T.THATCH, T.PLANKS, MOSSB);
        chimney(side < 0 ? x1 - 2 : x0 + 2, top0 - 4, 5, RBR, T.STONE);
        lamp = HL; put(ox2, gy - 5, T.BANNER);
        decoOut(ox2 + side, T.BARREL); decoOut(ox2 + side * 2, T.BARREL); decoOut(far - side, M("crate", T.BARREL)); decoOut(far - side * 2, T.STOOL);
      } else if (K.k === "igloo") {   // a dome of snow blocks with an ice window, a little entrance and a campfire outside
        fill(x0, x1, gy - 2, gy - 1, T.ICEBRICK); fill(x0 + 1, x1 - 1, gy - 3, gy - 3, T.ICEBRICK); fill(x0 + 2, x1 - 2, gy - 4, gy - 4, T.ICEBRICK);
        for (xx = x0; xx <= x1; xx += 2) put(xx, gy - 2, T.SNOW); put(x0 + 2, gy - 3, T.SNOW); put(x1 - 2, gy - 3, T.SNOW); put(cx, gy - 4, T.SNOW); put(cx, gy - 5, T.SNOW); put(cx - 1, gy - 5, T.SNOW); put(cx + 1, gy - 5, T.SNOW);
        put(cx, gy - 3, GLB); lamp = T.FROSTLANTERN;
        decoOut(far - side, T.CAMPFIRE); decoOut(ox2 + side * 2, M("snowman", T.ICESCULPT));
      } else if (K.k === "teahouse") {   // a two-tier pagoda: plaster walls between dark posts, glowing paper windows, upturned red eaves, a gold finial and paper lanterns
        fill(x0, x1, gy - 1, gy - 1, COB);
        fill(x0, x1, top0, gy - 2, PLAS); [x0, cx, x1].forEach(function (px) { fill(px, px, top0, gy - 2, T.LOG); });
        windowAt(x0 + 2, gy - 4, 2, 2, GLR, null); windowAt(x1 - 3, gy - 4, 2, 2, GLR, null);
        fill(x0 - 2, x1 + 2, top0 - 1, top0 - 1, SHR); put(x0 - 3, top0 - 2, SHR); put(x1 + 3, top0 - 2, SHR); fill(x0 - 1, x1 + 1, top0 - 2, top0 - 2, SHR);   // lower eaves, tips turned up
        fill(x0 + 2, x1 - 2, top0 - 4, top0 - 3, PLAS); put(x0 + 2, top0 - 4, T.LOG); put(x0 + 2, top0 - 3, T.LOG); put(x1 - 2, top0 - 4, T.LOG); put(x1 - 2, top0 - 3, T.LOG); put(cx, top0 - 4, GLR); put(cx, top0 - 3, GLR);
        fill(x0, x1, top0 - 5, top0 - 5, SHR); put(x0 - 1, top0 - 6, SHR); put(x1 + 1, top0 - 6, SHR); fill(x0 + 1, x1 - 1, top0 - 6, top0 - 6, SHR); fill(x0 + 3, x1 - 3, top0 - 7, top0 - 7, SHR);
        put(cx, top0 - 8, M("amberblock", T.LANTERN)); put(cx, top0 - 9, T.LOG);
        var PL = M("paperlantern", HL); put(x0 - 2, top0, PL); put(x1 + 2, top0, PL); put(x0, top0 - 4, PL); put(x1, top0 - 4, PL);
        lamp = PL; decoOut(ox2 + side * 2, M("stonelantern", T.LANTERN)); decoOut(far - side * 2, M("stonelantern", T.LANTERN)); decoOut(far - side, M("pottedfern", T.FLOWERPOT));
      } else if (K.k === "suntemple") {   // a stepped sandstone pyramid: gold bands, a sun disc over the door, braziers on the top step and a shrine on the summit
        var SB = M("sandbrick", T.BRICK), GOLD = M("amberblock", T.CINDERLAMP);
        for (var r9 = 0; r9 < bh; r9++) { var yR9 = gy - 1 - r9, L9 = x0 + Math.max(0, r9 - 1), R9 = x1 - Math.max(0, r9 - 1); for (xx = L9; xx <= R9; xx++) put(xx, yR9, r9 === 3 && (xx - L9) % 2 === 0 ? GOLD : SB); }
        put(cx, gy - 5, M("rubylamp", GOLD)); put(cx - 1, gy - 4, GOLD); put(cx + 1, gy - 4, GOLD);
        put(x0 + 5, gy - 8, T.BRAZIER); put(x1 - 5, gy - 8, T.BRAZIER); put(cx, gy - 8, GOLD); put(cx, gy - 9, M("obelisk", GOLD));
        lamp = T.TORCH; decoOut(ox2 + side, T.URN); decoOut(far - side, T.URN); decoOut(far - side * 2, M("cactus", T.URN));
      } else if (K.k === "cabin") {   // Tudor cottage: plaster between log posts, two framed windows, a steep red shingle gable with an attic window and a brick chimney
        fill(x0, x1, gy - 1, gy - 1, COB);   // foundation row (above ground); the ground under it stays the biome's own ground
        fill(x0, x1, top0, gy - 2, PLAS); [x0, cx, x1].forEach(function (px) { fill(px, px, top0, gy - 2, T.LOG); }); fill(x0, x1, top0, top0, T.PLANKS);
        windowAt(x0 + 2, gy - 4, 2, 2, GL, T.PLANKS); windowAt(x1 - 3, gy - 4, 2, 2, GL, T.PLANKS);
        var rt = gable(x0 - 2, x1 + 2, top0 - 1, SHR, T.PLANKS, SHR); fill(cx, cx, top0 - 4, top0 - 3, GL);
        chimney(side < 0 ? x1 - 2 : x0 + 2, top0 - 4, 6, RBR, T.STONE);
        lamp = HL; put(ox2, gy - 4, SHR);
        decoOut(ox2 + side, T.BARREL); decoOut(far - side, M("crate", T.BARREL)); decoOut(far - side * 2, T.PLANTER || T.FLOWERPOT); decoOut(far - side * 3, T.FENCE);
      } else if (K.k === "tower") {   // stone watchtower: mossy plinth, cobble shaft with brick quoins, arrow slits, a cantilevered balcony, an open belfry and a slate spire
        fill(x0, x1, gy - 1, gy - 1, MOSSB);   // foundation row (above ground); the ground under it stays the biome's own ground
        for (yy = top0; yy <= gy - 2; yy++) for (xx = x0; xx <= x1; xx++) put(xx, yy, (xx === x0 || xx === x1) ? ((gy - yy) % 2 ? T.BRICK : COB) : (h1(xx * 7 + yy) < 0.25 ? MOSSB : COB));
        fill(cx, cx, gy - 6, gy - 5, BARS); put(cx, gy - 8, GL); fill(cx, cx, gy - 11, gy - 10, BARS);
        fill(x0 - 2, x1 + 2, top0 - 1, top0 - 1, T.PLANKS); put(x0 - 2, top0 - 2, T.FENCE); put(x1 + 2, top0 - 2, T.FENCE);
        for (yy = top0 - 4; yy <= top0 - 2; yy++) { put(x0, yy, T.LOG); put(x1, yy, T.LOG); for (xx = x0 + 1; xx <= x1 - 1; xx++) air(xx, yy, T.W_PLANK); }
        put(cx, top0 - 4, HL);
        var pk = gable(x0 - 1, x1 + 1, top0 - 5, SHB, SHB, SHB); put(cx, pk - 1, T.LOG); put(cx, pk - 2, T.LOG); put(cx + 1, pk - 2, T.BANNER);
        decoOut(ox2 + side, T.BUCKET); decoOut(far, T.BARREL);
      } else if (K.k === "farm") {   // red barn with a hay loft, plus a fenced garden of ripe crops you can harvest and a scarecrow
        fill(x0, x1, gy - 1, gy - 1, COB);   // foundation row (above ground); the ground under it stays the biome's own ground
        fill(x0, x1, top0, gy - 2, T.PLANKS); fill(x0, x0, top0, gy - 2, T.LOG); fill(x1, x1, top0, gy - 2, T.LOG); fill(x0, x1, top0, top0, RBR);
        windowAt(x0 + 2, gy - 4, 1, 2, GL, null); windowAt(x1 - 2, gy - 4, 1, 2, GL, null);
        for (yy = gy - 4; yy <= gy - 2; yy++) { put(cx - 1, yy, T.LOG); put(cx + 1, yy, T.LOG); } put(cx, gy - 3, T.LOG); put(cx, gy - 2, RBR); put(cx, gy - 4, RBR);   // big barn doors with an X brace look
        gable(x0 - 1, x1 + 1, top0 - 1, SHR, T.PLANKS, SHR);
        air(cx, top0 - 3, T.W_PLANK); air(cx, top0 - 2, T.W_PLANK); put(cx, top0 - 2, T.BALE); put(cx - 1, top0 - 3, T.PLANKS);   // loft door with hay
        var dirY = -side, gx0 = dirY > 0 ? x1 + 2 : x0 - 2, C1 = M("crop_carrot4", 0), C2 = M("crop_potato4", 0);
        if (T.X_farmland !== undefined && C1 && C2) {
          for (var gk = 0; gk <= 7; gk++) {
            var gxx = gx0 + dirY * gk;
            if (gk === 0 || gk === 7) { put(gxx, gy - 1, T.FENCE); continue; }
            if (gk === 3) { put(gxx, gy - 1, M("scarecrow", T.FENCE)); continue; }
            put(gxx, gy, T.X_farmland); put(gxx, gy - 1, gk < 3 ? C1 : C2);
          }
        }
        decoOut(ox2 + side, T.BALE); decoOut(ox2 + side * 2, M("sack", T.BARREL));
      } else if (K.k === "forge") {   // basalt forge: obsidian quoins, a barred furnace mouth glowing with ruby lamps, a parapet roof and two iron-capped chimneys
        fill(x0, x1, gy - 1, gy - 1, OBS);   // foundation row (above ground); the ground under it stays the biome's own ground
        fill(x0, x1, top0, gy - 2, T.BASALTBRICK); for (yy = top0; yy <= gy - 2; yy++) { put(x0, yy, OBS); put(x1, yy, OBS); }
        fill(cx - 1, cx + 1, gy - 4, gy - 3, BARS); fill(cx - 1, cx + 1, gy - 2, gy - 2, RUBY); put(cx - 2, gy - 4, IRON); put(cx + 2, gy - 4, IRON);
        put(x0 + 2, gy - 4, GLR); put(x1 - 2, gy - 4, GLR);
        fill(x0 - 1, x1 + 1, top0 - 1, top0 - 1, OBS); for (xx = x0 - 1; xx <= x1 + 1; xx += 2) put(xx, top0 - 2, OBS);
        var c1 = side < 0 ? x1 - 2 : x0 + 2, c2 = side < 0 ? x0 + 3 : x1 - 3; chimney(c1, top0 - 2, 5, T.BASALTBRICK, IRON); chimney(c2, top0 - 2, 3, T.BASALTBRICK, IRON);
        lamp = T.EMBERLANTERN; put(ox2, gy - 4, SHR);
        decoOut(ox2 + side, T.ANVIL); decoOut(far - side, M("crate", T.BARREL)); decoOut(far - side * 2, T.BRAZIER);
      } else if (K.k === "keep") {   // obsidian keep: basalt quoins, tall red stained-glass windows, a banner on a back wall, battlements and two turrets with red cone roofs
        fill(x0, x1, gy - 1, gy - 1, T.BASALTBRICK);   // foundation row (above ground); the ground under it stays the biome's own ground
        for (yy = top0; yy <= gy - 2; yy++) for (xx = x0; xx <= x1; xx++) put(xx, yy, (xx === x0 || xx === x1) && (gy - yy) % 2 ? T.BASALTBRICK : OBS);
        fill(x0 + 2, x0 + 2, gy - 6, gy - 4, GLR); fill(x1 - 2, x1 - 2, gy - 6, gy - 4, GLR); put(x0 + 2, gy - 7, BARS); put(x1 - 2, gy - 7, BARS);
        air(cx, gy - 5, WM("obsidian", T.W_BRICK)); air(cx, gy - 4, WM("obsidian", T.W_BRICK)); put(cx, gy - 5, T.EMBERBANNER); put(cx, gy - 7, RUBY);
        fill(x0 - 1, x1 + 1, top0 - 1, top0 - 1, T.BASALTBRICK); for (xx = x0 + 1; xx <= x1 - 1; xx += 2) put(xx, top0 - 2, OBS);
        [x0 - 1, x1 + 1].forEach(function (tx2) { fill(tx2, tx2, top0 - 4, top0 - 2, OBS); put(tx2, top0 - 3, BARS); put(tx2 - 1, top0 - 5, SHR); put(tx2, top0 - 5, SHR); put(tx2 + 1, top0 - 5, SHR); put(tx2, top0 - 6, SHR); put(tx2, top0 - 7, T.EMBERBANNER); });
        lamp = T.EMBERLANTERN; decoOut(ox2 + side * 2, T.BRAZIER); decoOut(far, T.URN);
      } else if (K.k === "lodge") {   // log lodge: plank walls between log posts, blue stained glass, a snow-capped slate gable and a stone chimney
        fill(x0, x1, gy - 1, gy - 1, PERM);   // foundation row (above ground); the ground under it stays the biome's own ground
        fill(x0, x1, top0, gy - 2, T.PLANKS); [x0, cx, x1].forEach(function (px) { fill(px, px, top0, gy - 2, T.LOG); }); fill(x0, x1, top0, top0, T.LOG);
        windowAt(x0 + 2, gy - 4, 2, 2, GLB, T.PLANKS); windowAt(x1 - 3, gy - 4, 2, 2, GLB, T.PLANKS);
        gable(x0 - 2, x1 + 2, top0 - 1, SHB, T.PLANKS, T.SNOW, true); fill(cx, cx, top0 - 4, top0 - 3, GLB);
        var chx = side < 0 ? x1 - 2 : x0 + 2; chimney(chx, top0 - 4, 6, COB, T.STONE); put(chx - 1, top0 - 11, T.SNOW); put(chx, top0 - 11, T.SNOW); put(chx + 1, top0 - 11, T.SNOW);
        lamp = T.FROSTLANTERN; put(ox2, gy - 4, SHB);
        decoOut(far - side * 2, M("snowman", T.ICESCULPT)); decoOut(ox2 + side * 2, T.BARREL);
      } else {   // frozen shrine: quartz steps, a colonnade of fluted pillars you can see between, a moonstone architrave and a pediment with a sapphire lamp
        fill(x0 - 1, x1 + 1, gy - 1, gy - 1, QZ);   // foundation row (above ground); the ground under it stays the biome's own ground
        var cols = [x0, x0 + 2, x1 - 2, x1];
        for (xx = x0; xx <= x1; xx++) for (yy = gy - 6; yy <= gy - 2; yy++) { if (cols.indexOf(xx) >= 0) put(xx, yy, QP); else air(xx, yy, WM("quartz", T.W_BRICK)); }
        put(cx, gy - 2, M("obelisk", T.FROSTLANTERN)); put(x0 + 1, gy - 2, T.FROSTLANTERN); put(x1 - 1, gy - 2, T.FROSTLANTERN); put(cx, gy - 6, SAPH);
        fill(x0 - 1, x1 + 1, gy - 7, gy - 7, MOON); fill(x0, x1, gy - 8, gy - 8, QZ); put(cx, gy - 8, SAPH);
        gable(x0 - 1, x1 + 1, gy - 9, MOON, QZ, SAPH);
        lamp = T.FROSTLANTERN; decoOut(far - side, M("obelisk", T.ICESCULPT));
      }
      // the door: two blocks in the side wall (bottom + top), and a lamp beside it
      put(dx, gy - 1, T.DOOR_B); put(dx, gy - 2, T.DOOR_T);
      if (!TILES[t[(gy - 3) * W + ox2]].solid) put(ox2, gy - 3, lamp);
      return { id: idx, ki: P.ki, kind: K.k, name: K.n, b: K.b, x0: x0, x1: x1, w: w, gy: gy, bh: bh, side: side, dx: dx, outX: ox2, doorY: gy - 1, mx0: bx0, mx1: bx1, my0: by0 };
    }
    // one slot every ~58 columns; each tries its kinds for the biome there (hash picks the order) with a few nudges left and right
    for (slot = 0, x = 34; x < W - 34; slot++, x += GEN_SPARSE ? 120 : 58) {
      if (GEN_SPARSE && Math.abs(x - SPAWNX) > 120 && hash(slot, 739, seed) < 0.2) continue;   // a few open stretches with nothing built
      var cx0 = x + Math.floor(hash(slot, 735, seed) * 40) - 10, bb = bio[Math.min(W - 1, Math.max(0, cx0))], kinds = [];
      for (i = 0; i < STRUCT_KINDS.length; i++) if (STRUCT_KINDS[i].b === bb && !STRUCT_KINDS[i].solo && !STRUCT_KINDS[i].nw) kinds.push(i);
      if (!kinds.length) continue;
      var wide = kinds.filter(function (q) { return STRUCT_KINDS[q].w > 5; }), slim = kinds.filter(function (q) { return STRUCT_KINDS[q].w <= 5; });   // big buildings get first pick of the flat ground
      var first = Math.floor(hash(slot, 736, seed) * 97), done = false, nudge;
      for (nudge = 0; nudge < 20 && !done; nudge++) {
        var list = nudge < 14 || !slim.length ? (wide.length ? wide : slim) : slim, cxx = cx0 + (nudge % 2 ? 1 : -1) * Math.ceil((nudge % 14) / 2) * 4, kk = list[(first + nudge) % list.length], P = tryPlace(cxx, kk);
        if (P) { var bP = build(P, out.length); out.push(bP); done = true; }
      }
    }
    // fewer buildings (new worlds): still at least one of each of the seven classic kinds, so the Grand Tour can always be done
    if (GEN_SPARSE && !GEN_EDGE) ["cabin", "tower", "farm", "forge", "keep", "lodge", "shrine"].forEach(function (kn, kq) {
      var KI = STRUCT_KINDS.map(function (q) { return q.k; }).indexOf(kn); if (KI < 0 || out.some(function (q) { return q.kind === kn; })) return;
      for (var tq = 0; tq < 80; tq++) { var tx = Math.floor(30 + hash(tq, 790 + kq * 7, seed) * (W - 60)); if (bio[tx] !== STRUCT_KINDS[KI].b || out.some(function (q) { return Math.abs(q.x0 - tx) < 40; })) continue;
        var TP = tryPlace(tx, KI); if (TP) { out.push(build(TP, out.length)); break; } }
    });
    // Witch Huts: up to 3, out in the wilder parts of Murkwater (well away from camp)
    var WK = STRUCT_KINDS.map(function (q) { return q.k; }).indexOf("witchhut"), huts = 0, hutMax = Math.max(1, Math.min(GEN_SPARSE ? 1 : 3, Math.round((Math.min(W, B_EMBER) - Math.max(0, B_FROST)) / 300)));
    for (var wq = 0; wq < 60 && huts < hutMax; wq++) {
      var sw0 = Math.max(0, B_FROST), sw1 = Math.min(W, B_EMBER); if (sw1 - sw0 < 240) break;
      var hx = Math.floor(sw0 + 30 + hash(wq, 761, seed) * (sw1 - sw0 - 60));
      if (Math.abs(hx - SPAWNX) < 150 || out.some(function (q) { return q.kind === "witchhut" && Math.abs(q.x0 - hx) < 160; })) continue;
      for (var hn = 0; hn < 8; hn++) { var HP = tryPlace(hx + (hn % 2 ? 1 : -1) * Math.ceil(hn / 2) * 3, WK); if (HP) { out.push(build(HP, out.length)); huts++; break; } }
    }
    // NEW BUILDINGS: their own pass after everything else (only in new land), a few of each, spread out
    if (nw) STRUCT_KINDS.forEach(function (K, ki) {
      if (!K.nw) return;
      var cols = 0; for (x = 0; x < W; x++) if (bio[x] === K.b && (!sub || (sub[x] ? 1 : 0) === K.sub)) cols++;
      if (cols < 120) return;
      var want = GEN_SPARSE ? 1 : Math.max(1, Math.min(3, Math.round(cols / 420))), made = 0;
      for (var nq = 0; nq < 90 && made < want; nq++) {
        var nx = Math.floor(20 + hash(nq, 771 + ki * 13, seed) * (W - 40));
        if (bio[nx] !== K.b || (sub && (sub[nx] ? 1 : 0) !== K.sub)) continue;
        if (out.some(function (q) { return q.kind === K.k && Math.abs(q.x0 - nx) < 150; })) continue;
        for (var nn = 0; nn < 10; nn++) { var NP = tryPlace(nx + (nn % 2 ? 1 : -1) * Math.ceil(nn / 2) * 4, ki); if (NP) { out.push(build(NP, out.length)); made++; break; } }
      }
    });
    return out;
  }

  // ---------- generator (WORLDVER 5: "big sky" terrain) ----------
  // The world is built in passes. Every pass is deterministic for a seed, and every seed lays out its own landscape:
  //   1. biomes per column (Frostfen west, Murkwater middle, Ember Bog east) and a per-seed list of LANDFORMS for each biome
  //      (mountain ranges, lone peaks, rolling hills, mesas, volcanoes with lava craters, ice spires, lake basins)
  //   2. one clean height line: landforms + gentle base noise, then slopes are capped at 2 tiles a column (always walkable/jumpable)
  //      and 1-wide spikes and pits are smoothed away, so the skyline reads crisp and clean
  //   3. ground: biome soil (thin on mountains), exposed stone/ice cliff faces, snow caps on high peaks, rock strata, ores that get richer deeper
  //   4. caves: wide caverns (bigger the deeper you go), long winding tunnels, then a cellular smoothing pass so cave walls are clean;
  //      a few slanted tunnels open onto hillsides as cave mouths; closed cave basins fill with still water, lava or ice
  //   5. trees (swamp mangroves, Frostfen pines, Ember Bog dead trees), plants, cave holes and buildings
  function gen(seed) {
    seed = (seed | 0) || 1;
    var walls = new Uint16Array(W * H), t = new Uint16Array(W * H), top = new Int16Array(W), bio = new Uint8Array(W), rnd = mulberry(seed ^ 0x9e3779b9), frnd = mulberry(seed ^ 0x51ed270b);
    var WL = SURF + 2, LAVAL = SURF + 5, ICEL = SURF + 3, x, y, i, k;
    function ri(a, b) { return a + Math.floor(frnd() * (b - a + 1)); }
    function ridged(x2, s, f) { return 1 - Math.abs(2 * fbm(x2 * f, 0.5, s, 3) - 1); }
    // ---- 1. biomes and landforms ----
    for (x = 0; x < W; x++) { var bx = x + (vnoise(x * 0.08, 0, seed + 3) - 0.5) * 14; bio[x] = bx < B_FROST ? 2 : bx < B_EMBER ? 0 : 1; }
    // BIOME VARIANTS: sub[x] = 1 turns a stretch of land into its biome's other type (Murkwater -> Cherry Blossom Vale, Ember Bog -> Sunbaked Shores,
    // Frostfen -> Dark Oakwood). GEN_VAR 0 = none (land made before variants existed, so old saves line up), 1 = patches, 2 = the whole map.
    var sub = new Uint8Array(W);
    var SAND = T.X_sand !== undefined ? T.X_sand : T.ASH;
    var REG = [[Math.max(0, B_FROST), Math.min(W, B_EMBER)], [Math.max(0, B_EMBER), W], [0, Math.min(W, B_FROST)]];   // index = biome id
    var hasB = function (b) { return REG[b][1] - REG[b][0] >= 80; };
    if (GEN_VAR === 2) for (x = 0; x < W; x++) sub[x] = 1;
    else if (GEN_VAR) [0, 1, 2].forEach(function (b) {   // patches: one stretch of each land (a bit more than a third of it), never at the camp
      var a = REG[b][0], z = REG[b][1], len = z - a; if (len < 200) return;
      var pw = Math.round(len * (0.34 + hash(b, 931, seed) * 0.14)), tries = 0, p0;
      do { p0 = a + 20 + Math.floor(hash(b, 932 + tries, seed) * Math.max(1, len - pw - 40)); } while (tries++ < 12 && p0 < SPAWNX + 170 && p0 + pw > SPAWNX - 170);
      if (p0 < SPAWNX + 170 && p0 + pw > SPAWNX - 170) { if (SPAWNX - 170 - a > z - SPAWNX - 170) { p0 = a + 10; pw = Math.min(pw, SPAWNX - 180 - p0); } else { p0 = SPAWNX + 180; pw = Math.min(pw, z - 10 - p0); } }
      for (x = Math.max(0, p0); x < Math.min(W, p0 + pw); x++) { var e = (vnoise(x * 0.05, 2.2, seed + 78) - 0.5) * 30; if (x - p0 > 12 + e * 0.3 && p0 + pw - x > 12 - e * 0.3) sub[x] = 1; }   // ragged ends
    });
    var KINDS = [   // per biome: [kind, weight]
      [["range", 3], ["peak", 2], ["hills", 3], ["basin", 3], ["mesa", 1]],
      [["volcano", 3], ["mesa", 3], ["range", 1], ["hills", 2], ["peak", 1]],
      [["range", 3], ["spires", 3], ["peak", 2], ["hills", 1], ["basin", 1]]
    ];
    var feats = [], craters = [], MUST = [["range", "peak", "range"], ["volcano", "mesa", "volcano"], ["spires", "range", "peak"]], must;
    function pick(b) { if (must.length && frnd() < 0.7) return must.splice(Math.floor(frnd() * must.length), 1)[0]; var L = KINDS[b], tot = 0, q; for (q = 0; q < L.length; q++) tot += L[q][1]; var r = frnd() * tot; for (q = 0; q < L.length; q++) { r -= L[q][1]; if (r <= 0) return L[q][0]; } return L[0][0]; }
    [0, 1, 2].forEach(function (b) {
      if (!hasB(b)) return;
      var cx = REG[b][0] + ri(20, 50); must = MUST[b].slice();   // every biome gets its signature landforms, in a random order and place
      while (cx < REG[b][1] - 20) {
        var kd = pick(b), hw, hh;
        if (kd === "range") { hw = ri(48, 110); hh = b === 2 ? ri(40, 62) : ri(30, 52); }
        else if (kd === "peak") { hw = ri(22, 40); hh = ri(26, 44); }
        else if (kd === "hills") { hw = ri(30, 60); hh = ri(7, 15); }
        else if (kd === "mesa") { hw = ri(24, 50); hh = ri(12, 24); }
        else if (kd === "volcano") { hw = ri(26, 42); hh = ri(28, 46); }
        else if (kd === "spires") { hw = ri(30, 60); hh = ri(32, 54); }
        else { hw = ri(14, 32); hh = -ri(5, 10); }   // basin: a lake bowl
        var fx = cx + hw;
        if (fx + hw > REG[b][1] + 6) break;
        var clear = Math.abs(fx - SPAWNX) - hw;
        if (clear < (kd === "basin" ? 22 : 46)) {   // keep the walk out of camp gentle: only small hills right next to the spawn
          if (kd !== "basin" && kd !== "hills" && MUST[b].indexOf(kd) >= 0) must.push(kd);
          if (clear > 18 && kd !== "basin") feats.push({ k: "hills", x: fx, hw: hw, h: ri(5, 9), b: b, s: ri(1, 9999) });
        } else feats.push({ k: kd, x: fx, hw: hw, h: hh, b: b, s: ri(1, 9999), cr: ri(3, 5) });
        cx = fx + hw + (kd === "basin" ? ri(10, 40) : ri(12, 64));
      }
    });
    function shape(f, x2) {   // elevation (tiles above SURF) this landform adds at column x2
      var u = (x2 - f.x) / f.hw, au = Math.abs(u); if (au >= 1) return 0;
      var s = seed + f.s, r = ridged(x2, s, 0.045);
      if (f.k === "range") { var env = Math.pow(1 - u * u, 1.5); return f.h * env * (0.5 + 0.5 * r) + f.h * 0.18 * env * ridged(x2, s + 7, 0.12); }
      if (f.k === "peak") return f.h * Math.pow(1 - au, 1.25) * (0.88 + 0.12 * r);
      if (f.k === "hills") return f.h * Math.pow(Math.cos(u * Math.PI / 2), 2) * (0.6 + 0.4 * fbm(x2 * 0.06, 2.2, s, 2));
      if (f.k === "mesa") { var m = smooth(1, 0.62, au); return Math.round(f.h * m * (0.92 + 0.08 * r) / 3) * 3; }   // flat top, stepped sides
      if (f.k === "volcano") return f.h * Math.pow(1 - au, 1.1);
      if (f.k === "spires") return f.h * (1 - u * u) * Math.pow(ridged(x2, s, 0.085), 2.2) + f.h * 0.25 * (1 - u * u);
      return f.h * Math.pow(Math.cos(u * Math.PI / 2), 2);   // basin (negative h)
    }
    // ---- 2. the height line ----
    var elev = new Float32Array(W);
    for (x = 0; x < W; x++) {
      var wE = smooth(B_EMBER - 10, B_EMBER + 10, x), wF = 1 - smooth(B_FROST - 10, B_FROST + 10, x), wS = 1 - wE - wF;
      var base = (fbm(x * 0.028, 0, seed, 3) - 0.5) * (8 * wS + 11 * wE + 10 * wF) + (fbm(x * 0.11, 4.4, seed + 5, 2) - 0.5) * 3;
      var up = 0, down = 0;
      for (k = 0; k < feats.length; k++) { var F = feats[k]; if (x > F.x - F.hw && x < F.x + F.hw) { var v = shape(F, x); if (v > up) up = v; if (v < down) down = v; } }
      elev[x] = (base + up + down) * smooth(4, 16, Math.abs(x - SPAWNX));   // a flat, dry camp around the spawn
    }
    if (GEN_EDGE) for (x = 0; x < Math.min(W, 64); x++) {   // a new segment meets the land beside it at the same height, then eases into its own shape
      var ex2 = GEN_EDGE.side < 0 ? W - 1 - x : x, kk = smooth(0, 64, x);
      elev[ex2] = (SURF - GEN_EDGE.h) * (1 - kk) + elev[ex2] * kk;
    }
    for (x = 0; x < W; x++) {
      var hgt = Math.round(SURF - elev[x]);
      if (bio[x] === 1 && sub[x]) hgt = Math.min(Math.round(SURF - elev[x] * 0.35 + Math.max(0, vnoise(x * 0.03, 3.3, seed + 81) - 0.4) * 26), SURF + 7);   // Sunbaked Shores: low rolling dunes, dipping into warm lagoons
      else if (bio[x] === 1) hgt = Math.min(hgt, LAVAL - 2);   // Ember ground never dips into the lava level
      top[x] = Math.max(14, Math.min(SURF + 18, hgt));
    }
    for (var pass = 0; pass < 2; pass++) {   // crisp skyline: no 1-wide spikes or pits, and never more than 2 tiles up from one column to the next
      for (x = 1; x < W - 1; x++) {
        var l = top[x - 1], r2 = top[x + 1], c = top[x];
        if (c < l && c < r2) top[x] = Math.min(l, r2); else if (c > l && c > r2) top[x] = Math.max(l, r2);
      }
      for (x = 1; x < W; x++) if (top[x] < top[x - 1] - 2) top[x] = top[x - 1] - 2;
      for (x = W - 2; x >= 0; x--) if (top[x] < top[x + 1] - 2) top[x] = top[x + 1] - 2;
    }
    feats.forEach(function (f) {   // volcano craters: a bowl cut into the summit, filled with lava later
      if (f.k !== "volcano") return; var sx = f.x, mn = 999; for (x = f.x - 3; x <= f.x + 3; x++) if (top[x] < mn) { mn = top[x]; sx = x; }
      var rim = top[sx], cw = f.cr, dep = 3 + (f.s % 2);
      for (x = sx - cw; x <= sx + cw; x++) { var dx2 = Math.abs(x - sx); top[x] = Math.max(top[x], rim + (dx2 <= cw - 1 ? dep - (dx2 === cw - 1 ? 1 : 0) : 1)); }
      craters.push({ x0: sx - cw, x1: sx + cw, lvl: rim + 1, sub: !!sub[sx] });
      if (!sub[sx]) { f.vx = sx - f.x; f.vy = top[sx]; }   // an OLD VOLCANO: the crater is long cold; a vent in its floor leads down inside (sandbox.js draws it and lets you in)
    });
    // ---- 3. ground, strata and ores ----
    var STEEP = new Uint8Array(W);
    for (x = 1; x < W - 1; x++) STEEP[x] = Math.max(Math.abs(top[x] - top[x - 1]), Math.abs(top[x] - top[x + 1]));
    for (x = 0; x < W; x++) {
      var b = bio[x], vr = sub[x], tp = top[x], alt = SURF - tp, steep = STEEP[x] >= 2 && alt > 6, cap = alt > (b === 2 && !vr ? 22 : 34) && b !== 1;
      var soilN = vnoise(x * 0.2, 0.7, seed + 2), soil = alt > 14 ? 1 + Math.floor(soilN * 2) : 3 + Math.floor(soilN * 3);
      for (y = 0; y < H; y++) {
        var id = T.AIR, d = y - tp;
        if (y < tp) {
          if ((b === 0 || (vr && b === 1)) && y >= WL) id = T.WATER;   // (the Shores' lagoons are water)
          else if (b === 1 && y >= LAVAL) id = T.LAVA;
          else if (b === 2 && y >= ICEL) id = vr ? T.WATER : T.ICE;   // Dark Oakwood ponds are not frozen
        } else if (y >= H - 2 || (y === H - 3 && hash(x, y, seed + 5) < 0.55)) id = T.BEDROCK;
        else if (d === 0) id = cap ? T.SNOW : steep ? (vr ? T.STONE : [T.STONE, T.STONE, T.ICE][b]) : vr ? [T.MOSS, SAND, T.MOSS][b] : [T.MOSS, T.ASH, T.SNOW][b];
        else {
          if (d <= soil && !(steep && d > 1)) { id = cap ? (b === 2 && !vr ? T.ICE : T.STONE) : vr ? [T.MUD, SAND, T.MUD][b] : [T.MUD, T.ASH, T.SNOW][b]; if (b === 2 && !vr && d >= 3) id = T.ICE; }
          else if (b === 0) {
            id = T.STONE;
            if (d < 34 && d >= 3 && fbm(x * 0.09, y * 0.09, seed + 11, 3) > 0.62) id = T.CLAY;
            else if (d >= 4 && d < 60 && Math.sin((y + fbm(x * 0.018, 1.1, seed + 12, 2) * 16) * 0.42) > 0.93 && hash(x >> 3, y, seed + 13) < 0.85) id = T.CLAY;   // thin clay bands you can see in cliff faces
          }
          else if (b === 1) id = d < (alt > 10 ? 4 : 12) ? T.STONE : T.BASALT;
          else id = d < (alt > 10 ? 3 : 6) ? (vr ? T.STONE : T.ICE) : T.FROSTROCK;
          var deep = Math.min(1, Math.max(0, (y - SURF) / 100));   // ore gets more common the deeper you dig
          if (id === T.STONE && d >= 5 && fbm(x * 0.2 + 40, y * 0.2, seed + 21, 2) > 0.7 - deep * 0.06) id = T.SPORE;
          if (id === T.BASALT && fbm(x * 0.22, y * 0.22 + 9, seed + 31, 2) > 0.68 - deep * 0.06) id = T.CINDER;
          if (id === T.FROSTROCK && fbm(x * 0.22 + 5, y * 0.22, seed + 41, 2) > 0.68 - deep * 0.06) id = T.CRYSTAL;
        }
        t[y * W + x] = id;
      }
    }
    craters.forEach(function (c) { for (x = c.x0; x <= c.x1; x++) for (y = c.lvl; y < top[x]; y++) if (t[y * W + x] === T.AIR) t[y * W + x] = sub[x] ? T.WATER : T.LAVA; });   // a Shores crater is a hilltop lagoon (Ember Bog crater lava is drained again at the very end: OLD VOLCANOES)
    // ---- 4. caves ----
    var cm = new Uint8Array(W * H), cm2 = new Uint8Array(W * H);
    for (x = 0; x < W; x++) {
      var tp3 = top[x];
      for (y = tp3 + 6; y < H - 5; y++) {
        var d3 = y - tp3, dd = Math.min(1, Math.max(0, (y - SURF) / 110));
        var cav = fbm(x * 0.042, y * 0.075, seed + 51, 3) > 0.7 - dd * 0.07;                                    // caverns, wider and more common deep down
        var tun = d3 >= 9 && Math.abs(fbm(x * 0.03 + 100, y * 0.06 + 50, seed + 61, 2) - 0.5) < 0.026 + dd * 0.012;   // long winding tunnels
        var tun2 = d3 >= 16 && Math.abs(fbm(x * 0.05 + 300, y * 0.05, seed + 71, 2) - 0.5) < 0.02;                   // a second, crossing tunnel network
        if (cav || tun || tun2) cm[y * W + x] = 1;
      }
    }
    for (var it = 0; it < 2; it++) {   // cellular smoothing: clean, rounded cave walls with no 1-tile crumbs or pinholes
      for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
        i = y * W + x; if (y < top[x] + 5 || y >= H - 5) { cm2[i] = 0; continue; }
        var n = cm[i - W - 1] + cm[i - W] + cm[i - W + 1] + cm[i - 1] + cm[i + 1] + cm[i + W - 1] + cm[i + W] + cm[i + W + 1];
        cm2[i] = n >= 5 ? 1 : n <= 2 ? 0 : cm[i];
      }
      var sw = cm; cm = cm2; cm2 = sw;
    }
    function carve(cx2, cy2, rad) { for (var yy = Math.floor(cy2 - rad); yy <= Math.ceil(cy2 + rad); yy++) for (var xx = Math.floor(cx2 - rad); xx <= Math.ceil(cx2 + rad); xx++) if (xx > 2 && xx < W - 3 && yy > 1 && yy < H - 5 && (xx - cx2) * (xx - cx2) + (yy - cy2) * (yy - cy2) <= rad * rad) cm[yy * W + xx] = 1; }
    [0, 1, 2].forEach(function (b) {   // cave mouths: slanted tunnels that start on a hillside and dive into the network
      if (!hasB(b)) return;
      var nm = Math.max(1, Math.round(ri(5, 8) * Math.min(1, (REG[b][1] - REG[b][0]) / 720)));
      for (var m2 = 0; m2 < nm; m2++) {
        var sx2 = ri(REG[b][0] + 20, REG[b][1] - 20), tries = 0;
        while (tries++ < 40 && (Math.abs(sx2 - SPAWNX) < 30 || STEEP[sx2] < 1 || top[sx2] > SURF + 1 || bio[sx2] !== b)) sx2 = ri(REG[b][0] + 20, REG[b][1] - 20);
        if (tries >= 40) continue;
        var dir = top[sx2 - 2] > top[sx2 + 2] ? 1 : -1, px = sx2, py = top[sx2] + 1, ang = 0.55 + frnd() * 0.45, len = ri(36, 80), rad = 1.3 + frnd() * 0.6;
        for (var st2 = 0; st2 < len; st2++) {
          carve(px, py, rad + Math.sin(st2 * 0.3) * 0.25);
          ang += (frnd() - 0.5) * 0.35; ang = Math.max(0.25, Math.min(1.2, ang));
          px += Math.cos(ang) * dir; py += Math.sin(ang);
          if (py > H - 12) break;
        }
      }
    });
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x; if (!cm[i] || y < top[x]) continue;
      var bb = bio[x]; if (t[i] === T.BEDROCK) continue;
      t[i] = y >= (bb === 1 ? H - 46 : H - 20) ? T.LAVA : T.AIR;
    }
    // still pools: closed cave basins fill up to a flat level (swamp water, ember lava, frostfen ice)
    var seen = new Int32Array(W * H), stamp = 0;
    function pool(px, fy, kmax, fill) {
      for (var kk = kmax; kk >= 2; kk--) {
        var L = fy - kk + 1, q = [fy * W + px], out = [], ok = true; stamp++; seen[q[0]] = stamp;
        while (q.length) {
          var c2 = q.pop(), cx3 = c2 % W, cy3 = (c2 / W) | 0; out.push(c2);
          if (out.length > 220 || cy3 <= top[cx3] + 2) { ok = false; break; }
          var nb = [c2 - 1, c2 + 1, c2 - W, c2 + W];
          for (var z = 0; z < 4; z++) { var e2 = nb[z], ey = (e2 / W) | 0; if (ey < L || ey >= H || seen[e2] === stamp || t[e2] !== T.AIR) continue; seen[e2] = stamp; q.push(e2); }
        }
        if (ok && out.length >= 6) { for (z = 0; z < out.length; z++) t[out[z]] = fill; return true; }
      }
      return false;
    }
    [0, 1, 2].forEach(function (b) {
      if (!hasB(b)) return;
      var want = Math.max(2, Math.round([34, 22, 28][b] * Math.min(1, (REG[b][1] - REG[b][0]) / 720))), fill = [T.WATER, T.LAVA, T.ICE][b], made = 0, tries = 0;
      while (made < want && tries++ < want * 12) {
        var px = ri(REG[b][0] + 8, REG[b][1] - 8), y0 = top[px] + 10 + ri(0, 40);
        for (y = y0; y < H - 24; y++) if (t[y * W + px] === T.AIR && TILES[t[(y + 1) * W + px]].solid) { if (pool(px, y, ri(3, 7), b === 2 && sub[px] ? T.WATER : fill)) made++; break; }
      }
    });
    // ---- 5. trees and plants ----
    function put(px, py, id) { if (px < 0 || px >= W || py < 0) return; var i2 = py * W + px; if (t[i2] === T.AIR) t[i2] = id; }
    function plant(x) {   // a Murkwater mangrove
      var tp2 = top[x], th = 4 + Math.floor(rnd() * 4), cy = tp2 - th - 1, hs = function (a) { return hash(x, 300 + a, seed); };
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
      for (var k2 = 1; k2 <= th + 1; k2++) { var ti = (tp2 - k2) * W + x; if (t[ti] === T.AIR || t[ti] === T.LEAVES) t[ti] = T.LOG; }
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
    function pine(x) {   // a Frostfen pine: a straight trunk and stacked tiers that widen, step in, and widen again
      var tp2 = top[x], th = 6 + Math.floor(hash(x, 310, seed) * 5), P = [0, 1, 1, 2, 1, 2, 3, 2, 3], k2, row;
      for (k2 = 1; k2 <= th; k2++) t[(tp2 - k2) * W + x] = T.LOG;
      for (row = 0; row < Math.min(9, th - 1); row++) for (var dx = -P[row]; dx <= P[row]; dx++) put(x + dx, tp2 - th - 1 + row, T.LEAVES);
    }
    function snag(x) {   // an Ember Bog dead tree: a charred trunk with a couple of bare branches
      var tp2 = top[x], th = 3 + Math.floor(hash(x, 320, seed) * 4), k2;
      for (k2 = 1; k2 <= th; k2++) t[(tp2 - k2) * W + x] = T.LOG;
      var s1 = hash(x, 321, seed) < 0.5 ? -1 : 1; put(x + s1, tp2 - th + 1, T.LOG); put(x + s1 * 2, tp2 - th, T.LOG);
      if (th >= 5) { put(x - s1, tp2 - th + 2, T.LOG); }
    }
    // ---- variant trees ----
    function blobL(cx, cy2, rx, ry, k9) { for (var dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) for (var dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) if (dx * dx / (rx * rx) + dy * dy / (ry * ry) <= 1 + (hash(cx + dx, cy2 + dy, seed + k9) - 0.5) * 0.4) put(cx + dx, cy2 + dy, T.LEAVES); }
    function trunk(x2, tp2, th) { for (var k2 = 1; k2 <= th; k2++) { var ti = (tp2 - k2) * W + x2; if (t[ti] === T.AIR || t[ti] === T.LEAVES) t[ti] = T.LOG; } }
    function cherry(x) {   // Cherry Blossom Vale: a short trunk that forks, under a wide, flat-bottomed cloud of blossom
      var tp2 = top[x], th = 4 + Math.floor(hash(x, 330, seed) * 3), cy = tp2 - th - 1, side = hash(x, 331, seed) < 0.5 ? -1 : 1;
      blobL(x, cy, 3.6, 2.1, 12); blobL(x + side * 3, cy + 1, 2.4, 1.5, 13); blobL(x - side * 2, cy - 1, 2.3, 1.5, 14); blobL(x + side, cy - 2, 2, 1.2, 15);
      trunk(x, tp2, th + 1); put(x + side, tp2 - th + 1, T.LOG); put(x + side * 2, tp2 - th, T.LOG);
    }
    function palm(x) {   // Sunbaked Shores: a tall, leaning trunk and a crown of drooping fronds
      var tp2 = top[x], th = 6 + Math.floor(hash(x, 340, seed) * 4), lean = hash(x, 341, seed) < 0.5 ? -1 : 1, k2, cx = x;
      for (k2 = 1; k2 <= th; k2++) { if (k2 === Math.ceil(th * 0.6)) cx += lean; var ti = (tp2 - k2) * W + cx; if (t[ti] === T.AIR) t[ti] = T.LOG; }
      var cy = tp2 - th - 1;
      put(cx, cy, T.LEAVES); put(cx - 1, cy, T.LEAVES); put(cx + 1, cy, T.LEAVES); put(cx, cy - 1, T.LEAVES);
      for (var sd = -1; sd <= 1; sd += 2) { put(cx + sd * 2, cy, T.LEAVES); put(cx + sd * 3, cy + 1, T.LEAVES); put(cx + sd * 4, cy + 2, T.LEAVES); put(cx + sd * 2, cy - 1, T.LEAVES); put(cx + sd * 3, cy - 1, T.LEAVES); }
    }
    function darkoak(x) {   // Dark Oakwood: a thick two-wide trunk with roots and a huge, heavy crown
      var tp2 = top[x], th = 6 + Math.floor(hash(x, 350, seed) * 4), cy = tp2 - th - 2;
      blobL(x, cy, 4, 2.4, 16); blobL(x + 1, cy - 2, 3.4, 2, 17); blobL(x - 4, cy + 1, 2.6, 1.7, 18); blobL(x + 5, cy + 1, 2.6, 1.7, 19); blobL(x - 1, cy - 4, 2.2, 1.3, 20); blobL(x + 3, cy - 4, 2, 1.3, 21);
      trunk(x, tp2, th + 1); trunk(x + 1, tp2, th);
      if (TILES[t[tp2 * W + x - 1]].solid) put(x - 1, tp2 - 1, T.LOG); if (TILES[t[tp2 * W + x + 2]].solid && hash(x, 351, seed) < 0.6) put(x + 2, tp2 - 1, T.LOG);
      var by = tp2 - 3 - Math.floor(th / 3); put(x + 2, by, T.LOG); put(x + 3, by - 1, T.LOG);
    }
    var VPL = function (k, fb) { var v = T["X_" + k]; return v !== undefined ? v : fb; }, P_PETAL = VPL("sakuratuft", T.FLOWER), P_CACT = VPL("cactus", T.BLOOM), P_SHELL = VPL("shelltuft", T.REED), P_FERN = VPL("ferntuft", T.REED), P_DCAP = VPL("duskcaptuft", T.GLOWCAP);
    function flat(x2) { return Math.abs(top[x2 - 1] - top[x2]) <= 1 && Math.abs(top[x2 + 1] - top[x2]) <= 1; }
    var lastTree = -9, trees = [];
    for (x = 4; x < W - 4; x++) {
      var gid0 = t[top[x] * W + x], above0 = t[(top[x] - 1) * W + x];
      if (above0 !== T.AIR) continue;
      if (sub[x]) {   // the variant lands
        if (!flat(x)) continue;
        if (bio[x] === 0) { if (top[x] > WL || gid0 !== T.MOSS) continue; if (x - lastTree > 5 && hash(x, 332, seed) < 0.22) { lastTree = x; trees.push(x); cherry(x); } }
        else if (bio[x] === 1) { if (gid0 !== SAND || top[x] >= WL) continue; if (x - lastTree > 6 && hash(x, 342, seed) < 0.13) { lastTree = x; palm(x); } }
        else { if (gid0 !== T.MOSS || top[x] > ICEL || !flat(x + 1) || t[(top[x + 1] - 1) * W + x + 1] !== T.AIR || top[x + 1] !== top[x]) continue; if (x - lastTree > 8 && hash(x, 352, seed) < 0.3) { lastTree = x + 1; darkoak(x); } else if (x - lastTree > 1 && hash(x, 353, seed) < 0.1) t[(top[x] - 1) * W + x] = T.GLOWCAP; }
        continue;
      }
      if (bio[x] === 0) {
        if (top[x] > WL || gid0 !== T.MOSS || !flat(x)) continue;
        if (x - lastTree > 4 && rnd() < 0.26) { lastTree = x; trees.push(x); plant(x); }
        else if (x - lastTree > 1 && rnd() < 0.16) t[(top[x] - 1) * W + x] = T.GLOWCAP;
      } else if (bio[x] === 2) {
        if (gid0 !== T.SNOW || !flat(x) || SURF - top[x] > 30) continue;
        if (x - lastTree > 6 && hash(x, 311, seed) < 0.16) { lastTree = x; pine(x); }
      } else {
        if (gid0 !== T.ASH || !flat(x)) continue;
        if (x - lastTree > 9 && hash(x, 322, seed) < 0.07) { lastTree = x; snag(x); }
      }
    }
    if (SPAWNX >= 40 && SPAWNX < W - 40) for (x = SPAWNX - 34; x < SPAWNX + 34 && trees.length < 10; x += 3) {   // always enough Wood near camp
      if (top[x] > WL || trees.some(function (q2) { return Math.abs(q2 - x) < 5; })) continue;
      trees.push(x); plant(x);
    }
    for (x = 2; x < W - 2; x++) {   // surface plants
      var sy = top[x] - 1, r = hash(x, 91, seed), bb2 = bio[x], gid = t[top[x] * W + x];
      if (sy < 1 || t[sy * W + x] !== T.AIR || gid === T.WATER || gid === T.STONE || gid === T.ICE) continue;
      if (sub[x]) {   // variant plants: blossom tufts, cacti and shells, ferns and dusk mushrooms
        if (bb2 === 0 && gid === T.MOSS) t[sy * W + x] = r < 0.2 ? P_PETAL : r < 0.27 ? T.REED : T.AIR;
        else if (bb2 === 1 && gid === SAND) t[sy * W + x] = r < 0.07 ? P_CACT : r < 0.1 ? P_SHELL : T.AIR;
        else if (bb2 === 2 && gid === T.MOSS) t[sy * W + x] = r < 0.16 ? P_FERN : r < 0.22 ? P_DCAP : T.AIR;
        continue;
      }
      if (bb2 === 0 && gid === T.MOSS && r < 0.26) t[sy * W + x] = T.REED;
      else if (bb2 === 1 && r < 0.16) t[sy * W + x] = T.BLOOM;
      else if (bb2 === 2 && r < 0.18) t[sy * W + x] = T.SPIKE;
    }
    // ---- 6. cave holes: little burrows on dry ground (one a short walk from the spawn), about 36 columns apart ----
    var holes = [];
    function holeOk(hx) {
      if (hx < 8 || hx >= W - 8) return false;
      var sy = top[hx] - 1; if (sy < 3 || !TILES[t[top[hx] * W + hx]].solid) return false;
      var g0 = t[sy * W + hx]; if (g0 !== T.AIR && g0 !== T.REED && g0 !== T.BLOOM && g0 !== T.SPIKE && g0 !== T.GLOWCAP && !(TILES[g0].sway && !TILES[g0].solid)) return false;
      if (t[(sy - 1) * W + hx] !== T.AIR || t[(sy - 2) * W + hx] !== T.AIR) return false;
      if (Math.abs(SPAWNX - hx) < 9) return false;
      for (var k3 = 0; k3 < holes.length; k3++) if (Math.abs(holes[k3].x - hx) < 14) return false;
      return Math.abs(top[hx - 1] - top[hx]) <= 1 && Math.abs(top[hx + 1] - top[hx]) <= 1;
    }
    function addHole(hx) { var sy = top[hx] - 1; holes.push({ x: hx, y: sy, b: bio[hx], was: t[sy * W + hx] }); t[sy * W + hx] = T.HOLE; }
    var side = hash(7, 0, seed) < 0.5 ? 1 : -1, mineH = null;
    for (x = 0; x < 30; x++) { var gx = SPAWNX + side * (12 + x); if (holeOk(gx)) { addHole(gx); mineH = holes[0]; break; } }
    for (var cx0 = 0; cx0 < W; cx0 += 36) {
      var start = cx0 + Math.floor(hash(cx0, 8, seed) * 36);
      for (x = 0; x < 14; x++) { var hx = (start + x) % W; if (holeOk(hx)) { addHole(hx); break; } }
    }
    holes.sort(function (a, b) { return a.x - b.x; });
    // THE MINE: there is only ONE way down now, a mineshaft a short walk from the spawn. The other burrows are still worked out above
    // (so buildings and landmarks keep avoiding those spots and every old world keeps its layout), but they are filled back in at the end.
    if (!mineH && SPAWNX >= 0) holes.forEach(function (h) { if (!mineH || Math.abs(h.x - SPAWNX) < Math.abs(mineH.x - SPAWNX)) mineH = h; });
    var oldHoles = holes;
    // ---- 7. structures (see buildStructures): standalone buildings with a door you can walk into ----
    var structs = buildStructures(t, top, bio, seed, holes, walls, sub, GEN_VAR);
    // ---- 7b. LANDMARKS (only in land made after they were added): stone circles, ruined camps, wishing wells, signposts, old mines,
    // shipwrecks on the Sunbaked Shores, treehouses in the Dark Oakwood and moon gates in the Cherry Blossom Vale. Plain blocks you can use
    // and dig like any other; world.marks lists them for the map and the signposts.
    var marks = [];
    if (GEN_VAR) (function () {
      function MK(n, fb) { var v = T["X_" + n]; return v !== undefined ? v : fb; }
      var NOTE = MK("lorenote", T.AIR), STN = MK("standingstone", T.STONE), ALT = MK("runealtar", T.CRYSTALLAMP), TENT = MK("tent", T.BARREL), SIGN = MK("signpost", T.SIGN || T.FENCE), CHEST = MK("lootchest", T.CHEST), CART = MK("minecart", T.BARREL), SL = MK("stonelantern", T.LANTERN), PL = MK("paperlantern", T.LANTERN), COB = MK("cobble", T.STONE);
      var ORE = [MK("bogironore", T.STONE), MK("sulfurore", T.STONE), MK("sapphireore", T.STONE)], ORE2 = [MK("amberore", T.STONE), MK("rubyore", T.STONE), MK("moonore", T.STONE)];
      function setT(px, py, id) { if (px > 1 && px < W - 2 && py > 1 && py < H - 3) t[py * W + px] = id; }
      function wl(px, py, id) { if (px > 1 && px < W - 2 && py > 1 && py < H - 3) walls[py * W + px] = id; }
      function busy(a, z) {
        for (var q = 0; q < structs.length; q++) if (a <= structs[q].mx1 + 6 && z >= structs[q].mx0 - 6) return true;
        for (q = 0; q < holes.length; q++) if (holes[q].x >= a - 2 && holes[q].x <= z + 2) return true;
        for (q = 0; q < marks.length; q++) if (a <= marks[q].x + 14 && z >= marks[q].x - 14) return true;
        return Math.abs(SPAWNX - (a + z) / 2) < 40 + (z - a);
      }
      function level(a, z, tol) {   // the ground row if a..z is dry, solid and nearly flat, else -1
        var mn = 999, mx = -1; if (a < 6 || z > W - 7) return -1;
        for (var q = a; q <= z; q++) { var tp = top[q], gid = t[tp * W + q]; if (!TILES[gid].solid || gid === T.WATER || gid === T.ICE || gid === T.LAVA) return -1; var ab = t[(tp - 1) * W + q]; if (ab === T.WATER || ab === T.LAVA) return -1; if (tp < mn) mn = tp; if (tp > mx) mx = tp; }
        return mx - mn <= tol ? mn : -1;
      }
      function pad(a, z, gy) {   // fill low columns up to row gy and clear plants above it (and any tree standing in the way, canopy and all)
        for (var q0 = Math.max(1, a - 5); q0 <= Math.min(W - 2, z + 5); q0++) for (var y0 = 1; y0 < Math.min(gy, top[q0]); y0++) { var i0 = y0 * W + q0; if (t[i0] === T.LOG || t[i0] === T.LEAVES || t[i0] === T.VINE) t[i0] = T.AIR; }
        for (var q = a; q <= z; q++) { var g0 = t[top[q] * W + q], g1 = t[(top[q] + 1) * W + q]; if (!TILES[g1].solid) g1 = T.STONE; for (var yy = gy; yy < top[q]; yy++) t[yy * W + q] = yy === gy ? g0 : g1; for (yy = Math.max(1, gy - 9); yy < gy; yy++) { var id0 = t[yy * W + q]; if (id0 !== T.AIR && !TILES[id0].solid && TILES[id0].kind !== "water") t[yy * W + q] = T.AIR; } top[q] = Math.min(top[q], gy); }
      }
      var B = {
        stones: { w: 11, f: function (cx, gy) {
          [[-5, 3], [-3, 2], [3, 2], [5, 3]].forEach(function (q) { for (var k = 1; k <= q[1]; k++) setT(cx + q[0], gy - k, STN); });
          setT(cx - 1, gy - 3, STN); setT(cx, gy - 3, MK("orderstone", STN)); setT(cx + 1, gy - 3, STN); setT(cx - 1, gy - 2, STN); setT(cx + 1, gy - 2, STN);   // a trilithon over the altar
          setT(cx, gy - 1, ALT); setT(cx + 2, gy - 1, NOTE); return "Stone Circle";
        } },
        camp: { w: 9, f: function (cx, gy) { setT(cx - 3, gy - 1, TENT); setT(cx - 1, gy - 1, T.CAMPFIRE); setT(cx + 1, gy - 1, T.STOOL); setT(cx + 3, gy - 1, CHEST); setT(cx + 4, gy - 1, MK("sack", T.BARREL)); setT(cx, gy - 1, NOTE); return "Old Campsite"; } },
        well: { w: 7, f: function (cx, gy) { setT(cx, gy - 1, T.WELL); setT(cx + 2, gy - 1, T.BUCKET); setT(cx - 2, gy - 1, T.FLOWER); setT(cx + 3, gy - 1, SIGN); setT(cx + 1, gy - 1, NOTE); return "Wishing Well"; } },
        sign: { w: 3, f: function (cx, gy) { setT(cx, gy - 1, SIGN); setT(cx + 1, gy - 1, T.TORCH); return "Signpost"; } },
        moongate: { w: 13, f: function (cx, gy) {
          for (var k = 1; k <= 3; k++) { setT(cx - 3, gy - k, COB); setT(cx + 3, gy - k, COB); }
          setT(cx - 2, gy - 4, COB); setT(cx + 2, gy - 4, COB); for (k = -1; k <= 1; k++) setT(cx + k, gy - 5, COB); setT(cx - 3, gy - 4, MK("mossbrick", COB)); setT(cx + 3, gy - 4, MK("mossbrick", COB));
          setT(cx, gy - 4, PL); setT(cx - 6, gy - 1, SL); setT(cx + 6, gy - 1, SL); setT(cx + 1, gy - 1, NOTE); return "Moon Gate";
        } },
        mine: { w: 9, f: function (cx, gy) {
          var D = 14 + Math.floor(hash(cx, 961, seed) * 8), bot = gy + D, b = bio[cx], k, yy, xx;
          if (bot > H - 30) return null;
          for (k = 1; k <= 4; k++) { setT(cx - 2, gy - k, T.LOG); setT(cx + 2, gy - k, T.LOG); }   // the headframe
          for (xx = cx - 3; xx <= cx + 3; xx++) setT(xx, gy - 5, T.PLANKS); setT(cx, gy - 4, T.LANTERN); setT(cx + 3, gy - 1, CART);
          for (yy = gy - 3; yy <= bot; yy++) for (xx = cx - 1; xx <= cx + 1; xx++) { if (yy >= gy) { setT(xx, yy, T.AIR); wl(xx, yy, T.W_PLANK); } }
          for (yy = gy - 3; yy <= bot; yy++) setT(cx, yy, T.LADDER);
          for (yy = gy + 4; yy < bot; yy += 5) { setT(cx - 1, yy, T.LANTERN); setT(cx - 2, yy, T.PLANKS); setT(cx + 2, yy, T.PLANKS); }
          for (yy = bot - 3; yy <= bot; yy++) for (xx = cx - 6; xx <= cx + 6; xx++) { setT(xx, yy, xx === cx ? T.LADDER : T.AIR); wl(xx, yy, T.W_PLANK); }   // the chamber at the bottom
          for (xx = cx - 7; xx <= cx + 7; xx++) { setT(xx, bot + 1, T.PLANKS); setT(xx, bot - 4, xx % 3 === 0 ? T.LOG : T.PLANKS); }
          for (yy = bot - 3; yy <= bot; yy++) { setT(cx - 7, yy, yy === bot - 3 ? T.LOG : ORE[b]); setT(cx + 7, yy, yy === bot ? ORE2[b] : ORE[b]); }
          setT(cx - 5, bot, CART); setT(cx + 5, bot, CHEST); setT(cx - 3, bot - 3, T.LANTERN); setT(cx + 3, bot - 3, T.LANTERN); setT(cx + 4, bot, MK("crate", T.BARREL)); setT(cx + 2, bot, NOTE);
          return "Abandoned Mine";
        } },
        wreck: { w: 11, f: function (cx, gy) {
          var d = hash(cx, 962, seed) < 0.5 ? -1 : 1, k, xx;
          for (xx = cx - 4; xx <= cx + 4; xx++) setT(xx, gy - 1, T.PLANKS);
          for (xx = cx - 5; xx <= cx + 5; xx++) if (Math.abs(xx - cx) >= 4 || hash(xx, 963, seed) < 0.55) setT(xx, gy - 2, T.PLANKS);
          setT(cx - 5 * d, gy - 3, T.LOG); setT(cx - 6 * d, gy - 4, T.LOG); setT(cx + 5 * d, gy - 2, T.LOG);   // the bow rears up, the stern sits low
          for (k = 3; k <= 8; k++) setT(cx, gy - k, T.LOG); setT(cx + d, gy - 8, T.LOG);   // a broken mast
          for (k = 5; k <= 7; k++) for (xx = 1; xx <= 3; xx++) wl(cx + d * xx, gy - k, T.W_PLASTER);   // a torn sail
          setT(cx + 2 * d, gy - 2, CHEST); setT(cx - 2 * d, gy - 2, T.BARREL); setT(cx - 3 * d, gy - 3, MK("shelltuft", T.AIR)); setT(cx - d, gy - 2, NOTE);
          return "Shipwreck";
        } },
        treehouse: { w: 1, f: null }
      };
      var LIST = { "0:0": ["stones", "camp", "well", "well", "mine", "sign"], "0:1": ["moongate", "moongate", "well", "stones", "camp"], "1:0": ["mine", "mine", "camp", "stones", "sign"], "1:1": ["wreck", "wreck", "wreck", "camp", "stones"],
        "2:0": ["mine", "mine", "stones", "camp", "sign"], "2:1": ["treehouse", "treehouse", "treehouse", "camp", "stones"] };
      function treehouse(x0) {   // find a dark oak trunk near x0 and build a platform up in it
        for (var x = x0 - 30; x <= x0 + 30; x++) {
          if (x < 8 || x > W - 9 || bio[x] !== 2 || !sub[x]) continue;
          var tp = top[x]; if (t[(tp - 1) * W + x] !== T.LOG || t[(tp - 1) * W + x + 1] !== T.LOG || t[(tp - 6) * W + x] !== T.LOG || busy(x - 6, x + 7)) continue;
          var py = tp - 5, xx;
          for (xx = x - 5; xx <= x + 6; xx++) if (xx !== x && xx !== x + 1) setT(xx, py, xx === x - 3 ? T.LADDER : T.PLANKS);
          for (var yy = py + 1; yy < top[x - 3]; yy++) setT(x - 3, yy, T.LADDER);
          setT(x - 5, py - 1, T.FENCE); setT(x + 6, py - 1, T.FENCE); setT(x - 4, py - 1, CHEST); setT(x + 3, py - 1, T.BARREL); setT(x + 4, py - 1, T.LANTERN); setT(x + 5, py - 1, T.STOOL); setT(x + 2, py - 1, NOTE);
          for (yy = py - 3; yy <= py - 1; yy++) { if (t[yy * W + x - 5] === T.AIR || t[yy * W + x - 5] === T.LEAVES) setT(x - 5, yy, yy === py - 1 ? T.FENCE : T.LOG); }
          for (xx = x - 6; xx <= x - 2; xx++) setT(xx, py - 4, T.THATCH);
          return { x: x, y: py - 1, n: "Ranger's Treehouse" };
        }
        return null;
      }
      for (var sx = 50, sl = 0; sx < W - 50; sx += GEN_SPARSE ? 150 : 100, sl++) {
        if (hash(sl, 960, seed) < (GEN_SPARSE ? 0.3 : 0.22)) continue;
        var cx0 = sx + Math.floor(hash(sl, 964, seed) * 60) - 30, L = LIST[bio[clamp0(cx0)] + ":" + (sub[clamp0(cx0)] ? 1 : 0)], kind = L[Math.floor(hash(sl, 965, seed) * L.length)];
        if (kind === "treehouse") { var th2 = treehouse(cx0); if (th2) marks.push({ k: "treehouse", x: th2.x, y: th2.y, n: th2.n }); continue; }
        var D2 = B[kind];
        for (var nd = 0; nd < 20; nd++) {
          var cx = cx0 + (nd % 2 ? 1 : -1) * Math.ceil(nd / 2) * 4, a = cx - (D2.w >> 1), z = cx + (D2.w >> 1);
          if (busy(a, z)) continue;
          if (kind === "wreck") { var nearW = false; for (var q2 = a - 6; q2 <= z + 6; q2++) if (q2 > 0 && q2 < W && t[(top[q2] - 1) * W + q2] === T.WATER) nearW = true; if (!nearW) continue; }
          var gy = level(a, z, kind === "sign" || kind === "wreck" || kind === "stones" ? 3 : 2); if (gy < 0) continue;
          pad(a, z, gy);
          var nm = D2.f(cx, gy); if (!nm) continue;
          marks.push({ k: kind, x: cx, y: gy - 1, n: nm }); break;
        }
      }
      function clamp0(v) { return Math.max(0, Math.min(W - 1, v)); }
    })();
    // ---- 8. the Cinder Aerie: a floating ruin high in the sky over Ember Bog, reached by the hot updraft of a Thermal Vent beside it ----
    // Built after everything else, almost entirely in open sky, so it never moves any other building. Saved as world.aerie.
    var aerie = (function () {
      function M2(name, fb) { var v = T["X_" + name]; return v !== undefined ? v : fb; }
      if (!GEN_AERIE) return null;
      var ax = Math.floor(B_EMBER + 220 + hash(7, 901, seed) * 340), hw = 10, x0 = ax - hw, x1 = ax + hw, Y = 20;
      if (x1 + 6 > W - 4) return null;
      var vx = x1 + 3, gy = top[vx];
      function put(px, py, id) { if (px > 0 && px < W - 1 && py > 0 && py < H - 1) t[py * W + px] = id; }
      var OBS = M2("obsidianbrick", T.BASALTBRICK), CH = M2("lootchest", T.CHEST), VENT = M2("thermalvent", T.BRAZIER), x, y, r;
      // the underside: a rough upside-down cone of basalt shot through with cinder, with glowing crystals hanging off it
      for (r = 0; r <= 8; r++) {
        var half = Math.round(hw - r * 1.15 + (hash(r, 902, seed) - 0.5) * 2); if (half < 1) break;
        for (x = ax - half; x <= ax + half; x++) put(x, Y + 1 + r, hash(x, Y + r, seed + 903) < 0.16 ? T.CINDER : T.BASALT);
        if (r > 1 && hash(r, 904, seed) < 0.7) { put(ax - half, Y + 2 + r, T.CINDERLAMP); put(ax + half, Y + 2 + r, T.CINDERLAMP); }
      }
      put(ax, Y + 10, T.CINDERLAMP); put(ax, Y + 11, T.CINDERLAMP);
      // the deck, broken pillars at the ends, and a stepped ziggurat with the chest on its crown
      for (x = x0; x <= x1; x++) put(x, Y, OBS);
      [x0 + 1, x1 - 1].forEach(function (px, i) { var hh = 3 + (i ? 1 : 0); for (y = Y - 1; y >= Y - hh; y--) put(px, y, T.BASALTBRICK); put(px, Y - hh - 1, T.CINDERLAMP); });
      put(x0 + 3, Y - 1, T.BRAZIER); put(x1 - 3, Y - 1, T.BRAZIER);
      for (var tier = 0; tier < 3; tier++) { var tw = 6 - tier * 2; for (y = Y - 1 - tier * 2; y >= Y - 2 - tier * 2; y--) for (x = ax - tw; x <= ax + tw; x++) put(x, y, tier === 2 ? OBS : T.BASALTBRICK); }
      put(ax - 2, Y - 6, T.CINDERLAMP); put(ax + 2, Y - 6, T.CINDERLAMP);
      put(ax, Y - 7, CH);
      // the Thermal Vent on the ground beside it: clear a column of sky above it so the updraft has room
      if (gy > Y + 4 && gy < H - 4) {
        for (y = Y - 3; y < gy - 1; y++) for (x = vx - 1; x <= vx + 1; x++) put(x, y, T.AIR);
        for (x = vx - 1; x <= vx + 1; x++) if (!TILES[t[gy * W + x]].solid) put(x, gy, T.BASALT);
        put(vx, gy - 1, VENT);
      }
      return { x0: x0, x1: x1, y: Y, cx: ax, cy: Y - 7, vx: vx, vy: gy - 1 };
    })();
    // ---- 9. the SKY VILLAGE: a floating island west of camp where the swamp villagers live (sandbox.js SKY VILLAGE draws them and runs their trades)
    // One per world, in the original map only, built last and almost entirely in open sky (so it also appears in worlds made before it existed).
    // A Sky Vine climbs to it from the ground. Main island (smithy, Toad Dwarf hold, Village Hall, market, lumber mill) + a rope bridge + a wooded islet.
    // The houses are buildings like the others (world.structs, ids after every other building), so you walk in through their doors.
    var sky = (function () {
      if (!GEN_AERIE) return null;
      function MS(n, fb) { var v = T["X_" + n]; return v !== undefined ? v : fb; }
      var Y = 26, IW = 88, A = -1, x, y, k;
      function clearSky(a) { if (a < 12 || a + IW > W - 12) return false; for (var q = a - 2; q <= a + IW + 2; q++) if (top[q] < Y + 18) return false; return true; }
      for (k = 0; k < 120 && A < 0; k++) { var c1 = SPAWNX - 300 - k * 6, c2 = SPAWNX + 120 + k * 6; if (clearSky(c1)) A = c1; else if (k > 30 && clearSky(c2) && (!aerie || c2 > aerie.x1 + 20 || c2 + IW < aerie.x0 - 20)) A = c2; }
      if (A < 0) return null;
      function put(px, py, id) { if (px > 0 && px < W - 1 && py > 1 && py < H - 2) t[py * W + px] = id; }
      function wall(px, py, id) { if (px > 0 && px < W - 1 && py > 1 && py < H - 2) walls[py * W + px] = id; }
      var COB = MS("cobble", T.STONE), PLAS = MS("plasterblock", T.PLANKS), SHR = MS("shinglered", T.THATCH), SHB = MS("shingleblue", T.BASALTBRICK), RBR = MS("redbrick", T.BRICK), MOSSB = MS("mossbrick", T.BRICK), BARS = MS("ironbars", T.GLASS);
      var LAMP = MS("streetlamp", T.LANTERN), HL = MS("hanginglantern", T.LANTERN), CRATE = MS("crate", T.BARREL), SACK = MS("sack", T.BARREL), VINE = MS("skyvine", T.LADDER), GL = T.GLASS;
      // the islands: a grassy deck on a rocky, root-hung underside
      function island(a, z, deep) {
        var cx = (a + z) / 2, hw = (z - a) / 2;
        for (x = a; x <= z; x++) {
          var u = (x - cx) / hw, d = Math.round(2 + (1 - u * u) * deep + (hash(x, 970, seed) - 0.5) * 3);
          for (y = Y; y <= Y + d; y++) put(x, y, y === Y ? T.MOSS : y <= Y + 2 ? T.MUD : hash(x, y, seed + 971) < 0.1 ? T.SPORE : T.STONE);
          if (hash(x, 972, seed) < 0.35) for (y = Y + d + 1; y <= Y + d + 1 + Math.floor(hash(x, 973, seed) * 4); y++) put(x, y, T.VINE);   // hanging roots
          else if (hash(x, 974, seed) < 0.06) put(x, Y + d + 1, T.LANTERN);
        }
      }
      var M0 = A, M1 = A + 56, I0 = A + 67, I1 = A + IW - 1;
      island(M0, M1, 14); island(I0, I1, 8);
      for (x = M1 + 1; x < I0; x++) { put(x, Y, T.PLANKS); if (x === M1 + 1 || x === I0 - 1) { put(x, Y - 1, T.FENCE); put(x, Y - 2, HL); } }   // the rope bridge
      put(M0, Y - 1, T.PLANKS); put(I1, Y - 1, T.PLANKS);   // a low rail at each far end
      var out = [], base = structs.length;
      // a house: blueprint fn(x0, x1, gy, top0, side) builds the shell; the door goes in the side wall
      function house(kind, name, x0, w, bh, side, fn) {
        var x1 = x0 + w - 1, gy = Y, top0 = gy - bh, bx0 = x0, bx1 = x1, by0 = gy - 1;
        var P = function (px, py, id) { put(px, py, id); if (px < bx0) bx0 = px; if (px > bx1) bx1 = px; if (py < by0) by0 = py; };
        fn(P, x0, x1, gy, top0, x0 + Math.floor(w / 2));
        var dx = side < 0 ? x0 : x1; P(dx, gy - 1, T.DOOR_B); P(dx, gy - 2, T.DOOR_T); P(dx + side, gy - 3, HL);
        out.push({ id: base + out.length, kind: kind, name: name, b: bio[x0], x0: x0, x1: x1, w: w, gy: gy, bh: bh, side: side, dx: dx, outX: dx + side, doorY: gy - 1, mx0: bx0, mx1: bx1, my0: by0, sky: 1 });
      }
      function gableP(P, xa, xb, yb, edge, fillId) { for (var r = 0; ; r++) { var L = xa + r, R = xb - r, yR = yb - r; if (L > R) return; for (var q = L; q <= R; q++) P(q, yR, (q - L < 2 || R - q < 2 || R - L <= 2) ? edge : fillId); if (L === R) return; } }
      house("smithy", "Turtle Smithy", A + 2, 9, 5, 1, function (P, x0, x1, gy, top0, cx) {
        for (y = top0; y <= gy - 1; y++) for (x = x0; x <= x1; x++) P(x, y, y === gy - 1 ? COB : RBR);
        P(x0 + 2, gy - 3, BARS); P(x0 + 2, gy - 4, BARS); P(cx + 1, gy - 3, BARS); P(cx + 1, gy - 4, BARS);
        gableP(P, x0 - 1, x1 + 1, top0 - 1, SHR, T.PLANKS); for (y = top0 - 2; y > top0 - 7; y--) P(x0 + 2, y, RBR); P(x0 + 1, top0 - 7, T.STONE); P(x0 + 2, top0 - 7, T.STONE); P(x0 + 3, top0 - 7, T.STONE);
      });
      put(A + 12, Y - 1, T.ANVIL);
      house("dwarfhold", "Toad Dwarf Hold", A + 14, 9, 6, -1, function (P, x0, x1, gy, top0, cx) {
        for (y = top0; y <= gy - 1; y++) for (x = x0; x <= x1; x++) P(x, y, (x === x0 || x === x1) ? MOSSB : (y - top0) % 3 === 0 ? MOSSB : COB);
        P(cx, gy - 4, T.LANTERN); P(cx - 2, gy - 3, BARS); P(cx + 2, gy - 3, BARS);
        for (x = x0 - 1; x <= x1 + 1; x++) P(x, top0 - 1, COB); for (x = x0 - 1; x <= x1 + 1; x += 2) P(x, top0 - 2, COB);
        P(cx, top0 - 3, T.LOG); P(cx, top0 - 4, T.LOG); P(cx + 1, top0 - 4, T.BANNER);
      });
      house("skyhall", "Village Hall", A + 27, 13, 7, -1, function (P, x0, x1, gy, top0, cx) {
        for (x = x0; x <= x1; x++) P(x, gy - 1, COB);
        for (y = top0; y <= gy - 2; y++) for (x = x0; x <= x1; x++) P(x, y, PLAS);
        [x0, x0 + 4, cx, x1 - 4, x1].forEach(function (px) { for (y = top0; y <= gy - 2; y++) P(px, y, T.LOG); });
        [x0 + 2, x1 - 2].forEach(function (px) { for (y = gy - 5; y <= gy - 3; y++) P(px, y, GL); }); P(cx - 2, gy - 4, GL); P(cx + 2, gy - 4, GL); P(cx, gy - 6, MS("stainedblue", GL));
        for (x = x0 - 1; x <= x1 + 1; x++) P(x, top0 - 1, T.LOG);
        gableP(P, x0 - 2, x1 + 2, top0 - 2, SHB, T.PLANKS);
        for (y = top0 - 10; y <= top0 - 8; y++) { P(cx - 1, y, T.LOG); P(cx + 1, y, T.LOG); } P(cx, top0 - 9, HL); P(cx - 1, top0 - 11, SHB); P(cx, top0 - 11, SHB); P(cx + 1, top0 - 11, SHB); P(cx, top0 - 12, SHB); P(cx, top0 - 13, T.BANNER);   // the belfry
      });
      // the market square: two awning stalls, crates and sacks, a well
      [[A + 42, SHR], [A + 46, MS("shingleblue", SHR)]].forEach(function (q) { put(q[0] - 1, Y - 1, T.FENCE); put(q[0] + 1, Y - 1, T.FENCE); put(q[0] - 1, Y - 2, T.FENCE); put(q[0] + 1, Y - 2, T.FENCE); for (x = q[0] - 1; x <= q[0] + 1; x++) put(x, Y - 3, q[1]); put(q[0], Y - 1, x % 2 ? CRATE : SACK); });
      put(A + 44, Y - 1, T.WELL); put(A + 41, Y - 1, T.BARREL); put(A + 49, Y - 1, SACK);
      house("sawmill", "Beaver Lumber Mill", A + 51, 6, 5, 1, function (P, x0, x1, gy, top0, cx) {
        for (y = top0; y <= gy - 1; y++) for (x = x0; x <= x1; x++) P(x, y, T.PLANKS);
        [x0, x1].forEach(function (px) { for (y = top0; y <= gy - 1; y++) P(px, y, T.LOG); }); P(cx, gy - 4, GL); P(cx - 1, gy - 4, GL);
        gableP(P, x0 - 1, x1 + 1, top0 - 1, T.THATCH, T.THATCH);
      });
      [A + 5, A + 20, A + 25, A + 40, A + 50].forEach(function (lx) { if (t[(Y - 1) * W + lx] === T.AIR) put(lx, Y - 1, LAMP); });
      [A + 1, A + 13, A + 24, A + 39].forEach(function (fx) { if (t[(Y - 1) * W + fx] === T.AIR) put(fx, Y - 1, T.FLOWERPOT); });
      // the wooded islet: lumberjack trees, a log pile and stumps
      function tree(tx) { var th = 5 + Math.floor(hash(tx, 975, seed) * 3); for (y = Y - 1; y >= Y - th; y--) put(tx, y, T.LOG); for (var dy = -2; dy <= 2; dy++) for (var dx2 = -3; dx2 <= 3; dx2++) if (dx2 * dx2 / 9 + dy * dy / 4 <= 1 + (hash(tx + dx2, dy, seed + 976) - 0.5) * 0.4 && t[(Y - th - 1 + dy) * W + tx + dx2] === T.AIR) put(tx + dx2, Y - th - 1 + dy, T.LEAVES); }
      tree(I0 + 4); tree(I0 + 11); tree(I0 + 17);
      put(I0 + 7, Y - 1, T.LOG); put(I0 + 8, Y - 1, T.LOG); put(I0 + 7, Y - 2, T.LOG); put(I0 + 14, Y - 1, T.STOOL); put(I0 + 2, Y - 1, CRATE);
      // the Sky Vine: from the ground up through the main island to the deck
      var vx = -1;
      function byHouse(c) { for (var q = 0; q < structs.length; q++) if (c >= structs[q].mx0 - 1 && c <= structs[q].mx1 + 1) return true; for (q = 0; q < out.length; q++) if (c >= out[q].mx0 && c <= out[q].mx1) return true; return false; }   // (building tiles become pictures, so the vine must miss them)
      for (k = 0; k < 70 && vx < 0; k++) { var c = A + 23 + (k % 2 ? 1 : -1) * Math.ceil(k / 2); if (c < M0 + 1 || c > M1 - 1 || byHouse(c)) continue; var ok = t[(Y - 1) * W + c] === T.AIR && t[(Y - 2) * W + c] === T.AIR; for (y = Y + 1; y < top[c] - 1 && ok; y++) if (t[y * W + c] !== T.AIR && t[y * W + c] !== T.STONE && t[y * W + c] !== T.MUD && t[y * W + c] !== T.SPORE && t[y * W + c] !== T.VINE && t[y * W + c] !== T.LANTERN) ok = false; if (ok) vx = c; }
      if (vx < 0) for (k = 0; k < 70 && vx < 0; k++) { var c3 = A + 23 + (k % 2 ? 1 : -1) * Math.ceil(k / 2); if (c3 > M0 && c3 < M1 && !byHouse(c3)) vx = c3; }
      [M0 - 1, I1 + 1, M0 - 2, I1 + 2, M0 - 3, I1 + 3].forEach(function (c4) { if (vx < 0 && !byHouse(c4)) vx = c4; });   // or up the side of the island
      if (vx < 0) vx = A + 23;
      for (y = Y - 2; y < top[vx]; y++) put(vx, y, VINE);
      for (k = 0; k < out.length; k++) structs.push(out[k]);
      marks.push({ k: "sky", x: A + 33, y: Y - 1, n: "Sky Village" });
      return { a: A, z: A + IW - 1, m0: M0, m1: M1, i0: I0, i1: I1, y: Y, vx: vx, vy: top[vx] - 1 };
    })();
    craters.forEach(function (c) { for (x = c.x0; x <= c.x1; x++) for (y = c.lvl - 1; y < top[x] + 1; y++) if (t[y * W + x] === T.LAVA) t[y * W + x] = T.AIR; });   // OLD VOLCANOES: the crater lava drained away long ago (done last, so nothing else in the world moves)
    oldHoles.forEach(function (h) { if (h !== mineH && t[h.y * W + h.x] === T.HOLE) t[h.y * W + h.x] = h.was; });   // THE MINE: fill the other burrows back in
    holes = mineH ? [{ x: mineH.x, y: mineH.y, b: mineH.b, mine: 1 }] : [];
    return { W: W, H: H, seed: seed, t: t, walls: walls, top: top, bio: bio, sub: sub, marks: marks, holes: holes, structs: structs, feats: feats, aerie: aerie, sky: sky, spawn: { x: SPAWNX + 0.5, y: top[SPAWNX] } };
  }

  var POST = [];   // content packs add their extras to every generated map (the original one and each new segment), in that map's own columns
  function shiftX(o, dx) {   // move everything a generated map reports by dx columns
    o.holes.forEach(function (q) { q.x += dx; });
    o.structs.forEach(function (q) { ["x0", "x1", "dx", "outX", "mx0", "mx1"].forEach(function (k) { if (q[k] !== undefined) q[k] += dx; }); });
    o.feats.forEach(function (q) { q.x += dx; });
    (o.marks || []).forEach(function (q) { q.x += dx; });
    if (o.aerie) ["x0", "x1", "cx", "vx"].forEach(function (k) { o.aerie[k] += dx; });
    if (o.sky) ["a", "z", "m0", "m1", "i0", "i1", "vx"].forEach(function (k) { o.sky[k] += dx; });
  }
  function genWide(seed, bv) {
    seed = (seed | 0) || 1; bv = bv || { c: 1, L: 0, R: 0 };   // bv: which land gets biome variants (c: the core map; L / R: segments from this index on)
    var WW = WORLD_W, wt = new Uint16Array(WW * H), wwl = new Uint16Array(WW * H), wtop = new Int16Array(WW), wbio = new Uint8Array(WW), wsub = new Uint8Array(WW), x, y;
    for (x = 0; x < WW; x++) { wtop[x] = H; wbio[x] = 0; }
    var core; GEN_VAR = bv.c ? 1 : 0; GEN_SPARSE = bv.sp ? 1 : 0;
    try { core = gen(seed); } finally { GEN_VAR = 0; GEN_SPARSE = 0; }   // exactly the original map (W = CORE_W here), so old saves line up
    POST.forEach(function (f) { f(core); });
    for (y = 0; y < H; y++) { wt.set(core.t.subarray(y * CORE_W, (y + 1) * CORE_W), y * WW + EXT); wwl.set(core.walls.subarray(y * CORE_W, (y + 1) * CORE_W), y * WW + EXT); }
    wtop.set(core.top, EXT); wbio.set(core.bio, EXT); wsub.set(core.sub, EXT);
    shiftX(core, EXT);
    var lay = { "-1": [], "1": [] };   // the segments on each side, nearest first: [x0, x1, biome]
    [-1, 1].forEach(function (sd) {
      var prev = sd < 0 ? 2 : 1, edge = sd < 0 ? EXT : EXT + CORE_W, n = 0;
      while (sd < 0 ? edge > 0 : edge < WW) {
        var w = 480 + Math.floor(hash(n, sd * 977, seed) * 241), b = (prev + 1 + Math.floor(hash(n, sd * 978, seed) * 2)) % 3;   // never the same biome twice in a row
        var a = sd < 0 ? Math.max(0, edge - w) : edge, z = sd < 0 ? edge : Math.min(WW, edge + w);
        if (z - a < 160) { if (lay[sd].length) { var L = lay[sd][lay[sd].length - 1]; if (sd < 0) L[0] = 0; else L[1] = WW; } break; }   // a sliver at the very end joins the last segment
        lay[sd].push([a, z, b]); prev = b; edge = sd < 0 ? a : z; n++;
      }
    });
    return { W: WW, H: H, seed: seed, t: wt, walls: wwl, top: wtop, bio: wbio, sub: wsub, bv: bv, marks: core.marks || [], holes: core.holes, structs: core.structs, feats: core.feats, aerie: core.aerie, sky: core.sky,
      spawn: { x: SPAWNX + EXT + 0.5, y: core.top[SPAWNX] }, lay: lay, done: { "-1": 0, "1": 0 }, gx0: EXT, gx1: EXT + CORE_W - 1 };
  }
  function genChunk(wd, sd) {   // make the next segment on side sd (-1 left, 1 right); returns its [x0, x1] and what it added, or null at the world's end
    var n = wd.done[sd], seg = wd.lay[sd][n]; if (!seg) return null;
    var a = seg[0], z = seg[1], w = z - a, b = seg[2], WW = wd.W, y, k;
    var keep = [W, B_FROST, B_EMBER, SPAWNX, GEN_EDGE, GEN_AERIE, GEN_VAR, GEN_SPARSE], bv = wd.bv || { L: 99, R: 99 }; GEN_SPARSE = bv.sp ? 1 : 0;
    W = w; SPAWNX = -100000; GEN_AERIE = false;
    GEN_VAR = n >= (sd < 0 ? bv.L : bv.R) ? (hash(n, sd * 979, wd.seed) < 0.4 ? 2 : 1) : 0;   // newer segments: some are all variant land, the rest get patches
    if (b === 2) { B_FROST = w + 200; B_EMBER = w + 400; } else if (b === 0) { B_FROST = -200; B_EMBER = w + 200; } else { B_FROST = -400; B_EMBER = -200; }
    GEN_EDGE = { side: sd, h: wd.top[sd < 0 ? z : a - 1] };   // the column right next to it, on the side it grows from
    var c;
    try { c = gen((wd.seed * 31 + (sd < 0 ? 7001 : 9001) + n * 131) | 0); }
    finally { W = keep[0]; B_FROST = keep[1]; B_EMBER = keep[2]; SPAWNX = keep[3]; GEN_EDGE = keep[4]; GEN_AERIE = keep[5]; GEN_VAR = keep[6]; GEN_SPARSE = keep[7]; }
    POST.forEach(function (f) { f(c); });
    for (y = 0; y < H; y++) { wd.t.set(c.t.subarray(y * w, (y + 1) * w), y * WW + a); wd.walls.set(c.walls.subarray(y * w, (y + 1) * w), y * WW + a); }
    wd.top.set(c.top, a); wd.bio.set(c.bio, a); if (wd.sub) wd.sub.set(c.sub, a);
    shiftX(c, a);
    var base = (sd < 0 ? 100000 : 200000) + n * 100;   // building ids that never collide and stay the same every time this segment is made
    c.structs.forEach(function (q, i) { q.id = base + i; });
    wd.holes = wd.holes.concat(c.holes).sort(function (p, q) { return p.x - q.x; }); wd.feats = wd.feats.concat(c.feats); wd.marks = (wd.marks || []).concat(c.marks || []);
    for (k = 0; k < c.structs.length; k++) wd.structs.push(c.structs[k]);
    wd.done[sd] = n + 1; if (sd < 0) wd.gx0 = a; else wd.gx1 = z - 1;
    return { x0: a, x1: z - 1, structs: c.structs, b: b };
  }
  var api = { STRUCT_KINDS: STRUCT_KINDS, W: WORLD_W, H: H, SURF: SURF, WORLDVER: WORLDVER, B_FROST: B_FROST + EXT, B_EMBER: B_EMBER + EXT, SPAWNX: SPAWNX + EXT, EXT: EXT, CORE_W: CORE_W, genChunk: genChunk, post: POST, T: T, TILES: TILES, ITEMS: ITEMS, ITEM_ORDER: ITEM_ORDER, DECOR_FLOOR: DECOR_FLOOR, DECOR_WALL: DECOR_WALL, BIOMES: BIOMES, gen: genWide, genCore: gen, hash: hash, mulberry: mulberry };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SbxWorld = api;
})(typeof window !== "undefined" ? window : this);
