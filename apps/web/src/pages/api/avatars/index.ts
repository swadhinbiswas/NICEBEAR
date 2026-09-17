import type { APIRoute } from "astro";
import { AvatarCreateSchema } from "@nicebear/shared-types";
import { audit, enqueueWebhooks } from "../../../lib/analytics/log";
import { authedRoute, requireOrgRole } from "../../../lib/api/authed";
import { loadCollection } from "../../../lib/api/avatars";
import { avatarPointerHistory, avatars } from "../../../lib/db/schema";
import { GitHubContentsClient } from "../../../lib/github/client";
import { newId } from "../../../lib/ids";
import { assertSafeExternalUrl, fetchExternalImage } from "../../../lib/security/ssrf";

const nowSec = () => Math.floor(Date.now() / 1000);

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Base64 → approx bytes (for the ~5MB cap check without decoding). */
function b64Bytes(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

/**
 * POST /api/avatars — create (generated | uploaded | external_url).
 * Org is resolved from collection_id, else ?org_id=. GitHub target repo is
 * ?repo=owner/name (per-org default repo mapping lands with the GitHub App
 * installation flow). Mirrored bytes are versioned via avatar_pointer_history.
 */
export const POST: APIRoute = authedRoute("admin", async (ctx, req) => {
  const { db, auth, env, waitUntil, account } = ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = AvatarCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid avatar payload", issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  let orgId: string | null = null;
  let collectionId: string | null = input.collection_id ?? null;
  if (collectionId) {
    const collection = await loadCollection(db, collectionId);
    if (!collection) return Response.json({ error: "collection not found" }, { status: 404 });
    orgId = collection.orgId;
  } else {
    orgId = new URL(req.url).searchParams.get("org_id");
    if (!orgId) {
      return Response.json({ error: "collection_id or ?org_id= is required" }, { status: 400 });
    }
  }
  await requireOrgRole(db, auth, orgId, "developer");

  const id = newId("av");
  const createdAt = nowSec();
  const repoParam = new URL(req.url).searchParams.get("repo"); // owner/name

  if (input.type === "generated") {
    await db.insert(avatars).values({
      id,
      collectionId,
      orgId,
      sourceType: "generated",
      githubRepo: null,
      githubPath: null,
      commitSha: null,
      externalUrl: null,
      attestedRights: 0,
      seed: input.seed ?? id,
      createdAt,
      deletedAt: null,
    });
  } else if (input.type === "uploaded") {
    if (b64Bytes(input.content_base64) > 5 * 1024 * 1024) {
      return Response.json({ error: "upload exceeds 5MB cap" }, { status: 400 });
    }
    if (!env.GITHUB_TOKEN) {
      return Response.json({ error: "asset store not configured (GITHUB_TOKEN)", code: "unconfigured" }, { status: 503 });
    }
    if (!repoParam || !/^[^/]+\/[^/]+$/.test(repoParam)) {
      return Response.json({ error: "?repo=owner/name is required for uploads" }, { status: 400 });
    }
    const [owner, repo] = repoParam.split("/");
    const path = `avatars/${id}/${input.filename}`;
    let sha: string;
    try {
      const gh = new GitHubContentsClient(env.GITHUB_TOKEN);
      ({ sha } = await gh.putFile(owner, repo, path, input.content_base64, `nicebear: upload ${id}`));
    } catch {
      return Response.json({ error: "GitHub upload failed", code: "upstream_error" }, { status: 502 });
    }
    await db.insert(avatars).values({
      id,
      collectionId,
      orgId,
      sourceType: "uploaded",
      githubRepo: repoParam,
      githubPath: path,
      commitSha: sha,
      externalUrl: null,
      attestedRights: 0,
      seed: null,
      createdAt,
      deletedAt: null,
    });
    await db
      .insert(avatarPointerHistory)
      .values({ id: newId("avp"), avatarId: id, commitSha: sha, createdAt })
      .catch(() => undefined);
  } else {
    // external_url — attestation already enforced by Zod literal(true).
    try {
      assertSafeExternalUrl(input.source_url);
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
    let fetched: { bytes: ArrayBuffer; contentType: string };
    try {
      fetched = await fetchExternalImage(input.source_url);
    } catch (e) {
      return Response.json({ error: `source fetch failed: ${(e as Error).message}` }, { status: 400 });
    }
    if (input.mirror !== false) {
      if (!env.GITHUB_TOKEN) {
        return Response.json({ error: "asset store not configured (GITHUB_TOKEN)", code: "unconfigured" }, { status: 503 });
      }
      if (!repoParam || !/^[^/]+\/[^/]+$/.test(repoParam)) {
        return Response.json({ error: "?repo=owner/name is required for mirroring" }, { status: 400 });
      }
      const [owner, repo] = repoParam.split("/");
      const ext = fetched.contentType.split("/")[1]?.replace("svg+xml", "svg") ?? "bin";
      const path = `avatars/${id}/mirrored.${ext}`;
      let sha: string;
      try {
        const gh = new GitHubContentsClient(env.GITHUB_TOKEN);
        ({ sha } = await gh.putFile(
          owner,
          repo,
          path,
          arrayBufferToBase64(fetched.bytes),
          `nicebear: mirror ${id}`,
        ));
      } catch {
        return Response.json({ error: "GitHub mirror failed", code: "upstream_error" }, { status: 502 });
      }
      await db.insert(avatars).values({
        id,
        collectionId,
        orgId,
        sourceType: "external_url",
        githubRepo: repoParam,
        githubPath: path,
        commitSha: sha,
        externalUrl: input.source_url,
        attestedRights: 1,
        seed: null,
        createdAt,
        deletedAt: null,
      });
      await db
        .insert(avatarPointerHistory)
        .values({ id: newId("avp"), avatarId: id, commitSha: sha, createdAt })
        .catch(() => undefined);
    } else {
      // Live proxy — served with short TTL, never long-cached (§4.4).
      await db.insert(avatars).values({
        id,
        collectionId,
        orgId,
        sourceType: "external_url",
        githubRepo: null,
        githubPath: null,
        commitSha: null,
        externalUrl: input.source_url,
        attestedRights: 1,
        seed: null,
        createdAt,
        deletedAt: null,
      });
    }
  }

  account();
  waitUntil(
    audit(db, { orgId, actorId: auth.keyId, action: "avatar.create", target: id }),
  );
  waitUntil(
    enqueueWebhooks(db, env, { event: "avatar.changed", orgId, payload: { avatar_id: id } }),
  );
  return Response.json({ id, org_id: orgId, type: input.type }, { status: 201 });
});
