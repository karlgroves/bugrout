#!/usr/bin/env bash
set -euo pipefail

# Build a complete regional tile package for BugRout.
#
# End-to-end pipeline:
# 1. Download OSM PBF extract from Geofabrik
# 2. Build Valhalla routing tiles
# 3. Bake ELF weights into tiles
# 4. Build PMTiles for map rendering
# 5. Pre-fetch resource data (fuel, water, shelters)
# 6. Extract FEMA flood zone data
# 7. Assemble regional package
# 8. Upload to Cloudflare R2
#
# Usage: ./build-region.sh <state-slug> [--upload]
# Example: ./build-region.sh california
#          ./build-region.sh california --upload

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE="${1:?Usage: $0 <state-slug> [--upload]}"
UPLOAD="${2:-}"

OUTPUT_DIR="$SCRIPT_DIR/output/$STATE"
PACKAGE_DIR="$OUTPUT_DIR/package"

echo "========================================"
echo "  BugRout Regional Package Builder"
echo "  State: $STATE"
echo "  $(date)"
echo "========================================"
echo ""

mkdir -p "$PACKAGE_DIR"

# --- Step 1: Download OSM ---
echo "=== Step 1/7: Download OSM extract ==="
"$SCRIPT_DIR/osm/download-extracts.sh" "$STATE"
PBF="$SCRIPT_DIR/osm/output/${STATE}-latest.osm.pbf"

if [[ ! -f "$PBF" ]]; then
  echo "FATAL: PBF not found at $PBF"
  exit 1
fi
echo "  PBF: $(du -h "$PBF" | cut -f1)"
echo ""

# --- Step 2: Build Valhalla tiles ---
echo "=== Step 2/7: Build Valhalla routing tiles ==="
"$SCRIPT_DIR/osm/build-routing-tiles.sh" "$STATE"
echo ""

# --- Step 3: Bake ELF weights ---
echo "=== Step 3/7: Bake ELF weights ==="
"$SCRIPT_DIR/elf/bake-elf-weights.sh" "$STATE"
echo ""

# --- Step 4: Build PMTiles ---
echo "=== Step 4/7: Build PMTiles for map rendering ==="
"$SCRIPT_DIR/osm/build-pmtiles.sh" "$STATE"
echo ""

