# Multi-stage build: compile Valhalla tiles in builder, serve in runtime.
# Swap PBF_URL to change region. Keep REGION_NAME in sync for logging.

ARG PBF_URL=https://download.geofabrik.de/north-america/us/maryland-latest.osm.pbf
ARG REGION_NAME=maryland

FROM ghcr.io/gis-ops/docker-valhalla/valhalla:latest AS builder
ARG PBF_URL
ARG REGION_NAME

USER root
WORKDIR /custom_files

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fL "$PBF_URL" -o "${REGION_NAME}.osm.pbf"

# Generate Valhalla config + build tiles.
RUN valhalla_build_config \
      --mjolnir-tile-dir /custom_files/valhalla_tiles \
      --mjolnir-tile-extract /custom_files/valhalla_tiles.tar \
      --mjolnir-timezone /custom_files/timezones.sqlite \
      --mjolnir-admin /custom_files/admins.sqlite \
      > valhalla.json \
    && valhalla_build_admins -c valhalla.json "${REGION_NAME}.osm.pbf" \
    && valhalla_build_timezones > /custom_files/timezones.sqlite \
    && valhalla_build_tiles -c valhalla.json "${REGION_NAME}.osm.pbf" \
    && find /custom_files/valhalla_tiles | sort -n | tar -cf /custom_files/valhalla_tiles.tar --no-recursion -T -

FROM ghcr.io/gis-ops/docker-valhalla/valhalla:latest
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
ENTRYPOINT []
CMD ["valhalla_service", "/custom_files/valhalla.json", "1"]
