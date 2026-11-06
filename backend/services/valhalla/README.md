# bugrout-valhalla

Remote Valhalla HTTP routing service for the BugRout mobile app.

The image carries only the Valhalla engine. The routing graph is data (#266, ADR
0008 R0):

- `build-graph.sh` builds it from one `.osm.pbf` extract, in the same pinned
  image the service runs, and writes `valhalla.json`, `valhalla_tiles.tar`,
  `timezones.sqlite`, `admins.sqlite` and `SHA256SUMS`.
- The **Valhalla Graph** workflow (`.github/workflows/valhalla-graph.yml`, run
  by hand) builds it and publishes it to R2 at
  `bugrout-tiles/server/<extract>/<build-date>/`. R2 is the source of truth; a
  published version is never overwritten.
- `entrypoint.sh` serves the version named by `GRAPH_VERSION` in `fly.toml`. On
  the first boot of a version it downloads it onto the `valhalla_graph` volume
  at `/graph`, checks it against `SHA256SUMS`, and refuses to start on a
  mismatch. After that the volume is the cache: a cold start reads local disk
  only.

## Deploy

```bash
cd backend/services/valhalla
flyctl launch --no-deploy --copy-config --name bugrout-valhalla  # first time only
flyctl secrets set R2_ENDPOINT=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=...
flyctl deploy
```

The secrets are a **read-only** R2 token; see `docs/deployment-credentials.md`.
`flyctl deploy` creates the volume from `[mounts]` the first time.

Health check: `curl https://bugrout-valhalla.fly.dev/status`

`fly.toml` uses a TLS-only `[[services]]` block, not `[http_service]`. Fly's
HTTP handler adds an empty `Fly-Tracestate:` header to every request, and
`valhalla_service` rejects any empty header with `400 Malformed HTTP request` —
which broke every route request (#141). Don't switch it back.

## Rebuild the graph, or swap the extract

1. Run **Valhalla Graph** with the extract name and its Geofabrik URL (for
   example `us-south` and `.../north-america/us-south-latest.osm.pbf`), and
   `upload` ticked. Its summary prints the new version, e.g.
   `us-south/2026-11-06`.
2. Set `GRAPH_VERSION` in `fly.toml` `[env]` to that version and
   `flyctl deploy`. No image rebuild is involved; the machine pulls the new
   version on boot.

A larger extract needs a larger volume (`flyctl volumes extend`) and more
memory, and a wider graph needs the exclude-polygon limit in `build-graph.sh`
re-timed (#269).

To build locally instead, run `build-graph.sh` in the image named by the
Dockerfile's `FROM` line:

```bash
docker run --rm -v "$PWD:/work" -w /work --entrypoint bash <image> \
  backend/services/valhalla/build-graph.sh maryland.osm.pbf out/
```

## Roll back

Set `GRAPH_VERSION` back to the previous version and `flyctl deploy`. If that
version is still on the volume the switch is local and immediate; otherwise it
is pulled from R2 again. Versions accumulate on the volume; remove old ones with
`flyctl ssh console` and `rm -rf /graph/versions/<extract>/<date>`.

## Change the engine

Move the Dockerfile's `FROM` (tag and digest), rebuild the graph with the
workflow (it reads the same `FROM` line), then deploy the image and the new
`GRAPH_VERSION` together. A graph built by one Valhalla release is not
guaranteed to load in another.
