# Tech debt ledger

Pre-existing violations grandfathered during the tooling adoption (issues 1 and
2), each carrying a file-level `eslint-disable` with a `--` justification. New
code gets no exemptions. Remove the disable when the item is resolved.

## Oversized / complex screens (`max-lines`, `max-lines-per-function`, `complexity`)

| File                                       | Rules disabled                                | Work needed                                                                      |
| ------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/mobile/app/(tabs)/index.tsx`         | max-lines-per-function, complexity            | Decompose map screen (conditional overlays into components)                      |
| `apps/mobile/app/(tabs)/scenarios.tsx`     | max-lines-per-function                        | Extract empty-state + list rendering                                             |
| `apps/mobile/app/_layout.tsx`              | max-lines-per-function                        | Extract Stack.Screen declarations                                                |
| `apps/mobile/app/contacts/index.tsx`       | max-lines-per-function                        | Split list + add-contact form                                                    |
| `apps/mobile/app/destination/index.tsx`    | max-lines, max-lines-per-function, complexity | Decompose destination picker (search / scenarios / recents sections) — 622 lines |
| `apps/mobile/app/downloads/index.tsx`      | max-lines, max-lines-per-function, complexity | Split list header + multi-type row rendering                                     |
| `apps/mobile/app/navigation/[routeId].tsx` | max-lines-per-function, complexity            | Extract reroute + emergency-SMS orchestration                                    |
| `apps/mobile/app/onboarding/index.tsx`     | max-lines-per-function                        | One component per onboarding step                                                |
| `apps/mobile/app/route-preview/index.tsx`  | max-lines-per-function                        | Extract summary / warnings / actions                                             |
| `apps/mobile/app/scenarios/edit.tsx`       | max-lines-per-function, complexity            | Extract form fields + validation                                                 |

## Large declarative render/data functions (`max-lines-per-function`)

| File                                                 | Notes                              |
| ---------------------------------------------------- | ---------------------------------- |
| `apps/mobile/components/map/BugroutMap.tsx`          | Single declarative JSX tree        |
| `apps/mobile/components/map/ResourceMarkers.tsx`     | Marker rendering per resource type |
| `apps/mobile/components/map/ThreatOverlay.tsx`       | Layer styling per threat type      |
| `apps/mobile/components/navigation/ManeuverIcon.tsx` | Icon mapping switch                |
| `apps/mobile/services/MockDemoData.ts`               | Inline fixtures                    |
| `apps/mobile/services/map/StyleBuilder.ts`           | Declarative MapLibre style JSON    |
| `apps/mobile/hooks/useRoute.ts`                      | Bundled memoized route actions     |
| `apps/mobile/app.config.ts`                          | Single Expo config object          |

## Algorithmic complexity (`complexity`, `sonarjs/cognitive-complexity`)

| File                                                      | Notes                                                                         |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/mobile/services/valhalla/ValhallaModule.ts`         | `max-lines`: dual-approach bridge (native + HTTP + mock) — split per approach |
| `apps/mobile/services/navigation/NavigationController.ts` | Voice-announcement distance/interval rules                                    |
| `apps/mobile/services/alerts/AlertParser.ts`              | Geometric intersection tests                                                  |
| `apps/mobile/services/resources/USGSService.ts`           | RDB (tab-delimited) parser                                                    |
| `apps/mobile/services/routing/RouteEngine.ts`             | Two-pass smart routing                                                        |
| `apps/mobile/services/threats/ThreatSync.ts`              | Per-source TTL/connectivity branching                                         |
| `apps/mobile/__tests__/packages/elf-model.test.ts`        | Inlined weight-table scoring                                                  |

## Other

