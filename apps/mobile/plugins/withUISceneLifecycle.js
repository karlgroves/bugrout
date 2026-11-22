/**
 * Adopt the UIKit scene lifecycle on iOS.
 *
 * Apple's TN3187 requires an app to adopt `UIScene`. An app built against the
 * iOS 27 SDK that has not adopted it does not launch — it stops before any JS
 * runs. Built against the iOS 26 SDK it still launches, and only logs the
 * runtime issue "`UIScene` lifecycle will soon be required".
 *
 * Expo SDK 54 generates neither half of the adoption: `Info.plist` has no
 * `UIApplicationSceneManifest`, and the generated `AppDelegate.swift` creates
 * the window itself in `didFinishLaunchingWithOptions`. Expo adopts scenes in
 * the template from SDK 58 on, so this plugin exists only until this app
 * upgrades, and should be deleted at that point.
 *
 * Per TN3187 a manifest alone is not adoption: a scene delegate must implement
 * `scene(_:willConnectTo:options:)`. So this plugin does three things.
 *
 * 1. Writes `UIApplicationSceneManifest` into `Info.plist`, naming the scene
 *    delegate class.
 * 2. Appends a `SceneDelegate` class to the generated `AppDelegate.swift`. It
 *    goes in that file, not a new one, because a new file would also have to be
 *    added to the Xcode target — the existing file is already a member of it.
 * 3. Attaches the app delegate's existing window to the scene.
 *
 * On (3): the obvious move is to create the window in the scene delegate
 * instead of the app delegate. That crashes this app on launch. `expo-dev-
 * client`'s `ExpoDevLauncherAppDelegateSubscriber` reads the key window during
 * `didFinishLaunchingWithOptions`, which runs before any scene connects, and
 * traps with "Cannot find the keyWindow" — measured here, not predicted. So
 * the template's window creation stays exactly where it is, and the scene
 * delegate adopts that window by setting its `windowScene`. This still
 * satisfies TN3187, which asks for a manifest with configurations and a
 * delegate implementing `scene(_:willConnectTo:options:)`.
 *
 * Deep links and universal links arrive on the scene once scenes are adopted,
 * so the scene delegate hands them to the app delegate's own `open` and
 * `continue` methods. Those already call `RCTLinkingManager` and, through
 * `super`, every `ExpoAppDelegate` subscriber; calling `RCTLinkingManager`
 * directly would have skipped the subscribers (expo-dev-client's deep links
 * among them). The `AppDelegate` methods themselves are unchanged, so the
 * pre-scene path still works if the manifest is ever removed.
 */

const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const SCENE_CONFIG_NAME = "Default Configuration";
const MARKER = "// BugRout: UIScene lifecycle (withUISceneLifecycle)";

/**
 * The window creation Expo's template puts in the app delegate. This plugin
 * leaves it in place and only checks it is still there: the scene delegate
 * adopts that window, so an upstream template that stops creating one must
 * fail the build here rather than produce a scene with nothing in it.
 */
const WINDOW_BLOCK = `window = UIWindow(frame: UIScreen.main.bounds)`;

/**
 * The scene delegate, appended to AppDelegate.swift.
 *
 * @returns {string}
 */
function sceneDelegateSource() {
  return `
${MARKER}
// Adopts the window the app delegate already built and showed. The window is
// created in didFinishLaunchingWithOptions because expo-dev-client reads the
// key window there; this attaches it to the scene so UIKit will display it.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let existingWindow = appDelegate.window else {
      return
    }

    existingWindow.windowScene = windowScene
    self.window = existingWindow
    existingWindow.makeKeyAndVisible()

    // A cold start opened by a link delivers it here, not to the app delegate.
    if let urlContext = connectionOptions.urlContexts.first {
      openURL(urlContext.url)
    }
    if let userActivity = connectionOptions.userActivities.first {
      continueActivity(userActivity)
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      openURL(context.url)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    continueActivity(userActivity)
  }

  // Through the app delegate, so ExpoAppDelegate's subscribers see the link
  // as well as RCTLinkingManager.
  private func openURL(_ url: URL) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(UIApplication.shared, open: url, options: [:])
  }

  private func continueActivity(_ userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(
      UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;
}

/**
 * The scene manifest for Info.plist.
 *
 * @returns {Record<string, unknown>}
 */
function sceneManifest() {
  return {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [
        {
          UISceneConfigurationName: SCENE_CONFIG_NAME,
          // Resolved against the app's own module, which is the product name.
          UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
        },
      ],
    },
  };
}

/**
 * Add a scene delegate to AppDelegate.swift that adopts the app delegate's
 * window. Idempotent: a file that already carries the marker is returned as is.
 *
 * @param {{ language: string, contents: string }} appDelegate - The generated
 *   app delegate, as `withAppDelegate` hands it over.
 * @returns {string} The new contents.
 */
function addSceneDelegate(appDelegate) {
  if (appDelegate.language !== "swift") {
    throw new Error(
      `withUISceneLifecycle: expected a Swift AppDelegate, got ${appDelegate.language}.`,
    );
  }

  const source = appDelegate.contents;
  if (source.includes(MARKER)) {
    return source;
  }
  if (!source.includes(WINDOW_BLOCK)) {
    throw new Error(
      "withUISceneLifecycle: could not find the template's window setup in " +
        "AppDelegate.swift. The Expo template changed — re-check this plugin " +
        "against it, or drop the plugin if the template now adopts UIScene.",
    );
  }

  return source + sceneDelegateSource();
}

/**
 * @param {import("expo/config-plugins").ExpoConfig} config
 * @returns {import("expo/config-plugins").ExpoConfig}
 */
function withUISceneLifecycle(config) {
  const withManifest = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = sceneManifest();
    return cfg;
  });
  return withAppDelegate(withManifest, (cfg) => {
    cfg.modResults.contents = addSceneDelegate(cfg.modResults);
    return cfg;
  });
}

module.exports = withUISceneLifecycle;
module.exports.sceneManifest = sceneManifest;
module.exports.addSceneDelegate = addSceneDelegate;
module.exports.MARKER = MARKER;
