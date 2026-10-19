// ===== SwampRealms: Delve - cave floor generator (top-down caves, Stage 1) =====
// Pure data + generation, no DOM. Global: SbxCave (also module.exports so it can be tested in Node).
// Load AFTER sandbox-world.js. Every floor is built from (seed, floor number, biome), so the same inputs always give the same floor.
// A floor is a 44 x 32 grid seen from above (like the Stardew Valley mines):
//   wall[i]  = 1 for solid cave wall (cannot be broken in Stage 1)
//   node[i]  = tile id of a breakable rock or ore sitting on that floor cell (0 = nothing). Uses the SAME tile ids as the surface
//              (STONE, CLAY, SPORE, BASALT, CINDER, FROSTROCK, CRYSTAL), so hardness, pick tier and drops come from sandbox-world.js.
//   torch[i] = 1 where the player placed a torch
//   up, down = the ladder cells ({x,y}); spawn = where you stand when you arrive from above
//   lamps    = a few glowing plants/crystals beside the walls, so even a dark cave has some light
(function (root) {
  "use strict";
  var SW = root.SbxWorld || (typeof require !== "undefined" ? require("./sandbox-world.js") : null);
  var T = SW.T, TILES = SW.TILES, CW = 44, CH = 32;

  // Look of each cave type, indexed like the world's biomes: 0 swamp, 1 ember, 2 frost.
  var THEMES = [
    { n: "Mudhollow", sub: "Mossy tunnels and glowing spores", floor: "#4b4a3c", floor2: "#5f5d4a", top: "#1b2219", topHi: "#2a3424", face: "#3d4b3a", faceHi: "#62775a", faceLo: "#1f2a20", tint: [4, 12, 10], lamp: T.GLOWCAP, glow: "80,240,190" },
    { n: "Cinder Hollow", sub: "Hot basalt tunnels and embers", floor: "#4d3a35", floor2: "#654a42", top: "#1d1315", topHi: "#33201f", face: "#5b3b36", faceHi: "#8c5a4a", faceLo: "#2b1a1a", tint: [14, 5, 4], lamp: T.BLOOM, glow: "255,120,50" },
    { n: "Frostvault", sub: "Frozen tunnels and ice crystals", floor: "#5d7186", floor2: "#7690a8", top: "#18232e", topHi: "#2a3d4f", face: "#6d8aa3", faceHi: "#b5d3e6", faceLo: "#2c4054", tint: [4, 9, 20], lamp: T.SPIKE, glow: "130,225,255" }
  ];

  // What grows on each floor. Entries are { tile id: weight }; the first band whose floor number is reached the latest is used.
  // Stone and Clay need the Reed Pick, Glowspore the Reed Pick, Basalt/Cinder the Glowspore Pick, Frostrock/Crystal the Cinder Pick,
  // so deeper floors give you a reason to keep upgrading.
  var BANDS = [
    { f: 1, w: [[T.STONE, 6], [T.CLAY, 1.5], [T.SPORE, 2]] },
    { f: 5, w: [[T.STONE, 5], [T.SPORE, 3], [T.CLAY, 1], [T.BASALT, 2]] },
    { f: 9, w: [[T.STONE, 3], [T.SPORE, 2], [T.BASALT, 4], [T.CINDER, 2]] },
    { f: 14, w: [[T.STONE, 1], [T.BASALT, 4], [T.CINDER, 3], [T.FROSTROCK, 3], [T.CRYSTAL, 1.5]] },
    { f: 20, w: [[T.BASALT, 2], [T.CINDER, 3], [T.FROSTROCK, 4], [T.CRYSTAL, 3]] }
  ];
  // each cave type leans toward its own ore (and shows a pinch of it from floor 3, so you can see what the next pick unlocks)
  var LEAN = [
    [[T.SPORE, 1.6], [T.CLAY, 1.5]],
    [[T.CINDER, 2.4], [T.BASALT, 1.6]],
    [[T.CRYSTAL, 2.4], [T.FROSTROCK, 1.6]]
  ];
  var SPECIAL = [[[T.SPORE, 1]], [[T.CINDER, 1.1], [T.BASALT, 1.2]], [[T.FROSTROCK, 1.1], [T.CRYSTAL, 0.5]]];

  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function weights(floor, biome) {
    var band = BANDS[0]; BANDS.forEach(function (b) { if (floor >= b.f) band = b; });
    var m = {}; band.w.forEach(function (e) { m[e[0]] = (m[e[0]] || 0) + e[1]; });
    LEAN[biome].forEach(function (e) { if (m[e[0]]) m[e[0]] *= e[1]; });
    if (floor >= 3) SPECIAL[biome].forEach(function (e) { m[e[0]] = (m[e[0]] || 0) + e[1]; });
    return Object.keys(m).map(function (k) { return [+k, m[k]]; });
  }
  function pick(ws, r) { var tot = 0, i; for (i = 0; i < ws.length; i++) tot += ws[i][1]; r *= tot; for (i = 0; i < ws.length; i++) { r -= ws[i][1]; if (r <= 0) return ws[i][0]; } return ws[0][0]; }

  // 4-connected flood fill over floor cells. Returns { reg: region id per cell (0 = wall), sizes }.
  function regions(wall) {
    var n = CW * CH, reg = new Int16Array(n), sizes = [0], id = 0, stack = [], i, c;
    for (i = 0; i < n; i++) {
      if (wall[i] || reg[i]) continue;
      id++; sizes[id] = 0; stack.length = 0; stack.push(i); reg[i] = id;
      while (stack.length) {
        c = stack.pop(); sizes[id]++;
        var x = c % CW, y = (c / CW) | 0, nb = [x > 0 ? c - 1 : -1, x < CW - 1 ? c + 1 : -1, y > 0 ? c - CW : -1, y < CH - 1 ? c + CW : -1];
        for (var k = 0; k < 4; k++) { var q = nb[k]; if (q >= 0 && !wall[q] && !reg[q]) { reg[q] = id; stack.push(q); } }
      }
    }
    return { reg: reg, sizes: sizes, count: id };
  }

  // breadth-first distances from a cell over cells for which free(i) is true. dist -1 = unreachable. par = the cell we came from.
  function bfs(start, free) {
    var n = CW * CH, dist = new Int16Array(n).fill(-1), par = new Int32Array(n).fill(-1), q = [start], h = 0; dist[start] = 0;
    while (h < q.length) {
      var c = q[h++], x = c % CW, y = (c / CW) | 0, nb = [x > 0 ? c - 1 : -1, x < CW - 1 ? c + 1 : -1, y > 0 ? c - CW : -1, y < CH - 1 ? c + CW : -1];
      for (var k = 0; k < 4; k++) { var o = nb[k]; if (o >= 0 && dist[o] < 0 && free(o)) { dist[o] = dist[c] + 1; par[o] = c; q.push(o); } }
    }
    return { dist: dist, par: par };
  }

  function gen(seed, floor, biome) {
    biome = biome === 1 || biome === 2 ? biome : 0; floor = Math.max(1, floor | 0);
    var rnd = mulberry((seed ^ Math.imul(floor, 0x9E3779B1) ^ Math.imul(biome + 1, 0x85EBCA6B)) | 0), n = CW * CH, wall, i, x, y, tries = 0, rg, best;
    // 1. cellular-automata cave: random walls, then a few rounds of "become like your neighbours"
    do {
      wall = new Uint8Array(n);
      for (i = 0; i < n; i++) { x = i % CW; y = (i / CW) | 0; wall[i] = (x === 0 || y === 0 || x === CW - 1 || y === CH - 1 || rnd() < 0.455) ? 1 : 0; }
      for (var it = 0; it < 5; it++) {
        var nw = new Uint8Array(n);
        for (i = 0; i < n; i++) {
          x = i % CW; y = (i / CW) | 0; if (x === 0 || y === 0 || x === CW - 1 || y === CH - 1) { nw[i] = 1; continue; }
          var c = 0; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if ((dx || dy) && wall[i + dy * CW + dx]) c++;
          nw[i] = c >= 5 ? 1 : c <= 3 ? 0 : wall[i];
        }
        wall = nw;
      }
      rg = regions(wall); best = 1; for (i = 2; i <= rg.count; i++) if (rg.sizes[i] > rg.sizes[best]) best = i;
    } while ((!rg.count || rg.sizes[best] < n * 0.3) && ++tries < 14);
    if (!rg.count || rg.sizes[best] < n * 0.3) {   // very unlucky seed: carve a plain open hall instead
      wall.fill(1); for (y = 4; y < CH - 4; y++) for (x = 4; x < CW - 4; x++) wall[y * CW + x] = 0; rg = regions(wall); best = 1;
    }
    for (i = 0; i < n; i++) if (!wall[i] && rg.reg[i] !== best) wall[i] = 1;   // only the biggest cave stays: everything else is solid, so every floor is one connected space

    // 2. the way up: a floor cell with a wall to its north and open ground all around it, low on the map
    var free = function (j) { return !wall[j]; }, cand = [];
    for (y = 6; y < CH - 3; y++) for (x = 3; x < CW - 3; x++) {
      i = y * CW + x;
      if (!wall[i] && wall[i - CW] && !wall[i - 1] && !wall[i + 1] && !wall[i + CW] && !wall[i + CW - 1] && !wall[i + CW + 1] && !wall[i + CW * 2]) cand.push([y, i]);
    }
    cand.sort(function (a, b) { return b[0] - a[0]; });
    var upI;
    if (cand.length) upI = cand[Math.floor(rnd() * Math.min(cand.length, 18))][1];
    else { for (i = n - 1; i >= 0; i--) if (!wall[i] && !wall[i + CW] && i + CW < n) { upI = i; break; } }   // fallback: any floor cell with floor below it
    var up = { x: upI % CW, y: (upI / CW) | 0 };
    // keep the entrance roomy: make sure the 3x3 below the ladder is open
    for (y = up.y + 1; y <= Math.min(CH - 2, up.y + 2); y++) for (x = up.x - 1; x <= up.x + 1; x++) if (x > 0 && x < CW - 1) wall[y * CW + x] = 0;
    var spawn = { x: up.x + 0.5, y: up.y + 1.55 }, spI = (up.y + 1) * CW + up.x;

    // 3. the way down: far from the entrance (by walking distance)
    var d0 = bfs(spI, free), maxD = 0; for (i = 0; i < n; i++) if (d0.dist[i] > maxD) maxD = d0.dist[i];
    var far = []; for (i = 0; i < n; i++) if (d0.dist[i] >= Math.max(14, maxD * 0.72) && Math.abs((i % CW) - up.x) + Math.abs(((i / CW) | 0) - up.y) > 10) far.push(i);
    if (!far.length) for (i = 0; i < n; i++) if (d0.dist[i] >= Math.max(3, maxD * 0.5)) far.push(i);
    var dnI = far[Math.floor(rnd() * far.length)] || spI, down = { x: dnI % CW, y: (dnI / CW) | 0 };

    // 4. rocks and ore, grown in veins around a few seed points
    var ws = weights(floor, biome), node = new Uint8Array(n), veins = [], nv = 7 + Math.floor(rnd() * 4), fl = [];
    for (i = 0; i < n; i++) if (!wall[i]) fl.push(i);
    for (var v = 0; v < nv; v++) { var vi = fl[Math.floor(rnd() * fl.length)]; veins.push({ x: vi % CW, y: (vi / CW) | 0, k: pick(ws, rnd()) }); }
    for (var f2 = 0; f2 < fl.length; f2++) {
      i = fl[f2]; x = i % CW; y = (i / CW) | 0;
      if (Math.abs(x - up.x) <= 2 && y >= up.y && y <= up.y + 3) continue;   // keep the arrival area clear
      if (Math.abs(x - down.x) <= 1 && Math.abs(y - down.y) <= 1) continue;
      var pr = 0.025, near = null;
      for (var q = 0; q < veins.length; q++) { var ddx = x - veins[q].x, ddy = y - veins[q].y, dd = ddx * ddx + ddy * ddy; pr += Math.exp(-dd / 7) * 0.62; if (!near || dd < near.d) near = { d: dd, k: veins[q].k }; }
      pr = Math.min(0.65, pr);
      if (rnd() < pr) node[i] = near && near.d < 7 && rnd() < 0.72 ? near.k : pick(ws, rnd());
    }
    // the way from the ladder to the ladder is never blocked: clear any rock on the shortest path
    for (var c2 = dnI; c2 >= 0 && c2 !== spI; c2 = d0.par[c2]) node[c2] = 0;
    node[dnI] = 0;

    // 5. glowing lamp plants beside walls (decoration that gives light; walking through them is fine)
    var lamps = [], lc = [];
    for (i = 0; i < n; i++) if (!wall[i] && !node[i] && wall[i - CW] && i !== upI && i !== dnI) lc.push(i);
    for (var l = 0; l < 9 && lc.length; l++) { var li = lc.splice(Math.floor(rnd() * lc.length), 1)[0]; lamps.push({ x: li % CW, y: (li / CW) | 0 }); }

    var rocks = 0; for (i = 0; i < n; i++) if (node[i]) rocks++;
    // 6. treasure (needs the content pack): a Cave Chest tucked into a nook on most floors (more likely deeper), and a few Cave Pots along the walls.
    //    Both are rock-like nodes: hold your pick on them to pry the chest open or smash the pot. Never placed on the ladder-to-ladder path.
    if (T.X_lootchest && T.X_lootpot) {
      var tr = SW.mulberry((seed * 31 + floor * 977 + biome * 7) | 0), onPath = {}, lampAt = {}, nooks = [], edges = [];
      for (var c3 = dnI; c3 >= 0 && c3 !== spI; c3 = d0.par[c3]) onPath[c3] = 1; onPath[spI] = onPath[dnI] = onPath[upI] = 1;
      lamps.forEach(function (L) { lampAt[L.y * CW + L.x] = 1; });
      for (i = CW; i < n - CW; i++) {
        if (wall[i] || node[i] || onPath[i] || lampAt[i]) continue; x = i % CW; y = (i / CW) | 0;
        if ((Math.abs(x - up.x) <= 2 && y >= up.y - 1 && y <= up.y + 3) || (Math.abs(x - down.x) <= 1 && Math.abs(y - down.y) <= 1)) continue;
        var wn = wall[i - 1] + wall[i + 1] + wall[i - CW] + wall[i + CW]; if (wn >= 3) continue;   // dead-end pockets stay reachable
        if (wn === 2) nooks.push(i); else if (wn === 1) edges.push(i);
      }
      if (nooks.length && tr() < Math.min(0.85, 0.5 + floor * 0.025)) node[nooks[Math.floor(tr() * nooks.length)]] = T.X_lootchest;
      for (var pq = 2 + Math.floor(tr() * 4); pq > 0 && edges.length; pq--) { var ei = edges.splice(Math.floor(tr() * edges.length), 1)[0]; if (!node[ei]) node[ei] = T.X_lootpot; }
    }
    return { w: CW, h: CH, floor: floor, biome: biome, seed: seed, theme: THEMES[biome], wall: wall, node: node, torch: new Uint8Array(n), up: up, down: down, spawn: spawn, lamps: lamps, rocks: rocks };
  }

  // is the cell blocked for walking? (walls and rocks are; anything outside the grid is)
  function solid(F, x, y) { var w = F.w || CW, h = F.h || CH; if (x < 0 || y < 0 || x >= w || y >= h) return true; var i = y * w + x; return !!(F.wall[i] || F.node[i] || (F.sol && F.sol[i])); }

  // ---------- building interiors (Delve structures, see buildStructures in sandbox-world.js) ----------
  // A room seen from above, in the same format as a cave floor so the cave engine runs it unchanged. Extras on the floor object:
  //   bld = true, bi = index into THEMES (the wall and floor look), amb = base light (0..1), sol = solid furniture cells,
  //   deco = [{x, y, id, solid, flat, wall}] (id = a surface tile id, drawn with that tile's art; flat = lies on the floor, wall = hangs on the back wall)
  //   up = the exit door (a cell in the bottom wall). There is no way down.
  THEMES.push(
    { n: "Reed Cabin", sub: "Warm, quiet and smells of old tea", plank: 1, floor: "#8c6238", floor2: "#a37446", top: "#241810", topHi: "#3a2a1a", face: "#7a4f2c", faceHi: "#a8703c", faceLo: "#46301a", tint: [10, 6, 2], lamp: T.GLOWCAP, glow: "255,190,110" },
    { n: "Old Watchtower", sub: "Cold stone and a long view", floor: "#676b6f", floor2: "#7a8085", top: "#1a1c20", topHi: "#2b2f35", face: "#59616a", faceHi: "#8793a0", faceLo: "#2f353b", tint: [4, 6, 10], lamp: T.GLOWCAP, glow: "255,210,150" },
    { n: "Cinder Forge", sub: "Hot air and the smell of iron", floor: "#4a3d42", floor2: "#5f4d52", top: "#1b1214", topHi: "#2f1f1e", face: "#5a3a36", faceHi: "#8c5a4a", faceLo: "#2a1a1a", tint: [16, 5, 3], lamp: T.BLOOM, glow: "255,120,50" },
    { n: "Ashen Keep", sub: "Banners hang still in the dark", floor: "#443a42", floor2: "#594b57", top: "#161014", topHi: "#2a1c24", face: "#4f3340", faceHi: "#84566a", faceLo: "#25151d", tint: [14, 4, 8], lamp: T.BLOOM, glow: "255,110,70" },
    { n: "Frost Lodge", sub: "A fire crackles behind frosted glass", plank: 1, floor: "#9db4c8", floor2: "#b7ccdd", top: "#18232e", topHi: "#2a3d4f", face: "#7f9fba", faceHi: "#c4dff0", faceLo: "#36506a", tint: [4, 9, 18], lamp: T.SPIKE, glow: "190,230,255" },
    { n: "Frozen Shrine", sub: "Something old sleeps in the ice", floor: "#8aa3bb", floor2: "#a5bed4", top: "#141e29", topHi: "#25384a", face: "#6d8aa3", faceHi: "#b5d3e6", faceLo: "#2c4054", tint: [3, 8, 20], lamp: T.SPIKE, glow: "130,225,255" },
    { n: "Swamp Farmstead", sub: "Hay, harvest sacks and a pot on the boil", plank: 1, floor: "#94683c", floor2: "#ab7a4a", top: "#241810", topHi: "#3a2a1a", face: "#8a4a2c", faceHi: "#b8643c", faceLo: "#4a2416", tint: [10, 6, 2], lamp: T.GLOWCAP, glow: "255,190,110" },
    { n: "Witch Hut", sub: "Something bubbles in the cauldron", plank: 1, floor: "#4a3a2c", floor2: "#5a4636", top: "#160e14", topHi: "#2a1a26", face: "#4a3048", faceHi: "#6a4a6a", faceLo: "#22142a", tint: [10, 4, 14], lamp: T.GLOWCAP, glow: "190,120,255" }
  );
  // Each kind: size, theme (index into THEMES), light, and a furniture list built by items(add). add(x, y, id, opt) with opt: "s" solid, "f" flat on the floor, "w" hangs on the back wall.
  function X(nm) { return T["X_" + nm]; }   // a Content Pack piece (or undefined when the pack is missing)
  function ax(a, x, y, nm, o) { if (X(nm) !== undefined) a(x, y, X(nm), o); }
  var KINDS = {
    cabin: { th: 3, w: 13, h: 10, amb: 0.7, items: function (a) {
      ax(a, 2, 5, "desk", "s"); ax(a, 10, 5, "sofa", "s"); ax(a, 3, 8, "crate", "s"); ax(a, 8, 1, "clock", "w"); ax(a, 4, 1, "mirror", "w"); ax(a, 9, 8, "cookpot", "s");
      a(2, 2, T.BED, "s"); a(4, 2, T.BOOKSHELF, "s"); a(5, 2, T.BOOKSHELF, "s"); a(9, 2, T.HEARTH, "s"); a(11, 2, T.WARDROBE, "s");
      a(7, 1, T.PAINTING, "w"); a(3, 1, T.TORCH, "w"); a(10, 1, T.TORCH, "w");
      a(5, 5, T.RUG, "f"); a(6, 5, T.RUG, "f"); a(7, 5, T.RUG, "f"); a(6, 5, T.TABLE, "s"); a(5, 5, T.CHAIR); a(7, 5, T.CHAIR_L);
      a(1, 7, T.BARREL, "s"); a(1, 8, T.BARREL, "s"); a(11, 8, T.POT, "s"); a(11, 7, T.FLOWERPOT, "s"); a(9, 7, T.GLOWPOT, "s");
    } },
    tower: { th: 4, w: 9, h: 13, amb: 0.62, items: function (a) {
      ax(a, 7, 5, "globe", "s"); ax(a, 1, 5, "telescope", "s"); ax(a, 2, 1, "worldmap", "w"); ax(a, 6, 10, "weaponrack", "s"); ax(a, 3, 8, "candelabra", "s");
      a(2, 2, T.BOOKSHELF, "s"); a(3, 2, T.BOOKSHELF, "s"); a(5, 2, T.BOOKSHELF, "s"); a(6, 2, T.WARDROBE, "s");
      a(4, 1, T.BANNER, "w"); a(1, 1, T.TORCH, "w"); a(7, 1, T.TORCH, "w");
      a(3, 5, T.RUG, "f"); a(4, 5, T.RUG, "f"); a(5, 5, T.RUG, "f"); a(4, 5, T.TABLE, "s"); a(3, 5, T.CHAIR); a(5, 5, T.CHAIR_L);
      a(4, 8, T.CAULDRON, "s"); a(1, 7, T.BARREL, "s"); a(7, 7, T.BARREL, "s"); a(1, 10, T.BUCKET, "s"); a(7, 10, T.BUGTROPHY, "s"); a(2, 10, T.BARREL, "s");
    } },
    forge: { th: 5, w: 14, h: 10, amb: 0.55, items: function (a) {
      ax(a, 4, 5, "furnace", "s"); ax(a, 1, 4, "weaponrack", "s"); ax(a, 12, 4, "armorstand", "s"); ax(a, 3, 7, "crate", "s"); ax(a, 10, 8, "crate", "s"); ax(a, 7, 1, "crossedswords", "w"); ax(a, 11, 7, "lavalamp", "s");
      a(6, 2, T.HEARTH, "s"); a(7, 2, T.HEARTH, "s"); a(2, 2, T.BRAZIER, "s"); a(11, 2, T.BRAZIER, "s");
      a(4, 1, T.EMBERBANNER, "w"); a(9, 1, T.EMBERBANNER, "w"); a(1, 1, T.TORCH, "w"); a(12, 1, T.TORCH, "w");
      a(3, 5, T.ANVIL, "s"); a(10, 5, T.TABLE, "s"); a(9, 5, T.CHAIR); a(11, 5, T.CHAIR_L);
      a(5, 4, T.RUG, "f"); a(6, 4, T.RUG, "f"); a(7, 4, T.RUG, "f"); a(8, 4, T.RUG, "f");
      a(1, 7, T.BARREL, "s"); a(2, 7, T.BARREL, "s"); a(12, 7, T.URN, "s"); a(12, 8, T.POT, "s"); a(7, 7, T.CINDERLAMP, "s");
    } },
    keep: { th: 6, w: 11, h: 13, amb: 0.5, items: function (a) {
      ax(a, 5, 1, "tapestry_ember", "w"); ax(a, 2, 1, "shield", "w"); ax(a, 8, 1, "shield", "w"); ax(a, 1, 6, "armorstand", "s"); ax(a, 9, 6, "armorstand", "s"); ax(a, 4, 2, "candelabra", "s"); ax(a, 6, 2, "candelabra", "s");
      a(5, 2, T.THRONE, "s"); a(3, 1, T.EMBERBANNER, "w"); a(7, 1, T.EMBERBANNER, "w"); a(1, 1, T.TORCH, "w"); a(9, 1, T.TORCH, "w");
      for (var y = 3; y <= 9; y++) a(5, y, T.RUG, "f");
      a(2, 4, T.BRAZIER, "s"); a(8, 4, T.BRAZIER, "s"); a(2, 7, T.GUARDIAN, "s"); a(8, 7, T.GUARDIAN, "s");
      a(1, 10, T.BARREL, "s"); a(9, 10, T.URN, "s"); a(2, 10, T.BARREL, "s"); a(8, 10, T.EMBERLANTERN, "s");
    } },
    lodge: { th: 7, w: 14, h: 10, amb: 0.66, items: function (a) {
      ax(a, 2, 5, "sofa", "s"); ax(a, 11, 5, "dresser", "s"); ax(a, 12, 1, "antlers", "w"); ax(a, 1, 1, "wolftrophy", "w"); ax(a, 10, 7, "cookpot", "s"); ax(a, 5, 8, "sack", "s");
      a(6, 2, T.HEARTH, "s"); a(2, 2, T.BED, "s"); a(3, 2, T.WARDROBE, "s"); a(10, 2, T.BOOKSHELF, "s"); a(11, 2, T.BOOKSHELF, "s");
      a(4, 1, T.FROSTBANNER, "w"); a(9, 1, T.FROSTBANNER, "w"); a(7, 1, T.TORCH, "w");
      a(5, 5, T.RUG, "f"); a(6, 5, T.RUG, "f"); a(7, 5, T.RUG, "f"); a(8, 5, T.RUG, "f"); a(6, 5, T.TABLE, "s"); a(5, 5, T.CHAIR); a(8, 5, T.CHAIR_L);
      a(1, 7, T.FROSTLANTERN, "s"); a(12, 7, T.ICESCULPT, "s"); a(12, 8, T.BARREL, "s"); a(2, 8, T.BARREL, "s");
    } },
    farm: { th: 9, w: 14, h: 10, amb: 0.72, items: function (a) {   // the Swamp Farmstead: a barn with hay, sacks of harvest, a kitchen corner and tools
      a(1, 2, T.BALE, "s"); a(2, 2, T.BALE, "s"); a(1, 3, T.BALE, "s"); a(12, 2, T.BARREL, "s"); a(11, 2, T.BARREL, "s");
      a(5, 1, T.PAINTING, "w"); a(3, 1, T.TORCH, "w"); a(10, 1, T.TORCH, "w");
      a(6, 4, T.RUG, "f"); a(7, 4, T.RUG, "f"); a(6, 4, T.TABLE, "s"); a(5, 4, T.CHAIR); a(8, 4, T.CHAIR_L);
      a(1, 7, T.BUCKET, "s"); a(12, 7, T.POT, "s"); a(12, 8, T.FLOWERPOT, "s");
      ax(a, 4, 2, "cookpot", "s"); ax(a, 8, 2, "sack", "s"); ax(a, 9, 2, "sack", "s"); ax(a, 10, 7, "crate", "s"); ax(a, 11, 7, "crate", "s"); ax(a, 2, 7, "scarecrow", "s"); ax(a, 8, 1, "wreath", "w");
    } },
    shrine: { th: 8, w: 11, h: 9, amb: 0.5, items: function (a) {
      ax(a, 5, 1, "tapestry_frost", "w"); ax(a, 1, 6, "obelisk", "s"); ax(a, 9, 6, "obelisk", "s");
      a(5, 2, T.FROGSTATUE, "s"); a(3, 1, T.FROSTBANNER, "w"); a(7, 1, T.FROSTBANNER, "w");
      a(3, 3, T.FROSTLANTERN, "s"); a(7, 3, T.FROSTLANTERN, "s");
      for (var y = 3; y <= 6; y++) a(5, y, T.RUG, "f");
      a(2, 6, T.ICESCULPT, "s"); a(8, 6, T.ICESCULPT, "s"); a(1, 3, T.CRYSTALLAMP, "s"); a(9, 3, T.CRYSTALLAMP, "s");
    } }
  };
  // ---------- building interiors, redesigned: hand-drawn floor plans ----------
  // Each map row is one row of cells. Row 0 = wall, row 1 = the back wall (its letters are things hung on it, "w" = a window that lets daylight in),
  // the last row = the bottom wall (the exit door is put in its centre). Floors: "floors" lists patterned floor zones [x0, y0, x1, y1, block].
  // Floor-row letters: "." floor, "#" inner wall, "r" rug, "~" lava trough, "=" still water, anything else = a piece of furniture from ILEG.
  var IMAP = {"witchhut":{"th":10,"amb":0.5,"win":"GLASS","map":["#############","#tSw.gtg.wSt#","#KK.5...5.bb#","#K...rrr...b#","#cT..rVr..TC#","###+#rrr....#","#B4.#.....dx#","#B..#l...p.x#","#d..#......q#","#############"],"floors":[[1,2,11,8,"mudbrick"],[1,6,3,8,"woodpanel"]],"tops":{"2,1":"F","10,1":"B","4,2":"Y","8,2":"S","2,4":"b","10,4":"c","2,6":"j"},"flip":["10,6","11,8"],"rot":{"1,3":270,"11,3":90}},"cabin":{"th":3,"amb":0.68,"win":"GLASS","map":["###################","#tw.St#tP.wt#tSw.t#","#B4.K.#.HHH.#1231.#","#B....#..r..#.....#","#f.W..+.rrr.#cTC.b#","#.....#.S6S.#.....#","#.k...#..r..+....1#","###+###.....#..g.3#","#D.c..#.rrr.#....1#","#.....+.rTrC#..X..#","#s...5#.rrr.#b...X#","#bb.a.#.....#u...b#","###################"],"floors":[[1,2,5,6,"oakplanks"],[1,8,5,11,"birchplanks"],[7,2,11,11,"basketweave"],[13,2,17,11,"tealtile"]],"tops":{"4,1":"B","14,1":"n","2,2":"o","13,2":"f","15,2":"p","16,2":"k","14,4":"c","9,5":"b","1,8":"q","5,10":"j","9,9":"v","17,6":"P","17,7":"p"},"flip":["4,11"],"rot":{"8,5":270,"10,5":90,"17,6":90,"17,7":90,"17,8":90}},"tower":{"th":4,"amb":0.6,"win":"GLASS","map":["###############","#tSw.c#M#c.wSt#","###K.K.^.K.K###","##l...5.5...G##","#e...rcTCr...l#","#....rrrrr....#","#######+#######","#R..D.c......M#","#b...V.....s.X#","#b.f.........X#","##u.........b##","##x..a......x##","###.........###","###############"],"floors":[[1,2,13,5,"woodpanel"],[1,7,13,12,"slatetile"]],"tops":{"2,1":"x","12,1":"B","6,3":"o","8,3":"B","7,4":"g","4,7":"q"},"flip":["13,4"],"rot":{"1,7":270,"13,7":90}},"farm":{"th":9,"amb":0.7,"win":"GLASS","map":["###################","#t.w.W.t.P#tS..wgt#","#nnn|nn...#1231.xx#","#n..|...r.#..cTC..#","#n..|..rrr+.......#","#||.|...r.#....b..#","#.......z.#......X#","#nn|nn....###+#####","#n..|.....#....4B.#","#n..|....r#.5....f#","#...|...r.#..cTC..#","#bb.......#.P..u.g#","###################"],"floors":[[11,2,17,6,"terracotta"],[11,8,17,11,"herringbone"]],"tops":{"12,1":"P","11,2":"f","13,2":"p","14,2":"k","14,3":"c","15,8":"o","12,9":"v","14,10":"s"},"rot":{"16,8":90}},"forge":{"th":5,"amb":0.52,"win":"BARS","map":["###################","#t.e.tSx.w.xSt.e.t#","#Y.F.F..HHH..F.F.Y#","#.................#","#R..~~~~...~~~~..M#","#R..~~~~...~~~~..M#","#...A........######","#.5..........#.5..#","#X.X..m.rrr.m#.X.X#","#X.....crTrC.+...X#","#b.......r...#...b#","#bb..........#.bU.#","###################"],"floors":[[1,2,17,11,"basalttile"],[7,3,11,11,"crackedbrick"],[14,7,17,11,"steelplate"]],"tops":{"6,1":"l","12,1":"J","2,7":"p","15,7":"o","9,9":"C"},"rot":{"1,4":270,"1,5":270,"17,4":90,"17,5":90}},"keep":{"th":6,"amb":0.48,"win":"GLASSR","map":["###################","#t.e.T.e.w.e.T.e.t#","#Y.#...lrNrl...#.Y#","#..#.....r.....#..#","#M.#.....r.....#.M#","#..#..Q..r..Q..#..#","#..+.cTTC.cTTC.+..#","#M.#.....r.....#.M#","#..#..Q..r..Q..#..#","#..+.cTTC.cTTC.+..#","#E.#.....r.....#.E#","#bU#.....r.....#Ub#","#X.#.....r.....#.X#","###################"],"floors":[[1,2,17,12,"blackmarble"],[6,2,12,12,"checker"]],"tops":{"6,6":"k","7,6":"C","11,6":"f","12,6":"c","6,9":"s","7,9":"v","11,9":"C","12,9":"p"},"flip":["12,5","12,8"],"rot":{"1,4":270,"1,7":270,"17,4":90,"17,7":90}},"lodge":{"th":7,"amb":0.64,"win":"GLASSB","map":["###################","#t.wSt#h.T.f.wSh.t#","#B4W..#...HHH...K.#","#B....#..r.r.r..K.#","#Z....+...rrr.....#","#.....#S.rr6rr..S.#","#.D...#...rrr.....#","###+###....r......#","#L...q#.....#+#####","#5....+.cTC.#.1231#","#I...s#..r..#....b#","#bb...#.....#..O.x#","###################"],"floors":[[1,2,5,6,"woodpanel"],[1,8,5,11,"oakplanks"],[7,2,17,11,"pineplanks"],[13,9,17,11,"slatetile"]],"tops":{"4,1":"B","14,1":"j","2,2":"o","1,4":"n","11,5":"b","2,6":"q","1,9":"o","9,9":"C","14,9":"f","16,9":"p","17,9":"k"},"rot":{"7,5":270,"16,5":90,"16,2":90,"16,3":90}},"shrine":{"th":8,"amb":0.5,"win":"GLASSB","map":["#################","#tSf.w.T.w.fSt..#","#j.#...rJr...#.j#","#..#L..rrr..L#..#","#..#..=====..#..#","#..#..=====..#..#","#..+..r.o.r..+..#","#..#....r....#..#","#..#I...r...I#..#","#.5+....r....+5.#","#yo#....r....#oy#","#L.#....r....#.L#","#################"],"floors":[[1,2,15,11,"frostcobble"],[6,6,10,11,"moonbrick"]],"tops":{"2,1":"y","12,1":"c","2,9":"c","14,9":"y"},"flip":["15,10"]}};
  var ILEG = { B: "BED", K: "BOOKSHELF", H: "HEARTH", W: "WARDROBE", T: "TABLE", c: "CHAIR", C: "CHAIR_L", b: "BARREL", u: "BUCKET", p: "POT", P: "FLOWERPOT", g: "GLOWPOT", V: "CAULDRON",
    Y: "BRAZIER", U: "URN", Q: "GUARDIAN", N: "THRONE", I: "ICESCULPT", J: "FROGSTATUE", L: "FROSTLANTERN", E: "EMBERLANTERN", A: "ANVIL", n: "BALE", i: "CINDERLAMP", j: "CRYSTALLAMP", "^": "LADDER", "|": "FENCE",
    F: "X_furnace", D: "X_desk", S: "X_sofa", k: "X_clock", Z: "X_dresser", O: "X_cookpot", R: "X_weaponrack", M: "X_armorstand", X: "X_crate", x: "X_sack", G: "X_globe", e: "X_telescope",
    l: "X_candelabra", m: "X_lavalamp", z: "X_scarecrow", o: "X_obelisk",
    // interior pack furniture and pieces that stand on the floor
    "1": "X_counter", "2": "X_countersink", "3": "X_counterstove", "4": "X_nightstand", "5": "X_sidetable", "6": "X_coffeetable",
    a: "X_gramophone", d: "X_bonepile", f: "X_pottedfern", q: "X_cattailvase", h: "X_harp", s: "X_stackedbooks", y: "X_crystalcluster", "9": "X_frogidol", "8": "X_glowjar" };
  // "tops": pieces standing ON the furniture (or wall shelf) in that cell, { "x,y": letter }; drawn sitting on its surface (TILES[id].top)
  var TLEG = { c: "X_tablecandle", o: "X_oillamp", f: "X_fruitbowl", b: "X_openbook", q: "X_inkquill", n: "X_bonsai", v: "X_lilyvase", k: "X_cakestand", p: "X_teapot", s: "X_teaset",
    B: "X_stackedbooks", j: "X_glowjar", g: "X_globe", l: "X_lavalamp", S: "X_skullcandle", x: "X_shipbottle", F: "X_fireflyjar", P: "FLOWERPOT", C: "X_candelabra", y: "X_crystalcluster", Y: "X_slimejar", J: "X_goldfrog", w: "GLOWPOT", r: "X_frogidol" };
  var IWALL = { t: "TORCH", P: "PAINTING", n: "BANNER", e: "EMBERBANNER", f: "FROSTBANNER", M: "X_worldmap", m: "X_mirror", W: "X_wreath", a: "X_antlers", h: "X_wolftrophy", x: "X_crossedswords",
    S: "X_wallshelf", c: "X_starchart", g: "X_hangingherbs", k: "X_birdcage", C: "X_windchime", F: "X_fishtrophy", b: "X_battrophy", G: "X_gatortrophy" };
  var IWIN = { GLASS: "GLASS", BARS: "X_ironbars", GLASSR: "X_stainedred", GLASSB: "X_stainedblue" }, ITAP = { keep: "X_tapestry_ember", lodge: "X_tapestry_frost", shrine: "X_tapestry_frost" };
  function mapInterior(kind, biome, id) {
    var D = IMAP[kind], m = D.map, w = m[0].length, h = m.length, n = w * h, wall = new Uint8Array(n), sol = new Uint8Array(n), deco = [], dr = [], wins = [], x, y, dx = Math.floor(w / 2), doors = [];
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (y <= 1 || y === h - 1 || x === 0 || x === w - 1 || m[y].charAt(x) === "#") wall[y * w + x] = 1;
    function add(px, py, key, solid, flat, onWall, win) {
      var tid = typeof key === "number" ? key : T[key]; if (tid === undefined) return;
      var e = { x: px, y: py, id: tid, solid: !!solid, flat: !!flat, wall: !!onWall }; deco.push(e); if (solid) sol[py * w + px] = 1; if (win) wins.push(e);
    }
    (D.floors || []).forEach(function (z) { var fk = "X_" + z[4]; if (T[fk] === undefined) return; for (var yy = z[1]; yy <= z[3]; yy++) for (var xx = z[0]; xx <= z[2]; xx++) if (!wall[yy * w + xx]) add(xx, yy, fk, false, true); });
    for (x = 1; x < w - 1; x++) {   // the back wall
      var c1 = m[1].charAt(x);
      if (c1 === "w") add(x, 1, IWIN[D.win] || "GLASS", false, false, true, true);
      else if (c1 === "T") add(x, 1, ITAP[kind] || "X_tapestry_swamp", false, false, true);
      else if (IWALL[c1]) add(x, 1, IWALL[c1], false, false, true);
    }
    for (y = 2; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
      var ch = m[y].charAt(x);
      if (ch === "r") add(x, y, "RUG", false, true); else if (ch === "~") add(x, y, "LAVA", true, true); else if (ch === "=") add(x, y, "WATER", true, true);
      else if (ILEG[ch]) add(x, y, ILEG[ch], true, false);
    }
    deco.forEach(function (e) { if (e.x === dx && e.y >= h - 3 && !e.flat) { e.solid = false; sol[e.y * w + e.x] = 0; } });   // never block the way to the door
    // ROOMS: inner walls ("#" away from the outer walls) stand up tall and fade down while you are in a room they border; "+" is a door in one
    var iw = new Uint8Array(n), room = new Int16Array(n), isDoor = new Uint8Array(n), nroom = 0, i, q2;
    for (y = 2; y < h - 1; y++) for (x = 1; x < w - 1; x++) { i = y * w + x; if (wall[i]) iw[i] = 1; if (m[y].charAt(x) === "+") { isDoor[i] = 1; doors.push({ x: x, y: y, vert: !!(wall[i - w] && wall[i + w]) }); } }
    var dfl = new Uint16Array(n), dvert = new Uint8Array(n);   // a door takes the patterned floor of the room it opens into (so the doorway matches), and knows which way its wall runs
    doors.forEach(function (d) {
      var di = d.y * w + d.x; dvert[di] = d.vert ? 1 : 0;
      var nb = d.vert ? [di + 1, di - 1] : [di + w, di - w];
      for (var q3 = 0; q3 < nb.length && !dfl[di]; q3++) deco.forEach(function (e) { if (!dfl[di] && e.flat && e.y * w + e.x === nb[q3] && TILES[e.id] && TILES[e.id].kind !== "rug" && e.id !== T.WATER && e.id !== T.LAVA) dfl[di] = e.id; });
      if (dfl[di]) deco.push({ x: d.x, y: d.y, id: dfl[di], solid: false, flat: true, wall: false });
    });
    for (i = 0; i < n; i++) room[i] = -1;
    for (y = 2; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
      i = y * w + x; if (wall[i] || isDoor[i] || room[i] >= 0) continue;
      var st = [i]; room[i] = nroom;
      while (st.length) { q2 = st.pop(); [q2 - 1, q2 + 1, q2 - w, q2 + w].forEach(function (b) { if (b >= 0 && b < n && !wall[b] && !isDoor[b] && room[b] < 0) { room[b] = nroom; st.push(b); } }); }
      nroom++;
    }
    var wrm = new Uint32Array(n);   // for each inner wall / door cell: the rooms (bits) right next to it
    for (y = 2; y < h - 1; y++) for (x = 1; x < w - 1; x++) { i = y * w + x; if (!iw[i] && !isDoor[i]) continue;
      for (var oy2 = -1; oy2 <= 1; oy2++) for (var ox2 = -1; ox2 <= 1; ox2++) { var r2 = room[(y + oy2) * w + x + ox2]; if (r2 >= 0 && r2 < 32) wrm[i] |= 1 << r2; } }
    (D.flip || []).forEach(function (k) { var q = k.split(","), fx = +q[0], fy = +q[1]; deco.forEach(function (e) { if (e.x === fx && e.y === fy && !e.flat) e.flip = 1; }); });   // mirrored pieces
    Object.keys(D.rot || {}).forEach(function (k) { var q = k.split(","), fx = +q[0], fy = +q[1]; deco.forEach(function (e) { if (e.x === fx && e.y === fy && e.top === undefined && !e.flat) e.rot = D.rot[k]; }); });   // turned pieces: 90 / 180 / 270 degrees
    Object.keys(D.tops || {}).forEach(function (k) {   // pieces standing on furniture or a wall shelf
      var q = k.split(","), tx = +q[0], ty = +q[1], tk = TLEG[D.tops[k]], tid = tk && T[tk]; if (tid === undefined) return;
      var base = deco.filter(function (e) { return e.x === tx && e.y === ty && !e.flat && TILES[e.id] && TILES[e.id].top !== undefined; })[0]; if (!base) return;
      deco.push({ x: tx, y: ty, id: tid, solid: false, flat: false, wall: base.wall, top: TILES[base.id].top, rb: base.rot || 0, onSide: !!(base.rot && (base.rot === 90 || base.rot === 270) && /^counter/.test(TILES[base.id].kind)), flip: (D.flip || []).indexOf(k + "t") > -1 ? 1 : 0 });
    });
    for (y = 0; y < h; y++) dr[y] = [];
    deco.forEach(function (e) { if (!e.flat && e.top === undefined) dr[e.y].push(e); });
    deco.forEach(function (e) { if (e.top !== undefined) dr[e.y].push(e); });   // after the furniture they stand on
    return { w: w, h: h, floor: 1, biome: biome, seed: id, theme: THEMES[D.th], wall: wall, node: new Uint8Array(n), torch: new Uint8Array(n), sol: sol,
      up: { x: dx, y: h - 1 }, down: { x: -60, y: -60 }, spawn: { x: dx + 0.5, y: h - 1.25 }, lamps: [], rocks: 0,
      bld: true, bi: D.th, amb: D.amb, deco: deco, dr: dr, flat: deco.filter(function (e) { return e.flat; }), wins: wins,
      iw: iw, room: room, nroom: nroom, wrm: wrm, doors: doors, isDoor: isDoor, dfl: dfl, dvert: dvert, wf: new Float32Array(n).fill(1), dop: new Float32Array(n) };
  }
  function interior(kind, biome, id, run) {
    if (IMAP[kind]) return mapInterior(kind, biome, id);
    var K = KINDS[kind] || KINDS.cabin, w = K.w, h = K.h, n = w * h, wall = new Uint8Array(n), sol = new Uint8Array(n), deco = [], x, y, dr = [];
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) wall[y * w + x] = (y <= 1 || y === h - 1 || x === 0 || x === w - 1) ? 1 : 0;
    var dx = Math.floor(w / 2);
    K.items(function (px, py, tid, o) {
      if (px < 1 || px > w - 2 || py < 1 || py > h - 2) return;
      var e = { x: px, y: py, id: tid, solid: o === "s", flat: o === "f", wall: o === "w" };
      deco.push(e); if (e.solid) sol[py * w + px] = 1;
    });
    deco.forEach(function (e) { if (e.x === dx && e.y >= h - 3) { e.solid = false; sol[e.y * w + e.x] = 0; } });   // never block the way to the door
    for (y = 0; y < h; y++) dr[y] = [];
    deco.forEach(function (e) { if (!e.flat) dr[e.y].push(e); });
    return { w: w, h: h, floor: 1, biome: biome, seed: id, theme: THEMES[K.th], wall: wall, node: new Uint8Array(n), torch: new Uint8Array(n), sol: sol,
      up: { x: dx, y: h - 1 }, down: { x: -60, y: -60 }, spawn: { x: dx + 0.5, y: h - 1.25 }, lamps: [], rocks: 0,
      bld: true, bi: K.th, amb: K.amb, deco: deco, dr: dr, flat: deco.filter(function (e) { return e.flat; }) };
  }


  var api = { IMAP: IMAP, ILEG: ILEG, TLEG: TLEG, IWALL: IWALL, W: CW, H: CH, THEMES: THEMES, BANDS: BANDS, gen: gen, interior: interior, KINDS: KINDS, solid: solid, weights: weights, regions: regions, bfs: bfs, mulberry: mulberry };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SbxCave = api;
})(typeof window !== "undefined" ? window : this);
