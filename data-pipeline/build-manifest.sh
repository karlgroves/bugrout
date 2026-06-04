#!/usr/bin/env bash
set -euo pipefail

# Build the global tile manifest from all regional packages.
# The app fetches this to show available regions for download.
#
# Usage: ./build-manifest.sh [--upload]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/output"
UPLOAD="${1:-}"

echo "=== Building global tile manifest ==="

# Collect all regional manifests
REGIONS="[]"
for manifest in "$OUTPUT_DIR"/*/package/manifest.json; do
  if [[ -f "$manifest" ]]; then
    REGION=$(python3 -c "
import json
with open('$manifest') as f:
    m = json.load(f)
print(json.dumps({
    'id': m['regionId'],
    'name': m.get('region', {}).get('name', m['regionId']),
    'bbox': m.get('region', {}).get('bbox', {}),
    'pmtilesSize': m.get('sizes', {}).get('pmtiles', 0),
    'valhallaSize': m.get('sizes', {}).get('valhalla', 0),
    'version': m['version'],
    'updatedAt': m['generatedAt']
}))
")
    REGIONS=$(echo "$REGIONS" | python3 -c "
import json, sys
regions = json.load(sys.stdin)
regions.append(json.loads('$REGION'))
print(json.dumps(regions))
")
  fi
done

# Write manifest
MANIFEST="$OUTPUT_DIR/manifest.json"
echo "{\"regions\": $REGIONS}" | python3 -m json.tool > "$MANIFEST"
echo "  Written: $MANIFEST"
echo "  Regions: $(echo "$REGIONS" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"

if [[ "$UPLOAD" == "--upload" ]]; then
  echo "  Uploading to R2..."
  wrangler r2 object put "bugrout-tiles/manifest.json" \
    --file "$MANIFEST" \
    --content-type "application/json"
  echo "  Done."
fi
