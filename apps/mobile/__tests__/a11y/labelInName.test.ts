/**
 * WCAG 2.5.3 (Label in Name, Level A) across every screen and component.
 *
 * A control's accessible name must contain the text shown on it, or speech
 * input cannot reach it: a user saying the words they can see gets nothing.
 *
 * This is a source-level walk rather than a set of render tests because the
 * defect is a property of every labelled control in the app, not of the few
 * that happened to get noticed. Render tests for the ones already known would
 * not have found the rest, and would not catch the next one.
 *
 * ## Why this reads JSX with a scanner rather than a regex
 *
 * The first version of this file matched a whole element with
 * `<Pressable\b([^>]*?)>([\s\S]*?)</Pressable>`. That is wrong in a way that
 * stays invisible until measured: `[^>]*?` stops at the first `>` in the
 * source, and in TSX that is almost always the arrow of an inline handler —
 *
 *     <Pressable onPress={() => { router.push("/downloads"); }} ...>
 *                               ^ the attribute capture ended here
 *
 * so `accessibilityLabel` fell outside the captured attributes and the control
 * was skipped as unlabelled. It saw 21 of the app's labelled controls and 18
 * visible strings, reporting the tree clean while seven real violations sat in
 * it. The scanner below sees 32 and 27. A guard that reads as authoritative
 * and quietly under-detects is worse than no guard, because it also stops
 * anyone else from looking.
 *
 * So the opening tag is found by scanning to the `>` at brace depth zero,
 * skipping over string literals; the element body by counting nested tags
 * rather than stopping at the first close; and the label value by the same
 * brace-aware scan — a greedy `\{([\s\S]*)\}` swallows every attribute after
 * it, which during this rework captured a neighbouring `accessibilityHint`
 * and invented three violations out of its branches.
 *
 * ## What it does not catch
 *
 * Stated rather than left to be discovered:
 *
 *   - A name or visible string built entirely at runtime — a template literal
 *     with no fixed text, or a value from props. Nothing static can compare
 *     those, so they are counted and the count is asserted, which is what
 *     makes the blind spot visible when it grows.
 *   - A ternary whose branches are crossed: `label={x ? "A" : "B"}` against
 *     text `{x ? "B" : "A"}` compares as sets and passes. Catching that needs
 *     branch-aware evaluation this does not attempt.
 *   - Controls that are not Pressable/TouchableOpacity/TouchableHighlight.
 */
/* eslint-disable security/detect-non-literal-fs-filename -- walks the app's own
   source tree from a fixed root; no external input reaches these paths. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");
const SEARCH_DIRS = ["app", "components"];
const CONTROL_TAGS = ["Pressable", "TouchableOpacity", "TouchableHighlight"];
const LABEL_KEY = "accessibilityLabel=";
const STRING_LITERAL = /"([^"]+)"/g;
const IDENTIFIER_CHAR = /[A-Za-z0-9_]/;

/** A visible string a control shows that its accessible name fails to cover. */
interface Uncovered {
  file: string;
  name: string;
  visibleText: string;
}

/** One labelled control: the names it can announce and the body it renders. */
interface Control {
  file: string;
  names: string[];
  body: string;
}

/** What the walk could and could not read, so the blind spot is measurable. */
interface WalkResult {
  controls: Control[];
  /** Controls carrying a label that reduces to no fixed string. */
  unreadableNames: number;
  /** Visible fragments that reduce to no fixed string. */
  unreadableText: number;
}

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

/**
 * The next `<Tag` at or after `from` that is really that tag — `<Text` must
 * not match `<TextInput`. Found by string search rather than a built RegExp,
 * so no rule exemption is needed for a pattern assembled from a tag name.
 */
function nextOpenTag(source: string, tag: string, from: number): number {
  const needle = `<${tag}`;
  let i = source.indexOf(needle, from);
  while (i !== -1) {
    if (!IDENTIFIER_CHAR.test(source.charAt(i + needle.length))) return i;
    i = source.indexOf(needle, i + 1);
  }
  return -1;
}

/** Index just past the string literal opening at `start`. */
function skipString(source: string, start: number): number {
  const quote = source.charAt(start);
  for (let i = start + 1; i < source.length; i++) {
    if (source.charAt(i) === "\\") {
      i++;
    } else if (source.charAt(i) === quote) {
      return i + 1;
    }
  }
  return source.length;
}

