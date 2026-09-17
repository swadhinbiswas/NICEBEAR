import { readFileSync, statSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import type { ParsedArgs } from "../args.js";
import { strFlag } from "../args.js";
import type { Ctx } from "./context.js";
import { needKey } from "./context.js";

const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

/**
 * nicebear avatar create --engine E [--seed S] [--collection ID] [--org ID]
 * nicebear avatar upload --file PATH [--collection ID] --repo owner/name [--org ID]
 * nicebear avatar external --url URL --attest-rights [--collection ID] [--repo owner/name] [--no-mirror] [--org ID]
 * nicebear avatar get <id>
 * nicebear avatar delete <id>
 * nicebear avatar rollback <id> --version N|latest
 * nicebear avatar url <id> [--variant daily|weekly|monthly|random|refresh] [--seed S] [--v N|latest]
 * nicebear avatar fetch <id> [--variant ...] [--seed S] -o out.svg
 */
export async function avatars(args: ParsedArgs, ctx: Ctx, opts: { fetchImpl?: typeof fetch } = {}): Promise<unknown> {
  const fetchImpl = opts.fetchImpl;
  switch (args.sub) {
    case "create": {
      needKey(ctx);
      const engine = strFlag(args.flags, "engine", "e") ?? "pixel-art";
      const seed = strFlag(args.flags, "seed", "s");
      const collectionId = strFlag(args.flags, "collection", "c");
      const org = strFlag(args.flags, "org", "orgId") ?? ctx.orgId;
      return ctx.client.createAvatar(
        { collection_id: collectionId, engine, seed, type: "generated" },
        { orgId: collectionId ? undefined : org },
      );
    }
    case "upload": {
      needKey(ctx);
      const file = strFlag(args.flags, "file", "f");
      const repo = strFlag(args.flags, "repo", "r");
      if (!file || !repo) throw new Error("usage: nicebear avatar upload --file <path> --repo <owner/name> [--collection ID]");
      const stat = statSync(file);
      if (stat.size > 5 * 1024 * 1024) throw new Error("file exceeds 5MB cap");
      const contentType = IMAGE_TYPES[extname(file).toLowerCase()];
      if (!contentType) throw new Error(`unsupported image type: ${extname(file)}`);
      const collectionId = strFlag(args.flags, "collection", "c");
      const org = strFlag(args.flags, "org", "orgId") ?? ctx.orgId;
      const filename = file.split("/").pop() ?? "upload";
      return ctx.client.createAvatar(
        {
          collection_id: collectionId,
          type: "uploaded",
          filename,
          content_base64: readFileSync(file).toString("base64"),
          content_type: contentType,
        },
        { orgId: collectionId ? undefined : org, repo },
      );
    }
    case "external": {
      needKey(ctx);
      const url = strFlag(args.flags, "url", "u");
      const repo = strFlag(args.flags, "repo", "r");
      if (!url) throw new Error("usage: nicebear avatar external --url <url> --attest-rights [--repo <owner/name>]");
      if (!args.flags["attest-rights"] && !args.flags["attestRights"]) {
        throw new Error("refusing: pass --attest-rights to confirm you hold rights to the source URL");
      }
      const collectionId = strFlag(args.flags, "collection", "c");
      const org = strFlag(args.flags, "org", "orgId") ?? ctx.orgId;
      const mirror = !args.flags["no-mirror"];
      if (mirror && !repo) throw new Error("mirroring (default) needs --repo <owner/name>; or pass --no-mirror");
      return ctx.client.createAvatar(
        { collection_id: collectionId, type: "external_url", source_url: url, attest_rights: true, mirror },
        { orgId: collectionId ? undefined : org, repo: mirror ? repo : undefined },
      );
    }
    case "get": {
      needKey(ctx);
      const id = args.positionals[0];
      if (!id) throw new Error("usage: nicebear avatar get <id>");
      return ctx.client.getAvatar(id);
    }
    case "delete": {
      needKey(ctx);
      const id = args.positionals[0];
      if (!id) throw new Error("usage: nicebear avatar delete <id>");
      return ctx.client.deleteAvatar(id);
    }
    case "rollback": {
      needKey(ctx);
      const id = args.positionals[0];
      const version = strFlag(args.flags, "version", "v") ?? "latest";
      if (!id) throw new Error("usage: nicebear avatar rollback <id> [--version N|latest]");
      return ctx.client.rollbackAvatar(id, /^\d+$/.test(version) ? Number(version) : version);
    }
    case "url": {
      const id = args.positionals[0];
      if (!id) throw new Error("usage: nicebear avatar url <id> [--variant ...] [--seed S]");
      return resolveUrl(ctx, id, args);
    }
    case "fetch": {
      const id = args.positionals[0];
      const out = strFlag(args.flags, "o", "out", "output");
      if (!id || !out) throw new Error("usage: nicebear avatar fetch <id> -o <file> [--variant ...] [--seed S]");
      const url = resolveUrl(ctx, id, args);
      const res = await (fetchImpl ?? fetch)(url);
      if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
      writeFileSync(out, Buffer.from(await res.arrayBuffer()));
      return { ok: true, url, file: out };
    }
    default:
      throw new Error("usage: nicebear avatar <create|upload|external|get|delete|rollback|url|fetch> ...");
  }
}

function resolveUrl(ctx: Ctx, id: string, args: ParsedArgs): string {
  const seed = strFlag(args.flags, "seed", "s");
  const v = strFlag(args.flags, "v");
  switch (strFlag(args.flags, "variant")) {
    case "daily":
      return ctx.client.dailyUrl(id);
    case "weekly":
      return ctx.client.weeklyUrl(id);
    case "monthly":
      return ctx.client.monthlyUrl(id);
    case "refresh":
      return ctx.client.refreshUrl(id);
    case "random":
      return ctx.client.randomUrl(id, seed);
    case undefined:
      return ctx.client.avatarUrl(id, seed ? { seed, v: v as string | undefined } : undefined);
    default:
      throw new Error("unknown variant (daily|weekly|monthly|random|refresh)");
  }
}
