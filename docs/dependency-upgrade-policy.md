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
| Trivy filesystem scan                  | `security.yml` | yes                   |
| Hadolint (both Dockerfiles)            | `security.yml` | yes                   |
| Checkov + `trivy config` (IaC)         | `security.yml` | yes                   |
| `trivy image` (route-tracker)          | deploy         | yes — blocks the ship |

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

### `trustPolicy` currently blocks every lockfile regeneration

`pnpm install` fails on this repository today, before it reaches anything you
changed:

```text
ERR_PNPM_TRUST_DOWNGRADE  High-risk trust downgrade for "semver@6.3.1"
This error happened while installing the dependencies of eslint-plugin-import@2.32.0
```

**It is a false positive, and the evidence is on the registry.** `trustPolicy`
compares publish _dates_ across the whole package, ignoring release lines:

| version | published        | provenance attestation |
| ------- | ---------------- | ---------------------- |
| 7.5.1   | 2023-05-12       | yes                    |
| 7.5.4   | 2023-07-07       | yes                    |
| 5.7.2   | 2023-07-10 19:57 | **no**                 |
| 6.3.1   | 2023-07-10 22:38 | **no**                 |

`5.7.2` and `6.3.1` are the CVE-2022-25883 backports to the old majors,
published from a release path that predates provenance. Because they are dated
_after_ the 7.5.x line that had it, pnpm reads them as trust going backwards.
Both are npm-signed; neither is a takeover.

This does **not** affect CI or any `--frozen-lockfile` install — those resolve
nothing, so the check never runs. It fires only when the lockfile is
regenerated, which is to say on every dependency change. Take it the same way as
the quarantine above, one visible command at a time:

```bash
pnpm install --trust-policy-exclude "semver@6.3.1"
```

The standing alternatives — `trustPolicyExclude` or `trustPolicyIgnoreAfter` in
`pnpm-workspace.yaml` — were both considered and not taken. The flag keeps the
exemption attached to the one install that needs it, where a reviewer sees it in
the diff or the transcript, rather than leaving a hole open for everybody
between now and whenever someone remembers to close it.

**Do not read the error's package as the cause.** It names
`eslint-plugin-import@2.32.0` because that is merely where resolution reached
`semver@6.3.1` first. Thirteen packages depend on that version, and most of them
are the Babel toolchain this app is built on:

```console
$ awk '/^  [^ ]/{pkg=$0} /semver: 6\.3\.1/{print pkg}' pnpm-lock.yaml
  '@babel/core@7.29.7':
  '@babel/helper-compilation-targets@7.28.6':
  '@babel/helper-compilation-targets@7.29.7':
  '@babel/helper-create-class-features-plugin@7.28.6(@babel/core@7.29.7)':
  ... 9 more, incl. eslint-plugin-react, istanbul-lib-instrument
```

So this is structural, not one stray dev dependency: the flag will be needed on
every lockfile regeneration until npm backfills provenance onto `semver@6.3.1`
or the Babel chain stops depending on `semver` 6. Neither is close. Treating it
as nearly-obsolete would be wrong.

That is an argument for revisiting `trustPolicyExclude` /
`trustPolicyIgnoreAfter` in `pnpm-workspace.yaml`, not against it — the standing
alternatives were considered and set aside for now on the grounds above, and the
choice is worth reopening if the friction outweighs keeping the exemption
visible per-install. Re-check whenever this section is next touched.

## Three known-vulnerable transitive packages

An advisory gets an ignore entry only when this repository cannot reach the fix.
That is two distinct situations, and the entry has to say which one it is,
because they retire on different signals:

1. **No fixed version is published** — `image-size`, below. Retires when
   upstream ships a fix.
2. **A fixed version exists but is structurally unreachable** — pinning it
   breaks the consumer that pulls the package in, and no upstream bump gets
   there either. `decode-uri-component`, below. Retires when the _consumer_
   changes, not when the vulnerable package does.

Anything else gets a bounded `pnpm.overrides` entry instead.

### `decode-uri-component` — the fix is published and cannot be installed

`GHSA-vcc3-ghjq-m6fr` (MODERATE, CVE pending) is a denial of service: malformed
percent-encoded input decodes in exponential time. It is fixed in
`decode-uri-component@0.5.0` and in no earlier release — the advisory range is
`<0.5.0`.

That fix cannot be taken. 0.5.0 is pure ESM — `"type": "module"`, one
`export default`, and an `exports` map with no `require` condition. Its only
consumer here is `query-string@7.1.3`, which is CommonJS and reads it as
`const decodeComponent = require('decode-uri-component')` at `index.js:3`.
Forcing 0.5.0 under that consumer resolves and bundles cleanly, then fails when
called:

