# SwampRealms

Free daily swamp card packs for the DonK community. A static site: plain HTML, CSS and JavaScript, no build step.
Progress is saved in the visitor's browser (`localStorage`). Visitors can also sign in (username + password) to keep it in a cloud account and play on any device. See **Accounts** below.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Home page |
| `catalog.html` | Open packs and view the collection |
| `shop.html` | Buy packs with Swamp Coins |
| `arcade.html` | The Arcade hub and the main menu for all games (games are not in the header menu, they are tiles here): a card for each game (just the Swamp Adventure for now), **Your Avatar** (pick an animal, try on and buy cosmetics with Swamp Crystals), then Your Loadout with an **Open Armory** button (Bag, Crafting, Weapons and the Skin Shop in one popup) |
| `adventure.html` | The Swamp Adventure. Every run pays Swamp Coins and Swamp Crystals, no daily limit. Rates: `COIN_PER` in the page script (1 coin per 200 score) and `CRY.games.adv` in `store.js` (1 crystal per 55.6 score) (3 hand-made levels + Rootmaw boss, then endless generated levels, see **Endless progression**). Each level has its own background music (`MUSIC` in the page script: synthesized, no audio files, same sound switch as the effects, plus a faster track for the Rootmaw fight). Its own page, with a Full screen button (top centre of the game, and under it), or press `F`. Uses the browser Fullscreen API, and a page-filling view on iPhone. The player is drawn as the visitor's own avatar (animal + gear from `avatar.html`, via `avatarRefresh()` and `drawPlayer()`); it falls back to the original sprout character if the avatar can't load |
| `progression.js` | The Endless Realms: difficulty, rewards, enemy variants, boss ranks and the level generator for every level after the four hand-made ones (Level 4, the Sunlit Canopy, is hand-made). Pure data and maths, loaded before the game script. See **Endless progression** below |
| `chestcabin.js` | The treasure cabin in front of every boss arena (Swamp Adventure Levels 1-4 and the Endless Realms boss levels): layout, the two chest rewards and the drawing. Loaded after `storyboss.js`. See **Treasure cabin** below |
| `evolution.html`, `evolution.js`, `evolution.css` | **SwampRealms: Evolution** (idle swamp tycoon, Stage 1). Own page, linked from a tile in `arcade.html`. See **SwampRealms: Evolution** below |
| `avatar.html` | Redirect stub only. The avatar picker now lives in the "Your Avatar" section of `arcade.html` (`#avatar`), so old `/avatar` links still land there. Safe to delete if you don't mind old links breaking |
| `cards.js` | Cards, packs, pack rules, saved data, sounds, coin wallet. Card back = `card-back.jpg` |
| `weapons.js` | Weapon drawings (`WeaponArt`), shared by the Swamp Adventure (held in hand) and the Bag (preview card). Load before `store.js` |
| `store.js` | Swamp Crystals wallet, cosmetics list, header crystal counter, the Fragments (enemy loot) table, the Gear table, the Crafting recipes, and the **Armory** popup with its four tabs (Bag, Crafting, Weapons, Skin Shop). Load after `cards.js` |
| `gamefs.js` | Shared full screen for every game: `GameFS.attach({stage, start})`. Games go full screen automatically when the player taps Play (browsers need a tap first), with a page-filling fallback on iPhone. Leaving full screen on purpose is remembered for the visit |
| `avatar.js` | Draws the animals and cosmetics as SVG |
| `styles.css` | Base styles: layout, packs, cards, shop |
| `ui.css` | The Arcade theme (dark glass panels, mint glow, uppercase labels) for every page, plus the arcade and avatar screens. Loaded after `styles.css` |
| `account.js` | Sign in button + popup, and the cloud sync. Once signed in, the header account circle shows the visitor's own avatar (updates when they change it). Load after `store.js` on every page |
| `worker.js` | Cloudflare Worker for `/api/*` (register, login, logout, save). Not served to visitors |
| `schema.sql` | Database tables for accounts. Run once in D1 |
| `wrangler.jsonc`, `.assetsignore` | Cloudflare config (Worker + D1 binding) and the list of files that are not published |
| `menu.js` | Header menu: builds the hamburger dropdown from the nav links, avatar and sound switch. Load last, after `account.js` |
| `404.html`, `robots.txt`, `sitemap.xml` | Not-found page and search engine files |
| `logo-mark.png`, `logo-word.png`, `logo-full.png` | The SwampRealms logo as transparent PNGs with a cream outline. The header shows the emblem (`logo-mark.png`) beside the name (`logo-word.png`, hidden on narrow phones); `logo-full.png` is the stacked emblem + name version for other uses |

## Endless progression

Levels 1-4 are hand-built in `LEVELS` in `adventure.html` (Level 4, the Sunlit Canopy, is a bright treetop jungle with its own theme `TH4`, music track 4 and temple-stone obstacles; Levels 1-3 are unchanged). Every level after them is **generated from numbers in `progression.js`**, so there is no last level and nothing to write per level.

