# Deployment credentials

Everything in this repository that cannot ship without a credential, and the one
command or field that supplies each. `gh secret list --repo karlgroves/bugrout`
and `gh variable list` are both **empty**, so nothing here is set today.

Each row names what becomes verifiable once the credential exists — a command
whose output changes — so "configured" is a checkable claim rather than a
belief. Issues: #157, #143, #149, #150, #142.

## 1. `CLOUDFLARE_API_TOKEN` — GitHub repository secret

Blocks **two** workflows, and this is the single highest-leverage credential in
the repository.

|              |                                                                                                                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where        | GitHub repository secret. `backend-deploy.yml` and `data-pipeline.yml` both read `secrets.CLOUDFLARE_API_TOKEN`; neither job declares an `environment:`, so it must be set at repository level. |
| Set it       | `gh secret set CLOUDFLARE_API_TOKEN --repo karlgroves/bugrout`                                                                                                                                  |
| Scope needed | **Both** `Workers Scripts: Edit` **and** `R2 Storage: Edit`, on the account owning `bugrout-tile-server` and the `bugrout-tiles` bucket.                                                        |

**The scope matters.** Cloudflare's "Edit Cloudflare Workers" template does not
include R2 write. `backend-deploy.yml` needs Workers; `data-pipeline.yml` runs
`wrangler r2 object put "bugrout-tiles/<region>/<file>"` and
`build-manifest.sh --upload`, which need R2. A token from the template alone
deploys the workers and then fails the publish.

Verifiable once set:

```bash
# today: 6 warnings for missing security headers on the live worker
node security/scripts/check-headers.js --production \
  https://bugrout-tile-server.karlgroves.workers.dev/health
```

Run **Backend Deploy** on `main` (`workflow_dispatch`), then re-run the above:
it should report **0 warnings**. `packages/worker-utils/src/http.ts` sets six
headers that the deployed worker does not currently send, which is the measure
of how far behind the live worker is (#157).

Then unblocked: the first credentialed pipeline run against `md`, which is the
sole remaining item on **#241**, **#146** (`valhallaSize` is `0` in the live
manifest — no routing graph has ever been published) and **#203** (the published
package carries no `fuelSize`), and which **#147** needs for any further region.
Expect `alert-aggregator` and `crowd-signal` to keep failing until **#144**
supplies real KV namespace ids; `fail-fast: false` means they no longer cancel
`tile-server`.

## 2. `FLY_API_TOKEN` — GitHub repository secret

|              |                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------ |
| Where        | GitHub repository secret, read by `backend-deploy.yml`.                                    |
| Set it       | `flyctl tokens create deploy` then `gh secret set FLY_API_TOKEN --repo karlgroves/bugrout` |
| Scope needed | Deploy on the org owning `bugrout-valhalla` and `route-tracker`.                           |

Verifiable once set: Backend Deploy's `route-tracker` job reaches
`flyctl deploy` instead of exiting on _"no access token available"_.
`route-tracker` has never been deployed (#144).

## 3. App keys — EAS environment variables, not `eas.json`

All three are read from `process.env` at build time, so they belong in EAS
environment variables rather than committed into `apps/mobile/eas.json` (#143).

```bash
cd apps/mobile
eas env:create --name EXPO_PUBLIC_SENTRY_DSN     --value '<dsn>'  --environment production
eas env:create --name EXPO_PUBLIC_NREL_API_KEY   --value '<key>'  --environment production
eas env:create --name EXPO_PUBLIC_POSTHOG_KEY    --value '<key>'  --environment production
```

**`EXPO_PUBLIC_SENTRY_DSN`** — `eas.json`'s production profile currently holds
the literal `"YOUR_SENTRY_DSN"`. Crash reporting is cleanly **off**, not broken:
`services/CrashReporting.ts:143` returns early when the DSN still equals that
placeholder, so no malformed DSN is ever initialised. Remove the placeholder
from `eas.json` when the real value goes into EAS. Verifiable: a deliberate
thrown error in a production build appears in the Sentry project.

**`EXPO_PUBLIC_NREL_API_KEY`** — **#143's description of this is out of date.**
It says "without it the fuel-station layer is blank", which was true before #200
and #239 packaged OSM fuel stations with each region. The fuel layer is now OSM
`amenity=fuel` (`ResourceSync.ts:82`, `source === "osm"`), and NREL is guarded
by `if (NREL_API_KEY)` with the comment _"an optional supplement; the OSM
stations are the layer"_. So this key adds **EV and alternative-fuel stations
only** and blocks nothing. Free from `developer.nrel.gov/signup`. Verifiable: EV
stations appear alongside OSM fuel on the map.

**`EXPO_PUBLIC_POSTHOG_KEY`** — optional, and #143 asks whether it is wanted at
all given the privacy posture. If it is set, it must stay consistent with the
store privacy labels and the iOS privacy manifest (#206), which
`__tests__/docs/privacyLabelDrift.test.ts` checks in both directions.

## 4. App Store Connect — `apps/mobile/eas.json`

`submit.production.ios` holds three placeholders (#149):

```json
"appleId": "YOUR_APPLE_ID",
"ascAppId": "YOUR_ASC_APP_ID",
"appleTeamId": "YOUR_TEAM_ID"
```

- `appleId` — the Apple ID email on the developer account.
- `ascAppId` — the numeric app id, created with the App Store Connect record.
- `appleTeamId` — the ten-character team id from the developer account's
  Membership page.

Verifiable once filled: `eas submit --platform ios --profile production` gets
past configuration validation instead of rejecting the placeholders.

Two things gate an actual public submission, not just the config: the production
keys above, and the privacy policy URL submitted to the store, which currently
serves a parked stub (#249 — `pnpm run security:store-urls` checks it).

## 5. Google Play — `apps/mobile/play-service-account.json`

`eas.json` points `submit.production.android.serviceAccountKeyPath` at
`./play-service-account.json`, which `apps/mobile/.gitignore` excludes and
`security/tests/play-service-account.security.test.ts` asserts stays excluded
(#260). Drop the JSON key at that path; it is never committed.

Needs a Google Cloud service account with the **Google Play Android Developer
API** enabled, invited to the Play Console with release permission on the app.

**#150's first checkbox is answered: no, Firebase is not needed.** Nothing in
`apps/mobile`, `packages` or `backend` references Firebase,
`google-services.json` or `GoogleService-Info.plist`. No `google-services.json`
has to be generated.

Verifiable once in place: `eas submit --platform android --profile production`
uploads to the `internal` track.

## 6. Not a credential: a device (#142, #150)

Issue #142 and the second half of #150 need hardware and an Apple Developer
account for a preview build, not a secret:

```bash
cd apps/mobile
npx eas-cli@latest build --profile preview --platform ios  --non-interactive
npx eas-cli@latest build --profile preview --platform android
```

Then, on a real device: download Maryland (~145 MB — the live manifest's
`pmtilesSize` is 145,188,267), relaunch in airplane mode and confirm the map
renders from the downloaded PMTiles rather than the CARTO online fallback, and
run one Bug Out route. Nothing in this repository can stand in for that run.
