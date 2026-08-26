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

| Check                                  | Where          | Gating                |
| -------------------------------------- | -------------- | --------------------- |
| `pnpm audit --prod --audit-level=high` | `ci.yml`       | yes                   |
| `expo-doctor` (SDK alignment)          | `ci.yml`       | yes                   |
| `bundle:check` (Metro, iOS + Android)  | `ci.yml`       | yes                   |
| Semgrep (OWASP Top 10)                 | `security.yml` | yes — now runs on PRs |
| OSV-Scanner                            | `security.yml` | yes — now runs on PRs |
| License compliance                     | `ci.yml`       | yes                   |
| Detox smoke (does the app boot?)       | `e2e.yml`      | no — see issue #30    |

`expo-doctor` and `bundle:check` are the two that specifically target the
failure class above, and both are already gating.

## GitHub Actions are pinned to commit SHAs

Every `uses:` across the seven workflows is pinned to a full 40-character commit
SHA, with the human-readable version in a trailing comment:

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

A tag is mutable. Whoever controls the action's repository can repoint `v7` at
any commit at any time, and every workflow here would pick it up on the next run
with no diff, no review and no notification. A SHA cannot move.

This is the same reasoning that governs everything above: the resolved artifact
is what gets reviewed, not a range that resolves to something else later.

### Updating a pinned action

There is no automated updater — that is the intended consequence, consistent
with the manual-upgrade posture the rest of this document describes. To move an
action forward:

1. Resolve the tag you want to its commit SHA:

   ```bash
   gh api repos/actions/checkout/commits/v7 --jq .sha
   ```

2. Confirm the SHA belongs to the tag you think it does, rather than trusting
   the tag alone:

   ```bash
   git ls-remote --tags https://github.com/actions/checkout | grep <sha>
   ```

3. Replace the SHA **and** the trailing version comment together. A comment that
   disagrees with its SHA is worse than no comment, because the next reader will
   believe it.

4. Read the upstream release notes for anything between the old SHA and the new
   one. Pinning does not remove the need to know what changed; it removes the
   possibility of not noticing that anything did.

Do this in one pass across all workflows rather than trickling, so the pins stay
internally consistent.

## Pinned scanner binaries

`ci.yml` installs `gitleaks` by downloading a pinned release and verifying its
SHA-256 before running it. A pinned URL on its own still trusts whatever bytes
the CDN returns; the checksum is what makes the pin mean something.

Two values have to move together when bumping it:

```yaml
GITLEAKS_VERSION: 8.30.1
GITLEAKS_SHA256: 551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
```

To get the new checksum, download the asset and hash it — do not copy a value
from a release page you have not verified:

```bash
V=8.31.0
A="gitleaks_${V}_linux_x64.tar.gz"
curl -sSLf -O "https://github.com/gitleaks/gitleaks/releases/download/v${V}/${A}"
shasum -a 256 "$A"
```

This fails closed: bump the version without the checksum and
`sha256sum --check --strict` rejects the download before the binary runs. That
is the intended behaviour — a mismatch is either a stale edit or a substituted
artifact, and neither should proceed.

Keep the pinned version in step with whatever developers run locally, so a local
`pnpm run security:secrets` and the CI step cannot disagree about which rules
exist.

## Install-time hardening

Three settings in `pnpm-workspace.yaml`, plus one in `.npmrc`, constrain what
`pnpm install` is willing to resolve in the first place. They sit upstream of
everything else in this document: a version that never gets installed does not
need to be reviewed.

| Setting                     | Where                 | Effect                                           |
| --------------------------- | --------------------- | ------------------------------------------------ |
| `minimumReleaseAge: 10080`  | `pnpm-workspace.yaml` | Refuse versions published in the last 7 days     |
| `trustPolicy: no-downgrade` | `pnpm-workspace.yaml` | A dependency cannot relax these settings         |
| `blockExoticSubdeps: true`  | `pnpm-workspace.yaml` | Sub-dependencies must come from the registry     |
| `min-release-age=7`         | `.npmrc`              | The same quarantine for a stray `npm` invocation |

`pnpm.onlyBuiltDependencies` in `package.json` is unchanged — `esbuild`,
`sharp`, `workerd` — and remains the build-script allowlist. `trustPolicy` is
the complementary control: the allowlist says which packages may run scripts,
the trust policy stops a package from changing that answer.

### These require a pnpm that understands them

`packageManager` is pinned to **pnpm 10.34.5** for this reason and no other. On
the previously pinned 10.11.0 every key above parses without complaint and does
nothing at all, which is worse than not setting them — it reads as protection in
a diff while providing none.

| Setting              | Minimum pnpm |
| -------------------- | ------------ |
| `minimumReleaseAge`  | 10.16.0      |
| `trustPolicy`        | 10.21.0      |
| `blockExoticSubdeps` | 10.26.0      |

`min-release-age` in `.npmrc` needs npm 11.10; older npm ignores it. It is set
regardless, because it costs nothing and takes effect when the toolchain catches
up.

### Effect on CI

None. `minimumReleaseAge` filters _resolution_, and
`pnpm install --frozen-lockfile` does not resolve — every version is already
pinned. Verified against a clean `node_modules`: the install succeeds and the
lockfile is byte-identical afterwards.

### When the quarantine gets in the way

Occasionally a fix you need is newer than seven days, usually the day an
advisory lands. Take it deliberately rather than by weakening the setting:

```bash
pnpm install --minimum-release-age 0
```

That is one command, in one shell, visible in the transcript — as opposed to
editing `pnpm-workspace.yaml`, which silently lowers the floor for everybody and
tends not to get put back.
