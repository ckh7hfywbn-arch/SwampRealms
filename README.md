# SwampVerse

Free daily swamp card packs for the DonK community. A static site: plain HTML, CSS and JavaScript, no build step.
Progress is saved in the visitor's browser (`localStorage`).

## Files

| File | What it does |
| --- | --- |
| `index.html` | Home page |
| `catalog.html` | Open packs and view the collection |
| `shop.html` | Buy packs with Swamp Coins |
| `arcade.html` | The Arcade (the old Play page is merged in). Fly Frenzy (coins for the first rounds each day, crystals every round), Lily Hop, Swamp Dash, Memory Flip. Open a game directly with `arcade.html#hop` |
| `avatar.html` | Pick a swamp animal and dress it with Swamp Crystals |
| `cards.js` | Cards, packs, pack rules, saved data, sounds, coin wallet |
| `store.js` | Swamp Crystals wallet, cosmetics list, header crystal counter. Load after `cards.js` |
| `avatar.js` | Draws the animals and cosmetics as SVG |
| `styles.css` | Base styles: layout, packs, cards, shop |
| `ui.css` | The Arcade theme (dark glass panels, mint glow, uppercase labels) for every page, plus the arcade and avatar screens. Loaded after `styles.css` |
| `_redirects` | Sends the old `/game` address to `/arcade` on Cloudflare |
| `404.html`, `robots.txt`, `sitemap.xml` | Not-found page and search engine files |

## Two currencies

- **Swamp Coins** buy card packs.
- **Swamp Crystals** buy avatar cosmetics. Rounds that pay crystals are unlimited.
  Tuning is in `CRY` at the top of `store.js`. Call `Crystals.award("gameName", score)` when a round ends.

## Adding a cosmetic

Add a line to `COSMETICS` in `store.js`, then draw it in `avatar.js` (`HAT`, `FACE`, `NECK` or `BG`, same id).

## Before going live

`index.html` points social previews at `/preview.jpg` (1200x630). Add that image to this folder.

## Deploying

Commit the files to GitHub. If the repo is connected to Cloudflare Workers, it redeploys on push.
