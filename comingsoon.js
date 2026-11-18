/* Coming-soon lock for SwampRealms: Adventure on the official site.
   Only the live domain is locked; preview builds (*.workers.dev, localhost) stay playable for testing.
   To open the game again, set LOCKED = false (or delete this file's <script> tags). */
(function () {
  var LOCKED = true;
  var h = location.hostname.toLowerCase();
  var live = h === "swamprealms.com" || h === "www.swamprealms.com";
  if (!LOCKED || !live) return;

  var onGame = /\/sandbox(\.html)?\/?$/.test(location.pathname);
  if (onGame) {
    try { window.stop(); } catch (e) {}
    location.replace("coming-soon.html");
    return;
  }

  // Everywhere else: turn the Play buttons into "Coming soon" links to a locked page.
  function relabel() {
    var links = document.querySelectorAll('a[href^="sandbox.html"]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      a.setAttribute("aria-label", "Adventure is coming soon");
      a.addEventListener("click", function (ev) { ev.preventDefault(); location.href = "coming-soon.html"; });
      var t = a.querySelector("b,.dhPlayT2,span:last-child") || a;
      var small = a.querySelector("small");
      if (a.classList.contains("dh-play")) { var b = a.querySelector("b"); if (b) b.textContent = "Coming soon"; if (small) small.textContent = "Under construction"; }
      else if (/Play/i.test(a.textContent)) { var s = a.querySelector("span:last-child"); if (s && a.classList.contains("tb-play")) s.textContent = "Soon"; else if (!a.querySelector("*")) a.textContent = "Adventure: coming soon"; }
    }
    var big = document.querySelectorAll(".feat-delve");
    for (var j = 0; j < big.length; j++) big[j].setAttribute("aria-label", "SwampRealms: Adventure is coming soon");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", relabel); else relabel();
  window.addEventListener("load", function () { setTimeout(relabel, 300); });
})();
