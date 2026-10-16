-- SwampRealms accounts. Run this once in your D1 database (Console tab, or: wrangler d1 execute swampverse --remote --file=schema.sql)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,      -- lowercase, used for sign in
  display TEXT NOT NULL,          -- name as the person typed it
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  iters INTEGER NOT NULL,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,         -- SHA-256 of the cookie value
  user_id TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
CREATE TABLE IF NOT EXISTS saves (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,             -- JSON: {cards, packs, crystals}
  rev INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS limits (
  k TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  first INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS delve (   -- Delve worlds backed up to the account (worker.js also creates this on first use)
  user_id TEXT NOT NULL,
  wid TEXT NOT NULL,              -- the world's id on the device that made it
  name TEXT NOT NULL,
  data TEXT NOT NULL,             -- the world save, as JSON text
  rev INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (user_id, wid)
);
CREATE TABLE IF NOT EXISTS mp_rooms (   -- open Delve multiplayer rooms (worker.js also creates this on first use)
  code TEXT PRIMARY KEY, host_id TEXT NOT NULL, host_name TEXT NOT NULL, name TEXT NOT NULL,
  pub INTEGER NOT NULL, pvp INTEGER NOT NULL, players INTEGER NOT NULL, updated INTEGER NOT NULL
);
