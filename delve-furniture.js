// DELVE FURNITURE, HD: the core furniture redrawn as richer pixel art at 32 px a block (double the old 16), with a light from the
// top left, a shade ramp per material, dark tinted outlines (never pure black), wood grain, stone mortar, cloth folds and glowing flames.
// DelveFurn.art[kind] = { w, h (in blocks), draw(K) } ; K is the little paint kit below. sandbox.js paints each piece once into a
// canvas (w*32 x h*32) and uses it in the world, in the placing preview and for the item icon.
(function (root) {
  "use strict";
  function hsh(a, b) { var x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); }
  // shade ramps: [ink, deep, shade, mid, light, lighter, shine]
  var WOOD = ["#2e1a0c", "#4e2c14", "#6e4120", "#8f5a2c", "#b07640", "#cf955a", "#ecbd84"];
  var DARK = ["#1e120a", "#341e10", "#4a2c18", "#623c20", "#7c4e2c", "#98653c", "#b8845a"];
  var PALE = ["#3a2814", "#6a4e2c", "#8c6a40", "#ae8a58", "#c8a672", "#e0c290", "#f6deb2"];
  var STONE = ["#1e222a", "#363c48", "#4c5462", "#646e7e", "#808b9b", "#a2adbb", "#cfd7e0"];
  var IRON = ["#16191e", "#2a3038", "#3e4650", "#58616d", "#76808c", "#9aa4b0", "#cdd5de"];
  var GOLD = ["#3a2406", "#6a4410", "#9a6a18", "#c89422", "#e8b83a", "#f8d870", "#fff4c0"];
  var CLAY = ["#2e140c", "#5a2a16", "#7e3e20", "#a2562c", "#c4733e", "#de945a", "#f2b884"];

  function kit(g, W, H) {
    var K = { g: g, W: W, H: H, WOOD: WOOD, DARK: DARK, PALE: PALE, STONE: STONE, IRON: IRON, GOLD: GOLD, CLAY: CLAY, h: hsh };
    var R = K.R = function (x, y, w, h, c, a) { if (w <= 0 || h <= 0) return; g.globalAlpha = a == null ? 1 : a; g.fillStyle = c; g.fillRect(x, y, w, h); g.globalAlpha = 1; };
    var P = K.P = function (x, y, c, a) { R(x, y, 1, 1, c, a); };
    K.clr = function (x, y, w, h) { g.clearRect(x, y, w || 1, h || 1); };
    K.line = function (x0, y0, x1, y1, c, a) { var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy, n = 0; while (n++ < 400) { P(x0, y0, c, a); if (x0 === x1 && y0 === y1) break; var e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } };
    K.disc = function (cx, cy, r, c, a) { for (var y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (var x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) { var dx = x + 0.5 - cx, dy = y + 0.5 - cy; if (dx * dx + dy * dy <= r * r) P(x, y, c, a); } };
    K.ell = function (cx, cy, rx, ry, c, a) { for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (var x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1) P(x, y, c, a); } };
    // a block of a material: ink rim, lit top and left, shaded bottom and right, optional grain / rounded corners
    K.slab = function (x, y, w, h, p, o) {
      o = o || {}; R(x, y, w, h, p[0]); R(x + 1, y + 1, w - 2, h - 2, p[3]);
      if (h > 3) { R(x + 1, y + 1, w - 2, 1, p[5]); if (h > 5) R(x + 1, y + 2, w - 2, 1, p[4]); R(x + 1, y + h - 2, w - 2, 1, p[2]); }
      if (w > 3) { R(x + 1, y + 2, 1, h - 3, p[4]); R(x + w - 2, y + 2, 1, h - 3, p[2]); }
      if (o.grain) for (var gy = y + 3; gy < y + h - 2; gy++) { var n = Math.floor(hsh(gy, x + w) * 3); for (var q = 0; q < n; q++) { var gx = x + 2 + Math.floor(hsh(gy + q * 7, x) * (w - 6)), gl = 2 + Math.floor(hsh(gx, gy) * Math.min(9, w / 3)); R(gx, gy, Math.min(gl, x + w - 2 - gx), 1, hsh(gx, gy + 3) < 0.6 ? p[2] : p[4], 0.75); } }
      if (o.knot) { var kx = x + 3 + Math.floor(hsh(x, y) * (w - 7)), ky = y + 2 + Math.floor(hsh(y, x) * Math.max(1, h - 5)); if (w > 8 && h > 5) { P(kx, ky, p[1]); P(kx + 1, ky, p[2]); P(kx - 1, ky, p[2]); } }
      if (o.round) { K.clr(x, y); K.clr(x + w - 1, y); K.clr(x, y + h - 1); K.clr(x + w - 1, y + h - 1); P(x + 1, y + 1, p[0]); P(x + w - 2, y + 1, p[0]); P(x + 1, y + h - 2, p[0]); P(x + w - 2, y + h - 2, p[0]); }
      if (o.shine) { R(x + 2, y + 1, Math.max(1, Math.floor(w / 3)), 1, p[6]); }
    };
    // a turned wooden leg / post (lit left, shaded right)
    K.post = function (x, y, w, h, p) { R(x, y, w, h, p[0]); R(x + 1, y, w - 2, h - 1, p[3]); R(x + 1, y, 1, h - 1, p[5]); if (w > 3) R(x + w - 2, y, 1, h - 1, p[2]); };
    K.shadow = function (x, y, w, a) { R(x + 1, y, w - 2, 1, "#000", a || 0.28); R(x + 3, y - 1, w - 6, 1, "#000", (a || 0.28) * 0.5); };
    K.flame = function (cx, by, s, cols) {   // a teardrop flame, base at by, s = height
      cols = cols || ["#c8340e", "#ff6a1a", "#ffa62e", "#ffd860", "#fff6d0"];
      for (var i = 0; i < cols.length; i++) { var k = 1 - i / (cols.length + 0.5), hh = s * k, ww = Math.max(1, s * 0.38 * k); for (var y = 0; y < hh; y++) { var t = y / hh, half = ww * Math.sin(Math.PI * Math.min(1, (1 - t) * 0.85 + 0.15)) * (t < 0.2 ? 0.75 + t * 1.25 : 1); R(Math.round(cx - half), Math.round(by - y - i * 0.6), Math.max(1, Math.round(half * 2)), 1, cols[i]); } }
    };
    K.halo = function (cx, cy, r, rgb, a) { var gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, "rgba(" + rgb + "," + a + ")"); gr.addColorStop(1, "rgba(" + rgb + ",0)"); g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2); };
    K.nail = function (x, y, p) { P(x, y, (p || IRON)[5]); P(x + 1, y + 1, (p || IRON)[1]); };
    return K;
  }

  // ---------- pieces ----------
  var A = {};
  function legs(K, xs, y0, y1, p) { xs.forEach(function (x) { K.post(x, y0, 4, y1 - y0, p); K.R(x, y1 - 1, 4, 1, p[1]); }); }
  function tableTop(K, x, y, w, h, p) { K.slab(x, y, w, h, p, { grain: 1, knot: 1, shine: 1 }); K.R(x + 2, y + h, w - 4, 1, p[0], 0.55); }   // with its shadow under the overhang

  A.table = { w: 2, h: 1, draw: function (K) {
    K.shadow(4, 31, 56); legs(K, [7, 53], 16, 31, WOOD); K.slab(10, 16, 44, 4, WOOD); K.R(11, 19, 42, 1, WOOD[1]);
    K.post(9, 25, 46, 3, WOOD); tableTop(K, 3, 11, 58, 5, WOOD);
  } };
  A.bed = { w: 2, h: 1, draw: function (K) {
    var R = K.R; K.shadow(2, 31, 60);
    K.slab(2, 3, 9, 28, DARK, { round: 1 }); R(4, 7, 5, 18, DARK[2]); R(4, 7, 5, 1, DARK[1]); K.disc(6.5, 5.5, 2.2, DARK[5]); K.P(6, 4, DARK[6]);   // carved headboard with a knob
    K.slab(54, 12, 8, 19, DARK, { round: 1 }); R(56, 16, 4, 9, DARK[2]);
    K.slab(10, 20, 45, 6, WOOD, { grain: 1 }); legs(K, [11, 50], 26, 31, DARK);
    K.slab(10, 14, 45, 7, ["#5a5a6a", "#9a9aa8", "#c4c4cc", "#e2e2e6", "#f0f0f2", "#fafafa", "#ffffff"]);   // mattress and sheet
    var Q = ["#2a1a4a", "#3e2a6e", "#56408f", "#6e58ae", "#8a74c6", "#a692da", "#c8b8f0"];   // the swamp quilt: purple with teal and gold patches
    K.slab(21, 12, 34, 15, Q, { round: 1 }); R(21, 12, 34, 1, Q[0]);   // the quilt drapes down over the side of the bed
    var PT = ["#2fb59a", "#e8b83a", Q[5], "#d6587a"]; for (var px = 23, pi = 0; px < 52; px += 5, pi++) for (var py = 14; py < 25; py += 5) { var c = PT[(pi + (py >> 2)) % 4]; R(px, py, 4, 4, c, 0.9); R(px, py, 4, 1, "#fff", 0.3); R(px, py + 3, 4, 1, "#000", 0.18); }
    for (var sx = 22; sx < 54; sx += 2) { K.P(sx, 18 + (sx % 4 ? 1 : 0), Q[1], 0.5); } R(21, 26, 34, 1, Q[0]); for (var fx = 22; fx < 54; fx += 3) K.P(fx, 27, Q[3]);   // a stitch line and a fringe
    R(22, 12, 32, 1, Q[6]); R(21, 13, 1, 13, Q[5]);
    K.slab(11, 9, 12, 7, ["#4a4a58", "#a8a8b4", "#ccccd4", "#e8e8ee", "#f6f6f8", "#ffffff", "#ffffff"], { round: 1 }); R(13, 13, 8, 1, "#b8b8c4");   // pillow
  } };
  A.bench = { w: 2, h: 1, draw: function (K) {   // Bog Workbench
    var R = K.R; K.shadow(3, 31, 58); legs(K, [6, 54], 17, 31, DARK); K.slab(8, 25, 48, 3, DARK, { grain: 1 });
    [[12, 21], [19, 22], [26, 21]].forEach(function (l) { K.slab(l[0], l[1], 6, 4, WOOD, { round: 1 }); K.disc(l[0] + 1.5, l[1] + 2, 1.2, WOOD[5]); });   // logs on the shelf
    tableTop(K, 2, 12, 60, 6, WOOD);
    K.slab(5, 6, 8, 6, IRON, { shine: 1 }); R(7, 4, 4, 2, IRON[3]); R(4, 8, 2, 2, IRON[1]);   // vise
    K.slab(18, 9, 14, 3, PALE, { grain: 1 }); R(20, 10, 9, 1, "#3e6aa8", 0.6);   // plans on paper
    R(37, 9, 12, 2, WOOD[2]); K.slab(46, 6, 6, 5, IRON, {}); R(37, 9, 9, 1, WOOD[5]);   // hammer
    K.slab(53, 5, 7, 7, CLAY, { round: 1 }); R(54, 2, 5, 3, "#4fbf5a"); K.P(55, 1, "#ff8ad0"); K.P(57, 2, "#ffd23f");   // a little pot of swamp moss
  } };
  A.decorbench = { w: 2, h: 1, draw: function (K) {
    var R = K.R; K.shadow(3, 31, 58); legs(K, [6, 54], 17, 31, WOOD); K.slab(8, 25, 48, 3, WOOD, { grain: 1 });
    K.slab(12, 21, 10, 4, ["#1a3e36", "#1f6a5a", "#2a8a74", "#2fb59a", "#5ad4b8", "#8ae8d4", "#c4fff0"]); K.slab(24, 22, 10, 3, ["#3a1a4a", "#5a2a74", "#7a3e9a", "#9a58bc", "#b878d8", "#d4a0ee", "#f0d4ff"]);   // folded fabric
    tableTop(K, 2, 12, 60, 6, WOOD); R(10, 12, 40, 4, "#2fb59a"); R(10, 12, 40, 1, "#8ae8d4"); R(10, 15, 40, 1, "#1f6a5a"); for (var t = 12; t < 50; t += 4) K.P(t, 14, "#e8b83a");   // teal runner with gold stitches
    [["#d6382e", 7], ["#e8b83a", 15], ["#3e7ad8", 23]].forEach(function (pt) { K.slab(pt[1], 6, 6, 6, IRON, {}); R(pt[1] + 1, 6, 4, 2, pt[0]); R(pt[1] + 1, 6, 2, 1, "#fff", 0.5); });   // paint pots
    R(42, 2, 2, 10, WOOD[3]); R(42, 2, 1, 10, WOOD[5]); R(41, 0, 4, 3, "#e8b83a"); R(41, 0, 4, 1, "#fff4c0");   // brush
    K.slab(48, 7, 10, 5, ["#3a1a4a", "#5a2a74", "#7a3e9a", "#9a58bc", "#b878d8", "#d4a0ee", "#f0d4ff"], { round: 1 });
  } };
  A.furnace = { w: 2, h: 1, draw: function (K) {
    var R = K.R; K.shadow(2, 31, 60);
    K.slab(24, 0, 16, 6, STONE); R(26, 1, 12, 1, STONE[6]);   // chimney
    K.slab(3, 5, 58, 26, STONE, { round: 1 });
    for (var row = 0; row < 5; row++) { var y = 9 + row * 5; if (y < 30) R(4, y, 56, 1, STONE[1], 0.8); for (var bx = 4 + (row % 2) * 5; bx < 58; bx += 10) { if (bx > 4) R(bx, y - 4, 1, 4, STONE[1], 0.8); R(bx + 1, y - 4, Math.min(8, 59 - bx), 1, STONE[4], 0.5); K.P(bx + 2 + Math.floor(K.h(bx, y) * 5), y - 2, STONE[2], 0.7); } }
    R(17, 11, 30, 18, STONE[0]); R(18, 12, 28, 17, "#2a0e06");   // the mouth
    K.clr(17, 11); K.clr(46, 11); K.clr(17, 12); K.clr(46, 12); K.P(18, 12, STONE[0]); K.P(45, 12, STONE[0]);
    var gg = K.g.createLinearGradient(0, 14, 0, 29); gg.addColorStop(0, "#5a1406"); gg.addColorStop(0.5, "#e2501a"); gg.addColorStop(1, "#ffd860"); K.g.fillStyle = gg; K.g.fillRect(19, 15, 26, 13);
    K.flame(25, 27, 10); K.flame(32, 27, 13); K.flame(39, 27, 9); R(19, 26, 26, 2, "#3a1408"); for (var c = 20; c < 44; c += 3) { R(c, 26, 2, 1, "#ff8a3d"); K.P(c + 1, 27, "#ffd23f"); }
    K.slab(15, 28, 34, 3, IRON); R(16, 29, 32, 1, IRON[5]);   // grate lip
  } };
  A.loom = { w: 2, h: 1, draw: function (K) {
    var R = K.R; K.shadow(2, 31, 60); K.post(4, 2, 5, 29, WOOD); K.post(55, 2, 5, 29, WOOD); K.slab(2, 1, 60, 4, WOOD, { grain: 1 }); K.slab(6, 25, 52, 3, WOOD);
    for (var x = 10; x < 54; x += 2) { R(x, 5, 1, 14, x % 4 ? "#e6dcc4" : "#cfc3a6"); }
    K.slab(8, 6, 48, 2, DARK);   // heddle bar
    var cl = ["#c22e2a", "#e8b83a", "#2fb59a", "#e8b83a", "#c22e2a"]; for (var r = 0; r < 5; r++) R(9, 18 + r, 46, 1, cl[r]); for (var zx = 9; zx < 55; zx += 4) { K.P(zx, 20, "#fff4c0"); K.P(zx + 2, 19, "#7a1410"); }
    K.slab(8, 23, 48, 2, DARK); R(12, 13, 10, 3, WOOD[4]); R(12, 13, 10, 1, WOOD[6]); R(10, 14, 2, 1, "#e6dcc4");   // shuttle
  } };
  A.masontable = { w: 2, h: 1, draw: function (K) {
    var R = K.R; K.shadow(3, 31, 58); legs(K, [6, 54], 17, 31, DARK); K.post(9, 25, 46, 3, DARK);
    K.slab(2, 12, 60, 6, STONE, { shine: 1 }); for (var s = 6; s < 60; s += 7) K.P(s, 15, STONE[2]);
    K.slab(8, 3, 16, 9, STONE, { round: 1 }); R(10, 6, 4, 3, STONE[2]); K.line(18, 4, 22, 10, STONE[1]); R(9, 4, 6, 1, STONE[6]);   // a half-carved block
    R(30, 9, 12, 2, WOOD[3]); R(30, 9, 12, 1, WOOD[5]); K.slab(40, 6, 7, 6, WOOD, { round: 1 });   // mallet
    R(50, 10, 9, 1, IRON[5]); R(50, 11, 9, 1, IRON[2]); R(47, 10, 3, 2, WOOD[3]);   // chisel
    for (var d = 0; d < 6; d++) K.P(26 + d * 2, 11, STONE[5], 0.7);   // stone dust
  } };
  A.jeweltable = { w: 2, h: 1, draw: function (K) {
    var R = K.R; K.shadow(3, 31, 58); legs(K, [6, 54], 17, 31, DARK); K.post(9, 25, 46, 3, DARK);
    tableTop(K, 2, 12, 60, 6, DARK);
    K.slab(8, 10, 34, 4, ["#0e1a3a", "#162a5a", "#1e3a7e", "#2a4ea0", "#3e66c0", "#5a82d8", "#8aa8ee"]);   // velvet mat
    [[12, "#ff3a5a", "#ffc0cc"], [19, "#b06aff", "#e8d0ff"], [26, "#3ae0ff", "#d0fbff"], [33, "#4ee66a", "#d0ffd8"]].forEach(function (gm) { R(gm[0], 8, 4, 3, gm[1]); K.P(gm[0] + 1, 8, gm[2]); R(gm[0], 10, 4, 1, "#000", 0.25); K.P(gm[0] + 1, 7, gm[1]); });
    K.post(52, 2, 3, 10, IRON); K.line(53, 2, 46, 0, IRON[3]); K.disc(45, 3, 4, IRON[0]); K.disc(45, 3, 3, "#bfe8ff", 0.85); K.P(44, 2, "#ffffff");   // magnifier on an arm
  } };
  A.desk = { w: 2, h: 1, draw: function (K) {
    var R = K.R; K.shadow(3, 31, 58);
    K.slab(4, 15, 22, 16, WOOD, { grain: 1 }); [17, 23].forEach(function (y) { K.slab(6, y, 18, 6, WOOD); R(13, y + 2, 4, 2, GOLD[4]); K.P(13, y + 2, GOLD[6]); });   // drawers with brass pulls
    K.post(53, 15, 5, 16, WOOD); tableTop(K, 2, 10, 60, 5, WOOD);
    K.slab(30, 7, 14, 3, PALE); R(32, 8, 8, 1, "#5a4a3a", 0.5);   // letter
    K.slab(47, 4, 6, 6, ["#0a0a14", "#14142a", "#1e1e3e", "#2a2a5a", "#3a3a7a", "#5a5aa0", "#9a9ae0"], { round: 1 }); R(48, 3, 4, 1, IRON[4]);   // ink pot
    K.line(51, 0, 56, 8, "#f6f0e0"); K.line(52, 0, 57, 7, "#d8cfb8"); K.line(53, 1, 55, 5, "#ffffff");   // quill
  } };
  A.sofa = { w: 2, h: 1, draw: function (K) {
    var G = ["#122a10", "#1e4a1a", "#2c6a24", "#3e8a30", "#56aa42", "#78c85a", "#a8e888"], R = K.R; K.shadow(2, 31, 60);
    K.slab(6, 6, 52, 14, G, { round: 1 }); for (var x = 9; x < 56; x += 3) R(x, 8, 1, 10, G[2], 0.6);   // woven reed back
    K.slab(2, 12, 9, 15, G, { round: 1 }); K.slab(53, 12, 9, 15, G, { round: 1 }); R(4, 13, 5, 1, G[6]); R(55, 13, 5, 1, G[6]);   // arms
    K.slab(10, 18, 22, 7, G, { round: 1 }); K.slab(32, 18, 22, 7, G, { round: 1 }); R(12, 19, 8, 1, G[6]); R(34, 19, 8, 1, G[6]);   // cushions
    K.slab(4, 25, 56, 3, DARK); [6, 54].forEach(function (x) { K.post(x, 28, 4, 3, DARK); });
    K.slab(40, 10, 9, 8, ["#4a2a06", "#8a5a10", "#c8941e", "#e8b83a", "#f6d060", "#fff0a0", "#ffffff"], { round: 1 });   // a little gold pillow
  } };
  A.maptable = { w: 2, h: 1, draw: function (K) {
    var R = K.R; K.shadow(3, 31, 58); legs(K, [6, 54], 17, 31, WOOD); K.post(9, 25, 46, 3, WOOD); tableTop(K, 2, 12, 60, 6, WOOD);
    K.slab(8, 9, 40, 5, PALE); R(10, 10, 12, 2, "#4fae5a"); R(23, 10, 9, 3, "#4a8ad8"); R(33, 10, 10, 2, "#4fae5a"); K.P(28, 10, "#d6382e"); K.P(29, 11, "#d6382e"); K.P(29, 10, "#d6382e"); K.P(28, 11, "#d6382e");   // map with an X
    K.slab(6, 8, 3, 7, PALE, {}); K.slab(47, 8, 3, 7, PALE, {});   // rolled ends
    K.disc(54, 10, 3.2, GOLD[2]); K.disc(54, 10, 2.3, "#f6f0dc"); K.P(54, 9, "#d6382e"); K.P(54, 10, "#2a2a3a");   // compass
  } };
  A.sawbench = { w: 2, h: 1, draw: function (K) {
    var R = K.R; K.shadow(3, 31, 58);
    [[6, 13], [50, 13]].forEach(function (l) { K.line(l[0] + 4, l[1], l[0], 30, WOOD[0]); K.line(l[0] + 5, l[1], l[0] + 1, 30, WOOD[4]); K.line(l[0] + 4, l[1], l[0] + 8, 30, WOOD[0]); K.line(l[0] + 5, l[1], l[0] + 9, 30, WOOD[3]); });
    tableTop(K, 3, 10, 58, 5, WOOD);
    K.slab(14, 2, 30, 8, PALE, { grain: 1, round: 1 }); K.disc(43, 6, 3.5, PALE[3]); K.disc(43, 6, 2.2, PALE[5]); K.P(43, 6, PALE[2]);   // a log being cut
    R(26, 0, 22, 2, IRON[5]); R(26, 2, 22, 1, IRON[2]); for (var t = 27; t < 48; t += 2) K.P(t, 3, IRON[3]); K.slab(46, 0, 6, 5, WOOD, { round: 1 });   // saw
    for (var d = 0; d < 9; d++) K.P(18 + Math.floor(K.h(d, 2) * 26), 15 + Math.floor(K.h(d, 5) * 14), PALE[5], 0.8);   // sawdust
  } };

  A.wardrobe = { w: 1, h: 2, draw: function (K) {
    var R = K.R; K.shadow(2, 63, 28);
    K.slab(1, 2, 30, 5, DARK, { shine: 1 }); R(2, 1, 28, 1, DARK[0]); K.slab(3, 6, 26, 52, DARK);
    [[5, 8], [17, 8]].forEach(function (d) { K.slab(d[0], d[1], 11, 48, WOOD, { grain: 1 }); K.slab(d[0] + 2, d[1] + 3, 7, 18, WOOD); K.slab(d[0] + 2, d[1] + 25, 7, 18, WOOD); });
    R(15, 30, 2, 5, GOLD[4]); R(16, 30, 1, 5, GOLD[2]); K.P(15, 30, GOLD[6]); R(18, 30, 2, 5, GOLD[4]); K.P(18, 30, GOLD[6]);   // handles
    K.slab(2, 57, 28, 4, DARK); K.post(3, 60, 4, 3, DARK); K.post(25, 60, 4, 3, DARK);
  } };
  function shelfCase(K, p) { K.slab(1, 1, 30, 62, p); K.R(3, 4, 26, 56, p[1]); K.R(3, 4, 26, 1, p[0]); K.R(3, 4, 1, 56, p[0], 0.6); }
  function shelfBoard(K, y, p) { K.slab(2, y, 28, 3, p); }
  A.bookshelf = { w: 1, h: 2, draw: function (K) {
    var R = K.R, BK = [["#c22e2a", "#e8584a"], ["#2a5ab0", "#4a82d8"], ["#2a8a4a", "#4ab86a"], ["#e8b83a", "#f6d870"], ["#7a3e9a", "#a868c8"], ["#2fb59a", "#6ae0c8"], ["#a85a28", "#d08040"]];
    shelfCase(K, DARK);
    [17, 31, 45].forEach(function (y) { shelfBoard(K, y, WOOD); });
    [5, 20, 34, 48].forEach(function (y0, s) { var x = 4, n = 0; while (x < 27) { var b = BK[Math.floor(K.h(s * 9 + n, 3) * BK.length)], bw = 2 + Math.floor(K.h(n, s) * 3), bh = 8 + Math.floor(K.h(s, n * 3) * 4); if (x + bw > 28) break;
      if (K.h(n, s + 9) < 0.12 && x + 6 < 28 && n) { K.line(x, y0 + 11, x + 5, y0 + 4, b[0]); K.line(x + 1, y0 + 11, x + 6, y0 + 4, b[1]); x += 7; n++; continue; }   // a leaning book
      R(x, y0 + 12 - bh, bw, bh, b[0]); R(x, y0 + 12 - bh, 1, bh, b[1]); R(x, y0 + 14 - bh, bw, 1, "#f6e6b0", 0.7); R(x, y0 + 10 - Math.floor(bh / 3), bw, 1, "#f6e6b0", 0.5); x += bw + (K.h(n, 7) < 0.2 ? 1 : 0); n++; } });
    K.slab(20, 2, 7, 4, CLAY, { round: 1 }); R(21, 0, 5, 2, "#4fbf5a"); K.P(23, 0, "#9aff8a");   // a little plant on top
    K.slab(1, 59, 30, 4, DARK);
  } };
  A.potionshelf = { w: 1, h: 2, draw: function (K) {
    var R = K.R, PC = ["#ff4a6a", "#4ee6b4", "#b06aff", "#ffcf3a", "#3ab0ff", "#7dff6a"]; shelfCase(K, DARK);
    [17, 31, 45].forEach(function (y) { shelfBoard(K, y, WOOD); });
    [5, 20, 34, 48].forEach(function (y0, s) { var x = 5; for (var n = 0; n < 3; n++) { var c = PC[(s * 2 + n) % PC.length], tall = K.h(s, n) < 0.5, bw = tall ? 5 : 6, bh = tall ? 10 : 7, by = y0 + 12 - bh;
      R(x, by + 3, bw, bh - 3, "#d8f0ff", 0.35); R(x, by + Math.floor(bh / 2), bw, bh - Math.floor(bh / 2), c); R(x, by + Math.floor(bh / 2), bw, 1, "#fff", 0.45); R(x + bw - 1, by + 3, 1, bh - 3, "#000", 0.25); R(x, by + 3, 1, bh - 3, "#fff", 0.4);
      R(x + 1, by, bw - 2, 3, "#d8f0ff", 0.4); R(x + 1, by - 1, bw - 2, 2, "#a8742e"); K.halo(x + bw / 2, by + bh * 0.7, 5, c === "#ff4a6a" ? "255,74,106" : "180,255,220", 0.18); x += bw + 2; } });
    K.slab(1, 59, 30, 4, DARK);
  } };
  A.scrollshelf = { w: 1, h: 2, draw: function (K) {
    var R = K.R; shelfCase(K, WOOD);
    for (var r = 0; r < 4; r++) { var y0 = 5 + r * 14; if (r) shelfBoard(K, y0 - 3, DARK); R(15, y0, 2, 11, WOOD[2]);
      for (var c = 0; c < 2; c++) for (var k = 0; k < 2; k++) { var cx = 6 + c * 12 + k * 4, cy = y0 + 4 + (k ? 3 : 0); K.disc(cx, cy, 2.6, PALE[1]); K.disc(cx, cy, 2, PALE[5]); K.P(Math.round(cx) - 1, Math.round(cy) - 1, PALE[6]); K.P(Math.round(cx), Math.round(cy), PALE[2]); if ((r + c + k) % 3 === 0) R(Math.round(cx) - 1, Math.round(cy) + 2, 2, 1, "#c22e2a"); } }
    K.slab(1, 59, 30, 4, WOOD);
  } };
  function banner(K, cl, emblem) {   // cl = [ink, deep, shade, mid, light, lighter, shine]
    var R = K.R; R(3, 3, 26, 3, WOOD[0]); R(4, 3, 24, 2, WOOD[4]); R(4, 3, 24, 1, WOOD[6]); K.disc(3, 4, 2.4, GOLD[3]); K.disc(28, 4, 2.4, GOLD[3]); K.P(2, 3, GOLD[6]); K.P(27, 3, GOLD[6]);
    for (var y = 6; y < 61; y++) { var x0 = 6, x1 = 25; R(x0, y, x1 - x0 + 1, 1, cl[3]);
      R(x0, y, 1, 1, cl[0]); R(x1, y, 1, 1, cl[0]); R(x0 + 1, y, 2, 1, GOLD[4]); R(x1 - 2, y, 2, 1, GOLD[3]);   // gold trim down both sides
      R(x0 + 6, y, 2, 1, cl[4], 0.6); R(x0 + 14, y, 2, 1, cl[2], 0.6);   // soft folds
      if (y > 49) { var n = Math.round((y - 49) * 0.85); K.clr(16 - n, y, n * 2, 1); if (n) { K.P(15 - n, y, cl[0]); K.P(16 + n, y, cl[0]); } } }   // the swallowtail
    R(6, 60, 5, 1, cl[0]); R(21, 60, 5, 1, cl[0]); R(6, 6, 20, 2, cl[1]); R(8, 8, 16, 1, GOLD[4]); R(8, 46, 16, 1, GOLD[4]);
    emblem(K);
  }
  A.banner = { w: 1, h: 2, draw: function (K) { banner(K, ["#0a2a22", "#0e4a3a", "#14705a", "#1f9a7c", "#3ec09c", "#7ae0c0", "#c4ffe8"], function (K) {   // a gold lily pad and frog eyes
    K.ell(16, 26, 7, 5, GOLD[3]); K.ell(16, 25, 6, 4, GOLD[5]); K.R(16, 21, 1, 5, GOLD[2]); K.disc(13, 21, 2, GOLD[5]); K.disc(19, 21, 2, GOLD[5]); K.P(13, 21, "#0a2a22"); K.P(19, 21, "#0a2a22"); K.P(12, 20, "#fff"); K.P(18, 20, "#fff"); } ); } };
  A.emberbanner = { w: 1, h: 2, draw: function (K) { banner(K, ["#3a0a04", "#6a1408", "#9a2410", "#c83a18", "#e8602a", "#f6904a", "#ffc890"], function (K) { K.flame(16, 34, 16, ["#6a1408", "#ff8a1a", "#ffc43a", "#fff0a0"]); } ); } };
  A.frostbanner = { w: 1, h: 2, draw: function (K) { banner(K, ["#081e3a", "#0e3060", "#164a8a", "#2266b0", "#3e8ad0", "#7ab8ec", "#d4f0ff"], function (K) {
    var c = "#e8fbff"; K.R(15, 16, 2, 19, c); K.R(7, 25, 18, 2, c); K.line(9, 18, 23, 33, c); K.line(23, 18, 9, 33, c); K.line(10, 18, 22, 33, c); K.line(22, 18, 10, 33, c); K.disc(16, 26, 2.5, "#ffffff"); } ); } };
  A.forgebanner = { w: 1, h: 2, draw: function (K) { banner(K, ["#2a0606", "#5a0e0e", "#8a1a14", "#b8281e", "#d8483a", "#ee7a6a", "#ffc0b0"], function (K) {   // a gold hammer over an anvil
    K.slab(9, 17, 14, 6, GOLD, { shine: 1 }); K.R(15, 23, 3, 11, GOLD[2]); K.R(15, 23, 1, 11, GOLD[5]); K.slab(8, 34, 16, 4, GOLD); K.R(11, 38, 10, 3, GOLD[2]); } ); } };

  A.tent = { w: 2, h: 2, draw: function (K) {
    var R = K.R, C = ["#3a2814", "#7a5a30", "#a08048", "#c0a062", "#d8bc80", "#ead4a0", "#fbecc8"];
    K.shadow(2, 63, 60); R(31, 0, 2, 14, WOOD[2]); R(31, 0, 1, 14, WOOD[5]); R(33, 1, 10, 6, "#d6382e"); R(33, 1, 10, 1, "#ff7a6a"); R(41, 3, 3, 2, "#d6382e");   // pole and pennant
    for (var y = 0; y < 50; y++) { var hw = Math.round(2 + y * 0.6), yy = 12 + y; R(32 - hw, yy, hw * 2, 1, C[3]); R(32 - hw, yy, Math.round(hw * 0.75), 1, C[4]); R(32 - hw, yy, 2, 1, C[0]); R(32 + hw - 2, yy, 2, 1, C[0]); if (y % 9 === 4) R(32 - hw + 2, yy, hw * 2 - 4, 1, C[2], 0.45); }   // canvas, lit on the left
    R(31, 12, 2, 50, C[1]);   // ridge seam
    for (var y2 = 30; y2 < 62; y2++) { var w2 = Math.round((y2 - 30) * 0.45); R(32 - w2, y2, w2 * 2, 1, "#2a1a0e"); }   // the open doorway
    for (var y3 = 30; y3 < 62; y3++) { var w3 = Math.round((y3 - 30) * 0.45); R(32 - w3 - 4, y3, 4, 1, C[5]); R(32 + w3, y3, 4, 1, C[2]); }   // flaps tied back
    R(18, 47, 6, 2, "#c22e2a"); R(40, 47, 6, 2, "#c22e2a"); R(18, 47, 6, 1, "#ff6a5a"); R(40, 47, 6, 1, "#ff6a5a");
    K.slab(10, 34, 7, 6, ["#3a2814", "#6a4a20", "#8a6a30", "#a88a44", "#c4a45c", "#dcc07a", "#f0dca0"]); K.line(11, 35, 15, 38, C[1]);   // a patch
    K.line(3, 61, 16, 40, C[5]); K.line(60, 61, 47, 40, C[5]); K.slab(1, 59, 4, 4, WOOD); K.slab(59, 59, 4, 4, WOOD);   // guy ropes and pegs
    R(4, 62, 56, 2, "#5a4022");
  } };
  function crateBody(K, x, y, w, h, p) {
    var R = K.R; K.slab(x, y, w, h, p); for (var py = y + 8; py < y + h - 4; py += 8) { R(x + 1, py, w - 2, 1, p[1]); R(x + 1, py + 1, w - 2, 1, p[5], 0.5); }
    K.slab(x, y, w, 6, DARK); K.slab(x, y + h - 6, w, 6, DARK); K.slab(x, y, 6, h, DARK); K.slab(x + w - 6, y, 6, h, DARK);
    [[x + 1, y + 1], [x + w - 5, y + 1], [x + 1, y + h - 5], [x + w - 5, y + h - 5]].forEach(function (c) { K.slab(c[0], c[1], 4, 4, IRON); K.P(c[0] + 1, c[1] + 1, IRON[6]); });
  }
  A.crate = { w: 2, h: 2, draw: function (K) {
    K.shadow(2, 63, 60); crateBody(K, 3, 8, 58, 55, WOOD);
    for (var i = 0; i <= 42; i++) { var x = 9 + i, y = 55 - Math.round(i * 40 / 42); K.R(x, y - 2, 3, 5, DARK[2]); K.P(x, y - 2, DARK[4]); K.P(x, y + 2, DARK[0]); }   // cross brace
    K.disc(32, 35, 7, WOOD[2], 0.55); K.disc(28, 32, 1.6, WOOD[1]); K.disc(36, 32, 1.6, WOOD[1]); K.R(28, 37, 9, 1, WOOD[1]);   // a stencilled frog face
  } };
  A.supplycrate = { w: 2, h: 2, draw: function (K) {
    var R = K.R; K.shadow(2, 63, 60); crateBody(K, 3, 14, 58, 49, PALE);
    R(18, 30, 28, 18, "#2e6a3a", 0.85); R(30, 32, 4, 14, "#e8f0d0"); R(25, 37, 14, 4, "#e8f0d0");   // a painted green cross
    [10, 52].forEach(function (x) { R(x, 36, 2, 10, "#8a6a3a"); R(x - 1, 36, 4, 1, "#c4a46a"); });   // rope handles
    K.slab(8, 2, 22, 14, ["#2a2014", "#5a4a2e", "#7a6640", "#9a8456", "#b8a270", "#d4c08e", "#ecdcb0"], { round: 1 }); R(13, 2, 12, 2, "#8a6a3a"); R(10, 6, 18, 1, "#5a4a2e", 0.5);   // a tied sack on top
    K.slab(34, 7, 14, 9, WOOD, { grain: 1 }); R(36, 9, 10, 1, "#d6382e");   // a small box
  } };

  // ---------- small pieces (one block) ----------
  A.chair = { w: 1, h: 1, draw: function (K) {   // facing right: the back on the left
    var R = K.R; K.shadow(4, 31, 24); K.post(5, 1, 5, 30, WOOD); K.slab(4, 0, 7, 3, WOOD, { round: 1, shine: 1 }); K.slab(9, 4, 4, 3, WOOD); K.slab(9, 9, 4, 3, WOOD);   // tall back with two rails
    K.slab(5, 16, 22, 4, WOOD, { grain: 1, shine: 1 }); K.slab(7, 13, 18, 4, ["#122a10", "#1e4a1a", "#2c6a24", "#3e8a30", "#56aa42", "#78c85a", "#a8e888"], { round: 1 });   // green cushion
    K.post(23, 20, 4, 11, WOOD); K.post(9, 20, 3, 11, WOOD); R(9, 26, 16, 2, WOOD[2]);
  } };
  A.stool = { w: 1, h: 1, draw: function (K) {
    var R = K.R; K.shadow(5, 31, 22); K.line(10, 18, 6, 30, WOOD[0]); K.line(11, 18, 7, 30, WOOD[4]); K.line(21, 18, 25, 30, WOOD[0]); K.line(20, 18, 24, 30, WOOD[3]); K.post(14, 18, 4, 13, WOOD); R(9, 25, 14, 2, WOOD[2]);
    K.ell(16, 16, 11, 3.6, WOOD[0]); K.ell(16, 15.5, 10, 2.8, WOOD[4]); K.ell(15, 15, 7, 1.6, WOOD[5]); K.R(6, 17, 20, 2, WOOD[2]); K.R(6, 18, 20, 1, WOOD[0]);
  } };
  A.chest = { w: 1, h: 1, draw: function (K) {
    var R = K.R; K.shadow(2, 31, 28); K.slab(2, 14, 28, 17, WOOD, { grain: 1 }); K.slab(2, 5, 28, 10, WOOD, { round: 1, shine: 1 }); R(3, 6, 26, 1, WOOD[6]); R(3, 14, 26, 1, WOOD[0]);
    [6, 23].forEach(function (x) { K.slab(x, 5, 3, 26, IRON); R(x + 1, 6, 1, 24, IRON[5]); });   // iron bands
    K.slab(12, 11, 8, 9, GOLD, { shine: 1 }); R(15, 15, 2, 3, GOLD[0]); K.P(15, 14, GOLD[0]);   // lock plate
    K.nail(4, 17); K.nail(27, 17); K.nail(4, 27); K.nail(27, 27);
  } };
  A.torch = { w: 1, h: 1, draw: function (K) {
    var R = K.R; K.halo(16, 9, 12, "255,170,60", 0.35); K.post(14, 13, 4, 19, WOOD); R(13, 12, 6, 4, "#8a6a40"); R(13, 12, 6, 1, "#c4a46a"); R(13, 14, 6, 1, "#5a4022");   // wrapped head
    K.flame(16, 13, 12);
  } };
  A.lantern = { w: 1, h: 1, draw: function (K) {   // Clay Lantern: a clay pot with a glowing glass lamp on top
    var R = K.R; K.shadow(6, 31, 20); K.halo(16, 12, 12, "255,200,110", 0.3);
    K.slab(7, 18, 18, 13, CLAY, { round: 1, shine: 1 }); R(9, 22, 14, 1, CLAY[2]); R(9, 25, 14, 1, "#e8b83a", 0.6);
    K.slab(9, 6, 14, 13, IRON, { round: 1 }); R(11, 8, 10, 9, "#ffd870"); R(11, 8, 10, 2, "#fff4c0"); R(11, 15, 10, 2, "#ff9a3a"); R(15, 6, 2, 12, IRON[2]); K.flame(16, 15, 6, ["#ff8a1a", "#ffd860", "#ffffff"]);
    K.slab(8, 3, 16, 4, IRON, { round: 1 }); R(14, 0, 4, 3, IRON[3]); R(15, 0, 2, 1, IRON[0]);
  } };
  A.sconce = { w: 1, h: 1, draw: function (K) {   // Glowspore Sconce: an iron bracket holding a glowing teal spore bulb
    var R = K.R; K.halo(16, 12, 13, "80,240,200", 0.35); K.slab(12, 18, 8, 12, IRON); R(14, 21, 4, 6, IRON[1]); K.line(16, 18, 16, 14, IRON[3]);
    K.slab(9, 15, 14, 4, IRON, { round: 1 }); K.ell(16, 10, 7, 6, "#0e5a4a"); K.ell(16, 9.5, 6, 5, "#2fd8b0"); K.ell(15, 8, 3.5, 2.5, "#9affe6"); K.P(13, 7, "#ffffff"); [[11, 3], [20, 4], [16, 1]].forEach(function (s) { K.P(s[0], s[1], "#9affe6", 0.8); });
  } };
  A.hanginglantern = { w: 1, h: 1, draw: function (K) {
    var R = K.R; for (var y = 0; y < 8; y += 2) { R(15, y, 2, 1, IRON[4]); R(15, y + 1, 2, 1, IRON[1]); } K.halo(16, 18, 12, "255,190,90", 0.35);
    K.slab(10, 8, 12, 4, IRON, { round: 1 }); K.slab(9, 11, 14, 15, IRON); R(11, 13, 10, 11, "#ffcf60"); R(11, 13, 10, 2, "#fff4c0"); R(15, 11, 2, 15, IRON[2]); K.flame(16, 22, 6, ["#ff8a1a", "#ffd860", "#ffffff"]); K.slab(10, 25, 12, 3, IRON, { round: 1 });
  } };
  A.streetlamp = { w: 1, h: 1, draw: function (K) {
    var R = K.R; K.shadow(8, 31, 16); K.halo(16, 6, 12, "255,210,120", 0.35); K.post(14, 10, 4, 21, IRON); K.slab(10, 28, 12, 3, IRON); K.slab(11, 13, 10, 2, IRON);
    K.slab(9, 0, 14, 3, IRON, { round: 1 }); K.slab(10, 2, 12, 8, IRON); R(12, 3, 8, 6, "#ffe08a"); R(12, 3, 8, 1, "#fffbe0"); R(15, 2, 2, 8, IRON[2]); K.slab(11, 9, 10, 2, IRON);
  } };
  A.campfire = { w: 1, h: 1, draw: function (K) {
    var R = K.R; K.halo(16, 18, 14, "255,150,50", 0.35);
    K.line(5, 29, 26, 22, WOOD[0]); K.line(5, 28, 26, 21, WOOD[3]); K.line(6, 27, 25, 21, WOOD[5]); K.line(26, 29, 6, 22, DARK[0]); K.line(26, 28, 6, 21, DARK[3]); K.line(25, 27, 7, 21, DARK[5]);   // crossed logs
    K.flame(16, 25, 15); for (var e = 0; e < 4; e++) K.P(10 + e * 4, 3 + (e % 2) * 3, "#ffd860", 0.8);
    for (var s = 0; s < 7; s++) { var sx = 2 + s * 4.3; K.ell(sx + 1.5, 29, 2.4, 2, STONE[3]); K.ell(sx + 1, 28.5, 1.4, 1, STONE[5]); }
  } };

  function paint(kind) {   // a canvas with this piece at 32 px a block, or null
    var a = A[kind]; if (!a || typeof document === "undefined") return null;
    var c = document.createElement("canvas"); c.width = a.w * 32; c.height = a.h * 32; var g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    try { a.draw(kit(g, c.width, c.height)); } catch (e) { return null; }
    return c;
  }
  var api = { art: A, paint: paint, kit: kit };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DelveFurn = api;
})(typeof window !== "undefined" ? window : this);
