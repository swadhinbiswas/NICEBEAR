import type { APIRoute } from "astro";
import { AvatarCreateSchema } from "@nicebear/shared-types";
import { audit, enqueueWebhooks } from "../../../lib/analytics/log";
import { authedRoute, requireOrgRole } from "../../../lib/api/authed";
import { loadCollection, loadHistory } from "../../../lib/api/avatars";
import { HttpError } from "../../../lib/auth/authenticate";
import type { Database } from "../../../lib/db/client";
import { avatarPointerHistory, avatars } from "../../../lib/db/schema";
import { newId } from "../../../lib/ids";
import type { AppEnv } from "../../../lib/runtime/env";
import { assertSafeExternalUrl, fetchExternalImage } from "../../../lib/security/ssrf";
import { extForContentType, getStorageBackend, versionedKey } from "../../../lib/storage/index.js";

const nowSec = () => Math.floor(Date.now() / 1000);

/** Base64 → approx bytes (for the ~5MB cap check without decoding). */
function b64Bytes(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface PersistedRef {
  storageBackend: "github" | "hf";
  storageKey: string;
  commitSha: string;
  githubRepo: string | null;
  githubPath: string | null;
}

/**
 * Store one versioned object through the configured asset store and record
 * pointer history. Keys are versioned (`avatars/<id>/v<seq>.<ext>`) so `?v=N`
 * resolution works identically on git-backed and bucket-backed stores.
 */
async function persistBytes(
  db: Database,
  env: AppEnv,
  args: { avatarId: string; repo: string | null; bytes: Uint8Array; contentType: string; message: string },
): Promise<PersistedRef> {
  const createdAt = nowSec();
  const history = await loadHistory(db, args.avatarId).catch(() => []);
  const key = versionedKey(args.avatarId, history.length + 1, extForContentType(args.contentType));
  let backend;
  try {
    backend = getStorageBackend(env, { repo: args.repo ?? undefined });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(503, "asset store misconfigured", "unconfigured");
  }
  let version: string;
  try {
    ({ version } = await backend.put({ key, bytes: args.bytes, contentType: args.contentType, message: args.message }));
  } catch {
    throw new HttpError(502, `${backend.id} store write failed`, "upstream_error");
  }
  if (backend.id === "github") {
    await db
      .insert(avatarPointerHistory)
      .values({ id: newId("avp"), avatarId: args.avatarId, commitSha: version, createdAt })
      .catch(() => undefined);
    return { storageBackend: "github", storageKey: key, commitSha: version, githubRepo: args.repo, githubPath: key };
  }
  // HF buckets are non-versioned: the key IS the version pointer.
  await db
    .insert(avatarPointerHistory)
    .values({ id: newId("avp"), avatarId: args.avatarId, commitSha: key, createdAt })
    .catch(() => undefined);
  return { storageBackend: "hf", storageKey: key, commitSha: key, githubRepo: null, githubPath: null };
}

/**
 * POST /api/avatars — create (generated | uploaded | external_url).
 * Org is resolved from collection_id, else ?org_id=. Bytes go through the
 * configured asset store (github: ?repo=owner/name; hf: server env), keyed
 * per version. Mirrored bytes are versioned via avatar_pointer_history.
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
      storageBackend: "github",
      storageKey: null,
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
    const ref = await persistBytes(db, env, {
      avatarId: id,
      repo: repoParam,
      bytes: b64ToBytes(input.content_base64),
      contentType: input.content_type,
      message: `nicebear: upload ${id}`,
    });
    await db.insert(avatars).values({
      id,
      collectionId,
      orgId,
      sourceType: "uploaded",
      githubRepo: ref.githubRepo,
      githubPath: ref.githubPath,
      commitSha: ref.commitSha,
      storageBackend: ref.storageBackend,
      storageKey: ref.storageKey,
      externalUrl: null,
      attestedRights: 0,
      seed: null,
      createdAt,
      deletedAt: null,
    });
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
      const ref = await persistBytes(db, env, {
        avatarId: id,
        repo: repoParam,
        bytes: new Uint8Array(fetched.bytes),
        contentType: fetched.contentType,
        message: `nicebear: mirror ${id}`,
      });
      await db.insert(avatars).values({
        id,
        collectionId,
        orgId,
        sourceType: "external_url",
        githubRepo: ref.githubRepo,
        githubPath: ref.githubPath,
        commitSha: ref.commitSha,
        storageBackend: ref.storageBackend,
        storageKey: ref.storageKey,
        externalUrl: input.source_url,
        attestedRights: 1,
        seed: null,
        createdAt,
        deletedAt: null,
      });
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
        storageBackend: "github",
        storageKey: null,
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
