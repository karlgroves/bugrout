# Deployment credentials

Everything in this repository that cannot ship without a credential, and the one
command or field that supplies each. `gh secret list --repo karlgroves/bugrout`
and `gh variable list` are both **empty**, so nothing here is set today.

Each row names what becomes verifiable once the credential exists — a command
whose output changes — so "configured" is a checkable claim rather than a
belief. Issues: #143, #149, #150, #142.

**The service credentials left on 2026-11-15.** `FLY_API_TOKEN`, the R2 S3
credentials for the Valhalla graph (#266), and the Workers scope of
`CLOUDFLARE_API_TOKEN` went to
[AFixt/bugrout-server](https://github.com/AFixt/bugrout-server) with the
services they deploy. Its `docs/deployment-credentials.md` is the live copy for
those. Nothing in this repository deploys a service.

## 1. `CLOUDFLARE_API_TOKEN` — GitHub repository secret

|              |                                                                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where        | GitHub repository secret. `data-pipeline.yml` reads `secrets.CLOUDFLARE_API_TOKEN`; the job declares no `environment:`, so it must be set at repository level. |
| Set it       | `gh secret set CLOUDFLARE_API_TOKEN --repo karlgroves/bugrout`                                                                                                 |
| Scope needed | **`R2 Storage: Edit`** on the account owning the `bugrout-tiles` bucket. Workers scope is not needed here any more.                                            |

**This used to need two scopes.** `backend-deploy.yml` wanted
`Workers Scripts: Edit` and `data-pipeline.yml` wants `R2 Storage: Edit`, and
one token carried both. The deploy workflow moved to the server repository with
its own secret, so this one needs R2 write only. Cloudflare's "Edit Cloudflare
Workers" template does not include R2 write — do not use it for this.

What it unblocks: the first credentialed pipeline run against `md`, which is the
sole remaining item on **#241**, **#146** (`valhallaSize` is `0` in the live
manifest — no routing graph has ever been published) and **#203** (the published
package carries no `fuelSize`), and which **#147** needs for any further region.

Verifiable once set: **Build Region Package** with `upload` ticked completes its
`wrangler r2 object put` steps instead of exiting on an authentication error,
and the published `manifest.json` for `md` carries non-zero sizes.

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
`apps/mobile` or `packages` references Firebase, `google-services.json` or
`GoogleService-Info.plist`, and nothing in the server code did either when it
was here. No `google-services.json` has to be generated.

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
