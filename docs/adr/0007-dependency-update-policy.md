# ADR 0007: Dependency update policy for the Expo/React Native stack

- Status: Accepted
- Date: 2026-07-19
- Context: Issue #1 (tooling baseline); Dependabot PRs #19, #20, #22, #25

## Context

Dependabot opened four PRs that looked mergeable and were not:

- **#19, #20, #22** bumped `expo-network`, `expo-sqlite` and `expo-haptics` from
  their SDK 54 versions (`~8.0.8`, `~16.0.10`, `~15.0.8`) to `56.x` — the Expo
  **SDK 56** builds of those unimodules, against an app pinned to
  `expo: ~54.0.33`.
- **#25**, grouped as `minor-and-patch`, carried `react-native` 0.81.5 → 0.86.0
  plus matching React, Reanimated, worklets, screens and safe-area-context
  bumps.

Two properties of this stack make these indistinguishable from safe bumps
without manual inspection:

1. **Expo unimodules are SDK-locked, but declare
   `peerDependencies: {"expo": "*"}`.** The native side is compiled against one
   SDK's runtime, and the pinned set lives in `expo/bundledNativeModules.json`.
   Because the peer range is unbounded, pnpm raises no warning.
2. **React Native is `0.x`, so five releases register as a "minor" bump** and
   land in the grouped minor-and-patch PR alongside genuinely safe tooling.

Critically, **CI cannot catch either case.** The gate runs format, lint,
typecheck and Jest — none of which touch native code. #19, #20 and #22 all
reported green. #25 happened to fail typecheck only because RN 0.86 removed
`StyleSheet.absoluteFillObject`; had that API survived, it too would have been
green while shipping an unvalidated RN major.

For an offline-first evacuation app the cost of getting this wrong is
asymmetric: the failure surfaces as a native crash on-device, there is no
server-side kill switch once a build ships, and the user is by definition in an
emergency.

## Decision

1. **Expo-, React- and React-Native-scoped packages are ignored in
   `.github/dependabot.yml`.** Covers `expo`, `expo-*`, `@expo/*`,
   `react-native`, `react-native-*`, `@react-native/*`,
   `@react-native-community/*`, `react`, `react-dom`, `react-test-renderer`,
   their `@types`, `jest-expo`, and `@maplibre/maplibre-react-native`.

2. **That stack is upgraded only via `npx expo install --fix`**, in a dedicated
   SDK-upgrade PR that moves the whole set together and is validated against a
   real device or EAS build — not by CI alone.

3. **The `minor-and-patch` group becomes what its name claims:** dev tooling and
   non-native libraries, safe to merge on a green check.

4. **Transitive advisories are resolved with version-range-keyed `pnpm`
   overrides, upper-bounded to the current major** (see ADR context in
   `package.json`). Unbounded replacement ranges resolve to the newest
   satisfying version and silently cross majors — observed in practice pulling
   `js-yaml` to 4.x (drops `safeLoad`), `uuid` to 14 (ESM-only, breaks
   `require('uuid')`), and `ws` to 8.x.

## Consequences

**Accepted tradeoff:** Dependabot `ignore` conditions also suppress _security_
updates for the listed packages, which matters for a security-conscious project.
Detection is unaffected — `pnpm audit --prod`, OSV-Scanner, CodeQL, Semgrep and
OWASP Dependency-Check all still run and still fail the build on advisories in
these dependencies. What is suppressed is only the automatic PR, which for this
stack would not have been safely mergeable anyway. An advisory against an
Expo/RN package is therefore handled as a prompt to schedule the SDK upgrade, or
to pin the specific transitive dependency via a bounded `pnpm` override.

**Known gap:** nothing in CI currently validates that the app boots. Until an
EAS build or Detox run on a simulator is part of the pipeline, "green CI" means
"the JavaScript type-checks and the unit tests pass" and must not be read as
"the app works." This is the reason the policy above is conservative.