```console
$ node -e "const d = require('decode-uri-component'); d('%C3%A5')"
TypeError: d is not a function
```

`require()` of an ES module yields `{ __esModule, default }`, not the function.

**Nothing in the gate catches this, and that was measured rather than assumed.**
With the override actually applied, on this branch:

| Gate                    | Result with the broken override in place  |
| ----------------------- | ----------------------------------------- |
| `pnpm run check`        | ✅ exit 0 — 33 suites, 250 tests          |
| `pnpm run bundle:check` | ✅ exit 0 — iOS + Android bundles emitted |
| `pnpm run security:osv` | ✅ exit 0 — the advisory is "resolved"    |

The broken module is not merely undetected, it is **shipped**: the iOS Hermes
bundle contains `decode-uri-component@0.5.0`'s own error string
(``Expected `encodedURI` to be of type``) alongside `query-string`'s internals.

Note this does not contradict [ADR 0007](adr/0007-dependency-update-policy.md),
which credits `bundle:check` with closing the module-graph hole. It closes it
for _resolution_ errors — unresolvable imports, missing files. This is a
resolution **success** whose returned value has the wrong shape, so there is
nothing for the bundler to object to. Same family as the `uuid` 14 near-miss in
ADR 0007 §4, which is why overrides are bounded in the first place.

No upstream bump reaches a fix either:

- `@react-navigation/core@7.21.13` — the latest, against 7.21.11 installed —
  still depends on `query-string: ^7.1.3`.
- `query-string` 8.x through 9.3.x still depend on
  `decode-uri-component: ^0.4.1`, inside the affected range.
- `query-string@9.5.1` does move to `^0.5.0`, but it is ESM-only itself and
  React Navigation does not use it.

**Exposure.** Availability only — the advisory states there is no memory
corruption, disclosure or RCE, and the CVSS 4.0 vector agrees
(`VC:N/VI:N/VA:H`). It is reached through React Navigation's URL parsing, so an
attacker needs the device to open a `bugrout://` link carrying a pathological
percent-encoded path. The custom scheme is the entire surface: no universal
links and no Android intent filters are configured. Worst case is the app
pegging a core and going unresponsive, recoverable by force-quitting.

It is recorded in `osv-scanner.toml` and deliberately **not** in
`pnpm.auditConfig.ignoreGhsas`. `security:audit` runs at `--audit-level=high`
and this is MODERATE, so pnpm never gates on it; adding it there would delete it
from the audit report without changing any gate.

Retire it when `@react-navigation/core` drops `query-string@7`, or when
`query-string` ships a CJS-compatible release built on `decode-uri-component`
0.5.0.

### `image-size` — no fixed version exists

`pnpm audit --prod` reports two HIGH advisories and both are ignored via
`pnpm.auditConfig.ignoreGhsas` in `package.json`. That list previously held two
opaque identifiers and no reason, which is the kind of entry nobody can safely
remove later. For the record:

| GHSA                  | CVE            | Package            |
| --------------------- | -------------- | ------------------ |
| `GHSA-w3rx-r6r6-pgpr` | CVE-2025-71330 | `image-size@1.2.1` |
| `GHSA-5p2g-fcmc-qvqq` | CVE-2025-71329 | `image-size@1.2.1` |

Both are denial-of-service via crafted image buffers, in the ICNS and JXL/HEIF
parsers. `image-size` reaches the tree only through `metro` — the bundler — via
`@expo/vector-icons → expo-font → expo → @expo/cli`. It runs at build time on
images in this repository, never in the shipped app and never on input from a
user. **There is no fixed version published.**

`trivy fs` reports the same two, which is why the gating command passes
`--ignore-unfixed`: a finding with no fix available cannot be acted on, and a
gate that fails on it teaches people to stop reading the gate. The non-gating
`security:fs:report` run records them at full severity in the build artifact, so
they are ignored in one specific sense — not blocking a merge — and not in any
other.

Both entries come out the moment `image-size` publishes a fix and Metro takes
it. `--ignore-unfixed` makes that automatic: CI goes red on its own.

### Retiring an ignore

`osv-scanner` prints an `unused ignores` warning once an advisory is no longer
in the tree. That warning is the signal to delete the block — not to leave it in
place as insurance. It is how the `uuid@7.0.3` entry (`GHSA-w5hq-g745-h8pq`) was
found to be dead: the bounded `uuid@<11.1.1` override had already moved
`xcode@3.0.1` onto `uuid@11.1.1`, so the ignore was suppressing a finding that
no longer existed.
