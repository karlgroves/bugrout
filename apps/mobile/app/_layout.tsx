/* eslint-disable max-lines-per-function -- pre-existing root layout enumerating every Stack.Screen inline; tracked in docs/tech-debt.md (decompose root layout) */
import "react-native-get-random-values";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack, useRootNavigationState, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import "react-native-reanimated";

import { bootstrap, type BootstrapResult } from "@/services/AppBootstrap";

export { ErrorBoundary } from "expo-router";

// eslint-disable-next-line @typescript-eslint/naming-convention -- name is a required Expo Router convention export
export const unstable_settings = {
  initialRouteName: "(tabs)",
};

void SplashScreen.preventAutoHideAsync();

const bugroutDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "#0d0d0d",
    card: "#1a1a1a",
    text: "#f5f5f5",
    border: "#404040",
    primary: "#22c55e",
  },
};

/** Root navigation layout: loads fonts, runs bootstrap, and registers all screens. */
export default function RootLayout(): React.JSX.Element | null {
  const [loaded, error] = useFonts({});
  const [bootstrapped, setBootstrapped] = useState(false);
  const [bootResult, setBootResult] = useState<BootstrapResult | null>(null);
  const router = useRouter();
  const rootNavState = useRootNavigationState();

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  // Run bootstrap after fonts load
  useEffect(() => {
    if (!loaded) return;

    bootstrap()
      .then((result) => {
        setBootResult(result);
        setBootstrapped(true);
      })
      .catch((err: unknown) => {
        console.error("Bootstrap failed:", err);
        // Still show the app even if bootstrap partially fails. bootResult stays
        // null, and the redirect below treats that as needing onboarding so the
        // legal disclaimer is never skipped on a bootstrap error.
        setBootstrapped(true);
      });
  }, [loaded]);

  // Gate onboarding by redirect, not by initialRouteName. unstable_settings
  // fixes the anchor route to "(tabs)" for deep-link back behaviour, and it
  // overrides the Stack's dynamic initialRouteName prop — so setting that prop
  // to "onboarding/index" silently did nothing and the legal disclaimer was
  // unreachable on first launch (confirmed via the boot diagnostic in #30:
  // bootstrap returned needsOnboarding:true yet the app rendered the tabs).
  // Default to onboarding when bootResult is null (bootstrap failed) — fail safe
  // toward showing the disclaimer, never toward skipping it.
  const needsOnboarding = bootResult?.needsOnboarding ?? true;
  // useRootNavigationState() is typed as always-defined but actually returns
  // undefined until the root navigator has mounted; the optional chain guards
  // that real gap, which is the whole point of the readiness check.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime value is undefined pre-mount despite the type
  const navReady = Boolean(rootNavState?.key);
  const didInitialRoute = useRef(false);

  useEffect(() => {
    if (!bootstrapped || !navReady || didInitialRoute.current) return;
    // Route once. needsOnboarding is derived from the initial bootResult and
    // never flips back, so without this guard a later re-render could redirect
    // the user to onboarding again right after they finished it.
    didInitialRoute.current = true;
    if (needsOnboarding) router.replace("/onboarding");
    // Splash stays up until the routing decision is made, so first-launch users
    // never see a flash of the map before the disclaimer.
    void SplashScreen.hideAsync();
  }, [bootstrapped, navReady, needsOnboarding, router]);

  if (!loaded || !bootstrapped) {
    return null;
  }

  return (
    <ThemeProvider value={bugroutDarkTheme}>
      <Stack initialRouteName="(tabs)">
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="navigation/[routeId]"
          options={{
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="destination/index"
          options={{
            title: "Set Destination",
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="route-preview/index"
          options={{
            title: "Route Preview",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="downloads/index"
          options={{
            title: "Offline Maps",
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="scenarios/edit"
          options={{
            title: "Edit Scenario",
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="contacts/index"
          options={{
            title: "Emergency Contacts",
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="legal/privacy"
          options={{ title: "Privacy Policy" }}
        />
        <Stack.Screen
          name="legal/terms"
          options={{ title: "Terms of Service" }}
        />
        <Stack.Screen
          name="onboarding/index"
          options={{
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="+not-found" />
      </Stack>
    </ThemeProvider>
  );
}
