CREATE TABLE IF NOT EXISTS pair_sessions (
  id TEXT PRIMARY KEY,
  pairing_code TEXT NOT NULL UNIQUE,
  device_token TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
