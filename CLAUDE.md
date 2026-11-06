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

## Workflow
- Big features go to the `ocean-update` branch (test site: ocean-update.swamprealms.com). Small fixes go to `main` through a PR.
- Bump the `?v=` tags in `sandbox.html`, add README bullets, and run the smoke test (expect `AUDIT []` and `ERRORS 0`) before committing.
