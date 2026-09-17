# NiceBear — Dynamic Avatar Infrastructure

Avatars are programmable assets, not static files: they rotate on schedules,
rules, seeds, or events, served globally at edge speed.

## Foundation slice (this commit)

- Monorepo scaffold (`apps/web`, `apps/cli`, `packages/*`, `migrations/`)
- Turso schema + `migrations/0001_initial.sql` + Drizzle models
- Rotation DSL + pure evaluator + thin route wrappers + deterministic Vitest suite
- Generative engine registry (`identicons`, `pixel-art`, `geometric`)
- Public API routes (avatar serving + validated stubs), OpenAPI 3.1 spec
- GitHub Contents client + jsDelivr serving + SSRF guard + attestation enforcement
- RBAC helper, API-key auth helpers, two-tier cache helpers
- CLI skeleton, JS SDK foundation, CI/CD workflows, deployment docs

## Content policy

Every avatar image is generated algorithmically, uploaded by the owning
user/org, or an external URL the owner attests they hold rights to. No
crawling, scraping, or bulk imports — enforced in `packages/shared-types`
(Zod) and the API layer, with `/api/report` as the review intake.

## Develop

```bash
pnpm install
pnpm --filter @nicebear/shared-types test
pnpm --filter @nicebear/web test
pnpm build
```

## Testing (§14)

- **Unit/integration** (Vitest, no network): rotation evaluator, engines,
  auth/rate-limit, webhook consumer + rollups against in-memory LibSQL, and
  route-level tests against temp-file DBs.
  ```bash
  pnpm test
  ```
- **E2E + API contracts** (Playwright): boots the real app on a temp DB
  (migrate + seed + `astro dev` via `e2e/global-setup.ts`), then runs avatar
  lifecycle flows, key rotation, webhook drain, team governance, dashboard
  hydration, and a self-checking contract suite — every operation in
  `packages/openapi/spec.yaml` must have a case returning a documented
  status (never 404/500).
  ```bash
  pnpm --filter @nicebear/web exec playwright install chromium  # once
  pnpm --filter @nicebear/web test:e2e
  ```
