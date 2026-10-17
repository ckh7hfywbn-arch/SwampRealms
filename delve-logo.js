// ===== SwampRealms: Delve wordmark =====
// "DELVE" set in Bagel Fat One (the site's own display font, the one in the SwampRealms logo and the World Map title), dressed up as
// something dug out of the swamp: a dirt-textured face with a bevel, a deep dark extrusion, pixel grass growing on every top edge with
// moss drips, and glowing ore veins. "SwampRealms" sits above it in gold, like the site logo.
// The font is self-hosted (fonts/bagel-fat-one-latin.woff, SIL Open Font License, see fonts/BagelFatOne-OFL.txt) so the logo never
// depends on Google Fonts loading. Until it has loaded, draw() uses the fallback and DelveLogo.onReady() callbacks redraw.
//   DelveLogo.draw(canvas, { b: 12, sub: true, t: performance.now() })   b = scale unit in CSS px (the logo is about 38b wide)
//   DelveLogo.onReady(fn)   fn runs once the font is ready (right away if it already is)
var DelveLogo = (function () {
  var FAM = '"DelveBagel","Bagel Fat One",Nunito,system-ui,sans-serif', ready = false, waiters = [], cache = {};
  var WORD = "DELVE", SUB = "SwampRealms", PAD = 2;
  try {
    var src = (document.currentScript && document.currentScript.src) || "", base = src ? src.replace(/[^\/]*$/, "") : "";
    var ff = new FontFace("DelveBagel", "url(" + base + "fonts/bagel-fat-one-latin.woff) format(\"woff\")");
    ff.load().then(function (f) { document.fonts.add(f); ready = true; cache = {}; var w = waiters; waiters = []; w.forEach(function (fn) { try { fn(); } catch (e) {} }); }, function () { ready = true; waiters.forEach(function (fn) { try { fn(); } catch (e) {} }); waiters = []; });
  } catch (e) { ready = true; }
  function onReady(fn) { if (ready) fn(); else waiters.push(fn); }
  function hash(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function mk(w, h) { var c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function tint(src, col) { var c = mk(src.width, src.height), g = c.getContext("2d"); g.drawImage(src, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height); return c; }

  // Everything that does not move is drawn once per size into a bitmap; only the ore glow is redrawn each frame.
  function build(b, k, sub) {   // b: unit in CSS px, k: device pixel ratio
    var u = b * k, F = Math.round(u * 9.6), Fs = Math.round(u * 3.3), M = mk(4, 4).getContext("2d");
    M.font = F + "px " + FAM; var mm = M.measureText(WORD), tw = Math.ceil(mm.width), asc = Math.ceil(mm.actualBoundingBoxAscent || F * 0.72), dsc = Math.ceil(mm.actualBoundingBoxDescent || F * 0.02);
    M.font = Fs + "px " + FAM; var sm = M.measureText(SUB), sw = Math.ceil(sm.width), sasc = Math.ceil(sm.actualBoundingBoxAscent || Fs * 0.75), sdsc = Math.ceil(sm.actualBoundingBoxDescent || Fs * 0.2);
    var pad = PAD * u, depth = Math.round(u * 0.75), ol = Math.max(2, Math.round(u * 0.42)), subH = sub ? sasc + sdsc + u * 0.9 : 0;
    var W = Math.max(tw, sw) + pad * 2 + ol * 2, H = pad + subH + asc + dsc + depth + ol * 2 + pad;
    var out = mk(W, H), g = out.getContext("2d");
    var x0 = Math.round((W - tw) / 2), base = Math.round(pad + subH + ol + asc);
    // the letter shapes
    var mask = mk(W, H), mg = mask.getContext("2d"); mg.font = F + "px " + FAM; mg.textBaseline = "alphabetic"; mg.fillStyle = "#fff"; mg.fillText(WORD, x0, base);
    var ring = mk(W, H), rg = ring.getContext("2d"); rg.font = F + "px " + FAM; rg.lineJoin = "round"; rg.lineWidth = ol * 2; rg.strokeStyle = "#fff"; rg.fillStyle = "#fff"; rg.strokeText(WORD, x0, base); rg.fillText(WORD, x0, base);
    // 1. soft shadow, dark outline and the deep extrusion underneath
    g.globalAlpha = 0.45; g.drawImage(tint(ring, "#000"), Math.round(u * 0.25), depth + Math.round(u * 0.55)); g.globalAlpha = 1;
    var ringD = tint(ring, "#08110c"); for (var i = depth; i >= 0; i -= Math.max(1, Math.floor(depth / 6))) g.drawImage(ringD, 0, i); g.drawImage(ringD, 0, 0);
    var ext = tint(mask, "#22162c"); for (i = depth; i >= 1; i--) g.drawImage(ext, 0, i);
    g.drawImage(tint(mask, "#170e1f"), 0, depth);
    // 2. the dirt face: a top-to-bottom gradient, chunky specks and a few strata lines (all in the game's pixel size)
    var face = mk(W, H), fg = face.getContext("2d"), top = base - asc, bot = base + dsc;
    var gr = fg.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, "#7a6390"); gr.addColorStop(0.55, "#5b4770"); gr.addColorStop(1, "#3f3052"); fg.fillStyle = gr; fg.fillRect(0, 0, W, H);
    var p = Math.max(2, Math.round(u / 3)), cx, cy;
    for (cy = Math.floor(top / p); cy * p < bot; cy++) for (cx = Math.floor(x0 / p); cx * p < x0 + tw; cx++) {
      var r = hash(cx, cy);
      if (r < 0.1) { fg.fillStyle = "rgba(20,10,30,.28)"; fg.fillRect(cx * p, cy * p, p, p); }
      else if (r > 0.95) { fg.fillStyle = "rgba(255,235,220,.10)"; fg.fillRect(cx * p, cy * p, p, p); }
    }
    fg.fillStyle = "rgba(20,10,30,.18)"; [0.58, 0.8].forEach(function (f) { var y = Math.round((top + (bot - top) * f) / p) * p; for (var x = x0; x < x0 + tw; x += p) if (hash(x / p | 0, y) > 0.3) fg.fillRect(x, y, p, Math.max(1, p / 2)); });
    // 3. bevel: light along the top edges, shade along the bottom edges
    var hl = mk(W, H), hg = hl.getContext("2d"); hg.drawImage(mask, 0, 0); hg.globalCompositeOperation = "destination-out"; hg.drawImage(mask, 0, Math.round(u * 0.5));
    fg.globalAlpha = 0.22; fg.drawImage(tint(hl, "#fff"), 0, 0); fg.globalAlpha = 1;
    var sh = mk(W, H), shg = sh.getContext("2d"); shg.drawImage(mask, 0, 0); shg.globalCompositeOperation = "destination-out"; shg.drawImage(mask, 0, -Math.round(u * 0.55));
    fg.globalAlpha = 0.35; fg.drawImage(tint(sh, "#120a1a"), 0, 0); fg.globalAlpha = 1;
    // 4. grass on every top surface, in pixel cells, with moss drips hanging down
    var md = mg.getImageData(0, 0, W, H).data, cols = Math.ceil(W / p), rows = Math.ceil(H / p);
    var on = function (c, rr) { if (c < 0 || rr < 0 || c >= cols || rr >= rows) return false; var x = Math.min(W - 1, c * p + (p >> 1)), y = Math.min(H - 1, rr * p + (p >> 1)); return md[(y * W + x) * 4 + 3] > 140; };
    var tufts = [];
    var capY = Math.floor((top + (bot - top) * 0.3) / p);   // grass only grows on the tops of the letters, not on the bars and curves inside them
    for (cx = 0; cx < cols; cx++) for (cy = 1; cy < rows; cy++) {
      if (!on(cx, cy)) continue;
      if (on(cx, cy - 1) || cy > capY) break;
      var gh = 2 + (hash(cx, 77) > 0.45 ? 1 : 0);
      for (var j = 0; j < gh; j++) if (on(cx, cy + j)) { fg.fillStyle = j === 0 ? "#6fe08a" : j === 1 ? "#3fbf63" : "#2a8a48"; fg.fillRect(cx * p, (cy + j) * p, p, p); }
      if (hash(cx, cy) > 0.88) { var dl = 2 + Math.floor(hash(cy, cx) * 4); for (j = gh; j < gh + dl; j++) if (on(cx, cy + j)) { fg.fillStyle = j === gh + dl - 1 ? "#6fe08a" : "#2a8a48"; fg.fillRect(cx * p, (cy + j) * p, p, p); } }
      if (hash(cx * 3, cy) > 0.7) tufts.push([cx, cy - 1, hash(cx, cy * 5) > 0.7 ? 2 : 1]);
    }
    // 5. ore veins: one or two per letter, deep inside the stroke
    var ores = [], ORE = ["#f2c14e", "#4ee6b4", "#ff6b82", "#7fd6ff", "#4ee6b4", "#f2c14e", "#b98cff"], bins = 7;
    for (var bi = 0; bi < bins; bi++) {
      var best = null, bs = -1;
      for (var tries = 0; tries < 60; tries++) {
        var ox = Math.floor(((bi + hash(bi, tries)) / bins) * tw / p) + Math.floor(x0 / p), oy = Math.floor((top + (bot - top) * (0.3 + hash(tries, bi) * 0.55)) / p);
        var ok = true; for (var dx = -1; dx <= 3 && ok; dx++) for (var dy = -1; dy <= 3 && ok; dy++) if (!on(ox + dx, oy + dy)) ok = false;
        if (ok) { var sc = hash(ox, oy); if (sc > bs) { bs = sc; best = [ox, oy]; } }
      }
      if (best) ores.push({ x: best[0] * p, y: best[1] * p, c: ORE[bi % ORE.length], p: p });
    }
    var ORESHAPE = [[0, 0], [1, 0], [1, 1], [2, 1], [-1, 1], [0, 2], [2, -1]];
    ores.forEach(function (o) { fg.fillStyle = o.c; ORESHAPE.forEach(function (q) { fg.fillRect(o.x + q[0] * p, o.y + q[1] * p, p, p); }); fg.fillStyle = "rgba(255,255,255,.75)"; fg.fillRect(o.x, o.y, p, p); });
    fg.globalCompositeOperation = "destination-in"; fg.drawImage(mask, 0, 0);
    g.drawImage(face, 0, 0);
    // grass tufts poking up above the letters (outlined so they read on any background)
    tufts.forEach(function (t) { var tx = t[0] * p, ty = t[1] * p - (t[2] - 1) * p; g.fillStyle = "#08110c"; g.fillRect(tx - 1, ty - 1, p + 2, t[2] * p + 1); g.fillStyle = "#6fe08a"; g.fillRect(tx, ty, p, t[2] * p); });
    // 6. "SwampRealms" in gold above, like the site logo: dark outline, a little depth, a warm gradient
    if (sub) {
      var sx = Math.round((W - sw) / 2), sb = Math.round(pad + sasc), so = Math.max(2, Math.round(Fs * 0.17)), sd = Math.max(1, Math.round(u * 0.28));
      g.font = Fs + "px " + FAM; g.textBaseline = "alphabetic"; g.lineJoin = "round";
      g.lineWidth = so * 2; g.strokeStyle = "#2a1803"; for (i = sd; i >= 0; i--) g.strokeText(SUB, sx, sb + i);
      g.fillStyle = "#b8780f"; for (i = sd; i >= 1; i--) g.fillText(SUB, sx, sb + i);
      var sg = g.createLinearGradient(0, sb - sasc, 0, sb + sdsc); sg.addColorStop(0, "#ffe7a0"); sg.addColorStop(0.5, "#f6c344"); sg.addColorStop(1, "#e9a62a"); g.fillStyle = sg; g.fillText(SUB, sx, sb);
    }
    return { cv: out, w: W / k, h: H / k, ores: ores, k: k };
  }
  function size(b, sub) { var B = get(b, 1, sub !== false); return { w: B.w, h: B.h }; }
  function get(b, k, sub) { var key = b + "|" + k + "|" + (sub ? 1 : 0) + "|" + (ready ? 1 : 0); if (!cache[key]) cache[key] = build(b, k, sub); return cache[key]; }
  function draw(cv, o) {
    o = o || {}; var b = o.b || 12, sub = o.sub !== false, t = o.t || 0, k = Math.min(3, o.dpr || window.devicePixelRatio || 1);
    var B = get(b, k, sub);
    if (cv.width !== B.cv.width || cv.height !== B.cv.height) { cv.width = B.cv.width; cv.height = B.cv.height; }
    cv.style.width = B.w + "px"; cv.style.height = B.h + "px";
    var g = cv.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.drawImage(B.cv, 0, 0);
    // ore glow, gently pulsing when t is given
    g.save(); g.globalCompositeOperation = "lighter";
    B.ores.forEach(function (O, n) {
      var pu = t ? 0.55 + 0.45 * Math.sin(t / 650 + n * 1.9) : 0.8, r = O.p * 4.2, cx = O.x + O.p, cy = O.y + O.p;
      var rg = g.createRadialGradient(cx, cy, 0, cx, cy, r); rg.addColorStop(0, O.c); rg.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = 0.32 * pu; g.fillStyle = rg; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    });
    g.restore();
    return { w: B.w, h: B.h };
  }
  return { draw: draw, size: size, onReady: onReady, get ready() { return ready; } };
})();
