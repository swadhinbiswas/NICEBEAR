import { z } from "zod";

/**
 * NiceBear shared contracts.
 * Single source of truth for client + server validation.
 * OpenAPI spec in packages/openapi/spec.yaml is generated from / mirrored with these schemas.
 *
 * CONTENT POLICY (§0, §4.3, §5.4) — non-negotiable, enforced HERE in code:
 * - Every avatar image is (a) generated algorithmically, (b) uploaded by the
 *   owning user/org, or (c) an external_url the owner attests they hold rights to.
 * - There is intentionally NO `bulk_import_from_platform`, `scrape_url`,
 *   `import_from_*`, or similar field anywhere in this file.
 * - `external_url` creation REQUIRES `attest_rights: true` (literal, not just boolean).
 * - Any payload with unknown source types is rejected by the discriminated union below.
 */

// ---------------------------------------------------------------- source types

export const SourceTypeSchema = z.enum(["generated", "uploaded", "external_url"]);

export const EngineTypeSchema = z.enum([
  "pixel-art",
  "robots",
  "cartoon",
  "anime",
  "minimal",
  "business",
  "fantasy",
  "gaming",
  "cyberpunk",
  "geometric",
  "abstract",
  "animals",
  "identicons",
  "mixed",
  // Static DiceBear-grade styles (SVG).
  "personas",
  "droids",
  "bauhaus",
  "rings",
  "waves",
  "orbits",
  // Animated styles (GIF-first; ?format=gif).
  "blink",
  "orb",
  "rain",
]);

const BaseAvatarCreate = z.object({
  collection_id: z.string().min(1).max(128).optional(),
});

// (a) algorithmically generated
const GeneratedAvatarCreate = BaseAvatarCreate.extend({
  type: z.literal("generated"),
  engine: EngineTypeSchema,
  seed: z.string().min(1).max(256).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

// (b) uploaded by the owning user/org (bytes go to GitHub Contents API)
const UploadedAvatarCreate = BaseAvatarCreate.extend({
  type: z.literal("uploaded"),
  filename: z.string().min(1).max(256).regex(/^[^/\\]+$/, "filename must not contain path separators"),
  content_base64: z.string().min(1).max(7_000_000), // ~5MB binary cap after decode
  content_type: z.string().regex(/^image\/(png|jpeg|gif|webp|svg\+xml)$/, "only image/* uploads allowed"),
});

// (c) link the owner attests they hold rights to
const ExternalUrlAvatarCreate = BaseAvatarCreate.extend({
  type: z.literal("external_url"),
  source_url: z.string().url().max(2048),
  // MUST be literal `true` — `false` or omission rejects. This is the code-level
  // implementation of the content policy, not a docs note.
  attest_rights: z.literal(true, {
    errorMap: () => ({ message: "attest_rights must be true: you must attest you hold rights to source_url" }),
  }),
  mirror: z.boolean().default(true), // default: mirror into GitHub store; false = live proxy w/ short TTL
});

export const AvatarCreateSchema = z.discriminatedUnion("type", [
  GeneratedAvatarCreate,
  UploadedAvatarCreate,
  ExternalUrlAvatarCreate,
]);
export type AvatarCreateInput = z.infer<typeof AvatarCreateSchema>;

// --------------------------------------------------------------- rotation DSL

const WhenPattern =
  /^(weekday:(mon|tue|wed|thu|fri|sat|sun)|time_of_day:\d{2}:\d{2}-\d{2}:\d{2}|is_weekend|is_holiday:[A-Z]{2}|cron:.+|every:\d+[mhdw]|random)$/;

export const RotationRuleItemSchema = z
  .object({
    when: z.string().min(1).max(128).regex(WhenPattern, "unknown `when` pattern"),
    avatar: z.string().min(1).max(128).optional(),
    avatar_from: z
      .string()
      .min(1)
      .max(160)
      .regex(/^collection:[A-Za-z0-9_-]+$/, "`avatar_from` must look like `collection:<id>`")
      .optional(),
    tz: z.string().min(1).max(64).optional(), // IANA tz, default UTC
    seed_by: z.enum(["request", "day", "week"]).optional(), // only meaningful with when: random
  })
  .refine((v) => (v.avatar ? !v.avatar_from : !!v.avatar_from), {
    message: "exactly one of `avatar` or `avatar_from` is required",
  });

export const RotationDslSchema = z.object({
  type: z.literal("composite"),
  priority: z.literal("first_match"),
  rules: z.array(RotationRuleItemSchema).min(1).max(100),
});
export type RotationDsl = z.infer<typeof RotationDslSchema>;
export type RotationRuleItem = z.infer<typeof RotationRuleItemSchema>;

export const RotationRuleCreateSchema = z.object({
  target_id: z.string().min(1).max(128),
  target_type: z.enum(["avatar", "collection", "organization"]),
  rule: RotationDslSchema,
  priority: z.number().int().default(0),
});

export const ScheduleCreateSchema = z.object({
  rotation_rule_id: z.string().min(1).max(128),
  cron_expr: z.string().min(1).max(128).optional(),
  timezone: z.string().min(1).max(64).default("UTC"),
});

// ------------------------------------------------------------------ api keys

export const ApiKeyCreateSchema = z.object({
  scope: z.enum(["read", "admin"]),
  rate_limit_per_min: z.number().int().min(1).max(10_000).default(60),
  monthly_quota: z.number().int().positive().optional(),
  expires_at: z.number().int().positive().optional(),
});

// ----------------------------------------------------------------- webhooks

export const WebhookEventSchema = z.enum([
  "avatar.changed",
  "collection.created",
  "collection.updated",
  "api_key.created",
  "api_key.deleted",
  "quota.reached",
  "content_report.opened",
]);

export const WebhookCreateSchema = z.object({
  url: z.string().url().max(2048),
  secret: z.string().min(16).max(256),
  events: z.array(WebhookEventSchema).min(1),
});

// ------------------------------------------------------------------- misc

export const CollectionCreateSchema = z.object({
  name: z.string().min(1).max(128),
  engine_type: EngineTypeSchema,
});

export const CustomRotationBodySchema = z.union([
  z.object({ every: z.string().regex(/^\d+\s*(minutes?|hours?|days?|weeks?)$/i) }),
  z.object({ cron: z.string().min(1).max(128) }),
]);

export const RollbackBodySchema = z.object({
  version: z.union([z.number().int().positive(), z.literal("latest")]),
});

export const ContentReportSchema = z.object({
  avatar_id: z.string().min(1).max(128),
  reporter_contact: z.string().min(1).max(256).optional(),
  reason: z.string().min(1).max(2000),
});
