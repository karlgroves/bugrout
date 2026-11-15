# Security automation

How the security checks in this repository are run, read and changed.

Required by §22 of
[`secure-project-baseline`](https://github.com/karlgroves/secure-project-baseline).

## How to run local checks

Install the scanners once:

```bash
bash scripts/bootstrap.sh
```

Then:

```bash
pnpm run security          # audit, OSV, secrets, tests, Trivy fs, IaC
pnpm run security:semgrep  # SAST
pnpm run security:tests    # the security/tests/ regression suite
pnpm run check:all         # everything, including the above
```

`pnpm run security:tests` is **not** part of `pnpm run check`, so neither
`check` nor the pre-push hook (which runs `check`, `dupes`, `lint:actions`,
`security:secrets`, `license:check`) ever runs it. It reaches a local shell only
through `pnpm run security` — and so `pnpm run check:all` — and reaches CI
through the `regression` job in `.github/workflows/security.yml`, on every pull
request to and push to `main` or `develop`. A green pre-push therefore says
nothing about this suite.

Every one of these runs the same command CI runs. That is deliberate and it is
enforced structurally rather than by convention: the Semgrep ruleset lives in
`security/config/semgrep.yml` and both the npm script and the workflow invoke
`security/scripts/semgrep.mjs`, so the two cannot drift apart. To see the exact
command that will run:

```bash
node security/scripts/semgrep.mjs --print
```

### Header checks against a running target

**Moved.** `check-headers.js` and every HTTP surface it checked went to
[AFixt/bugrout-server](https://github.com/AFixt/bugrout-server) on 2026-11-15.
Nothing in this repository serves a response, so there is no running target here
and no deployed origin to check. The script, its exit codes and the `headers`
threshold section are documented in that repository's copy of this file.

## How to update the secrets baseline

There is no baseline file. `pnpm run security:secrets` scans full history and
currently reports nothing, so a baseline would only be a place for findings to
hide.

If it reports a finding:

1. **Assume it is real.** Rotate the credential first, then investigate. A
   leaked key is not made safe by concluding it was a test value.
2. If it is genuinely not a secret, add a narrowly-scoped `trufflehog:ignore`
   comment on the offending line, with a reason. Verified to work: a line
   carrying that comment is not reported. Do not exclude a path or disable a
   detector — that suppresses the pattern everywhere, including where it
   matters.
3. A confirmed secret **may not be excepted**. See `security-exceptions.md`.

The scan prints the detector, the file and a hash, never the credential.
TruffleHog itself has no `--redact`, so `security/scripts/trufflehog.mjs` reads
its JSON and withholds the value — a world-readable CI log on a public repo is
the last place a leaked key should be reproduced.

## How to audit suspected secrets

```bash
pnpm run security:secrets                # full history, values withheld
node security/scripts/trufflehog.mjs --print   # the exact underlying command
git log -S '<fragment>' --oneline        # when did it enter?
git log --all --full-history -- <path>   # is it still reachable on any branch?
```

Remember that removing a secret in a later commit does not remove it from
history, and this repository is public. Rotation is the remediation; history
rewriting is optional cleanup afterwards.

## How to add an exception

See `security-exceptions.md` for the format and the rules. In short: edit
`security/config/exceptions.json`, give it an expiry no more than 90 days out,
and name an owner. The report generator lists expired exceptions in every run,
so a forgotten one becomes visible rather than permanent.

## How to configure the staging scan target

**Moved.** `dast.yml`, `zap-baseline.conf`, `zap-api.conf` and
`zap-exclusions.txt` went to
[AFixt/bugrout-server](https://github.com/AFixt/bugrout-server) with the worker
they scan. There is no deployed origin in this repository to point a scan at.

The one part that stays true here: the scan is not scheduled, and must not be —
see the CI policy in `CLAUDE.md`.

## How to add project-specific authorization tests

BugRout has no accounts, sessions or roles, so most of §10.2 does not apply.
What did apply was that a request without a valid credential must not reach
protected data — and there is no protected data here any more. The §10 files
(`auth`, `input-validation`, `headers`, and the `helpers.ts` fakes for R2, KV
and Redis) moved to
[AFixt/bugrout-server](https://github.com/AFixt/bugrout-server) on 2026-11-15.

What is left in `security/tests/` covers the app, the data pipeline and the
release workflows: the shipped asset budget, deep-link decoding, store URLs, the
Play service account, the secret-scanner wrapper, dead pnpm overrides, the tile
origin written in four places, and the workflows' supply-chain pinning.
`ls security/tests/` is the authoritative list. `pnpm run security:tests` prints
the file and test counts itself — no count is written down here, because every
doc in this directory that kept one had a stale one. `security-test-matrix.md`
maps WSTG categories to the files that cover them, and does not have a row for
every file here.

To add one, drive the real handler and assert the response. Do not assert on
source text — a test that greps for a function name passes when the function is
called and does nothing.

**Then verify the test fails without the control.** Comment out the check it
pins, run the suite, confirm it goes red, and put the check back. A test that
passes with the control removed pins nothing, and looks exactly like one that
does.

## How to interpret reports

`pnpm run security:report` writes `reports/security/security-summary.md` and
`.json`. The Markdown is the one to read; the JSON is for tooling.

Findings are grouped by source — `sast`, `dependencies`, `containers`, `iac` —
and each severity is mapped through `security-thresholds.json` to one of `fail`,
`warn` or `ignore`. That mapping drives the summary only: the report script
always exits 0 and both workflows run it as reporting. The scanners block on
their own exit codes (semgrep `--error`, `osv-scanner`, `trivy --exit-code 1`,
`checkov`, `pnpm audit --audit-level=high`), which are stricter than the
thresholds. The `headers` section of `security-thresholds.json` is read by
`check-headers.js`, which moved to AFixt/bugrout-server; the keys stay in the
file here so the two repositories' thresholds do not drift apart.

Two things worth attention in a summary:

- **`Ran: no`** in the by-source table. A scanner that did not run reports zero
  findings, which looks identical to a clean scan unless you read that column.
- **Expired exceptions.** They do not stop the build; they are listed so that
  "we accepted this risk for 90 days" does not quietly become "forever".

## How to handle false positives

A false positive is a finding that is wrong, not one that is inconvenient.

1. **Confirm it locally** and work out why the rule fired.
2. Prefer the **narrowest possible suppression at the site**: an inline
   `// nosemgrep: <rule-id> -- <reason>` on the line, with the reason written
   out. The pattern to copy is the `cors-misconfiguration` suppression inside
   `setStandardHeaders()` in route-tracker, which moved to
   [AFixt/bugrout-server](https://github.com/AFixt/bugrout-server) — it explains
   why the CORS origin is not attacker-controlled. Name the function rather than
   citing a line: this paragraph said `index.ts:132` until 2026-11-09, by which
   point the line was 216.
3. Only when a rule is wrong _everywhere_ does it belong in
   `security/config/semgrep.yml` under `excludeRules`, with a reason and an
   issue number.
4. Never delete a scanner from the pipeline to silence it.

An exclusion in `semgrep.yml` is **deferred work**, not a dismissal — each one
carries an issue. A finding you have decided not to fix is an _exception_, and
belongs in `exceptions.json` with an expiry.

## How to update tools

Scanner binaries come from `scripts/bootstrap.sh` and are pinned by version in
the workflows (Trivy, trufflehog, OSV-Scanner). To move one:

1. Bump the version in `.github/workflows/security.yml`.
2. Run the full suite locally on the new version first — a scanner upgrade
   routinely surfaces new findings, and discovering that in CI on someone else's
   pull request is the wrong order.
3. Triage anything new before merging: fix, except with an expiry, or exclude
   with an issue.

Semgrep rulesets are registry packs (`p/owasp-top-ten` and friends) and move on
their own. That is intentional — the alternative is a vendored ruleset nobody
updates — and it is why a Semgrep failure on an unrelated pull request is
usually a new rule rather than new code.

## What is deliberately not here

- **CodeQL / `upload-sarif` / `security-events: write`.** GitHub Advanced
  Security is not enabled on this repository. SARIF stays inside the build
  artifact. See the comment block at the top of `security.yml`.
- **OWASP Dependency-Check.** Reasoning is recorded in `security.yml`.
- **Scheduled scans.** Every check runs on the pull request that introduces the
  problem. See the CI policy in `CLAUDE.md`.
- **A scanner Action** (`gitleaks-action`, `trufflehog-actions-scan`). The CLI
  is used instead; §5.1 forbids a scanner Action by name and this repository is
  public.
