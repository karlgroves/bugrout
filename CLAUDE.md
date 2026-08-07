# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

BugRout is a survival-focused mobile navigation app for emergency evacuation
scenarios. It optimizes for mission completion (safe arrival at destination)
rather than speed, using predictive congestion modeling and full offline
capability. See `spec.md` for the full product specification.

## Monorepo Structure

pnpm workspaces + Turborepo. Four workspace roots:

- **`apps/mobile/`** — React Native (Expo SDK 54, New Architecture) app with
  Expo Router
- **`packages/shared/`** — Shared TypeScript types (route, threat, resource,
  scenario, geo)
- **`packages/elf-model/`** — ELF weight table training pipeline
- **`backend/workers/`** — Cloudflare Workers (tile-server, alert-aggregator,
  crowd-signal)
- **`backend/services/`** — Fly.io services (route-tracker with Redis)
- **`data-pipeline/`** — Shell scripts for OSM → Valhalla tiles and PMTiles
  builds

## Commands

```bash
# Install all dependencies (also installs Husky git hooks)
pnpm install

# Everyday quality gate: format check + lint + typecheck + tests + markdownlint
pnpm run check

# Full gate: check + duplication, links, security scans, license compliance
pnpm run check:all

# Lint all workspaces / autofix
pnpm run lint
pnpm run lint:fix

# Typecheck all workspaces
pnpm turbo typecheck

# Typecheck mobile app only
cd apps/mobile && npx tsc --noEmit

# Run all tests (102 tests, 14 suites)
pnpm turbo test

# Start Expo dev server
cd apps/mobile && pnpm start

# Start web preview (works without native build)
cd apps/mobile && npx expo start --web

# Run a single test file
cd apps/mobile && npx jest __tests__/utils/geo.test.ts

# Build the Metro bundle for both native platforms (CI gate; no native toolchain)
pnpm run bundle:check

# Check the dependency set matches the installed Expo SDK (CI gate)
pnpm run doctor

# Run E2E tests. Requires a native build first: the app uses the managed
# workflow, so android/ and ios/ are generated, not committed.
cd apps/mobile
npx expo prebuild --platform android --no-install
pnpm run e2e:build   # gradle assembleDebug + assembleAndroidTest
pnpm run e2e:smoke   # launch + map screen, against a Pixel_6_API_33 AVD

# Run a specific backend worker locally
cd backend/workers/tile-server && pnpm dev

# Install scanner binaries (gitleaks, semgrep, osv-scanner, lychee)
bash scripts/bootstrap.sh
```

## Quality Tooling

- **ESLint:** single root `eslint.config.mjs` (flat config) covering every
  workspace — typescript-eslint strict type-checked, naming-convention,
  react/react-hooks/react-native-a11y (mobile), eslint-plugin-n (Node surfaces),
  security, sonarjs, import-x, jsdoc (TSDoc). All plugins are ROOT
  devDependencies (pnpm isolation) — never add ESLint deps to a workspace.
  Composition decisions: `docs/adr/0006`.
- **TypeScript:** `tsconfig.base.json` is strict + `noUncheckedIndexedAccess`
  - `exactOptionalPropertyTypes`. All workspaces extend it except `apps/mobile`
    (extends `expo/tsconfig.base`, flags repeated inline).
- **Hooks (Husky):** pre-commit = lint-staged + gitleaks; commit-msg =
  commitlint (Conventional Commits — commit messages MUST be conventional);
  pre-push = `pnpm run check` + dupes/secrets/licenses.
