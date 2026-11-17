// DELVE PIXEL CREATURES (trial): creatures hand-drawn as rich pixel art at 32 px a block, the same look as the HD furniture.
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
  var ART = { bug: bug };
  function frame(kind, st, n, flash) {
    if (!ART[kind] || typeof document === "undefined" || !root.DelveFurn) return null;
    var key = kind + st + n + (flash ? "f" : ""); if (CACHE[key]) return CACHE[key];
    var c; try { c = flash ? white(frame(kind, st, n, false)) : ART[kind](st, n); } catch (e) { return null; }
    return (CACHE[key] = c);
  }
  var api = { frame: frame, has: function (k) { return !!ART[k]; } };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DelvePix = api;
})(typeof window !== "undefined" ? window : this);
