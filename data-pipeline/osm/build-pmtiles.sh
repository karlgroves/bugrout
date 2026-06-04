#!/usr/bin/env bash
set -euo pipefail

# Build PMTiles for map rendering from OSM PBF extracts.
# Requires: planetiler (Java) or tilemaker (C++)
# Usage: ./build-pmtiles.sh [state]
# Example: ./build-pmtiles.sh california

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT_DIR="${SCRIPT_DIR}/output"
OUTPUT_DIR="${SCRIPT_DIR}/output/pmtiles"

STATE="${1:-california}"
PBF="${INPUT_DIR}/${STATE}-latest.osm.pbf"

if [[ ! -f "$PBF" ]]; then
  echo "Error: PBF not found at ${PBF}. Run download-extracts.sh first."
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

# Try planetiler first, fall back to tilemaker
if command -v java &> /dev/null && [[ -f "${SCRIPT_DIR}/planetiler.jar" ]]; then
  echo "Building PMTiles with Planetiler for ${STATE}..."
  java -jar "${SCRIPT_DIR}/planetiler.jar" \
    --osm-path="$PBF" \
    --output="${OUTPUT_DIR}/${STATE}.pmtiles" \
    --force
elif command -v tilemaker &> /dev/null; then
  echo "Building PMTiles with tilemaker for ${STATE}..."
  tilemaker \
    --input "$PBF" \
    --output "${OUTPUT_DIR}/${STATE}.pmtiles"
else
  echo "Error: Neither Planetiler (Java) nor tilemaker found."
  echo "  Planetiler: download from https://github.com/onthegomap/planetiler"
  echo "  tilemaker: brew install tilemaker"
  exit 1
fi

echo "PMTiles built: ${OUTPUT_DIR}/${STATE}.pmtiles"
echo "Size: $(du -h "${OUTPUT_DIR}/${STATE}.pmtiles" | cut -f1)"