/** Where an opening tag ends, and whether it closed itself. */
interface OpeningTag {
  attrs: string;
  bodyStart: number;
  selfClosing: boolean;
}

/**
 * The opening tag starting at `from`, read to the `>` at brace depth zero.
 *
 * This is the whole reason the file does not use a regex: a `>` inside an
 * arrow function, a generic, or a comparison is not the end of the tag, and
 * treating it as one silently drops the attributes that follow it.
 */
function readOpeningTag(source: string, from: number): OpeningTag {
  let depth = 0;
  let i = from;
  while (i < source.length) {
    const c = source.charAt(i);
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(source, i);
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) {
      const attrs = source.slice(from, i);
      return {
        attrs,
        bodyStart: i + 1,
        selfClosing: attrs.trimEnd().endsWith("/"),
      };
    }
    i++;
  }
  return {
    attrs: source.slice(from),
    bodyStart: source.length,
    selfClosing: true,
  };
}

/**
 * The body of an element of `tag` whose content starts at `from`, matched by
 * counting nested opens rather than stopping at the first close. A nested
 * self-closing tag is not an open, so it does not raise the depth.
 */
function readBody(source: string, tag: string, from: number): string {
  const closeNeedle = `</${tag}>`;
  let depth = 1;
  let i = from;
  while (i < source.length) {
    const open = nextOpenTag(source, tag, i);
    const close = source.indexOf(closeNeedle, i);
    if (close === -1) return source.slice(from);
    if (open !== -1 && open < close) {
      if (!readOpeningTag(source, open).selfClosing) depth++;
      i = open + 1;
      continue;
    }
    depth--;
    if (depth === 0) return source.slice(from, close);
    i = close + 1;
  }
  return source.slice(from);
}

/** The value of a `{...}` attribute opening at `start`, brace-aware. */
function readBracedValue(attrs: string, start: number): string | null {
  let depth = 0;
  for (let i = start; i < attrs.length; i++) {
    const c = attrs.charAt(i);
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(attrs, i) - 1;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) return attrs.slice(start + 1, i);
    }
  }
  return null;
}

/** The accessible-name expression in an opening tag. */
function labelExpression(attrs: string): string | null {
  const at = attrs.indexOf(LABEL_KEY);
  if (at === -1) return null;
  const start = at + LABEL_KEY.length;
  const opener = attrs.charAt(start);
  if (opener === '"')
    return attrs.slice(start + 1, skipString(attrs, start) - 1);
  if (opener === "{") return readBracedValue(attrs, start);
  return null;
}

/**
 * A fragment with nested element tags removed.
 *
 * Without this, a `name="bookmark"` on a `<FontAwesome>` inside a `<Text>`
 * reads as displayed text, and the control gets reported for failing to name
 * an icon's identifier.
 */
function stripTags(fragment: string): string {
  let out = "";
  let i = 0;
  while (i < fragment.length) {
    if (fragment.charAt(i) === "<") {
      i = readOpeningTag(fragment, i).bodyStart;
      out += " ";
      continue;
    }
    const next = fragment.indexOf("<", i);
    const end = next === -1 ? fragment.length : next;
    out += fragment.slice(i, end);
    i = end;
  }
  return out;
}

/**
 * The contents of every top-level `<Text>` in a fragment. Nested `<Text>` is
 * skipped rather than counted twice — two components nest them.
 */
function textFragmentsIn(body: string): string[] {
  const out: string[] = [];
  let i = 0;
  let consumedUntil = 0;
  let at = nextOpenTag(body, "Text", i);
  while (at !== -1) {
    const tag = readOpeningTag(body, at);
    if (!tag.selfClosing && at >= consumedUntil) {
      const inner = readBody(body, "Text", tag.bodyStart);
      consumedUntil = tag.bodyStart + inner.length;
      out.push(stripTags(inner));
    }
    i = at + 1;
    at = nextOpenTag(body, "Text", i);
  }
  return out;
}

/** Every labelled control of one tag name declared in one source file. */
function collectTag(
  source: string,
  tag: string,
  file: string,
  result: WalkResult,
): void {
  let at = nextOpenTag(source, tag, 0);
  while (at !== -1) {
    const opening = readOpeningTag(source, at);
    const label = opening.selfClosing ? null : labelExpression(opening.attrs);
    if (label !== null) {
      const names = candidateStrings(label);
      if (names.length === 0) result.unreadableNames++;
      else {
        result.controls.push({
          file: file.replace(APP_ROOT, "apps/mobile"),
          names,
          body: readBody(source, tag, opening.bodyStart),
        });
      }
    }
    at = nextOpenTag(source, tag, at + 1);
  }
}

