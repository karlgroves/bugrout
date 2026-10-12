#!/usr/bin/env bash
set -euo pipefail

# Extract a state's fuel stations (OSM amenity=fuel) for its region package.
#
# The app shows these with no network and no API key (#200). The output has
# the shape of an Overpass `out center tags` answer, which is what the app gets
# when it refreshes the layer online, so one mapping (FuelService.toStation)
# reads both and the two sources can't drift apart:
#
#   {
#     "version": 1,
#     "osmTimestamp": "2026-09-28T20:21:42Z",   # the extract's data date
#     "elements": [
#       { "type": "node", "id": 1, "lat": 39.2, "lon": -76.6, "tags": {...} },
#       { "type": "way",  "id": 2, "center": { "lat": ..., "lon": ... }, "tags": {...} }
#     ]
#   }
#
# A way or relation's centre is the centre of its bounding box, as Overpass
# computes `center`. Most stations are mapped as buildings, so this matters:
# 34 of 39 stations in central Baltimore were ways on 2026-10-11.
#
# Requires osmium-tool (macOS: brew install osmium-tool;
# Ubuntu: apt-get install osmium-tool) and python3.
#
# Usage: ./extract-fuel.sh <state-slug> <output.json> [input.osm.pbf]
#   The input defaults to output/<state-slug>-latest.osm.pbf, where
#   download-extracts.sh puts it; test-extract-fuel.sh passes a fixture.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE="${1:?Usage: $0 <state-slug> <output.json> [input.osm.pbf]}"
OUTPUT="${2:?Usage: $0 <state-slug> <output.json> [input.osm.pbf]}"
PBF="${3:-${SCRIPT_DIR}/output/${STATE}-latest.osm.pbf}"

if [[ ! -f "$PBF" ]]; then
  echo "Error: PBF not found at ${PBF}. Run download-extracts.sh first."
  exit 1
fi
if ! command -v osmium &> /dev/null; then
  echo "Error: osmium not found. Install osmium-tool first."
  echo "  macOS: brew install osmium-tool"
  echo "  Ubuntu: apt-get install osmium-tool"
  exit 1
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# Stations plus the nodes their ways and relations need for a geometry.
osmium tags-filter "$PBF" nwr/amenity=fuel \
  --overwrite -o "$WORK_DIR/fuel.osm.pbf"

# One GeoJSON feature per station, id "n123" / "w123" / "r123". A closed way
# becomes a polygon, a multipolygon relation an area; anything osmium can't
# build a geometry for is skipped with a warning rather than failing the build.
osmium export "$WORK_DIR/fuel.osm.pbf" \
  --geometry-types=point,linestring,polygon \
  --add-unique-id=type_id \
  --format=geojsonseq --overwrite -o "$WORK_DIR/fuel.geojsonseq"

# Geofabrik extracts record the data date in the header; empty for a file
# without one, in which case the app falls back to the package's build time.
OSM_TIMESTAMP="$(osmium fileinfo -g header.option.osmosis_replication_timestamp "$PBF" 2>/dev/null || true)"

python3 - "$WORK_DIR/fuel.geojsonseq" "$OUTPUT" "$OSM_TIMESTAMP" <<'PY'
import json, sys

src, out, timestamp = sys.argv[1], sys.argv[2], sys.argv[3]
TYPES = {"n": "node", "w": "way", "r": "relation"}


def points(coords):
    """Every [lon, lat] pair in a GeoJSON coordinate array, at any depth."""
    if coords and isinstance(coords[0], (int, float)):
        yield coords
    else:
        for c in coords:
            yield from points(c)


elements = {}
with open(src) as f:
    for line in f:
        line = line.strip().lstrip("\x1e")  # geojsonseq record separator
        if not line:
            continue
        feature = json.loads(line)
        # tags-filter also keeps the nodes a station's outline needs, and
        # export writes any of them that carry tags: an entrance, a pump. Only
        # the stations themselves are wanted.
        if (feature.get("properties") or {}).get("amenity") != "fuel":
            continue
        fid = feature["id"]
        if fid[0] == "a":
            # An area: osmium numbers it 2 * id for a way, 2 * id + 1 for a
            # relation.
            area = int(fid[1:])
            el = {"type": "relation" if area % 2 else "way", "id": area // 2}
        else:
            el = {"type": TYPES[fid[0]], "id": int(fid[1:])}
        coords = list(points(feature["geometry"]["coordinates"]))
        if el["type"] == "node":
            el["lon"], el["lat"] = coords[0]
        else:
            lons = [c[0] for c in coords]
            lats = [c[1] for c in coords]
            el["center"] = {
                "lat": round((min(lats) + max(lats)) / 2, 7),
                "lon": round((min(lons) + max(lons)) / 2, 7),
            }
        el["tags"] = feature.get("properties") or {}
        # A way can appear twice (as a line and as an area); keep one.
        elements[(el["type"], el["id"])] = el

ordered = [elements[k] for k in sorted(elements)]
# ASCII output (json's default ensure_ascii): the app hashes the text it reads
# back, and for ASCII that is byte-for-byte the file the manifest's SHA-256
# was taken from.
with open(out, "w") as f:
    json.dump(
        {"version": 1, "osmTimestamp": timestamp or None, "elements": ordered},
        f,
        separators=(",", ":"),
        sort_keys=True,
    )
print(f"  Fuel stations: {len(ordered)}")
PY
