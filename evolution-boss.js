// ===== SwampRealms: Evolution - Boss Battles (Stage 5) =====
// Load BEFORE evolution.js. Talks to the game only through window.EvoCore (exported by evolution.js). Saves in CS.evo.bo = { bossId: { k: kills, t: lastKillMs } }.
// Rewards: first win = coins + crystals (once, capped) + a Trophy (+10% production). Rematches pay Essence only, with a cooldown.
(function () {
  "use strict";
  var K = function () { return window.EvoCore; };
  var $ = function (id) { return document.getElementById(id); };
  var CD = 600000;   // rematch cooldown (ms)
  var BOSS = [   // hp / time (s) / dmg = Courage lost per missed dodge. Tune here.
    { id: "mossback", n: "Grumbleroot", tag: "The Mossback Titan", c: "#4ee6b4", hp: 800, time: 45, dmg: 20, coins: 20, cry: 5, pal: ["#26492c", "#3f7a3e", "#8fe08a", "#ffe08a"],
      need: function (S) { return S.hq >= 2 ? "" : "Upgrade Swamp Hollow to level 2"; } },
    { id: "cinderhide", n: "Cinderhide", tag: "The Magma Toad", c: "#ff8a3d", hp: 4200, time: 50, dmg: 25, coins: 40, cry: 10, pal: ["#4a1d12", "#a8431f", "#ff8a3d", "#ffd27a"],
      need: function (S) { return S.rl >= 2 ? "" : "Unlock Ember Bog"; } },
    { id: "rimewing", n: "Queen Rimewing", tag: "The Aurora Moth", c: "#7fd6ff", hp: 12000, time: 55, dmg: 30, coins: 80, cry: 25, pal: ["#1d4a66", "#5fa3c0", "#cdeefa", "#ffffff"],
      need: function (S) { return S.rl >= 3 ? "" : "Unlock Frostfen"; } }
  ];
  var F = null, iv = 0, tonic = false;

  function art(b) {   // boss pictures, drawn in code
    var p = b.pal, eye = function (x, y, r) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + p[3] + '"/><circle cx="' + x + '" cy="' + y + '" r="' + r / 2.4 + '" fill="#10130d"/>'; }, body;
    if (b.id === "mossback") body = '<ellipse cx="100" cy="160" rx="78" ry="11" fill="#000" opacity=".3"/><path d="M26 146C26 72 66 30 100 30s74 42 74 116z" fill="' + p[0] + '"/><path d="M42 138C46 84 72 48 100 48s54 36 58 90z" fill="' + p[1] + '"/><g fill="' + p[2] + '" opacity=".8"><circle cx="70" cy="70" r="9"/><circle cx="130" cy="62" r="11"/><circle cx="100" cy="46" r="7"/><circle cx="148" cy="96" r="8"/><circle cx="52" cy="100" r="8"/></g><rect x="40" y="136" width="30" height="22" rx="8" fill="' + p[0] + '"/><rect x="130" y="136" width="30" height="22" rx="8" fill="' + p[0] + '"/><path d="M70 126h60v20q-30 12-60 0z" fill="' + p[1] + '"/>' + eye(82, 108, 11) + eye(118, 108, 11) + '<path d="M84 136q16 10 32 0" stroke="#10130d" stroke-width="4" fill="none" stroke-linecap="round"/>';
    else if (b.id === "cinderhide") body = '<ellipse cx="100" cy="160" rx="82" ry="11" fill="#000" opacity=".3"/><ellipse cx="100" cy="112" rx="82" ry="50" fill="' + p[0] + '"/><ellipse cx="100" cy="106" rx="70" ry="40" fill="' + p[1] + '"/><g fill="' + p[2] + '"><circle cx="58" cy="84" r="7"/><circle cx="142" cy="82" r="8"/><circle cx="100" cy="72" r="6"/><circle cx="70" cy="124" r="6"/><circle cx="132" cy="122" r="7"/></g><path d="M44 64l10-22 10 22zM82 52l10-26 10 26zM120 56l10-24 10 24z" fill="' + p[2] + '"/>' + eye(70, 88, 13) + eye(130, 88, 13) + '<path d="M54 122q46 26 92 0q-46 12-92 0z" fill="#10130d"/><path d="M70 124l6 8 6-7 6 8 6-8 6 8 6-8 6 8 6-8" stroke="' + p[3] + '" stroke-width="3" fill="none"/>';
    else body = '<ellipse cx="100" cy="162" rx="60" ry="9" fill="#000" opacity=".25"/><path d="M96 90C60 20 12 30 8 78c-2 40 40 54 88 22z" fill="' + p[1] + '"/><path d="M104 90c36-70 84-60 88-12 2 40-40 54-88 22z" fill="' + p[1] + '"/><path d="M92 92C62 46 30 52 26 80c4 26 32 34 66 14zM108 92c30-46 62-40 66-12-4 26-32 34-66 14z" fill="' + p[2] + '" opacity=".85"/><circle cx="46" cy="76" r="9" fill="' + p[3] + '" opacity=".8"/><circle cx="154" cy="76" r="9" fill="' + p[3] + '" opacity=".8"/><ellipse cx="100" cy="112" rx="17" ry="42" fill="' + p[0] + '"/>' + eye(92, 88, 7) + eye(108, 88, 7) + '<path d="M92 72q-14-28-22-34M108 72q14-28 22-34" stroke="' + p[2] + '" stroke-width="4" fill="none" stroke-linecap="round"/>';
    return '<svg viewBox="0 0 200 180" aria-hidden="true">' + body + '</svg>';
  }

  function info(b) {
    var S = K().S(), r = S.bo[b.id] || { k: 0, t: 0 }, why = b.need(S);
    if (why) return { st: "locked", why: why, r: r };
    var left = r.k ? Math.max(0, CD - (Date.now() - r.t)) : 0;
    return left > 0 ? { st: "cool", left: left, r: r } : { st: "ready", r: r };
  }
  function rematchEss() { return Math.max(300, Math.round(K().rate() * 1200)); }
  function tapDmg() { return Math.max(2, Math.round(K().tapGain() * 0.6)); }
  function cdps() { return K().S().crs.reduce(function (t, c) { return t + [2, 6, 15][c.s]; }, 0) * (1 + K().mv("grip") * 0.5); }
  function tonicCost() { return Math.max(80, Math.round(K().rate() * 30)); }
  function sfx(n, a) { try { SFX[n](a); } catch (e) {} }

  // ---------- Bosses tab ----------
  function render() {
    var el = $("pane-boss"); if (!el || !K()) return;
    var S = K().S(), won = BOSS.filter(function (b) { return (S.bo[b.id] || {}).k; }).length;
    var h = '<article class="evo-card' + (won === BOSS.length ? " done" : "") + '"><div class="evo-info"><h3>Boss Battles <em>' + won + '/' + BOSS.length + ' Trophies</em></h3><p>Every boss you beat for the first time gives coins, crystals and a Trophy: <b>+10% production, forever</b>. Beaten bosses can be fought again for Essence.</p></div></article>';
    BOSS.forEach(function (b, i) {
      var n = info(b), k = n.r.k, act, line;
      if (n.st === "locked") { act = '<button type="button" class="btn ghost" disabled>Fight</button><p class="evo-need">' + K().esc(n.why) + '</p>'; line = "Beat it to earn coins, crystals and a Trophy."; }
      else if (n.st === "cool") { act = '<button type="button" class="btn ghost" disabled>Rematch in <span data-bcool>' + clock(n.left / 1000) + '</span></button>'; line = "Defeated " + k + " time" + (k > 1 ? "s" : "") + ". Rematch pays " + K().fmtK(rematchEss()) + " Essence."; }
      else { act = '<button type="button" class="btn ready" data-boss="' + i + '">' + (k ? "Rematch" : "Fight!") + '</button>'; line = k ? "Defeated " + k + " time" + (k > 1 ? "s" : "") + ". Rematch pays " + K().fmtK(rematchEss()) + " Essence." : "First win: " + b.coins + " Swamp Coins, " + b.cry + " Swamp Crystals and a Trophy."; }
      h += '<article class="evo-card boss' + (n.st === "locked" ? " locked" : "") + (k ? " done" : "") + '" style="--c:' + b.c + '"><div class="evo-bthumb" aria-hidden="true">' + art(b) + '</div><div class="evo-info"><h3>' + b.n + ' <em>' + (k ? "Trophy won" : n.st === "locked" ? "Locked" : "Ready") + '</em></h3><p>' + b.tag + '. ' + line + '</p></div><div class="evo-act">' + act + '</div></article>';
    });
    el.innerHTML = h;
  }
  function clock(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function ready() { var S = K().S(); return BOSS.some(function (b) { var n = info(b); return n.st === "ready" && !n.r.k; }); }

  // ---------- Fight overlay ----------
  function box() {
    var o = $("evoBt"); if (o) return o;
    o = document.createElement("div"); o.id = "evoBt"; o.className = "evo-bt"; o.hidden = true; o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true"); o.setAttribute("aria-label", "Boss battle");
    $("evoStage").appendChild(o); o.addEventListener("click", onClick); return o;
  }
  function close() { clearInterval(iv); iv = 0; F = null; var o = $("evoBt"); if (o) { o.hidden = true; o.innerHTML = ""; } }
  function prep(i) {
    var b = BOSS[i], o = box(); tonic = false; F = null; clearInterval(iv);
    o.dataset.i = i; o.style.setProperty("--bc", b.c);
    o.innerHTML = '<div class="evo-bt-box"><div class="evo-bt-pic">' + art(b) + '</div><h3>' + b.n + '</h3><p class="evo-bt-tag">' + b.tag + '</p><ul class="evo-bt-facts"><li>Beat it in <b>' + b.time + ' seconds</b></li><li>Your tap hits for <b>' + K().fmtK(tapDmg()) + '</b>, creatures add <b>' + K().fmtK(cdps()) + '/s</b></li><li>Tap the <b>glowing weak spots</b> for big crits</li><li>When it winds up, hit <b>Dodge</b> to stun it. Missed dodges cost Courage.</li></ul>' +
      '<button type="button" class="btn ghost" data-tonic aria-pressed="false">Swamp Tonic: +60% damage <span class="evo-c"><span class="evo-orb sm" aria-hidden="true"></span>' + K().fmtK(tonicCost()) + '</span></button><button type="button" class="btn" data-fight>Start fight</button><button type="button" class="btn ghost" data-leave>Back</button></div>';
    o.hidden = false;
  }
  function start() {
    var i = Number($("evoBt").dataset.i), b = BOSS[i], S = K().S();
    if (tonic) { if (S.ess >= tonicCost()) { S.ess -= tonicCost(); K().chipRes(-tonicCost()); } else tonic = false; }
    F = { b: b, hp: b.hp, t: b.time, co: 100, st: "idle", nx: 5, wl: 0, stun: 0, weak: 0, nw: 3, last: Date.now(), tonic: tonic, td: tapDmg(), dps: cdps() * (tonic ? 1.6 : 1), taps: 0 };
    var o = $("evoBt");
    o.innerHTML = '<div class="evo-bt-fight"><div class="evo-bt-top"><button type="button" class="evo-bt-x" data-flee aria-label="Run away">&#8592;</button><b>' + b.n + '</b><span data-bt>' + b.time + 's</span></div><div class="evo-bt-bar hp"><i data-hp></i><span data-hpn></span></div><div class="evo-bt-bar co"><i data-co></i><span>Courage</span></div>' +
      '<button type="button" class="evo-bt-art" data-hit aria-label="Attack ' + b.n + '">' + art(b) + '<i class="evo-bt-weak" data-weak hidden></i><b class="evo-bt-warn" data-warn hidden>WATCH OUT!</b></button><button type="button" class="btn evo-bt-dodge" data-dodge disabled>Dodge!</button><p class="evo-bt-hint" data-hint>Tap the boss to attack!</p></div>';
    sfx("charge"); iv = setInterval(step, 100); ui();
  }
  function say(t) { var h = document.querySelector("[data-hint]"); if (h) h.textContent = t; }
  function pop(txt, cls, x, y) {
    var a = document.querySelector(".evo-bt-art"); if (!a) return;
    var f = document.createElement("i"); f.className = "evo-bt-f " + (cls || ""); f.textContent = txt; f.style.left = (x == null ? 30 + Math.random() * 40 : x) + "%"; f.style.top = (y == null ? 30 + Math.random() * 30 : y) + "%";
    a.appendChild(f); setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 800);
  }
  function hurt(d, cls, x, y) { F.hp -= d; if (cls) pop((cls === "crit" ? "CRIT " : "") + K().fmtK(d), cls, x, y); }
  function step() {
    if (!F) return;
    var now = Date.now(), dt = Math.min(0.25, (now - F.last) / 1000); F.last = now;
    F.t -= dt; F.stun = Math.max(0, F.stun - dt); F.hp -= F.dps * dt * (F.stun > 0 ? 2 : 1);
    if (F.st === "idle") { F.nx -= dt; if (F.nx <= 0) { F.st = "wind"; F.wl = 1.6; sfx("charge"); say("It is winding up! DODGE now!"); } }
    else {
      F.wl -= dt;
      if (F.wl <= 0) { F.co -= F.b.dmg; F.st = "idle"; F.nx = 6 + Math.random() * 3; sfx("tear"); say("Ouch! Dodge the next attack."); var a = document.querySelector(".evo-bt-art"); if (a) { a.classList.remove("hit"); void a.offsetWidth; a.classList.add("hit"); } pop("-" + F.b.dmg + " Courage", "bad", 50, 20); }
    }
    if (F.weak > 0) { F.weak -= dt; if (F.weak <= 0) F.nw = 2.5 + Math.random() * 2; }
    else { F.nw -= dt; if (F.nw <= 0) { F.weak = 2.4; var w = document.querySelector("[data-weak]"); if (w) { w.style.left = (22 + Math.random() * 56) + "%"; w.style.top = (28 + Math.random() * 44) + "%"; } } }
    ui();
    if (F.hp <= 0) win(); else if (F.co <= 0) lose("You ran out of Courage."); else if (F.t <= 0) lose("Time ran out.");
  }
  function ui() {
    var o = $("evoBt"); if (!F || !o) return;
    var q = function (s) { return o.querySelector(s); }, hp = Math.max(0, F.hp);
    q("[data-hp]").style.width = (hp / F.b.hp * 100) + "%"; q("[data-hpn]").textContent = K().fmtK(hp) + " / " + K().fmtK(F.b.hp);
    q("[data-co]").style.width = Math.max(0, F.co) + "%"; q("[data-bt]").textContent = Math.ceil(Math.max(0, F.t)) + "s";
    q("[data-weak]").hidden = F.weak <= 0; q("[data-warn]").hidden = F.st !== "wind";
    var d = q("[data-dodge]"); d.disabled = F.st !== "wind"; d.classList.toggle("ready", F.st === "wind");
    var a = q(".evo-bt-art"); a.classList.toggle("wind", F.st === "wind"); a.classList.toggle("stun", F.stun > 0);
    if (F.stun > 0 && F.st === "idle") say("STUNNED! Double damage!");
  }
  function hit() {
    if (!F) return; var d = Math.round(F.td * (F.tonic ? 1.6 : 1) * (F.stun > 0 ? 2 : 1)); F.taps++; hurt(d, "", null, null); sfx("coin");
    ui(); if (F.hp <= 0) win();
  }
  function onClick(e) {
    var t = e.target;
    if (t.closest("[data-weak]")) { if (F && F.weak > 0) { F.weak = 0; F.nw = 2.5 + Math.random() * 2; hurt(Math.round(F.td * 6 * (F.tonic ? 1.6 : 1)), "crit", 50, 45); sfx("open", "Epic"); ui(); if (F.hp <= 0) win(); } return; }
    if (t.closest("[data-hit]")) { hit(); return; }
    if (t.closest("[data-dodge]")) { if (F && F.st === "wind") { F.st = "idle"; F.nx = 6 + Math.random() * 3; F.stun = 2.5; sfx("streak"); pop("DODGED!", "good", 50, 30); say("Counter! The boss is stunned."); ui(); } return; }
    if (t.closest("[data-tonic]")) { tonic = !tonic; var b = t.closest("[data-tonic]"); b.setAttribute("aria-pressed", tonic); b.classList.toggle("on", tonic); return; }
    if (t.closest("[data-fight]")) { start(); return; }
    if (t.closest("[data-again]")) { prep(Number($("evoBt").dataset.i)); return; }
    if (t.closest("[data-leave]") || t.closest("[data-flee]")) { close(); render(); return; }
  }
  function lose(why) {
    var b = F.b, pct = Math.floor((1 - Math.max(0, F.hp) / b.hp) * 100); clearInterval(iv); iv = 0; F = null; sfx("tear");
    $("evoBt").innerHTML = '<div class="evo-bt-box"><div class="evo-bt-pic lost">' + art(b) + '</div><h3>Not this time</h3><p class="evo-bt-tag">' + why + ' You dealt ' + pct + '% of its health.</p><ul class="evo-bt-facts"><li>Evolve creatures and build landmarks to hit harder</li><li>Swamp Tonic adds +60% damage</li><li>Hit every weak spot and every Dodge</li></ul><button type="button" class="btn" data-again>Try again</button><button type="button" class="btn ghost" data-leave>Back</button></div>';
  }
  function win() {
    var b = F.b, S = K().S(), r = S.bo[b.id] || (S.bo[b.id] = { k: 0, t: 0 }), first = !r.k, ess = 0; clearInterval(iv); iv = 0; F = null;
    r.k++; r.t = Date.now();
    if (first) { try { Crystals.grant(b.cry); } catch (e) {} try { load(); meta.coins = (meta.coins || 0) + b.coins; save(); } catch (e) {} }
    else { ess = rematchEss(); S.ess += ess; S.tot += ess; }
    K().save(true); K().renderAll(); close();
    var lines = first ? ["+" + b.coins + " Swamp Coins", "+" + b.cry + " Swamp Crystals", "Trophy: +10% production, forever"] : ["+" + K().fmtK(ess) + " Essence", "Rematch again in 10 minutes"];
    if (K().fx()) K().fx().cine($("evoStage"), { kind: "realm", color: b.c, art: '<span class="cn-boss">' + art(b) + '</span>', kicker: first ? "Boss defeated" : "Rematch won", title: b.n + " falls!", sub: b.tag, lines: lines, btn: "Victory!", sound: function () { sfx("rise"); setTimeout(function () { sfx("open", "Legendary"); }, 700); } });
    else K().toast(b.n + " defeated! " + lines.join(", "), true);
  }

  // cooldown labels count down; the card flips to "Rematch" when it ends
  setInterval(function () {
    var el = $("pane-boss"); if (!el || el.hidden || !K()) return;
    var c = el.querySelectorAll("[data-bcool]"); if (!c.length) return;
    var cool = BOSS.map(info).filter(function (n) { return n.st === "cool"; });
    Array.prototype.forEach.call(c, function (x, i) { if (cool[i]) x.textContent = clock(cool[i].left / 1000); });
    if (BOSS.some(function (b) { return info(b).st === "ready" && info(b).r.k; }) && el.querySelector("[data-bcool]")) render();
  }, 1000);
  document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-boss]"); if (b) prep(Number(b.dataset.boss)); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !F && $("evoBt") && !$("evoBt").hidden) { close(); render(); } });

  window.EvoBoss = { render: render, ready: ready, list: BOSS };
})();
