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
  var ART = { bug: bug, wolf: wolf, wolfmc: wolfmc };
  function frame(kind, st, n, flash) {
    if (!ART[kind] || typeof document === "undefined" || !root.DelveFurn) return null;
    var key = kind + st + n + (flash ? "f" : ""); if (CACHE[key]) return CACHE[key];
    var c; try { c = flash ? white(frame(kind, st, n, false)) : ART[kind](st, n); } catch (e) { return null; }
    return (CACHE[key] = c);
  }
  var api = { frame: frame, has: function (k) { return !!ART[k]; } };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DelvePix = api;
})(typeof window !== "undefined" ? window : this);
