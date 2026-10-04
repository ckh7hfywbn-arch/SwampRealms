// ===== SwampVerse accounts: sign in + cloud save =====
// Load AFTER cards.js and store.js on every page:
//   <script src="cards.js"></script><script src="store.js"></script><script src="account.js"></script>
// The game keeps saving to localStorage exactly as before. This file copies that save to the
// visitor's account (via /api/*, see worker.js) and pulls it back on a new device.
(function () {
  "use strict";
  var LS = { cards: "swamp-cards-v1", packs: "swamp-packs-v1", crystals: "swamp-crystals-v1" };
  var SYNC = "swamp-sync-v1";   // this device's link to the account: {user, rev, base}
  var KEYS = [LS.cards, LS.packs, LS.crystals];

  function rd(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  // JSON with sorted keys, so two saves with the same content always compare equal
  function canon(v) {
    return JSON.stringify(v, function (k, x) {
      if (x && typeof x === "object" && !Array.isArray(x)) return Object.keys(x).sort().reduce(function (o, y) { o[y] = x[y]; return o; }, {});
      return x;
    });
  }
  function local() { return { cards: rd(LS.cards) || {}, packs: rd(LS.packs) || {}, crystals: rd(LS.crystals) || {} }; }

  var S = Object.assign({ user: "", rev: 0, base: "" }, rd(SYNC) || {});
  function saveS() { try { localStorage.setItem(SYNC, JSON.stringify(S)); } catch (e) {} }

  var ready = false, pushing = false, timer = 0, unavailable = false, pending = null, status = "", savedAt = 0;
  var rawSet = Storage.prototype.setItem;

  // Watch the game's own saves so we know when to upload
  Storage.prototype.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (this === localStorage && KEYS.indexOf(k) > -1) queue();
  };

  function queue() {
    if (!S.user || !ready || pending) return;
    clearTimeout(timer);
    timer = setTimeout(function () { push(false); }, 2500);
  }

  function isFresh(d) {
    return !Object.keys(d.cards).length && !(d.packs.coins > 0) && !(d.crystals.earned > 0) && !d.packs.lastClaim;
  }
  function summary(d) {
    var n = Object.keys(d.cards || {}).length;
    return n + (n === 1 ? " card" : " cards") + " · " + ((d.packs && d.packs.coins) || 0) + " coins · " + ((d.crystals && d.crystals.c) || 0) + " crystals";
  }

  function applyCloud(cloud) {
    rawSet.call(localStorage, LS.cards, JSON.stringify(cloud.data.cards || {}));
    rawSet.call(localStorage, LS.packs, JSON.stringify(cloud.data.packs || {}));
    rawSet.call(localStorage, LS.crystals, JSON.stringify(cloud.data.crystals || {}));
    S.rev = cloud.rev; S.base = canon(local()); saveS();
    location.reload();
  }

  async function api(method, path, body, keepalive) {
    var r = await fetch(path, {
      method: method, credentials: "same-origin", cache: "no-store", keepalive: !!keepalive,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    var j = null;
    try { j = await r.json(); } catch (e) {}
    return { status: r.status, body: j };
  }

  async function push(keepalive) {
    if (!S.user || !ready || pushing || pending) return true;
    var d = local(), c = canon(d);
    if (c === S.base) return true;
    pushing = true;
    var good = false;
    try {
      var r = await api("PUT", "/api/save", { data: d, baseRev: S.rev }, keepalive);
      if (r.status === 200) { S.rev = r.body.rev; S.base = c; saveS(); savedAt = Date.now(); status = "saved"; good = true; }
      else if (r.status === 409) { pushing = false; reconcile(r.body); paint(); return false; }
      else if (r.status === 401) { signedOut(); }
      else status = "error";
    } catch (e) { status = "offline"; }
    pushing = false;
    paint();
    if (good && canon(local()) !== S.base) queue();   // changed again while we were saving
    return good;
  }

  function signedOut() {
    S.user = ""; S.rev = 0; S.base = ""; saveS(); ready = false; status = "";
  }

  // Compare this device with the cloud save and decide what to do
  function reconcile(cloud) {
    var d = local(), c = canon(d);
    if (!cloud || !cloud.data) {                       // new account, nothing in the cloud yet
      S.rev = 0; S.base = ""; saveS(); ready = true; push(false); return;
    }
    if (S.rev === cloud.rev && S.base) {               // already in step
      ready = true; if (c !== S.base) push(false); return;
    }
    if (c === canon(cloud.data)) {                     // same content already
      S.rev = cloud.rev; S.base = c; saveS(); ready = true; return;
    }
    if ((S.base && c === S.base) || isFresh(d)) {      // nothing new here: just take the cloud copy
      applyCloud(cloud); return;
    }
    pending = { cloud: cloud, local: d };              // both sides have different progress: ask
    ready = false;
    paint(); openDialog();
  }

  async function init() {
    var r;
    try { r = await api("GET", "/api/me"); } catch (e) { ready = !!S.user; paint(); return; }   // offline: keep going as before
    if (r.status === 401 && r.body) { if (S.user) signedOut(); paint(); return; }
    if (r.status !== 200 || !r.body || !r.body.user) { unavailable = true; paint(); return; }
    if (S.user !== r.body.user.name) { S = { user: r.body.user.name, rev: 0, base: "" }; saveS(); }
    reconcile(r.body.save);
    paint();
  }

  async function authenticate(mode, username, password) {
    var r = await api("POST", mode === "up" ? "/api/register" : "/api/login", { username: username, password: password });
    if (r.status === 503) throw new Error("Accounts aren't switched on for this site yet.");
    if (r.status !== 200 || !r.body || !r.body.user) throw new Error((r.body && r.body.error) || "Something went wrong. Try again.");
    S = { user: r.body.user.name, rev: 0, base: "" }; saveS();
    reconcile(r.body.save);
  }

  async function logout() {
    clearTimeout(timer);
    if (S.user && ready) {
      await push(false);
      if (canon(local()) !== S.base && !confirm("Your latest progress hasn't been saved to your account yet. Sign out anyway and lose it?")) return;
    }
    try { await api("POST", "/api/logout", {}); } catch (e) {}
    KEYS.concat([SYNC]).forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    location.reload();
  }

  // ---------- UI ----------
  var btn, dlg, mode = "in", msg = "", busy = false;
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>';

  function paint() {
    if (btn) {
      if (S.user) {
        btn.className = "acct on";
        btn.innerHTML = "<b>" + esc(S.user.charAt(0).toUpperCase()) + "</b>";
        btn.setAttribute("aria-label", "Account: " + S.user);
      } else {
        btn.className = "acct out";
        btn.innerHTML = ICON + "<span>Sign in</span>";
        btn.setAttribute("aria-label", "Sign in to save your progress");
      }
    }
    if (dlg && dlg.open) render();
  }

  function ago() {
    if (!savedAt) return "";
    var s = Math.round((Date.now() - savedAt) / 1000);
    return s < 10 ? "just now" : s < 60 ? s + " seconds ago" : Math.round(s / 60) + " min ago";
  }

  function render() {
    var h = '<button class="pv-close" type="button" data-x aria-label="Close">&times;</button>';
    if (pending) {
      h += '<h3 id="acct-t">Which progress do you want?</h3>' +
        '<p class="acct-sub">This device and your account both have progress. Pick one to keep. The other is replaced.</p>' +
        '<div class="acct-cmp"><div><small>Your account</small><b>' + esc(summary(pending.cloud.data)) + '</b><button class="btn" type="button" data-use="cloud">Use account</button></div>' +
        '<div><small>This device</small><b>' + esc(summary(pending.local)) + '</b><button class="btn ghost" type="button" data-use="local">Use this device</button></div></div>';
    } else if (S.user) {
      var st = status === "saved" ? "Saved " + ago() : status === "offline" ? "Offline. Will save when you're back online." : status === "error" ? "Couldn't save. Will retry." : ready ? "Progress is saved to your account." : "Checking your account…";
      h += '<h3 id="acct-t">Hi, ' + esc(S.user) + '</h3><p class="acct-sub">Your cards, coins, crystals and avatar are saved to your account. Sign in on any device to keep playing.</p>' +
        '<p class="acct-st" aria-live="polite">' + esc(st) + '</p>' +
        '<div class="row"><button class="btn" type="button" data-save>Save now</button><button class="btn ghost" type="button" data-out>Sign out</button></div>' +
        '<p class="acct-fine">Signing out clears the game from this device. It stays safe in your account.</p>';
    } else {
      var up = mode === "up";
      h += '<h3 id="acct-t">' + (up ? "Create account" : "Sign in") + '</h3>' +
        '<p class="acct-sub">Save your progress and play on any device. Free, and no email needed.</p>' +
        '<div class="acct-tabs" role="tablist"><button type="button" role="tab" aria-selected="' + !up + '" data-mode="in">Sign in</button><button type="button" role="tab" aria-selected="' + up + '" data-mode="up">Create account</button></div>' +
        '<form class="acct-form" novalidate>' +
        '<label>Username<input name="u" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required></label>' +
        '<label>Password<input name="p" type="password" autocomplete="' + (up ? "new-password" : "current-password") + '" maxlength="200" required></label>' +
        (up ? '<p class="acct-fine">3 to 20 letters, numbers or underscores. Password: 8 or more characters. We don\'t collect an email, so a lost password can\'t be reset. Write it down.</p>' : '') +
        '<p class="acct-err" role="alert">' + esc(msg) + '</p>' +
        '<button class="btn" type="submit"' + (busy ? " disabled" : "") + '>' + (busy ? "Please wait…" : up ? "Create account" : "Sign in") + '</button></form>' +
        (unavailable ? '<p class="acct-err">Accounts aren\'t available right now. Your progress is still saved on this device.</p>' : "") +
        '<p class="acct-fine">Already playing without an account? Your progress on this device is added to your account.</p>';
    }
    dlg.innerHTML = h;
  }

  function openDialog() {
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "acct"; dlg.className = "acct-dlg"; dlg.setAttribute("aria-labelledby", "acct-t");
      document.body.appendChild(dlg);
      dlg.addEventListener("click", function (e) {
        var t = e.target;
        if (t === dlg) { if (!pending) dlg.close(); return; }
        if (!t.closest) return;
        if (t.closest("[data-x]")) { if (!pending) dlg.close(); return; }
        var m = t.closest("[data-mode]"); if (m) { mode = m.getAttribute("data-mode"); msg = ""; render(); return; }
        if (t.closest("[data-out]")) { logout(); return; }
        if (t.closest("[data-save]")) { status = ""; push(false); return; }
        var u = t.closest("[data-use]");
        if (u && pending) {
          var p = pending; pending = null;
          if (u.getAttribute("data-use") === "cloud") applyCloud(p.cloud);
          else { S.rev = p.cloud.rev; S.base = ""; saveS(); ready = true; push(false).then(function () { render(); }); }
        }
      });
      dlg.addEventListener("cancel", function (e) { if (pending) e.preventDefault(); });
      dlg.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (busy) return;
        var f = e.target, un = f.u.value.trim(), pw = f.p.value;
        if (!un || !pw) { msg = "Enter a username and password."; render(); return; }
        busy = true; msg = ""; render();
        try { await authenticate(mode, un, pw); }
        catch (err) { msg = err.message || "Something went wrong."; }
        busy = false; paint(); render();
        if (S.user && !pending && dlg.open) setTimeout(function () { if (!pending && dlg.open) dlg.close(); }, 700);
      });
    }
    render();
    if (!dlg.open) dlg.showModal();
  }

  function mount() {
    var nav = document.querySelector("header nav");
    if (!nav) return;
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "acctbtn";
    btn.addEventListener("click", openDialog);
    var snd = document.getElementById("snd");
    if (snd) nav.insertBefore(btn, snd); else nav.appendChild(btn);
    paint();
  }

  // Save right before the page goes away, and when the connection comes back
  addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") { clearTimeout(timer); push(true); } });
  addEventListener("pagehide", function () { clearTimeout(timer); push(true); });
  addEventListener("online", function () { push(false); });

  mount();
  init();
})();
