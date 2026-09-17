import { describe, expect, it } from "vitest";
import { fetchExternalImage } from "./lib/security/ssrf";

const png = (n = 16) => new Uint8Array(n).fill(0x89);
const img = (body: BodyInit | null, contentType: string, status = 200, location?: string) => {
  const headers: Record<string, string> = { "content-type": contentType };
  if (location) headers.location = location;
  return new Response(body as BodyInit, { status, headers });
};

describe("fetchExternalImage", () => {
  it("accepts allowlisted image content-types", async () => {
    const r = await fetchExternalImage(
      "https://my-own-domain.com/a.png",
      (async () => img(png(), "image/png")) as typeof fetch,
    );
    expect(r.contentType).toBe("image/png");
    expect(r.bytes.byteLength).toBe(16);
  });

  it("rejects disallowed content-types", async () => {
    await expect(
      fetchExternalImage(
        "https://my-own-domain.com/a.html",
        (async () => img("hello", "text/html")) as typeof fetch,
      ),
    ).rejects.toThrow(/content-type/);
  });

  it("follows relative redirects on safe hosts", async () => {
    let calls = 0;
    const stub = (async (url: string | URL | Request) => {
      calls++;
      if (calls === 1) return img(null, "text/plain", 302, "/real.png");
      expect(String(url)).toBe("https://my-own-domain.com/real.png");
      return img(png(), "image/png");
    }) as typeof fetch;
    const r = await fetchExternalImage("https://my-own-domain.com/short", stub);
    expect(r.bytes.byteLength).toBe(16);
  });

  it("re-validates redirect targets (SSRF) and caps chains", async () => {
    await expect(
      fetchExternalImage(
        "https://my-own-domain.com/short",
        (async () => img(null, "text/plain", 302, "http://169.254.169.254/x")) as typeof fetch,
      ),
    ).rejects.toThrow();
    await expect(
      fetchExternalImage(
        "https://my-own-domain.com/loop",
        (async () => img(null, "text/plain", 302, "/loop")) as typeof fetch,
      ),
    ).rejects.toThrow(/redirect/);
  });

  it("enforces the ~5MB body cap", async () => {
    await expect(
      fetchExternalImage(
        "https://my-own-domain.com/big.png",
        (async () => img(new Uint8Array(6 * 1024 * 1024), "image/png")) as typeof fetch,
      ),
    ).rejects.toThrow(/5MB/);
  });
});
