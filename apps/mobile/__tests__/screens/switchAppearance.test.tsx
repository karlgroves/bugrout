/**
 * Switches look the same before and after toggling, and the thumb is visible
 * against its track in both states (#177, WCAG 2.2 SC 1.4.11).
 *
 * The thumb colour used to depend on the value: iOS ignored it on first render
 * (white), then after switching off it became #737373 on a #404040 track,
 * 2.19:1, which read as a disabled control.
 */

/* eslint-disable security/detect-non-literal-fs-filename -- the source scan
   below reads files found by walking the app's own directories. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { fireEvent, render } from "@testing-library/react-native";

import SettingsScreen from "@/app/(tabs)/settings";
import { switchColors } from "@/constants/theme";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe("switch colours", () => {
  it("keep the thumb at least 3:1 against the off track", () => {
    expect(
      contrast(switchColors.thumbColor, switchColors.trackColor.false),
    ).toBeGreaterThanOrEqual(3);
  });

  it("keep the thumb at least 3:1 against the on track", () => {
    expect(
      contrast(switchColors.thumbColor, switchColors.trackColor.true),
    ).toBeGreaterThanOrEqual(3);
  });

  it("reproduces the old off state's failure, so the check can fail", () => {
    // #737373 thumb on the #404040 track, as reported in #177.
    expect(contrast("#737373", "#404040")).toBeLessThan(3);
  });
});

describe("Settings switches", () => {
  it("keep the same thumb colour after being turned off and on", async () => {
    const screen = await render(<SettingsScreen />);
    const thumb = (): unknown =>
      screen.getByLabelText("Voice Navigation").props.thumbTintColor;

    const before = thumb();
    expect(before).toBe(switchColors.thumbColor);

    await fireEvent(
      screen.getByLabelText("Voice Navigation"),
      "valueChange",
      false,
    );
    expect(screen.getByLabelText("Voice Navigation").props.value).toBe(false);
    expect(thumb()).toBe(before);

    await fireEvent(
      screen.getByLabelText("Voice Navigation"),
      "valueChange",
      true,
    );
    expect(thumb()).toBe(before);
  });
});

/** Every .tsx file under `dir`. */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return entry.endsWith(".tsx") ? [full] : [];
  });
}

describe("every Switch in the app", () => {
  const root = path.join(__dirname, "..", "..");
  const switches = ["app", "components"]
    .flatMap((d) => tsxFiles(path.join(root, d)))
    .flatMap((file) => {
      const source = readFileSync(file, "utf8");
      // Each <Switch ...> element, up to its closing "/>".
      return [...source.matchAll(/<Switch\b[\s\S]*?\/>/g)].map((m) => ({
        file: path.relative(root, file),
        jsx: m[0],
      }));
    });

  it("finds the switches at all", () => {
    // Settings (one ToggleRow) and the scenario editor (two).
    expect(switches.length).toBeGreaterThanOrEqual(3);
  });

  it.each(switches.map((s) => [s.file, s.jsx]))(
    "%s uses the shared switch colours and has a name",
    (_file, jsx) => {
      expect(jsx).toContain("thumbColor={switchColors.thumbColor}");
      expect(jsx).toContain("trackColor={switchColors.trackColor}");
      expect(jsx).toMatch(/accessibilityLabel=/);
    },
  );
});
