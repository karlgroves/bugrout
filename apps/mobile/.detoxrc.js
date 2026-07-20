/** @type {import('detox').DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: "jest",
      config: "e2e/jest.config.js",
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  apps: {
    "ios.debug": {
      type: "ios.app",
      binaryPath: "ios/build/Build/Products/Debug-iphonesimulator/BugRout.app",
      build:
        "xcodebuild -workspace ios/BugRout.xcworkspace -scheme BugRout -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build",
    },
    "android.debug": {
      type: "android.apk",
      binaryPath: "android/app/build/outputs/apk/debug/app-debug.apk",
      // Scoped to :app deliberately. Unqualified `assembleAndroidTest` builds an
      // androidTest APK for every autolinked Expo module too (~1100 Gradle tasks,
      // ~22 min), and Detox only ever consumes the two :app artifacts named in
      // binaryPath/testBinaryPath. The extra work is also where the build has
      // flaked — :expo-dev-client:packageDebugAndroidTest.
      build:
        "cd android && ./gradlew :app:assembleDebug :app:assembleAndroidTest -DtestBuildType=debug",
    },
  },
  devices: {
    simulator: {
      type: "ios.simulator",
      device: {
        type: "iPhone 15",
      },
    },
    emulator: {
      type: "android.emulator",
      device: {
        avdName: "Pixel_6_API_33",
      },
    },
  },
  configurations: {
    "ios.sim.debug": {
      device: "simulator",
      app: "ios.debug",
    },
    "android.emu.debug": {
      device: "emulator",
      app: "android.debug",
    },
  },
};
