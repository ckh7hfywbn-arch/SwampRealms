# SwampRealms Decorating System: Stage 1 assessment and plan

13 Nov 2026 · Stage 1 of 9 (inspection and architecture). No game code changes in this stage.

## 1. Summary and decisions

The goal is a deep decorating system for Delve (the SwampRealms sandbox): furniture you can move, flip and turn; decorations that sit on, in, beside or against other furniture and move with it; nesting (table → plate → food); room styling; working furniture (sit, sleep, store, light, tell the time); a decorating panel; and saves that bring everything back exactly.

Decisions from you:
- **Where:** houses built block by block in the side-view world. The top-down homestead keeps working as it does now.
- **How free:** furniture stays on whole blocks; decorations sit at half-block steps (fine positioning in quarter-block steps where a slot allows it).

What this means in a side-view game:
- **Flip** = face left or right (already exists for decor; extended to all furniture).
- **Rotate** = switch between a piece's alternate poses where it has them, e.g. a painting landscape/portrait, a chair facing in or out, a shelf mounted on a wall or standing. Free spinning makes no sense for a side-view picture, so it is a per-piece option, not universal.

## 2. Architecture assessment (how the game works today)

**World.** `sandbox.js` (about 28,000 lines) plus `sandbox-world.js` (generation), `sandbox-extra.js` (extra tiles, items, decor art), `sandbox-cave.js`, `sandbox-ocean.js`. The world is a W×H grid of tile ids (`get/setT`), a back-wall grid (`hasW/setWall`), and per-world state `S`.

**Furniture today is tiles.** Every furniture or decor item is an `ITEMS[k]` entry with a `tile`; the tile (`TILES[id]`) carries `kind`, `solid`, `light`, `top` (a surface height that small pieces can stand on) and `small`.
- Placement rules: `canPlace` / `place`, with `put: "floor" | "wall"` and a one-level "small piece on a table/counter/shelf" rule (`td.small` on `td.top`).
- Flip: `S.dflip[index]`.
- Real-size pieces (added this week): `FSIZE`, `fpart` filler tiles, `fFit`, `fAnchor`, `fBreakParts`.
- Storage: containers keyed by `"x,y"` in `S.chests`.
- Beds: `trySleep`. Stations: furnace, loom, cook pot and so on, opened by tapping.

**Rendering.** Row-by-row cell drawing (`drawCell0` → `decoDraw` → `decoPart`), back walls first. Static natural terrain is cached in 8×8 chunks (`chk*`); furniture is drawn live each frame. The new HD art lives in `delve-furniture.js`, painted once per piece into a 32 px-per-block canvas. Lighting is a per-cell light grid (`LG`), with glows from `TILES[id].light`.

**Saves.**
- One localStorage key per world (`wkey(id)`), backed up to the account through `worker.js` into the D1 `delve` table (`cloudDirty`, `cloudInit`).
- World tiles are saved as a diff against the generated world (`edits`, written as `index:id`).
- Everything else (chests, flips, stats, farm) lives in `S` and is saved whole.

**Multiplayer.** A host-authoritative WebSocket room. Tile changes are batched as `{t:"set"}` and walls as `{t:"wall"}`. Guests send actions and the host applies them.

**UI.** HTML panels over the canvas (inventory, crafting with category tabs and chest-aware recipes, dev menu), with touch controls (`aim`, `CUR`) for phones.

## 3. Existing systems to reuse

- `ITEMS` / `TILES` definitions: furniture keeps its item and tile; new decorating data is added as fields, not a second item system.
- `canPlace` / `place` / `breakTile0` and the fpart multi-block code for furniture.
- `S.chests` for storage; `trySleep` for beds; the station panels for cooking and crafting.
- `S.dflip` for flipping; the placement preview (`ghost`) and the tap handler.
- HD art kit (`delve-furniture.js`) for all new decorations and variants.
- The save diff plus `S`, the cloud backup, and multiplayer set batches.
- The crafting panel's category tabs and search, as the starting point for the decorating panel.
- The dev menu, for test buttons.

## 4. Proposed design

### 4.1 Two layers
1. **Furniture stays as tiles** (tables, beds, cabinets, shelves, chests, stations, rugs, paintings). That keeps collision, lighting, chests, multiplayer and old saves working.
2. **A new decoration object layer** for everything that sits on, in, beside or against furniture: candles, plates, food, cups, books, vases, pillows, plush, small statues and similar.
   - Each object is a small record, not a tile, at half-block resolution (quarter-block where a slot allows).

