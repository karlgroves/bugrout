#!/usr/bin/env bash
set -euo pipefail

# Build a region's on-device destination search index (#208).
#
# Destination search goes to the public Nominatim server, which the OSMF's
# usage policy does not allow as an app's default geocoder at scale, and which
# needs a network. This index ships with the region download instead, so the
# app can search addresses and places with no network and nothing leaving the
# device; Nominatim stays as the online fallback.
#
# The output is a SQLite database with an FTS5 index (expo-sqlite builds with
# FTS5 on both platforms):
#
#   meta(key, value)        version = "1", regionId, osmTimestamp
#   places(id, kind, name, housenumber, street, city, postcode, lat, lon)
#     kind: "address"  a node or building with addr:housenumber + addr:street
#           "place"    a settlement: city, town, village, hamlet, suburb,
#                      neighbourhood
#           "poi"      a named amenity, shop, tourism, leisure or healthcare
#                      feature, with its address when it carries one
#   places_fts              FTS5 over name, housenumber, street, city,
#                           postcode; external content (rowid = places.id)
#
# A way or relation's position is the centre of its bounding box, as Overpass
# computes `center` (and as extract-fuel.sh does).
#
# Not indexed: streets without addresses on them, and the city of a feature
# that has no addr:city tag (that needs a boundary join the pipeline does not
# have yet). Searching "Main Street" finds the addresses along it.
#
# Requires osmium-tool (macOS: brew install osmium-tool;
# Ubuntu: apt-get install osmium-tool) and python3 with sqlite3 FTS5.
#
# Usage: ./extract-geocode.sh <region-id> <output.sqlite> [input.osm.pbf]
#   The input defaults to output/<region-id>-latest.osm.pbf, where
#   download-extracts.sh puts it (#241); test-extract-geocode.sh passes a
#   fixture name and an explicit path instead.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGION_ID="${1:?Usage: $0 <region-id> <output.sqlite> [input.osm.pbf]}"
OUTPUT="${2:?Usage: $0 <region-id> <output.sqlite> [input.osm.pbf]}"
PBF="${3:-${SCRIPT_DIR}/output/${REGION_ID}-latest.osm.pbf}"

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

# Candidates plus the nodes their ways and relations need for a geometry. The
# key-only filters are wide on purpose; the Python below keeps only features
# that qualify (a POI needs a name, an address needs a street).
osmium tags-filter "$PBF" \
  nwr/addr:housenumber \
  n/place=city,town,village,hamlet,suburb,neighbourhood \
  nwr/amenity,shop,tourism,leisure,healthcare \
  --overwrite -o "$WORK_DIR/geocode.osm.pbf"

osmium export "$WORK_DIR/geocode.osm.pbf" \
  --geometry-types=point,linestring,polygon \
  --add-unique-id=type_id \
  --format=geojsonseq --overwrite -o "$WORK_DIR/geocode.geojsonseq"

OSM_TIMESTAMP="$(osmium fileinfo -g header.option.osmosis_replication_timestamp "$PBF" 2>/dev/null || true)"

rm -f "$OUTPUT"
python3 - "$WORK_DIR/geocode.geojsonseq" "$OUTPUT" "$REGION_ID" "$OSM_TIMESTAMP" <<'PY'
import json, sqlite3, sys

src, out, region_id, timestamp = sys.argv[1:5]
TYPES = {"n": "node", "w": "way", "r": "relation"}
PLACES = {"city", "town", "village", "hamlet", "suburb", "neighbourhood"}
POI_KEYS = ("amenity", "shop", "tourism", "leisure", "healthcare")


def points(coords):
    """Every [lon, lat] pair in a GeoJSON coordinate array, at any depth."""
    if coords and isinstance(coords[0], (int, float)):
        yield coords
    else:
        for c in coords:
            yield from points(c)


def kind_of(tags):
    if tags.get("name") and any(k in tags for k in POI_KEYS):
        return "poi"
    if tags.get("place") in PLACES and tags.get("name"):
        return "place"
    if tags.get("addr:housenumber") and tags.get("addr:street"):
        return "address"
    return None


rows = {}
with open(src) as f:
    for line in f:
        line = line.strip().lstrip("\x1e")  # geojsonseq record separator
        if not line:
            continue
        feature = json.loads(line)
        tags = feature.get("properties") or {}
        kind = kind_of(tags)
        if kind is None:
            continue
        fid = feature["id"]
        if fid[0] == "a":
            # An area: osmium numbers it 2 * id for a way, 2 * id + 1 for a
            # relation.
            area = int(fid[1:])
            key = ("relation" if area % 2 else "way", area // 2)
        else:
            key = (TYPES[fid[0]], int(fid[1:]))
        coords = list(points(feature["geometry"]["coordinates"]))
        lons = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        rows[key] = (
            kind,
            tags.get("name"),
            tags.get("addr:housenumber"),
            tags.get("addr:street"),
            tags.get("addr:city"),
            tags.get("addr:postcode"),
            round((min(lats) + max(lats)) / 2, 7),
            round((min(lons) + max(lons)) / 2, 7),
        )

db = sqlite3.connect(out)
db.executescript(
    """
    PRAGMA journal_mode = DELETE;
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE places (
      id INTEGER PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT,
      housenumber TEXT,
      street TEXT,
      city TEXT,
      postcode TEXT,
      lat REAL NOT NULL,
      lon REAL NOT NULL
    );
    CREATE VIRTUAL TABLE places_fts USING fts5(
      name, housenumber, street, city, postcode,
      content = 'places', content_rowid = 'id',
      tokenize = 'unicode61 remove_diacritics 2'
    );
    """
)
db.executemany(
    "INSERT INTO meta VALUES (?, ?)",
    [("version", "1"), ("regionId", region_id), ("osmTimestamp", timestamp or None)],
)
# Sorted by OSM type and id, so the same extract builds the same rows.
db.executemany(
    "INSERT INTO places (kind, name, housenumber, street, city, postcode, lat, lon)"
    " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [rows[k] for k in sorted(rows)],
)
db.execute("INSERT INTO places_fts (places_fts) VALUES ('rebuild')")
db.execute("INSERT INTO places_fts (places_fts) VALUES ('optimize')")
db.commit()
db.execute("VACUUM")
db.close()
print(f"  Geocode entries: {len(rows)}")
PY
