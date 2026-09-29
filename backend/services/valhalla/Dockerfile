# Multi-stage build: compile Valhalla tiles in builder, serve in runtime.
# Swap PBF_URL to change region. Keep REGION_NAME in sync for logging.
#
# The base image is pinned to a release tag AND its digest. It was on `:latest`
# in both stages, which meant the routing engine — the component every route in
# this app comes out of — could change between two builds of the same commit
# with no diff and no notice. `latest` is not the same build as 3.5.1; this is
# a deliberate move to the newest tagged release.
#
# To move it: pick a tag from
#   https://github.com/gis-ops/docker-valhalla/pkgs/container/docker-valhalla%2Fvalhalla
# then resolve the digest and change both stages together.

ARG PBF_URL=https://download.geofabrik.de/north-america/us/maryland-latest.osm.pbf
ARG REGION_NAME=maryland

FROM ghcr.io/gis-ops/docker-valhalla/valhalla:3.5.1@sha256:d154396aa2499f463f3d5419ef3f107063247a4ffbed80dbcdf952aa53172d97 AS builder
ARG PBF_URL
ARG REGION_NAME

USER root
WORKDIR /custom_files

# DL4006 — the tile build below pipes `find | sort | tar`, and without pipefail
# a failure in `find` or `sort` would be masked by tar's success.
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fL "$PBF_URL" -o "${REGION_NAME}.osm.pbf"

# Generate Valhalla config + build tiles.
#
# --service-limits-max-exclude-polygons-length: Valhalla's default caps the
# TOTAL perimeter of a request's exclude_polygons at 10 km and rejects the whole
# request past it (#168) — smaller than most real fire or flood perimeters.
# 250 km was chosen by timing a Baltimore -> Annapolis route on this image's
# tiles: latency grows roughly with total perimeter (~1.7 s at 250 km, ~5.7 s at
# 1000 km under amd64 emulation) and the app gives up after 10 s. The app's
# MAX_EXCLUDE_POLYGONS_PERIMETER_M must match; a test compares the two.
RUN valhalla_build_config \
      --service-limits-max-exclude-polygons-length 250000 \
      --mjolnir-tile-dir /custom_files/valhalla_tiles \
      --mjolnir-tile-extract /custom_files/valhalla_tiles.tar \
      --mjolnir-timezone /custom_files/timezones.sqlite \
      --mjolnir-admin /custom_files/admins.sqlite \
      > valhalla.json \
    && valhalla_build_admins -c valhalla.json "${REGION_NAME}.osm.pbf" \
    && valhalla_build_timezones > /custom_files/timezones.sqlite \
    && valhalla_build_tiles -c valhalla.json "${REGION_NAME}.osm.pbf" \
    && find /custom_files/valhalla_tiles | sort -n | tar -cf /custom_files/valhalla_tiles.tar --no-recursion -T -

# DL3002 — drop back to the unprivileged user. Nothing after this needs root,
# and a builder stage left as root is a habit worth not having.
USER valhalla

FROM ghcr.io/gis-ops/docker-valhalla/valhalla:3.5.1@sha256:d154396aa2499f463f3d5419ef3f107063247a4ffbed80dbcdf952aa53172d97
ARG REGION_NAME
ENV REGION_NAME=${REGION_NAME}

USER root
WORKDIR /custom_files

COPY --from=builder /custom_files/valhalla.json /custom_files/valhalla.json
COPY --from=builder /custom_files/valhalla_tiles.tar /custom_files/valhalla_tiles.tar
COPY --from=builder /custom_files/timezones.sqlite /custom_files/timezones.sqlite
COPY --from=builder /custom_files/admins.sqlite /custom_files/admins.sqlite

RUN chown -R valhalla:valhalla /custom_files

EXPOSE 8002
USER valhalla

# checkov:skip=CKV_DOCKER_2:Health checking is done by the platform. fly.toml
# defines the HTTP check against this port; the runtime image ships no HTTP
# client, so a container-level HEALTHCHECK would mean installing curl into the
# production image purely to satisfy a linter.
ENTRYPOINT []
CMD ["valhalla_service", "/custom_files/valhalla.json", "1"]
