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
  // a hunched old witch in profile: a crooked drooping hat, a long hooked nose and jutting chin, wild grey hair, a tattered shawl over
  // a patched bell robe, a gnarled staff in the far hand and a glowing potion in the near one (raised high when she winds up to throw)
  function witchArt(K, st, n, mc) {
    var S = Painter(48, 80), wind = st === "wind", sw = n ? 1 : 0;
    var RB = mc ? ["#140406", "#2a0408", "#4a0810", "#6a0e18", "#8a1622", "#a81e2a", "#c8323e", "#e85a62"] : ["#120818", "#24122e", "#34204a", "#4a2a62", "#5e3878", "#6e4a8c", "#8a64a8", "#a888c4"];
    var SH = mc ? ["#0c0204", "#1e0408", "#34060c", "#4a0a12", "#5e1018"] : ["#0c0612", "#1a0e24", "#2a1838", "#3a2450", "#4a3062"];   // shawl / hat (darker)
    var SK = mc ? ["#2a2224", "#5a4a4c", "#7a6a6c", "#a89a9a", "#c4b8b8", "#d8cccc", "#ece4e4"] : ["#14300e", "#2e5a1e", "#3e7a2e", "#5a9a42", "#7fbf5a", "#a8dc7a", "#ccf0a4"];
    var HR = mc ? ["#050102", "#1e0a0c", "#3a1a1e", "#5a3238"] : ["#3a3a46", "#6a6a78", "#9a9aa8", "#d0d0dc"];
    var BAND = mc ? ["#6a0610", "#c8101e"] : ["#5a2a9a", "#9a5ad8"], POT = mc ? ["#3a0206", "#8a0a14", "#c8101e", "#ff5a5a", "#ffc0c0"] : ["#2a1050", "#5a2a9a", "#9a5ad8", "#c890ff", "#f0dcff"];
    function shadeX(x, l, r, pal, lo) { var f = (x - l) / Math.max(1, r - l); return pal[f < 0.18 ? (lo || 0) + 5 : f < 0.45 ? (lo || 0) + 4 : f < 0.75 ? (lo || 0) + 3 : (lo || 0) + 2]; }
    // ---- the staff, behind her: a gnarled stick with a twisted crook and a dangling charm ----
    var stx = 8 - sw * 0.5;
    for (var y = 30; y < 79; y++) { var xx = stx - (y - 30) * 0.06 + (y % 9 < 2 ? 0.6 : 0); S.put(xx, y, "#6a4428", 1, "#24140a"); S.put(xx + 1, y, "#9a6a40", 1, "#24140a"); if (y % 11 === 4) S.put(xx + 2, y, "#6a4428", 1, "#24140a"); }
    [[8, 29], [7, 28], [7, 27], [8, 26], [9, 26], [10, 27], [10, 28], [9, 29]].forEach(function (q) { S.put(q[0] - sw * 0.5, q[1], "#8a5a34", 1, "#24140a"); });   // the crook
    S.line(9 - sw * 0.5, 29, 9 - sw * 0.5, 33, "#b8a890", 1.1); S.put(9 - sw * 0.5, 34, mc ? "#e8323a" : "#5ae6be", 1.2); S.put(9 - sw * 0.5, 35, mc ? "#8a0a14" : "#2a8a6a", 1.2);   // a little bone charm
    // ---- wild hair at the back, spilling down over the shoulders ----
    S.poly([[13, 18], [22, 18], [22, 29], [20, 35], [17, 40 + sw], [14, 39 + sw], [12, 35], [10, 30], [11, 24]], 2, function (x, y, v) { var k = ((x + Math.round(Math.sin(y * 0.55 + x) * 1.2) + sw) % 3 + 3) % 3; return k === 0 ? HR[1] : k === 1 ? HR[2] : (x < 16 ? HR[3] : HR[2]); }, HR[0]);   // a mass of wild grey hair in wavy strands
    [[10, 27, -1], [9, 33, -1], [12, 38, -1], [15, 41, 0], [19, 37, 1]].forEach(function (f) { S.put(f[0] + sw * 0.5, f[1], HR[2], 2.1, HR[0]); S.put(f[0] + f[2] + sw * 0.5, f[1] + 1, HR[1], 2.1, HR[0]); });   // frizz
    // ---- the robe: a hunched bell, the back humped, folds that fan out to a ragged hem ----
    var hem = 78;
    var zig = []; for (var zx = 39 + sw; zx >= 5 + sw; zx -= 2.6) zig.push([zx, hem + ((Math.round((zx - sw) / 2.6)) % 2 ? -2 : 0.6)]);   // a ragged zigzag hem
    S.poly([[16, 32], [30, 32], [33, 40], [35, 56]].concat(zig).concat([[8, 56], [10, 42], [12, 36]]), 3, function (x, y, v) {
      var l = 10 - (y - 36) * 0.12 + sw * v, r = 33 + (y - 36) * 0.15 + sw * v, c = shadeX(x, l, r, RB, 0), cx = (l + r) / 2;
      for (var f = -2; f <= 2; f++) { var fx = cx + f * (3 + v * 3.2); if (Math.abs(x - fx) < 0.6 && v > 0.08) c = RB[f < 0 ? 3 : 2]; if (Math.abs(x - fx - 1) < 0.6 && v > 0.08 && f < 1) c = RB[6]; }   // folds follow the bell
      return c; }, RB[0]);
    [[12, 60, "#4a6a30", "#6a8a48"], [27, 66, "#2a5a6a", "#3a7a8a"]].forEach(function (pc) { for (var a = 0; a < 5; a++) for (var b = 0; b < 4; b++) S.put(pc[0] + a + sw * 0.6, pc[1] + b, b === 0 ? pc[3] : pc[2], 3.3); [[0, -1], [2, -1], [4, -1], [-1, 1], [5, 2]].forEach(function (st2) { S.put(pc[0] + st2[0] + sw * 0.6, pc[1] + st2[1] + (st2[1] < 0 ? 0 : 0), "#e8dcc8", 3.35); }); });   // patches with stitches
    // pointed shoe peeking from the hem, toe curled up
    [[29, 79], [30, 79], [31, 79], [32, 79], [33, 79], [34, 78], [35, 77], [35, 76], [30, 78], [31, 78], [32, 78]].forEach(function (q) { S.put(q[0] + sw, q[1], "#1e1418", 3.5, "#0a0608"); }); S.put(31 + sw, 78, "#4a3a3e", 3.6);
    // belt, a pouch and three little vials
    for (var bx = 11; bx < 35; bx++) { S.put(bx + sw * 0.4, 47, "#3a2618", 3.6, "#1a0e08"); S.put(bx + sw * 0.4, 48, "#2a1a10", 3.6, "#1a0e08"); }
    S.put(25 + sw * 0.4, 47, "#f2c14e", 3.7); S.put(26 + sw * 0.4, 47, "#f2c14e", 3.7); S.put(25 + sw * 0.4, 48, "#a87a1a", 3.7);
    [[14, "#ff7aa8"], [17, "#5ae6be"], [29, "#7ad8ff"]].forEach(function (vq) { var x0 = vq[0] + sw * 0.4; S.put(x0, 49, "#b8a890", 3.7); for (var a = 0; a < 3; a++) { S.put(x0 - 0.5, 50 + a, vq[1], 3.7, "#1a0e08"); S.put(x0 + 0.5, 50 + a, vq[1], 3.7, "#1a0e08"); } S.put(x0 - 0.5, 50, "#ffffff", 3.75); });
    // ---- tattered shawl over the hunched shoulders ----
    S.poly([[13, 31], [31, 31], [34, 37], [33, 42], [30, 40], [27, 44], [24, 41], [20, 45], [17, 41], [13, 44], [10, 39]], 4, function (x, y, v) { return v < 0.2 ? SH[4] : shadeX(x, 10, 34, [0, 0, SH[1], SH[2], SH[3], SH[4]], -0); }, SH[0]);
    S.put(30, 33, SH[4], 4.1); S.put(31, 34, SH[4], 4.1);
    // ---- far hand on the staff ----
    S.capsule([[14, 36], [11, 41], [9, 43]], 2.6, 2, 4.5, RB, 2); S.put(8, 43, SK[3], 4.6); S.put(9, 43, SK[4], 4.6); S.put(9, 44, SK[3], 4.6); S.put(10, 44, SK[2], 4.6);
    // ---- the head in profile: forehead, a long hooked nose with a wart, a jutting chin ----
    S.poly([[20, 19], [29, 19], [31, 21], [32, 23], [36, 26], [38, 28], [37, 30], [35, 29], [33, 28], [33, 30], [32, 31], [34, 33], [33, 35], [29, 35], [25, 34], [21, 31], [19, 26]], 5, function (x, y, v) {
      var lit = (x - 19) / 19 * 0.45 + Math.sin(Math.min(1, v * 1.25) * Math.PI) * 0.55 - (y < 22 ? 0.25 : 0); if (((x + y) & 1) && Math.abs(lit - 0.5) < 0.03) lit -= 0.05; return SK[lit > 0.72 ? 5 : lit > 0.52 ? 4 : lit > 0.32 ? 3 : 2]; }, SK[0]);   // lit across the cheek, the hat's shadow on the brow, dark under the chin
    S.put(35, 27, SK[6], 5.1); S.put(34, 26, SK[5], 5.1); S.put(33, 25, SK[5], 5.1);   // light down the nose ridge
    S.put(34, 28, SK[1], 5.1); S.put(33, 27, SK[2], 5.1);   // nostril shadow
    S.put(32, 24, mc ? "#5a4a4c" : "#4a6a2a", 5.2); S.put(33, 24, mc ? "#7a6a6c" : "#6a8a3a", 5.2);   // the wart
    S.put(27, 29, SK[2], 5.1); S.put(26, 30, SK[2], 5.1); S.put(28, 32, SK[2], 5.1);   // cheek wrinkles
    for (var mx = 29; mx < 33; mx++) S.put(mx, 31, SK[0], 5.2); S.put(32, 32, "#f6eedb", 5.3); S.put(30, 32, SK[1], 5.2);   // crooked mouth, one snaggletooth
    var EY = mc ? ["#ff3a3a", "#ffc0a0"] : wind ? ["#ff8a2a", "#ffe08a"] : ["#ffd84a", "#fff6c0"];
    S.put(27, 23, "#f6f0e0", 5.4); S.put(28, 23, EY[0], 5.4); S.put(29, 23, EY[0], 5.4); S.put(28, 24, EY[0], 5.4); S.put(29, 24, "#1a0a0a", 5.4); S.put(28, 23, EY[1], 5.45); S.put(27, 24, SK[1], 5.4); S.put(30, 24, SK[1], 5.4);
    for (var bq = 26; bq < 32; bq++) S.put(bq, 21 + (bq > 29 ? 1 : 0), HR[2], 5.5, HR[0]); S.put(27, 22, HR[1], 5.5);   // a bushy scowling brow
    // ---- the hat: a wide wavy brim, a tall cone that bends and droops at the tip, a band with a gold buckle ----
    if (mc) [[14, -1], [33, 1]].forEach(function (hq) { for (var q = 0; q < 10; q++) { var w2 = (1 - q / 10) * 1.8; for (var r = -Math.round(w2); r <= Math.round(w2); r++) S.put(hq[0] + r + q * 0.45 * hq[1], 16 - q, r < 0 ? "#f0e6d4" : "#b8a890", 5.8, "#2a1a14"); } });   // horns through the hat
    S.poly([[15, 17], [32, 17], [28, 10], [25, 4], [21, 5], [19, 10]], 6, function (x, y, v) { return x < 20 ? SH[4] : x < 23 ? SH[3] : x < 27 ? SH[2] : SH[1]; }, SH[0]);
    S.capsule([[23, 6], [21, 2], [17, 1], [14, 3], [13, 6]], 2.4, 1, 6.05, [SH[0], SH[1], SH[1], SH[2], SH[3], SH[4], SH[4], SH[4]], 2);   // the cone bends over and droops
    S.put(13, 8, mc ? "#ff5a5a" : "#f2c14e", 6.2, "#3a2a0a"); S.put(13, 7, "#8a8a96", 6.2);   // a little bead hanging off the tip
    S.put(24, 8, SH[4], 6.1); S.put(25, 9, SH[4], 6.1); S.put(22, 11, SH[0], 6.1); S.put(23, 12, SH[1], 6.1);   // crumples
    for (var bx2 = 17; bx2 < 31; bx2++) { S.put(bx2, 14, BAND[1], 6.3); S.put(bx2, 15, BAND[0], 6.3); }
    [[22, 13], [23, 13], [24, 13], [25, 13], [22, 16], [23, 16], [24, 16], [25, 16], [22, 14], [25, 14], [22, 15], [25, 15]].forEach(function (q) { S.put(q[0], q[1], "#f2c14e", 6.4, "#6a4a0a"); }); S.put(23, 14, BAND[1], 6.45); S.put(24, 15, BAND[0], 6.45);   // buckle
    S.poly([[7, 17], [40, 16], [41, 18], [37, 20], [24, 21], [10, 20], [6, 19]], 6.2, function (x, y, v) { return v < 0.35 ? SH[4] : v < 0.7 ? SH[3] : SH[1]; }, SH[0]);   // brim
    // ---- the near arm in a bell sleeve, a knobbly green hand and the glowing potion ----
    var arm = wind ? [[27, 36], [33, 31], [35, 24]] : [[27, 36], [32, 41], [34, 46]], hand = wind ? [35, 22] : [35, 47];
    S.capsule(arm, 3.4, 3, 7, RB, 3);
    var cf = arm[2]; S.dome(cf[0], cf[1] + (wind ? -1 : 1), 3.6, 2.6, 7.1, RB);   // the cuff
    S.put(hand[0], hand[1], SK[4], 7.3); S.put(hand[0] + 1, hand[1], SK[3], 7.3); S.put(hand[0] - 1, hand[1] + (wind ? -1 : 1), SK[3], 7.3); S.put(hand[0] + 2, hand[1] + (wind ? -1 : 1), SK[2], 7.3);
    var px = hand[0] + 1, py = wind ? hand[1] - 5 : hand[1] + 4;
    S.dome(px, py, 3.2, 3.2, 7.4, [POT[0], POT[1], POT[1], POT[2], POT[2], POT[3], POT[3], POT[4]], 0.1, null, POT[0]);
    S.put(px, py - 4, "#c8c0b0", 7.5); S.put(px, py - 5, "#8a6040", 7.5); S.put(px + 1, py - 5, "#6a4428", 7.5); S.put(px - 1, py - 1, "#ffffff", 7.6);   // the neck, a cork, a glint
    if (wind) { S.put(px - 3, py - 6, POT[4], 7.7); S.put(px + 3, py - 4, POT[3], 7.7); S.put(px + 4, py - 7, POT[4], 7.7); }   // fizzing sparks
    S.ink(7, RB[0]); S.flush(K);
  }

  // ---------------- HORNET: 48 x 32, anchor x 24 ----------------
  function waspArt(K, st, n, mc) {
    var S = Painter(48, 32), hot = st === "hot", up = n === 0, curl = hot ? 3 : 0;
    var Y = mc ? (hot ? ["#3a2a20", "#6a5a48", "#a8987e", "#d8ccb4", "#f4ead8", "#fff6ea", "#ffffff"] : ["#3a2a20", "#6a5a48", "#a8987e", "#c8b8a0", "#e8dcc8", "#f4ead8", "#ffffff"]) : hot ? ["#4a1a04", "#8a3008", "#c8501a", "#ff7a2a", "#ff9a3a", "#ffc070", "#ffe0b0"] : ["#4a3004", "#8a5a08", "#c88a10", "#ffb020", "#ffc52a", "#ffe680", "#fff6c0"];
    var BK = mc ? ["#140406", "#4a0610", "#7a0a16", "#a8141e", "#d02a32"] : ["#0a0602", "#1a1006", "#2a1a0a", "#3a2810", "#5a4020"];
    var WG = mc ? ["#3a3036", "#6a6068", "#8a8088", "#b0a8b0"] : ["#5a6a7a", "#a8c0d4", "#cfe2f0", "#eef8ff"];
    // far wing (behind)
    function wing(z, far) { var tip = up ? [17, 1] : [12, 11], mid = up ? [22, 4] : [18, 10];
      S.poly([[28, 13], [mid[0] + 4, mid[1] - 3], [tip[0], tip[1]], [tip[0] - 2, tip[1] + 2], [mid[0] - 2, mid[1] + 3], [26, 15]], z, function (x, y, v) { var c = WG[far ? 1 : (v < 0.4 ? 3 : 2)]; if ((x + y) % 4 === 0) c = WG[far ? 0 : 1]; return c; }, WG[0]); }
    wing(1, true);
    // legs dangling
    [[26, 0], [29, 1], [32, 2]].forEach(function (L) { var sx = L[0], k = L[1]; S.line(sx, 22, sx + 1, 25, BK[3], 2, BK[0]); S.line(sx + 1, 25, sx - 1 + k * 0.4, 27, BK[2], 2, BK[0]); S.put(sx - 1 + k * 0.4, 28, Y[3], 2.1, BK[0]); });
    // abdomen: a teardrop with banded stripes that wrap round it, tapering into the stinger
    var acx = 14, acy = 20 + curl * 0.3;
    S.dome(acx, acy, 10, 6.2, 3, [BK[0], Y[0], Y[1], Y[2], Y[3], Y[4], Y[5], Y[6]], 0.05, null, BK[0]);
    for (var y = acy - 7; y <= acy + 7; y++) for (var x = acx - 10; x <= acx + 10; x++) { var dx = (x + 0.5 - acx) / 10, dy = (y + 0.5 - acy) / 6.2; if (dx * dx + dy * dy > 1) continue; var bx = x + 0.5 - (acx - 10) + dy * dy * 2.4; if (Math.floor(bx / 3.3) % 2 === 1 && x > acx - 9 && x < acx + 6) S.put(x, y, BK[dy < -0.4 ? 3 : dy < 0.3 ? 2 : 1], 3.1); }   // bands curve round the body
    for (var q = 0; q < 6; q++) S.put(acx - 10 - q, acy + 0.5 + q * (curl ? 0.5 : 0.1), q > 3 ? (mc && hot ? "#ff6a2a" : BK[0]) : BK[2], 3.2, BK[0]);   // stinger
    S.put(acx - 5, acy - 4, Y[6], 3.3); S.put(acx - 4, acy - 4, Y[6], 3.3); S.put(acx - 6, acy - 3, Y[5], 3.3);   // shine
    S.put(23, acy - 1, BK[1], 3.5); S.put(23, acy, BK[1], 3.5); S.put(24, acy - 1, BK[1], 3.5);   // waist
    // thorax and head
    S.dome(28, 18, 5.4, 5, 4, [BK[0], BK[1], BK[1], BK[2], BK[3], BK[4], BK[4], Y[4]]);
    S.put(27, 15, Y[4], 4.2); S.put(28, 15, Y[4], 4.2); S.put(29, 16, Y[3], 4.2);   // shoulder mark
    S.dome(36, 17, 4.6, 4.4, 5, [BK[0], BK[1], BK[2], BK[2], BK[3], BK[4], BK[4], Y[5]]);
    var EY = hot || mc ? ["#5a0a0a", "#d0202a", "#ff6a5a", "#ffd0c0"] : ["#1a0a04", "#4a1a0a", "#8a2a10", "#e0a080"];
    S.dome(37.6, 16.4, 2.6, 3, 5.5, [EY[0], EY[0], EY[1], EY[1], EY[2], EY[2], EY[3], EY[3]], 0.1, null, EY[0]); S.put(37, 15, "#ffffff", 5.6);
    S.put(40, 20, Y[3], 5.6); S.put(41, 21, Y[2], 5.6); S.put(39, 21, Y[4], 5.6);   // mandibles
    S.line(36, 13, 38, 9, BK[2], 5, BK[0]); S.line(38, 9, 41, 7, BK[2], 5, BK[0]); S.put(42, 7, BK[1], 5);   // antenna
    wing(6, false);
    S.ink(6, BK[0]); S.flush(K);
  }

  // ---------------- FIRE IMP: 44 x 48, anchor x 22, feet on the bottom ----------------
  function impArt(K, st, n, mc) {
    var S = Painter(44, 48), wind = st === "wind", air = st === "air", step = st === "walk" ? (n ? 1 : -1) : 0, flap = air ? n : 0;
    var R = mc ? ["#0e0406", "#1a1214", "#261c1e", "#382c2e", "#4a3c3e", "#5e5052", "#7a6a6a", "#9a8a8a"] : ["#3a0a06", "#6a140c", "#8e1e12", "#b82e1a", "#e0472a", "#ff6a3a", "#ff8a52", "#ffb48a"];
    var BL = mc ? ["#2a1c1c", "#3a2c2c", "#4a3a3a", "#5a4a48"] : ["#c87a3a", "#e89a52", "#ffc07a", "#ffdca8"];
    var HN = mc ? ["#2a1a14", "#7a6a58", "#c8b8a0", "#f4ead8"] : ["#1a0a08", "#24120e", "#4a322a", "#7a5a50"];
    var WN = mc ? ["#0e0406", "#2a0a10", "#4a1018", "#6a1a22"] : ["#3a0a06", "#7a1a10", "#a82a18", "#d04a2a"];
    // wings behind: a leathery bat wing with finger bones and a scalloped edge
    var wy = air ? (flap ? -6 : 3) : 0;
    S.poly([[17, 24], [10, 14 + wy], [2, 12 + wy * 1.3], [3, 18 + wy], [1, 24 + wy * 0.6], [5, 26 + wy * 0.4], [6, 31], [12, 30], [16, 32]], 1, function (x, y, v) { return v < 0.3 ? WN[3] : v < 0.7 ? WN[2] : WN[1]; }, WN[0]);
    S.line(17, 24, 2, 12 + wy * 1.3, WN[0], 1.1); S.line(16, 26, 1, 24 + wy * 0.6, WN[0], 1.1); S.line(16, 28, 6, 31, WN[0], 1.1);   // finger bones
    // the forked tail
    S.capsule([[15, 40], [9, 42], [5, 39], [4, 35]], 1.6, 1, 1.5, R, 3); S.poly([[2, 33], [4, 30], [7, 33], [4, 35]], 1.6, function () { return R[4]; }, R[0]);
    // legs and feet
    [[18, -1], [25, 1]].forEach(function (L) { var o = L[1] * step; S.capsule([[L[0], 38], [L[0] + o, 43], [L[0] + o, 45]], 2.8, 2.2, L[1] > 0 ? 7 : 2, R, 3); for (var q = -1; q <= 3; q++) S.put(L[0] + o + q, 46, R[q === 3 ? 0 : 2], L[1] > 0 ? 7.1 : 2.1); S.put(L[0] + o + 3, 47, R[0], 7.2); });
    // pot belly body
    S.dome(21, 34, 8.5, 8.8, 4, R);
    for (var by = 29; by <= 41; by++) { var w = Math.round(Math.sqrt(Math.max(0, 1 - Math.pow((by - 35) / 6.5, 2))) * 4.6); for (var bx = -w; bx <= w; bx++) S.put(25 + bx * 0.9, by, (by - 29) % 3 === 2 ? BL[0] : bx < -1 ? BL[3] : BL[2], 4.2); }   // the belly plates
    if (mc) [[[15, 30], [17, 33], [16, 37]], [[26, 31], [24, 35]], [[19, 40], [22, 42]]].forEach(function (pts) { for (var i = 1; i < pts.length; i++) S.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], "#ff8a2a", 4.4); });   // magma cracks
    // horns behind the head: curled back (bone-long on the Ash Fiend)
    var hl = mc ? 11 : 7;
    [[18, 11, -1], [26, 10, 0]].forEach(function (hq) { for (var i = 0; i < hl; i++) { var tt = i / hl, x = hq[0] - tt * (mc ? 6 : 5) + hq[2], y = hq[1] - i + tt * tt * (mc ? 3 : 4), r = 1.8 * (1 - tt) + 0.5; for (var a = -r; a <= r; a += 0.5) S.put(x + a, y, a < 0 ? HN[3] : HN[2], 4.6, HN[0]); if (!mc && i % 2) S.put(x, y, HN[1], 4.7); } });
    // the head: a big round head with a pointed ear, angry eyes and a toothy grin
    S.dome(24, 18, 9, 8, 5, R);
    S.poly([[15, 16], [10, 12], [11, 19]], 5.1, function () { return R[4]; }, R[0]); S.put(12, 14, R[2], 5.2);   // ear
    var EY = mc ? ["#ff3a2a", "#ffc0a0"] : ["#ffd84a", "#fff6c0"];
    [[25, 16], [30, 16]].forEach(function (e) { S.put(e[0], e[1], EY[0], 5.5); S.put(e[0] + 1, e[1], EY[0], 5.5); S.put(e[0], e[1] + 1, EY[0], 5.5); S.put(e[0] + 1, e[1] + 1, EY[0], 5.5); S.put(e[0] + 2, e[1], "#ffffff", 5.5); S.put(e[0] + 1, e[1], "#1a0a04", 5.6); S.put(e[0] + 1, e[1] + 1, "#1a0a04", 5.6); S.put(e[0], e[1] - 1, R[0], 5.6); S.put(e[0] + 1, e[1] - 1, R[0], 5.6); S.put(e[0] + 2, e[1] - 1 + (e[0] > 26 ? 0 : 1), R[0], 5.6); });   // angry brows
    for (var mx = 24; mx < 32; mx++) S.put(mx, 22 + (mx > 29 ? -1 : 0), R[0], 5.6); S.put(25, 23, "#ffffff", 5.7); S.put(29, 22, "#ffffff", 5.7); S.put(27, 23, R[1], 5.6);   // grin and fangs
    // the near arm: at the side with a claw, or raised high holding a fireball
    if (wind) { S.capsule([[25, 29], [30, 23], [32, 15]], 2.4, 2, 8, R, 4); S.put(32, 13, R[5], 8.1); S.put(33, 13, R[5], 8.1); S.put(31, 13, R[4], 8.1);
      var FB = mc ? ["#5a0610", "#c8101e", "#ff4a4a", "#ffb0b0"] : ["#a83a08", "#ff7a1a", "#ffc04a", "#fff6c0"]; S.dome(33, 8, 4.4, 4.4, 8.5, [FB[0], FB[0], FB[1], FB[1], FB[2], FB[2], FB[3], "#ffffff"], 0.2, null, FB[0]); S.put(33, 2, FB[2], 8.6); S.put(36, 4, FB[1], 8.6); S.put(30, 3, FB[1], 8.6); }
    else { S.capsule([[25, 29], [29, 33], [31, 36]], 2.4, 2, 8, R, 4); S.put(32, 37, R[3], 8.1); S.put(33, 36, R[2], 8.1); S.put(31, 38, R[2], 8.1); }
    S.ink(7, R[0]); S.flush(K);
  }

  // ---------------- BAT: 64 x 32 (front-on), anchor x 32 ----------------
  function batArt(K, st, n) {
    var S = Painter(64, 32), hot = st === "hot", up = [1, 0, -1][n] || 0;
    var WG = hot ? ["#12061a", "#3d2466", "#5a3890", "#7b4fc0", "#9a70e0"] : ["#12061a", "#24123e", "#3d2466", "#52348a", "#6a48a8"];
    var FU = ["#0a0410", "#1a0c2a", "#2a1744", "#3a2258", "#4a2e6a", "#5a3a7a", "#6e4a8e", "#8a64a8"];
    [-1, 1].forEach(function (s) {   // each wing: finger bones from the shoulder, a scalloped membrane between them
      var tipY = 18 - up * 12, midY = 16 - up * 7, sx = 32 + s * 4, tx = 32 + s * 30;
      var pts = [[sx, 15], [32 + s * 14, midY - 2], [tx, tipY], [32 + s * 27, tipY + 5], [32 + s * 22, midY + 6], [32 + s * 17, midY + 3], [32 + s * 12, midY + 7], [32 + s * 8, 21]];
      S.poly(pts, 1, function (x, y, v) { return v < 0.25 ? WG[4] : v < 0.6 ? WG[3] : WG[2]; }, WG[0]);
      S.line(sx, 15, 32 + s * 14, midY - 2, WG[1], 1.1); S.line(32 + s * 14, midY - 2, tx, tipY, WG[1], 1.1); S.line(32 + s * 14, midY - 2, 32 + s * 22, midY + 6, WG[1], 1.1); S.line(32 + s * 14, midY - 2, 32 + s * 12, midY + 7, WG[1], 1.1);
      S.put(32 + s * 14, midY - 3, "#d8c0f0", 1.2);   // the thumb claw
    });
    S.poly([[28, 11], [27, 4], [30, 9]], 2, function () { return FU[4]; }, FU[0]); S.poly([[36, 11], [37, 4], [34, 9]], 2, function () { return FU[4]; }, FU[0]);   // ears
    S.dome(32, 16, 5.5, 6.5, 3, FU);
    var EY = hot ? ["#ff3a4a", "#ffc0c8"] : ["#ffd84a", "#fff6c0"];
    [[29, 14], [34, 14]].forEach(function (e) { S.put(e[0], e[1], EY[0], 3.5); S.put(e[0] + 1, e[1], EY[1], 3.5); S.put(e[0], e[1] + 1, EY[0], 3.5); S.put(e[0] + 1, e[1] + 1, EY[0], 3.5); });
    S.put(31, 19, "#ffffff", 3.6); S.put(33, 19, "#ffffff", 3.6); S.put(31, 20, "#e0e0e8", 3.6); S.put(33, 20, "#e0e0e8", 3.6);   // fangs
    S.put(30, 23, FU[2], 3.2); S.put(34, 23, FU[2], 3.2);   // little feet
    S.ink(null, FU[0]); S.flush(K);
  }

  // ---------------- SWAMP FROG: 52 x 34, anchor x 24 ----------------
  function frogArt(K, st, n, mc) {
    var S = Painter(52, 34), wind = st === "wind", lash = st === "lash", air = st === "air", br = st === "idle" && n ? 1 : 0, mo = lash ? 2 : wind ? 1 : 0;
    var G = mc ? ["#140606", "#2e1a18", "#4a302c", "#5a3e36", "#6a4a42", "#8a6a5a", "#9a7a6a", "#b89a88"] : ["#0c2a14", "#1c5e34", "#1f7a3c", "#2f9a4a", "#3fc25f", "#5ad070", "#7ee08a", "#b4f4b0"];
    var BEL = mc ? ["#8a6a5a", "#a8887a", "#c8a08a"] : ["#c8c088", "#e0dca0", "#f1efb4"], SPOT = mc ? "#ff3a2a" : "#2a8a47";
    var by = 22 - br * 0.5 - (wind ? 1 : 0);
    // far legs
    if (air) S.capsule([[16, 26], [8, 30], [2, 31]], 2.6, 1.6, 1, G, 2); else S.capsule([[18, 27], [16, 31], [19, 33]], 2.8, 2, 1, G, 2);
    // one silhouette: the body swelling into the head, the eye bumps on top
    S.dome(22, by, 15 + (wind ? 1 : 0), 9.5 + (wind ? 1 : 0), 3, G);
    S.dome(33, by - 3, 10, 8, 3.1, G);
    [[30, by - 10], [37, by - 10]].forEach(function (e) { S.dome(e[0], e[1], 4, 3.6, 3.2, G); });
    for (var x = 12; x < 44; x++) { var bot = by + 8 - Math.pow((x - 26) / 17, 2) * 6; for (var y = Math.floor(bot - 2); y <= bot; y++) if (S.get(x, y)) S.put(x, y, BEL[y > bot - 1 ? 1 : 2], 3.3); }   // the pale belly
    [[14, by - 4], [19, by - 6], [24, by - 5], [11, by], [21, by - 1], [28, by - 9]].forEach(function (sp) { S.put(sp[0], sp[1], SPOT, 3.4); S.put(sp[0] + 1, sp[1], SPOT, 3.4); S.put(sp[0], sp[1] + 1, mc ? "#ffb04a" : G[1], 3.4); });   // spots / pustules
    if (mc) [[13, by - 9, 4], [18, by - 10, 3], [9, by - 6, 3]].forEach(function (m) { var mx = m[0], my = m[1]; S.line(mx, my, mx, my - m[2] + 1, "#e8dcc8", 3.0); for (var a = -2; a <= 2; a++) S.put(mx + a, my - m[2], a === -2 || a === 2 ? "#7a0a10" : "#d02a2a", 3.05, "#3a0608"); S.put(mx - 1, my - m[2] - 1, "#d02a2a", 3.05, "#3a0608"); S.put(mx, my - m[2] - 1, "#ff6a5a", 3.05); S.put(mx + 1, my - m[2] - 1, "#d02a2a", 3.05); S.put(mx, my - m[2], "#ffffff", 3.06); });   // mushrooms growing from its back
    // the haunch folded into its side
    S.dome(16, by + 3, 7, 5.5, 4, G, -0.05);
    // eyes in the bumps: golden with a sideways pupil and a lid line
    var EY = mc ? ["#ff5a2a", "#ffb04a"] : ["#e0a020", "#ffd84a"];
    [[30, by - 11], [37, by - 11]].forEach(function (e) { for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) S.put(e[0] + a, e[1] + b, b < 0 ? EY[1] : EY[0], 3.5); S.put(e[0] - 1, e[1], "#0c1408", 3.6); S.put(e[0], e[1], "#0c1408", 3.6); S.put(e[0] + 1, e[1], "#0c1408", 3.6); S.put(e[0] - 1, e[1] - 1, "#ffffff", 3.6); if (wind || lash) { S.put(e[0] - 1, e[1] - 2, G[0], 3.7); S.put(e[0], e[1] - 2, G[0], 3.7); } });
    // the mouth: a long smiling seam, or open
    if (mo) { S.poly([[30, by + 1], [44, by - 1 - mo], [44, by + 2 + mo]], 3.8, function (x, y, v) { return v < 0.5 ? "#8a1a2a" : "#c84a5a"; }, G[0]); if (lash) for (var tq = 0; tq < 4; tq++) S.put(41 + tq * 0.5, by + 1, "#ff7e93", 3.9); }
    else { for (var mx2 = 31; mx2 < 43; mx2++) S.put(mx2, by + Math.round(Math.pow((mx2 - 37) / 6, 2) * -1), G[0], 3.8); }
    S.put(42, by - 6, G[0], 3.8);   // nostril
    // the front foot planted under the chin, the near hind foot
    S.capsule([[36, by + 5], [38, 30], [40, 32]], 2.2, 1.8, 6, G, 3); for (var f = 0; f < 4; f++) S.put(38 + f, 33, G[f === 3 ? 0 : 3], 6.1);
    if (air) S.capsule([[14, by + 4], [8, 30], [3, 32]], 3, 1.8, 6, G, 3); else { S.capsule([[13, by + 5], [12, 30], [16, 32]], 3, 2, 6, G, 3); for (var f2 = 0; f2 < 5; f2++) S.put(13 + f2, 33, G[f2 === 4 ? 0 : 3], 6.1); }
    S.ink(6, G[0]); S.flush(K);
  }

  function art(W, H, fn) { var o = mk(W, H); fn(root.DelveFurn.kit(o.g, W, H)); return o.c; }
  function gator(st, n) { return art(72, 24, function (K) { gatorArt(K, st === "jaw" ? "wind" : "walk", st === "jaw" ? 0 : n, st === "jaw" ? n / 4 : 0); }); }
  function slimeOf(b) { return function (st, n) { return art(40, 32, function (K) { slimeArt(K, st, n, b); }); }; }
  function spiderOf(b) { return function (st, n) { return art(64, 32, function (K) { spiderArt(K, st, n, b); }); }; }
  function witchOf(mc) { return function (st, n) { return art(48, 80, function (K) { witchArt(K, st, n, mc); }); }; }
  var ART = { bug: bug, wolf: wolf, wolfmc: wolfmc, gator: gator, slime0: slimeOf(0), slime1: slimeOf(1), slime2: slimeOf(2), slimemc: slimeOf(3),
    wasp: function (st, n) { return art(48, 32, function (K) { waspArt(K, st, n, false); }); }, waspmc: function (st, n) { return art(48, 32, function (K) { waspArt(K, st, n, true); }); },
    imp: function (st, n) { return art(44, 48, function (K) { impArt(K, st, n, false); }); }, impmc: function (st, n) { return art(44, 48, function (K) { impArt(K, st, n, true); }); },
    bat: function (st, n) { return art(64, 32, function (K) { batArt(K, st, n); }); },
    frog: function (st, n) { return art(52, 34, function (K) { frogArt(K, st, n, false); }); }, frogmc: function (st, n) { return art(52, 34, function (K) { frogArt(K, st, n, true); }); },
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
