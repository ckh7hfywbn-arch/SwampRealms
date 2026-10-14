// ===== SwampRealms: Delve - world data and generator (Stage 1) =====
// Pure data + terrain generation, no DOM. Global: SbxWorld (also module.exports so it can be tested in Node).
// The same seed always builds the same world. Player edits are stored separately as a small diff (see sandbox.js).
(function (root) {
  "use strict";
  // World size in tiles and the average surface row. The world is 3x wider and a bit deeper than the first version, and you start in the MIDDLE:
  // Frostfen lies west (left), Murkwater Swamp is the home area, Ember Bog lies east (right). Each area is 240 tiles wide.
  var W = 720, H = 140, SURF = 34, WORLDVER = 3, B_FROST = 240, B_EMBER = 480, SPAWNX = 360;
  var T = { AIR: 0, MOSS: 1, MUD: 2, CLAY: 3, STONE: 4, LOG: 5, LEAVES: 6, WATER: 7, BASALT: 8, LAVA: 9, ASH: 10, SNOW: 11, ICE: 12, FROSTROCK: 13, SPORE: 14, CINDER: 15, CRYSTAL: 16, BEDROCK: 17, PLANKS: 18, TORCH: 19, GLOWCAP: 20, REED: 21, BLOOM: 22, SPIKE: 23, VINE: 24, BENCH: 25, BED: 26, DOOR_B: 27, DOOR_T: 28, DOORO_B: 29, DOORO_T: 30, LADDER: 31, CHEST: 32, HOLE: 33, CHAIR: 34, CHAIR_L: 35, TABLE: 36, PAINTING: 37 };

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
    spore: { n: "Glowspore", gem: "#4ee6b4" }, cinder: { n: "Cinder Shard", gem: "#ff8a3d" }, crystal: { n: "Frost Crystal", gem: "#bff4ff" },
    bugfrag: { n: "Bramble Fragment", frag: "bug" }, frogfrag: { n: "Frog Fragment", frag: "frog" },   // enemy loot, same names as the Adventure Fragments
    batwing: { n: "Bat Wing", frag: "bat" }   // Dusk Bat loot (Delve only: the Adventure has no bat Fragment, so Fragments.add ignores it)
  };
  var ITEM_ORDER = ["stick", "fiber", "pebble", "wood", "planks", "bench", "bed", "door", "ladder", "chest", "chair", "table", "painting", "torch", "mud", "clay", "stone", "leaves", "ash", "basalt", "snow", "ice", "frostrock", "spore", "cinder", "crystal", "bugfrag", "frogfrag", "batwing"];
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
      var wE = smooth(B_EMBER - 8, B_EMBER + 8, x), wF = 1 - smooth(B_FROST - 8, B_FROST + 8, x);
      var h = hs * (1 - wE - wF) + he * wE + hf * wF;
      h = SURF + (h - SURF) * smooth(3, 12, Math.abs(x - SPAWNX));   // flat, dry start area around the spawn
      top[x] = Math.max(18, Math.min(60, Math.round(h)));
      var bx = x + (vnoise(x * 0.08, 0, seed + 3) - 0.5) * 14;
      bio[x] = bx < B_FROST ? 2 : bx < B_EMBER ? 0 : 1;   // west Frostfen, middle Murkwater, east Ember Bog
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
    // 5. cave holes: a few little burrows on dry ground in every area (hash-based again, so terrain and trees never change).
    // One lies a short walk from the spawn so every world has a cave to find; the rest are spread about 36 columns apart.
    var holes = [];
    function holeOk(hx) {
      if (hx < 8 || hx >= W - 8) return false;
      var sy = top[hx] - 1; if (sy < 3 || !TILES[t[top[hx] * W + hx]].solid) return false;
      var g0 = t[sy * W + hx]; if (g0 !== T.AIR && g0 !== T.REED && g0 !== T.BLOOM && g0 !== T.SPIKE && g0 !== T.GLOWCAP) return false;
      if (t[(sy - 1) * W + hx] !== T.AIR || t[(sy - 2) * W + hx] !== T.AIR) return false;
      if (Math.abs(SPAWNX - hx) < 9) return false;
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
    return { W: W, H: H, seed: seed, t: t, top: top, bio: bio, holes: holes, spawn: { x: SPAWNX + 0.5, y: top[SPAWNX] } };
  }

  var api = { W: W, H: H, SURF: SURF, WORLDVER: WORLDVER, B_FROST: B_FROST, B_EMBER: B_EMBER, SPAWNX: SPAWNX, T: T, TILES: TILES, ITEMS: ITEMS, ITEM_ORDER: ITEM_ORDER, BIOMES: BIOMES, gen: gen, hash: hash, mulberry: mulberry };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SbxWorld = api;
})(typeof window !== "undefined" ? window : this);
