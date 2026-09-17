export type Role = "owner" | "admin" | "developer" | "viewer";

const RANK: Record<Role, number> = { viewer: 0, developer: 1, admin: 2, owner: 3 };

/** Shared RBAC check (§9) — used by middleware, never ad hoc per-route. */
export function can(role: Role | undefined, required: Role): boolean {
  if (!role) return false;
  return RANK[role] >= RANK[required];
}

export function requireRole(role: Role | undefined, required: Role, action: string): void {
  if (!can(role, required)) {
    throw new Error(`forbidden: ${action} requires ${required}`);
  }
}
