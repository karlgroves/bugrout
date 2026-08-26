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
pnpm run security          # audit, OSV, secrets — the fast set
pnpm run security:semgrep  # SAST
pnpm run security:tests    # endpoint regression tests
pnpm run check:all         # everything, including the above
```

Every one of these runs the same command CI runs. That is deliberate and it is
enforced structurally rather than by convention: the Semgrep ruleset lives in
`security/config/semgrep.yml` and both the npm script and the workflow invoke
`security/scripts/semgrep.mjs`, so the two cannot drift apart. To see the exact
command that will run:

```bash
node security/scripts/semgrep.mjs --print
```

### Header checks against a running target

The unit tests assert what the handlers construct. The header check asserts what
a client actually receives, which is a different question — a platform, proxy or
CDN in front of a worker can strip or override a header the code set.

```bash
# a locally running worker
cd backend/workers/tile-server && pnpm dev &
node security/scripts/check-headers.js http://127.0.0.1:8787/health

# a deployed origin
node security/scripts/check-headers.js --production https://tiles.bugrout.app/health
```

Exit codes: `0` clean, `1` blocking failure, `2` target unreachable.

`--production` additionally requires HTTPS and promotes `missing_hsts` from a
warning to a failure, per `security-thresholds.json`.

## How to update the secrets baseline

There is no baseline file. `gitleaks detect --no-banner --redact` scans full
history and currently reports nothing, so a baseline would only be a place for
findings to hide.

If gitleaks reports a finding:

1. **Assume it is real.** Rotate the credential first, then investigate. A
   leaked key is not made safe by concluding it was a test value.
2. If it is genuinely not a secret, add a narrowly-scoped `gitleaks:allow`
   comment on the offending line, with a reason. Do not add a global allowlist
   rule — that suppresses the pattern everywhere, including where it matters.
3. A confirmed secret **may not be excepted**. See `security-exceptions.md`.

## How to audit suspected secrets

```bash
gitleaks detect --no-banner --redact --verbose
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

The DAST job takes its target from the workflow input, defaulting to the
deployed worker origins. Rule configuration is in
`security/config/zap-baseline.conf` and `zap-api.conf`; excluded URL patterns
are in `zap-exclusions.txt`, which the workflow reads rather than hard-coding.

The scan runs **after a deploy** or on `workflow_dispatch`. It is not scheduled
— see the CI policy in `CLAUDE.md`.

## How to add project-specific authorization tests

BugRout has no accounts, sessions or roles, so most of §10.2 does not apply.
What does apply is that a request without a valid credential must not reach
protected data. Those tests live in `security/tests/`:

| File                                | Covers                                               |
| ----------------------------------- | ---------------------------------------------------- |
| `auth.security.test.ts`             | §10.1/§10.2 — bearer auth on both protected surfaces |
| `input-validation.security.test.ts` | §10.4 — allowlists, size caps, type confusion        |
| `headers.security.test.ts`          | §10.6/§5.10 — headers on every path, error leakage   |
| `helpers.ts`                        | Fakes for R2, KV, Redis, and a `node:http` driver    |

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
`warn` or `ignore`. Only `fail` blocks.

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
   out. `backend/services/route-tracker/src/index.ts:132` is the pattern to copy
   — it explains why the CORS origin is not attacker-controlled.
3. Only when a rule is wrong _everywhere_ does it belong in
   `security/config/semgrep.yml` under `excludeRules`, with a reason and an
   issue number.
4. Never delete a scanner from the pipeline to silence it.

An exclusion in `semgrep.yml` is **deferred work**, not a dismissal — each one
carries an issue. A finding you have decided not to fix is an _exception_, and
belongs in `exceptions.json` with an expiry.

## How to update tools

Scanner binaries come from `scripts/bootstrap.sh` and are pinned by version in
the workflows (Trivy, Hadolint, gitleaks). To move one:

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
- **`gitleaks-action`.** The CLI is used instead; §5.1 forbids the Action by
  name and this repository is public.
