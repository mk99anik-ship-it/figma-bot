ALTER TABLE jobs ADD COLUMN device_token TEXT;

CREATE INDEX IF NOT EXISTS jobs_device_token_idx ON jobs(device_token);
