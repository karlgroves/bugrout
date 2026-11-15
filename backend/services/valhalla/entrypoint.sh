#!/usr/bin/env bash
# Pull the pinned routing graph onto the volume, then serve it (#266).
#
# The graph is data, not an image layer: build-graph.sh produces it, R2 holds
# every published version under server/<extract>/<build-date>/, and the Fly
# volume mounted at /graph caches the ones this machine has used. The version
# served is GRAPH_VERSION from fly.toml [env], so swapping an extract or rolling
# back is an env change and a redeploy, with no image rebuild.
#
# A version already on the volume is reused without touching the network, so a
# cold start after the first boot reads only local disk.

set -euo pipefail

root=${GRAPH_ROOT:-/graph}
bucket=${GRAPH_BUCKET:-bugrout-tiles}
files=(SHA256SUMS valhalla.json valhalla_tiles.tar timezones.sqlite admins.sqlite)

die() {
  echo "graph: $*" >&2
  exit 1
}

version=${GRAPH_VERSION:-}
# <extract>/<build-date>, e.g. maryland/2026-11-06. Checked before it becomes a
# path on the volume and a key in the bucket.
if ! [[ $version =~ ^[a-z0-9-]+/[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  die "GRAPH_VERSION '$version' is not <extract>/<YYYY-MM-DD>; set it in fly.toml [env]"
fi

dir="$root/versions/$version"

if [ -f "$dir/.complete" ]; then
  echo "graph: using cached $version"
else
  for var in R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
    [ -n "${!var:-}" ] || die "$version is not cached and the Fly secret $var is not set"
  done
  echo "graph: fetching $version from $bucket"
  partial="$dir.partial"
  rm -rf "$partial"
  trap 'rm -rf "$partial"' EXIT
  mkdir -p "$partial"
  for file in "${files[@]}"; do
    # Credentials go in through a config on a pipe, not argv, so they never
    # appear in the process list.
    curl --fail --silent --show-error --retry 3 \
      --aws-sigv4 "aws:amz:auto:s3" \
      --config <(printf 'user = "%s:%s"\n' "$R2_ACCESS_KEY_ID" "$R2_SECRET_ACCESS_KEY") \
      --output "$partial/$file" \
      "$R2_ENDPOINT/$bucket/server/$version/$file"
  done
  (cd "$partial" && sha256sum --check --quiet SHA256SUMS) \
    || die "$version failed its checksum; not serving it"
  touch "$partial/.complete"
  rm -rf "$dir"
  mv "$partial" "$dir"
  trap - EXIT
fi

# Repoint `current`, which the shipped valhalla.json reads through, atomically.
ln -sfn "versions/$version" "$root/current.next"
mv -T "$root/current.next" "$root/current"

# Root was needed only to write the volume, which Fly mounts root-owned. The
# graph is world-readable; the service itself runs unprivileged.
exec setpriv --reuid=valhalla --regid=valhalla --init-groups \
  valhalla_service "$root/current/valhalla.json" 1
