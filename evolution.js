// ===== SwampRealms: Evolution (Stage 1: foundation) =====
// Load AFTER cards.js, weapons.js, avatar.js, store.js, account.js, menu.js (see evolution.html).
// Everything lives inside this function so it can never clash with the globals in cards.js / store.js (meta, save, KEY, CS ...).
//
// SAVING: the game's progress is stored INSIDE the crystals save as CS.evo (localStorage "swamp-crystals-v1").
// That save already syncs with accounts, so nothing about the Worker or account.js had to change.
// Swamp Coins and Swamp Crystals are NOT touched in Stage 1. "Swamp Essence" is this game's own resource.
(function () {
  "use strict";

  // ---------- TUNING (change numbers here) ----------
  var CFG = {
    tickMs: 250,            // game loop
    saveMs: 10000,          // autosave (also saves on every purchase and when the tab is hidden)
    offlineCap: 7200,       // most seconds of progress that count while away (2 hours)
    welcomeMin: 30,         // show the "welcome back" message after this many seconds away
    creatureBonus: 0.10,    // +10% production from your creature
    hqBonus: [0, 0.25],     // production bonus by Swamp Hollow level (index = level - 1)
    patch: { max: 3, cost: [10, 60, 250], rate: [0.5, 1.5, 4] },   // Glowspore Patch: cost to reach each level, Essence per second at each level
    hq: { max: 2, cost: [0, 120] }                                  // Swamp Hollow: cost to reach each level (level 1 is free)
  };

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var reduce = function () { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); };
  var fmt = function (n) { return Math.floor(n).toLocaleString("en-US"); };
  var fmt1 = function (n) { return (Math.round(n * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 1 }); };

  // ---------- STATE (CS.evo) ----------
  var S = null, dirty = false, lastSaveAt = 0, lastTick = Date.now();

  function num(v, d, lo, hi) { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; }
  function clean(o) {
    o = (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
    return {
      v: 1,
      ess: num(o.ess, 0, 0, 1e15),         // Swamp Essence in hand
      tot: num(o.tot, 0, 0, 1e18),         // Essence earned, all time
      taps: Math.floor(num(o.taps, 0, 0, 1e9)),
      hq: Math.floor(num(o.hq, 1, 1, CFG.hq.max)),
      patch: Math.floor(num(o.patch, 0, 0, CFG.patch.max)),
      cname: typeof o.cname === "string" && o.cname ? o.cname.slice(0, 24) : "Boggy",
      animal: "frog",
      seen: num(o.seen, Date.now(), 0, 4e12)
    };
  }
  function load() {
    try { Crystals.reload(); S = clean(Crystals.state.evo); } catch (e) { S = clean(null); }
  }
  function save(force) {
    var now = Date.now();
    if (!force && now - lastSaveAt < 1500) return;      // never hammer the shared save
    try {
      S.seen = now;
      Crystals.reload();                                 // pick up coins / crystals / gear changed in another tab
      Crystals.state.evo = S;
      Crystals.save();
      lastSaveAt = now; dirty = false;
    } catch (e) {}
  }

  // ---------- RULES ----------
  function rate() { return S.patch ? CFG.patch.rate[S.patch - 1] * mult() : 0; }
  function mult() { return 1 + CFG.hqBonus[S.hq - 1] + CFG.creatureBonus; }
  function tapGain() { return 1 + (S.hq - 1) + S.patch; }

  function buildInfo(id) {   // what the next purchase of a building is, and whether it can be bought
    var lvl = id === "hq" ? S.hq : S.patch, c = id === "hq" ? CFG.hq : CFG.patch;
    if (lvl >= c.max) return { state: "max", lvl: lvl };
    var cost = c.cost[lvl];   // cost[i] is the price to reach level i+1
    if (id === "hq" && !S.patch) return { state: "locked", lvl: lvl, cost: cost, why: "Build the Glowspore Patch first" };
    return { state: S.ess >= cost ? "ready" : "poor", lvl: lvl, cost: cost };
  }

  function buy(id) {
    var b = buildInfo(id);
    if (b.state !== "ready") { toast(b.state === "locked" ? b.why : b.state === "max" ? "Already at the highest level for now." : "Not enough Swamp Essence yet."); return; }
    S.ess -= b.cost;
    if (id === "hq") S.hq++; else S.patch++;
    var name = id === "hq" ? "Swamp Hollow" : "Glowspore Patch";
    var msg = id === "patch" && S.patch === 1 ? "Glowspore Patch built!" : name + " upgraded to level " + (id === "hq" ? S.hq : S.patch) + "!";
    flashScene(id === "hq" ? "hq" : "p1");
    burst(id === "hq" ? "hq" : "p1");
    chipRes(-b.cost);
    toast(msg, true);
    try { SFX.streak(); } catch (e) {}
    save(true); renderAll();
  }

  function pet(ev) {
    var g = tapGain();   // taps are whole numbers; the production bonus applies to the Patch only
    S.ess += g; S.tot += g; S.taps++; dirty = true;
    var r = $("evoScene").getBoundingClientRect(), x = ev && ev.clientX ? ev.clientX - r.left : r.width * 0.4, y = ev && ev.clientY ? ev.clientY - r.top : r.height * 0.6;
    floatText(x, y, "+" + g, "gold");
    var cr = $("evoCr"); cr.classList.remove("hop"); void cr.offsetWidth; cr.classList.add("hop");
    pop(); paintRes(); refresh();
  }

  // ---------- TICK ----------
  function tick() {
    var now = Date.now(), dt = Math.max(0, (now - lastTick) / 1000); lastTick = now;
    var away = dt;
    dt = Math.min(dt, CFG.offlineCap);
    var gain = rate() * dt;
    if (gain > 0) { S.ess += gain; S.tot += gain; dirty = true; }
    if (away >= CFG.welcomeMin && gain >= 1) toast("Welcome back! Your patch collected " + fmt(gain) + " Essence while you were away.");
    paintRes(); refresh();
    if (dirty && now - lastSaveAt > CFG.saveMs) save(false);
  }
  var sporeT = 0;
  function ambient() {   // a little glowspore drifts up from the patch while it produces (visual feedback for passive income)
    if (!S.patch || document.hidden) return;
    var sc = $("evoScene"); if (!sc) return;
    var r = sc.getBoundingClientRect(); if (!r.width) return;
    var per = rate() * 1.8;   // one spore per ~1.8 seconds of production
    floatText(r.width * (0.5 + 0.16 * Math.random()) + 0, r.height * 0.5, "+" + fmt1(per), "mint", true);
  }

  // ---------- FEEDBACK ----------
  function paintRes() {
    $("evoEss").textContent = fmt(S.ess);
    var r = rate();
    $("evoRate").textContent = "+" + fmt1(r) + "/s";
    $("evoRate").classList.toggle("off", !r);
    var m = Math.round((mult() - 1) * 100);
    $("evoMult").textContent = "+" + m + "% bonus";
  }
  function pop() { try { HudFX.pop($("evoEss")); } catch (e) {} }
  function chipRes(d) { try { HudFX.chip($("evoCount"), d, "gold", "below"); } catch (e) {} pop(); }
  function floatText(x, y, text, kind, quiet) {
    if (reduce() && quiet) return;
    var sc = $("evoScene"), el = document.createElement("i");
    el.className = "evo-float " + (kind || "gold");
    el.textContent = text; el.style.left = x + "px"; el.style.top = y + "px"; el.setAttribute("aria-hidden", "true");
    sc.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1200);
  }
  function burst(where) {
    if (reduce()) return;
    var sc = $("evoScene"), r = sc.getBoundingClientRect(), p = where === "hq" ? [0.17, 0.52] : [0.6, 0.62];
    for (var i = 0; i < 12; i++) {
      var s = document.createElement("i"), a = (i / 12) * Math.PI * 2, d = 38 + Math.random() * 30;
      s.className = "evo-spark"; s.style.left = r.width * p[0] + "px"; s.style.top = r.height * p[1] + "px";
      s.style.setProperty("--dx", Math.cos(a) * d + "px"); s.style.setProperty("--dy", Math.sin(a) * d - 10 + "px");
      sc.appendChild(s); (function (n) { setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 900); })(s);
    }
  }
  function flashScene(which) {
    var el = $(which === "hq" ? "hotHq" : "hotP1"); if (!el) return;
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  }
  var toastT = 0;
  function toast(msg, good) {
    var t = $("evoToast"); t.textContent = msg; t.className = "evo-toast show" + (good ? " good" : "");
    clearTimeout(toastT); toastT = setTimeout(function () { t.className = "evo-toast"; }, 2600);
  }

  // ---------- SCENE ART (SVG, redrawn when something is built or upgraded) ----------
  function sceneSVG() {
    var hq2 = S.hq >= 2, p = S.patch;
    var shrooms = "";
    if (p) {
      var pts = [[232, 170, 1], [248, 176, 1.15], [262, 169, .9], [240, 160, .8], [256, 158, 1], [226, 178, .7], [270, 178, .75]], n = 2 + p * 2;
      for (var i = 0; i < Math.min(n, pts.length); i++) {
        var q = pts[i];
        shrooms += '<g transform="translate(' + q[0] + ' ' + q[1] + ') scale(' + q[2] + ')" class="evo-shroom" style="animation-delay:' + (i * .35) + 's"><rect x="-1.5" y="-2" width="3" height="10" rx="1.5" fill="#cfeee2"/><path d="M-9 -1a9 8 0 0118 0z" fill="url(#gP)"/><circle cx="-3" cy="-5" r="1.3" fill="#e9fff7" opacity=".8"/><circle cx="3" cy="-3" r="1" fill="#e9fff7" opacity=".7"/></g>';
      }
      if (p >= 3) shrooms += '<g transform="translate(250 150)"><path d="M0 -16l7 10-4 14h-6l-4-14z" fill="#8ef7d6" opacity=".9"/><path d="M0 -16l7 10-7 3z" fill="#fff" opacity=".35"/></g>';
    }
    var plot1 = p
      ? '<ellipse cx="248" cy="178" rx="52" ry="14" fill="#16301f"/><ellipse cx="248" cy="175" rx="48" ry="11" fill="#244a2b"/><ellipse cx="248" cy="172" rx="40" ry="8" fill="#2f6a37"/>' + shrooms + '<ellipse cx="248" cy="165" rx="34" ry="12" fill="url(#gGlow)" opacity="' + (0.35 + p * .15) + '"/>'
      : '<ellipse cx="248" cy="178" rx="52" ry="14" fill="#16301f"/><ellipse cx="248" cy="175" rx="48" ry="11" fill="#1f3d27"/><ellipse cx="248" cy="174" rx="38" ry="8" fill="none" stroke="#4ee6b4" stroke-opacity=".6" stroke-width="1.6" stroke-dasharray="5 5" class="evo-dash"/><path d="M248 166v16M240 174h16" stroke="#4ee6b4" stroke-width="3" stroke-linecap="round" opacity=".85"/>';
    var plot2 = hq2
      ? '<ellipse cx="338" cy="182" rx="46" ry="12" fill="#16301f"/><ellipse cx="338" cy="179" rx="42" ry="9" fill="#1f3d27"/><ellipse cx="338" cy="178" rx="33" ry="7" fill="none" stroke="#f2c14e" stroke-opacity=".55" stroke-width="1.4" stroke-dasharray="4 5"/><path d="M338 182v-10M338 174c-5 0-7-3-7-5 5 0 7 2 7 5zM338 174c5 0 7-3 7-5-5 0-7 2-7 5z" fill="none" stroke="#7fd36a" stroke-width="1.6" stroke-linecap="round"/>'
      : '<ellipse cx="338" cy="182" rx="46" ry="12" fill="#0f2119"/><ellipse cx="338" cy="179" rx="42" ry="9" fill="#13261d"/><g transform="translate(338 172)"><rect x="-7" y="-2" width="14" height="11" rx="2.5" fill="#2b3a33" stroke="#4ee6b4" stroke-opacity=".5"/><path d="M-4 -2v-3a4 4 0 018 0v3" fill="none" stroke="#6b8a7e" stroke-width="2"/></g>';
    var hq = '<ellipse cx="75" cy="188" rx="72" ry="17" fill="#13281a"/><ellipse cx="75" cy="184" rx="66" ry="13" fill="#244a2b"/><ellipse cx="75" cy="181" rx="56" ry="9" fill="#2f6a37"/>';
    if (hq2) hq += '<rect x="30" y="112" width="90" height="26" rx="4" fill="#3b2a1a"/><path d="M24 114l51-30 51 30z" fill="#2c6b3a"/><path d="M24 114l51-30 51 30" fill="none" stroke="#7fd36a" stroke-opacity=".5" stroke-width="2"/><rect x="72" y="62" width="2.5" height="24" fill="#8a6a3a"/><path d="M74.5 62l16 5-16 6z" fill="#4ee6b4"/>';
    hq += '<rect x="36" y="138" width="78" height="44" rx="5" fill="#4a341f"/><rect x="36" y="138" width="78" height="8" rx="4" fill="#5d4326"/><path d="M28 140l47-34 47 34z" fill="#34803f"/><path d="M28 140l47-34 47 34" fill="none" stroke="#9de07a" stroke-opacity=".5" stroke-width="2"/><path d="M44 140q3 8 0 14M64 140q-3 7 1 12M88 140q3 9-1 14M104 140q-2 7 1 11" stroke="#6fcf6a" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/><path d="M62 182v-17a13 13 0 0126 0v17z" fill="#1a1208"/><path d="M65 182v-16a10 10 0 0120 0v16z" fill="#f2c14e" opacity=".85"/><circle cx="75" cy="165" r="22" fill="url(#gGlow2)" opacity=".7"/><rect x="42" y="152" width="14" height="12" rx="2" fill="#1a1208"/><rect x="44" y="154" width="10" height="8" rx="1.5" fill="#f2c14e" opacity=".7"/><rect x="94" y="152" width="14" height="12" rx="2" fill="#1a1208"/><rect x="96" y="154" width="10" height="8" rx="1.5" fill="#f2c14e" opacity=".7"/>';
    hq += '<g transform="translate(118 164)"><rect x="-1" y="-16" width="2.4" height="20" fill="#6b4a2a"/><circle cx="0" cy="-18" r="5" fill="#f2c14e"/><circle cx="0" cy="-18" r="12" fill="url(#gGlow2)" opacity=".7"/></g>';
    var flies = "";
    for (var f = 0; f < 7; f++) flies += '<circle class="evo-fly" cx="' + (30 + f * 52) + '" cy="' + (60 + (f * 37) % 90) + '" r="1.7" fill="#d6ff9a" style="animation-delay:' + (f * .8) + 's"/>';
    var trees = "";
    for (var t = 0; t < 9; t++) { var x = t * 50 - 10, h = 70 + (t * 29) % 40; trees += '<path d="M' + x + ' 150 L' + (x + 6) + ' ' + (150 - h) + ' L' + (x + 12) + ' 150z" fill="#0a1a14"/><path d="M' + (x + 6) + ' ' + (150 - h) + 'q-8 20-4 46M' + (x + 6) + ' ' + (150 - h + 10) + 'q9 18 5 40" stroke="#123828" stroke-width="2" fill="none"/>'; }
    return '<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs>' +
      '<linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#06100d"/><stop offset=".55" stop-color="#0f2c24"/><stop offset="1" stop-color="#1b4a3a"/></linearGradient>' +
      '<linearGradient id="gWater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#103a33"/><stop offset="1" stop-color="#050e0b"/></linearGradient>' +
      '<linearGradient id="gP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9ffe9"/><stop offset="1" stop-color="#27b88c"/></linearGradient>' +
      '<radialGradient id="gGlow"><stop offset="0" stop-color="#4ee6b4" stop-opacity=".8"/><stop offset="1" stop-color="#4ee6b4" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="gGlow2"><stop offset="0" stop-color="#f2c14e" stop-opacity=".8"/><stop offset="1" stop-color="#f2c14e" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="gMoon"><stop offset="0" stop-color="#e9fff6" stop-opacity=".95"/><stop offset=".25" stop-color="#bff5e2" stop-opacity=".5"/><stop offset="1" stop-color="#bff5e2" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="400" height="260" fill="url(#gSky)"/><circle cx="330" cy="46" r="48" fill="url(#gMoon)"/><circle cx="330" cy="46" r="15" fill="#effff8"/>' +
      '<g fill="#fff" opacity=".7"><circle cx="40" cy="26" r="1"/><circle cx="110" cy="16" r="1.2"/><circle cx="170" cy="38" r=".9"/><circle cx="240" cy="20" r="1"/><circle cx="380" cy="90" r=".9"/><circle cx="60" cy="70" r=".8"/></g>' +
      trees + '<rect y="150" width="400" height="110" fill="url(#gWater)"/>' +
      '<g stroke="#4ee6b4" stroke-opacity=".18" stroke-width="1.2" fill="none"><path d="M10 205q20-5 40 0t40 0M180 232q25-6 50 0t50 0M290 212q20-4 40 0t40 0M20 240q25-5 50 0t50 0"/></g>' +
      '<ellipse cx="150" cy="216" rx="38" ry="9" fill="#16301f"/><ellipse cx="150" cy="213" rx="34" ry="7" fill="#244a2b"/>' +
      hq + plot1 + plot2 +
      '<g fill="#7fd36a" opacity=".85"><path d="M8 190q2-22 6-26-1 16 4 26zM392 196q-2-22-6-26 1 16-4 26zM178 250q2-18 5-22-1 14 3 22z"/></g>' + flies +
      '<ellipse class="evo-mist" cx="120" cy="196" rx="150" ry="14" fill="#bff5e2" opacity=".07"/></svg>';
  }
  function paintScene() {
    $("evoArt").innerHTML = sceneSVG();
    var h1 = $("hotP1"), h2 = $("hotP2");
    h1.classList.toggle("built", !!S.patch);
    h2.classList.toggle("locked", S.hq < 2);
    h1.setAttribute("aria-label", S.patch ? "Glowspore Patch, level " + S.patch : "Starter plot, empty. Tap to build.");
    h2.setAttribute("aria-label", S.hq < 2 ? "Second plot, locked until Swamp Hollow level 2" : "Second plot, ready for a building in a future update");
    $("hotHq").setAttribute("aria-label", "Swamp Hollow, level " + S.hq);
  }
  function paintCreature() {
    try { $("evoCrArt").innerHTML = AV.svg({ animal: S.animal, nobg: true }).replace('viewBox="0 0 200 200"', 'viewBox="22 4 156 156"'); }
    catch (e) { $("evoCrArt").textContent = "🐸"; }
  }

  // ---------- PANELS ----------
  function btnFor(id) {
    var b = buildInfo(id);
    if (b.state === "max") return '<button type="button" class="btn ghost" disabled>Max level</button>';
    var label = (id === "patch" && !S.patch ? "Build" : "Upgrade") + ' <span class="evo-c"><span class="evo-orb sm" aria-hidden="true"></span>' + fmt(b.cost) + '</span>';
    if (b.state === "locked") return '<button type="button" class="btn ghost" data-buy="' + id + '" disabled>' + label + '</button><p class="evo-need">' + esc(b.why) + '</p>';
    return '<button type="button" class="btn" data-buy="' + id + '"' + (b.state === "ready" ? "" : " disabled") + '>' + label + '</button><div class="evo-bar2" data-prog="' + id + '"><i></i></div><p class="evo-need" data-need="' + id + '"></p>';
  }
  function renderBuild() {
    var p = S.patch, nextRate = p && p < CFG.patch.max ? CFG.patch.rate[p] * mult() : 0;
    var h = '';
    h += '<article class="evo-card' + (S.hq >= CFG.hq.max ? " done" : "") + '"><div class="evo-ic hq" aria-hidden="true"></div><div class="evo-info"><h3>Swamp Hollow <em>Lv ' + S.hq + '/' + CFG.hq.max + '</em></h3><p>Your headquarters. Level 2 adds +25% production, stronger taps and opens a second plot.</p></div><div class="evo-act">' + btnFor("hq") + '</div></article>';
    h += '<article class="evo-card' + (p >= CFG.patch.max ? " done" : "") + '"><div class="evo-ic patch" aria-hidden="true"></div><div class="evo-info"><h3>Glowspore Patch <em>' + (p ? "Lv " + p + "/" + CFG.patch.max : "Not built") + '</em></h3><p>' +
      (p ? "Makes " + fmt1(rate()) + " Essence per second." + (nextRate ? " Next level: " + fmt1(nextRate) + "/s." : " Fully grown!") : "Your starter plot is empty. Build a patch to make Essence on its own.") +
      '</p></div><div class="evo-act">' + btnFor("patch") + '</div></article>';
    h += S.hq < 2
      ? '<article class="evo-card locked"><div class="evo-ic lock" aria-hidden="true"></div><div class="evo-info"><h3>Second plot <em>Locked</em></h3><p>Upgrade Swamp Hollow to level 2 to clear this plot.</p></div></article>'
      : '<article class="evo-card empty"><div class="evo-ic plot" aria-hidden="true"></div><div class="evo-info"><h3>Second plot <em>Cleared</em></h3><p>This plot is ready and empty. New buildings arrive in the next update.</p></div></article>';
    $("pane-build").innerHTML = h;
  }
  function renderCreature() {
    var art = ""; try { art = AV.svg({ animal: S.animal, nobg: true }).replace('viewBox="0 0 200 200"', 'viewBox="22 4 156 156"'); } catch (e) {}
    var h = '<article class="evo-card creature"><div class="evo-cav" aria-hidden="true">' + art + '</div><div class="evo-info"><h3>' + esc(S.cname) + ' the Frog <em>Hatchling</em></h3><p>Your first creature. It boosts production by +' + Math.round(CFG.creatureBonus * 100) + '% and gives you Essence when you pet it.</p>' +
      '<ul class="evo-stats"><li><span>Essence per pet</span><b>+' + tapGain() + '</b></li><li><span>Times petted</span><b>' + fmt(S.taps) + '</b></li><li><span>Production bonus</span><b>+' + Math.round(CFG.creatureBonus * 100) + '%</b></li></ul></div><div class="evo-act"><button type="button" class="btn" data-pet>Pet ' + esc(S.cname) + '</button></div></article>';
    h += '<article class="evo-card locked"><div class="evo-ic lock" aria-hidden="true"></div><div class="evo-info"><h3>Evolve ' + esc(S.cname) + ' <em>Locked</em></h3><p>Evolution arrives in the next update.</p></div></article>';
    h += '<article class="evo-card empty"><div class="evo-ic egg" aria-hidden="true"></div><div class="evo-info"><h3>Egg slot <em>Empty</em></h3><p>No eggs yet. Hatching arrives in the next update.</p></div></article>';
    $("pane-creature").innerHTML = h;
  }
  function renderRealm() {
    var goals = [["Build the Glowspore Patch", S.patch >= 1], ["Upgrade the patch to level " + CFG.patch.max, S.patch >= CFG.patch.max], ["Upgrade Swamp Hollow to level " + CFG.hq.max, S.hq >= CFG.hq.max]];
    var all = goals.every(function (g) { return g[1]; }), dn = goals.filter(function (g) { return g[1]; }).length;
    var h = '<article class="evo-card realm"><div class="evo-info"><h3>Your realm</h3><ul class="evo-stats"><li><span>Essence per second</span><b>' + fmt1(rate()) + '</b></li><li><span>Production bonus</span><b>+' + Math.round((mult() - 1) * 100) + '%</b></li><li><span>Essence earned, all time</span><b>' + fmt(S.tot) + '</b></li><li><span>Swamp Hollow</span><b>Level ' + S.hq + '</b></li></ul></div></article>';
    h += '<article class="evo-card' + (all ? " done" : "") + '"><div class="evo-info"><h3>First steps <em>' + dn + '/' + goals.length + '</em></h3><ul class="evo-goals">' + goals.map(function (g) { return '<li class="' + (g[1] ? "ok" : "") + '"><i aria-hidden="true"></i>' + esc(g[0]) + '</li>'; }).join("") + '</ul>' +
      (all ? '<p class="evo-win">All first steps complete! Your swamp is thriving. More buildings, creatures and realms are coming.</p>' : '<p>Finish these to complete the first stage of your realm.</p>') + '</div></article>';
    h += '<p class="evo-fine">Progress is saved on this device and in your account when you are signed in. <button type="button" class="evo-link" data-reset>Start over</button></p>';
    $("pane-realm").innerHTML = h;
  }
  function renderAll() { paintRes(); paintScene(); renderBuild(); renderCreature(); renderRealm(); refresh(); }

  // light update every tick: buttons enable themselves and progress bars fill, without rebuilding the DOM under a pressed finger
  function refresh() {
    ["hq", "patch"].forEach(function (id) {
      var b = buildInfo(id), btn = document.querySelector('[data-buy="' + id + '"]');
      if (!btn || b.state === "max" || b.state === "locked") return;
      var ok = b.state === "ready"; btn.disabled = !ok;
      var bar = document.querySelector('[data-prog="' + id + '"] i'); if (bar) bar.style.width = Math.min(100, S.ess / b.cost * 100) + "%";
      var need = document.querySelector('[data-need="' + id + '"]'); if (need) need.textContent = ok ? "Ready!" : "Need " + fmt(Math.ceil(b.cost - S.ess)) + " more Essence";
      btn.classList.toggle("ready", ok);
    });
    var hp = $("hotP1"); if (hp) hp.classList.toggle("can", !S.patch && buildInfo("patch").state === "ready");
  }

  // ---------- NAVIGATION + EVENTS ----------
  function tab(name) {
    ["build", "creature", "realm"].forEach(function (n) {
      var on = n === name; $("tab-" + n).setAttribute("aria-selected", on); $("pane-" + n).hidden = !on;
    });
    try { sessionStorage.setItem("evo-tab", name); } catch (e) {}
  }
  function bind() {
    document.querySelector(".evo-tabs").addEventListener("click", function (e) { var t = e.target.closest("[data-tab]"); if (t) tab(t.dataset.tab); });
    $("evoStage").addEventListener("click", function (e) {
      var b = e.target.closest("[data-buy]"); if (b) { buy(b.dataset.buy); return; }
      if (e.target.closest("[data-pet]")) { pet(e); return; }
      if (e.target.closest("[data-reset]")) {
        if (confirm("Start your swamp over? This only resets SwampRealms: Evolution. Your coins, crystals, cards and avatar are not touched.")) { S = clean(null); S.seen = Date.now(); save(true); renderAll(); tab("build"); toast("Your swamp was reset."); }
      }
    });
    $("evoCr").addEventListener("click", pet);
    $("hotHq").addEventListener("click", function () { tab("build"); toast("Swamp Hollow, level " + S.hq + (S.hq >= CFG.hq.max ? ". Highest level for now." : ".")); });
    $("hotP1").addEventListener("click", function () { tab("build"); if (!S.patch) { var b = buildInfo("patch"); toast(b.state === "ready" ? "Tap Build to plant your Glowspore Patch." : "Pet your creature to collect " + fmt(Math.ceil(b.cost - S.ess)) + " more Essence."); } else toast("Glowspore Patch, level " + S.patch + ". Making " + fmt1(rate()) + "/s."); });
    $("hotP2").addEventListener("click", function () { tab("build"); toast(S.hq < 2 ? "Locked. Upgrade Swamp Hollow to level 2." : "This plot is ready. New buildings arrive in the next update."); });
    document.addEventListener("visibilitychange", function () { if (document.hidden) save(true); else tick(); });
    addEventListener("pagehide", function () { save(true); });
  }

  // ---------- START ----------
  function init() {
    load();
    var gap = (Date.now() - S.seen) / 1000;   // time since the last save counts as time away
    lastTick = Date.now() - Math.min(Math.max(gap, 0), CFG.offlineCap) * 1000;
    var hd = document.querySelector("header"), setTop = function () { if (hd) $("evoStage").style.setProperty("--evo-top", hd.offsetHeight + "px"); };
    setTop(); addEventListener("resize", setTop);
    paintCreature(); renderAll(); bind();
    var t = "build"; try { t = sessionStorage.getItem("evo-tab") || "build"; } catch (e) {} tab(t === "creature" || t === "realm" ? t : "build");
    tick();
    if (!S.tot && !S.patch) toast("Welcome! Pet " + S.cname + " to collect your first Essence.");
    setInterval(tick, CFG.tickMs);
    setInterval(ambient, 1800);
  }
  if (typeof Crystals === "undefined" || typeof AV === "undefined") {
    var m = document.createElement("p"); m.textContent = "The game could not start because a shared script failed to load. Reload the page.";
    var st = document.getElementById("evoStage"); if (st) st.appendChild(m);
  } else init();
})();
