/* eslint-disable max-lines-per-function -- pre-existing root layout enumerating every Stack.Screen inline; tracked in docs/tech-debt.md (decompose root layout) */
import "react-native-get-random-values";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
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
        void SplashScreen.hideAsync();
      })
      .catch((err: unknown) => {
        console.error("Bootstrap failed:", err);
        // Still show the app even if bootstrap partially fails
        setBootstrapped(true);
        void SplashScreen.hideAsync();
      });
  }, [loaded]);

  if (!loaded || !bootstrapped) {
    return null;
  }

  return (
    <ThemeProvider value={bugroutDarkTheme}>
      <Stack
        initialRouteName={
          bootResult?.needsOnboarding ? "onboarding/index" : "(tabs)"
        }
      >
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
