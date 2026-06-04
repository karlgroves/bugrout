# ADR 0004: pnpm + Turborepo adaptations of the tooling stack

- Status: Accepted
- Date: 2026-06-04
- Context: Issue #1 (written for an npm single-package repo)

## Context

Issue #1's commands and configs assume npm (`package-lock.json`, `npm audit`,
npm scripts in one package). This repo is a pnpm workspace monorepo orchestrated
by Turborepo.

## Decision

- `pnpm audit --prod --audit-level=high` replaces `npm audit`.
- OSV-Scanner scans `pnpm-lock.yaml`.
- All ESLint plugins/parsers are **root devDependencies**: pnpm's isolated
  `node_modules` means the root `eslint.config.mjs` (the only file importing
  plugins) is the only reliable resolution origin. Never add ESLint deps to
  individual workspaces.
- One root flat ESLint config; per-workspace `lint` scripts resolve up to it.
  All `files` globs in it are written repo-root-relative.
- Turborepo stays (issue #1 only excludes monorepo tooling "for single-project
  repos"); `lint`/`typecheck`/`test` tasks do not depend on `^build` since
  internal packages are consumed as source.
- Repo-global scanners (jscpd, gitleaks, semgrep, osv-scanner, lychee, license
  checker) run once at the root via plain scripts, not through Turbo.

## Consequences

- `pnpm run check` is Turbo-cached and fast; `pnpm run check:all` adds the
  global scanners.
- Dependabot's npm ecosystem entry covers pnpm lockfiles natively.
