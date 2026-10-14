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
  var T = SW.T, CW = 44, CH = 32;

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
    return { w: CW, h: CH, floor: floor, biome: biome, seed: seed, theme: THEMES[biome], wall: wall, node: node, torch: new Uint8Array(n), up: up, down: down, spawn: spawn, lamps: lamps, rocks: rocks };
  }

  // is the cell blocked for walking? (walls and rocks are; anything outside the grid is)
  function solid(F, x, y) { if (x < 0 || y < 0 || x >= CW || y >= CH) return true; var i = y * CW + x; return !!(F.wall[i] || F.node[i]); }

  var api = { W: CW, H: CH, THEMES: THEMES, BANDS: BANDS, gen: gen, solid: solid, weights: weights, regions: regions, bfs: bfs, mulberry: mulberry };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SbxCave = api;
})(typeof window !== "undefined" ? window : this);
