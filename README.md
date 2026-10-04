# SwampVerse

Free daily swamp card packs for the DonK community. A static site: plain HTML, CSS and JavaScript, no build step.
Progress is saved in the visitor's browser (`localStorage`).

## Files

| File | What it does |
| --- | --- |
| `index.html` | Home page |
| `catalog.html` | Open packs and view the collection |
| `game.html` | Fly Frenzy and Swamp Match |
| `shop.html` | Packs (Swamp Coins), cosmetics and boosts (Swamp Crystals) |
| `cards.js` | Card list, pack rules, saved data, sounds, header wallet |
| `store.js` | Swamp Crystal shop: cosmetics, boosts, tap effects |
| `styles.css` | All styles, including the cosmetics in section 15 |
| `404.html`, `robots.txt`, `sitemap.xml` | Not-found page and search engine files |

## Two currencies

- **Swamp Coins** buy card packs. Games pay coins for the first `playsPerDay` rounds each day.
- **Swamp Crystals** buy cosmetics and boosts. Every game round pays crystals and rounds are unlimited.

Tuning lives in `RULES` at the top of `cards.js` (`game`, `game2`, `crystals`).

## Adding to the shop

Add a line to `SHOP_ITEMS` in `store.js`, then add the matching style in `styles.css` section 15.
The style hooks on `data-<category>="<id>"` on `<html>`, for example `data-frame="gilded"`.
Boosts are in `BOOSTS` in `store.js`.

## Deploying

Commit the files to GitHub. If the repo is connected to Cloudflare Workers, it redeploys on push.
Otherwise run `npx wrangler deploy`.
