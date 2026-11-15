# `security/`

The layer §6 of
[`secure-project-baseline`](https://github.com/karlgroves/secure-project-baseline)
defines, as adopted here.

```text
security/
  config/
    semgrep.yml                 rule selection — the single source, used by
                                both the npm script and the workflow
    security-thresholds.json    §11, verbatim
    exceptions.json             the exception register (empty, and should stay that way)
  scripts/
    semgrep.mjs                 builds and runs Semgrep from config/semgrep.yml
    trufflehog.mjs              §5.1 — secrets, with the value withheld
    check-overrides.mjs         pnpm override expiry/justification check
    check-store-urls.mjs        store-listing URL check
    generate-security-report.mjs  §21 — security-summary.{md,json}
  tests/                        every *.security.test.ts the regression suite
                                runs. `ls` is the list and
                                `pnpm run security:tests` prints the count;
                                neither is restated here, because the
                                hand-kept version of both was wrong. Partial
                                WSTG mapping in docs/security-test-matrix.md
  docs/
    security-automation.md      §22
    security-exceptions.md      §22
    security-test-matrix.md     §22
```

Start with [`docs/security-automation.md`](docs/security-automation.md).

**§15 and §19 moved.** `check-headers.js`, `zap-baseline.conf`, `zap-api.conf`
and `zap-exclusions.txt` went to
[AFixt/bugrout-server](https://github.com/AFixt/bugrout-server) on 2026-11-15
with the services they test, along with the eight endpoint suites that were in
`tests/` and the `helpers.ts` fakes for R2, KV and Redis. Nothing in this
repository serves HTTP any more, so there is no running target to check headers
against and no deployed origin to scan. The copies in that repository are the
live ones.

## Where this diverges from §6, and why

- **Reports go to `reports/security/`, not `security/reports/`.** That is where
  `security.yml` already wrote `semgrep.sarif` and `osv-results.json` before
  this directory existed, and where `license:report` writes. One report location
  beats spec fidelity; the path is gitignored as a build output.
- **`check-cookies.js`, `check-openapi.js` and `check-sensitive-errors.js` are
  absent.** There is no HTTP surface in this repository at all since the split,
  so nothing here can set a cookie, serve an OpenAPI document or leak an error
  body. The sensitive-error assertions, and the ZAP cookie rules that were
  deliberately set to FAIL so a new cookie got noticed, are in
  AFixt/bugrout-server.
- **`security-local.sh` / `security-ci.sh` / `security-staging.sh` are absent.**
  Their job is done by npm scripts (`security`, `security:tests`,
  `security:semgrep`, `security:report`), which is how everything else in this
  repository is invoked, and which means CI and a developer's shell run the
  identical command.
- **`trivy.yaml`, `checkov.yaml` and `detect-secrets.filters` are absent.**
  Trivy and Checkov are configured on the command line in `security.yml`;
  trufflehog is used instead of detect-secrets.
- **trufflehog is used, not gitleaks.** §5.1 names gitleaks, and this repository
  moved first; the baseline is being updated fleet-wide to match, so this is a
  leading change rather than a deviation. Two things about the tool drove how it
  is wired: it has no `--redact`, and it exits 183 rather than 1. Both are
  handled in `security/scripts/trufflehog.mjs` — see its docblock.
- **The §10 test templates for authentication, sessions, uploads and business
  logic are absent.** BugRout has no accounts, no sessions, no uploads and no
  commerce. `docs/security-test-matrix.md` lists each one and why, so their
  absence reads as a decision.
