# BugRout — Resume Checklist

Snapshot of remaining work to get BugRout fully functional on your iPhone.
Checked items are done. Top section is the immediate critical path; lower
sections are nice-to-haves and longer-term follow-ups.

## Immediate: finish the tile-server deploy

Blocked waiting on a Cloudflare `workers.dev` subdomain (one-time,
account-wide).

- [ ] **Register workers.dev subdomain** — Cloudflare dashboard → left sidebar
      "Workers & Pages" → pick any subdomain (e.g. `karlgroves`). Once done,
      your tile worker will live at
      `bugrout-tile-server.<subdomain>.workers.dev`.
- [ ] **Deploy the tile worker**

  ```sh
  cd backend/workers/tile-server
  CLOUDFLARE_API_TOKEN="…" npx wrangler@latest deploy
  ```

- [ ] **Sanity-check the worker** — should return Maryland:

  ```sh
  curl https://bugrout-tile-server.<subdomain>.workers.dev/v1/tiles/manifest
  ```

- [ ] **Point the app at the worker** — edit `apps/mobile/eas.json`,
      replace`EXPO_PUBLIC_TILE_SERVER_URL` in all three build profiles with the
      new worker URL.
- [ ] **Rebuild preview IPA**

  ```sh
  cd apps/mobile
  npx eas-cli@latest build --profile preview --platform ios --non-interactive
  ```

- [ ] **Install on iPhone, test the flow**: 1. Delete old BugRout. 2. Open the
      new install URL in Safari, tap Install. 3. Launch app → Downloads tab →
      tap Maryland → should succeed (~140 MB). 4. Kill and relaunch the app →
      main map should render Maryland from the downloaded PMTiles, not the CARTO
      online fallback. 5. Bug Out button → pick a destination in MD → should
      return a real turn-by-turn route from the Fly Valhalla instance.

## Already done

- [x] EAS project initialized (`349ad664-e0c0-4dbc-8315-3cb661f94196`)
- [x] Apple distribution cert + provisioning profile (expires 2027-04-10)
- [x] iPhone UDID registered with EAS
- [x] Preview IPA built (most recent:
      `https://expo.dev/accounts/karl.groves/projects/bugrout/builds/9f5ba3cd-3a71-4bae-a64c-e5b04845275c`)
- [x] Valhalla routing service deployed on Fly.io
      (`https://bugrout-valhalla.fly.dev`, Maryland tiles baked in)
- [x] `@maplibre/maplibre-react-native` installed + wired up
- [x] `react-native-get-random-values` polyfill installed (fixes uuid crash)
- [x] CARTO Dark Matter online fallback style (renders without downloaded tiles)
- [x] All 50 states + DC listed in downloads screen
- [x] Home screen FAB/chip/filter overlap fixed
- [x] Cloudflare R2 bucket `bugrout-tiles` created
- [x] Maryland PMTiles (137 MB) uploaded to R2 at `md/md.pmtiles`
- [x] `manifest.json` uploaded to R2 with Maryland entry
- [x] `tile-server` Worker code uploaded (just not deployed — see above)

## Near-term follow-ups (after Maryland works end-to-end)

### More regions

- [ ] Build PMTiles for additional states with `planetiler` and upload to R2:

  ```sh
  cd data-pipeline
  curl -fL -o osm/output/<state>-latest.osm.pbf \
    https://download.geofabrik.de/north-america/us/<state>-latest.osm.pbf
  java -Xmx4g -jar planetiler.jar \
    --osm-path=osm/output/<state>-latest.osm.pbf \
    --output=osm/output/<state>.pmtiles --force --download
  npx wrangler@latest r2 object put \
    bugrout-tiles/<code>/<code>.pmtiles \
    --file=osm/output/<state>.pmtiles --remote
  ```

  Then add the region's entry to `manifest.json` and re-upload.

- [ ] Add more regions to Valhalla Fly service — edit
      `backend/services/valhalla/fly.toml` `[build.args]` to the new PBF URL and
      `flyctl deploy`. Note: larger states need `memory = "2048mb"`+. For
      multi-region routing you'd need to switch from single-PBF build to
      multi-PBF or a regional router selector.

### Secrets & API keys (currently stubbed)

- [ ] **Sentry DSN** — create project at sentry.io, set `EXPO_PUBLIC_SENTRY_DSN`
      in `eas.json` production profile. Until set, crash reporting is disabled
      (not blocking but recommended).
- [ ] **NREL API key** — free from nrel.gov, set `EXPO_PUBLIC_NREL_API_KEY`.
      Without it, the fuel station layer is blank.