- **Grandfathered violations** live in `docs/tech-debt.md` with file-level
  eslint-disables; new code gets no exemptions. Adaptation decisions from the
  org tooling baseline (issue #1) are ADRs in `docs/adr/`.
- CI (`.github/workflows/ci.yml`) is a safety net re-running the same gates;
  `security.yml` (CodeQL, semgrep, OSV, Dependency-Check) and `docs.yml`
  (lychee) run weekly.

## Technical Stack

- **Framework:** React Native (Expo managed workflow, SDK 54)
- **Routing:** Expo Router (file-based, `app/` directory)
- **Routing Engine:** Valhalla via local HTTP server on localhost:8002 (Approach
  B), with native C++ Turbo Module as preferred alternative (Approach A)
- **Map Rendering:** MapLibre GL with Protomaps .pmtiles
- **State Management:** Zustand (stores in `apps/mobile/stores/`)
- **Local Storage:** SQLite via expo-sqlite (schema in
  `apps/mobile/db/schema.ts`)
- **Backend:** Cloudflare Workers + R2, Fly.io + Redis
- **CI/CD:** GitHub Actions → EAS Build (mobile), Wrangler (workers), Flyctl
  (services)

## Key Architecture Concepts

- **Offline-first:** App must be fully functional with zero connectivity after
  tile download. Every service has an offline fallback or cached mode.
- **Evacuation Load Factor (ELF):** Per-road-segment multiplier (1.0–10.0) baked
  into Valhalla routing tiles at build time. Defined in `packages/elf-model/`.
  Higher ELF = more congestion expected = route avoids that segment.
- **Threat avoidance:** Active fire/flood/weather polygons are converted to
  Valhalla `exclude_polygons` to route around danger zones. Logic in
  `services/routing/ThreatAvoidance.ts`.
- **Three-tap navigation:** Launch → "Bug Out" FAB → Select destination →
  Confirm route. The primary UX flow must never exceed 3 taps.
- **Platform wrappers:** All native modules are imported via `platform/`
  directory, which provides mock fallbacks for web preview and Expo Go. Metro
  config (`metro.config.js`) aliases native-only modules to empty on web.

## Mobile App Layout

Screens (`app/` directory — Expo Router file-based routing):

- `app/(tabs)/index.tsx` — Main map screen with MapLibre, Bug Out FAB, threat
  overlays, resource markers, scenario quick-chips, stale tile warnings
- `app/(tabs)/scenarios.tsx` — Saved evacuation scenarios (max 3), links to
  editor
- `app/(tabs)/settings.tsx` — Settings menu (offline maps, contacts, voice,
  battery, legal)
- `app/navigation/[routeId].tsx` — Active turn-by-turn navigation with voice,
  deviation detection, emergency SMS, advisory badge, battery warning
- `app/route-preview/index.tsx` — Route confirmation: distance, ETA, threat
  warnings, resource stops, Go/Back buttons
- `app/destination/index.tsx` — Destination picker: Nominatim geocoding,
  scenario quick-select, recent destinations
- `app/downloads/index.tsx` — Offline tile download manager with progress bars,
  storage info, stale warnings
- `app/scenarios/edit.tsx` — Scenario editor (name, destination, fuel/water stop
  preferences)
- `app/contacts/index.tsx` — Emergency contacts manager (up to 5 contacts)
- `app/onboarding/index.tsx` — First-launch disclaimer with privacy policy and
  ToS links
- `app/legal/privacy.tsx` — Bundled privacy policy (accessible offline)
- `app/legal/terms.tsx` — Bundled terms of service (accessible offline)

Key service modules (`services/` directory):

- `valhalla/ValhallaModule.ts` — Valhalla native bridge (Approach B: HTTP,
  fallback: mock route)
- `navigation/NavigationController.ts` — Orchestrates GPS → maneuver → voice →
  deviation → crowd signal
- `tiles/TileManager.ts` — Resumable tile downloads via expo-file-system, SQLite
  tracking
- `tiles/DownloadQueue.ts` — Sequential download queue with pause/resume
- `routing/RouteEngine.ts` — Smart routing: threat avoidance + resource
  waypoints + deviation detection
- `routing/ThreatAvoidance.ts` — Point-in-polygon tests, Valhalla
  exclude_polygons conversion
- `routing/WaypointInsertion.ts` — Corridor search for fuel/water stops, rank by
  detour distance
- `threats/{NWS,FEMA,USFS}Service.ts` — Threat data fetching and caching
- `threats/ThreatSync.ts` — TTL-based refresh pipeline for all threat sources
- `resources/{NREL,USGS,Shelter}Service.ts` — Resource data fetching with real
  API integration
- `resources/ResourceSync.ts` — TTL-based resource refresh pipeline
- `location/LocationTracker.ts` — GPS tracking with expo-location, foreground +
  background modes
- `crowd/CrowdSignal.ts` — Anonymous telemetry with rotating 24hr device token,
  battery-aware
- `alerts/AlertParser.ts` — Route-threat intersection alerting
- `map/StyleBuilder.ts` — MapLibre dark style generation for offline PMTiles
- `AppBootstrap.ts` — Full initialization sequence on app launch
- `SettingsPersistence.ts` — Auto-persist Zustand settings to SQLite
- `CrashReporting.ts` — Sentry integration with privacy-preserving config

Database (`db/` directory):

- `database.ts` — SQLite init with WAL mode via expo-sqlite (mock fallback on
  web)
- `schema.ts` — 8 tables: regions, destinations, threats, resources, scenarios,
  contacts, preferences, downloads
- `queries/` — Type-safe query functions for each table

## UX Constraints

- Minimum 44pt touch targets (defined in `constants/theme.ts` as `touchTarget`)
- High contrast dark theme only — stress-state design for scared/sleep-deprived
  users
- Online/offline status indicator visible at all times
- "Advisory Only" badge visible during navigation
- Legal disclaimers on first launch with links to bundled privacy policy and ToS
  (`constants/legal.ts`)
- No dark patterns, no upsells during navigation
- Battery warning banner during navigation when < 20%
- Crowd signal auto-disables when battery < 20%

## Key Integration Flows

1. **Bootstrap**: Sentry init → SQLite init → load settings → load scenarios →
   check tiles → init Valhalla → load cached data → start settings persistence →
   check onboarding
2. **3-tap navigation**: FAB → Destination (scenarios/search/recents) → Route &
   Go → Route Preview → Go → NavigationController starts
3. **2-tap scenario**: Scenario chip on map → auto-calculate with preferences →
   Route Preview → Go
4. **NavigationController**: GPS tracking → maneuver advance → voice TTS →
   deviation detection → crowd signal → battery-aware GPS frequency
5. **Data sync** (`useDataSync`): Triggers on connectivity change, region
   change, or app foreground. TTL-based refresh for threats and resources.
6. **Smart routing**: `calculateSmartRoute()` — two-pass: base route with threat
   avoidance → find resource waypoints along corridor → recalculate with
   waypoints

## Data Sources (all free/open for MVP)

OSM + Valhalla (road network), NWS api.weather.gov (weather alerts), FEMA NFHL
(flood zones), USFS/NIFC (fire perimeters), NREL (fuel stations), USGS NWIS
(water sources), Red Cross / 211.org (shelters).

## Reviewing PRs

Whenever I ask to review a PR (pull request), use the `pr-review` skill.
