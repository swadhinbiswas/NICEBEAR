-- NiceBear rollups (§10). Raw usage_logs stays append-only; dashboards read
-- usage_hourly/usage_daily plus the current partial bucket from usage_logs.
-- Additive migration: safe to apply alongside 0001 on fresh or live DBs.
CREATE TABLE usage_hourly (
  bucket INTEGER NOT NULL,               -- hour floor, unix seconds UTC
  avatar_id TEXT,
  api_key_id TEXT,
  region TEXT,
  requests INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  cache_hits INTEGER NOT NULL DEFAULT 0,
  sum_ms INTEGER NOT NULL DEFAULT 0,
  max_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, avatar_id, api_key_id, region)
);
--> statement-breakpoint
CREATE INDEX idx_usage_hourly_bucket ON usage_hourly(bucket);
--> statement-breakpoint
CREATE TABLE usage_daily (
  bucket INTEGER NOT NULL,               -- day floor, unix seconds UTC
  avatar_id TEXT,
  api_key_id TEXT,
  region TEXT,
  requests INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  cache_hits INTEGER NOT NULL DEFAULT 0,
  sum_ms INTEGER NOT NULL DEFAULT 0,
  max_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, avatar_id, api_key_id, region)
);
--> statement-breakpoint
CREATE INDEX idx_usage_daily_bucket ON usage_daily(bucket);
--> statement-breakpoint
CREATE TABLE rollup_state (
  grain TEXT PRIMARY KEY,                -- 'hourly' | 'daily'
  last_bucket INTEGER NOT NULL DEFAULT 0 -- last COMPLETE bucket aggregated
);
--> statement-breakpoint
INSERT INTO rollup_state (grain, last_bucket) VALUES ('hourly', 0), ('daily', 0);
