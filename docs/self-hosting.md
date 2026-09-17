# Self-hosting NiceBear

## Requirements

- Node 22+, pnpm 9
- Turso (LibSQL) database — or local `sqld` for dev
- Cloudflare account (Pages + Functions + KV + Queues)
- GitHub App (Contents API read/write) for the asset store
- Nothing paid: no Stripe, no billing, no license keys. NiceBear is free
  forever; set `DONATE_URL` to show a donate button on `/support`.

## Local dev (no cloud accounts)

```bash
pnpm install
export TURSO_DATABASE_URL="file:./nicebear.db"
pnpm db:migrate                                   # applies migrations/ to local LibSQL
pnpm --filter @nicebear/web db:seed acme          # creates org + prints an admin key ONCE
pnpm --filter @nicebear/web dev                   # serves on :4321 (KV/Queue degrade gracefully)
```

Without `DECISIONS` KV bound, rate limits are allow-open and the decision
cache is skipped — responses still work; bind KV in wrangler for production.

## Steps (production)

## Notes

- Metadata lives in Turso; binaries live in GitHub, served via jsDelivr.
- `external_url` ingestion blocks literal private IPs, localhost, metadata
  endpoints, and non-image content (see `lib/security/ssrf.ts`); every
  redirect hop is re-validated. Known limitation: DNS-rebinding (a hostname
  resolving to a private IP at fetch time) needs a runtime DNS check — tracked
  for the hardening slice; run ingestion behind an egress proxy if this is in
  your threat model.
- Mutating/analytics routes accept `Authorization: Bearer nb_live_…` or a
  signed-in session cookie (visit `/login`; email/password works out of the
  box, GitHub OAuth needs `GITHUB_CLIENT_ID/SECRET`). Signup auto-provisions
  a personal org, so team invites (`POST /api/team` by email) work once the
  invitee has signed in at least once.
