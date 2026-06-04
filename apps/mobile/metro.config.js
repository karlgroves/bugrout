const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Support pnpm monorepo — watch workspace packages
config.watchFolders = [monorepoRoot];

// Resolve packages from both the app and monorepo root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// On web, expo-sqlite's WASM bundling breaks Metro.
// Replace native-only modules with empty stubs on web.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web") {
    const nativeOnlyModules = [
      "expo-sqlite",
      "expo-location",
      "expo-battery",
      "expo-sms",
      "expo-speech",
      "expo-crypto",
      "expo-file-system",
      "expo-file-system/legacy",
      "expo-haptics",
      "@sentry/react-native",
      "@maplibre/maplibre-react-native",
    ];

    if (nativeOnlyModules.includes(moduleName)) {
      return {
        type: "empty",
      };
    }
  }

  // Fall back to default resolution
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
