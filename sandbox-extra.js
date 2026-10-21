// ===== SwampRealms: Delve - CONTENT PACK 1: "Deeper Delve" (100 new items) =====
// Loaded after sandbox-world.js and before sandbox.js. It registers 100 new items (and the tiles behind them) into SbxWorld, adds new ores / plants / loot blocks to the
// generated world (hash-based, so the old terrain is unchanged), and exports the recipes, art and goals that sandbox.js merges in (see the "SbxExtra" hooks there).
//   12 ores, gems and loot finds   : amber, bog iron, sulfur, ruby, sapphire, moonstone, quartz, amethyst, charcoal, bone, fossil (+ geode, charcoal seam, fossil and buried cache blocks)
//    4 natural blocks               : peat, silt, obsidian, permafrost
//    8 wild plants                  : cotton, redcap, marsh lily, emberroot, thistle, frostbell, icecap, glowshroom
//    9 crafting materials           : iron ingot, cloth, rope, 3 dyes, mortar, fired brick, candle
//    3 crafting stations            : Stone Furnace, Weaver's Loom, Mason's Table
//   22 building blocks              : bricks, shingles, lamp blocks, stained glass, quartz, parquet, iron bars ...
//    9 back walls                   : brick, quartz, obsidian, frost, amber, wallpapers, panelling, cobble
//   22 furniture and showpieces     : sofa, clock, aquarium, totem, bonfire, lava lamp ...
//   12 wall decorations             : mirror, three tapestries, shield, swords, wreath, lanterns, map ...
// TO ADD MORE: call one of the helpers below (ore / plant / block / deco / wallbg / mat), add a picture in ART (or WALL_ART) and a recipe in RECIPES (station or hand) or DECOR (Decor Workbench).
(function (root) {
  "use strict";
  var SW = root.SbxWorld || (typeof require !== "undefined" ? require("./sandbox-world.js") : null);
  if (!SW) return;
  var T = SW.T, TILES = SW.TILES, ITEMS = SW.ITEMS, ORDER = SW.ITEM_ORDER, hash = SW.hash;
  var nid = 88, ART = {}, WALL_ART = {}, NEW = [], RECIPES = [], DECOR = [], GOALS = [];

  // ---------- registration helpers ----------
  function tile(key, n, c, c2, hard, tier, drop, solid, light, kind, extra) {
    var id = nid++; if (id > 1000) throw new Error("too many tiles");
    T[key] = id; TILES[id] = { id: id, n: n, c: c, c2: c2, hard: hard, tier: tier, drop: drop, solid: solid, light: light || 0, kind: kind || "" };
    if (extra) Object.assign(TILES[id], extra); return id;
  }
  function glow(id, rgb, gr, ga) { TILES[id].glow = rgb; TILES[id].gr = gr; TILES[id].ga = ga; }
  function item(k, n, o) { ITEMS[k] = Object.assign({ n: n }, o); ORDER.push(k); NEW.push(k); }
  function mat(k, n, gem) { item(k, n, { gem: gem }); }                                              // loose material, drawn as a cut gem
  function ore(tk, n, c, c2, hard, tier, light, drop, gl, bonus) { var id = tile(tk, n, c, c2, hard, tier, drop, true, light, "ore", bonus ? { bonus: bonus } : null); if (gl) glow(id, gl[0], gl[1], gl[2]); return id; }
  function plant(k, n, tk, c, art, light, gl) { var id = tile(tk, n, c, c, 0.05, 0, k, false, light || 0, tk, { sway: 1 }); ART[tk] = art; if (gl) glow(id, gl[0], gl[1], gl[2]); item(k, n, { ico: id }); }
  function block(k, n, c, c2, hard, art, light, gl) {   // solid building block you place like Planks
    var id = tile("X_" + k, n, c, c2, hard, 1, k, true, light || 0, k); if (art) ART[k] = art; if (gl) glow(id, gl[0], gl[1], gl[2]); item(k, n, { tile: id }); return id;
  }
  function deco(k, n, c, art, light, gl, put) {   // non-solid showpiece: put = "floor" (needs ground) or "wall" (hangs on a block)
    var id = tile("X_" + k, n, "#000", c, 0.4, 0, k, false, light || 0, k); ART[k] = art; if (gl) glow(id, gl[0], gl[1], gl[2]);
    item(k, n, { tile: id, decor: 1, put: put || "floor" }); return id;
  }
  function wallbg(k, n, c, c2, art) {   // back wall: its tile id is what the wall layer stores (see paintWall hook)
    var id = tile("W_" + k, n, c, c2, 0.5, 0, "wall_" + k, false, 0, "wall"); WALL_ART[id] = art; item("wall_" + k, n, { tile: id, wall: id }); return id;
  }

  // ---------- art helpers (16x16, rect(x, y, w, h, colour, alpha)) ----------
  function bricks(rect, base, mortar, hi) {
    rect(0, 0, 16, 16, base);
    [0, 5, 10].forEach(function (y, r) { rect(0, y, 16, 1, mortar); var jx = r % 2 ? 3 : 7; rect(jx, y + 1, 1, 4, mortar); rect(jx + 8 > 15 ? jx - 8 : jx + 8, y + 1, 1, 4, mortar); rect(0, y + 1, 16, 1, hi, 0.4); });
    rect(0, 15, 16, 1, mortar);
  }
  function lampBlock(rect, frame, edge, c1, c2, c3) {
    rect(0, 0, 16, 16, frame); rect(1, 1, 14, 14, edge); rect(2, 2, 12, 12, c1); rect(3, 3, 10, 10, c2); rect(5, 5, 6, 6, c3); rect(7, 7, 2, 2, "#ffffff");
    rect(1, 1, 2, 2, edge); rect(13, 1, 2, 2, edge); rect(1, 13, 2, 2, edge); rect(13, 13, 2, 2, edge); rect(8, 2, 1, 12, frame, 0.5); rect(2, 8, 12, 1, frame, 0.5);
  }
  function stained(rect, col, hi) {
    rect(0, 0, 16, 16, col, 0.5); rect(0, 0, 16, 1, "#2a2a30"); rect(0, 15, 16, 1, "#2a2a30"); rect(0, 0, 1, 16, "#2a2a30"); rect(15, 0, 1, 16, "#2a2a30");
    rect(7, 1, 2, 14, "#2a2a30", 0.8); rect(1, 7, 14, 2, "#2a2a30", 0.8); rect(3, 3, 3, 3, hi, 0.55); rect(10, 10, 3, 3, hi, 0.45); rect(3, 3, 1, 1, "#fff", 0.9); rect(10, 10, 1, 1, "#fff", 0.8);
  }
  function plankBox(rect, x, y, w, h, c, hi, lo) { rect(x, y, w, h, c); rect(x, y, w, 1, hi); rect(x, y + h - 1, w, 1, lo); rect(x, y, 1, h, hi, 0.5); rect(x + w - 1, y, 1, h, lo, 0.6); }
  function tapestry(rect, bg, edge, fn) {   // a hanging cloth with rod and fringe; fn paints the emblem
    rect(1, 0, 14, 1, "#8a5a32"); rect(0, 0, 1, 2, "#c98c4f"); rect(15, 0, 1, 2, "#c98c4f"); rect(2, 1, 12, 13, bg); rect(2, 1, 12, 1, edge); rect(2, 1, 1, 13, edge); rect(13, 1, 1, 13, edge);
    rect(2, 13, 12, 1, edge); for (var i = 2; i < 14; i += 2) rect(i, 14, 1, 2, edge); fn(rect);
  }

  // ====================================================================================================
  // 1. ORES, GEMS AND LOOT (items first, then the blocks that drop them)
  // ====================================================================================================
  mat("amber", "Amber", "#f0a02c"); mat("bogiron", "Bog Iron", "#a9845f"); mat("sulfur", "Sulfur", "#e6d83a"); mat("ruby", "Ember Ruby", "#e0364a"); mat("sapphire", "Frost Sapphire", "#3f7fe6"); mat("moonstone", "Moonstone", "#c9d2ff");
  mat("quartz", "Quartz Shard", "#f1f5f8"); mat("amethyst", "Amethyst", "#a36bde"); mat("charcoal", "Charcoal", "#3a3a40"); mat("bone", "Old Bone", "#e8e0c8"); mat("fossil", "Fossil", "#b09a76");
  ore("AMBERORE", "Amber Ore", "#6b7276", "#f0a02c", 1.5, 1, 6, "amber", ["255,170,50", 2.4, 0.15]);
  ore("BOGIRONORE", "Bog Iron Ore", "#6b7276", "#a9845f", 1.8, 2, 0, "bogiron");
  ore("SULFURORE", "Sulfur Ore", "#3b3036", "#e6d83a", 2.3, 2, 5, "sulfur", ["240,230,70", 2.2, 0.12]);
  ore("RUBYORE", "Ember Ruby Ore", "#3b3036", "#e0364a", 2.8, 3, 8, "ruby", ["255,60,80", 2.6, 0.17]);
  ore("SAPPHIREORE", "Frost Sapphire Ore", "#5d7c93", "#3f7fe6", 3.1, 3, 8, "sapphire", ["80,140,255", 2.6, 0.17]);
  mat("realmshard", "Realm Shard", "#8affe0");
  ore("REALMORE", "Realmstone", "#231d36", "#8affe0", 4.5, 5, 10, "realmshard", ["140,255,224", 3, 0.2]);   // the stone between worlds: only the Swampking Pick breaks it
  ore("MOONORE", "Moonstone Ore", "#5d7c93", "#c9d2ff", 3.5, 4, 9, "moonstone", ["200,210,255", 2.8, 0.18]);
  ore("GEODE", "Geode", "#6b7276", "#a36bde", 1.6, 2, 4, "quartz", ["170,120,240", 2, 0.12], [["amethyst", 0.55, 1, 2]]);
  ore("SEAM", "Charcoal Seam", "#3b3036", "#2a2a30", 1.7, 2, 0, "charcoal", null, [["charcoal", 0.5, 1, 1]]);
  tile("FOSSILBLK", "Fossil Block", "#8a8272", "#e8e0c8", 1.4, 1, "fossil", true, 0, "fossilblk", { bonus: [["bone", 0.7, 1, 2]] });
  tile("CACHE", "Buried Cache", "#6b5a44", "#c9935a", 1.0, 1, "rope", true, 0, "cache", { bonus: [["bogiron", 0.6, 1, 3], ["amber", 0.5, 1, 2], ["cloth", 0.45, 1, 2], ["candle", 0.6, 2, 4], ["quartz", 0.5, 1, 3], ["ironingot", 0.25, 1, 1], ["bone", 0.4, 1, 2]] });
  // natural blocks you can also build with
  block("peat", "Peat", "#3a2a1c", "#54402c", 0.5, function (rect, hh) { rect(0, 0, 16, 16, "#3a2a1c"); for (var k = 0; k < 14; k++) rect(Math.floor(hh(k, 1, 5) * 13), Math.floor(hh(k, 2, 6) * 15), 3, 1, hh(k, 3, 7) > 0.5 ? "#54402c" : "#241810"); rect(0, 15, 16, 1, "#000", 0.16); }); TILES[T.X_peat].tier = 0;
  block("silt", "Silt", "#7f7d6b", "#9a977f", 0.4, null); TILES[T.X_silt].tier = 0;
  block("obsidian", "Obsidian", "#241a30", "#5a3f7a", 3.2, function (rect, hh) { rect(0, 0, 16, 16, "#241a30"); rect(2, 1, 3, 1, "#6a4f8a"); rect(1, 2, 1, 4, "#6a4f8a", 0.7); rect(9, 5, 5, 1, "#4a3a66"); rect(11, 6, 1, 6, "#4a3a66", 0.8); for (var k = 0; k < 6; k++) rect(Math.floor(hh(k, 1, 9) * 14), Math.floor(hh(k, 2, 8) * 14), 1, 1, "#9a7fc0", 0.6); rect(0, 15, 16, 1, "#000", 0.3); }); TILES[T.X_obsidian].tier = 3;
  block("permafrost", "Permafrost", "#8fb0c4", "#c8e2f0", 1.0, function (rect, hh) { rect(0, 0, 16, 16, "#8fb0c4"); for (var k = 0; k < 10; k++) rect(Math.floor(hh(k, 1, 3) * 13), Math.floor(hh(k, 2, 4) * 15), 3, 1, hh(k, 3, 5) > 0.5 ? "#c8e2f0" : "#648aa0"); rect(0, 0, 16, 1, "#e8f6ff", 0.4); rect(0, 15, 16, 1, "#000", 0.16); }); TILES[T.X_permafrost].tier = 2;
  ART.fossilblk = function (rect, hh) {
    rect(0, 0, 16, 16, "#8a8272"); for (var k = 0; k < 8; k++) rect(Math.floor(hh(k, 1, 4) * 15), Math.floor(hh(k, 2, 5) * 15), 1, 1, hh(k, 3, 6) > 0.5 ? "#a49c8a" : "#6a6456");
    rect(3, 7, 10, 2, "#e8e0c8"); rect(3, 6, 2, 1, "#e8e0c8"); rect(3, 9, 2, 1, "#e8e0c8"); rect(11, 6, 2, 1, "#e8e0c8"); rect(11, 9, 2, 1, "#e8e0c8"); rect(4, 3, 1, 3, "#e8e0c8"); rect(7, 3, 1, 4, "#e8e0c8"); rect(10, 3, 1, 3, "#e8e0c8"); rect(4, 10, 1, 3, "#e8e0c8"); rect(7, 9, 1, 4, "#e8e0c8"); rect(10, 10, 1, 3, "#e8e0c8"); rect(0, 15, 16, 1, "#000", 0.2);
  };
  ART.cache = function (rect, hh) {
    rect(0, 0, 16, 16, "#6b5a44"); for (var k = 0; k < 8; k++) rect(Math.floor(hh(k, 1, 4) * 15), Math.floor(hh(k, 2, 5) * 15), 2, 1, hh(k, 3, 6) > 0.5 ? "#7d6a52" : "#4d4030");
    rect(4, 4, 8, 9, "#b9793f"); rect(3, 6, 10, 5, "#c98c4f"); rect(5, 2, 6, 2, "#8a5a32"); rect(4, 3, 1, 1, "#8a5a32"); rect(11, 3, 1, 1, "#8a5a32"); rect(4, 7, 8, 1, "#6e431f"); rect(4, 10, 8, 1, "#6e431f"); rect(5, 5, 1, 7, "#e4aa6c", 0.6); rect(7, 8, 2, 1, "#f2c14e"); rect(0, 15, 16, 1, "#000", 0.2);
  };

  // ====================================================================================================
  // 2. WILD PLANTS (sway in the wind like cattails; hold to pick)
  // ====================================================================================================
  plant("cotton", "Bog Cotton", "COTTONTUFT", "#f4f0e0", function (rect) { rect(7, 6, 1, 10, "#4f8a3c"); rect(3, 9, 1, 7, "#4f8a3c"); rect(11, 8, 1, 8, "#4f8a3c"); rect(6, 3, 3, 3, "#ffffff"); rect(5, 4, 5, 2, "#f4f0e0"); rect(2, 6, 3, 3, "#ffffff"); rect(2, 7, 4, 1, "#e8e4d4"); rect(10, 5, 3, 3, "#ffffff"); rect(10, 6, 4, 1, "#e8e4d4"); rect(6, 2, 2, 1, "#ffffff"); rect(8, 12, 3, 1, "#3f7a2f"); });
  plant("redcap", "Redcap Mushroom", "REDCAPTUFT", "#d6382e", function (rect) { rect(4, 10, 2, 6, "#efe6cc"); rect(10, 12, 2, 4, "#efe6cc"); rect(1, 7, 8, 4, "#d6382e"); rect(2, 6, 6, 1, "#e85a48"); rect(3, 8, 1, 1, "#fff"); rect(6, 7, 1, 1, "#fff"); rect(8, 10, 7, 3, "#c02a22"); rect(9, 9, 5, 1, "#e85a48"); rect(10, 11, 1, 1, "#fff"); rect(13, 11, 1, 1, "#fff"); rect(0, 15, 16, 1, "#3f7a2f"); });
  plant("marshlily", "Marsh Lily", "LILYTUFT", "#ffe27a", function (rect) { rect(7, 7, 2, 9, "#4f8a3c"); rect(3, 12, 4, 1, "#3f8f3a"); rect(9, 13, 4, 1, "#3f8f3a"); rect(4, 3, 8, 5, "#fff3b8"); rect(5, 2, 6, 1, "#ffffff"); rect(6, 8, 4, 1, "#ffd24a"); rect(7, 4, 2, 3, "#ffb13b"); rect(3, 4, 1, 2, "#fff3b8"); rect(12, 4, 1, 2, "#fff3b8"); });
  plant("emberroot", "Emberroot", "EMBERROOTTUFT", "#ff7a2f", function (rect) { rect(7, 8, 2, 8, "#8a3a1a"); rect(4, 10, 3, 1, "#8a3a1a"); rect(9, 11, 3, 1, "#8a3a1a"); rect(5, 4, 6, 5, "#c9461a"); rect(6, 3, 4, 1, "#ff8a3d"); rect(7, 1, 2, 3, "#ffc24a"); rect(7, 0, 2, 1, "#fff1b0"); rect(3, 6, 2, 3, "#ff7a2f"); rect(11, 6, 2, 3, "#ff7a2f"); rect(6, 5, 1, 2, "#ffc24a"); }, 4, ["255,130,50", 2, 0.12]);
  plant("thistle", "Ash Thistle", "THISTLETUFT", "#9a8fb0", function (rect) { rect(7, 6, 2, 10, "#5d6a52"); rect(4, 11, 3, 1, "#5d6a52"); rect(9, 12, 3, 1, "#5d6a52"); rect(5, 2, 6, 5, "#8a5aa8"); rect(6, 1, 4, 1, "#b58ad0"); rect(4, 3, 1, 2, "#6a4388"); rect(11, 3, 1, 2, "#6a4388"); rect(5, 7, 6, 1, "#5d6a52"); rect(7, 4, 2, 2, "#d8b8f0"); rect(3, 8, 1, 1, "#5d6a52"); rect(12, 8, 1, 1, "#5d6a52"); });
  plant("frostbell", "Frostbell", "FROSTBELLTUFT", "#7fd6ff", function (rect) { rect(7, 3, 1, 13, "#5d9a8f"); rect(3, 6, 1, 10, "#5d9a8f"); rect(11, 7, 1, 9, "#5d9a8f"); rect(5, 3, 4, 4, "#7fd6ff"); rect(5, 7, 5, 1, "#bff4ff"); rect(6, 3, 2, 1, "#e8fbff"); rect(1, 6, 4, 3, "#9fe8ff"); rect(1, 9, 5, 1, "#e8fbff"); rect(10, 7, 4, 3, "#7fd6ff"); rect(10, 10, 5, 1, "#bff4ff"); }, 3, ["130,225,255", 2, 0.11]);
  plant("icecap", "Icecap Mushroom", "ICECAPTUFT", "#bfe9f7", function (rect) { rect(6, 9, 3, 7, "#e8f4f8"); rect(10, 12, 2, 4, "#e8f4f8"); rect(2, 6, 11, 4, "#bfe9f7"); rect(3, 5, 9, 1, "#e8fbff"); rect(4, 7, 1, 1, "#fff"); rect(8, 6, 1, 1, "#fff"); rect(10, 7, 1, 1, "#7fd6ff"); rect(9, 12, 5, 2, "#9fd8ef"); rect(10, 11, 3, 1, "#e8fbff"); });
  plant("glowshroom", "Glowshroom", "GLOWSHROOMTUFT", "#b17dff", function (rect) { rect(4, 10, 2, 6, "#d8c8f0"); rect(9, 8, 3, 8, "#d8c8f0"); rect(1, 6, 8, 4, "#7a4fd0"); rect(2, 5, 6, 1, "#b17dff"); rect(3, 7, 1, 1, "#4ee6b4"); rect(6, 6, 1, 1, "#4ee6b4"); rect(6, 3, 8, 5, "#4ee6b4"); rect(7, 2, 6, 1, "#9bfbe0"); rect(8, 4, 1, 1, "#e6fff8"); rect(11, 5, 1, 1, "#e6fff8"); rect(0, 15, 16, 1, "#2a1a44"); }, 8, ["150,120,255", 3, 0.2]);

  // ====================================================================================================
  // 3. CRAFTING MATERIALS AND STATIONS
  // ====================================================================================================
  mat("ironingot", "Iron Ingot", "#aab2bd"); mat("cloth", "Woven Cloth", "#e8dcc0"); mat("rope", "Rope", "#c9a96a"); mat("dyered", "Red Dye", "#d6382e"); mat("dyeblue", "Blue Dye", "#3a7fd8"); mat("dyegreen", "Green Dye", "#3aa84e");
  mat("mortar", "Mortar", "#bdb9a8"); mat("claybrick", "Fired Brick", "#c4573a"); mat("candle", "Candle", "#f6ecc8");
  deco("furnace", "Stone Furnace", "#8e969b", function (rect) {   // smelts ore and fires clay
    rect(2, 3, 12, 13, "#6b7276"); rect(2, 3, 12, 1, "#a3aaae"); rect(5, 0, 6, 4, "#55595c"); rect(6, 0, 4, 1, "#2a2a30"); rect(4, 8, 8, 6, "#1a1416"); rect(5, 9, 6, 5, "#ff7a1f"); rect(6, 10, 4, 4, "#ffc43a"); rect(7, 12, 2, 2, "#fff6c2"); rect(2, 7, 12, 1, "#4d5256", 0.6); rect(2, 15, 12, 1, "#3a3e41");
  }, 10, ["255,150,60", 3.4, 0.22]);
  deco("loom", "Weaver's Loom", "#c98c4f", function (rect) {   // wooden frame with warp threads and a bit of cloth
    rect(1, 1, 2, 15, "#8a5a32"); rect(13, 1, 2, 15, "#8a5a32"); rect(1, 1, 14, 2, "#a8703c"); rect(1, 1, 14, 1, "#dc9a58"); rect(1, 13, 14, 2, "#a8703c");
    for (var x = 4; x < 13; x += 2) rect(x, 3, 1, 10, "#e8dcc0", 0.8); rect(3, 9, 10, 4, "#d6382e"); rect(3, 9, 10, 1, "#ff7a6a"); rect(3, 11, 10, 1, "#f2c14e"); rect(4, 5, 3, 1, "#3a7fd8"); rect(0, 15, 16, 1, "#4a2c14");
  });
  deco("masontable", "Mason's Table", "#8e969b", function (rect) {   // stone slab on trestles with a chisel and mallet
    rect(1, 7, 14, 3, "#a3aaae"); rect(1, 7, 14, 1, "#d4dadd"); rect(1, 10, 14, 1, "#5d6468"); rect(2, 11, 3, 5, "#6b7276"); rect(11, 11, 3, 5, "#6b7276"); rect(2, 11, 1, 5, "#8e969b"); rect(5, 4, 5, 3, "#8e969b"); rect(5, 4, 5, 1, "#c4cbce"); rect(11, 3, 1, 4, "#8a5a32"); rect(10, 2, 3, 2, "#6b7276"); rect(3, 5, 1, 2, "#c9cfd2"); rect(0, 15, 16, 1, "#3a3e41");
  });

  // ====================================================================================================
  // 4. BUILDING BLOCKS
  // ====================================================================================================
  block("redbrick", "Red Brick", "#a8452f", "#c9654a", 1.2, function (rect) { bricks(rect, "#a8452f", "#5e2a20", "#e0805f"); });
  block("plasterblock", "Plaster Block", "#e4d6b0", "#f2e8cb", 0.5, null);
  block("amberblock", "Amber Block", "#e0902a", "#ffd27a", 0.8, function (rect, hh) { rect(0, 0, 16, 16, "#e0902a"); rect(1, 1, 14, 14, "#f0a83a"); rect(2, 2, 12, 12, "#f8bf55"); rect(3, 3, 4, 2, "#fff0b0"); rect(3, 3, 2, 5, "#fff0b0", 0.8); rect(9, 8, 3, 3, "#c4741a", 0.8); rect(10, 9, 1, 1, "#8a4a0a"); rect(6, 11, 2, 2, "#c4741a", 0.6); rect(12, 3, 1, 1, "#fff"); rect(0, 15, 16, 1, "#9a5a0a"); }, 8, ["255,170,50", 3, 0.2]);
  block("obsidianbrick", "Obsidian Brick", "#2b1f3a", "#5a3f7a", 3.4, function (rect) { bricks(rect, "#2b1f3a", "#120a1c", "#7a5fa0"); }); TILES[T.X_obsidianbrick].tier = 3;
  block("permabrick", "Permafrost Brick", "#7d98aa", "#c8e2f0", 1.2, function (rect) { bricks(rect, "#7d98aa", "#41596a", "#c8e2f0"); });
  block("ironblock", "Iron Block", "#8a929c", "#c4cbd4", 2.0, function (rect) { rect(0, 0, 16, 16, "#8a929c"); rect(1, 1, 14, 14, "#9aa2ac"); rect(1, 1, 14, 1, "#d4dae2"); rect(1, 1, 1, 14, "#c4cbd4", 0.6); rect(14, 1, 1, 14, "#5d646c"); rect(1, 14, 14, 1, "#5d646c"); [[2, 2], [12, 2], [2, 12], [12, 12]].forEach(function (q) { rect(q[0], q[1], 2, 2, "#5d646c"); rect(q[0], q[1], 1, 1, "#e8ecf2"); }); rect(5, 7, 6, 2, "#7a828c"); rect(5, 7, 6, 1, "#c4cbd4", 0.6); }); TILES[T.X_ironblock].tier = 2;
  block("ironbars", "Iron Bars", "#6a717a", "#aab2bd", 1.6, function (rect) { rect(0, 0, 16, 1, "#4a4f56"); rect(0, 15, 16, 1, "#4a4f56"); for (var x = 1; x < 16; x += 4) { rect(x, 0, 2, 16, "#6a717a"); rect(x, 0, 1, 16, "#aab2bd"); } rect(0, 7, 16, 1, "#4a4f56", 0.9); }); TILES[T.X_ironbars].tier = 2;
  block("moonbrick", "Moonstone Brick", "#aab4d8", "#e8ecff", 2.4, function (rect, hh) { bricks(rect, "#aab4d8", "#5e6890", "#f4f6ff"); for (var k = 0; k < 5; k++) rect(Math.floor(hh(k, 1, 11) * 15), Math.floor(hh(k, 2, 12) * 15), 1, 1, "#ffffff", 0.9); }, 5, ["200,210,255", 3, 0.14]); TILES[T.X_moonbrick].tier = 3;
  block("rubylamp", "Ruby Lamp Block", "#2a2228", "#ff5a6a", 1.2, function (rect) { lampBlock(rect, "#2a2228", "#3b3036", "#a01a2e", "#e0364a", "#ff9aa6"); }, 14, ["255,70,90", 4.4, 0.3]);
  block("sapphirelamp", "Sapphire Lamp Block", "#5d7c93", "#7fa8ff", 1.2, function (rect) { lampBlock(rect, "#3f5a6e", "#5d7c93", "#1f4fb0", "#3f7fe6", "#bcd4ff"); }, 14, ["110,160,255", 4.4, 0.3]);
  block("amethystblock", "Amethyst Block", "#8a52c8", "#d2a8ff", 1.4, function (rect) { rect(0, 0, 16, 16, "#6e3fa8"); rect(1, 1, 14, 14, "#8a52c8"); rect(2, 2, 6, 6, "#a36bde"); rect(8, 8, 6, 6, "#a36bde"); rect(2, 2, 2, 6, "#d2a8ff"); rect(8, 8, 2, 6, "#d2a8ff"); rect(9, 2, 5, 5, "#7a45b8"); rect(2, 9, 5, 5, "#7a45b8"); rect(11, 3, 1, 2, "#e8d0ff"); rect(3, 11, 1, 2, "#e8d0ff"); rect(0, 15, 16, 1, "#3a1f5a"); }, 8, ["170,120,240", 3.2, 0.2]);
  block("quartzblock", "Quartz Block", "#eef2f5", "#ffffff", 1.2, function (rect, hh) { rect(0, 0, 16, 16, "#eef2f5"); rect(0, 0, 16, 1, "#ffffff"); rect(0, 15, 16, 1, "#b8c2ca"); rect(15, 0, 1, 16, "#d4dbe0"); rect(0, 0, 1, 16, "#ffffff", 0.8); rect(3, 4, 5, 1, "#d4dbe0"); rect(8, 5, 1, 4, "#d4dbe0"); rect(9, 11, 4, 1, "#d4dbe0"); rect(5, 12, 1, 2, "#d4dbe0"); });
  block("quartzpillar", "Quartz Pillar", "#eef2f5", "#ffffff", 1.2, function (rect) { rect(0, 0, 16, 16, "#d4dbe0"); rect(2, 0, 12, 16, "#eef2f5"); [4, 7, 10].forEach(function (x) { rect(x, 0, 1, 16, "#b8c2ca"); rect(x + 1, 0, 1, 16, "#ffffff"); }); rect(0, 0, 16, 2, "#ffffff"); rect(0, 2, 16, 1, "#b8c2ca"); rect(0, 14, 16, 2, "#ffffff"); rect(0, 13, 16, 1, "#b8c2ca"); });
  block("parquet", "Parquet Floor", "#a8703c", "#dc9a58", 0.8, function (rect) { rect(0, 0, 16, 16, "#7a4a22"); for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { var h = (i + j) % 2; rect(i * 4 + (h ? 0 : 0), j * 4, 4, 4, h ? "#b9793f" : "#a8703c"); if (h) { rect(i * 4, j * 4 + 1, 4, 1, "#dc9a58", 0.5); rect(i * 4, j * 4 + 3, 4, 1, "#7a4a22", 0.6); } else { rect(i * 4 + 1, j * 4, 1, 4, "#dc9a58", 0.4); rect(i * 4 + 3, j * 4, 1, 4, "#7a4a22", 0.6); } } });
  block("checker", "Checker Tile", "#3a3a42", "#e8e4d8", 1.0, function (rect) { for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) rect(i * 8, j * 8, 8, 8, (i + j) % 2 ? "#2e2e36" : "#e8e4d8"); rect(0, 0, 16, 1, "#fff", 0.35); rect(0, 15, 16, 1, "#000", 0.25); rect(8, 0, 1, 16, "#000", 0.18); rect(0, 8, 16, 1, "#000", 0.18); });
  block("cobble", "Cobblestone", "#767c80", "#9aa1a5", 1.2, function (rect, hh) { rect(0, 0, 16, 16, "#4d5256"); var cs = [[0, 0, 6, 5], [6, 0, 6, 4], [12, 0, 4, 5], [0, 5, 4, 5], [4, 5, 6, 6], [10, 4, 6, 5], [0, 10, 7, 6], [7, 11, 5, 5], [12, 9, 4, 7]]; cs.forEach(function (c, i) { var tn = ["#767c80", "#6a7074", "#848a8e"][i % 3]; rect(c[0], c[1], c[2] - 1, c[3] - 1, tn); rect(c[0], c[1], c[2] - 1, 1, "#a3aaae", 0.6); }); });
  block("shinglered", "Red Shingles", "#b8432c", "#e0705a", 0.9, function (rect) { rect(0, 0, 16, 16, "#7a2a1c"); for (var r = 0; r < 4; r++) for (var c = -1; c < 3; c++) { var x = c * 6 + (r % 2 ? 3 : 0); rect(x, r * 4, 6, 4, "#b8432c"); rect(x, r * 4, 6, 1, "#e0705a", 0.7); rect(x + 5, r * 4, 1, 4, "#7a2a1c"); rect(x + 1, r * 4 + 3, 4, 1, "#7a2a1c"); } });
  block("shingleblue", "Slate Shingles", "#4a6890", "#7a98c0", 0.9, function (rect) { rect(0, 0, 16, 16, "#2a3a56"); for (var r = 0; r < 4; r++) for (var c = -1; c < 3; c++) { var x = c * 6 + (r % 2 ? 3 : 0); rect(x, r * 4, 6, 4, "#4a6890"); rect(x, r * 4, 6, 1, "#7a98c0", 0.7); rect(x + 5, r * 4, 1, 4, "#2a3a56"); rect(x + 1, r * 4 + 3, 4, 1, "#2a3a56"); } });
  block("mossbrick", "Mossy Brick", "#6f7a6a", "#7da34a", 1.2, function (rect, hh) { bricks(rect, "#6f7a6a", "#3d4a3a", "#9aa994"); for (var k = 0; k < 9; k++) { var mx = Math.floor(hh(k, 1, 31) * 14); rect(mx, Math.floor(hh(k, 2, 32) * 4) * 5, 2 + (k & 1), 2, k % 2 ? "#5fb24a" : "#3a8434"); } });
  block("stainedred", "Red Stained Glass", "#d6382e", "#ff8a7a", 0.4, function (rect) { stained(rect, "#d6382e", "#ffb0a0"); });
  block("stainedblue", "Blue Stained Glass", "#3a7fd8", "#8abaff", 0.4, function (rect) { stained(rect, "#3a7fd8", "#b0d0ff"); });
  block("stainedgreen", "Green Stained Glass", "#3aa84e", "#8ae09a", 0.4, function (rect) { stained(rect, "#3aa84e", "#b0f0b8"); });

  // ====================================================================================================
  // 5. BACK WALLS
  // ====================================================================================================
  wallbg("redbrick", "Red Brick Wall", "#7a3a2a", "#a8452f", function (rect) { bricks(rect, "#7a3a2a", "#3e1e16", "#a8605a"); });
  wallbg("quartz", "Quartz Wall", "#d4dbe0", "#eef2f5", function (rect) { rect(0, 0, 16, 16, "#d4dbe0"); rect(0, 0, 8, 8, "#e4eaee"); rect(8, 8, 8, 8, "#e4eaee"); rect(0, 7, 16, 1, "#b8c2ca"); rect(7, 0, 1, 16, "#b8c2ca"); rect(1, 1, 3, 1, "#fff"); rect(9, 9, 3, 1, "#fff"); });
  wallbg("obsidian", "Obsidian Wall", "#241a30", "#5a3f7a", function (rect, hh) { rect(0, 0, 16, 16, "#241a30"); rect(0, 7, 16, 1, "#120a1c"); rect(7, 0, 1, 16, "#120a1c"); for (var k = 0; k < 6; k++) rect(Math.floor(hh(k, 1, 9) * 14), Math.floor(hh(k, 2, 8) * 14), 2, 1, "#4a3a66", 0.8); rect(2, 2, 3, 1, "#7a5fa0", 0.6); });
  wallbg("frost", "Frost Wall", "#6a8aa0", "#c8e2f0", function (rect, hh) { rect(0, 0, 16, 16, "#6a8aa0"); rect(0, 0, 16, 3, "#7d9db4"); rect(0, 8, 16, 3, "#7d9db4"); rect(0, 7, 16, 1, "#41596a"); rect(0, 15, 16, 1, "#41596a"); for (var k = 0; k < 8; k++) rect(Math.floor(hh(k, 1, 4) * 15), Math.floor(hh(k, 2, 5) * 15), 1, 1, "#e8fbff", 0.8); });
  wallbg("amber", "Amber Wall", "#c47a1a", "#f0a83a", function (rect) { rect(0, 0, 16, 16, "#c47a1a"); rect(1, 1, 14, 14, "#d8902a"); rect(2, 2, 5, 2, "#f8c860", 0.8); rect(2, 2, 2, 5, "#f8c860", 0.6); rect(9, 9, 3, 3, "#a85a0a", 0.8); rect(0, 7, 16, 1, "#8a4a0a", 0.4); });
  wallbg("stripe", "Striped Wallpaper", "#d8d0a8", "#3aa84e", function (rect) { rect(0, 0, 16, 16, "#e4dcb8"); for (var x = 1; x < 16; x += 4) { rect(x, 0, 2, 16, "#4a9a58"); rect(x, 0, 1, 16, "#78c488"); } rect(0, 15, 16, 1, "#a8a078"); rect(0, 0, 16, 1, "#a8a078", 0.5); });
  wallbg("floral", "Floral Wallpaper", "#d8e8c8", "#ff6fb5", function (rect) { rect(0, 0, 16, 16, "#cfe0bd"); [[3, 3], [11, 3], [7, 9], [1, 12], [13, 12]].forEach(function (q) { rect(q[0] - 1, q[1], 3, 1, "#ff9ac8"); rect(q[0], q[1] - 1, 1, 3, "#ff9ac8"); rect(q[0], q[1], 1, 1, "#ffe27a"); rect(q[0] + 1, q[1] + 2, 2, 1, "#5fb24a"); }); rect(0, 15, 16, 1, "#9ab08a", 0.6); });
  wallbg("panel", "Dark Wood Panelling", "#4a2e18", "#6e431f", function (rect) { rect(0, 0, 16, 16, "#4a2e18"); rect(1, 1, 6, 14, "#5a3a1e"); rect(9, 1, 6, 14, "#5a3a1e"); rect(1, 1, 6, 1, "#7a5230"); rect(9, 1, 6, 1, "#7a5230"); rect(2, 3, 4, 10, "#4a2e18"); rect(10, 3, 4, 10, "#4a2e18"); rect(2, 3, 4, 1, "#2e1a09"); rect(10, 3, 4, 1, "#2e1a09"); });
  wallbg("cobble", "Cobble Wall", "#4a5054", "#767c80", function (rect, hh) { rect(0, 0, 16, 16, "#33383b"); [[0, 0, 6, 5], [6, 0, 6, 4], [12, 0, 4, 5], [0, 5, 4, 5], [4, 5, 6, 6], [10, 4, 6, 5], [0, 10, 7, 6], [7, 11, 5, 5], [12, 9, 4, 7]].forEach(function (c, i) { rect(c[0], c[1], c[2] - 1, c[3] - 1, ["#4a5054", "#41464a", "#545a5e"][i % 3]); rect(c[0], c[1], c[2] - 1, 1, "#767c80", 0.5); }); });

  // ====================================================================================================
  // 6. FURNITURE AND SHOWPIECES (Decor Workbench)
  // ====================================================================================================
  deco("sofa", "Reed Sofa", "#7a9a5a", function (rect) { rect(1, 5, 14, 6, "#4f7a3c"); rect(1, 4, 14, 1, "#7ab05a"); rect(0, 7, 3, 7, "#3f6a2f"); rect(13, 7, 3, 7, "#3f6a2f"); rect(0, 7, 3, 1, "#7ab05a"); rect(13, 7, 3, 1, "#7ab05a"); rect(3, 9, 10, 4, "#6a9a4a"); rect(3, 9, 10, 1, "#9acf72"); rect(8, 9, 1, 4, "#3f6a2f"); rect(1, 14, 2, 2, "#6e431f"); rect(13, 14, 2, 2, "#6e431f"); });
  deco("dresser", "Dresser", "#a8703c", function (rect) { plankBox(rect, 1, 5, 14, 11, "#a8703c", "#dc9a58", "#4a2c14"); rect(1, 10, 14, 1, "#4a2c14"); rect(6, 7, 4, 1, "#f2c14e"); rect(6, 12, 4, 1, "#f2c14e"); rect(2, 3, 4, 2, "#ff6fb5"); rect(3, 2, 2, 1, "#ffd1ea"); rect(10, 3, 4, 2, "#8abaff"); rect(11, 2, 2, 1, "#d3e6ff"); });
  deco("desk", "Writing Desk", "#8a5328", function (rect) { rect(0, 6, 16, 2, "#a8703c"); rect(0, 6, 16, 1, "#dc9a58"); rect(1, 8, 3, 8, "#8a5328"); rect(2, 9, 1, 2, "#f2c14e"); rect(2, 12, 1, 2, "#f2c14e"); rect(13, 8, 2, 8, "#6e431f"); rect(5, 4, 5, 2, "#f6eedb"); rect(6, 3, 3, 1, "#fff"); rect(11, 2, 1, 4, "#4a2c14"); rect(12, 1, 2, 2, "#e8e0c8"); rect(12, 0, 1, 1, "#fff"); });
  deco("harp", "Swamp Harp", "#c98c4f", function (rect) { rect(3, 14, 10, 2, "#6e431f"); rect(11, 1, 2, 14, "#a8703c"); rect(11, 1, 1, 14, "#dc9a58"); rect(3, 1, 10, 2, "#a8703c"); rect(3, 1, 10, 1, "#dc9a58"); rect(3, 2, 2, 5, "#8a5a32"); for (var x = 5; x < 11; x += 2) rect(x, 3, 1, 11 - (x - 5), "#f6eedb"); rect(4, 8, 2, 6, "#8a5a32", 0.8); rect(6, 2, 1, 1, "#4ee6b4"); });
  deco("clock", "Grandfather Clock", "#8a5328", function (rect) { rect(3, 0, 10, 16, "#6e431f"); rect(2, 0, 12, 2, "#8a5a32"); rect(4, 2, 8, 6, "#f6eedb"); rect(4, 2, 8, 1, "#c9b58a"); rect(8, 3, 1, 4, "#2a2228"); rect(8, 5, 3, 1, "#2a2228"); rect(4, 9, 8, 6, "#3a200d"); rect(7, 9, 2, 5, "#f2c14e"); rect(6, 13, 4, 2, "#f2c14e"); rect(7, 14, 2, 1, "#fff2b0"); rect(3, 15, 10, 1, "#2a190d"); });
  deco("globe", "Old Globe", "#3a7fd8", function (rect) { rect(5, 14, 6, 2, "#6e431f"); rect(7, 11, 2, 3, "#8a5a32"); rect(3, 2, 10, 9, "#3a7fd8"); rect(4, 1, 8, 1, "#3a7fd8"); rect(4, 11, 8, 1, "#3a7fd8"); rect(4, 3, 3, 3, "#5fb24a"); rect(9, 5, 3, 4, "#5fb24a"); rect(6, 7, 2, 2, "#c9b36a"); rect(4, 2, 2, 2, "#9fd0ff"); rect(2, 1, 1, 11, "#c98c4f"); rect(13, 1, 1, 11, "#c98c4f"); });
  deco("telescope", "Brass Telescope", "#c9a54a", function (rect) { rect(7, 8, 2, 8, "#6e431f"); rect(3, 14, 4, 2, "#6e431f"); rect(9, 14, 4, 2, "#6e431f"); rect(2, 2, 11, 3, "#c9a54a"); rect(2, 2, 11, 1, "#f2dc8a"); rect(11, 1, 3, 5, "#8a6a2a"); rect(1, 3, 2, 2, "#9fd0ff"); rect(5, 2, 1, 3, "#8a6a2a"); rect(9, 2, 1, 3, "#8a6a2a"); rect(7, 5, 2, 3, "#a8703c"); });
  deco("scarecrow", "Scarecrow", "#c9b36a", function (rect) { rect(7, 7, 2, 9, "#8a5a32"); rect(1, 7, 14, 2, "#8a5a32"); rect(4, 5, 8, 6, "#c9b36a"); rect(4, 5, 8, 1, "#e6d08a"); rect(5, 1, 6, 4, "#e6d08a"); rect(3, 3, 10, 1, "#6e431f"); rect(5, 0, 6, 3, "#6e431f"); rect(6, 3, 1, 1, "#2a2228"); rect(9, 3, 1, 1, "#2a2228"); rect(7, 4, 2, 1, "#c4573a"); rect(1, 9, 2, 2, "#e6d08a"); rect(13, 9, 2, 2, "#e6d08a"); rect(5, 9, 6, 1, "#5fb24a"); });
  deco("weaponrack", "Weapon Rack", "#a8703c", function (rect) { rect(1, 2, 2, 14, "#8a5a32"); rect(13, 2, 2, 14, "#8a5a32"); rect(1, 6, 14, 2, "#a8703c"); rect(1, 12, 14, 2, "#a8703c"); rect(1, 6, 14, 1, "#dc9a58"); rect(4, 0, 1, 6, "#aab2bd"); rect(3, 1, 3, 1, "#6e431f"); rect(7, 1, 1, 5, "#c4cbd4"); rect(6, 3, 3, 1, "#6e431f"); rect(10, 0, 2, 6, "#8a5a32"); rect(9, 0, 4, 2, "#6a717a"); rect(5, 8, 1, 4, "#aab2bd"); rect(9, 8, 1, 4, "#aab2bd"); });
  deco("armorstand", "Armor Stand", "#8a929c", function (rect) { rect(7, 10, 2, 6, "#6e431f"); rect(4, 14, 8, 2, "#6e431f"); rect(4, 4, 8, 7, "#8a929c"); rect(4, 4, 8, 1, "#d4dae2"); rect(2, 4, 3, 3, "#aab2bd"); rect(11, 4, 3, 3, "#aab2bd"); rect(5, 0, 6, 4, "#aab2bd"); rect(5, 0, 6, 1, "#e8ecf2"); rect(6, 2, 4, 1, "#2a2228"); rect(7, 6, 2, 4, "#ff8a3d"); rect(5, 8, 6, 1, "#5d646c"); });
  deco("crate", "Wooden Crate", "#b9793f", function (rect) { rect(1, 4, 14, 12, "#a8703c"); rect(1, 4, 14, 2, "#c98c4f"); rect(1, 14, 14, 2, "#8a5a32"); rect(1, 4, 2, 12, "#8a5a32"); rect(13, 4, 2, 12, "#8a5a32"); rect(3, 6, 10, 8, "#b9793f"); rect(3, 6, 10, 1, "#dc9a58"); for (var i = 0; i < 10; i++) { rect(3 + i, 6 + i * 0.8 | 0, 1, 1, "#6e431f"); } rect(2, 5, 1, 1, "#4a4a52"); rect(13, 5, 1, 1, "#4a4a52"); rect(2, 14, 1, 1, "#4a4a52"); rect(13, 14, 1, 1, "#4a4a52"); });
  deco("sack", "Grain Sack", "#d8c690", function (rect) { rect(3, 5, 10, 11, "#d8c690"); rect(4, 3, 8, 3, "#c9b36a"); rect(5, 2, 6, 1, "#c9b36a"); rect(5, 5, 6, 1, "#8a5a32"); rect(6, 4, 1, 2, "#8a5a32"); rect(9, 4, 1, 2, "#8a5a32"); rect(3, 5, 2, 10, "#e8dcae"); rect(11, 6, 2, 10, "#a89850"); rect(6, 9, 4, 3, "#c9b36a"); rect(7, 10, 2, 1, "#8a7a38"); rect(3, 15, 10, 1, "#6e5a2a"); });
  deco("gravestone", "Mossy Gravestone", "#8e969b", function (rect) { rect(3, 5, 10, 11, "#8e969b"); rect(4, 3, 8, 2, "#8e969b"); rect(5, 2, 6, 1, "#a3aaae"); rect(3, 5, 10, 1, "#b3babe"); rect(3, 5, 1, 11, "#a3aaae"); rect(12, 5, 1, 11, "#6b7276"); rect(7, 6, 2, 6, "#4d5256"); rect(5, 8, 6, 2, "#4d5256"); rect(3, 4, 4, 2, "#4f8a3c"); rect(10, 14, 4, 2, "#3f7a2f"); rect(4, 13, 2, 1, "#5fb24a"); rect(1, 15, 14, 1, "#3a3e41"); });
  deco("totem", "Swamp Totem", "#a8703c", function (rect) { rect(4, 0, 8, 16, "#8a5a32"); rect(4, 0, 2, 16, "#a8703c"); rect(10, 0, 2, 16, "#6e431f"); rect(5, 1, 6, 4, "#4ee6b4"); rect(6, 2, 1, 1, "#2a2228"); rect(9, 2, 1, 1, "#2a2228"); rect(7, 4, 2, 1, "#2a2228"); rect(5, 6, 6, 4, "#f2c14e"); rect(6, 7, 1, 1, "#2a2228"); rect(9, 7, 1, 1, "#2a2228"); rect(6, 9, 4, 1, "#2a2228"); rect(5, 11, 6, 4, "#d6382e"); rect(6, 12, 1, 1, "#2a2228"); rect(9, 12, 1, 1, "#2a2228"); rect(7, 14, 2, 1, "#f6eedb"); rect(1, 3, 3, 2, "#4ee6b4"); rect(12, 3, 3, 2, "#4ee6b4"); rect(2, 2, 1, 1, "#9bfbe0"); }, 0);
  deco("mushlamp", "Giant Mushroom Lamp", "#4ee6b4", function (rect) { rect(7, 7, 2, 9, "#efe6cc"); rect(6, 13, 4, 3, "#d8c8a0"); rect(2, 3, 12, 5, "#22a883"); rect(3, 2, 10, 1, "#4ee6b4"); rect(4, 1, 8, 1, "#9bfbe0"); rect(4, 4, 2, 2, "#d8fff6"); rect(9, 5, 2, 2, "#d8fff6"); rect(7, 3, 1, 1, "#d8fff6"); rect(2, 7, 12, 1, "#157a64"); rect(0, 4, 1, 1, "#4ee6b4", 0.6); rect(15, 5, 1, 1, "#4ee6b4", 0.6); }, 11, ["80,240,190", 4.4, 0.28]);
  deco("aquarium", "Glowing Aquarium", "#4fb6c9", function (rect) { rect(0, 4, 16, 12, "#2a2a30"); rect(1, 5, 14, 9, "#2a8f95"); rect(1, 5, 14, 3, "#5fd0cf"); rect(1, 5, 14, 1, "#bffff0"); rect(1, 13, 14, 1, "#c9b36a"); rect(3, 8, 3, 2, "#ff8a3d"); rect(2, 9, 1, 1, "#ff8a3d"); rect(5, 8, 1, 1, "#fff"); rect(9, 10, 4, 2, "#ffd24a"); rect(13, 10, 1, 2, "#ffd24a"); rect(10, 10, 1, 1, "#2a2228"); rect(7, 11, 1, 3, "#3f8f3a"); rect(11, 7, 1, 1, "#d8fff6"); rect(8, 6, 1, 1, "#d8fff6"); rect(0, 15, 16, 1, "#4a4a52"); rect(2, 3, 12, 1, "#4a4a52"); }, 8, ["80,220,230", 3.2, 0.2]);
  deco("obelisk", "Moonstone Obelisk", "#c9d2ff", function (rect) { rect(5, 13, 6, 3, "#7a82a8"); rect(6, 3, 4, 10, "#aab4d8"); rect(7, 1, 2, 2, "#c9d2ff"); rect(7, 0, 2, 1, "#ffffff"); rect(6, 3, 1, 10, "#e8ecff"); rect(9, 3, 1, 10, "#7a82a8"); rect(7, 5, 2, 1, "#e8ecff"); rect(7, 8, 2, 1, "#e8ecff"); rect(7, 11, 2, 1, "#e8ecff"); rect(4, 15, 8, 1, "#5e6890"); }, 6, ["200,210,255", 3.4, 0.2]);
  deco("snowman", "Snowman", "#f4fbff", function (rect) { rect(4, 9, 8, 7, "#f4fbff"); rect(3, 11, 10, 4, "#f4fbff"); rect(5, 4, 6, 6, "#ffffff"); rect(4, 5, 8, 4, "#f4fbff"); rect(5, 1, 6, 2, "#2a2228"); rect(4, 3, 8, 1, "#2a2228"); rect(6, 5, 1, 1, "#2a2228"); rect(9, 5, 1, 1, "#2a2228"); rect(7, 6, 3, 1, "#ff8a3d"); rect(5, 9, 6, 1, "#d6382e"); rect(2, 8, 3, 1, "#8a5a32"); rect(11, 8, 3, 1, "#8a5a32"); rect(7, 11, 1, 1, "#2a2228"); rect(7, 13, 1, 1, "#2a2228"); rect(3, 14, 3, 2, "#c8e4ef"); });
  deco("streetlamp", "Iron Street Lamp", "#6a717a", function (rect) { rect(7, 5, 2, 11, "#4a4f56"); rect(5, 14, 6, 2, "#4a4f56"); rect(4, 0, 8, 1, "#2a2a30"); rect(3, 1, 10, 1, "#4a4f56"); rect(4, 2, 8, 4, "#ffd86a"); rect(5, 3, 6, 2, "#fff6c2"); rect(4, 2, 1, 4, "#2a2a30"); rect(11, 2, 1, 4, "#2a2a30"); rect(4, 6, 8, 1, "#4a4f56"); rect(6, 8, 1, 1, "#aab2bd"); }, 13, ["255,200,100", 5, 0.32]);
  deco("bonfire", "Bonfire", "#ff7a1f", function (rect) { rect(1, 13, 14, 3, "#6a4426"); rect(0, 14, 16, 2, "#4a2c14"); rect(2, 12, 12, 2, "#8a5a32"); rect(3, 6, 10, 7, "#ff6a1f"); rect(4, 3, 8, 5, "#ffa133"); rect(6, 0, 4, 4, "#ffd86a"); rect(7, 7, 2, 5, "#fff1b0"); rect(2, 5, 1, 4, "#ff6a1f", 0.8); rect(13, 4, 1, 4, "#ff6a1f", 0.8); rect(1, 2, 1, 1, "#ffc24a"); rect(14, 1, 1, 1, "#ffc24a"); }, 15, ["255,140,50", 6, 0.4]);
  deco("candelabra", "Candelabra", "#c9a54a", function (rect) { rect(7, 6, 2, 9, "#c9a54a"); rect(5, 14, 6, 2, "#8a6a2a"); rect(2, 7, 12, 1, "#c9a54a"); rect(2, 5, 1, 3, "#c9a54a"); rect(13, 5, 1, 3, "#c9a54a"); rect(7, 4, 2, 2, "#c9a54a"); [[2, 2], [7, 1], [13, 2]].forEach(function (q) { rect(q[0], q[1] + 1, 1, 3, "#f6ecc8"); rect(q[0], q[1] - 1, 1, 2, "#ffc43a"); rect(q[0], q[1] - 2, 1, 1, "#fff6c2"); }); }, 11, ["255,190,90", 4, 0.26]);
  deco("lavalamp", "Lava Lamp", "#ff5a6a", function (rect) { rect(5, 14, 6, 2, "#4a4f56"); rect(6, 12, 4, 2, "#6a717a"); rect(5, 3, 6, 9, "#3a1a3a"); rect(4, 4, 8, 7, "#c9302a"); rect(5, 2, 6, 1, "#4a4f56"); rect(6, 1, 4, 1, "#6a717a"); rect(6, 8, 3, 3, "#ffb13b"); rect(7, 5, 2, 2, "#ffd86a"); rect(10, 6, 1, 2, "#ff8a3d"); rect(5, 4, 1, 6, "#ff9aa6", 0.6); }, 9, ["255,90,100", 3.2, 0.22]);

  // ====================================================================================================
  // 7. WALL DECORATIONS
  // ====================================================================================================
  deco("mirror", "Wall Mirror", "#bff4ff", function (rect) { rect(2, 0, 12, 16, "#c9a54a"); rect(3, 1, 10, 14, "#8abad0"); rect(3, 1, 10, 3, "#bff4ff"); rect(4, 2, 2, 8, "#e8fbff", 0.8); rect(5, 3, 1, 1, "#fff"); rect(8, 8, 3, 5, "#7aa8be", 0.6); rect(2, 0, 12, 1, "#f2dc8a"); rect(7, 0, 2, 1, "#ff6fb5"); }, 0, null, "wall");
  deco("tapestry_swamp", "Swamp Tapestry", "#22a883", function (rect) { tapestry(rect, "#22a883", "#157a64", function (r) { r(7, 3, 2, 8, "#9bfbe0"); r(5, 5, 6, 2, "#9bfbe0"); r(4, 8, 3, 2, "#4ee6b4"); r(9, 8, 3, 2, "#4ee6b4"); r(7, 11, 2, 1, "#f2c14e"); }); }, 0, null, "wall");
  deco("tapestry_ember", "Ember Tapestry", "#c9461a", function (rect) { tapestry(rect, "#c9461a", "#8a2a0e", function (r) { r(6, 8, 4, 3, "#ffd86a"); r(7, 5, 2, 4, "#ffa133"); r(7, 3, 2, 2, "#fff1b0"); r(5, 7, 1, 3, "#ff8a3d"); r(10, 7, 1, 3, "#ff8a3d"); }); }, 0, null, "wall");
  deco("tapestry_frost", "Frost Tapestry", "#3a7fa8", function (rect) { tapestry(rect, "#3a7fa8", "#245a7a", function (r) { r(7, 3, 2, 9, "#e8fbff"); r(4, 7, 8, 2, "#e8fbff"); r(5, 4, 1, 1, "#bff4ff"); r(10, 4, 1, 1, "#bff4ff"); r(5, 10, 1, 1, "#bff4ff"); r(10, 10, 1, 1, "#bff4ff"); r(7, 7, 2, 2, "#7fd6ff"); }); }, 0, null, "wall");
  deco("shield", "Wall Shield", "#aab2bd", function (rect) { rect(3, 1, 10, 8, "#6a717a"); rect(4, 9, 8, 3, "#6a717a"); rect(5, 12, 6, 2, "#6a717a"); rect(6, 14, 4, 1, "#6a717a"); rect(4, 2, 8, 7, "#3a7fd8"); rect(5, 10, 6, 2, "#3a7fd8"); rect(6, 12, 4, 1, "#3a7fd8"); rect(7, 2, 2, 11, "#f2c14e"); rect(4, 5, 8, 2, "#f2c14e"); rect(7, 5, 2, 2, "#fff2b0"); rect(3, 1, 10, 1, "#c4cbd4"); }, 0, null, "wall");
  deco("crossedswords", "Crossed Swords", "#c4cbd4", function (rect) { for (var i = 0; i < 12; i++) { rect(2 + i, 2 + i, 2, 2, "#c4cbd4"); rect(12 - i, 2 + i, 2, 2, "#aab2bd"); } rect(1, 1, 4, 3, "#8a5a32"); rect(11, 1, 4, 3, "#8a5a32"); rect(1, 12, 3, 3, "#f2c14e"); rect(12, 12, 3, 3, "#f2c14e"); rect(7, 6, 2, 3, "#f2c14e"); }, 0, null, "wall");
  deco("wreath", "Leaf Wreath", "#3f8f3a", function (rect) { rect(4, 2, 8, 12, "#3f8f3a"); rect(2, 4, 12, 8, "#3f8f3a"); rect(3, 3, 10, 10, "#3f8f3a"); rect(5, 5, 6, 6, "#000", 0); rect(6, 6, 4, 4, "#1a1410", 0.0); rect(5, 5, 6, 6, "#2a1d12", 0.0); [[3, 4], [11, 3], [2, 9], [12, 11], [7, 1], [6, 13]].forEach(function (q) { rect(q[0], q[1], 2, 2, "#5fb24a"); }); [[4, 3], [12, 8], [8, 13]].forEach(function (q) { rect(q[0], q[1], 2, 2, "#d6382e"); rect(q[0], q[1], 1, 1, "#ff8a7a"); }); rect(7, 0, 2, 2, "#d6382e"); rect(6, 1, 4, 1, "#d6382e"); }, 0, null, "wall");
  deco("hanginglantern", "Hanging Lantern", "#ffb13b", function (rect) { rect(7, 0, 2, 3, "#4a4f56"); rect(5, 3, 6, 1, "#6a717a"); rect(4, 4, 8, 8, "#3a3a42"); rect(5, 5, 6, 6, "#ffc24a"); rect(6, 6, 4, 4, "#fff1b0"); rect(8, 5, 1, 6, "#3a3a42", 0.7); rect(5, 12, 6, 1, "#6a717a"); rect(7, 13, 2, 2, "#6a717a"); rect(7, 15, 2, 1, "#ffc24a"); }, 12, ["255,180,70", 4.4, 0.3], "wall");
  deco("fairylights", "Fairy Lights", "#fff2b0", function (rect) { rect(0, 2, 16, 1, "#4a3a28"); var cols = ["#ff6fb5", "#ffd24a", "#6fe08a", "#6aa8ff"]; for (var i = 0; i < 4; i++) { rect(1 + i * 4, 3, 1, 2, "#4a3a28"); rect(i * 4, 5, 3, 3, cols[i]); rect(1 + i * 4, 8, 1, 1, cols[i], 0.5); rect(i * 4, 5, 1, 1, "#fff", 0.8); } }, 9, ["255,220,140", 3.4, 0.22], "wall");
  deco("battrophy", "Dusk Bat Trophy", "#8d63c9", function (rect) { rect(1, 2, 14, 12, "#8a5328"); rect(1, 2, 14, 1, "#c98c4f"); rect(2, 3, 12, 10, "#3a200d"); rect(2, 6, 4, 3, "#6a4a9a"); rect(10, 6, 4, 3, "#6a4a9a"); rect(1, 6, 2, 1, "#8d63c9"); rect(13, 6, 2, 1, "#8d63c9"); rect(6, 5, 4, 5, "#2a1744"); rect(6, 4, 1, 2, "#2a1744"); rect(9, 4, 1, 2, "#2a1744"); rect(7, 6, 1, 1, "#ff5a7a"); rect(8, 6, 1, 1, "#ff5a7a"); rect(7, 8, 2, 1, "#f6eedb"); rect(2, 3, 1, 1, "#f2c14e"); rect(13, 12, 1, 1, "#f2c14e"); }, 0, null, "wall");
  deco("worldmap", "World Map", "#e8dcc0", function (rect) { rect(1, 1, 14, 14, "#8a5a32"); rect(2, 2, 12, 12, "#e8dcc0"); rect(2, 2, 12, 1, "#f6eedb"); rect(3, 4, 4, 3, "#9ab070"); rect(5, 6, 3, 3, "#9ab070"); rect(8, 3, 4, 2, "#7fd6ff"); rect(9, 8, 4, 4, "#ff8a3d", 0.8); rect(4, 10, 3, 3, "#bff4ff"); rect(6, 8, 6, 1, "#a8703c"); rect(11, 10, 1, 1, "#d6382e"); rect(12, 9, 1, 1, "#d6382e"); rect(11, 9, 1, 1, "#d6382e"); rect(12, 10, 1, 1, "#d6382e"); }, 0, null, "wall");
  deco("antlers", "Mounted Antlers", "#c9b58a", function (rect) { rect(5, 8, 6, 5, "#8a5328"); rect(5, 8, 6, 1, "#c98c4f"); rect(6, 13, 4, 1, "#6e431f"); rect(6, 5, 1, 4, "#e8dcc0"); rect(9, 5, 1, 4, "#e8dcc0"); rect(4, 3, 2, 3, "#e8dcc0"); rect(3, 1, 1, 3, "#e8dcc0"); rect(5, 1, 1, 2, "#e8dcc0"); rect(10, 3, 2, 3, "#e8dcc0"); rect(12, 1, 1, 3, "#e8dcc0"); rect(10, 1, 1, 2, "#e8dcc0"); rect(2, 4, 2, 1, "#e8dcc0"); rect(13, 4, 2, 1, "#e8dcc0"); }, 0, null, "wall");
  // Hunter's trophies from the four wild creatures (Frost Wolf, Bog Gator, slimes, Ember Wasp)
  deco("wolftrophy", "Frost Wolf Trophy", "#cfdde6", function (rect) { rect(1, 2, 14, 12, "#8a5328"); rect(1, 2, 14, 1, "#c98c4f"); rect(2, 3, 12, 10, "#3a200d"); rect(4, 3, 2, 3, "#9aa8b4"); rect(10, 3, 2, 3, "#9aa8b4"); rect(5, 4, 1, 1, "#e8c0c8"); rect(10, 4, 1, 1, "#e8c0c8"); rect(4, 5, 8, 5, "#b9c6d0"); rect(5, 9, 6, 3, "#e8eef2"); rect(6, 12, 4, 1, "#e8eef2"); rect(7, 10, 2, 1, "#1a1e24"); rect(5, 6, 2, 1, "#7fd6ff"); rect(9, 6, 2, 1, "#7fd6ff"); rect(5, 6, 1, 1, "#ffffff"); rect(9, 6, 1, 1, "#ffffff"); rect(4, 5, 8, 1, "#d8e2ea"); rect(6, 12, 1, 1, "#ffffff"); rect(9, 12, 1, 1, "#ffffff"); }, 0, null, "wall");
  deco("gatortrophy", "Bog Gator Trophy", "#7aa84a", function (rect) { rect(0, 3, 6, 10, "#8a5328"); rect(0, 3, 6, 1, "#c98c4f"); rect(1, 5, 6, 6, "#3f6a2c"); rect(6, 6, 9, 4, "#4d7a3a"); rect(6, 6, 9, 1, "#6e9a4a"); rect(2, 4, 2, 2, "#5a8a3a"); rect(2, 4, 1, 1, "#f2c14e"); rect(6, 9, 9, 1, "#2a3d1c"); rect(7, 8, 1, 1, "#f6eedb"); rect(9, 10, 1, 1, "#f6eedb"); rect(11, 8, 1, 1, "#f6eedb"); rect(13, 10, 1, 1, "#f6eedb"); rect(14, 7, 1, 1, "#1a2412"); rect(3, 7, 3, 1, "#2a3d1c", 0.6); rect(2, 9, 4, 1, "#2a3d1c", 0.6); }, 0, null, "wall");
  deco("waspnest", "Ember Wasp Nest", "#d9b56a", function (rect) { rect(7, 0, 2, 2, "#6e431f"); rect(5, 2, 6, 2, "#c9a46a"); rect(4, 4, 8, 3, "#d9b98a"); rect(3, 7, 10, 3, "#c9a46a"); rect(4, 10, 8, 3, "#b8925a"); rect(6, 13, 4, 2, "#a8824a"); rect(4, 6, 8, 1, "#a8824a", 0.6); rect(3, 9, 10, 1, "#a8824a", 0.6); rect(5, 12, 6, 1, "#8a6a3a", 0.6); rect(7, 10, 2, 2, "#2a1a0a"); rect(12, 3, 3, 2, "#ffcf3a"); rect(12, 4, 3, 1, "#2a1a0a"); rect(13, 2, 2, 1, "#e9f6ff", 0.8); }, 0, null, "wall");
  deco("slimejar", "Glowing Slime Jar", "#8af07a", function (rect) { rect(5, 2, 6, 2, "#8a5a32"); rect(4, 4, 8, 1, "#bfe8ff", 0.7); rect(3, 5, 10, 10, "#bfe8ff", 0.35); rect(3, 5, 1, 10, "#e9f6ff", 0.8); rect(12, 5, 1, 10, "#7fb0c8", 0.8); rect(3, 15, 10, 1, "#7fb0c8"); rect(4, 9, 8, 6, "#5ad04a"); rect(4, 9, 8, 1, "#9af58a"); rect(5, 11, 2, 2, "#c8ffb8"); rect(9, 12, 1, 1, "#c8ffb8"); rect(6, 10, 1, 1, "#1a3a14"); rect(9, 10, 1, 1, "#1a3a14"); rect(4, 6, 1, 2, "#ffffff", 0.7); }, 5, ["120,255,140", 2.6, 0.22]);
  // The story's finale piece: the Heart of the Swamp, a great glowing crystal on a carved pedestal. Placing it ends the main quest line.
  deco("swampheart", "Heart of the Swamp", "#4ee6b4", function (rect) {
    rect(3, 13, 10, 3, "#6b7276"); rect(3, 13, 10, 1, "#8e969b"); rect(4, 12, 8, 1, "#5a6066"); rect(5, 15, 6, 1, "#3e4448");
    rect(6, 9, 4, 3, "#ff8a3d"); rect(6, 9, 4, 1, "#ffc24a"); rect(4, 10, 2, 2, "#5a8cff"); rect(10, 10, 2, 2, "#c08cff");
    rect(6, 2, 4, 8, "#22a883"); rect(5, 4, 6, 5, "#22a883"); rect(7, 0, 2, 3, "#4ee6b4"); rect(6, 3, 4, 5, "#4ee6b4"); rect(7, 3, 2, 4, "#bffcec"); rect(7, 3, 1, 2, "#ffffff");
    rect(4, 5, 1, 1, "#bffcec", 0.8); rect(11, 3, 1, 1, "#bffcec", 0.8); rect(12, 7, 1, 1, "#bffcec", 0.6); rect(3, 8, 1, 1, "#bffcec", 0.6);
  }, 12, ["78,230,180", 5, 0.32]);
  // Cave treasure: a gold-banded Cave Chest (opens like a chest, its loot is rolled the first time you open it) and a Cave Pot (smash it for a few goodies).
  // They are placed by populate() in the open-world caves and by SbxCave.gen() on the hole-cave floors. Loot comes from loot() below.
  var LC = tile("X_lootchest", "Cave Chest", "#000", "#f2c14e", 0.9, 0, "chest", false, 4, "lootchest"); glow(LC, "255,200,90", 1.9, 0.16);
  ART.lootchest = function (rect) {
    rect(1, 7, 14, 8, "#5a3a22"); rect(1, 10, 14, 1, "#3e2616", 0.7); rect(1, 13, 14, 1, "#3e2616", 0.6);
    rect(1, 3, 14, 4, "#6e4a2a"); rect(2, 2, 12, 1, "#7e5632"); rect(1, 3, 14, 1, "#8a6038"); rect(1, 6, 14, 1, "#2e1c10");
    rect(1, 7, 14, 1, "#f2c14e"); rect(3, 2, 2, 13, "#d9a83a"); rect(11, 2, 2, 13, "#d9a83a"); rect(3, 2, 1, 13, "#ffe08a"); rect(11, 2, 1, 13, "#ffe08a");
    rect(6, 5, 4, 5, "#f2c14e"); rect(6, 5, 4, 1, "#fff2b0"); rect(7, 7, 2, 2, "#3a200d"); rect(1, 15, 14, 1, "#1a0f08");
    rect(1, 3, 1, 12, "#000", 0.25); rect(14, 3, 1, 12, "#000", 0.3); rect(13, 2, 2, 1, "#e8e8e8", 0.45); rect(14, 3, 1, 2, "#e8e8e8", 0.35); rect(0, 14, 2, 2, "#6b7276", 0.8); rect(14, 14, 2, 2, "#6b7276", 0.7);
    rect(2, 4, 1, 1, "#fff6c2", 0.9); rect(12, 9, 1, 1, "#fff6c2", 0.7);
  };
  tile("X_lootpot", "Cave Pot", "#000", "#b87444", 0.15, 0, null, false, 0, "lootpot");
  ART.lootpot = function (rect, hh, v) {
    var C = [["#b87444", "#9a5a34", "#e0b070"], ["#8a7a9a", "#6a5a7a", "#c8b8e0"], ["#7a9a8a", "#5a7a6a", "#c0e0c8"]][(v || 0) % 3];
    rect(5, 3, 6, 1, "#5a3420"); rect(6, 4, 4, 2, C[1]); rect(4, 6, 8, 1, C[0]); rect(3, 7, 10, 7, C[0]); rect(2, 8, 1, 5, C[0]); rect(13, 8, 1, 5, C[1]);
    rect(4, 14, 8, 1, C[1]); rect(5, 15, 6, 1, "#3a2414"); rect(3, 9, 10, 1, C[2]); rect(3, 12, 10, 1, C[1], 0.8);
    rect(5, 10, 1, 1, C[2]); rect(8, 10, 1, 1, C[2]); rect(11, 10, 1, 1, C[2]); rect(4, 7, 1, 5, "#ffffff", 0.22); rect(11, 7, 2, 7, "#000", 0.18);
  };

  // ====================================================================================================
  // 7b. FARMING AND FOOD
  //   Garden Soil (placed like a block; Watered Soil is the same tile, darker, while a crop on it is watered)
  //   4 crops x 4 growth stages. Seeds are placed on top of Garden Soil like any block. Growth is run by sandbox.js (S.farm).
  //   Cooking Pot: a crafting station (Content Pack STN "cook"); meals are made in its window.
  //   Every food item has food = how much of the hunger bar it fills (0-100) and heal = health it gives back.
  // ====================================================================================================
  var FARM = block("farmland", "Garden Soil", "#5a3a26", "#7a5236", 0.5, function (rect, hh) {
    rect(0, 0, 16, 16, "#5a3a26"); rect(0, 0, 16, 2, "#6e4a2e"); rect(0, 0, 16, 1, "#8a6038");
    [3, 7, 11, 15].forEach(function (y) { rect(0, y, 16, 1, "#3e2616"); });
    for (var i = 0; i < 9; i++) rect(Math.floor(hh(i, 1, 3) * 15), 2 + Math.floor(hh(i, 2, 3) * 13), 1, 1, "#8a6a4a", 0.8);
  });
  var FARMWET = tile("X_farmwet", "Watered Soil", "#3a2416", "#523420", 0.5, 1, "farmland", true, 0, "farmwet");
  ART.farmwet = function (rect, hh) {
    rect(0, 0, 16, 16, "#3a2416"); rect(0, 0, 16, 2, "#4a3020"); rect(0, 0, 16, 1, "#5a3c28");
    [3, 7, 11, 15].forEach(function (y) { rect(0, y, 16, 1, "#24140a"); });
    for (var i = 0; i < 6; i++) rect(Math.floor(hh(i, 1, 4) * 15), 2 + Math.floor(hh(i, 2, 4) * 12), 2, 1, "#8fe0ff", 0.35);
  };
  // crops: n, home biome (grows 40% faster there), seconds per growth stage, produce yield, seeds back, colours
  var CROPS = {
    carrot: { n: "Swamp Carrot", b: 0, t: 32, yld: [2, 3], sd: [1, 2], leaf: "#3f9a3a", leaf2: "#7fd06a", fruit: "#ff8a2a", fruit2: "#c85a10", look: "root" },
    potato: { n: "Bog Potato", b: 0, t: 42, yld: [2, 4], sd: [1, 1], leaf: "#2f7a3c", leaf2: "#5fb24a", fruit: "#c9934e", fruit2: "#7a5228", look: "tuber", flower: "#c08cff" },
    pepper: { n: "Fire Pepper", b: 1, t: 50, yld: [2, 3], sd: [1, 2], leaf: "#3f8a2a", leaf2: "#8ad04a", fruit: "#e8341c", fruit2: "#ff8a6a", look: "hang" },
    frost: { n: "Frostberry", b: 2, t: 58, yld: [3, 4], sd: [1, 2], leaf: "#2f6a5a", leaf2: "#6ab8a0", fruit: "#5a8cff", fruit2: "#e8f4ff", look: "berry", flower: "#ffffff" }
  };
  function cropArt(C, st) {
    return function (rect) {
      var L = C.leaf, L2 = C.leaf2;
      if (st === 1) { rect(7, 12, 2, 4, L); rect(5, 11, 2, 1, L2); rect(9, 11, 2, 1, L2); rect(6, 12, 1, 1, L); rect(9, 12, 1, 1, L); return; }
      if (st === 2) { rect(7, 8, 2, 8, L); rect(4, 10, 3, 2, L2); rect(9, 9, 3, 2, L2); rect(5, 13, 2, 1, L); rect(9, 12, 3, 1, L); rect(6, 7, 1, 2, L2); rect(9, 6, 1, 2, L2); return; }
      if (C.look === "root") {   // feathery carrot tops; at stage 4 the orange shoulders show
        [[4, 3], [7, 1], [10, 3], [6, 5], [9, 5]].forEach(function (q) { rect(q[0], q[1], 2, 10 - q[1] + 4, L); rect(q[0] - 1, q[1] + 1, 1, 2, L2); rect(q[0] + 2, q[1] + 2, 1, 2, L2); });
        if (st === 4) { rect(4, 13, 3, 3, C.fruit); rect(9, 13, 3, 3, C.fruit); rect(4, 13, 3, 1, "#ffc070"); rect(9, 13, 3, 1, "#ffc070"); rect(5, 15, 1, 1, C.fruit2); rect(10, 15, 1, 1, C.fruit2); }
        return;
      }
      rect(7, 7, 2, 9, L);   // a bush
      rect(3, 6, 10, 6, L); rect(2, 8, 12, 3, L); rect(4, 4, 8, 3, L2); rect(3, 7, 2, 2, L2); rect(11, 7, 2, 2, L2); rect(6, 3, 4, 2, L2);
      if (st === 3) { if (C.flower) { rect(5, 4, 1, 1, C.flower); rect(10, 5, 1, 1, C.flower); rect(7, 3, 1, 1, C.flower); } if (C.look === "hang") { rect(5, 11, 1, 2, L2); rect(10, 11, 1, 2, L2); } return; }
      if (C.look === "tuber") { rect(5, 4, 1, 1, C.flower); rect(10, 5, 1, 1, C.flower); rect(8, 3, 1, 1, C.flower); rect(3, 13, 3, 3, C.fruit); rect(10, 13, 3, 3, C.fruit); rect(3, 13, 3, 1, "#e0b070"); rect(10, 13, 3, 1, "#e0b070"); rect(4, 15, 1, 1, C.fruit2); rect(11, 14, 1, 1, C.fruit2); }
      else if (C.look === "hang") { [[4, 10], [8, 11], [11, 9]].forEach(function (q) { rect(q[0], q[1], 2, 4, C.fruit); rect(q[0], q[1] + 3, 1, 1, C.fruit); rect(q[0], q[1], 1, 1, C.fruit2); rect(q[0], q[1] - 1, 1, 1, L); }); }
      else { [[4, 6], [9, 5], [6, 9], [11, 9], [3, 10]].forEach(function (q) { rect(q[0], q[1], 2, 2, C.fruit); rect(q[0], q[1], 1, 1, C.fruit2); }); }
    };
  }
  Object.keys(CROPS).forEach(function (k) {
    var C = CROPS[k]; C.tiles = [];
    for (var st = 1; st <= 4; st++) { var id = tile("X_crop_" + k + st, C.n + (st === 4 ? " (ripe)" : " (growing)"), "#000", st === 4 ? C.fruit : C.leaf2, 0.05, 0, null, false, 0, "crop_" + k + st, { crop: k, stage: st, sway: 1 }); ART["crop_" + k + st] = cropArt(C, st); C.tiles.push(id); }
  });
  var SEEDS = { carrot: "seed_carrot", potato: "seed_potato", pepper: "seed_pepper", frost: "seed_frost" };
  item("seed_carrot", "Swamp Carrot Seeds", { tile: CROPS.carrot.tiles[0], seed: "carrot" });
  item("seed_potato", "Seed Potato", { tile: CROPS.potato.tiles[0], seed: "potato" });
  item("seed_pepper", "Fire Pepper Seeds", { tile: CROPS.pepper.tiles[0], seed: "pepper" });
  item("seed_frost", "Frostberry Seeds", { tile: CROPS.frost.tiles[0], seed: "frost" });
  CROPS.carrot.produce = "carrot"; CROPS.potato.produce = "potato"; CROPS.pepper.produce = "pepper"; CROPS.frost.produce = "frostberry";
  // food: raw crops, wild finds, meat and cooked meals
  function food(k, n, f, h, cooked) { item(k, n, { food: f, heal: h || 0, cooked: cooked ? 1 : 0 }); }
  food("carrot", "Swamp Carrot", 10, 0); food("potato", "Bog Potato", 6, 0); food("pepper", "Fire Pepper", 6, 0); food("frostberry", "Frostberry", 12, 2);
  food("rawmeat", "Raw Meat", 8, 0);
  food("roastcarrot", "Roast Carrots", 28, 6, 1); food("bakedpotato", "Baked Potato", 32, 6, 1); food("skewer", "Mushroom Skewer", 22, 5, 1); food("grilledmeat", "Grilled Meat", 40, 12, 1);
  food("chili", "Fire Pepper Chili", 50, 18, 1); food("stew", "Swamp Stew", 65, 25, 1); food("berrypie", "Frostberry Tart", 60, 30, 1); food("feast", "Explorer's Feast", 100, 60, 1);
  if (ITEMS.redcap) { ITEMS.redcap.food = 5; ITEMS.redcap.heal = 0; }   // wild Redcap Mushrooms and Frostfen Icecaps can be eaten raw in a pinch
  if (ITEMS.icecap) { ITEMS.icecap.food = 5; ITEMS.icecap.heal = 0; }
  deco("cookpot", "Cooking Pot", "#ff8a3d", function (rect) {   // an iron pot of stew over a little fire
    rect(2, 14, 12, 2, "#6b7276"); rect(2, 14, 12, 1, "#8e969b"); rect(4, 12, 8, 2, "#ff7a1f"); rect(6, 11, 4, 2, "#ffc43a"); rect(7, 12, 2, 1, "#fff6c2");
    rect(2, 5, 12, 7, "#3a3a44"); rect(1, 5, 14, 2, "#4a4a54"); rect(1, 5, 14, 1, "#6a6a74"); rect(3, 6, 10, 1, "#9a6a2a"); rect(4, 6, 3, 1, "#ff8a2a"); rect(9, 6, 2, 1, "#7fd06a");
    rect(2, 7, 1, 4, "#5a5a64"); rect(13, 7, 1, 4, "#24242c"); rect(0, 6, 1, 2, "#4a4a54"); rect(15, 6, 1, 2, "#4a4a54");
    rect(5, 2, 1, 2, "#d0d0d0", 0.7); rect(8, 1, 1, 3, "#d0d0d0", 0.6); rect(11, 2, 1, 2, "#d0d0d0", 0.5);
  }, 6, ["255,150,60", 2.4, 0.18]);
  // ---- fishing and ranching ----
  // fish: food + heal when eaten raw; rare fish are worth cooking into a trophy instead
  food("bogminnow", "Bog Minnow", 5, 0); food("catfish", "Mud Catfish", 8, 0); food("glowfin", "Glowfin", 18, 12);
  food("frosttrout", "Frost Trout", 8, 2); food("icepike", "Ice Pike", 10, 2); food("crystalcarp", "Crystal Carp", 20, 15);
  food("magmaeel", "Magma Eel", 10, 3); food("emberkoi", "Ember Koi", 10, 3); food("cinderfish", "Cinderfish", 22, 16);
  item("oldboot", "Old Boot", {});
  // animal products
  food("duckegg", "Duck Egg", 8, 1); food("truffle", "Swamp Truffle", 10, 4); food("goatmilk", "Goat Milk", 12, 6);
  // fish and farm meals (Cooking Pot)
  food("grilledfish", "Grilled Fish", 30, 8, 1); food("fishchips", "Fish and Taters", 45, 14, 1); food("catstew", "Catfish Stew", 55, 20, 1); food("chowder", "Frost Trout Chowder", 58, 22, 1);
  food("spicyeel", "Spicy Eel", 52, 24, 1); food("omelette", "Swamp Omelette", 34, 10, 1); food("truffleroast", "Truffle Roast", 62, 26, 1); food("milkshake", "Frostberry Shake", 40, 16, 1);
  // the Feeding Trough marks a pen: tamed animals near one stay close to it
  deco("trough", "Feeding Trough", "#c9a46a", function (rect) {
    rect(1, 8, 14, 6, "#8a5328"); rect(1, 8, 14, 1, "#c98c4f"); rect(2, 9, 12, 3, "#3a200d"); rect(2, 9, 12, 2, "#d9b56a"); rect(3, 9, 2, 1, "#f2d890"); rect(8, 9, 3, 1, "#f2d890");
    rect(1, 14, 2, 2, "#6e431f"); rect(13, 14, 2, 2, "#6e431f"); rect(1, 11, 14, 1, "#6e431f", 0.6); rect(4, 8, 1, 6, "#6e431f", 0.5); rect(11, 8, 1, 6, "#6e431f", 0.5);
  });
  deco("fishtrophy", "Mounted Fish", "#7fd6ff", function (rect) {
    rect(1, 3, 14, 10, "#8a5328"); rect(1, 3, 14, 1, "#c98c4f"); rect(2, 4, 12, 8, "#3a200d");
    rect(4, 6, 8, 4, "#4ee6b4"); rect(5, 9, 6, 1, "#d4fff6"); rect(2, 6, 2, 1, "#22a883"); rect(2, 9, 2, 1, "#22a883"); rect(3, 7, 1, 2, "#22a883"); rect(10, 7, 1, 1, "#06231c"); rect(7, 5, 2, 1, "#22a883");
  }, 3, ["120,255,210", 2.2, 0.16], "wall");
  item("swamptoken", "Croaker Token", {});   // bounty currency (Old Croaker's Swap Shop)
  deco("armorstand", "Armor Stand", "#c9a46a", function (rect) {   // a wooden mannequin on a post (the outfit you give it is drawn by sandbox.js)
    rect(3, 14, 10, 2, "#5a3a20"); rect(4, 13, 8, 1, "#8a5a32"); rect(7, 7, 2, 6, "#7a5230");
    rect(4, 3, 8, 5, "#c9a46a"); rect(4, 7, 8, 1, "#a8844e"); rect(2, 3, 2, 4, "#8a6a3a"); rect(12, 3, 2, 4, "#8a6a3a"); rect(6, 0, 4, 3, "#d8b47a");
  });
  deco("goldfrog", "Golden Frog Statue", "#f2c14e", function (rect) {   // Swap Shop exclusive
    rect(3, 13, 10, 3, "#6b6f74"); rect(3, 13, 10, 1, "#8e969b");
    rect(4, 7, 8, 6, "#f2c14e"); rect(3, 9, 10, 4, "#f2c14e"); rect(4, 4, 3, 3, "#f2c14e"); rect(9, 4, 3, 3, "#f2c14e"); rect(5, 5, 1, 1, "#12220f"); rect(10, 5, 1, 1, "#12220f");
    rect(4, 7, 8, 1, "#ffe9a8"); rect(5, 4, 1, 1, "#ffe9a8"); rect(10, 4, 1, 1, "#ffe9a8"); rect(5, 9, 6, 1, "#c8901e"); rect(3, 12, 10, 1, "#c8901e"); rect(7, 10, 2, 1, "#ffe9a8");
  }, 4, ["255,210,90", 2.0, 0.16]);
  deco("realmgate", "Realm Gate", "#8affe0", function (rect) {   // the small pedestal; the arch is drawn big by sandbox.js
    rect(1, 10, 14, 6, "#3a3450"); rect(1, 10, 14, 1, "#5a5274"); rect(3, 6, 10, 4, "#2a2440"); rect(6, 2, 4, 4, "#8affe0"); rect(7, 3, 2, 2, "#ffffff"); rect(2, 12, 2, 2, "#c06aff"); rect(12, 12, 2, 2, "#c06aff");
  }, 8, ["140,255,224", 2.4, 0.16]);
  item("arrow", "Arrow", {}); item("firearrow", "Fire Arrow", {});   // ammo for the Bogwood Bow and Ember Longbow
  deco("brewstand", "Brewing Stand", "#c06aff", function (rect) {   // a little rack of bubbling bottles over a flame
    rect(1, 14, 14, 2, "#5a4a52"); rect(7, 4, 2, 10, "#8a6a3a"); rect(3, 4, 10, 1, "#8a6a3a");
    rect(2, 6, 3, 5, "#cfeaf2"); rect(2, 8, 3, 3, "#ff5a6a"); rect(11, 6, 3, 5, "#cfeaf2"); rect(11, 8, 3, 3, "#4ee6b4");
    rect(5, 10, 6, 4, "#3a3450"); rect(6, 9, 4, 2, "#c06aff"); rect(7, 12, 2, 2, "#ff8a3d"); rect(7, 0, 1, 2, "#e8d0ff", 0.6); rect(9, 1, 1, 2, "#e8d0ff", 0.5);
  }, 5, ["192,106,255", 1.6, 0.1]);
  item("bottle", "Glass Bottle", {});
  [["tonic_heal", "Healing Tonic"], ["tonic_mine", "Miner's Draught"], ["tonic_speed", "Swiftfoot Brew"], ["tonic_night", "Night Eye Elixir"], ["tonic_fire", "Emberguard Potion"], ["tonic_hide", "Ironhide Brew"], ["tonic_fish", "Angler's Brew"], ["tonic_leap", "Leaping Brew"]].forEach(function (q) { item(q[0], q[1], {}); });
  mat("hexdust", "Hex Dust", "#b06aff");   // dropped by Bog Witches
  deco("jeweltable", "Jeweler's Table", "#e0a0ff", function (rect) {   // a small stone-topped table with a loupe and gems
    rect(1, 7, 14, 2, "#8e969b"); rect(1, 7, 14, 1, "#c4ccd1"); rect(2, 9, 2, 7, "#6e431f"); rect(12, 9, 2, 7, "#6e431f"); rect(4, 12, 8, 1, "#6e431f");
    rect(3, 5, 2, 2, "#e0364a"); rect(6, 5, 2, 2, "#3f7fe6"); rect(9, 4, 2, 3, "#a36bde"); rect(11, 2, 3, 3, "#c4ccd1"); rect(12, 3, 1, 1, "#ffffff"); rect(10, 5, 2, 1, "#c4ccd1");
  }, 3, ["224,160,255", 1.2, 0.08]);
  deco("sapling", "Sapling", "#7fd06a", function (rect) {   // a little sprout; it grows into a tree
    rect(7, 8, 2, 8, "#6e431f"); rect(4, 5, 4, 3, "#4f9a3a"); rect(8, 3, 4, 4, "#6ac04a"); rect(5, 9, 3, 2, "#3f8a2a"); rect(9, 2, 2, 1, "#9fe07a");
  });
  [["stain_walnut", "Walnut Stain"], ["stain_ebony", "Ebony Stain"], ["stain_honey", "Honey Oak Stain"], ["stain_mahogany", "Mahogany Stain"], ["stain_white", "Whitewash"], ["stain_sage", "Sage Stain"], ["stain_blue", "Bog Blue Stain"], ["stain_plum", "Plum Stain"], ["sandpaper", "Sandpaper"]].forEach(function (q) { item(q[0], q[1], {}); });   // wood stains (see WOOD STAINS in sandbox.js)
  item("emberwings", "Emberfly Wings", {});   // found in the Cinder Aerie's chest; worn at once (see EMBERFLY WINGS in sandbox.js)
  deco("thermalvent", "Thermal Vent", "#ffb04a", function (rect) {   // a cracked basalt mouth breathing hot air
    rect(1, 11, 14, 5, "#3b3036"); rect(1, 11, 14, 1, "#55444d"); rect(4, 12, 8, 3, "#1c1418"); rect(5, 12, 6, 2, "#ff6a1f"); rect(6, 12, 4, 1, "#ffd25a");
    rect(5, 6, 1, 4, "#ffe9b0", 0.5); rect(8, 3, 1, 6, "#ffe9b0", 0.6); rect(11, 5, 1, 5, "#ffe9b0", 0.45);
  }, 10, ["255,170,70", 2.6, 0.18]);
  mat("silk", "Spider Silk", "#e8e4f0");   // dropped by Cave Spiders
  deco("cobweb", "Cobweb", "#e8e4f0", function (rect) {   // a corner web, for spooky builds
    rect(0, 0, 16, 1, "#e8e4f0", 0.7); rect(0, 0, 1, 16, "#e8e4f0", 0.7);
    for (var k = 1; k < 15; k++) { rect(k, k, 1, 1, "#e8e4f0", 0.6); if (k % 2) { rect(k, 0, 1, Math.max(1, 15 - k), "#e8e4f0", 0.18); } }
    [4, 8, 12].forEach(function (r) { for (var a = 0; a <= r; a++) rect(a, r - a, 1, 1, "#ffffff", 0.45); });
  }, 0, null, "wall");
  item("homeshell", "Homeward Shell", { home: 1 });   // hold and tap: carried home to your bed (or camp)
  deco("sprinkler", "Sprinkler", "#8fe0ff", function (rect) {   // a brass head on a stone stand
    rect(5, 12, 6, 4, "#6b7276"); rect(5, 12, 6, 1, "#8e969b"); rect(7, 6, 2, 6, "#8a6a3a"); rect(4, 4, 8, 3, "#c8901e"); rect(4, 4, 8, 1, "#f2c14e"); rect(3, 5, 1, 1, "#c8901e"); rect(12, 5, 1, 1, "#c8901e");
    rect(2, 2, 1, 1, "#bfeeff"); rect(5, 1, 1, 1, "#bfeeff"); rect(10, 1, 1, 1, "#bfeeff"); rect(13, 2, 1, 1, "#bfeeff");
  });
  deco("fishtrap", "Fish Trap", "#c9a46a", function (rect) {   // a woven reed basket trap
    rect(2, 6, 12, 9, "#8a6a3a"); rect(2, 6, 12, 1, "#c9a46a"); [4, 7, 10].forEach(function (x) { rect(x, 6, 1, 9, "#6b4a26"); }); [9, 12].forEach(function (y) { rect(2, y, 12, 1, "#6b4a26"); });
    rect(0, 9, 3, 3, "#5a3a20"); rect(1, 10, 1, 1, "#1a0f08"); rect(6, 10, 3, 2, "#4ab8d8", 0.7);
  });
  item("earthworm", "Earthworm", {});   // fishing bait, dug from mud and grass
  item("firefly", "Firefly", {});       // caught with a Bug Net; bait, and light for jars
  deco("fireflyjar", "Firefly Jar", "#dcff78", function (rect) {
    rect(5, 2, 6, 2, "#8a6a4a"); rect(4, 4, 8, 11, "#bffff0", 0.35); rect(4, 4, 1, 11, "#e8fff8", 0.6); rect(11, 4, 1, 11, "#7fe8d0", 0.5); rect(4, 14, 8, 1, "#7fe8d0", 0.6);
    rect(6, 7, 1, 1, "#f6ff9a"); rect(9, 6, 1, 1, "#f6ff9a"); rect(7, 10, 1, 1, "#dcff78"); rect(9, 11, 1, 1, "#dcff78"); rect(6, 12, 1, 1, "#f6ff9a");
  }, 9, ["220,255,120", 3.0, 0.22]);
  // ---- boss summons, boss materials and boss trophies (the fights live in sandbox.js, BOSSES) ----
  item("lure_queen", "Bramble Lure", { summon: "queen" }); item("idol_wyrm", "Ember Idol", { summon: "wyrm" }); item("horn_alpha", "Frost Horn", { summon: "alpha" });
  item("queenchitin", "Queen's Chitin", {}); item("wyrmscale", "Wyrm Scale", {}); item("alphamane", "Alpha Mane", {});
  deco("queencrown", "Bramble Crown", "#f2c14e", function (rect) {   // the Queen's crown on a little stand
    rect(4, 13, 8, 3, "#6b4a26"); rect(4, 13, 8, 1, "#9a6a3a"); rect(6, 11, 4, 2, "#5a2468");
    rect(3, 6, 10, 5, "#f2c14e"); rect(3, 4, 2, 2, "#f2c14e"); rect(7, 2, 2, 4, "#f2c14e"); rect(11, 4, 2, 2, "#f2c14e"); rect(3, 6, 10, 1, "#ffe9a8");
    rect(7, 7, 2, 2, "#ff3a5a"); rect(4, 8, 1, 1, "#c06aff"); rect(11, 8, 1, 1, "#c06aff"); rect(3, 10, 10, 1, "#8a5a10");
  }, 4, ["255,107,130", 2.0, 0.16]);
  deco("wyrmskull", "Wyrm Skull", "#ff8a3d", function (rect) {
    rect(1, 2, 14, 12, "#3a200d"); rect(1, 2, 14, 1, "#6e431f");
    rect(3, 5, 10, 6, "#e8d8c0"); rect(9, 7, 5, 3, "#e8d8c0"); rect(5, 7, 2, 2, "#ff6a1f"); rect(5, 7, 1, 1, "#ffd23f"); rect(10, 10, 1, 1, "#3a200d"); rect(12, 10, 1, 1, "#3a200d");
    rect(3, 3, 2, 3, "#2a1008"); rect(7, 3, 2, 2, "#2a1008"); rect(3, 11, 9, 1, "#b8a890");
  }, 5, ["255,130,40", 2.2, 0.18], "wall");
  deco("alphapelt", "Alpha Pelt Banner", "#9fe8ff", function (rect) {
    rect(2, 1, 12, 1, "#6b4a26"); rect(3, 2, 10, 12, "#dfeaf2"); rect(3, 2, 10, 2, "#b8ccda"); rect(4, 14, 2, 2, "#dfeaf2"); rect(10, 14, 2, 2, "#dfeaf2"); rect(7, 13, 2, 2, "#dfeaf2");
    rect(6, 5, 4, 3, "#9fe8ff"); rect(7, 4, 2, 1, "#9fe8ff"); rect(6, 9, 4, 1, "#3a7aa8"); rect(5, 6, 1, 1, "#3ad8ff"); rect(10, 6, 1, 1, "#3ad8ff");
  }, 3, ["120,220,255", 2.0, 0.14], "wall");
  // ====================================================================================================
  // 7b. BUILDER'S PACK: 50 more building blocks. Each one carries its look (mat: family + palette) for the
  // Adventure-style block painter in sandbox.js; the 16px art is just the block's two colours.
  // ====================================================================================================
  var BPACK = [];
  function nb(k, n, hard, fam, p, o, light, gl) {
    var c = /^#/.test(p.b) ? p.b : p.d, id = block(k, n, c, p.l, hard, null, light, gl);
    TILES[id].mat = Object.assign({ f: fam, p: p }, o || {}); BPACK.push(k); return id;
  }
  function pal(l, b, d, g, o) { return { l: l, b: b, d: d, g: g, o: o }; }
  // woodwork
  nb("oakplanks", "Dark Oak Planks", 0.8, "boards", pal("#a8744a", "#8a5a34", "#6e4426", "#3a2210", "#1c1006"));
  nb("birchplanks", "Birch Planks", 0.8, "boards", pal("#f2dfb4", "#e0c896", "#c8ab74", "#8a7048", "#3e3020"));
  nb("mangroveplanks", "Mangrove Planks", 0.8, "boards", pal("#c4704a", "#a4543a", "#84402c", "#44200f", "#220e06"));
  nb("pineplanks", "Frostpine Planks", 0.8, "boards", pal("#e6c48e", "#cfa66c", "#b08650", "#5e4224", "#2c1e10"));
  nb("charredplanks", "Charred Planks", 0.9, "boards", pal("#5a4a44", "#403430", "#2e2422", "#120c0a", "#080404"), { ember: 1 }, 2, ["255,138,61", 1.2, 0.06]);
  nb("basketweave", "Basketweave Floor", 0.8, "weave", pal("#e8bc7c", "#cf9c5c", "#ad7c42", "#5a3a1a", "#2a1a0a"));
  nb("bamboo", "Bamboo Block", 0.7, "bamboo", pal("#dce88e", "#b4c460", "#8a9a40", "#4e5a1e", "#262c0c"));
  nb("wicker", "Wicker Block", 0.6, "wicker", pal("#e8cc8a", "#ccaa64", "#a8864a", "#5a4220", "#2a1e0c"));
  nb("logsiding", "Log Siding", 0.9, "logs", pal("#b88456", "#966640", "#74482c", "#3a2414", "#1c1008"));
  nb("woodpanel", "Oak Panelling", 0.8, "vboards", pal("#8a5a36", "#74482a", "#5e3a22", "#2a180c", "#140a04"));
  nb("timberblock", "Timber Frame Block", 0.8, "timber", pal("#f2e6c8", "#e0d0a8", "#ccb88c", "#5a3a1e", "#2a1a0c"));
  nb("cedarshakes", "Cedar Shakes", 0.8, "shingle", pal("#d49a64", "#b47a46", "#8e5c32", "#4a2c14", "#241406"));
  // masonry
  nb("sandbrick", "Sandstone Brick", 1.1, "brick", pal("#f0d8a0", "#dcc080", "#c0a060", "#7a6034", "#3a2c14"), { rows: 2, bw: 1 });
  nb("mudbrick", "Mud Brick", 0.9, "brick", pal("#a8825a", "#8e6a44", "#745434", "#3c2a18", "#1c140a"), { rows: 3, bw: 0.67 });
  nb("limestone", "Limestone Block", 1.2, "brick", pal("#ece6d2", "#d8d0b8", "#c0b69a", "#8a8068", "#3c382c"), { rows: 1, bw: 1 });
  nb("marble", "White Marble", 1.4, "marble", pal("#fbfbf8", "#ecebe6", "#d4d2ca", "#9a978e", "#4a4840"));
  nb("blackmarble", "Black Marble", 1.6, "marble", pal("#4a4652", "#34313a", "#24222a", "#e0b84a", "#0c0a10"));
  nb("granite", "Pink Granite", 1.5, "speckle", pal("#e4b0a4", "#c89488", "#a8766c", "#5a3a36", "#2a1a18"));
  nb("andesite", "Polished Andesite", 1.3, "polished", pal("#c4c8c8", "#a8acac", "#8e9292", "#5a5e5e", "#262a2a"));
  nb("slatetile", "Slate Tiles", 1.2, "tiles", pal("#7a8692", "#606c76", "#4a545e", "#22282e", "#101418"));
  nb("basalttile", "Basalt Tiles", 1.6, "tiles", pal("#6a5a6a", "#524452", "#3e323e", "#1a141a", "#0c080c"));
  nb("carvedstone", "Carved Stone", 1.3, "carved", pal("#c2c8cc", "#a6aeb2", "#7a8286", "#4c5458", "#22282c"));
  nb("stonepillar", "Stone Pillar", 1.3, "pillar", pal("#d2d6d8", "#b0b6b8", "#8a9092", "#5a6062", "#262a2c"));
  nb("mossycobble", "Mossy Cobblestone", 1.2, "cobble", pal("#a4ac9e", "#868e82", "#686f64", "#363c34", "#181c16"), { moss: 1 });
  nb("frostcobble", "Frost Cobblestone", 1.3, "cobble", pal("#c4e2f2", "#9cc4d8", "#7ea6bc", "#3e6076", "#1a2e3a"));
  nb("crackedbrick", "Cracked Stone Brick", 1.1, "brick", pal("#b4bcc2", "#98a1a8", "#7d868d", "#4c5459", "#22282c"), { rows: 2, bw: 1, crack: 1 });
  nb("bonebrick", "Bone Brick", 1.2, "brick", pal("#f2ead2", "#e0d4b4", "#c8b890", "#7a6c50", "#3a3020"), { rows: 2, bw: 0.5 });
  nb("herringbone", "Herringbone Brick", 1.1, "herring", pal("#d98a64", "#bd6a48", "#9a5034", "#4a2a1e", "#22120a"));
  // tiles, mosaics and roofs
  nb("terracotta", "Terracotta", 1.0, "polished", pal("#e89a68", "#cc7a4c", "#ac6038", "#5c2e18", "#2c140a"));
  nb("tealtile", "Teal Glazed Tile", 1.0, "tiles", pal("#8adcd0", "#4ab4a8", "#2e8a80", "#e8efe6", "#10302c"), { gloss: 1 });
  nb("ochretile", "Ochre Glazed Tile", 1.0, "tiles", pal("#ffe08a", "#e8b442", "#c08a22", "#f4ecd8", "#3a2808"), { gloss: 1 });
  nb("bluemosaic", "Blue Mosaic", 1.0, "mosaic", pal("#a8d0ff", "#5a8ae0", "#2a52a8", "#e8e4d8", "#10204a"));
  nb("swampmosaic", "Swamp Mosaic", 1.0, "mosaic", pal("#c4ec96", "#6ab45a", "#3a7a3a", "#e4e0c4", "#d2a040"));
  nb("rosemosaic", "Rose Mosaic", 1.0, "mosaic", pal("#ffd0dc", "#ea7a9a", "#b84a6a", "#f2eadc", "#6a2a4a"));
  nb("claytiles", "Clay Roof Tiles", 0.9, "barrel", pal("#ec9468", "#d2704a", "#a85234", "#5c2a18", "#2c1208"));
  nb("mossshingles", "Mossy Shingles", 0.9, "shingle", pal("#8ab45a", "#6a9440", "#4e7430", "#24361a", "#10180a"));
  nb("bogthatch", "Bog Reed Thatch", 0.5, "thatch", pal("#b8b46e", "#94904c", "#747036", "#3c3a1a", "#1c1a0a"));
  // metal
  nb("brassblock", "Brass Block", 2.0, "panel", pal("#ffe4a0", "#e0b45a", "#b88a34", "#6a4a14", "#2e1e06"), { rivets: 1 });
  nb("verdigris", "Verdigris Plate", 2.0, "panel", pal("#a8e0c8", "#6ab49a", "#4a8a74", "#24483a", "#0e2218"), { rivets: 1 });
  nb("gildedblock", "Gilded Block", 2.0, "panel", pal("#fff2b0", "#f2c84a", "#c8962a", "#7a5410", "#3a2606"), { facets: 1 });
  nb("steelplate", "Dark Steel Plate", 2.4, "panel", pal("#8a92a0", "#5c6470", "#444a54", "#22262c", "#0c0e12"), { rivets: 1 });
  nb("corrugated", "Corrugated Iron", 1.8, "corrugated", pal("#c8d0d8", "#a0a8b2", "#747c86", "#3e444c", "#1a1e22"));
  nb("grate", "Iron Grate", 1.6, "grate", pal("#b4bcc6", "#8a929c", "#5e666e", "#2c3036", "#14161a"));
  // glass
  nb("clearglass", "Clear Glass", 0.4, "glass", pal("#ffffff", "rgba(200,232,244,.26)", "#a0c0cc", "#6a7a82", "#2a3236"));
  nb("purpleglass", "Violet Stained Glass", 0.4, "glass", pal("#ecd8ff", "rgba(150,90,220,.5)", "#6a3aa8", "#2e2a3a", "#14101c"));
  nb("amberglass", "Amber Stained Glass", 0.4, "glass", pal("#fff0c8", "rgba(240,160,50,.5)", "#b8701a", "#3a2e22", "#1c140a"));
  nb("frostglass", "Frosted Glass", 0.4, "glass", pal("#ffffff", "rgba(210,236,250,.4)", "#9cc4d8", "#4a6e84", "#1f3646"), { frost: 1 });
  // lamp blocks
  nb("sporelamp", "Spore Lamp Block", 1.2, "lamp", pal("#e8fff0", "#6ef0b0", "#3a5a40", "#22302a", "#0c1410"), null, 13, ["110,240,170", 4.2, 0.28]);
  nb("paperlamp", "Paper Lantern Block", 0.6, "paperlamp", pal("#fff8e0", "#ffd890", "#8a5a32", "#5a3a1e", "#24140a"), null, 12, ["255,214,140", 4.0, 0.26]);
  nb("moonlamp", "Moonstone Lamp Block", 1.4, "lamp", pal("#ffffff", "#c8d0ff", "#5e6890", "#3e4668", "#161a2c"), null, 14, ["200,210,255", 4.4, 0.3]);
  nb("fireflylamp", "Firefly Jar Block", 0.8, "lamp", pal("#fffcc8", "#d8e870", "#4a5a2a", "#2a3418", "#10160a"), { flies: 1 }, 11, ["240,250,140", 3.8, 0.24]);
  // ====================================================================================================
  // 7c. TRAPDOORS: a one-tile wooden hatch. Closed it is solid (stand on it, enemies cannot pass); open it hangs down from its hinge
  // side and you fall or climb through. sandbox.js does the opening, the auto-close and the drawing (see TRAPDOORS there).
  // ====================================================================================================
  var HATCH_C = tile("X_trapdoor", "Swamp Trapdoor", "#9a6234", "#c98c4f", 0.6, 1, "trapdoor", true, 0, "trapdoor");
  var HATCH_O = tile("X_trapdooro", "Open Trapdoor", "#9a6234", "#c98c4f", 0.6, 1, "trapdoor", false, 0, "trapdooro");
  TILES[HATCH_C].hatch = { open: false, toggle: HATCH_O }; TILES[HATCH_O].hatch = { open: true, toggle: HATCH_C };
  ART.trapdoor = function (rect) { rect(0, 0, 16, 16, "#4a2a14"); rect(1, 1, 14, 14, "#b9793f"); [5, 10].forEach(function (y) { rect(1, y, 14, 1, "#8a5328"); }); rect(1, 1, 14, 1, "#d79c62"); rect(1, 3, 14, 2, "#2c2c34"); rect(1, 11, 14, 2, "#2c2c34"); rect(7, 7, 2, 2, "#f2c14e"); };
  ART.trapdooro = function (rect) { rect(0, 0, 4, 16, "#4a2a14"); rect(1, 0, 2, 16, "#b9793f"); rect(0, 2, 4, 2, "#2c2c34"); rect(0, 12, 4, 2, "#2c2c34"); };
  item("trapdoor", "Swamp Trapdoor", { tile: HATCH_C });
  // ====================================================================================================
  // 7d. TREASURE & TREATS PACK: 50 new things across the whole game. Treasure finds turn up in chests and pots (deeper = rarer ones,
  // see LOOT_ALL / LOOT_B), and feed the new charms and potions; new meals at the Cooking Pot; potions at the Brewing Stand; decor at the
  // Decor Workbench. Potion effects and charm effects are wired up in sandbox.js (POTIONS, CHARMS and the hooks marked "treats pack").
  // ====================================================================================================
  var TREATS = [];
  function tr(k) { TREATS.push(k); }
  // treasure finds (9)
  [["lodestone", "Lodestone"], ["goldfeather", "Golden Feather"], ["owlfeather", "Snowy Owl Feather"], ["springroot", "Springroot"], ["leechfang", "Leech Fang"],
   ["trolltusk", "Troll Tusk"], ["ancientcoin", "Ancient Coin"], ["starshard", "Star Shard"], ["mandrake", "Mandrake Root"]].forEach(function (q) { item(q[0], q[1], { treasure: 1 }); tr(q[0]); });
  // potions (8): drawn as bottles in their own colour
  [["tonic_regen", "Mending Tonic"], ["tonic_glow", "Glow Tonic"], ["tonic_feather", "Featherfall Tonic"], ["tonic_luck", "Fortune Tonic"], ["tonic_grow", "Growth Tonic"],
   ["tonic_gill", "Gillweed Tonic"], ["tonic_brute", "Brute Tonic"], ["tonic_grand", "Grand Healing Tonic"]].forEach(function (q) { item(q[0], q[1], {}); tr(q[0]); });
  // meals (12): hunger filled, health healed
  food("swampsalad", "Swamp Salad", 24, 6, 1); food("redcapsoup", "Redcap Soup", 30, 8, 1); food("glowbroth", "Glowcap Broth", 30, 12, 1); food("buttermash", "Buttered Mash", 36, 8, 1);
  food("bogkebab", "Bog Kebab", 38, 12, 1); food("emberkebab", "Ember Kebab", 42, 14, 1); food("carproll", "Crystal Carp Roll", 44, 18, 1); food("eelcurry", "Magma Eel Curry", 60, 24, 1);
  food("fishpie", "Fisherman's Pie", 52, 18, 1); food("carrotcake", "Carrot Cake", 40, 12, 1); food("frostjam", "Frostberry Jam", 26, 8, 1); food("swamptea", "Marsh Lily Tea", 10, 20, 1);
  ["swampsalad", "redcapsoup", "glowbroth", "buttermash", "bogkebab", "emberkebab", "carproll", "eelcurry", "fishpie", "carrotcake", "frostjam", "swamptea"].forEach(tr);
  // decor (15)
  function dk(k, n, c, art, light, gl, put) { deco(k, n, c, art, light, gl, put); tr(k); }
  dk("pottedfern", "Potted Fern", "#4f8a3c", function (rect) { rect(5, 12, 6, 4, "#b87444"); rect(4, 11, 8, 2, "#d08a52"); rect(5, 15, 6, 1, "#7a4a24"); [[7, 3, 2, 8], [4, 5, 2, 6], [10, 5, 2, 6], [2, 8, 3, 3], [11, 8, 3, 3], [6, 6, 1, 4], [9, 6, 1, 4]].forEach(function (q, i) { rect(q[0], q[1], q[2], q[3], i % 2 ? "#6aa347" : "#4f8a3c"); }); rect(7, 2, 2, 1, "#8fd06a"); });
  dk("cattailvase", "Cattail Vase", "#8a5a32", function (rect) { rect(6, 10, 4, 6, "#5d7c93"); rect(5, 11, 6, 4, "#5d7c93"); rect(6, 10, 4, 1, "#8ab0c8"); rect(6, 12, 1, 2, "#8ab0c8"); [[5, 2], [8, 1], [10, 3]].forEach(function (q) { rect(q[0] + 1, q[1] + 3, 1, 10 - q[1], "#4f8a3c"); rect(q[0], q[1], 2, 4, "#7a4a24"); rect(q[0], q[1], 1, 1, "#a8703c"); }); });
  dk("glowjar", "Glowcap Jar", "#4ee6b4", function (rect) { rect(4, 6, 8, 10, "#bfe8ff", 0.45); rect(4, 5, 8, 2, "#8a5a32"); rect(5, 4, 6, 1, "#a8703c"); rect(4, 15, 8, 1, "#5d7c93"); [[5, 11, 3], [8, 9, 3], [6, 13, 2]].forEach(function (q) { rect(q[0], q[1] + 2, 1, 3, "#d4fff6"); rect(q[0] - 1, q[1], q[2], 2, "#4ee6b4"); }); rect(5, 7, 1, 6, "#ffffff", 0.5); }, 9, ["78,230,180", 2.6, 0.18]);
  dk("hangingherbs", "Hanging Herbs", "#6aa347", function (rect) { rect(1, 1, 14, 1, "#8a5a32"); [3, 7, 11].forEach(function (x, i) { rect(x + 1, 2, 1, 2, "#d8c08a"); rect(x, 4, 3, 7, ["#4f8a3c", "#7fae4a", "#a89a4a"][i]); rect(x + 1, 11, 1, 2, ["#ff9ad0", "#ffe27a", "#c8a8ff"][i]); rect(x, 5, 1, 4, "#2f5a24", 0.6); }); }, 0, null, "wall");
  dk("shipbottle", "Ship in a Bottle", "#bfe8ff", function (rect) { rect(1, 8, 13, 7, "#bfe8ff", 0.4); rect(14, 10, 2, 3, "#8a5a32"); rect(1, 14, 13, 1, "#5d7c93"); rect(4, 11, 7, 2, "#8a5a32"); rect(5, 13, 5, 1, "#5a3418"); rect(7, 6, 1, 5, "#5a3418"); rect(5, 7, 2, 3, "#f6eedb"); rect(8, 8, 2, 2, "#f6eedb"); rect(2, 13, 11, 1, "#3f7fe6", 0.6); rect(2, 9, 1, 4, "#ffffff", 0.6); });
  dk("gramophone", "Gramophone", "#f2c14e", function (rect) { rect(3, 11, 10, 5, "#8a5a32"); rect(3, 11, 10, 1, "#c98c4f"); rect(4, 15, 1, 1, "#3a2a1a"); rect(11, 15, 1, 1, "#3a2a1a"); rect(4, 10, 8, 1, "#22222a"); rect(7, 6, 1, 4, "#c9a43a"); rect(7, 1, 7, 2, "#f2c14e"); rect(6, 3, 7, 2, "#e0a830"); rect(6, 5, 4, 1, "#c98a20"); rect(13, 0, 2, 4, "#ffe08a"); rect(8, 2, 3, 1, "#fff2b0"); });
  dk("stackedbooks", "Stack of Books", "#c8301a", function (rect) { [[2, 13, 12, "#3a6aa8"], [3, 11, 10, "#c8301a"], [2, 9, 11, "#3f8a4a"], [4, 7, 9, "#7a3a8a"], [3, 5, 10, "#c9934e"]].forEach(function (q) { rect(q[0], q[1], q[2], 2, q[3]); rect(q[0], q[1], 1, 2, "#f6eedb"); rect(q[0] + q[2] - 3, q[1], 1, 2, "#f2c14e"); }); rect(2, 15, 12, 1, "#22140a", 0.5); rect(9, 3, 1, 2, "#e8341c"); });
  dk("teaset", "Tea Set", "#e8e4d8", function (rect) { rect(1, 14, 14, 2, "#a8703c"); rect(3, 9, 6, 5, "#f2eadc"); rect(4, 8, 4, 1, "#f2eadc"); rect(5, 7, 2, 1, "#3fae92"); rect(9, 10, 2, 1, "#f2eadc"); rect(10, 9, 1, 1, "#f2eadc"); rect(1, 10, 2, 3, "#f2eadc", 0.9); rect(4, 11, 4, 1, "#3fae92"); rect(11, 12, 3, 2, "#f2eadc"); rect(11, 12, 3, 1, "#b06a30"); rect(6, 4, 1, 2, "#ffffff", 0.5); rect(7, 2, 1, 2, "#ffffff", 0.4); });
  dk("frogidol", "Frog Idol", "#7a8a6a", function (rect) { rect(3, 13, 10, 3, "#6e7a72"); rect(3, 13, 10, 1, "#8e9a92"); rect(4, 7, 8, 6, "#8a9a7a"); rect(3, 9, 10, 4, "#8a9a7a"); rect(4, 5, 3, 3, "#8a9a7a"); rect(9, 5, 3, 3, "#8a9a7a"); rect(5, 6, 1, 1, "#f2c14e"); rect(10, 6, 1, 1, "#f2c14e"); rect(5, 10, 6, 1, "#4a5a4a"); rect(6, 11, 4, 1, "#a8b89a"); rect(4, 8, 1, 4, "#a8b89a", 0.6); rect(2, 12, 2, 1, "#4f8a3a"); rect(12, 11, 2, 2, "#4f8a3a"); });
  dk("bonepile", "Bone Pile", "#e8e0c8", function (rect) { rect(1, 13, 14, 3, "#a8a088"); [[2, 11, 6, 1], [7, 10, 7, 1], [4, 12, 8, 1], [9, 13, 5, 1]].forEach(function (q) { rect(q[0], q[1], q[2], q[3] + 1, "#e8e0c8"); rect(q[0] - 1, q[1] - 1, 2, 2, "#fffbea"); rect(q[0] + q[2] - 1, q[1] - 1, 2, 2, "#fffbea"); }); rect(5, 6, 5, 4, "#e8e0c8"); rect(6, 7, 1, 1, "#2a2420"); rect(8, 7, 1, 1, "#2a2420"); rect(6, 9, 3, 1, "#a8a088"); });
  dk("crystalcluster", "Crystal Cluster", "#9fe8ff", function (rect) { rect(2, 14, 12, 2, "#5d7c93"); [[3, 8, 3, 6, "#7fc8e8"], [6, 3, 4, 11, "#bff4ff"], [10, 6, 3, 8, "#9fe0ff"], [12, 10, 2, 4, "#7fc8e8"]].forEach(function (q) { rect(q[0], q[1], q[2], q[3], q[4]); rect(q[0], q[1], 1, q[3], "#ffffff", 0.6); rect(q[0] + 1, q[1] - 1, Math.max(1, q[2] - 2), 1, q[4]); }); rect(8, 5, 1, 4, "#ffffff", 0.8); }, 7, ["160,230,255", 2.4, 0.16]);
  dk("starchart", "Star Chart", "#2a3a6a", function (rect) { rect(1, 1, 14, 13, "#1e2a52"); rect(1, 1, 14, 1, "#c9a43a"); rect(1, 13, 14, 1, "#c9a43a"); rect(0, 0, 1, 15, "#8a5a32"); rect(15, 0, 1, 15, "#8a5a32"); [[3, 4], [6, 3], [9, 6], [12, 4], [5, 9], [10, 10], [7, 11]].forEach(function (q) { rect(q[0], q[1], 1, 1, "#fff2b0"); }); rect(4, 4, 2, 1, "#8ab0d0", 0.5); rect(7, 4, 2, 1, "#8ab0d0", 0.5); rect(9, 5, 1, 1, "#8ab0d0", 0.5); rect(11, 9, 2, 2, "#f2c14e", 0.7); }, 0, null, "wall");
  dk("birdcage", "Birdcage", "#c9a43a", function (rect) { rect(7, 0, 2, 2, "#c9a43a"); rect(4, 2, 8, 1, "#c9a43a"); rect(3, 3, 10, 1, "#c9a43a"); for (var x = 3; x <= 12; x += 3) rect(x, 4, 1, 10, "#c9a43a"); rect(3, 13, 10, 2, "#8a6a1a"); rect(6, 8, 4, 3, "#ff8a2a"); rect(9, 7, 2, 2, "#ff8a2a"); rect(10, 7, 1, 1, "#12220f"); rect(11, 8, 1, 1, "#f2c14e"); rect(5, 11, 6, 1, "#8a5a32"); }, 0, null, "wall");
  dk("windchime", "Bone Wind Chime", "#e8e0c8", function (rect) { rect(2, 1, 12, 1, "#8a5a32"); [3, 6, 9, 12].forEach(function (x, i) { rect(x, 2, 1, 3 + i, "#d8c08a"); rect(x - 1, 5 + i, 2, 4, "#e8e0c8"); rect(x - 1, 5 + i, 1, 4, "#fffbea"); }); rect(7, 12, 2, 3, "#5d7c93"); }, 0, null, "wall");
  dk("skullcandle", "Skull Candle", "#ffd28a", function (rect) { rect(3, 9, 10, 6, "#e8e0c8"); rect(4, 8, 8, 1, "#e8e0c8"); rect(5, 11, 2, 2, "#2a2420"); rect(9, 11, 2, 2, "#2a2420"); rect(7, 13, 2, 1, "#a8a088"); rect(4, 15, 8, 1, "#a8a088"); rect(7, 4, 2, 4, "#f6eedb"); rect(6, 7, 4, 1, "#e0d0b0", 0.7); rect(7, 1, 2, 3, "#ffb13b"); rect(7, 2, 1, 1, "#fff2b0"); }, 8, ["255,190,110", 2.2, 0.15]);
  // ====================================================================================================
  // 7e. INTERIOR PACK: tabletops, counters and shelves.
  // TILES[id].top = the pixel row (0..15) of a furniture piece's flat top: a "small" piece (TILES[id].small) placed in the tile above
  // it sits down onto that surface (sandbox.js draws it lowered and lets it overlap the furniture). Small pieces can still stand on
  // the floor like before. New here: kitchen counters, a wall shelf, a nightstand, side and coffee tables, and eight tabletop pieces.
  // ====================================================================================================
  var INTERIOR = [];
  function surf(k, top) { var it = ITEMS[k]; if (it && it.tile !== undefined) TILES[it.tile].top = top; }
  function small(k) { var it = ITEMS[k]; if (it && it.tile !== undefined) TILES[it.tile].small = 1; if (it) it.small = 1; }
  [["table", 6], ["desk", 6], ["dresser", 5], ["crate", 4], ["barrel", 3], ["bookshelf", 0], ["jeweltable", 6]].forEach(function (q) { surf(q[0], q[1]); });
  ["bucket", "pot", "flowerpot", "lantern", "glowpot", "emberlantern", "frostlantern", "globe", "telescope", "candelabra", "lavalamp", "slimejar", "fireflyjar", "goldfrog", "urn",
   "skullcandle", "teaset", "stackedbooks", "glowjar", "shipbottle", "pottedfern", "cattailvase", "gramophone", "crystalcluster", "frogidol", "queencrown", "wyrmskull"].forEach(small);
  function fur(k, n, c, top, art, light, gl, put) { deco(k, n, c, art, light, gl, put); surf(k, top); INTERIOR.push(k); }
  function tt(k, n, c, art, light, gl) { deco(k, n, c, art, light, gl); small(k); INTERIOR.push(k); }
  function cab(rect) { rect(0, 3, 16, 3, "#d8d2c4"); rect(0, 3, 16, 1, "#f4f0e6"); rect(0, 6, 16, 1, "#8e8a80"); rect(0, 7, 16, 9, "#9a6234"); rect(0, 15, 16, 1, "#4a2a14"); rect(1, 8, 6, 6, "#b9793f"); rect(9, 8, 6, 6, "#b9793f"); rect(1, 8, 6, 1, "#dc9a58"); rect(9, 8, 6, 1, "#dc9a58"); rect(6, 10, 1, 2, "#f2c14e"); rect(9, 10, 1, 2, "#f2c14e"); rect(7, 7, 2, 9, "#6e431f"); }
  fur("counter", "Kitchen Counter", "#d8d2c4", 3, function (rect) { cab(rect); });
  fur("countersink", "Counter Sink", "#8ab0c8", 3, function (rect) { cab(rect); rect(3, 3, 10, 2, "#5d7c93"); rect(4, 3, 8, 1, "#8ab0c8"); rect(10, 0, 1, 3, "#aab2bd"); rect(8, 0, 3, 1, "#aab2bd"); rect(8, 1, 1, 1, "#7fd6ff"); });
  fur("counterstove", "Counter Stove", "#3a3a42", 3, function (rect) { cab(rect); rect(0, 3, 16, 3, "#33343c"); rect(0, 3, 16, 1, "#55565e"); rect(2, 4, 4, 1, "#ff8a3d"); rect(10, 4, 4, 1, "#ff8a3d"); rect(3, 4, 2, 1, "#ffd28a"); rect(11, 4, 2, 1, "#ffd28a"); rect(1, 9, 14, 4, "#2a2a30"); rect(2, 10, 12, 2, "#ff6a1f", 0.6); }, 4, ["255,140,60", 1.4, 0.08]);
  fur("wallshelf", "Wall Shelf", "#a8703c", 11, function (rect) { rect(0, 11, 16, 2, "#b9793f"); rect(0, 11, 16, 1, "#dc9a58"); rect(0, 13, 16, 1, "#6e431f"); rect(2, 13, 2, 3, "#4a4a52"); rect(12, 13, 2, 3, "#4a4a52"); rect(2, 13, 1, 1, "#9aa0ac"); rect(12, 13, 1, 1, "#9aa0ac"); }, 0, null, "wall");
  fur("nightstand", "Nightstand", "#a8703c", 6, function (rect) { rect(2, 6, 12, 2, "#c98c4f"); rect(2, 6, 12, 1, "#e4aa6c"); rect(3, 8, 10, 6, "#9a6234"); rect(3, 10, 10, 1, "#6e431f"); rect(7, 9, 2, 1, "#f2c14e"); rect(7, 12, 2, 1, "#f2c14e"); rect(3, 14, 2, 2, "#6e431f"); rect(11, 14, 2, 2, "#6e431f"); });
  fur("sidetable", "Round Side Table", "#c98c4f", 5, function (rect) { rect(2, 5, 12, 2, "#c98c4f"); rect(3, 5, 10, 1, "#e4aa6c"); rect(1, 6, 1, 1, "#a8703c"); rect(14, 6, 1, 1, "#a8703c"); rect(7, 7, 2, 7, "#8a5a32"); rect(7, 7, 1, 7, "#a8703c"); rect(4, 14, 8, 2, "#6e431f"); rect(5, 14, 6, 1, "#8a5a32"); });
  fur("coffeetable", "Coffee Table", "#8a5a32", 10, function (rect) { rect(0, 10, 16, 2, "#a8703c"); rect(0, 10, 16, 1, "#dc9a58"); rect(1, 12, 14, 1, "#6e431f"); rect(1, 12, 2, 4, "#8a5a32"); rect(13, 12, 2, 4, "#8a5a32"); rect(3, 14, 10, 1, "#6e431f", 0.7); });
  tt("tablecandle", "Table Candle", "#ffd28a", function (rect) { rect(5, 14, 6, 2, "#c9a54a"); rect(6, 14, 4, 1, "#f2dc8a"); rect(7, 8, 2, 6, "#f6eedb"); rect(7, 8, 1, 6, "#ffffff"); rect(7, 7, 2, 1, "#d8c8a8"); rect(7, 4, 2, 3, "#ffb13b"); rect(7, 5, 1, 1, "#fff2b0"); rect(8, 3, 1, 1, "#ff8a3d"); }, 9, ["255,200,120", 2.4, 0.16]);
  tt("oillamp", "Oil Lamp", "#f2c14e", function (rect) { rect(4, 14, 8, 2, "#8a6a2a"); rect(5, 11, 6, 3, "#c9a54a"); rect(5, 11, 6, 1, "#f2dc8a"); rect(6, 4, 4, 7, "#bfe8ff", 0.45); rect(6, 4, 1, 7, "#ffffff", 0.5); rect(7, 6, 2, 3, "#ffb13b"); rect(7, 7, 1, 1, "#fff2b0"); rect(6, 3, 4, 1, "#8a6a2a"); }, 11, ["255,190,110", 3.0, 0.18]);
  tt("fruitbowl", "Fruit Bowl", "#e8341c", function (rect) { rect(3, 12, 10, 3, "#c98c4f"); rect(2, 11, 12, 1, "#e4aa6c"); rect(5, 15, 6, 1, "#8a5a32"); rect(4, 8, 3, 3, "#e8341c"); rect(7, 7, 3, 4, "#ff8a2a"); rect(10, 8, 3, 3, "#5a8cff"); rect(6, 9, 2, 2, "#7fd06a"); rect(4, 8, 1, 1, "#ffb0a0"); rect(8, 6, 1, 1, "#3f9a3a"); });
  tt("openbook", "Open Book", "#f6eedb", function (rect) { rect(1, 12, 14, 3, "#8a3020"); rect(2, 11, 6, 3, "#f6eedb"); rect(8, 11, 6, 3, "#ece2c8"); rect(7, 11, 2, 4, "#5a1a10"); [3, 4, 5].forEach(function (x) { rect(x, 12, 1, 1, "#8a8070"); rect(x + 7, 12, 1, 1, "#8a8070"); }); rect(12, 9, 1, 3, "#e8341c"); });
  tt("inkquill", "Ink & Quill", "#2a2a3a", function (rect) { rect(5, 11, 6, 5, "#2a2a3a"); rect(5, 11, 6, 1, "#4a4a5a"); rect(6, 10, 4, 1, "#4a4a5a"); rect(6, 12, 1, 3, "#5a5a6a"); rect(9, 2, 2, 2, "#f6eedb"); rect(8, 4, 2, 2, "#f6eedb"); rect(8, 6, 1, 4, "#f6eedb"); rect(10, 1, 1, 2, "#ffffff"); rect(8, 9, 1, 2, "#8a7a5a"); });
  tt("bonsai", "Bonsai Tree", "#4f8a3c", function (rect) { rect(3, 13, 10, 3, "#5d7c93"); rect(3, 13, 10, 1, "#8ab0c8"); rect(7, 8, 2, 5, "#7a4a24"); rect(5, 10, 2, 1, "#7a4a24"); rect(9, 7, 2, 1, "#7a4a24"); rect(2, 5, 6, 4, "#3f8a3a"); rect(8, 3, 6, 4, "#4f9a3c"); rect(5, 2, 4, 3, "#6aae4a"); rect(3, 5, 2, 1, "#8fd06a"); rect(9, 3, 2, 1, "#8fd06a"); });
  tt("lilyvase", "Vase of Lilies", "#ffd2e8", function (rect) { rect(5, 10, 6, 6, "#e8e4d8"); rect(4, 11, 8, 4, "#e8e4d8"); rect(5, 10, 6, 1, "#ffffff"); rect(5, 12, 6, 1, "#5a8cff"); [[4, 3], [8, 2], [11, 4]].forEach(function (q) { rect(q[0] + 1, q[1] + 2, 1, 9 - q[1], "#4f8a3c"); rect(q[0], q[1], 3, 2, "#ffd2e8"); rect(q[0] + 1, q[1], 1, 1, "#ffe27a"); }); });
  tt("cakestand", "Cake Stand", "#ff9ad0", function (rect) { rect(4, 15, 8, 1, "#c9a54a"); rect(7, 12, 2, 3, "#c9a54a"); rect(2, 11, 12, 1, "#f2dc8a"); rect(3, 6, 10, 5, "#f6eedb"); rect(3, 6, 10, 2, "#ff9ad0"); rect(4, 8, 1, 1, "#ff9ad0"); rect(8, 8, 1, 2, "#ff9ad0"); rect(11, 8, 1, 1, "#ff9ad0"); rect(7, 4, 2, 2, "#e8341c"); rect(8, 3, 1, 1, "#3f9a3a"); });
  tt("teapot", "Copper Teapot", "#c9763e", function (rect) { rect(4, 9, 8, 6, "#c9763e"); rect(5, 8, 6, 1, "#c9763e"); rect(4, 15, 8, 1, "#8a4a20"); rect(5, 9, 2, 4, "#f0a868"); rect(7, 6, 2, 2, "#8a4a20"); rect(12, 10, 2, 1, "#c9763e"); rect(13, 9, 2, 1, "#c9763e"); rect(1, 10, 3, 1, "#8a4a20"); rect(1, 11, 1, 3, "#8a4a20"); rect(10, 4, 1, 2, "#ffffff", 0.5); });
  // ====================================================================================================
  // 7f. BLASTING PACK: Bog Bombs, Sticky Bombs, the Blast Keg and Firework Rockets. sandbox.js throws, lights and blows them up (see BLASTING there).
  //   item.throwk = what kind of throwable it is ("bomb", "sticky", "firework"). The Blast Keg is a floor piece you tap (or press F next to) to light.
  // ====================================================================================================
  var FUN = [];
  item("bomb", "Bog Bomb", { throwk: "bomb" }); FUN.push("bomb");
  item("stickybomb", "Sticky Bomb", { throwk: "sticky" }); FUN.push("stickybomb");
  item("firework", "Firework Rocket", { throwk: "firework" }); FUN.push("firework");
  deco("blastkeg", "Blast Keg", "#c8301a", function (rect) {
    rect(3, 3, 10, 13, "#8a4a24"); rect(2, 4, 12, 11, "#9a5a2c"); rect(4, 3, 2, 13, "#b06a34"); rect(11, 4, 1, 11, "#6e3a1a");
    rect(2, 5, 12, 2, "#4a4a52"); rect(2, 12, 12, 2, "#4a4a52"); rect(2, 5, 12, 1, "#7a7a84"); rect(2, 12, 12, 1, "#7a7a84");
    rect(5, 7, 6, 5, "#c8301a"); rect(5, 7, 6, 1, "#e85a3a"); rect(7, 8, 2, 2, "#fff2b0"); rect(7, 11, 2, 1, "#fff2b0");
    rect(3, 2, 10, 1, "#6e3a1a"); rect(7, 0, 1, 2, "#c9a46a"); rect(8, 0, 1, 1, "#ffd23f");
  }); TILES[T.X_blastkeg].kind = "blastkeg"; FUN.push("blastkeg");
  // ====================================================================================================
  // 7g. STARFALL PACK: on some clear nights stars streak across the sky and a few crash down, leaving a glowing Fallen Star in a small
  // crater (sandbox.js: STARFALL). Mine it for Star Shards and Stardust; Stardust makes Starglass, Star Lanterns, Star Rockets and a charm.
  // ====================================================================================================
  mat("stardust", "Stardust", "#ffe9a0"); FUN.push("stardust");
  var FSTAR = tile("X_fallenstar", "Fallen Star", "#3a2a5a", "#ffe9a0", 2.0, 1, "starshard", true, 13, "fallenstar", { bonus: [["stardust", 1, 2, 4]] });
  glow(FSTAR, "255,230,150", 3.4, 0.24);
  ART.fallenstar = function (rect, hh) {
    rect(0, 2, 16, 14, "#2c2240"); rect(1, 1, 14, 15, "#3a2c56"); rect(2, 0, 11, 2, "#3a2c56"); rect(1, 13, 14, 3, "#241a36");
    [[2, 4], [12, 3], [3, 12], [13, 11], [6, 14], [10, 1]].forEach(function (q) { rect(q[0], q[1], 2, 1, "#5a4a82"); });
    rect(7, 2, 2, 12, "#ffd86a"); rect(2, 7, 12, 2, "#ffd86a"); rect(5, 5, 6, 6, "#ffe9a0"); rect(4, 6, 8, 4, "#ffe9a0"); rect(6, 4, 4, 8, "#ffe9a0");
    rect(6, 6, 4, 4, "#fffbe8"); rect(7, 7, 2, 2, "#ffffff"); rect(4, 4, 1, 1, "#fff2b0"); rect(11, 11, 1, 1, "#fff2b0"); rect(11, 4, 1, 1, "#bfe0ff"); rect(4, 11, 1, 1, "#bfe0ff");
  };
  block("starglass", "Starglass", "#2a3a6a", "#ffe9a0", 0.6, function (rect, hh) {
    rect(0, 0, 16, 16, "#24305a", 0.85); rect(0, 0, 16, 1, "#141a30"); rect(0, 15, 16, 1, "#141a30"); rect(0, 0, 1, 16, "#141a30"); rect(15, 0, 1, 16, "#141a30");
    var pts = [[3, 3], [11, 2], [7, 7], [2, 11], [12, 10], [9, 13], [5, 5], [13, 6]];
    pts.forEach(function (q, i) { var on = ((hh * 7 + i * 13) | 0) % 3; rect(q[0], q[1], 1, 1, on ? "#ffe9a0" : "#bfe0ff"); if (i < 3) { rect(q[0] - 1, q[1], 3, 1, "#ffe9a0", 0.5); rect(q[0], q[1] - 1, 1, 3, "#ffe9a0", 0.5); } });
    rect(1, 1, 5, 1, "#ffffff", 0.25); rect(1, 1, 1, 5, "#ffffff", 0.25);
  }, 9, ["255,230,160", 2.2, 0.12]); FUN.push("starglass");
  deco("starlantern", "Star Lantern", "#ffe9a0", function (rect) {
    rect(7, 0, 2, 2, "#8a6a2a"); rect(4, 2, 8, 2, "#c9a43a"); rect(4, 2, 8, 1, "#f2d080"); rect(3, 4, 10, 9, "#bfe8ff", 0.35); rect(3, 4, 1, 9, "#c9a43a"); rect(12, 4, 1, 9, "#c9a43a");
    rect(7, 5, 2, 7, "#ffd86a"); rect(5, 7, 6, 3, "#ffd86a"); rect(6, 6, 4, 5, "#ffe9a0"); rect(7, 7, 2, 3, "#ffffff"); rect(4, 13, 8, 2, "#c9a43a"); rect(5, 15, 6, 1, "#8a6a2a");
  }, 12, ["255,225,150", 3.0, 0.2]); small("starlantern"); FUN.push("starlantern");
  item("starrocket", "Star Rocket", { throwk: "firework", star: 1 }); FUN.push("starrocket");
  // ====================================================================================================
  // 7h. MUSIC PACK: Music Records and the things that play them. Tap a Gramophone, Jukebox or Music Box (or press F next to it) to play
  // a song; tap again for the next record you own, and once more after the last one to stop. sandbox.js plays the tunes (see JUKEBOX).
  //   item.record = the song key. The Gramophone knows the Swamp Waltz by heart; the Music Box only ever plays its lullaby.
  // ====================================================================================================
  [["rec_waltz", "Record: Swamp Waltz", "waltz"], ["rec_jig", "Record: Ember Jig", "jig"], ["rec_lullaby", "Record: Frostfen Lullaby", "lullaby"],
   ["rec_caves", "Record: Crystal Caves", "caves"], ["rec_stomp", "Record: Bog Stomp", "stomp"], ["rec_starfall", "Record: Starfall Serenade", "starfall"]].forEach(function (q) { item(q[0], q[1], { record: q[2] }); FUN.push(q[0]); });
  deco("jukebox", "Swamp Jukebox", "#ff7ac0", function (rect) {
    rect(2, 3, 12, 13, "#6e3a1f"); rect(3, 1, 10, 3, "#8a4a26"); rect(5, 0, 6, 2, "#8a4a26"); rect(3, 2, 10, 1, "#b06a34");
    rect(3, 4, 10, 6, "#ff7ac0"); rect(4, 5, 8, 4, "#ffd0ec"); rect(5, 6, 6, 2, "#7fe8ff"); rect(6, 6, 1, 2, "#ffffff"); rect(9, 6, 1, 2, "#ffffff");
    rect(2, 3, 1, 13, "#f2c14e"); rect(13, 3, 1, 13, "#f2c14e"); rect(4, 11, 8, 3, "#2a1a14"); [5, 7, 9].forEach(function (x) { rect(x, 11, 1, 3, "#c9a43a"); });
    rect(3, 14, 10, 2, "#4a2a14"); rect(4, 15, 2, 1, "#2a1a0c"); rect(10, 15, 2, 1, "#2a1a0c"); rect(3, 10, 10, 1, "#ffd23f");
  }, 8, ["255,140,210", 2.4, 0.14]); FUN.push("jukebox");
  deco("musicbox", "Music Box", "#c9a43a", function (rect) {
    rect(3, 11, 10, 5, "#8a4a26"); rect(3, 11, 10, 1, "#b06a34"); rect(3, 15, 10, 1, "#5a2e14"); rect(7, 12, 2, 2, "#f2c14e");
    rect(3, 6, 10, 2, "#b06a34"); rect(3, 8, 1, 3, "#8a4a26"); rect(4, 9, 8, 2, "#ffd0ec"); rect(5, 10, 6, 1, "#c9a43a");
    rect(7, 5, 2, 4, "#ffd0ec"); rect(6, 4, 4, 1, "#ff9ad0"); rect(7, 3, 2, 1, "#ffe0c8"); rect(13, 13, 2, 1, "#c9a43a"); rect(14, 12, 1, 1, "#c9a43a");
  }); small("musicbox"); FUN.push("musicbox");
  // ====================================================================================================
  // 7i. WAYSTONES: a carved standing stone. Place one anywhere on the surface; tap it (or press F) to open a list of all your waystones
  // (plus the camp and your bed) and travel to any of them in a flash. sandbox.js keeps the list (S.ways) and does the travel (see WAYSTONES).
  // ====================================================================================================
  deco("waystone", "Waystone", "#4ee6d0", function (rect) {
    rect(4, 2, 8, 13, "#6e7a82"); rect(5, 1, 6, 2, "#6e7a82"); rect(6, 0, 4, 1, "#8a969e"); rect(4, 2, 2, 13, "#8a969e"); rect(11, 3, 1, 12, "#4e585e");
    rect(2, 14, 12, 2, "#4e585e"); rect(3, 13, 10, 1, "#6e7a82"); rect(2, 14, 12, 1, "#8a969e");
    rect(7, 3, 2, 1, "#4ee6d0"); rect(6, 4, 1, 3, "#4ee6d0"); rect(9, 4, 1, 3, "#4ee6d0"); rect(7, 7, 2, 1, "#4ee6d0"); rect(7, 8, 2, 3, "#9ffff0"); rect(6, 11, 4, 1, "#4ee6d0"); rect(7, 5, 2, 2, "#d4fff6");
    rect(5, 9, 1, 1, "#3f8a3a"); rect(10, 12, 2, 1, "#3f8a3a"); rect(4, 13, 2, 1, "#4f9a3c");
  }, 7, ["78,230,208", 2.6, 0.16]); TILES[T.X_waystone].kind = "waystone"; FUN.push("waystone");
  // ====================================================================================================
  // 7j. ADVENTURER'S PACK: the Vine Grapple (hold it and tap a block: a hook flies out and reels you over to it) and Treasure Maps
  // (found in chests, pots and while fishing; hold one and tap to read it: an X is marked somewhere nearby, a few blocks under the ground,
  // where a Buried Treasure chest is waiting to be dug up). sandbox.js does both (see GRAPPLE and TREASURE MAPS).
  // ====================================================================================================
  item("grapple", "Vine Grapple", { grap: 1 }); FUN.push("grapple");
  item("treasuremap", "Treasure Map", { tmap: 1 }); FUN.push("treasuremap");
  tile("X_buried", "Buried Treasure", "#6b5a44", "#f2c14e", 0.9, 0, "", true, 0, "buried");
  ART.buried = function (rect) {
    rect(0, 0, 16, 16, "#5a4632"); rect(0, 0, 16, 3, "#6b5a44"); [[2, 1], [9, 2], [13, 0], [5, 14], [12, 13]].forEach(function (q) { rect(q[0], q[1], 2, 1, "#7a6a54"); });
    rect(2, 5, 12, 9, "#7a4a24"); rect(2, 5, 12, 3, "#9a6234"); rect(2, 5, 12, 1, "#c98c4f"); rect(2, 8, 12, 1, "#4a2a14"); rect(2, 5, 1, 9, "#c9a43a"); rect(13, 5, 1, 9, "#c9a43a");
    rect(7, 7, 2, 3, "#f2c14e"); rect(7, 9, 2, 1, "#8a6a1a"); rect(3, 13, 10, 1, "#3a2a1a"); rect(4, 4, 2, 1, "#f2c14e"); rect(10, 3, 1, 2, "#fff2b0");
  };
  // ====================================================================================================
  // 7k. PLAYGROUND PACK: blocks and toys for parkour courses and parties. Bounce Shroom: land on it and you spring back up higher each
  // time (hold down to land softly). Speed Moss: you run much faster on it. Confetti Cannon: tap it for a burst of confetti. Party Balloons:
  // a bunch of balloons that bob in the breeze. sandbox.js does the bouncing, running and confetti (see PLAYGROUND).
  // ====================================================================================================
  block("bounceshroom", "Bounce Shroom", "#e8341c", "#ffd0c8", 0.5, function (rect) {
    rect(0, 6, 16, 10, "#e8e0c8"); rect(0, 6, 16, 1, "#fffbea"); rect(5, 8, 6, 8, "#d8ccb0"); rect(0, 15, 16, 1, "#a89c84"); [[2, 9], [12, 11], [8, 13]].forEach(function (q) { rect(q[0], q[1], 2, 1, "#c8bca0"); });
    rect(0, 0, 16, 7, "#e8341c"); rect(1, 0, 14, 1, "#ff6a5a"); rect(0, 6, 16, 1, "#b02414");
    [[2, 2, 3, 2], [8, 1, 3, 2], [12, 3, 3, 2], [5, 4, 2, 2]].forEach(function (q) { rect(q[0], q[1], q[2], q[3], "#fff6e8"); }); rect(2, 1, 1, 1, "#ffb0a0");
  }); FUN.push("bounceshroom");
  block("speedmoss", "Speed Moss", "#3fd0a0", "#d4fff0", 0.4, function (rect, hh) {
    rect(0, 0, 16, 16, "#2a6a4a"); rect(0, 0, 16, 4, "#3fd0a0"); rect(0, 0, 16, 1, "#9fffe0"); rect(0, 4, 16, 1, "#1f5038");
    [[1, 7], [6, 6], [11, 8], [3, 11], [9, 12], [13, 13]].forEach(function (q) { rect(q[0], q[1], 2, 1, "#3a8a62"); });
    [2, 7, 12].forEach(function (x) { rect(x, 1, 2, 1, "#ffffff"); rect(x + 1, 2, 2, 1, "#d4fff0"); rect(x, 3, 2, 1, "#ffffff"); });
  }, 3, ["80,230,180", 1.2, 0.06]); FUN.push("speedmoss");
  deco("confetti", "Confetti Cannon", "#ff7ad9", function (rect) {
    rect(3, 12, 10, 4, "#5a3a8a"); rect(3, 12, 10, 1, "#8a6ac8"); rect(4, 15, 8, 1, "#3a2a5a");
    rect(5, 4, 6, 8, "#ff7ad9"); rect(5, 4, 2, 8, "#ffb0ec"); rect(4, 3, 8, 2, "#f2c14e"); rect(4, 3, 8, 1, "#fff2b0");
    [[5, 6, "#ffd23f"], [8, 8, "#4ee6b4"], [6, 10, "#7fa8ff"], [9, 5, "#ffffff"]].forEach(function (q) { rect(q[0], q[1], 1, 1, q[2]); });
    [[3, 0, "#ffd23f"], [7, 1, "#4ee6b4"], [11, 0, "#ff5a6a"], [13, 2, "#7fa8ff"], [1, 2, "#d08aff"]].forEach(function (q) { rect(q[0], q[1], 1, 1, q[2]); });
  }); TILES[T.X_confetti].kind = "confetti"; FUN.push("confetti");
  deco("balloons", "Party Balloons", "#ff5a6a", function (rect) {
    rect(4, 12, 8, 4, "#c9a43a"); rect(4, 12, 8, 1, "#f2d080"); rect(7, 7, 1, 5, "#f6eedb"); rect(5, 8, 1, 4, "#f6eedb"); rect(10, 8, 1, 4, "#f6eedb");
    rect(2, 2, 5, 6, "#ff5a6a"); rect(3, 1, 3, 1, "#ff5a6a"); rect(3, 2, 1, 2, "#ffb0b8");
    rect(6, 0, 4, 6, "#4ea8ff"); rect(7, 0, 1, 2, "#bfe0ff");
    rect(9, 3, 5, 5, "#ffd23f"); rect(10, 2, 3, 1, "#ffd23f"); rect(10, 3, 1, 2, "#fff2b0");
  }); TILES[T.X_balloons].kind = "balloons"; FUN.push("balloons");
  // ====================================================================================================
  // 7l. RAINBOW PACK: when the rain stops on a sunny day a rainbow can arch over the land, and a Pot of Gold waits where it touches the
  // ground (sandbox.js: RAINBOWS). Tap or dig the pot for coins, tokens and Rainbow Prisms; prisms make Rainbow Glass.
  // ====================================================================================================
  mat("prism", "Rainbow Prism", "#ff9ad0"); FUN.push("prism");
  var POTG = tile("X_potofgold", "Pot of Gold", "#2a2a30", "#f2c14e", 0.3, 0, "", false, 9, "potofgold"); glow(POTG, "255,210,90", 2.8, 0.2);
  ART.potofgold = function (rect) {
    rect(2, 8, 12, 7, "#2a2a32"); rect(1, 7, 14, 2, "#3a3a44"); rect(1, 7, 14, 1, "#5a5a66"); rect(3, 15, 10, 1, "#18181e"); rect(3, 10, 1, 4, "#4a4a56");
    rect(2, 4, 12, 4, "#f2c14e"); rect(3, 3, 10, 1, "#f2c14e"); rect(5, 2, 6, 1, "#ffd86a"); [[3, 4], [7, 3], [11, 5], [5, 6], [9, 5]].forEach(function (q) { rect(q[0], q[1], 2, 1, "#fff2b0"); });
    rect(4, 5, 1, 1, "#c98a20"); rect(10, 6, 1, 1, "#c98a20"); rect(8, 0, 1, 2, "#ffffff"); rect(7, 1, 3, 1, "#fff2b0", 0.7);
  };
  block("rainbowglass", "Rainbow Glass", "#ff9ad0", "#ffffff", 0.6, function (rect) {
    var C = ["#ff5a6a", "#ff9a4a", "#ffd23f", "#6ae07a", "#4ea8ff", "#9a6aff"];
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) rect(x, y, 1, 1, C[Math.floor(((x + y) % 18) / 3) % 6], 0.6);
    rect(0, 0, 16, 1, "#2a2a30"); rect(0, 15, 16, 1, "#2a2a30"); rect(0, 0, 1, 16, "#2a2a30"); rect(15, 0, 1, 16, "#2a2a30"); rect(2, 2, 4, 1, "#ffffff", 0.6); rect(2, 2, 1, 4, "#ffffff", 0.6);
  }, 6, ["255,200,230", 1.8, 0.1]); FUN.push("rainbowglass");
  // ====================================================================================================
  // 7m. BLOOD MOON PACK: what you earn for surviving a Blood Moon (sandbox.js: BLOOD MOON). Blood Shards make a charm and a lantern.
  // ====================================================================================================
  mat("bloodshard", "Blood Shard", "#e8243a"); FUN.push("bloodshard");
  deco("bloodlantern", "Blood Moon Lantern", "#ff3a4a", function (rect) {
    rect(7, 0, 2, 2, "#3a1418"); rect(4, 2, 8, 2, "#5a1a22"); rect(4, 2, 8, 1, "#8a2a34"); rect(3, 4, 10, 9, "#ffb0b8", 0.3); rect(3, 4, 1, 9, "#5a1a22"); rect(12, 4, 1, 9, "#5a1a22");
    rect(6, 6, 4, 5, "#e8243a"); rect(5, 7, 6, 3, "#e8243a"); rect(7, 7, 2, 3, "#ffd0d4"); rect(6, 6, 1, 1, "#ff8a94"); rect(4, 13, 8, 2, "#5a1a22"); rect(5, 15, 6, 1, "#3a1418");
  }, 10, ["255,60,70", 2.8, 0.2]); small("bloodlantern"); FUN.push("bloodlantern");
  // ====================================================================================================
  // ---------------------------------------------------------------- 7n. DISCOVERIES (secret recipes, found by experimenting)
  // None of these are in any recipe list: mix three ingredients at a Cooking Pot or Brewing Stand (Experiment) to find them.
  // The dishes fill you up and give a potion effect (efx: [effect, seconds]); the tonics are potions (sandbox.js POTIONS).
  var DISC = [];
  function dfood(k, n, f, h, efx) { food(k, n, f, h, 1); ITEMS[k].efx = efx; ITEMS[k].disc = 1; DISC.push(k); }
  dfood("glowgoulash", "Glowshroom Goulash", 70, 30, ["glow", 240]);
  dfood("rainbowcake", "Rainbow Cake", 100, 60, ["luck", 300]);
  dfood("starpancakes", "Stardust Pancakes", 60, 25, ["leap", 240]);
  dfood("swampsushi", "Swamp Sushi", 55, 35, ["gill", 300]);
  dfood("emberpopcorn", "Ember Popcorn", 35, 12, ["fire", 240]);
  dfood("croakersoup", "Croaker's Secret Soup", 90, 50, ["regen", 90]);
  ["tonic_star", "tonic_titan", "tonic_zephyr", "tonic_blood"].forEach(function (k, i) { item(k, ["Starlight Elixir", "Titan Tonic", "Zephyr Draught", "Bloodmoon Brew"][i], { disc: 1 }); tr(k); DISC.push(k); });
  // the secret recipes: [station, three ingredients, result, how many, a riddle for the experiment window]
  var SECRETS = [
    ["cook", ["glowshroom", "rawmeat", "spore"], "glowgoulash", 1, "Something that glows, something that walked, something dug from the dark."],
    ["cook", ["prism", "carrotcake", "frostberry"], "rainbowcake", 1, "Catch a rainbow, bake it into something sweet, and top it with a cold berry."],
    ["cook", ["stardust", "duckegg", "goatmilk"], "starpancakes", 2, "Fallen sky, an egg, and something a goat gives you."],
    ["cook", ["catfish", "marshlily", "glowfin"], "swampsushi", 2, "Two fish from the swamp, rolled up with a flower."],
    ["cook", ["emberroot", "pepper", "cinder"], "emberpopcorn", 2, "Everything in it is hot. Very hot. It pops."],
    ["cook", ["redcap", "bogminnow", "swamptea"], "croakersoup", 1, "Old Croaker's favourite: a red mushroom, the smallest fish, and a cup of lily tea."],
    ["brew", ["bottle", "stardust", "moonstone"], "tonic_star", 1, "A bottle, a pinch of fallen star, and the pale stone of the frozen fen."],
    ["brew", ["bottle", "trolltusk", "tonic_brute"], "tonic_titan", 1, "Make a strong brew stronger with a tusk."],
    ["brew", ["bottle", "goldfeather", "springroot"], "tonic_zephyr", 1, "A golden feather and a root that bounces."],
    ["brew", ["bottle", "bloodshard", "leechfang"], "tonic_blood", 1, "Red from the Blood Moon, and the fang of something that drinks."]
  ];
  // ---------------------------------------------------------------- 7o. BIOME VARIANTS (sandbox-world.js gen: sub[x])
  // Each land has a second type: Cherry Blossom Vale (Murkwater), Sunbaked Shores (Ember Bog) and Dark Oakwood (Frostfen).
  // Their ground and wild plants. (New tiles go last, so every saved tile id stays the same.)
  block("sand", "Sand", "#e8cf94", "#f6e4b4", 0.35, function (rect, hh) {
    rect(0, 0, 16, 16, "#e2c88c"); for (var k = 0; k < 22; k++) rect(Math.floor(hh(k, 1, 3) * 16), Math.floor(hh(k, 2, 4) * 16), 1, 1, hh(k, 3, 5) > 0.5 ? "#f6e4b4" : "#c8aa6c");
    rect(2, 5, 4, 1, "#f0dca6", 0.8); rect(9, 11, 5, 1, "#f0dca6", 0.8); rect(0, 15, 16, 1, "#000", 0.12);
  }); TILES[T.X_sand].tier = 0;
  plant("blossom", "Cherry Blossom", "X_sakuratuft", "#ff9ad0", function (rect) {
    rect(7, 7, 1, 9, "#4f8a3c"); rect(4, 11, 1, 5, "#4f8a3c"); rect(11, 9, 1, 7, "#4f8a3c"); rect(3, 14, 3, 1, "#3f7a2f"); rect(9, 14, 4, 1, "#3f7a2f");
    [[7, 4], [4, 8], [11, 6]].forEach(function (q) { var x = q[0], y = q[1]; rect(x - 1, y, 3, 1, "#ff9ad0"); rect(x, y - 1, 1, 3, "#ff9ad0"); rect(x - 1, y - 1, 1, 1, "#ffc8e4"); rect(x + 1, y + 1, 1, 1, "#e86aa8"); rect(x, y, 1, 1, "#fff2a8"); });
    rect(13, 12, 1, 1, "#ffc8e4"); rect(2, 6, 1, 1, "#ffc8e4");
  });
  plant("cactus", "Cactus", "X_cactus", "#4fae5a", function (rect) {
    rect(6, 2, 4, 14, "#3f9a4a"); rect(7, 2, 2, 14, "#5cc066"); rect(7, 1, 2, 1, "#5cc066"); rect(6, 3, 1, 12, "#2c7a38");
    rect(2, 6, 2, 6, "#3f9a4a"); rect(2, 11, 4, 2, "#3f9a4a"); rect(3, 6, 1, 5, "#5cc066"); rect(12, 4, 2, 6, "#3f9a4a"); rect(10, 9, 4, 2, "#3f9a4a"); rect(12, 4, 1, 5, "#5cc066");
    [[5, 5], [10, 7], [5, 10], [10, 13], [1, 8], [14, 6]].forEach(function (q) { rect(q[0], q[1], 1, 1, "#f6f0d0"); }); rect(7, 0, 2, 1, "#ff7ab0"); rect(12, 3, 2, 1, "#ffd23f");
  });
  plant("seashell", "Seashell", "X_shelltuft", "#ffd0c0", function (rect) {
    rect(3, 11, 7, 4, "#ffd8c8"); rect(4, 10, 5, 1, "#ffe8dc"); rect(2, 14, 9, 1, "#e8a890"); rect(4, 11, 1, 4, "#e8a890"); rect(6, 10, 1, 5, "#e8a890"); rect(8, 11, 1, 4, "#e8a890"); rect(6, 15, 1, 1, "#c88870");
    rect(11, 12, 3, 3, "#9ad8ff"); rect(12, 11, 2, 1, "#c8ecff"); rect(12, 13, 1, 1, "#4a8ac8");
  });
  plant("fernfrond", "Fern", "X_ferntuft", "#3f8a4a", function (rect) {
    [[7, 1, 0], [3, 4, -1], [11, 4, 1], [2, 9, -1], [12, 9, 1]].forEach(function (q) { var x = q[0], y = q[1], d = q[2]; for (var k = 0; k < 7; k++) { var px = x + Math.round(d * k * 0.6), py = y + k; if (py > 15) break; rect(px, py, 1, 1, "#2f6a38"); if (k % 2 === 0) { rect(px - 1, py, 1, 1, "#4f9a50"); rect(px + 1, py, 1, 1, "#4f9a50"); } } });
    rect(7, 8, 1, 8, "#2a5a30"); rect(6, 15, 3, 1, "#1f4a26");
  });
  plant("duskcap", "Dusk Mushroom", "X_duskcaptuft", "#c98aff", function (rect) {
    rect(5, 9, 2, 7, "#d8cfc0"); rect(10, 11, 2, 5, "#d8cfc0"); rect(2, 6, 8, 3, "#5a3a7a"); rect(3, 5, 6, 1, "#7a52a0"); rect(3, 7, 1, 1, "#ffd8ff"); rect(7, 6, 1, 1, "#ffd8ff");
    rect(8, 9, 6, 2, "#6a4590"); rect(9, 8, 4, 1, "#8a62b8"); rect(10, 9, 1, 1, "#ffd8ff"); rect(0, 15, 16, 1, "#1f3a22");
  }, 3, ["200,140,255", 2, 0.1]);
  // ---------------------------------------------------------------- 7p. LANDMARKS (sandbox-world.js gen: world.marks; sandbox.js LANDMARKS)
  // Pieces of the new landmarks out in the world: stone circles with a Rune Altar, ruined camps, signposts, old mines, stone lanterns.
  block("standingstone", "Standing Stone", "#7a8088", "#a8b0b8", 2.2, function (rect, hh) {
    rect(2, 0, 12, 16, "#7a8088"); rect(3, 0, 10, 1, "#9aa2aa"); rect(2, 0, 1, 16, "#5a6068"); rect(13, 0, 1, 16, "#5a6068"); rect(4, 1, 2, 14, "#8e969e");
    for (var k = 0; k < 8; k++) rect(3 + Math.floor(hh(k, 1, 3) * 10), Math.floor(hh(k, 2, 4) * 16), 1, 1, hh(k, 3, 5) > 0.5 ? "#a8b0b8" : "#60666e");
    rect(7, 5, 2, 1, "#6a5aa8"); rect(6, 6, 1, 3, "#6a5aa8"); rect(9, 6, 1, 3, "#6a5aa8"); rect(7, 9, 2, 1, "#6a5aa8"); rect(2, 12, 4, 4, "#4f8a3c", 0.8); rect(11, 13, 3, 3, "#4f8a3c", 0.8); rect(0, 15, 16, 1, "#000", 0.18);
  }); TILES[T.X_standingstone].kind = "standingstone";
  deco("runealtar", "Rune Altar", "#b58cff", function (rect) {
    rect(1, 10, 14, 6, "#6a7078"); rect(1, 10, 14, 1, "#9aa2aa"); rect(2, 15, 12, 1, "#40464e"); rect(3, 8, 10, 2, "#80888f"); rect(3, 8, 10, 1, "#b0b8c0");
    rect(6, 2, 4, 6, "#5a4a9a"); rect(7, 1, 2, 1, "#8a72e0"); rect(6, 2, 1, 6, "#4a3a80"); rect(7, 3, 2, 4, "#c8b4ff"); rect(7, 4, 2, 2, "#ffffff");
    rect(4, 12, 2, 1, "#b58cff"); rect(10, 12, 2, 1, "#b58cff"); rect(7, 12, 2, 2, "#d8c8ff");
  }, 7, ["180,140,255", 3.2, 0.22]);
  deco("tent", "Camp Tent", "#c9a96a", function (rect) {
    for (var y = 0; y < 13; y++) { var hw = Math.round(y * 0.62); rect(8 - hw - 1, 2 + y, hw * 2 + 2, 1, y < 2 ? "#e8d0a0" : "#c9a96a"); rect(8 - hw - 1, 2 + y, 1, 1, "#8a6a3a"); rect(8 + hw, 2 + y, 1, 1, "#8a6a3a"); }
    for (var y2 = 6; y2 < 15; y2++) { var w2 = Math.round((y2 - 6) * 0.45); rect(8 - w2, y2, w2 * 2 + 1, 1, "#3a2a1a"); }
    rect(8, 0, 1, 3, "#6a4a2a"); rect(9, 0, 3, 2, "#d6382e"); rect(0, 15, 16, 1, "#5a4022"); rect(1, 14, 2, 1, "#6a4a2a"); rect(13, 14, 2, 1, "#6a4a2a");
  });
  deco("signpost", "Signpost", "#c58a52", function (rect) {
    rect(7, 2, 2, 14, "#7a5230"); rect(7, 2, 1, 14, "#9a6a3e"); rect(2, 3, 11, 4, "#c58a52"); rect(13, 4, 1, 2, "#c58a52"); rect(2, 3, 11, 1, "#dca36a"); rect(3, 5, 7, 1, "#5a3418");
    rect(4, 8, 11, 4, "#b07a44"); rect(3, 9, 1, 2, "#b07a44"); rect(4, 8, 11, 1, "#c58a52"); rect(6, 10, 7, 1, "#5a3418"); rect(6, 15, 4, 1, "#4a3018");
  });
  deco("minecart", "Mine Cart", "#7e8792", function (rect) {
    rect(1, 6, 14, 7, "#5a6068"); rect(1, 6, 14, 1, "#8a929a"); rect(1, 6, 1, 7, "#3a4048"); rect(14, 6, 1, 7, "#3a4048"); rect(3, 8, 10, 1, "#454b52");
    rect(3, 3, 3, 3, "#f2c14e"); rect(6, 2, 3, 4, "#a8b0ba"); rect(9, 3, 3, 3, "#d6382e"); rect(4, 3, 1, 1, "#fff2b0"); rect(7, 2, 1, 1, "#ffffff");
    rect(2, 13, 4, 3, "#2a2e34"); rect(10, 13, 4, 3, "#2a2e34"); rect(3, 14, 2, 1, "#8a929a"); rect(11, 14, 2, 1, "#8a929a");
  });
  deco("stonelantern", "Stone Lantern", "#ffd36a", function (rect) {
    rect(3, 1, 10, 2, "#8a9098"); rect(5, 0, 6, 1, "#a8b0b8"); rect(2, 3, 12, 1, "#6a7078"); rect(5, 4, 6, 4, "#70767e"); rect(6, 5, 4, 2, "#ffd36a"); rect(7, 5, 2, 1, "#fff4c0");
    rect(3, 8, 10, 1, "#6a7078"); rect(6, 9, 4, 4, "#80868e"); rect(4, 13, 8, 3, "#70767e"); rect(4, 13, 8, 1, "#9aa2aa"); rect(5, 9, 1, 4, "#5a6068");
  }, 6, ["255,210,120", 2.6, 0.18]);
  deco("paperlantern", "Paper Lantern", "#ff8ab8", function (rect) {
    rect(7, 0, 2, 3, "#3a2a1a"); rect(5, 3, 6, 1, "#3a2a1a"); rect(4, 4, 8, 8, "#ff7aa8"); rect(3, 5, 10, 6, "#ff7aa8"); rect(5, 5, 6, 6, "#ffb0cc"); rect(6, 6, 4, 4, "#ffe0ec");
    rect(4, 7, 8, 1, "#d84a80", 0.6); rect(4, 9, 8, 1, "#d84a80", 0.6); rect(5, 12, 6, 1, "#3a2a1a"); rect(7, 13, 2, 2, "#ffd23f");
  }, 6, ["255,150,190", 2.6, 0.18], "wall");
  // ---------------------------------------------------------------- 7q. SKY VILLAGE (sandbox-world.js gen step 9; sandbox.js SKY VILLAGE)
  // The Sky Vine climbs like a ladder from the ground up to the village. It is far too tough to cut.
  var SKYV = tile("X_skyvine", "Sky Vine", "#2f8a3a", "#5cc066", 99, 9, "", false, 2, "skyvine", { climb: 1, sway: 0 });
  ART.skyvine = function (rect, hh) {
    rect(6, 0, 4, 16, "#2f7a36"); rect(7, 0, 2, 16, "#4fae4a"); rect(7, 0, 1, 16, "#7ad06a"); rect(6, 3, 1, 3, "#1f5a26"); rect(9, 10, 1, 3, "#1f5a26");
    rect(2, 4, 4, 2, "#4fae4a"); rect(1, 5, 2, 1, "#7ad06a"); rect(10, 11, 4, 2, "#4fae4a"); rect(13, 12, 2, 1, "#7ad06a"); rect(3, 6, 3, 1, "#2f7a36"); rect(10, 13, 3, 1, "#2f7a36");
    rect(5, 1, 1, 1, "#9ae07a"); rect(10, 7, 1, 1, "#9ae07a"); rect(11, 6, 2, 1, "#ff9ad0"); rect(3, 13, 1, 1, "#fff2a8");
  };
  // ---------------------------------------------------------------- 7r. LORE (delve-lore.js pages; sandbox.js LORE)
  // Old Notes lie at landmarks and inside buildings: tap one to read a lost page. The Lore Lectern opens your page collection.
  // Each finished story thread gives one of the keepsakes below.
  deco("lorenote", "Old Note", "#e8d8a8", function (rect) {
    rect(2, 9, 12, 6, "#e8d8a8"); rect(2, 9, 12, 1, "#f6ecc8"); rect(1, 10, 1, 4, "#c8b480"); rect(14, 10, 1, 4, "#c8b480"); rect(1, 14, 14, 1, "#a8905a");
    rect(4, 11, 7, 1, "#6a5030"); rect(4, 13, 5, 1, "#6a5030"); rect(10, 12, 2, 2, "#c8302a"); rect(11, 13, 1, 1, "#ff6a5a");
  }, 2, ["255,230,170", 1.4, 0.12]); small("lorenote");
  deco("lectern", "Lore Lectern", "#a46c3c", function (rect) {
    rect(7, 7, 2, 8, "#7a5230"); rect(4, 15, 8, 1, "#5a3418"); rect(2, 4, 12, 3, "#a46c3c"); rect(2, 4, 12, 1, "#c58a52"); rect(3, 2, 5, 3, "#f4ead0"); rect(8, 2, 5, 3, "#e8dcc0"); rect(7, 2, 2, 3, "#a8905a");
    rect(4, 3, 3, 1, "#8a7050"); rect(9, 3, 3, 1, "#8a7050"); rect(11, 0, 1, 3, "#c8302a");
  });
  block("orderstone", "Order Stone", "#8a8f86", "#f2c14e", 2.0, function (rect, hh) {
    rect(0, 0, 16, 16, "#7e847c"); rect(0, 0, 16, 1, "#9aa098"); rect(0, 15, 16, 1, "#5a6058"); rect(1, 1, 14, 14, "#868c84");
    for (var k = 0; k < 6; k++) rect(1 + Math.floor(hh(k, 1, 3) * 14), 1 + Math.floor(hh(k, 2, 4) * 14), 1, 1, "#6a7068");
    rect(6, 3, 4, 1, "#f2c14e"); rect(5, 4, 1, 3, "#f2c14e"); rect(10, 4, 1, 3, "#f2c14e"); rect(6, 7, 4, 1, "#f2c14e"); rect(7, 8, 2, 4, "#f2c14e"); rect(5, 12, 6, 1, "#f2c14e"); rect(7, 5, 2, 2, "#fff4b0");
  }, 3, ["255,210,120", 1.6, 0.1]);
  block("mural", "Heart Mural", "#c8b48a", "#4ee6b4", 1.2, function (rect) {
    rect(0, 0, 16, 16, "#c8b48a"); rect(0, 0, 16, 1, "#e0d0a8"); rect(0, 15, 16, 1, "#8a7a5a"); rect(1, 1, 14, 14, "#2a4a5a");
    rect(1, 11, 14, 4, "#3a6a3a"); rect(6, 4, 4, 4, "#4ee6b4"); rect(5, 5, 6, 2, "#4ee6b4"); rect(7, 5, 2, 2, "#e8fff6"); rect(3, 3, 1, 1, "#f2c14e"); rect(12, 2, 1, 1, "#f2c14e"); rect(11, 8, 1, 1, "#ff9ad0");
    rect(3, 12, 1, 2, "#43c463"); rect(4, 11, 1, 1, "#43c463"); rect(12, 12, 1, 2, "#ff8a3d"); rect(8, 9, 1, 2, "#9fe8ff");
  });
  deco("croakerlamp", "Croaker's Old Lantern", "#4ee6b4", function (rect) {
    rect(7, 0, 2, 2, "#3a2a1a"); rect(4, 2, 8, 2, "#6a4a2a"); rect(4, 4, 8, 9, "#4ee6b4", 0.45); rect(4, 4, 1, 9, "#6a4a2a"); rect(11, 4, 1, 9, "#6a4a2a"); rect(6, 6, 4, 5, "#4ee6b4"); rect(7, 7, 2, 2, "#e8fff6");
    rect(4, 13, 8, 2, "#6a4a2a"); rect(5, 15, 6, 1, "#3a2a1a"); rect(12, 7, 2, 1, "#f2c14e");
  }, 9, ["80,240,190", 3.4, 0.2]);
  deco("dwarfstatue", "Toad Dwarf Statue", "#9aa098", function (rect) {
    rect(3, 13, 10, 3, "#6a7068"); rect(3, 13, 10, 1, "#8a9088"); rect(4, 6, 8, 7, "#8a9088"); rect(3, 3, 10, 4, "#9aa098"); rect(4, 2, 3, 2, "#9aa098"); rect(9, 2, 3, 2, "#9aa098"); rect(5, 2, 1, 1, "#40464e"); rect(10, 2, 1, 1, "#40464e");
    rect(5, 6, 6, 5, "#b0b6ae"); rect(7, 11, 2, 2, "#b0b6ae"); rect(3, 0, 10, 2, "#7a8088"); rect(7, 0, 2, 1, "#f2c14e");
  });
  deco("grimoire", "Hex Grimoire", "#6a3fc4", function (rect) {
    rect(2, 10, 12, 5, "#4a2a7a"); rect(2, 10, 12, 1, "#6a3fc4"); rect(3, 11, 10, 3, "#f4ead0"); rect(7, 11, 2, 3, "#c8b480"); rect(4, 12, 2, 1, "#6a3fc4"); rect(10, 12, 2, 1, "#6a3fc4");
    rect(6, 6, 4, 4, "#b06aff", 0.5); rect(7, 4, 2, 2, "#d8b8ff", 0.7); rect(8, 2, 1, 1, "#ffffff", 0.8);
  }, 4, ["180,110,255", 2, 0.12]); small("grimoire");
  deco("forgebanner", "Forgemaster's Banner", "#ff8a3d", function (rect) {
    rect(1, 0, 14, 2, "#5a3418"); rect(3, 2, 10, 11, "#c8301a"); rect(3, 13, 2, 2, "#c8301a"); rect(7, 13, 2, 3, "#c8301a"); rect(11, 13, 2, 2, "#c8301a");
    rect(6, 4, 4, 2, "#ffd23f"); rect(7, 6, 2, 4, "#ffd23f"); rect(5, 9, 6, 1, "#ffd23f"); rect(4, 3, 8, 1, "#ff6a4a");
  }, 0, null, "wall");
  deco("aurorajar", "Aurora Jar", "#9fe8ff", function (rect) {
    rect(5, 1, 6, 2, "#6a7a8a"); rect(4, 3, 8, 11, "#bfeeff", 0.35); rect(4, 3, 1, 11, "#8ab4c8"); rect(11, 3, 1, 11, "#8ab4c8"); rect(4, 14, 8, 2, "#6a7a8a");
    rect(5, 5, 6, 1, "#4ee6b4"); rect(5, 7, 6, 1, "#7fa8ff"); rect(5, 9, 6, 1, "#c06aff"); rect(5, 11, 6, 1, "#4ee6b4"); rect(6, 6, 1, 1, "#ffffff");
  }, 8, ["130,230,220", 3, 0.18]);
  deco("shipwheel", "Captain's Wheel", "#a46c3c", function (rect) {
    rect(7, 1, 2, 14, "#7a5230"); rect(1, 7, 14, 2, "#7a5230"); rect(3, 3, 2, 2, "#7a5230"); rect(11, 3, 2, 2, "#7a5230"); rect(3, 11, 2, 2, "#7a5230"); rect(11, 11, 2, 2, "#7a5230");
    rect(4, 4, 8, 8, "#c58a52"); rect(5, 5, 6, 6, "#7a5230"); rect(6, 6, 4, 4, "#dca36a"); rect(7, 7, 2, 2, "#f2c14e");
  }, 0, null, "wall");
  deco("zarukfig", "Zaruk Figurine", "#c06aff", function (rect) {
    rect(4, 14, 8, 2, "#4a3a6a"); rect(6, 8, 4, 6, "#d8a040"); rect(5, 5, 6, 4, "#e8b050"); rect(4, 4, 8, 3, "#a85a28"); rect(6, 6, 1, 1, "#14161c"); rect(9, 6, 1, 1, "#14161c");
    rect(1, 6, 4, 5, "#7a4aa8"); rect(11, 6, 4, 5, "#7a4aa8"); rect(0, 7, 2, 2, "#9a6ad8"); rect(14, 7, 2, 2, "#9a6ad8"); rect(5, 2, 1, 2, "#f2c14e"); rect(10, 2, 1, 2, "#f2c14e");
  }, 3, ["200,140,255", 1.8, 0.12]); small("zarukfig");
  deco("weathervane", "Sky Weathervane", "#d8c890", function (rect) {
    rect(7, 4, 2, 12, "#4a4f56"); rect(5, 15, 6, 1, "#3a3f46"); rect(2, 4, 12, 1, "#6a717a"); rect(2, 3, 3, 3, "#d8a040"); rect(11, 3, 4, 1, "#d8a040"); rect(13, 2, 1, 3, "#d8a040");
    rect(6, 1, 4, 2, "#f2c14e"); rect(9, 0, 2, 1, "#f2c14e"); rect(5, 7, 6, 1, "#6a717a"); rect(5, 7, 1, 2, "#6a717a"); rect(10, 7, 1, 2, "#6a717a");
  });
  // ---------------------------------------------------------------- 7s. INTERIOR PACK II: furniture made for one kind of building
  // (sandbox-cave.js INTERIOR UNIQUES puts them in their buildings; they can all be crafted at the Decor Workbench too)
  var FURN2 = [];
  function fd(k, n, c, art, o) { o = o || {}; deco(k, n, c, art, o.light || 0, o.gl || null, o.wall ? "wall" : "floor"); FURN2.push(k); if (o.flat) TILES[T["X_" + k]].rugish = 1; if (o.small) small(k); }
  // Reed Cabin
  fd("spinningwheel", "Spinning Wheel", "#a46c3c", function (R) { R(3, 2, 10, 10, "#7a5230"); R(4, 3, 8, 8, "#000", 0); R(5, 4, 6, 6, "#c58a52"); R(6, 5, 4, 4, "#7a5230"); R(7, 6, 2, 2, "#dca36a"); R(2, 12, 12, 2, "#7a5230"); R(3, 14, 2, 2, "#5a3418"); R(11, 14, 2, 2, "#5a3418"); R(12, 6, 3, 2, "#f4ead0"); R(13, 4, 1, 2, "#e8dcc0"); R(7, 1, 2, 1, "#5a3418"); });
  fd("rockingchair", "Rocking Chair", "#b07a44", function (R) { R(4, 1, 2, 11, "#8a5a30"); R(4, 1, 6, 2, "#a46c3c"); R(5, 3, 1, 6, "#c58a52"); R(7, 3, 1, 6, "#c58a52"); R(4, 8, 9, 2, "#a46c3c"); R(11, 6, 2, 4, "#8a5a30"); R(4, 10, 1, 3, "#8a5a30"); R(11, 10, 1, 3, "#8a5a30"); R(2, 13, 13, 1, "#5a3418"); R(1, 12, 2, 1, "#5a3418"); R(14, 12, 1, 1, "#5a3418"); R(5, 7, 6, 1, "#d6382e"); });
  fd("cuckooclock", "Cuckoo Clock", "#8a5a30", function (R) { R(4, 1, 8, 2, "#5a3418"); R(3, 3, 10, 1, "#5a3418"); R(4, 4, 8, 7, "#a46c3c"); R(6, 5, 4, 4, "#f4ead0"); R(7, 6, 1, 2, "#14161c"); R(8, 7, 1, 1, "#14161c"); R(7, 2, 2, 1, "#f2c14e"); R(6, 11, 1, 4, "#c8a040"); R(9, 11, 1, 3, "#c8a040"); R(5, 14, 3, 2, "#e8b84a"); R(8, 13, 3, 2, "#e8b84a"); }, { wall: 1 });
  // Old Watchtower
  fd("maptable", "Map Table", "#a46c3c", function (R) { R(1, 6, 14, 2, "#8a5a30"); R(2, 4, 12, 3, "#e8dcb0"); R(3, 5, 3, 1, "#4a8a5a"); R(8, 4, 4, 2, "#4a8a5a"); R(6, 5, 2, 1, "#3a6ab8"); R(10, 5, 1, 1, "#d6382e"); R(2, 8, 2, 7, "#7a5230"); R(12, 8, 2, 7, "#7a5230"); R(4, 12, 8, 1, "#7a5230"); R(13, 2, 1, 3, "#c8a040"); });
  fd("arrowbarrel", "Arrow Barrel", "#8a5a30", function (R) { R(3, 7, 10, 9, "#8a5a30"); R(3, 8, 10, 1, "#5a4a40"); R(3, 13, 10, 1, "#5a4a40"); R(4, 7, 1, 9, "#a46c3c"); [[4, 1], [6, 0], [8, 2], [10, 1], [11, 3]].forEach(function (q) { R(q[0], q[1] + 2, 1, 5, "#c8a070"); R(q[0] - 1, q[1], 3, 2, "#f4f0e0"); }); });
  fd("signalhorn", "Signal Horn", "#c8a040", function (R) { R(2, 7, 3, 3, "#5a3418"); R(5, 6, 3, 5, "#e8c46a"); R(8, 5, 3, 7, "#d8a040"); R(11, 3, 3, 11, "#c8902a"); R(12, 4, 1, 9, "#ffe08a"); R(4, 4, 2, 2, "#5a3418"); R(5, 3, 6, 1, "#5a3418"); }, { wall: 1 });
  // Swamp Farmstead
  fd("churn", "Butter Churn", "#c89a5a", function (R) { R(4, 5, 8, 11, "#c89a5a"); R(4, 6, 8, 1, "#7a5230"); R(4, 13, 8, 1, "#7a5230"); R(5, 5, 1, 11, "#dcb070"); R(5, 4, 6, 1, "#a46c3c"); R(7, 0, 2, 5, "#8a5a30"); R(6, 0, 4, 1, "#a46c3c"); R(9, 9, 2, 2, "#fff4c0"); });
  fd("seedsacks", "Seed Sacks", "#c8b48a", function (R) { R(1, 6, 7, 10, "#c8b48a"); R(2, 4, 5, 2, "#a8945a"); R(3, 3, 3, 1, "#8a7448"); R(8, 8, 7, 8, "#d8c49a"); R(9, 6, 5, 2, "#b8a46a"); R(2, 9, 4, 2, "#4fae4a"); R(10, 11, 3, 2, "#f2c14e"); R(3, 8, 2, 1, "#e8642a"); });
  fd("milkpail", "Milk Pail", "#a8b0ba", function (R) { R(3, 7, 10, 8, "#a8b0ba"); R(3, 7, 10, 2, "#f4f6f8"); R(4, 9, 1, 6, "#d4dce4"); R(3, 11, 10, 1, "#7e8792"); R(2, 15, 12, 1, "#5a6068"); R(4, 3, 8, 1, "#6a717a"); R(3, 4, 1, 3, "#6a717a"); R(12, 4, 1, 3, "#6a717a"); }, { small: 1 });
  fd("pitchfork", "Pitchfork Rack", "#a46c3c", function (R) { R(1, 2, 14, 2, "#7a5230"); R(4, 4, 1, 11, "#a46c3c"); R(10, 4, 1, 11, "#a46c3c"); R(2, 12, 5, 1, "#8a929c"); R(2, 13, 1, 3, "#8a929c"); R(4, 13, 1, 3, "#8a929c"); R(6, 13, 1, 3, "#8a929c"); R(8, 12, 5, 3, "#8a929c"); R(9, 13, 3, 1, "#c8d0d8"); }, { wall: 1 });
  // Cinder Forge and Turtle Smithy
  fd("grindstone", "Grindstone", "#8a9098", function (R) { R(3, 2, 10, 10, "#8a9098"); R(4, 3, 8, 8, "#a8aeb6"); R(7, 6, 2, 2, "#5a6068"); R(5, 4, 1, 1, "#c8ced4"); R(2, 12, 12, 2, "#7a5230"); R(3, 14, 2, 2, "#5a3418"); R(11, 14, 2, 2, "#5a3418"); R(13, 6, 3, 1, "#7a5230"); R(15, 5, 1, 3, "#5a3418"); R(10, 1, 2, 1, "#ffd36a"); R(12, 2, 1, 1, "#ffd36a"); });
  fd("bellows", "Forge Bellows", "#8a5a30", function (R) { R(2, 6, 9, 6, "#7a4a2a"); R(3, 5, 7, 1, "#5a3418"); R(3, 12, 7, 1, "#5a3418"); R(4, 7, 5, 4, "#9a6a3a"); R(11, 8, 4, 2, "#6a717a"); R(14, 7, 2, 4, "#8a929c"); R(1, 3, 2, 2, "#a46c3c"); R(1, 12, 2, 3, "#a46c3c"); R(6, 13, 2, 3, "#5a3418"); });
  fd("ingotpile", "Ingot Pile", "#a8b0ba", function (R) { R(1, 12, 6, 3, "#a8b0ba"); R(1, 12, 6, 1, "#e0e6ec"); R(8, 12, 6, 3, "#a8b0ba"); R(8, 12, 6, 1, "#e0e6ec"); R(4, 9, 6, 3, "#f2c14e"); R(4, 9, 6, 1, "#fff2b0"); R(6, 6, 5, 3, "#c87a4a"); R(6, 6, 5, 1, "#e8a070"); R(0, 15, 16, 1, "#000", 0.2); }, { small: 1 });
  fd("tongsrack", "Tongs Rack", "#5a6068", function (R) { R(1, 2, 14, 2, "#5a3418"); [[3, 0], [7, 1], [11, 0]].forEach(function (q) { R(q[0], 4, 1, 9, "#6a717a"); R(q[0] + 1, 4, 1, 9 - q[1], "#8a929c"); R(q[0] - 1, 12 - q[1], 4, 2, "#4a4f56"); }); }, { wall: 1 });
  // Ashen Keep
  fd("knightstatue", "Knight Statue", "#8a929c", function (R) { R(5, 1, 6, 5, "#a8b0ba"); R(6, 3, 4, 1, "#14161c"); R(7, 0, 2, 1, "#d6382e"); R(4, 6, 8, 6, "#8a929c"); R(5, 7, 6, 3, "#a8b0ba"); R(3, 6, 2, 6, "#7e8792"); R(11, 6, 2, 6, "#7e8792"); R(13, 1, 1, 12, "#c8d0d8"); R(12, 5, 3, 1, "#c8a040"); R(5, 12, 2, 3, "#7e8792"); R(9, 12, 2, 3, "#7e8792"); R(3, 15, 10, 1, "#5a6068"); });
  fd("warchest", "War Chest", "#5a3a30", function (R) { R(1, 6, 14, 9, "#5a3a30"); R(1, 6, 14, 3, "#7a4a3a"); R(1, 9, 14, 1, "#2a1a14"); R(3, 6, 1, 9, "#8a929c"); R(12, 6, 1, 9, "#8a929c"); R(7, 9, 2, 3, "#f2c14e"); R(2, 15, 12, 1, "#000", 0.25); R(5, 4, 6, 2, "#d6382e"); });
  fd("shieldwall", "Shield Display", "#d6382e", function (R) { R(4, 1, 8, 10, "#d6382e"); R(5, 11, 6, 2, "#d6382e"); R(6, 13, 4, 2, "#d6382e"); R(7, 15, 2, 1, "#d6382e"); R(4, 1, 8, 1, "#f2c14e"); R(7, 2, 2, 12, "#f2c14e"); R(5, 5, 6, 2, "#f2c14e"); R(1, 3, 2, 10, "#a8b0ba"); R(13, 3, 2, 10, "#a8b0ba"); }, { wall: 1 });
  // Frost Lodge and Snow Igloo
  fd("furrug", "Fur Rug", "#c8b8a0", function (R) { R(1, 4, 14, 9, "#c8b8a0"); R(0, 6, 1, 5, "#c8b8a0"); R(15, 6, 1, 5, "#c8b8a0"); R(2, 5, 12, 7, "#e0d4c0"); R(4, 6, 8, 5, "#f0e8d8"); R(1, 2, 3, 2, "#c8b8a0"); R(12, 2, 3, 2, "#c8b8a0"); R(1, 13, 3, 2, "#c8b8a0"); R(12, 13, 3, 2, "#c8b8a0"); }, { flat: 1 });
  fd("stovekettle", "Iron Stove", "#4a4f56", function (R) { R(2, 6, 12, 9, "#3a3f46"); R(2, 6, 12, 2, "#5a6068"); R(4, 9, 8, 4, "#1a1c20"); R(5, 10, 6, 2, "#ff8a3d"); R(6, 10, 4, 1, "#ffd36a"); R(11, 0, 2, 6, "#3a3f46"); R(4, 3, 5, 3, "#6a717a"); R(9, 4, 2, 1, "#6a717a"); R(5, 2, 3, 1, "#8a929c"); R(3, 15, 2, 1, "#1a1c20"); R(11, 15, 2, 1, "#1a1c20"); }, { light: 4, gl: ["255,140,60", 2, 0.14] });
  fd("snowshoes", "Snowshoes", "#a46c3c", function (R) { [[2, 0], [9, 1]].forEach(function (q) { R(q[0], 2 + q[1], 5, 12, "#a46c3c"); R(q[0] + 1, 3 + q[1], 3, 10, "#e8dcc0"); R(q[0] + 1, 6 + q[1], 3, 1, "#a46c3c"); R(q[0] + 1, 10 + q[1], 3, 1, "#a46c3c"); R(q[0] + 2, 3 + q[1], 1, 10, "#c8b48a"); }); R(6, 0, 4, 2, "#5a3418"); }, { wall: 1 });
  fd("icehole", "Ice Fishing Hole", "#9fe8ff", function (R) { R(2, 4, 12, 9, "#d8f0fc"); R(4, 5, 8, 7, "#1a4a7a"); R(5, 6, 6, 5, "#2a6aa0"); R(6, 7, 3, 1, "#8fd6ff"); R(12, 2, 1, 7, "#7a5230"); R(12, 9, 1, 3, "#e8e8e8", 0.6); }, { flat: 1 });
  fd("furpile", "Pile of Furs", "#a88a6a", function (R) { R(1, 9, 14, 6, "#8a6a4a"); R(2, 7, 11, 3, "#c8b8a0"); R(3, 5, 8, 3, "#6a5a4a"); R(4, 4, 5, 2, "#e8e0d0"); R(1, 15, 14, 1, "#000", 0.2); R(10, 10, 4, 2, "#a88a6a"); });
  // Frozen Shrine
  fd("offering", "Offering Bowl", "#c8d0e8", function (R) { R(5, 11, 6, 4, "#8a9ab8"); R(4, 15, 8, 1, "#5a6a88"); R(2, 7, 12, 4, "#c8d0e8"); R(2, 7, 12, 1, "#eef2ff"); R(4, 5, 3, 2, "#ff9ad0"); R(8, 4, 3, 3, "#9fe8ff"); R(9, 5, 1, 1, "#ffffff"); }, { light: 3, gl: ["160,220,255", 1.6, 0.1] });
  fd("prayerbell", "Prayer Bell", "#c8a040", function (R) { R(3, 0, 10, 2, "#7a5230"); R(3, 2, 1, 14, "#7a5230"); R(12, 2, 1, 14, "#7a5230"); R(7, 2, 2, 2, "#5a3418"); R(5, 4, 6, 7, "#d8a040"); R(4, 9, 8, 2, "#c8902a"); R(6, 5, 1, 4, "#ffe08a"); R(7, 11, 2, 2, "#8a6a2a"); R(2, 15, 12, 1, "#5a3418"); });
  fd("moonmirror", "Moon Mirror", "#c8d0e8", function (R) { R(3, 1, 10, 13, "#c8a040"); R(4, 2, 8, 11, "#a8c8e8"); R(5, 3, 3, 6, "#e8f4ff"); R(9, 9, 2, 2, "#f2f6ff"); R(6, 14, 4, 2, "#c8a040"); R(7, 0, 2, 1, "#f2c14e"); }, { wall: 1, light: 2, gl: ["200,230,255", 1.4, 0.08] });
  // Witch Hut
  fd("broom", "Witch's Broom", "#8a5a30", function (R) { R(9, 0, 2, 10, "#7a5230"); R(10, 0, 1, 10, "#9a6a3e"); R(6, 9, 8, 2, "#5a3a7a"); R(5, 11, 10, 5, "#c8a050"); R(6, 11, 1, 5, "#a8803a"); R(9, 11, 1, 5, "#a8803a"); R(12, 11, 1, 5, "#a8803a"); });
  fd("potionshelf", "Potion Shelf", "#4a3048", function (R) { R(1, 1, 14, 15, "#3a2438"); R(1, 5, 14, 1, "#5a3a58"); R(1, 10, 14, 1, "#5a3a58"); R(1, 15, 14, 1, "#5a3a58"); [[2, 2, "#4ee6b4"], [5, 3, "#c06aff"], [9, 2, "#ff6a5a"], [12, 3, "#f2c14e"], [3, 7, "#ff9ad0"], [7, 6, "#9fe8ff"], [11, 7, "#4ee6b4"], [4, 11, "#c06aff"], [9, 12, "#ff8a3d"]].forEach(function (q) { R(q[0], q[1], 2, 5 - (q[1] % 5 === 2 ? 0 : 1), q[2]); R(q[0], q[1] - 1, 2, 1, "#d8d0c0"); }); }, { light: 2, gl: ["190,110,255", 1.4, 0.08] });
  fd("spellscroll", "Spell Scroll", "#e8d8a8", function (R) { R(2, 1, 12, 2, "#8a6a3a"); R(3, 3, 10, 10, "#e8d8a8"); R(2, 13, 12, 2, "#8a6a3a"); R(5, 5, 6, 1, "#5a2a8a"); R(5, 7, 4, 1, "#5a2a8a"); R(7, 9, 3, 3, "#b06aff"); R(8, 10, 1, 1, "#ffffff"); }, { wall: 1 });
  // The Soggy Log Tavern
  fd("aletap", "Ale Barrel", "#8a5a30", function (R) { R(1, 4, 14, 10, "#8a5a30"); R(1, 4, 14, 1, "#a46c3c"); R(4, 4, 1, 10, "#5a4a40"); R(11, 4, 1, 10, "#5a4a40"); R(6, 6, 4, 4, "#a46c3c"); R(7, 7, 2, 2, "#5a3418"); R(7, 10, 2, 3, "#c8a040"); R(7, 13, 1, 1, "#ffd36a"); R(2, 14, 3, 2, "#5a3418"); R(11, 14, 3, 2, "#5a3418"); });
  fd("mugstack", "Stack of Mugs", "#c8a070", function (R) { [[2, 10], [8, 10], [5, 4]].forEach(function (q) { R(q[0], q[1], 5, 6, "#c8a070"); R(q[0], q[1], 5, 1, "#fff4d8"); R(q[0] + 5, q[1] + 1, 1, 3, "#a87a4a"); R(q[0] + 1, q[1] + 1, 1, 4, "#e0bc8a"); }); }, { small: 1 });
  fd("dartboard", "Dartboard", "#2a2a30", function (R) { R(3, 2, 10, 12, "#2a2a30"); R(2, 4, 12, 8, "#2a2a30"); R(4, 3, 8, 10, "#e8e0c8"); R(5, 4, 6, 8, "#d6382e"); R(6, 5, 4, 6, "#e8e0c8"); R(7, 7, 2, 2, "#3aa84e"); R(11, 5, 4, 1, "#c8a040"); R(14, 4, 1, 3, "#d6382e"); }, { wall: 1 });
  // Blossom Tea House
  fd("cushion", "Floor Cushion", "#d84a80", function (R) { R(2, 9, 12, 6, "#d84a80"); R(2, 9, 12, 2, "#f07aa8"); R(1, 11, 1, 3, "#c03a6a"); R(14, 11, 1, 3, "#c03a6a"); R(7, 11, 2, 2, "#f2c14e"); R(3, 15, 10, 1, "#000", 0.2); }, { small: 1 });
  fd("screen", "Paper Screen", "#f4ead0", function (R) { [0, 5, 10].forEach(function (x0) { R(x0, 1, 6, 15, "#5a2a1a"); R(x0 + 1, 2, 4, 13, "#f4ead0"); R(x0 + 1, 7, 4, 1, "#5a2a1a"); R(x0 + 3, 2, 1, 13, "#5a2a1a", 0.5); }); R(3, 4, 2, 2, "#ff9ad0"); R(12, 10, 2, 2, "#ff9ad0"); R(7, 3, 1, 1, "#ff9ad0"); });
  fd("fanart", "Painted Fan", "#ff9ad0", function (R) { for (var y = 0; y < 8; y++) R(8 - y, 2 + y, y * 2 + 1, 1, y % 2 ? "#ff9ad0" : "#f4ead0"); R(1, 10, 15, 1, "#5a2a1a"); R(7, 11, 2, 4, "#5a2a1a"); R(5, 4, 2, 2, "#d6382e"); R(10, 5, 2, 2, "#4fae4a"); }, { wall: 1 });
  // Sun Temple
  fd("goldidol", "Golden Idol", "#f2c14e", function (R) { R(4, 13, 8, 3, "#c8902a"); R(5, 5, 6, 8, "#f2c14e"); R(4, 1, 8, 5, "#ffd86a"); R(5, 3, 2, 1, "#d6382e"); R(9, 3, 2, 1, "#d6382e"); R(6, 5, 4, 1, "#c8902a"); R(3, 7, 2, 4, "#e8b84a"); R(11, 7, 2, 4, "#e8b84a"); R(6, 2, 1, 1, "#fff4b0"); }, { light: 4, gl: ["255,210,90", 2, 0.14] });
  fd("sarcophagus", "Sarcophagus", "#c8a46a", function (R) { R(1, 3, 14, 12, "#b8904e"); R(2, 4, 12, 10, "#d8b47a"); R(5, 5, 6, 3, "#f2c14e"); R(6, 6, 1, 1, "#14161c"); R(9, 6, 1, 1, "#14161c"); R(4, 8, 8, 5, "#4a8ab8"); R(5, 9, 6, 1, "#f2c14e"); R(5, 11, 6, 1, "#f2c14e"); R(1, 15, 14, 1, "#000", 0.25); });
  fd("sundisc", "Sun Disc", "#f2c14e", function (R) { R(4, 4, 8, 8, "#f2c14e"); R(5, 3, 6, 10, "#f2c14e"); R(3, 5, 10, 6, "#f2c14e"); R(6, 6, 4, 4, "#d6382e"); R(7, 7, 2, 2, "#ffe08a"); [[7, 0], [7, 14], [0, 7], [14, 7], [2, 2], [12, 2], [2, 12], [12, 12]].forEach(function (q) { R(q[0], q[1], 2, 2, "#e8a83a"); }); }, { wall: 1, light: 3, gl: ["255,200,90", 1.6, 0.1] });
  // Sky Village: Village Hall, Toad Dwarf Hold, Beaver Lumber Mill
  fd("hallbell", "Village Bell", "#c8a040", function (R) { R(1, 0, 14, 2, "#7a5230"); R(2, 2, 1, 14, "#7a5230"); R(13, 2, 1, 14, "#7a5230"); R(7, 2, 2, 1, "#5a3418"); R(4, 3, 8, 3, "#d8a040"); R(3, 6, 10, 5, "#c8902a"); R(2, 11, 12, 1, "#a87a20"); R(5, 4, 1, 6, "#ffe08a"); R(7, 12, 2, 2, "#6a4a1a"); R(1, 15, 14, 1, "#5a3418"); });
  fd("scrollshelf", "Scroll Shelf", "#8a5a30", function (R) { R(1, 1, 14, 15, "#5a3a20"); R(1, 5, 14, 1, "#8a5a30"); R(1, 10, 14, 1, "#8a5a30"); for (var y = 0; y < 3; y++) for (var x = 0; x < 4; x++) { R(2 + x * 3, 2 + y * 5, 3, 3, (x + y) % 2 ? "#e8d8a8" : "#f4ead0"); R(2 + x * 3, 3 + y * 5, 1, 1, "#c8302a"); } });
  fd("elderportrait", "Portrait of the Elder", "#8aa0b8", function (R) { R(2, 1, 12, 14, "#c8a040"); R(3, 2, 10, 12, "#3a5a6a"); R(7, 4, 2, 7, "#8aa0b8"); R(6, 3, 3, 2, "#8aa0b8"); R(9, 3, 3, 1, "#f2c14e"); R(5, 9, 6, 4, "#5a3fa8"); R(7, 9, 1, 4, "#f2c14e"); }, { wall: 1 });
  fd("gemcase", "Gem Display Case", "#a8c8e8", function (R) { R(1, 10, 14, 6, "#5a3a20"); R(1, 3, 14, 7, "#bfeeff", 0.35); R(1, 3, 14, 1, "#e8f8ff"); R(1, 3, 1, 7, "#8ab4c8"); R(14, 3, 1, 7, "#8ab4c8"); R(3, 7, 2, 2, "#d6382e"); R(6, 6, 2, 3, "#3a7ad8"); R(9, 7, 2, 2, "#c06aff"); R(12, 6, 1, 3, "#4ee6b4"); R(4, 12, 8, 1, "#c8a040"); }, { light: 2, gl: ["180,220,255", 1.4, 0.08] });
  fd("mushcrate", "Mushroom Crate", "#8a5a30", function (R) { R(1, 8, 14, 8, "#8a5a30"); R(1, 8, 14, 1, "#a46c3c"); R(1, 12, 14, 1, "#5a3418"); R(3, 4, 4, 4, "#d6382e"); R(4, 7, 2, 2, "#efe6cc"); R(8, 3, 4, 5, "#4ee6b4"); R(9, 7, 2, 2, "#d8c8f0"); R(12, 5, 3, 3, "#b17dff"); R(4, 5, 1, 1, "#fff"); }, { light: 2, gl: ["120,240,200", 1.4, 0.08] });
  fd("dwarfaxes", "Crossed Dwarf Axes", "#8a929c", function (R) { for (var k = 0; k < 12; k++) { R(2 + k, 2 + k, 1, 1, "#7a5230"); R(13 - k, 2 + k, 1, 1, "#7a5230"); } R(1, 1, 4, 4, "#a8b0ba"); R(11, 1, 4, 4, "#a8b0ba"); R(1, 1, 2, 1, "#e0e6ec"); R(13, 1, 2, 1, "#e0e6ec"); R(6, 6, 4, 4, "#c8a040"); R(7, 7, 2, 2, "#d6382e"); }, { wall: 1 });
  fd("sawbench", "Saw Bench", "#a46c3c", function (R) { R(1, 7, 14, 3, "#a46c3c"); R(1, 7, 14, 1, "#c58a52"); R(2, 10, 2, 6, "#7a5230"); R(12, 10, 2, 6, "#7a5230"); R(5, 2, 8, 5, "#c8d0d8"); R(5, 6, 8, 1, "#8a929c"); for (var x = 5; x < 13; x += 2) R(x, 7, 1, 1, "#8a929c"); R(12, 1, 3, 3, "#7a5230"); R(4, 12, 9, 1, "#7a5230"); });
  fd("logpile", "Log Pile", "#8a6450", function (R) { [[0, 11], [5, 11], [10, 11], [2, 6], [7, 6], [5, 1]].forEach(function (q) { R(q[0] + 1, q[1], 4, 5, "#6a4838"); R(q[0], q[1] + 1, 6, 3, "#6a4838"); R(q[0] + 1, q[1] + 1, 4, 3, "#dca36a"); R(q[0] + 2, q[1] + 2, 2, 1, "#a46c3c"); }); });
  fd("axerack", "Axe Rack", "#8a5a30", function (R) { R(1, 2, 14, 2, "#5a3418"); [[3, 1], [8, 0], [12, 1]].forEach(function (q) { R(q[0], 4, 1, 11, "#a46c3c"); R(q[0] + 1, 4 + q[1], 3, 4, "#a8b0ba"); R(q[0] + 3, 4 + q[1], 1, 4, "#e0e6ec"); }); }, { wall: 1 });
  // 8. RECIPES. RECIPES = Craft tab (stn = needs that crafting station within a few tiles); DECOR = Decor Workbench tab.
  // ====================================================================================================
  var STN = { furnace: "Stone Furnace", loom: "Weaver's Loom", mason: "Mason's Table", cook: "Cooking Pot", brew: "Brewing Stand" }, STNTILE = { furnace: "furnace", loom: "loom", mason: "masontable", cook: "cookpot", brew: "brewstand" };
  function R(id, n, out, cost, o) { var r = { id: id, n: n, out: out, cost: cost, d: (o && o.d) || "" }; if (o) Object.keys(o).forEach(function (k) { r[k] = o[k]; }); RECIPES.push(r); }
  R("x_trapdoor", "Swamp Trapdoor (2)", { trapdoor: 2 }, { planks: 3, fiber: 1 }, { d: "A wooden hatch for floors. Tap it or press F to open it, press down while standing on it to drop through, jump into it from below to climb up. It shuts behind you." });
  // blasting pack
  R("x_bomb", "Bog Bombs (3)", { bomb: 3 }, { sulfur: 1, charcoal: 2, clay: 1, fiber: 1 }, { bench: true, d: "Hold one and tap where to throw it. It bounces, then blows a hole in the ground and hurts anything close (you too!). Sulfur comes from the Ember Bog." });
  R("x_stickybomb", "Sticky Bombs (3)", { stickybomb: 3 }, { bomb: 3, slimeball: 1 }, { d: "A Bog Bomb wrapped in slime: it sticks to the first thing it hits, walls and ceilings included. Made by hand." });
  R("x_blastkeg", "Blast Keg", { blastkeg: 1 }, { bomb: 4, planks: 4, ironingot: 1 }, { bench: true, d: "A barrel packed with blasting powder. Place it, tap it (or press F) to light the fuse, and run. Clears a big hole." });
  R("x_firework", "Firework Rockets (4)", { firework: 4 }, { sulfur: 1, cloth: 1, stick: 2 }, { bench: true, d: "Hold one and tap: it whistles up into the sky and bursts into colour. Best at night." });
  // starfall pack
  R("x_starglass", "Starglass (4)", { starglass: 4 }, { glass: 4, stardust: 1 }, { stn: "furnace", d: "Deep blue glass full of tiny glowing stars. Gives a soft light. Stardust comes from Fallen Stars." });
  R("x_starrocket", "Star Rockets (4)", { starrocket: 4 }, { firework: 4, stardust: 1 }, { d: "Firework Rockets packed with Stardust: they burst into a golden star. Made by hand." });
  R("x_ch_star", "Wishing Star Charm", null, { starshard: 2, stardust: 4, rope: 1 }, { charm: "star", bench: true, d: "Falling stars come on every clear night and land closer to you." });
  // waystones
  R("x_waystone", "Waystone", { waystone: 1 }, { stone: 10, quartz: 2, amethyst: 1 }, { stn: "mason", d: "A standing stone you can travel between. Place two or more, then tap one to pick where to go. The camp and your bed are always on the list." });
  // adventurer's pack
  R("x_grapple", "Vine Grapple", { grapple: 1 }, { rope: 3, ironingot: 1, stick: 2, fiber: 4 }, { bench: true, d: "Hold it and tap a block up to 13 tiles away: the hook flies out, bites and reels you over. Tap again or jump to let go. It never wears out." });
  // playground pack
  R("x_bounceshroom", "Bounce Shroom (2)", { bounceshroom: 2 }, { redcap: 2, slimeball: 1, spore: 2 }, { bench: true, d: "A springy mushroom block. Land on it to bounce back up, higher each time. Hold down to land softly." });
  R("x_speedmoss", "Speed Moss (6)", { speedmoss: 6 }, { fiber: 2, spore: 2, slimeball: 1 }, { bench: true, d: "Slick glowing moss: you run much faster along it. Lay a track!" });
  // rainbow pack
  R("x_rainbowglass", "Rainbow Glass (4)", { rainbowglass: 4 }, { glass: 4, prism: 1 }, { stn: "furnace", d: "Glass striped with every colour of the rainbow. Rainbow Prisms come from a Pot of Gold at a rainbow's end." });
  // blood moon pack
  R("x_ch_blood", "Crimson Charm", null, { bloodshard: 5, ruby: 1, rope: 1 }, { charm: "blood", bench: true, d: "Your weapon hits 20% harder at night. Blood Shards come from surviving a Blood Moon." });
  // treats pack: charms (worn like the others), potions, meals
  R("x_ch_feather", "Feather Charm", null, { goldfeather: 2, fiber: 4, rope: 1 }, { charm: "feather", bench: true, bl: 2, d: "You never take fall damage. Golden Feathers turn up in chests and pots." });
  R("x_ch_spring", "Springroot Charm", null, { springroot: 3, frogfrag: 2, rope: 1 }, { charm: "spring", bench: true, bl: 2, d: "Jump 15% higher. Springroot is found in Murkwater chests and pots." });
  R("x_ch_leech", "Leech Fang Charm", null, { leechfang: 3, slimeball: 2, rope: 1 }, { charm: "leech", bench: true, bl: 2, d: "Every enemy your weapon hits heals you 2. Leech Fangs are found in Murkwater chests and pots." });
  R("x_ch_lode", "Lodestone Charm", null, { lodestone: 4, ironingot: 2, rope: 1 }, { charm: "lode", bench: true, bl: 3, d: "Ore you mine sometimes drops one extra. Lodestone hides in chests and pots below the surface." });
  R("x_ch_owl", "Owl Charm", null, { owlfeather: 3, moonstone: 1, rope: 1 }, { charm: "owl", bench: true, bl: 3, d: "See farther in the dark. Snowy Owl Feathers are found in Frostfen chests and pots." });
  R("x_ch_brute", "Ogre Charm", null, { trolltusk: 2, ironingot: 3, rope: 1 }, { charm: "brute", bench: true, bl: 4, d: "Your weapon hits 15% harder. Troll Tusks are found only in the deepest chests." });
  R("x_tonic_regen", "Mending Tonic", { tonic_regen: 1 }, { bottle: 1, mandrake: 1, marshlily: 2 }, { stn: "brew", d: "Health comes back steadily (3 a second) for 1 minute." });
  R("x_tonic_glow", "Glow Tonic", { tonic_glow: 1 }, { bottle: 1, glowshroom: 2, firefly: 1 }, { stn: "brew", d: "You glow and light up the dark around you for 5 minutes." });
  R("x_tonic_feather", "Featherfall Tonic", { tonic_feather: 1 }, { bottle: 1, batwing: 2, fiber: 2 }, { stn: "brew", d: "Fall slowly and take no fall damage for 3 minutes. Hold down to drop fast." });
  R("x_tonic_luck", "Fortune Tonic", { tonic_luck: 1 }, { bottle: 1, ancientcoin: 1, amber: 1 }, { stn: "brew", d: "Chests, pots and fished-up treasure sometimes give an extra find, for 5 minutes." });
  R("x_tonic_grow", "Growth Tonic", { tonic_grow: 1 }, { bottle: 1, earthworm: 2, carrot: 1 }, { stn: "brew", d: "Your crops grow 50% faster for 5 minutes." });
  R("x_tonic_gill", "Gillweed Tonic", { tonic_gill: 1 }, { bottle: 1, bogminnow: 2, fiber: 2 }, { stn: "brew", d: "Swim 60% faster for 4 minutes." });
  R("x_tonic_brute", "Brute Tonic", { tonic_brute: 1 }, { bottle: 1, rawmeat: 2, pepper: 2 }, { stn: "brew", d: "Your weapon hits 25% harder for 3 minutes." });
  R("x_tonic_grand", "Grand Healing Tonic", { tonic_grand: 1 }, { bottle: 1, mandrake: 1, starshard: 1, marshlily: 2 }, { stn: "brew", bl: 3, d: "Heals 100 health right away. Star Shards are found only in the deepest chests." });
  R("x_f_swampsalad", "Swamp Salad", { swampsalad: 1 }, { marshlily: 1, carrot: 1 }, { stn: "cook", d: "Fills 24 hunger and heals 6." });
  R("x_f_redcapsoup", "Redcap Soup", { redcapsoup: 1 }, { redcap: 2, potato: 1 }, { stn: "cook", d: "Fills 30 hunger and heals 8." });
  R("x_f_glowbroth", "Glowcap Broth", { glowbroth: 1 }, { glowshroom: 2, carrot: 1 }, { stn: "cook", d: "Fills 30 hunger and heals 12." });
  R("x_f_buttermash", "Buttered Mash", { buttermash: 1 }, { potato: 2, goatmilk: 1 }, { stn: "cook", d: "Fills 36 hunger and heals 8." });
  R("x_f_bogkebab", "Bog Kebab", { bogkebab: 1 }, { rawmeat: 1, pepper: 1, stick: 1 }, { stn: "cook", d: "Fills 38 hunger and heals 12." });
  R("x_f_emberkebab", "Ember Kebab", { emberkebab: 1 }, { cinderfish: 1, emberroot: 1, stick: 1 }, { stn: "cook", d: "Fills 42 hunger and heals 14." });
  R("x_f_carproll", "Crystal Carp Roll", { carproll: 1 }, { crystalcarp: 1, marshlily: 1 }, { stn: "cook", d: "Fills 44 hunger and heals 18." });
  R("x_f_eelcurry", "Magma Eel Curry", { eelcurry: 1 }, { magmaeel: 1, pepper: 2, potato: 1 }, { stn: "cook", bl: 2, d: "Fills 60 hunger and heals 24." });
  R("x_f_fishpie", "Fisherman's Pie", { fishpie: 1 }, { catfish: 1, potato: 2 }, { stn: "cook", d: "Fills 52 hunger and heals 18." });
  R("x_f_carrotcake", "Carrot Cake", { carrotcake: 1 }, { carrot: 3, duckegg: 1 }, { stn: "cook", d: "Fills 40 hunger and heals 12." });
  R("x_f_frostjam", "Frostberry Jam", { frostjam: 1 }, { frostberry: 3 }, { stn: "cook", d: "Fills 26 hunger and heals 8." });
  R("x_f_swamptea", "Marsh Lily Tea", { swamptea: 1 }, { marshlily: 2 }, { stn: "cook", d: "Fills only 10 hunger, but heals 20." });
  R("x_rope", "Rope (2)", { rope: 2 }, { fiber: 4 }, { d: "Twisted reed fibre. Used for looms, lanterns, trophies and tapestries." });
  R("x_candle", "Candles (4)", { candle: 4 }, { fiber: 2, peat: 1 }, { d: "A wick dipped in peat tallow. Used in candelabras and chandeliers." });
  R("x_dyered", "Red Dye (2)", { dyered: 2 }, { redcap: 2 }, { d: "Pressed Redcap Mushrooms. Colours stained glass and cloth." });
  R("x_dyered2", "Red Dye from Blossom", { dyered: 1 }, { blossom: 3 }, { d: "Pressed cherry blossom from the Cherry Blossom Vale." });
  R("x_dyegreen2", "Green Dye from Cactus", { dyegreen: 1 }, { cactus: 2 }, { d: "Cactus pulp from the Sunbaked Shores." });
  R("x_sandglass", "Glass from Sand (2)", { glass: 2 }, { sand: 3, charcoal: 1 }, { stn: "furnace", d: "Melt beach sand into clear glass." });
  R("x_fernfiber", "Fern Fiber (3)", { fiber: 3 }, { fernfrond: 2 }, { d: "Strip a fern from the Dark Oakwood into tough fiber." });
  R("x_dyeblue", "Blue Dye (2)", { dyeblue: 2 }, { frostbell: 2 }, { d: "Crushed Frostbells from the Frostfen." });
  R("x_dyegreen", "Green Dye (2)", { dyegreen: 2 }, { marshlily: 2 }, { d: "Marsh Lily stems boiled to a deep green." });
  R("x_mortar", "Mortar (2)", { mortar: 2 }, { silt: 3, clay: 1 }, { d: "Silt from lake beds mixed with clay. Holds bricks together." });
  R("x_furnace", "Stone Furnace", { furnace: 1 }, { stone: 20, clay: 6, pebble: 4 }, { bench: true, d: "Place it near camp, then tap it to open it: smelt Bog Iron, fire clay bricks and melt glowing blocks. Made at the Bog Workbench." });
  R("x_loom", "Weaver's Loom", { loom: 1 }, { planks: 10, stick: 6, rope: 2 }, { bench: true, d: "Place it, then tap it to open it and weave Bog Cotton into cloth. Made at the Bog Workbench." });
  R("x_mason", "Mason's Table", { masontable: 1 }, { planks: 8, stone: 10, pebble: 6 }, { bench: true, d: "Place it, then tap it to open it and cut stone, bricks and shingles into building blocks. Made at the Bog Workbench." });
  // farming and cooking
  R("x_farmland", "Garden Soil (4)", { farmland: 4 }, { mud: 4, leaves: 2 }, { d: "Rich tilled soil. Place it like a block, then plant seeds on top. Made by hand." });
  R("x_cookpot", "Cooking Pot", { cookpot: 1 }, { stone: 8, clay: 4, stick: 3 }, { bench: true, d: "Place it, then tap it to open it and cook meals that fill you up far more than raw food. Made at the Bog Workbench." });
  R("x_roastcarrot", "Roast Carrots", { roastcarrot: 1 }, { carrot: 2, stick: 1 }, { stn: "cook", d: "Fills 28 hunger and heals 6." });
  R("x_bakedpotato", "Baked Potato", { bakedpotato: 1 }, { potato: 2, stick: 1 }, { stn: "cook", d: "Fills 32 hunger and heals 6." });
  R("x_skewer", "Mushroom Skewer", { skewer: 1 }, { redcap: 2, stick: 1 }, { stn: "cook", d: "Wild Redcap Mushrooms grilled on a stick. Fills 22 hunger and heals 5." });
  R("x_grilledmeat", "Grilled Meat", { grilledmeat: 1 }, { rawmeat: 1, stick: 1 }, { stn: "cook", d: "Raw Meat comes from frogs, wolves and gators. Fills 40 hunger and heals 12." });
  R("x_chili", "Fire Pepper Chili", { chili: 1 }, { pepper: 2, potato: 1, rawmeat: 1 }, { stn: "cook", d: "Hot enough to make your eyes water. Fills 50 hunger and heals 18." });
  R("x_stew", "Swamp Stew", { stew: 1 }, { carrot: 1, potato: 1, redcap: 1, rawmeat: 1 }, { stn: "cook", d: "A hearty bowl of everything the swamp grows. Fills 65 hunger and heals 25." });
  R("x_berrypie", "Frostberry Tart", { berrypie: 1 }, { frostberry: 3, potato: 1 }, { stn: "cook", bl: 2, d: "Sweet and cold. Fills 60 hunger and heals 30. Needs a Glowspore Workbench (or better)." });
  R("x_feast", "Explorer's Feast", { feast: 1 }, { stew: 1, chili: 1, berrypie: 1 }, { stn: "cook", bl: 3, d: "A meal from all three lands. Fills you up completely and heals 60. Needs a Cinder Forge Workbench (or better)." });
  R("x_hoe1", "Reed Hoe", null, { stick: 3, fiber: 2, pebble: 2 }, { hoe: 1, d: "Tap grass or mud to till it into Garden Soil. Tap ripe crops to harvest them and replant. Made by hand." });
  R("x_hoe2", "Glowspore Hoe", null, { spore: 8, planks: 4, fiber: 2 }, { hoe: 2, bench: true, bl: 2, d: "Tills and harvests 3 tiles at a time. Needs a Glowspore Workbench." });
  R("x_hoe3", "Iron Hoe", null, { ironingot: 3, planks: 4, rope: 1 }, { hoe: 3, bench: true, bl: 3, d: "Tills and harvests 5 tiles at a time, and sometimes finds an extra crop. Needs a Cinder Forge Workbench." });
  R("x_bucket1", "Wooden Bucket", null, { planks: 4, fiber: 3 }, { bucket: 1, d: "Tap water to scoop a tile of it up, tap an empty space to pour it. Tip a full bucket onto crops to water three at once. Made by hand." });
  R("x_bucket2", "Iron Bucket", null, { ironingot: 3 }, { bucket: 2, bench: true, bl: 3, d: "Carries lava too. Needs a Cinder Forge Workbench." });
  R("x_net", "Bug Net", null, { stick: 3, fiber: 6 }, { net: 1, d: "On swamp nights, tap a firefly to catch it. Fireflies light up Firefly Jars and make great fishing bait. Made by hand." });
  R("x_rod1", "Reed Fishing Rod", null, { stick: 3, fiber: 4, pebble: 1 }, { rod: 1, d: "Pick it in the hotbar and tap water to cast. When the bobber dips and a ! shows, tap again to reel in. Works through Frostfen ice too. Made by hand." });
  R("x_rod2", "Ember Rod", null, { cinder: 6, ironingot: 1, rope: 2 }, { rod: 2, bench: true, bl: 2, d: "A heat-proof rod that can fish in lava for Magma Eels, Ember Koi and Cinderfish. Needs a Glowspore Workbench." });
  R("x_lure", "Bramble Lure", { lure_queen: 1 }, { bugfrag: 6, spore: 8, fiber: 6 }, { bench: true, bl: 2, d: "Use it in Murkwater Swamp to call the Bramble Queen. When she shudders she is about to charge: jump aside, then hit her while she's dazed." });
  R("x_idol", "Ember Idol", { idol_wyrm: 1 }, { cinder: 10, stinger: 4, ironingot: 2 }, { bench: true, bl: 3, d: "Use it in Ember Bog to wake the Magma Wyrm. Watch the dust: it bursts out where the ground cracks and glows." });
  R("x_horn", "Frost Horn", { horn_alpha: 1 }, { wolfpelt: 5, crystal: 6, batwing: 3 }, { bench: true, bl: 4, d: "Blow it in Frostfen to call the Frost Alpha. Jump its ice shards and watch the ground for falling icicles." });
  R("x_ch_bramble", "Bramble Charm", null, { queenchitin: 3, spore: 6, rope: 1 }, { charm: "bramble", bench: true, bl: 2, d: "Walk 15% faster. Worn from the top of your backpack." });
  R("x_ch_magma", "Magma Charm", null, { wyrmscale: 3, cinder: 6, rope: 1 }, { charm: "magma", bench: true, bl: 3, d: "Lava burns you 70% less." });
  R("x_ch_alpha", "Alpha Charm", null, { alphamane: 3, crystal: 4, rope: 1 }, { charm: "alpha", bench: true, bl: 4, d: "Jump a second time in mid-air." });
  R("x_ch_miner", "Miner's Charm", null, { amethyst: 2, ironingot: 3, rope: 1 }, { charm: "miner", bench: true, bl: 3, d: "Dig 25% faster." });
  R("x_ch_angler", "Angler's Charm", null, { glowfin: 1, catfish: 2, rope: 2 }, { charm: "angler", bench: true, bl: 2, d: "Fish bite 35% sooner, and rare fish are more common. Needs a Glowfin (a rare catch)." });
  R("x_ch_thumb", "Green Thumb Charm", null, { carrot: 6, potato: 4, pepper: 2, rope: 1 }, { charm: "thumb", bench: true, bl: 2, d: "Crops grow 25% faster." });
  R("x_ch_hearty", "Hearty Charm", null, { grilledmeat: 3, stew: 1, rope: 1 }, { charm: "hearty", bench: true, bl: 2, d: "Hunger drains 35% slower, and health comes back 20% faster." });
  R("x_ch_glow", "Firefly Charm", null, { firefly: 6, glass: 2, rope: 1 }, { charm: "glow", bench: true, bl: 2, d: "You glow softly, lighting up dark caves and nights around you. Catch fireflies with a Bug Net at night." });
  R("x_ch_tide", "Tidecaller Charm", null, { bogminnow: 4, catfish: 2, frosttrout: 1, rope: 1 }, { charm: "tide", bench: true, bl: 3, d: "Swim 60% faster." });
  R("x_ch_king", "Swampking Sigil", null, { queenchitin: 1, wyrmscale: 1, alphamane: 1, swamptoken: 8, rope: 1 }, { charm: "king", bench: true, bl: 4, d: "Hit bosses 25% harder and take 20% less damage from them. Made from all three boss trophies." });
  R("x_ch_lucky", "Lucky Clover", null, { swamptoken: 12, rope: 1 }, { charm: "lucky", bench: true, bl: 2, d: "Chests, pots and fished-up treasure sometimes give an extra find. Paid for with Croaker Tokens." });
  R("x_realmgate", "Realm Gate", { realmgate: 1 }, { realmshard: 6, frostrock: 16, ironingot: 6, crystal: 8 }, { bench: true, bl: 4, d: "A great stone arch. Place it in the open, then offer it the boss trophies, the three lights and 8 Realm Shards to wake it. Needs a Frost Workbench." });
  R("x_bow1", "Reed Slingshot", null, { stick: 3, fiber: 4 }, { bow: 1, d: "Shoots Pebbles. Damage 4. Pick it in the hotbar and tap toward a target. Made by hand." });
  R("x_bow2", "Bogwood Bow", null, { planks: 8, rope: 2, fiber: 6 }, { bow: 2, bench: true, d: "Shoots Arrows in a long arc. Damage 11 (17 with Fire Arrows). Needs the Reed Slingshot and a Workbench." });
  R("x_bow3", "Ember Longbow", null, { planks: 10, ironingot: 4, cinder: 8, ruby: 1 }, { bow: 3, bench: true, bl: 3, d: "A lava-veined longbow with a flat, fast shot. Damage 20 (26 with Fire Arrows). Needs a Cinder Forge Workbench." });
  R("x_arrow", "Arrows (6)", { arrow: 6 }, { stick: 2, pebble: 1, fiber: 1 }, { d: "Ammo for bows. Made by hand." });
  R("x_firearrow", "Fire Arrows (6)", { firearrow: 6 }, { arrow: 6, cinder: 1, sulfur: 1 }, { d: "+6 damage and sets the target burning for a few seconds. Bows use them before plain Arrows. Made by hand." });
  R("x_brewstand", "Brewing Stand", { brewstand: 1 }, { stone: 6, glass: 2, planks: 4 }, { bench: true, d: "Place it, then tap it to brew potions. Made at the Bog Workbench." });
  R("x_bottle", "Glass Bottles (3)", { bottle: 3 }, { glass: 1 }, { stn: "brew", d: "Every potion starts with one. You get the bottle back after drinking." });
  R("x_tonic_heal", "Healing Tonic", { tonic_heal: 1 }, { bottle: 1, marshlily: 2, redcap: 1 }, { stn: "brew", d: "Heals 40 health right away." });
  R("x_tonic_mine", "Miner's Draught", { tonic_mine: 1 }, { bottle: 1, glowshroom: 2, spore: 2 }, { stn: "brew", d: "Dig 40% faster for 3 minutes." });
  R("x_tonic_speed", "Swiftfoot Brew", { tonic_speed: 1 }, { bottle: 1, thistle: 2, carrot: 1 }, { stn: "brew", d: "Walk and swim 25% faster for 3 minutes." });
  R("x_tonic_night", "Night Eye Elixir", { tonic_night: 1 }, { bottle: 1, firefly: 2, frostbell: 1 }, { stn: "brew", d: "See much farther in the dark, in caves too, for 4 minutes." });
  R("x_tonic_fire", "Emberguard Potion", { tonic_fire: 1 }, { bottle: 1, emberroot: 2, pepper: 2 }, { stn: "brew", d: "Lava burns you 80% less for 3 minutes." });
  R("x_tonic_hide", "Ironhide Brew", { tonic_hide: 1 }, { bottle: 1, icecap: 2, frostberry: 2 }, { stn: "brew", d: "Take 20% less damage for 3 minutes." });
  R("x_tonic_leap", "Leaping Brew", { tonic_leap: 1 }, { bottle: 1, hexdust: 1, frogfrag: 1 }, { stn: "brew", d: "Jump 30% higher for 3 minutes. Hex Dust comes from Bog Witches." });
  R("x_tonic_fish", "Angler's Brew", { tonic_fish: 1 }, { bottle: 1, earthworm: 2, catfish: 1 }, { stn: "brew", d: "Fish bite 40% sooner for 5 minutes." });
  R("x_jeweltable", "Jeweler's Table", { jeweltable: 1 }, { stone: 8, planks: 4, quartz: 2 }, { bench: true, d: "Tap it to set gems into your weapon, armor, pick and bow. Each socket costs the gem and a Quartz Shard (from Geodes). Made at the Bog Workbench." });
  R("x_stain_walnut", "Walnut Stain (12)", { stain_walnut: 12 }, { wood: 2, mud: 1 }, { d: "A rich dark brown. Hold it and tap or drag across placed wood (Planks, doors, ladders, fences, wooden furniture and walls) to colour it. One use per block. Made by hand." });
  R("x_stain_ebony", "Ebony Stain (12)", { stain_ebony: 12 }, { wood: 1, charcoal: 1 }, { d: "Nearly black. Hold it and tap or drag across placed wood (Planks, doors, ladders, fences, wooden furniture and walls) to colour it. One use per block. Made by hand." });
  R("x_stain_honey", "Honey Oak Stain (12)", { stain_honey: 12 }, { wood: 2, marshlily: 1 }, { d: "A warm golden oak. Hold it and tap or drag across placed wood (Planks, doors, ladders, fences, wooden furniture and walls) to colour it. One use per block. Made by hand." });
  R("x_stain_mahogany", "Mahogany Stain (12)", { stain_mahogany: 12 }, { wood: 2, redcap: 1 }, { d: "A deep red-brown. Hold it and tap or drag across placed wood (Planks, doors, ladders, fences, wooden furniture and walls) to colour it. One use per block. Made by hand." });
  R("x_stain_white", "Whitewash (12)", { stain_white: 12 }, { clay: 2, pebble: 1 }, { d: "Pale, chalky white. Hold it and tap or drag across placed wood (Planks, doors, ladders, fences, wooden furniture and walls) to colour it. One use per block. Made by hand." });
  R("x_stain_sage", "Sage Stain (12)", { stain_sage: 12 }, { wood: 1, leaves: 3 }, { d: "A soft swampy green. Hold it and tap or drag across placed wood (Planks, doors, ladders, fences, wooden furniture and walls) to colour it. One use per block. Made by hand." });
  R("x_stain_blue", "Bog Blue Stain (12)", { stain_blue: 12 }, { wood: 1, frostbell: 1 }, { d: "A cool grey-blue. Hold it and tap or drag across placed wood (Planks, doors, ladders, fences, wooden furniture and walls) to colour it. One use per block. Made by hand." });
  R("x_stain_plum", "Plum Stain (12)", { stain_plum: 12 }, { wood: 1, thistle: 1 }, { d: "A dusky purple. Hold it and tap or drag across placed wood (Planks, doors, ladders, fences, wooden furniture and walls) to colour it. One use per block. Made by hand." });
  R("x_sandpaper", "Sandpaper (12)", { sandpaper: 12 }, { fiber: 2, pebble: 2 }, { d: "Hold it and tap stained wood to sand the stain off. Made by hand." });
  R("x_silkrope", "Silk Rope (3)", { rope: 3 }, { silk: 2 }, { d: "Spider Silk twists into strong rope. Made by hand." });
  R("x_cobweb", "Cobweb (2)", { cobweb: 2 }, { silk: 2 }, { d: "A dusty corner web for haunted houses and witchy builds. Hangs on a wall or ceiling. Made by hand." });
  R("x_homeshell", "Homeward Shell", { homeshell: 2 }, { pebble: 3, fiber: 2, spore: 1 }, { d: "Hold it and tap: after a moment you are carried home to your bed (or the camp). Each one works once. Made by hand." });
  R("x_sprinkler", "Sprinkler", { sprinkler: 1 }, { stone: 6, clay: 4, bogiron: 2 }, { bench: true, bl: 2, d: "Place it near your crops: everything within 3 tiles to each side stays watered and grows twice as fast. Needs a Glowspore Workbench." });
  R("x_fishtrap", "Fish Trap", { fishtrap: 1 }, { planks: 6, fiber: 6, stick: 4 }, { bench: true, d: "Put it on the bottom of a lake. It catches a fish every couple of minutes, up to 4. Tap it to empty it." });
  R("x_trough", "Feeding Trough", { trough: 1 }, { planks: 6, fiber: 2 }, { d: "Place it to make a pen. Tamed animals that come near it stay close to it. Made by hand." });
  R("x_grilledfish", "Grilled Fish", { grilledfish: 1 }, { bogminnow: 2, stick: 1 }, { stn: "cook", d: "Fills 30 hunger and heals 8." });
  R("x_fishchips", "Fish and Taters", { fishchips: 1 }, { catfish: 1, potato: 2 }, { stn: "cook", d: "Fills 45 hunger and heals 14." });
  R("x_catstew", "Catfish Stew", { catstew: 1 }, { catfish: 1, potato: 1, carrot: 1 }, { stn: "cook", d: "Fills 55 hunger and heals 20." });
  R("x_chowder", "Frost Trout Chowder", { chowder: 1 }, { frosttrout: 1, goatmilk: 1, potato: 1 }, { stn: "cook", d: "Fills 58 hunger and heals 22." });
  R("x_spicyeel", "Spicy Eel", { spicyeel: 1 }, { magmaeel: 1, pepper: 1 }, { stn: "cook", d: "Fills 52 hunger and heals 24." });
  R("x_omelette", "Swamp Omelette", { omelette: 1 }, { duckegg: 2, redcap: 1 }, { stn: "cook", d: "Fills 34 hunger and heals 10." });
  R("x_truffleroast", "Truffle Roast", { truffleroast: 1 }, { truffle: 1, rawmeat: 1, potato: 1 }, { stn: "cook", d: "Fills 62 hunger and heals 26." });
  R("x_milkshake", "Frostberry Shake", { milkshake: 1 }, { goatmilk: 1, frostberry: 2 }, { stn: "cook", d: "Fills 40 hunger and heals 16." });
  R("x_furcloth", "Fur Cloth (2)", { cloth: 2 }, { wolfpelt: 1 }, { stn: "loom", d: "Spin a Frost Wolf Pelt into two pieces of warm cloth." });
  R("x_slimetorch", "Slime Torches (8)", { torch: 8 }, { stick: 2, slimeball: 1 }, { d: "Sticks dipped in slime burn twice as long to make. Made by hand." });
  R("x_cloth", "Woven Cloth", { cloth: 1 }, { cotton: 3 }, { stn: "loom", d: "Soft cream cloth from Bog Cotton." });
  R("x_charcoal", "Charcoal (2)", { charcoal: 2 }, { wood: 3 }, { stn: "furnace", d: "Burn Wood down into Charcoal, so smelting iron never runs out." });
  R("x_ingot", "Iron Ingot", { ironingot: 1 }, { bogiron: 2, charcoal: 1 }, { stn: "furnace", d: "Smelt Bog Iron with Charcoal." });
  R("x_claybrick", "Fired Brick (4)", { claybrick: 4 }, { clay: 6, charcoal: 1 }, { stn: "furnace", d: "Fire raw clay into hard red bricks." });
  R("x_ironblock", "Iron Block", { ironblock: 1 }, { ironingot: 4 }, { stn: "furnace", d: "A riveted block of solid iron." });
  R("x_bars", "Iron Bars (4)", { ironbars: 4 }, { ironingot: 2 }, { stn: "furnace", d: "See-through bars for windows and cells." });
  R("x_amberblock", "Amber Block (2)", { amberblock: 2 }, { amber: 3, spore: 1 }, { stn: "furnace", d: "Warm, glowing amber melted into blocks." });
  R("x_amethystblock", "Amethyst Block (2)", { amethystblock: 2 }, { amethyst: 3, quartz: 1 }, { stn: "furnace", d: "Fused purple crystal. Glows softly." });
  R("x_rubylamp", "Ruby Lamp Block", { rubylamp: 1 }, { ruby: 3, ironingot: 1 }, { stn: "furnace", bl: 2, d: "A blazing red lamp you can build into walls. Needs a Glowspore Workbench." });
  R("x_sapphirelamp", "Sapphire Lamp Block", { sapphirelamp: 1 }, { sapphire: 3, ironingot: 1 }, { stn: "furnace", bl: 3, d: "A cold blue lamp block. Needs a Cinder Forge Workbench." });
  R("x_stainedred", "Red Stained Glass (2)", { stainedred: 2 }, { glass: 2, dyered: 1 }, { stn: "furnace", d: "A coloured window pane." });
  R("x_stainedblue", "Blue Stained Glass (2)", { stainedblue: 2 }, { glass: 2, dyeblue: 1 }, { stn: "furnace", d: "A coloured window pane." });
  R("x_stainedgreen", "Green Stained Glass (2)", { stainedgreen: 2 }, { glass: 2, dyegreen: 1 }, { stn: "furnace", d: "A coloured window pane." });
  R("x_redbrick", "Red Brick (4)", { redbrick: 4 }, { claybrick: 4, mortar: 1 }, { stn: "mason", d: "Classic red walls." });
  R("x_plaster", "Plaster Block (4)", { plasterblock: 4 }, { clay: 4, mortar: 1 }, { stn: "mason", d: "Smooth cream blocks for cottages." });
  R("x_cobble", "Cobblestone (4)", { cobble: 4 }, { stone: 4 }, { stn: "mason", d: "Rough rounded stones." });
  R("x_mossbrick", "Mossy Brick (4)", { mossbrick: 4 }, { brick: 4, leaves: 4 }, { stn: "mason", d: "Old bricks swallowed by moss." });
  R("x_parquet", "Parquet Floor (4)", { parquet: 4 }, { planks: 4, mortar: 1 }, { stn: "mason", d: "Polished wood in a woven pattern." });
  R("x_checker", "Checker Tile (4)", { checker: 4 }, { stone: 2, quartz: 1 }, { stn: "mason", d: "A black and cream floor." });
  R("x_shinglered", "Red Shingles (4)", { shinglered: 4 }, { claybrick: 3 }, { stn: "mason", d: "Overlapping clay tiles for a roof." });
  R("x_shingleblue", "Slate Shingles (4)", { shingleblue: 4 }, { stone: 3, dyeblue: 1 }, { stn: "mason", d: "Blue-grey slate for a roof." });
  R("x_quartzblock", "Quartz Block (2)", { quartzblock: 2 }, { quartz: 3 }, { stn: "mason", d: "Polished white quartz." });
  R("x_quartzpillar", "Quartz Pillar (2)", { quartzpillar: 2 }, { quartz: 3, mortar: 1 }, { stn: "mason", d: "A fluted column." });
  // builder's pack recipes
  R("x_nb_oakplanks", "Dark Oak Planks (4)", { oakplanks: 4 }, { planks: 4, charcoal: 1 }, { d: "Planks darkened with charcoal." });
  R("x_nb_birchplanks", "Birch Planks (4)", { birchplanks: 4 }, { planks: 4, sandpaper: 1 }, { d: "Pale planks sanded smooth." });
  R("x_nb_mangroveplanks", "Mangrove Planks (4)", { mangroveplanks: 4 }, { wood: 2, mud: 1 }, { d: "Reddish swamp timber." });
  R("x_nb_pineplanks", "Frostpine Planks (4)", { pineplanks: 4 }, { planks: 4, snow: 1 }, { d: "Golden planks cured in the cold." });
  R("x_nb_charredplanks", "Charred Planks (4)", { charredplanks: 4 }, { planks: 4, cinder: 1 }, { d: "Burnt black wood that still glows in the cracks." });
  R("x_nb_basketweave", "Basketweave Floor (4)", { basketweave: 4 }, { planks: 2, fiber: 2 }, { d: "Short boards laid in squares." });
  R("x_nb_bamboo", "Bamboo Block (4)", { bamboo: 4 }, { fiber: 4, stick: 2 }, { d: "Stalks bound side by side." });
  R("x_nb_wicker", "Wicker Block (4)", { wicker: 4 }, { fiber: 6 }, { d: "Woven reeds, light and cosy." });
  R("x_nb_logsiding", "Log Siding (4)", { logsiding: 4 }, { wood: 3 }, { d: "Stacked round logs, cabin style." });
  R("x_nb_woodpanel", "Oak Panelling (4)", { woodpanel: 4 }, { planks: 3, stick: 1 }, { d: "Dark upright boards." });
  R("x_nb_timberblock", "Timber Frame Block (4)", { timberblock: 4 }, { planks: 2, mortar: 1 }, { d: "Plaster between dark beams." });
  R("x_nb_cedarshakes", "Cedar Shakes (4)", { cedarshakes: 4 }, { planks: 3 }, { d: "Wooden roof shingles." });
  R("x_nb_sandbrick", "Sandstone Brick (4)", { sandbrick: 4 }, { silt: 2, mortar: 1 }, { stn: "mason", d: "Warm desert-coloured brick." });
  R("x_nb_mudbrick", "Mud Brick (4)", { mudbrick: 4 }, { mud: 4 }, { stn: "mason", d: "Sun-dried swamp brick." });
  R("x_nb_limestone", "Limestone Block (4)", { limestone: 4 }, { stone: 3, pebble: 2 }, { stn: "mason", d: "Long pale ashlar blocks." });
  R("x_nb_marble", "White Marble (2)", { marble: 2 }, { stone: 2, quartz: 1 }, { stn: "mason", d: "Veined white stone for grand halls." });
  R("x_nb_blackmarble", "Black Marble (2)", { blackmarble: 2 }, { obsidian: 1, amber: 1, stone: 1 }, { stn: "mason", d: "Dark stone with golden veins." });
  R("x_nb_granite", "Pink Granite (4)", { granite: 4 }, { stone: 3, dyered: 1 }, { stn: "mason", d: "Speckled rosy stone." });
  R("x_nb_andesite", "Polished Andesite (4)", { andesite: 4 }, { stone: 4, sandpaper: 1 }, { stn: "mason", d: "Smooth grey stone." });
  R("x_nb_slatetile", "Slate Tiles (4)", { slatetile: 4 }, { stone: 4, charcoal: 1 }, { stn: "mason", d: "Square dark tiles for floors." });
  R("x_nb_basalttile", "Basalt Tiles (4)", { basalttile: 4 }, { basalt: 4 }, { stn: "mason", d: "Square volcanic tiles." });
  R("x_nb_carvedstone", "Carved Stone (2)", { carvedstone: 2 }, { stone: 2, sandpaper: 1 }, { stn: "mason", d: "Dressed stone with a diamond carving." });
  R("x_nb_stonepillar", "Stone Pillar (2)", { stonepillar: 2 }, { stone: 3 }, { stn: "mason", d: "A fluted column that grows a capital and base." });
  R("x_nb_mossycobble", "Mossy Cobblestone (4)", { mossycobble: 4 }, { cobble: 4, leaves: 1 }, { stn: "mason", d: "Old stones with moss creeping over." });
  R("x_nb_frostcobble", "Frost Cobblestone (4)", { frostcobble: 4 }, { frostrock: 4 }, { stn: "mason", d: "Icy blue rounded stones." });
  R("x_nb_crackedbrick", "Cracked Stone Brick (4)", { crackedbrick: 4 }, { brick: 4, pebble: 1 }, { stn: "mason", d: "Weathered brick for ruins." });
  R("x_nb_bonebrick", "Bone Brick (4)", { bonebrick: 4 }, { bone: 4 }, { stn: "mason", d: "Pale brick for spooky builds." });
  R("x_nb_herringbone", "Herringbone Brick (4)", { herringbone: 4 }, { claybrick: 3 }, { stn: "mason", d: "Bricks laid in a zigzag." });
  R("x_nb_terracotta", "Terracotta (4)", { terracotta: 4 }, { clay: 3 }, { stn: "furnace", d: "Fired orange clay." });
  R("x_nb_tealtile", "Teal Glazed Tile (4)", { tealtile: 4 }, { clay: 2, dyegreen: 1 }, { stn: "furnace", d: "Shiny glazed tiles." });
  R("x_nb_ochretile", "Ochre Glazed Tile (4)", { ochretile: 4 }, { clay: 2, amber: 1 }, { stn: "furnace", d: "Shiny golden tiles." });
  R("x_nb_bluemosaic", "Blue Mosaic (4)", { bluemosaic: 4 }, { clay: 2, dyeblue: 1 }, { stn: "mason", d: "Little blue tiles." });
  R("x_nb_swampmosaic", "Swamp Mosaic (4)", { swampmosaic: 4 }, { clay: 2, dyegreen: 1 }, { stn: "mason", d: "Little green and gold tiles." });
  R("x_nb_rosemosaic", "Rose Mosaic (4)", { rosemosaic: 4 }, { clay: 2, dyered: 1 }, { stn: "mason", d: "Little pink tiles." });
  R("x_nb_claytiles", "Clay Roof Tiles (4)", { claytiles: 4 }, { claybrick: 2, clay: 1 }, { stn: "mason", d: "Curved tiles for a sunny roof." });
  R("x_nb_mossshingles", "Mossy Shingles (4)", { mossshingles: 4 }, { planks: 2, leaves: 2 }, { d: "A green roof for a swamp cottage." });
  R("x_nb_bogthatch", "Bog Reed Thatch (4)", { bogthatch: 4 }, { fiber: 3, peat: 1 }, { d: "Dark reed roofing." });
  R("x_nb_brassblock", "Brass Block", { brassblock: 1 }, { ironingot: 2, amber: 1 }, { stn: "furnace", d: "A warm riveted metal block." });
  R("x_nb_verdigris", "Verdigris Plate", { verdigris: 1 }, { ironingot: 2, dyegreen: 1 }, { stn: "furnace", d: "Old green metal plating." });
  R("x_nb_gildedblock", "Gilded Block", { gildedblock: 1 }, { amber: 3, ironingot: 1 }, { stn: "furnace", d: "A gleaming golden block." });
  R("x_nb_steelplate", "Dark Steel Plate", { steelplate: 1 }, { ironingot: 3, charcoal: 1 }, { stn: "furnace", d: "Heavy riveted plate." });
  R("x_nb_corrugated", "Corrugated Iron (4)", { corrugated: 4 }, { ironingot: 2 }, { stn: "furnace", d: "Ridged sheet metal for sheds." });
  R("x_nb_grate", "Iron Grate (4)", { grate: 4 }, { ironingot: 2 }, { stn: "furnace", d: "A lattice you can see and light through." });
  R("x_nb_clearglass", "Clear Glass (2)", { clearglass: 2 }, { glass: 2, sandpaper: 1 }, { stn: "furnace", d: "A nearly invisible pane." });
  R("x_nb_purpleglass", "Violet Stained Glass (2)", { purpleglass: 2 }, { glass: 2, amethyst: 1 }, { stn: "furnace", d: "A purple window pane." });
  R("x_nb_amberglass", "Amber Stained Glass (2)", { amberglass: 2 }, { glass: 2, amber: 1 }, { stn: "furnace", d: "A golden window pane." });
  R("x_nb_frostglass", "Frosted Glass (2)", { frostglass: 2 }, { glass: 2, snow: 1 }, { stn: "furnace", d: "A misty pane for privacy." });
  R("x_nb_sporelamp", "Spore Lamp Block", { sporelamp: 1 }, { spore: 3, glass: 1 }, { stn: "furnace", d: "A minty glowing block." });
  R("x_nb_paperlamp", "Paper Lantern Block", { paperlamp: 1 }, { cloth: 2, candle: 1, stick: 2 }, { stn: "loom", d: "A paper screen lit from inside." });
  R("x_nb_moonlamp", "Moonstone Lamp Block", { moonlamp: 1 }, { moonstone: 2, glass: 1 }, { stn: "furnace", d: "Cool silver light." });
  R("x_nb_fireflylamp", "Firefly Jar Block", { fireflylamp: 1 }, { firefly: 2, glass: 1 }, { d: "Fireflies in a glass block." });
  R("x_obsbrick", "Obsidian Brick (4)", { obsidianbrick: 4 }, { obsidian: 4 }, { stn: "mason", bl: 3, d: "Glossy black bricks. Needs a Cinder Forge Workbench." });
  R("x_permabrick", "Permafrost Brick (4)", { permabrick: 4 }, { permafrost: 4 }, { stn: "mason", d: "Frozen-hard blue bricks." });
  R("x_moonbrick", "Moonstone Brick (4)", { moonbrick: 4 }, { moonstone: 2, stone: 4 }, { stn: "mason", bl: 3, d: "Pale bricks that glow faintly at night. Needs a Cinder Forge Workbench." });

  function Dc(id, cat, n, out, cost, d, bl) { var r = { id: id, cat: cat, n: n, out: out, cost: cost, d: d }; if (bl) r.bl = bl; DECOR.push(r); }
  Dc("x_w_redbrick", "Back walls II", "Red Brick Wall (4)", { wall_redbrick: 4 }, { claybrick: 1 }, "A back wall of warm red brick.");
  Dc("x_w_quartz", "Back walls II", "Quartz Wall (4)", { wall_quartz: 4 }, { quartz: 1 }, "A pale polished back wall.");
  Dc("x_w_obsidian", "Back walls II", "Obsidian Wall (4)", { wall_obsidian: 4 }, { obsidian: 1 }, "A dark glossy back wall.", 3);
  Dc("x_w_frost", "Back walls II", "Frost Wall (4)", { wall_frost: 4 }, { permafrost: 1 }, "Icy blue panels for a cold hall.");
  Dc("x_w_amber", "Back walls II", "Amber Wall (4)", { wall_amber: 4 }, { amber: 1 }, "A honey-gold back wall.");
  Dc("x_w_stripe", "Back walls II", "Striped Wallpaper (4)", { wall_stripe: 4 }, { cloth: 1, dyegreen: 1 }, "Green and cream stripes for a parlour.");
  Dc("x_w_floral", "Back walls II", "Floral Wallpaper (4)", { wall_floral: 4 }, { cloth: 1, flower: 1 }, "Pink blossoms on pale green.");
  Dc("x_w_panel", "Back walls II", "Dark Wood Panelling (4)", { wall_panel: 4 }, { planks: 2, rope: 1 }, "Rich dark panels for a study.");
  Dc("x_w_cobble", "Back walls II", "Cobble Wall (4)", { wall_cobble: 4 }, { stone: 1 }, "Rough stone for cellars and caves.");
  Dc("x_sofa", "Furniture II", "Reed Sofa", { sofa: 1 }, { planks: 6, cloth: 3, fiber: 4 }, "A deep green sofa with soft cushions.");
  Dc("x_dresser", "Furniture II", "Dresser", { dresser: 1 }, { planks: 12, ironingot: 1, flower: 2 }, "Drawers with brass handles and a few flowers on top.");
  Dc("x_desk", "Furniture II", "Writing Desk", { desk: 1 }, { planks: 10, ironingot: 1, candle: 1 }, "A desk with paper, a quill and a candle.");
  Dc("x_harp", "Furniture II", "Swamp Harp", { harp: 1 }, { planks: 8, rope: 4, spore: 1 }, "Strings that sing with a faint green glow.");
  Dc("x_clock", "Furniture II", "Grandfather Clock", { clock: 1 }, { planks: 14, ironingot: 2, amber: 1 }, "A tall pendulum clock with a golden face.");
  Dc("x_globe", "Furniture II", "Old Globe", { globe: 1 }, { planks: 4, sapphire: 1, cloth: 1 }, "Seas, lands and a tiny red X.", 3);
  Dc("x_telescope", "Furniture II", "Brass Telescope", { telescope: 1 }, { ironingot: 2, quartz: 2, planks: 4 }, "For watching the stars over the swamp.");
  Dc("x_crate", "Garden & Curios", "Wooden Crate", { crate: 1 }, { planks: 8, ironingot: 1 }, "A nailed crate for the storeroom.");
  Dc("x_sack", "Garden & Curios", "Grain Sack", { sack: 1 }, { cloth: 2, rope: 1, fiber: 4 }, "A fat sack tied at the neck.");
  Dc("x_scarecrow", "Garden & Curios", "Scarecrow", { scarecrow: 1 }, { stick: 8, cloth: 2, fiber: 6, leaves: 4 }, "A friendly straw guard for your garden.");
  Dc("x_gravestone", "Garden & Curios", "Mossy Gravestone", { gravestone: 1 }, { stone: 10, leaves: 4 }, "Old stone with a cross carved in it.");
  Dc("x_totem", "Garden & Curios", "Swamp Totem", { totem: 1 }, { wood: 8, dyered: 1, dyegreen: 1, amber: 1 }, "Four carved faces stacked up a log.");
  Dc("x_snowman", "Frostfen Collection II", "Snowman", { snowman: 1 }, { snow: 12, stick: 2, emberroot: 1 }, "Hat, scarf and a carrot-coloured nose.", 3);
  Dc("x_obelisk", "Frostfen Collection II", "Moonstone Obelisk", { obelisk: 1 }, { moonstone: 4, frostrock: 8, permabrick: 4 }, "A tall pale spire that glows under the moon.", 4);
  Dc("x_weaponrack", "Armory Showpieces", "Weapon Rack", { weaponrack: 1 }, { planks: 10, ironingot: 2, rope: 2 }, "A spear, a sword and an axe on display.");
  Dc("x_armorstand", "Armory Showpieces", "Armor Stand", { armorstand: 1 }, { ironingot: 4, planks: 6, ruby: 1 }, "A suit of plate with a glowing ember crest.", 2);
  Dc("x_shield", "Armory Showpieces", "Wall Shield", { shield: 1 }, { ironingot: 2, planks: 4, dyeblue: 1 }, "A blue shield with a golden cross.");
  Dc("x_swords", "Armory Showpieces", "Crossed Swords", { crossedswords: 1 }, { ironingot: 4, rope: 1 }, "Two blades crossed over the hearth.");
  Dc("x_battrophy", "Armory Showpieces", "Dusk Bat Trophy", { battrophy: 1 }, { batwing: 3, planks: 2, rope: 1 }, "A Dusk Bat with spread wings on a plaque.");
  Dc("x_swampheart", "Legendary", "Heart of the Swamp", { swampheart: 1 }, { spore: 20, cinder: 12, crystal: 12, ruby: 2, sapphire: 2, moonstone: 2 }, "The light of all three lands bound in one crystal. Place it at your camp to restore the swamp.", 4);
  Dc("x_queencrown", "Armory Showpieces", "Bramble Crown", { queencrown: 1 }, { queenchitin: 2, planks: 2 }, "The Bramble Queen's crown on a stand. Proof you beat her.", 2);
  Dc("x_wyrmskull", "Armory Showpieces", "Wyrm Skull", { wyrmskull: 1 }, { wyrmscale: 2, planks: 2 }, "A Magma Wyrm skull, still warm. Hangs on a wall.", 3);
  Dc("x_alphapelt", "Armory Showpieces", "Alpha Pelt Banner", { alphapelt: 1 }, { alphamane: 2, rope: 1 }, "The Frost Alpha's pelt as a banner. Hangs on a wall.", 4);
  Dc("x_armorstand", "Armory Showpieces", "Armor Stand", { armorstand: 1 }, { planks: 6, stick: 4, fiber: 2 }, "A mannequin to show off your armor and a weapon. Tap it to dress it; hold to pick it up.");
  Dc("x_fireflyjar", "Lighting II", "Firefly Jar", { fireflyjar: 1 }, { glass: 1, firefly: 3 }, "Three fireflies in a glass jar. A soft green light that never burns out.");
  Dc("x_fishtrophy", "Armory Showpieces", "Mounted Fish", { fishtrophy: 1 }, { glowfin: 1, planks: 2, rope: 1 }, "A prize Glowfin on a plaque. It glows softly. Hangs on a wall.");
  Dc("x_wolftrophy", "Armory Showpieces", "Frost Wolf Trophy", { wolftrophy: 1 }, { wolfpelt: 3, planks: 2, rope: 1 }, "A snarling Frost Wolf head on a plaque. Hangs on a wall.");
  Dc("x_gatortrophy", "Armory Showpieces", "Bog Gator Trophy", { gatortrophy: 1 }, { gatorscale: 3, planks: 2, rope: 1 }, "A toothy Bog Gator head mounted on a plaque. Hangs on a wall.");
  Dc("x_waspnest", "Armory Showpieces", "Ember Wasp Nest", { waspnest: 1 }, { stinger: 2, fiber: 6, planks: 1 }, "An empty papery wasp nest (honest). Hangs on a wall.");
  Dc("x_slimejar", "Armory Showpieces", "Glowing Slime Jar", { slimejar: 1 }, { slimeball: 4, glass: 1 }, "A jar of wobbling slime that glows a soft green. A gentle light.");
  Dc("x_antlers", "Armory Showpieces", "Mounted Antlers", { antlers: 1 }, { bone: 4, planks: 2, rope: 1 }, "Antlers carved from old bone.");
  Dc("x_streetlamp", "Lighting II", "Iron Street Lamp", { streetlamp: 1 }, { ironingot: 3, glass: 1, candle: 2 }, "A tall lamp-post for your garden lane.");
  Dc("x_bonfire", "Lighting II", "Bonfire", { bonfire: 1 }, { wood: 8, charcoal: 3, torch: 2 }, "A roaring pile of logs. Very bright and warm.");
  Dc("x_candelabra", "Lighting II", "Candelabra", { candelabra: 1 }, { ironingot: 2, candle: 3 }, "Three flames on a golden stand.");
  Dc("x_lavalamp", "Lighting II", "Lava Lamp", { lavalamp: 1 }, { glass: 2, ruby: 1, sulfur: 2, ironingot: 1 }, "A slow red blob rises and sinks.", 2);
  Dc("x_mushlamp", "Lighting II", "Giant Mushroom Lamp", { mushlamp: 1 }, { glowshroom: 3, redcap: 1, clay: 2 }, "A glowing toadstool taller than a table.");
  Dc("x_hanginglantern", "Lighting II", "Hanging Lantern", { hanginglantern: 1 }, { ironingot: 1, candle: 1, rope: 1 }, "Hangs from a wall or a ceiling beam.");
  Dc("x_fairylights", "Lighting II", "Fairy Lights", { fairylights: 1 }, { rope: 2, glowshroom: 1, dyered: 1, dyeblue: 1 }, "A string of tiny coloured lights.");
  Dc("x_aquarium", "Curiosities", "Glowing Aquarium", { aquarium: 1 }, { glass: 4, silt: 4, marshlily: 1, planks: 4 }, "Two golden fish in a glowing tank.");
  Dc("x_mirror", "Curiosities", "Wall Mirror", { mirror: 1 }, { quartz: 2, amber: 1, ironingot: 1 }, "A gold-framed mirror for the hall.");
  Dc("x_worldmap", "Curiosities", "World Map", { worldmap: 1 }, { cloth: 2, dyered: 1, dyeblue: 1 }, "Swamp, bog and fen on one sheet.");
  Dc("x_wreath", "Curiosities", "Leaf Wreath", { wreath: 1 }, { leaves: 12, rope: 1, redcap: 1 }, "A ring of leaves with red berries.");
  Dc("x_tap_swamp", "Tapestries", "Swamp Tapestry", { tapestry_swamp: 1 }, { cloth: 3, dyegreen: 1, rope: 1 }, "A teal cloth with a glowing sprout.");
  Dc("x_tap_ember", "Tapestries", "Ember Tapestry", { tapestry_ember: 1 }, { cloth: 3, dyered: 1, emberroot: 1 }, "A rust-red cloth with a golden flame.", 2);
  Dc("x_tap_frost", "Tapestries", "Frost Tapestry", { tapestry_frost: 1 }, { cloth: 3, dyeblue: 1, frostbell: 1 }, "A deep blue cloth with a white snowflake.", 3);
  Dc("x_d_pottedfern", "Cosy corners", "Potted Fern", { pottedfern: 1 }, { pot: 1, leaves: 2 }, "A leafy fern in a clay pot.");
  Dc("x_d_cattailvase", "Cosy corners", "Cattail Vase", { cattailvase: 1 }, { clay: 2, fiber: 3 }, "Three cattails in a blue vase.");
  Dc("x_d_glowjar", "Cosy corners", "Glowcap Jar", { glowjar: 1 }, { glass: 1, glowshroom: 2 }, "Glowcaps growing in a jar. Gives a soft teal light.");
  Dc("x_d_hangingherbs", "Cosy corners", "Hanging Herbs", { hangingherbs: 1 }, { fiber: 3, marshlily: 1, stick: 1 }, "Bundles of herbs drying on a rail. Hangs on a wall.");
  Dc("x_d_stackedbooks", "Cosy corners", "Stack of Books", { stackedbooks: 1 }, { cloth: 2, planks: 1 }, "A wobbly pile of well-read books.");
  Dc("x_d_teaset", "Cosy corners", "Tea Set", { teaset: 1 }, { clay: 3, quartz: 1 }, "A teapot and cups on a tray.");
  Dc("x_d_skullcandle", "Cosy corners", "Skull Candle", { skullcandle: 1 }, { bone: 2, candle: 1 }, "A candle melted onto an old skull. Gives a warm light.");
  Dc("x_d_shipbottle", "Curiosities", "Ship in a Bottle", { shipbottle: 1 }, { bottle: 1, planks: 1, cloth: 1 }, "A tiny sailing ship. Nobody knows how it got in there.");
  Dc("x_d_gramophone", "Curiosities", "Gramophone", { gramophone: 1 }, { ironingot: 2, planks: 2, ancientcoin: 1 }, "A brass horn and a crank. Ancient Coins are found in chests and pots.", 2);
  Dc("x_d_frogidol", "Curiosities", "Frog Idol", { frogidol: 1 }, { stone: 4, amber: 1 }, "A stone frog with amber eyes.");
  Dc("x_d_bonepile", "Curiosities", "Bone Pile", { bonepile: 1 }, { bone: 5 }, "Somebody's leftovers.");
  Dc("x_d_crystalcluster", "Curiosities", "Crystal Cluster", { crystalcluster: 1 }, { crystal: 4, stone: 1 }, "Glowing ice-blue crystals.", 2);
  Dc("x_d_starchart", "Curiosities", "Star Chart", { starchart: 1 }, { cloth: 2, dyeblue: 1, starshard: 1 }, "A map of the night sky. Hangs on a wall. Star Shards come from the deepest chests.", 3);
  Dc("x_d_birdcage", "Curiosities", "Birdcage", { birdcage: 1 }, { ironingot: 1, goldfeather: 1 }, "A gilded cage with a little orange bird. Hangs on a wall.", 2);
  Dc("x_d_windchime", "Curiosities", "Bone Wind Chime", { windchime: 1 }, { bone: 3, rope: 1 }, "Clacks gently in the breeze. Hangs on a wall.");
  Dc("x_d_counter", "Kitchen", "Kitchen Counter (2)", { counter: 2 }, { planks: 3, stone: 2, mortar: 1 }, "A cabinet with a stone top. Line several up; small pieces stand on top.");
  Dc("x_d_countersink", "Kitchen", "Counter Sink", { countersink: 1 }, { counter: 1, ironingot: 1 }, "A counter with a basin and a tap.");
  Dc("x_d_counterstove", "Kitchen", "Counter Stove", { counterstove: 1 }, { counter: 1, ironingot: 2, cinder: 1 }, "A counter with a glowing iron stove top.");
  Dc("x_d_wallshelf", "Kitchen", "Wall Shelf (2)", { wallshelf: 2 }, { planks: 2, ironingot: 1 }, "Hangs on a wall or a back wall. Put small pieces in the tile above it to stand them on the shelf.");
  Dc("x_d_teapot", "Kitchen", "Copper Teapot", { teapot: 1 }, { ironingot: 1, amber: 1 }, "Sits nicely on a counter or a stove.");
  Dc("x_d_fruitbowl", "Kitchen", "Fruit Bowl", { fruitbowl: 1 }, { planks: 1, carrot: 1, frostberry: 1, pepper: 1 }, "A bowl of fresh fruit for the table.");
  Dc("x_d_cakestand", "Kitchen", "Cake Stand", { cakestand: 1 }, { ironingot: 1, carrotcake: 1 }, "A cake on a golden stand.");
  Dc("x_d_nightstand", "Tables & Tabletops", "Nightstand", { nightstand: 1 }, { planks: 4 }, "A small bedside cabinet. Small pieces stand on top.");
  Dc("x_d_sidetable", "Tables & Tabletops", "Round Side Table", { sidetable: 1 }, { planks: 3, stick: 1 }, "A little round table on one leg.");
  Dc("x_d_coffeetable", "Tables & Tabletops", "Coffee Table", { coffeetable: 1 }, { planks: 4 }, "A low table to put in front of a sofa.");
  Dc("x_d_tablecandle", "Tables & Tabletops", "Table Candle (2)", { tablecandle: 2 }, { candle: 2, ironingot: 1 }, "A candle in a brass holder. Gives a warm light.");
  Dc("x_d_oillamp", "Tables & Tabletops", "Oil Lamp", { oillamp: 1 }, { glass: 1, ironingot: 1, peat: 1 }, "A glass oil lamp. Lights up a room.");
  Dc("x_d_openbook", "Tables & Tabletops", "Open Book", { openbook: 1 }, { cloth: 1, planks: 1 }, "A book left open at a good bit.");
  Dc("x_d_inkquill", "Tables & Tabletops", "Ink & Quill", { inkquill: 1 }, { bottle: 1, batwing: 1, charcoal: 1 }, "For writing letters at your desk.");
  Dc("x_d_bonsai", "Tables & Tabletops", "Bonsai Tree", { bonsai: 1 }, { pot: 1, leaves: 3, wood: 1 }, "A tiny, patient tree.");
  Dc("x_d_starlantern", "Curiosities", "Star Lantern", { starlantern: 1 }, { glass: 1, ironingot: 1, stardust: 2 }, "A brass lantern with a captured star inside. Bright, and small enough for a table.");
  Dc("x_d_jukebox", "Music", "Swamp Jukebox", { jukebox: 1 }, { planks: 6, ironingot: 2, glass: 2, amber: 2 }, "Plays any Music Record you own, louder than a gramophone. Tap it to change the song.", 2);
  Dc("x_d_musicbox", "Music", "Music Box", { musicbox: 1 }, { planks: 2, ironingot: 1, amber: 1 }, "A wind-up box with a tiny dancer. Plays the Frostfen Lullaby. Fits on a table.");
  Dc("x_d_rec_waltz", "Music", "Record: Swamp Waltz", { rec_waltz: 1 }, { charcoal: 2, amber: 1 }, "A gentle three-step for the swamp. Other records turn up in chests and pots.");
  Dc("x_d_rec_starfall", "Music", "Record: Starfall Serenade", { rec_starfall: 1 }, { charcoal: 2, stardust: 3 }, "A dreamy song pressed with Stardust from a Fallen Star.");
  Dc("x_d_confetti", "Party", "Confetti Cannon", { confetti: 1 }, { cloth: 1, sulfur: 1, dyered: 1, dyeblue: 1 }, "Tap it for a big burst of confetti. Never runs out.");
  Dc("x_d_balloons", "Party", "Party Balloons", { balloons: 1 }, { cloth: 2, dyered: 1, rope: 1 }, "Three balloons on a weight, bobbing in the breeze.");
  Dc("x_d_bloodlantern", "Curiosities", "Blood Moon Lantern", { bloodlantern: 1 }, { bloodshard: 2, ironingot: 1, glass: 1 }, "A lantern with a shard of the Blood Moon inside. Glows deep red. Fits on a table.");
  // INTERIOR PACK II recipes (Decor Workbench > Curiosities)
  var F2COST = { spinningwheel: { planks: 4, fiber: 4 }, rockingchair: { planks: 5, cloth: 1 }, cuckooclock: { planks: 3, ironingot: 1, amber: 1 }, maptable: { planks: 4, cloth: 1, dyegreen: 1 }, arrowbarrel: { planks: 4, stick: 6 }, signalhorn: { amber: 2, ironingot: 1 },
    churn: { planks: 4, ironingot: 1 }, seedsacks: { cloth: 2, seed_carrot: 2 }, milkpail: { ironingot: 2 }, pitchfork: { planks: 2, ironingot: 2 }, grindstone: { stone: 8, planks: 2 }, bellows: { planks: 3, cloth: 2, ironingot: 1 }, ingotpile: { ironingot: 4, amber: 1 }, tongsrack: { ironingot: 3, planks: 1 },
    knightstatue: { stone: 10, ironingot: 2 }, warchest: { planks: 6, ironingot: 2, dyered: 1 }, shieldwall: { planks: 2, ironingot: 2, dyered: 1 }, furrug: { wolfpelt: 2 }, stovekettle: { ironingot: 5, stone: 4 }, snowshoes: { planks: 2, fiber: 4 }, icehole: { ice: 4 }, furpile: { wolfpelt: 1, cloth: 2 },
    offering: { crystal: 3, stone: 2 }, prayerbell: { planks: 3, amber: 2, ironingot: 1 }, moonmirror: { glass: 2, moonstone: 1, amber: 1 }, broom: { stick: 4, fiber: 6 }, potionshelf: { planks: 4, bottle: 4 }, spellscroll: { cloth: 1, hexdust: 1 },
    aletap: { planks: 6, ironingot: 1 }, mugstack: { planks: 2, clay: 2 }, dartboard: { planks: 2, cloth: 1, dyered: 1 }, cushion: { cloth: 2, dyered: 1 }, screen: { planks: 3, cloth: 3 }, fanart: { cloth: 1, stick: 2, dyered: 1 },
    goldidol: { amber: 6, ruby: 1 }, sarcophagus: { sand: 10, amber: 2, dyeblue: 1 }, sundisc: { amber: 4, ruby: 1 }, hallbell: { planks: 4, amber: 4, ironingot: 1 }, scrollshelf: { planks: 4, cloth: 3 }, elderportrait: { planks: 2, cloth: 1, dyeblue: 1 },
    gemcase: { planks: 3, glass: 2, quartz: 2 }, mushcrate: { planks: 3, redcap: 2, glowshroom: 2 }, dwarfaxes: { planks: 2, ironingot: 3 }, sawbench: { planks: 4, ironingot: 2 }, logpile: { wood: 6 }, axerack: { planks: 3, ironingot: 3 } };
  FURN2.forEach(function (k) { if (ITEMS[k]) Dc("x_d_" + k, "Curiosities", ITEMS[k].n, (function () { var o = {}; o[k] = 1; return o; })(), F2COST[k] || { planks: 4 }, "Furniture from the swamp's buildings, made for one kind of house."); });
  Dc("x_d_lectern", "Garden & Storage", "Lore Lectern", { lectern: 1 }, { planks: 4, candle: 1, cloth: 1 }, "A reading stand for the lost pages you collect. Tap it to open your Lore.");
  Dc("x_d_orderstone", "Garden & Storage", "Order Stone (4)", { orderstone: 4 }, { stone: 4, spore: 1 }, "Carved stone with the Lantern Order's sign, glowing faintly gold.");
  Dc("x_d_mural", "Garden & Storage", "Heart Mural (2)", { mural: 2 }, { clay: 2, dyered: 1, dyeblue: 1 }, "A painted tile showing the Heart of the Swamp over the three lands.");
  Dc("x_d_signpost", "Garden & Storage", "Signpost", { signpost: 1 }, { planks: 3, stick: 2 }, "Tap it to see which way the nearest landmarks, buildings and lands are.");
  Dc("x_d_stonelantern", "Garden & Storage", "Stone Lantern", { stonelantern: 1 }, { stone: 6, torch: 1 }, "A carved stone lantern from the Cherry Blossom Vale.");
  Dc("x_d_paperlantern", "Curiosities", "Paper Lantern", { paperlantern: 1 }, { cloth: 1, dyered: 1, torch: 1 }, "A glowing pink lantern that hangs on a wall.");
  Dc("x_d_tent", "Curiosities", "Camp Tent", { tent: 1 }, { cloth: 3, stick: 3, rope: 1 }, "A little canvas tent for a campsite.");
  Dc("x_d_minecart", "Curiosities", "Mine Cart", { minecart: 1 }, { ironingot: 3, planks: 2 }, "An old cart heaped with ore.");
  Dc("x_d_standingstone", "Garden & Storage", "Standing Stone (2)", { standingstone: 2 }, { stone: 8, spore: 1 }, "A tall carved stone for your own stone circle.");
  Dc("x_d_lilyvase", "Tables & Tabletops", "Vase of Lilies", { lilyvase: 1 }, { clay: 2, marshlily: 3 }, "Fresh marsh lilies in a painted vase.");

  // ====================================================================================================
  // 9. GOALS (checked by sandbox.js; they read the bag, so they unlock the moment you hold the thing)
  // ====================================================================================================
  function has(S, k) { return (S.inv[k] || 0) > 0; }
  GOALS.push(
    { id: "x_amber", n: "Amber Eyes", d: "Mine Amber from a swamp ore vein", f: function (S) { return has(S, "amber"); } },
    { id: "x_iron", n: "Iron Age", d: "Smelt an Iron Ingot in a Stone Furnace", f: function (S) { return has(S, "ironingot"); } },
    { id: "x_cloth", n: "Weaver", d: "Weave Cloth on a Loom", f: function (S) { return has(S, "cloth"); } },
    { id: "x_geode", n: "Geode Cracker", d: "Crack open a Geode", f: function (S) { return has(S, "quartz") || has(S, "amethyst"); } },
    { id: "x_fossil", n: "Fossil Hunter", d: "Dig up a Fossil", f: function (S) { return has(S, "fossil"); } },
    { id: "x_gems", n: "Gem Collector", d: "Hold an Ember Ruby, a Frost Sapphire and a Moonstone", f: function (S) { return has(S, "ruby") && has(S, "sapphire") && has(S, "moonstone"); } },
    { id: "x_mason", n: "Master Mason", d: "Cut Red Brick, Quartz and Obsidian Brick", f: function (S) { return has(S, "redbrick") && has(S, "quartzblock") && has(S, "obsidianbrick"); } },
    { id: "x_star", n: "Catch a Falling Star", d: "Mine a Fallen Star after it crashes down on a clear night", f: function (S) { return has(S, "stardust"); } },
    { id: "x_glass", n: "Stained Glass Window", d: "Make all three stained glass colours", f: function (S) { return has(S, "stainedred") && has(S, "stainedblue") && has(S, "stainedgreen"); } }
  );

  // ====================================================================================================
  // 10. WORLD POPULATION: new ores, loot and plants are added after the normal generator, using hash() only,
  //     and only by swapping plain natural blocks (stone, mud, ice ...), so every earlier tile, tree, hole and building stays put.
  // ====================================================================================================
  function populate(w) {
    var t = w.t, top = w.top, bio = w.bio, sub = w.sub, W = w.W, H = w.H, seed = w.seed, x, y, i, id, d;
    function cell(x2, y2, k, p, fill) { return hash(x2 >> 2, y2 >> 2, seed + k) < p && hash(x2, y2, seed + k + 1) < fill; }
    var solidAir = function (xx, yy) { return TILES[t[yy * W + xx]].solid; };
    for (x = 3; x < W - 3; x++) {
      var tp = top[x], b = bio[x];
      if (b === 0 && t[(tp - 1) * W + x] === T.WATER) { var bed = t[tp * W + x]; if (bed === T.MOSS || bed === T.MUD) { t[tp * W + x] = T.X_silt; if (t[(tp + 1) * W + x] === T.MUD && hash(x, 3, seed + 711) < 0.7) t[(tp + 1) * W + x] = T.X_silt; } }   // lake beds
      for (y = tp + 2; y < H - 6; y++) {
        i = y * W + x; id = t[i]; d = y - tp;
        if (id === T.AIR || id === T.WATER || id === T.LAVA) {
          if (id === T.AIR && d > 8 && y < H - 8 && solidAir(x, y + 1) && hash(x, y, seed + 700) < 0.022) t[i] = T.GLOWSHROOMTUFT;   // cave-floor mushrooms
          continue;
        }
        if (b === 0) {
          if (id === T.MUD && d >= 2 && d <= 5 && cell(x, y, 720, 0.22, 0.8)) t[i] = T.X_peat;
          else if (id === T.STONE && d >= 6 && cell(x, y, 730, 0.05, 0.7)) t[i] = T.AMBERORE;
          else if (id === T.STONE && d >= 14 && cell(x, y, 740, 0.05, 0.7)) t[i] = T.BOGIRONORE;
        } else if (b === 1) {
          if (id === T.BASALT && (t[i - 1] === T.LAVA || t[i + 1] === T.LAVA || t[i - W] === T.LAVA || t[i + W] === T.LAVA)) t[i] = T.X_obsidian;
          else if ((id === T.STONE || id === T.BASALT) && d >= 6 && cell(x, y, 750, 0.045, 0.7)) t[i] = T.SULFURORE;
          else if (id === T.STONE && d < 14 && cell(x, y, 760, 0.07, 0.75)) t[i] = T.SEAM;
          else if (id === T.BASALT && d >= 24 && cell(x, y, 770, 0.035, 0.7)) t[i] = T.RUBYORE;
        } else {
          if (id === T.ICE && d >= 3 && cell(x, y, 780, 0.16, 0.8)) t[i] = T.X_permafrost;
          else if (id === T.FROSTROCK && cell(x, y, 790, 0.04, 0.7)) t[i] = d >= 34 && hash(x >> 2, y >> 2, seed + 795) < 0.5 ? T.MOONORE : T.SAPPHIREORE;
        }
        if ((id === T.STONE || id === T.BASALT || id === T.FROSTROCK) && t[i] === id && y >= H - 36 && cell(x, y, 830, 0.05, 0.75)) t[i] = T.REALMORE;   // Realmstone: deep down, near the bedrock, in every land
        else if ((id === T.STONE || id === T.BASALT || id === T.FROSTROCK) && t[i] === id && d >= 12 && cell(x, y, 800, 0.022, 0.6)) t[i] = T.GEODE;
        else if ((id === T.STONE || id === T.CLAY) && t[i] === id && d >= 8 && cell(x, y, 810, 0.02, 0.6)) t[i] = T.FOSSILBLK;
        else if (d >= 10 && (id === T.STONE || id === T.BASALT || id === T.FROSTROCK) && t[i] === id && hash(x, y, seed + 820) < 0.0035) t[i] = T.CACHE;
      }
      // wild plants on the surface (only where the ground tile above is still empty air)
      var sy = tp - 1, gi = tp * W + x;
      if (sy > 1 && t[sy * W + x] === T.AIR && TILES[t[gi]].solid && t[gi] !== T.WATER) {
        var r = hash(x, 95, seed), gid = t[gi];
        if (sub && sub[x]) { if (b === 0 && r < 0.06) t[sy * W + x] = T.LILYTUFT; else if (b === 1 && r < 0.05 && gid !== T.X_sand) t[sy * W + x] = T.THISTLETUFT; else if (b === 2 && r < 0.07) t[sy * W + x] = T.REDCAPTUFT; }
        else if (b === 0) { if (r < 0.1) t[sy * W + x] = T.REDCAPTUFT; else if (r < 0.22 && gid === T.MOSS) t[sy * W + x] = T.COTTONTUFT; else if (r < 0.3) t[sy * W + x] = T.LILYTUFT; }
        else if (b === 1) { if (r < 0.08) t[sy * W + x] = T.EMBERROOTTUFT; else if (r < 0.16) t[sy * W + x] = T.THISTLETUFT; }
        else { if (r < 0.08) t[sy * W + x] = T.FROSTBELLTUFT; else if (r < 0.15) t[sy * W + x] = T.ICECAPTUFT; }
      }
    }
  }
  // ---------- CAVE LOOT ----------
  // loot(kind, biome, tier, rnd) -> [[item, count], ...]. kind "chest" (4-7 stacks) or "pot" (1-2 small stacks).
  // tier 0 = shallow, 1 = mid, 2 = deep (side-view caves: depth below the surface line; hole caves: the floor number).
  // Each entry: [item, min, max, weight, lowest tier]. Biome lists sit on top of the common list.
  var LOOT_ALL = [["torch", 3, 8, 6, 0], ["rope", 1, 3, 4, 0], ["candle", 2, 4, 3, 0], ["planks", 4, 10, 4, 0], ["pebble", 3, 6, 2, 0], ["charcoal", 1, 3, 3, 0], ["bone", 1, 3, 2, 0],
    ["ironingot", 1, 3, 3, 1], ["cloth", 1, 3, 2, 1], ["quartz", 1, 3, 2, 1], ["amethyst", 1, 2, 2, 1], ["glass", 2, 4, 1, 1], ["ironingot", 2, 5, 3, 2], ["amethyst", 2, 4, 2, 2],
    ["goldfeather", 1, 1, 1, 0], ["ancientcoin", 1, 3, 2, 1], ["lodestone", 1, 2, 2, 1], ["starshard", 1, 1, 1, 2], ["trolltusk", 1, 1, 1, 2], ["bomb", 1, 3, 2, 1], ["firework", 2, 4, 2, 0], ["rec_waltz", 1, 1, 1, 0], ["rec_caves", 1, 1, 1, 1], ["rec_stomp", 1, 1, 1, 2], ["treasuremap", 1, 1, 2, 0]];   // treats pack finds (+ blasting pack)
  var LOOT_B = [
    [["springroot", 1, 2, 2, 0], ["leechfang", 1, 2, 2, 0], ["mandrake", 1, 1, 1, 1], ["spore", 3, 8, 5, 0], ["clay", 3, 6, 3, 0], ["seed_carrot", 2, 4, 3, 0], ["seed_potato", 1, 3, 2, 0], ["bakedpotato", 1, 2, 1, 1], ["amber", 1, 3, 3, 0], ["bogiron", 2, 5, 3, 0], ["cotton", 2, 4, 2, 0], ["bugfrag", 1, 2, 2, 0], ["frogfrag", 1, 2, 2, 0], ["slimeball", 1, 3, 2, 0], ["gatorscale", 1, 2, 1, 1], ["moonstone", 1, 1, 1, 2]],
    [["mandrake", 1, 1, 1, 2], ["rec_jig", 1, 1, 1, 0], ["cinder", 3, 6, 5, 0], ["sulfur", 1, 3, 3, 0], ["seed_pepper", 2, 3, 3, 0], ["chili", 1, 1, 1, 1], ["emberroot", 1, 3, 2, 0], ["stinger", 1, 2, 2, 0], ["ruby", 1, 2, 2, 1], ["ruby", 2, 3, 2, 2], ["slimeball", 1, 3, 1, 0]],
    [["owlfeather", 1, 2, 2, 0], ["rec_lullaby", 1, 1, 1, 0], ["crystal", 2, 5, 5, 0], ["icecap", 1, 3, 2, 0], ["seed_frost", 2, 3, 3, 0], ["berrypie", 1, 1, 1, 1], ["frostbell", 1, 3, 2, 0], ["wolfpelt", 1, 2, 2, 0], ["sapphire", 1, 2, 2, 1], ["moonstone", 1, 2, 2, 1], ["sapphire", 2, 3, 2, 2]]
  ];
  function loot(kind, biome, tier, rnd) {
    rnd = rnd || Math.random; var pool = LOOT_ALL.concat(LOOT_B[biome] || LOOT_B[0]).filter(function (e) { return e[4] <= tier && ITEMS[e[0]]; }), tot = 0, out = {}, n, q;
    pool.forEach(function (e) { tot += e[3]; });
    function roll(small) { var r = rnd() * tot; for (q = 0; q < pool.length; q++) { r -= pool[q][3]; if (r <= 0) break; } var e = pool[Math.min(q, pool.length - 1)], c = e[1] + Math.floor(rnd() * (e[2] - e[1] + 1)); if (small) c = Math.max(1, Math.ceil(c / 2)); out[e[0]] = (out[e[0]] || 0) + c; }
    if (kind === "chest") { n = 4 + Math.floor(rnd() * 3) + (tier >= 2 ? 1 : 0); for (var k = 0; k < n; k++) roll(false); }
    else { if (rnd() < 0.25) out.pebble = 1 + Math.floor(rnd() * 3); n = rnd() < 0.35 ? 2 : 1; for (var k2 = 0; k2 < n; k2++) roll(true); }
    return Object.keys(out).map(function (k3) { return [k3, out[k3]]; });
  }
  function placeTreasure(w) {   // chests on flat cave floors (about one per 40 x 26 cell, if it has a good spot) and pots scattered along cave floors
    var t = w.t, top = w.top, W = w.W, H = w.H, seed = w.seed, x, y, i, gx, gy;
    function floorAt(xx, yy) { var i2 = yy * W + xx; return t[i2] === T.AIR && t[i2 - W] === T.AIR && TILES[t[i2 + W]].solid && yy > top[xx] + 8 && yy < H - 8; }
    for (gx = 0; gx < W; gx += 40) for (gy = 0; gy < H; gy += 26) {
      if (hash(gx, gy, seed + 900) > 0.42) continue;
      for (var tr = 0; tr < 24; tr++) {
        x = Math.min(W - 3, Math.max(3, gx + Math.floor(hash(gx + tr, gy, seed + 901) * 40))); var y0 = gy + Math.floor(hash(gx, gy + tr, seed + 902) * 26), done = false;
        for (y = y0; y < Math.min(H - 8, y0 + 12); y++) if (floorAt(x, y) && floorAt(x - 1, y) && floorAt(x + 1, y) && t[(y + 1) * W + x] !== T.LAVA) { t[y * W + x] = T.X_lootchest; done = true; break; }
        if (done) break;
      }
    }
    for (x = 3; x < W - 3; x++) for (y = top[x] + 9; y < H - 8; y++) {
      i = y * W + x; if (t[i] !== T.AIR || !TILES[t[i + W]].solid || hash(x, y, seed + 910) > 0.016) continue;
      t[i] = T.X_lootpot; if (hash(x, y, seed + 911) < 0.5 && t[i + 1] === T.AIR && TILES[t[i + 1 + W]].solid) t[i + 1] = T.X_lootpot;
    }
  }
  var origGen = SW.gen;
  if (SW.post) SW.post.push(function (w) { populate(w); placeTreasure(w); });   // per generated map (see ENDLESS WORLD in sandbox-world.js)
  else SW.gen = function (seed) { var w = origGen(seed); populate(w); placeTreasure(w); return w; };

  var api = { FURN2: FURN2, DISC: DISC, SECRETS: SECRETS, FUN: FUN, INTERIOR: INTERIOR, TREATS: TREATS, BPACK: BPACK, NEW: NEW, ART: ART, WALL_ART: WALL_ART, RECIPES: RECIPES, DECOR: DECOR, GOALS: GOALS, STN: STN, STNTILE: STNTILE, populate: populate, loot: loot, CROPS: CROPS, SEEDS: SEEDS, tileCount: nid };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SbxExtra = api;
})(typeof window !== "undefined" ? window : this);
