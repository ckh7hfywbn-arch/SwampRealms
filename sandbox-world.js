// ===== SwampRealms: Delve - world data and generator (Stage 1) =====
// Pure data + terrain generation, no DOM. Global: SbxWorld (also module.exports so it can be tested in Node).
// The same seed always builds the same world. Player edits are stored separately as a small diff (see sandbox.js).
(function (root) {
  "use strict";
  var W = 240, H = 110, SURF = 34;           // world size in tiles, and the average surface row
  var T = { AIR: 0, MOSS: 1, MUD: 2, CLAY: 3, STONE: 4, LOG: 5, LEAVES: 6, WATER: 7, BASALT: 8, LAVA: 9, ASH: 10, SNOW: 11, ICE: 12, FROSTROCK: 13, SPORE: 14, CINDER: 15, CRYSTAL: 16, BEDROCK: 17, PLANKS: 18, TORCH: 19, GLOWCAP: 20 };

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
  tile(T.LOG, "Swamp Log", "#6a4a2d", "#4a321d", 0.9, 1, "wood", true, 0, "log");
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
  tile(T.PLANKS, "Planks", "#a8703c", "#c98c4f", 0.8, 1, "planks", true, 0, "planks");
  tile(T.TORCH, "Torch", "#000", "#ffb13b", 0.05, 1, "torch", false, 13, "torch");
  tile(T.GLOWCAP, "Glowcap", "#000", "#4ee6b4", 0.1, 1, "spore", false, 6, "glowcap");

  // Items. tile = the block it places (undefined = material only).
  var ITEMS = {
    wood: { n: "Wood", tile: T.LOG }, mud: { n: "Mud", tile: T.MUD }, clay: { n: "Clay", tile: T.CLAY }, stone: { n: "Stone", tile: T.STONE },
    planks: { n: "Planks", tile: T.PLANKS }, torch: { n: "Torch", tile: T.TORCH }, leaves: { n: "Leaves", tile: T.LEAVES },
    snow: { n: "Snow", tile: T.SNOW }, ice: { n: "Ice", tile: T.ICE }, basalt: { n: "Basalt", tile: T.BASALT }, ash: { n: "Ash Soil", tile: T.ASH },
    frostrock: { n: "Frostrock", tile: T.FROSTROCK },
    spore: { n: "Glowspore", gem: "#4ee6b4" }, cinder: { n: "Cinder Shard", gem: "#ff8a3d" }, crystal: { n: "Frost Crystal", gem: "#bff4ff" }
  };
  var ITEM_ORDER = ["wood", "planks", "torch", "mud", "clay", "stone", "leaves", "ash", "basalt", "snow", "ice", "frostrock", "spore", "cinder", "crystal"];
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

  // ---------- generator ----------
  function gen(seed) {
    seed = (seed | 0) || 1;
    var t = new Uint8Array(W * H), top = new Int16Array(W), bio = new Uint8Array(W), rnd = mulberry(seed ^ 0x9e3779b9);
    var WL = SURF + 2, LAVAL = SURF + 5, ICEL = SURF + 3, x, y;
    // 1. surface height and biome per column
    for (x = 0; x < W; x++) {
      var hs = SURF + 1.5 + (fbm(x * 0.05, 0, seed, 3) - 0.5) * 13;
      var he = SURF - 2 + (fbm(x * 0.05, 3.3, seed + 5, 3) - 0.5) * 18;
      var hf = SURF - 1 + (fbm(x * 0.04, 7.7, seed + 9, 3) - 0.5) * 14;
      var w1 = smooth(72, 88, x), w2 = smooth(152, 168, x);
      var h = hs * (1 - w1) + (he * (1 - w2) + hf * w2) * w1;
      h = SURF + (h - SURF) * smooth(3, 12, Math.abs(x - 40));       // flat, dry start area around x = 40
      top[x] = Math.max(18, Math.min(60, Math.round(h)));
      var bx = x + (vnoise(x * 0.08, 0, seed + 3) - 0.5) * 14;
      bio[x] = bx < 80 ? 0 : bx < 160 ? 1 : 2;
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
            if (cave) id = y >= (b === 1 ? 70 : 92) ? T.LAVA : T.AIR;
          }
        }
        t[y * W + x] = id;
      }
    }
    // 3. swamp trees and glowcaps (a second pass guarantees enough Wood on every seed)
    function plant(x) {
      var tp2 = top[x], th = 4 + Math.floor(rnd() * 4), cy = tp2 - th;
      for (var dy = -2; dy <= 1; dy++) for (var dx = -2; dx <= 2; dx++) {
        if (dx * dx / 6.25 + dy * dy / 4.84 <= 1) { var lx = x + dx, ly = cy + dy; if (ly >= 0 && t[ly * W + lx] === T.AIR) t[ly * W + lx] = T.LEAVES; }
      }
      for (var k = 1; k <= th; k++) t[(tp2 - k) * W + x] = T.LOG;
    }
    var lastTree = -9, trees = [];
    for (x = 3; x < W - 3; x++) {
      if (bio[x] !== 0 || top[x] > WL) continue;
      if (x - lastTree > 4 && rnd() < 0.24) { lastTree = x; trees.push(x); plant(x); }
      else if (x - lastTree > 1 && rnd() < 0.16 && t[(top[x] - 1) * W + x] === T.AIR) t[(top[x] - 1) * W + x] = T.GLOWCAP;
    }
    for (x = 8; x < 76 && trees.length < 10; x += 3) {
      if (top[x] > WL || trees.some(function (q) { return Math.abs(q - x) < 5; })) continue;
      trees.push(x); plant(x);
    }
    return { W: W, H: H, seed: seed, t: t, top: top, bio: bio, spawn: { x: 40.5, y: top[40] } };
  }

  var api = { W: W, H: H, SURF: SURF, T: T, TILES: TILES, ITEMS: ITEMS, ITEM_ORDER: ITEM_ORDER, BIOMES: BIOMES, gen: gen, hash: hash, mulberry: mulberry };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SbxWorld = api;
})(typeof window !== "undefined" ? window : this);
