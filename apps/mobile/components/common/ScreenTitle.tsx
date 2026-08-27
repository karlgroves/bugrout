/**
 * Document titles for the web build.
 *
 * Measured against a real `expo export --platform web` build, `document.title`
 * was `""` on every route. Expo Router's `Stack.Screen options.title` drives
 * the native header bar, not the HTML document title — so browser tabs,
 * history entries, bookmarks and the page announcement a screen reader makes
 * on navigation all got nothing, and every route was indistinguishable from
 * every other. WCAG 2.4.2.
 *
 * ## Why this sets `document.title` directly
 *
 * The documented route is `expo-router/head`, and it did not work here. Two
 * attempts, both verified against a real build rather than assumed:
 *
 * 1. `<Head>` in the root layout — renders nothing. It calls `useIsFocused()`
 *    and returns null when false, which it always is outside a screen.
 * 2. `<Head>` inside each focused screen, with `Head.Provider` already mounted
 *    by expo-router's own entry — the title stayed `""` both in the
 *    prerendered HTML and after hydration.
 *
 * Rather than keep guessing at helmet's internals, this sets the title in an
 * effect. It is a few lines, it is observable, and it does the one thing the
 * defect is about. If `expo-router/head` starts working, this can be replaced
 * — the assertion in the tests will keep either implementation honest.
 *
 * No-op off web, where `document` does not exist and the native header bar
 * already carries the screen title.
 */

import { useEffect } from "react";
import { Platform } from "react-native";

/** Suffix appended to every document title. */
const APP_NAME = "BugRout";

/**
 * Build the full document title for a screen.
 *
 * @param title - The screen's own title.
 * @returns The title with the app name appended.
 */
export function buildDocumentTitle(title: string): string {
  return `${title} — ${APP_NAME}`;
}

/**
 * Set the document title while the calling screen is mounted.
 *
 * @param title - The screen's own title.
 */
export function useScreenTitle(title: string): void {
  useEffect(() => {
    if (Platform.OS !== "web") return;
    // `document` is absent during static prerendering, which runs in Node.
    if (typeof document === "undefined") return;
    document.title = buildDocumentTitle(title);
  }, [title]);
}

/**
 * Wrap a screen component so it sets its own document title.
 *
 * A wrapper rather than an element inside each screen's JSX: every screen has
 * a different root element, and a one-line change at the export is both easier
 * to review and harder to get subtly wrong than twelve JSX edits.
 *
 * @param Screen - The screen component.
 * @param title - The document title for that screen.
 * @returns A component that sets the title and renders the screen.
 */
export function withScreenTitle(
  Screen: () => React.JSX.Element | null,
  title: string,
): TitledScreenComponent {
  /**
   * The wrapped screen.
   *
   * @returns Whatever the wrapped screen renders.
   */
  function TitledScreen(): React.JSX.Element | null {
    useScreenTitle(title);
    return <Screen />;
  }
  TitledScreen.displayName = `withScreenTitle(${title})`;
  return TitledScreen;
}

/** A screen component that also sets the document title. */
export type TitledScreenComponent = (() => React.JSX.Element | null) & {
  displayName: string;
};
