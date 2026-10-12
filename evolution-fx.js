// ===== SwampRealms: Evolution — visual effects (Stage 4) =====
// Load BEFORE evolution.js. One global, EvoFX. No game rules in here: evolution.js passes in everything it needs.
//   EvoFX.atmo.start(sceneEl, biomeId)   live canvas particles (pollen, embers, snow) + shooting stars + ripples
//   EvoFX.atmo.set(biomeId)              change the weather when you travel
//   EvoFX.atmo.burst(x, y, color, n)     confetti burst, x/y are 0-1 of the scene
//   EvoFX.cine(stageEl, opts)            full-screen celebration card (evolve, hatch, new realm, daily gift, welcome back)
//   EvoFX.iris(sceneEl, color, midFn)    circular wipe used when travelling between realms
//   EvoFX.zone(sceneEl, name, tag, color) zone title that slides in after arriving
//   EvoFX.biomeSVG(id, o)                scene art for the Ember Bog and Frostfen
//   EvoFX.count(el, to, ms)              number count-up
var EvoFX = (function () {
  "use strict";
  var reduce = function () { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };

  // ---------- ATMOSPHERE (one canvas over the scene art) ----------
  var A = { cv: null, cx: null, sc: null, bio: "swamp", ps: [], bursts: [], raf: 0, last: 0, w: 0, h: 0, dpr: 1, star: null, nextStar: 0, ripples: [], nextRip: 0 };
  var KIND = {   // per-realm particle recipe: count, and how a particle is made
    swamp: { n: 34 }, ember: { n: 46 }, frost: { n: 56 }
  };
  function mk(bio, init) {
    var w = A.w, h = A.h, p = { x: rnd(0, w), y: init ? rnd(0, h) : h + 10, ph: rnd(0, 6.28) };
    if (bio === "ember") {
      var ash = Math.random() < 0.3;
      p.t = ash ? "ash" : "ember"; p.r = ash ? rnd(1, 2.2) : rnd(0.8, 2.4); p.vy = ash ? rnd(-6, 4) : -rnd(14, 38); p.vx = rnd(-8, 12); p.life = 1; p.sp = rnd(0.6, 1.6);
      if (ash) p.y = init ? rnd(0, h) : -8;
    } else if (bio === "frost") {
      var big = Math.random() < 0.25;
      p.t = "snow"; p.r = big ? rnd(2, 3.2) : rnd(0.8, 1.8); p.vy = (big ? 22 : 12) + rnd(0, 12); p.vx = rnd(-5, 7); p.sp = rnd(0.5, 1.4);
      p.y = init ? rnd(0, h) : -6;
    } else {
      p.t = "mote"; p.r = rnd(0.9, 2.6); p.vy = -rnd(4, 14); p.vx = rnd(-4, 5); p.sp = rnd(0.5, 1.5); p.hue = Math.random() < 0.3 ? "#f4ffb0" : "#8ef7d6";
      p.y = init ? rnd(h * 0.35, h) : h * rnd(0.7, 1);
    }
    return p;
  }
  function fill() {
    var n = Math.round((KIND[A.bio] || KIND.swamp).n * Math.min(1, (A.w * A.h) / (400 * 340))); n = Math.max(14, n);
    A.ps = []; for (var i = 0; i < n; i++) A.ps.push(mk(A.bio, true));
  }
  function size() {
    if (!A.cv || !A.sc) return;
    var r = A.sc.getBoundingClientRect(); if (!r.width) return;
    A.dpr = Math.min(2, window.devicePixelRatio || 1); A.w = r.width; A.h = r.height;
    A.cv.width = Math.round(r.width * A.dpr); A.cv.height = Math.round(r.height * A.dpr);
    A.cx.setTransform(A.dpr, 0, 0, A.dpr, 0, 0); fill();
  }
  function night() { return A.sc && A.sc.getAttribute("data-ph") === "night"; }
  function drawGlow(x, y, r, col, a) {
    var c = A.cx; c.globalAlpha = a; c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
  }
  function frame(ts) {
    A.raf = requestAnimationFrame(frame);
    if (document.hidden || !A.cx) return;
    var dt = Math.min(0.05, (ts - (A.last || ts)) / 1000); A.last = ts;
    var c = A.cx, w = A.w, h = A.h; c.clearRect(0, 0, w, h);
    var nt = night(), t = ts / 1000;
    c.globalCompositeOperation = "lighter";
    for (var i = 0; i < A.ps.length; i++) {
      var p = A.ps[i]; p.ph += dt * p.sp * 2;
      p.x += (p.vx + Math.sin(p.ph) * (p.t === "snow" ? 9 : 7)) * dt; p.y += p.vy * dt;
      if (p.t === "ember") { p.life -= dt * 0.18 * p.sp; if (p.life <= 0 || p.y < -8) { A.ps[i] = mk(A.bio, false); continue; } var f = 0.55 + 0.45 * Math.sin(p.ph * 3);
        drawGlow(p.x, p.y, p.r * 3.2, "#ff6a1a", 0.12 * p.life * f); drawGlow(p.x, p.y, p.r, "#ffc46b", 0.9 * p.life * f); }
      else if (p.t === "ash") { if (p.y > h + 8) { A.ps[i] = mk(A.bio, false); continue; } drawGlow(p.x, p.y, p.r, "#cdbfb5", 0.28); }
      else if (p.t === "snow") { if (p.y > h + 8) { A.ps[i] = mk(A.bio, false); continue; } drawGlow(p.x, p.y, p.r * 2.4, "#bfeaff", 0.07); drawGlow(p.x, p.y, p.r, "#ffffff", 0.85); }
      else { if (p.y < -8) { A.ps[i] = mk(A.bio, false); continue; } var tw = 0.5 + 0.5 * Math.sin(p.ph * 2.2), k = nt ? 1.5 : 0.8;
        drawGlow(p.x, p.y, p.r * 3.6, p.hue, 0.1 * tw * k); drawGlow(p.x, p.y, p.r, p.hue, Math.min(1, 0.7 * tw * k)); }
      if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
    }
    // confetti bursts
    for (var b = A.bursts.length - 1; b >= 0; b--) {
      var q = A.bursts[b]; q.life -= dt * 1.15; if (q.life <= 0) { A.bursts.splice(b, 1); continue; }
      q.vy += 260 * dt; q.vx *= (1 - dt * 1.4); q.x += q.vx * dt; q.y += q.vy * dt;
      drawGlow(q.x, q.y, q.r * 2.6, q.c, 0.14 * q.life); drawGlow(q.x, q.y, q.r, q.c, Math.min(1, q.life * 1.3));
    }
    c.globalCompositeOperation = "source-over";
    // shooting star (night, swamp and frost only)
    if (nt && A.bio !== "ember" && !reduce()) {
      if (!A.star && t > A.nextStar) { A.star = { x: rnd(w * 0.3, w * 0.95), y: rnd(h * 0.04, h * 0.22), l: 0, vx: -rnd(190, 260), vy: rnd(60, 100) }; A.nextStar = t + rnd(9, 22); }
    }
    if (A.star) {
      var s = A.star; s.l += dt; s.x += s.vx * dt; s.y += s.vy * dt;
      var g = c.createLinearGradient(s.x, s.y, s.x - s.vx * 0.22, s.y - s.vy * 0.22); g.addColorStop(0, "rgba(255,255,255,.95)"); g.addColorStop(1, "rgba(255,255,255,0)");
      c.strokeStyle = g; c.lineWidth = 1.6; c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - s.vx * 0.22, s.y - s.vy * 0.22); c.stroke();
      if (s.l > 1.1) A.star = null;
    }
    // water ripples (swamp and frost water only)
    if (A.bio !== "ember" && !reduce() && t > A.nextRip) { A.ripples.push({ x: rnd(w * 0.08, w * 0.92), y: rnd(h * 0.62, h * 0.94), r: 2, a: 0.5 }); A.nextRip = t + rnd(0.9, 2.2); }
    for (var k = A.ripples.length - 1; k >= 0; k--) {
      var rp = A.ripples[k]; rp.r += dt * 16; rp.a -= dt * 0.28; if (rp.a <= 0) { A.ripples.splice(k, 1); continue; }
      c.strokeStyle = A.bio === "frost" ? "rgba(190,235,255," + rp.a + ")" : "rgba(130,255,215," + rp.a + ")"; c.lineWidth = 1;
      c.beginPath(); c.ellipse(rp.x, rp.y, rp.r, rp.r * 0.3, 0, 0, 6.283); c.stroke();
    }
  }
  var atmo = {
    start: function (sc, bio) {
      A.sc = sc; A.bio = bio || "swamp";
      if (!A.cv) {
        A.cv = document.createElement("canvas"); A.cv.className = "evo-fx"; A.cv.setAttribute("aria-hidden", "true");
        A.cx = A.cv.getContext("2d"); sc.insertBefore(A.cv, sc.children[1] || null);
        addEventListener("resize", size); if (window.ResizeObserver) new ResizeObserver(size).observe(sc);
      }
      size();
      if (reduce()) { frame(performance.now()); cancelAnimationFrame(A.raf); A.raf = 0; return; }   // one still frame, no loop
      if (!A.raf) A.raf = requestAnimationFrame(frame);
    },
    set: function (bio) { A.bio = bio; A.star = null; A.ripples = []; fill(); if (reduce() && A.cx) { A.cx.clearRect(0, 0, A.w, A.h); A.last = 0; frame(performance.now()); cancelAnimationFrame(A.raf); A.raf = 0; } },
    burst: function (x, y, color, n) {
      if (!A.cx || reduce()) return; n = n || 26;
      var cols = color ? [color, "#fff3b0", "#ffffff"] : ["#ffd978", "#8ef7d6", "#ffffff", "#f2c14e"];
      for (var i = 0; i < n; i++) { var a = rnd(0, 6.283), v = rnd(40, 150); A.bursts.push({ x: x * A.w, y: y * A.h, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 70, r: rnd(1.4, 3), c: cols[i % cols.length], life: rnd(0.7, 1.2) }); }
      if (A.bursts.length > 160) A.bursts.splice(0, A.bursts.length - 160);
    }
  };

  // ---------- CINEMATIC CARD ----------
  var cur = null;
  function closeCine(cb) {
    if (!cur) return; var el = cur, done = el._done; cur = null; el.classList.add("out");
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, reduce() ? 10 : 380);
    if (done) done(cb);
  }
  // o: kind (evolve|hatch|realm|gift|back), color, art (html), kicker, title, sub, lines [html], btn, btn2, onGo(), onAlt(), sound()
  function cine(stage, o) {
    if (cur) closeCine();
    var el = document.createElement("div"); el.className = "evo-cine k-" + (o.kind || "evolve") + (reduce() ? " calm" : ""); el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", o.title || "Celebration");
    el.style.setProperty("--cc", o.color || "#f2c14e");
    var rays = '<i class="cn-rays"></i><i class="cn-rays r2"></i><i class="cn-ring"></i><i class="cn-ring r2"></i><i class="cn-flash"></i>';
    var dots = ""; for (var i = 0; i < 18; i++) dots += '<i class="cn-dot" style="--a:' + (i * 20) + 'deg;--d:' + Math.round(rnd(90, 190)) + 'px;--s:' + rnd(3, 7).toFixed(1) + 'px;--w:' + (0.9 + (i % 6) * 0.07).toFixed(2) + 's"></i>';
    var art = o.kind === "hatch"
      ? '<div class="cn-egg"><svg viewBox="0 0 60 76" aria-hidden="true"><defs><linearGradient id="cnE" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffdf0"/><stop offset="1" stop-color="#cfd8b8"/></linearGradient></defs><ellipse cx="30" cy="40" rx="24" ry="32" fill="url(#cnE)"/><circle cx="20" cy="28" r="4" fill="#4ee6b4" opacity=".7"/><circle cx="40" cy="44" r="5" fill="#4ee6b4" opacity=".6"/><circle cx="26" cy="54" r="3" fill="#f2c14e" opacity=".8"/><path class="cn-crack" d="M10 38l9-6 7 7 8-8 9 8 7-5" fill="none" stroke="#6b5a2a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="cn-art cn-pop">' + (o.art || "") + '</div>'
      : '<div class="cn-art">' + (o.art || "") + '</div>';
    el.innerHTML = rays + '<div class="cn-dots" aria-hidden="true">' + dots + '</div><div class="cn-body">' + art +
      (o.kicker ? '<p class="cn-kicker">' + esc(o.kicker) + '</p>' : "") + '<h2 class="cn-title">' + esc(o.title || "") + '</h2>' + (o.sub ? '<p class="cn-sub">' + o.sub + '</p>' : "") +
      (o.lines && o.lines.length ? '<ul class="cn-lines">' + o.lines.map(function (l, i) { return '<li style="--i:' + i + '">' + l + '</li>'; }).join("") + '</ul>' : "") +
      '<div class="cn-btns"><button type="button" class="btn cn-go" data-cn="go">' + esc(o.btn || "Awesome!") + '</button>' + (o.btn2 ? '<button type="button" class="btn ghost" data-cn="alt">' + esc(o.btn2) + '</button>' : "") + '</div></div>';
    var born = Date.now();
    el._done = function () {};
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cn]"); if (!b) return;
      if (Date.now() - born < 450) return;   // so a double tap on the previous button can't skip it
      var which = b.getAttribute("data-cn"); closeCine(); if (which === "go" && o.onGo) o.onGo(); if (which === "alt" && o.onAlt) o.onAlt();
    });
    stage.appendChild(el); cur = el;
    try { if (o.sound) o.sound(); } catch (e) {}
    var f = el.querySelector(".cn-go"); if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) {} }, 500);
    return el;
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && cur) { var b = cur.querySelector("[data-cn=alt]") || cur.querySelector("[data-cn=go]"); if (b) b.click(); } });

  // ---------- TRAVEL WIPE + ZONE TITLE ----------
  function iris(sc, color, mid) {
    if (reduce()) { mid(); return; }
    var el = document.createElement("div"); el.className = "evo-iris"; el.style.setProperty("--ic", color || "#4ee6b4"); sc.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("in"); });
    setTimeout(function () { try { mid(); } catch (e) {} el.classList.remove("in"); el.classList.add("out"); }, 620);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1400);
  }
  function zone(sc, name, tag, color) {
    var el = document.createElement("div"); el.className = "evo-zone"; el.style.setProperty("--ic", color || "#4ee6b4");
    el.innerHTML = '<small>' + esc(tag || "") + '</small><b>' + esc(name) + '</b><i></i>'; sc.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, reduce() ? 1800 : 3400);
  }
  function count(el, to, ms) {
    if (!el) return; to = Math.round(to); if (reduce() || to < 2) { el.textContent = to.toLocaleString("en-US"); return; }
    var t0 = performance.now(); ms = ms || 1100;
    (function step(now) { var k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e).toLocaleString("en-US"); if (k < 1 && el.isConnected) requestAnimationFrame(step); })(t0);
  }

  // ---------- BIOME ART (400x340, same layout rules as the swamp: the ground starts about y=200) ----------
  function defs(id) {
    return '<defs>' +
      '<linearGradient id="' + id + 'Lava" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb347"/><stop offset=".5" stop-color="#ff5a1f"/><stop offset="1" stop-color="#7a1608"/></linearGradient>' +
      '<radialGradient id="' + id + 'Glow"><stop offset="0" stop-color="#ffb347" stop-opacity=".9"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + id + 'Ice"><stop offset="0" stop-color="#d6f6ff" stop-opacity=".95"/><stop offset="1" stop-color="#7fd6ff" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + id + 'Pink"><stop offset="0" stop-color="#ffd0f7" stop-opacity=".95"/><stop offset="1" stop-color="#c58bff" stop-opacity="0"/></radialGradient>' +
      '</defs>';
  }
  function ember(o) {
    var L = o.lm || 0, pads = o.pads || "", i, blooms = "", n = 2 + L * 3;
    var bp = [[246, 238, 1], [262, 244, 1.1], [232, 246, .9], [278, 240, .8], [220, 240, .7], [292, 246, .9], [250, 252, .8], [272, 252, .7], [236, 254, .7], [300, 252, .6], [212, 250, .6], [260, 232, .7]];
    for (i = 0; i < Math.min(n, bp.length); i++) { var q = bp[i]; blooms += '<g transform="translate(' + q[0] + ' ' + (q[1] - 20) + ') scale(' + q[2] + ')" class="evo-shroom" style="animation-delay:' + (i * .3) + 's"><rect x="-1.4" y="-2" width="2.8" height="9" rx="1.4" fill="#4a2a1c"/><path d="M-8 0q8-14 16 0q-8-4-16 0z" fill="#ff9a3d"/><path d="M-5 -1q5-8 10 0q-5-3-10 0z" fill="#ffe08a"/></g>'; }
    var plume = '', ph = 30 + L * 22, base = 212;
    var flame = function (cx, h, w, col, cls, dl) { return '<path class="evo-plume' + (cls || '') + '" style="animation-delay:' + dl + 's" d="M' + cx + ' ' + (base - h) + 'C' + (cx + w) + ' ' + (base - h * .45) + ' ' + (cx + w * 1.05) + ' ' + (base - 6) + ' ' + cx + ' ' + base + 'C' + (cx - w * 1.05) + ' ' + (base - 6) + ' ' + (cx - w) + ' ' + (base - h * .45) + ' ' + cx + ' ' + (base - h) + 'z" fill="' + col + '"/>'; };
    if (L) {
      plume = '<ellipse cx="300" cy="' + (base - ph * .55) + '" rx="' + (22 + L * 6) + '" ry="' + (ph * .8) + '" fill="url(#' + o.id + 'Glow)" opacity=".85"/>';
      if (L >= 3) plume += flame(284, ph * .6, 8, "#ff7a2a", "", .5) + flame(316, ph * .7, 8, "#ff7a2a", "", 1);
      plume += flame(300, ph, 13 + L * 1.5, "#ff5a1f", "", 0) + flame(300, ph * .7, 8 + L, "#ffb347", "", .3) + flame(300, ph * .4, 5, "#fff3b0", "", .6);
    }
    var crater = L ? '<ellipse cx="300" cy="214" rx="16" ry="5" fill="#ffb347"/><ellipse cx="300" cy="214" rx="9" ry="3" fill="#fff3b0"/>' : '<ellipse cx="300" cy="214" rx="16" ry="5" fill="#2a1410"/><ellipse cx="300" cy="214" rx="10" ry="3" fill="none" stroke="#ff8a3d" stroke-opacity=".7" stroke-width="1.4" stroke-dasharray="4 4" class="evo-dash"/>';
    var vol = '<path d="M-20 200L50 108l30 30 36-62 70 124z" fill="#1b0c0e"/><path d="M200 200l50-84 44 54 40-44 80 74z" fill="#240f10"/><path d="M50 108l9 14-14 6zM116 76l8 16-12 4z" fill="url(#' + o.id + 'Lava)"/><path d="M116 76q-3 40 4 124M50 108q-4 32 6 92" stroke="#ff6a2a" stroke-opacity=".55" stroke-width="2.6" fill="none"/><ellipse cx="116" cy="70" rx="26" ry="16" fill="url(#' + o.id + 'Glow)" opacity=".55"/>';
    return '<svg viewBox="0 0 400 340" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' + defs(o.id) +
      '<linearGradient id="' + o.id + 'Sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#120509"/><stop offset=".5" stop-color="#3a0f16"/><stop offset="1" stop-color="#8a2a12"/></linearGradient>' +
      '<linearGradient id="' + o.id + 'Gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1511"/><stop offset="1" stop-color="#0c0504"/></linearGradient>' +
      '<rect width="400" height="340" fill="url(#' + o.id + 'Sky)"/>' +
      '<ellipse cx="200" cy="150" rx="260" ry="70" fill="#ff5a1f" opacity=".13"/><circle cx="70" cy="64" r="22" fill="#ffd9a0" opacity=".16"/><circle cx="70" cy="64" r="9" fill="#ffe7bd" opacity=".55"/>' +
      '<g transform="translate(0 50)">' + vol + '<rect y="150" width="400" height="190" fill="url(#' + o.id + 'Gr)"/>' +
      '<path d="M0 176q50-8 100 2t100-4 100 4 100-2v8H0z" fill="#ff5a1f" opacity=".16"/>' +
      '<g class="evo-lavaflow"><path d="M20 210q40-12 80 0t80 0" stroke="#ff7a2a" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/><path d="M180 240q50-10 100 0t100 0" stroke="#ffb347" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".6"/><path d="M40 262q40-8 80 0t80 0" stroke="#ff5a1f" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".65"/></g>' +
      '<ellipse cx="80" cy="238" rx="46" ry="11" fill="#7a1608"/><ellipse cx="80" cy="236" rx="40" ry="8" fill="url(#' + o.id + 'Lava)" opacity=".9"/><ellipse cx="80" cy="234" rx="26" ry="4" fill="#ffd27a" opacity=".6"/>' +
      '<g transform="translate(0 -44)"><ellipse cx="300" cy="238" rx="64" ry="12" fill="#1a0a07"/><ellipse cx="300" cy="236" rx="58" ry="9" fill="#2b1511"/><path d="M262 236l16-30h44l16 30z" fill="#2a1410"/><path d="M272 226l12-20h32l12 20z" fill="#3b1c14"/>' + crater + plume + blooms + '</g>' + pads +
      '<ellipse class="evo-mist" cx="120" cy="214" rx="160" ry="14" fill="#ffb78a" opacity=".07"/></g></svg>';
  }
  function frost(o) {
    var L = o.lm || 0, pads = o.pads || "", i, petals = "", n = 3 + L * 2, id = o.id;
    for (i = 0; i < n; i++) { var a = -80 + (160 / Math.max(1, n - 1)) * i, ring = i % 2; petals += '<path d="M300 226q-' + (9 + ring * 3) + ' -' + (22 + L * 6 + ring * 6) + ' 0 -' + (40 + L * 8 + ring * 8) + 'q' + (9 + ring * 3) + ' ' + (18 + L * 6 + ring * 6) + ' 0 ' + (40 + L * 8 + ring * 8) + 'z" transform="rotate(' + a + ' 300 226)" fill="' + (ring ? "#b7ecff" : "#e8fbff") + '" opacity="' + (0.8 - ring * .15) + '" stroke="#ffffff" stroke-opacity=".55" stroke-width=".8"/>'; }
    var lotus = L ? '<ellipse cx="300" cy="216" rx="' + (28 + L * 8) + '" ry="' + (28 + L * 8) + '" fill="url(#' + id + 'Pink)" opacity=".55" class="evo-lamp"/>' + petals + '<circle cx="300" cy="224" r="6" fill="#fff6c0"/><circle cx="300" cy="224" r="14" fill="url(#' + id + 'Ice)"/><path d="M300 214L300 0" stroke="url(#' + id + 'Ice)" stroke-width="' + (5 + L * 2) + '" opacity=".28" class="evo-beam"/>'
      : '<ellipse cx="300" cy="226" rx="22" ry="6" fill="none" stroke="#bff5ff" stroke-opacity=".7" stroke-width="1.5" stroke-dasharray="4 4" class="evo-dash"/><path d="M296 222q4-14 8 0q-4 6-8 0z" fill="#e8fbff" opacity=".7"/>';
    var trees = ""; for (i = 0; i < 9; i++) { var x = i * 48 - 8, h = 54 + (i * 31) % 40; trees += '<path d="M' + x + ' 190l' + (h * .22) + ' -' + (h * .5) + 'l-' + (h * .1) + ' 0 ' + (h * .2) + ' -' + (h * .4) + 'l-' + (h * .08) + ' 0 ' + (h * .18) + ' -' + (h * .32) + 'l' + (h * .18) + ' ' + (h * .32) + 'l-' + (h * .08) + ' 0 ' + (h * .2) + ' ' + (h * .4) + 'l-' + (h * .1) + ' 0 ' + (h * .22) + ' ' + (h * .5) + 'z" fill="#0b1f33"/><path d="M' + (x + h * .2) + ' ' + (190 - h * .8) + 'l' + (h * .05) + ' 0z" stroke="#e8fbff" stroke-opacity=".5"/>'; }
    var reeds = '<g stroke="#9fd8e8" stroke-width="1.6" stroke-linecap="round" opacity=".7"><path d="M30 262q2-18 -2-30M36 262q-1-14 4-26M358 268q-2-18 2-30M366 268q1-14 -4-24M180 292q2-14 -1-24"/></g>';
    return '<svg viewBox="0 0 400 340" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' + defs(id) +
      '<linearGradient id="' + id + 'Sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050a24"/><stop offset=".55" stop-color="#0d2a52"/><stop offset="1" stop-color="#2d7a9a"/></linearGradient>' +
      '<linearGradient id="' + id + 'Gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ad8ec"/><stop offset=".4" stop-color="#3a86a8"/><stop offset="1" stop-color="#0a2238"/></linearGradient>' +
      '<linearGradient id="' + id + 'Au1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4ee6b4" stop-opacity="0"/><stop offset=".4" stop-color="#4ee6b4" stop-opacity=".7"/><stop offset=".7" stop-color="#a98bff" stop-opacity=".6"/><stop offset="1" stop-color="#a98bff" stop-opacity="0"/></linearGradient>' +
      '<rect width="400" height="340" fill="url(#' + id + 'Sky)"/>' +
      '<g class="evo-aur"><path d="M-20 70Q80 10 180 54T420 30L420 96Q300 60 200 100T-20 112z" fill="url(#' + id + 'Au1)"/></g><g class="evo-aur b"><path d="M-20 110Q100 60 200 96T420 70L420 120Q290 96 190 126T-20 140z" fill="url(#' + id + 'Au1)" opacity=".6"/></g>' +
      '<g fill="#fff" opacity=".85"><circle cx="30" cy="22" r="1"/><circle cx="96" cy="40" r="1.3"/><circle cx="160" cy="14" r="1"/><circle cx="228" cy="34" r="1.2"/><circle cx="290" cy="12" r="1"/><circle cx="352" cy="44" r="1.3"/><circle cx="380" cy="20" r="1"/><circle cx="60" cy="82" r=".9"/><circle cx="196" cy="70" r=".9"/><circle cx="330" cy="86" r=".9"/></g>' +
      '<circle cx="64" cy="72" r="34" fill="url(#' + id + 'Ice)" opacity=".35"/><circle cx="64" cy="72" r="13" fill="#effcff"/>' +
      '<g transform="translate(0 50)"><path d="M0 170L70 110l40 40 60-76 80 96 70-60 80 70v60H0z" fill="#16406a" opacity=".85"/><path d="M70 110l14 18-12 4-10-6zM170 74l14 22-14 4-12-8zM250 170l20-16 10 8-16 10z" fill="#e8fbff" opacity=".85"/>' + trees +
      '<rect y="160" width="400" height="180" fill="url(#' + id + 'Gr)"/>' +
      '<g stroke="#e8fbff" stroke-opacity=".28" stroke-width="1" fill="none"><path d="M0 188H400M0 212H400M0 242H400M0 280H400M200 160L200 340M120 160L30 340M280 160L370 340"/></g>' +
      '<g class="evo-glint" fill="#fff"><path d="M60 214l6-2-6-2-2-6-2 6-6 2 6 2 2 6z"/><path d="M180 250l5-2-5-2-2-5-2 5-5 2 5 2 2 5z"/><path d="M110 276l5-2-5-2-2-5-2 5-5 2 5 2 2 5z"/></g>' +
      '<ellipse cx="80" cy="232" rx="50" ry="12" fill="#12385a"/><ellipse cx="80" cy="229" rx="44" ry="9" fill="#bfeaf6"/><ellipse cx="80" cy="228" rx="30" ry="5" fill="#e8fbff" opacity=".85"/>' +
      '<g transform="translate(0 -42)"><ellipse cx="300" cy="236" rx="64" ry="13" fill="#0e3050"/><ellipse cx="300" cy="233" rx="58" ry="10" fill="#8cc9de"/><ellipse cx="300" cy="231" rx="46" ry="7" fill="#dff6ff"/>' + lotus + '</g>' + reeds + pads +
      '<ellipse class="evo-mist" cx="120" cy="206" rx="160" ry="14" fill="#dff6ff" opacity=".1"/></g></svg>';
  }
  function biomeSVG(id, o) { o = o || {}; o.id = "bx" + id; return id === "ember" ? ember(o) : id === "frost" ? frost(o) : ""; }

  return { atmo: atmo, isOpen: function () { return !!cur; }, cine: cine, closeCine: closeCine, iris: iris, zone: zone, count: count, biomeSVG: biomeSVG, reduce: reduce };
})();