- **Index → level.** `lvl(i)` in `adventure.html` returns the hand-built level for 0-2, otherwise `Progression.build(i)`. The same index always builds the same level (seeded), so best scores, checkpoints and replays are stable. Levels are built when first needed and cached.
- **Difficulty.** `Progression.scale(i)` returns the settings for a level: enemy hits-to-kill (`bugHp`, `crawlerHp`, `bossHp`), speed, Bog Crawler aggro and recovery, boss speed / shockwave speed / extra follow-up slams, and the reward multiplier. All formulas are in the `TUNING` table at the top of `progression.js`; change a line there to retune the whole game. Health grows with the square root of depth, speeds are capped so every fight stays dodgeable. Levels 1-3 resolve to exactly the original numbers. `applyScale()` in `adventure.html` applies them when a level loads.
- **Danger.** The Endless Realms are not numbered as levels: they are shown by name only (banner kicker "Endless Realms"), so Level 4 and up stay free for real hand-made levels. The first one is Danger 1, the next Danger 2, and so on (shown in Level Select and the results screen). Internally they still use indexes 3, 4, 5 ...
- **Bosses.** Every third level (3, 6, 9, 12 ...) is a boss level. Rank 0 is the Rootmaw (12 hits). Later ones are Elder, Ancient, Primeval, Mythic and Eternal Rootmaw (then Eternal Rootmaw II, III ...) with more health, faster walk and slam, and from rank 2 an extra follow-up slam.
- **Two kinds of boss.** Boss ranks 0, 2, 4 ... are the Rootmaw line (ground slams). Boss ranks 1, 3, 5 ... are the **Mirewing** line (The Mirewing, Elder, Ancient, Primeval, Mythic, Eternal Mirewing; names in `WINGS` in `progression.js`, behaviour in `updateWing()` / `drawWing()` in `adventure.html`). The Mirewing is a flying mire-moth: a shield makes it immune while it flies, it alternates a fan of arcing mire orbs (3, or 5 when enraged) with a telegraphed dive at where you stood, and only after the dive does it lie stunned on the ground, which is the only time it can be hit. Its health is 70% of the Rootmaw formula because every hit has to be earned in short windows.
- **Enemy variants.** A new look every 3 levels: Thornback, Ember, Frostbite, Gloom, Stormcall, Venom, Moonshade, Voidtouched (then the same set again at Greater, Elder, Ancient, Mythic). A variant has its own name, a coloured glow behind it and a nameplate when you are close. They still drop the same fragments (loot ids are unchanged), with `fragBonus` added to the drop chance.
- **Rewards.** `rewardMul` scales every score value (spores, kills, clear bonus, speed bonus). Coins and crystals are paid from score, so they grow with depth with no other change. Boss kills pay a further `bossPts` multiplier.
- **Level layout.** `Progression.build` joins ground islands with stepping-stone crossings (spacing and height stay inside the player's jump), then fills islands with crates, stumps, stair-steps and thorn patches (kept off landing and take-off edges), puts the bug and crawler on their own clear islands, and ends in a goal gate or a boss arena. Gaps, thorns and gliding stones grow with depth up to safe caps. Palettes are the three base themes with the hue rotated, so each level looks different.
- **Progress.** Saved as before (`swampverse-arcade-progress`) but no longer capped at 3: finishing any level unlocks the next. Saves from when Level 3 was the last level pick up Level 4 automatically. Level Select lists the three hand-made levels plus the latest endless ones, with "Show earlier levels". The title screen has a **Continue** button that jumps to the furthest level.
- **Not wired yet (next steps):** equipped weapon stats (`GEAR`, Damage) are not read by combat yet, so every hit is still 1 damage. When they are, divide the hits-to-kill formulas in `TUNING` by the weapon's damage. Only one Bramble-type bug and one Crawler-type per level exist because the enemy code is single-instance; more enemies per level needs those turned into lists. New enemy types can be added as another variant list plus a `FRAGMENTS` line.

## Run upgrades (Endless Realms)

After every Endless level (not the three hand-made ones) the results screen shows two random upgrade cards; "Next level" appears once one is picked. Upgrades last for the current run only and are cleared on Game Over, Quit to title, or starting a level from the title / Level Select / Replay (`runCont` in `adventure.html`: only "Next level" after an Endless clear keeps them).

- `runups.js` holds the pool (`POOL`: id, name, text, stat, amount per pick, max picks) and the maths. To add an upgrade of an existing stat (dmg, cd, reach, move, hp) add one line to `POOL`.
- The game reads them in one place per stat: `wstat()` (damage, swing cooldown, reach, which also covers goo balls), the run-speed clamp in the movement code, and `maxHp()` (replaces the old `MAXHP` constant).
- The picker is `showPick()` and the `#pick` element in `adventure.html`; styles are at the end of `ui.css`.
- **HUD.** `showUps()` draws a chip per picked upgrade (icon + total bonus) under the Glowspore counter while playing or paused (`#upw`, `RunUps.summary()`).
- **Run end.** Game Over in the Endless Realms ends the run: the button reads "New run", the screen lists the upgrades and how deep you got, and `start()` sends you back to the first Endless level with no upgrades. Title / Quit also enter at the first Endless level (`entryLevel()`). Level Select can still jump to any unlocked level, as a fresh run.
- Step 1 pool: Sharpened Edge (+5% damage), Quick Hands (+8% attack speed), Hardy Hide (+1 max health), Swift Roots (+6% move speed), Long Reach (+10% reach).

## Held weapons

The weapon equipped in the Bag (Weapons tab) is drawn in the player's hand and swings with the attack, and the slash colour changes to match. Art is in `WPN` in `adventure.html` (Spiked Blade, Bog Blaster, Swamp Hopper Staff); to give a new weapon a held design add a draw function in `weapons.js` (`WPN`) and a `WPN_PAL` slash colour in `adventure.html` with the same id as its `GEAR` line. Combat reads the weapon straight from its `GEAR` stats (`wstat()`): Damage / 5 is the damage per hit (a bare attack is 1, so the Spiked Blade does 1.8, the Bog Blaster 1.4, the Hopper Staff 1), Speed sets the swing cooldown (Fast .27s, Medium .36s) and Range sets the reach (Short 42, Medium 60). A weapon with Range "Long" that is the Bog Blaster fires goo balls instead of swinging: the shot locks onto the nearest enemy in front (a green reticle shows who), flies straight at it and curves gently toward it in flight, so aiming is just "face the enemy and press attack". The Mirewing's shield blocks goo balls too. Goo also stops (and splats) on crates, stumps, hanging logs, floating platforms, the ground and the closed boss-arena wall (`gooBlocked()`); the aim assist ignores enemies hiding behind cover.

## Two currencies

- **Swamp Coins** buy card packs. Earned from every Swamp Adventure run.
- **Swamp Crystals** buy avatar cosmetics. Earned from every Swamp Adventure run. Tuning is in `CRY` at the top of `store.js`; call `Crystals.award("adv", score)` when a run ends.

## Fragments (enemy loot)

Defeated enemies have a chance to drop a Fragment. The table is `FRAGMENTS` in `store.js`: one line per enemy id with the fragment name, drop `chance` and `rarity` (`common`, `uncommon`, `rare`).

| Enemy id | Fragment | Chance |
| --- | --- | --- |
| `bug` (Bramble Bug) | Bramble Fragment | 30% |
| `boss` (Rootmaw) | Rootmaw Fragment (rare) | 25% |
| `frog` (every Swamp Frog, plus the Bog Gator in Level 1) | Frog Fragment (it replaced the Bog Fragment) | 100% (like the other enemies in `store.js`) |
| `crocodile`, `slime` | Crocodile / Slime Fragment | 40% (ready for when those enemies exist) |

- **Stored for real.** Counts are kept in the crystals save as `frags` (`{ bug: 2, boss: 1 }`), so they persist in the browser and sync with accounts like everything else. `Fragments.count(id)`, `Fragments.total`, `Fragments.all` read them; `Fragments.add(id, n)` writes them.
- **Drops.** `adventure.html` calls `Fragments.roll(enemyId)` the first time an enemy is seen defeated (the same place the kill score is awarded, `scoreTick`). A drop is saved immediately, shows a small notification at the top of the game, puts a shard burst and a floating label where the enemy fell, and adds a chip to the Fragments line under the game. The results screens show how many were found in the run.
- **New enemy:** add a line to `FRAGMENTS` with the enemy's id, and add the enemy to `foes()` in `adventure.html` (the loot id is the same as the foe id).

## The Armory (one popup, four tabs)

Bag, Crafting, the weapon picker and the Skin Shop used to be four separate popups. They are now the four tabs of one **Armory** popup in `store.js` (`Armory`, `armoryOpen()`), with the wallet (Swamp Coins, Swamp Crystals, Fragments) always visible on top. The popup remembers the last tab you used.

- **Open it:** any element with `data-armory` (`data-armory="craft"` jumps to a tab: `bag`, `craft`, `weapons`, `skins`), `Armory.open(tab, section)` (e.g. `Armory.open("skins","bogblaster")`), or visit `#armory`. `arcade.html` has an Open Armory button and the Weapon card in Your Loadout opens the Weapons tab; `adventure.html` has an Armory button under the game (it also pauses the run).
- **Old entry points still work** and open the matching tab: `Bag.open()`, `Craft.open()`, `Skins.open()`, `data-bag`, `data-craft`, `data-skins`, `#bag`, `#craft`, `#weapons`, `#skins`.
- **Counts:** `<span data-bag-count>` (items carried) and `<span data-craft-count>` (recipes ready to craft) still work anywhere.
- **Events:** `armory:open` / `armory:close` (and `bag:open` / `bag:close`, which pauses the Swamp Adventure).
- **Code:** each tab has its own paint function drawn into its own pane (`bagPaintBody`, `craftPaint`, `armoryPaintWeapons`, `skinPaint`); the shell (`armoryBuild`, `armoryPaint`, `armoryTab`, `armoryClose`) only owns header, wallet, tab bar, keyboard (Esc, arrows, Tab trap) and closing. Styles are at the bottom of `ui.css` (`.armory`, `.ar-tab`, `.ar-pane`). The Arcade page no longer has the inline Bag/Crafting swipe pager.

## The Bag (inventory)

The Bag is one popup that holds everything the player owns: **Swamp Coins**, **Swamp Crystals**, **Fragments**, and **gear** sections (Weapons, Armor, Accessories). It lives in `store.js` (`Bag`, `Gear`) with styles at the bottom of `ui.css`.

- **Open it:** give any element a `data-bag` attribute (`data-bag="armor"` opens straight to a tab), or call `Bag.open()`. `arcade.html` has a Bag tile, and `adventure.html` has a Bag button under the game (it also pauses the run). Visiting `#bag` on any page opens it too.
- **Item count:** put `<span data-bag-count></span>` inside any button and it shows the number of items carried.
- **Fragments tab:** one slot per fragment type owned, with its count and rarity. Hover or long-press for the enemy it dropped from.
- **Gear tabs:** built from `GEAR_SLOTS` in `store.js` (weapons, armor, accessories). They show "coming soon" slots until gear exists.
- **Adding gear later:** add a line to `GEAR` in `store.js`, e.g. `oakclub:{name:"Oak Club",slot:"weapons",rarity:"common",desc:"A knobbly swamp club."}`, then call `Gear.add("oakclub")` when the player earns or buys it. It appears in the right tab and is saved with the crystals save (`gear`), so it syncs with accounts. To add a whole new section, add it to `GEAR_SLOTS`.
- Coins are read from the coin wallet in `cards.js` and crystals from `Crystals.balance`, so the Bag always matches the header counters.

## Weapons and equipping

Every gear tab in the Bag (Weapons first) lists what the player owns as cards: **icon, name, rarity, stats, description, an Equipped / Unequipped badge and an Equip / Unequip button**. Crafted weapons appear automatically (the tab reads the saved `gear`). The equipped one is listed first.

- **One per slot.** Equipping a weapon replaces the one already equipped.
- **Ownership is enforced.** `Gear.equip(id)` refuses anything the player does not own (`{ok:false, reason}`), and any equipped id that is not owned is dropped when the save loads, so an edited save cannot equip it either.
- **Saved.** The equipped item per slot is stored in the crystals save as `geq` (`{ weapons: "bogblaster" }`), so it persists and syncs with accounts.
- **API:** `Gear.equip(id)`, `Gear.unequip(slot)`, `Gear.equipped(slot)` (info record or null), `Gear.isEquipped(id)`. Equipping or unequipping fires a `gear:change` event (`detail: {slot, id}`) so a game can react.
- **Stats and icon:** optional `stats:{Damage:7,Speed:"Medium",Range:"Long"}` and `icon:"<svg inner markup>"` on any `GEAR` line. The Bag shows Damage as the real per-hit number (`Gear.hitDmg(id)` = Damage / 5), the same value combat uses, and draws the weapon from `WeaponArt` (`weapons.js`). A new weapon needs a `GEAR` line plus a draw function in `weapons.js` and a slash colour in `WPN_PAL`.

## Rarity colors (shared with the cards)

Fragments, weapons and all other gear use the **same six rarities and colors as the cards**: Common (grey `#b9bcc2`), Uncommon (green `#5fd38d`), Rare (blue `#4da3ff`), Epic (purple `#a855f7`), Legendary (orange `#ff9f1c`), Mythical (pink `#ff4fd8`). `FRAG_RARITY` in `store.js` reads the names and colors straight from `CARDS` in `cards.js`, so if a card rarity color changes, the Bag, fragment drops, loot notifications and weapon cards follow. Use any of the six as `rarity:"epic"` etc. on a `FRAGMENTS` or `GEAR` line.

## Crafting

Players turn fragments into weapons in the **Crafting** tab of the Armory. Open it from the Crafting tile in the Arcade, the Craft button under the Swamp Adventure (beside Bag), any element with a `data-craft` attribute, `Craft.open()`, or by visiting `#craft` on any page. `<span data-craft-count></span>` shows how many recipes can be crafted right now, and the popup has an Open Bag button. Each recipe shows its cost, how many fragments the player has, and a Craft button that stays disabled until they have enough. Crafted weapons land in the Bag's Weapons tab and are saved with the crystals save (`gear`), so they sync with accounts.

| Weapon | Cost | Unlocked by |
| --- | --- | --- |
| Spiked Blade (the first weapon) | 4 Bramble (`bug`) + 2 Frog (`frog`) + 1 Wing (`wing`) | Levels 1 and 2: Bramble Bugs, Swamp Frogs, the Bog Gator and the Mirewing |
| Bog Blaster | 3 Frog (`frog`) + 1 Rootmaw (`boss`) + 1 Ape (`ape`) | Levels 3 and 4: the Rootmaw and the Stone Ape |
| Swamp Hopper Staff | 5 Frog Fragments (`frog`) | Level 3: the two Swamp Frogs (replay Level 3 to farm them) |

| Armor | Cost |
| --- | --- |
| Mirewing Helmet | 4 Bramble (`bug`) + 2 Frog (`frog`) + 1 Wing Fragment (`wing`) |
| Mirewing Chest Piece | 5 Frog (`frog`) + 1 Wing Fragment (`wing`) |
| Mirewing Boots | 3 Bramble (`bug`) + 3 Frog (`frog`) + 1 Wing Fragment (`wing`) |

Every armor piece needs at least one Wing Fragment, so armor comes from beating the Level 2 boss (the Mirewing). The gear ids in `store.js` are still `wardenhelm`, `wardenplate` and `wardenboots` so existing saves keep working; only the display names changed.

- **Add a weapon:** add a line to `GEAR` in `store.js` (`slot:"weapons"`), then a line to `RECIPES` with the same id: `{cost:{frog:3, bug:2}}`. Costs can mix any fragment ids from `FRAGMENTS`. The Craft tab builds itself from `RECIPES`.
- **API:** `Crafting.list()`, `Crafting.info(id)`, `Crafting.check(id)` (returns `{ok, reason, missing}`), `Crafting.craft(id)`. `craft` checks the cost, subtracts the fragments and adds the weapon in one save, so nothing is taken unless the craft succeeds.
- Weapons are collectibles for now. Equipping them in the Swamp Adventure is a separate step.

## Story bosses (end of each main-story level)

Every hand-made level ends in a boss arena. The setup lives in `storyboss.js` (loaded before the game script). Level 3's Rootmaw is built into `adventure.html`; Level 2 uses the **Mirewing**, the flying boss already in the game (`kind:"wing"`). Level 1 uses the **Bog Gator**, a basic alligator (`kind:"gator"` in `storyboss.js`: it crawls toward you, opens its jaws as a warning, lunges in a straight line, then is winded and open to attack). Level 4 uses the **Stone Ape** (`kind:"ape"`): a mean ape that stalks you, hoists a boulder overhead and hurls it at where you stood (two in a row under half health), and every third move beats its chest and charges in a straight line (a red lane on the ground shows the path). If it slams into the arena wall it is dazed for a couple of seconds, which is the best time to hit it. It drops Ape Fragments.

- **Slots.** `StoryBoss.SLOTS` has one entry per level index (0 = Level 1, 1 = Level 2, 3 = Level 4): `on`, `name`, `short`, `kind`, `hp`, `w`, `h`, `defeat`, `arenaLen`, `bossTime`, `fragment`, `music`. `on:false` puts the goal gate back, `StoryBoss.ENABLED=false` turns every story boss off.
- **Arena.** `addArena()` lengthens the level's last ground piece by `arenaLen`, removes the goal gate (`goalX:99999`), builds `arena:{x,bx}` and adds a checkpoint before the vines. Winning the fight completes the level, the same as the Rootmaw.
- **Add a real boss.** In `storyboss.js` add `kinds.myboss={reset(c){},update(c,dt,dx,enraged){},draw(c){}}`, then set the slot's `kind:"myboss"` and its `name`, `hp`, `w`, `h`. `c` is the game context (`BCTX` in `adventure.html`: player `state`, live `boss`, `BS`, `AR`, `fx`, `X`, `hurtPlayer()`, `startDefeat()` ...). The game handles waking the boss, the vine gate, the intro (your `update` must move `boss.st` on from `"intro"`), player hits, the health bar, the defeat animation, drops, score and the victory screen. Use `kinds.stub` as the template.
- **Loot.** Add a fragment to `FRAGMENTS` in `store.js`, then set the slot's `fragment` to its id. A slot with `fragment:null` drops nothing (only the Rootmaw drops Rootmaw Fragments).
- **Music.** The fight plays track 3 unless the slot sets `music`.
- **Par time.** `bossTime` seconds are added to the level's time limit for the score bonus, because the level is longer.

## Crafting reset and difficulty

- **Crafting reset (one time per save).** `CRAFT_RESET` in `store.js` wipes a save's fragments (`frags`), crafted gear (`gear`) and equipped items (`geq`) once. Coins, crystals, owned cosmetics, the avatar and weapon skins are never touched. Each save remembers the number it was reset to (`CS.cr`) and it lives inside the crystals save, so it syncs with accounts. To reset everyone again later, raise `CRAFT_RESET` by 1. Players who actually lost items see a one-time notice on the Arcade / Swamp Adventure pages only (`CS.crn`).
- **Harder progression.** Endless Realms tuning in `progression.js` (`TUNING`) is a little tougher: enemy and boss health grow faster, enemies are slightly faster and notice you from further away, the winded window after attacks shrinks faster, and gaps, gliding stones and thorns show up a bit more. Levels 1-4 sit at depth 0, so they are unchanged. Fragment drop chances were lowered slightly (table above), so crafting takes a little longer.

## Adding a new game

1. Make the game page and add a tile for it on `arcade.html` (games live in the Arcade, not the header menu).
2. Load `gamefs.js`, wrap the game and its controls in one stage element, and call `GameFS.attach({stage:"#stage", start:"[data-fs-start]"})`. Put `data-fs-start` on every button that starts, resumes or retries the game. Those taps send the player full screen automatically. Buttons with `data-fs` and the `F` key toggle it by hand.
3. Style the full screen look with `.fs` on the stage and `html.fs-on` (see the adventure rules in `ui.css`).

## Header menu

The header shows the logo, coin and crystal counters, the account button and a hamburger. Every page link (Home, Packs, Arcade, Shop, The Herd), the avatar and the sound switch live in the dropdown. To add a page, add one `<a class="hide" href="...">Name</a>` to the `<nav>` in the page header; `menu.js` moves it into the dropdown. Give it an icon in `ICONS` at the top of `menu.js` (optional). Script order on every page: `cards.js`, `store.js`, `account.js`, `menu.js`.

## Adding a cosmetic

Add a line to `COSMETICS` in `store.js`, then draw it in `avatar.js` (`HAT`, `FACE`, `NECK` or `BG`, same id). Also add its tier number to `RAR` (must match the price tier in `tierOf`) and a `FIT` entry (centre x, centre y, scale) so the shop card frames it. `FACE` functions receive `(eyes, animal)`.

**Cosmetics added in stages** (original swamp designs): Stage 1 = hats Lilypad Sunhat, Glowcap Mushroom, Mossback Shell Helm, Dragonfly Circlet, Pet Thundercloud; faces Firefly Goggles, Mire Claw Paint, Bog Oracle Eye. Many are animated SVG (glow pulses, fireflies, rain, lightning).

**Avatar screen polish (cos5).** Fixed: colour-variant hats (Y2K Bandana) shared one gradient id, so every copy on the page showed the first colour drawn; the id now includes the colour. The six gear slots were laid out in 5 columns (orphan row), now 3. Equipped items now say "Equipped ✓" and a message confirms equip/remove. Locked items show "N more to unlock". Phones get a compact stage, tapping a gear slot jumps to its items, 30px colour swatches, focus stays on the button you pressed, Tab is trapped inside the popup, Left/Right arrows move between category tabs, and reduced-motion is respected. Bump `avatar.js?v=` / `ui.css?v=` when changing these files.

## Before going live

`index.html` points social previews at `/preview.jpg` (1200x630). Add that image to this folder.

## Accounts

Saving still happens in the browser first. When someone is signed in, `account.js` copies the three saves (`swamp-cards-v1`, `swamp-packs-v1`, `swamp-crystals-v1`) to the cloud a couple of seconds after each change and when the tab closes. On a new device it pulls them down. If a device and the account both have different progress, the player is asked which to keep.

- Username + password only. No email, so a lost password can't be reset.
- Passwords are hashed (PBKDF2-SHA256, per-user salt). Sessions are an HttpOnly cookie, 30 days.
- 8 wrong passwords on one name locks it for 15 minutes. 10 new accounts per IP per hour.
- Coins and cards are still decided in the browser, as before. A cloud save is a backup, not anti-cheat.

### One-time setup (Cloudflare)

1. Cloudflare dashboard > Storage & Databases > D1 > Create database. Name it `swampverse`.
2. Open the database > Console. Paste everything from `schema.sql` and run it.
3. Copy the database ID and paste it over `PASTE-YOUR-D1-DATABASE-ID-HERE` in `wrangler.jsonc`.
4. Commit and push. The Worker redeploys with accounts switched on.

If the Worker is not named `theswampverse`, change `name` in `wrangler.jsonc` to match it.

## Deploying

Commit the files to GitHub. If the repo is connected to Cloudflare Workers, it redeploys on push.


## Inspect card
In the Bag (Weapons, Armor and Accessories tabs), tap any item to open its inspect card (`gearInspect()` in `store.js`, styles at the bottom of `ui.css`). It shows a large preview (the real weapon art with your equipped skin, your character wearing an accessory, or the armor icon), name, rarity, a bar for every stat, the item's description, Mirewing set progress for armor, and an Equip / Unequip button. If you are wearing something else in that slot, each stat also gets a green up arrow (better), a red down arrow (worse) or "same" compared with it, plus a white tick on the bar showing the equipped item's value. Bars are relative to the best item of that slot; Speed and Range words use a fixed Slow / Medium / Fast scale; stats with no simple number (like the bandana's "+1 for every 3") show as text. It only reads `GEAR` and `Gear.hitDmg()`, so new gear shows up in it automatically. Escape or a tap outside closes it, and with "reduce motion" on the bars simply appear full.

## Chunky buttons
Every `.btn` has a solid 3D lip under it and squishes down when pressed (styles at the bottom of `ui.css`). The lip is a `box-shadow` driven by four custom properties: `--lw` (lip height, 4px, 3px for `.mini` buttons and the preview bar), `--lip` (lip colour: dark gold for the main buttons, dark mint for `.ghost` ones), `--glow` and `--ring` (inner highlight or outline). It uses `!important` so the older one-off `.btn` shadows in the file can't flatten it; disabled buttons and `.swat` colour swatches are excluded on purpose. To recolour a button, set `--lip` and `--glow` on it. The soft tap sound already existed (`SFX.tap()` in `cards.js`, played on every tap on a button), so it was kept as is.

## HUD number effects
Counters are bold, glowing and tabular, and they react when they change. `HudFX` (top of the coin-bank section of `cards.js`) has two helpers: `HudFX.pop(el)` bounces a number, and `HudFX.chip(anchor, delta, kind, side)` floats a small "+3" or "\u22123" chip next to a counter (`kind`: `gold`, `mint`; negative changes always use the red `rose` chip; `side`: `below`, `left`, `right`). Changes that arrive within about half a second add up into one chip instead of stacking. It is used by the header coin bank (`updateBank` in `cards.js`, chip drops below the pill), the header crystal pill (`paintGems` in `store.js`) and, in the Swamp Adventure, the flames (`showHp`: new flames pop in, with a "+1" or "\u22121" chip) and the score (`showScore`: the number pops and "+250" floats left of it). With "reduce motion" on, chips only fade and nothing bounces. Styles are at the bottom of `ui.css` (`.hfx`, `.hpop`, `.fl.gain`).

## Results screen animation
When a run ends (level complete or game over), `resultsFX()` in `adventure.html` plays the results: the final score counts up from 0 (`data-to` on the `.sbig` number), the score rows slide in one by one, "New best!" stamps down with a bounce and a thump, and then the rewards pop in one at a time with a pickup sound: Swamp Coins, then Swamp Crystals, then Fragments (`fragHTML()` lists what the run dropped). Tapping the results skips straight to the end. If the device has "reduce motion" turned on nothing is animated and everything shows at once. The styles are the `rs*` keyframes at the bottom of `ui.css`; to slow it down or speed it up, change the timings in `resultsFX()` (count-up length `DUR`, row gap 80 ms, reward gap 520 ms).

## Endless Realms pressure (more enemies the longer you stay)
In the Endless Realms (including their boss levels, until you enter the arena) the level clock brings reinforcements: `updateRein()` in `adventure.html`, tuned by the `REIN` block next to it.
- **Spawning:** the first Swamp Frog arrives after 20 s (`first`). After that one arrives every `gap0` = 16 s, and the gap shrinks by `shrink` = 0.06 s per second in the level down to `gapMin` = 6.5 s. Each one appears just off-screen on clear, solid ground (never on thorns, crates or in a gap), 65% ahead of you and 35% behind. A frog hops along the free stretch of ground around its spot (up to 200 px each way) and stalks you when you are within about 560 px, then uses the normal lash. Reinforcements far behind you (over 1.6 screens) or already defeated leave the level.
- **Threat meter:** the pips under the glowspore counter show how many reinforcements may be alive at once: 2 at the start, +1 every 40 s (`capEvery`) up to 6 (`capMax`). When it goes up, the pips pulse and "More enemies are coming!" floats up.
- **They are not part of "Enemies defeated" or Perfect clear.** They hit and take hits like the level's own frog (same hits to defeat, Endless variant name and glow), score `pts` = 150 each (times the level's reward multiplier, up to `maxScored` = 20 per run, shown as a "Reinforcements" row on the results screen) and drop **no fragments**, so waiting around cannot be farmed for loot.
- Every frog now has a stable `id` (poison and aim assist use it), so reinforcements can come and go without confusing them. To make waves harder or gentler, change the numbers in `REIN`. A new enemy type would be added in `updateRein()`.

## Swamp Hopper Staff: the poison zapper
The staff is its own kind of weapon, not a stick: it is a **Long-range** weapon (like the Bog Blaster) that spits crackling zaps of frog poison from the frog on its tip. The code is in `adventure.html` next to the goo balls (`ZAP` tuning, `zap`, `updateZaps`, `drawZaps`, the poison functions) and the poison bead and drip in the frog's mouth are in `WPN.hopperstaff` in `weapons.js`.
- **The zap:** fast (520), flies straight with no gravity, with the same gentle aim assist and lock-on reticle as the Bog Blaster. It looks like a glowing bolt with a jittering trail and flickering forks. With a weapon skin, the zap takes the skin's accent colour (Glacial Tree Frog: icy white-blue, Twilight Toad: violet, Emerald Monarch: emerald).
- **Poison:** a zap hits small enemies for 55% of the weapon's damage (`ZAP.direct`), then **poisons** them: 3 ticks (`ZAP.ticks`) of 15% (`ZAP.share`) every half second (`ZAP.gap`), so the whole thing adds up to the weapon's normal damage (Damage 5 = 1 per zap). Poison never staggers or knocks back, bubbles float off the victim with a green glow, a new zap restarts the poison instead of stacking, and the last tick finishes an enemy with the normal defeat effects. Bosses are not poisoned: they take the full damage at once.
- **Handling:** the staff points where it fires and the frog's bead flares; hits shove enemies back less than melee weapons (like the Bog Blaster).
- **Tuning:** change `ZAP` (and the staff's `Damage` in `store.js`). To give another weapon poison later, call `projHit(proj, facing, true)` from its projectile.

## Swamp Frog (replaced the Bog Crawler in every level)
The Bog Crawler is gone: the bright tree frog now stands wherever a crawler patch used to be (Level 2, Level 4 and every Endless Realms level that had one), and Level 3 has two. Level data is unchanged for the old levels: a level's `crawler: {min, max, x}` patch is simply loaded as a frog (`loadLevel` turns it into a frog with `repl: true`). Level 3 lists its two frogs directly in `LEVELS[2].frogs`. The code (`FRG` tuning, `updateFrog`, `drawFrog`) sits in `adventure.html`; the old crawler code is still there but switched off (`CR` is always null).

A frog hops in short bounces; when you get within range it opens its mouth (amber "!"), then flicks a tongue straight out along the ground. The tongue is a low strip, so jumping it works. After the lash the frog is winded (harmless) for about a second: that is the window to strike. Touching its body also costs a flame. It can be hit by the Bog Blaster's aim assist and counts in "Enemies defeated".

- **Replacement frogs (Levels 2, 4, Endless)** keep what the crawler had: hits to defeat (`crawlerHp`: 3, 4 in Level 4, more deeper in the Endless Realms), speed / aggro / recovery scaling, 400 score (times the level's reward multiplier), the Endless variant name and glow ("Mossy Frog" and so on) and and a Frog Fragment drop.
- **Level 3's two frogs** take 3 hits (`FRHP`) and are worth 300 score.
- **Every frog drops a Frog Fragment** (`frog`). The old Bog Fragment (`crawler`) no longer exists: every recipe that used it now uses Frog Fragments, the Level 1 boss (the Bog Gator) drops a Frog Fragment too, and `cload()` in `store.js` turns any saved Bog Fragments (local or from an account) into Frog Fragments, so nobody loses anything.
- To move a frog, change its `{min, max, x}`; to tune them, edit `FRG` (`aggro`, `reach`, `wind`, `recover`) and `FRHP`.

## Level 4: The Sunlit Canopy
Hand-made, no boss. Daytime jungle theme (`TH4`, with `canopy` and `temple` flags), music track 4, 42 Glowspores, tougher enemies than Level 3 (Bramble Bug 3 hits, Bog Crawler 4). Because it sits at index 3, the Endless Realms now start at index 4 (Danger 1) and boss levels stay at 3, 6, 9. Old saves are shifted once on load (`swampverse-arcade-v4mig`) so Endless progress and best scores are kept; all four hand-made levels stay replayable from Level Select once unlocked (`retired()` in `adventure.html` always returns false; change it to hide a level again).

### MonK the Monkey (Level 4)
MonK swings on vines high above the path and lobs bananas at you. Set per level with `monk:{from,to}` in the level data (only Level 4 has it): he appears when you pass `from` and leaves near `to`. Every throw is telegraphed (he raises a banana for about half a second), a banana costs one flame, splats on solid things, and can be knocked away with a weapon swing or a goo shot. Tuning is at the top of the MonK block in `adventure.html` (`MKL`, `MKA`, `MKW`, throw timing in `updateMonk`).


## Treasure cabin (before every boss)

Every level with a boss arena (Levels 1-4 and every Endless Realms boss level) has a **cabin** just before the arena. `Cabin.add(level)` in `chestcabin.js` pushes the arena right to make room, so no level data is edited by hand (hand-made levels are patched right after `StoryBoss.attach`, endless ones in `lvl()`).

- **Flow.** Walk in through the open front door, stand at the chest and strike it (`J` / `E` / Attack) to open it. A popup offers **Max Flames +1** (the new Flame starts lit) or **+25% Damage**. The pick is applied at once, the barred back door swings open, and the player walks on to the arena with that stat. The back door stays shut until the chest is opened, so the choice cannot be skipped. Keys `1` / `2` also pick.
- **Lasts for one attempt.** The choice is kept for the rest of that level, then cleared when a level starts or the run restarts (`chestReset()` in `start()` and `respawnReset()`), so a Game Over means picking again.
- **Where it plugs in** (`adventure.html`): `maxHp()` adds `chestHp()`, `wstat()` multiplies damage by `chestDmg()` (so melee, goo shots and boss hits all use it), the HUD chip row (`showUps`) shows the pick, and the game mode `"chest"` shows the `#chp` popup (styles at the end of `ui.css`).
- **Tuning.** `Cabin.CFG` at the top of `chestcabin.js`: `HP` (extra Flames), `DMG` (0.25 = +25%), `W` (cabin width), `PRE` / `POST` (space before / after it), `TIME` (seconds added to par time). To add a third reward, add a line to `Cabin.REWARDS` and read it in `chestHp()` / `chestDmg()` (or a new helper).
- Spores that used to float inside the arena are moved with it, and the level's par time grows by `Cabin.CFG.TIME`.

## Purple glowspores (boss levels)

On every level with a boss arena (Levels 1-4 and the Endless Realms boss levels) all Glowspores are drawn purple (`drawSpore`, `GLOW.purple`) and each one collected pays `PURPLE_CRY` (3) extra Swamp Crystals when the run ends (`payOut` passes it to `Crystals.award(game,score,extra)`). Win or lose, the spores collected count; coins and score are unchanged. The results panel shows "Includes +N from purple glowspores".

## Mosquito swarms (Endless Realms)

`swarm.js` adds random mosquito swarms to the generated Endless levels (about 4 in 10 levels, one or two swarm spots each, never boss levels or the four hand-made levels). `Swarm.plan(level, index)` picks the spots from the level index (same level, same spots) when the level is built in `lvl()`. Run past a spot and a cloud of tiny mosquitoes flies in and circles the player. They do **no damage**: each touch shoves the player in a random direction (about every half second, with a short stun so you cannot steer straight out). A **Swat!** button pops up (also key `K`) and scatters the whole swarm; if ignored, the swarm gives up after 14 seconds. Tuning is `Swarm.CFG` (chance, count, shove strength, life); the button styles are at the end of `ui.css`. A shove can push you into a pond, which just sends you back to the last checkpoint.


## Your Loadout: weapon picker

The Weapon card in Your Loadout (`#lo-weapon` in `arcade.html`) is a button. It opens the Armory on its Weapons tab (`armoryPaintWeapons()` in `store.js`) listing the weapons you own, each with Equip / Unequip and a Skin row (Plain, every skin you own, and a Skin Shop chip that jumps to the Skin Shop tab). It uses the same `Gear` and `Skins` calls as the Bag, so the Bag, the Loadout and the Swamp Adventure stay in step.

## Weapon skins (Skin Shop)
Nine Swamp Crystal skins, three per weapon: Epic 600, Legendary 900, Mythical 1500 crystals (art in `SKIN_ART` in `weapons.js`, prices in `SKINS` in `store.js`). The Swamp Adventure now draws the worn skin in the player's hand (`heldSkin()` in `adventure.html`), tints the swing arc with the skin's colours, and tints Bog Blaster goo with the skin's accent colour. The Skin Shop is the Skin Shop tab of the Armory: open it from the Skins button on a weapon, the Skin Shop chip in the Weapons tab, `Skins.open()`, or `#skins`.


## SwampRealms: Evolution (Stages 1-4)
An idle swamp tycoon on its own page (`evolution.html`, logic in `evolution.js`, styles in `evolution.css`, every rule scoped to `#evo` / `.evo-*`). Full plan: `EVOLUTION-SPEC.md`.

- **Saving.** Progress is stored INSIDE the crystals save as `CS.evo` (`swamp-crystals-v1`), so it syncs with accounts with no Worker or `account.js` change. Fields: `v, ess, tot, taps, hq, patch, hatch, crs:[{a,n,s}], egg:{a,t,d}|null, seen`. `Crystals.save()` (one line added to `store.js`) writes the save; `evolution.js` calls `Crystals.reload()` first. Stage 1 saves (single `cname` creature) upgrade automatically in `clean()`.
- **Resource.** Swamp Essence is this game's own number. It never reads or writes Swamp Coins or Swamp Crystals.
- **Loop.** Pet any creature for Essence; build the Glowspore Patch (10) and upgrade it (60, 250); upgrade Swamp Hollow (120, needs the patch) to unlock the second plot; build the Hatchery there (150).
- **Eggs (Stage 2).** Buy a mystery egg (100, 250, 600, 1500 by creatures owned); it hatches after 30 / 60 / 120 / 240 s of real time (also while away) into one of the five avatar animals you do not have yet. Max 5 creatures.
- **Evolution (Stage 2).** Each creature has 3 stages: Hatchling, Juvenile (scarf, 200), Mighty (crown + cape, 900, needs patch level 3). Gear comes from `avatar.js` ids in `OUTFIT`. Each creature adds a production bonus by stage (`stageBonus`: +10% / +20% / +35%).
- **Tuning.** All numbers are in `CFG` at the top of `evolution.js`.
- **Layout (mobile app shell).** Floating HUD on the swamp (Essence, rate, bonus, fullscreen and back buttons), the swamp, a bottom sheet with the active panel, and an app tab bar (Build / Creatures / Realm). On desktop the same phone-shaped game is centred on a dark grid backdrop; in landscape and in full screen on wide screens the swamp is left and the sheet right. On this page the site tab bar and BETA badge are hidden (`body.evo-app`); the footer is below the game. The swamp art is a 400x340 SVG; tap spots and creature slots are percentages of it (`SLOTS`, `.evo-hq/.evo-p1/.evo-p2`).
- **Fullscreen.** `GameFS.attach({stage:"#evoStage"})`; the HUD button has `id="fsb" data-fs`.
- **Living Swamp (Stage 3).**
  - *Day / night:* a 240 s real-time cycle (Day 90, Dusk 30, Night 90, Dawn 30; `PH`, `CFG.cycle`). Day: taps x2. Night: Glowspores x1.5. The scene tints and glows to match. Away time ignores the cycle and uses a flat x1.1.
  - *Fireflies:* tappable wisps drift across the swamp (`fireTick`, `catchWisp`). Reward = 12 s of production + tap power, +10% per chain step (chain lasts 9 s, max x10). 6% are golden: x3 reward and a Frenzy (double production and taps, 20 s, +5 s per Lantern level). Night can bring a swarm of 3.
  - *Mutations:* evolving to Juvenile asks for one permanent trait from two options per animal (`MUT`, `PAIR`): Glow-Skin, Strong Paws, Lucky Charm, Night Owl. It doubles when the creature is Mighty. Older Juvenile or Mighty creatures get a free Choose mutation button.
  - *Bigger buildings:* Glowspore Patch to level 5 (1200, 5000), Swamp Hollow to level 3 (3000, +60%), Firefly Lantern (3 levels: more fireflies, more golden ones, longer Frenzy), and an endless Compost Heap (+4% per level, cost 6000 x 1.38^level) as the Essence sink after the patch is maxed.
  - *Swamp Journal:* 15 computed achievements (Realm tab), each +2% production. No coin or crystal payouts.
  - *Save:* `CS.evo` is now `v:3` and adds `lamp, fert, fc, gc, bs` and `m` on each creature. Older saves upgrade in `clean()`. Frenzy and chain are not saved.
- **Design polish (Stage 3.5).** Slimmer HUD, a sun/moon status pill under it (`.evo-status`), calmer cards with one accent edge and sentence-case buttons, creature row moved up so the sheet no longer clips it, Realm stats as tiles and the Journal as a badge grid. All in the last section of `evolution.css`.
- **Realms (Stage 4).** Files: `evolution-fx.js` (all visuals, global `EvoFX`, no game rules), `evolution.js`, `evolution.css` (last section).
  - *Worlds tab:* three realms. Murkwater Swamp (home), **Ember Bog** (unlock 25,000 Essence, needs Hollow 3 + Patch 5) and **Frostfen** (unlock 600,000, needs Cinder Geyser level 2). Each unlocked realm gives +15% production forever (`CFG.realmBonus`) and has one 4-level landmark (**Cinder Geyser**, **Aurora Lotus**; costs and rates in `BIO[n].lm`) whose Essence per second is added to the Patch's, so every realm produces all the time. A "Starfall Marsh" card is the teaser for the next realm. The old Realm tab is now labelled Journal (stats, daily gift, achievements, first steps).
  - *Travelling:* `travel(i)` plays a circular wipe in the realm colour (`EvoFX.iris`), swaps the art and particles at the midpoint, then slides in a zone title (`EvoFX.zone`). The whole game chrome (borders, orb, bars) re-tints per realm through `--bc` and `.evo-stage[data-bio]`. Day/night, fireflies, creatures and taps work the same in every realm; creatures stand on realm-coloured pads.
  - *Live atmosphere:* a canvas layer (`EvoFX.atmo`) draws pollen and glowspores (swamp), rising embers and ash (Ember Bog) or snowfall (Frostfen), plus shooting stars and water ripples at night and confetti bursts for celebrations. It pauses when the tab is hidden and draws one still frame under reduced motion.
  - *Cinematics:* `EvoFX.cine` full-screen cards with rotating light rays, shockwave rings, a flash and confetti: **hatch** (egg shakes, cracks, creature pops out), **evolve** (creature rises with its aura), **new realm** (Travel there / Later), **daily gift** and **welcome back**. Sounds reuse `SFX.charge / tear / rise / open / coin` from `cards.js`. All of it falls back to a calm static card under `prefers-reduced-motion`.
  - *Daily Swamp Gift:* day 1-7 streak (`CFG.gift`), Essence = max(100, 90 s of production) x [1, 1.2, 1.5, 2, 2.5, 3, 5]; day 7 also starts a 60 s Frenzy. Missing a day restarts at day 1. It uses the device date, so it is only a soft hook (no coins or crystals). It appears as a card on load (after the first 100 Essence), and again in the Journal tab.
  - *Welcome back card:* away 2+ minutes and 50+ Essence shows a count-up card; shorter absences keep the small toast.
  - *Next-goal pill:* under the status chips, always shows the cheapest next purchase (building, egg, evolve, landmark or realm) with a progress bar; turns gold and pulses when affordable, tap to jump to the right tab. Tabs also get a gold dot when something in them is ready.
  - *Polish:* tab panels slide in card by card, creatures wiggle at random and Mighty ones pulse their aura, compact numbers (12.3M) for big costs, 7 new Journal entries (22 total).
  - *Save:* `CS.evo` is now `v:4` and adds `rl` (realms unlocked 1-3), `at` (realm you are in), `em`, `fr` (landmark levels), `ds, bd, dl, dc` (gift streak, best streak, last claim date, claims). Older saves upgrade in `clean()`. Still inside the crystals save, so no Worker or account change.
  - *Tuning:* `CFG` and the `BIO` table at the top of `evolution.js`. Adding a realm = one `BIO` entry, one art function in `evolution-fx.js`, and a thumbnail class in `evolution.css`.
- **Next:** Stage 5, bosses (stat-check fights with capped first-kill rewards), then prestige and more realms.


## SwampRealms: Delve (Stage 1 of the multiplayer sandbox plan)

A single-player 2D dig-and-build sandbox at `/sandbox` (Arcade tile "Play SwampRealms: Delve").
Files: `sandbox.html`, `sandbox.css`, `sandbox-world.js` (tile/item tables + seeded world generator, no DOM, testable in Node), `sandbox.js` (game).

- **World:** 240 x 110 tiles from a seed. Three biomes left to right: Murkwater Swamp (mud, trees, water, Glowspore ore), Ember Bog (ash, basalt, lava, Cinder ore), Frostfen (snow, ice, Frostrock, Frost Crystal ore). Caves, lava deep down, bedrock at the bottom.
- **Play:** walk/jump (A/D, Space; touch pad on phones), hold on a block to dig, hold to place the selected block, hotbar keys 1-7, `E` opens Craft / Bag / Map / Goals / Options, `Q` swaps pick and last block.
- **Progression:** four picks (Reed -> Glowspore -> Cinder -> Frost). Each tier breaks harder rock and digs faster. Tile `tier` and `hard` values live in `sandbox-world.js`; recipes and goals are at the top of `sandbox.js`.
- **Look:** your equipped Armory avatar (animal + gear) is the player. Day/night cycle (8 min), soft per-tile lighting, torches, glowing ore, fireflies at swamp night, fog-of-war map.
- **Saving:** one localStorage key, `swamp-delve-v1`, this browser only (not cloud-synced yet). Stores the seed plus only the tiles you changed, so saves stay small. It never reads or writes Swamp Coins or Crystals, so it cannot affect the shop economy.
- **Not in Stage 1 (planned):** enemies and health, multiplayer server (Cloudflare Durable Objects), weekly world resets, account-linked rewards.
- **Gotcha:** shared scripts (`store.js`) listen globally for `data-craft`, `data-bag`, `data-armory`, `data-x`, `data-use`, `data-save`, `data-out`, `data-mode`. The Delve UI uses `data-sx-craft` etc. to avoid opening the Armory by accident. Do not reuse those names.

### Delve art pass (v2)
- All art is drawn in code (no image files). `paint()` in `sandbox.js` builds the tile atlas; edit palettes in `sandbox-world.js` (`tile(...)` colours).
- Terrain faces get a lit top rim and side shadows, caves get shaded back walls, water has depth colour, caustics and foam, lava bubbles and glows.
- Sky: gradient, twinkling stars, sun rays, moon craters, clouds, three biome-shaped parallax hill layers with horizon mist, Frostfen aurora, drifting spores / embers / snow.
- Decorations (hash-placed, so terrain is unchanged): cattails in the swamp, Ember Blooms, Frost Spikes.
- Extras: biome title card, landing squash and dust, soft vignette, dusk/dawn colour grade, avatar rim glow in the dark.
- Performance: canvas resolution is capped at 2x, and if a device drops below ~30 fps the optional sparkle (motes, aurora, glints, fireflies) switches off automatically. Players with "reduce motion" on get the calm version from the start.

### Delve progression, Stage 1: Paws to Pick (Lego-Fortnite-style opening, swamp style)
Roadmap: **1 Paws to Pick** (this) -> 2 Camp (campfire, shelter, Swampfolk villagers) -> 3 Survival (hearts, hunger, food, night Gloomlings) -> 4 Village levels gate the biomes and pick tiers -> 5 Quests and biome bosses.
- **Start with bare paws** (tool tier 0): paws break only soft things (leaves, mud, moss, snow, ash, cattails, glowcaps, vines). Wood, clay, ice, stone and ore need a pick. `PICKS` is now indexed directly by `S.tier` (0 = Bare Paws); this also fixes the old "Needs the ... Pick" message naming the wrong pick.
- **New materials:** Stick (50% from leaves), Reed Fiber (cattails and hanging vines, 1-2; cattails are rare on some seeds), Pebble (16% from mud/moss). Tuning lives in `breakTile()`.
- **Reed Pick** is now crafted by hand: 3 Sticks, 3 Fiber, 2 Pebbles. Glowspore/Cinder/Frost picks need a **Bog Workbench** within 7 tiles (`nearBench()`), and each pick needs the one before it.
- **Bog Workbench** (10 Wood + 4 Fiber): new placeable tile `T.BENCH`, non-solid, breakable.
- **The First Day Trail:** `TRAIL` array in `sandbox.js`, 10 guided steps with a HUD tracker, a Trail tab, a gold ring/arrow pointing at the nearest thing to gather, and small item gifts (no coins or crystals). Steps count lifetime stats, so gathering ahead still counts. To add a step, add one object to `TRAIL`.
- **Saves:** `v:2` adds `trail`; new stat counters `stick, fiber, pebble, spore, benches`. Old v1 saves keep their pick and skip the Trail. "Start a new world" restarts the Trail.
- **Held tool:** `drawHeld()` in `sandbox.js` draws your pick (or the block you are about to place) in your avatar's hand. The pick swings while you dig, you turn to face what you are working on, and the pick icons come from `drawPickIcon()` (one look per material). Bare paws show nothing in hand.

### Delve phone comfort pass
- Touch devices get a minimum tile size of 24px (desktop stays 15px) so fingers can dig accurately.
- On touch, the aim box sits 28-44px above the fingertip so your finger does not hide the target (`setAim()`).
- Short landscape phones (height <= 520px): site header hidden, the game uses the full screen, smaller pad/hotbar/Trail card (end of `sandbox.css`).
- Narrow-phone hotbar slots 41px -> 43px.

### Delve health system
- **HP:** 100 max, shown as a heart + bar + number under the bag button (green, then amber under 60%, red and pulsing under 30%). Stored as `hp` in the save (older saves start full). Tuning constants are at the top of `sandbox.js`: `MAXHP, FALL_SAFE, LAVA_DPS, REGEN_WAIT, REGEN_RATE`.
- **Damage:** falls (landing faster than `FALL_SAFE`, about a 3.5 tile drop; water cushions it; max about 40 at terminal speed), and lava (38 per second). Lava used to send you straight to camp; now it is thick (you sink slowly and can jump to climb out) so you can escape.
- **Healing:** 2.5 HP per second after 4 seconds without damage.
- **Passing out:** at 0 HP you wake at camp with full health and keep everything. Counted in `st.deaths` for later use.
- **Feedback:** red edge flash, damage number, short screen shake (off for reduced motion), blinking avatar, 0.5 s grace between hits.
- **For Stage 3:** `hurt(amount, why, continuous)` is the one function every damage source should call (Gloomlings, hunger).

### Delve wood art pass
- `paintLog()` and `paintPlanks()` in `sandbox.js` replace the old log/planks tiles. Logs are rounded trunks (lit left, shaded right) with bark cracks, scars, knots, glowing swamp moss and occasional orange bracket fungus. Planks are two beveled boards with grain, staggered joints, iron nails and a faint moss glow in the seam. Tile colours in `sandbox-world.js` were updated to match (used by the map and break particles).

### Delve weapons (progression track)
- **Weapons are a second track beside the picks.** `S.wpn` (0-4) is saved in `swamp-delve-v1` (older saves load as 0). `WEAPONS` at the top of `sandbox.js` holds name, glow colour, `dmg` and `cd` (seconds per swing); `RECIPES` entries with a `wpn` field craft them.
- **Ladder:** Reed Spear (by hand: 6 Stick, 3 Fiber, 4 Pebble, damage 5) -> Glowspore Blade (Workbench, needs the Glowspore Pick: 12 Glowspore, 8 Wood, 8 Planks, damage 9) -> Cinder Cleaver (Workbench, Cinder Pick: 16 Cinder, 12 Basalt, 16 Planks, damage 16) -> Frost Fang (Workbench, Frost Pick: 18 Frost Crystal, 14 Frostrock, 24 Planks, damage 26, fastest swing). Each needs the previous weapon (`need` = pick tier required).
- **Using it:** a "weapon" slot appears in the hotbar once you own one (slot 2, `Lv` badge). Hold to swing toward your aim; the weapon is drawn in the avatar's hand with its own swing and slash sparks. `Q` now toggles pick and weapon/last block.
- **Art:** `drawWeaponIcon(g, tier)` (same 32x32 box as `drawPickIcon`), used for the hotbar, Craft tab and held sprite.
- **Goals:** four new goals (Armed Paws, Spore Blade, Cinder Cleaver, Frost Fang). `st.swings` counts swings.
- **Not wired yet:** Delve has no enemies, so swings hit nothing. Stage 3 (Gloomlings) should read `WEAPONS[S.wpn].dmg` inside `hurt`-style enemy damage and use `cd`. The Armory `GEAR` weapons for the Swamp Adventure are separate and untouched.

### Delve leaf art pass
- Foliage is now built from small pointed pixel leaves (lit top-left, shadow pixel underneath, sun glints on the tips) over a dark back layer, instead of random squares. `paintLeaf()` in `sandbox.js`; palette `LEAFC`.
- `LEAFATLAS` holds 4 variants for each of the 16 open-edge combinations. Open edges (sky, air, cave) get ragged leaf tips and corners, a sunlit rim on top and a shaded rim underneath, so canopies look leafy instead of square. Interior tiles wrap, so they tile with no seams. The old rim overlay for leaves is gone because it is baked into those tiles.
- Same colours family, same 16x16 pixel grid and same glowspore sparkle as before. Wood, vines and every other tile are unchanged.

### Delve HUD layout
- **Bag button** now sits in a `.sbx-dock` at the bottom centre, to the right of the hotbar (`#sbxMenuBtn`, same click and `E` behaviour).
- **Health bar** is the top-right element of `.sbx-hud`: a round heart badge that beats (faster when low, thumps when hit), a glossy bar with a flowing sheen, quarter-mark ticks, the number inside, and a trailing orange "damage ghost" that drains slowly after a hit. Colour and glow follow state: mint above 60%, gold to 30%, red and pulsing below. Reduced-motion turns the animations off. `drawHp()` in `sandbox.js` drives it.

### Delve enemies (the first two from the Swamp Realms Adventure)
- **Bramble Bug** and **Swamp Frog**, drawn with the Adventure's own art code (`drawEnemy()` in `sandbox.js`, scaled to tiles). Tuning is the `ENEMY` and `FROG` tables above `useTool`; they live in the `enemies` list, are updated by `updateEnemies(dt)` and paused while the bag is open.
- **Bramble Bug** (12 HP, 9 damage): patrols the Murkwater Swamp surface and, sometimes, dark caves. Notices you within about 7 tiles, charges, rams you, then backs off for a second. It turns at ledges and walls.
- **Swamp Frog** (18 HP, 12 tongue / 6 touch): hops about; when you are close it shows an amber **!** for half a second, then lashes its tongue along the ground. **Jump the tongue**, then hit it while it is winded (dizzy sparks, harmless).
- **Fighting:** hold a weapon and swing. Each swing hits every enemy in front of you after a short wind-up (`strike()`), using the weapon's `dmg` and reach (Spear 2.7 tiles, Blade 2.2, Cleaver 2.4, Fang 2.4). Hits knock them back and show damage numbers and a small health bar.
- **Spawning:** only once you carry a weapon (`S.wpn >= 1`), only in Murkwater Swamp, off screen, up to 3 bugs + 2 frogs (4 total), every 4 to 7 seconds. They despawn when you walk far away and are cleared when you wake at camp.
- **Loot:** Bramble Fragments and Frog Fragments, 60% per kill and always the first kill of each (`give()` into the Delve bag). The same Fragment is also added to your **Adventure** Fragments (`Fragments.add("bug" / "frog")`).
- **Progression:** the **Glowspore Blade** now also needs 3 Bramble Fragments and the **Cinder Cleaver** 3 Frog Fragments. Four new Trail steps are appended after "Cross into Ember Bog" (Arm Yourself, Squash a Bramble Bug, Hop to It, Spore Blade), so existing saves keep their place and just get the new steps. Four new goals: Bug Squasher, Frog Hopper, Thorn Trouble (5 bugs), Croak Crusher (5 frogs). Kill counts are saved as `st.bugs` and `st.frogs`.
- **Later:** Ember Bog and Frostfen enemies (and night Gloomlings) can reuse `newEnemy`, `moveEnemy` and `damageEnemy`; add a table entry, an AI function and a draw branch.

### Delve: a much bigger world, go left or right
- **Size:** 720 x 140 tiles (was 240 x 110). Each area is 240 tiles wide, three times the old width, and the world is 30 tiles deeper (cave lava now starts relative to the bottom, `H - 18`, and `H - 40` in Ember Bog).
- **Layout:** you start in the **middle**, in Murkwater Swamp (spawn x = 360). **Ember Bog is east (right)** and **Frostfen is west (left)**, so both directions are open from the first minute. The constants are `B_FROST = 240`, `B_EMBER = 480`, `SPAWNX = 360` in `sandbox-world.js`; the sky, hills and back-wall colours blend by the same numbers (`biomeMix`). The Trail text "Walk east past the swamp edge" still points the right way. Frostfen needs the Cinder Pick, so it is a longer trip west.
- **Old saves:** worlds are tagged `wv: 3` (`WORLDVER`). A save from the smaller world keeps its items, tools, weapons, goals and Trail progress, but its digging, explored map and position are reset (they no longer line up with the new world), and a toast explains it.
- **Map tab:** drawn 1:1 at 720 x 140 with the three area names and a bigger "you are here" marker.


### Delve: night bats and beds
- **Dusk Bats** (`ENEMY.bat`, `BAT`, `updateBat()` in `sandbox.js`): night-only fliers. Once you carry a weapon, they spawn in the sky above you from late dusk to early dawn (clock 268-446), in any biome. A bat drifts overhead, shows **red eyes** for half a second, then dives in a straight line; step aside, then strike. A hit scares it off briefly. A roof or the ground stops them. At dawn, or if you dig more than ~7 tiles below the surface, they flap away.
- **Scaling:** bat HP is 10 + 4 per weapon tier, damage 6 + 2 per tier. Max bats at once is `1 + weapon tier` (min 2, max 6), plus one late in the night; spawns speed up as the night goes on.
- **Swamp Bed** (`T.BED`, craft: 6 Planks, 6 Fiber, 8 Leaves, by hand): needs solid ground under it. Stand within ~3 tiles at night (clock 280-440) and tap the **Sleep** pill above the bed (or press **F**). The screen fades, the night is skipped to dawn, you heal fully, bats are cleared, and the bed becomes your respawn point (`S.bed`). Fainting or "Back to camp" now returns you to your bed; a broken bed is forgotten and spawn falls back to camp.
- **Sleep rules** (`sleepBlock()`): you cannot sleep with an enemy within ~14 tiles, unless a solid tile is within 5 tiles overhead (a roof or tree canopy keeps everything out). So bats push you to either kill them or build a shelter.
- **Progression hooks:** 3 new Trail steps appended after Spore Blade (Build a Bed, Night Watch: 2 bats, Sleep Tight); 5 new goals (Bed Time, Night Watch, Sweet Dreams, Bat Basher: 10 bats, Well Rested: 5 sleeps); **Frost Fang now also needs 4 Bat Wings**, so the last weapon requires night hunting. Old saves keep their place and pick up the new Trail steps.
- **Saves:** new top-level `bed`, new stats `bats, beds, sleeps, warned`. Bat Wings are Delve-only (no Adventure Fragment exists for them, so `Fragments.add` ignores it).
- **Gotcha:** `sandbox.html` script versions bumped to `delve6` / `delve14` so browsers fetch the new code.


### Delve: multiple worlds (save slots)
- **Per player:** each signed-in name (read from the account link in `swamp-sync-v1`) or "guest" has their own list of up to 8 worlds on this device. Index key `swamp-delve-worlds:<user>`; each world is its own save at `swamp-delve-w:<user>:<id>` (same save format as before). Worlds are still browser-only, not cloud-synced, and still never touch coins or crystals.
- **Migration:** the old single key `swamp-delve-v1` is copied once into a world called "My Swamp" for whoever opens Delve first on the device (`swamp-delve-legacy-claimed` records that). The old key is left alone as a backup.
- **Worlds screen** (`#sbxWorlds`, built in JS; styles at the end of `sandbox.css`): Play/Resume, Rename, Delete (tap twice), and New world with an optional name. Open it from Bag, then Options, then **Save & exit to menu**. It also opens at launch when a player has more than one world. The game pauses while it is open; Escape or "Back to game" closes it; "Exit to Arcade" leaves.
- **Saving:** autosave every 8 s, when the tab is hidden, on page close, and whenever you create, switch or open the menu. If storage is full or blocked, a one-time toast says so.
- **"Start a new world" no longer erases anything;** it makes a new slot. Deleting the last world creates a fresh one.
- **Gotcha:** the Worlds UI uses `data-wl-*` attributes so `store.js` global listeners never react. Signing in or out mid-session takes effect on the next page load.
- `sandbox.html` versions bumped (`sandbox.js` delve15, `sandbox.css` delve7).


### Delve: walk past trees
- Natural trunks and leaves are now scenery: the player and enemies walk through them, and bats and shelter checks ignore them (a tree canopy no longer counts as a roof for sleeping). You can still chop trunks and punch leaves for Wood and Sticks.
- `blocks(x, y)` in `sandbox.js` is the collision test used by `boxHit`, `eBoxHit`, enemy ledge/spawn checks and `sheltered()`. A Log or Leaves tile only blocks if it differs from the generated world (i.e. you placed it). Other tiles are unchanged, and lighting and drawing still use the tile's own `solid` flag. Tile data and saves are unchanged.
- `sandbox.js` version bumped to `delve16`.


### Delve: pixel full-body avatars (v1)
- **New file `delve-avatar.js`** (loaded before `sandbox.js`): draws your Armory outfit as a pixel-art, full-body character on a 22x34 grid, one per animal (frog, donkey, owl, monkey, elephant). `DelveAv.sprite(outfit, animal, scale)` returns cached frames (idle0/1, walk0-3, jump, fall) plus a separate front arm; `DelveAv.thumb()` makes the "Play as" buttons.
- **Cosmetics are worn, not pasted on:** all 12 hats (incl. hat colour variants such as the Y2K Bandana) sit on the head, face gear sits on the eyes, scarf/bow tie/bell/chain/cape sit at the neck (cape hangs behind), shirts cover the torso and sleeves (robe also covers the legs), shoes sit on the feet, and the ring / necklace / bandana accessories are drawn too. Rare outfits twinkle in their rarity colour.
- **Arm + tool move together:** `toolPose()` in `sandbox.js` gives one arm angle and one tool angle, so picks, weapons and placeable blocks are held in the hand and swing with the arm.
- **Scale:** art is drawn at a whole number of screen pixels per art pixel (`round(ts*1.7/24)`), so it stays crisp when you zoom.
- **Fallback:** if `delve-avatar.js` fails to load, Delve shows a plain green dot (the old portrait path was removed). The Armory still uses the portrait art from `avatar.js`, which is untouched.
- **Gotcha:** the cosmetic art lives in `delve-avatar.js` separately from `avatar.js`. A new cosmetic needs a drawing in both (hats in `HATS`, face gear in `FACES`, neck in `NECKS`, shirts in `SHIRTS`/`torso()`, shoes in `SHOES`). Scripts are versioned `delve1` / `delve17`.

### Delve: doors
- **New tiles** (`sandbox-world.js`): `DOOR_B/DOOR_T` (closed, solid) and `DOORO_B/DOORO_T` (open, walk-through). A door is always two tiles tall and its halves switch together. New item `door` (Swamp Door).
- **Craft:** 6 Planks + 2 Reed Fiber (no Workbench needed). Place it on solid ground with two free tiles above; it will not place on top of you or an enemy.
- **Use:** walk into a closed door to open it (it shuts itself about 0.8s after you leave); quick-tap/click it, or press **F** near it, to open or close it by hand (it then stays as you left it; F still sleeps first when a bed is near at night). Hold a pick on it (about 0.3s) to break it and get the Door back. It cannot close on you or an enemy.
- **Effects:** closed doors block bugs, frogs and bats and count as a roof for sleeping and for light; open doors do not.
- **Saves:** door state is stored in the normal tile diff, so no save-format or world-version change. New stat `st.doors` and goal "Knock Knock". `sandbox.js` v `delve18`, `sandbox-world.js` v `delve7`.

### Delve: ladders
- **New tile/item** `LADDER` / `ladder` (non-solid, tile id 31). Craft "Ladder (4)" from 3 Planks, no Workbench.
- **Place:** on air next to a solid block or another ladder (so you can stack them up or down a wall or shaft). Breaking is instant with paws.
- **Climb:** standing in a ladder, Jump/W/Up climbs, S/Down descends, and you hold still otherwise. On touch screens you slowly slide down when not climbing. Falling damage resets while on a ladder.
- New stat `st.ladders` and goal "Up and Away". Versions: `sandbox.js` delve19, `sandbox-world.js` delve8. No save-format change.

### Delve: no backwall under generated trees
- `recalc()` in `sandbox.js` now ignores world-generated Swamp Logs when finding the ground/roof row of a column, so chopping the bottom of a tree shows the normal sky/world background instead of the dark cave backwall. Logs and Planks you place still count as roofs and keep the backwall. `sandbox.js` is `delve20`.

### Delve: Wooden Chest (progression)
- **New tile/item** `CHEST` / `chest` (id 32, non-solid like the Bench). Craft "Wooden Chest": 8 Planks + 2 Reed Fiber, no Workbench. Needs solid ground under it.
- **Open:** quick-tap/click it within reach, or press **F** nearby (after sleep at night and doors). Opens a **Chest** tab with "In the chest" and "In your bag" grids; tap an item to move the whole stack, plus Take all / Store all. 30 kinds per chest, no stack limit (99,999).
- **Breaking:** hold a pick on it (0.3s, so taps never break it). A chest with items inside refuses ("Empty the chest before picking it up"); an empty one drops itself.
- **Saves:** `S.chests["x,y"] = { item: count }` in the world save (dropped if the world is rebuilt via WORLDVER). Moving items in and out uses `addInv()`, so stored/taken items do not count toward gather stats or goals.
- **Progression:** new last step of the First Day Trail, "Stash Your Loot" (store 10 items, reward 8 Planks + 4 Torches; players who had finished the Trail will see it appear), new goal "Pack Rat". Stats `st.chests`, `st.stashed`. Versions `sandbox.js` delve21, `sandbox-world.js` delve9.

### Delve: Reed Shovel
- **What:** a basic second tool, `S.shovel` (0/1, saved; older saves load as 0). Crafted by hand (no Workbench) from 2 Sticks, 2 Reed Fiber, 2 Pebbles.
- **Digging:** only the soft blocks in `SOFT` (Mud, Mossy Mud, Clay, Ash Soil, Snow), at speed 0.85 (`SHOVEL.sp`): a bit faster than bare paws (0.55), slower than the Reed Pick (1). Anything else shows "A shovel only digs soft ground...". No pick tier needed, so it can dig Clay.
- **Hotbar:** appears as its own slot after the weapon (number keys now go 1-9). Held in hand with the same swing as the pick. Art is `drawShovelIcon()`.
- **Goal:** "Dig It". Versions `sandbox.js` delve22.

### Delve: tool durability
- Pick, Shovel and weapon each have durability, saved in `S.dur` (older saves start full). Pick 100/180/300/480 by tier, shovel 80, weapon 40/70/100/150. Each block broken costs 1 (2 for hard rock); each weapon swing that hits costs 1.
- At 0 a tool is **broken**, not lost: a broken pick digs like bare paws, a broken shovel or weapon cannot be used. Repair in the Craft tab (new Repair section): Reed gear by hand, Glowspore and up next to a Workbench. New tools start full.
- Hotbar slots show a durability bar (green, yellow, red) and "Broken". Versions: `sandbox.js` delve23, `sandbox.css` delve9.

### Delve: the village and its villagers (Murkwater Swamp only)
- **Village:** `buildVillage()` in `sandbox-world.js`. One per world, in the home swamp, about 50 tiles from spawn (side depends on the seed). Flat plateau, five plank houses (7 or 9 wide) and a plaza. Each house has a door in both walls, an outside lamp by each door, a hanging lantern, a bed, table, chairs and paintings. Built after trees/decorations and uses `hash()` only, so older terrain, trees and cave holes are unchanged and `WORLDVER` was NOT bumped (saved worlds keep their digging; they just gain a village). Returned as `world.village` (`x0/x1`, `f0/f1` footprint, `gy`, `plaza`, `houses`). No Cave Holes are placed inside it.
- **Villagers:** `CIV_FOLK`, `spawnCivs`, `updateCivs`, `drawCivs` in `sandbox.js`. Seven swamp avatars (frog, donkey, owl, monkey, elephant, frog, owl) drawn with `DelveAv` and fixed outfits. They wander, open doors in their way (doors shut by themselves via `updateDoors`; `doorInTheWay` counts them), and face you when you are close. Not saved, cannot be hurt, only move while you are within ~70 tiles.
- **Calm zone:** `spawnEnemy` skips spawning inside the village footprint.
- Scripts versioned `sandbox-world.js?v=delve12`, `sandbox.js?v=delve27`.
- **Village knick-knacks (new tiles 38-42):** Swamp Flower (4 colours by position, sways like cattails), Wooden Bucket, Clay Pot, Flower Pot (4 bloom colours), Barrel. Not solid, break by hand and give themselves back, can be placed again on solid ground (items `flower`, `bucket`, `pot`, `flowerpot`, `barrel`; no recipes yet). The village has wild flowers on open ground, a market corner in the plaza (pot, barrel, bucket, flower pot), one knick-knack on each doorstep and one inside each house. Tile ids were appended, so old saves are unaffected. Scripts: `sandbox-world.js?v=delve13`, `sandbox.js?v=delve28`.

### Delve: Minecraft-style inventory (limited slots)
- **Slots, not an endless bag.** You hold 30 slots: 6 hotbar slots (keys 1-9 follow the tool slots, then these) and a 24-slot bag. A stack holds up to **64**, or **16** for furniture and bulky items (`SMALL` in `sandbox.js`). Tools (pick, weapon, shovel) have their own fixed hotbar spots and do not use slots. Tuning constants: `INV_HOT`, `INV_MAIN`, `STACK`, `STACK_SMALL`.
- **Open it** with **E** or the bag button: it opens on the new **Inventory** tab. Tap a slot, then tap another to move, swap or merge. Buttons: To hotbar / To bag, Hold (equips a placeable block and closes), Split (half to the first empty slot), Toss 1, Toss all (asks twice), Sort bag. Desktop extras: right-click splits a stack, Shift-click quick-moves between hotbar and bag.
- **Full means full.** You cannot start digging a block whose drop has no room ("Inventory full!"), cannot pick up torches, and crafting that would not fit is refused. The bag button shows a red FULL badge. Chest "Take" only takes what fits and leaves the rest in the chest. Trail rewards and enemy loot are never lost: what does not fit goes to **Overflow** (bottom of the Inventory tab), collected with a tap once there is room.
- **Code.** `S.slots` (30 x `null | {k, n}`) is the layout and is saved; `S.inv` stays the running total that crafting, building and repairs already read. `reslot()` copies any change in `S.inv` back into the slots, so those code paths were left alone. `give(item, n, tx, ty, keep)` is the capped pickup (`keep` = never lose it), `room(item)` says how many fit.
- **Old saves.** A save without `S.slots` is converted on load: hotbar items first, everything else in order; anything past 30 slots / 64 per stack is kept in `S.extra` (Overflow), so nothing is deleted.
- Versions: `sandbox.js` delve29, `sandbox.css` delve12. No world-format change.

### Delve: realistic village decor + Decor Workbench
- **Village placement.** `buildVillage` (`sandbox-world.js`) now puts every decoration through `decor(x, y, tile, rule)`: floor pieces need solid ground under them, wall pieces (paintings) need a block beside or above, lamps need something to hang on. A piece that would float is skipped. Paintings hang on the wall above each doorway, doorsteps are left clear, houses have bed + table + chairs (+ barrel or pot in bigger ones), the plaza is a market stall (table with barrel, pot, bucket, flower pot), and barrels/buckets sit mid-lane between houses. Existing worlds pick up the new layout except tiles you edited.
- **Decor Workbench.** Craft it at a Bog Workbench (14 Planks, 6 Fiber, 4 Clay), place it, and standing near it (or tapping it / pressing F) adds a **Decor** tab with every decor recipe. Chair, Table and Painting moved there from the Craft tab. New pieces: Stool, Reed Rug, Bookshelf, Clay Lantern (light), Campfire (light), Swamp Banner, Wooden Sign, Flower Planter. Some are built from others (Lantern needs a Clay Pot, Planter needs a Barrel, Flower Pot needs a Pot + Flower).
- **Adding decor later.** (1) `tile()` line, `ITEMS` entry, `ITEM_ORDER` name and `DECOR_FLOOR` / `DECOR_WALL` in `sandbox-world.js`; (2) a drawing for its `kind` in `paint()` in `sandbox.js`; (3) one line in the `DECOR` list in `sandbox.js`. Placement rules, stack size (16) and the decor goals follow from the `DECOR_*` lists automatically. Goals: Interior Designer, Cozy Corner, Master Decorator.
- Versions: `sandbox.js` delve30, `sandbox-world.js` delve14.

### Delve: backpacks (carry more)
- **Two craftable packs, kept for good.** `BAGS` at the top of `sandbox.js`: **Reed Backpack** (made by hand: 10 Reed Fiber, 6 Leaves, 4 Sticks) adds 12 bag slots (42 in all); **Bog Hauler Pack** (needs the Reed Backpack, the Glowspore Pick and a Bog Workbench nearby: 16 Fiber, 8 Glowspore, 8 Planks, 12 Leaves) adds 12 more (54 in all). Both are recipes in the Craft tab (`bag` field), with goals "Pack Up" and "Hauler".
- **How it works:** new saved field `S.bag` (0-2). The extra slots are appended to the end of `S.slots` (index `INV_BASE` = 30 and up), so the hotbar and base bag never move. `invSize(b)` gives the slot count, `invN()` the current count; the old fixed `INV_N` is only the base size now. Crafting a pack grows the list and moves anything waiting in Overflow into the new room.
- **Saves:** older saves load with `bag` 0 and a 30-slot list as before. A saved slot list must match `invSize(bag)`, otherwise the totals in `inv` rebuild it. No world-format change.
- **Look:** the Inventory tab shows the pack slots in their own "Backpack" grid; the pack is also drawn on your avatar's back (brown reed, or teal with side pockets). Icons come from `drawBagIcon`.
- Versions: `sandbox.js` delve31, `sandbox.css` delve13.
- **Avatar size:** `AVS` (0.85) at the top of `sandbox.js` scales how big you and the villagers are drawn; set it to 1 for the old size. The hitbox is unchanged. `sandbox.js` delve32.
- **Fall damage eased (delve33):** `FALL_SAFE` 17 to 21 (safe up to about a 5 tile drop, was about 3.5) and a new `FALL_DMG` of 3.5 per speed point (was 4), so a terminal-speed fall costs about 21 HP instead of 40. Both are at the top of `sandbox.js`.

### Delve: Watering Can
- **Craft:** Watering Can in the Craft tab, by hand (4 Planks, 3 Reed Fiber, 2 Pebbles). It is a tool beside the pick, shovel and weapon (shows in the hotbar with its water, like `7/12`), not an inventory item. Saved as `S.can` (0/1) and `S.water` (0-12, `CAN.max`); it comes full. Older saves load without it.
- **Fill:** select it and hold on any Water tile (about 5 per second).
- **Water:** hold it on a Swamp Flower, Cattail or Glowcap (the tile or one touching it, so a phone tap does not need to be exact). Each watering uses 1 water and, after about 4.5 to 6 seconds, the plant spreads: a new one appears on free ground within 2 tiles (solid ground under it, never over water). A patch with 5 or more of the same plant nearby is "already thriving" and does not spread, so it cannot be farmed forever. `PLANTS` lists what can be watered; add a tile id there to include more.
- **Under the hood:** `useCan`, `plantNear`, `updateGrow` in `sandbox.js`. Pending growth is in memory only (`grow[]`); new plants are normal tile edits, so they save with the world. New stats `st.watered`, `st.grown`, goals "Green Paws" and "Gardener". The pour animation is a held `drawCanIcon` canvas that tips forward while watering. Not usable inside caves.
- Versions: `sandbox.js` delve34.

### Delve: back walls (Terraria-style depth)
- **A second layer behind the blocks.** `walls[]` (one byte per tile, the tile id of the wall art, 0 = none) is drawn after the sky and before blocks, so you walk IN FRONT of walls and furniture and decor stand in front of them. Walls never block movement and have no collision. Drawn by `drawWall` (darkened a bit, with a soft edge where a wall stops so rooms read as rooms).
- **Six wall types** (new tile ids 52-57 appended to `T`, so old saves are unaffected): Plank, Log, Mossy (by hand), and Timber Frame, Plaster, Stone Brick (next to a Bog Workbench). Each recipe makes 4. They are normal items (stack 64, hotbar, chests) with a `wall` field in `ITEMS`. To add one: an id in `T` + a `tile()` line + an `ITEMS` entry with `wall` + `ITEM_ORDER` in `sandbox-world.js`, a picture in `paintWall()` and a recipe in `RECIPES` in `sandbox.js`.
- **Placing:** select a wall item and tap an empty tile (air or a decor piece) that has a block or another wall beside, above or below it (`canWall`). Placing a different wall over one swaps it and hands the old one back. **Removing:** hold your pick, shovel or paws on an empty tile with a wall behind it (`wallMine`); you get the wall back. Blocks are still removed first, so a decor piece comes off before the wall behind it.
- **Saving:** new save field `we` (like `e`: `"index:wallId"` pairs, only changes from what the world made, `0` = removed). Dropped if the world is rebuilt (`WORLDVER`), same as `e`. New stat `st.walls`, goals "Back Wall" and "Room Maker".
- **Village:** `buildVillage` now also fills each house interior with its own wall (timber, plank, plaster, log, timber). Terrain generation is unchanged (checked: the block layer is identical to before for several seeds), so existing worlds only gain the walls.
- Versions: `sandbox.js` delve35, `sandbox-world.js` delve15.

### Delve: pixel tools (smaller, cleaner)
- All tool, pack and bare-paw art is now 16x16 pixel sprites in `SPR` (`sandbox.js`): rows of colour letters, dark outline added automatically. Hotbar, Craft cards and held tools share them, so one edit changes all three. Grip is bottom-left, working end top-right.
- Held tools are drawn at about 0.8x an avatar pixel (smaller than before) and pivot at the grip cell (see `drawHeld`).
- Hotbar slots shrank (46 -> 40px, 38 on phones, 36 landscape) with crisp 32px icons, pixel-square corners and a segmented durability bar. Craft card icons sit in a small framed tile (`sandbox.css`, end of file).
- Versions: `sandbox.js` delve36, `sandbox.css` delve14. No save-format change.

### Delve: armor (third progression track)
- **`S.arm` (0-4)** saved with the world (older saves load as 0), plus `S.dur.arm`. `ARMORS` in `sandbox.js` holds name, colour and `red` (share of damage blocked). Armor is worn automatically when crafted.
- **Ladder:** Reed Vest (by hand: 10 Fiber, 4 Stick, 6 Leaves, blocks 12%) -> Glowspore Mail (Workbench, Glowspore Pick, + 2 Bramble Fragments, 24%) -> Cinder Plate (Cinder Pick, + 2 Frog Fragments, 36%) -> Frost Plate (Frost Pick, + 3 Bat Wings, 50%). Each needs the previous piece. Recipes are the `arm` entries in `RECIPES`.
- **Damage:** `hurt()` blocks `red` of every hit (half as much against lava) and shows "-N blocked". Each real hit wears the armor 1 point (2 for hits of 14+). At 0 it is BROKEN: no protection until repaired in the Craft tab (`REPAIR.arm`, `DUR.arm`).
- **Look:** 16x16 pixel icons (`arm1`-`arm4` in `SPR`), a badge with icon and durability % under the health bar (`#sbxArm`, `drawArm()`), and the armor is drawn on your avatar torso and shoulders (`armorOver()` and `ARM` in `delve-avatar.js`; the Armory outfit is untouched).
- **Goals:** Dressed Up, Spore Mail, Cinder Plate, Frozen Solid. Versions: `sandbox.js` delve37, `sandbox.css` delve15, `delve-avatar.js` delve2.

### Delve: Workbench upgrades gate the armor (sandbox.js `BENCH_LV`)

- **Idea:** you get basic gear for the first biome, then tools for the second, then upgraded gear to keep going. The **Bog Workbench levels up** (`S.bl`, 1-4, saved), and every upgrade costs loot from the biome *before* the one the new gear is for. One level covers the whole world: every Workbench you place looks and works at your level, so a second bench at a far camp is already upgraded.
- **Upgrade:** Craft tab, new **Workbench** card at the top (stand near a Workbench). The card shows the next level, what it unlocks, and the cost.

| Level | Name | Upgrade cost (biome the loot comes from) | Unlocks |
|---|---|---|---|
| 1 | Bog Workbench | 10 Wood + 4 Fiber (Murkwater) | Glowspore Pick, Glowspore Blade, Hauler Pack, walls, Decor Workbench |
| 2 | Glowspore Workbench | 20 Glowspore, 12 Clay, 16 Stone, 16 Planks, 3 Bramble + 2 Frog Fragments (Murkwater) | Glowspore Mail, Cinder Pick, Cinder Cleaver |
| 3 | Cinder Forge Workbench | 24 Cinder Shard, 20 Basalt, 16 Ash Soil, 16 Planks (Ember Bog) | Cinder Plate, Frost Pick, Frost Fang |
| 4 | Frost Workbench | 24 Frost Crystal, 20 Frostrock, 12 Ice, 16 Planks (Frostfen) | Frost Plate |

- **Pattern:** tools for a biome come at level N, the armor for it needs level N+1. Recipes get a `bl` field (no `bl` = level 1); `craft()` refuses with "Upgrade your Workbench to the ... first" and the Craft tab shows the recipe as Locked with the same note. The recipe's old gear order (previous tier first) still applies.
- **Look:** the Workbench tile is repainted per level (wood, teal Glowspore gems, dark Cinder Forge with a lava seam, icy Frost Crystals) by `repaintBench()`, so the hotbar icon and placed benches change on upgrade.
- **Saves:** `bl` is new. Old saves get `bl` from the gear they already own (for example a Cinder Plate means level 3), so nobody is locked out of gear they have.
- **Trail:** two steps added at the end (Level Up the Bench, Suit Up). Goals added: Bench Boost, Forged in Ember, Frostbound Bench.
- **Tuning:** costs live in `BENCH_LV`, per-recipe levels in the `bl:` fields of `RECIPES`. Repairing Glowspore-and-up gear still only needs any Workbench.

### Delve: Decor expansion (new blocks, 23 showpieces, themed by biome)

- **30 new tiles** (ids 58-87, appended so old saves are untouched; `sandbox-world.js` v delve16, `sandbox.js` v delve39). All are made at the **Decor Workbench** (Decor tab). New cards are grouped: Building blocks, Murkwater Showpieces, Ember Bog Collection, Frostfen Collection.
- **7 new solid building blocks** (placed like Planks, stack to 64, not "decor"): Stone Brick, Reed Thatch, Glowspore Glass (see-through), Basalt Brick, Cinder Lamp Block (very bright), Frost Brick, Crystal Lamp Block (brightest).
- **Murkwater (no Workbench level needed):** Swamp Wardrobe, Wooden Fence (joins in a row), Reed Bale, Swamp Well, Mossy Fountain, Bubbling Cauldron (from a Clay Pot, green light), Glowcap Pot (from a Clay Pot), Stone Hearth (bright), Frog Statue, plus wall pieces Glowspore Sconce, Bramble Trophy and Frog Trophy (use Bramble / Frog Fragments).
- **Ember Bog (needs Glowspore Workbench, level 2):** Cinder Brazier (one of the brightest lights), Basalt Guardian, Ember Lantern, Ashen Urn, Cinder Anvil, Ember Banner (wall).
- **Frostfen (needs Cinder Forge Workbench, level 3):** Ice Sculpture, Frost Lantern, Frost Banner (wall), Crystal Chandelier (wall, very bright). **Frostrock Throne** is the capstone and needs the **Frost Workbench (level 4)**.
- **Gating:** decor recipes take the same `bl` field as the gear recipes (see Workbench upgrades above). Locked cards show "Needs the ... (upgrade your Bog Workbench in the Craft tab)".
- **Light:** each tile can carry `glow` (r,g,b), `gr` (radius) and `ga` (strength) in `sandbox-world.js`; the renderer uses them instead of the old torch/ember/crystal colour rules, so every new light has its own tint (teal Glowspore, orange ember, icy blue).
- **To add another piece:** same four steps as before (tile + ITEMS + ITEM_ORDER + DECOR_FLOOR/WALL, a picture, a recipe), but pictures now go in the `DECOR_ART` table in `sandbox.js` keyed by the tile's `kind`, and the recipe takes an optional `bl:`.
- **Goals:** Grand Decorator (30 pieces), Fit for a King (Frostrock Throne).

### Delve: bigger, more open world (WORLDVER 4)

- **Size:** `W` 720 -> **2160** tiles (3x wider again), `B_FROST` 720, `B_EMBER` 1440, `SPAWNX` 1080, so each biome is 720 tiles wide (`sandbox-world.js`). Depth is unchanged (`H` 140). Generation takes about 50-120 ms; frame cost is the same as before because only the tiles on screen are drawn.
- **Terrain:** a slow, wide swell is added to the surface (`fbm(x * 0.011 ...)`, +/-13 tiles scaled per biome: swamp 0.8, Ember 0.6, Frostfen 1.1), so every area now has real hills, ridges and basins. Swamp basins fill into lakes you can swim, Frostfen basins freeze over and are walkable. Ember ground is capped just above the lava level, so a surface lava lake can never cut off the walk east. The spawn area stays flat.
- **More to find:** cave holes are placed about every 36 columns, so there are about 50 now (was about 17). The village still sits near the spawn.
- **Map tab:** the canvas is 1080 x 260 and everything on it scales with the world (`mk`, `sx` in `drawMap()`); it now also marks the village once you have seen it.
- **Old saves:** the `wv` check in `clean()` keeps items, gear, bench level and goals, and drops digging, the explored map and chests (they no longer line up with the new world). The player sees "The world grew again!" once.
- **Versions:** `sandbox.js` delve40, `sandbox-world.js` delve17, `sandbox.css` delve16.
