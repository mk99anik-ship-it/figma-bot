CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  pairing_code TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL,
  design_json TEXT,
  figma_url TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS jobs_pairing_code_idx ON jobs(pairing_code);
