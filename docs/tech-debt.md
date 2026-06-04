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

- jscpd threshold is ratcheted to **1.5%** (current duplication: 1.44%, ~20
  clones; issue #1 targets 1%). Biggest contributors: onboarding step views,
  legal screens' shared layout, ResourceMarkers/ThreatOverlay layer blocks, and
  CORS/header handling duplicated across the three Cloudflare Workers (extract a
  shared worker util package). Lower the threshold as clones are removed.

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
