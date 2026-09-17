import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import type { RotationDsl } from "@nicebear/shared-types";
import { RotationDslSchema } from "@nicebear/shared-types";
import type { Database } from "../db/client";
import { avatarPointerHistory, avatars, collections, rotationRules } from "../db/schema";
import { resolveActiveAvatar, type EvaluatorContext } from "../rotation/evaluator";

export interface AvatarRow {
  id: string;
  collectionId: string | null;
  orgId: string;
  seed: string | null;
  engine: string | null;
  githubRepo: string | null;
  githubPath: string | null;
  commitSha: string | null;
  externalUrl: string | null;
}

// ------------------------------------------------------------ pure functions

export interface HistoryEntry {
  sha: string;
  createdAt: number;
}

/**
 * Resolve `?v=N | ?v=latest` to a commit sha.
 * v=N → Nth pointer in chronological order (1-based); latest/absent → current.
 * Returns null when the avatar has no committed bytes (generated-only).
 */
export function pickVersion(
  history: HistoryEntry[],
  current: string | null,
  v: string | null,
): string | null {
  if (!v || v === "latest") return current;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) return current;
  const sorted = [...history].sort((a, b) => a.createdAt - b.createdAt);
  return sorted[n - 1]?.sha ?? current;
}

export interface StackedRule {
  priority: number;
  rule: RotationDsl;
}

/**
 * Org-wide policy evaluation (§5.3): rules for (avatar, collection,
 * organization) are sorted by priority DESC; the first rule whose evaluator
 * returns non-null wins. An avatar-level rule with higher priority overrides
 * the org default — no separate policy system needed.
 */
export function evaluateRuleStack(
  stacked: StackedRule[],
  now: Date,
  ctx: EvaluatorContext = {},
): string | null {
  const ordered = [...stacked].sort((a, b) => b.priority - a.priority);
  for (const { rule } of ordered) {
    const resolved = resolveActiveAvatar(rule, now, ctx);
    if (resolved) return resolved;
  }
  return null;
}

// ------------------------------------------------------------ DB loaders

export async function loadAvatar(db: Database, id: string) {
  const rows = await db
    .select()
    .from(avatars)
    .where(and(eq(avatars.id, id), isNull(avatars.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export function toAvatarRow(
  row: NonNullable<Awaited<ReturnType<typeof loadAvatar>>>,
  opts?: { engine?: string | null; commitSha?: string | null },
): AvatarRow {
  return {
    id: row.id,
    collectionId: row.collectionId,
    orgId: row.orgId,
    seed: row.seed,
    engine: opts?.engine ?? null,
    githubRepo: row.githubRepo,
    githubPath: row.githubPath,
    commitSha: opts?.commitSha ?? row.commitSha,
    externalUrl: row.externalUrl,
  };
}

export async function loadHistory(db: Database, avatarId: string): Promise<HistoryEntry[]> {
  const rows = await db
    .select({ sha: avatarPointerHistory.commitSha, createdAt: avatarPointerHistory.createdAt })
    .from(avatarPointerHistory)
    .where(eq(avatarPointerHistory.avatarId, avatarId))
    .orderBy(asc(avatarPointerHistory.createdAt));
  return rows.map((r) => ({ sha: r.sha, createdAt: r.createdAt }));
}

/** Stored rotation rules for an avatar + its collection + its org. */
export async function loadRuleStack(
  db: Database,
  avatar: { id: string; collectionId: string | null; orgId: string },
): Promise<StackedRule[]> {
  const targets: Array<{ type: string; id: string }> = [
    { type: "avatar", id: avatar.id },
    { type: "organization", id: avatar.orgId },
  ];
  if (avatar.collectionId) targets.push({ type: "collection", id: avatar.collectionId });
  const conds = targets.map((t) => and(eq(rotationRules.targetType, t.type as never), eq(rotationRules.targetId, t.id)));
  const rows = await db
    .select()
    .from(rotationRules)
    .where(or(...conds))
    .orderBy(desc(rotationRules.priority));
  const out: StackedRule[] = [];
  for (const r of rows) {
    try {
      const parsed = RotationDslSchema.parse(JSON.parse(r.ruleJson));
      out.push({ priority: r.priority ?? 0, rule: parsed });
    } catch {
      /* skip corrupt rules — never fail a serve on bad stored JSON */
    }
  }
  return out;
}

/** Member avatar ids of a collection (for `avatar_from: collection:<id>`). */
export async function loadCollectionMembers(db: Database, collectionId: string): Promise<string[]> {
  const rows = await db
    .select({ id: avatars.id })
    .from(avatars)
    .where(and(eq(avatars.collectionId, collectionId), isNull(avatars.deletedAt)))
    .orderBy(asc(avatars.createdAt));
  return rows.map((r) => r.id);
}

export async function loadCollection(db: Database, id: string) {
  const rows = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, id), isNull(collections.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

/** Build the evaluator's collections map for every collection a rule may reference. */
export async function buildCollectionsMap(
  db: Database,
  rules: StackedRule[],
  extraIds: string[] = [],
): Promise<Record<string, string[]>> {
  const ids = new Set(extraIds);
  for (const { rule } of rules) {
    for (const item of rule.rules) {
      if (item.avatar_from?.startsWith("collection:")) ids.add(item.avatar_from.slice(11));
    }
  }
  const map: Record<string, string[]> = {};
  for (const id of ids) {
    map[id] = await loadCollectionMembers(db, id);
  }
  return map;
}
