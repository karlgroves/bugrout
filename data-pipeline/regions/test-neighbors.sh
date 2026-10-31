#!/usr/bin/env bash
set -euo pipefail

# Test the land-border adjacency the pipeline publishes (#268, ADR 0008's M2).
#
# The app offers the states next to a region once it is downloaded. It has its
# own adjacency table and falls back to it, because the live manifest predates
# the field — but when the manifest *does* carry `neighbors`, the manifest wins.
# So a `neighbors` list that reaches the manifest malformed silently overrides a
# correct table with a broken one, and the app has no way to tell.
#
# Two things are pinned here:
#   1. every id in region-definitions.json's `neighbors` is a region id of the
#      shape the app accepts (two lowercase letters — `ResourceSync.stateCodeFor`
#      rejects anything else), and no region is its own neighbour;
#   2. build-manifest.sh actually carries the list through. build-region.sh
#      embeds the whole definition as the package manifest's `region`, so the
#      field arrives for free and the only place it can be dropped is the
#      published manifest's projection.
#
# Usage: ./test-neighbors.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIPELINE_DIR="$(dirname "$SCRIPT_DIR")"
DEFINITIONS="${SCRIPT_DIR}/region-definitions.json"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

# --- Every neighbour is a well-formed region id, and never the region itself --

bad="$(python3 - "$DEFINITIONS" <<'PY'
import json, re, sys

with open(sys.argv[1]) as f:
    regions = json.load(f)["regions"]

problems = []
for r in regions:
    neighbors = r.get("neighbors")
    if neighbors is None:
        problems.append(f"{r['id']}: no neighbors list")
        continue
    if not isinstance(neighbors, list):
        problems.append(f"{r['id']}: neighbors is not a list")
        continue
    for n in neighbors:
        if not isinstance(n, str) or not re.fullmatch(r"[a-z]{2}", n):
            problems.append(f"{r['id']}: bad neighbour id {n!r}")
        if n == r["id"]:
            problems.append(f"{r['id']}: lists itself")
    if len(set(neighbors)) != len(neighbors):
        problems.append(f"{r['id']}: duplicate neighbours")

print("\n".join(problems))
PY
)"
[[ -z "$bad" ]] || fail "region-definitions.json adjacency: $bad"

# --- build-manifest.sh carries `neighbors` into the published manifest -------

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/zz/package"
cat > "$WORK/zz/package/manifest.json" <<'PKG'
{
  "regionId": "zz",
  "version": "2026.10.28",
  "generatedAt": 1790000000000,
  "region": {
    "id": "zz",
    "name": "Testland",
    "bbox": { "west": -1, "south": -1, "east": 1, "north": 1 },
    "geofabrikSlug": "testland",
    "neighbors": ["ya", "yb"]
  },
  "sizes": { "pmtiles": 10, "valhalla": 20, "fuel": 30 },
  "sha256": { "fuel": "deadbeef" }
}
PKG

OUTPUT_DIR="$WORK" bash "$PIPELINE_DIR/build-manifest.sh" > /dev/null

got="$(python3 -c "
import json
with open('$WORK/manifest.json') as f:
    m = json.load(f)
print(','.join(m['regions'][0].get('neighbors', [])))
")"
[[ "$got" == "ya,yb" ]] || fail "published manifest neighbors: expected 'ya,yb', got '$got'"

# --- A package with no `neighbors` publishes none, rather than an empty list -
#
# The app distinguishes them: absent means "no adjacency published, use the
# built-in table", while an empty list means "published, and this region has no
# land neighbours" — Alaska and Hawaii.

python3 - "$WORK/zz/package/manifest.json" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    m = json.load(f)
del m["region"]["neighbors"]
with open(sys.argv[1], "w") as f:
    json.dump(m, f)
PY

OUTPUT_DIR="$WORK" bash "$PIPELINE_DIR/build-manifest.sh" > /dev/null

absent="$(python3 -c "
import json
with open('$WORK/manifest.json') as f:
    m = json.load(f)
print('neighbors' in m['regions'][0])
")"
[[ "$absent" == "False" ]] || fail "a package with no neighbors must publish no neighbors field"

echo "PASS: region adjacency (region-definitions.json + build-manifest.sh)"
