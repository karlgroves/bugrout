# ADR 0001: Keep Jest (jest-expo) and Detox instead of Vitest and Playwright

- Status: Accepted
- Date: 2026-06-04
- Context: Issue #1 (standardized tooling stack)

## Context

Issue #1 proposes Vitest for unit/integration tests and Playwright for E2E. This
repo's app is React Native (Expo SDK 54), already tested with `jest-expo` (102
unit tests) and Detox (device E2E).

## Decision

Keep Jest with the `jest-expo` preset and Detox.

## Rationale

- Vitest cannot execute React Native code: RN requires Metro-compatible
  transforms and the `react-native` Jest preset; `jest-expo` is Expo's supported
  test path.
- Playwright drives browsers; the product surface is native iOS/Android. Detox
  drives real simulators/emulators, which is what the E2E suite needs.
- Issue #1's ground rule: do not replace working tooling without a demonstrable
  quality win. There is none here — the proposed tools cannot run this code.

## Consequences

- Coverage uses Jest's providers rather than Vitest v8 config.
- If a real web app (not the RN-web preview) is ever added, Vitest/Playwright
  should be reconsidered for that surface only.
