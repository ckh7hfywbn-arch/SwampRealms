// DELVE DECOR: the decorating system's rules and its object layer (Stage 2 of DECORATING-PLAN.md).
//
// Furniture stays as tiles in the world grid. Decorations (candles, books, plates, food, pillows...) are small RECORDS that hang off a
// parent: a furniture piece (by its anchor tile) or another decoration (nesting). Each record remembers its parent, which slot of the
// parent it sits in and its offset along that slot, so moving the parent moves its whole subtree for free.
//
// Everything is measured in ART PIXELS: 32 to a block, the same grid the HD furniture art is painted on (delve-furniture.js), so a
// slot's numbers can be read straight off the furniture's picture. A slot's step (16 = half a block, 8 = a quarter) is how far a
// decoration moves per nudge.
//
// This file holds no drawing and no input: sandbox.js gives it a few helpers (what tile is where, which way a piece is flipped) and
// asks it questions. It is plain data plus small functions, so it can be tested on its own (module.exports at the bottom).
(function (root) {
  "use strict";
  var U = 32;   // art pixels per block

  // ---------- categories a slot can accept ----------
  var CATS = {
    light: "Candles & lamps", tableware: "Plates, cups & pots", food: "Food", book: "Books & papers", plant: "Plants & vases",
    small: "Small curios", cloth: "Cloths & pillows", wall: "Wall pieces", trophy: "Trophies & statues", bottle: "Bottles & jars"
  };

  // ---------- slot shorthands ----------
  // surf: top (things stand on it), inside (on a shelf behind the front), pillow (on a bed), wall (hung on it)
  // x0..x1: the usable span (art px from the piece's left edge, unflipped), y: the surface line (art px from the piece's top edge)
  // cats: what may go there, max: the widest thing (art px), cap: how many, step: nudge size (art px), layer: draw order within the piece
  function S(id, surf, x0, x1, y, cats, o) { o = o || {}; return { id: id, surf: surf, x0: x0, x1: x1, y: y, cats: cats, max: o.max || (x1 - x0), cap: o.cap || 8, step: o.step || 16, layer: o.layer || 1, maxh: o.maxh || 0 }; }
  var TOPS = ["light", "tableware", "food", "book", "plant", "small", "bottle", "trophy"], SHELF = ["book", "plant", "small", "bottle", "trophy", "light", "tableware"];

  // ---------- FURNITURE: pieces that offer slots (keyed by item) ----------
  // size [w, h] in blocks must match the piece's real size (FSIZE in sandbox.js); the slot numbers come off its HD art.
  var FURN = {
    table: { size: [2, 1], slots: [S("top", "top", 6, 58, 11, TOPS, { step: 8 })], poses: 1 },
    coffeetable: { size: [1, 1], slots: [S("top", "top", 3, 29, 17, TOPS, { step: 8, cap: 3 })] },
    sidetable: { size: [1, 1], slots: [S("top", "top", 5, 27, 10, TOPS, { step: 8, cap: 2 })] },
    nightstand: { size: [1, 1], slots: [S("top", "top", 4, 28, 9, TOPS, { step: 8, cap: 2 })] },
    desk: { size: [2, 1], slots: [S("top", "top", 4, 60, 10, TOPS, { step: 8 })] },
    counter: { size: [1, 1], slots: [S("top", "top", 2, 30, 5, TOPS, { step: 8, cap: 3 })] },
    dresser: { size: [1, 1], slots: [S("top", "top", 3, 29, 8, TOPS, { step: 8, cap: 3 })] },
    maptable: { size: [2, 1], slots: [S("top", "top", 6, 58, 12, TOPS, { step: 8 })] },
    jeweltable: { size: [2, 1], slots: [S("top", "top", 6, 58, 12, TOPS, { step: 8 })] },
    bench: { size: [2, 1], slots: [S("top", "top", 4, 60, 12, TOPS, { step: 8 })] },
    decorbench: { size: [2, 1], slots: [S("top", "top", 4, 60, 12, TOPS, { step: 8 })] },
    masontable: { size: [2, 1], slots: [S("top", "top", 4, 60, 12, TOPS, { step: 8 })] },
    wardrobe: { size: [1, 2], slots: [S("top", "top", 3, 29, 2, ["plant", "small", "light", "bottle", "book"], { step: 8, cap: 2 })] },
    bookshelf: { size: [1, 2], slots: [S("s1", "inside", 4, 28, 17, SHELF, { step: 8, cap: 3, maxh: 12 }), S("s2", "inside", 4, 28, 31, SHELF, { step: 8, cap: 3, maxh: 12 }), S("s3", "inside", 4, 28, 45, SHELF, { step: 8, cap: 3, maxh: 12 }), S("s4", "inside", 4, 28, 59, SHELF, { step: 8, cap: 3, maxh: 12 }), S("top", "top", 2, 30, 1, ["plant", "small", "light", "bottle", "trophy"], { step: 8, cap: 2 })] },
    potionshelf: { size: [1, 2], slots: [S("top", "top", 2, 30, 1, ["plant", "small", "light", "bottle"], { step: 8, cap: 2 })] },
    scrollshelf: { size: [1, 2], slots: [S("top", "top", 2, 30, 1, ["plant", "small", "light", "bottle"], { step: 8, cap: 2 })] },
    wallshelf: { size: [1, 1], slots: [S("top", "top", 2, 30, 18, SHELF, { step: 8, cap: 3 })] },
    cupboard: { size: [1, 1], slots: [S("top", "top", 2, 30, 11, TOPS, { step: 8, cap: 3 })] },
    hutch: { size: [1, 1], slots: [S("top", "top", 2, 30, 16, TOPS, { step: 8, cap: 3 })] },
    bed: { size: [2, 1], slots: [S("pillow", "pillow", 10, 24, 14, ["cloth"], { step: 4, cap: 2 }), S("quilt", "top", 24, 54, 13, ["cloth", "small"], { step: 8, cap: 3 })] },
    sofa: { size: [2, 1], slots: [S("seat", "pillow", 10, 54, 19, ["cloth", "small"], { step: 8, cap: 3 })] }
  };

  // ---------- DECORATIONS: things that go in slots (keyed by item) ----------
  // cat: its category, w/h: its size in art px (0 = measure from its art), slots: its own (nesting: a plate takes food)
  var ITEM = {
    tablecandle: { cat: "light" }, skullcandle: { cat: "light" }, candelabra: { cat: "light" }, oillamp: { cat: "light" }, lantern: { cat: "light" },
    fireflyjar: { cat: "bottle" }, glowjar: { cat: "bottle" }, slimejar: { cat: "bottle" }, aurorajar: { cat: "bottle" },
    openbook: { cat: "book" }, stackedbooks: { cat: "book" }, inkquill: { cat: "book" }, grimoire: { cat: "book" }, lorenote: { cat: "book" },
    teapot: { cat: "tableware" }, teaset: { cat: "tableware" }, cakestand: { cat: "food", slots: [] }, fruitbowl: { cat: "food" },
    lilyvase: { cat: "plant" }, bonsai: { cat: "plant" }, pottedfern: { cat: "plant" }, cattailvase: { cat: "plant" }, glowpot: { cat: "plant" },
    shipbottle: { cat: "small" }, musicbox: { cat: "small" }, frogidol: { cat: "trophy" }, goldfrog: { cat: "trophy" }, globe: { cat: "small" },
    crystalcluster: { cat: "small" }, radio: { cat: "small" }, cushion: { cat: "cloth" }, jewelbox: { cat: "small" }, lockbox: { cat: "small" },
    cookiejar: { cat: "food" }, breadbin: { cat: "food" }, queencrown: { cat: "trophy" }, swampheart: { cat: "trophy" }, zarukfig: { cat: "trophy" }, terrarium: { cat: "plant" },
    // (Stage 9 adds plates, cups, bottles, food, pillows and plush; a plate's own slot takes food, e.g.)
    plate: { cat: "tableware", slots: [S("on", "top", 2, 22, 2, ["food"], { step: 4, cap: 1 })] }
  };

  // ---------- the object layer ----------
  // store (lives in the world save as S.deco): { n: next id, o: { id: rec } }
  // rec: { id, k: item, p: parent ("t:x,y" a furniture anchor, or "d:id" a decoration), s: slot id, o: offset along the slot (art px),
  //        f: 1 if flipped, v: variant, r: pose, st: state }
  // env (from sandbox.js): get(x, y) -> tile id, itemAt(x, y) -> item key of the furniture whose anchor is there (or ""),
  //   flipAt(x, y) -> 1 if that piece is flipped, size(k) -> [wpx, hpx] of a decoration's art
  function create(store, env) {
    if (!store || typeof store !== "object") store = {};
    if (!(store.n > 0)) store.n = 1; if (!store.o || typeof store.o !== "object") store.o = {};
    var O = store.o, kids = {}, idx = null;

    function parentDef(pk) {   // the definition of whatever this parent key points at, or null
      if (typeof pk !== "string") return null;
      if (pk.charAt(0) === "t") { var xy = pk.slice(2).split(","), x = +xy[0], y = +xy[1], k = env.itemAt(x, y); return k && FURN[k] ? { k: k, def: FURN[k], x: x, y: y } : null; }
      if (pk.charAt(0) === "d") { var r = O[pk.slice(2)]; return r && ITEM[r.k] && ITEM[r.k].slots ? { k: r.k, def: ITEM[r.k], rec: r } : null; }
      return null;
    }
    function slotOf(pk, sid) { var pd = parentDef(pk); if (!pd) return null; var L = pd.def.slots || []; for (var i = 0; i < L.length; i++) if (L[i].id === sid) return L[i]; return null; }
    function wOf(k) { var d = ITEM[k], s = env.size ? env.size(k) : null; return d && d.w ? d.w : s ? s[0] : 16; }
    function hOf(k) { var d = ITEM[k], s = env.size ? env.size(k) : null; return d && d.h ? d.h : s ? s[1] : 16; }
    function relink() { kids = {}; for (var id in O) { var r = O[id]; (kids[r.p] = kids[r.p] || []).push(r); } idx = null; }
    function childrenOf(pk) { return kids[pk] || []; }
    function depth(rec) { var d = 0, r = rec; while (r && r.p && r.p.charAt(0) === "d" && d < 6) { r = O[r.p.slice(2)]; d++; } return d; }

    // can item k go in slot sid of parent pk at offset o (ignoring the record "except", when moving one)? returns "" or why not
    function check(pk, sid, k, o, except) {
      var it = ITEM[k]; if (!it) return "That can't go on furniture.";
      var sl = slotOf(pk, sid); if (!sl) return "Nothing to put it on there.";
      if (sl.cats.indexOf(it.cat) < 0) return "That doesn't go there.";
      var w = wOf(k); if (w > sl.max) return "Too wide for that spot.";
      if (sl.maxh && hOf(k) > sl.maxh + 4) return "Too tall for that shelf.";
      if (!(o >= 0) || o + w > sl.x1 - sl.x0 + 0.5) return "It doesn't fit there.";
      if (pk.charAt(0) === "d") { var pr = O[pk.slice(2)]; if (!pr || depth(pr) >= 3) return "Can't stack that deep."; }
      var here = childrenOf(pk).filter(function (q) { return q.s === sid && q !== except; });
      if (here.length >= sl.cap) return "That spot is full.";
      for (var i = 0; i < here.length; i++) { var q = here[i], qw = wOf(q.k); if (o < q.o + qw - 1 && q.o < o + w - 1) return "Something is already there."; }
      return "";
    }
    function add(pk, sid, k, o, extra) {
      var why = check(pk, sid, k, o); if (why) return { ok: false, why: why };
      var id = String(store.n++), rec = { id: id, k: k, p: pk, s: sid, o: Math.round(o) };
      if (extra) for (var e in extra) if (extra[e] !== undefined) rec[e] = extra[e];
      O[id] = rec; (kids[pk] = kids[pk] || []).push(rec); idx = null; return { ok: true, rec: rec };
    }
    function subtree(id) { var out = [], st = [id]; while (st.length) { var cur = st.pop(), r = O[cur]; if (!r) continue; out.push(r); childrenOf("d:" + cur).forEach(function (c) { st.push(c.id); }); } return out; }
    function remove(id) { var gone = subtree(id); gone.forEach(function (r) { delete O[r.id]; }); relink(); return gone; }   // the record and everything on it
    function removeParent(pk) { var gone = []; childrenOf(pk).slice().forEach(function (c) { gone = gone.concat(remove(c.id)); }); return gone; }
    function reparent(oldPk, newPk) { childrenOf(oldPk).forEach(function (c) { c.p = newPk; }); relink(); }   // a furniture piece moved: its things move with it

    // where a record sits in the world: { x, y } = the bottom-left of its art, in blocks (floats), plus w, h in blocks and its flip
    function where(rec) {
      var sl = slotOf(rec.p, rec.s); if (!sl) return null; var w = wOf(rec.k), h = hOf(rec.k);
      if (rec.p.charAt(0) === "t") {
        var xy = rec.p.slice(2).split(","), ax = +xy[0], ay = +xy[1], k = env.itemAt(ax, ay), d = FURN[k]; if (!d) return null;
        var pw = d.size[0] * U, ph = d.size[1] * U, fl = env.flipAt ? env.flipAt(ax, ay) : 0, lx = sl.x0 + rec.o;
        if (fl) lx = pw - lx - w;   // a flipped piece mirrors its slots
        return { x: ax + lx / U, y: (ay + 1) - (ph - sl.y) / U, w: w / U, h: h / U, f: fl ^ (rec.f | 0), layer: sl.layer + (sl.surf === "inside" ? -0.5 : 0), d: 0 };
      }
      var pr = O[rec.p.slice(2)]; if (!pr) return null; var pw2 = where(pr); if (!pw2) return null;
      var ph2 = hOf(pr.k), lx2 = sl.x0 + rec.o; if (pw2.f) lx2 = wOf(pr.k) - lx2 - w;
      return { x: pw2.x + lx2 / U, y: pw2.y - (ph2 - sl.y) / U, w: w / U, h: h / U, f: pw2.f ^ (rec.f | 0), layer: pw2.layer + 1, d: depth(rec) };
    }
    // the chunk index: 8 x 8 block cells -> the records whose art touches them (rebuilt only after a change)
    function index() {
      if (idx) return idx; idx = {};
      for (var id in O) { var r = O[id], w = where(r); if (!w) continue; r._w = w;
        for (var cy = Math.floor((w.y - w.h) / 8); cy <= Math.floor(w.y / 8); cy++) for (var cx = Math.floor(w.x / 8); cx <= Math.floor((w.x + w.w) / 8); cx++) { var key = cx + "," + cy; (idx[key] = idx[key] || []).push(r); } }
      return idx;
    }
    function inView(x0, y0, x1, y1) {   // records in this block rectangle, each once, in draw order (back to front)
      var I = index(), seen = {}, out = [];
      for (var cy = Math.floor(y0 / 8); cy <= Math.floor(y1 / 8); cy++) for (var cx = Math.floor(x0 / 8); cx <= Math.floor(x1 / 8); cx++) (I[cx + "," + cy] || []).forEach(function (r) { if (!seen[r.id]) { seen[r.id] = 1; out.push(r); } });
      return out.sort(function (a, b) { return (a._w.layer - b._w.layer) || (a._w.d - b._w.d) || (+a.id - +b.id); });
    }
    function hit(x, y) {   // the top-most record under a world point (blocks), or null
      var L = inView(x - 1, y - 1, x + 1, y + 1); for (var i = L.length - 1; i >= 0; i--) { var w = L[i]._w; if (x >= w.x && x <= w.x + w.w && y >= w.y - w.h && y <= w.y) return L[i]; } return null;
    }

    // LOAD CHECK: throw out malformed records, and hand back (not delete silently) any whose parent is gone, so sandbox.js can drop
    // them as items. Returns { bad: n malformed, orphans: [recs] }.
    function validate() {
      var bad = 0, orphans = [];
      for (var id in O) { var r = O[id];
        if (!r || typeof r !== "object" || typeof r.k !== "string" || typeof r.p !== "string" || typeof r.s !== "string" || !(r.o >= 0) || r.id !== id) { delete O[id]; bad++; continue; }
        if (r.p === "d:" + id) { delete O[id]; bad++; continue; }
        if (+id >= store.n) store.n = +id + 1;
      }
      relink();
      for (var guard = 0; guard < 8; guard++) {   // repeat: dropping a plate orphans the food on it
        var more = false;
        for (var id2 in O) { var r2 = O[id2];
          if (!ITEM[r2.k] || !slotOf(r2.p, r2.s)) { orphans.push(r2); delete O[id2]; more = true; continue; }
          var seen = {}, c = r2, loop = false; while (c && c.p.charAt(0) === "d") { if (seen[c.id]) { loop = true; break; } seen[c.id] = 1; c = O[c.p.slice(2)]; } if (loop) { orphans.push(r2); delete O[id2]; more = true; }
        }
        relink(); if (!more) break;
      }
      return { bad: bad, orphans: orphans };
    }
    function count() { return Object.keys(O).length; }
    function all() { var a = []; for (var id in O) a.push(O[id]); return a; }
    relink();
    return { store: store, check: check, add: add, remove: remove, removeParent: removeParent, reparent: reparent, children: childrenOf, subtree: subtree,
      where: where, inView: inView, hit: hit, validate: validate, count: count, all: all, slotOf: slotOf, parentDef: parentDef, dirty: function () { idx = null; }, wOf: wOf, hOf: hOf };
  }

  var api = { U: U, CATS: CATS, FURN: FURN, ITEM: ITEM, create: create };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DelveDecor = api;
})(typeof window !== "undefined" ? window : this);
