#!/usr/bin/env bash
set -euo pipefail

# Test extract-fuel.sh against a small OSM fixture (#200).
#
# Covers what the app relies on: a station mapped as a point, as a building
# (closed way) and as a multipolygon all come out, with an Overpass-style
# centre for the areas; a tagged node inside a station's outline (an entrance)
# and a non-fuel amenity do not; and the extract's data date is carried over.
#
# Requires osmium-tool and python3, like the pipeline itself.
#
# Usage: ./test-extract-fuel.sh [save-output-to]
#   With a path, also saves the extracted file there. The app's tests read
#   this script's output as their fixture, so the two sides are tested against
#   one format:
#     ./test-extract-fuel.sh apps/mobile/__tests__/fixtures/fuel-package.json

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

cat > "$WORK_DIR/fixture.osm" <<'OSM'
<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="test-extract-fuel">
  <!-- In OSM file order (nodes, then ways, then relations, each by id), which
       osmium requires. -->
  <!-- A station mapped as a point. -->
  <node id="1" version="1" lat="39.30" lon="-76.60">
    <tag k="amenity" v="fuel"/>
    <tag k="name" v="Point Station"/>
    <tag k="brand" v="Shell"/>
  </node>
  <!-- A non-fuel amenity: must be left out. -->
  <node id="2" version="1" lat="39.31" lon="-76.61">
    <tag k="amenity" v="cafe"/>
  </node>
  <!-- Outline of way 100. Node 11 is a tagged entrance, which must not come
       out as a station of its own. -->
  <node id="10" version="1" lat="39.00" lon="-76.00"/>
  <node id="11" version="1" lat="39.00" lon="-75.98">
    <tag k="entrance" v="main"/>
  </node>
  <node id="12" version="1" lat="39.04" lon="-75.98"/>
  <node id="13" version="1" lat="39.04" lon="-76.00"/>
  <!-- Outline of relation 300. -->
  <node id="20" version="1" lat="38.00" lon="-77.00"/>
  <node id="21" version="1" lat="38.00" lon="-76.90"/>
  <node id="22" version="1" lat="38.02" lon="-76.90"/>
  <node id="23" version="1" lat="38.02" lon="-77.00"/>
  <!-- A station mapped as a building. -->
  <way id="100" version="1">
    <nd ref="10"/><nd ref="11"/><nd ref="12"/><nd ref="13"/><nd ref="10"/>
    <tag k="amenity" v="fuel"/>
    <tag k="building" v="yes"/>
    <tag k="name" v="Building Station"/>
    <tag k="fuel:diesel" v="yes"/>
  </way>
  <way id="200" version="1">
    <nd ref="20"/><nd ref="21"/><nd ref="22"/><nd ref="23"/><nd ref="20"/>
  </way>
  <!-- A station mapped as a multipolygon. -->
  <relation id="300" version="1">
    <member type="way" ref="200" role="outer"/>
    <tag k="type" v="multipolygon"/>
    <tag k="amenity" v="fuel"/>
    <tag k="name" v="Relation Station"/>
  </relation>
</osm>
OSM

osmium cat "$WORK_DIR/fixture.osm" \
  --output-header=osmosis_replication_timestamp=2026-09-28T20:23:05Z \
  --overwrite -o "$WORK_DIR/fixture.osm.pbf"

"$SCRIPT_DIR/extract-fuel.sh" fixture "$WORK_DIR/fuel.json" "$WORK_DIR/fixture.osm.pbf"

python3 - "$WORK_DIR/fuel.json" <<'PY'
import json, sys

data = json.load(open(sys.argv[1]))
failures = []


def check(label, actual, expected):
    if actual != expected:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


check("version", data["version"], 1)
check("osmTimestamp", data["osmTimestamp"], "2026-09-28T20:23:05Z")
by_key = {(e["type"], e["id"]): e for e in data["elements"]}
check("stations", sorted(by_key), [("node", 1), ("relation", 300), ("way", 100)])

point = by_key.get(("node", 1), {})
check("point position", (point.get("lat"), point.get("lon")), (39.3, -76.6))
check("point brand", point.get("tags", {}).get("brand"), "Shell")
check("point has no centre", "center" in point, False)

building = by_key.get(("way", 100), {})
check("building centre", building.get("center"), {"lat": 39.02, "lon": -75.99})
check("building diesel", building.get("tags", {}).get("fuel:diesel"), "yes")

relation = by_key.get(("relation", 300), {})
check("relation centre", relation.get("center"), {"lat": 38.01, "lon": -76.95})
check("relation name", relation.get("tags", {}).get("name"), "Relation Station")

if failures:
    print("FAIL")
    for f in failures:
        print("  " + f)
    sys.exit(1)
print("PASS: extract-fuel.sh (3 stations; entrance node and cafe left out)")
PY

if [[ -n "${1:-}" ]]; then
  cp "$WORK_DIR/fuel.json" "$1"
  echo "  Saved: $1"
fi
