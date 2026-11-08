#!/usr/bin/env bash
# Build the routing graph artifact for one extract, outside `docker build`
# (#266). The service no longer bakes its graph into an image layer; it pulls
# this artifact from R2 at boot (see entrypoint.sh).
#
# Usage: build-graph.sh <extract.osm.pbf> <output-dir>
#
# Runs inside the same pinned Valhalla image the service runs (the FROM line in
# the Dockerfile), so the graph and the engine that reads it are one version.
# The valhalla-graph workflow does exactly that; locally:
#
#   docker run --rm -v "$PWD:/work" -w /work --entrypoint bash <image> \
#     backend/services/valhalla/build-graph.sh maryland.osm.pbf out/
#
# The output directory receives valhalla.json, valhalla_tiles.tar,
# timezones.sqlite, admins.sqlite and SHA256SUMS. Publish all five under
# server/<extract>/<build-date>/ in the bugrout-tiles bucket.

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <extract.osm.pbf> <output-dir>" >&2
  exit 2
fi

pbf=$1
out=$2
# Where entrypoint.sh points the service at the active version on the volume.
runtime_dir=/graph/current

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$out"

# Settings that are the same in the build config and the shipped config.
#
# --service-limits-max-exclude-polygons-length: Valhalla's default caps the
# TOTAL perimeter of a request's exclude_polygons at 10 km and rejects the whole
# request past it (#168) — smaller than most real fire or flood perimeters.
# 250 km was chosen by timing a Baltimore -> Annapolis route on Maryland's
# tiles: latency grows roughly with total perimeter (~1.7 s at 250 km, ~5.7 s at
# 1000 km under amd64 emulation) and the app gives up after 10 s. The app's
# MAX_EXCLUDE_POLYGONS_PERIMETER_M must match; a test compares the two. A wider
# extract needs this re-timed (#269).
#
# --loki-actions route,status: the shipped service answers only what is used
# (#289). The app calls /route and Fly's health check calls /status; Valhalla's
# default also serves isochrone, sources_to_targets, optimized_route,
# trace_route, trace_attributes, expansion and more, each able to cost far more
# CPU than a route on a public, unauthenticated, single-threaded machine. An
# action not listed is refused before any graph work. Add one here only
# alongside the client code that calls it.
#
# --mjolnir-concurrency 1: the multi-threaded tile build intermittently aborts
# with "double free or corruption" just after ReclassifyFerryEdges (#178) — 2 of
# 3 builds on 2026-09-29, on native amd64 as well as under emulation, while an
# identical retry passed. A single thread avoids the race at the cost of build
# time; see #178 for the measurements behind this choice.
common=(
  --mjolnir-concurrency 1
  --service-limits-max-exclude-polygons-length 250000
  --loki-actions route,status
)

config() {
  valhalla_build_config "${common[@]}" \
    --mjolnir-tile-dir "$1/valhalla_tiles" \
    --mjolnir-tile-extract "$1/valhalla_tiles.tar" \
    --mjolnir-timezone "$1/timezones.sqlite" \
    --mjolnir-admin "$1/admins.sqlite"
}

config "$work" > "$work/valhalla.json"
valhalla_build_admins -c "$work/valhalla.json" "$pbf"
valhalla_build_timezones > "$work/timezones.sqlite"
valhalla_build_tiles -c "$work/valhalla.json" "$pbf"
find "$work/valhalla_tiles" | sort -n \
  | tar -cf "$out/valhalla_tiles.tar" --no-recursion -T -

# The shipped config names the paths the service reads, not the build's.
config "$runtime_dir" > "$out/valhalla.json"
cp "$work/timezones.sqlite" "$work/admins.sqlite" "$out/"

(cd "$out" && sha256sum valhalla.json valhalla_tiles.tar timezones.sqlite \
  admins.sqlite > SHA256SUMS)
