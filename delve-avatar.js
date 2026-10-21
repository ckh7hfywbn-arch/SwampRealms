// SwampRealms Delve: pixel-art FULL-BODY avatar. Reads the same outfit as the Armory (Crystals.outfit()) and draws every equipped
// cosmetic ON the body: hats on the head, face gear on the eyes, scarf/cape/chain at the neck, shirts on the torso and sleeves,
// shoes on the feet, plus the ring / necklace / bandana accessories.
//   DelveAv.sprite(outfit, animalId, scale) -> { s, fw, fh, footY, shoulder(by), frame(pose), arm, bobOf(pose) }
//   DelveAv.thumb(outfit, animalId, scale)  -> data URL of the idle pose with the arm (for the "Play as" buttons)
// Poses: idle0 idle1 walk0 walk1 walk2 walk3 jump fall. Art is drawn on a 22x34 pixel grid (character is 18 wide, feet on row 32).
var DelveAv = (function () {
  "use strict";
  var FW = 22, FH = 34, OY = 2, OL = "#0a100d";
  var OUTLINE = false;   // true brings back the dark 1px outline around the character and its arm

  // ---------- colour helpers ----------
  var CC = {};
  function rgb(h) {
    if (CC[h]) return CC[h];
    var s = h.charAt(0) === "#" ? h.slice(1) : h;
    if (s.length === 3) s = s.replace(/./g, "$&$&");
    return (CC[h] = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]);
  }
  function hex2(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? "0" : "") + n.toString(16); }
  function mix(a, b, k) { var x = rgb(a), y = rgb(b); return "#" + [0, 1, 2].map(function (i) { return hex2(x[i] + (y[i] - x[i]) * k); }).join(""); }
  function lt(c, k) { return mix(c, "#ffffff", k); }
  function dk(c, k) { return mix(c, "#000000", k); }

  // ---------- pixel buffer ----------
  // L[i] = which layer last painted pixel i solidly (1 body, 2 shirt, 3 armor, 4 neck, 5 accessory, 6 face gear, 7 hat, 8 shoes, 9 cape):
  // toCanvas draws a thin seam where two layers meet and a thin outline around the whole figure, so each piece reads on its own.
  function Buf(w, h, ox, oy) { this.w = w; this.h = h; this.ox = ox || 0; this.oy = oy || 0; this.d = new Uint8ClampedArray(w * h * 4); this.L = new Uint8Array(w * h); this.cur = 1; }
  Buf.prototype.p = function (x, y, col, a) {
    x += this.ox; y += this.oy; if (!col || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    var c = rgb(col), i = (y * this.w + x) * 4, d = this.d, al = a == null ? 1 : a;
    if (al >= 0.5) this.L[i >> 2] = this.cur;
    if (al >= 1) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; return; }
    var da = d[i + 3] / 255, oa = al + da * (1 - al); if (oa <= 0) return;
    d[i] = (c[0] * al + d[i] * da * (1 - al)) / oa; d[i + 1] = (c[1] * al + d[i + 1] * da * (1 - al)) / oa; d[i + 2] = (c[2] * al + d[i + 2] * da * (1 - al)) / oa; d[i + 3] = oa * 255;
  };
  Buf.prototype.r = function (x, y, w, h, col, a) { for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) this.p(x + xx, y + yy, col, a); };
  Buf.prototype.row = function (y, w, col, a) { if (w > 0) this.r(11 - Math.floor(w / 2), y, w, 1, col, a); };   // centred on the character's midline
  Buf.prototype.m = function (x, y, rows, pal) {   // char-map painter: '.' and ' ' are empty
    for (var j = 0; j < rows.length; j++) for (var i = 0; i < rows[j].length; i++) { var ch = rows[j].charAt(i); if (ch !== "." && ch !== " " && pal[ch]) this.p(x + i, y + j, pal[ch]); }
  };
  Buf.prototype.glow = function (cx, cy, rx, ry, col, a) {   // soft elliptical glow, quantised so it stays pixel-art
    for (var y = -ry; y <= ry; y++) for (var x = -rx; x <= rx; x++) { var d = (x * x) / (rx * rx) + (y * y) / (ry * ry); if (d <= 1) this.p(cx + x, cy + y, col, a * (d > 0.55 ? 0.5 : 1)); }
  };
  Buf.prototype.get = function (x, y) { x += this.ox; y += this.oy; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null; var i = (y * this.w + x) * 4; return this.d[i + 3] > 200 ? [this.d[i], this.d[i + 1], this.d[i + 2]] : null; };
  Buf.prototype.alpha = function (x, y) { x += this.ox; y += this.oy; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0; return this.d[(y * this.w + x) * 4 + 3]; };
  Buf.prototype.outline = function (col) {
    var c = rgb(col), w = this.w, h = this.h, d = this.d, add = [];
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 20) continue;
      var n = (x > 0 && d[(y * w + x - 1) * 4 + 3] > 200) || (x < w - 1 && d[(y * w + x + 1) * 4 + 3] > 200) || (y > 0 && d[((y - 1) * w + x) * 4 + 3] > 200) || (y < h - 1 && d[((y + 1) * w + x) * 4 + 3] > 200);
      if (n) add.push((y * w + x) * 4);
    }
    add.forEach(function (i) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; });
  };

  // ---------- animals ----------
  var COL = { frog: "#43c463", donkey: "#8f91a8", owl: "#a2704a", monkey: "#8d5a34", elephant: "#8c9db8", human: "#b99674" };
  var IRIS = { frog: "#ffd23f", donkey: "#f0a41c", owl: "#ffd23f", monkey: "#7a4a22", elephant: "#4a74b8", human: "#ff3b30" };
  // head maps: b base, l light, d dark, w white, k black, n inner-ear pink, m muzzle, y/x beak, g tusk. x0/y0 = top-left cell on the grid
  var AN = {
    frog: {
      x0: 5, y0: 6, eyes: [[7, 8], [14, 8]], hy: 7, hw: 12, fy: [11, 10], ring: [17, 12], mask: [12, 12], leg: "#43c463",
      head: [".bbb....bbb.", "bwwwb..bwwwb", "bwkwb..bwkwb", "lbbbbbbbbbbb", "bbbbbbbbbbbb", "bbbbdbbdbbbb", "bbbbbbbbbbbb", "bbdkkkkkkdbb", "bbbllllllbbb", ".bbllllllbb.", "..bbbbbbbb.."]
    },
    donkey: {
      x0: 6, y0: 2, eyes: [[9, 10], [12, 10]], hy: 7, hw: 8, fy: [11, 8], ring: [15, 12], mask: [13, 8], leg: "#8f91a8",
      head: [".bb....bb.", ".bn....nb.", ".bn....nb.", ".bn....nb.", ".bb....bb.", ".bbddddbb.", ".bbbbbbbb.", ".bbbbbbbb.", ".bwkbbkwb.", ".bbbbbbbb.", ".bmmmmmmb.", ".bmkmmkmb.", ".bmmmmmmb.", "..bmddmb..", "...bbbb..."],
      ears: { cells: [[7, 2], [8, 2], [13, 2], [14, 2], [7, 3], [8, 3], [13, 3], [14, 3], [7, 4], [8, 4], [13, 4], [14, 4], [7, 5], [8, 5], [13, 5], [14, 5], [7, 6], [8, 6], [13, 6], [14, 6]] }
    },
    owl: {
      x0: 6, y0: 4, eyes: [[8, 9], [13, 9]], hy: 6, hw: 10, fy: [11, 6], ring: [16, 12], mask: [13, 10], leg: "#f0a41c",
      head: [".d......d.", ".bd....db.", ".bbbbbbbb.", "bbbbbbbbbb", "bwwwbbwwwb", "bwkwbbwkwb", "bwwwyywwwb", "bbbbxxbbbb", "bblbbbblbb", "bbbbbbbbbb", "bdbbdbbdbb", ".bbbbbbbb.", "..bbbbbb.."]
    },
    monkey: {
      x0: 4, y0: 7, eyes: [[8, 11], [13, 11]], hy: 8, hw: 10, fy: [11, 9], ring: [17, 12], mask: [13, 10], leg: "#8d5a34",
      head: ["...bbbbbbbb...", "..bbbbbbbbbb..", "bnbbbbbbbbbbnb", "bnbmmmbbmmmbnb", "bnbwkmbbmkwbnb", "bbbmmmbbmmmbbb", "bbbbmdmmdmbbbb", "..bbmkkkkmbb..", "..bbbmmmmbbb..", "....bbbbbb...."]
    },
    elephant: {
      x0: 3, y0: 6, eyes: [[9, 10], [12, 10]], hy: 7, hw: 8, fy: [11, 8], ring: [17, 14], mask: [13, 8], leg: "#8c9db8",
      head: ["....bbbbbbbb....", "....bbbbbbbb....", ".bbbbbbbbbbbbbb.", "bnnbbbbbbbbbbnnb", "bnnbbwkbbkwbbnnb", "bnnbbbbbbbbbbnnb", "bnnbbbbldbbbbnnb", ".bnbbgbldbgbbnb.", "..bbbbbldbbbbb..", "....bbbldbbb....", "......bldb......"]
    },
    // the Swamp Raider: a human, not a swamp animal. h hair, e brow, r red eye, s scar, k mouth, w gritted teeth
    human: {
      x0: 7, y0: 6, eyes: [[9, 11], [12, 11]], hy: 8, hw: 8, fy: [11, 8], ring: [16, 12], mask: [13, 8], leg: "#3b2b22",
      head: [".hhhhhh.", "hhhhhhhh", "hhhhhhhh", "heebbeeh", "bbbeebbb", "bkrbbrkb", "bbbbdbsb", "bbbbbsbb", "bdkwwkdb", ".bbddbb.", "..bbbb.."]
    }
  };


  // ---------- PEOPLE: human characters you can play as (Choose Character on the main menu) ----------
  // Same 22 x 34 body as the animals. Each has a skin tone (the base colour), a hairstyle (the top rows of the head map), hair and eye colours
  // and their own trousers. Head letters: h hair, e brows, w eye white, r iris, n cheeks, d nose / shade, q mouth, f freckles.
  var FACE = ["bebbbbeb", "bwrbbrwb", "bnbbbbnb", "bbbbdbbb", "bbbqqbbb", ".bbbbbb.", "..bbbb.."];
  var STYLE = {
    short: ["........", ".hhhhhh.", "hhhhhhhh", "hhhhhhhh", "hbbbbbbh"],
    long: ["........", ".hhhhhh.", "hhhhhhhh", "hhhhhhhh", "hhbbbbhh"],
    curly: [".h.hh.h.", "hhhhhhhh", "hhhhhhhh", "hhhhhhhh", "hhbbbbhh"],
    spiky: [".h.h.h.h", "hhhhhhhh", "hhhhhhhh", "hbhhbhhb", "bbbbbbbb"],
    bun: ["..hhhh..", ".hhhhhh.", "hhhhhhhh", "hhhhhhhh", "hbbbbbbh"],
    crop: ["........", "........", ".hhhhhh.", "hhhhhhhh", "bbbbbbbb"]
  };
  function personHead(style, extra) {
    var top = STYLE[style] || STYLE.short, face = FACE.slice();
    if (style === "long") face = ["hebbbbeh", "hwrbbrwh", "hnbbbbnh", "hbbbdbbh", "hbbqqbbh", "hbbbbbbh", "h.bbbb.h"];
    if (extra === "beard") { face[4] = "hbbqqbbh"; face[5] = ".hhhhhh."; face[6] = "..hhhh.."; face[3] = "bhbbdbhb"; }
    if (extra === "freckles") face[2] = "bnfbbfnb";
    return top.concat(face);
  }
  var PEOPLE = {
    p_rowan: { name: "Rowan", bio: "A cheerful explorer with a mop of brown hair.", skin: "#e8b48a", hair: "#6a3e1e", eye: "#1a3a1a", leg: "#3a4a6a", style: "short" },
    p_mira: { name: "Mira", bio: "Quick, clever and never without her long black hair tied back.", skin: "#a8724a", hair: "#16100c", eye: "#2a1408", leg: "#5a2a3a", style: "long" },
    p_kai: { name: "Kai", bio: "Spiky hair, big grin, always first into the cave.", skin: "#d49a6a", hair: "#14100e", eye: "#2a1a10", leg: "#2a3a2a", style: "spiky" },
    p_juno: { name: "Juno", bio: "Ginger curls, a face full of freckles and a pocket full of snacks.", skin: "#f4cca8", hair: "#c8582a", eye: "#142458", leg: "#4a3a2a", style: "curly", extra: "freckles" },
    p_ezra: { name: "Ezra", bio: "Calm, careful and very good with a pickaxe.", skin: "#6a4228", hair: "#100c0a", eye: "#1e0e06", leg: "#3a3a4a", style: "crop" },
    p_sage: { name: "Sage", bio: "A gardener at heart, with a sunny blonde bun.", skin: "#c89a72", hair: "#e8c46a", eye: "#1a3a1a", leg: "#4a5a3a", style: "bun" },
    p_otis: { name: "Otis", bio: "An old delver with a grey beard and a hundred stories.", skin: "#d8a47e", hair: "#b8b4ac", eye: "#142458", leg: "#4a3a30", style: "crop", extra: "beard" },
    p_lena: { name: "Lena", bio: "Dreamy, brave, and fond of her long lilac hair.", skin: "#f0c8a8", hair: "#a88ad8", eye: "#2a1a3a", leg: "#3a2a5a", style: "long" }
  };
  Object.keys(PEOPLE).forEach(function (k) {
    var Pp = PEOPLE[k];
    AN[k] = { x0: 7, y0: 5, eyes: [[9, 11], [12, 11]], hy: 8, hw: 8, fy: [11, 8], ring: [16, 12], mask: [13, 8], leg: Pp.leg, head: personHead(Pp.style, Pp.extra) };
    COL[k] = Pp.skin; IRIS[k] = Pp.eye;
  });
  function palFor(a) {
    var base = COL[a], skin = base;
    if (PEOPLE[a]) { var Pp = PEOPLE[a]; return { b: base, l: lt(base, 0.25), d: dk(base, 0.18), w: "#f6f6ee", k: "#10131a", n: lt("#e88a8a", 0.1), m: base, y: "#ffb830", x: "#d97a10", g: "#f1ead0", skin: skin, sl: lt(base, 0.1), sd: dk(base, 0.25), h: Pp.hair, e: dk(Pp.hair, 0.3), r: Pp.eye, q: "#9a4a4a", f: dk(base, 0.28), s: dk(base, 0.18) }; }
    return { b: base, l: lt(base, 0.3), d: dk(base, 0.32), w: "#f6f6ee", k: "#10131a", n: "#e8a0a0", m: a === "donkey" ? "#d9d5e6" : a === "monkey" ? "#e8c9a0" : base, y: "#ffb830", x: "#d97a10", g: "#f1ead0", skin: skin, sl: lt(base, 0.22), sd: dk(base, 0.3), h: "#1c1613", e: "#2e2018", r: "#ff3b30", s: "#a8433f" };
  }

  // ---------- gradients used by the Armory art (light, mid, dark) ----------
  var G = { gold: ["#fff4b0", "#f2c14e", "#a8740a"], red: ["#ff7a7a", "#d12f4a", "#7a1428"], pu: ["#b79cff", "#6a3fc4", "#34187f"], dk: ["#4a4a5c", "#25252f", "#0e0e14"], pk: ["#ff9ad0", "#e83a9a", "#7a1f6a"], tl: ["#b8fff0", "#35d6b4", "#0e7490"], br: ["#c98a4a", "#9a6030", "#5c3818"], bd: ["#4a5068", "#2c3040", "#12141c"], gr: ["#c4ff9a", "#4ccf5a", "#1d6a2e"], sc: ["#c3d2ee", "#7186b0", "#2f3a5a"] };
  var Y2K = { pink: ["#ff6fb5", "#a3195f", "#ffe3f3"], ice: ["#7fd3ff", "#1b5f9a", "#ffffff"], lime: ["#b8ff4a", "#3a7a0c", "#faffe0"], violet: ["#b58cff", "#4a2a9a", "#f0e6ff"], chrome: ["#4a4e63", "#0c0d14", "#d3dbf5"] };

  // ---------- hats: each draws upward from hy (the row sitting on the skull), hw = head width (even) ----------
  var HATS = {
    raidband: function (B, hy, hw) {   // blood-red Dweller headband with trailing tails, over wild black hair
      var x0 = 11 - Math.floor(hw / 2), x1 = x0 + hw - 1;
      B.row(hy, hw + 2, "#c2362b"); B.p(x0 - 1, hy, "#e65a4a"); B.p(x1 + 1, hy, "#7a1f1a");
      B.r(x0 - 3, hy, 2, 1, "#c2362b"); B.r(x0 - 3, hy + 1, 1, 3, "#7a1f1a"); B.r(x0 - 2, hy + 1, 1, 2, "#c2362b"); B.p(x0 - 2, hy + 3, "#7a1f1a");
      [[x0 + 1, hy - 3], [x0 + 3, hy - 4], [x0 + 5, hy - 3], [x0 + 6, hy - 4]].forEach(function (c) { B.p(c[0], c[1], "#1c1613"); B.p(c[0], c[1] + 1, "#1c1613"); });
      B.p(x0 + 2, hy - 2, "#2e2420"); B.p(x0 + 4, hy - 2, "#2e2420");
    },
    beanie: function (B, hy, hw) {
      var g = G.dk; B.row(hy, hw, "#4a4a5c"); B.row(hy - 1, hw, "#3a3a4c");
      for (var i = 0; i < hw; i += 2) { B.p(11 - hw / 2 + i, hy, "#5e5e76"); B.p(11 - hw / 2 + i + 1, hy - 1, "#5e5e76"); }
      B.row(hy - 2, hw - 2, g[1]); B.row(hy - 3, hw - 4, g[1]); if (hw >= 10) B.row(hy - 4, hw - 8 < 2 ? 2 : hw - 8, g[1]); B.p(11 - hw / 2 + 2, hy - 2, "#55556b"); B.p(11 - hw / 2 + 3, hy - 3, "#55556b");
    },
    party: function (B, hy, hw) {
      var base = Math.min(6, hw - 2);
      for (var i = 0; i < 6; i++) { var w = Math.max(2, base - 2 * Math.floor(i / 2)), x0 = 11 - w / 2, y = hy - i; for (var j = 0; j < w; j++) B.p(x0 + j, y, (j + i) % 3 === 0 ? "#ffffff" : j === 0 ? "#ff9ad0" : j === w - 1 ? "#a8206a" : "#e83a9a"); }
      B.r(10, hy - 7, 2, 2, "#ffe66d"); B.p(10, hy - 7, "#fff9c8");
    },
    cowboy: function (B, hy, hw) {
      var bw = hw + 6, x0 = 11 - bw / 2; B.row(hy, bw, "#9a6030"); B.r(x0, hy, bw, 1, "#9a6030"); B.p(x0, hy - 1, "#9a6030"); B.p(x0 + bw - 1, hy - 1, "#9a6030"); B.p(x0 + 1, hy, "#c98a4a"); B.p(x0 + bw - 2, hy, "#5c3818");
      B.row(hy - 1, hw - 2, "#2a1708"); B.row(hy - 2, hw - 2, "#9a6030"); B.row(hy - 3, hw - 2, "#9a6030"); B.row(hy - 4, hw - 4, "#9a6030"); B.row(hy - 4, 2, "#5c3818");
      B.p(11 - (hw - 2) / 2, hy - 2, "#c98a4a"); B.p(11 - (hw - 2) / 2, hy - 3, "#c98a4a"); B.r(10, hy - 1, 2, 1, "#f2c14e");
    },
    wizard: function (B, hy, hw) {
      var bw = hw + 4, x0 = 11 - bw / 2; B.row(hy, bw, "#6a3fc4"); B.p(x0, hy, "#34187f"); B.p(x0 + bw - 1, hy, "#34187f"); B.p(x0 + 1, hy, "#b79cff");
      for (var i = 1; i <= 7; i++) { var w = Math.max(2, hw - 2 - 2 * Math.floor((i - 1) / 2)), xx = 11 - w / 2; B.row(hy - i, w, i === 1 ? "#34187f" : "#6a3fc4"); if (i > 1) { B.p(xx, hy - i, "#9a78e8"); B.p(xx + w - 1, hy - i, "#4a2a9a"); } }
      B.p(10, hy - 4, "#ffd23f"); B.p(11, hy - 3, "#ffd23f"); B.p(11, hy - 5, "#ffd23f");
    },
    halo: function (B, hy, hw) {
      var w = hw - 2, y = hy - 5, x0 = 11 - w / 2;
      B.glow(11, y + 1, w / 2 + 3, 4, "#ffd36a", 0.16);
      B.row(y - 1, w, "#fff4b0"); B.p(x0 - 1, y, "#f2c14e"); B.p(x0 + w, y, "#f2c14e"); B.p(x0 - 1, y + 1, "#c98c12"); B.p(x0 + w, y + 1, "#c98c12"); B.row(y + 2, w, "#c98c12");
      B.p(x0 + 1, y - 1, "#ffffff");
    },
    crown: function (B, hy, hw) {
      var w = hw - 2, x0 = 11 - w / 2, x1 = x0 + w - 1;
      B.row(hy, w, "#a8740a"); B.row(hy - 1, w, "#f2c14e"); B.r(x0, hy - 1, w, 1, "#f2c14e");
      [[x0, 2], [x1, 2], [10, 3], [11, 3]].forEach(function (s) { for (var j = 0; j < s[1]; j++) B.p(s[0], hy - 2 - j, j === s[1] - 1 ? "#fff4b0" : "#f2c14e"); });
      B.r(10, hy - 1, 2, 1, "#ff4d6d"); B.p(x0 + 2, hy - 1, "#4ee6b4"); B.p(x1 - 2, hy - 1, "#4ee6b4"); B.p(x0, hy - 1, "#fff4b0");
    },
    lilypad: function (B, hy, hw) {
      B.row(hy, hw + 2, "#2a8a40"); B.row(hy - 1, hw, "#4ccf5a"); B.row(hy - 2, hw - 4 > 2 ? hw - 4 : 2, "#7ee08a"); B.p(11 + (hw + 2) / 2 - 1, hy, "#06210f");
      B.p(11 - hw / 2 + 1, hy - 2, "#ff9ad0"); B.p(11 - hw / 2 + 2, hy - 2, "#ff9ad0"); B.p(11 - hw / 2 + 1, hy - 3, "#ff9ad0"); B.p(11 - hw / 2 + 2, hy - 3, "#fff"); B.p(11 - hw / 2 + 3, hy - 3, "#ff9ad0");
    },
    glowcap: function (B, hy, hw) {
      B.glow(11, hy - 1, hw / 2 + 3, 5, "#35f0c4", 0.18);
      B.row(hy, hw + 2, "#34187f"); B.row(hy - 1, hw + 2, "#6a3fc4"); B.row(hy - 2, hw, "#6a3fc4"); B.row(hy - 3, hw - 4, "#6a3fc4");
      B.p(11 - (hw + 2) / 2 + 1, hy - 1, "#b79cff"); B.p(11 - hw / 2 + 1, hy - 2, "#b79cff");
      B.p(11 - 3, hy - 1, "#35f0c4"); B.p(11 + 2, hy - 2, "#35f0c4"); B.p(10, hy - 3, "#9ffff0"); B.p(11 + 3, hy - 1, "#35f0c4");
    },
    mossback: function (B, hy, hw) {
      var ws = [hw + 2, hw + 2, hw, hw - 4], y;
      for (var i = 0; i < 4; i++) { y = hy - i; B.row(y, ws[i], i === 0 ? "#5c3818" : "#9a6030"); var x0 = 11 - ws[i] / 2; for (var j = 0; j < ws[i]; j++) if ((x0 + j + y) % 4 === 0 && i > 0) B.p(x0 + j, y, "#5c3818"); else if (j === 1 && i > 0) B.p(x0 + j, y, "#c98a4a"); }
      B.p(9, hy - 3, "#4ccf5a"); B.p(11, hy - 3, "#7ee08a"); B.p(13 - 1, hy - 2, "#4ccf5a"); B.p(8, hy - 1, "#4ccf5a");
    },
    dragonfly: function (B, hy, hw) {
      var xl = 11 - hw / 2, xr = xl + hw - 1;
      B.row(hy, hw, "#f2c14e"); B.row(hy - 1, hw - 4, "#a8740a", 0); B.r(10, hy - 1, 2, 1, "#35f0c4"); B.p(xl, hy, "#fff4b0");
      var W = [[-1, -1], [-2, -1], [-1, -2], [-2, -2], [-3, -2], [-2, -3], [-3, -3], [-4, -3], [-3, -4]];
      W.forEach(function (c) { B.p(xl + c[0], hy + c[1], "#9ffff0", 0.6); B.p(xr - c[0], hy + c[1], "#9ffff0", 0.6); });
      B.p(xl - 2, hy - 3, "#e0fffa"); B.p(xr + 2, hy - 3, "#e0fffa");
    },
    stormcloud: function (B, hy, hw) {
      B.glow(11, hy - 4, hw / 2 + 3, 4, "#7186b0", 0.16);
      B.row(hy - 5, hw - 2, "#c3d2ee"); B.row(hy - 4, hw + 2, "#7186b0"); B.row(hy - 3, hw, "#2f3a5a");
      B.p(11 - hw / 2 + 1, hy - 4, "#c3d2ee"); B.p(11 - hw / 2 + 2, hy - 5, "#e6eeff");
      B.p(11, hy - 2, "#ffe66d"); B.p(10, hy - 1, "#ffe66d"); B.p(11, hy, "#fff9c8");
      B.p(11 - hw / 2 + 1, hy - 1, "#4da3ff"); B.p(11 + hw / 2 - 2, hy - 2, "#4da3ff");
    },
    y2kbandana: function (B, hy, hw, hv) {
      var c = Y2K[hv] || Y2K.pink, m = c[0], d = c[1], l = c[2], x0 = 11 - hw / 2, x1 = x0 + hw - 1;
      B.row(hy, hw + 1, d); B.row(hy - 1, hw + 1, m); B.row(hy - 2, hw - 2, m);
      for (var i = 0; i < hw - 2; i += 2) B.p(x0 + 1 + i, hy - 1, l);
      B.p(x0 + 2, hy - 2, lt(m, .5)); B.p(10, hy - 3, l); B.p(11, hy - 3, l, 0.0); B.p(10, hy - 2, l);
      B.r(x1 + 1, hy - 1, 2, 2, m); B.p(x1 + 1, hy - 1, l); B.r(x1 + 1, hy + 1, 1, 3, m); B.r(x1 + 2, hy + 1, 1, 2, d);
    }
  };

  // ---------- face gear: eyes = [[x,y],[x,y]] ----------
  var FACES = {
    eyepatch: function (B, e) {
      B.r(e[0][0] - 1, e[0][1] - 1, 3, 3, "#14141a"); B.p(e[0][0] - 1, e[0][1] - 1, "#3a3a4c"); B.r(e[0][0] + 2, e[0][1] - 1, e[1][0] - e[0][0] - 1, 1, "#14141a");
    },
    shades: function (B, e) {
      var x0 = e[0][0] - 2, w = e[1][0] - e[0][0] + 5, y = e[0][1] - 1; B.r(x0 - 1, y - 1, w + 2, 5, "#35d6b4", 0.25); B.r(x0, y, w, 3, "#0e7490"); B.r(x0, y, w, 1, "#35d6b4"); B.r(x0 + 1, y + 1, w - 2, 1, "#9ffff0"); B.p(x0 + 1, y, "#ffffff"); B.p(x0 + w - 2, y, "#ffffff", 0.7);
    },
    hearts: function (B, e) {
      e.forEach(function (p) { var x = p[0] - 1, y = p[1] - 1; B.p(x, y, "#e83a9a"); B.p(x + 2, y, "#e83a9a"); B.r(x, y + 1, 3, 1, "#ff9ad0"); B.p(x + 1, y + 2, "#e83a9a"); B.p(x, y + 1, "#ffffff"); });
    },
    monocle: function (B, e) {
      var x = e[1][0], y = e[1][1], r = "#f2c14e";
      B.r(x - 1, y - 2, 4, 4, "#9fe8ff", 0.3); B.p(x, y - 2, r); B.p(x + 1, y - 2, r); B.p(x - 2, y - 1, r); B.p(x - 2, y, r); B.p(x + 2, y - 1, r); B.p(x + 2, y, r); B.p(x, y + 2 - 0, r); B.p(x + 1, y + 2, r); B.p(x - 1, y + 1, r); B.p(x + 2, y + 1, r);
      B.p(x + 3, y + 1, "#fff4b0"); B.p(x + 3, y + 2, "#f2c14e"); B.p(x + 3, y + 3, "#a8740a");
    },
    laser: function (B, e) {
      e.forEach(function (p, i) { var dir = i ? 1 : -1; B.p(p[0], p[1], "#ff3b3b"); B.p(p[0] + dir, p[1], "#ff8a8a"); for (var k = 2; k < 8; k++) { B.p(p[0] + dir * k, p[1], "#ff3b3b", 0.75); B.p(p[0] + dir * k, p[1] - 1, "#ff2d2d", 0.18); B.p(p[0] + dir * k, p[1] + 1, "#ff2d2d", 0.18); } });
    },
    fireflygoggles: function (B, e) {
      var y = e[0][1];
      B.r(e[0][0] + 1, y - 1, e[1][0] - e[0][0] - 1, 1, "#5a3d00");
      e.forEach(function (p) { B.r(p[0] - 2, p[1] - 2, 5, 5, "#a8740a"); B.r(p[0] - 1, p[1] - 1, 3, 3, "#ffe66d"); B.p(p[0] - 1, p[1] - 1, "#ffffff"); B.p(p[0] - 2, p[1] - 2, "#f2c14e"); });
    },
    clawpaint: function (B, e) {
      var x = e[1][0] - 1, y = e[1][1] + 1; [0, 2, 4].forEach(function (o) { for (var k = 0; k < 4; k++) B.p(x - 1 + o + (k >> 1), y + k, "#35f0c4"); B.p(x - 1 + o, y, "#b6fff0"); });
    },
    oracleeye: function (B, e, a) {
      var f = AN[a].fy; B.r(f[0] - 3, f[1] - 1, 6, 4, "#e83a9a", 0.22); B.r(f[0] - 2, f[1], 4, 2, "#ffffff"); B.r(f[0] - 1, f[1], 2, 2, "#e83a9a"); B.p(f[0], f[1], "#14141a"); B.p(f[0] - 2, f[1], "#f6c6e6"); B.p(f[0] + 1, f[1] + 1, "#7a1f6a");
    },
    gothicshades: function (B, e) {
      e.forEach(function (p, i) { var x = p[0] - 1, y = p[1] - 1; B.r(x - 1, y - 1, 6, 5, "#8aa0c8"); B.r(x, y, 4, 3, "#05060a"); B.p(x, y, "#3a4a6a"); B.p(x + 3, y + 2, "#ff4d6d"); });
      B.r(e[0][0] + 3, e[0][1], e[1][0] - e[0][0] - 3, 1, "#8aa0c8");
    }
  };

  // ---------- neck gear ----------
  function chainPx(B, col, dark) {
    [[7, 17], [8, 18], [9, 19], [10, 20], [11, 20], [12, 19], [13, 18], [14, 17]].forEach(function (c, i) { B.p(c[0], c[1], i % 2 ? dark : col); });
  }
  var NECKS = {
    bell: function (B, by) { B.r(7, 17 + by, 8, 1, "#d12f4a"); B.r(7, 17 + by, 8, 1, "#7a1428", 0); B.p(7, 17 + by, "#ff7a7a"); B.r(10, 18 + by, 2, 2, "#f2c14e"); B.p(10, 18 + by, "#fff4b0"); B.p(11, 19 + by, "#a8740a"); },
    bowtie: function (B, by) { B.r(7, 17 + by, 3, 3, "#e83a9a"); B.r(12, 17 + by, 3, 3, "#e83a9a"); B.p(7, 17 + by, "#ff9ad0"); B.p(12, 17 + by, "#ff9ad0"); B.p(9, 18 + by, "#7a1f6a"); B.p(12, 18 + by, "#7a1f6a"); B.r(10, 17 + by, 2, 2, "#a8206a"); B.p(10, 17 + by, "#ff9ad0"); },
    scarf: function (B, by) {
      B.r(6, 17 + by, 10, 2, "#d12f4a"); B.r(6, 17 + by, 10, 1, "#ff7a7a"); B.r(6, 18 + by, 10, 1, "#a82240"); B.p(8, 18 + by, "#ffd36a"); B.p(11, 17 + by, "#ffd36a"); B.p(14, 18 + by, "#ffd36a");
      B.r(13, 19 + by, 2, 6, "#d12f4a"); B.r(14, 19 + by, 1, 6, "#a82240"); B.p(13, 21 + by, "#ffd36a"); B.p(14, 23 + by, "#ffd36a"); B.p(13, 25 + by, "#7a1428"); B.p(14, 25 + by, "#7a1428");
    },
    cape: function (B, by) {   // front clasps only; the cape itself is drawn behind
      B.r(7, 17 + by, 8, 1, "#9c1c34"); B.r(6, 17 + by, 2, 2, "#f2c14e"); B.r(14, 17 + by, 2, 2, "#f2c14e"); B.p(6, 17 + by, "#fff4b0"); B.p(14, 17 + by, "#fff4b0"); B.p(7, 18 + by, "#a8740a"); B.p(15, 18 + by, "#a8740a");
    },
    chain: function (B, by) { B.m(0, by, [], {}); [[7, 17], [8, 18], [9, 19], [10, 20], [11, 20], [12, 19], [13, 18], [14, 17]].forEach(function (c, i) { B.p(c[0], c[1] + by, i % 2 ? "#a8740a" : "#f2c14e"); }); B.r(10, 21 + by, 2, 2, "#35d6b4"); B.p(10, 21 + by, "#e6fffa"); B.p(11, 22 + by, "#0e7490"); B.p(10, 23 + by, "#35d6b4", 0.6); }
  };
  var CAPE_BACK = function (B, by, sway) {
    for (var y = 17 + by; y <= 28; y++) { var t = y - 17 - by, w = Math.min(12, 10 + Math.floor(t / 5) * 2), x = 11 - w / 2 + (t > 8 ? sway : 0); B.r(x, y, w, 1, y > 24 + by ? "#a82240" : "#d12f4a"); B.p(x, y, "#ff7a7a"); B.p(x + w - 1, y, "#7a1428"); }
    B.r(9, 22 + by, 4, 6, "#7a1428", 0.35);
  };

  // ---------- shirts: torso colours + decorations on the 8x7 torso at (7, 17+by) ----------
  var SHIRTS = {
    "": { c: G.bd, sleeve: G.bd, sl: 5, cuff: "#35d6b4" },
    tee: { c: G.tl, sleeve: G.tl, sl: 2 },
    hoodie: { c: G.pu, sleeve: G.pu, sl: 6, cuff: "#1d0f4d" },
    jersey: { c: G.red, sleeve: G.red, sl: 3, cuff: "#ffffff" },
    tux: { c: ["#3a3a4c", "#25252f", "#0e0e14"], sleeve: ["#3a3a4c", "#25252f", "#0e0e14"], sl: 6, cuff: "#f6f3ea" },
    armor: { c: G.tl, sleeve: ["#4a4a5c", "#25252f", "#0e0e14"], sl: 6, cuff: "#35d6b4", pauld: G.tl },
    robe: { c: G.red, sleeve: G.red, sl: 6, cuff: "#f2c14e" },
    raider: { c: ["#7a4a30", "#55331f", "#241410"], sleeve: ["#7a4a30", "#55331f", "#241410"], sl: 4, cuff: "#c2362b", pauld: ["#5a5a6e", "#2c2c38", "#0e0e14"] }
  };
  function torso(B, id, by, noItem) {
    var s = SHIRTS[id] || SHIRTS[""], c = s.c, x = 7, y = 17 + by, i, j;
    B.r(x, y, 8, 7, c[1]); B.r(x, y, 1, 7, c[0]); B.r(x + 7, y, 1, 7, c[2]); B.r(x + 1, y + 6, 6, 1, c[2]);
    if (id === "") {
      B.p(x + 1, y, "#35d6b4"); B.p(x + 6, y, "#35d6b4"); B.p(x + 2, y + 1, "#35d6b4"); B.p(x + 5, y + 1, "#35d6b4"); B.p(x + 3, y + 2, "#35d6b4"); B.p(x + 4, y + 2, "#35d6b4");
      if (!noItem) { B.r(x + 3, y + 3, 2, 2, "#35d6b4"); B.p(x + 3, y + 3, "#b8fff0"); B.p(x + 4, y + 4, "#0e7490"); }
      B.r(x + 1, y + 5, 6, 1, "#0f1017", 0.5);
    } else if (id === "tee") {
      B.r(x + 1, y, 6, 1, "#0b5f73"); B.r(x + 2, y + 1, 4, 1, "#0b5f73"); B.p(x + 2, y, "#e6fffa"); B.p(x + 5, y, "#e6fffa", 0.0);
      B.p(x + 4, y + 3, "#ffffff"); B.p(x + 3, y + 4, "#ffffff"); B.p(x + 4, y + 4, "#ffffff"); B.p(x + 5, y + 3, "#b8fff0");
    } else if (id === "hoodie") {
      B.r(x, y, 8, 2, "#4a2a9a"); B.r(x + 2, y, 4, 1, "#150a38"); B.r(x + 3, y + 1, 2, 1, "#150a38", 0.0); B.p(x + 2, y + 2, "#f6f3ea"); B.p(x + 2, y + 3, "#f6f3ea"); B.p(x + 5, y + 2, "#f6f3ea"); B.p(x + 5, y + 3, "#f6f3ea");
      B.r(x + 2, y + 4, 4, 2, "#4a2a9a"); B.r(x + 2, y + 4, 4, 1, "#1d0f4d"); B.p(x + 1, y + 1, "#b79cff");
    } else if (id === "jersey") {
      for (i = 0; i < 4; i++) { B.p(x + 1 + i, y + i, "#ffffff"); B.p(x + 6 - i, y + i, "#ffffff"); }
      B.r(x, y + 4, 8, 1, "#ffffff"); B.r(x + 1, y + 5, 6, 1, "#7a1428"); B.p(x, y + 4, "#ffd36a"); B.p(x + 7, y + 4, "#ffd36a", 0.0);
    } else if (id === "tux") {
      B.p(x + 3, y, "#f6f3ea"); B.p(x + 4, y, "#f6f3ea"); B.r(x + 3, y + 1, 2, 1, "#f6f3ea"); B.r(x + 2, y, 1, 2, "#f6f3ea", 0.0); B.r(x + 3, y + 2, 2, 3, "#f6f3ea");
      B.p(x + 2, y, "#f2c14e"); B.p(x + 5, y, "#f2c14e"); B.p(x + 2, y + 1, "#f2c14e"); B.p(x + 5, y + 1, "#f2c14e"); B.p(x + 3, y + 3, "#f2c14e"); B.p(x + 4, y + 4, "#f2c14e"); B.p(x + 1, y + 2, "#4a4a5c"); B.p(x + 6, y + 2, "#0e0e14");
    } else if (id === "armor") {
      B.r(x, y, 8, 6, "#35d6b4"); B.r(x, y, 8, 1, "#b8fff0"); B.r(x + 3, y + 1, 2, 5, "#0e7490"); B.r(x + 3, y + 1, 1, 5, "#b8fff0"); B.r(x + 1, y + 2, 2, 1, "#0e7490"); B.r(x + 5, y + 2, 2, 1, "#0e7490"); B.r(x + 1, y + 4, 2, 1, "#0e7490"); B.r(x + 5, y + 4, 2, 1, "#0e7490");
      B.p(x, y + 1, "#e6fffa"); B.r(x, y + 6, 8, 1, "#25252f"); B.r(x + 3, y + 6, 2, 1, "#f2c14e"); B.p(x + 4, y, "#ffffff");
    } else if (id === "raider") {
      for (i = 0; i < 5; i++) { B.p(x + 1 + i, y + i, "#2a1a10"); B.p(x + 2 + i, y + i, "#3a2518"); }
      B.p(x + 1, y, "#8a5a3a"); B.r(x, y + 5, 8, 1, "#c2362b"); B.r(x, y + 5, 8, 1, "#7a1f1a", 0.0); B.p(x, y + 5, "#e65a4a"); B.r(x + 3, y + 5, 2, 1, "#f1ead0"); B.p(x + 3, y + 5, "#ffffff");
      B.p(x + 5, y + 1, "#c2362b"); B.p(x + 6, y + 2, "#7a1f1a"); B.r(x + 1, y + 6, 6, 1, "#150c08");
    } else if (id === "robe") {
      B.r(x + 3, y, 2, 7, "#f2c14e"); B.p(x + 3, y, "#fff4b0"); B.p(x + 3, y + 3, "#fff4b0"); B.p(x + 4, y + 5, "#a8740a");
      B.r(x, y, 8, 2, "#f6f3ea"); B.p(x, y, "#ffffff"); B.p(x + 1, y + 1, "#d8d2c0"); B.p(x + 3, y, "#f6f3ea"); B.p(x + 4, y + 1, "#d8d2c0"); B.p(x + 6, y + 1, "#d8d2c0");
    }
  }

  // ---------- shoes: 4 wide (left foot, toe outward at col 0). rows listed top to bottom ----------
  var SHOES = {
    sneakers: { rows: [".ccc", "cccc", "wwww"], pal: { c: "#35d6b4", w: "#f6f3ea" }, hi: { c: "#b8fff0" } },
    swampboots: { rows: [".ggg", ".bbb", ".bbb", ".bbb", "bbbb", "dddd"], pal: { g: "#4ccf5a", b: "#9a6030", d: "#2a1708" } },
    gildedkicks: { rows: [".hhh", "gggg", "dddd"], pal: { h: "#fff4b0", g: "#f2c14e", d: "#a8740a" } }
  };

  // ---------- worn armor (Delve progression): drawn over the torso and the shoulders. a main, b light, c dark, t trim ----------
  var ARM = {
    1: { a: "#a8814b", b: "#d3a96b", c: "#6b4a26", t: "#4f8a3c", t2: "#8fd37a" },
    2: { a: "#157a64", b: "#1fbf93", c: "#0b4d3e", t: "#4ee6b4", t2: "#e6fff8" },
    3: { a: "#3a2e34", b: "#5a4a52", c: "#1c1418", t: "#ff6a1f", t2: "#ffd25a" },
    4: { a: "#3f9fc4", b: "#7fd6ff", c: "#16465e", t: "#ffffff", t2: "#bff0ff" },
    5: { a: "#5a2a7a", b: "#c06aff", c: "#2a1438", t: "#ffd23f", t2: "#ff8a3d" }
  };
  function armorOver(B, tier, by) {
    var P = ARM[tier]; if (!P) return; var x = 7, y = 17 + by;
    B.r(x, y, 8, 7, P.a); B.r(x, y, 8, 1, P.b); B.r(x, y, 1, 7, P.b); B.r(x + 7, y, 1, 7, P.c); B.r(x + 1, y + 6, 6, 1, P.c);
    B.r(x + 2, y + 1, 4, 4, P.b); B.r(x + 2, y + 4, 4, 1, P.a);
    if (tier === 1) { for (var i = 0; i < 5; i++) B.p(x + 3 + (i % 2), y + 1 + i, i % 2 ? P.t2 : P.t); }
    else if (tier === 2) { B.r(x + 3, y + 2, 2, 2, P.t); B.p(x + 4, y + 3, P.t2); B.p(x + 1, y + 1, P.t2); }
    else if (tier === 3) { B.r(x + 3, y + 2, 2, 2, P.t); B.p(x + 4, y + 3, P.t2); B.r(x + 1, y + 6, 6, 1, P.t); B.p(x + 1, y + 1, P.t); B.p(x + 6, y + 1, P.t); }
    else if (tier === 5) { B.r(x, y, 8, 1, P.t); B.r(x + 3, y + 2, 2, 2, P.t2); B.p(x + 3, y + 1, P.t); B.p(x + 4, y + 1, P.t); B.r(x + 1, y + 6, 6, 1, P.t); B.p(x + 1, y + 3, P.t); B.p(x + 6, y + 3, P.t); }
    else { B.r(x + 3, y + 2, 2, 2, P.t); B.p(x + 3, y, P.t); B.p(x + 4, y, P.t); B.p(x + 1, y + 1, P.t2); B.p(x + 6, y + 1, P.t2); }
  }

  // ---------- poses: by = body bob, L/R = [dx, lift], ab = back-arm shift ----------
  var POSE = {
    idle0: { by: 0, L: [0, 0], R: [0, 0], ab: 0 }, idle1: { by: 1, L: [0, 0], R: [0, 0], ab: 0 },
    walk0: { by: -1, L: [0, 0], R: [0, 2], ab: 1 }, walk1: { by: 0, L: [0, 0], R: [0, 0], ab: 0 },
    walk2: { by: -1, L: [0, 2], R: [0, 0], ab: -1 }, walk3: { by: 0, L: [0, 0], R: [0, 0], ab: 0 },
    jump: { by: -1, L: [1, 3], R: [-1, 3], ab: -1 }, fall: { by: 0, L: [-1, 0], R: [1, 0], ab: -1 },
    // the back view: standing, walking away, and climbing (one arm reaching up, the other leg stepping up)
    back0: { by: 0, L: [0, 0], R: [0, 0], ab: 0, back: 1 }, back1: { by: 1, L: [0, 0], R: [0, 0], ab: 0, back: 1 },
    bwalk0: { by: -1, L: [0, 0], R: [0, 2], ab: 1, back: 1 }, bwalk1: { by: 0, L: [0, 0], R: [0, 0], ab: 0, back: 1 },
    bwalk2: { by: -1, L: [0, 2], R: [0, 0], ab: -1, back: 1 }, bwalk3: { by: 0, L: [0, 0], R: [0, 0], ab: 0, back: 1 },
    climb0: { by: 0, L: [0, 0], R: [0, 3], ab: 0, back: 1, climb: -1 }, climb1: { by: 0, L: [0, 3], R: [0, 0], ab: 0, back: 1, climb: 1 },
    // MORE ANIMATION: blinking, a running stride, tucked jump apex, landing crouch, swimming kicks, flinching, cheering
    idle0b: { by: 0, L: [0, 0], R: [0, 0], ab: 0, blink: 1 }, idle1b: { by: 1, L: [0, 0], R: [0, 0], ab: 0, blink: 1 },
    run0: { by: -2, L: [1, 0], R: [-1, 3], ab: 2 }, run1: { by: -1, L: [0, 1], R: [0, 1], ab: 0 }, run2: { by: -2, L: [-1, 3], R: [1, 0], ab: -2 }, run3: { by: -1, L: [0, 1], R: [0, 1], ab: 0 },
    tuck: { by: -1, L: [1, 4], R: [-1, 4], ab: -2 }, land: { by: 2, L: [-1, 0], R: [1, 0], ab: 1 },
    swim0: { by: 1, L: [-1, 2], R: [1, 0], ab: 1 }, swim1: { by: 1, L: [0, 1], R: [0, 1], ab: 0 }, swim2: { by: 1, L: [-1, 0], R: [1, 2], ab: -1 }, swim3: { by: 1, L: [0, 1], R: [0, 1], ab: 0 },
    hurt: { by: 1, L: [-1, 0], R: [1, 1], ab: -2, blink: 1 }, cheer0: { by: -1, L: [0, 1], R: [0, 1], ab: -1 }, cheer1: { by: -2, L: [1, 2], R: [-1, 2], ab: -2 }
  };

  // ---------- arms ----------
  function armRows(o, a) {   // 8 rows of [left colour, right colour]
    var s = SHIRTS[o.shirt] || SHIRTS[""], P = palFor(a), rows = [], sl = s.sl, i;
    for (i = 0; i < 8; i++) {
      if (i < sl) {
        var c = s.sleeve, cc = [c[0], c[2]];
        if (s.pauld && i < 2) cc = [s.pauld[0], s.pauld[2]];
        else if (s.cuff && i === sl - 1) cc = [s.cuff, dk(s.cuff, 0.25)];
        if (o.arm && ARM[o.arm] && i < 2) cc = [ARM[o.arm].b, ARM[o.arm].c];
        if (o.shirt === "jersey" && i === 1) cc = ["#ffffff", "#d8d8d8"];
        cc.lay = o.arm && ARM[o.arm] && i < 2 ? 3 : 2; rows.push(cc);
      } else if (o.arm && ARM[o.arm] && i < 2) { var ar = [ARM[o.arm].b, ARM[o.arm].c]; ar.lay = 3; rows.push(ar); }
      else rows.push(i >= 6 ? [lt(P.skin, 0.12), P.sd] : [P.sl, P.sd]);
    }
    return rows;
  }
  function drawArm(B, x, y, rows) { var c0 = B.cur; rows.forEach(function (r, i) { B.cur = r.lay || 1; B.p(x, y + i, r[0]); B.p(x + 1, y + i, r[1]); }); B.cur = c0; }
  function armBuf(o, a) { var B = new Buf(4, 10, 1, 1); drawArm(B, 0, 0, armRows(o, a)); if (OUTLINE) B.outline(OL); B.isArm = 1; return B; }

  // ---------- BACK VIEW (climbing ladders, walking away in caves and buildings) ----------
  // The back of the head is made from the front head map: faces, muzzles, beaks and tusks become fur/feathers, humans get hair.
  // Clothes show their backs (hood, jersey number, cape over the shoulders, straps of face gear across the head), armor its back plate.
  var BACKH = {};
  function backHead(a) {
    if (BACKH[a]) return BACKH[a];
    var src = AN[a].head, H = src.length, W2 = src[0].length, mid = W2 / 2;
    var rows = src.map(function (r, j) { return r.replace(/[^.]/g, function (ch) { return PEOPLE[a] ? (ch === "h" || j < 8 ? "h" : "b") : a === "human" ? (j < 8 ? "h" : "b") : (ch === "n" && (a === "donkey" || a === "elephant")) ? "d" : "b"; }); });
    var put = function (x, y, ch) { if (y >= 0 && y < H && rows[y].charAt(x) !== "." && x >= 0 && x < W2) rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1); };
    if (a === "frog") { [[3, 4], [8, 4], [5, 6], [7, 8], [3, 8]].forEach(function (q) { put(q[0], q[1], "d"); }); }   // a few darker spots
    else if (a === "owl") { for (var j = 4; j < H - 1; j += 2) for (var i = 1 + (j % 4 ? 1 : 0); i < W2 - 1; i += 3) put(i, j, "d"); }   // feather scallops
    else if (a === "donkey") { for (var j2 = 5; j2 < H - 2; j2++) { put(Math.floor(mid) - 1, j2, "d"); put(Math.floor(mid), j2, "d"); } }   // the mane down the back of the neck
    else if (a === "monkey") { for (var j3 = 1; j3 < H - 2; j3++) if (j3 % 3 === 0) put(Math.floor(mid), j3, "d"); }
    else if (a === "human" || PEOPLE[a]) { put(Math.floor(mid), 2, "e"); put(Math.floor(mid) - 1, 3, "e"); put(Math.floor(mid) + 1, 4, "e"); }   // a crown swirl in the hair
    else { put(Math.floor(mid), 1, "d"); put(Math.floor(mid), 2, "d"); }
    return (BACKH[a] = rows);
  }
  function armUp(B, x, y, rows) { var c0 = B.cur; rows.forEach(function (r, i) { B.cur = r.lay || 1; B.p(x, y - i, r[0]); B.p(x + 1, y - i, r[1]); }); B.cur = c0; }   // an arm raised above the shoulder (hand on top)
  function drawBack(o, PO) {
    var a = AN[o.animal] ? o.animal : "frog", A = AN[a], P = palFor(a), by = PO.by, B = new Buf(FW, FH, 0, OY), acc = o.acc || {}, i, y;
    var shirt = o.shirt || "", hv = o.hv && o.hat ? o.hv[o.hat] : null, s = SHIRTS[shirt] || SHIRTS[""];
    B.cur = 1;
    // legs and the backs of the shoes (heels)
    var legC = A.leg, sh = SHOES[o.shoes];
    [[7, PO.L, 1], [12, PO.R, -1]].forEach(function (lg) {
      var x = lg[0] + lg[1][0], lift = lg[1][1], bot = 30 - lift, top = 24 + by, side = lg[2];
      for (y = top; y <= bot; y++) { B.p(x, y, side > 0 ? dk(legC, 0.3) : lt(legC, 0.12)); B.p(x + 1, y, dk(legC, 0.08)); B.p(x + 2, y, side > 0 ? lt(legC, 0.12) : dk(legC, 0.3)); }
      if (shirt === "tux") { B.cur = 2; for (y = top; y < top + 2; y++) B.r(x, y, 3, 1, "#1a1a22"); B.cur = 1; }
      if (sh) { B.cur = 8; var rows = sh.rows, n = rows.length, y0 = bot - n + 1;
        for (var j = 0; j < n; j++) for (var k = 0; k < 3; k++) { var ch = rows[j].charAt(1 + k); if (ch === ".") continue; B.p(x + k, y0 + j, j === n - 1 ? dk(sh.pal[ch], 0.25) : sh.pal[ch]); }
        B.cur = 1;
      } else B.r(x, bot, 3, 1, dk(legC, 0.4));
    });
    B.cur = 2; if (shirt === "robe") { for (i = 0; i < 4; i++) B.r(6, 24 + by + i, 10, 1, i === 3 ? "#f2c14e" : "#a82240"); B.r(6, 24 + by, 1, 3, "#7a1428"); B.r(15, 24 + by, 1, 3, "#ff7a7a"); }
    // the back of the torso
    var c = s.c, x = 7; y = 17 + by;
    B.r(x, y, 8, 7, c[1]); B.r(x, y, 1, 7, c[2]); B.r(x + 7, y, 1, 7, c[0]); B.r(x + 1, y + 6, 6, 1, c[2]);
    if (shirt === "") { B.r(x + 3, y, 2, 6, "#1d2230"); B.r(x + 1, y + 5, 6, 1, "#0f1017", 0.5); }   // a seam down the back
    else if (shirt === "tee") { B.r(x + 1, y, 6, 1, "#0b5f73"); }
    else if (shirt === "hoodie") { B.r(x + 1, y - 1, 6, 4, "#4a2a9a"); B.r(x + 2, y, 4, 2, "#34187f"); B.p(x + 1, y - 1, "#b79cff"); }   // the hood, down
    else if (shirt === "jersey") { B.r(x, y + 4, 8, 1, "#ffffff"); B.r(x + 3, y + 1, 2, 1, "#ffffff"); B.p(x + 4, y + 2, "#ffffff"); B.p(x + 3, y + 3, "#ffffff"); }   // number 7
    else if (shirt === "tux") { B.r(x + 3, y + 3, 2, 4, "#0e0e14"); }   // split tails
    else if (shirt === "armor") { B.r(x, y, 8, 6, "#35d6b4"); B.r(x, y, 8, 1, "#b8fff0"); B.r(x + 3, y + 1, 2, 5, "#0e7490"); }
    else if (shirt === "raider") { for (i = 0; i < 6; i++) { B.p(x + 1 + i, y + i, "#2a1a10"); B.p(x + 6 - i, y + i, "#2a1a10"); } B.r(x, y + 5, 8, 1, "#c2362b"); }
    else if (shirt === "robe") { B.r(x + 3, y, 2, 7, "#a8740a"); B.r(x, y, 8, 1, "#f6f3ea"); }
    B.cur = 3; if (o.arm && ARM[o.arm]) { var Q = ARM[o.arm]; B.r(x, y, 8, 7, Q.a); B.r(x, y, 8, 1, Q.b); B.r(x, y, 1, 7, Q.c); B.r(x + 7, y, 1, 7, Q.b); B.r(x + 3, y + 1, 2, 5, Q.c); B.r(x + 1, y + 6, 6, 1, Q.c); B.p(x + 3, y + 1, Q.t); B.p(x + 4, y + 1, Q.t); if (o.arm >= 3) { B.p(x + 1, y + 2, Q.t); B.p(x + 6, y + 2, Q.t); } }   // the back plate
    B.cur = 1;
    // the head, from behind
    B.m(A.x0, A.y0 + by, backHead(a), P);
    // arms: hanging at the sides, or reaching up a ladder
    var ar = armRows(o, a);
    if (PO.climb) { var up = PO.climb; if (up < 0) { armUp(B, 5, 17 + by, ar); drawArm(B, 15, 17 + by + 1, ar); } else { drawArm(B, 5, 17 + by + 1, ar); armUp(B, 15, 17 + by, ar); } }
    else { drawArm(B, 5, 17 + by + PO.ab, ar); drawArm(B, 15, 17 + by - PO.ab, ar); }
    // neck gear seen from behind
    B.cur = 9; if (o.neck === "cape") { for (y = 17 + by; y <= 29; y++) { var t = y - 17 - by, w = Math.min(12, 10 + Math.floor(t / 5) * 2), cx2 = 11 - w / 2; B.r(cx2, y, w, 1, y > 25 + by ? "#a82240" : "#d12f4a"); B.p(cx2, y, "#7a1428"); B.p(cx2 + w - 1, y, "#ff7a7a"); } B.r(10, 19 + by, 2, 9, "#a82240", 0.5); }
    B.cur = 4; if (o.neck === "scarf") { B.r(6, 17 + by, 10, 2, "#d12f4a"); B.r(6, 17 + by, 10, 1, "#ff7a7a"); B.r(10, 19 + by, 2, 5, "#d12f4a"); B.r(11, 19 + by, 1, 5, "#a82240"); B.p(10, 23 + by, "#ffd36a"); }
    else if (o.neck === "bell" || o.neck === "bowtie" || o.neck === "chain") B.r(7, 17 + by, 8, 1, o.neck === "chain" ? "#f2c14e" : o.neck === "bell" ? "#d12f4a" : "#e83a9a");
    if (acc.necklace) B.r(7, 17 + by, 8, 1, "#f2c14e");
    // face gear: only its strap shows from behind
    B.cur = 6; if (o.face && o.face !== "clawpaint" && o.face !== "oracleeye" && o.face !== "hearts" && o.face !== "laser" && o.face !== "monocle") { var ey = A.eyes[0][1] + by, hw2 = A.hw; B.r(11 - hw2 / 2, ey, hw2, 1, o.face === "shades" ? "#0e7490" : o.face === "fireflygoggles" ? "#5a3d00" : o.face === "gothicshades" ? "#8aa0c8" : "#14141a"); }
    B.cur = 5; if (acc.bandana) { var mk = A.mask, my = mk[0] + by; B.r(10, my, 2, 2, "#d12f4a"); B.p(9, my + 2, "#a82240"); B.p(12, my + 2, "#a82240"); B.p(10, my, "#ff7a7a"); }   // the knot
    // hat
    B.cur = 7; if (o.hat && HATS[o.hat]) HATS[o.hat](new ByBuf(B, by), A.hy, A.hw, hv);
    B.cur = 1; if (A.ears && o.hat) A.ears.cells.forEach(function (cc) { B.p(cc[0], cc[1] + by, P.b); });
    if (OUTLINE) B.outline(OL);
    return B;
  }

  // ---------- main frame ----------
  function drawFrame(o, pose, withArm) {
    if (POSE[pose] && POSE[pose].back) return drawBack(o, POSE[pose]);
    var a = AN[o.animal] ? o.animal : "frog", A = AN[a], P = palFor(a), PO = POSE[pose] || POSE.idle0, by = PO.by, B = new Buf(FW, FH, 0, OY), acc = o.acc || {}, i;
    var shirt = o.shirt || "", hv = o.hv && o.hat ? o.hv[o.hat] : null;
    B.cur = 9; if (o.neck === "cape") CAPE_BACK(B, by, pose.indexOf("walk") === 0 ? (pose === "walk0" || pose === "walk2" ? 1 : 0) : 0);
    B.cur = 2; if (shirt === "hoodie") { B.r(7, 16 + by, 8, 3, "#4a2a9a"); B.p(7, 16 + by, "#6a3fc4"); }
    B.cur = 1;
    // legs + shoes
    var legC = A.leg, sh = SHOES[o.shoes];
    [[7, PO.L, 1], [12, PO.R, -1]].forEach(function (lg) {
      var x = lg[0] + lg[1][0], lift = lg[1][1], bot = 30 - lift, top = 24 + by, side = lg[2];
      for (var y = top; y <= bot; y++) { B.p(x, y, side > 0 ? lt(legC, 0.2) : dk(legC, 0.3)); B.p(x + 1, y, legC); B.p(x + 2, y, side > 0 ? dk(legC, 0.3) : lt(legC, 0.2)); }
      if (shirt === "tux") { B.cur = 2; for (y = top; y < top + 2; y++) B.r(x, y, 3, 1, "#25252f"); B.cur = 1; }
      if (sh) { B.cur = 8;
        var rows = sh.rows, n = rows.length, y0 = bot - n + 1, fx = side > 0 ? x - 1 : x;
        for (var j = 0; j < n; j++) for (var k = 0; k < 4; k++) { var ch = rows[j].charAt(side > 0 ? k : 3 - k); if (ch === ".") continue; B.p(fx + k, y0 + j, sh.pal[ch]); }
        if (sh.hi) B.p(fx + (side > 0 ? 1 : 2), y0 + 1, sh.hi.c);
        if (o.shoes === "gildedkicks") B.p(fx + (side > 0 ? 0 : 3), y0 + 1, "#fff4b0");
        B.cur = 1;
      } else { var bc = dk(legC, 0.35); B.p(side > 0 ? x - 1 : x + 3, bot, bc); if (a === "owl") { B.p(side > 0 ? x - 1 : x + 3, bot, "#f0a41c"); B.p(side > 0 ? x : x + 2, bot, "#d97a10"); } if (a === "donkey") { B.r(x, bot - 1, 3, 2, "#3a3a4c"); B.p(x, bot - 1, "#55556b"); } }
    });
    B.cur = 2; if (shirt === "robe") { for (i = 0; i < 4; i++) B.r(6, 24 + by + i, 10, 1, i === 3 ? "#f2c14e" : "#d12f4a"); B.r(6, 24 + by, 1, 3, "#ff7a7a"); B.r(15, 24 + by, 1, 3, "#7a1428"); B.r(10, 24 + by, 2, 3, "#f2c14e"); }
    // back arm, torso
    drawArm(B, 5, 17 + by + PO.ab, armRows(o, a));
    B.cur = 2;
    torso(B, shirt, by, !!o.neck);
    B.cur = 3; if (o.arm) armorOver(B, o.arm, by);
    B.cur = 1;
    if (withArm) drawArm(B, 15, 17 + by, armRows(o, a)); else B.r(15, 17 + by, 2, 8, null);
    // head
    var hx = A.x0, hy0 = A.y0 + by;
    B.cur = 1; B.m(hx, hy0, A.head, P);
    // eye colour on the iris-free animals is handled in the maps; add a catch-light
    var E = A.eyes.map(function (e) { return [e[0], e[1] + by]; });
    if (PO.blink) E.forEach(function (e) {   // eyes shut: eye whites and pupils become skin, with a dark lid line along the bottom
      for (var yy = e[1] - 1; yy <= e[1]; yy++) for (var xx = e[0] - 1; xx <= e[0] + 1; xx++) { var c = B.get(xx, yy); if (c && (c[0] + c[1] + c[2] > 600 || c[0] + c[1] + c[2] < 150)) B.p(xx, yy, yy === e[1] ? P.d : P.b); }
    });
    // neck gear
    B.cur = 4; if (o.neck && NECKS[o.neck]) NECKS[o.neck](B, by);
    B.cur = 5; if (acc.necklace) { [[7, 17], [8, 18], [9, 19], [10, 20], [11, 20], [12, 19], [13, 18], [14, 17]].forEach(function (c, k) { B.p(c[0], c[1] + by, k % 2 ? "#a8740a" : "#f2c14e"); }); B.r(10, 21 + by, 2, 2, "#f2c14e"); B.p(10, 21 + by, "#fff4b0"); B.p(11, 22 + by, "#4ee6b4"); }
    // face gear
    B.cur = 6; if (o.face && FACES[o.face]) FACES[o.face](B, E, a);
    B.cur = 5; if (acc.bandana) { var mk = A.mask, mw = mk[1], mx = 11 - mw / 2, my = mk[0] + by; B.r(mx, my, mw, 2, "#d12f4a"); B.r(mx, my, mw, 1, "#ff7a7a"); B.r(mx, my + 1, mw, 1, "#a82240"); for (i = 1; i < mw; i += 3) B.p(mx + i, my + 1, "#ffffff"); B.r(mx + mw, my, 2, 2, "#d12f4a"); B.r(mx + mw, my + 2, 1, 2, "#a82240"); B.p(mx + mw, my, "#ff7a7a"); }
    if (acc.ring) { var rg = A.ring; B.p(rg[0], rg[1] + by, "#fff4b0"); B.p(rg[0], rg[1] + by + 1, "#f2c14e"); B.p(rg[0], rg[1] + by + 2, "#a8740a"); }
    // hat
    B.cur = 7; if (o.hat && HATS[o.hat]) HATS[o.hat](new ByBuf(B, by), A.hy, A.hw, hv);
    B.cur = 1; if (A.ears && o.hat) A.ears.cells.forEach(function (c) { B.p(c[0], c[1] + by, c[0] < 11 ? (c[0] === 7 ? P.b : P.n) : (c[0] === 13 ? P.n : P.b)); });
    if (OUTLINE) B.outline(OL);
    return B;
  }
  // hats are authored in absolute rows; ByBuf shifts them with the body bob
  function ByBuf(B, by) { this.B = B; this.by = by; }
  ["p", "r", "row", "m", "glow"].forEach(function (fn) {
    ByBuf.prototype[fn] = function () { var a = Array.prototype.slice.call(arguments); if (fn === "row") a[0] += this.by; else if (fn === "glow") a[1] += this.by; else a[1] += this.by; return this.B[fn].apply(this.B, a); };
  });

  // ---------- canvas side ----------
  function toCanvas(B, s) {
    var c = document.createElement("canvas"); c.width = B.w; c.height = B.h;
    var g = c.getContext("2d"), im = g.createImageData(B.w, B.h); im.data.set(B.d);
    // crisp 1px dark outline (inside the frame, around every opaque edge) so characters pop against any background
    var d = im.data, w = B.w, h = B.h, src = B.d, x, y, i, o = [];
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = (y * w + x) * 4 + 3; if (src[i] > 40) continue;
      if ((x > 0 && src[i - 4] > 200) || (x < w - 1 && src[i + 4] > 200) || (y > 0 && src[i - w * 4] > 200) || (y < h - 1 && src[i + w * 4] > 200)) o.push(i - 3);
    }
    if (OUTLINE) o.forEach(function (j) { d[j] = 12; d[j + 1] = 20; d[j + 2] = 16; d[j + 3] = 235; });
    g.putImageData(im, 0, 0);
    if (s <= 1) return c;
    var k = SMOOTH ? (s % 3 === 0 ? 3 : s % 2 === 0 ? 2 : 0) : 0, HB = k ? scaleK(B, k) : B, q = k ? s / k : s;   // Scale2x / Scale3x: rounder, cleaner edges, still crisp
    var c1 = c; if (k) { c1 = document.createElement("canvas"); c1.width = HB.w; c1.height = HB.h; var g1 = c1.getContext("2d"), im1 = g1.createImageData(HB.w, HB.h); im1.data.set(HB.d); g1.putImageData(im1, 0, 0); }
    var c2 = document.createElement("canvas"); c2.width = B.w * s; c2.height = B.h * s; var g2 = c2.getContext("2d"); g2.imageSmoothingEnabled = false; g2.drawImage(c1, 0, 0, c2.width, c2.height);
    lineArt(g2, HB, q, Math.max(1, Math.round(s * 0.24)));
    return c2;
  }
  // Thin line art over the scaled sprite: t = about a quarter of an art pixel (never less than 1 screen pixel).
  //   seam: where a piece of gear meets something else, a dark line is drawn just inside the piece on top (the higher layer);
  //   outline: a dark line just outside every solid edge of the figure.
  function lineArt(g, B, s, t) {
    var w = B.w, h = B.h, d = B.d, L = B.L, x, y, i, a, b; t = t || Math.max(1, Math.round(s * 0.24));
    var solid = function (xx, yy) { return xx >= 0 && yy >= 0 && xx < w && yy < h && d[(yy * w + xx) * 4 + 3] > 200; };
    g.fillStyle = "rgba(8,14,11,.5)";
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x; if (!solid(x, y)) continue; a = L[i];
      if (x + 1 < w && solid(x + 1, y)) { b = L[i + 1]; if (a !== b && (a > 1 || b > 1)) { if (a > b) g.fillRect((x + 1) * s - t, y * s, t, s); else g.fillRect((x + 1) * s, y * s, t, s); } }
      if (y + 1 < h && solid(x, y + 1)) { b = L[i + w]; if (a !== b && (a > 1 || b > 1)) { if (a > b) g.fillRect(x * s, (y + 1) * s - t, s, t); else g.fillRect(x * s, (y + 1) * s, s, t); } }
    }
    g.fillStyle = "rgba(6,12,9,.82)";
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      if (!solid(x, y)) continue;
      if (!solid(x - 1, y)) g.fillRect(x * s - t, y * s, t, s);
      if (!solid(x + 1, y)) g.fillRect((x + 1) * s, y * s, t, s);
      if (!solid(x, y - 1)) g.fillRect(x * s, y * s - t, s, t);
      if (!solid(x, y + 1)) g.fillRect(x * s, (y + 1) * s, s, t);
      if (!solid(x - 1, y - 1) && !solid(x - 1, y) && !solid(x, y - 1)) g.fillRect(x * s - t, y * s - t, t, t);
      if (!solid(x + 1, y - 1) && !solid(x + 1, y) && !solid(x, y - 1)) g.fillRect((x + 1) * s, y * s - t, t, t);
      if (!solid(x - 1, y + 1) && !solid(x - 1, y) && !solid(x, y + 1)) g.fillRect(x * s - t, (y + 1) * s, t, t);
      if (!solid(x + 1, y + 1) && !solid(x + 1, y) && !solid(x, y + 1)) g.fillRect((x + 1) * s, (y + 1) * s, t, t);
    }
  }
  var SMOOTH = true;
  function scaleK(B, k) {   // EPX / Scale2x and Scale3x on the colours (and the layer map), so diagonals and corners come out clean
    var w = B.w, h = B.h, d = B.d, L = B.L, W2 = w * k, H2 = h * k, o = new Buf(W2, H2, 0, 0), od = o.d, oL = o.L, x, y;
    var v = new Uint32Array(w * h); for (var i = 0; i < w * h; i++) v[i] = d[i * 4 + 3] < 8 ? 0 : ((d[i * 4] << 24) | (d[i * 4 + 1] << 16) | (d[i * 4 + 2] << 8) | d[i * 4 + 3]) >>> 0;
    var at = function (xx, yy) { return xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : v[yy * w + xx]; }, ix = function (xx, yy) { return xx < 0 || yy < 0 || xx >= w || yy >= h ? -1 : yy * w + xx; };
    var put = function (X, Y, si) { var j = Y * W2 + X; if (si < 0) return; od.set(d.subarray(si * 4, si * 4 + 4), j * 4); oL[j] = L[si]; };
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var P = y * w + x, A = at(x, y - 1), Bv = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1), iA = ix(x, y - 1), iB = ix(x + 1, y), iC = ix(x - 1, y), iD = ix(x, y + 1), X = x * k, Y = y * k;
      var pick = function (cond, val, idx) { return cond ? idx : P; };
      if (k === 2) {
        put(X, Y, C === A && C !== D && A !== Bv ? (A ? iA : -2) : P);
        put(X + 1, Y, A === Bv && A !== C && Bv !== D ? (Bv ? iB : -2) : P);
        put(X, Y + 1, D === C && D !== Bv && C !== A ? (C ? iC : -2) : P);
        put(X + 1, Y + 1, Bv === D && Bv !== A && D !== C ? (D ? iD : -2) : P);
      } else {
        var E = v[P], Av = at(x - 1, y - 1), Cv = at(x + 1, y - 1), Gv = at(x - 1, y + 1), Iv = at(x + 1, y + 1);
        var Bn = A, Dn = C, Fn = Bv, Hn = D, iBn = iA, iDn = iC, iFn = iB, iHn = iD;
        var tl = Dn === Bn && Dn !== Hn && Bn !== Fn ? iDn : P;
        var tm = (Dn === Bn && Dn !== Hn && Bn !== Fn && E !== Cv) || (Bn === Fn && Bn !== Dn && Fn !== Hn && E !== Av) ? iBn : P;
        var tr = Bn === Fn && Bn !== Dn && Fn !== Hn ? iFn : P;
        var ml = (Hn === Dn && Hn !== Fn && Dn !== Bn && E !== Av) || (Dn === Bn && Dn !== Hn && Bn !== Fn && E !== Gv) ? iDn : P;
        var mr = (Bn === Fn && Bn !== Dn && Fn !== Hn && E !== Iv) || (Fn === Hn && Fn !== Bn && Hn !== Dn && E !== Cv) ? iFn : P;
        var bl = Hn === Dn && Hn !== Fn && Dn !== Bn ? iDn : P;
        var bm = (Fn === Hn && Fn !== Bn && Hn !== Dn && E !== Gv) || (Hn === Dn && Hn !== Fn && Dn !== Bn && E !== Iv) ? iHn : P;
        var br = Fn === Hn && Fn !== Bn && Hn !== Dn ? iHn : P;
        [[tl, 0, 0], [tm, 1, 0], [tr, 2, 0], [ml, 0, 1], [P, 1, 1], [mr, 2, 1], [bl, 0, 2], [bm, 1, 2], [br, 2, 2]].forEach(function (c) { var si = c[0]; if (si !== P && si >= 0 && v[si] === 0) si = -2; put(X + c[1], Y + c[2], si); });
      }
    }
    return o;
  }
  function okey(o) { var h = o.hat ? (o.hv && o.hv[o.hat]) || "" : ""; var a = o.acc || {}; return [o.animal, o.hat, o.face, o.neck, o.shirt, o.shoes, h, a.ring ? 1 : 0, a.necklace ? 1 : 0, a.bandana ? 1 : 0, o.arm || 0].join("|"); }
  var CACHE = {};
  function sprite(o, animal, s) {
    o = Object.assign({}, o, { animal: AN[animal] ? animal : "frog" }); s = Math.max(1, s | 0);
    var key = okey(o) + "@" + s; if (CACHE[key]) return CACHE[key];
    var frames = {}, arm = toCanvas(armBuf(o, o.animal), s);
    var S = {
      s: s, fw: FW * s, fh: FH * s, footY: (OY + 31) * s, arm: arm, armPivot: [2 * s, 1.5 * s], armLen: 6.9 * s,
      frame: function (pose) { pose = POSE[pose] ? pose : "idle0"; return frames[pose] || (frames[pose] = toCanvas(drawFrame(o, pose, false), s)); },
      bobOf: function (pose) { return (POSE[pose] || POSE.idle0).by * s; },
      shoulder: function (pose) { return [16 * s, (OY + 17.5 + (POSE[pose] || POSE.idle0).by) * s]; }
    };
    var n = 0; for (var k in CACHE) n++; if (n > 24) CACHE = {};
    return (CACHE[key] = S);
  }
  function full(o, animal, s, pose) { o = Object.assign({}, o, { animal: AN[animal] ? animal : "frog" }); return toCanvas(drawFrame(o, pose || "idle0", true), Math.max(1, s | 0)); }   // the whole figure with both arms (the backpack screen)
  function thumb(o, animal, s) { o = Object.assign({}, o, { animal: AN[animal] ? animal : "frog" }); return toCanvas(drawFrame(o, "idle0", true), s || 3).toDataURL(); }

  var api = { people: PEOPLE, sprite: sprite, thumb: thumb, full: full, animals: Object.keys(AN), poses: Object.keys(POSE), _draw: drawFrame, _AN: AN, FW: FW, FH: FH };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  return api;
})();