### 4.2 Furniture definitions (`DECO_DEF`, keyed by item)
Data, not code. Each entry can declare:
- `size` and `layer` (rug, floor, furniture, wall);
- `flip` and `poses` (rotation);
- `variants` (colour or material);
- `interact` (sit, sleep, store, light, clock, display);
- `light`;
- `slots`: attachment points, each with:
  - a surface (`top`, `inside`, `front`, `wall`, `pillow`);
  - a position relative to the piece and a width;
  - allowed categories (`tableware`, `food`, `book`, `plant`, `light`, `small`, `cloth`);
  - a maximum object size and a capacity;
  - a draw layer, and a step (half or quarter block).

Decorations get the same kind of definition (`DECO_DEF.plate` has its own `top` slot that only takes `food`). That is what allows nesting, but only where a definition says so.

### 4.3 Decoration records (in the world save, `S.deco`)
`{ id, k (item), v (variant), f (flip), r (pose), p (parent id or tile anchor "x,y"), s (slot), o (offset in slot steps), st (state) }`.
- Objects are stored by **parent, not by world position**, so moving a table moves everything on it with no bookkeeping.
- A parent can be a furniture tile anchor (`"x,y"` of the piece) or another decoration (nesting).
- A spatial index by 8×8 chunk (the same size as the terrain chunks) makes drawing and hit-testing cheap.

### 4.4 Moving, removing, rebuilding
- **Move:** "pick up" a furniture piece. It and its whole subtree go onto the cursor, and are placed again as a unit (new anchor, same relative offsets).
- **Remove:** breaking a piece returns its children to your bag (or drops them, with a choice in the panel). Nothing is ever silently deleted.
- **Load check:** objects whose parent is missing (for example a table broken by an explosion or another player) drop to the floor as items. They are never lost or left invisible.

### 4.5 Drawing order
Back walls → wall decorations → rugs → furniture (existing row pass) → slot layers by depth → nested children → foreground and glows.
- Decoration objects are drawn in the furniture row pass, right after their parent's cell, sorted by slot layer then depth. Rows still overlap correctly.
- Pixel art stays crisp (pre-scaled canvases, as the HD furniture does now).

### 4.6 Decorating mode and panel
- A **Decorate** mode (button and key), with category tabs (Tables, Seating, Beds, Cabinets, Shelves, Storage, Plants, Lighting, Paintings, Wall, Rugs, Food, Books, Collectibles, Statues, Seasonal, Misc) and search.
- Each item shows a preview, description and count.
- While placing:
  - slots glow where the held item fits, and the item snaps to the nearest step;
  - **F** flips, **R** cycles poses, the arrow keys nudge, **Q / E** change layer, **Esc** cancels;
  - touch gets on-screen buttons for each of these.
- Selecting a placed object shows a small card with Move, Flip, Pose, Variant and Remove.
- Normal play controls are untouched outside Decorate mode.

### 4.7 Working furniture
- **Sit:** a new seat pose, using the slot position.
- **Sleep:** existing beds.
- **Store:** existing chests, extended to cabinets and wardrobes.
- **Read:** bookshelves open your lore and journal.
- **Light:** lamps switch on and off, reusing the light grid.
- **Clock:** shows the in-game time.
- **Trophies:** show the boss or achievement they came from.
- **Cook:** pots and stoves open the existing cooking.

## 5. Files

To change:
- `sandbox.js`: placement, drawing, input, save and load, multiplayer messages, panel, interactions.
- `sandbox-extra.js`: new decoration items, variants and any new tiles (always appended at the end so old tile numbers never change).
- `delve-furniture.js`: art for new decorations and variants.
- `sandbox.css` (panel), `sandbox.html` (script tags, version tags), `README.md`.

New:
- `delve-decor.js`: decoration definitions (slots, categories, nesting rules) and the object-layer logic (records, chunk index, tree moves, validation). This keeps the rule data in one place and out of the main file.
- `DECORATING-PLAN.md`: this plan, updated after every stage.

No database change is needed: decorations live inside the world save that is already backed up to the account.

## 6. Compatibility risks