- jscpd threshold is at **0.75%**, ratcheted below issue #1's 1% target once the
  extractions below cleared enough room. Current duplication: 0.25%, 6 clones.
  Headroom is ~0.51pp, and at ~18.3k analysed lines a new 10-line clone costs
  ~0.11pp, so the gate now tolerates roughly four before it fires. **The
  threshold could drop to 0.5** on that basis (leaving ~0.25pp, about two
  clones); below that the slack goes under ~0.2pp and the gate starts firing on
  changes unrelated to any quality regression.

  What remains is mostly not worth chasing, and the ratchet should stop rather
  than force bad extractions:
  - `destination/index.tsx` self-duplication (2 × 10 lines) — three
    near-identical list-row renderers (search results, scenarios, recents).
    Genuine, but the file is already the largest screen in the tree at 622 lines
    and is queued above for decomposition; fold this into that work rather than
    doing it twice.
  - `LocationTracker.ts` self-duplication (10 lines) — foreground and background
    watcher setup. Worth extracting when either grows.
  - `RouteEngine` / `WaypointInsertion` (8 lines) — corridor-distance maths.
    Small enough that a shared helper may cost more indirection than it saves.
  - `README.md` / `spec.md` and `tech-debt.md` self-overlap — prose. Excluding
    markdown needs an `ignore` entry, since the `format` allowlist in
    `.jscpd.json` has never been honoured by jscpd (v4 or v5).

  Note the percentage is only comparable within a jscpd major — v5 analyses a
  smaller file set than v4, so the same source measures ~27% higher. The 0.25%
  above is on jscpd 5. The threshold went 2.0 (while the v5 upgrade landed ahead
  of this cleanup) → 1.5 → 1.0 → 0.75 as the extractions below removed clones.

  Already extracted:
  - CORS/security-header handling and the per-request worker preamble
    (`initWorkerRequest`), formerly duplicated across the three Cloudflare
    Workers → `@bugrout/worker-utils`.
  - `pointInPolygon` and `extractRingCoordinates`, formerly duplicated across
    `AlertParser`, `ThreatAvoidance` and `NWSService` →
    `apps/mobile/utils/geo.ts`.
  - `FeatureRow`, formerly duplicated between the onboarding walkthrough and the
    download guide → `components/common/FeatureRow.tsx`; the shared primary-CTA
    and skip button surfaces → `buttons` in `constants/theme.ts`.
  - The privacy-policy and terms-of-service screens, formerly byte-identical
    apart from which constant they render →
    `components/common/LegalDocument.tsx`.
  - The bottom-sheet detail card (modal, backdrop, card and close button,
    including its 44pt touch target), formerly duplicated between
    `ThreatOverlay` and `ResourceMarkers` → `components/map/MapDetailSheet.tsx`.
  - The drifting mock GPS track, formerly duplicated between the web branch and
    the Expo Go fallback of `platform/location.ts` → a `watchMockPosition`
    helper in the same file, now covered by tests.
  - The `downloaded_regions` row shape and its row→domain mapper, formerly
    written twice in `db/queries/regions.ts` → a `DownloadedRegionRow` type and
    `toDownloadedRegion` in the same file.
  - The dashed-outline "add another" button shared by the scenarios and
    emergency-contacts lists → `buttons.addOutline` in `constants/theme.ts`.
  - The online/offline indicator's placement, shared by the map and navigation
    screens → `statusIndicator` in `constants/theme.ts`.

- `security/detect-object-injection`: ~40 **warnings** (rule is warn-level by
  design, per issue #1). Mostly validated dynamic-key access. Review
  case-by-case; consider `Map`s where keys are user-influenced.
- Detox is not a declared devDependency; `e2e/` lint disables
  `import-x/no-unresolved`. Decide whether to vendor detox in `apps/mobile`
  devDependencies or keep it runner-provided.
- `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are fully on — no
  ratchet was needed.
- `osv-scanner.toml` ignores GHSA-w5hq-g745-h8pq (uuid@7 inside `xcode@3.0.1`,
  Expo prebuild tooling, dev-time only). Drop the ignore when
  `@expo/config-plugins` updates its `xcode` dependency.
- pnpm `overrides` pin patched `@xmldom/xmldom`, `fast-uri`, and `ws` over
  Expo's transitive ranges — remove each override once the upstream range
  includes the patched version.
