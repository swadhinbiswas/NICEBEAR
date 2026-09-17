import { describe, expect, it } from "vitest";
import { can } from "./lib/auth/rbac";
import { jsdelivrUrl } from "./lib/github/jsdelivr";
import { assertSafeExternalUrl } from "./lib/security/ssrf";

describe("content policy + security guards", () => {
  it("builds jsDelivr URLs (never raw.githubusercontent)", () => {
    expect(jsdelivrUrl("acme", "avatars", "a/b.png", "abc123")).toBe(
      "https://cdn.jsdelivr.net/gh/acme/avatars@abc123/a/b.png",
    );
  });

  it("SSRF guard blocks private ranges and localhost", () => {
    for (const bad of [
      "http://127.0.0.1/x.png",
      "http://10.0.0.5/x.png",
      "http://192.168.1.1/x.png",
      "http://169.254.169.254/latest/meta-data",
      "http://localhost:3000/x.png",
      "ftp://example.com/x.png",
    ]) {
      expect(() => assertSafeExternalUrl(bad)).toThrow();
    }
    expect(() => assertSafeExternalUrl("https://my-own-domain.com/avatar.png")).not.toThrow();
  });

  it("RBAC ranks roles", () => {
    expect(can("viewer", "admin")).toBe(false);
    expect(can("admin", "developer")).toBe(true);
    expect(can("owner", "owner")).toBe(true);
    expect(can(undefined, "viewer")).toBe(false);
  });
});
