# SwampRealms: Evolution — Inspection Report & Project Spec (v0)

Source: `SwampRealms-endless-pressure.zip` (34 files, 5.5 MB). Static site, plain HTML/CSS/JS, no build step. Cloudflare Worker + D1 only for `/api/*` accounts. **No existing file was changed; this file is the only addition.**
Never paste `cards.js` (4.3 MB, base64 art), `adventure.html` (200 KB) or `store.js` (85 KB) whole into chat. Search them with grep and read small line ranges.

## 1. Assets and look
- **No standalone character image files.** Characters exist as:
  - 28 card illustrations, embedded base64 JPEG in `cards.js` (`CARDS`: Boggy, DonK, MonK, Ellie, Ollie, abstract/Y2K editions).
  - 5 SVG avatar animals drawn in code by `avatar.js`: `AV.svg({animal,hat,face,neck,shirt,bg,acc})`. Animals: frog (Boggy), donkey (DonK), owl (Ollie), monkey (MonK), elephant (Ellie). Also `AV.item(id)` and `AV.aura(outfit)`. Player outfit: `Crystals.outfit()`.
  - Enemies and bosses (Bramble Bug, Swamp Frog, Rootmaw, Mirewing, Bog Gator, Stone Ape) are canvas-drawn inside `adventure.html`. Not reusable.
- **Logos:** `logo-mark.png` (header emblem), `logo-word.png` (header wordmark), `logo-full.png` (stacked), `card-back.jpg`, `preview.jpg` (1200x630 social image).
- **Fonts (Google Fonts, external):** Bagel Fat One (logo, `h1`) and Nunito 600/800 (everything else).
- **Colors:** bg `#070b09`/`#0d110a`, mint `#4ee6b4` (+`#c8fff4`), gold `#f2c14e`, text `#f6eedb`, muted `#f6eedbb3`. Rarities: Common `#b9bcc2`, Uncommon `#5fd38d`, Rare `#4da3ff`, Epic `#a855f7`, Legendary `#ff9f1c`, Mythical `#ff4fd8`.
- **UI patterns (`styles.css` + `ui.css`):** dark glass panels with mint edge and scanlines (`.tile`, `.stat`, `.stagecard`); gold pill `.btn` with a 3D lip and `.btn.ghost`; `.seg` tabs; `.chip`; popups (`.bag-wrap`, `<dialog>`); uppercase glowing `h2`; header with coin and crystal pills plus hamburger; fixed phone `.tabbar` (under 640px, about 66px tall).
- **Effects:** `HudFX.pop/chip` (floating +N chips) in `cards.js`. Sound is synthesized (`SFX.*` in `cards.js`, no audio files), with the header sound switch. Adventure music is synthesized inside its own page.

## 2. Currencies (actual behavior)
- **Swamp Coins:** `localStorage["swamp-packs-v1"]` → global `meta.coins` (`cards.js`). There is no wrapper API. Adventure does `meta.coins+=n; save()` (`payOut`, `adventure.html` ~L2170). Shop does `meta.coins-=price`. Call `load()` first to refresh. `save()` also repaints the header bank. Coins only buy packs (50 each in the shop).
- **Swamp Crystals:** `localStorage["swamp-crystals-v1"]` → `CS.c` (balance), `CS.earned`. API (`store.js`): `Crystals.award(game,score,extra)`, `.buy(id)`, `.balance`, `.state`, `.reload()`. Rates in `CRY` (adventure = 1 per 55.6 score).
  - **Trap:** `award()` counts as a "round". It pays at least `minRound`=2 crystals per call and +15 on the first round of the day. An idle game must NOT call it on a timer or per tick (farmable).
  - There is no generic spend or grant function. Recommend adding `Crystals.grant(n)` to `store.js` (about 3 lines: `cload(); CS.c+=n; CS.earned+=n; csave()`).
- Coins are for packs and crystals are for avatar cosmetics and skins. Footer text says they have no cash value. Keep that.

## 3. Saving, sync, fullscreen
- **Local:** three keys only: `swamp-cards-v1`, `swamp-packs-v1`, `swamp-crystals-v1`. Adventure progress (`swampverse-arcade-progress`, `-scores`, migration flags) is browser-only and is NOT cloud-synced (existing limitation).
- **Cloud (`account.js` + `worker.js`):** username + password, cookie session. `account.js` patches `Storage.setItem` and watches only those three keys. It pushes `{cards,packs,crystals}` 2.5 s after a change and on tab close. It uses `PUT /api/save` with a revision number (409 on conflict → "Which progress do you want?" dialog). `worker.js` **whitelists exactly `cards`, `packs`, `crystals`**, and rejects saves over 200,000 characters. On pulling a cloud save, `account.js` calls `location.reload()`.
  - **Consequence:** a new top-level save key would NOT sync unless `account.js` (KEYS, `local()`, `applyCloud`, logout) and `worker.js` are edited.
  - **Simplest fix:** store the whole game inside the crystals save as `CS.evo = {...}`. `cload()` uses `Object.assign`, so unknown fields survive, and `csave()` writes the full object. It syncs for free with no Worker, D1 or `account.js` change. Keep `evo` under about 20 KB.
- **Fullscreen (`gamefs.js`):** `GameFS.attach({stage:"#id", start:"[data-fs-start]"})`. It uses the Fullscreen API, with a page-filling fallback on iPhone. Start buttons need `data-fs-start`; `data-fs` buttons and the `F` key toggle it. Opt-out is remembered in `sessionStorage` (`swamp-fs-off`). `ui.css` L567-590 styles `#stage.fs` and `html.fs-on` for adventure only. A new game needs its own scoped `.fs` CSS. An idle game doesn't need fullscreen, so it is optional.

