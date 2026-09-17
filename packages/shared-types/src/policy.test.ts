import { describe, expect, it } from "vitest";
import { AvatarCreateSchema } from "./index";

describe("content policy enforcement (§5.4)", () => {
  it("rejects external_url without attest_rights: true", () => {
    const bad = AvatarCreateSchema.safeParse({
      type: "external_url",
      source_url: "https://my-own-domain.com/avatar.png",
      attest_rights: false,
    });
    expect(bad.success).toBe(false);
    const missing = AvatarCreateSchema.safeParse({
      type: "external_url",
      source_url: "https://my-own-domain.com/avatar.png",
    });
    expect(missing.success).toBe(false);
  });

  it("accepts external_url with attestation", () => {
    const ok = AvatarCreateSchema.safeParse({
      type: "external_url",
      source_url: "https://my-own-domain.com/avatar.png",
      attest_rights: true,
    });
    expect(ok.success).toBe(true);
  });

  it("has no bulk-import / scrape field", () => {
    const shape = Object.keys(
      (AvatarCreateSchema as unknown as { options: { options: object }[] }).options?.[0] ?? {},
    ).join(" ");
    for (const forbidden of ["bulk_import", "scrape", "import_from", "crawl"]) {
      expect(shape.toLowerCase()).not.toContain(forbidden);
    }
    // Unknown source types are rejected by the discriminated union:
    const evil = AvatarCreateSchema.safeParse({ type: "bulk_import_from_platform", url: "https://x" });
    expect(evil.success).toBe(false);
  });
});
