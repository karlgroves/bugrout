# tile-server

Cloudflare Worker that serves BugRout's offline region packages from the
`bugrout-tiles` R2 bucket.

| Route                           | Serves                                              |
| ------------------------------- | --------------------------------------------------- |
| `GET /health`                   | `ok`                                                |
| `GET /v1/tiles/manifest`        | `manifest.json`: region ids, sizes, versions, bbox  |
| `GET /v1/tiles/:regionId/:type` | `pmtiles`, `valhalla`, `flood`, `fuel` or `geocode` |

Package downloads support `Range` (resume) and `If-None-Match` (ETag).

## Access model: public by design

The manifest and every package are **public**. No credential is required, and
none is checked.

This is a decision, not an oversight. The packages are derived from open data
(OpenStreetMap, FEMA flood zones), and the shipped app sends no credential on
any tile request. A key embedded in the app would be extractable from any APK or
IPA, so it would not make the packages private either.

Until issue #293 the worker had an API-key check that ran only when an `API_KEY`
binding was set. Nothing set it, and the app could not have passed it, so the
check never ran. It made the worker look protected when it was not, and an
operator who set the key would have broken map downloads for every shipped
build. It was removed. `API_KEY` is now ignored, and
`security/tests/auth.security.test.ts` pins that, so adding authentication later
means changing that test on purpose.

## Abuse control: per-IP rate limit

Every route except `/health` (and CORS preflights) is rate-limited per client IP
(`CF-Connecting-IP`) through the Workers Rate Limiting binding `RATE_LIMITER`,
declared in `wrangler.toml`:

- 120 requests per 60 seconds per IP. A phone fetches at most six files per
  region, and many evacuees can share one carrier-NAT or shelter Wi-Fi address,
  so the limit is set high.
- Over the limit, the worker returns `429` with `Retry-After: 60`.
- The binding needs no provisioning: `namespace_id` is an arbitrary integer
  chosen in `wrangler.toml`, not a secret.

Limits to keep in mind:

- It counts **requests, not bytes**. One request can stream a 140 MB package, so
  this limits request floods and scripted loops, not egress volume.
- Cloudflare's limiter is per location and eventually consistent, so treat it as
  a ceiling against abuse, not an exact quota.
- A distributed client set (many IPs) is not stopped by a per-IP limit. That
  needs a Cloudflare WAF rate-limiting rule or similar at the zone level.

## Development

```sh
pnpm dev        # wrangler dev; the rate limiter works locally too
pnpm typecheck
```

Security regression tests for this worker live in `security/tests/`
(`auth.security.test.ts`, `headers.security.test.ts`); run them with
`pnpm run security:tests` from the repository root.