## 4. Adding a game to the Arcade without breaking anything
1. New page `evolution.html`, copied from `arcade.html`'s head, header, footer, `.tabbar` and Cloudflare beacon.
2. Link `styles.css` then `ui.css?v=armory1`. Load scripts in this exact order: `cards.js`, `weapons.js?v=skins2`, `avatar.js?v=acc2`, `store.js?v=acc3`, `account.js`, `menu.js`, then the game's own script.
3. Add one `<a class="tile" href="evolution.html">…</a>` inside `.tiles` in `arcade.html` (currently one tile). Copy the adventure tile markup. `menu.js` needs no change (games are not in the header menu).
4. Optional: add the URL to `sitemap.xml` and update the Arcade meta description.
5. Do not use the URL hashes `#avatar`, `#armory`, `#bag`, `#craft`, `#skins`, `#weapons`. The shared scripts open popups on them.

## 5. Limitations and conflicts to respect
- **Global name collisions (highest risk).** `cards.js` and `store.js` declare top-level `const`/`let`/`function` names, e.g. `meta, owned, KEY, PK, save, load, today, left, tick, CARDS, RULES, SFX, HudFX, CS, CK, CRY, ANIMALS, COSMETICS, CATS, Crystals, Fragments, Gear, Skins, Armory, Bag, Craft`. Redeclaring any of them in a game script throws a SyntaxError and kills the page. **Wrap all game code in an IIFE and prefix its names (`evo…`).**
- `cards.js` is 4.3 MB and loads on every page (it is the coin wallet). The new page inherits that load time on mobile. Not fixable without a refactor, so avoid adding more heavy data.
- Autosave: each `csave()` repaints the gems, avatar and bag, then queues a cloud push. Throttle game saves (about every 10-15 s, plus `visibilitychange`/`pagehide`). Call `Crystals.reload()` before writing, so two open tabs don't overwrite each other.
- A cloud pull reloads the page, so the game must resume cleanly from the save.
- Anti-cheat: none (README: "a cloud save is a backup, not anti-cheat"). Offline progress via `Date.now()` is editable. Accepted, but cap offline gains.
- **Economy risk:** an idle game never ends. Do NOT pay coins or crystals per second. Pay only on capped milestones (boss first-kills, realm unlocks, prestige) and track claims in `CS.evo.claimed`, so it can't devalue the shop or cosmetics.
- Deployment: `wrangler.jsonc` serves the whole folder (`assets.directory "./"`). The README mentions `.assetsignore`, but **that file is not in the ZIP**, so `worker.js`, `schema.sql`, `README.md` and `wrangler.jsonc` are probably public. Low risk (no secrets), but worth confirming in the repo.
- The tab bar covers the bottom of the screen on phones. Leave about 70 px bottom padding. Audio needs a first tap on iOS. Cache-busting uses `?v=` on scripts, so bump it on any shared file you edit.
- The README is accurate and is the best map of the existing systems. Update it when stages ship.

## 6. Recommended implementation (simplest fit)
- **Two new files:** `evolution.html` (markup, scoped CSS in a `<style>` or `evolution.css`) and `evolution.js` (IIFE: data tables on top, state, tick, render). Keep each under about 60 KB so later chats can read them whole.
- **DOM/CSS UI, not canvas.** Mobile-first stacked cards, a bottom tab strip inside the game, big tap targets. Tick with a 250 ms `setInterval` using delta time. Offline catch-up is computed from the saved `lastSeen` and capped (e.g. 8 h).
- **Creature art:** reuse the 5 `AV.svg` animals. Each evolution stage gets a preset outfit (hat, neck, shirt, bg) plus an `AV.aura` rarity glow, so no new art is needed. Add a simple inline-SVG egg. No new image assets are required for v1.
- **State:** `CS.evo = {v:1, res:{…}, creatures:[…], structures:{…}, biomes:{…}, bosses:{…}, claimed:{…}, lastSeen}`. Include a `v` field for migrations. Read it via `Crystals.state` (the live `CS` object). `csave()` is not exposed on `Crystals`, so Stage 1 adds a tiny `Crystals.save()` (`csave()`) next to `Crystals.grant` in `store.js`. Always `Crystals.reload()` before editing.
- In-game resources (e.g. Essence, Biomass) stay separate from Coins and Crystals. Link to the wallet only through the capped milestone payouts above (`load(); meta.coins+=n; save()` for coins).
- Reuse: header, `.tile`, `.btn`, `.seg`, `.chip`, `HudFX.chip`, `SFX.*`, rarity colors, `GameFS` (optional).

## 7. Build plan (one working zip per stage)
1. **Skeleton:** `evolution.html` + `evolution.js`, Arcade tile, `CS.evo` load/save, swamp resource ticking, offline catch-up, wallet header. *Also add `Crystals.grant` and a save helper to `store.js`.*
2. **Creatures:** egg → hatch → evolve stages, using the 5 animals.
3. **Structures:** buildings that raise production, upgrade costs.
4. **Biomes:** DONE in Stage 4 (Ember Bog, Frostfen, cinematics, daily gift, next-goal pill, particle atmosphere). See README.
5. **Bosses:** timed or stat-check fights, first-kill rewards (capped coin/crystal payouts).
6. **Expansion and polish:** prestige, achievements, sound, README update.
After each stage: test on a phone-width viewport, check that `arcade.html`, `adventure.html` and `shop.html` still load with no console errors, check that sign-in sync still works, then zip and name `SwampRealms-evo-stageN.zip`.
