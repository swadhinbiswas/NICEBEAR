import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Turso (LibSQL) schema — metadata only, no binaries. See §3.
 * Binaries live in GitHub (Contents API) fronted by jsDelivr.
 * Migrations in /migrations are additive-first.
 */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  githubId: text("github_id").unique(),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
});

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("free"),
  githubInstallationId: text("github_installation_id"),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
});

export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: ["owner", "admin", "developer", "viewer"] }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({ idxMembershipsUser: index("idx_memberships_user").on(t.userId) }),
);

export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    ownerType: text("owner_type", { enum: ["user", "organization"] }).notNull(),
    keyHash: text("key_hash").notNull(),
    scope: text("scope", { enum: ["read", "admin"] }).notNull(),
    rateLimitPerMin: integer("rate_limit_per_min").notNull().default(60),
    monthlyQuota: integer("monthly_quota"),
    expiresAt: integer("expires_at"),
    lastUsedAt: integer("last_used_at"),
    createdAt: integer("created_at").notNull(),
    revokedAt: integer("revoked_at"),
  },
  (t) => ({ idxApiKeysOwner: index("idx_api_keys_owner").on(t.ownerId, t.ownerType) }),
);

export const collections = sqliteTable(
  "collections",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    engineType: text("engine_type").notNull(),
    createdAt: integer("created_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => ({ idxCollectionsOrg: index("idx_collections_org").on(t.orgId) }),
);

export const avatars = sqliteTable(
  "avatars",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id").references(() => collections.id),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    // No other source_type is representable — content policy in schema (§5.4).
    sourceType: text("source_type", { enum: ["generated", "uploaded", "external_url"] }).notNull(),
    githubRepo: text("github_repo"),
    githubPath: text("github_path"),
    commitSha: text("commit_sha"),
    externalUrl: text("external_url"),
    attestedRights: integer("attested_rights").default(0),
    seed: text("seed"),
    createdAt: integer("created_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => ({
    idxAvatarsCollection: index("idx_avatars_collection").on(t.collectionId),
    idxAvatarsOrg: index("idx_avatars_org").on(t.orgId),
  }),
);

export const avatarPointerHistory = sqliteTable(
  "avatar_pointer_history",
  {
    id: text("id").primaryKey(),
    avatarId: text("avatar_id")
      .notNull()
      .references(() => avatars.id),
    commitSha: text("commit_sha").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({ idxPointerHistoryAvatar: index("idx_pointer_history_avatar").on(t.avatarId) }),
);

export const rotationRules = sqliteTable(
  "rotation_rules",
  {
    id: text("id").primaryKey(),
    targetId: text("target_id").notNull(),
    targetType: text("target_type", { enum: ["avatar", "collection", "organization"] }).notNull(),
    ruleJson: text("rule_json").notNull(), // serialized DSL, see §5/§6 (spec §5 DSL)
    priority: integer("priority").default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({ idxRotationRulesTarget: index("idx_rotation_rules_target").on(t.targetId, t.targetType) }),
);

export const schedules = sqliteTable("schedules", {
  id: text("id").primaryKey(),
  rotationRuleId: text("rotation_rule_id")
    .notNull()
    .references(() => rotationRules.id),
  cronExpr: text("cron_expr"),
  timezone: text("timezone").default("UTC"),
  createdAt: integer("created_at").notNull(),
});

export const webhooks = sqliteTable("webhooks", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: text("events").notNull(), // JSON array
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
});

export const webhookDeliveries = sqliteTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    webhookId: text("webhook_id")
      .notNull()
      .references(() => webhooks.id),
    event: text("event").notNull(),
    status: text("status", { enum: ["pending", "success", "failed"] }).notNull(),
    attempt: integer("attempt").default(1),
    responseCode: integer("response_code"),
    deliveredAt: integer("delivered_at"),
    createdAt: integer("created_at").notNull(),
    payload: text("payload"), // JSON event payload — signed bytes source of truth
  },
  (t) => ({ idxDeliveriesWebhook: index("idx_deliveries_webhook").on(t.webhookId, t.createdAt) }),
);

export const usageLogs = sqliteTable(
  "usage_logs",
  {
    id: text("id").primaryKey(),
    apiKeyId: text("api_key_id").references(() => apiKeys.id),
    avatarId: text("avatar_id"),
    region: text("region"),
    cacheHit: integer("cache_hit").default(0),
    responseMs: integer("response_ms"),
    statusCode: integer("status_code"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({ idxUsageKeyTime: index("idx_usage_key_time").on(t.apiKeyId, t.createdAt) }),
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    metadata: text("metadata"), // JSON
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({ idxAuditOrgTime: index("idx_audit_org_time").on(t.orgId, t.createdAt) }),
);

export const contentReports = sqliteTable("content_reports", {
  id: text("id").primaryKey(),
  avatarId: text("avatar_id")
    .notNull()
    .references(() => avatars.id),
  reporterContact: text("reporter_contact"),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["open", "reviewing", "removed", "dismissed"] })
    .notNull()
    .default("open"),
  createdAt: integer("created_at").notNull(),
});

/** Pre-aggregated usage (§10). Grain tables share a shape; dashboards read
 * these plus the current partial bucket from usage_logs. */
function usageRollup(name: "usage_hourly" | "usage_daily") {
  return sqliteTable(
    name,
    {
      bucket: integer("bucket").notNull(),
      avatarId: text("avatar_id"),
      apiKeyId: text("api_key_id"),
      region: text("region"),
      requests: integer("requests").notNull().default(0),
      errors: integer("errors").notNull().default(0),
      cacheHits: integer("cache_hits").notNull().default(0),
      sumMs: integer("sum_ms").notNull().default(0),
      maxMs: integer("max_ms").notNull().default(0),
    },
    (t) => ({ idxBucket: index(`idx_${name}_bucket`).on(t.bucket) }),
  );
}

export const usageHourly = usageRollup("usage_hourly");
export const usageDaily = usageRollup("usage_daily");

export const rollupState = sqliteTable("rollup_state", {
  grain: text("grain").primaryKey(),
  lastBucket: integer("last_bucket").notNull().default(0),
});

/**
 * Better Auth core tables (migration 0004). The library owns these rows via
 * its drizzle adapter; our domain `users` table mirrors identity by sharing
 * the same user id (provisioned in user.create.after — see lib/auth/server).
 */
export const authUser = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const authSession = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
  },
  (t) => ({ idxSessionUser: index("idx_session_user").on(t.userId) }),
);

export const authAccount = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({ idxAccountUser: index("idx_account_user").on(t.userId) }),
);

export const authVerification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({ idxVerificationIdentifier: index("idx_verification_identifier").on(t.identifier) }),
);