# --- Step 5: Pre-fetch resource data ---
echo "=== Step 5/7: Pre-fetch resource data ==="
# Get state code from region definitions
STATE_CODE=$(python3 -c "
import json
with open('$SCRIPT_DIR/regions/region-definitions.json') as f:
    data = json.load(f)
for r in data['regions']:
    if r['geofabrikSlug'] == '$STATE' or r['id'] == '$STATE':
        # Two-letter state code from ID
        print(r['id'].upper())
        break
" 2>/dev/null || echo "")

if [[ -n "$STATE_CODE" ]]; then
  echo "  State code: $STATE_CODE"

  # Fetch NREL fuel stations
  NREL_KEY="${NREL_API_KEY:?Error: NREL_API_KEY environment variable is required. Get one at https://developer.nrel.gov/signup/}"
  echo "  Fetching fuel stations from NREL..."
  curl -s "https://developer.nrel.gov/api/alt-fuel-stations/v1.json?api_key=${NREL_KEY}&state=$STATE_CODE&fuel_type=ELEC,E85,LPG,BD,CNG&status=E&access=public&limit=10000&format=json" \
    -o "$PACKAGE_DIR/${STATE}.fuel.json" 2>/dev/null || echo "  (NREL fetch failed — will use empty)"

  # Fetch USGS water sources
  echo "  Fetching water sources from USGS..."
  curl -s "https://waterservices.usgs.gov/nwis/site/?format=rdb&stateCd=$STATE_CODE&siteType=ST,SP&siteStatus=active" \
    -o "$PACKAGE_DIR/${STATE}.water.rdb" 2>/dev/null || echo "  (USGS fetch failed — will use empty)"
else
  echo "  State code not found — skipping resource pre-fetch"
fi
echo ""

# --- Step 6: Extract flood zones ---
echo "=== Step 6/7: Extract FEMA flood zone data ==="
# FEMA NFHL data requires downloading state-level shapefiles and converting to GeoJSON.
# For the pipeline, we generate a placeholder that will be replaced with real data.
FLOOD_FILE="$PACKAGE_DIR/${STATE}.flood.geojson"
if [[ ! -f "$FLOOD_FILE" ]]; then
  echo '{"type":"FeatureCollection","features":[]}' > "$FLOOD_FILE"
  echo "  Created placeholder flood GeoJSON (replace with real FEMA NFHL data)"
  echo "  To get real data: download from https://msc.fema.gov/portal/advanceSearch"
fi
echo ""

# --- Step 7: Assemble package ---
echo "=== Step 7/7: Assemble regional package ==="

# Copy PMTiles
PMTILES_SRC="$SCRIPT_DIR/osm/output/pmtiles/${STATE}.pmtiles"
if [[ -f "$PMTILES_SRC" ]]; then
  cp "$PMTILES_SRC" "$PACKAGE_DIR/${STATE}.pmtiles"
  echo "  PMTiles: $(du -h "$PACKAGE_DIR/${STATE}.pmtiles" | cut -f1)"
fi

# Package Valhalla tiles as a tile_extract archive, gzipped for transport.
# IMPORTANT: a plain `tar` of the tile directory is NOT loadable via
# mjolnir.tile_extract — the on-device engine mmaps the archive and parses each
# member name into a GraphId, which requires the indexed layout that
# valhalla_build_extract writes. (Flags assume Valhalla 3.x: --config / --overwrite;
# confirm against the installed valhalla-bin version.)
VALHALLA_SRC="$SCRIPT_DIR/elf/output/${STATE}/valhalla-tiles"
if [[ -d "$VALHALLA_SRC" ]]; then
  EXTRACT_TAR="$PACKAGE_DIR/${STATE}.valhalla.tar"
  EXTRACT_CONFIG="$PACKAGE_DIR/.valhalla-extract-config.json"
  python3 - "$VALHALLA_SRC" "$EXTRACT_TAR" "$EXTRACT_CONFIG" <<'PY'
import json, sys
tile_dir, tar, out = sys.argv[1], sys.argv[2], sys.argv[3]
with open(out, "w") as f:
    json.dump({"mjolnir": {"tile_dir": tile_dir, "tile_extract": tar}}, f)
PY
  valhalla_build_extract --config "$EXTRACT_CONFIG" --overwrite
  gzip -f "$EXTRACT_TAR"           # → ${STATE}.valhalla.tar.gz
  rm -f "$EXTRACT_CONFIG"
  echo "  Valhalla: $(du -h "$PACKAGE_DIR/${STATE}.valhalla.tar.gz" | cut -f1)"
fi

# Copy ELF weights
ELF_SRC="$SCRIPT_DIR/elf/output/${STATE}/elf-weights.json"
if [[ -f "$ELF_SRC" ]]; then
  cp "$ELF_SRC" "$PACKAGE_DIR/"
fi

# Generate package manifest
REGION_DEF=$(python3 -c "
import json
with open('$SCRIPT_DIR/regions/region-definitions.json') as f:
    data = json.load(f)
for r in data['regions']:
    if r['geofabrikSlug'] == '$STATE' or r['id'] == '$STATE':
        print(json.dumps(r))
        break
" 2>/dev/null || echo '{}')

PMTILES_SIZE=$(stat -f%z "$PACKAGE_DIR/${STATE}.pmtiles" 2>/dev/null || stat --format=%s "$PACKAGE_DIR/${STATE}.pmtiles" 2>/dev/null || echo "0")
VALHALLA_SIZE=$(stat -f%z "$PACKAGE_DIR/${STATE}.valhalla.tar.gz" 2>/dev/null || stat --format=%s "$PACKAGE_DIR/${STATE}.valhalla.tar.gz" 2>/dev/null || echo "0")

cat > "$PACKAGE_DIR/manifest.json" << EOF
{
  "regionId": "$STATE",
  "version": "$(date +%Y.%m.%d)",
  "generatedAt": $(date +%s)000,
  "region": $REGION_DEF,
  "files": {
    "pmtiles": "${STATE}.pmtiles",
    "valhalla": "${STATE}.valhalla.tar.gz",
    "elfWeights": "elf-weights.json",
    "flood": "${STATE}.flood.geojson",
    "fuel": "${STATE}.fuel.json",
    "water": "${STATE}.water.rdb"
  },
  "sizes": {
    "pmtiles": $PMTILES_SIZE,
    "valhalla": $VALHALLA_SIZE
  }
}
EOF

echo "  Manifest: $PACKAGE_DIR/manifest.json"
echo ""

# --- Upload to R2 (optional) ---
if [[ "$UPLOAD" == "--upload" ]]; then
  echo "=== Uploading to Cloudflare R2 ==="

  if ! command -v wrangler &> /dev/null; then
    echo "Error: wrangler CLI not found. Install with: npm install -g wrangler"
    exit 1
  fi

  BUCKET="bugrout-tiles"

  echo "  Uploading PMTiles..."
  wrangler r2 object put "$BUCKET/${STATE}/${STATE}.pmtiles" \
    --file "$PACKAGE_DIR/${STATE}.pmtiles" \
    --content-type "application/octet-stream"

  echo "  Uploading Valhalla tiles..."
  wrangler r2 object put "$BUCKET/${STATE}/${STATE}.valhalla.tar.gz" \
    --file "$PACKAGE_DIR/${STATE}.valhalla.tar.gz" \
    --content-type "application/gzip"

  echo "  Uploading flood zones..."
  wrangler r2 object put "$BUCKET/${STATE}/${STATE}.flood.geojson" \
    --file "$PACKAGE_DIR/${STATE}.flood.geojson" \
    --content-type "application/geo+json"

  echo "  Uploading resource data..."
  for f in "${STATE}.fuel.json" "${STATE}.water.rdb" "elf-weights.json"; do
    if [[ -f "$PACKAGE_DIR/$f" ]]; then
      wrangler r2 object put "$BUCKET/${STATE}/$f" \
        --file "$PACKAGE_DIR/$f"
    fi
  done

  echo "  Uploading manifest..."
  wrangler r2 object put "$BUCKET/${STATE}/manifest.json" \
    --file "$PACKAGE_DIR/manifest.json" \
    --content-type "application/json"

  echo "  Upload complete."
fi

echo ""
echo "========================================"
echo "  Package complete: $PACKAGE_DIR"
echo "  Contents:"
ls -lh "$PACKAGE_DIR/" | tail -n +2
echo "========================================"
