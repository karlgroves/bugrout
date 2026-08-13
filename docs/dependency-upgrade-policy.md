# Dependency upgrade policy

Dependency upgrades in this repository are **deliberate, batched,
human-initiated pull requests**. There is no automated updater.

`.github/dependabot.yml` was removed under the no-scheduled-Actions policy in
[`CLAUDE.md`](../CLAUDE.md) — Dependabot is a scheduled updater, and a weekly PR
stream is exactly the timer-triggered, attributable-to-nobody automation that
policy exists to eliminate. GitHub **security alerts** (Dependabot _alerts_, not
Dependabot _PRs_) are event-driven notifications and remain enabled.

This document exists because that config carried a great deal of hard-won
knowledge in its `ignore:` list — every entry traceable to a specific PR that
went green while being broken. Deleting the file without recording it would
invite someone to walk into the same traps. See also
[ADR 0007](adr/0007-dependency-update-policy.md).

## The core problem

**CI cannot detect an Expo SDK / native ABI mismatch.** Expo unimodules declare
`peerDependencies: { "expo": "*" }`, so the package manager stays silent, and
format / lint / typecheck / Jest only ever read JavaScript source. A PR that
swaps in a module compiled against a different SDK runtime goes green and fails
**on device**.

This is not hypothetical. PRs #19, #20, #22 and #25 all looked merge-ready:

| PR  | Change                         | CI       | Reality                               |
| --- | ------------------------------ | -------- | ------------------------------------- |
| #19 | `expo-network` 8.0.8 → 56.0.5  | ✅ green | SDK 56 module in an SDK 54 app        |
| #20 | `expo-sqlite` 16.0.10 → 56.0.5 | ✅ green | takes out the whole persistence layer |
| #22 | `expo-haptics` 15.0.8 → 56.0.3 | ✅ green | ditto                                 |
| #25 | `react-native` 0.81.5 → 0.86.0 | ❌ red   | caught **by luck**                    |

PR #25 failed only because RN 0.86 happened to remove
`StyleSheet.absoluteFillObject`, which this codebase uses in two files. A
coincidence, not a safety net.

Boot validation now exists — the Detox smoke suite in
`.github/workflows/e2e.yml` launches the app on an emulator — but it is not yet
a required check (issue #30), so the constraints below still stand on their own.

## Packages that must not be upgraded in isolation

### The Expo / React Native stack

**Do not bump individually:** `expo`, `expo-*`, `@expo/*`, `react-native`,
`react-native-*`, `@react-native/*`, `@react-native-community/*`, `react`,
`react-dom`, `react-test-renderer`, `@types/react`, `@types/react-dom`,
`jest-expo`, `@maplibre/maplibre-react-native`.

Every unimodule's native side is compiled against one SDK's runtime, and the
pinned set lives in `expo/bundledNativeModules.json`. React Native is also still
`0.x`, so a five-release jump (0.81 → 0.86) registers as a **minor** bump and
would land in a grouped update.

Upgrade the whole set together with `npx expo install --fix`, in a dedicated
SDK-upgrade PR validated against a real device build.

### `jest` — no major

Jest's major is dictated by `jest-expo`, which is SDK-locked. `jest-expo`
depends on the Jest 29 packages directly (`@jest/globals`, `jest-snapshot`,
`babel-jest`, `jest-environment-jsdom`, all `^29.2.1`), so a Jest 30 runner
calls into APIs the installed `jest-mock` does not have and every suite dies at
load with:

```text
this._moduleMocker.clearMocksOnScope is not a function
```

PR #34 hit exactly this: 14 suites, 102 tests, 0 running. `jest-expo` 55.x still
pins `^29.2.1`, so the SDK 54 → 55 upgrade does not unblock it — it needs
upstream Expo to migrate `jest-expo` to Jest 30 first. Patch and minor Jest
updates are fine.

### `typescript` — no major, no minor

The Expo SDK pins TypeScript too: SDK 54 expects `~5.9.2`, so expo-doctor's
"packages match versions required by installed Expo SDK" check fails on anything
at or above 5.10. PR #32 (6.0.3) passed lint, typecheck, test and bundle after
two tsconfig `types` additions, and still could not clear that gate without
adding `typescript` to `expo.install.exclude` — permanently silencing SDK drift
detection for the compiler in exchange for an early major with no benefit.

`~5.9.2` allows patch only. TypeScript rides along with the SDK upgrade via
`npx expo install --fix`.

### `@types/node` — no major

Its major tracks the Node major, and Node 22 is pinned in three places:
`.nvmrc`, `engines` (`>=22.0.0`), and route-tracker's Dockerfile
(`node:22-slim`). Types ahead of the runtime are **invisible to CI** —
`@types/node` 26 declares `node:ffi` and `node:quic`, both of which throw
`ERR_UNKNOWN_BUILTIN_MODULE` on Node 22. Importing one would typecheck, lint,
pass CI, and crash in production (PR #60).

22.x updates are fine. When the repo moves to a newer Node, `@types/node` moves
in that same PR, where runtime and types change together.

### Unbounded `pnpm` overrides

PR #28 was a near-miss of the same shape: an unbounded override resolved `uuid`
to a version that breaks `require('uuid')` in the Expo iOS prebuild path. It
passed `pnpm audit` and the full check suite, and was caught only by
hand-reading the lockfile. Bound every override to a range.

## What runs in CI instead

| Check                                  | Where          | Gating                     |
| -------------------------------------- | -------------- | -------------------------- |
| `pnpm audit --prod --audit-level=high` | `ci.yml`       | yes                        |
| `expo-doctor` (SDK alignment)          | `ci.yml`       | yes                        |
| `bundle:check` (Metro, iOS + Android)  | `ci.yml`       | yes                        |
| Semgrep (OWASP Top 10)                 | `security.yml` | yes — now runs on PRs      |
| OSV-Scanner                            | `security.yml` | yes — now runs on PRs      |
| OWASP Dependency-Check                 | `security.yml` | yes, when manifests change |
| License compliance                     | `ci.yml`       | yes                        |
| Detox smoke (does the app boot?)       | `e2e.yml`      | no — see issue #30         |

`expo-doctor` and `bundle:check` are the two that specifically target the
failure class above, and both are already gating.
