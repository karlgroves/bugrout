#!/usr/bin/env bash
set -euo pipefail

# Build a complete regional tile package for BugRout.
#
# End-to-end pipeline:
# 1. Download OSM PBF extract from Geofabrik
# 2. Build Valhalla routing tiles
# 3. Bake ELF weights into tiles
# 4. Build PMTiles for map rendering
# 5. Extract fuel stations from OSM; pre-fetch water sources
# 6. Extract FEMA flood zone data
# 7. Assemble regional package
# 8. Upload to Cloudflare R2
#
# Keyed by **region id** — the lowercase two-letter postal code the app uses
# ("md"), not the Geofabrik slug ("maryland"). The slug is resolved from
# regions/region-definitions.json for the download alone; the id names the
# PBF, every intermediate, every package file, the manifest's `regionId` and
# the R2 prefix. Publishing under a slug would put the package somewhere the
# app does not look and give it an id `ResourceSync.stateCodeFor` rejects,
# skipping every resource lookup (#241).
#
# Usage: ./build-region.sh <region-id> [--upload]
# Example: ./build-region.sh md
#          ./build-region.sh md --upload

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGION_ID="${1:?Usage: $0 <region-id> [--upload]}"
UPLOAD="${2:-}"

# Fails loudly on an unknown id, and names the id to use when handed a slug.
REGION_DEF="$("$SCRIPT_DIR/regions/resolve-region.sh" definition "$REGION_ID")"
REGION_NAME="$(printf '%s' "$REGION_DEF" | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')"

OUTPUT_DIR="$SCRIPT_DIR/output/$REGION_ID"
PACKAGE_DIR="$OUTPUT_DIR/package"

echo "========================================"
echo "  BugRout Regional Package Builder"
echo "  Region: $REGION_ID ($REGION_NAME)"
echo "  $(date)"
echo "========================================"
echo ""

mkdir -p "$PACKAGE_DIR"

# --- Step 1: Download OSM ---
echo "=== Step 1/7: Download OSM extract ==="
"$SCRIPT_DIR/osm/download-extracts.sh" "$REGION_ID"
PBF="$SCRIPT_DIR/osm/output/${REGION_ID}-latest.osm.pbf"

if [[ ! -f "$PBF" ]]; then
  echo "FATAL: PBF not found at $PBF"
  exit 1
fi
echo "  PBF: $(du -h "$PBF" | cut -f1)"
echo ""

# --- Step 2: Build Valhalla tiles ---
echo "=== Step 2/7: Build Valhalla routing tiles ==="
"$SCRIPT_DIR/osm/build-routing-tiles.sh" "$REGION_ID"
echo ""

# --- Step 3: Bake ELF weights ---
echo "=== Step 3/7: Bake ELF weights ==="
"$SCRIPT_DIR/elf/bake-elf-weights.sh" "$REGION_ID"
echo ""

# --- Step 4: Build PMTiles ---
echo "=== Step 4/7: Build PMTiles for map rendering ==="
"$SCRIPT_DIR/osm/build-pmtiles.sh" "$REGION_ID"
echo ""

# --- Step 5: Pre-fetch resource data ---
echo "=== Step 5/7: Pre-fetch resource data ==="
# Gasoline and diesel stations from the extract itself (#200): no network and
# no API key, so the fuel layer works offline from the moment a region is
# downloaded. NREL's Alternative Fuel Stations API used to be fetched here; it
# has no gasoline or diesel stations, and the app adds its EV and alternative
# fuels at runtime when a key is configured.
FUEL_FILE="$PACKAGE_DIR/${REGION_ID}.fuel.json"
"$SCRIPT_DIR/osm/extract-fuel.sh" "$REGION_ID" "$FUEL_FILE"
# The region id is the postal code, so USGS's stateCd is just its uppercase.
# This used to re-read region-definitions.json and swallow every error with
# `2>/dev/null || echo ""`, which turned an unknown region into a silently
# skipped resource fetch. The id is validated above instead.
STATE_CODE=$(printf '%s' "$REGION_ID" | tr '[:lower:]' '[:upper:]')
echo "  State code: $STATE_CODE"

# Fetch USGS water sources
echo "  Fetching water sources from USGS..."
curl -s "https://waterservices.usgs.gov/nwis/site/?format=rdb&stateCd=$STATE_CODE&siteType=ST,SP&siteStatus=active" \
  -o "$PACKAGE_DIR/${REGION_ID}.water.rdb" 2>/dev/null || echo "  (USGS fetch failed — will use empty)"
echo ""

# --- Step 6: Extract flood zones ---
echo "=== Step 6/7: Extract FEMA flood zone data ==="
# FEMA NFHL data requires downloading state-level shapefiles and converting to GeoJSON.
# For the pipeline, we generate a placeholder that will be replaced with real data.
FLOOD_FILE="$PACKAGE_DIR/${REGION_ID}.flood.geojson"
if [[ ! -f "$FLOOD_FILE" ]]; then
  echo '{"type":"FeatureCollection","features":[]}' > "$FLOOD_FILE"
  echo "  Created placeholder flood GeoJSON (replace with real FEMA NFHL data)"
  echo "  To get real data: download from https://msc.fema.gov/portal/advanceSearch"
fi
echo ""

# --- Step 7: Assemble package ---
echo "=== Step 7/7: Assemble regional package ==="