- **Old saves.** `S.deco` is optional, and an old world simply has none. Existing small tiles on tables keep working; an optional dev button can convert them into decoration objects.
- **Tile numbers.** New tiles only go at the end of `sandbox-extra.js`; inserting one anywhere else would shuffle every saved world.
- **Multiplayer.** New messages (`deco.add`, `deco.move`, `deco.del`) go through the host like tile edits. Old clients ignore unknown messages, and guests never write decorations directly.
- **Save size.** Records are short (about 30 bytes each). Even 2,000 decorations add about 60 KB, well within limits; the save writer is already throttled.
- **Performance.** Only objects in visible chunks are drawn; art is cached per piece and variant, and there is no per-object update loop. A dev stress test (500 or more objects on screen) runs every stage.
- **Controls.** Decorate mode keeps its keys to itself, so nothing changes for normal play.
- **Breaking from outside** (explosions, earthquakes, another player): handled by the orphan check, which drops children as items.

## 7. Staged plan (one stage per session, give or take)

| Stage | What gets built | How it is tested |
|---|---|---|
| 1 (this) | Inspection, this plan | Read it, answer open questions |
| 2 | `delve-decor.js`: definitions (slots, categories, nesting), `S.deco` records, chunk index, load-time validation, dev buttons | Save/load a world with test objects; malformed data loads without errors |
| 3 | Placement for decorations: preview, slot glow and snapping, half and quarter steps, flip, poses, nudge, cancel; picking up and moving placed decorations | Test cases 1–4 below (table, candle, plate, food) |
| 4 | Moving furniture with everything on it; removing with children returned; nesting; wall slots for paintings, shelves, clocks | Test cases 5–8 |
| 5 | Drawing order and depth: rugs under furniture, layers, nested children, glows; performance pass | Test case 9, stress test with 1,000 objects |
| 6 | Decorate mode and panel: tabs, search, previews, counts, selection card, touch buttons | Use it on PC and phone sizes |
| 7 | Working furniture: sit, lamp switch, clock, bookshelf reading, cabinet storage, trophies; variants and recolours | Each interaction once, with feedback |
| 8 | Persistence hardening: cloud backup, multiplayer messages, migration of old small tiles, duplicate and orphan guards | Test cases 10–11, a two-player test |
| 9 | Full regression and polish: building, inventory, survival, multiplayer, phones; a new content pass (plates, food, cups, pillows, plush, curtains, flooring and wall variants) | Test cases 12–13, smoke test, sign-off |

Interior styling (flooring and wall materials, curtains, windows, themes) is spread across Stages 6, 7 and 9, because most of it is new items and variants on top of the system rather than new engine work.

### The 13 test scenarios from your spec (run in the stages above)
1. Place a table in a house.
2. Place a candle on the table.
3. Place a plate beside the candle.
4. Place food on the plate.
5. Move the table: everything on it moves.
6. Turn or flip the table: everything keeps its relative place.
7. Remove the table: its contents come back.
8. Place wall decorations.
9. Furniture on rugs layers correctly.
10. Leave and reconnect.
11. Everything returns in place.
12. Many pieces and lots of decorations, with performance checked.
13. Regression check on building, inventory, survival and multiplayer.

## 8. Decisions on the open questions (13 Nov)
1. **Broken furniture:** its decorations go straight to the breaker's bag, or drop on the floor as items if the bag is full.
2. **Multiplayer:** anyone in the room can place, move, take or break decorations (same as blocks today). No ownership or trust list; players choose who they play with.

## Progress log

### Stage 2: done (13 Nov)
What changed:
- **New file `delve-decor.js`.**
  - Category list (`CATS`).
  - Furniture slot definitions (`FURN`): table, coffee table, side table, nightstand, desk, counter, dresser, map table, jeweler's table, both workbenches, mason's table, wardrobe top, bookshelf (4 shelves and a top), potion and scroll shelf tops, wall shelf, cupboard, hutch, bed (pillow and quilt), sofa seat.
  - Decoration definitions (`ITEM`): about 40 existing small pieces, each with a category. `plate` has its own food slot, which proves nesting.
  - The object layer (`create`): add with checks (category, width, shelf height, capacity, overlap, nesting depth), remove a subtree, remove everything on a parent, reparent (for moving furniture), world position (follows flips and nesting), an 8×8 chunk index with view queries and hit-testing, and a load validator.
- **`sandbox.js`.**
  - `S.deco` is part of the world save and is swapped per dimension (added to `DIMK`).
  - `decoInit` runs every time a world is built. It removes malformed records and drops records whose furniture is gone as items where the furniture was, so nothing is lost silently.
  - Breaking furniture sends everything on it to your bag (`decoOnBreak`; it drops if the bag is full).
  - Decorations are drawn from their HD art, cropped tight to their pixels, on top of their furniture. Exact depth comes in Stage 5.
  - Flipping a piece flips what stands on it.
