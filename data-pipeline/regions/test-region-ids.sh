#!/usr/bin/env bash
set -euo pipefail

# Test the region id → Geofabrik slug lookup, and the invariants that keep the
# pipeline's ids and the app's ids the same set of things (#241).
#
# The bug this pins: build-region.sh took a Geofabrik slug ("maryland") and
# used it as the region id, so a pipeline rebuild would have published Maryland
# under `maryland` while the app downloads `md`. An id that is not two letters
# also fails `ResourceSync.stateCodeFor`, which silently skips every NREL,
# USGS and shelter fetch for that region.
#
# Usage: ./test-region-ids.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIPELINE_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$PIPELINE_DIR")"
RESOLVE="${SCRIPT_DIR}/resolve-region.sh"
DEFINITIONS="${SCRIPT_DIR}/region-definitions.json"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

# --- The lookup resolves an id to its slug ---------------------------------

got="$("$RESOLVE" slug md)"
[[ "$got" == "maryland" ]] || fail "slug md: expected 'maryland', got '$got'"

got="$("$RESOLVE" slug ca)"
[[ "$got" == "california" ]] || fail "slug ca: expected 'california', got '$got'"

# --- A slug is rejected, and the message names the id to use ---------------

if out="$("$RESOLVE" slug maryland 2>&1)"; then
  fail "slug maryland: expected a non-zero exit, got success ('$out')"
fi
case "$out" in
  *"'md'"*) ;;
  *) fail "slug maryland: message should name 'md', got: $out" ;;
esac

# --- An unknown id is rejected ---------------------------------------------

if out="$("$RESOLVE" slug zz 2>&1)"; then
  fail "slug zz: expected a non-zero exit, got success ('$out')"
fi
case "$out" in
  *"unknown region id"*) ;;
  *) fail "slug zz: unexpected message: $out" ;;
esac

# --- The definition carries the fields the manifest publishes --------------

"$RESOLVE" definition md | python3 -c "
import json, sys
region = json.load(sys.stdin)
for field in ('id', 'name', 'bbox', 'geofabrikSlug'):
    assert field in region, f'definition md: missing {field}'
assert region['id'] == 'md', region['id']
for edge in ('west', 'south', 'east', 'north'):
    assert edge in region['bbox'], f'definition md: bbox missing {edge}'
assert region['bbox']['west'] < region['bbox']['east'], 'bbox west/east reversed'
assert region['bbox']['south'] < region['bbox']['north'], 'bbox south/north reversed'
"

# --- Every defined id is a postal code the app recognises ------------------
#
# Two letters is what ResourceSync.stateCodeFor requires, and the id has to be
# one of the app's seeded regions or a download would have nowhere to land.

python3 - "$DEFINITIONS" "$ROOT_DIR/apps/mobile/constants/regions.ts" <<'PY'
import json, re, sys

definitions, regions_ts = sys.argv[1], sys.argv[2]

with open(definitions) as f:
    regions = json.load(f)["regions"]

app_ids = set(re.findall(r'id:\s*"([a-z]{2})"', open(regions_ts).read()))
assert app_ids, f"no region ids parsed out of {regions_ts}"

for region in regions:
    region_id = region["id"]
    assert re.fullmatch(r"[a-z]{2}", region_id), (
        f"region id {region_id!r} is not a lowercase two-letter postal code; "
        "ResourceSync.stateCodeFor would reject it and skip every resource fetch"
    )
    assert region_id != region["geofabrikSlug"], (
        f"region {region_id!r} has its slug as its id — the #241 confusion"
    )
    assert region_id in app_ids, (
        f"region id {region_id!r} is not one of the app's seeded regions in "
        f"{regions_ts}; the app could not download it"
    )

ids = [r["id"] for r in regions]
assert len(ids) == len(set(ids)), f"duplicate region ids: {ids}"
assert "md" in ids, "Maryland is the only published region and must be defined"
PY

# --- download-extracts.sh: slug in the URL, id on disk ---------------------
#
# This is the one place both names appear, so it is where #241 would come
# back. A stub curl on PATH records the URL and creates the file, so nothing
# is downloaded.

STUB_DIR="$(mktemp -d)"
DOWNLOAD_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR" "$DOWNLOAD_DIR"' EXIT

cat > "$STUB_DIR/curl" <<'STUB'
#!/usr/bin/env bash
# Record the URL, create the requested output, download nothing.
out=""
url=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -L) shift ;;
    *) url="$1"; shift ;;
  esac
done
echo "$url" >> "$STUB_RECORD"
printf 'stub' > "$out"
STUB
chmod +x "$STUB_DIR/curl"

STUB_RECORD="$STUB_DIR/urls.txt"
export STUB_RECORD
: > "$STUB_RECORD"

PATH="$STUB_DIR:$PATH" \
  DOWNLOAD_OUTPUT_DIR="$DOWNLOAD_DIR" \
  "$PIPELINE_DIR/osm/download-extracts.sh" md > /dev/null

requested="$(cat "$STUB_RECORD")"
case "$requested" in
  *"/maryland-latest.osm.pbf") ;;
  *) fail "download url should use the geofabrik slug, got: $requested" ;;
esac

[[ -f "$DOWNLOAD_DIR/md-latest.osm.pbf" ]] ||
  fail "download should save under the region id (md-latest.osm.pbf)"
[[ ! -f "$DOWNLOAD_DIR/maryland-latest.osm.pbf" ]] ||
  fail "download must not save under the geofabrik slug"

# A pre-#241 extract named after the slug is reused, not re-downloaded.
: > "$STUB_RECORD"
rm -f "$DOWNLOAD_DIR/md-latest.osm.pbf"
printf 'legacy' > "$DOWNLOAD_DIR/maryland-latest.osm.pbf"
PATH="$STUB_DIR:$PATH" \
  DOWNLOAD_OUTPUT_DIR="$DOWNLOAD_DIR" \
  "$PIPELINE_DIR/osm/download-extracts.sh" md > /dev/null
[[ -s "$STUB_RECORD" ]] &&
  fail "a slug-named extract already on disk should be reused, not re-downloaded"
[[ "$(cat "$DOWNLOAD_DIR/md-latest.osm.pbf")" == "legacy" ]] ||
  fail "the legacy extract should have been renamed to the region id"

# --- `ids` lists every defined region --------------------------------------

count_listed="$("$RESOLVE" ids | wc -l | tr -d ' ')"
count_defined="$(python3 -c "
import json, sys
print(len(json.load(open(sys.argv[1]))['regions']))
" "$DEFINITIONS")"
[[ "$count_listed" == "$count_defined" ]] ||
  fail "ids listed $count_listed of $count_defined regions"

echo "PASS: test-region-ids.sh (id → slug lookup; ids are app postal codes)"
