/** Typed same-origin API client for dashboard islands. */

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API ${status}: ${typeof body === "object" && body !== null && "error" in body ? String((body as { error: unknown }).error) : "request failed"}`);
  }
}

export interface NbClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
}

function withOrg(path: string, orgId: string | null): string {
  if (!orgId || path.includes("org_id=")) return path;
  return `${path}${path.includes("?") ? "&" : "?"}org_id=${encodeURIComponent(orgId)}`;
}

export function createClient(apiKey: string | null, orgId: string | null = null): NbClient {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(withOrg(path, orgId), {
      method,
      credentials: "include", // session cookie for dashboard users
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data);
    return data as T;
  }
  return {
    get: (p) => call("GET", p),
    post: (p, b) => call("POST", p, b),
    put: (p, b) => call("PUT", p, b),
    del: (p) => call("DELETE", p),
  };
}

/** Shape-check helper for unknown API payloads in islands. */
export function asList<T>(data: unknown, key: string): T[] {
  if (typeof data === "object" && data !== null && Array.isArray((data as Record<string, unknown>)[key])) {
    return (data as Record<string, unknown>)[key] as T[];
  }
  return [];
}
