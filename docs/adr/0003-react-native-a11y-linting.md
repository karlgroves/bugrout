# ADR 0003: React Native a11y linting instead of DOM-based a11y assertions

- Status: Accepted
- Date: 2026-06-04
- Context: Issue #1 (accessibility defense-in-depth)

## Context

Issue #1 specifies `@afix/a11y-assert` at component, E2E, and CI-preview levels,
plus `eslint-plugin-jsx-a11y`. Both are DOM-based: they inspect rendered HTML /
ARIA. React Native renders native views — there is no DOM in the app, in Jest
(react-test-renderer), or in Detox.

## Decision

Use `eslint-plugin-react-native-a11y` (all rules enabled) as the accessibility
gate, enforced in-editor, at pre-commit, and in CI. Skip `jsx-a11y` and
`@afix/a11y-assert`.

## Rationale

- `react-native-a11y` checks the RN accessibility API surface
  (`accessibilityLabel`, `accessibilityRole`, `accessibilityHint`, touch-target
  props) — the equivalent layer for native apps.
- `jsx-a11y` rules target HTML elements (`<img alt>`, `aria-*`) and produce zero
  signal on `<View>`/`<Text>` trees.
- The RN-web preview stubs out core native modules (maps, SQLite, location), so
  auditing it with DOM tools would exercise a degraded, non-shipping UI.

## Consequences

- Every labeled interactive element now carries a meaningful `accessibilityHint`
  (enforced; ~100 added during adoption).
- Runtime accessibility verification still requires manual testing with
  VoiceOver/TalkBack — lint cannot prove the experience.
- If a real web surface ships, add `@afix/a11y-assert` + `jsx-a11y` for it.
