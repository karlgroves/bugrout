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

It had already happened again, silently, and stayed that way until #126 swept
the file. Three of the 23 overrides had no upper bound, and one of them had
drifted across a major exactly as #28 predicted:

```json
"@tootallnate/once@2.0.0": ">=2.0.1"
```

`http-proxy-agent@5.0.0` declares `"@tootallnate/once": "2"`. The unbounded
replacement resolved it to **3.0.1** — a different major than its only consumer
asks for. Bounding it to `>=2.0.1 <3` moved it back to 2.0.1, which is both
inside the consumer's range and still patched: GHSA-vpq2-c234-7xj6 has separate
fix lines per major, at 2.0.1 and 3.0.1.

The uncomfortable part is that this path is not obscure. `jsdom` — the Jest
environment — loads `http-proxy-agent` eagerly, which pulls `@tootallnate/once`,
so **every one of the 34 suites loaded the wrong major on every run** and stayed
green. Loading succeeds under both, and nothing asserts on the behaviour that
differs. An exercised code path is not a tested one, and a green suite is not
evidence that a resolved version is the intended one.

The lesson is narrower than "add a bound": an unbounded override is invisible
once it drifts, because the resolved version only appears in the lockfile. Diff
the resolved versions, not just the manifest, whenever an override changes. All
23 are bounded as of #126.

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

### `trustPolicy` exempts one verified false positive

`semver@6.3.1` trips `trustPolicy: no-downgrade`, and it is a false positive.
The evidence is on the registry — `trustPolicy` compares publish _dates_ across
the whole package, ignoring release lines:

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

It is pinned in `pnpm-workspace.yaml`:

```yaml
trustPolicyExclude:
  - semver@6.3.1
```

**The exemption is one name at one version, and that was verified rather than
assumed.** Pointing the entry at `semver@6.3.0` and forcing a resolve makes the
install fail again on `6.3.1` — so `trustPolicy` stays fully in force for every
other package, and a genuine downgrade anywhere else still fails.

#### Why this replaced the per-install flag

PR #120 chose the visible-per-install form instead:

```bash
pnpm install --trust-policy-exclude "semver@6.3.1"
```

The reasoning was that the exemption stays attached to the install that needs
it, where a reviewer sees it. That held until the friction was measured: #126
and its three predecessors needed the flag on **eight** separate installs in a
single afternoon, because thirteen packages depend on `semver@6.3.1` and most of
them are the Babel toolchain this app is built on. The flag was not an
occasional exception, it was a precondition of every dependency change — and one
that fails closed for anyone who does not know to type it, including future
automation.

A per-install flag that is always required is not more visible than a config
entry; it is just less reliable. The standing entry above is narrower than it
looks — one pinned version, with a written retirement condition — and it is in a
file that is reviewed.

**Do not read the error's package as the cause** if it ever fires again. It
names `eslint-plugin-import` only because that is where resolution reached
`semver@6.3.1` first:

```console
$ awk '/^  [^ ]/{pkg=$0} /semver: 6\.3\.1/{print pkg}' pnpm-lock.yaml
  '@babel/core@7.29.7':
  '@babel/helper-compilation-targets@7.28.6':
  '@babel/helper-compilation-targets@7.29.7':
  '@babel/helper-create-class-features-plugin@7.28.6(@babel/core@7.29.7)':
  ... 9 more, incl. eslint-plugin-react, istanbul-lib-instrument
```

Retire the entry when npm backfills provenance onto `semver@6.3.1`, or when the
Babel chain stops depending on `semver` 6. The signal is concrete: delete the
two lines, force a resolve, and see whether it still fails.

## One known-vulnerable transitive package

An advisory gets an ignore entry only when this repository cannot reach the fix.
That is two distinct situations, and the entry has to say which one it is,
because they retire on different signals:

1. **No fixed version is published** — `image-size`, below. Retires when
   upstream ships a fix.
2. **A fixed version exists but is structurally unreachable** — pinning it
   breaks the consumer that pulls the package in, no upstream bump gets there,
   and no patch bridges the gap. Retires when the _consumer_ changes, not when
   the vulnerable package does.

**Nothing is currently in case 2.** `decode-uri-component` was recorded there by
PR #120, on the grounds that `0.5.0` is ESM-only and its only consumer
`query-string@7.1.3` is CommonJS. Both of those facts hold. The conclusion did
not: PR #124 closed the advisory with a two-line `pnpm` patch that unwraps the
interop, described under
[One patched transitive package](#one-patched-transitive-package).

The lesson is in the bar, not the entry. "Structurally unreachable" now requires
showing that a patch cannot bridge the gap either — the two cases above are
about fixes this repository genuinely cannot reach, and a patched dependency is
within reach.

Anything else gets a bounded `pnpm.overrides` entry instead.

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

## One patched transitive package

`query-string@7.1.3` carries a two-line patch in `patches/`, applied through
`pnpm.patchedDependencies`. It exists to close `GHSA-vcc3-ghjq-m6fr` — denial of
service via exponential decoding of malformed percent-encoded input in
`decode-uri-component`.

Unlike the `image-size` advisories above, this one is **reachable in the shipped
app**. The chain is:

```text
decode-uri-component
  └── query-string@7.1.3
        ├── expo-router
        └── @react-navigation/core
```

Both use it for deep-link and route-parameter parsing, and `query-string` is
present in the production Metro bundle (verified by exporting an unminified
bundle and reading it). A crafted deep link is attacker-supplied input on a path
that ships. Measured on the unpatched tree, an 800-character malformed value
cost **8.6 seconds** of CPU in a single decode, and 2000 characters cost **over
a minute** (63–76 s across runs). Patched, that same 2000-character input costs
1–2 ms.

`security/tests/deep-link-decoding.security.test.ts` pins all of this, and both
controls below were mutation-tested against it.

### Why a patch and not just an override

`decode-uri-component@0.5.0` is the first patched release, and every earlier
version is vulnerable (`<= 0.4.2`). The override that pins it is bounded, per
the rule above:

```json
"decode-uri-component@<0.5.0": ">=0.5.0 <1"
```

That alone is not enough. `0.5.0` is **ESM-only**, while `query-string@7.1.3` is
CommonJS and `require`s it — so the require yields the module namespace rather
than the function, and `decodeComponent is not a function` is thrown on the
first deep link. This reproduces under both Node and Metro; the bundle shows
Metro taking the `.default` branch, so the shim is load-bearing there, not only
in tests.

Nor can the version be lifted out of the problem. `query-string` first depends
on a patched `decode-uri-component` at `9.5.0`, but `@react-navigation/core`
(through `7.21.13`) and `expo-router@6.0.24` all pin `^7.1.3`, and the 9.x line
is itself ESM-only with a changed API. There is no upgrade path today.

So the patch does the narrowest possible thing — unwrap the interop, tolerating
both module shapes:

```js
const decodeComponentModule = require("decode-uri-component");
const decodeComponent = decodeComponentModule.default || decodeComponentModule;
```

### Retirement

The patch comes out when `@react-navigation/core` and `expo-router` move to
`query-string@>=9.5.0`, which depends on a patched `decode-uri-component`
directly. At that point both the patch and the override can be deleted together.

This cannot rot unnoticed. The `patchedDependencies` key pins an exact version,
so if a future resolution moves `query-string` off `7.1.3` the install fails
with `ERR_PNPM_UNUSED_PATCH` rather than quietly dropping the patch — verified
by pointing the key at a version not in the tree. A stale patch is therefore a
loud error, not a silent reintroduction of the advisory.
