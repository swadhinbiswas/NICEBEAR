# Asset storage

NiceBear stores bytes (uploads, mirrored external images) in a pluggable
asset store. Metadata, versions, and rotation state always live in Turso —
the store only holds immutable blobs.

## Backends

| Backend | `ASSET_STORE` | Writes | Reads | Versions |
|---|---|---|---|---|
| GitHub Contents API + jsDelivr (default) | `github` | `PUT /repos/{repo}/contents/{key}` | 302 to `cdn.jsdelivr.net/gh/…@{sha}` | git commit shas |
| Hugging Face Storage Buckets (S3 gateway) | `hf` | S3 `PutObject` at `https://s3.hf.co/<namespace>` | 302 to `huggingface.co/buckets/…/resolve/main/…` (CDN) | per-version object keys |

Buckets are **non-versioned**, so every write lands at a versioned key
(`avatars/<avatar-id>/v<seq>.<ext>`). The `commit_sha` column stores an
opaque version pointer — a git sha for `github`, the S3 key itself for `hf`
— so `?v=N` resolution, rollback, and pointer history work identically on
both backends. Key names comply with HF rules (no leading/trailing `/`,
no `//`, no `..`).

## Hugging Face setup

1. Create a bucket at `huggingface.co/new-bucket` (public if you want the
   CDN resolve URLs to work without credentials).
2. Create a user access token (Read for deploys that never upload, Write
   for full access), then **Generate S3 credentials** from the token menu.
   Save the `HFAK…` access key ID and secret (shown once).
3. Set the environment:

```bash
ASSET_STORE=hf
HF_NAMESPACE=<your-username-or-org>
HF_BUCKET=<bucket-name>
HF_S3_ACCESS_KEY_ID=HFAK...
HF_S3_SECRET_ACCESS_KEY=...
# Optional: override the public read base (e.g. your own CDN in front).
# HF_PUBLIC_BASE_URL=https://cdn.example.com/hf
```

Client settings follow the HF reference (endpoint
`https://s3.hf.co/<namespace>`, region `us-east-1`, path addressing,
checksums `when_required`, 2GB multipart knobs). Notes from that reference
that apply here:

- `GetObject` typically 302-redirects to the nearest CDN edge — serving
  redirects there directly keeps the gateway out of the data path.
- Keys must not start/end with `/`, contain `//` or `..`, or backslashes
  (enforced by `versionedKey`).
- No ACLs, versioning, or tagging — NiceBear doesn't use them.

## Local dev without credentials

Leave `ASSET_STORE` unset (or `github`) and skip uploads, or point tests at
the fake `S3Sender` (`src/storage.test.ts` shows the pattern). The
`POST /api/avatars` upload/mirror paths return `503 unconfigured` or
`400 ?repo= required` with explicit codes when their backend isn't ready.

## Content policy reminder

The store never crawls or imports: bytes arrive only from direct user
uploads or from external URLs the owning user attests they hold rights to
(`attest_rights: true`, SSRF-guarded fetch). There is intentionally no
Pinterest/Instagram/TikTok importer — "use a direct link" means a link to
an image **you own**, e.g. on your own domain or CDN.
