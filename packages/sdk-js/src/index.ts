/** Isomorphic JS/TS SDK for NiceBear. Mirrors packages/openapi/spec.yaml. */

export interface NiceBearClientOptions {
  baseUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export class NiceBearError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    const detail =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : "request failed";
    super(`NiceBear API ${status}: ${detail}`);
    this.status = status;
    this.body = body;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export const DEFAULT_BASE_URL = "https://api.nicebear.dev";

export class NiceBear {
  private baseUrl: string;
  private apiKey?: string;
  private fetchImpl: typeof fetch;

  constructor(opts: NiceBearClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  // ------------------------------------------------------------ URL builders

  avatarUrl(id: string, params?: { seed?: string; v?: string | number }): string {
    const u = new URL(`${this.baseUrl}/api/avatar/${encodeURIComponent(id)}`);
    if (params?.seed) u.searchParams.set("seed", params.seed);
    if (params?.v !== undefined) u.searchParams.set("v", String(params.v));
    return u.toString();
  }

  randomUrl(id: string, seed?: string): string {
    const u = new URL(`${this.baseUrl}/api/avatar/${encodeURIComponent(id)}/random`);
    if (seed) u.searchParams.set("seed", seed);
    return u.toString();
  }

  dailyUrl = (id: string): string => `${this.baseUrl}/api/avatar/${encodeURIComponent(id)}/daily`;
  weeklyUrl = (id: string): string => `${this.baseUrl}/api/avatar/${encodeURIComponent(id)}/weekly`;
  monthlyUrl = (id: string): string => `${this.baseUrl}/api/avatar/${encodeURIComponent(id)}/monthly`;
  refreshUrl = (id: string): string => `${this.baseUrl}/api/avatar/${encodeURIComponent(id)}/refresh`;
  customUrl = (id: string): string => `${this.baseUrl}/api/avatar/${encodeURIComponent(id)}/custom`;

  // ------------------------------------------------------------------ core

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers = new Headers();
    if (this.apiKey) headers.set("Authorization", `Bearer ${this.apiKey}`);
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
      init.body = JSON.stringify(body);
    }
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    const data = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) throw new NiceBearError(res.status, data);
    return data as T;
  }

  private get<T>(path: string): Promise<T> {
    return this.call<T>("GET", path);
  }
  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.call<T>("POST", path, body);
  }
  private put<T>(path: string, body?: unknown): Promise<T> {
    return this.call<T>("PUT", path, body);
  }
  private del<T>(path: string): Promise<T> {
    return this.call<T>("DELETE", path);
  }

  private static orgQs(orgId?: string): string {
    return orgId ? `?org_id=${encodeURIComponent(orgId)}` : "";
  }

  // ---------------------------------------------------------------- avatars

  createAvatar(input: unknown, query?: { orgId?: string; repo?: string }): Promise<Json> {
    const qs = new URLSearchParams();
    if (query?.orgId) qs.set("org_id", query.orgId);
    if (query?.repo) qs.set("repo", query.repo);
    const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
    return this.post(`/api/avatars${suffix}`, input);
  }
  getAvatar(id: string): Promise<Json> {
    return this.get(`/api/avatars/${encodeURIComponent(id)}`);
  }
  deleteAvatar(id: string): Promise<Json> {
    return this.del(`/api/avatars/${encodeURIComponent(id)}`);
  }
  rollbackAvatar(id: string, version: string | number): Promise<Json> {
    return this.post(`/api/avatars/${encodeURIComponent(id)}/rollback`, { version });
  }
  customAvatar(id: string, body: { every?: string; cron?: string }): Promise<Json> {
    return this.post(`/api/avatar/${encodeURIComponent(id)}/custom`, body);
  }

  // ------------------------------------------------------------ collections

  createCollection(name: string, engine: string, orgId?: string): Promise<Json> {
    return this.post(`/api/collections${NiceBear.orgQs(orgId)}`, { name, engine_type: engine });
  }
  listCollections(orgId?: string): Promise<Json> {
    return this.get(`/api/collections${NiceBear.orgQs(orgId)}`);
  }
  getCollection(id: string): Promise<Json> {
    return this.get(`/api/collections/${encodeURIComponent(id)}`);
  }
  attachAvatar(collectionId: string, avatarId: string): Promise<Json> {
    return this.post(`/api/collections/${encodeURIComponent(collectionId)}/avatars`, {
      avatar_id: avatarId,
    });
  }

  // ----------------------------------------------------------------- rules

  createRule(targetId: string, targetType: string, rule: unknown, priority = 0): Promise<Json> {
    return this.post("/api/rotation-rules", {
      target_id: targetId,
      target_type: targetType,
      rule,
      priority,
    });
  }
  listRules(targetId: string, targetType: string): Promise<Json> {
    return this.get(
      `/api/rotation-rules?target_type=${encodeURIComponent(targetType)}&target_id=${encodeURIComponent(targetId)}`,
    );
  }
  updateRule(id: string, body: { rule?: unknown; priority?: number }): Promise<Json> {
    return this.put(`/api/rotation-rules/${encodeURIComponent(id)}`, body);
  }
  createSchedule(rotationRuleId: string, cronExpr?: string, timezone = "UTC"): Promise<Json> {
    return this.post("/api/schedules", { rotation_rule_id: rotationRuleId, cron_expr: cronExpr, timezone });
  }
  listSchedules(rotationRuleId: string): Promise<Json> {
    return this.get(`/api/schedules?rotation_rule_id=${encodeURIComponent(rotationRuleId)}`);
  }

  // --------------------------------------------------------------- api keys

  createKey(scope = "read", rateLimitPerMin = 60): Promise<Json> {
    return this.post("/api/api-keys", { scope, rate_limit_per_min: rateLimitPerMin });
  }
  listKeys(): Promise<Json> {
    return this.get("/api/api-keys");
  }
  deleteKey(id: string): Promise<Json> {
    return this.del(`/api/api-keys/${encodeURIComponent(id)}`);
  }
  rotateKey(id: string): Promise<Json> {
    return this.post(`/api/api-keys/${encodeURIComponent(id)}/rotate`);
  }
  whoami(): Promise<Json> {
    return this.get("/api/api-keys/self");
  }

  // --------------------------------------------------------------- webhooks

  createWebhook(url: string, secret: string, events: string[], orgId?: string): Promise<Json> {
    return this.post(`/api/webhooks${NiceBear.orgQs(orgId)}`, { url, secret, events });
  }
  listWebhooks(orgId?: string): Promise<Json> {
    return this.get(`/api/webhooks${NiceBear.orgQs(orgId)}`);
  }
  deliveries(webhookId: string, limit = 25): Promise<Json> {
    return this.get(`/api/webhooks/${encodeURIComponent(webhookId)}/deliveries?limit=${limit}`);
  }
  processWebhooks(limit = 25): Promise<Json> {
    return this.post("/api/webhooks/process", { limit });
  }

  // -------------------------------------------------------------- analytics

  analytics(metric = "summary", days = 30): Promise<Json> {
    return this.get(`/api/analytics?metric=${encodeURIComponent(metric)}&days=${days}`);
  }
  rollup(): Promise<Json> {
    return this.post("/api/analytics/rollup");
  }

  // ------------------------------------------------------------------- misc

  report(avatarId: string, reason: string, reporterContact?: string): Promise<Json> {
    return this.post("/api/report", { avatar_id: avatarId, reason, reporter_contact: reporterContact });
  }
  myOrgs(): Promise<Json> {
    return this.get("/api/orgs/mine");
  }
  team(orgId?: string): Promise<Json> {
    return this.get(`/api/team${NiceBear.orgQs(orgId)}`);
  }
  teamAdd(orgId: string, email: string, role: string): Promise<Json> {
    return this.post("/api/team", { org_id: orgId, email, role });
  }
  teamRole(orgId: string, userId: string, role: string): Promise<Json> {
    return this.put("/api/team", { org_id: orgId, user_id: userId, role });
  }
  teamRemove(orgId: string, userId: string): Promise<Json> {
    return this.del(
      `/api/team?org_id=${encodeURIComponent(orgId)}&user_id=${encodeURIComponent(userId)}`,
    );
  }
}
