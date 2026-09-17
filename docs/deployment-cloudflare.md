# Deploying to Cloudflare

1. Create Pages project `nicebear` pointing at `apps/web`.
   Build command: `pnpm build`. Output: `apps/web/dist`.
2. Bind KV namespace for rotation decisions (`avatar:{id}:active`).
3. Create Queue `nicebear-webhook-delivery` (producer + consumer with 5 retries).
4. Set secrets: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, plus either
   `GITHUB_TOKEN` (default github asset store) or `ASSET_STORE=hf` with
   `HF_NAMESPACE`, `HF_BUCKET`, `HF_S3_ACCESS_KEY_ID`,
   `HF_S3_SECRET_ACCESS_KEY` (see `docs/storage.md`).
   Auth additions: `BETTER_AUTH_SECRET` (required in production),
   `BETTER_AUTH_URL` (your Pages origin, e.g. `https://nicebear.pages.dev`),
   and — to enable GitHub OAuth — `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
   from a GitHub OAuth App whose callback is
   `https://YOUR_HOST/api/auth/callback/github`.
   Raw API clients must send an `Origin` header on state-changing
   `/api/auth/*` calls (better-auth 1.7 CSRF check; browsers do this
   automatically).
5. `wrangler pages deploy apps/web/dist` (or push to `main` — `deploy.yml` does
   migrations + deploy automatically).

Cache behavior: decision cache TTL = until next rotation boundary
(`secondsUntilNextBoundary`); byte cache is immutable per commit sha
(`Cache-Control: public, max-age=31536000, immutable`), short TTL for
live-proxied `external_url`.

Image formats: `?format=svg` (default), `?format=png&w=256` (rasterized,
generated avatars only), `?format=gif` (animated `blink`/`orb`/`rain`
engines, which default to gif). Note: PNG rasterization needs resvg's
native build, so on Workers `?format=png` answers `503 render_unavailable`
— self-hosted Node deployments rasterize fine. Animated GIFs are pure-TS
and work everywhere. See `GET /api/engines` for the style catalog.

## Background work

Two admin routes back the background loops; trigger them on a schedule:

- `POST /api/analytics/rollup` — aggregate complete hour/day buckets into
  `usage_hourly`/`usage_daily` (idempotent, cursor-tracked). Every ~15 min.
- `POST /api/webhooks/process` — drain pending webhook deliveries with
  HMAC-SHA256 signatures + exponential backoff (5 attempts). Every minute.
  (Redundant once the Queue consumer below is live, but harmless.)

On Cloudflare, prefer native triggers: a Cron Trigger calling the rollup
route, and the Queue consumer (`handleQueueBatch` in
`src/lib/webhooks/consumer.ts`) bound to `nicebear-webhook-delivery` for
real-time delivery with `delaySeconds` backoff. Self-hosters without Queues:
cron both HTTP routes.

## Self-host cron (no Cloudflare Queues)

```cron
*/15 * * * * curl -sf -X POST -H "Authorization: Bearer $NB_KEY" https://YOUR_HOST/api/analytics/rollup > /dev/null
* * * * * curl -sf -X POST -H "Authorization: Bearer $NB_KEY" -H 'Content-Type: application/json' -d '{"limit":50}' https://YOUR_HOST/api/webhooks/process > /dev/null
```
