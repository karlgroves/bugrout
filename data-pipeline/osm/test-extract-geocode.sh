#!/usr/bin/env bash
set -euo pipefail

# Test extract-geocode.sh against a small OSM fixture (#208).
#
# Covers what on-device search relies on: an address mapped as a node and as a
# building (with an Overpass-style centre), a settlement, and a named POI all
# come out with the right kind; an unnamed amenity, a house number with no
# street and a place type that is not a settlement do not; the FTS index
# answers a prefix search and ignores diacritics; and the meta table carries
# the format version, region id and the extract's data date.
#
# Requires osmium-tool and python3, like the pipeline itself.
#
# Usage: ./test-extract-geocode.sh [save-output-to]
#   With a path, also saves the built index there, for the app's tests to use
#   as their fixture.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

cat > "$WORK_DIR/fixture.osm" <<'OSM'
<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="test-extract-geocode">
  <!-- In OSM file order (nodes, then ways, each by id), which osmium
       requires. -->
  <!-- An address mapped as a point. -->
  <node id="1" version="1" lat="39.29" lon="-76.61">
    <tag k="addr:housenumber" v="100"/>
    <tag k="addr:street" v="North Charles Street"/>
    <tag k="addr:city" v="Baltimore"/>
    <tag k="addr:postcode" v="21201"/>
  </node>
  <!-- A settlement. -->
  <node id="2" version="1" lat="39.41" lon="-76.78">
    <tag k="place" v="town"/>
    <tag k="name" v="Owings Mills"/>
  </node>
  <!-- A named POI with a diacritic, to check search folds it. -->
  <node id="3" version="1" lat="39.28" lon="-76.60">
    <tag k="amenity" v="cafe"/>
    <tag k="name" v="Café Hon"/>
  </node>
  <!-- An unnamed amenity: nothing to search for. -->
  <node id="4" version="1" lat="39.27" lon="-76.59">
    <tag k="amenity" v="bench"/>
  </node>
  <!-- A house number with no street. -->
  <node id="5" version="1" lat="39.26" lon="-76.58">
    <tag k="addr:housenumber" v="7"/>
  </node>
  <!-- A place that is not a settlement. -->
  <node id="6" version="1" lat="39.25" lon="-76.57">
    <tag k="place" v="isolated_dwelling"/>
    <tag k="name" v="Lone House"/>
  </node>
  <!-- Outline of way 100. -->
  <node id="10" version="1" lat="39.00" lon="-76.00"/>
  <node id="11" version="1" lat="39.00" lon="-75.98"/>
  <node id="12" version="1" lat="39.04" lon="-75.98"/>
  <node id="13" version="1" lat="39.04" lon="-76.00"/>
  <!-- An address mapped as a building. -->
  <way id="100" version="1">
    <nd ref="10"/><nd ref="11"/><nd ref="12"/><nd ref="13"/><nd ref="10"/>
    <tag k="building" v="house"/>
    <tag k="addr:housenumber" v="42"/>
    <tag k="addr:street" v="Ocean Gateway"/>
  </way>
</osm>
OSM

osmium cat "$WORK_DIR/fixture.osm" \
  --output-header=osmosis_replication_timestamp=2026-09-28T20:23:05Z \
  --overwrite -o "$WORK_DIR/fixture.osm.pbf"

"$SCRIPT_DIR/extract-geocode.sh" fixture "$WORK_DIR/geocode.sqlite" "$WORK_DIR/fixture.osm.pbf"

python3 - "$WORK_DIR/geocode.sqlite" <<'PY'
import sqlite3, sys

db = sqlite3.connect(sys.argv[1])
failures = []


def check(label, actual, expected):
    if actual != expected:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


def search(query):
    return [
        r[0]
        for r in db.execute(
            "SELECT IFNULL(p.name, '') || '|' || IFNULL(p.housenumber, '') || '|' || IFNULL(p.street, '')"
            " FROM places_fts JOIN places p ON p.id = places_fts.rowid"
            " WHERE places_fts MATCH ? ORDER BY rank",
            (query,),
        )
    ]


meta = dict(db.execute("SELECT key, value FROM meta"))
check("meta", meta, {"version": "1", "regionId": "fixture", "osmTimestamp": "2026-09-28T20:23:05Z"})

rows = {
    (r[0], r[1] or r[3]): r
    for r in db.execute("SELECT kind, name, housenumber, street, city, postcode, lat, lon FROM places")
}
check(
    "entries",
    sorted(rows),
    [("address", "North Charles Street"), ("address", "Ocean Gateway"), ("place", "Owings Mills"), ("poi", "Café Hon")],
)
check(
    "point address",
    rows.get(("address", "North Charles Street")),
    ("address", None, "100", "North Charles Street", "Baltimore", "21201", 39.29, -76.61),
)
building = rows.get(("address", "Ocean Gateway"), ())
check("building centre", building[-2:], (39.02, -75.99))
check("building number", building[2:3], ("42",))

check("prefix search", search('"100" "charl"*'), ["|100|North Charles Street"])
check("place search", search('"owings"*'), ["Owings Mills||"])
check("diacritics folded", search('"cafe"*'), ["Café Hon||"])
check("no match", search('"nowhere"*'), [])

if failures:
    print("FAIL")
    for f in failures:
        print("  " + f)
    sys.exit(1)
print("PASS: extract-geocode.sh (4 entries; bench, bare number and dwelling left out)")
PY

if [[ -n "${1:-}" ]]; then
  cp "$WORK_DIR/geocode.sqlite" "$1"
  echo "  Saved: $1"
fi
