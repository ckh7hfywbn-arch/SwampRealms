// ===== SwampRealms: Delve - the Brinebog Sea: dive-map generator and the sea chart (pure data, no DOM) =====
// Global: SbxOcean (also module.exports so it can be tested in Node). Load AFTER sandbox-world.js.
// The ocean is its own place, reached from Croaker's Pier. Two views share this file:
//   DIVE MAP  gen(seed, main): a side-on grid OW x OH tiles. Row SEA is the water surface; above it is sky. With main = true the map has Croaker's
//             Pier built across the surface (a long wooden dock, a boat slip at its end, a ladder at the halfway point). From the shallows down:
//             Sunlit Shallows (to 24 m), Coral Reef (to 60 m), Twilight Deep (to 96 m), the Abyssal Trench (below). Reefs are rock towers with coral
//             caves inside them (air pockets, glowing coral, clams, chests); two pirate wrecks lie on the sea floor.
//   SEA CHART seaGen(seed): the open sea seen from above, with named islands to sail to.
// A dive map is a pure function of (seed, main), so only what you changed (broken tiles, opened chests) needs saving.
(function (root) {
  "use strict";
  var SW = root.SbxWorld || (typeof require !== "undefined" ? require("./sandbox-world.js") : null);
  var hash = SW.hash, mulberry = SW.mulberry;
  var OW = 340, OH = 178, SEA = 14, DOCK0 = 11, DOCK1 = 88, DIVEX = 50, SLIP = 84;

  // ---- tiles ----
  var T = { WATER: 0, AIR: 1, SAND: 2, SILT: 3, ROCK: 4, CPINK: 5, CBLUE: 6, CORANGE: 7, DEEP: 8, WOOD: 9, PLATE: 10, KELP: 11, GRASS: 12, GLOW: 13, CLAM: 14, CHEST: 15, BARREL: 16, ANEM: 17,
    DOCK: 18, POST: 19, LADDER: 20, CANNON: 21, FAN: 22, BED: 23, AIRP: 24, OPEN: 25, LAMP: 26, SHORE: 27, ROPE: 28, TUBE: 29 };
  // solid: blocks the body. hard: mining time scale. tier: pick tier needed (0 hands/any pick). drops: [item, min, max, chance]. lit: light radius in tiles (0 none).
  var TD = [];
  function td(id, n, o) { TD[id] = Object.assign({ n: n, solid: false, hard: 0, tier: 0, lit: 0, plant: 0, drops: null, c: "#000" }, o); }
  td(T.WATER, "Water"); td(T.AIR, "Air");
  td(T.SAND, "Sea Sand", { solid: true, hard: 0.35, c: "#d9c48a", drops: [["pebble", 0, 1, 0.3]] });
  td(T.SILT, "Brine Silt", { solid: true, hard: 0.5, c: "#7a8a6a", drops: [["clay", 0, 1, 0.45]] });
  td(T.ROCK, "Reef Rock", { solid: true, hard: 1.4, c: "#6d7a8a", drops: [["stone", 1, 1, 1]] });
  td(T.CPINK, "Pink Coral", { solid: true, hard: 0.7, c: "#ff7a9a", drops: [["coral", 1, 2, 1]] });
  td(T.CBLUE, "Blue Coral", { solid: true, hard: 0.7, c: "#5aa8ff", drops: [["coral", 1, 2, 1], ["seaglass", 0, 1, 0.2]] });
  td(T.CORANGE, "Fire Coral", { solid: true, hard: 0.7, c: "#ff9a4a", drops: [["coral", 1, 2, 1]] });
  td(T.DEEP, "Abyssal Rock", { solid: true, hard: 2.6, tier: 2, c: "#2c3446", drops: [["stone", 1, 2, 1], ["seaglass", 0, 1, 0.12]] });
  td(T.WOOD, "Wreck Timber", { solid: true, hard: 0.8, c: "#6a4a2c", drops: [["planks", 1, 2, 0.9]] });
  td(T.PLATE, "Wreck Plating", { solid: true, hard: 1.6, tier: 1, c: "#9a7a3a", drops: [["brass", 1, 2, 1], ["ironingot", 0, 1, 0.25]] });
  td(T.KELP, "Brine Kelp", { plant: 1, hard: 0.05, c: "#3f9a4c", drops: [["kelp", 1, 1, 1]] });
  td(T.GRASS, "Sea Grass", { plant: 1, hard: 0.05, c: "#6ab05a", drops: [["fiber", 0, 1, 0.5]] });
  td(T.GLOW, "Glow Coral", { solid: true, hard: 0.8, lit: 7, c: "#6af0e0", drops: [["coral", 1, 1, 1], ["jellygel", 0, 1, 0.25]] });
  td(T.CLAM, "Pearl Clam", { solid: true, hard: 0.9, lit: 2, c: "#c9b8e8", drops: [] });
  td(T.CHEST, "Sea Chest", { solid: true, hard: 9, c: "#b8843a" });
  td(T.BARREL, "Barrel", { solid: true, hard: 0.5, c: "#8a5a32", drops: [] });
  td(T.ANEM, "Stinging Anemone", { plant: 1, hard: 0.1, c: "#ff4a8a", lit: 2, drops: [["coral", 0, 1, 0.4]] });
  td(T.DOCK, "Dock Planks", { solid: true, hard: 99, c: "#8a6238" });
  td(T.POST, "Dock Post", { hard: 99, c: "#5a3d22" });
  td(T.LADDER, "Dock Ladder", { hard: 99, c: "#7a5a3a" });
  td(T.CANNON, "Old Cannon", { hard: 0.8, c: "#4a4a52", drops: [["ironingot", 1, 1, 0.6]] });
  td(T.FAN, "Sea Fan", { plant: 1, hard: 0.05, c: "#e870b8", drops: [["coral", 0, 1, 0.5]] });
  td(T.BED, "Bedrock", { solid: true, hard: 99, c: "#10131c" });
  td(T.AIRP, "Air Pocket", {});
  td(T.OPEN, "Opened Chest", { solid: true, hard: 9, c: "#7a5a2c" });
  td(T.LAMP, "Pier Lantern", { hard: 99, lit: 8, c: "#ffd23f" });
  td(T.SHORE, "Shore Sand", { solid: true, hard: 99, c: "#cdb67a" });
  td(T.ROPE, "Rope", { hard: 99, c: "#c9a876" });
  td(T.TUBE, "Tube Sponge", { plant: 1, hard: 0.05, c: "#ffb04a", drops: [["coral", 0, 1, 0.4]] });
  var TIDS = Object.keys(T).length;

  // ---- zones (depth in metres below the surface) ----
  var ZONES = [
    { n: "Sunlit Shallows", to: 24, c: "#6fe0e0" },
    { n: "Coral Reef", to: 60, c: "#ff8ac0" },
    { n: "Twilight Deep", to: 96, c: "#6a8aff" },
    { n: "Abyssal Trench", to: 999, c: "#a06aff" }
  ];
  function zoneOf(d) { for (var i = 0; i < ZONES.length; i++) if (d < ZONES[i].to) return i; return 3; }
  // pressure limit for your gear: tank tier 0 = no tank (only the suit): the deepest you can go without being crushed
  var LIMIT = { none: 22, suit: 40, 1: 60, 2: 90, 3: 120, 4: 999 };

  function sm(a) { return a * a * (3 - 2 * a); }
  function make(seed) {
    var s = (seed >>> 0) & 0xffff;
    function nz(x, f, k) { var u = x * f, a = Math.floor(u), b = sm(u - a); return hash(a, k, s) * (1 - b) + hash(a + 1, k, s) * b; }
    function nz2(x, y, f, k) { var ux = x * f, uy = y * f, ax = Math.floor(ux), ay = Math.floor(uy), bx = sm(ux - ax), by = sm(uy - ay);
      return (hash(ax, ay, s + k) * (1 - bx) + hash(ax + 1, ay, s + k) * bx) * (1 - by) + (hash(ax, ay + 1, s + k) * (1 - bx) + hash(ax + 1, ay + 1, s + k) * bx) * by; }
    return { nz: nz, nz2: nz2 };
  }

  var CHEST_NAMES = ["Sunken Crate", "Sea Chest", "Barnacled Chest", "Gilded Hoard"];

  function gen(seed, main) {
    var s = (seed >>> 0) & 0xffff, rnd = mulberry((seed >>> 0) ^ 0x5ea5ea), N = make(seed), W = OW, H = OH, t = new Uint8Array(W * H), x, y, i;
    var out = { w: W, h: H, t: t, seed: seed, main: !!main, chests: [], clams: [], mobs: [], lamps: [], spots: [], wrecks: [], caves: [], bed: new Int16Array(W) };
    var R = function (a, b) { return a + rnd() * (b - a); }, RI = function (a, b) { return Math.floor(R(a, b + 1)); };
    function set(x, y, id) { if (x >= 0 && x < W && y >= 0 && y < H) t[y * W + x] = id; }
    function get(x, y) { return x < 0 || x >= W || y < 0 || y >= H ? T.BED : t[y * W + x]; }
    for (y = 0; y < SEA; y++) for (x = 0; x < W; x++) t[y * W + x] = T.AIR;   // sky
    // ---- the sea floor: a shelf that drops away into the trench ----
    var bed = out.bed;
    for (x = 0; x < W; x++) {
      var b;
      if (x < 12) b = main ? SEA - 1 + (x < 8 ? 0 : 1) : 22;
      else if (x < 30) b = 16 + (x - 12) * 0.5;
      else if (x < 100) b = 25 + (x - 30) * 0.2;
      else if (x < 138) b = 39 + (x - 100) * 0.2;
      else if (x < 215) b = 47;
      else if (x < 262) b = 47 + sm((x - 215) / 47) * 50;
      else b = 97 + sm(Math.min(1, (x - 262) / 40)) * 64;
      b += (N.nz(x, 0.045, 1) - 0.5) * 9 + (N.nz(x, 0.19, 2) - 0.5) * 3 + (N.nz(x, 0.6, 3) - 0.5) * 1.2;
      if (!main && x < 12) b = 24 + (N.nz(x, 0.1, 4)) * 6;
      bed[x] = clamp(Math.round(b), SEA + 2, H - 8);
    }
    if (main) for (x = 0; x < DOCK0; x++) bed[x] = SEA - 1;
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    for (x = 0; x < W; x++) for (y = SEA; y < H; y++) {
      var id;
      if (y < bed[x]) id = T.WATER;
      else {
        var dp = y - bed[x];
        if (main && x < DOCK0) id = y === SEA - 1 ? T.SHORE : T.SAND;
        else if (dp < 2 && x < 250) id = T.SAND; else if (dp < 6 && N.nz2(x, y, 0.12, 5) < 0.65 + (x > 215 ? -0.4 : 0)) id = x < 220 ? T.SILT : T.ROCK; else id = (y > SEA + 78 || N.nz2(x, y, 0.07, 6) > 0.7) && y > SEA + 40 ? T.DEEP : T.ROCK;
      }
      t[y * W + x] = id;
    }
    for (x = 0; x < W; x++) { t[(H - 1) * W + x] = T.BED; t[(H - 2) * W + x] = T.BED; }
    for (y = 0; y < H; y++) { t[y * W] = y < SEA ? T.AIR : T.BED; t[y * W + W - 1] = y < SEA ? T.AIR : T.BED; t[y * W + W - 2] = y < SEA ? T.AIR : T.BED; }
    if (main) { for (x = 0; x < DOCK0; x++) for (y = SEA - 1; y < SEA + 14; y++) t[y * W + x] = y === SEA - 1 ? T.SHORE : T.SAND; }

    // ---- reef towers with coral caves ----
    var towers = [], tcount = main ? 9 : 8;
    for (i = 0; i < tcount; i++) {
      var cx = main ? 96 + i * 26 + RI(-8, 8) : RI(60, W - 80), bx = bed[clamp(cx, 2, W - 3)], hh = RI(10, 24), ww = RI(13, 24);
      if (cx > 250) { hh = RI(8, 18); }
      towers.push({ cx: cx, base: bx, h: hh, w: ww });
    }
    towers.forEach(function (tw, ti) {
      var x0 = tw.cx - tw.w - 2, x1 = tw.cx + tw.w + 2, k, d;
      for (x = Math.max(3, x0); x <= Math.min(W - 4, x1); x++) {
        d = Math.abs(x - tw.cx) / tw.w; if (d >= 1) continue;
        var top = tw.base - Math.round(tw.h * Math.pow(1 - Math.pow(d, 1.7), 0.8) * (0.72 + N.nz(x, 0.22, 7 + ti) * 0.5));
        for (y = top; y < bed[x]; y++) if (get(x, y) === T.WATER) set(x, y, tw.base > SEA + 70 || N.nz2(x, y, 0.1, 9) > 0.78 ? T.DEEP : T.ROCK);
      }
      // caves: a winding tunnel in from one side, with chambers, sometimes coming out the other side
      var dirn = rnd() < 0.5 ? 1 : -1, px = tw.cx - dirn * (tw.w - 2), py = tw.base - RI(3, Math.max(4, Math.floor(tw.h * 0.5))), steps = tw.w * 2 - 2, chambers = [];
      var tunnel = function (ax, ay, r) { for (var yy = -r; yy <= r; yy++) for (var xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r + 0.5 && Math.abs(ax + xx - tw.cx) < tw.w + 1) { var q = get(ax + xx, ay + yy); if (q === T.ROCK || q === T.DEEP || q === T.WATER) set(ax + xx, ay + yy, T.WATER); } };
      for (k = 0; k < steps; k++) {
        tunnel(Math.round(px), Math.round(py), k % 11 === 5 ? 2 : 1);
        px += dirn * (0.9 + rnd() * 0.4); py += (rnd() - 0.5) * 1.6 + (py > tw.base - 3 ? -0.5 : 0) + (py < tw.base - tw.h * 0.6 ? 0.5 : 0);
        py = clamp(py, tw.base - tw.h + 3, tw.base - 2);
        if (k % 9 === 8 || k === steps - 1) chambers.push({ x: Math.round(px), y: Math.round(py), r: RI(3, 5) });
      }
      chambers.forEach(function (c, ci) {
        for (var yy = -c.r; yy <= c.r; yy++) for (var xx = -c.r - 1; xx <= c.r + 1; xx++) {
          var dd = (xx * xx) / ((c.r + 1) * (c.r + 1)) + (yy * yy) / (c.r * c.r) + (N.nz2(c.x + xx, c.y + yy, 0.5, 10) - 0.5) * 0.35;
          if (dd < 1) { var q = get(c.x + xx, c.y + yy); if (q === T.ROCK || q === T.DEEP) set(c.x + xx, c.y + yy, T.WATER); }
        }
        // an air pocket under the ceiling of the chamber, glowing coral on the walls
        var apx = c.x, apy = c.y - c.r + 1; for (var ap = 0; ap < 3; ap++) { for (var aq = -2 + ap; aq <= 2 - ap; aq++) if (get(apx + aq, apy + ap) === T.WATER) set(apx + aq, apy + ap, T.AIRP); }
        if (get(apx, apy - 1) === T.WATER) set(apx, apy - 1, T.AIRP);
        out.caves.push({ x: c.x, y: c.y, r: c.r });
        var floorY = c.y + c.r + 1; for (var fy = c.y; fy <= c.y + c.r + 2; fy++) if (get(c.x, fy) !== T.WATER && get(c.x, fy) !== T.AIRP) { floorY = fy; break; }
        if (ci === chambers.length - 1 || rnd() < 0.4) { var cyy = floorY - 1; if (get(c.x + 1, cyy) === T.WATER) { set(c.x + 1, cyy, T.CHEST); out.chests.push({ x: c.x + 1, y: cyy, tier: tw.base < SEA + 30 ? 0 : tw.base < SEA + 52 ? 1 : tw.base < SEA + 84 ? 2 : 3, kind: ci === chambers.length - 1 ? "cave" : "nook", id: "c" + ti + "_" + ci }); } }
        for (var cl = 0; cl < 3; cl++) { var clx = c.x + RI(-c.r, c.r), cly = c.y + c.r + 3; for (var fy2 = c.y - 1; fy2 <= c.y + c.r + 4; fy2++) if (get(clx, fy2) !== T.WATER && get(clx, fy2) !== T.AIRP) { cly = fy2; break; } if (get(clx, cly - 1) === T.WATER && rnd() < 0.7) { set(clx, cly - 1, T.CLAM); out.clams.push({ x: clx, y: cly - 1 }); } }
        if (rnd() < 0.4) out.mobs.push({ k: "eel", x: c.x + 0.5, y: c.y + 0.5, home: 1 });
      });
    });
    // ---- caverns: winding coral caves bored into the rock below the sea floor, reached by sinkholes ----
    var worms = main ? 16 : 12;
    for (i = 0; i < worms; i++) {
      var wx = main ? RI(36, 300) : RI(24, W - 30), wy = bed[clamp(wx, 4, W - 5)] + 1, ang = Math.PI * (0.35 + rnd() * 0.3) * (rnd() < 0.5 ? 1 : -1) + (rnd() < 0.5 ? 0 : Math.PI);
      if (Math.sin(ang) < 0.1) ang = Math.PI / 2 + (rnd() - 0.5);
      var wr = 1.6 + rnd() * 0.8, st, fx2 = wx + 0.5, fy2 = wy;
      for (st = 0; st < 170; st++) {
        ang += (N.nz(st + i * 99, 0.18, 40) - 0.5) * 0.5 + (Math.sin(ang) < 0.15 ? 0.08 : 0); fx2 += Math.cos(ang) * 0.95; fy2 += Math.sin(ang) * 0.95;
        if (fy2 > H - 12 || fy2 < bed[clamp(Math.round(fx2), 4, W - 5)] - 2 || fx2 < 6 || fx2 > W - 8) { ang = Math.PI / 2 + (rnd() - 0.5); if (fy2 > H - 12 || fx2 < 6 || fx2 > W - 8) break; }
        var rr = (st % 28 === 20 ? 3 + rnd() * 2 : wr);
        for (var qy = -Math.ceil(rr); qy <= Math.ceil(rr); qy++) for (var qx = -Math.ceil(rr); qx <= Math.ceil(rr); qx++) if (qx * qx + qy * qy <= rr * rr) { var ex = Math.round(fx2) + qx, ey = Math.round(fy2) + qy, q3 = get(ex, ey); if ((q3 === T.ROCK || q3 === T.DEEP || q3 === T.SILT || q3 === T.SAND) && ey > SEA + 3 && ex > 3 && ex < W - 4 && !(main && ex < 12)) set(ex, ey, T.WATER); }
        if (st % 28 === 20) {
          var cxx = Math.round(fx2), cyy2 = Math.round(fy2), rc = Math.round(rr);
          var apx = cxx, apy = cyy2 - rc; if (get(apx, apy) === T.WATER) { set(apx, apy, T.AIRP); set(apx - 1, apy, get(apx - 1, apy) === T.WATER ? T.AIRP : get(apx - 1, apy)); set(apx + 1, apy, get(apx + 1, apy) === T.WATER ? T.AIRP : get(apx + 1, apy)); }
          var flY = cyy2 + rc + 1; for (var fy3 = cyy2; fy3 <= cyy2 + rc + 3; fy3++) if (get(cxx, fy3) !== T.WATER && get(cxx, fy3) !== T.AIRP) { flY = fy3; break; }
          out.caves.push({ x: cxx, y: cyy2, r: rc });
          if (rnd() < 0.32 && get(cxx, flY - 1) === T.WATER) { set(cxx, flY - 1, T.CHEST); out.chests.push({ x: cxx, y: flY - 1, tier: flY < SEA + 40 ? 1 : flY < SEA + 70 ? 2 : 3, kind: "cave", id: "k" + i + "_" + st }); }
          for (var cl2 = 0; cl2 < 3; cl2++) { var clx2 = cxx + RI(-rc, rc); for (var fy4 = cyy2 - 1; fy4 <= cyy2 + rc + 4; fy4++) if (get(clx2, fy4) !== T.WATER && get(clx2, fy4) !== T.AIRP) { if (get(clx2, fy4 - 1) === T.WATER && rnd() < 0.7) { set(clx2, fy4 - 1, T.CLAM); out.clams.push({ x: clx2, y: fy4 - 1 }); } break; } }
          if (rnd() < 0.2) out.mobs.push({ k: "eel", x: cxx + 0.5, y: cyy2 + 0.5, home: 1 });
        }
      }
    }
    // glow coral, coral colours and growth on every exposed rock surface in the reef bands
    for (y = SEA + 4; y < H - 3; y++) for (x = 3; x < W - 4; x++) {
      var q2 = t[y * W + x]; if (q2 !== T.ROCK && q2 !== T.SAND && q2 !== T.SILT && q2 !== T.DEEP) continue;
      var up = t[(y - 1) * W + x], dn = t[(y + 1) * W + x], lf = t[y * W + x - 1], rt = t[y * W + x + 1];
      var wet = function (v) { return v === T.WATER || v === T.AIRP; };
      var exposed = wet(up) || wet(dn) || wet(lf) || wet(rt), depth = y - SEA;
      if (!exposed) continue;
      var r2 = hash(x, y, s + 21);
      if (q2 === T.ROCK && depth > 10 && depth < 90) {
        var cn = N.nz2(x, y, 0.09, 22);
        if (cn > 0.52) t[y * W + x] = cn > 0.78 ? T.CORANGE : cn > 0.64 ? T.CBLUE : T.CPINK;
      }
      if (depth > 20 && r2 < (q2 === T.DEEP ? 0.06 : 0.035) && (wet(dn) || wet(lf) || wet(rt) || wet(up))) t[y * W + x] = T.GLOW;
      if (wet(up) && (q2 === T.SAND || q2 === T.SILT || t[y * W + x] === T.CPINK || t[y * W + x] === T.CBLUE || t[y * W + x] === T.CORANGE || q2 === T.ROCK) && up === T.WATER) {
        var r3 = hash(x, y, s + 33);
        if (depth < 36 && (q2 === T.SAND) && r3 < 0.1) { var kh = RI(4, 11), ky; for (ky = 1; ky <= kh && t[(y - ky) * W + x] === T.WATER && y - ky > SEA + 2; ky++) t[(y - ky) * W + x] = T.KELP; }
        else if (depth < 70 && r3 < 0.13) t[(y - 1) * W + x] = r3 < 0.04 ? T.ANEM : r3 < 0.08 ? T.FAN : r3 < 0.1 ? T.TUBE : T.GRASS;
        else if (depth >= 70 && r3 < 0.05) t[(y - 1) * W + x] = T.GRASS;
        if (depth > 8 && r3 > 0.97 && up === T.WATER && out.clams.length < 70 && get(x, y - 1) === T.WATER) { t[(y - 1) * W + x] = T.CLAM; out.clams.push({ x: x, y: y - 1 }); }
      }
    }
    // ---- wrecks: a ship on its side, tilted, half buried, with a raised stern and bow, masts and cannons ----
    function wreck(cx, name, w, hgt, big) {
      var base = bed[clamp(cx, 4, W - 5)], x0 = cx - Math.floor(w / 2), tilt = (rnd() < 0.5 ? -1 : 1) * (0.1 + rnd() * 0.1), interior = [], u, yy, deckRows = {};
      for (u = 0; u < w; u++) {
        var X = x0 + u, f = (u - (w - 1) / 2) / ((w - 1) / 2), shift = Math.round(f * w * tilt * 0.5), yKeel = base + 1 + shift;
        var bottom = yKeel - Math.round(3.4 * Math.pow(Math.abs(f), 2.4)), deckTop = bottom - hgt + (u < w * 0.24 ? 0 : u >= w - 3 ? 1 : 2);
        for (yy = deckTop; yy <= bottom; yy++) {
          if (get(X, yy) === T.BED) continue;
          var wall = u === 0 || u === w - 1 || yy === deckTop || yy === bottom || (big && yy === deckTop + 5 && u % 9 !== 4 && u > 2 && u < w - 3);
          if (yy === bottom) set(X, yy, u > 2 && u < w - 3 && ((u * 7 + yy) % 3 === 0) ? T.PLATE : T.WOOD);
          else if (wall) { if (rnd() < 0.07 && yy !== deckTop) set(X, yy, T.WATER); else set(X, yy, T.WOOD); }
          else { set(X, yy, T.WATER); interior.push([X, yy, bottom - yy]); }
        }
        if (u % 6 === 3 && u > 2 && u < w - 3) { var cyy = deckTop - 0; if (get(X, deckTop - 1) === T.WATER && rnd() < 0.8) set(X, deckTop - 1, T.CANNON); }
      }
      [[x0 + Math.round(w * 0.33), 8], [x0 + Math.round(w * 0.68), 11]].forEach(function (m, mi) { var topY = base - hgt - 1; for (yy = 0; yy < m[1]; yy++) { var Y = topY - yy; if (Y < SEA + 2) break; if (get(m[0], Y) === T.WATER || get(m[0], Y) === T.WOOD) set(m[0], Y, T.WOOD); if (yy === m[1] - 3) { for (var q = -2; q <= 2; q++) if (get(m[0] + q, Y) === T.WATER) set(m[0] + q, Y, T.WOOD); } } });
      var low = interior.filter(function (q) { return q[2] === 1; }), depthM = base - SEA, tr = depthM < 30 ? 1 : depthM < 60 ? 2 : 3;
      if (low.length) { var cc = low[Math.floor(low.length * 0.5)]; set(cc[0], cc[1], T.CHEST); out.chests.push({ x: cc[0], y: cc[1], tier: tr, kind: big ? "hoard" : "wreck", id: "w" + name, boat: 1 }); }
      low.forEach(function (q, qi) { if (qi % 6 === 2 && get(q[0], q[1]) === T.WATER) set(q[0], q[1], T.BARREL); });
      for (u = 0; u < (big ? 5 : 3); u++) { var pq = interior[RI(0, interior.length - 1)]; if (pq) out.mobs.push({ k: "pirate", x: pq[0] + 0.5, y: pq[1] + 0.5, home: 1, wreck: name }); }
      out.wrecks.push({ n: name, x: cx, y: base - hgt, w: w, h: hgt, big: !!big, x0: x0 });
      return interior;
    }
    wreck(main ? 154 : RI(100, 180), "The Rotten Lily", 30, 12, false);
    var gi = wreck(main ? 236 : RI(190, 250), "Gillbeard's Galleon", 40, 15, true);
    if (main) { var bc = gi[Math.floor(gi.length * 0.55)]; if (bc) out.mobs.push({ k: "captain", x: bc[0] + 0.5, y: bc[1] + 0.5, home: 1, boss: 1 }); }
    // ---- scatter: urchins, crates, clams in the shallows ----
    for (x = 16; x < W - 8; x += 1) {
      if (rnd() < 0.022 && bed[x] - SEA > 8) {
        var yb = bed[x]; if (get(x, yb) !== T.WATER && get(x, yb - 1) === T.WATER) out.mobs.push({ k: "urchin", x: x + 0.5, y: yb - 0.5, home: 1 });
      }
    }
    var nCr = 0; for (i = 0; i < 400 && nCr < 12; i++) {
      var qx = RI(14, W - 12), qy = bed[qx] - 1; if (get(qx, qy) === T.WATER && get(qx, qy + 1) !== T.WATER && get(qx, qy + 1) !== T.AIRP && (qy - SEA) > 3) {
        set(qx, qy, T.CHEST); out.chests.push({ x: qx, y: qy, tier: qy < SEA + 26 ? 0 : qy < SEA + 54 ? 1 : qy < SEA + 90 ? 2 : 3, kind: "crate", id: "s" + qx }); nCr++;
      }
    }
    // a chest on the first sandbar near the dock, so the first dive always finds something
    if (main) { var fx = 62, fy = bed[fx] - 1; set(fx, fy, T.CHEST); out.chests.push({ x: fx, y: fy, tier: 0, kind: "crate", id: "first", first: 1 }); }

    // ---- Croaker's Pier ----
    if (main) {
      for (x = DOCK0; x <= DOCK1; x++) { set(x, SEA - 1, x === DIVEX ? T.AIR : T.DOCK); if (x % 7 === 3) for (y = SEA; y < SEA + 9; y++) if (get(x, y) === T.WATER) set(x, y, T.POST); }
      for (y = SEA - 1; y <= SEA + 3; y++) set(DIVEX, y, T.LADDER);
      for (x = DOCK0 + 4; x < DOCK1; x += 9) { set(x, SEA - 2, T.LAMP); }
      out.pier = { x0: DOCK0, x1: DOCK1, dive: DIVEX, slip: SLIP, chestX: 30, shop: 19 };
      set(30, SEA - 2, T.CHEST); out.chests.push({ x: 30, y: SEA - 2, tier: 0, kind: "pier", id: "pier", boat: 1, first: 2 });
    }
    // keep the player spawn clear
    out.spawn = main ? { x: 16.5, y: SEA - 1 } : { x: Math.floor(W / 2) + 0.5, y: SEA + 0.4 };
    if (!main) for (x = 1; x < W - 2; x++) for (y = SEA; y < SEA + 3; y++) if (get(x, y) !== T.WATER) set(x, y, T.WATER);
    // air above the shore: shore is land
    for (x = 0; x < W; x++) out.bed[x] = bed[x];
    return out;
  }

  // =============================== THE SEA CHART (sailing) ===============================
  var ISLANDS = [
    ["Mossback Isle", "A hump of mossy rock shaped like a sleeping turtle.", 0], ["Lily Lagoon", "A ring of lily pads around a still green lagoon.", 0],
    ["Cinderback Atoll", "Black sand and a smoking cone. Warm water all around.", 1], ["Frostgill Rock", "A tooth of ice where the gulls wear scarves.", 2],
    ["Skull-Frog Cove", "Pirate territory. The flag has a very rude frog on it.", 3], ["Pearl Shoals", "Shallow water, and the oysters are watching you.", 0],
    ["Driftwood Haven", "Everything here is built from other things' wrecks.", 0], ["Croaker's Rest", "Where Old Croaker swears he once caught the Great Catfish.", 0],
    ["Kelpbeard Reef", "A drowned forest. The tops of the kelp poke out like whiskers.", 0], ["Gator Gulch", "Narrow, toothy, and not as empty as it looks.", 1],
    ["Whispering Sandbar", "A long pale bar that hums when the tide turns.", 0], ["Brine Bell Isle", "A rusted bell hangs from a dead tree. It rings when it wants to.", 3]
  ];
  var SEAW = 900;   // the chart is SEAW x SEAW tiles; the pier is at the middle of the south edge
  function seaGen(seed) {
    var rnd = mulberry((seed >>> 0) ^ 0xb0a7), isl = [], k, tries, d, ok;
    isl.push({ id: 0, n: "Croaker's Pier", d: "Home port.", x: SEAW / 2, y: SEAW - 24, r: 7, pier: 1, kind: 0, seed: 1 });
    var pos = [[SEAW / 2 - 60, SEAW - 120], [SEAW / 2 + 70, SEAW - 160], [SEAW / 2, SEAW - 260], [SEAW / 2 - 200, SEAW - 220], [SEAW / 2 + 210, SEAW - 300], [SEAW / 2 - 120, SEAW - 380], [SEAW / 2 + 90, SEAW - 450], [SEAW / 2 - 300, SEAW - 480], [SEAW / 2 + 300, SEAW - 560], [SEAW / 2 - 40, SEAW - 560], [SEAW / 2 - 220, SEAW - 640], [SEAW / 2 + 150, SEAW - 700]];
    for (k = 0; k < ISLANDS.length; k++) {
      var P = pos[k], x = P[0] + (rnd() - 0.5) * 40, y = P[1] + (rnd() - 0.5) * 40;
      isl.push({ id: k + 1, n: ISLANDS[k][0], d: ISLANDS[k][1], x: Math.round(x), y: Math.round(y), r: 6 + Math.floor(rnd() * 6), kind: ISLANDS[k][2], seed: Math.floor(rnd() * 1e9) });
    }
    return isl;
  }
  var api = { W: OW, H: OH, SEA: SEA, DOCK0: DOCK0, DOCK1: DOCK1, DIVEX: DIVEX, SLIP: SLIP, T: T, TD: TD, ZONES: ZONES, zoneOf: zoneOf, LIMIT: LIMIT, gen: gen, seaGen: seaGen, SEAW: SEAW, ISLANDS: ISLANDS, CHEST_NAMES: CHEST_NAMES };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SbxOcean = api;
})(typeof window !== "undefined" ? window : this);
