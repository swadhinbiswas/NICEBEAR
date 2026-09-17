import { describe, expect, it } from "vitest";
import { HttpError } from "./lib/auth/authenticate";
import {
  extForContentType,
  getStorageBackend,
  GithubBackend,
  HfBackend,
  versionedKey,
} from "./lib/storage/index.js";

function fakeS3() {
  const calls: Array<{ input: Record<string, unknown> }> = [];
  return {
    calls,
    send: async (command: { readonly input?: unknown }) => {
      calls.push({ input: (command.input ?? {}) as Record<string, unknown> });
      return { ETag: '"abc123"' };
    },
  };
}

describe("storage keys", () => {
  it("builds versioned, HF-legal keys", () => {
    expect(versionedKey("av_123", 2, "png")).toBe("avatars/av_123/v2.png");
    expect(versionedKey("av_123", 0, "png")).toBe("avatars/av_123/v1.png");
    expect(versionedKey("av/../x", 1, "png")).toBe("avatars/av____x/v1.png");
    expect(versionedKey("av_1", 1, "svg+xml")).toBe("avatars/av_1/v1.svgxml");
    for (const key of [versionedKey("a", 1, "png"), versionedKey("a/b", 3, "jpg")]) {
      expect(key.startsWith("/")).toBe(false);
      expect(key).not.toContain("//");
      expect(key).not.toContain("..");
    }
  });

  it("maps content types to extensions", () => {
    expect(extForContentType("image/png")).toBe("png");
    expect(extForContentType("image/jpeg")).toBe("jpg");
    expect(extForContentType("image/gif")).toBe("gif");
    expect(extForContentType("image/svg+xml")).toBe("svg");
    expect(extForContentType("image/svg+xml; charset=utf-8")).toBe("svg");
    expect(extForContentType("application/octet-stream")).toBe("bin");
  });
});

describe("hf backend", () => {
  it("puts versioned objects; version pointer is the key", async () => {
    const s3 = fakeS3();
    const hf = new HfBackend({ namespace: "acme", bucket: "avatars", s3 });
    const bytes = new Uint8Array([1, 2, 3]);
    const { version } = await hf.put({ key: "avatars/av_1/v2.png", bytes, contentType: "image/png" });
    expect(version).toBe("avatars/av_1/v2.png");
    expect(s3.calls).toHaveLength(1);
    expect(s3.calls[0]!.input).toMatchObject({
      Bucket: "avatars",
      Key: "avatars/av_1/v2.png",
      ContentType: "image/png",
    });
    expect(s3.calls[0]!.input.Body).toBe(bytes);
  });

  it("builds public resolve URLs (default + override, encoded)", () => {
    const hf = new HfBackend({ namespace: "acme", bucket: "avatars", s3: fakeS3() });
    expect(hf.publicUrl("avatars/av_1/v2.png")).toBe(
      "https://huggingface.co/buckets/acme/avatars/resolve/main/avatars/av_1/v2.png",
    );
    const custom = new HfBackend({
      namespace: "acme",
      bucket: "avatars",
      s3: fakeS3(),
      publicBaseUrl: "https://cdn.example.com/hf",
    });
    expect(custom.publicUrl("/avatars/av 1/v2.png")).toBe("https://cdn.example.com/hf/avatars/av%201/v2.png");
  });
});

describe("github backend", () => {
  it("PUTs base64 to the versioned path and returns the sha", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body) });
      return Response.json({ commit: { sha: "deadbeef" }, content: { path: "avatars/av_1/v1.png" } });
    }) as typeof fetch;
    const gh = new GithubBackend("acme/avatars", "tok", fetchImpl);
    const { version } = await gh.put({
      key: "avatars/av_1/v1.png",
      bytes: new Uint8Array([9, 9]),
      contentType: "image/png",
    });
    expect(version).toBe("deadbeef");
    expect(calls[0]!.url).toContain("/repos/acme/avatars/contents/avatars/av_1/v1.png");
    expect(JSON.parse(calls[0]!.body).content).toBe(Buffer.from([9, 9]).toString("base64"));
    expect(() => gh.publicUrl("x")).toThrow();
  });
});

describe("getStorageBackend", () => {
  it("selects hf with namespace+bucket, failing closed otherwise", () => {
    const hf = getStorageBackend({ ASSET_STORE: "hf", HF_NAMESPACE: "acme", HF_BUCKET: "b" }, { s3Override: fakeS3() });
    expect(hf.id).toBe("hf");
    expect(() => getStorageBackend({ ASSET_STORE: "hf" }, { s3Override: fakeS3() })).toThrowError(HttpError);
    try {
      getStorageBackend({ ASSET_STORE: "hf" }, { s3Override: fakeS3() });
      expect.unreachable();
    } catch (e) {
      expect((e as HttpError).status).toBe(503);
    }
  });

  it("selects github by default, requiring repo + token", () => {
    const gh = getStorageBackend({ GITHUB_TOKEN: "t" }, { repo: "acme/avatars" });
    expect(gh.id).toBe("github");
    expect(() => getStorageBackend({ GITHUB_TOKEN: "t" }, {})).toThrowError(HttpError);
    expect(() => getStorageBackend({}, { repo: "acme/avatars" })).toThrowError(HttpError);
  });
});
