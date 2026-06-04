#!/usr/bin/env bash
set -euo pipefail

# Download OSM PBF extracts from Geofabrik for target states.
# Usage: ./download-extracts.sh [state...]
# Example: ./download-extracts.sh california texas florida

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/output"
BASE_URL="https://download.geofabrik.de/north-america/us"

mkdir -p "$OUTPUT_DIR"

STATES=("${@:-california}")

for state in "${STATES[@]}"; do
  url="${BASE_URL}/${state}-latest.osm.pbf"
  output="${OUTPUT_DIR}/${state}-latest.osm.pbf"

  if [[ -f "$output" ]]; then
    echo "Skipping ${state} — already downloaded at ${output}"
    continue
  fi

  echo "Downloading ${state} from ${url}..."
  curl -L -o "$output" "$url"
  echo "Downloaded: ${output} ($(du -h "$output" | cut -f1))"
done

echo "All downloads complete."
