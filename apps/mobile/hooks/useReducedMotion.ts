/**
 * Reports whether the user has asked the system to reduce motion.
 *
 * Two reasons this exists, and both matter:
 *
 * 1. **Accessibility.** A control that pulses forever is a problem for people
 *    with vestibular disorders, and it is exactly the kind of motion WCAG
 *    2.3.3 (Animation from Interactions) is about. In an app whose users are
 *    frightened and time-pressed by design, a throbbing button is a poor
 *    default even for people who have not set the preference.
 *
 * 2. **Testability.** An animation that never ends means Android's Espresso
 *    never observes an idle view hierarchy, so every Detox assertion times out
 *    with "Waited for the root of the view hierarchy to have window focus and
 *    not request layout". Emulators started with animations disabled report
 *    reduce-motion, so honouring the preference also makes the app drivable.
 *
 * Defaults to `true` — no motion — until the platform answers. Starting still
 * and then animating is the safe order; the reverse shows a burst of motion to
 * someone who asked for none.
 */

import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Subscribe to the system reduce-motion setting.
 *
 * @returns True when motion should be suppressed.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduced(enabled);
      })
      .catch(() => {
        // Platform could not answer — stay still rather than guess.
        if (active) setReduced(true);
      });

    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        setReduced(enabled);
      },
    );

    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
