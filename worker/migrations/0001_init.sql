-- Database is created automatically by worker/src/index.js.
-- This file is intentionally safe and can also be run manually.
CREATE TABLE IF NOT EXISTS app_meta(
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
