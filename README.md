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
| `crawler` (Bog Crawler) | Bog Fragment | 40% |
| `boss` (Rootmaw) | Rootmaw Fragment (rare) | 25% |
| `frog`, `crocodile`, `slime` | Frog / Crocodile / Slime Fragment | 40% (ready for when those enemies exist) |

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
| Spiked Blade (the first weapon) | 4 Bramble (`bug`) + 2 Bog (`crawler`) + 1 Wing (`wing`) | Levels 1 and 2: Bramble Bugs, the Bog Gator and the Mirewing |
| Bog Blaster | 3 Bog (`crawler`) + 1 Rootmaw (`boss`) + 1 Ape (`ape`) | Levels 3 and 4: the Rootmaw and the Stone Ape |
| Swamp Hopper Staff | 5 Frog Fragments (`frog`, the Frog enemy is not in the game yet, so this one cannot be crafted until it is) | not yet |

| Armor | Cost |
| --- | --- |
| Mirewing Helmet | 4 Bramble (`bug`) + 2 Bog (`crawler`) + 1 Wing Fragment (`wing`) |
| Mirewing Chest Piece | 5 Bog (`crawler`) + 1 Wing Fragment (`wing`) |
| Mirewing Boots | 3 Bramble (`bug`) + 3 Bog (`crawler`) + 1 Wing Fragment (`wing`) |

Every armor piece needs at least one Wing Fragment, so armor comes from beating the Level 2 boss (the Mirewing). The gear ids in `store.js` are still `wardenhelm`, `wardenplate` and `wardenboots` so existing saves keep working; only the display names changed.

- **Add a weapon:** add a line to `GEAR` in `store.js` (`slot:"weapons"`), then a line to `RECIPES` with the same id: `{cost:{crawler:3, bug:2}}`. Costs can mix any fragment ids from `FRAGMENTS`. The Craft tab builds itself from `RECIPES`.
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

Add a line to `COSMETICS` in `store.js`, then draw it in `avatar.js` (`HAT`, `FACE`, `NECK` or `BG`, same id).

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
