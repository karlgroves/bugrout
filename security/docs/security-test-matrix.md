# Security test matrix

What is tested, by what, where it lives, and what happens when it fails.

Required by §22; columns are the ones §22 specifies. Categories are
[OWASP WSTG](https://owasp.org/www-project-web-security-testing-guide/).

Owner is `karlgroves` throughout — this is a single-maintainer repository, and
writing a team name in the column would be a fiction.

**The endpoint rows left on 2026-11-15.** The Workers and the Fly services, and
the eight `security/tests/` suites that covered them, moved to
[AFixt/bugrout-server](https://github.com/AFixt/bugrout-server). Every
WSTG-ATHZ, WSTG-ATHN, WSTG-CONF, WSTG-INPV, WSTG-ERRH and WSTG-BUSL row in this
table went with them, as did the whole mutation table and the DAST row, and they
are live in that repository's copy of this file. Nothing in this repository
serves HTTP. What is left here is the app, the data pipeline and the release
workflows.

## Automated coverage

| WSTG category                      | Automated test                                                                                                                               | Tool                             | Location                                               | Frequency | On failure           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------ | --------- | -------------------- |
| — Secrets in history               | Full-history scan                                                                                                                            | trufflehog CLI                   | `ci.yml`                                               | every PR  | block                |
| — SAST                             | OWASP Top 10, TypeScript, React, secrets rulesets                                                                                            | Semgrep                          | `security.yml`                                         | every PR  | block                |
| — Filesystem / IaC                 | Manifests and configs. No Dockerfile and no image is built in this repository any more, so Hadolint and `trivy image` left with the services | Trivy, Checkov                   | `security.yml`                                         | every PR  | block per thresholds |
| — Vulnerable dependencies          | Lockfile advisories                                                                                                                          | OSV-Scanner, `pnpm audit --prod` | `security.yml`, `ci.yml`                               | every PR  | block on high        |
| — Unlinkability of telemetry token | Token minted from a CSPRNG only                                                                                                              | jest                             | `apps/mobile/__tests__/`                               | every PR  | block                |
| — Privacy policy accuracy          | Policy claims asserted against the code                                                                                                      | jest                             | `apps/mobile/__tests__/services/privacyPolicy.test.ts` | every PR  | block                |

Rows are WSTG categories, not files, and this table is **not exhaustive**:
several of the suites in `security/tests/` — mostly the ones that assert on
workflow and release-pipeline structure rather than on an endpoint — have no
category row here yet. `ls security/tests/` is the authoritative list of what
exists; this table says only which WSTG categories are claimed as covered. An
earlier revision of this paragraph enumerated the uncovered files by name and
was wrong within three days, so it names none.

## The mutation check

**It moved with the endpoints.** Every row of it named a control in a Worker or
in route-tracker, and the probe is only meaningful where the code is. It is in
[AFixt/bugrout-server](https://github.com/AFixt/bugrout-server)'s copy of this
file, with the figures it was measured at.

The practice still applies to anything added here: delete the control, run the
suite, and record that it failed. A test that still passes with the control
deleted pins nothing.

The baseline a probe is read against is the whole suite, green: run
`pnpm run security:tests` on the Node version in `.nvmrc` (the machine default
may be newer) and read the totals it prints for itself. Deliberately no count is
written here — the suite claimed three different figures in this paragraph, each
stale within days of being measured. Compare the count the command prints before
your change with the count after it.

### What the suite here cannot see

- **`pnpm run security:tests` is not in `pnpm run check`.** A green `check`, and
  therefore a green pre-push, says nothing about any row in this table. See the
  local-commands note in `security-automation.md`. It _is_ in `check` in the
  server repository, which is a deliberate difference: there the suite is the
  main gate, and here it is not.
- **The security-header table is not here.** `SECURITY_HEADERS` and the
  exhaustive `assert.deepEqual` that catches a deleted header live in
  `packages/worker-utils/src/http.test.ts`, which moved to the server
  repository. Deleting a header is invisible to anything in this repository,
  because nothing here sets one.

## Not applicable to this project

Recorded so their absence reads as a decision rather than an oversight.

| WSTG category                                  | Why not                                                                                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| WSTG-ATHN-* (session, password reset, lockout) | No accounts. No login, no password, no session                                                                                    |
| WSTG-SESS-* (cookies, fixation, CSRF)          | No cookies are set by any surface. Nothing here serves HTTP at all. The ZAP cookie rules that pinned this moved with the services |
| WSTG-BUSL-* (payment, inventory, refunds)      | No commerce                                                                                                                       |
| File upload tests (§10.5)                      | No upload endpoint                                                                                                                |
| Multi-tenancy / role escalation                | No tenants, no roles                                                                                                              |

## Gaps

Honest list of what is not covered.

- **The mobile app's own surface.** The app is covered by unit tests and a Detox
  smoke suite; use-case-level accessibility and interaction coverage is issue
  #81.
- **The endpoint gaps moved.** DAST against a real deployment, `trivy image`,
  and the narrowness of §18's error-leakage regex were all gaps in the services.
  They are recorded in
  [AFixt/bugrout-server](https://github.com/AFixt/bugrout-server)'s copy of this
  file.
