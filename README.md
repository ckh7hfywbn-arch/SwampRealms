# SwampRealms

Free daily swamp card packs for the DonK community. A static site: plain HTML, CSS and JavaScript, no build step.
Progress is saved in the visitor's browser (`localStorage`). Visitors can also sign in (username + password) to keep it in a cloud account and play on any device. See **Accounts** below.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Home page |
| `catalog.html` | Open packs and view the collection |
| `shop.html` | Buy packs with Swamp Coins |
| `arcade.html` | The Arcade hub and the main menu for all games (games are not in the header menu, they are tiles here): a card for each game (just the Swamp Adventure for now) plus the Bag tile |
| `adventure.html` | The Swamp Adventure. Every run pays Swamp Coins and Swamp Crystals, no daily limit. Rates: `COIN_PER` in the page script (1 coin per 150 score) and `CRY.games.adv` in `store.js` (1 crystal per 50 score) (3 hand-made levels + Rootmaw boss, then endless generated levels, see **Endless progression**). Each level has its own background music (`MUSIC` in the page script: synthesized, no audio files, same sound switch as the effects, plus a faster track for the Rootmaw fight). Its own page, with a Full screen button (top centre of the game, and under it), or press `F`. Uses the browser Fullscreen API, and a page-filling view on iPhone. The player is drawn as the visitor's own avatar (animal + gear from `avatar.html`, via `avatarRefresh()` and `drawPlayer()`); it falls back to the original sprout character if the avatar can't load |
| `progression.js` | The Endless Realms: difficulty, rewards, enemy variants, boss ranks and the level generator for every level after Level 3. Pure data and maths, loaded before the game script. See **Endless progression** below |
| `avatar.html` | Pick a swamp animal and dress it with Swamp Crystals |
| `cards.js` | Cards, packs, pack rules, saved data, sounds, coin wallet. Card back = `card-back.jpg` |
| `store.js` | Swamp Crystals wallet, cosmetics list, header crystal counter, the Fragments (enemy loot) table, the Gear table, the Crafting recipes, and the Bag (inventory popup). Load after `cards.js` |
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

Levels 1-3 are still hand-built in `LEVELS` in `adventure.html` and are unchanged. Every level after them is **generated from numbers in `progression.js`**, so there is no last level and nothing to write per level.

