// ===== SwampVerse header menu =====
// Load LAST, after cards.js, store.js and account.js:
//   <script src="cards.js"></script><script src="store.js"></script><script src="account.js"></script><script src="menu.js"></script>
// Header keeps: logo, coin + crystal counters, account button, and a hamburger.
// The hamburger opens a dropdown with every page link, your avatar, and the sound switch.
// Links are read from the header nav in each page's HTML, so adding a link there adds it here.
(function () {
  "use strict";
  var header = document.querySelector("header");
  var nav = header && header.querySelector("nav");
  if (!nav || document.getElementById("menubtn")) return;

  var I = function (p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>"; };
  var ICONS = {
    "index.html": I('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>'),
    "catalog.html": I('<rect x="4" y="5" width="11" height="15" rx="2"/><path d="M9 3h8a2 2 0 012 2v12"/>'),
    "arcade.html": I('<rect x="2.5" y="7" width="19" height="11" rx="5"/><path d="M8 10.5v4M6 12.5h4"/><circle cx="15.5" cy="11.5" r=".8"/><circle cx="18" cy="13.5" r=".8"/>'),
    "shop.html": I('<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 016 0v2"/>'),
    "herd": I('<circle cx="7" cy="9" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="17" cy="9" r="2"/><path d="M12 12c-3 0-5 2.5-5 5 0 2 1.7 2.5 5 2.5s5-.5 5-2.5c0-2.5-2-5-5-5z"/>'),
    "avatar.html": ""
  };
  var iconFor = function (href) { return ICONS[/#herd/.test(href) ? "herd" : href.replace(/#.*/, "")] || ICONS["index.html"]; };

  // 1. Collect the page links (Home, Packs, Arcade, Shop, Herd, Avatar) from the nav, once each
  var seen = {}, links = [];
  nav.querySelectorAll("a.hide").forEach(function (a) {
    var h = a.getAttribute("href");
    if (seen[h]) return;
    seen[h] = 1;
    links.push({ href: h, text: a.textContent.trim(), current: a.getAttribute("aria-current") === "page" });
  });

  // 2. Build the dropdown
  var menu = document.createElement("div");
  menu.id = "sitemenu";
  menu.className = "sitemenu";
  menu.hidden = true;
  var html = '<ul class="sm-list" role="list">';
  links.forEach(function (l) {
    if (/avatar\.html/.test(l.href)) {
      html += '<li><a class="sm-item sm-av" href="' + l.href + '"' + (l.current ? ' aria-current="page"' : "") + '><span class="avbtn" id="avbtn"></span><span class="sm-t">' + l.text + "</span></a></li>";
    } else {
      html += '<li><a class="sm-item" href="' + l.href + '"' + (l.current ? ' aria-current="page"' : "") + ">" + iconFor(l.href) + '<span class="sm-t">' + l.text + "</span></a></li>";
    }
  });
  html += '</ul><div class="sm-sep"></div><div class="sm-item sm-snd" id="sm-snd"><span class="sm-t">Sound</span></div>';
  menu.innerHTML = html;
  header.appendChild(menu);

  // 3. Move the avatar picture's paint target (store.js paints #avbtn) and the sound button into the menu
  var oldAv = nav.querySelector("a.avbtn");
  if (oldAv) oldAv.remove();
  if (typeof paintAv === "function") { try { paintAv(); } catch (e) {} }
  var snd = document.getElementById("snd");
  var sndRow = menu.querySelector("#sm-snd");
  if (snd) {
    sndRow.appendChild(snd);
    sndRow.addEventListener("click", function (e) { if (!snd.contains(e.target)) snd.click(); });
  } else sndRow.remove(), menu.querySelector(".sm-sep").remove();

  // 4. Remove the old inline text links, then order the header: counters, account, hamburger
  nav.querySelectorAll("a.hide").forEach(function (a) { a.remove(); });
  var burger = document.createElement("button");
  burger.type = "button";
  burger.id = "menubtn";
  burger.className = "menubtn";
  burger.setAttribute("aria-label", "Menu");
  burger.setAttribute("aria-expanded", "false");
  burger.setAttribute("aria-controls", "sitemenu");
  burger.setAttribute("aria-haspopup", "true");
  burger.innerHTML = '<span class="mb-bars" aria-hidden="true"><i></i><i></i><i></i></span>';
  ["a.bank:not(.cry)", "a.bank.cry", "#acctbtn"].forEach(function (sel) {
    var el = nav.querySelector(sel) || document.querySelector(sel);
    if (el) nav.appendChild(el);
  });
  nav.appendChild(burger);

  // 5. Open / close
  var isOpen = false;
  function items() { return Array.prototype.slice.call(menu.querySelectorAll("a.sm-item, #snd")); }
  function setOpen(v, focusBurger) {
    if (v === isOpen) return;
    isOpen = v;
    burger.setAttribute("aria-expanded", String(v));
    burger.classList.toggle("open", v);
    if (v) {
      menu.hidden = false;
      void menu.offsetWidth;
      menu.classList.add("show");
    } else {
      menu.classList.remove("show");
      setTimeout(function () { if (!isOpen) menu.hidden = true; }, 180);
      if (focusBurger) burger.focus();
    }
  }
  burger.addEventListener("click", function () { setOpen(!isOpen); });
  document.addEventListener("click", function (e) { if (isOpen && !menu.contains(e.target) && !burger.contains(e.target)) setOpen(false); });
  menu.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("a.sm-item")) setOpen(false); });
  document.addEventListener("keydown", function (e) {
    if (!isOpen) return;
    if (e.key === "Escape") { setOpen(false, true); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      var list = items(), i = list.indexOf(document.activeElement);
      e.preventDefault();
      list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length].focus();
    }
  });
  // opening the account popup, or resizing, tidies the menu away
  var acct = document.getElementById("acctbtn");
  if (acct) acct.addEventListener("click", function () { setOpen(false); });
  // only close when the width really changes (rotating the phone). Scrolling on mobile resizes the
  // window height as the browser bars slide away, and that must not slam the menu shut.
  var lastW = innerWidth;
  addEventListener("resize", function () { if (innerWidth !== lastW) { lastW = innerWidth; setOpen(false); } });
  addEventListener("pageshow", function () { setOpen(false); });
})();
