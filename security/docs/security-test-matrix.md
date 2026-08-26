# Security test matrix

What is tested, by what, where it lives, and what happens when it fails.

Required by §22; columns are the ones §22 specifies. Categories are
[OWASP WSTG](https://owasp.org/www-project-web-security-testing-guide/).

Owner is `karlgroves` throughout — this is a single-maintainer repository, and
writing a team name in the column would be a fiction.

## Automated coverage

| WSTG category                        | Automated test                                                                                    | Tool                             | Location                                                                    | Frequency                            | On failure                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------- | ------------------------------------ | ----------------------------- |
| WSTG-ATHZ-01 Directory traversal     | Path patterns rejected on both surfaces                                                           | node:test                        | `security/tests/auth.security.test.ts`, `input-validation.security.test.ts` | every PR                             | block                         |
| WSTG-ATHZ-02 Bypassing authorization | Tile packages 401 without a bearer key; every route-tracker route but `/health` 401               | node:test                        | `security/tests/auth.security.test.ts`                                      | every PR                             | block                         |
| WSTG-ATHN-04 Weak auth channel       | Constant-time key compare; wrong-length and wrong-value keys both rejected                        | node:test                        | `security/tests/auth.security.test.ts`                                      | every PR                             | block                         |
| WSTG-CONF-01 Network config          | Unconfigured `API_SECRET` returns 503, not 200                                                    | node:test                        | `security/tests/auth.security.test.ts`                                      | every PR                             | block                         |
| WSTG-CONF-07 HTTP headers            | Full shared header table on **every** response path, including 401/404/413/429/503 and preflights | node:test                        | `security/tests/headers.security.test.ts`                                   | every PR                             | block                         |
| WSTG-CONF-07 HTTP headers            | Headers as actually received from a running target                                                | `check-headers.js`               | `security/scripts/check-headers.js`                                         | every PR (local worker), post-deploy | block / warn per thresholds   |
| WSTG-INPV-01 Reflected XSS           | Script payloads in `regionId`/`edgeId` rejected by allowlist                                      | node:test                        | `security/tests/input-validation.security.test.ts`                          | every PR                             | block                         |
| WSTG-INPV-05 SQL injection           | SQL-shaped payloads rejected; no SQL engine on these surfaces                                     | node:test                        | `security/tests/input-validation.security.test.ts`                          | every PR                             | block                         |
| WSTG-INPV-11 Code injection          | Template (`{{7*7}}`) and command (`$(whoami)`) payloads rejected                                  | node:test                        | `security/tests/input-validation.security.test.ts`                          | every PR                             | block                         |
| WSTG-INPV-19 Type confusion          | Wrong types rejected rather than coerced; `null` body does not crash the process                  | node:test                        | `security/tests/input-validation.security.test.ts`                          | every PR                             | block                         |
| WSTG-BUSL-09 Upload/size limits      | 64 KB body cap on route-tracker, 1 KB on crowd-signal, 1000-entry array cap                       | node:test                        | `security/tests/input-validation.security.test.ts`                          | every PR                             | block                         |
| WSTG-ERRH-01 Error handling          | No response body matches `/stack\|trace\|node_modules\|syntaxerror/i`                             | node:test                        | `security/tests/headers.security.test.ts`                                   | every PR                             | block                         |
| WSTG-BUSL-06 Rate limiting           | Limiter engages, and the 429 still carries security headers                                       | node:test                        | `security/tests/headers.security.test.ts`                                   | every PR                             | block                         |
| — Secrets in history                 | Full-history scan                                                                                 | gitleaks CLI                     | `ci.yml`                                                                    | every PR                             | block                         |
| — SAST                               | OWASP Top 10, TypeScript, React, secrets rulesets                                                 | Semgrep                          | `security.yml`                                                              | every PR                             | block                         |
| — Vulnerable dependencies            | Lockfile advisories                                                                               | OSV-Scanner, `pnpm audit --prod` | `security.yml`, `ci.yml`                                                    | every PR                             | block on high                 |
| — Filesystem / IaC / containers      | Manifests, configs, Dockerfiles, images                                                           | Trivy, Checkov, Hadolint         | `security.yml`, deploy                                                      | every PR / pre-deploy                | block per thresholds          |
| — DAST                               | Baseline scan of deployed origins                                                                 | ZAP                              | `dast.yml`                                                                  | post-deploy, `workflow_dispatch`     | block on high-confidence high |
| — Unlinkability of telemetry token   | Token minted from a CSPRNG only                                                                   | jest                             | `apps/mobile/__tests__/`                                                    | every PR                             | block                         |
| — Privacy policy accuracy            | Policy claims asserted against the code                                                           | jest                             | `apps/mobile/__tests__/services/privacyPolicy.test.ts`                      | every PR                             | block                         |

## The mutation check

Every endpoint control in the table above was verified to **fail** when the
control is removed. A test that still passes with the control deleted pins
nothing and is indistinguishable from one that does.

| Control removed                              | Result          |
| -------------------------------------------- | --------------- |
| route-tracker auth middleware deleted        | 6 tests fail    |
| tile-server key comparison forced true       | 5 tests fail    |
| `regionId` allowlist removed                 | 1 test fails    |
| 64 KB body cap removed                       | 1 test fails    |
| crowd-signal coordinate range checks removed | 1 test fails    |
| `X-Content-Type-Options` removed             | 3 tests fail    |
| _(nothing removed)_                          | 40 pass, 0 fail |

Repeat this whenever a test is added. It takes a minute and it is the only thing
that distinguishes a regression test from decoration.

## Not applicable to this project

Recorded so their absence reads as a decision rather than an oversight.

| WSTG category                                  | Why not                                                                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| WSTG-ATHN-* (session, password reset, lockout) | No accounts. No login, no password, no session                                                                              |
| WSTG-SESS-* (cookies, fixation, CSRF)          | No cookies are set by any surface. The cookie rules in `zap-baseline.conf` are set to FAIL so that changing this is noticed |
| WSTG-BUSL-* (payment, inventory, refunds)      | No commerce                                                                                                                 |
| File upload tests (§10.5)                      | No upload endpoint                                                                                                          |
| Multi-tenancy / role escalation                | No tenants, no roles                                                                                                        |

## Gaps

Honest list of what is not covered.

- **The mobile app's own surface.** These tests cover the backends. The app is
  covered by unit tests and a Detox smoke suite; use-case-level accessibility
  and interaction coverage is issue #81.
- **`trivy image`.** Wired into the deploy pipeline, but not yet observed
  running against a real built image.
- **DAST against a real deployment.** The workflow and configuration exist; it
  has not yet run post-deploy.
- **§18's leakage regex is narrower than it looks.** It matches on the words
  `stack`, `trace`, `node_modules` and `syntaxerror` — not on the shape of a
  stack trace. A Node trace through application code
  (`at Object.<anonymous> (/app/src/index.js:1:1)`) matches none of them, and
  neither does a bare `TypeError` message. This is asserted explicitly in
  `headers.security.test.ts` so the limitation is recorded rather than assumed
  away. What actually protects these services is that no handler puts an error
  value in a response body at all — every error body is a fixed string, and that
  is asserted on every path.
