import { describe, expect, it } from "vitest";
import { NiceBear, NiceBearError } from "./index";

function stubFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const { status, body } = handler(url, init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const ok = { status: 200, body: { ok: true } };

describe("sdk-js", () => {
  it("builds image URLs", () => {
    const nb = new NiceBear();
    expect(nb.avatarUrl("av_1")).toBe("https://api.nicebear.dev/api/avatar/av_1");
    expect(nb.avatarUrl("av_1", { seed: "john", v: 2 })).toBe(
      "https://api.nicebear.dev/api/avatar/av_1?seed=john&v=2",
    );
    expect(nb.dailyUrl("a")).toContain("/daily");
    expect(nb.weeklyUrl("a")).toContain("/weekly");
    expect(nb.monthlyUrl("a")).toContain("/monthly");
    expect(nb.refreshUrl("a")).toContain("/refresh");
    expect(nb.randomUrl("a", "s")).toContain("/random?seed=s");
    expect(nb.customUrl("a")).toContain("/custom");
  });

  it("sends auth headers only when keyed, maps errors typed", async () => {
    const { calls, fetchImpl } = stubFetch((url) =>
      url.endsWith("/api/boom") ? { status: 400, body: { error: "nope" } } : ok,
    );
    const nb = new NiceBear({ baseUrl: "https://x.test", apiKey: "nb_live_abc", fetchImpl });
    await nb.listKeys();
    const headers = calls[0]?.init?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer nb_live_abc");

    const anon = new NiceBear({ baseUrl: "https://x.test", fetchImpl });
    await anon.listKeys();
    expect((calls[1]?.init?.headers as Headers).get("Authorization")).toBeNull();

    const failing = new NiceBear({
      baseUrl: "https://x.test",
      fetchImpl: stubFetch(() => ({ status: 400, body: { error: "nope" } })).fetchImpl,
    });
    const err = await failing.listKeys().then(
      () => null,
      (e: unknown) => e as NiceBearError,
    );
    expect(err).toBeInstanceOf(NiceBearError);
    expect(err?.status).toBe(400);
    expect(err?.message).toContain("nope");
  });

  it("hits the documented paths", async () => {
    const { calls, fetchImpl } = stubFetch(() => ({ status: 201, body: { id: "x" } }));
    const nb = new NiceBear({ baseUrl: "https://x.test", apiKey: "k", fetchImpl });
    await nb.createAvatar({ type: "generated" });
    expect(calls.at(-1)?.url).toBe("https://x.test/api/avatars");
    await nb.rollbackAvatar("av_1", 2);
    expect(calls.at(-1)?.url).toBe("https://x.test/api/avatars/av_1/rollback");
    await nb.createCollection("t", "pixel-art", "org_1");
    expect(calls.at(-1)?.url).toBe("https://x.test/api/collections?org_id=org_1");
    await nb.rotateKey("key_1");
    expect(calls.at(-1)?.url).toBe("https://x.test/api/api-keys/key_1/rotate");
    await nb.deliveries("wh_1", 5);
    expect(calls.at(-1)?.url).toBe("https://x.test/api/webhooks/wh_1/deliveries?limit=5");
    await nb.analytics("summary", 7);
    expect(calls.at(-1)?.url).toBe("https://x.test/api/analytics?metric=summary&days=7");
    await nb.teamRemove("org_1", "u_1");
    expect(calls.at(-1)?.url).toBe("https://x.test/api/team?org_id=org_1&user_id=u_1");
  });
});
