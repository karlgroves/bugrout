#!/usr/bin/env bash
set -euo pipefail

# Extract FEMA NFHL flood zone data for a state.
#
# Downloads the National Flood Hazard Layer shapefile from FEMA,
# converts to GeoJSON, and filters to high-risk zones (A and V).
#
# Prerequisites:
# - ogr2ogr (from GDAL, brew install gdal or apt install gdal-bin)
# - python3 with json module
#
# Usage: ./extract-flood-zones.sh <state-fips-code> <output-path>
# Example: ./extract-flood-zones.sh 06 ../output/california/package/ca.flood.geojson
#
# State FIPS codes: CA=06, TX=48, FL=12, AZ=04, CO=08, LA=22, NC=37, OR=41, WA=53

FIPS="${1:?Usage: $0 <state-fips-code> <output-path>}"
OUTPUT="${2:?Usage: $0 <state-fips-code> <output-path>}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="$SCRIPT_DIR/work/$FIPS"
mkdir -p "$WORK_DIR"

# State FIPS to name mapping
declare -A FIPS_NAMES=(
  ["06"]="California" ["48"]="Texas" ["12"]="Florida"
  ["04"]="Arizona" ["08"]="Colorado" ["22"]="Louisiana"
  ["37"]="North_Carolina" ["41"]="Oregon" ["53"]="Washington"
)

STATE_NAME="${FIPS_NAMES[$FIPS]:-State_$FIPS}"

echo "=== FEMA NFHL Flood Zone Extraction ==="
echo "State: $STATE_NAME (FIPS $FIPS)"

# Check for ogr2ogr
if ! command -v ogr2ogr &> /dev/null; then
  echo "Error: ogr2ogr not found. Install GDAL:"
  echo "  macOS: brew install gdal"
  echo "  Ubuntu: sudo apt install gdal-bin"
  exit 1
fi

# Download NFHL data
# FEMA provides state-level NFHL packages at:
# https://hazards.fema.gov/nfhlv2/output/State/NFHL_{FIPS}_{date}.zip
#
# Since the URL includes a date component that changes, we use the
# MSC portal API to find the latest URL.

NFHL_ZIP="$WORK_DIR/nfhl_${FIPS}.zip"
if [[ ! -f "$NFHL_ZIP" ]]; then
  echo "Downloading NFHL data for FIPS $FIPS..."
  echo "(This may take several minutes for large states)"

  # Try the standard FEMA download URL pattern
  FEMA_URL="https://hazards.fema.gov/nfhlv2/output/State/NFHL_${FIPS}_$(date +%Y%m%d).zip"

  if ! curl -L -f -o "$NFHL_ZIP" "$FEMA_URL" 2>/dev/null; then
    echo "Direct download failed. Trying alternate method..."
    # Alternate: use the FEMA Map Service Center
    FEMA_ALT="https://msc.fema.gov/portal/downloadProduct?productTypeID=NFHL&productSubTypeID=NFHL_STATE&productID=NFHL_${FIPS}"
    if ! curl -L -f -o "$NFHL_ZIP" "$FEMA_ALT" 2>/dev/null; then
      echo ""
      echo "Automatic download failed. Please download manually:"
      echo "  1. Visit https://msc.fema.gov/portal/advanceSearch"
      echo "  2. Search for state FIPS: $FIPS"
      echo "  3. Download the NFHL State Dataset"
      echo "  4. Save to: $NFHL_ZIP"
      echo ""
      echo "Then re-run this script."

      # Create empty GeoJSON as placeholder
      echo '{"type":"FeatureCollection","features":[]}' > "$OUTPUT"
      echo "Created empty placeholder at $OUTPUT"
      exit 0
    fi
  fi

  echo "Downloaded: $(du -h "$NFHL_ZIP" | cut -f1)"
fi

# Extract shapefile
echo "Extracting shapefile..."
SHAPEFILE_DIR="$WORK_DIR/shapefile"
mkdir -p "$SHAPEFILE_DIR"
unzip -o -q "$NFHL_ZIP" -d "$SHAPEFILE_DIR"

# Find the S_FLD_HAZ_AR (Flood Hazard Area) shapefile
FLOOD_SHP=$(find "$SHAPEFILE_DIR" -name "S_FLD_HAZ_AR*.shp" -type f | head -1)
if [[ -z "$FLOOD_SHP" ]]; then
  echo "Error: S_FLD_HAZ_AR shapefile not found in NFHL package."
  echo "Contents:"
  find "$SHAPEFILE_DIR" -name "*.shp" | head -10
  exit 1
fi

echo "Found flood hazard shapefile: $FLOOD_SHP"

# Convert to GeoJSON, filtering to high-risk zones only
echo "Converting to GeoJSON (high-risk zones only)..."
FULL_GEOJSON="$WORK_DIR/flood_full.geojson"

ogr2ogr \
  -f GeoJSON \
  -where "FLD_ZONE IN ('A','AE','AH','AO','AR','V','VE')" \
  -select "FLD_ZONE,ZONE_SUBTY,STATIC_BFE" \
  -t_srs EPSG:4326 \
  -simplify 0.0005 \
  "$FULL_GEOJSON" \
  "$FLOOD_SHP"

# Count features
FEATURE_COUNT=$(python3 -c "
import json
with open('$FULL_GEOJSON') as f:
    data = json.load(f)
print(len(data['features']))
")

echo "Extracted $FEATURE_COUNT high-risk flood zone polygons"

# Copy to output
mkdir -p "$(dirname "$OUTPUT")"
cp "$FULL_GEOJSON" "$OUTPUT"
echo "Output: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"

# Cleanup work directory (keep the zip for re-runs)
rm -rf "$SHAPEFILE_DIR" "$FULL_GEOJSON"

echo "=== Done ==="
