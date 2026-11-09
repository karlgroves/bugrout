#!/usr/bin/env node
/**
 * The threat feeds the app depends on have to still answer (#336).
 *
 * The wildfire feed went dead and nobody noticed. `USFSService` queried the
 * `NIFC_Perimeters` ArcGIS layer; that layer was withdrawn, so every request
 * to it — query *and* metadata — answered an ArcGIS 400 "Invalid URL". The
 * app's own error path is correct and did its job: `fetchFirePerimeters`
 * throws on a non-200 and the sync keeps the last cached perimeters (#288).
 * That is exactly why it was silent. Nothing in the repository ever asked the
 * endpoint whether it was still there, so avoidance routing ran for weeks with
 * no fires to route around and the only trace was a row in
 * `docs/store-listing.md`.
 *
 * Two failure modes matter here, and the second is the nastier one:
 *
 *   1. The endpoint stops answering 200 — a withdrawn layer, a renamed
 *      service, a path typo.
 *   2. The endpoint answers HTTP 200 and is still not usable. ArcGIS reports
 *      failures *inside* a 200 body: asking this layer for an `outFields`
 *      name it does not define answers 200 with
 *      `{"error":{"code":400,"details":["'outFields' parameter is invalid"]}}`
 *      and no `features` array, which is what the stale
 *      `irwin_PercentContained` name would do now that the schema has moved
 *      to WFIGS's `attr_` prefix. A status-code check alone passes that.
 *      A layer can also keep answering 200 while quietly dropping a field it
 *      used to publish, which leaves the parser reading an absent attribute.
 *
 * So this checks all of it: the status, an ArcGIS error inside a 200 body, and
 * that every attribute the service asks for in `outFields` actually comes back
 * on a feature.
 *
 * Deliberately **not** in `pnpm run check`, `pnpm run security` or any
 * workflow, for the same reasons `security/scripts/check-store-urls.mjs` is
 * not: it calls third-party hosts over the network, so wiring it into the
 * pipeline would make every pull request depend on someone else's service
 * being up. A cron workflow is not an option either — see the "no scheduled
 * GitHub Actions" policy in CLAUDE.md. It is an on-demand check, run before a
 * submission or when a feed is suspected dead:
 *
 *   pnpm run threats:check
 *
 * The URLs are read from the service modules rather than copied here, so the
 * check cannot drift from what the app actually requests.
 *
 * Exit codes, matching check-store-urls.mjs:
 *   0  every feed answered 200 and returned every attribute it asked for
 *   1  at least one answered 200 but is missing a requested attribute
 *   2  at least one could not be reached, or did not answer 200
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const TIMEOUT_MS = 30000;

/**
 * The feeds to check, and where each one's URL is declared.
 *
 * `urlConst` is the `const` whose string literal holds the query URL. Reading
 * it from the source keeps this check honest: it tests the URL the app uses,
 * not a second copy that can quietly disagree.
 */
const FEEDS = [
  {
    name: "USFS/NIFC wildfire perimeters",
    source: join(
      ROOT,
      "apps",
      "mobile",
      "services",
      "threats",
      "USFSService.ts",
    ),
    urlConst: "NIFC_URL",
  },
];

/**
 * Extracts a feed URL from a service module's source.
 *
 * @param file - Absolute path to the service module.
 * @param name - The `const` holding the URL string literal.
 * @returns The URL.
 */
function readFeedUrl(file, name) {
  const src = readFileSync(file, "utf8");
  // `const NAME =\n  "https://...";` — the literal may sit on the next line.
  const re = new RegExp(`const\\s+${name}\\s*=\\s*\\n?\\s*"([^"]+)"`, "u");
  const m = re.exec(src);
  if (!m?.[1]) {
    throw new Error(`could not find the ${name} string literal in ${file}`);
  }
  return m[1];
}

/**
 * Collects the attribute names a query URL asks ArcGIS for.
 *
 * `*` means "every field", which cannot go missing, so it yields nothing to
 * check.
 *
 * @param url - The feed query URL.
 * @returns The requested attribute names.
 */
function requestedFields(url) {
  const raw = new URL(url).searchParams.get("outFields");
  if (!raw || raw.trim() === "*") return [];
  return raw
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f !== "" && f !== "OBJECTID");
}

/**
 * Checks one feed's status and attributes.
 *
 * @param feed - The feed descriptor.
 * @returns The worst exit code this feed justifies.
 */
async function checkFeed(feed) {
  let url;
  try {
    url = readFeedUrl(feed.source, feed.urlConst);
  } catch (err) {
    console.error(`FAIL ${feed.name}: ${err.message}`);
    return 2;
  }

  const { hostname, pathname } = new URL(url);
  console.log(`\n${feed.name}`);
  console.log(`  ${hostname}${pathname}`);

  let resp;
  try {
    resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    console.error(`  UNREACHABLE: ${err.message}`);
    return 2;
  }

  if (!resp.ok) {
    console.error(`  HTTP ${String(resp.status)} — the feed is not answering`);
    return 2;
  }

  let body;
  try {
    body = await resp.json();
  } catch (err) {
    console.error(`  HTTP 200 but the body is not JSON: ${err.message}`);
    return 2;
  }

  // An ArcGIS error arrives as HTTP 200 with an `error` object in the body, so
  // the status alone does not settle it.
  if (body?.error) {
    const { code, message } = body.error;
    console.error(
      `  HTTP 200 but ArcGIS reports an error: ${String(code)} ${String(message)}`,
    );
    return 2;
  }

  const features = Array.isArray(body?.features) ? body.features : null;
  if (!features) {
    console.error("  HTTP 200 but the body has no `features` array");
    return 2;
  }
  console.log(`  HTTP 200, ${String(features.length)} features`);

  if (features.length === 0) {
    // No active perimeters is a legitimate answer, so this is not a failure —
    // but it means the attributes cannot be checked this run.
    console.log("  no features, so the attribute check is inconclusive");
    return 0;
  }

  const want = requestedFields(url);
  const missing = want.filter((f) =>
    features.every((feat) => !(f in (feat?.properties ?? {}))),
  );

  for (const f of want) {
    const present = features.filter(
      (feat) => (feat?.properties ?? {})[f] !== undefined,
    ).length;
    const absent = missing.includes(f);
    console.log(
      `  ${absent ? "MISSING" : "ok     "} ${f} — on ${String(present)}/${String(features.length)} features`,
    );
  }

  if (missing.length > 0) {
    console.error(
      `  the layer publishes none of: ${missing.join(", ")} — ArcGIS drops an unknown outField silently, so the parser would read these as absent`,
    );
    return 1;
  }

  // A feature id is what the store and SQLite key on, and ArcGIS only sets it
  // when OBJECTID is requested.
  const withoutId = features.filter((feat) => feat?.id === undefined).length;
  if (withoutId > 0) {
    console.error(
      `  ${String(withoutId)}/${String(features.length)} features arrived with no id — is OBJECTID still in outFields?`,
    );
    return 1;
  }

  return 0;
}

let worst = 0;
for (const feed of FEEDS) {
  worst = Math.max(worst, await checkFeed(feed));
}

console.log(
  worst === 0
    ? "\nEvery threat feed answered and returned the attributes it asked for."
    : "\nAt least one threat feed is not serving what the app expects.",
);
process.exit(worst);
