# The Valhalla engine only. The routing graph is not in this image (#266): it
# is built out of band by build-graph.sh, published to R2, and pulled onto the
# Fly volume at boot by entrypoint.sh. Changing the extract or rolling back is
# GRAPH_VERSION in fly.toml — no rebuild. See README.md.
#
# The base image is pinned to a release tag AND its digest. It was on `:latest`,
# which meant the routing engine — the component every route in this app comes
# out of — could change between two builds of the same commit with no diff and
# no notice. The valhalla-graph workflow builds graphs in this same image, read
# from the FROM line below, so engine and graph cannot drift apart.
#
# To move it: pick a tag from
#   https://github.com/gis-ops/docker-valhalla/pkgs/container/docker-valhalla%2Fvalhalla
# then resolve the digest, and rebuild the graph with the new engine.

FROM ghcr.io/gis-ops/docker-valhalla/valhalla:3.5.1@sha256:d154396aa2499f463f3d5419ef3f107063247a4ffbed80dbcdf952aa53172d97

COPY entrypoint.sh /usr/local/bin/graph-entrypoint

EXPOSE 8002

# DL3002 — the entrypoint starts as root because Fly mounts the volume
# root-owned and the first boot has to write the graph into it. It drops to the
# image's unprivileged `valhalla` user (setpriv) before exec'ing the service, so
# nothing that answers a request runs as root.
# checkov:skip=CKV_DOCKER_8:root only until entrypoint.sh drops privileges, as above.
# Suppressed for hadolint, checkov, Semgrep and Trivy (DS-0002). Semgrep and
# Trivy both read only the line directly above USER, so they share it, and
# hadolint's is file-scoped; this file has no other USER.
# hadolint global ignore=DL3002
# nosemgrep: dockerfile.security.last-user-is-root.last-user-is-root -- entrypoint.sh only writes the root-owned Fly volume as root, then execs valhalla_service through setpriv as `valhalla` trivy:ignore:DS-0002
USER root

# checkov:skip=CKV_DOCKER_2:Health checking is done by the platform. fly.toml
# defines the HTTP check against this port; a container-level HEALTHCHECK would
# duplicate it.
ENTRYPOINT ["/usr/local/bin/graph-entrypoint"]
