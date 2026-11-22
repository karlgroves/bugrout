/**
 * The UIScene plugin adopts the scene lifecycle without moving the window.
 *
 * Built against the iOS 27 SDK, an app that has not adopted `UIScene` stops
 * before any JS runs (TN3187). The plugin writes the scene manifest and appends
 * a scene delegate that adopts the window the app delegate already built. It
 * runs at prebuild, so a broken transform only shows up as an app that does not
 * launch; these tests pin what it writes.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the plugin is CommonJS, loaded by expo prebuild
const plugin = require("../../plugins/withUISceneLifecycle") as {
  (config: Record<string, unknown>): Record<string, unknown>;
  sceneManifest: () => Record<string, unknown>;
  addSceneDelegate: (appDelegate: {
    language: string;
    contents: string;
  }) => string;
  MARKER: string;
};

type Mod = (cfg: { modResults: Record<string, unknown> }) => {
  modResults: Record<string, unknown>;
};

/** Mods the plugin registered, in order, keyed by the helper that took them. */
const mockMods: { kind: string; mod: Mod }[] = [];

jest.mock("expo/config-plugins", () => ({
  withInfoPlist: (config: unknown, mod: Mod): unknown => {
    mockMods.push({ kind: "infoPlist", mod });
    return config;
  },
  withAppDelegate: (config: unknown, mod: Mod): unknown => {
    mockMods.push({ kind: "appDelegate", mod });
    return config;
  },
}));

/** The part of Expo SDK 54's generated AppDelegate.swift the plugin relies on. */
const TEMPLATE = `import Expo
import React

public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    window = UIWindow(frame: UIScreen.main.bounds)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

const swift = (contents: string): { language: string; contents: string } => ({
  language: "swift",
  contents,
});

afterEach(() => {
  mockMods.length = 0;
});

describe("sceneManifest", () => {
  it("declares one application scene, delegated to SceneDelegate", () => {
    expect(plugin.sceneManifest()).toEqual({
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    });
  });
});

describe("addSceneDelegate", () => {
  it("appends a scene delegate and leaves the template untouched", () => {
    const out = plugin.addSceneDelegate(swift(TEMPLATE));

    expect(out.startsWith(TEMPLATE)).toBe(true);
    expect(out).toContain(plugin.MARKER);
    expect(out).toContain(
      "class SceneDelegate: UIResponder, UIWindowSceneDelegate",
    );
    expect(out).toContain("willConnectTo session: UISceneSession");
    expect(out).toContain("existingWindow.windowScene = windowScene");
  });

  it("hands links to the app delegate, not straight to RCTLinkingManager", () => {
    // Straight to RCTLinkingManager would skip ExpoAppDelegate's subscribers.
    const code = plugin
      .addSceneDelegate(swift(TEMPLATE))
      .slice(TEMPLATE.length)
      .replace(/\/\/[^\n]*/g, "");

    expect(code).not.toContain("RCTLinkingManager");
    expect(code).toContain(
      "appDelegate.application(UIApplication.shared, open: url, options: [:])",
    );
    expect(code).toMatch(
      /appDelegate\.application\(\s*UIApplication\.shared, continue: userActivity/,
    );
  });

  it("is idempotent, so a second prebuild does not add a second class", () => {
    const once = plugin.addSceneDelegate(swift(TEMPLATE));

    expect(plugin.addSceneDelegate(swift(once))).toBe(once);
  });

  it("refuses an Objective-C app delegate", () => {
    expect(() =>
      plugin.addSceneDelegate({ language: "objcpp", contents: TEMPLATE }),
    ).toThrow("expected a Swift AppDelegate, got objcpp");
  });

  it("refuses a template that no longer creates the window", () => {
    const changed = TEMPLATE.replace(
      "window = UIWindow(frame: UIScreen.main.bounds)",
      "",
    );

    expect(() => plugin.addSceneDelegate(swift(changed))).toThrow(
      "could not find the template's window setup",
    );
  });
});

describe("withUISceneLifecycle", () => {
  it("writes the manifest into Info.plist and the delegate into AppDelegate", () => {
    plugin({ name: "BugRout" });

    const plist = mockMods.find((m) => m.kind === "infoPlist");
    const appDelegate = mockMods.find((m) => m.kind === "appDelegate");
    expect(plist).toBeDefined();
    expect(appDelegate).toBeDefined();

    const info = plist?.mod({ modResults: {} }).modResults;
    expect(info?.UIApplicationSceneManifest).toEqual(plugin.sceneManifest());

    const delegate = appDelegate?.mod({
      modResults: swift(TEMPLATE),
    }).modResults;
    expect(delegate?.contents).toBe(plugin.addSceneDelegate(swift(TEMPLATE)));
  });
});
