# ADR 0002: Skip web-only tooling (Stylelint, Lighthouse, size-limit, SEO)

- Status: Accepted
- Date: 2026-06-04
- Context: Issue #1 (standardized tooling stack)

## Context

Issue #1 includes Stylelint (+a11y plugin), Lighthouse CI with performance
budgets, `size-limit`, `web-vitals`, and an SEO/AIEO section (sitemap,
robots.txt, llms.txt, JSON-LD, react-helmet).

## Decision

Skip all of the above for now.

## Rationale

- Zero CSS/SCSS files exist: styling is React Native `StyleSheet.create()`.
  Stylelint has nothing to lint.
- There is no public web surface. The Expo web target is a development preview
  with native modules stubbed out — Lighthouse scores, bundle-size budgets, and
  SEO metadata for it would measure nothing users see.
- Mobile bundle size is governed by EAS build profiles, not size-limit.

## Consequences

- If a marketing site or production web app is added, revisit: Stylelint,
  Lighthouse CI (perf/SEO/best-practices), size-limit, and the SEO/AIEO
  checklist all become applicable to that surface.
