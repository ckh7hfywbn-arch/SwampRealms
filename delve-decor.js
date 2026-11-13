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
    plate: { cat: "tableware", slots: [S("on", "top", 2, 22, 2, ["food"], { step: 4, cap: 1 })] },
    x_plate: { cat: "tableware", slots: [S("on", "top", 1, 23, 2, ["food"], { step: 2, cap: 2 })] }
  };
  // FOOD you already carry can be set out on a table or a plate (drawn at half size: a whole loaf on a plate, not a loaf the size of a chair)
  ["breadloaf", "berrypie", "cheesewheel", "fishpie", "carrotcake", "rainbowcake", "roastcarrot", "bakedpotato", "grilledfish", "omelette", "starpancakes", "swampsushi",
    "redcap", "icecap", "carrot", "potato", "frostberry", "truffle", "duckegg", "grilledmeat", "skewer", "bogkebab", "butter", "swampsalad"].forEach(function (k) { ITEM[k] = { cat: "food", sc: 0.5 }; });
  ["jamjar", "honeyjar", "milkjug", "pickles"].forEach(function (k) { ITEM[k] = { cat: "bottle", sc: 0.55 }; });
  // WALL PIECES go on any back wall at half-block steps (left, right, up), not just on a whole block
  ["painting", "plaque", "mirror", "worldmap", "fishtrophy", "wreath", "sign", "tapestry_swamp", "tapestry_ember", "tapestry_frost", "crossedswords", "bugtrophy", "frogtrophy", "battrophy", "wolftrophy",
    "gatortrophy", "shield", "antlers", "wyrmskull", "alphapelt", "cuckooclock", "dartboard", "fanart", "elderportrait", "sundisc", "starchart", "moonmirror", "spellscroll", "shieldwall", "dwarfaxes",
    "hangingherbs", "windchime", "birdcage"].forEach(function (k) { ITEM[k] = { cat: "wall" }; });
  ["rug", "furrug"].forEach(function (k) { ITEM[k] = { cat: "rug" }; });   // RUGS lie on the floor under furniture (Stage 5)
  CATS.rug = "Rugs";
  var FLOOR = { size: [1, 1], slots: [S("floor", "floor", -16, 48, 32, ["rug"], { step: 16, cap: 2, layer: -1 })] };   // one floor cell: a rug can sit half a block either side
  var WALL = { size: [1, 1], slots: [S("wall", "wall", -16, 48, 30, ["wall"], { step: 16, cap: 2, layer: 0 })] };   // one back-wall cell: a piece can sit half a block either side, or half a block up

  // ---------- the object layer ----------
  // store (lives in the world save as S.deco): { n: next id, o: { id: rec } }
  // rec: { id, k: item, p: parent ("t:x,y" a furniture anchor, or "d:id" a decoration), s: slot id, o: offset along the slot (art px),
  //        f: 1 if flipped, v: variant, r: pose, st: state }
  // env (from sandbox.js): get(x, y) -> tile id, itemAt(x, y) -> item key of the furniture whose anchor is there (or ""),
  //   flipAt(x, y) -> 1 if that piece is flipped, size(k) -> [wpx, hpx] of a decoration's art
  function create(store, env) {
    if (!store || typeof store !== "object") store = {};
    if (!(store.n > 0)) store.n = 1; if (!store.o || typeof store.o !== "object") store.o = {};
    var O = store.o, kids = {}, idx = null, gen = 0;

    function parentDef(pk) {   // the definition of whatever this parent key points at, or null
      if (typeof pk !== "string") return null;
      if (pk.charAt(0) === "t") { var xy = pk.slice(2).split(","), x = +xy[0], y = +xy[1], k = env.itemAt(x, y); return k && FURN[k] ? { k: k, def: FURN[k], x: x, y: y } : null; }
      if (pk.charAt(0) === "d") { var r = O[pk.slice(2)]; return r && ITEM[r.k] && ITEM[r.k].slots ? { k: r.k, def: ITEM[r.k], rec: r } : null; }
      if (pk.charAt(0) === "g") { var gy = pk.slice(2).split(","); return env.floorAt && env.floorAt(+gy[0], +gy[1]) ? { k: "floor", def: FLOOR, x: +gy[0], y: +gy[1] } : null; }
      if (pk === "c:dcarry") { var dk = env.dcarry ? env.dcarry() : ""; return dk && ITEM[dk] && ITEM[dk].slots ? { k: dk, def: ITEM[dk], carry: 1 } : null; }   // a decoration being moved: what was on it waits
      if (pk.charAt(0) === "w") { var wy = pk.slice(2).split(","); return env.wallAt && env.wallAt(+wy[0], +wy[1]) ? { k: "wall", def: WALL, x: +wy[0], y: +wy[1] } : null; }
      if (pk === "c:carry") { var ck = env.carry ? env.carry() : ""; return ck && FURN[ck] ? { k: ck, def: FURN[ck], carry: 1 } : null; }   // a piece of furniture being moved: its things wait on it
      return null;
    }
    function slotOf(pk, sid) { var pd = parentDef(pk); if (!pd) return null; var L = pd.def.slots || []; for (var i = 0; i < L.length; i++) if (L[i].id === sid) return L[i]; return null; }
    function wOf(k) { var d = ITEM[k], s = env.size ? env.size(k) : null; return d && d.w ? d.w : s ? Math.max(2, Math.round(s[0] * (d && d.sc || 1))) : 16; }
    function hOf(k) { var d = ITEM[k], s = env.size ? env.size(k) : null; return d && d.h ? d.h : s ? Math.max(2, Math.round(s[1] * (d && d.sc || 1))) : 16; }
    function relink() { kids = {}; for (var id in O) { var r = O[id]; (kids[r.p] = kids[r.p] || []).push(r); } idx = null; }
    function childrenOf(pk) { return kids[pk] || []; }
    function depth(rec) { var d = 0, r = rec; while (r && r.p && r.p.charAt(0) === "d" && d < 6) { r = O[r.p.slice(2)]; d++; } return d; }

    // can item k go in slot sid of parent pk at offset o (ignoring the record "except", when moving one)? returns "" or why not
    function check(pk, sid, k, o, except, oy) {
      var it = ITEM[k]; if (!it) return "That can't go on furniture.";
      var sl = slotOf(pk, sid); if (!sl) return "Nothing to put it on there.";
      if (sl.cats.indexOf(it.cat) < 0) return "That doesn't go there.";
      var w = wOf(k); if (w > sl.max) return "Too wide for that spot.";
      if (sl.maxh && hOf(k) > sl.maxh + 4) return "Too tall for that shelf.";
      if (!(o >= 0) || o + w > sl.x1 - sl.x0 + 0.5) return "It doesn't fit there.";
      if (pk.charAt(0) === "d") { var pr = O[pk.slice(2)]; if (!pr || depth(pr) >= 3) return "Can't stack that deep."; }
      var here = childrenOf(pk).filter(function (q) { return q.s === sid && q !== except; });
      if (here.length >= sl.cap) return "That spot is full.";
      for (var i = 0; i < here.length; i++) { var q = here[i], qw = wOf(q.k);
        if (sl.surf === "wall") { var a0 = oy | 0, a1 = a0 + hOf(k), b0 = q.oy | 0, b1 = b0 + hOf(q.k); if (!(a0 < b1 - 1 && b0 < a1 - 1)) continue; }
        if (o < q.o + qw - 1 && q.o < o + w - 1) return "Something is already there."; }
      return "";
    }
    function add(pk, sid, k, o, extra) {
      var why = check(pk, sid, k, o, null, extra && extra.oy); if (why) return { ok: false, why: why };
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
      if (rec.p.charAt(0) === "g") { var gxy = rec.p.slice(2).split(","), gx0 = +gxy[0], gy0 = +gxy[1]; return { x: gx0 + (sl.x0 + rec.o) / U, y: gy0 + 1, w: w / U, h: h / U, f: rec.f | 0, layer: -1, d: 0 }; }
      if (rec.p.charAt(0) === "w") {   // on a back wall: o along, oy up from the cell's bottom
        var wxy = rec.p.slice(2).split(","), wx0 = +wxy[0], wy0 = +wxy[1];
        return { x: wx0 + (sl.x0 + rec.o) / U, y: wy0 + 1 - (U - sl.y + (rec.oy | 0)) / U, w: w / U, h: h / U, f: rec.f | 0, layer: 0, d: 0 };
      }
      if (rec.p.charAt(0) === "c") return null;   // being carried: not in the world
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
      if (idx) return idx; idx = {}; gen++;
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
    // LOCATE: aiming at world point (wx, wy) with item k on parent pk: the best slot and snapped offset, and whether it fits
    function locate(pk, wx, wy, k) {
      var pd = parentDef(pk); if (!pd) return null; var it = ITEM[k]; if (!it) return null; var w = wOf(k), h = hOf(k), best = null;
      (pd.def.slots || []).forEach(function (sl) {
        if (sl.cats.indexOf(it.cat) < 0) return;
        var ox0, sy, pw, fl = 0, span = sl.x1 - sl.x0;
        if (pd.rec) { var pw2 = where(pd.rec); if (!pw2) return; pw = wOf(pd.rec.k); fl = pw2.f; ox0 = pw2.x; sy = pw2.y - (hOf(pd.rec.k) - sl.y) / U; }
        else if (pd.k === "wall" || pd.k === "floor") { ox0 = pd.x; sy = pd.y + 1 - (U - sl.y) / U; pw = U; }
        else { var d = pd.def; pw = d.size[0] * U; fl = env.flipAt ? env.flipAt(pd.x, pd.y) : 0; ox0 = pd.x; sy = (pd.y + 1) - (d.size[1] * U - sl.y) / U; }
        var lx = (wx - ox0) * U; if (fl) lx = pw - lx;   // into the piece's own (unflipped) pixels
        var o = Math.round((lx - sl.x0 - w / 2) / sl.step) * sl.step; o = Math.max(0, Math.min(span - w, o)); if (span - w < 0) o = 0;
        var oy = 0; if (sl.surf === "wall") { oy = Math.round(((sy - wy) * U - h / 2) / 16) * 16; oy = Math.max(0, Math.min(16, oy)); }
        var flat = sl.surf === "wall" || sl.surf === "floor", dy = flat ? 0 : Math.abs(wy - sy); if (!flat && (dy > 1.1 || lx < sl.x0 - 12 || lx > sl.x1 + 12)) return;
        var why = check(pk, sl.id, k, o, null, oy), sc = dy + (why ? 5 : 0);
        if (!best || sc < best.sc) best = { pk: pk, sid: sl.id, o: o, oy: oy, why: why, sc: sc, sl: sl };
      });
      return best;
    }
    function slotSpans(pk) {   // each slot of a parent as world lines {x0, x1, y, sl} (for drawing where things can go)
      var pd = parentDef(pk), out = []; if (!pd || pd.carry) return out;
      (pd.def.slots || []).forEach(function (sl) { var x0, x1, y;
        if (pd.rec) { var pw = where(pd.rec); if (!pw) return; var pwd = wOf(pd.rec.k); x0 = pw.f ? pw.x + (pwd - sl.x1) / U : pw.x + sl.x0 / U; x1 = x0 + (sl.x1 - sl.x0) / U; y = pw.y - (hOf(pd.rec.k) - sl.y) / U; }
        else if (pd.k === "wall" || pd.k === "floor") { x0 = pd.x + sl.x0 / U; x1 = pd.x + sl.x1 / U; y = pd.y + 1 - (U - sl.y) / U; }
        else { var d = pd.def, fl = env.flipAt ? env.flipAt(pd.x, pd.y) : 0, W2 = d.size[0] * U; x0 = pd.x + (fl ? W2 - sl.x1 : sl.x0) / U; x1 = x0 + (sl.x1 - sl.x0) / U; y = (pd.y + 1) - (d.size[1] * U - sl.y) / U; }
        out.push({ x0: x0, x1: x1, y: y, sl: sl }); });
      return out;
    }
    function count() { return Object.keys(O).length; }
    function all() { var a = []; for (var id in O) a.push(O[id]); return a; }
    relink();
    return { store: store, check: check, add: add, remove: remove, removeParent: removeParent, reparent: reparent, children: childrenOf, subtree: subtree,
      where: where, locate: locate, slotSpans: slotSpans, inView: inView, hit: hit, validate: validate, count: count, all: all, slotOf: slotOf, parentDef: parentDef, dirty: function () { idx = null; }, gen: function () { index(); return gen; }, wOf: wOf, hOf: hOf };
  }

  var api = { U: U, CATS: CATS, FURN: FURN, ITEM: ITEM, create: create };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DelveDecor = api;
})(typeof window !== "undefined" ? window : this);