- **Index → level.** `lvl(i)` in `adventure.html` returns the hand-built level for 0-2, otherwise `Progression.build(i)`. The same index always builds the same level (seeded), so best scores, checkpoints and replays are stable. Levels are built when first needed and cached.
- **Difficulty.** `Progression.scale(i)` returns the settings for a level: enemy hits-to-kill (`bugHp`, `crawlerHp`, `bossHp`), speed, Bog Crawler aggro and recovery, boss speed / shockwave speed / extra follow-up slams, and the reward multiplier. All formulas are in the `TUNING` table at the top of `progression.js`; change a line there to retune the whole game. Health grows with the square root of depth, speeds are capped so every fight stays dodgeable. Levels 1-3 resolve to exactly the original numbers. `applyScale()` in `adventure.html` applies them when a level loads.
- **Danger.** Level 4 is Danger 1, Level 5 is Danger 2, and so on (shown in Level Select, the level banner and the results screen).
- **Bosses.** Every third level (3, 6, 9, 12 ...) is a boss level. Rank 0 is the Rootmaw (12 hits). Later ones are Elder, Ancient, Primeval, Mythic and Eternal Rootmaw (then Eternal Rootmaw II, III ...) with more health, faster walk and slam, and from rank 2 an extra follow-up slam.
- **Enemy variants.** A new look every 3 levels: Thornback, Ember, Frostbite, Gloom, Stormcall, Venom, Moonshade, Voidtouched (then the same set again at Greater, Elder, Ancient, Mythic). A variant has its own name, a coloured glow behind it and a nameplate when you are close. They still drop the same fragments (loot ids are unchanged), with `fragBonus` added to the drop chance.
- **Rewards.** `rewardMul` scales every score value (spores, kills, clear bonus, speed bonus). Coins and crystals are paid from score, so they grow with depth with no other change. Boss kills pay a further `bossPts` multiplier.
- **Level layout.** `Progression.build` joins ground islands with stepping-stone crossings (spacing and height stay inside the player's jump), then fills islands with crates, stumps, stair-steps and thorn patches (kept off landing and take-off edges), puts the bug and crawler on their own clear islands, and ends in a goal gate or a boss arena. Gaps, thorns and gliding stones grow with depth up to safe caps. Palettes are the three base themes with the hue rotated, so each level looks different.
- **Progress.** Saved as before (`swampverse-arcade-progress`) but no longer capped at 3: finishing any level unlocks the next. Saves from when Level 3 was the last level pick up Level 4 automatically. Level Select lists the three hand-made levels plus the latest endless ones, with "Show earlier levels". The title screen has a **Continue** button that jumps to the furthest level.
- **Not wired yet (next steps):** equipped weapon stats (`GEAR`, Damage) are not read by combat yet, so every hit is still 1 damage. When they are, divide the hits-to-kill formulas in `TUNING` by the weapon's damage. Only one Bramble-type bug and one Crawler-type per level exist because the enemy code is single-instance; more enemies per level needs those turned into lists. New enemy types can be added as another variant list plus a `FRAGMENTS` line.

## Two currencies

- **Swamp Coins** buy card packs. Earned from every Swamp Adventure run.
- **Swamp Crystals** buy avatar cosmetics. Earned from every Swamp Adventure run. Tuning is in `CRY` at the top of `store.js`; call `Crystals.award("adv", score)` when a run ends.

## Fragments (enemy loot)

Defeated enemies have a chance to drop a Fragment. The table is `FRAGMENTS` in `store.js`: one line per enemy id with the fragment name, drop `chance` and `rarity` (`common`, `uncommon`, `rare`).

| Enemy id | Fragment | Chance |
| --- | --- | --- |
| `bug` (Bramble Bug) | Bramble Fragment | 35% |
| `crawler` (Bog Crawler) | Bog Fragment | 50% |
| `boss` (Rootmaw) | Rootmaw Fragment (rare) | 30% |
| `frog`, `crocodile`, `slime` | Frog / Crocodile / Slime Fragment | 40% (ready for when those enemies exist) |

- **Stored for real.** Counts are kept in the crystals save as `frags` (`{ bug: 2, boss: 1 }`), so they persist in the browser and sync with accounts like everything else. `Fragments.count(id)`, `Fragments.total`, `Fragments.all` read them; `Fragments.add(id, n)` writes them.
- **Drops.** `adventure.html` calls `Fragments.roll(enemyId)` the first time an enemy is seen defeated (the same place the kill score is awarded, `scoreTick`). A drop is saved immediately, shows a small notification at the top of the game, puts a shard burst and a floating label where the enemy fell, and adds a chip to the Fragments line under the game. The results screens show how many were found in the run.
- **New enemy:** add a line to `FRAGMENTS` with the enemy's id, and add the enemy to `foes()` in `adventure.html` (the loot id is the same as the foe id).

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
- **Stats and icon:** optional `stats:{Damage:7,Speed:"Medium",Range:"Long"}` and `icon:"<svg inner markup>"` on any `GEAR` line. Stats are shown only; the Swamp Adventure does not use the equipped weapon yet. To wire it up, read `Gear.equipped("weapons")` in `adventure.html`.

## Rarity colors (shared with the cards)

Fragments, weapons and all other gear use the **same six rarities and colors as the cards**: Common (grey `#b9bcc2`), Uncommon (green `#5fd38d`), Rare (blue `#4da3ff`), Epic (purple `#a855f7`), Legendary (orange `#ff9f1c`), Mythical (pink `#ff4fd8`). `FRAG_RARITY` in `store.js` reads the names and colors straight from `CARDS` in `cards.js`, so if a card rarity color changes, the Bag, fragment drops, loot notifications and weapon cards follow. Use any of the six as `rarity:"epic"` etc. on a `FRAGMENTS` or `GEAR` line.

## Crafting

Players turn fragments into weapons from the **Craft** tab of the Bag (open it from the Arcade Bag tile, the Bag button under the Swamp Adventure, or `Bag.open("craft")`). Each recipe shows its cost, how many fragments the player has, and a Craft button that stays disabled until they have enough. Crafted weapons land in the Bag's Weapons tab and are saved with the crystals save (`gear`), so they sync with accounts.

| Weapon | Cost |
| --- | --- |
| Bog Blaster | 5 Bog Fragments (`crawler`) |
| Spiked Blade | 4 Bramble Fragments (`bug`) |
| Swamp Hopper Staff | 5 Frog Fragments (`frog`, the Frog enemy is not in the game yet, so this one cannot be crafted until it is) |

- **Add a weapon:** add a line to `GEAR` in `store.js` (`slot:"weapons"`), then a line to `RECIPES` with the same id: `{cost:{crawler:3, bug:2}}`. Costs can mix any fragment ids from `FRAGMENTS`. The Craft tab builds itself from `RECIPES`.
- **API:** `Crafting.list()`, `Crafting.info(id)`, `Crafting.check(id)` (returns `{ok, reason, missing}`), `Crafting.craft(id)`. `craft` checks the cost, subtracts the fragments and adds the weapon in one save, so nothing is taken unless the craft succeeds.
- Weapons are collectibles for now. Equipping them in the Swamp Adventure is a separate step.

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
