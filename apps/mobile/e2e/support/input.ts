/**
 * Text entry for the Detox specs.
 *
 * Always `replaceText`, never `typeText`. `typeText` taps the field to focus it
 * and injects key events, which raises the on-screen keyboard — and the IME is
 * a separate window stacked on top of the app's, which still extends behind it.
 * Espresso only asks the app whether a view is displayed, so a control under
 * the keyboard passes the visibility precondition, the click is reported as
 * performed, and the IME quietly receives the touch instead.
 *
 * That is the single defect behind six of the nine failures in E2E run
 * 33691459602, in three different specs, every one of them a bottom-anchored
 * submit control tapped after typing:
 *
 *   save-contact-btn      contacts       the add form never closed, so the
 *                                        contact was never written and the two
 *                                        assertions after it had nothing to see
 *   Save Scenario         scenarios      the editor never popped, so the tab
 *                                        bar carrying "Map" was never on screen
 *   route-and-go-button   full-nav       the picker never advanced
 *
 * The screenshots show it plainly: the keyboard is still up at the end of each
 * of those suites, on the same screen the spec thought it had left.
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
