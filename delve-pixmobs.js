// DELVE PIXEL CREATURES (house style): creatures hand-drawn as rich pixel art at 32 px a block, the same look as the HD furniture.
// Each creature is a set of frames painted once (walk cycle, attack, hurt flash) and drawn crisp. First one: the Bramble Bug.
// DelvePix.frame(kind, state, n, flash) -> a canvas (feet on the bottom row, facing right) or null.
(function (root) {
  "use strict";
  var CACHE = {};
  function mk(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; var g = c.getContext("2d"); g.imageSmoothingEnabled = false; return { c: c, g: g }; }
  function white(src) { var o = mk(src.width, src.height); o.g.drawImage(src, 0, 0); o.g.globalCompositeOperation = "source-in"; o.g.fillStyle = "#ffffff"; o.g.fillRect(0, 0, src.width, src.height); return o.c; }

  // ---------- BRAMBLE BUG: a squat purple beetle with a shell of bramble thorns, 48 x 32 ----------
  // states: walk (patrol / retreat, 4 frames), charge (4 frames: head down, thorns up, eyes blazing)
  var SH = ["#14060f", "#22102a", "#341a3e", "#4a2656", "#64357a", "#82519a", "#a676bc", "#d0a6e0"];   // shell: ink .. shine
  var TH = ["#3a2a20", "#a8927a", "#d8c6aa", "#f1e5d0", "#fffaf0"], PINK = ["#a82a4a", "#ff6b82", "#ffc0cc"];
  function bug(st, n) {
    var o = mk(48, 32), g = o.g, K = root.DelveFurn.kit(g, 48, 32), R = K.R, P = K.P, ch = st === "charge";
    var bob = ch ? (n % 2) : (n === 1 || n === 3 ? 1 : 0), cy = 22 + bob, cx = 21, rx = 14, ry = 10, top = cy - ry;
    var stride = ch ? [3, 0, -3, 0][n] : [2, 0, -2, 0][n], lift = ch ? [0, 1, 0, 1][n] : [0, 1, 0, 1][n];
    // far legs (darker, behind the body)
    [[13, 1], [21, -1], [29, 1]].forEach(function (L, i) { var s = (i % 2 ? -stride : stride), fx = L[0] + 2 - s, fy = 31 - (i % 2 ? lift : 0); K.line(L[0] + 2, cy + 2, fx + 1, cy + 5, SH[1]); K.line(fx + 1, cy + 5, fx, fy, SH[1]); P(fx - 1, fy, SH[1]); });
    // thorns grow out of the shell (drawn first, so the shell covers their roots)
    [[11, 4, 1], [16, 6, 0], [21, 8, 1], [26, 6, 0], [31, 4, 1]].forEach(function (q) {
      var tx = q[0], hgt = q[1] + (ch ? 2 : 0), base = top + Math.round(Math.pow(Math.abs(tx - cx) / rx, 2) * ry * 0.9) + 2, tip = base - hgt - 2;
      for (var y = tip; y <= base; y++) { var k = (y - tip) / (base - tip), hw = Math.round(k * 1.6); R(tx - hw, y, hw * 2 + 1, 1, TH[3]); P(tx - hw - 1, y, TH[0]); P(tx + hw + 1, y, TH[0]); P(tx + hw, y, TH[1]); if (hw) P(tx - hw, y, TH[4]); }
      P(tx, tip - 1, TH[0]); P(tx, tip, PINK[1]); P(tx, tip + 1, PINK[ch ? 2 : 1]); if (q[2]) P(tx, tip - 1, PINK[0]);
    });
    // the shell: one dome, lit from the top left, a dark rim along the bottom
    for (var y = top; y <= cy + 3; y++) for (var x = cx - rx; x <= cx + rx; x++) {
      var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy > 1 || y > cy + 3) continue;
      var nz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)), lit = -0.42 * dx - 0.62 * dy + 0.66 * nz, idx = lit > 0.82 ? 6 : lit > 0.6 ? 5 : lit > 0.36 ? 4 : lit > 0.12 ? 3 : 2;   // a round dome, lit from the top left
      if (idx > 2 && ((x + y) & 1) && Math.abs(lit - [0, 0, 0, 0.12, 0.36, 0.6, 0.82][idx]) < 0.04) idx--;   // a touch of dither at each shade step
      P(x, y, SH[idx]);
    }
    for (var y2 = top; y2 <= cy + 3; y2++) for (var x2 = cx - rx; x2 <= cx + rx; x2++) {   // ink outline round the dome
      var inside = function (xx, yy) { var a = (xx + 0.5 - cx) / rx, b = (yy + 0.5 - cy) / ry; return a * a + b * b <= 1 && yy <= cy + 3; };
      if (inside(x2, y2) && (!inside(x2 - 1, y2) || !inside(x2 + 1, y2) || !inside(x2, y2 - 1) || !inside(x2, y2 + 1))) P(x2, y2, SH[0]);
    }
    for (var sx = cx - rx + 2; sx <= cx + rx - 2; sx++) { var a2 = (sx + 0.5 - cx) / (rx - 4); if (Math.abs(a2) <= 1) { var yy = Math.round(cy - Math.sqrt(1 - a2 * a2) * (ry - 4)); if (a2 > -0.85 && a2 < 0.6) { P(sx, yy, SH[2], 0.7); P(sx, yy + 1, SH[6], 0.3); } } }   // the shell's ridge, curving with the dome
    R(cx - rx + 2, cy + 2, rx * 2 - 3, 1, SH[1]); R(cx - rx + 3, cy + 3, rx * 2 - 5, 1, SH[0]);   // underside rim
    R(cx - 8, top + 2, 4, 1, SH[7]); R(cx - 9, top + 3, 2, 1, SH[7], 0.7); P(cx - 5, top + 2, SH[6]);   // shine
    [[14, 17], [26, 15], [20, 20]].forEach(function (s) { P(s[0], s[1] + bob, SH[1]); P(s[0] + 1, s[1] + bob, SH[2]); });   // pits in the shell
    // near legs: two-jointed, with little hooked feet
    [[13, 0], [21, 1], [29, 0]].forEach(function (L, i) { var s = (i % 2 ? stride : -stride), kx = L[0] + s * 0.5, fx = L[0] + 1 + s, fy = 31 - (i % 2 ? 0 : lift);
      var kxr = Math.round(kx); K.line(L[0], cy + 2, kxr - 1, cy + 5, SH[0]); K.line(L[0] + 1, cy + 2, kxr, cy + 5, SH[0]); K.line(L[0] + 1, cy + 1, kxr + 1, cy + 4, SH[3]); P(kxr, cy + 4, SH[5]);   // thigh with a lit top
      K.line(kxr, cy + 5, fx, fy, SH[0]); K.line(kxr - 1, cy + 5, fx - 1, fy, SH[0]); P(fx + 1, fy, SH[0]); P(fx - 2, fy, SH[0]); P(kxr - 1, cy + 6, SH[2]); });
    // the head: low and forward when it charges
    var hx = 37 + (ch ? 1 : 0), hy = 21 + bob + (ch ? 2 : 0);
    K.disc(hx, hy, 6.4, SH[0]); K.disc(hx - 0.3, hy - 0.3, 5.3, SH[3]); K.disc(hx - 1.5, hy - 1.8, 2.6, SH[4]); P(hx - 3, hy - 4, SH[6]); P(hx - 2, hy - 4, SH[5]);
    var eye = ch ? ["#ffe08a", "#ff7a3a", "#fffbe0"] : ["#ffb0a0", "#d86a6a", "#ffffff"];
    [[hx + 2, hy - 2], [hx - 2, hy - 2]].forEach(function (e, ei) { R(e[0] - 1, e[1] - 1, 3, 3, ei ? SH[1] : SH[0]); R(e[0] - 1, e[1] - 1, 2, 2, eye[ei ? 1 : 0]); P(e[0] - 1, e[1] - 1, eye[2]); P(e[0], e[1], "#2a0d18"); });
    if (ch) { R(hx - 4, hy - 5, 3, 1, SH[0]); R(hx + 1, hy - 4, 3, 1, SH[0]); K.halo(hx + 1, hy - 2, 5, "255,140,60", 0.35); }   // angry brows, blazing eyes
    else { P(hx - 3, hy - 4, SH[0]); P(hx + 2, hy - 4, SH[0]); }
    P(hx + 6, hy + 2, TH[3]); P(hx + 7, hy + 3, TH[2]); P(hx + 6, hy + 4, TH[3]); P(hx + 7, hy + 4, TH[0]); P(hx + 5, hy + 4, TH[2]);   // mandibles
    K.line(hx + 1, hy - 6, hx + 4, hy - 10 - (ch ? 0 : n % 2), SH[0]); P(hx + 4, hy - 10 - (ch ? 0 : n % 2), PINK[1]);   // antenna
    return o.c;
  }
  // ---------- WOLF (and the THORNBACK HOUND of Malcruor): a grey timber wolf, 64 x 40, anchor x 31 ----------
  // states: walk (4 frames, also idle on frame 0), wind (crouched, teeth bared, red eyes), lunge (stretched out mid-leap, jaws open).
  // Built from lit masses (body, deep chest, neck, skull, tapered muzzle, a bushy plume of a tail) and tapered legs with a backward hock,
  // a white chest ruff and cheek fur, then one dark tinted ink rim round the silhouette and where a near leg crosses the body.
  function wolfArt(K, st, n, mc) {
    var W = 64, H = 40, B = [], Z = [];   // B: colour per pixel, Z: part depth per pixel
    for (var i = 0; i < W * H; i++) { B.push(null); Z.push(-1); }
    var FUR = mc ? ["#140608", "#24161a", "#382628", "#4a3436", "#5e4848", "#7a6060", "#8a6e6a", "#a88c86"] : ["#1b232d", "#2b3746", "#3e4c5c", "#566779", "#74879a", "#93a3b3", "#b7c6d2", "#dbe6ee"];
    var LT = mc ? ["#6a5452", "#8a706a", "#a88c86"] : ["#b7c6d2", "#dbe6ee", "#f4f9fc"];   // chest ruff / belly
    var TIP = mc ? ["#5a0a10", "#a8141e", "#e8323a"] : ["#6fb8e8", "#a9e0ff", "#e6f8ff"];   // tail tip and frost
    var wind = st === "wind", lunge = st === "lunge", walk = st === "walk";
    var ph = walk ? n : 0, sw = walk ? [2, 0, -2, 0][ph] : 0, bob = walk ? [0, -1, 0, -1][ph] : 0;
    var by = 23 + bob + (wind ? 3 : 0) + (lunge ? -3 : 0), hx = 47 + (wind ? 1 : 0) + (lunge ? 2 : 0), hy = 14 + bob + (wind ? 6 : 0) + (lunge ? -1 : 0);
    function put(x, y, c, z) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; var k = y * W + x; if (z >= Z[k]) { B[k] = c; Z[k] = z; } }
    function ramp(lit) { return lit > 0.9 ? 7 : lit > 0.74 ? 6 : lit > 0.52 ? 5 : lit > 0.28 ? 4 : lit > 0.04 ? 3 : 2; }
    function dome(cx, cy, rx, ry, z, pal, bias, clip) {   // a lit round mass: top-left light, dark underneath, a touch of dither on the steps
      pal = pal || FUR; bias = bias || 0;
      for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (var x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d2 = dx * dx + dy * dy; if (d2 > 1 || (clip && !clip(x, y))) continue;
        var nz = Math.sqrt(1 - d2), lit = (-0.38 * dx - 0.66 * dy + 0.62 * nz) * 0.95 - 0.08 + bias, idx = ramp(lit);
        if (idx > 2 && ((x + y) & 1) && Math.abs(lit - [0, 0, 0, 0.04, 0.28, 0.52, 0.74, 0.9][idx]) < 0.05) idx--;
        put(x, y, pal[Math.min(pal.length - 1, idx)], z);
      }
    }
    function capsule(pts, r0, r1, z, pal, shade) {   // one tapered limb through the points, lit on its left
      pal = pal || FUR; var segs = [], L = 0; for (var i = 1; i < pts.length; i++) { var l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); L += l; }
      var acc = 0;
      for (i = 1; i < pts.length; i++) { var a = pts[i - 1], b = pts[i], l2 = segs[i - 1], steps = Math.max(2, Math.ceil(l2 * 3));
        for (var s = 0; s <= steps; s++) { var t = s / steps, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, r = r0 + (r1 - r0) * ((acc + l2 * t) / L);
          for (var yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) for (var xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) { var ddx = xx + 0.5 - x, ddy = yy + 0.5 - y; if (ddx * ddx + ddy * ddy > r * r) continue;
            var side = ddx / Math.max(0.8, r); put(xx, yy, pal[side < -0.45 ? (shade || 3) + 2 : side > 0.4 ? (shade || 3) - 1 : (shade || 3) + 1], z); } }
        acc += l2; }
    }
    // ---- legs: hind with a backward hock, front straight down to a padded paw ----
    function leg(x, y, off, front, far) {
      var z = far ? 1 : 8, sh = far ? 2 : 3, a = off;
      if (lunge) a = front ? 4 : -4; if (wind) a = front ? -1 : 1;
      var fy = 38, fx = x + a;
      var pts = front ? [[x, y], [x - 0.5 + a * 0.3, y + 5], [x + a * 0.7, y + 9], [fx, fy - 1]] : [[x, y], [x + 2 + a * 0.3, y + 4], [x - 1.5 + a * 0.6, y + 8.5], [fx, fy - 1]];
      if (lunge && front) pts = [[x, y], [x + 3, y + 4], [x + 6, y + 6], [x + 8, y + 8]];
      if (lunge && !front) pts = [[x, y], [x - 2, y + 5], [x - 5, y + 9], [x - 7, y + 12]];
      capsule(pts, front ? 3.3 : 4.4, 1.5, z, FUR, sh);
      var p = pts[pts.length - 1]; for (var k = -1; k <= 2; k++) put(p[0] + k, p[1] + 1, FUR[sh + (k < 1 ? 1 : 0)], z + 0.5);
      put(p[0] + 1, p[1] + 1, FUR[0], z + 0.6); put(p[0] + 2, p[1] + 1, FUR[0], z + 0.6);   // toe lines
    }
    leg(20, by + 3, -sw, false, true); leg(38, by + 4, sw, true, true);
    // ---- tail: a bushy plume sweeping back, frosted at the tip ----
    var tw = walk ? [0, 1, 0, -1][ph] : 0, tdrop = wind ? 4 : lunge ? -2 : 0;
    var tp = [[16, by - 2], [10, by - 3 + tdrop * 0.5], [5, by - 5 + tw + tdrop], [1, by - 6 + tw + tdrop]];
    var tp2 = [[17, by - 3], [12, by - 3 + tdrop * 0.4], [7, by - 5 + tw + tdrop * 0.8], [3, by - 7 + tw + tdrop]];
    for (var ti = 0; ti < 14; ti++) { var tt = ti / 13, sg = Math.min(2, Math.floor(tt * 3)), u = tt * 3 - sg, A = tp2[sg], Bq = tp2[sg + 1], cx2 = A[0] + (Bq[0] - A[0]) * u, cy2 = A[1] + (Bq[1] - A[1]) * u, rr = 4.6 - tt * 1.6 - Math.max(0, tt - 0.85) * 6;
      dome(cx2, cy2, rr + 0.6, rr, 3 + tt * 0.01, tt > 0.72 ? ["#000", "#000", TIP[0], TIP[0], TIP[1], TIP[1], TIP[2], TIP[2]] : FUR, 0.05); }
    [[8, by - 7 + tw + tdrop * 0.7], [12, by - 5], [5, by - 1 + tw + tdrop * 0.9], [10, by + 1]].forEach(function (q) { put(q[0], q[1], FUR[4], 3.1); put(q[0] + 1, q[1], FUR[4], 3.1); });   // fur tufts on the plume
    // ---- body: one long lit mass with a deep chest, a jagged fur line along the back ----
    dome(28, by, 14, 6.6, 4); dome(38, by + 0.5, 8, 7.6, 4.2);
    for (var bx = 15; bx <= 40; bx += 3) { var ty = by - (bx > 33 ? 7.4 : 6.2) + (bx < 20 ? 1 : 0); put(bx, ty, FUR[4], 4.1); put(bx + 1, ty, FUR[5], 4.1); put(bx + 1, ty - 1, FUR[5], 4.1); put(bx + 2, ty, FUR[4], 4.1); }   // back fur tufts
    // fur strokes on the flank (follow the form)
    [[22, by - 2], [26, by - 3], [30, by - 2], [24, by + 1], [29, by + 1]].forEach(function (q) { put(q[0], q[1], FUR[2], 4.5); put(q[0] + 1, q[1] + 1, FUR[2], 4.5); put(q[0] - 1, q[1] - 1, FUR[3], 4.5); });
    // ---- neck and chest ruff ----
    dome(43, (by + hy) / 2 + 1, 5.5, 7, 5);
    for (var ry = 0; ry < 9; ry++) { var rx0 = 41 + Math.round(ry * 0.2), w = 4 - Math.abs(ry - 4) * 0.5; for (var q = 0; q < w; q++) put(rx0 + q + 2, by - 4 + ry + (wind ? -1 : 0), LT[ry < 3 ? 2 : ry < 6 ? 1 : 0], 5.5); if (ry % 2) put(rx0 + 1, by - 4 + ry + 1, LT[0], 5.5); }   // white chest ruff
    // ---- ears (far one darker, drawn behind the head) ----
    function ear(x, far) { var z = far ? 5.6 : 7.5; for (var y = 0; y < 8; y++) { var w2 = Math.round((y / 7) * 3.4); for (var q = -w2; q <= w2; q++) put(x + q + (7 - y) * -0.25, hy - 4 - 7 + y, far ? FUR[3] : q < 0 ? FUR[5] : FUR[4], z); if (!far && y > 2 && w2 > 1) { put(x + (7 - y) * -0.25, hy - 4 - 7 + y, mc ? "#c4404a" : "#c98a9a", z + 0.1); if (y > 4) put(x + 1 + (7 - y) * -0.25, hy - 4 - 7 + y, mc ? "#8a2a32" : "#a8707e", z + 0.1); } } }
    ear(hx + 2, true); ear(hx - 1, false);
    // ---- head: skull and a long tapered muzzle in one mass ----
    dome(hx, hy, 7, 6, 7);
    var jaw = wind ? 2 : lunge ? 3 : 0;
    for (var mx = 0; mx < 8; mx++) { var top = hy - 1 + mx * 0.32, bot = hy + 4.2 - mx * 0.12; for (var my = Math.floor(top); my <= bot; my++) { var lit2 = my < top + 1.2 ? 6 : my < top + 2.6 ? 5 : my < bot - 0.8 ? 4 : 3; put(hx + 4 + mx, my, FUR[lit2], 7.2); } }   // muzzle: thick at the cheek, tapering to the nose
    if (jaw) { for (var jx = 0; jx < 8; jx++) for (var jy = 0; jy < 2; jy++) put(hx + 4 + jx, hy + 4 + jaw * (jx / 8) + jy, FUR[jy ? 3 : 4], 7.3);   // dropped lower jaw
      for (jx = 1; jx < 8; jx++) put(hx + 4 + jx, hy + 3.6 + jaw * (jx / 8) * 0.6, mc ? "#ff4a4a" : "#a83a4a", 7.25);   // open mouth
      [2, 5, 7].forEach(function (q) { put(hx + 4 + q, hy + 3, "#ffffff", 7.4); put(hx + 4 + q, hy + 3 + jaw * 0.6, "#ffffff", 7.4); }); }
    put(hx + 11, hy + 1.5, FUR[0], 7.6); put(hx + 12, hy + 1.5, FUR[0], 7.6); put(hx + 11, hy + 2.5, FUR[1], 7.6); put(hx + 10, hy + 1.5, FUR[1], 7.6);   // nose
    for (var lm = 5; lm < 11; lm++) put(hx + lm, hy + 3.6 - lm * 0.06, FUR[1], 7.3);   // the mouth line
    // cheek ruff (white) under the eye, jagged
    [[hx - 2, hy + 3], [hx - 1, hy + 4], [hx, hy + 4], [hx + 1, hy + 3], [hx - 3, hy + 2], [hx + 2, hy + 4]].forEach(function (q) { put(q[0], q[1], LT[1], 7.4); });
    put(hx - 2, hy + 5, LT[0], 7.4); put(hx + 1, hy + 5, LT[0], 7.4);
    // eye: a narrow scowling eye, icy (or red when it means to bite)
    var angry = wind || lunge || mc, EY = mc ? ["#ff8a3a", "#ffd27a"] : angry ? ["#ff4a3a", "#ffb0a0"] : ["#4ab8f0", "#c9ecff"];
    put(hx + 2, hy - 1, EY[0], 7.8); put(hx + 3, hy - 1, EY[1], 7.8); put(hx + 4, hy - 1, FUR[0], 7.8); put(hx + 1, hy - 1, FUR[0], 7.8);
    put(hx + 1, hy - 2, FUR[0], 7.8); put(hx + 2, hy - 2, FUR[0], 7.8); put(hx + 3, hy - 2, FUR[1], 7.8); put(hx + 4, hy - 2, FUR[0], 7.8);   // the brow
    if (mc) {   // THORNBACK HOUND: bloodthorn spines up the back and bare ribs on the flank
      [[19, 6], [24, 8], [29, 9], [34, 9], [39, 7]].forEach(function (s) { var bx2 = s[0], h2 = s[1] + (wind ? 2 : 0), base = by - 4; for (var y3 = 0; y3 < h2 + 3; y3++) { var w3 = (1 - y3 / (h2 + 3)) * 2.6; for (var q3 = Math.round(-w3); q3 <= Math.round(w3 * 0.6); q3++) put(bx2 + q3 - y3 * 0.45, base - y3, y3 > h2 - 1 ? "#ffd0c0" : q3 < 0 ? TIP[2] : TIP[1], 3.9); } });
      [24, 27, 30, 33].forEach(function (rx2) { for (var y4 = -2; y4 <= 3; y4++) put(rx2 + y4 * 0.3, by + y4, y4 < 0 ? "#e8dcc8" : "#c4b49c", 4.6); });
    }
    // near legs last, in front of the body
    leg(18, by + 2, sw, false, false); leg(40, by + 3, -sw, true, false);
    // frost glints on the tail (blue wolf)
    // ---- ink: a dark tinted rim round the whole silhouette, and where a near part crosses one behind it ----
    var O = B.slice();
    for (var y5 = 0; y5 < H; y5++) for (var x5 = 0; x5 < W; x5++) { var k5 = y5 * W + x5; if (!B[k5]) continue;
      var edge = false, z0 = Z[k5]; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var x6 = x5 + d[0], y6 = y5 + d[1]; if (x6 < 0 || y6 < 0 || x6 >= W || y6 >= H || !B[y6 * W + x6]) edge = true; else if (z0 >= 8 && Z[y6 * W + x6] < 7.9 && Z[y6 * W + x6] >= 0 && d[0] !== 0) edge = true; });
      if (edge) O[k5] = FUR[0]; }
    for (var k7 = 0; k7 < W * H; k7++) if (O[k7]) K.P(k7 % W, Math.floor(k7 / W), O[k7]);
  }

  function wolf(st, n) { var o = mk(64, 40); wolfArt(root.DelveFurn.kit(o.g, 64, 40), st, n, false); return o.c; }
  function wolfmc(st, n) { var o = mk(64, 40); wolfArt(root.DelveFurn.kit(o.g, 64, 40), st, n, true); return o.c; }
  // ---------- THE PAINTER: a little layered pixel buffer shared by the creatures below ----------
  // put(x, y, colour, depth, ink) keeps the nearest part; dome() = a lit round mass, capsule() = a tapered limb, poly() = a shaded shape,
  // ink(front) = one dark tinted rim round the silhouette plus where a near part (depth >= front) crosses one behind it.
  function Painter(W, H) {
    var B = new Array(W * H).fill(null), Z = new Float32Array(W * H).fill(-1), I = new Array(W * H).fill(null), S = {};
    S.W = W; S.H = H;
    S.put = function (x, y, c, z, ink) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H || !c) return; var k = y * W + x; if (z >= Z[k]) { B[k] = c; Z[k] = z; I[k] = ink || I[k]; } };
    S.get = function (x, y) { return x < 0 || y < 0 || x >= W || y >= H ? null : B[y * W + x]; };
    S.zat = function (x, y) { return x < 0 || y < 0 || x >= W || y >= H ? -1 : Z[y * W + x]; };
    S.ramp = function (lit) { return lit > 0.9 ? 7 : lit > 0.74 ? 6 : lit > 0.52 ? 5 : lit > 0.28 ? 4 : lit > 0.04 ? 3 : 2; };
    var TH = [0, 0, 0, 0.04, 0.28, 0.52, 0.74, 0.9];
    // a lit round mass (pal: 8 shades, ink .. shine), top-left light, dark underneath, dither on the steps
    S.dome = function (cx, cy, rx, ry, z, pal, bias, clip, ink) {
      bias = bias || 0;
      for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (var x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d2 = dx * dx + dy * dy; if (d2 > 1 || (clip && !clip(x, y))) continue;
        var nz = Math.sqrt(1 - d2), lit = (-0.38 * dx - 0.66 * dy + 0.62 * nz) * 0.95 - 0.08 + bias, idx = S.ramp(lit);
        if (idx > 2 && ((x + y) & 1) && Math.abs(lit - TH[idx]) < 0.05) idx--;
        S.put(x, y, pal[Math.min(pal.length - 1, idx)], z, ink || pal[0]);
      }
    };
    // a tapered limb through the points, lit on its left (sh: base shade index)
    S.capsule = function (pts, r0, r1, z, pal, sh, ink) {
      sh = sh == null ? 3 : sh; var segs = [], L = 0, i; for (i = 1; i < pts.length; i++) { var l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); L += l; }
      var acc = 0;
      for (i = 1; i < pts.length; i++) { var a = pts[i - 1], b = pts[i], l2 = segs[i - 1], steps = Math.max(2, Math.ceil(l2 * 3));
        for (var s = 0; s <= steps; s++) { var t = s / steps, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, r = r0 + (r1 - r0) * ((acc + l2 * t) / (L || 1));
          for (var yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) for (var xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) { var ddx = xx + 0.5 - x, ddy = yy + 0.5 - y; if (ddx * ddx + ddy * ddy > r * r) continue;
            var side = (ddx - ddy * 0.5) / Math.max(0.8, r); S.put(xx, yy, pal[Math.max(1, Math.min(pal.length - 1, side < -0.4 ? sh + 2 : side > 0.4 ? sh - 1 : sh + 1))], z, ink || pal[0]); } }
        acc += l2; }
    };
    // a filled polygon, coloured per pixel by fn(x, y, v) where v is 0 at the top of the shape and 1 at the bottom
    S.poly = function (pts, z, fn, ink) {
      var y0 = 1e9, y1 = -1e9, i; pts.forEach(function (p) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
      for (var y = Math.floor(y0); y <= Math.ceil(y1); y++) { var yc = y + 0.5, xs = [];
        for (i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
        xs.sort(function (p, q) { return p - q; });
        for (i = 0; i + 1 < xs.length; i += 2) for (var x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) S.put(x, y, fn(x, y, (y - y0) / Math.max(1, y1 - y0)), z, ink); }
    };
    S.line = function (x0, y0, x1, y1, c, z, ink) { var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1; for (var i = 0; i <= n; i++) S.put(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c, z, ink); };
    // ink: a dark rim round the silhouette, and where a near part (z >= front) meets one behind it
    S.ink = function (front, dflt) {
      var O = B.slice(), k, x, y;
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) { k = y * W + x; if (!B[k]) continue; var e = false, z0 = Z[k];
        for (var d = 0; d < 4; d++) { var x2 = x + [1, -1, 0, 0][d], y2 = y + [0, 0, 1, -1][d];
          if (x2 < 0 || y2 < 0 || x2 >= W || y2 >= H || !B[y2 * W + x2]) { e = true; break; }
          if (front != null && z0 >= front && Z[y2 * W + x2] < front - 0.05 && Z[y2 * W + x2] >= 0) { e = true; break; } }
        if (e && !NOINK[k]) O[k] = I[k] || dflt; }
      B = O;
    };
    var NOINK = {}; S.noink = function (x, y) { NOINK[Math.round(y) * W + Math.round(x)] = 1; };
    S.flush = function (K) { for (var k = 0; k < W * H; k++) if (B[k]) K.P(k % W, Math.floor(k / W), B[k]); };
    return S;
  }

  // ---------------- GATOR: 72 x 24, anchor x 35, belly on the bottom ----------------
  function gatorArt(K, st, n, jaw) {
    var S = Painter(72, 24), walk = st === "walk", wind = st === "wind";
    var SK = ["#131f0d", "#1f3318", "#2f4f22", "#3e6630", "#4d7a3a", "#5e8c46", "#76a352", "#9cc46e"], BL = ["#4a4a2a", "#7a7a48", "#a8a870", "#c9c98a", "#e2e2a8"];
    var ph = walk ? n : 0, sw = walk ? [2, 0, -2, 0][ph] : 0, tsw = walk ? [1, 0, -1, 0][ph] : 0, by = 15;
    // far legs
    [[24, -1], [44, 1]].forEach(function (L) { var o = L[1] * sw; S.capsule([[L[0], by + 3], [L[0] + 2 + o, by + 6], [L[0] + 3 + o, 22]], 2.6, 1.6, 1, SK, 1); for (var q = 0; q < 4; q++) S.put(L[0] + 2 + o + q, 23, SK[2], 1.1); });
    // back scutes (behind the body so it covers their roots)
    for (var sx = 13; sx <= 48; sx += 4) { var top = by - 6 + (sx < 20 ? 1 : 0); S.put(sx, top - 1, SK[5], 2); S.put(sx + 1, top - 1, SK[4], 2); S.put(sx, top - 2, SK[6], 2); S.put(sx - 1, top, SK[5], 2); S.put(sx + 2, top, SK[3], 2); }
    // tail: a long armoured taper, swinging
    S.poly([[22, by - 5], [12, by - 3 + tsw * 0.5], [2, by + 1 + tsw], [1, by + 2 + tsw], [12, by + 4 + tsw * 0.5], [22, by + 5]], 3, function (x, y, v) { return v < 0.25 ? SK[5] : v < 0.55 ? SK[4] : v < 0.8 ? SK[3] : SK[2]; }, SK[0]);
    for (var tx = 5; tx < 21; tx += 3) S.put(tx, by - 3 + (21 - tx) * 0.12 + tsw * (21 - tx) / 20, SK[6], 3.1);   // tail ridge
    // body: one long low lit mass with a pale belly
    S.dome(34, by, 16, 6.2, 4, SK);
    for (var bx = 21; bx <= 47; bx++) { var dx = (bx - 34) / 16, bot = Math.floor(by + 6.2 * Math.sqrt(Math.max(0, 1 - dx * dx))) - 1; if (bot > by + 2) { S.put(bx, bot, BL[2], 4.2); S.put(bx, bot - 1, BL[3], 4.2); if ((bx & 1) === 0) S.put(bx, bot - 1, BL[2], 4.2); } }
    for (var cx = 22; cx <= 46; cx += 3) { S.put(cx, by - 3, SK[3], 4.3); S.put(cx + 1, by - 2, SK[3], 4.3); S.put(cx, by - 1, SK[5], 4.3); }   // armour plates on the back
    // head: the upper jaw with the eye bump; the lower jaw hinges open behind the eye
    var j = Math.min(1, jaw || 0), drop = Math.round(j * 6);
    S.poly([[46, by + 2], [69, by + 2 + drop * 0.85], [69, by + 4 + drop], [47, by + 5]], 5, function (x, y, v) { return v < 0.4 ? SK[6] : SK[4]; }, SK[0]);   // lower jaw
    if (drop > 1) { S.poly([[47, by + 2], [68, by + 1], [68, by + 2 + drop * 0.85]], 5.2, function () { return "#8a2030"; }, "#4a1018"); for (var t2 = 50; t2 < 68; t2 += 3) S.put(t2, by + 2 + drop * 0.85 * (t2 - 47) / 21 - 1, "#f6eedb", 5.3); }
    S.poly([[44, by - 6], [52, by - 6], [70, by - 1], [71, by + 2], [46, by + 3]], 6, function (x, y, v) { return v < 0.2 ? SK[6] : v < 0.5 ? SK[5] : v < 0.8 ? SK[4] : SK[3]; }, SK[0]);   // upper jaw / snout
    for (var t3 = 50; t3 < 70; t3 += 3) { S.put(t3, by + 3, "#f6eedb", 6.2); if (drop <= 1) S.put(t3 + 1, by + 3, "#d8d0bc", 6.2); }   // the teeth along the closed jaw line
    S.dome(51, by - 6, 3.6, 3.2, 6.5, SK);   // eye bump
    var EY = wind || j > 0.2 ? ["#ff5a3a", "#ffb0a0"] : ["#f2c14e", "#fff0b0"];
    S.put(51, by - 7, EY[0], 6.8); S.put(52, by - 7, EY[0], 6.8); S.put(51, by - 6, EY[0], 6.8); S.put(52, by - 6, "#0c1408", 6.8); S.put(51, by - 8, EY[1], 6.8); S.put(50, by - 8, SK[0], 6.8); S.put(53, by - 8, SK[0], 6.8);
    S.put(68, by - 2, SK[0], 6.6); S.put(69, by - 2, SK[1], 6.6);   // nostril
    // near legs: short and sprawled, clawed feet
    [[26, 1], [46, -1]].forEach(function (L) { var o = L[1] * sw; S.capsule([[L[0], by + 3], [L[0] + 2 + o, by + 6], [L[0] + 3 + o, 22]], 3, 1.7, 8, SK, 3); for (var q = 0; q < 4; q++) S.put(L[0] + 2 + o + q, 23, SK[q === 3 ? 0 : 2], 8.1); });
    S.ink(8, SK[0]); S.flush(K);
  }

  // ---------------- SLIME: 40 x 32, anchor x 20, base on the bottom ----------------
  var SLP = [["#13400f", "#2a7a24", "#3a9a30", "#4ab83c", "#5ad04a", "#78e266", "#9af58a", "#d8ffd0"], ["#4a1404", "#a83a10", "#d0521a", "#f06a22", "#ff7a2a", "#ff9a3a", "#ffc24a", "#fff0b0"], ["#0e2a52", "#2a5a9a", "#3a7ad0", "#52a0f0", "#6ab8ff", "#8ccaff", "#c8ecff", "#f4fbff"], ["#1a0206", "#3a0610", "#5a0a18", "#7a1020", "#8e1426", "#b02a3a", "#e85a6a", "#ffb0b8"]];
  function slimeArt(K, st, n, b) {
    var S = Painter(40, 32), P = SLP[b] || SLP[0], MC = b === 3;
    var sx = 1, sy = 1; if (st === "squash") { sx = 1.22; sy = 0.78; } else if (st === "up") { sx = 0.86; sy = 1.2; } else if (st === "down") { sx = 0.94; sy = 1.08; } else { sx = n ? 1.03 : 1; sy = n ? 0.97 : 1; }
    var rx = 14.5 * sx, hh = 18 * sy, cx = 20, base = 31;
    // the jelly: a dome with a flat bottom, lit from the top left, a darker core and a big wet shine
    for (var y = Math.floor(base - hh); y <= base; y++) for (var x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      var v = (base + 0.5 - (y + 0.5)) / hh, w = rx * Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, v - 0.25) / 0.75, 2)), 0.5) * (v < 0.25 ? 1 : 1) ; if (v > 1 || v < 0) continue;
      var dx = (x + 0.5 - cx) / Math.max(1, w); if (Math.abs(dx) > 1) continue;
      var dy = 1 - 2 * v, nz = Math.sqrt(Math.max(0, 1 - dx * dx * 0.8)), lit = (-0.4 * dx - 0.55 * dy + 0.55 * nz) * 0.95 - 0.02, idx = S.ramp(lit);
      if (idx > 2 && ((x + y) & 1) && Math.abs(lit - [0, 0, 0, 0.04, 0.28, 0.52, 0.74, 0.9][idx]) < 0.06) idx--;
      S.put(x, y, P[Math.max(3, idx)], 2, P[0]);
    }
    var ccx = cx - 3 * sx, ccy = base - 6 * sy;   // the core (a darker cloud deep in the jelly)
    for (var y2 = -4; y2 <= 4; y2++) for (var x2 = -7; x2 <= 7; x2++) if ((x2 * x2) / 49 + (y2 * y2) / 12 < 1 && ((x2 + y2) & 1 || (x2 * x2) / 49 + (y2 * y2) / 12 < 0.5)) S.put(ccx + x2 * sx, ccy + y2 * sy, P[2], 2.5);
    if (MC) {   // GORE SLIME: a skull and a bone in the clot, blood bubbles
      var kx = cx - 6, ky = base - 9; [[0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [2, 1], [3, 1], [-1, 2], [0, 2], [1, 2], [2, 2], [3, 2], [0, 3], [1, 3], [2, 3], [0, 4], [2, 4]].forEach(function (q) { S.put(kx + q[0], ky + q[1], "#d8ccb4", 2.7); });
      S.put(kx, ky + 2, "#3a0a10", 2.8); S.put(kx + 2, ky + 2, "#3a0a10", 2.8); S.put(kx + 1, ky + 4, "#3a0a10", 2.8);
      for (var bb = 0; bb < 6; bb++) S.put(cx + 3 + bb, base - 4 - bb * 0.5, "#d8ccb4", 2.7); S.put(cx + 2, base - 3, "#d8ccb4", 2.7); S.put(cx + 9, base - 7, "#d8ccb4", 2.7);
      [[cx - 9, base - 13], [cx + 5, base - 15], [cx - 2, base - 3]].forEach(function (q) { S.put(q[0], q[1], P[6], 2.9); });
    }
    // shine
    var sxh = cx - 7 * sx, syh = base - hh + 4; [[0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [-1, 2], [0, 2]].forEach(function (q) { S.put(sxh + q[0], syh + q[1], P[7], 3); }); S.put(sxh + 4, syh, P[6], 3); S.put(sxh - 2, syh + 4, P[6], 3);
    // face
    var fy = base - 10 * sy, ex1 = cx + 3 * sx, ex2 = cx + 9 * sx, EC = MC ? "#ff8a3a" : "#14200f";
    [ex1, ex2].forEach(function (ex, i) { for (var q = 0; q < 4; q++) { S.put(ex, fy - 1 + q - 1, EC, 4); S.put(ex + 1, fy - 1 + q - 1, EC, 4); } if (!MC) S.put(ex, fy - 2, "#ffffff", 4.1); else { S.put(ex, fy - 1, "#ffe08a", 4.1); } });
    if (MC) { for (var mq = 0; mq < 6; mq++) S.put(ex1 + mq, fy + 4 + (mq & 1), "#1a0206", 4); }
    else { S.put(ex1 + 1, fy + 4, "#14200f", 4); S.put(ex1 + 2, fy + 5, "#14200f", 4); S.put(ex1 + 3, fy + 5, "#14200f", 4); S.put(ex1 + 4, fy + 5, "#14200f", 4); S.put(ex1 + 5, fy + 4, "#14200f", 4); }
    if (b === 2) [[cx - 6, 4], [cx + 1, 5]].forEach(function (s) { var tb = base - hh + 1; for (var q = 0; q < s[1]; q++) { var w2 = Math.round((1 - q / s[1]) * 1.6); for (var r = -w2; r <= w2; r++) S.put(s[0] + r + 1, tb - q, r < 0 ? "#ffffff" : "#c8ecff", 1.5, "#2a5a9a"); } });   // frost spikes
    S.ink(null, P[0]);
    if (MC) [[cx - 9, 0], [cx + 2, 1], [cx + 10, 0]].forEach(function (d) { for (var q = 0; q < 2 + d[1] + n; q++) S.put(d[0], base - 0 + q - 1, "#7a0e1c", 9); });
    S.flush(K);
  }

  // ---------------- SPIDER: 64 x 32, anchor x 32, feet on the bottom ----------------
  var SPP = [{ b: ["#08050a", "#1a1620", "#2a2430", "#3a3242", "#4a4256", "#5a5068", "#6a5e72", "#9a8ea8"], m: ["#2a6a28", "#6fd06a", "#b8ffb0"] }, { b: ["#0a0504", "#24120c", "#40261e", "#54342a", "#664032", "#74503e", "#8a6450", "#b08a74"], m: ["#8a3010", "#ff7a2f", "#ffc08a"] },
    { b: ["#05080c", "#1a2430", "#2a3644", "#38485a", "#48586c", "#62788c", "#7a92a8", "#a8c0d4"], m: ["#2a6a8a", "#9fe8ff", "#e8fbff"] }, { b: ["#1a0608", "#5a4a3a", "#8a7a64", "#a8987e", "#b8a890", "#d0c4ac", "#e8dcc8", "#f8f0e2"], m: ["#6a0610", "#e0101e", "#ff7a7a"] }];
  function spiderArt(K, st, n, b) {
    var S = Painter(64, 32), P = SPP[b] || SPP[0], B = P.b, M = P.m, MC = b === 3, walk = st === "walk", crouch = st === "crouch";
    var by = crouch ? 23 : 20, bob = walk ? [0, -1, 0, -1][n] : 0; by += bob;
    var LEG = MC ? "#d0c4ac" : B[3], LEG2 = MC ? "#a8987e" : B[2], LD = MC ? "#8a7a64" : B[1];
    function leg(i, far) {   // one jointed leg: up to a high knee, then down to a pointed foot
      var side = i < 2 ? 1 : -1, k = i % 2, hipx = 34 + (i < 2 ? 2 + k * 2 : -2 - k * 2), ph = walk ? ((n + i + (far ? 1 : 0)) % 4) : 0, st2 = walk ? [2, 1, -2, -1][ph] : 0, lift = walk && (ph === 0) ? 2 : 0;
      var spread = (i < 2 ? (k ? 13 : 20) : -(k ? 14 : 21)) + (far ? -side * 3 : 0), kx = hipx + spread * 0.5 + st2 * 0.4, ky = by - (crouch ? 9 : 14) - lift + (far ? 1 : 0), fx = hipx + spread + st2, fy = 31 - lift;
      var z = far ? 1 : 7, c = far ? LD : LEG, c2 = far ? B[1] : LEG2;
      S.line(hipx, by - 1, kx, ky, c, z, B[0]); S.line(hipx, by, kx, ky + 1, c2, z, B[0]); S.line(kx, ky, fx, fy, c, z, B[0]); S.put(fx, fy, B[0], z);
      S.put(kx, ky, far ? B[2] : B[6], z + 0.1);   // knee glint
      if (MC) { var mx = (kx + fx) / 2, my = (ky + fy) / 2; S.put(mx, my, M[1], z + 0.2); S.put(mx + side * -0.5, my + 1, M[0], z + 0.2); }   // red bands
    }
    for (var i = 0; i < 4; i++) leg(i, true);
    // abdomen (big, glossy, behind) and the head-body in front
    S.dome(24, by - 3, 11, 8.5, 3, B);
    var hg = [[24, by - 9], [22, by - 7], [26, by - 7], [24, by - 6], [23, by - 4], [25, by - 4], [24, by - 3]];
    if (MC) hg = [[23, by - 8], [24, by - 8], [25, by - 8], [24, by - 7], [24, by - 6], [23, by - 5], [24, by - 5], [25, by - 5]];
    hg.forEach(function (q, qi) { S.put(q[0], q[1], qi % 3 === 0 ? M[2] : M[1], 3.2); });   // the marking
    if (!MC) { [[18, by - 5], [30, by - 5], [17, by - 1], [31, by - 1]].forEach(function (q) { S.put(q[0], q[1], M[0], 3.2); S.put(q[0] + (q[0] < 24 ? 1 : -1), q[1] - 1, M[1], 3.2); }); }
    S.dome(39, by - 2, 7, 5.6, 5, B);
    // eyes: a cluster of red beads, fangs below
    var EY = MC ? ["#ff3a3a", "#ffb0a0"] : ["#ff3a4a", "#ffb0b8"];
    [[43, by - 5], [45, by - 4], [42, by - 3], [44, by - 3], [46, by - 2], [43, by - 6]].forEach(function (q, qi) { S.put(q[0], q[1], qi % 2 ? EY[0] : EY[1], 5.5); });
    S.put(45, by + 3, "#e8e0d0", 5.6); S.put(46, by + 4, "#e8e0d0", 5.6); S.put(42, by + 3, "#e8e0d0", 5.6); S.put(43, by + 4, "#c8c0b0", 5.6);   // fangs
    for (i = 0; i < 4; i++) leg(i, false);
    S.ink(7, B[0]); S.flush(K);
  }

  // ---------------- BOG WITCH: 48 x 80, anchor x 22, feet on the bottom ----------------
  function witchArt(K, st, n, mc) {
    var S = Painter(48, 80), wind = st === "wind", sway = n ? 1 : 0;
    var RB = mc ? ["#140406", "#2a0408", "#4a0810", "#6a0e18", "#8a1622", "#a81e2a", "#c8323e", "#e85a62"] : ["#120818", "#24122e", "#34204a", "#4a2a62", "#5e3878", "#6e4a8c", "#8a64a8", "#a888c4"];
    var SKN = mc ? ["#2a2224", "#5a4a4c", "#7a6a6c", "#a89a9a", "#c4b8b8", "#d8cccc", "#ece4e4"] : ["#1a3a12", "#2e5a1e", "#3e7a2e", "#5a9a42", "#7fbf5a", "#a8dc7a", "#ccf0a4"];
    var HAIR = mc ? ["#0a0204", "#1e0a0c", "#4a2a2e"] : ["#4a4a56", "#8a8a96", "#c8c8d2"], BAND = mc ? "#c8101e" : "#9a5ad8", POT = mc ? ["#6a0610", "#c8101e", "#ff7a7a"] : ["#5a2a9a", "#b06aff", "#ecd0ff"];
    // the staff behind her
    S.line(10 - sway, 34, 4 - sway, 78, "#5a3a20", 1, "#2a1a0e"); S.line(11 - sway, 34, 5 - sway, 78, "#8a6040", 1, "#2a1a0e"); S.put(10 - sway, 33, "#6a4a2a", 1); S.put(9 - sway, 32, "#8a6040", 1);
    // the robe: one flowing bell, folds, a ragged hem
    var hem = [];
    S.poly([[15 + sway * 0.5, 29], [31 + sway * 0.5, 29], [34, 38], [35 + sway * 0.6, 56], [39 + sway, 78], [6 + sway, 78], [10 + sway * 0.6, 56], [12, 38]], 3, function (x, y, v) { var c = 16 + 7 + sway * 0.5, f = (x - (c - 4)) / 22, fold = Math.sin((x - c) * 0.9 + 1) > 0.65; var idx = f < 0.12 ? 6 : f < 0.4 ? 5 : f < 0.75 ? 4 : 3; if (fold) idx--; if (v > 0.9) idx--; return RB[Math.max(2, idx)]; }, RB[0]);
    for (var hx = 8 + sway; hx < 37 + sway; hx += 4) { S.put(hx, 78, RB[0], 3.05); S.put(hx + 1, 79, RB[2], 3.05); S.put(hx + 2, 79, RB[2], 3.05); }   // ragged hem tips
    [[13, 58, "#4a6a30"], [27, 66, "#2a5a5a"]].forEach(function (pc) { for (var q = 0; q < 4; q++) for (var r = 0; r < 4; r++) S.put(pc[0] + q + sway, pc[1] + r, q === 0 || r === 0 ? "#2a2a1a" : pc[2], 3.3); S.put(pc[0] + 1 + sway, pc[1] + 1, "#ffffff", 3.4); });   // patches with a stitch
    // belt with vials
    for (var bx = 15; bx < 32; bx++) S.put(bx + sway * 0.7, 46, "#3a2618", 3.5); S.put(22 + sway * 0.7, 46, "#d8a83a", 3.6); S.put(23 + sway * 0.7, 46, "#d8a83a", 3.6);
    [[17, "#ff7aa8"], [26, "#5ae6be"], [29, "#7ad8ff"]].forEach(function (vq) { for (var q = 0; q < 3; q++) { S.put(vq[0] + sway * 0.7, 47 + q, vq[1], 3.6); S.put(vq[0] + 1 + sway * 0.7, 47 + q, vq[1], 3.6); } S.put(vq[0] + sway * 0.7, 47, "#ffffff", 3.7); });
    // hair spilling out under the hat
    for (var hy = 0; hy < 14; hy++) { S.put(14 - (hy > 8 ? 1 : 0), 22 + hy, HAIR[hy % 3 === 0 ? 2 : 1], 3.8); S.put(15, 22 + hy, HAIR[1], 3.8); S.put(16, 24 + hy, HAIR[hy % 2 ? 0 : 1], 3.8); }
    // the hunched face: one head with a long hooked nose and a wart
    S.dome(24, 25, 6.5, 6.5, 5, [SKN[0], SKN[1], SKN[1], SKN[2], SKN[3], SKN[4], SKN[5], SKN[6]]);
    S.poly([[28, 22], [33, 25], [36, 29], [34, 30], [29, 28]], 5.2, function (x, y, v) { return v < 0.3 ? SKN[5] : v < 0.7 ? SKN[4] : SKN[3]; }, SKN[0]);   // nose
    S.put(31, 25, SKN[2], 5.3); S.put(32, 26, "#4a6a30", 5.3);   // wart
    var EYE = mc ? "#ff3a3a" : "#ffd84a"; S.put(26, 22, "#ffffff", 5.4); S.put(27, 22, EYE, 5.4); S.put(27, 21, SKN[0], 5.4); S.put(26, 21, SKN[0], 5.4); S.put(28, 21, SKN[0], 5.4);
    for (var mx = 24; mx < 29; mx++) S.put(mx, 29, SKN[0], 5.4); S.put(26, 30, "#f6eedb", 5.45);   // a crooked grin, one tooth
    // the hat: a wide brim and a crooked cone, a band with a gold buckle
    if (mc) { [[14, 1], [32, -1]].forEach(function (hq) { for (var q = 0; q < 9; q++) { var w2 = Math.round((1 - q / 9) * 1.8); for (var r = -w2; r <= w2; r++) S.put(hq[0] + r + q * 0.5 * hq[1] * -1, 14 - q, r < 0 ? "#e8dcc8" : "#b8a890", 5.9, "#2a1a14"); } }); }
    S.poly([[17, 16], [29, 16], [26, 6], [24, 1], [21, -1], [22, 4]], 6, function (x, y, v) { return x < 21 ? RB[3] : x < 25 ? RB[2] : RB[1]; }, RB[0]);
    S.poly([[8, 16], [38, 16], [37, 19], [9, 19]], 6.2, function (x, y, v) { return v < 0.4 ? RB[3] : RB[1]; }, RB[0]);
    for (var bq = 18; bq < 29; bq++) { S.put(bq, 14, BAND, 6.3); S.put(bq, 15, BAND, 6.3); } S.put(22, 14, "#ffd84a", 6.4); S.put(23, 14, "#ffd84a", 6.4); S.put(22, 15, "#ffd84a", 6.4); S.put(23, 15, "#ffd84a", 6.4); S.put(22, 14, "#a87a1a", 6.45);
    S.put(21, 3, RB[4], 6.1); S.put(22, 6, RB[3], 6.1);   // a crease
    // the arm and the potion: held at the side, or raised high to throw
    var ax = wind ? 32 : 30, ay = wind ? 20 : 44;
    S.capsule(wind ? [[27, 33], [31, 27], [33, 22]] : [[27, 33], [30, 38], [31, 42]], 3.6, 2.6, 7, RB, 3);   // a baggy sleeve
    for (var q2 = 0; q2 < 2; q2++) for (var r2 = 0; r2 < 2; r2++) S.put(ax + q2, ay + r2 + 2, SKN[4], 7.2);   // hand
    S.put(ax + 1, ay - 2, "#8a6040", 7.3); S.put(ax + 1, ay - 3, "#8a6040", 7.3);   // cork
    S.dome(ax + 1.5, ay + 1, 2.8, 2.8, 7.4, ["#120818", POT[0], POT[0], POT[1], POT[1], POT[2], POT[2], "#ffffff"]);
    S.ink(7, RB[0]); S.flush(K);
  }

  function art(W, H, fn) { var o = mk(W, H); fn(root.DelveFurn.kit(o.g, W, H)); return o.c; }
  function gator(st, n) { return art(72, 24, function (K) { gatorArt(K, st === "jaw" ? "wind" : "walk", st === "jaw" ? 0 : n, st === "jaw" ? n / 4 : 0); }); }
  function slimeOf(b) { return function (st, n) { return art(40, 32, function (K) { slimeArt(K, st, n, b); }); }; }
  function spiderOf(b) { return function (st, n) { return art(64, 32, function (K) { spiderArt(K, st, n, b); }); }; }
  function witchOf(mc) { return function (st, n) { return art(48, 80, function (K) { witchArt(K, st, n, mc); }); }; }
  var ART = { bug: bug, wolf: wolf, wolfmc: wolfmc, gator: gator, slime0: slimeOf(0), slime1: slimeOf(1), slime2: slimeOf(2), slimemc: slimeOf(3),
    spider0: spiderOf(0), spider1: spiderOf(1), spider2: spiderOf(2), spidermc: spiderOf(3), witch: witchOf(false), witchmc: witchOf(true) };
  function frame(kind, st, n, flash) {
    if (!ART[kind] || typeof document === "undefined" || !root.DelveFurn) return null;
    var key = kind + st + n + (flash ? "f" : ""); if (CACHE[key]) return CACHE[key];
    var c; try { c = flash ? white(frame(kind, st, n, false)) : ART[kind](st, n); } catch (e) { return null; }
    return (CACHE[key] = c);
  }
  var api = { frame: frame, has: function (k) { return !!ART[k]; } };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DelvePix = api;
})(typeof window !== "undefined" ? window : this);
