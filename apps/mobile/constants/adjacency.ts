/**
 * Which regions share a land border with which (#268).
 *
 * ADR 0008's M2 offers the states next to the one you just downloaded, because
 * an evacuation crosses a state line as a matter of course and the download has
 * to happen before the signal goes. This is the adjacency that decides what is
 * offered.
 *
 * **Land borders only, and corners are not borders.** A pair that meets at a
 * single point — Arizona/Colorado and New Mexico/Utah at Four Corners — is left
 * out: nobody evacuates through a survey marker, and offering a 3 GB download
 * for one would be noise. Pairs separated by water are out for the same reason:
 * Michigan's neighbours are Indiana, Ohio and Wisconsin, not Minnesota or
 * Illinois across the lakes. Alaska and Hawaii have no neighbours.
 *
 * **The District of Columbia is included and is a neighbour of Maryland.**
 * #268's text names Maryland's neighbours as "Virginia, Pennsylvania, Delaware
 * and West Virginia" — four. There are five: `dc` is one of the 51 entries in
 * `regions.ts`, it shares a land border with Maryland, and Baltimore to
 * Washington is the likeliest cross-border trip a Maryland user makes. Omitting
 * it would be the one error in this table a user would actually hit.
 *
 * Keyed by the same two-letter ids as `DEFAULT_REGIONS` in `regions.ts` and as
 * the region ids the manifest publishes. `adjacency.test.ts` asserts the
 * relation is symmetric and that every id is a known region — the two mistakes
 * a hand-written table of this shape actually makes.
 *
 * The manifest may carry `neighbors` per region once the pipeline publishes it
 * (`data-pipeline/regions/region-definitions.json`). Where it does, it wins;
 * this is what the app falls back to, which is everything today, since the live
 * manifest predates the field.
 */

/** Land-border neighbours for each region id. */
export /**
 *
 */
const REGION_NEIGHBORS: Readonly<Record<string, readonly string[]>> = {
  al: ["fl", "ga", "ms", "tn"],
  ak: [],
  az: ["ca", "nm", "nv", "ut"],
  ar: ["la", "mo", "ms", "ok", "tn", "tx"],
  ca: ["az", "nv", "or"],
  co: ["ks", "ne", "nm", "ok", "ut", "wy"],
  ct: ["ma", "ny", "ri"],
  de: ["md", "nj", "pa"],
  dc: ["md", "va"],
  fl: ["al", "ga"],
  ga: ["al", "fl", "nc", "sc", "tn"],
  hi: [],
  id: ["mt", "nv", "or", "ut", "wa", "wy"],
  il: ["ia", "in", "ky", "mo", "wi"],
  in: ["il", "ky", "mi", "oh"],
  ia: ["il", "mn", "mo", "ne", "sd", "wi"],
  ks: ["co", "mo", "ne", "ok"],
  ky: ["il", "in", "mo", "oh", "tn", "va", "wv"],
  la: ["ar", "ms", "tx"],
  me: ["nh"],
  md: ["dc", "de", "pa", "va", "wv"],
  ma: ["ct", "nh", "ny", "ri", "vt"],
  mi: ["in", "oh", "wi"],
  mn: ["ia", "nd", "sd", "wi"],
  ms: ["al", "ar", "la", "tn"],
  mo: ["ar", "ia", "il", "ks", "ky", "ne", "ok", "tn"],
  mt: ["id", "nd", "sd", "wy"],
  ne: ["co", "ia", "ks", "mo", "sd", "wy"],
  nv: ["az", "ca", "id", "or", "ut"],
  nh: ["ma", "me", "vt"],
  nj: ["de", "ny", "pa"],
  nm: ["az", "co", "ok", "tx"],
  ny: ["ct", "ma", "nj", "pa", "vt"],
  nc: ["ga", "sc", "tn", "va"],
  nd: ["mn", "mt", "sd"],
  oh: ["in", "ky", "mi", "pa", "wv"],
  ok: ["ar", "co", "ks", "mo", "nm", "tx"],
  or: ["ca", "id", "nv", "wa"],
  pa: ["de", "md", "nj", "ny", "oh", "wv"],
  ri: ["ct", "ma"],
  sc: ["ga", "nc"],
  sd: ["ia", "mn", "mt", "nd", "ne", "wy"],
  tn: ["al", "ar", "ga", "ky", "mo", "ms", "nc", "va"],
  tx: ["ar", "la", "nm", "ok"],
  ut: ["az", "co", "id", "nv", "wy"],
  vt: ["ma", "nh", "ny"],
  va: ["dc", "ky", "md", "nc", "tn", "wv"],
  wa: ["id", "or"],
  wv: ["ky", "md", "oh", "pa", "va"],
  wi: ["ia", "il", "mi", "mn"],
  wy: ["co", "id", "mt", "ne", "sd", "ut"],
};
