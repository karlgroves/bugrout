/**
 * Text entry for the Detox specs.
 *
 * Fill fields with `replaceText`, not `typeText`, whenever anything below the
 * fold is tapped afterwards. `typeText` taps the field to focus it and injects
 * key events, which raises the on-screen keyboard — and the IME is a separate
 * window stacked on top of the app's, which still extends behind it. Espresso
 * only asks the app whether a view is displayed, so a control under the
 * keyboard passes the visibility precondition, the click is reported as
 * performed, and the IME quietly receives the touch instead.
 *
 * In E2E run 33691459602 that was the primary cause of two failures and a
 * co-blocker on three more, in three specs, every one of them a
 * bottom-anchored submit control tapped after typing:
 *
 *   save-contact-btn      contacts   primary. The add form never closed, so the
 *                                    contact was never written and the two
 *                                    assertions after it had nothing to see.
 *   Save Scenario         scenarios  primary. The editor never popped, so the
 *                                    tab bar carrying "Map" was never on screen
 *                                    for the test that failed.
 *   route-and-go-button   full-nav   co-blocker. What actually stopped those
 *                                    three was that geocoding never returned,
 *                                    so no destination was ever selected — but
 *                                    the tap would not have landed either.
 *
 * The remaining four failures in that run are unrelated to the keyboard: an
 * exact-match `by.id` against a per-row testID, an assertion quoting one
 * sentence of a two-sentence Text node, two region rows below the fold, and a
 * RegExp that Espresso applies as a whole-string match. Don't read this file as
 * the explanation for all nine.
 *
 * The screenshots show the keyboard still up at the end of the contacts and
 * scenarios suites, on the same screen each spec thought it had left.
 *
 * `typeText` is still correct where typing is the behaviour under test and
 * nothing below the fold is tapped afterwards — see the Clear-search assertion
 * in navigation-flow.test.ts, which gates on `query.length > 0` and so has to
 * type. The rule is about what follows the typing, not about typing itself.
 *
 * `replaceText` maps to Espresso's `ViewActions.replaceText`, which sets the
 * text on the EditText directly. No tap, no focus, no keyboard — so the submit
 * control below it stays reachable. It also fires `onChangeText` exactly once,
 * which removes the second `typeText` artefact visible in the same run: the
 * scenario editor's longitude field read "-118.24373" after the spec typed
 * "-118.2437", a duplicated keystroke into a controlled TextInput.
 */
import { element } from "detox";

/**
 * Set a text field's value without raising the on-screen keyboard.
 *
 * @param matcher - Matcher for the TextInput to fill.
 * @param value - The value to place in the field.
 */
export async function fillField(
  matcher: Detox.NativeMatcher,
  value: string,
): Promise<void> {
  await element(matcher).replaceText(value);
}