# Copy PMTiles
PMTILES_SRC="$SCRIPT_DIR/osm/output/pmtiles/${REGION_ID}.pmtiles"
if [[ -f "$PMTILES_SRC" ]]; then
  cp "$PMTILES_SRC" "$PACKAGE_DIR/${REGION_ID}.pmtiles"
  echo "  PMTiles: $(du -h "$PACKAGE_DIR/${REGION_ID}.pmtiles" | cut -f1)"
fi

# Package Valhalla tiles as a tile_extract archive, gzipped for transport.
# IMPORTANT: a plain `tar` of the tile directory is NOT loadable via
# mjolnir.tile_extract — the on-device engine mmaps the archive and parses each
# member name into a GraphId, which requires the indexed layout that
# valhalla_build_extract writes. (Flags assume Valhalla 3.x: --config / --overwrite;
# confirm against the installed valhalla-bin version.)
VALHALLA_SRC="$SCRIPT_DIR/elf/output/${REGION_ID}/valhalla-tiles"
if [[ -d "$VALHALLA_SRC" ]]; then
  EXTRACT_TAR="$PACKAGE_DIR/${REGION_ID}.valhalla.tar"
  EXTRACT_CONFIG="$PACKAGE_DIR/.valhalla-extract-config.json"
  python3 - "$VALHALLA_SRC" "$EXTRACT_TAR" "$EXTRACT_CONFIG" <<'PY'
import json, sys
tile_dir, tar, out = sys.argv[1], sys.argv[2], sys.argv[3]
with open(out, "w") as f:
    json.dump({"mjolnir": {"tile_dir": tile_dir, "tile_extract": tar}}, f)
PY
  valhalla_build_extract --config "$EXTRACT_CONFIG" --overwrite
  gzip -f "$EXTRACT_TAR"           # → ${REGION_ID}.valhalla.tar.gz
  rm -f "$EXTRACT_CONFIG"
  echo "  Valhalla: $(du -h "$PACKAGE_DIR/${REGION_ID}.valhalla.tar.gz" | cut -f1)"
fi

# Copy ELF weights
ELF_SRC="$SCRIPT_DIR/elf/output/${REGION_ID}/elf-weights.json"
if [[ -f "$ELF_SRC" ]]; then
  cp "$ELF_SRC" "$PACKAGE_DIR/"
fi

# Generate package manifest. REGION_DEF was resolved at the top of this
# script, so an undefined region fails before the build rather than producing
# a package whose manifest carries `region: {}`.
PMTILES_SIZE=$(stat -f%z "$PACKAGE_DIR/${REGION_ID}.pmtiles" 2>/dev/null || stat --format=%s "$PACKAGE_DIR/${REGION_ID}.pmtiles" 2>/dev/null || echo "0")
VALHALLA_SIZE=$(stat -f%z "$PACKAGE_DIR/${REGION_ID}.valhalla.tar.gz" 2>/dev/null || stat --format=%s "$PACKAGE_DIR/${REGION_ID}.valhalla.tar.gz" 2>/dev/null || echo "0")
FUEL_SIZE=$(stat -f%z "$FUEL_FILE" 2>/dev/null || stat --format=%s "$FUEL_FILE" 2>/dev/null || echo "0")
# The app checks the fuel file against this before loading it.
FUEL_SHA256=$(python3 -c "import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest())" "$FUEL_FILE")

cat > "$PACKAGE_DIR/manifest.json" << EOF
{
  "regionId": "$REGION_ID",
  "version": "$(date +%Y.%m.%d)",
  "generatedAt": $(date +%s)000,
  "region": $REGION_DEF,
  "files": {
    "pmtiles": "${REGION_ID}.pmtiles",
    "valhalla": "${REGION_ID}.valhalla.tar.gz",
    "elfWeights": "elf-weights.json",
    "flood": "${REGION_ID}.flood.geojson",
    "fuel": "${REGION_ID}.fuel.json",
    "water": "${REGION_ID}.water.rdb"
  },
  "sizes": {
    "pmtiles": $PMTILES_SIZE,
    "valhalla": $VALHALLA_SIZE,
    "fuel": $FUEL_SIZE
  },
  "sha256": {
    "fuel": "$FUEL_SHA256"
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
  wrangler r2 object put "$BUCKET/${REGION_ID}/${REGION_ID}.pmtiles" \
    --file "$PACKAGE_DIR/${REGION_ID}.pmtiles" \
    --content-type "application/octet-stream"

  echo "  Uploading Valhalla tiles..."
  wrangler r2 object put "$BUCKET/${REGION_ID}/${REGION_ID}.valhalla.tar.gz" \
    --file "$PACKAGE_DIR/${REGION_ID}.valhalla.tar.gz" \
    --content-type "application/gzip"

  echo "  Uploading flood zones..."
  wrangler r2 object put "$BUCKET/${REGION_ID}/${REGION_ID}.flood.geojson" \
    --file "$PACKAGE_DIR/${REGION_ID}.flood.geojson" \
    --content-type "application/geo+json"

  echo "  Uploading resource data..."
  for f in "${REGION_ID}.fuel.json" "${REGION_ID}.water.rdb" "elf-weights.json"; do
    if [[ -f "$PACKAGE_DIR/$f" ]]; then
      wrangler r2 object put "$BUCKET/${REGION_ID}/$f" \
        --file "$PACKAGE_DIR/$f"
    fi
  done

  echo "  Uploading manifest..."
  wrangler r2 object put "$BUCKET/${REGION_ID}/manifest.json" \
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
