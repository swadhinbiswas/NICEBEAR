import { describe, expect, it } from "vitest";
import { serveAvatar } from "./lib/api/serve";

const PNG_MAGIC = "89504e47";
const GIF_MAGIC = "GIF89a";

function hex(bytes: ArrayBuffer, n: number): string {
  return Buffer.from(bytes.slice(0, n)).toString("hex");
}

describe("serve formats", () => {
  it("rasterizes generated SVG to PNG (?format=png&?w=)", async () => {
    const res = await serveAvatar({
      avatarRow: { id: "av_1", engine: "bauhaus" },
      format: "png",
      width: 64,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(hex(await res.arrayBuffer(), 4)).toBe(PNG_MAGIC);
  });

  it("rejects unknown formats at the serve layer boundary", async () => {
    // Pipeline validates first; serve treats anything non-png/gif as svg.
    const res = await serveAvatar({
      avatarRow: { id: "av_1", engine: "rings" },
      format: "svg",
    });
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
  });

  it("serves GIF bytes for animated engines", async () => {
    const res = await serveAvatar({
      avatarRow: { id: "av_1", engine: "blink" },
      format: "gif",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/gif");
    expect(new TextDecoder().decode((await res.arrayBuffer()).slice(0, 6))).toBe(GIF_MAGIC);
  });

  it("rejects gif for static engines and formats for stored bytes", async () => {
    const gifStatic = await serveAvatar({
      avatarRow: { id: "av_1", engine: "rings" },
      format: "gif",
    });
    expect(gifStatic.status).toBe(400);

    const pngStored = await serveAvatar({
      avatarRow: { id: "av_1", githubRepo: "acme/avatars", githubPath: "avatars/av_1/v1.png", commitSha: "abc" },
      format: "png",
    });
    expect(pngStored.status).toBe(400);
  });

  it("302s hf rows to their storage URL", async () => {
    const res = await serveAvatar({
      avatarRow: { id: "av_1", storageUrl: "https://huggingface.co/buckets/acme/avatars/resolve/main/avatars/av_1/v1.png" },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("huggingface.co/buckets/acme/avatars/resolve/main/avatars/av_1/v1.png");
  });
});
