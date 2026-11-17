# SwampRealms: notes for Claude

## Creature art: the house style (every new entity must follow this)

Every creature, enemy, animal, NPC and boss in Delve is drawn in one style. The reference creatures are the wolf, the gator, the
Bog Witch, the Swamp Queen and the Alpha. A new entity is not done until it sits next to those and looks like it belongs.

Use the shared art kit in `sandbox.js` (search `CREATURE ART KIT`):
- `aG(g, y0, y1, hi, mid, lo)`: top-lit shading (light on top, dark underneath). Every body part gets one.
- `aInk(g, fill, line, width)`: fill and ink outline. Outlines are a dark, tinted version of the creature's colour, never pure black.
- `aShine(g, x, y, rx, ry, alpha, rot)`: a soft highlight on the top-left of each rounded mass.
- `aEye(g, x, y, r, iris, line, flash, look, lid)`: a white, an iris, a pupil and a glint; `lid` gives a scowl.
- `aLimb` / `aLimbQ`: an inked limb along points or a curve.

### What makes it look polished (and what made earlier ones look like clip art)
1. **One silhouette, not stacked shapes.** The body, head and eye bumps should be one path where they are one piece of the animal
   (see the swamp frog). Never build a creature from separate ellipses that just overlap.
2. **Parts grow out of the body.** Horns, spikes, crystals, thorns, fins and spines are drawn before the body (or behind the plate
   they come from), so their roots are covered and they look like they grow out of it (see the crawler's crystals, the Alpha's
   spine ice and the Queen's bramble vine). Nothing sits on top like a sticker.
3. **No seam where parts join.** Where a head meets a neck or a thigh meets a body, fill the shape but leave that edge unlined.
   Stroke only the outer edges (see the eel's head and the Alpha's legs), and shade both parts with the same gradient range.
4. **Legs are one tapered shape.** Build each leg as one outlined polygon from hip to paw (wide at the hip, narrow at the ankle),
   with real joints: a backward hock on hind legs, and tufts or joint knobs. End it in a proper paw, hoof or foot with toe lines.
   Never use a blob, a stick and an oval (see `leg` in `drawWolf` and `drawAlpha`).
5. **Details follow the form.** Stripes and bands curve around the body and are clipped to it (see the wasp). Spots, scales and
   cracks are clipped inside the silhouette.
6. **Every state is still drawn.** Keep the creature's attack tells (wind-up, open mouth, glowing eyes) and the `flash` (hit)
   colour, and use `F(c)`-style helpers so the hit flash still turns the whole creature white.

### Check it before shipping
- `window.__sbx.art` draws any creature on its own canvas: `e(g, enemy)`, `a(g, animal)`, `oc(g, oceanMob)`,
  `boss(g, boss)`, `zaruk(...)`, plus `newEnemy`, `bossNew`, `ocNew` to make one.
- Render it large next to the wolf and gator, in every state (idle, moving, wind-up, attack, hurt), and look at it. Then check it
  once in game at normal zoom, so the detail still reads at play size.

## Progression (every update must fit this)
A fresh player starts with bare paws. The early chain must always be doable in order, with only what the player has at that point:
1. **Bare paws:** dig soft ground (mud, moss, peat, clay is slower), punch leaves (Sticks), snip reeds and vines (Fiber), dig for Pebbles,
   and chop **Murkwater (swamp) tree trunks** for Wood. Every other tree (cherry, palm, dark oak, pine, snags) and all stone need a pick.
2. **Reed Pick** (Sticks, Fiber, Pebbles) opens every tree, stone and clay; then the Workbench and the pick tiers per biome.
- What paws can break lives in ONE place: `PAWS` / `pawChop` in `sandbox.js` (search `PROGRESSION:`). Change it there, nowhere else.
- When you add a block, tree, biome or recipe: give it a pick tier that matches where it appears, and check the Chapter 1 quests (`MAIN`, `ch: 0`)
  and the first recipes can still be finished without anything the player cannot have yet. Quest text must say what tool is needed.
- A new biome's trees need the Reed Pick unless it is the starting biome. If the starting biome ever changes, update `pawChop` to match.

## Workflow
- Big features go to the `ocean-update` branch (test site: ocean-update.swamprealms.com). Small fixes go to `main` through a PR.
- **Dev menu:** every new Delve feature gets dev menu buttons in the same commit (`DEVA` in `sandbox.js`, search `DEV MENU`):
  a "Go to" button for any new place, "Give" for new items, gear and mounts, "Set" for states that take time to reach (growth, unlocks,
  time of day, daily resets), and "Open" for new panels. Run each new button once in the test before shipping.
- Bump the `?v=` tags in `sandbox.html`, add README bullets, and run the smoke test (expect `AUDIT []` and `ERRORS 0`) before committing.