- [ ] **PostHog key** (optional) — `EXPO_PUBLIC_POSTHOG_KEY` for analytics.

### Other backend services (not yet deployed — not blocking MVP)

- [ ] `backend/workers/alert-aggregator/wrangler.toml` —
      replace`YOUR_KV_NAMESPACE_ID` with a real KV namespace ID, then deploy.
- [ ] `backend/workers/crowd-signal/wrangler.toml` — same.
- [ ] `backend/services/route-tracker/` — deploy to Fly if you want crowd signal
      load distribution (spec V1.1 feature).

## Long-term / polish

- [~] **Native Valhalla module (Approach A)** — Sprint 0 spike done in code:
  decision doc, shared C++ `actor_t` wrapper, iOS/Android bindings, config
  plugin, and corrected build scripts are in
  `apps/mobile/native-modules/valhalla/` — read`SPIKE.md` there first. **Key
  finding:** the old subprocess HTTP-server approach can't ship on iOS (no
  `Process` API + sandbox), so Approach A is mandatory, not just preferred. JS
  already routes in-process when the module is present. **Remaining (needs your
  Mac/Xcode/NDK + a device):** run
  `build-scripts/{fetch-deps,build-ios,build-android}.sh`, enable the plugin
  in`app.config.ts` with`{ approach: "native" }`,`expo prebuild`, build, and
  verify a route returns offline with `EXPO_PUBLIC_VALHALLA_URL` unset.
- [ ] **Valhalla tile tarball in R2** — rebuild tiles using
      `data-pipeline/osm/build-routing-tiles.sh`, upload
      to`bugrout-tiles/<code>/<code>.valhalla.tar.gz`, and set`valhallaSize`
      in`manifest.json`. Needed for the native module path only; the HTTP
      approach works without it. _Client side is wired:_ `TileManager` downloads
      the tarball, `services/valhalla/ValhallaTiles.ts` picks native-vs-http and
      the native module gunzips + mmaps it on init. _Pipeline fixed:_
      `osm/build-routing-tiles.sh` +`build-region.sh` now emit
      a`tile_extract`-compatible`.tar.gz` via`valhalla_build_extract` (the old
      plain `tar -czf` of the tile dir wasn't mmap-loadable; and the
      stray`-e`/`--end-stage` misuse is gone). Remaining is just _running_ it
      (needs a Mac/Linux box with `valhalla-bin`, or the **Data Pipeline**
      GitHub Action with R2 secrets) to upload + set `valhallaSize`. Confirm
      the`valhalla_build_extract` flags against your installed Valhalla version.
- [ ] **App Store submission** — fill in real Apple ID, ASC App ID, team ID in
      `eas.json` submit section.
- [ ] **Android build** — currently iOS-only. Generate `google-services.json`,
      build with `--platform android`.
- [ ] **Tile update cadence** — rebuild/reupload PMTiles periodically. Consider
      a GitHub Action that runs monthly.

## Files touched during current session

- `apps/mobile/app.config.ts` — EAS project ID, owner, MapLibre plugin,
  ITSAppUsesNonExemptEncryption
- `apps/mobile/eas.json` —`EXPO_PUBLIC_VALHALLA_URL` added to all profiles
- `apps/mobile/app/_layout.tsx` —`react-native-get-random-values` import
- `apps/mobile/app/(tabs)/index.tsx` — FAB/chip/filter spacing
- `apps/mobile/services/map/StyleBuilder.ts` — CARTO fallback style
- `apps/mobile/services/valhalla/ValhallaModule.ts` — remote URL support
- `apps/mobile/services/tiles/TileManager.ts` — env var for server URL, optional
  Valhalla tarball download
- `apps/mobile/constants/regions.ts` — all 50 states + DC
- `apps/mobile/package.json`
  —`@maplibre/maplibre-react-native`,`react-native-get-random-values`
- `backend/services/valhalla/{Dockerfile,fly.toml,README.md}` — Valhalla Fly
  service

## Session artifacts (don't commit)

- `data-pipeline/planetiler.jar` — 89 MB
- `data-pipeline/osm/output/maryland-latest.osm.pbf` — 201 MB
- `data-pipeline/osm/output/maryland.pmtiles` — 137 MB
- `data-pipeline/data/sources/` — Planetiler auxiliary data (natural earth,
  water polygons, lake centerlines)
- `cloudflare_token` — Cloudflare API token (rotate if committed accidentally)

Consider adding these to `.gitignore` if not already.
