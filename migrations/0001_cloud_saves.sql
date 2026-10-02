CREATE TABLE IF NOT EXISTS save_versions (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  saved_at INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('upload', 'restore')),
  state_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, revision)
);
