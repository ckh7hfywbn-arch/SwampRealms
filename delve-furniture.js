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

  // ---------- LIGHTING (batch 1 of the decor redraw) ----------
  function glass(K, x, y, w, h, fill, hi, a) {   // a pane of glass with a glow inside: tinted fill, a bright core, a glint on the left
    var R = K.R; R(x, y, w, h, fill, a == null ? 1 : a); R(x + 1, y + 1, 1, h - 2, "#ffffff", 0.55); R(x + 2, y + 1, 1, Math.max(1, Math.floor(h / 3)), "#ffffff", 0.3); R(x + w - 1, y, 1, h, "#000", 0.18); if (hi) R(x + Math.floor(w / 2) - 1, y + Math.floor(h / 2) - 1, 3, 3, hi, 0.8);
  }
  function cage(K, x, y, w, h, p, fill, hi, rgb) {   // a lantern: a cap and ring on top, glass between two side bars, a foot
    var R = K.R; K.halo(x + w / 2, y + h / 2, w + 6, rgb, 0.32);
    glass(K, x + 2, y + 3, w - 4, h - 6, fill, hi);
    K.post(x, y + 2, 3, h - 3, p); K.post(x + w - 3, y + 2, 3, h - 3, p);
    K.slab(x - 1, y, w + 2, 4, p, { round: 1, shine: 1 }); K.slab(x - 1, y + h - 3, w + 2, 4, p, { round: 1 }); K.slab(x + Math.floor(w / 2) - 2, y - 3, 4, 3, p, {}); R(x + Math.floor(w / 2) - 1, y - 5, 2, 2, p[0]);
  }
  function wick(K, x, y, h, wax) {   // a candle with its flame
    var R = K.R, W = wax || ["#6a5a3e", "#c8b890", "#e2d4b0", "#f2e8cc", "#fffaf0", "#ffffff", "#ffffff"]; K.halo(x + 1.5, y - 4, 7, "255,190,90", 0.3);
    R(x - 1, y, 5, h, W[0]); R(x, y, 3, h, W[3]); R(x, y, 1, h, W[5]); R(x + 2, y, 1, h, W[1]); R(x, y + 1, 1, 2, W[4]); P2(K, x + 3, y + 2, W[3]);
    R(x + 1, y - 2, 1, 2, "#3a2a20"); K.flame(x + 1.5, y - 1, 6, ["#ff8a1a", "#ffd860", "#fff6d0"]);
  }
  function P2(K, x, y, c) { K.P(x, y, c); }
  A.bonfire = { w: 1, h: 1, draw: function (K) {
    K.halo(16, 16, 16, "255,140,40", 0.4); for (var s = 0; s < 7; s++) { K.ell(3 + s * 4.3, 29, 2.6, 2.2, STONE[2]); K.ell(2.6 + s * 4.3, 28.4, 1.6, 1.2, STONE[5]); }
    [[4, 27, 24, 20, WOOD], [27, 27, 8, 20, DARK], [6, 28, 26, 24, PALE]].forEach(function (l) { K.line(l[0], l[1], l[2], l[3], l[4][0]); K.line(l[0], l[1] - 1, l[2], l[3] - 1, l[4][3]); K.line(l[0], l[1] - 2, l[2], l[3] - 2, l[4][5]); });
    K.flame(16, 26, 24); K.flame(10, 26, 13, ["#c8340e", "#ff6a1a", "#ffa62e", "#ffd860"]); K.flame(22, 26, 15, ["#c8340e", "#ff6a1a", "#ffa62e", "#ffd860"]);
    [[6, 6], [25, 3], [21, 9], [9, 2]].forEach(function (e) { K.P(e[0], e[1], "#ffd860"); K.P(e[0], e[1] + 1, "#ff8a1a", 0.6); });
  } };
  A.hearth = { w: 1, h: 1, draw: function (K) {
    var R = K.R; K.slab(1, 2, 30, 6, STONE, { shine: 1 }); K.slab(2, 7, 6, 25, STONE); K.slab(24, 7, 6, 25, STONE);
    for (var y = 10; y < 31; y += 4) { R(3, y, 4, 1, STONE[1]); R(25, y, 4, 1, STONE[1]); }
    R(8, 8, 16, 24, "#1a0a06"); var gg = K.g.createLinearGradient(0, 14, 0, 31); gg.addColorStop(0, "rgba(255,90,20,0)"); gg.addColorStop(1, "rgba(255,150,40,.85)"); K.g.fillStyle = gg; K.g.fillRect(8, 12, 16, 20);
    K.slab(9, 27, 14, 3, DARK, { round: 1 }); K.flame(16, 28, 14); K.flame(12, 28, 7, ["#ff6a1a", "#ffd860"]); K.flame(20, 28, 8, ["#ff6a1a", "#ffd860"]);
    R(0, 2, 32, 1, STONE[0]); R(2, 4, 28, 1, STONE[6], 0.5); K.slab(12, 0, 8, 3, CLAY, { round: 1 }); K.P(14, 0, "#4fbf5a");   // a little pot on the mantel
  } };
  A.brazier = { w: 1, h: 1, draw: function (K) {
    var R = K.R; K.halo(16, 10, 15, "255,150,40", 0.4); K.shadow(6, 31, 20);
    K.line(10, 18, 6, 30, IRON[0]); K.line(11, 18, 7, 30, IRON[4]); K.line(21, 18, 25, 30, IRON[0]); K.line(20, 18, 24, 30, IRON[3]); R(12, 18, 8, 13, IRON[2]); R(12, 18, 1, 13, IRON[4]);
    K.slab(3, 12, 26, 7, IRON, { round: 1, shine: 1 }); for (var x = 6; x < 27; x += 4) K.P(x, 15, GOLD[4]); R(4, 11, 24, 2, "#3a1408"); for (var c = 5; c < 27; c += 3) K.P(c, 11, "#ff8a3d");
    K.flame(16, 12, 13); K.flame(10, 12, 8, ["#ff6a1a", "#ffa62e", "#ffd860"]); K.flame(22, 12, 9, ["#ff6a1a", "#ffa62e", "#ffd860"]);
  } };
  A.lumenlamp = { w: 1, h: 1, draw: function (K) {   // a slim teal crystal lamp on a dark stand
    var R = K.R; K.shadow(9, 31, 14); K.halo(16, 12, 14, "70,255,220", 0.38); K.slab(10, 27, 12, 4, IRON, { round: 1 }); K.post(14, 20, 4, 8, IRON);
    K.slab(10, 3, 12, 18, ["#063a34", "#0a5a50", "#108076", "#20b0a0", "#46dcc8", "#8af6e6", "#e0fffa"], { round: 1, shine: 1 }); R(13, 5, 2, 14, "#c4fff4", 0.8); R(17, 6, 2, 12, "#0a5a50", 0.6); K.slab(9, 1, 14, 3, IRON, { round: 1 });
  } };
  A.fireflyjar = { w: 1, h: 1, draw: function (K) {
    var R = K.R; K.shadow(6, 31, 20); K.halo(16, 18, 14, "220,255,120", 0.3);
    K.slab(7, 7, 18, 24, ["#2a3a30", "#5a7a66", "#8ab0a0", "#b0d4c8", "#cce8de", "#e4f6f0", "#ffffff"], { round: 1 }); R(9, 9, 14, 20, "#203a30", 0.55); R(9, 10, 1, 18, "#fff", 0.6); R(10, 10, 1, 6, "#fff", 0.35);
    [[12, 14], [18, 12], [15, 20], [20, 22], [11, 25], [17, 26], [21, 16]].forEach(function (f, i) { K.halo(f[0], f[1], 3, "230,255,120", 0.6); K.P(f[0], f[1], i % 2 ? "#fbff9a" : "#e8ff6a"); });
    K.slab(8, 3, 16, 5, WOOD, { round: 1, shine: 1 }); R(9, 6, 14, 1, "#c8b890"); R(14, 1, 4, 2, "#c8b890");   // cork lid with a cloth tie
  } };
  A.mushlamp = { w: 1, h: 1, draw: function (K) {
    var R = K.R; K.shadow(8, 31, 16); K.halo(16, 9, 15, "60,240,200", 0.38);
    K.slab(12, 15, 8, 16, PALE, { round: 1 }); R(13, 16, 2, 14, PALE[6]); R(10, 28, 12, 3, PALE[2]); R(10, 28, 12, 1, PALE[4]);
    K.ell(16, 12, 14, 9, "#063a34"); K.ell(16, 11, 13, 8, "#1aa894"); K.ell(14, 9, 9, 5, "#3fe0c4"); K.ell(12, 7, 4, 2, "#a8fff0"); R(3, 13, 26, 2, "#0a5a50"); R(4, 15, 24, 1, "#063a34");
    [[9, 9], [20, 7], [24, 11], [15, 5]].forEach(function (d) { K.disc(d[0], d[1], 1.6, "#e8fff8"); });
    [[2, 18], [29, 15], [27, 21]].forEach(function (s) { K.P(s[0], s[1], "#9affe6", 0.8); });
  } };
  A.lavalamp = { w: 1, h: 1, draw: function (K) {
    var R = K.R; K.shadow(8, 31, 16); K.halo(16, 15, 13, "255,90,60", 0.32);
    K.slab(9, 24, 14, 7, IRON, { round: 1, shine: 1 }); K.slab(10, 1, 12, 5, IRON, { round: 1 });
    R(10, 6, 12, 18, IRON[0]); R(11, 6, 10, 18, "#c8102a"); R(11, 6, 3, 18, "#e8304a"); R(19, 6, 2, 18, "#8a0a1a");
    K.ell(15, 10, 3, 2.5, "#ffb020"); K.ell(17, 17, 3.5, 3, "#ff9a10"); K.ell(14, 21, 2.5, 2, "#ffc840"); K.P(14, 9, "#fff0a0"); K.P(16, 16, "#fff0a0"); R(12, 7, 1, 15, "#fff", 0.35);
  } };
  A.emberlantern = { w: 1, h: 1, draw: function (K) { cage(K, 8, 6, 16, 23, DARK, "#ff8a1a", "#fff0a0", "255,150,50"); K.flame(16, 24, 11); K.shadow(7, 31, 18); } };
  A.frostlantern = { w: 1, h: 1, draw: function (K) { cage(K, 8, 6, 16, 23, IRON, "#7acbff", "#ffffff", "140,210,255"); var c = "#ffffff"; K.R(15, 11, 2, 11, c); K.R(11, 15, 10, 2, c); K.line(12, 12, 19, 20, "#d8f4ff"); K.line(19, 12, 12, 20, "#d8f4ff"); K.shadow(7, 31, 18); } };
  A.skullcandle = { w: 1, h: 1, draw: function (K) {
    var R = K.R, BN = ["#3a3226", "#8a7e66", "#b8ac90", "#d8ceb4", "#ece4ce", "#f8f2e2", "#ffffff"]; K.shadow(4, 31, 24);
    for (var d = 0; d < 6; d++) R(9 + d * 2 + (d % 2), 13 + (d % 3), 2, 3 + d % 2, "#f2e8cc");   // wax drips down the skull
    K.ell(16, 21, 11, 9, BN[0]); K.ell(16, 20.5, 10, 8, BN[3]); K.ell(13, 17, 6, 4, BN[5]); R(9, 26, 14, 5, BN[0]); R(10, 26, 12, 4, BN[3]); for (var t = 11; t < 22; t += 3) R(t, 27, 2, 3, BN[5]);
    K.ell(12, 21, 3, 3, "#2a1a1a"); K.ell(20, 21, 3, 3, "#2a1a1a"); K.P(12, 21, "#ffb040"); K.P(20, 21, "#ffb040"); R(15, 24, 2, 2, "#3a2a20");
    wick(K, 14, 4, 9);
  } };
  A.tablecandle = { w: 1, h: 1, draw: function (K) {
    K.shadow(8, 31, 16); K.ell(16, 28, 10, 3, GOLD[1]); K.ell(16, 27, 9, 2.5, GOLD[4]); K.ell(14, 26.5, 5, 1, GOLD[6]); K.R(20, 22, 6, 2, GOLD[3]); K.disc(26, 23, 2.4, GOLD[2]); K.disc(26, 23, 1.2, "#2a1a06");   // a brass holder with a ring handle
    wick(K, 14, 10, 16);
  } };
  A.candelabra = { w: 1, h: 1, draw: function (K) {
    var R = K.R; K.shadow(8, 31, 16); K.slab(10, 28, 12, 3, GOLD, { round: 1, shine: 1 }); K.post(14, 14, 4, 15, GOLD);
    R(5, 14, 22, 2, GOLD[0]); R(6, 14, 20, 1, GOLD[5]); [6, 25].forEach(function (x) { K.post(x - 1, 10, 3, 5, GOLD); }); K.post(14, 8, 4, 7, GOLD);
    [[5, 4, 6], [24, 4, 6], [15, 1, 7]].forEach(function (c) { wick(K, c[0], c[1] + 1, c[2]); });
  } };
  A.fairylights = { w: 1, h: 1, draw: function (K) {
    var cols = [["#ff5ab4", "255,90,180"], ["#ffd23f", "255,210,63"], ["#5aff8a", "90,255,138"], ["#5ab4ff", "90,180,255"]];
    for (var x = 0; x < 32; x++) { var y = Math.round(5 + Math.sin(x / 32 * Math.PI) * 6); K.P(x, y, "#3a2a20"); K.P(x, y + 1, "#5a4030", 0.5); }
    [3, 11, 19, 27].forEach(function (x, i) { var y = Math.round(5 + Math.sin(x / 32 * Math.PI) * 6) + 1, c = cols[i]; K.halo(x + 1, y + 6, 6, c[1], 0.45); K.R(x, y, 3, 2, IRON[3]); K.ell(x + 1.5, y + 6, 2.6, 3.6, c[0]); K.P(x + 1, y + 4, "#ffffff"); K.P(x, y + 5, "#ffffff", 0.5); });
  } };
  A.chandelier = { w: 1, h: 1, draw: function (K) {
    var R = K.R; R(15, 0, 2, 6, IRON[3]); K.halo(16, 12, 16, "255,220,140", 0.3); K.slab(6, 6, 20, 4, GOLD, { round: 1, shine: 1 }); K.slab(12, 9, 8, 4, GOLD, { round: 1 });
    [5, 11, 16, 21, 26].forEach(function (x, i) { var h = i === 2 ? 18 : i % 2 ? 14 : 10; R(x, 10, 2, h, "#bfefff", 0.8); R(x, 10, 1, h, "#ffffff"); K.P(x, 10 + h, "#e8fbff"); K.P(x + 1, 10 + h - 2, "#7acbff"); });   // crystal drops
    [6, 16, 25].forEach(function (x) { wick(K, x, 2, 4); });
  } };
  A.paperlantern = { w: 1, h: 1, draw: function (K) {
    var R = K.R, PK = ["#5a1030", "#a8285a", "#d84a84", "#f07aa8", "#ff9cc4", "#ffc4dc", "#fff0f6"]; R(15, 0, 2, 5, DARK[3]); K.halo(16, 16, 15, "255,140,190", 0.35);
    K.ell(16, 16, 12, 10, PK[0]); K.ell(16, 16, 11, 9, PK[3]); K.ell(14, 13, 7, 5, PK[5]); K.ell(13, 11, 3, 2, PK[6]);
    for (var y = 9; y < 25; y += 3) R(5 + Math.abs(16 - y) * 0.5, y, 22 - Math.abs(16 - y), 1, PK[1], 0.55);
    K.slab(11, 4, 10, 3, DARK, { round: 1 }); K.slab(11, 25, 10, 3, DARK, { round: 1 }); R(15, 28, 2, 3, "#e8b83a"); K.P(15, 31, "#c22e2a"); K.P(16, 31, "#c22e2a");   // tassel
  } };
  A.starlantern = { w: 1, h: 1, draw: function (K) {
    cage(K, 8, 6, 16, 23, GOLD, "#2a2a6a", null, "255,240,170"); var R = K.R;
    R(15, 11, 2, 12, "#fff6c0"); R(11, 16, 10, 2, "#fff6c0"); K.line(12, 13, 19, 20, "#ffe680"); K.line(19, 13, 12, 20, "#ffe680"); K.disc(16, 17, 2, "#ffffff"); K.shadow(7, 31, 18);
  } };
  A.bloodlantern = { w: 1, h: 1, draw: function (K) {
    cage(K, 8, 6, 16, 23, ["#1a0406", "#3a080c", "#5a1016", "#7a1a20", "#9a2a2e", "#b84442", "#e07070"], "#5a0a10", null, "255,60,60"); K.disc(16, 17, 4.5, "#8a0a14"); K.disc(16, 17, 3.5, "#ff2a3a"); K.disc(15, 16, 1.5, "#ffb0b8"); K.shadow(7, 31, 18);
  } };
  A.glowjar = { w: 1, h: 1, draw: function (K) {
    var R = K.R; K.shadow(7, 31, 18); K.halo(16, 20, 13, "80,240,170", 0.35);
    K.slab(8, 8, 16, 23, ["#2a3a30", "#5a7a66", "#8ab0a0", "#b0d4c8", "#cce8de", "#e4f6f0", "#ffffff"], { round: 1 }); R(10, 10, 12, 19, "#103a2a", 0.6);
    [[12, 24, 5], [18, 22, 7], [15, 27, 3]].forEach(function (m) { R(m[0], m[1], 2, m[2] > 4 ? 5 : 3, "#c8f0d0"); K.ell(m[0] + 1, m[1], m[2] / 2 + 0.5, 1.8, "#3aff9a"); K.P(m[0], m[1] - 1, "#d0ffe6"); });   // glowing mushrooms inside
    R(10, 11, 1, 17, "#fff", 0.6); K.slab(9, 4, 14, 5, WOOD, { round: 1, shine: 1 }); R(13, 2, 6, 2, WOOD[4]);
  } };
  A.oillamp = { w: 1, h: 1, draw: function (K) {
    var R = K.R; K.shadow(8, 31, 16); K.halo(16, 9, 12, "255,200,110", 0.35);
    K.ell(16, 26, 9, 5, GOLD[0]); K.ell(16, 25.5, 8, 4, GOLD[3]); K.ell(14, 24, 4, 1.5, GOLD[6]); K.slab(11, 29, 10, 2, GOLD);
    glass(K, 12, 8, 8, 14, "#f4e8c8", null, 0.75); R(11, 7, 10, 2, GOLD[3]); R(11, 21, 10, 2, GOLD[2]); K.flame(16, 19, 8, ["#ff8a1a", "#ffd860", "#fff6d0"]);
  } };
  // ---------- KITCHEN, TABLETOPS, COSY CORNERS, STORAGE AND CURIOS (batch 2) ----------
  var CERA = ["#2a3440", "#7a8ea0", "#a8bccc", "#cddbe6", "#e4eef4", "#f4f9fc", "#ffffff"], LEAF = ["#0e2a10", "#1a4a1a", "#2a6a24", "#3e8a30", "#58aa42", "#7cc85a", "#b0ec88"];
  function cabinet(K, x, y, w, h, p, doors) {   // a wooden cupboard front: rim, doors with sunk panels and brass knobs
    var R = K.R; K.slab(x, y, w, h, p, { grain: 1 }); var dw = Math.floor((w - 4) / doors);
    for (var d = 0; d < doors; d++) { var dx = x + 2 + d * dw; K.slab(dx, y + 2, dw - 1, h - 4, p); R(dx + 2, y + 4, dw - 5, h - 8, p[2]); R(dx + 2, y + 4, dw - 5, 1, p[1]); R(dx + 2, y + h - 5, dw - 5, 1, p[4]); var kx = d === 0 && doors > 1 ? dx + dw - 4 : dx + 2; R(kx, y + Math.floor(h / 2) - 1, 2, 3, GOLD[4]); K.P(kx, y + Math.floor(h / 2) - 1, GOLD[6]); }
  }
  function leafy(K, cx, by, n, spread, hgt, pal) {   // a bunch of leaves fanning up from (cx, by)
    pal = pal || LEAF; for (var i = 0; i < n; i++) { var a = -Math.PI / 2 + (i - (n - 1) / 2) * spread, ex = Math.round(cx + Math.cos(a) * hgt), ey = Math.round(by + Math.sin(a) * hgt);
      K.line(cx, by, ex, ey, pal[2]); K.line(cx + 1, by, ex + 1, ey, pal[4]); K.ell(ex + 0.5, ey + 0.5, 2.4, 1.6, pal[i % 2 ? 3 : 5]); K.P(ex, ey - 1, pal[6]); }
  }
  function pot(K, x, y, w, h, p) { K.slab(x, y, w, 3, p, { round: 1, shine: 1 }); K.slab(x + 1, y + 2, w - 2, h - 2, p, { round: 1 }); K.R(x + 2, y + 3, 1, h - 4, p[5]); }
  A.counter = { w: 1, h: 1, draw: function (K) { K.shadow(1, 31, 30); cabinet(K, 1, 9, 30, 22, WOOD, 2); K.slab(0, 5, 32, 5, STONE, { shine: 1 }); K.R(1, 9, 30, 1, STONE[0], 0.6); } };
  A.countersink = { w: 1, h: 1, draw: function (K) { var R = K.R; K.shadow(1, 31, 30); cabinet(K, 1, 9, 30, 22, WOOD, 2); K.slab(0, 5, 32, 5, STONE, { shine: 1 }); R(6, 6, 18, 2, "#2a4a6a"); R(7, 6, 16, 1, "#7acbff");
    K.post(20, 0, 3, 6, IRON); R(14, 0, 9, 2, IRON[4]); R(14, 0, 9, 1, IRON[6]); R(14, 2, 2, 2, IRON[3]); K.P(14, 4, "#7acbff"); } };
  A.counterstove = { w: 1, h: 1, draw: function (K) { var R = K.R; K.shadow(1, 31, 30); K.slab(1, 9, 30, 22, IRON); K.slab(5, 14, 22, 12, IRON); R(7, 16, 18, 8, "#1a0a06"); R(7, 22, 18, 2, "#ff7a2a"); K.flame(12, 22, 4, ["#ff8a1a", "#ffd860"]); K.flame(20, 22, 4, ["#ff8a1a", "#ffd860"]); R(7, 16, 18, 1, "#fff", 0.15);
    K.slab(0, 5, 32, 5, IRON, { shine: 1 }); [[4, 6], [18, 6]].forEach(function (b) { R(b[0], b[1], 10, 2, "#2a1008"); R(b[0] + 1, b[1], 8, 1, "#ff6a2a"); }); R(10, 27, 12, 2, GOLD[4]); } };
  A.wallshelf = { w: 1, h: 1, draw: function (K) { var R = K.R; K.slab(1, 18, 30, 4, WOOD, { grain: 1, shine: 1 }); [5, 25].forEach(function (x) { K.line(x, 22, x + 2, 27, DARK[0]); K.line(x + 1, 22, x + 3, 27, DARK[3]); });
    pot(K, 4, 11, 7, 7, CLAY); K.slab(14, 9, 5, 9, ["#2a1a4a", "#5a2a74", "#7a3e9a", "#9a58bc", "#b878d8", "#d4a0ee", "#f0d4ff"], { round: 1 }); R(15, 7, 3, 2, WOOD[3]); K.slab(21, 12, 8, 6, CERA, { round: 1 }); R(23, 14, 4, 1, "#3e7ad8"); } };
  A.teapot = { w: 1, h: 1, draw: function (K) { var R = K.R; K.shadow(5, 31, 22); K.ell(15, 24, 9, 7, CLAY[0]); K.ell(15, 23.5, 8, 6, CLAY[3]); K.ell(12, 21, 4, 2.5, CLAY[5]); K.P(10, 20, CLAY[6]);
    K.line(23, 22, 28, 17, CLAY[0]); K.line(23, 23, 29, 17, CLAY[3]); K.P(29, 16, CLAY[4]); K.ell(6, 23, 3, 4, CLAY[0]); K.ell(6, 23, 1.6, 2.6, "rgba(0,0,0,0)"); K.clr(6, 22, 1, 3);
    K.slab(10, 15, 10, 3, CLAY, { round: 1 }); K.disc(15, 14, 1.6, GOLD[4]); R(10, 26, 10, 1, "#2fb59a"); K.P(28, 13, "#ffffff", 0.5); K.P(27, 10, "#ffffff", 0.35); R(10, 30, 10, 1, CLAY[1]); } };
  A.cakestand = { w: 1, h: 1, draw: function (K) { var R = K.R; K.shadow(6, 31, 20); K.slab(8, 28, 16, 3, GOLD, { round: 1 }); K.post(14, 22, 4, 7, GOLD); K.slab(4, 20, 24, 3, GOLD, { round: 1, shine: 1 });
    K.slab(6, 11, 20, 10, ["#5a2a1a", "#8a4a2a", "#c87a4a", "#f2c8d8", "#ffd8e4", "#ffe8f0", "#ffffff"], { round: 1 }); R(7, 15, 18, 2, "#8a4a2a"); R(7, 16, 18, 1, "#ffe2a0");
    R(6, 11, 20, 3, "#fff4f8"); for (var x = 7; x < 25; x += 3) R(x, 14, 2, 2, "#fff4f8"); K.disc(16, 9, 2.2, "#d6203a"); K.P(15, 8, "#ffb0b8"); R(16, 5, 1, 3, "#4a8a2a"); } };
  A.fruitbowl = { w: 1, h: 1, draw: function (K) { K.shadow(4, 31, 24);
    [[11, 18, 3.6, "#d6203a", "#ffb0b8"], [17, 17, 3.6, "#ff9a1a", "#ffe0a0"], [22, 19, 3.2, "#7ad82a", "#d8ffa0"], [14, 14, 3, "#8a2ab8", "#d8a0ff"], [20, 13, 3, "#ffd23f", "#fff6c0"]].forEach(function (f) { K.disc(f[0], f[1], f[2] + 0.8, "#2a1408"); K.disc(f[0], f[1], f[2], f[3]); K.P(f[0] - 1, f[1] - 2, f[4]); });
    K.ell(16, 24, 13, 5, WOOD[0]); K.ell(16, 23.5, 12, 4, WOOD[4]); K.R(4, 21, 24, 2, WOOD[5]); K.R(5, 21, 22, 1, WOOD[6]); K.slab(11, 27, 10, 3, WOOD, { round: 1 }); } };
  A.openbook = { w: 1, h: 1, draw: function (K) { var R = K.R; K.shadow(2, 31, 28); R(2, 24, 28, 5, "#7a1410"); R(2, 24, 28, 1, "#c22e2a");
    for (var y = 0; y < 6; y++) { R(3, 19 + y - (y < 2 ? 0 : 0), 13, 1, y ? "#f6ecd2" : "#e2d4b0"); R(16, 19 + y, 13, 1, y ? "#fff6e0" : "#ecdcb8"); } R(15, 18, 2, 8, "#a89070");
    for (var l = 0; l < 3; l++) { R(5, 21 + l * 2, 9, 1, "#8a7a60", 0.6); R(18, 21 + l * 2, 9, 1, "#8a7a60", 0.6); } R(22, 14, 2, 11, "#d6382e"); R(22, 25, 1, 2, "#d6382e"); } };
  A.inkquill = { w: 1, h: 1, draw: function (K) { var R = K.R; K.shadow(8, 31, 16); K.slab(9, 20, 14, 11, ["#0a0a14", "#14142a", "#1e1e3e", "#2a2a5a", "#3a3a7a", "#5a5aa0", "#9a9ae0"], { round: 1, shine: 1 }); K.slab(11, 17, 10, 4, IRON, { round: 1 }); R(12, 18, 8, 1, "#0a0a14");
    K.line(15, 18, 24, 0, "#f6f0e0"); K.line(16, 18, 25, 1, "#d8cfb8"); for (var i = 0; i < 8; i++) { K.P(18 + i, 12 - i * 1.5 | 0, "#ffffff"); K.P(19 + i, 13 - i * 1.5 | 0, "#e8e0cc"); } } };
  A.nightstand = { w: 1, h: 1, draw: function (K) { var R = K.R; K.shadow(4, 31, 24); K.slab(4, 12, 24, 17, WOOD, { grain: 1 }); [14, 21].forEach(function (y) { K.slab(6, y, 20, 6, WOOD); R(14, y + 2, 4, 2, GOLD[4]); K.P(14, y + 2, GOLD[6]); });
    K.slab(2, 9, 28, 4, WOOD, { shine: 1 }); K.post(5, 28, 3, 3, DARK); K.post(24, 28, 3, 3, DARK); K.halo(10, 5, 6, "255,200,110", 0.3); wick(K, 9, 4, 5); } };
  A.sidetable = { w: 1, h: 1, draw: function (K) { K.shadow(6, 31, 20); K.post(14, 14, 4, 16, WOOD); K.slab(9, 28, 14, 3, WOOD, { round: 1 }); K.slab(3, 10, 26, 4, WOOD, { grain: 1, shine: 1 }); K.R(5, 14, 22, 1, WOOD[0], 0.5); } };
  A.coffeetable = { w: 1, h: 1, draw: function (K) { K.shadow(2, 31, 28); legs(K, [3, 25], 21, 31, DARK); K.post(6, 26, 20, 2, DARK); K.slab(1, 17, 30, 5, WOOD, { grain: 1, shine: 1 }); K.slab(19, 13, 8, 5, CERA, { round: 1 }); K.R(20, 13, 6, 1, "#5a3418"); } };
  A.bonsai = { w: 1, h: 1, draw: function (K) { var R = K.R; K.shadow(4, 31, 24); K.slab(4, 25, 24, 6, ["#1a2a3a", "#2a4a6a", "#3e6a90", "#5a8ab4", "#7aaad0", "#a0c8e8", "#d8ecff"], { shine: 1 });
    K.line(15, 25, 13, 18, DARK[0]); K.line(16, 25, 14, 18, DARK[4]); K.line(14, 19, 20, 13, DARK[0]); K.line(14, 18, 20, 12, DARK[4]); K.line(13, 18, 8, 14, DARK[3]);
    [[8, 11, 6, 3.4], [20, 9, 7, 3.8], [14, 6, 5, 3]].forEach(function (c) { K.ell(c[0], c[1], c[2] + 1, c[3] + 1, LEAF[0]); K.ell(c[0], c[1], c[2], c[3], LEAF[4]); K.ell(c[0] - 1, c[1] - 1, c[2] - 2, c[3] - 1.5, LEAF[5]); K.P(c[0] - 2, c[1] - 2, LEAF[6]); }); R(6, 25, 20, 1, "#5a4022"); } };
  A.lilyvase = { w: 1, h: 1, draw: function (K) { K.shadow(8, 31, 16); [[11, 6, 9], [16, 3, 16], [22, 7, 22]].forEach(function (f) { K.line(16, 22, f[0], f[1] + 3, LEAF[3]); K.ell(f[0], f[1], 3.4, 2.6, "#d870a8"); K.ell(f[0], f[1] - 0.5, 2.4, 1.8, "#ffb0d8"); K.P(f[0], f[1], "#ffd23f"); });
    K.ell(16, 25, 7, 6, CERA[0]); K.ell(16, 24.5, 6, 5, CERA[4]); K.R(10, 24, 12, 2, "#3e7ad8"); K.ell(14, 22, 2, 2.5, CERA[6]); K.slab(12, 18, 8, 3, CERA, { round: 1 }); } };
  A.pottedfern = { w: 1, h: 1, draw: function (K) { K.shadow(6, 31, 20); leafy(K, 16, 20, 7, 0.32, 13); pot(K, 8, 20, 16, 11, CLAY); K.R(10, 24, 12, 1, CLAY[2]); } };
  A.stackedbooks = { w: 1, h: 1, draw: function (K) { var R = K.R, BK = [["#2a5ab0", "#4a82d8"], ["#2a8a4a", "#4ab86a"], ["#c22e2a", "#e8584a"], ["#7a3e9a", "#a868c8"], ["#e8b83a", "#f6d870"]]; K.shadow(4, 31, 24);
    BK.forEach(function (b, i) { var y = 27 - i * 4, x = 5 + ((i * 3) % 5) - 2, w = 22 - (i % 2) * 3; R(x, y, w, 4, b[0]); R(x, y, w, 1, b[1]); R(x + w - 2, y + 1, 2, 2, "#f6ecd2"); R(x + 3, y + 2, w - 7, 1, "#fff", 0.2); R(x, y + 3, w, 1, "#000", 0.25); });
    R(17, 5, 2, 9, "#d6382e"); } };
  A.teaset = { w: 1, h: 1, draw: function (K) { var R = K.R; K.shadow(1, 31, 30); K.slab(1, 27, 30, 3, WOOD, { round: 1, shine: 1 });
    K.ell(11, 21, 7, 6, CERA[0]); K.ell(11, 20.5, 6, 5, CERA[4]); K.ell(9, 18.5, 3, 2, CERA[6]); K.R(5, 21, 12, 1, "#2fb59a"); K.line(17, 19, 21, 15, CERA[2]); K.slab(8, 13, 7, 3, CERA, { round: 1 }); K.ell(4, 21, 2, 3, CERA[2]);
    [[21, 23], [26, 24]].forEach(function (c) { K.slab(c[0], c[1], 5, 4, CERA, { round: 1 }); R(c[0] + 1, c[1], 3, 1, "#8a5a2a"); }); K.P(20, 10, "#fff", 0.5); K.P(21, 7, "#fff", 0.35); } };
  A.cattailvase = { w: 1, h: 1, draw: function (K) { [[11, 3], [16, 1], [21, 5]].forEach(function (c) { K.line(16, 22, c[0], c[1] + 8, LEAF[3]); K.slab(c[0] - 1, c[1], 4, 9, WOOD, { round: 1 }); K.P(c[0], c[1] - 1, LEAF[4]); });
    K.line(16, 22, 8, 10, LEAF[4]); K.line(16, 22, 25, 11, LEAF[2]); K.shadow(9, 31, 14); K.slab(10, 20, 12, 11, ["#0e2a3a", "#1a4a6a", "#2a6a90", "#3e8ab4", "#5aaad0", "#8acae8", "#d0f0ff"], { round: 1, shine: 1 }); } };
  A.hangingherbs = { w: 1, h: 1, draw: function (K) { var R = K.R; K.slab(1, 2, 30, 3, WOOD, { round: 1, shine: 1 });
    [[5, LEAF], [13, ["#2a2a10", "#4a4a1a", "#6a6a24", "#8a8a30", "#a8a842", "#c8c85a", "#e8e888"]], [21, LEAF], [27, ["#1a2a3a", "#3a2a5a", "#5a3e8a", "#7a58ae", "#9a78c8", "#c0a0e0", "#e8d8ff"]]].forEach(function (h, i) { var x = h[0]; R(x, 5, 1, 4, "#c8b890");
      for (var y = 0; y < 14 + (i % 2) * 4; y++) { var w2 = Math.max(1, Math.round(3.5 - Math.abs(y - 7) * 0.35)); R(x - w2, 9 + y, w2 * 2 + 1, 1, h[1][y % 3 ? 4 : 3]); K.P(x - w2, 9 + y, h[1][1]); K.P(x + w2, 9 + y, h[1][2]); } R(x - 2, 9, 5, 2, "#c22e2a"); }); } };
  A.throne = { w: 1, h: 1, draw: function (K) { var R = K.R, IC = ["#1a3040", "#2a5070", "#4a80a8", "#7ab0d8", "#a8d4f0", "#d0ecff", "#ffffff"]; K.shadow(2, 31, 28);
    K.slab(5, 0, 22, 22, IC, { round: 1 }); R(8, 3, 16, 16, IC[2]); R(9, 4, 2, 14, IC[5]); [[5, 0], [14, 0], [23, 0]].forEach(function (s) { K.slab(s[0] - 1, s[1] - 0, 5, 4, IC, { shine: 1 }); });
    K.disc(16, 9, 3.4, "#2a7ad8"); K.disc(16, 9, 2.4, "#7acbff"); K.P(15, 8, "#fff");
    K.slab(2, 16, 6, 10, IC, { round: 1 }); K.slab(24, 16, 6, 10, IC, { round: 1 }); K.slab(5, 20, 22, 6, ["#3a0a14", "#6a1428", "#9a2040", "#c83058", "#e05078", "#f080a0", "#ffc0d0"], { round: 1, shine: 1 }); K.slab(4, 25, 24, 6, IC); } };
  A.bucket = { w: 1, h: 1, draw: function (K) { var R = K.R; K.shadow(7, 31, 18); K.line(8, 11, 16, 2, IRON[1]); K.line(24, 11, 16, 2, IRON[1]); K.line(9, 11, 16, 3, IRON[4]);
    for (var y = 11; y < 31; y++) { var w = Math.round(9 - (y - 11) * 0.12); R(16 - w, y, w * 2, 1, WOOD[3]); R(16 - w, y, 2, 1, WOOD[5]); R(16 + w - 2, y, 2, 1, WOOD[1]); K.P(16 - w - 1, y, WOOD[0]); K.P(16 + w, y, WOOD[0]); }
    for (var x = 10; x < 23; x += 4) R(x, 12, 1, 18, WOOD[2], 0.6); [14, 26].forEach(function (y) { R(7, y, 18, 2, IRON[3]); R(7, y, 18, 1, IRON[5]); }); R(7, 10, 18, 2, "#2a4a6a"); R(8, 10, 16, 1, "#7acbff"); R(8, 31, 16, 1, WOOD[0]); } };
  A.sack = { w: 1, h: 1, draw: function (K) { var R = K.R, S2 = ["#3a2a14", "#6a5430", "#8c7444", "#ae9460", "#c8b07a", "#dcc898", "#f0e2bc"]; K.shadow(4, 31, 24);
    K.ell(16, 21, 12, 10, S2[0]); K.ell(16, 20.5, 11, 9, S2[3]); K.ell(12, 17, 6, 5, S2[4]); K.ell(10, 15, 2.5, 2, S2[6]); R(5, 27, 22, 4, S2[0]); R(6, 27, 20, 3, S2[2]);
    K.slab(11, 4, 10, 8, S2, { round: 1 }); R(10, 10, 12, 2, "#8a3a1a"); R(10, 10, 12, 1, "#c45a2a"); K.line(13, 13, 11, 24, S2[2]); K.line(20, 13, 22, 24, S2[2]); R(13, 18, 6, 5, S2[2], 0.6); R(14, 19, 4, 3, "#2e6a3a", 0.8); } };
  A.barrel = { w: 1, h: 1, draw: function (K) { var R = K.R; K.shadow(4, 31, 24);
    for (var y = 3; y < 31; y++) { var w = Math.round(10 + Math.sin((y - 3) / 28 * Math.PI) * 2.5); R(16 - w, y, w * 2, 1, WOOD[3]); R(16 - w + 1, y, 3, 1, WOOD[5]); R(16 + w - 3, y, 2, 1, WOOD[2]); K.P(16 - w - 1, y, WOOD[0]); K.P(16 + w, y, WOOD[0]); }
    for (var x = 9; x < 25; x += 4) R(x, 4, 1, 26, WOOD[2], 0.55); [6, 26].forEach(function (y) { R(4, y, 24, 2, IRON[3]); R(4, y, 24, 1, IRON[5]); }); K.ell(16, 3, 10, 2, WOOD[1]); K.ell(16, 3, 9, 1.3, WOOD[4]); R(14, 16, 4, 3, DARK[3]); K.P(14, 16, DARK[5]); } };
  A.dresser = { w: 1, h: 1, draw: function (K) { var R = K.R; K.shadow(2, 31, 28); K.slab(2, 10, 28, 19, WOOD, { grain: 1 }); [12, 19].forEach(function (y) { K.slab(4, y, 24, 6, WOOD); R(10, y + 2, 3, 2, GOLD[4]); R(19, y + 2, 3, 2, GOLD[4]); K.P(10, y + 2, GOLD[6]); K.P(19, y + 2, GOLD[6]); });
    K.slab(1, 8, 30, 3, WOOD, { shine: 1 }); K.post(3, 28, 3, 3, DARK); K.post(26, 28, 3, 3, DARK); K.slab(4, 3, 6, 5, ["#5a1030", "#a8285a", "#d84a84", "#f07aa8", "#ff9cc4", "#ffc4dc", "#fff0f6"], { round: 1 }); K.slab(20, 2, 7, 6, CERA, { round: 1 }); R(22, 4, 3, 1, "#7acbff"); } };
  A.rug = { w: 1, h: 1, draw: function (K) { var R = K.R; R(1, 26, 30, 5, "#2a1040"); R(2, 26, 28, 4, "#7a3e9a"); R(2, 26, 28, 1, "#b878d8"); R(4, 27, 24, 2, "#2fb59a"); for (var x = 5; x < 27; x += 4) { K.P(x, 27, "#e8b83a"); K.P(x + 2, 28, "#ffd8a0"); }
    for (var f = 1; f < 31; f += 2) { K.P(f, 31, "#e8b83a"); K.P(0, 26 + (f % 5), "#e8b83a"); } } };
  A.telescope = { w: 1, h: 1, draw: function (K) { var R = K.R; K.shadow(6, 31, 20); K.line(16, 18, 8, 30, WOOD[0]); K.line(17, 18, 9, 30, WOOD[4]); K.line(16, 18, 24, 30, WOOD[0]); K.line(15, 18, 23, 30, WOOD[3]); K.post(15, 16, 3, 15, WOOD);
    for (var i = 0; i < 22; i++) { var x = 4 + i, y = 18 - Math.round(i * 0.5), r = 2 + Math.round(i / 9); R(x, y - r, 1, r * 2 + 1, i < 8 ? GOLD[3] : i < 15 ? GOLD[4] : GOLD[3]); K.P(x, y - r, i < 15 ? GOLD[6] : GOLD[5]); K.P(x, y + r, GOLD[1]); }
    R(25, 3, 3, 9, GOLD[2]); R(26, 4, 1, 7, "#bfe8ff"); R(3, 15, 2, 5, IRON[1]); [11, 18].forEach(function (x) { R(x, 10 + (18 - x) / 2 | 0, 1, 8, GOLD[1]); }); } };
  A.harp = { w: 1, h: 1, draw: function (K) { var R = K.R; K.shadow(4, 31, 24); K.slab(4, 27, 24, 4, WOOD, { round: 1 });
    for (var y = 2; y < 28; y++) { var x = Math.round(6 + Math.pow((y - 2) / 26, 1.6) * 2); R(x, y, 4, 1, WOOD[3]); K.P(x, y, WOOD[5]); K.P(x + 3, y, WOOD[1]); }
    for (var x2 = 6; x2 < 28; x2++) { var y2 = Math.round(4 + Math.sin((x2 - 6) / 22 * Math.PI) * -2 + (x2 - 6) * 0.25); R(x2, y2, 1, 3, GOLD[3]); K.P(x2, y2, GOLD[6]); } K.post(25, 7, 3, 21, GOLD);
    for (var s = 11; s < 25; s += 2) R(s, 7 + Math.round((s - 6) * 0.25), 1, 21 - Math.round((s - 6) * 0.25), "#f6f0dc", 0.85); K.disc(26, 4, 2, GOLD[5]); } };
  A.clock = { w: 1, h: 1, draw: function (K) { var R = K.R; K.shadow(5, 31, 22); K.slab(6, 0, 20, 4, DARK, { round: 1, shine: 1 }); K.slab(7, 3, 18, 28, DARK, { grain: 1 });
    K.disc(16, 10, 6.5, GOLD[2]); K.disc(16, 10, 5.5, "#f6f0dc"); for (var a = 0; a < 12; a++) K.P(Math.round(16 + Math.cos(a / 6 * Math.PI) * 4.5), Math.round(10 + Math.sin(a / 6 * Math.PI) * 4.5), "#5a4a3a"); K.line(16, 10, 16, 6, "#1a1a2a"); K.line(16, 10, 19, 11, "#1a1a2a");
    R(11, 18, 10, 11, "#1a0e06"); R(11, 18, 1, 11, "#fff", 0.15); R(16, 18, 1, 7, GOLD[3]); K.disc(16, 26, 2.4, GOLD[4]); K.P(15, 25, GOLD[6]); K.slab(5, 29, 22, 2, DARK); } };
  A.globe = { w: 1, h: 1, draw: function (K) { var R = K.R; K.shadow(7, 31, 18); K.slab(10, 28, 12, 3, WOOD, { round: 1 }); K.post(14, 23, 4, 6, WOOD);
    for (var y = 3; y < 23; y++) for (var x = 5; x < 27; x++) { var dx = (x + 0.5 - 16) / 10.5, dy = (y + 0.5 - 13) / 10; if (dx * dx + dy * dy > 1) continue; var land = Math.sin(x * 0.7 + y * 0.3) + Math.cos(y * 0.5 - x * 0.2) > 0.7, lit = -dx * 0.5 - dy * 0.6 + 0.5;
      K.P(x, y, land ? (lit > 0.6 ? "#7ad860" : lit > 0.2 ? "#4ab040" : "#2a7a2a") : (lit > 0.6 ? "#6ab4ff" : lit > 0.2 ? "#3a84e0" : "#1e54a8")); }
    K.P(11, 7, "#ffffff"); K.P(12, 7, "#d8f0ff");
    for (var a = -100; a <= 100; a += 4) { var t = a / 100 * Math.PI * 0.6, ax = Math.round(16 + Math.sin(t) * 12.5), ay = Math.round(13 - Math.cos(t) * 11.5); K.P(ax, ay, GOLD[4]); K.P(ax + 1, ay, GOLD[2]); } } };
  function paint(kind) {   // a canvas with this piece at 32 px a block, or null
    var a = A[kind]; if (!a || typeof document === "undefined") return null;
    var c = document.createElement("canvas"); c.width = a.w * 32; c.height = a.h * 32; var g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    try { a.draw(kit(g, c.width, c.height)); } catch (e) { return null; }
    return c;
  }
  var api = { art: A, paint: paint, kit: kit };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DelveFurn = api;
})(typeof window !== "undefined" ? window : this);
