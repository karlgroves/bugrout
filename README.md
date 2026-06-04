# BugRout

Survival-focused mobile navigation for emergency evacuation. BugRout optimizes
for **mission completion** (safe arrival) rather than speed, using predictive
congestion modeling (Evacuation Load Factor) and full offline capability. See
[`spec.md`](spec.md) for the product specification and [`CLAUDE.md`](CLAUDE.md)
for the architecture map.

> **Advisory only.** BugRout supplements — never replaces — official emergency
> guidance.

## Repository layout

| Path                  | What it is                                                       |
| --------------------- | ---------------------------------------------------------------- |
| `apps/mobile/`        | React Native app (Expo SDK 54, Expo Router, MapLibre)            |
| `packages/shared/`    | Shared TypeScript domain types                                   |
| `packages/elf-model/` | ELF weight-table training pipeline                               |
| `backend/workers/`    | Cloudflare Workers (tile-server, alert-aggregator, crowd-signal) |
| `backend/services/`   | Fly.io services (route-tracker + Redis, Valhalla)                |
| `data-pipeline/`      | OSM → Valhalla tiles and PMTiles build scripts                   |
| `docs/adr/`           | Architecture decision records                                    |

## Prerequisites

- Node 22 (`.nvmrc` — `nvm use`)
- pnpm 10 (`corepack enable`)
- For the full local gate: `semgrep`, `osv-scanner`, `gitleaks`, `lychee`
  (`bash scripts/bootstrap.sh` installs anything missing)

## Install

```sh
pnpm install        # also installs the Husky git hooks
```

## Everyday commands

```sh
pnpm run check       # format check + lint + typecheck + tests (Turbo-cached)
pnpm run check:all   # check + duplication, links, security scans, licenses
pnpm run lint:fix    # autofix lint
pnpm run format      # prettier --write

cd apps/mobile && pnpm start              # Expo dev server
cd apps/mobile && npx expo start --web    # web preview (native modules mocked)
cd apps/mobile && npx jest                # unit tests
```

## Quality gates

Local hooks (Husky) are the primary gate; GitHub Actions is a safety net for
anything that bypasses them (`--no-verify`, web-UI merges).

| Hook       | Runs                                                            |
| ---------- | --------------------------------------------------------------- |
| pre-commit | lint-staged (ESLint --fix + Prettier on staged files), gitleaks |
| commit-msg | commitlint (Conventional Commits)                               |
| pre-push   | `pnpm run check` + secrets/licenses/duplication scans           |
| post-merge | reinstall + audit when `pnpm-lock.yaml` changed                 |

Linting is a single root [`eslint.config.mjs`](eslint.config.mjs)
(typescript-eslint strict, naming-convention, React Native a11y, security,
sonarjs, import hygiene, TSDoc enforcement). Decisions and deviations from the
org tooling baseline are documented as ADRs in [`docs/adr/`](docs/adr/);
grandfathered violations live in [`docs/tech-debt.md`](docs/tech-debt.md).

## Contributing

1. Branch from `main`; commit using
   [Conventional Commits](https://www.conventionalcommits.org/) (enforced).
2. `pnpm run check:all` must pass before pushing (pre-push runs the fast subset
   automatically).
3. New code gets no lint exemptions; if you must grandfather something, add a
   justified `eslint-disable` and a `docs/tech-debt.md` entry.
4. Significant decisions get an ADR (`docs/templates/adr-template.md`).

## License

Proprietary. All rights reserved (license to be finalized).
