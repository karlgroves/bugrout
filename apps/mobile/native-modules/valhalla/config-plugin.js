/**
 * Expo Config Plugin for the in-process Valhalla routing engine (Approach A).
 *
 * Runs during `npx expo prebuild` and wires the native module that links
 * libvalhalla and calls actor_t in-process (no subprocess, no HTTP server —
 * see ./SPIKE.md for why the old subprocess approach can't ship on iOS).
 *
 * iOS:
 *   - Adds `pod 'ValhallaEngine', :path => ...` to the Podfile. The podspec
 *     (ios/ValhallaEngine.podspec) compiles ValhallaEngine.mm + cpp/ValhallaCore
 *     and links bin/ios/valhalla.xcframework.
 * Android:
 *   - Copies the Kotlin module + package into the app source tree.
 *   - Registers ValhallaEnginePackage in MainApplication.
 *   - Adds the JNI CMakeLists (android/cpp) to app/build.gradle externalNativeBuild.
 *
 * Usage in app.config.ts:
 *   plugins: [
 *     ["./native-modules/valhalla/config-plugin", { approach: "native" }]
 *   ]
 *
 * With approach: "http" (remote Fly server via EXPO_PUBLIC_VALHALLA_URL) the
 * plugin is a no-op — a plain HTTPS client needs no native changes.
 */

const {
  withDangerousMod,
  withMainApplication,
  withAppBuildGradle,
} = require("expo/config-plugins");
const path = require("path");
const fs = require("fs");

const POD_NAME = "ValhallaEngine";
const ANDROID_PKG = "com.bugrout.valhalla";

function addPodfileEntry(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      const podPath = path.relative(
        cfg.modRequest.platformProjectRoot,
        path.join(
          cfg.modRequest.projectRoot,
          "native-modules",
          "valhalla",
          "ios",
        ),
      );
      let contents = fs.readFileSync(podfile, "utf8");
      if (!contents.includes(`pod '${POD_NAME}'`)) {
        // Insert just inside the first target block.
        contents = contents.replace(
          /(target ['"][^'"]+['"] do\n)/,
          `$1  pod '${POD_NAME}', :path => '${podPath}'\n`,
        );
        fs.writeFileSync(podfile, contents);
        console.log(`[Valhalla] Added pod '${POD_NAME}' to Podfile`);
      }

      const xcframework = path.join(
        cfg.modRequest.projectRoot,
        "native-modules",
        "valhalla",
        "bin",
        "ios",
        "valhalla.xcframework",
      );
      if (!fs.existsSync(xcframework)) {
        console.warn(
          "[Valhalla] valhalla.xcframework not found — run build-scripts/build-ios.sh before `pod install`.",
        );
      }
      return cfg;
    },
  ]);
}

function copyAndroidSources(config) {
  return withDangerousMod(config, [
    "android",
    (cfg) => {
      const nativeDir = path.join(
        cfg.modRequest.projectRoot,
        "native-modules",
        "valhalla",
        "android",
      );
      const destDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        ...ANDROID_PKG.split("."),
      );
      fs.mkdirSync(destDir, { recursive: true });
      for (const file of [
        "ValhallaEngineModule.kt",
        "ValhallaEnginePackage.kt",
      ]) {
        fs.copyFileSync(path.join(nativeDir, file), path.join(destDir, file));
      }
      console.log("[Valhalla] Copied Kotlin module + package to", destDir);

      const jni = path.join(nativeDir, "bin", "android", "jniLibs");
      if (!fs.existsSync(jni)) {
        console.warn(
          "[Valhalla] No prebuilt libvalhalla.a — run build-scripts/build-android.sh (with ANDROID_NDK_HOME).",
        );
      }
      return cfg;
    },
  ]);
}

function registerAndroidPackage(config) {
  return withMainApplication(config, (cfg) => {
    const src = cfg.modResults.contents;
    const importLine = `import ${ANDROID_PKG}.ValhallaEnginePackage`;
    if (!src.includes(importLine)) {
      cfg.modResults.contents = src
        .replace(/(package [^\n]+\n)/, `$1\n${importLine}\n`)
        // Kotlin getPackages(): add to the PackageList.
        .replace(
          /(val packages = PackageList\(this\)\.packages[^\n]*\n)/,
          `$1            packages.add(ValhallaEnginePackage())\n`,
        );
    }
    return cfg;
  });
}

function addAndroidCmake(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") return cfg;
    let src = cfg.modResults.contents;
    if (!src.includes("valhalla/android/cpp/CMakeLists.txt")) {
      const cmakeBlock = `    externalNativeBuild {
        cmake {
            path "../../native-modules/valhalla/android/cpp/CMakeLists.txt"
        }
    }
`;
      src = src.replace(/(android\s*\{\n)/, `$1${cmakeBlock}`);
      cfg.modResults.contents = src;
      console.log("[Valhalla] Added JNI CMake to app/build.gradle");
    }
    return cfg;
  });
}

function withValhalla(config, { approach = "native" } = {}) {
  if (approach !== "native") {
    // Remote HTTPS server (Approach B) needs no native wiring.
    return config;
  }
  config = addPodfileEntry(config);
  config = copyAndroidSources(config);
  config = registerAndroidPackage(config);
  config = addAndroidCmake(config);
  return config;
}

module.exports = withValhalla;
