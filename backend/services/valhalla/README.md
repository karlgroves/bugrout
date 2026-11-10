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

Do not deploy this image until a graph is published and `GRAPH_VERSION` names
it: the entrypoint refuses to start on the placeholder, so the deploy would
replace the running service with one that serves nothing.

Health check: `curl https://bugrout-valhalla.fly.dev/status`

`fly.toml` uses a TLS-only `[[services]]` block, not `[http_service]`. Fly's
HTTP handler adds an empty `Fly-Tracestate:` header to every request, and
`valhalla_service` rejects any empty header with `400 Malformed HTTP request` —
which broke every route request (#141). Don't switch it back.

## Exposure

The service is public and unauthenticated: the app sends no credential, and one
embedded in the app could be extracted from it anyway. What bounds abuse today
(issue #289):

- `build-graph.sh` ships `loki.actions` as `route,status` only, so the expensive
  endpoints (isochrone, matrix, map matching, expansion) are refused. It takes
  effect with the next graph built and deployed.
- `max_exclude_polygons_length` caps the costliest part of a route request.

There is no connection cap in `fly.toml`. The `tls` handler passes bytes
through, so Fly can only count connections, and `valhalla_service` never closes
an idle HTTP/1.1 keep-alive connection (it also ignores `Connection: close` on
HTTP/1.1). The app's HTTP clients pool connections for minutes, so a small cap
fills with idle connections from a few devices and refuses everyone else while
the worker is idle. A cap was considered for #289 and dropped for that reason.

Nothing here stops one client from flooding the single worker thread. Per-client
rate limiting, and any concurrency cap, need a proxy in front of
`valhalla_service` that sees client addresses and closes idle connections. That
is a deployment change still to be decided.

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

The workflow stops at GitHub's 6-hour job limit, and the build is
single-threaded (#178), so a multi-state extract may not finish there. To build
locally instead, run `build-graph.sh` in the image named by the Dockerfile's
`FROM` line, then copy the five files to the same R2 prefix, `SHA256SUMS` last:

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