- **Dev menu > Open:** "Decor test: dress the nearest table or shelf", "Decor test: reload check (adds 2 broken records)", "Decor test: clear every decoration".

How to test:
1. Build a table, bookshelf or bed, stand next to it and press "dress".
2. Reload the page: the decorations come back.
3. Press "reload check": the broken records are removed and the orphan drops as an item.
4. Break the table: its things land in your bag.

Not done yet (later stages): placing decorations by hand (Stage 3), moving furniture with its contents and wall slots (Stage 4), exact draw depth (Stage 5), the panel (Stage 6), lights on decorations (Stage 7), multiplayer messages (Stage 8), and new content such as plates, food, cups and pillows (Stage 9).

Existing play is unchanged: old worlds load with no decorations, tile furniture and small table pieces work as before, and the smoke test passes.

### Stages 3 and 4: done (13 Nov)
What changed:
- **Placing by hand (Stage 3).**
  - Hold any decoration and aim at furniture. Every spot it can go glows (the one it will use brighter), a ghost shows where it lands (green if it fits, red with the reason if not), and it snaps to that spot's step (quarter or half block). A tap sets it down.
  - It works on tables, desks, counters, dressers, shelves, beds, the sofa and wardrobe tops.
  - **Nesting:** aim at a plate while holding food to put the food on it (Table → Plate → Food).
  - **Food:** food you carry can be set out (drawn at half size); jars of jam, honey, milk and pickles count as bottles. Holding food over nothing still eats it as before.
  - **Wall pieces** (paintings, trophies, mirrors, clocks, tapestries, maps and about 30 more) go on any back wall at half-block steps, including half a block up.
  - **R** flips what you are about to place, or the decoration under your aim.
  - **With the pick** (or a hand tool), hovering a decoration outlines it and a tap takes it and everything on it back to your bag.
  - **New item:** Clay Plate (Workbench, 2 Clay for 2; Decor > Tables & Tabletops).
- **Moving furniture (Stage 4).**
  - **G** while aiming at a piece picks it up. Its decorations and its stored items wait on it while you carry it.
  - **R** turns it while carrying.
  - Placing it anywhere brings everything back in the same relative spots, mirrored if it was turned.
  - **Esc** (or G again) puts the piece and all its things in your bag.
  - Leaving the game mid-move does the same on the next load, so nothing is lost.
  - Breaking a piece returns everything on it to your bag.

Tested (in game, scripted):
- **Scenarios 1–4:** table, candle, a plate beside it, bread on the plate.
- **Scenarios 5–6:** moving the table with G (it all moves), turning it with R (it all mirrors).
- **Scenario 7:** breaking the table (everything returns).
- **Scenario 8:** wall paintings at half steps.
- **Scenarios 10–11:** reload restores everything; reload while carrying returns everything to the bag.
- Picking a plate up returns the bread with it.
- Smoke test: `AUDIT []`, `ERRORS 0`.

Not done yet:
- Phones have no G or R key, so moving and flipping on touch come with the Stage 6 panel (selection card buttons). Placing and taking already work by tapping.
- Rugs under furniture, and decorations drawn in exact depth, come in Stage 5. Decorations currently draw on top of all tiles.
- Candles placed as decorations don't give light yet (Stage 7).
- Multiplayer messages for decorations (Stage 8).
- Scenario 12 (large numbers) and the stress test: Stage 5.

### Stages 5, 6 and 7: done (13 Nov)
What changed:
- **Depth and rugs (Stage 5).**
  - Rugs (Reed Rug, Fur Rug) now lie on the floor as decorations, at half-block steps, so tables, sofas and beds stand on them. Holding a rug and aiming at a floor shows the glowing spot as usual.
  - Every decoration has a layer. Rugs (floor) and wall pieces (back wall) are drawn cell by cell, right after that cell's back wall and before its furniture. So a bookshelf hides part of a painting behind it, a solid block hides what is behind it, and wall pieces cast a small shadow. Things standing on furniture are drawn after all blocks, in order: furniture, what stands on it, what stands on that.
  - Cells holding rugs or wall pieces are never baked into the fast chunk pictures, and the chunk signature notices them, so placing or removing one redraws correctly.
