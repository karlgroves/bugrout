/**
 * WCAG 2.5.3 (Label in Name, Level A) across every screen and component.
 *
 * A control's accessible name must contain the text shown on it, or speech
 * input cannot reach it: a user saying the words they can see gets nothing.
 *
 * This is a source-level walk rather than a set of render tests because the
 * defect is a property of every labelled control in the app, not of three
 * particular ones. Six violations existed when this was written; render tests
 * for the three that happened to be noticed would not have found the other
 * three, and would not catch the seventh.
 */
/* eslint-disable security/detect-non-literal-fs-filename -- walks the app's own
   source tree from a fixed root; no external input reaches these paths. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");
const SEARCH_DIRS = ["app", "components"];

/** A labelled control found in source, with the literal text it displays. */
interface LabelledControl {
  file: string;
  name: string;
  visibleText: string;
}

const PRESSABLE =
  /<(?:Pressable|TouchableOpacity|TouchableHighlight)\b([^>]*?)>([\s\S]*?)<\/(?:Pressable|TouchableOpacity|TouchableHighlight)>/g;
// The name may be a plain string or an expression; a control whose text
// switches on state usually has a label that has to switch with it.
const LABEL = /accessibilityLabel=(?:"([^"]*)"|\{([^}]*)\})/;
const TEXT = /<Text[^>]*>([\s\S]*?)<\/Text>/g;
const STRING_LITERAL = /"([^"]+)"/g;

/**
 * The strings a fragment can actually display. Plain text is itself; an
 * expression contributes each string literal in it, so a
 * `{existing ? "Update" : "Save"}` child yields both of its branches.
 */
function candidateStrings(fragment: string): string[] {
  if (!fragment.includes("{")) {
    const text = fragment.trim();
    return text === "" ? [] : [text];
  }
  return [...fragment.matchAll(STRING_LITERAL)]
    .map((m) => (m[1] ?? "").trim())
    .filter((s) => s !== "");
}

/** Every .tsx file under the given directory, recursively. */
function tsxFilesIn(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tsxFilesIn(full));
    } else if (entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/** One labelled control: the names it can announce and the body it renders. */
interface Control {
  file: string;
  names: string[];
  body: string;
}

/** Every labelled control declared in one source file. */
function controlsIn(file: string): Control[] {
  const source = readFileSync(file, "utf8");
  const controls: Control[] = [];
  for (const match of source.matchAll(PRESSABLE)) {
    const label = LABEL.exec(match[1] ?? "");
    if (label === null) continue;
    const names = candidateStrings(label[1] ?? label[2] ?? "");
    if (names.length === 0) continue;
    controls.push({
      file: file.replace(APP_ROOT, "apps/mobile"),
      names,
      body: match[2] ?? "",
    });
  }
  return controls;
}

/** The strings this control can display. */
function visibleStringsOf(control: Control): string[] {
  return [...control.body.matchAll(TEXT)].flatMap((text) =>
    candidateStrings(text[1] ?? ""),
  );
}

/** Visible strings this control's accessible names fail to cover. */
function uncoveredIn(control: Control): LabelledControl[] {
  return visibleStringsOf(control)
    .filter(
      (visibleText) =>
        !control.names.some((name) =>
          name.toLowerCase().includes(visibleText.toLowerCase()),
        ),
    )
    .map((visibleText) => ({
      file: control.file,
      name: control.names.join(" | "),
      visibleText,
    }));
}

/** Every labelled control in the app, across the searched directories. */
function allControls(): Control[] {
  return SEARCH_DIRS.flatMap((dir) =>
    tsxFilesIn(join(APP_ROOT, dir)).flatMap(controlsIn),
  );
}

describe("WCAG 2.5.3 — every accessible name contains its visible label", () => {
  const controls = allControls();
  const checked = controls.flatMap(visibleStringsOf).length;
  const violations = controls.flatMap(uncoveredIn);

  it("finds labelled controls to check (guards against a vacuous walk)", () => {
    // If the matchers silently stop matching, the assertion below passes for
    // the wrong reason. 12 is comfortably under the count at the time of
    // writing and well above zero.
    expect(checked).toBeGreaterThanOrEqual(12);
  });

  it("has no control whose accessible name omits its visible text", () => {
    const report = violations
      .map(
        (v) =>
          `  ${v.file}\n     visible: ${v.visibleText}\n     name   : ${v.name}`,
      )
      .join("\n");
    expect(report).toBe("");
  });
});
