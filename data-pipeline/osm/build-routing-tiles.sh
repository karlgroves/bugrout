#!/usr/bin/env bash
set -euo pipefail

# Build Valhalla routing tiles from OSM PBF extracts.
# Requires: valhalla_build_tiles (from valhalla package)
# Usage: ./build-routing-tiles.sh [state]
# Example: ./build-routing-tiles.sh california

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT_DIR="${SCRIPT_DIR}/output"
TILES_DIR="${SCRIPT_DIR}/output/valhalla-tiles"
CONFIG="${SCRIPT_DIR}/valhalla-config.json"

STATE="${1:-california}"
PBF="${INPUT_DIR}/${STATE}-latest.osm.pbf"

if [[ ! -f "$PBF" ]]; then
  echo "Error: PBF not found at ${PBF}. Run download-extracts.sh first."
  exit 1
fi

if ! command -v valhalla_build_tiles &> /dev/null; then
  echo "Error: valhalla_build_tiles not found. Install Valhalla first."
  echo "  macOS: brew install valhalla"
  echo "  Ubuntu: see https://github.com/valhalla/valhalla"
  exit 1
fi

STATE_TILE_DIR="${TILES_DIR}/${STATE}"
RUN_CONFIG="${STATE_TILE_DIR}/valhalla-config.json"
mkdir -p "$STATE_TILE_DIR"

# valhalla_build_tiles writes the graph into mjolnir.tile_dir (from the config),
# not to a CLI path — so derive a per-state config that points tile_dir at this
# state's output dir. (The base config's /tmp path is a placeholder, and
# bake-elf-weights.sh reads the tiles from STATE_TILE_DIR.)
python3 - "$CONFIG" "$STATE_TILE_DIR" "$RUN_CONFIG" <<'PY'
import json, sys
base, tile_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
with open(base) as f:
    cfg = json.load(f)
cfg.setdefault("mjolnir", {})
cfg["mjolnir"]["tile_dir"] = tile_dir
cfg["mjolnir"]["admin"] = f"{tile_dir}/admin.sqlite"
cfg["mjolnir"]["timezone"] = f"{tile_dir}/tz_world.sqlite"
with open(out, "w") as f:
    json.dump(cfg, f, indent=2)
PY

echo "Building Valhalla tiles for ${STATE}..."
echo "  Input:  ${PBF}"
echo "  Output: ${STATE_TILE_DIR}"

# NOTE: no -e flag. In Valhalla `-e`/`--end-stage` selects a build *stage*, not an
# output path — the previous `-e …/valhalla_tiles.tar` was silently wrong. The
# mmap'd tile_extract archive is produced later, in build-region.sh.
valhalla_build_tiles -c "$RUN_CONFIG" "$PBF"

echo "Valhalla tiles built successfully → ${STATE_TILE_DIR}"
