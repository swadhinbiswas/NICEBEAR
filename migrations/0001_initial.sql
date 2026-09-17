-- NiceBear initial schema (§3). Additive-first: never drop/replace columns in the same release.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  github_id TEXT UNIQUE,
  avatar_url TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
--> statement-breakpoint
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  github_installation_id TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
--> statement-breakpoint
CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner','admin','developer','viewer')),
  created_at INTEGER NOT NULL,
  UNIQUE(org_id, user_id)
);
--> statement-breakpoint
CREATE INDEX idx_memberships_user ON memberships(user_id);
--> statement-breakpoint
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user','organization')),
  key_hash TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('read','admin')),
  rate_limit_per_min INTEGER NOT NULL DEFAULT 60,
  monthly_quota INTEGER,
  expires_at INTEGER,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
--> statement-breakpoint
CREATE INDEX idx_api_keys_owner ON api_keys(owner_id, owner_type);
--> statement-breakpoint
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  engine_type TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
--> statement-breakpoint
CREATE INDEX idx_collections_org ON collections(org_id);
--> statement-breakpoint
CREATE TABLE avatars (
  id TEXT PRIMARY KEY,
  collection_id TEXT REFERENCES collections(id),
  org_id TEXT NOT NULL REFERENCES organizations(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('generated','uploaded','external_url')),
  github_repo TEXT,
  github_path TEXT,
  commit_sha TEXT,
  external_url TEXT,
  attested_rights INTEGER DEFAULT 0,
  seed TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
--> statement-breakpoint
CREATE INDEX idx_avatars_collection ON avatars(collection_id);
--> statement-breakpoint
CREATE INDEX idx_avatars_org ON avatars(org_id);
--> statement-breakpoint
CREATE TABLE avatar_pointer_history (
  id TEXT PRIMARY KEY,
  avatar_id TEXT NOT NULL REFERENCES avatars(id),
  commit_sha TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_pointer_history_avatar ON avatar_pointer_history(avatar_id);
--> statement-breakpoint
CREATE TABLE rotation_rules (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('avatar','collection','organization')),
  rule_json TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_rotation_rules_target ON rotation_rules(target_id, target_type);
--> statement-breakpoint
CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  rotation_rule_id TEXT NOT NULL REFERENCES rotation_rules(id),
  cron_expr TEXT,
  timezone TEXT DEFAULT 'UTC',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE webhooks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
--> statement-breakpoint
CREATE TABLE webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL REFERENCES webhooks(id),
  event TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','success','failed')),
  attempt INTEGER DEFAULT 1,
  response_code INTEGER,
  delivered_at INTEGER,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_deliveries_webhook ON webhook_deliveries(webhook_id, created_at);
--> statement-breakpoint
CREATE TABLE usage_logs (
  id TEXT PRIMARY KEY,
  api_key_id TEXT REFERENCES api_keys(id),
  avatar_id TEXT,
  region TEXT,
  cache_hit INTEGER DEFAULT 0,
  response_ms INTEGER,
  status_code INTEGER,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_usage_key_time ON usage_logs(api_key_id, created_at);
--> statement-breakpoint
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  stripe_subscription_id TEXT UNIQUE,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  current_period_end INTEGER
);
--> statement-breakpoint
CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  stripe_invoice_id TEXT UNIQUE,
  amount_cents INTEGER,
  status TEXT,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_audit_org_time ON audit_logs(org_id, created_at);
--> statement-breakpoint
CREATE TABLE content_reports (
  id TEXT PRIMARY KEY,
  avatar_id TEXT NOT NULL REFERENCES avatars(id),
  reporter_contact TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','removed','dismissed')),
  created_at INTEGER NOT NULL
);
