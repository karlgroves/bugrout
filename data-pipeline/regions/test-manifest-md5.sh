#!/usr/bin/env bash
set -euo pipefail

# Test that build-manifest.sh publishes the map and routing archive MD5s (#292).
#
# The app checks each downloaded .pmtiles and .valhalla.tar.gz against these
# before it replaces anything on the device. If the projection drops them, the
# app silently falls back to the size check alone, so it is pinned here:
#   1. a package with both digests publishes pmtilesMd5 and valhallaMd5;
#   2. a package with no routing archive (size 0, empty digest) publishes no
#      valhallaMd5, rather than an empty string;
#   3. a package built before digests existed publishes neither.
#
# Usage: ./test-manifest-md5.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIPELINE_DIR="$(dirname "$SCRIPT_DIR")"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/zz/package"

# Write the fixture package manifest. $1 = sizes JSON, $2 = md5 JSON or "".
write_package() {
  python3 - "$WORK/zz/package/manifest.json" "$1" "$2" <<'PY'
import json, sys
m = {
    "regionId": "zz",
    "version": "2026.11.08",
    "generatedAt": 1790000000000,
    "region": {"id": "zz", "name": "Testland",
               "bbox": {"west": -1, "south": -1, "east": 1, "north": 1}},
    "sizes": json.loads(sys.argv[2]),
    "sha256": {"fuel": ""},
}
if sys.argv[3]:
    m["md5"] = json.loads(sys.argv[3])
with open(sys.argv[1], "w") as f:
    json.dump(m, f)
PY
}

# Print the published region's digest fields as "pmtiles|valhalla", with
# "-" for an absent field.
published_md5() {
  OUTPUT_DIR="$WORK" bash "$PIPELINE_DIR/build-manifest.sh" > /dev/null
  python3 - "$WORK/manifest.json" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    r = json.load(f)["regions"][0]
print(f"{r.get('pmtilesMd5', '-')}|{r.get('valhallaMd5', '-')}")
PY
}

PM="0123456789abcdef0123456789abcdef"
VH="fedcba9876543210fedcba9876543210"

write_package '{"pmtiles": 10, "valhalla": 20}' "{\"pmtiles\": \"$PM\", \"valhalla\": \"$VH\"}"
got="$(published_md5)"
[[ "$got" == "$PM|$VH" ]] || fail "both digests: expected '$PM|$VH', got '$got'"

write_package '{"pmtiles": 10, "valhalla": 0}' "{\"pmtiles\": \"$PM\", \"valhalla\": \"\"}"
got="$(published_md5)"
[[ "$got" == "$PM|-" ]] || fail "no routing archive: expected '$PM|-', got '$got'"

write_package '{"pmtiles": 10, "valhalla": 20}' ""
got="$(published_md5)"
[[ "$got" == "-|-" ]] || fail "pre-digest package: expected '-|-', got '$got'"

echo "PASS: archive MD5s (build-manifest.sh)"
