/**
 * The use-case documents address controls by accessible name. Nothing checked
 * those names against the app, so a rename silently pointed them at controls
 * that no longer exist — #115 renamed three onboarding controls and left all
 * eight documents stale, caught only by hand during review.
 *
 * `usecases:validate` would not have caught it either: it runs the documents
 * against a live build, and the runner is not installed here (adding it is
 * blocked by the workspace trust policy). This is a static check of the same
 * property, with no new dependency.
 *
 * It compares only what it can resolve. A name built at runtime from a
 * template literal is matched against a pattern derived from that literal, and
 * a literal carrying no fixed text at all is counted as unverifiable rather
 * than allowed to match everything — a pattern of `^.+$` would silently
 * whitelist every name in the suite.
 *
 * What it catches, and what it does not, measured rather than assumed:
 *
 *   caught      a name that no longer exists anywhere in the app. Two of the
 *               three renames in #115 were this, and it found a fourth case
 *               that predated it: 10-active-navigation-advisory-badge named
 *               "Send emergency SMS to contacts" for a control actually called
 *               "Send location to emergency contacts".
 *
 *   not caught  a name that still exists, on a different control. #115's third
 *               rename was this: onboarding's skip became "Skip for now",
 *               which DownloadGuide already used, so the name resolves even
 *               when the document means the other screen. Catching that needs
 *               a screen-aware model this deliberately does not attempt.
 */
/* eslint-disable security/detect-non-literal-fs-filename -- walks the repo's
   own source and docs from fixed roots; no external input reaches these paths. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const APP_ROOT = join(REPO_ROOT, "apps", "mobile");
const DOCS_ROOT = join(REPO_ROOT, "docs");
const SOURCE_DIRS = ["app", "components", "constants"];

/**
 * Locators whose name is an accessible name resolvable from source. Written
 * out rather than built from a list so it stays a literal regex.
 */
const LOCATOR = /\b(?:button|tab|switch|link|field|image)\s+"([^"]+)"/g;
const TEMPLATE_VAR = /^\{\{\s*([a-z_]+)\s*\}\}$/;
const INTERPOLATION = /(\$\{[^}]*\})/;

/** Names the app can announce: fixed strings, plus patterns for built ones. */
interface NameIndex {
  fixed: Set<string>;
  patterns: RegExp[];
  unverifiable: number;
}

/** Every file with the given extension below `dir`, recursively. */
function filesIn(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesIn(full, ext));
    else if (entry.endsWith(ext)) out.push(full);
  }
  return out;
}

/** The end index of the `{...}` expression starting at `open`. */
function closingBrace(source: string, open: number): number {
  let depth = 0;
  for (let k = open; k < source.length; k++) {
    if (source[k] === "{") depth++;
    else if (source[k] === "}" && --depth === 0) return k;
  }
  return source.length;
}

/** The label value starting at `start`, and where scanning should resume. */
function readLabel(
  source: string,
  start: number,
): { literal: boolean; value: string; next: number } | null {
  if (source[start] === '"') {
    const end = source.indexOf('"', start + 1);
    return { literal: true, value: source.slice(start + 1, end), next: end };
  }
  if (source[start] === "{") {
    const end = closingBrace(source, start);
    return { literal: false, value: source.slice(start + 1, end), next: end };
  }
  return null;
}

/** Each `accessibilityLabel=` value in a source file. */
function labelValues(source: string): { literal: boolean; value: string }[] {
  const key = "accessibilityLabel=";
  const out: { literal: boolean; value: string }[] = [];
  let i = source.indexOf(key);
  while (i !== -1) {
    const read = readLabel(source, i + key.length);
    if (read === null) {
      i = source.indexOf(key, i + key.length);
      continue;
    }
    out.push({ literal: read.literal, value: read.value });
    i = source.indexOf(key, read.next);
  }
  return out;
}

/** What a template literal can produce, or null if it is all holes. */
function patternFor(templateLiteral: string): RegExp | null {
  const body = templateLiteral.replace(/^`|`$/g, "");
  const source = body
    .split(INTERPOLATION)
    .filter((part) => part !== "")
    .map((part) =>
      part.startsWith("${")
        ? "(?:.+)"
        : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("");
  if (source === "(?:.+)") return null;
  // Built from this repository's own source text, never from external input.
  // eslint-disable-next-line security/detect-non-literal-regexp
  return new RegExp(`^${source}$`);
}

/** Fold one label expression into the index. */
function indexExpression(expression: string, index: NameIndex): void {
  const trimmed = expression.trim();
  if (trimmed.startsWith("`")) {
    const pattern = patternFor(trimmed);
    if (pattern === null) index.unverifiable++;
    else index.patterns.push(pattern);
    return;
  }
  const literals = [...trimmed.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
  if (literals.length === 0) index.unverifiable++;
  else literals.forEach((literal) => index.fixed.add(literal));
}

/** Names declared as props rather than as accessibilityLabel. */
const OTHER_NAME_PROPS = [
  /\blabel="([^"]+)"/g,
  /\btitle:\s*"([^"]+)"/g,
  /\btitle="([^"]+)"/g,
];