- **Decorate mode and panel (Stage 6).**
  - **O**, or the new chair button next to Crafting and the Backpack, turns decorate mode on. While it is on, taps never dig, fight or swat: they place what you hold, or select what you tap.
  - Selecting shows a dashed gold outline and a bar at the top with the piece's picture, name and where it sits, plus buttons: **Pieces** (the panel), **Flip**, **Move**, **Put away**, **Colour**, **Light on/off** (for lamps and candles) and **Use** (Sit, Read, Cook or Look), and **Done**. The buttons work by tap, so phones can now flip and move.
  - Keys in decorate mode: R flips, G moves, Delete puts away, Esc deselects, then leaves.
  - **Moving a decoration** (Move on a plate, say) carries it with everything on it; set it down on another spot and they come back on it. Esc or Put away returns it all to your bag.
  - **Put away** on furniture takes the piece, everything on it and everything stored in it, into your bag.
  - **The panel** (Pieces, or the dev menu): tabs for All, Furniture, Tables & tops, Storage, Lighting, Wall art, Plants, Food, Tableware, Books, Collectibles, Cloth and Rugs; search as you type; each piece with its picture, name, what it is for (where it goes, whether it stores, lights, seats or tells the time) and how many you carry. "Show what I don't have" lists the rest with where to craft it. Picking one puts it in your hand.
  - Messages now stack under the bar instead of behind it.
- **Working furniture (Stage 7).**
  - **Sit** on chairs, stools, the sofa, the rocking chair and the throne: F while standing at one (or Use). Move or jump to get up.
  - **Lamps and candles switch off and on** (F near a lamp, or Light in the bar), both lamp blocks you place and candles standing on furniture. Off means no light, no glow, and a snuffed picture (no flame, dark glass).
  - **Decoration lights:** candles, oil lamps, lanterns and skull candles standing on furniture now light the room like the block versions.
  - **Clocks** (Grandfather Clock, Cuckoo Clock) tell the time and day. **Trophies and statues** show your records (fish, creatures, bosses, days, mining).
  - **Stoves cook:** the Iron Stove, Counter Stove and Stone Hearth open the Cooking Pot's recipes, and F finds them like any station.
  - **Storage:** bookshelves, cupboards, dressers, wardrobes, hutches and about 50 more were already containers; they keep their contents when moved or put away (checked).
  - **Colour variants:** five dyes (Rose, Amber, Moss, Sky, Plum) for any decoration or piece of furniture with coloured cloth, paint, glass or glaze. Wood, metal, stone, gold and flames keep their own colour, so plain wooden tables have no dyes.
- **Save fix (important):** decorations were being set aside as "unknown" by the save cleaner on a real reload (the Stage 2 to 4 tests went around it). They are now saved and checked properly, along with what you are carrying, lamps you turned off and dyes. Decorations set aside by the earlier test builds come back on the next load. Moving between worlds puts anything you are carrying in your bag first.

Tested (in game, scripted, `tdeco5*.js`):
- **Scenario 9:** a rug, then a table on it (table stands on the rug); a painting, then a bookshelf in front of it (partly hidden).
- Decorate mode: tapping a candle selects it (not taken); tapping the ground doesn't dig; Flip, Colour and Light change the record; moving a plate carries its bread to another table; Put away on a table returns the table, the plate and the bread.
- Panel: 13 tabs, search ("rug" finds both rugs), Lighting tab, picking a piece puts it in hand and closes the panel. Desktop and phone sizes.
- Sitting (pose, held in place, move to stand); a lamp switched off (light gone at night, flame gone); clock text; a stove opens the cooking window; colours on a sofa, cushion and painting.
- Save cleaner keeps decorations, switched-off lamps and dyes; reload keeps a snuffed candle snuffed.
- **Scenario 12 (stress):** 1,000 decorations in view (rugs, wall pieces, tables, plates and food): no frame-time change in the headless browser (median 56 ms before, 50 ms after; the headless browser is slow either way). Building 1,000 records took 32 ms.
- Stages 2–4 tests still pass. Smoke test: `AUDIT []`, `ERRORS 0`.

Not done yet:
- Multiplayer messages for decorations, lamp switches and dyes (Stage 8). In a multiplayer room these stay on the machine that made them until then.
- Bookshelf reading (opening a book to read it) is not built; bookshelves store books like before.
- Old rug tiles stay tiles (they still work); new rugs go down as floor decorations.
- Lamp blocks that only have the older 16-pixel picture (no HD art) keep their flame picture when switched off; their light and glow do switch off.
