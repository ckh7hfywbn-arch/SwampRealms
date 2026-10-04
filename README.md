# SwampVerse

Free daily swamp card packs for the DonK community. A static site: plain HTML, CSS and JavaScript, no build step.
Progress is saved in the visitor's browser (`localStorage`).

## Files

| File | What it does |
| --- | --- |
| `index.html` | Home page |
| `catalog.html` | Open packs and view the collection |
| `game.html` | Fly Frenzy and Swamp Match mini games |
| `shop.html` | Buy packs with Swamp Coins |
| `cards.js` | Card list, packs, pack rules, saved data, sounds, header coin wallet |
| `styles.css` | All styles |
| `404.html`, `robots.txt`, `sitemap.xml` | Not-found page and search engine files |

## Packs

- **Adventures of the Swamp**: one free pack a day, or buy one in the shop.
- **The Swamp Verse: Abstract Edition**: Pack #2.

## Tuning

Everything lives in `RULES` at the top of `cards.js`: daily packs, game rounds per day (`game`, `game2`), coin rewards, streaks and shop prices.

## Before going live

`index.html` points social previews at `/preview.jpg` (1200x630). Add that image to the same folder or link previews will be blank.

## Deploying

Commit the files to GitHub. If the repo is connected to Cloudflare Workers, it redeploys on push.
