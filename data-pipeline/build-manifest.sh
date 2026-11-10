#!/usr/bin/env bash
set -euo pipefail

# Build the global tile manifest from all regional packages.
# The app fetches this to show available regions for download.
#
# Usage: ./build-manifest.sh [--upload]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Overridable so regions/test-neighbors.sh can point it at a fixture tree;
# the default is the real output directory build-region.sh writes to.
OUTPUT_DIR="${OUTPUT_DIR:-$SCRIPT_DIR/output}"
UPLOAD="${1:-}"

echo "=== Building global tile manifest ==="

# Collect all regional manifests. Values reach Python as argv, never spliced
# into its source: a path or a region name holding a quote would
# otherwise end the string literal and run the rest as code.
REGIONS="[]"
for manifest in "$OUTPUT_DIR"/*/package/manifest.json; do
  if [[ -f "$manifest" ]]; then
    REGION=$(python3 -c "
import json, sys
with open(sys.argv[1]) as f:
    m = json.load(f)
region = {
    'id': m['regionId'],
    'name': m.get('region', {}).get('name', m['regionId']),
    'bbox': m.get('region', {}).get('bbox', {}),
    'pmtilesSize': m.get('sizes', {}).get('pmtiles', 0),
    'valhallaSize': m.get('sizes', {}).get('valhalla', 0),
    'version': m['version'],
    'updatedAt': m['generatedAt']
}
# MD5 of the map and routing archives, which the app checks each download
# against (#292). Published only when the package has the file and a digest;
# a package built before digests were added publishes none, and the app then
# checks the size alone.
for kind in ('pmtiles', 'valhalla'):
    digest = m.get('md5', {}).get(kind)
    if digest and m.get('sizes', {}).get(kind, 0) > 0:
        region[kind + 'Md5'] = digest
# Only a package built with fuel (#200) lists it; for one built before, the
# app fetches fuel online instead.
if m.get('sha256', {}).get('fuel'):
    region['fuelSize'] = m['sizes']['fuel']
    region['fuelSha256'] = m['sha256']['fuel']
# Likewise the destination search index (#208); without it the app searches
# online only.
if m.get('sha256', {}).get('geocode'):
    region['geocodeSize'] = m['sizes']['geocode']
    region['geocodeSha256'] = m['sha256']['geocode']
# Land-border neighbours, offered after this region is downloaded (#268).
# Carried from region-definitions.json, which build-region.sh embeds whole as
# the package manifest's \`region\`. Omitted when absent rather than written as
# an empty list, so the app can tell \"no adjacency published\" (fall back to its
# own table) from \"published, and this region has none\" — Alaska and Hawaii.
neighbors = m.get('region', {}).get('neighbors')
if neighbors is not None:
    region['neighbors'] = neighbors
print(json.dumps(region))
" "$manifest")
    REGIONS=$(echo "$REGIONS" | python3 -c "
import json, sys
regions = json.load(sys.stdin)
regions.append(json.loads(sys.argv[1]))
print(json.dumps(regions))
" "$REGION")
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
