const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Support pnpm monorepo — watch workspace packages.
// expo/metro-config now discovers workspace packages itself, so append to its
// defaults rather than replacing them: dropping Expo's entries breaks parts of
// the module graph and is what `expo-doctor`'s Metro check flags.
config.watchFolders = [...(config.watchFolders ?? []), monorepoRoot];

// nodeModulesPaths is not set here: expo/metro-config already resolves from
// <projectRoot>/node_modules then <monorepoRoot>/node_modules, which is exactly
// what this app needs under pnpm.

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
