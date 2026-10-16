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
    var id = nid++; if (id > 255) throw new Error("too many tiles");
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

  // ====================================================================================================
  // 8. RECIPES. RECIPES = Craft tab (stn = needs that crafting station within a few tiles); DECOR = Decor Workbench tab.
  // ====================================================================================================
  var STN = { furnace: "Stone Furnace", loom: "Weaver's Loom", mason: "Mason's Table" }, STNTILE = { furnace: "furnace", loom: "loom", mason: "masontable" };
  function R(id, n, out, cost, o) { var r = { id: id, n: n, out: out, cost: cost, d: (o && o.d) || "" }; if (o) Object.keys(o).forEach(function (k) { r[k] = o[k]; }); RECIPES.push(r); }
  R("x_rope", "Rope (2)", { rope: 2 }, { fiber: 4 }, { d: "Twisted reed fibre. Used for looms, lanterns, trophies and tapestries." });
  R("x_candle", "Candles (4)", { candle: 4 }, { fiber: 2, peat: 1 }, { d: "A wick dipped in peat tallow. Used in candelabras and chandeliers." });
  R("x_dyered", "Red Dye (2)", { dyered: 2 }, { redcap: 2 }, { d: "Pressed Redcap Mushrooms. Colours stained glass and cloth." });
  R("x_dyeblue", "Blue Dye (2)", { dyeblue: 2 }, { frostbell: 2 }, { d: "Crushed Frostbells from the Frostfen." });
  R("x_dyegreen", "Green Dye (2)", { dyegreen: 2 }, { marshlily: 2 }, { d: "Marsh Lily stems boiled to a deep green." });
  R("x_mortar", "Mortar (2)", { mortar: 2 }, { silt: 3, clay: 1 }, { d: "Silt from lake beds mixed with clay. Holds bricks together." });
  R("x_furnace", "Stone Furnace", { furnace: 1 }, { stone: 20, clay: 6, pebble: 4 }, { bench: true, d: "Place it near camp. Standing next to it lets you smelt Bog Iron and fire clay bricks. Needs a Bog Workbench nearby." });
  R("x_loom", "Weaver's Loom", { loom: 1 }, { planks: 10, stick: 6, rope: 2 }, { bench: true, d: "Weave Bog Cotton into cloth. Needs a Bog Workbench nearby." });
  R("x_mason", "Mason's Table", { masontable: 1 }, { planks: 8, stone: 10, pebble: 6 }, { bench: true, d: "Cut stone, bricks and shingles into building blocks. Needs a Bog Workbench nearby." });
  R("x_cloth", "Woven Cloth", { cloth: 1 }, { cotton: 3 }, { stn: "loom", d: "Soft cream cloth from Bog Cotton." });
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
  Dc("x_antlers", "Armory Showpieces", "Mounted Antlers", { antlers: 1 }, { bone: 4, planks: 2, rope: 1 }, "Antlers carved from old bone.");
  Dc("x_streetlamp", "Lighting II", "Iron Street Lamp", { streetlamp: 1 }, { ironingot: 3, glass: 1, candle: 2 }, "A tall lamp-post for the village lane.");
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
    { id: "x_glass", n: "Stained Glass Window", d: "Make all three stained glass colours", f: function (S) { return has(S, "stainedred") && has(S, "stainedblue") && has(S, "stainedgreen"); } }
  );

  // ====================================================================================================
  // 10. WORLD POPULATION: new ores, loot and plants are added after the normal generator, using hash() only,
  //     and only by swapping plain natural blocks (stone, mud, ice ...), so every earlier tile, tree, hole, village and building stays put.
  // ====================================================================================================
  function populate(w) {
    var t = w.t, top = w.top, bio = w.bio, W = w.W, H = w.H, seed = w.seed, vil = w.village, x, y, i, id, d;
    function cell(x2, y2, k, p, fill) { return hash(x2 >> 2, y2 >> 2, seed + k) < p && hash(x2, y2, seed + k + 1) < fill; }
    var solidAir = function (xx, yy) { return TILES[t[yy * W + xx]].solid; };
    for (x = 3; x < W - 3; x++) {
      var tp = top[x], b = bio[x], inV = vil && x >= vil.f0 && x <= vil.f1;
      if (b === 0 && !inV && t[(tp - 1) * W + x] === T.WATER) { var bed = t[tp * W + x]; if (bed === T.MOSS || bed === T.MUD) { t[tp * W + x] = T.X_silt; if (t[(tp + 1) * W + x] === T.MUD && hash(x, 3, seed + 711) < 0.7) t[(tp + 1) * W + x] = T.X_silt; } }   // lake beds
      for (y = tp + 2; y < H - 6; y++) {
        i = y * W + x; id = t[i]; d = y - tp;
        if (id === T.AIR || id === T.WATER || id === T.LAVA) {
          if (id === T.AIR && d > 8 && y < H - 8 && solidAir(x, y + 1) && hash(x, y, seed + 700) < 0.022) t[i] = T.GLOWSHROOMTUFT;   // cave-floor mushrooms
          continue;
        }
        if (inV && d < 12) continue;
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
        if ((id === T.STONE || id === T.BASALT || id === T.FROSTROCK) && t[i] === id && d >= 12 && cell(x, y, 800, 0.022, 0.6)) t[i] = T.GEODE;
        else if ((id === T.STONE || id === T.CLAY) && t[i] === id && d >= 8 && cell(x, y, 810, 0.02, 0.6)) t[i] = T.FOSSILBLK;
        else if (d >= 10 && (id === T.STONE || id === T.BASALT || id === T.FROSTROCK) && t[i] === id && hash(x, y, seed + 820) < 0.0035) t[i] = T.CACHE;
      }
      // wild plants on the surface (only where the ground tile above is still empty air)
      var sy = tp - 1, gi = tp * W + x;
      if (sy > 1 && !inV && t[sy * W + x] === T.AIR && TILES[t[gi]].solid && t[gi] !== T.WATER) {
        var r = hash(x, 95, seed), gid = t[gi];
        if (b === 0) { if (r < 0.1) t[sy * W + x] = T.REDCAPTUFT; else if (r < 0.22 && gid === T.MOSS) t[sy * W + x] = T.COTTONTUFT; else if (r < 0.3) t[sy * W + x] = T.LILYTUFT; }
        else if (b === 1) { if (r < 0.08) t[sy * W + x] = T.EMBERROOTTUFT; else if (r < 0.16) t[sy * W + x] = T.THISTLETUFT; }
        else { if (r < 0.08) t[sy * W + x] = T.FROSTBELLTUFT; else if (r < 0.15) t[sy * W + x] = T.ICECAPTUFT; }
      }
    }
  }
  var origGen = SW.gen;
  SW.gen = function (seed) { var w = origGen(seed); populate(w); return w; };

  var api = { NEW: NEW, ART: ART, WALL_ART: WALL_ART, RECIPES: RECIPES, DECOR: DECOR, GOALS: GOALS, STN: STN, STNTILE: STNTILE, populate: populate, tileCount: nid };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SbxExtra = api;
})(typeof window !== "undefined" ? window : this);
