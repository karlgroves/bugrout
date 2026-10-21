#!/usr/bin/env bash
set -euo pipefail

# Resolve a region id against region-definitions.json.
#
# The pipeline is keyed by **region id** — the lowercase two-letter postal code
# the app uses ("md"), not the Geofabrik slug ("maryland"). The slug is a
# Geofabrik download detail and appears in exactly one place: the extract URL
# that download-extracts.sh builds. Everything downstream — the PBF file name,
# the intermediate build directories, the package file names, the manifest's
# `regionId` and the R2 prefix — is the id.
#
# That split is the fix for #241. Before it, build-region.sh took the slug and
# used it as the id too, so a pipeline-built Maryland would have published as
# `maryland`: a different region from the hand-built `md` the app downloads,
# and one `ResourceSync.stateCodeFor` rejects outright (it requires two
# letters), silently skipping every NREL, USGS and shelter lookup.
#
# Usage:
#   ./resolve-region.sh slug <region-id>        # → geofabrik slug
#   ./resolve-region.sh definition <region-id>  # → the full JSON entry
#   ./resolve-region.sh ids                     # → every defined id, one per line
#
# Exits non-zero with a message on stderr for an unknown id. An id that is a
# known *slug* gets a message naming the id to use instead, since that is the
# mistake #241 was about and the one most likely to be repeated.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFINITIONS="${REGION_DEFINITIONS:-${SCRIPT_DIR}/region-definitions.json}"

COMMAND="${1:?Usage: $0 <slug|definition|ids> [region-id]}"

if [[ ! -f "$DEFINITIONS" ]]; then
  echo "Error: region definitions not found at ${DEFINITIONS}" >&2
  exit 1
fi

if [[ "$COMMAND" == "ids" ]]; then
  python3 -c "
import json, sys
with open(sys.argv[1]) as f:
    for region in json.load(f)['regions']:
        print(region['id'])
" "$DEFINITIONS"
  exit 0
fi

REGION_ID="${2:?Usage: $0 <slug|definition> <region-id>}"

python3 -c "
import json, sys

definitions, command, region_id = sys.argv[1], sys.argv[2], sys.argv[3]

with open(definitions) as f:
    regions = json.load(f)['regions']

by_id = {r['id']: r for r in regions}
region = by_id.get(region_id)

if region is None:
    by_slug = {r['geofabrikSlug']: r for r in regions}
    if region_id in by_slug:
        sys.exit(
            f\"Error: '{region_id}' is a Geofabrik slug, not a region id. \"
            f\"Use '{by_slug[region_id]['id']}' — the pipeline is keyed by \"
            f'region id (#241).'
        )
    sys.exit(
        f\"Error: unknown region id '{region_id}'. \"
        f'Defined ids: {\", \".join(sorted(by_id))}. '
        f'Add an entry to {definitions} to build a new region.'
    )

if command == 'slug':
    print(region['geofabrikSlug'])
elif command == 'definition':
    print(json.dumps(region))
else:
    sys.exit(f\"Error: unknown command '{command}'; expected slug, definition or ids.\")
" "$DEFINITIONS" "$COMMAND" "$REGION_ID"
