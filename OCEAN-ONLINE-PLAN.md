# Online Ocean (future update, planned Nov 16 2026, not started)

Stewey's decisions. Build this closer to the finished game, not now.

## What it is
- Getting on the boat shows the loading screen and joins a shared ocean server of about 15-20 players. A full server opens a new one.
- Docking at the pier, or rowing ashore to raid an island, goes back to your own world.
- Your loot, boat upgrades and save stay in your own world. The server only shares what players see of each other.

## Rules
1. **Shared loot:** everyone on a server fights over the same pirate ships, floating loot and loot islands. Islands reset after a while.
2. **PvP:** players can fire cannons at each other.
3. **No chat:** no text chat and no emotes on the ocean.
4. **Friends:** if you own a world and go to sea, your world keeps running for your friends. A friend joins you by going to the boat's dock at the pier and pressing "Join <player name>", which puts them on your ocean server. You can also sail alone, without them.

## Build notes
- New Durable Object class next to `DelveRoom` in `worker.js` (SQLite-backed, works on the Workers Free plan), plus matchmaking that picks a server with room.
- Each client sends its boat about 4-5 times a second; the server relays it and runs the shared things (ships, loot, island resets, cannon hits).
- Every player on one server gets the same island layout.
- Free plan limits: 100k Durable Object requests a day (20 incoming WebSocket messages count as 1) and 13,000 GB-s a day. If the limit is hit, fall back to the private solo ocean. The $5/month Workers plan covers far more.
- Dev menu buttons and smoke test as usual. Keep the world host's world running while the host is at sea.
