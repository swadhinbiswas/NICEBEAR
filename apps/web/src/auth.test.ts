import { describe, expect, it } from "vitest";
import {
  authenticateRequest,
  monthBucket,
  HttpError,
  type KeyRow,
} from "./lib/auth/authenticate";
import { mintApiKey, verifyApiKey } from "./lib/auth/keys";
import { extractBearerKey } from "./lib/security/apikey";
import { sha256HexAsync } from "./lib/security/apikey";

function keyRow(over: Partial<KeyRow> = {}): KeyRow {
  return {
    id: "key_1",
    ownerId: "org_1",
    ownerType: "organization",
    keyHash: "x",
    scope: "admin",
    rateLimitPerMin: 60,
    monthlyQuota: null,
    expiresAt: null,
    revokedAt: null,
    ...over,
  };
}

/** Loader harness: given a plaintext + row, resolves by computed hash. */
function harness(plaintext: string, row: KeyRow | null, monthlyUsed = 0) {
  return {
    loadKeyByHash: async (hash: string) => {
      if (!row) return null;
      const want = await sha256HexAsync(plaintext);
      return hash === want ? row : null;
    },
    monthlyCount: async () => monthlyUsed,
  };
}

const TOKEN = "nb_live_abcdefghijklmnopqrst";

describe("authenticateRequest", () => {
  it("accepts a valid admin key", async () => {
    const auth = await authenticateRequest(
      { authHeader: `Bearer ${TOKEN}`, requiredScope: "admin" },
      harness(TOKEN, keyRow()),
    );
    expect(auth.keyId).toBe("key_1");
    expect(auth.scope).toBe("admin");
  });

  it("rejects missing/malformed headers with 401", async () => {
    for (const h of [null, "", "Bearer short", "Token nb_live_abcdefghijklmnopqrst"]) {
      await expect(
        authenticateRequest({ authHeader: h, requiredScope: "read" }, harness(TOKEN, keyRow())),
      ).rejects.toMatchObject({ status: 401 });
    }
  });

  it("rejects unknown, revoked, and expired keys with 401", async () => {
    await expect(
      authenticateRequest({ authHeader: `Bearer ${TOKEN}`, requiredScope: "read" }, harness(TOKEN, null)),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      authenticateRequest(
        { authHeader: `Bearer ${TOKEN}`, requiredScope: "read" },
        harness(TOKEN, keyRow({ revokedAt: 1 })),
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      authenticateRequest(
        { authHeader: `Bearer ${TOKEN}`, requiredScope: "read", nowSec: 2000 },
        harness(TOKEN, keyRow({ expiresAt: 1000 })),
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("enforces admin scope with 403", async () => {
    await expect(
      authenticateRequest(
        { authHeader: `Bearer ${TOKEN}`, requiredScope: "admin" },
        harness(TOKEN, keyRow({ scope: "read" })),
      ),
    ).rejects.toMatchObject({ status: 403 });
    // read scope passes on a read key
    const auth = await authenticateRequest(
      { authHeader: `Bearer ${TOKEN}`, requiredScope: "read" },
      harness(TOKEN, keyRow({ scope: "read" })),
    );
    expect(auth.scope).toBe("read");
  });

  it("enforces monthly quota with 429", async () => {
    await expect(
      authenticateRequest(
        { authHeader: `Bearer ${TOKEN}`, requiredScope: "read" },
        harness(TOKEN, keyRow({ monthlyQuota: 5 }), 5),
      ),
    ).rejects.toMatchObject({ status: 429 });
    const auth = await authenticateRequest(
      { authHeader: `Bearer ${TOKEN}`, requiredScope: "read" },
      harness(TOKEN, keyRow({ monthlyQuota: 5 }), 4),
    );
    expect(auth.keyId).toBe("key_1");
  });

  it("formats month buckets in UTC", () => {
    expect(monthBucket(0)).toBe("1970-01");
    expect(monthBucket(Date.UTC(2026, 0, 15) / 1000)).toBe("2026-01");
  });
});

describe("api key mint/verify", () => {
  it("round-trips and rejects wrong secrets", async () => {
    const { plaintext, hash } = await mintApiKey();
    expect(plaintext.startsWith("nb_live_")).toBe(true);
    expect(extractBearerKey(`Bearer ${plaintext}`)).toBe(plaintext);
    expect(await verifyApiKey(plaintext, hash)).toBe(true);
    expect(await verifyApiKey(`${plaintext}x`, hash)).toBe(false);
  });

  it("HttpError carries status + code", () => {
    const e = new HttpError(429, "slow down", "rate_limited");
    expect(e.status).toBe(429);
    expect(e.code).toBe("rate_limited");
  });
});