/** Fold every name declared in one source file into the index. */
function indexFile(source: string, index: NameIndex): void {
  for (const { literal, value } of labelValues(source)) {
    if (literal) index.fixed.add(value);
    else indexExpression(value, index);
  }
  // A name is not always written as accessibilityLabel: a row component takes
  // one as a `label` prop, a navigator screen as `title`.
  for (const re of OTHER_NAME_PROPS) {
    for (const m of source.matchAll(re)) index.fixed.add(m[1] ?? "");
  }
}

/** Every accessible name the app source can produce. */
function buildNameIndex(): NameIndex {
  const index: NameIndex = { fixed: new Set(), patterns: [], unverifiable: 0 };
  for (const dir of SOURCE_DIRS) {
    for (const file of filesIn(join(APP_ROOT, dir), ".tsx")) {
      indexFile(readFileSync(file, "utf8"), index);
    }
  }
  return index;
}

/** Which top-level block a line belongs to. */
type Section = "data" | "steps" | null;

/** The block `line` opens, or the block still in effect. */
function sectionOf(line: string, current: Section): Section {
  if (line.startsWith("data:")) return "data";
  if (line.startsWith("steps:")) return "steps";
  if (/^[a-z_]+:/.test(line)) return null;
  return current;
}

/** Strip one layer of surrounding quotes; the documents use both kinds. */
function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted = /^(['"])([\s\S]*)\1$/.exec(trimmed);
  return quoted === null ? trimmed : (quoted[2] ?? "");
}

/**
 * The `data:` map and step lines of one document.
 *
 * Parsed line by line rather than with a YAML library: the only YAML parser in
 * the tree is a transitive dependency of eslint, and depending on a package
 * this workspace never declared is what `blockExoticSubdeps` exists to
 * prevent. These documents have a fixed, flat shape, so a small parser is
 * honest about what it supports rather than pretending to be general.
 */
function parseUseCase(source: string): {
  data: Record<string, string>;
  steps: string[];
} {
  const data: Record<string, string> = {};
  const steps: string[] = [];
  let section: Section = null;

  for (const line of source.split("\n")) {
    const next = sectionOf(line, section);
    if (next !== section) {
      section = next;
      continue;
    }
    if (section === "data") {
      const entry = /^\s+([a-z_]+):\s*(.*)$/.exec(line);
      if (entry !== null) data[entry[1] ?? ""] = unquote(entry[2] ?? "");
    } else if (section === "steps") {
      const step = /^\s*-\s*[a-z]+:\s*(.*)$/.exec(line);
      if (step !== null) steps.push(unquote(step[1] ?? ""));
    }
  }
  return { data, steps };
}

/** Resolve `{{ var }}` against the document's own `data:` block. */
function resolve(name: string, data: Record<string, string>): string | null {
  const templated = TEMPLATE_VAR.exec(name);
  if (templated === null) return name;
  return data[templated[1] ?? ""] ?? null;
}

/** Locators across all use-case documents, resolved to concrete names. */
function locatorNames(): { file: string; name: string }[] {
  const found: { file: string; name: string }[] = [];
  for (const file of filesIn(DOCS_ROOT, ".uc.yaml")) {
    const { data, steps } = parseUseCase(readFileSync(file, "utf8"));
    for (const step of steps) {
      for (const match of step.matchAll(LOCATOR)) {
        const name = resolve(match[1] ?? "", data);
        if (name !== null) {
          found.push({ file: file.replace(`${REPO_ROOT}/`, ""), name });
        }
      }
    }
  }
  return found;
}

describe("use-case documents name controls that exist in the app", () => {
  const index = buildNameIndex();
  const locators = locatorNames();
  const drift = locators.filter(
    ({ name }) =>
      !index.fixed.has(name) && !index.patterns.some((p) => p.test(name)),
  );

  it("resolves locators to check (guards against a vacuous walk)", () => {
    // If either parser stops matching, the assertion below passes for the
    // wrong reason. Both sides have to be non-trivial to mean anything.
    expect(locators.length).toBeGreaterThanOrEqual(60);
    expect(index.fixed.size).toBeGreaterThanOrEqual(20);
  });

  it("has no locator naming a control the app cannot announce", () => {
    const report = [
      ...new Set(drift.map((d) => `  ${d.file}\n     names: ${d.name}`)),
    ].join("\n");
    expect(report).toBe("");
  });
});
