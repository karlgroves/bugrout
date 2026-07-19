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

5. **`expo-doctor` runs in CI** (`pnpm run doctor`, pinned as a devDependency of
   `apps/mobile`), giving the pipeline its first automated signal for SDK and
   native-module misalignment. Verified against the closed PRs: reinstalling
   `expo-sqlite@56.0.5`, `expo-haptics@56.0.3` or `react-native@0.86.0` makes it
   exit non-zero, where the previous gate reported green.

### Deliberate deviations from the SDK 54 pin

`expo-doctor` compares installed versions against the SDK's expected set, so any
intentional divergence must be recorded or the gate becomes noise:

- **`react-native-get-random-values` 2.0.0** (SDK 54 expects `~1.11.0`) —
  **kept**, listed in `expo.install.exclude`. v1.x resolves the native module
  through `NativeModules` (legacy bridge); v2.0.0 uses `TurboModuleRegistry`,
  which is the correct path for this app (`newArchEnabled: true`). Its
  `peerDependencies` declare `react-native: ">=0.81"`, satisfied by SDK 54's
  0.81.5. The SDK pin simply predates the release. This package backs
  `crypto.getRandomValues` for `uuid`, so it is on the critical path for every
  generated scenario, contact and route ID.
- **`@react-navigation/native`** was realigned from `^7.2.2` to Expo's `^7.1.8`.
  Both carets resolve to the same installed version, so this is a declaration
  change only.
- **Metro config** no longer replaces `watchFolders`/`nodeModulesPaths`. Expo's
  own config now discovers pnpm workspace packages, so the local overrides had
  become redundant — `nodeModulesPaths` was byte-identical to the default, and
  `watchFolders` now appends the monorepo root to Expo's list rather than
  discarding it.

## Consequences

**Accepted tradeoff:** Dependabot `ignore` conditions also suppress _security_
updates for the listed packages, which matters for a security-conscious project.
Detection is unaffected — `pnpm audit --prod`, OSV-Scanner, CodeQL, Semgrep and
OWASP Dependency-Check all still run and still fail the build on advisories in
these dependencies. What is suppressed is only the automatic PR, which for this
stack would not have been safely mergeable anyway. An advisory against an
Expo/RN package is therefore handled as a prompt to schedule the SDK upgrade, or
to pin the specific transitive dependency via a bounded `pnpm` override.

**Remaining gap:** `expo-doctor` closes the _alignment_ hole. A Metro
`bundle:check` (`expo export` for iOS and Android) was added alongside it and
closes the _module-graph_ hole — unresolvable imports and ESM/CJS mismatches are
resolution errors, not type errors, so `tsc` never sees them. Neither compiles
native code or launches the app, so the _boot_ hole is still open; a Detox smoke
test exists but runs as a non-gating workflow until it is proven stable. "Green
CI" currently means "the JavaScript type-checks, the unit tests pass, the
dependency set is SDK-aligned, and the bundle builds" — closer to, but still
not, "the app works." Tracked in issue #30.

`expo-doctor` also runs in CI only, not in the `check` script used by the
pre-push hook, because its React Native Directory check makes network calls and
would make pushing fail offline. Contributors can run `pnpm run doctor` (or
`pnpm run check:all`, which includes it) locally.

Once boot validation exists, the Dependabot ignore list is worth revisiting: its
main justification is the absence of an automated compatibility signal, and part
of that justification has now been removed.
