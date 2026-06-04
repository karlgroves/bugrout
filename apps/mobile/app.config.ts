/* eslint-disable max-lines-per-function -- pre-existing; tracked in docs/tech-debt.md (Expo config is one large declarative object literal) */
import { type ExpoConfig, type ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "BugRout",
  slug: "bugrout",
  owner: "karl.groves",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "bugrout",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#1a1a1a",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.bugrout.app",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        "BugRout uses your location to provide turn-by-turn navigation during evacuation routing.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "BugRout uses your location continuously during navigation to provide turn-by-turn directions and deviation alerts, even when the app is in the background.",
      UIBackgroundModes: ["location"],
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#1a1a1a",
    },
    edgeToEdgeEnabled: true,
    package: "com.bugrout.app",
    permissions: [
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "SEND_SMS",
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-sqlite",
    "@maplibre/maplibre-react-native",
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission:
          "BugRout uses your location continuously during navigation to provide turn-by-turn directions and deviation alerts.",
        isAndroidBackgroundLocationEnabled: true,
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#1a1a1a",
      },
    ],
    // Valhalla in-process routing (Approach A). Enable after building native
    // binaries (native-modules/valhalla/build-scripts) — see that dir's SPIKE.md.
    // ["./native-modules/valhalla/config-plugin", { approach: "native" }],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId:
        process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
        "349ad664-e0c0-4dbc-8315-3cb661f94196",
    },
    tileServerUrl:
      process.env.EXPO_PUBLIC_TILE_SERVER_URL ?? "https://tiles.bugrout.app",
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? "",
    valhallaApproach: process.env.EXPO_PUBLIC_VALHALLA_APPROACH ?? "http",
  },
});
