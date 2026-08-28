/**
 * Shared launch sequence for the Detox specs.
 *
 * Four specs used to launch with `newInstance` alone and tap only the first of
 * onboarding's three steps, inside a try/catch that swallowed the mismatch.
 * That holds when a spec is the only thing running on a clean emulator, which
 * is how all four were written and — because the CI job ran a single spec
 * until now — how all four were always run.
 *
 * Run as a suite they inherited whatever state the previous spec left, stalled
 * on the location step that nothing advanced past, and every assertion after
 * it failed with `was null`: 17 of the suite's 25 tests, in exactly the four
 * specs that had never executed in CI.
 *
 * `delete: true` reinstalls, so each spec starts from a genuine first launch
 * and the order they run in stops mattering. That is the same treatment
 * navigation-flow.test.ts already documents and is the reason it was the one
 * spec that passed.
 */
import { by, device, element } from "detox";

/**
 * Reinstall the app and walk it from first launch to a usable map screen.
 *
 * Onboarding is three steps — disclaimer, location, ready — and the map then
 * opens with the offline-maps guide overlaying the Bug Out FAB, so the guide
 * is dismissed too. Every step is unconditional: after a reinstall each one is
 * guaranteed to be there, and a tap that finds nothing should fail the spec
 * loudly rather than be swallowed into a later `was null`.
 *
 * The guide's skip is addressed by testID rather than by label because
 * `by.label` matches both the Pressable and its child Text and fails as
 * ambiguous — see #114.
 */
export async function launchToMapScreen(): Promise<void> {
  await device.launchApp({ newInstance: true, delete: true });

  await element(by.id("onboarding-accept-btn")).tap();
  await element(by.text("Skip for now")).tap();
  await element(by.text("Get Started")).tap();

  await element(by.id("download-guide-skip-btn")).tap();
}