/** The strings this control can display. */
function visibleStringsOf(control: Control, result: WalkResult): string[] {
  const out: string[] = [];
  for (const fragment of textFragmentsIn(control.body)) {
    const strings = candidateStrings(fragment);
    if (strings.length === 0) result.unreadableText++;
    else out.push(...strings);
  }
  return out;
}

/** Visible strings this control's accessible names fail to cover. */
function uncoveredIn(control: Control, visible: string[]): Uncovered[] {
  return visible
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

/**
 * Every name the Detox smoke suite addresses with `by.label`.
 *
 * Conforming to 2.5.3 is what makes such a matcher ambiguous: on Android
 * `by.label` matches a contentDescription *or* a TextView's text, so once a
 * Pressable's name equals its own `<Text>` child, both match and the matcher
 * fails. #114 hit this on the download-guide skip button and audited the other
 * matchers by hand, concluding the download banner was safe — which stopped
 * being true the moment that banner's name was made to contain its visible
 * text. A hand audit expires silently; this does not.
 */
function detoxLabelMatchers(): Set<string> {
  const names = new Set<string>();
  const dir = join(APP_ROOT, "e2e");
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".ts")) continue;
    const source = readFileSync(join(dir, entry), "utf8");
    for (const m of source.matchAll(/by\.label\(\s*"([^"]+)"/g)) {
      names.add(m[1] ?? "");
    }
  }
  return names;
}

/** Every labelled control in the app, across the searched directories. */
function walk(): WalkResult {
  const result: WalkResult = {
    controls: [],
    unreadableNames: 0,
    unreadableText: 0,
  };
  for (const dir of SEARCH_DIRS) {
    for (const file of tsxFilesIn(join(APP_ROOT, dir))) {
      const source = readFileSync(file, "utf8");
      for (const tag of CONTROL_TAGS) collectTag(source, tag, file, result);
    }
  }
  return result;
}

describe("WCAG 2.5.3 — every accessible name contains its visible label", () => {
  const result = walk();
  // Resolved once: visibleStringsOf folds the unreadable count into `result`,
  // so calling it twice per control would double it.
  const seen = result.controls.map((control) => ({
    control,
    visible: visibleStringsOf(control, result),
  }));
  const checked = seen.reduce((n, { visible }) => n + visible.length, 0);
  const violations = seen.flatMap(({ control, visible }) =>
    uncoveredIn(control, visible),
  );

  it("finds labelled controls to check (guards against a vacuous walk)", () => {
    // If the scanner silently stops matching, the assertion below passes for
    // the wrong reason. The floors sit just under the real counts as this
    // lands — 32 controls and 27 visible strings — so losing a chunk of
    // either shows up here rather than as a quietly smaller check. The regex
    // version this replaced saw 21 and 18; floors set beneath those numbers
    // are what let it look healthy while blind to half the app.
    expect(result.controls.length).toBeGreaterThanOrEqual(30);
    expect(checked).toBeGreaterThanOrEqual(25);
  });

  it("keeps the unreadable set from growing unnoticed", () => {
    // Names and text the walk cannot reduce to a fixed string are excluded
    // from the comparison below, so a rising count is a growing blind spot.
    // Measured, not guessed: 10 and 3 as this lands.
    expect(result.unreadableNames).toBeLessThanOrEqual(10);
    expect(result.unreadableText).toBeLessThanOrEqual(3);
  });

  it("has no by.label matcher the emulator would find ambiguous", () => {
    // The converse of the check below: where a name *equals* a visible string,
    // conformance is correct but Detox cannot tell parent from child. The fix
    // is always to address the control by testID, never to weaken the label.
    const addressed = detoxLabelMatchers();
    const report = seen
      .flatMap(({ control, visible }) =>
        control.names
          .filter((name) => addressed.has(name) && visible.includes(name))
          .map(
            (name) =>
              `  ${control.file}\n     by.label("${name}") also matches its own <Text>` +
              `\n     address it by testID instead, as #114 did`,
          ),
      )
      .join("\n");
    expect(report).toBe("");
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
