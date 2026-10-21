#!/usr/bin/env bash
set -euo pipefail

# Download OSM PBF extracts from Geofabrik for target regions.
#
# Takes **region ids** — the lowercase two-letter postal codes the app uses —
# and resolves each to its Geofabrik slug for the download URL. The file is
# saved under the id, so everything downstream (routing tiles, PMTiles, ELF,
# the package and its manifest) keys on the id alone and the slug never
# escapes this script. See regions/resolve-region.sh and #241.
#
# Usage: ./download-extracts.sh [region-id...]
# Example: ./download-extracts.sh md
#          ./download-extracts.sh ca tx fl

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIPELINE_DIR="$(dirname "$SCRIPT_DIR")"
RESOLVE="${PIPELINE_DIR}/regions/resolve-region.sh"
# Overridable so test-region-ids.sh can exercise the URL/path split without
# touching the real cache, which holds multi-hundred-megabyte extracts.
OUTPUT_DIR="${DOWNLOAD_OUTPUT_DIR:-${SCRIPT_DIR}/output}"
BASE_URL="https://download.geofabrik.de/north-america/us"

mkdir -p "$OUTPUT_DIR"

REGION_IDS=("${@:-md}")

for region_id in "${REGION_IDS[@]}"; do
  # Fails loudly on an unknown id, and names the id to use when handed a slug.
  slug="$("$RESOLVE" slug "$region_id")"

  url="${BASE_URL}/${slug}-latest.osm.pbf"
  output="${OUTPUT_DIR}/${region_id}-latest.osm.pbf"

  if [[ -f "$output" ]]; then
    echo "Skipping ${region_id} — already downloaded at ${output}"
    continue
  fi

  # Extracts downloaded before #241 are named after the slug. They are the
  # same file, so reuse one rather than re-fetching a few hundred megabytes.
  legacy="${OUTPUT_DIR}/${slug}-latest.osm.pbf"
  if [[ -f "$legacy" ]]; then
    echo "Reusing ${legacy} as ${output} (renamed for the region id, #241)"
    mv "$legacy" "$output"
    continue
  fi

  echo "Downloading ${region_id} (${slug}) from ${url}..."
  curl -L -o "$output" "$url"
  echo "Downloaded: ${output} ($(du -h "$output" | cut -f1))"
done

echo "All downloads complete."
