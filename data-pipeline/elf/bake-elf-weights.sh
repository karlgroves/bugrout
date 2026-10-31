#!/usr/bin/env bash
set -euo pipefail

# Package ELF (Evacuation Load Factor) weights alongside Valhalla routing tiles.
#
# NOT YET APPLIED (#195): this script writes the weight table and then copies
# the Valhalla tiles UNCHANGED. Nothing modifies edge speeds, and no code reads
# elf-weights.json at query time, so every route is plain fastest-path. Item 3
# of the pipeline list below is unimplemented; where ELF is applied (rebuilt
# tiles or query-time costing) is still an open design decision on #195.
#
# Pipeline:
# 1. Extract road segment features from OSM PBF
# 2. Compute ELF multipliers using the lookup table
# 3. (not implemented) Modify Valhalla tile edge speeds:
#    effective_speed = base_speed / elf_multiplier
# 4. Output the weight table and an unmodified copy of the tiles
#
# Prerequisites:
# - Node.js 20+
# - OSM PBF extract in data-pipeline/osm/output/
# - Standard Valhalla tiles already built in data-pipeline/osm/output/valhalla-tiles/
# - npm packages installed in packages/elf-model/
#
# Usage: ./bake-elf-weights.sh [state]
# Example: ./bake-elf-weights.sh md

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIPELINE_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$PIPELINE_DIR")"
# The region id, which is what download-extracts.sh names the PBF, and
# what the weight table's REGION_ID placeholder is filled with (#241).
REGION_ID="${1:-md}"

OSM_DIR="${PIPELINE_DIR}/osm/output"
PBF="${OSM_DIR}/${REGION_ID}-latest.osm.pbf"
VALHALLA_TILES="${OSM_DIR}/valhalla-tiles/${REGION_ID}"
ELF_OUTPUT="${SCRIPT_DIR}/output/${REGION_ID}"
WEIGHT_TABLE="${ELF_OUTPUT}/elf-weights.json"

echo "=== BugRout ELF Weight Baking Pipeline ==="
echo "Region: ${REGION_ID}"
echo "PBF: ${PBF}"
echo "Valhalla tiles: ${VALHALLA_TILES}"
echo ""

# Verify inputs exist
if [[ ! -f "$PBF" ]]; then
  echo "Error: OSM PBF not found at ${PBF}"
  echo "Run data-pipeline/osm/download-extracts.sh first."
  exit 1
fi

if [[ ! -d "$VALHALLA_TILES" ]]; then
  echo "Error: Valhalla tiles not found at ${VALHALLA_TILES}"
  echo "Run data-pipeline/osm/build-routing-tiles.sh first."
  exit 1
fi

mkdir -p "$ELF_OUTPUT"

# Step 1: Extract features and compute weights
echo "Step 1: Computing ELF weights..."
echo "  (This runs the TypeScript ELF model pipeline)"

# The elf-model package contains the training logic.
# For the MVP, we use a simplified approach:
# - Extract road class from the Valhalla tiles directly
# - Apply the lookup table multipliers
# - Export as JSON weight table

cd "${ROOT_DIR}/packages/elf-model"

# Generate the weight table using the ELF model
# In production, this would parse the PBF and extract features.
# For MVP, we generate a region-level default weight table.
cat > "${WEIGHT_TABLE}" << 'JSONEOF'
{
  "version": "1.0.0",
  "regionId": "REGION_ID",
  "generatedAt": TIMESTAMP,
  "description": "ELF weight table - road class based multipliers",
  "defaults": {
    "motorway": 6.0,
    "trunk": 4.5,
    "primary": 3.0,
    "secondary": 2.0,
    "tertiary": 1.5,
    "unclassified": 1.2,
    "residential": 1.0
  },
  "modifiers": {
    "near_population_center_5km": 1.5,
    "near_population_center_20km": 1.2,
    "near_evac_zone_10km": 1.4,
    "near_evac_zone_30km": 1.2,
    "is_ramp": 1.3,
    "is_bridge_or_tunnel": 1.5,
    "high_adt_50k": 1.4,
    "high_adt_20k": 1.2,
    "narrow_highway_2_lanes": 1.3
  }
}
JSONEOF

# Replace placeholders
if [[ "$(uname)" == "Darwin" ]]; then
  sed -i '' "s/REGION_ID/${REGION_ID}/g" "$WEIGHT_TABLE"
  sed -i '' "s/TIMESTAMP/$(date +%s)000/g" "$WEIGHT_TABLE"
else
  sed -i "s/REGION_ID/${REGION_ID}/g" "$WEIGHT_TABLE"
  sed -i "s/TIMESTAMP/$(date +%s)000/g" "$WEIGHT_TABLE"
fi

echo "  Weight table written to: ${WEIGHT_TABLE}"

# Step 2: Copy Valhalla tiles (unmodified; ELF is not applied, #195)
echo ""
echo "Step 2: Copying Valhalla tiles (ELF weights are NOT applied, #195)..."
echo "  The tiles are copied unchanged and nothing reads the weight table yet,"
echo "  so routes built from this output are not congestion-weighted."

# Copy tiles to ELF output directory, unmodified
cp -r "${VALHALLA_TILES}" "${ELF_OUTPUT}/valhalla-tiles"

echo "  Unmodified tiles: ${ELF_OUTPUT}/valhalla-tiles"

# Step 3: Package for app distribution
echo ""
echo "Step 3: Packaging for distribution..."

# Create the regional package manifest
cat > "${ELF_OUTPUT}/manifest.json" << MANIFESTEOF
{
  "regionId": "${REGION_ID}",
  "version": "$(date +%Y.%m.%d)",
  "generatedAt": $(date +%s)000,
  "contents": {
    "valhallaTiles": "valhalla-tiles/",
    "elfWeights": "elf-weights.json"
  }
}
MANIFESTEOF

echo "  Package manifest: ${ELF_OUTPUT}/manifest.json"

# Step 4: Validate
echo ""
echo "Step 4: Validation..."

# Verify weight table is valid JSON
if python3 -c "import json; json.load(open('${WEIGHT_TABLE}'))" 2>/dev/null; then
  echo "  Weight table: valid JSON ✓"
else
  echo "  Weight table: INVALID JSON ✗"
  exit 1
fi

# Check tile directory is non-empty
TILE_COUNT=$(find "${ELF_OUTPUT}/valhalla-tiles" -type f 2>/dev/null | wc -l | tr -d ' ')
echo "  Tile files: ${TILE_COUNT}"

if [[ "$TILE_COUNT" -eq 0 ]]; then
  echo "  WARNING: No tile files found. Pipeline may have failed."
fi

echo ""
echo "=== ELF baking complete for ${REGION_ID} ==="
echo "Output: ${ELF_OUTPUT}"
echo ""
echo "To upload to Cloudflare R2:"
echo "  wrangler r2 object put bugrout-tiles/${REGION_ID}/elf-weights.json --file ${WEIGHT_TABLE}"
echo "  tar -czf ${REGION_ID}.valhalla.tar.gz -C ${ELF_OUTPUT} valhalla-tiles/"
echo "  wrangler r2 object put bugrout-tiles/${REGION_ID}/${REGION_ID}.valhalla.tar.gz --file ${REGION_ID}.valhalla.tar.gz"
