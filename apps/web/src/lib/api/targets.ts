import type { Database } from "../db/client";
import type { AuthContext } from "../auth/authenticate";
import type { Role } from "../auth/rbac";
import { requireOrgRole } from "./authed";
import { loadAvatar, loadCollection } from "./avatars";

/**
 * Resolve the owning org of a rotation target (avatar | collection |
 * organization). Returns null when the target doesn't exist.
 */
export async function resolveTargetOrg(
  db: Database,
  targetType: string,
  targetId: string,
): Promise<string | null> {
  if (targetType === "organization") return targetId;
  if (targetType === "avatar") {
    const row = await loadAvatar(db, targetId);
    return row?.orgId ?? null;
  }
  if (targetType === "collection") {
    const row = await loadCollection(db, targetId);
    return row?.orgId ?? null;
  }
  return null;
}

/** Ownership gate for rotation-rule/schedule routes. Returns the org id. */
export async function requireTargetRole(
  db: Database,
  auth: AuthContext,
  targetType: string,
  targetId: string,
  minRole: Role,
): Promise<string> {
  const orgId = await resolveTargetOrg(db, targetType, targetId);
  if (!orgId) {
    throw Response.json({ error: "rotation target not found" }, { status: 404 });
  }
  await requireOrgRole(db, auth, orgId, minRole);
  return orgId;
}
