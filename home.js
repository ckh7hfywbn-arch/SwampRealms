// SwampRealms home: the Delve hero. Draws the DELVE wordmark (glowing ore), fireflies and rain over the cover, the odd lightning flash,
// and turns "Play Delve" into "Continue" when this device already has a Delve world.
(function () {
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // ---- Continue: any saved world on this device (guest or signed in) ----
  try {
    var best = null;
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf("swamp-delve-worlds:") !== 0) continue; var ix = JSON.parse(localStorage.getItem(k) || "null"); if (!ix || !Array.isArray(ix.list) || !ix.list.length) continue; var w = ix.list.filter(function (q) { return q.id === ix.last; })[0] || ix.list[0]; if (!best || (w.played || 0) > (best.played || 0)) best = w; }
    if (best) { document.getElementById("dhPlayT").textContent = "Continue"; document.getElementById("dhPlayS").textContent = (best.n || best.name || "Your world").slice(0, 28) + " · jump back in"; document.querySelectorAll(".dhPlayT2").forEach(function (e) { e.textContent = "Continue"; }); }
  } catch (e) {}
  // ---- the wordmark ----
  var lg = document.getElementById("dhLogo"), lgB = 0;
  function logoSize() { var w = Math.min(window.innerWidth, 1180), b = Math.max(6, Math.min(16, Math.floor((window.innerWidth > 700 ? Math.min(w * 0.5, 620) : w - 40) / 38))); return b; }
  function drawLogo(t) { if (!lg || typeof DelveLogo === "undefined") return; try { DelveLogo.draw(lg, { b: lgB || (lgB = logoSize()), t: reduce ? 0 : t, dpr: Math.min(2, window.devicePixelRatio || 1) }); } catch (e) {} }
  if (typeof DelveLogo !== "undefined") DelveLogo.onReady(function () { drawLogo(performance.now()); });
  addEventListener("resize", function () { lgB = logoSize(); drawLogo(performance.now()); size(); });
  // ---- fireflies and rain ----
  var cv = document.getElementById("dhFx"), g = cv && cv.getContext("2d"), W = 0, H = 0, F = [], R = [], hero = document.getElementById("top"), vis = true;
  function size() { if (!cv) return; var d = Math.min(2, window.devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = Math.round(W * d); cv.height = Math.round(H * d); g.setTransform(d, 0, 0, d, 0, 0);
    var nF = Math.round(Math.min(34, W * H / 26000)), nR = Math.round(Math.min(140, W * H / 9000)); F = []; R = [];
    for (var i = 0; i < nF; i++) F.push({ x: Math.random() * W, y: H * (0.15 + Math.random() * 0.6), a: Math.random() * 6.28, s: 0.2 + Math.random() * 0.5, r: 1.4 + Math.random() * 1.8, p: Math.random() * 6.28 });
    for (i = 0; i < nR; i++) R.push({ x: Math.random() * W, y: Math.random() * H, v: 520 + Math.random() * 380, l: 10 + Math.random() * 14 }); }
  size();
  if ("IntersectionObserver" in window && hero) new IntersectionObserver(function (es) { vis = es[0].isIntersecting; }, { threshold: 0 }).observe(hero);
  var last = 0, nextFlash = 5000 + Math.random() * 6000, fl = document.getElementById("dhFlash");
  function frame(now) {
    requestAnimationFrame(frame); if (!vis || document.hidden) { last = now; return; }
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now; drawLogo(now); if (!g) return;
    g.clearRect(0, 0, W, H);
    if (!reduce) { g.strokeStyle = "rgba(190,215,255,.22)"; g.lineWidth = 1; g.beginPath(); R.forEach(function (d) { d.y += d.v * dt; d.x -= d.v * dt * 0.12; if (d.y > H) { d.y = -d.l; d.x = Math.random() * W * 1.1; } g.moveTo(d.x, d.y); g.lineTo(d.x + d.l * 0.12, d.y - d.l); }); g.stroke(); }
    F.forEach(function (f) { if (!reduce) { f.a += (Math.random() - 0.5) * 0.4; f.x += Math.cos(f.a) * f.s * 22 * dt; f.y += Math.sin(f.a) * f.s * 14 * dt; if (f.x < -10) f.x = W + 10; if (f.x > W + 10) f.x = -10; if (f.y < H * 0.08) f.a = 1.57; if (f.y > H * 0.8) f.a = -1.57; }
      var on = 0.45 + 0.55 * Math.max(0, Math.sin(now / 900 + f.p)), rr = f.r * 7, gr = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, rr);
      gr.addColorStop(0, "rgba(230,255,150," + (0.55 * on).toFixed(3) + ")"); gr.addColorStop(1, "rgba(200,255,120,0)"); g.fillStyle = gr; g.fillRect(f.x - rr, f.y - rr, rr * 2, rr * 2);
      g.fillStyle = "rgba(250,255,210," + (0.9 * on).toFixed(3) + ")"; g.beginPath(); g.arc(f.x, f.y, f.r * 0.6, 0, 6.283); g.fill(); });
    if (!reduce && fl) { nextFlash -= dt * 1000; if (nextFlash <= 0) { fl.classList.remove("on"); void fl.offsetWidth; fl.classList.add("on"); nextFlash = 9000 + Math.random() * 12000; } }
  }
  requestAnimationFrame(frame);
})();
