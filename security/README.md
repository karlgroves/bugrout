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
    zap-baseline.conf           §19 baseline rules
    zap-api.conf                §19 API-scan rules
    zap-exclusions.txt          §19 URL exclusions, read by the DAST workflow
  scripts/
    semgrep.mjs                 builds and runs Semgrep from config/semgrep.yml
    check-headers.js            §15 — headers as a client actually receives them
    generate-security-report.mjs  §21 — security-summary.{md,json}
  tests/
    auth.security.test.ts       §10.1 / §10.2
    input-validation.security.test.ts  §10.4
    headers.security.test.ts    §10.6 / §5.10
    helpers.ts                  fakes for R2, KV, Redis; a node:http driver
  docs/
    security-automation.md      §22
    security-exceptions.md      §22
    security-test-matrix.md     §22
```

Start with [`docs/security-automation.md`](docs/security-automation.md).

## Where this diverges from §6, and why

- **Reports go to `reports/security/`, not `security/reports/`.** That is where
  `security.yml` already wrote `semgrep.sarif` and `osv-results.json` before
  this directory existed, and where `license:report` writes. One report location
  beats spec fidelity; the path is gitignored as a build output.
- **`check-cookies.js`, `check-openapi.js` and `check-sensitive-errors.js` are
  absent.** No surface here sets a cookie, there is no OpenAPI document, and the
  sensitive-error check is covered by the leakage assertions in
  `tests/headers.security.test.ts`, which run against real responses rather than
  by grepping. The cookie rules in `zap-baseline.conf` are deliberately set to
  FAIL, so if an endpoint ever starts setting a cookie, that gets noticed rather
  than silently passing an absent check.
- **`security-local.sh` / `security-ci.sh` / `security-staging.sh` are absent.**
  Their job is done by npm scripts (`security`, `security:tests`,
  `security:semgrep`, `security:headers`, `security:report`), which is how
  everything else in this repository is invoked, and which means CI and a
  developer's shell run the identical command.
- **`trivy.yaml`, `checkov.yaml` and `detect-secrets.filters` are absent.**
  Trivy and Checkov are configured on the command line in `security.yml`;
  gitleaks is used instead of detect-secrets, per §5.1.
- **The §10 test templates for authentication, sessions, uploads and business
  logic are absent.** BugRout has no accounts, no sessions, no uploads and no
  commerce. `docs/security-test-matrix.md` lists each one and why, so their
  absence reads as a decision.
