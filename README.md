# SwampRealms

Free daily swamp card packs for the DonK community. A static site: plain HTML, CSS and JavaScript, no build step.
Progress is saved in the visitor's browser (`localStorage`). Visitors can also sign in (username + password) to keep it in a cloud account and play on any device. See **Accounts** below.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Home page |
| `catalog.html` | Open packs and view the collection |
| `shop.html` | Buy packs with Swamp Coins |
| `arcade.html` | The Arcade hub: a card for each game (just the Swamp Adventure for now) |
| `adventure.html` | The Swamp Adventure. Every run pays Swamp Coins and Swamp Crystals, no daily limit. Rates: `COIN_PER` in the page script (1 coin per 150 score) and `CRY.games.adv` in `store.js` (1 crystal per 50 score) (3 levels + Rootmaw boss). Its own page, with a Full screen button (top centre of the game, and under it), or press `F`. Uses the browser Fullscreen API, and a page-filling view on iPhone |
| `avatar.html` | Pick a swamp animal and dress it with Swamp Crystals |
| `cards.js` | Cards, packs, pack rules, saved data, sounds, coin wallet |
| `store.js` | Swamp Crystals wallet, cosmetics list, header crystal counter. Load after `cards.js` |
| `avatar.js` | Draws the animals and cosmetics as SVG |
| `styles.css` | Base styles: layout, packs, cards, shop |
| `ui.css` | The Arcade theme (dark glass panels, mint glow, uppercase labels) for every page, plus the arcade and avatar screens. Loaded after `styles.css` |
| `account.js` | Sign in button + popup, and the cloud sync. Load after `store.js` on every page |
| `worker.js` | Cloudflare Worker for `/api/*` (register, login, logout, save). Not served to visitors |
| `schema.sql` | Database tables for accounts. Run once in D1 |
| `wrangler.jsonc`, `.assetsignore` | Cloudflare config (Worker + D1 binding) and the list of files that are not published |
| `menu.js` | Header menu: builds the hamburger dropdown from the nav links, avatar and sound switch. Load last, after `account.js` |
| `404.html`, `robots.txt`, `sitemap.xml` | Not-found page and search engine files |

## Two currencies

- **Swamp Coins** buy card packs. Earned from every Swamp Adventure run.
- **Swamp Crystals** buy avatar cosmetics. Earned from every Swamp Adventure run. Tuning is in `CRY` at the top of `store.js`; call `Crystals.award("adv", score)` when a run ends.

## Header menu

The header shows the logo, coin and crystal counters, the account button and a hamburger. Every page link (Home, Packs, Arcade, Adventure, Shop, The Herd), the avatar and the sound switch live in the dropdown. To add a page, add one `<a class="hide" href="...">Name</a>` to the `<nav>` in the page header; `menu.js` moves it into the dropdown. Give it an icon in `ICONS` at the top of `menu.js` (optional). Script order on every page: `cards.js`, `store.js`, `account.js`, `menu.js`.

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
