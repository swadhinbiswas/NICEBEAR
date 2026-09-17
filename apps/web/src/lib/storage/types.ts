/** Asset-store abstraction (§4). GitHub Contents API is the default;
 * Hugging Face Storage Buckets (S3-compatible) is selected with
 * `ASSET_STORE=hf`. Buckets are non-versioned, so every write lands at a
 * versioned key (`avatars/<id>/v<seq>.<ext>`) and `commit_sha` stores that
 * key as the opaque version pointer — `?v=N` resolution is unchanged.
 */

export type StorageBackendId = "github" | "hf";

export interface PutInput {
  /** Versioned object key, e.g. `avatars/av_123/v2.png`. */
  key: string;
  bytes: Uint8Array;
  contentType: string;
  /** Commit message (github) / ignored (hf). */
  message?: string;
}

export interface StoredVersion {
  /** Opaque version pointer for `commit_sha`: git sha or the S3 key itself. */
  version: string;
}

export interface StorageBackend {
  readonly id: StorageBackendId;
  put(input: PutInput): Promise<StoredVersion>;
  /** Public read URL for a key (302 target). Pure — needs no credentials. */
  publicUrl(key: string): string;
}

/** Build a versioned key. Complies with HF key rules: no leading/trailing
 * `/`, no `//`, no `..`, no backslashes. */
export function versionedKey(avatarId: string, seq: number, ext: string): string {
  const safeId = avatarId.replace(/[^A-Za-z0-9_-]/g, "_");
  const safeExt = ext.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "bin";
  return `avatars/${safeId}/v${Math.max(1, Math.floor(seq))}.${safeExt}`;
}

export function extForContentType(contentType: string): string {
  const ct = contentType.split(";")[0]!.trim().toLowerCase();
  switch (ct) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    default:
      return "bin";
  }
}
