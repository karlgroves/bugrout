/**
 * The save-time coverage warning (#233, refs #190) in the Detox specs.
 *
 * `confirmCoverage()` in services/routing/coverage.ts raises an `Alert`
 * whenever a plan's destination falls outside every downloaded region, and the
 * save awaits the answer. A CI emulator has **no regions downloaded at all**,
 * and `coverageWarning()` returns its "No offline maps are downloaded yet"
 * string for an empty region list — so on CI the Alert appears for *every*
 * save, not only an out-of-coverage one.
 *
 * That is what broke 13 of 33 tests across 4 of 8 suites from 2026-10-05
 * (#243): each spec tapped Save and then waited for a list row that could not
 * appear while the modal was still up, so every suite that saves a plan timed
 * out in the same place.
 *
 * The dismissal is conditional because the two environments genuinely differ,
 * and a spec cannot know which it is in:
 *
 *   trip-lifecycle      39.3138, -76.6021   Baltimore    inside Maryland
 *   scenarios           34.0522, -118.2437  Los Angeles  outside
 *   routing-unavailable 38.2542, -85.7594   Louisville   outside
 *
 * On a device with Maryland downloaded, Baltimore raises no Alert while the
 * other two do. On CI all three do. So this tolerates both paths rather than
 * assuming either.
 *
 * It is deliberately *not* the seed-a-region approach, which would make the
 * environment deterministic and is closer to #131 in spirit. That remains the
 * better long-term fix; this one is confined to test support and touches
 * nothing the app ships.
 *
 * ## Why this try/catch is not the one #128 removed
 *
 * #128 deleted a `try/catch` from the onboarding taps, and the rule it
 * established is worth keeping: a step that is *guaranteed* present must be
 * unconditional, so a tap that finds nothing fails loudly instead of
 * resurfacing later as `was null`. After a reinstall every onboarding step is
 * guaranteed, so swallowing there hid a real mismatch.
 *
 * This Alert is genuinely not guaranteed — its presence is a function of the
 * device's downloaded regions, which CI and a developer's machine do not share.
 * Conditionality here describes the app's actual behaviour rather than papering
 * over a missing step.
 *
 * Crucially, absence cannot hide a failure. This function asserts nothing: if
 * the Alert is missing because the save silently did nothing, the caller's own
 * `waitFor` on `Edit plan: …` still fails, in the same place and with the
 * same message as before this existed. The only thing swallowed is the wait for
 * a dialog that was never raised.
 */
import { by, element, waitFor } from "detox";

/**
 * How long to wait for the Alert before concluding it was not raised.
 *
 * Generous on purpose. When the destination *is* covered this is dead time, but
 * only on a developer's device — on CI the Alert is always raised, so the wait
 * ends as soon as it appears. Too short a window would skip a slow Alert on a
 * loaded emulator and leave the original 10s timeout to fail instead, which is
 * the failure this exists to remove.
 */
const COVERAGE_ALERT_TIMEOUT_MS = 5000;

/**
 * Accept the coverage warning if it was raised, so a save can complete.
 *
 * Call immediately after tapping Save on the plan editor. Safe when no warning
 * appears: it returns once the wait elapses, leaving the caller's own
 * post-save assertion to report any real failure.
 */
export async function acceptCoverageWarning(): Promise<void> {
  try {
    await waitFor(element(by.text("Save anyway")))
      .toBeVisible()
      .withTimeout(COVERAGE_ALERT_TIMEOUT_MS);
  } catch {
    // No warning: the destination is inside a downloaded region. Nothing to do.
    return;
  }
  await element(by.text("Save anyway")).tap();
}
