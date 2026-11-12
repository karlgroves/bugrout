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

## Widen to US South (ADR 0008 R1)

Issue #267: ADR 0008 chose Geofabrik's US South extract for the first wider
graph. It already contains Maryland, Delaware, DC and Virginia, so it is one
extract, with no merge step. US South plus US Northeast needs an `osmium merge`
stage first and is a separate change.

No script or config logic in this directory changes to do it — only `fly.toml`'s
`GRAPH_VERSION`, and its volume and memory sizing — but the steps above are not
enough on their own:

1. **Build it locally.** The extract is
   `https://download.geofabrik.de/north-america/us-south-latest.osm.pbf` (3,945
   MB on 2026-10-05, about 19 times Maryland). Maryland took about 6 minutes at
   4 threads before the build went single-threaded (#178), so expect US South to
   run past the workflow's 6-hour limit. The workflow's publish step also needs
   `R2_ENDPOINT`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` as repository
   secrets; check `gh secret list` before relying on it.
2. **Record the build** for the PR that sets `GRAPH_VERSION`: wall-clock build
   time and the size of each of the five files.
3. **Size the volume and the machine from those figures.** `[mounts]` creates a
   5 GB volume. The first boot of a version holds its `.partial` download and
   every version already cached, so the volume needs room for the new tar plus
   any version kept for rollback. Extend an existing volume with
   `flyctl volumes extend`; `initial_size` applies only when the volume is
   created. `[[vm]]` is still `shared-cpu-1x` / `1024mb`, sized for Maryland —
   ADR 0008 lists more memory among R1's costs, so raise it with the graph
   rather than discovering it as a failed start.
4. **Publish** the five files under `server/us-south/<build-date>/`,
   `SHA256SUMS` last, set `GRAPH_VERSION = 'us-south/<build-date>'` and deploy.
   A local build publishes them by hand, and two things that the workflow
   handles for you will otherwise bite: `wrangler r2 object put` refuses objects
   over 300 MiB, which this tar passes, and R2 rejects the AWS CLI's default
   integrity checksums. Use the S3 API with the same settings as the workflow's
   Publish step:

   ```bash
   export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... R2_ENDPOINT=...
   export AWS_DEFAULT_REGION=auto
   export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
   export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
   prefix=s3://bugrout-tiles/server/us-south/<build-date>
   for f in valhalla.json valhalla_tiles.tar timezones.sqlite admins.sqlite \
     SHA256SUMS; do
     aws s3 cp --endpoint-url "$R2_ENDPOINT" "out/$f" "$prefix/$f"
   done
   ```

5. **Check the acceptance cases** against the deployed service:

   ```bash
   route() {
     curl -s -w ' %{time_total}s\n' https://bugrout-valhalla.fly.dev/route \
       --data "{\"locations\":[{\"lat\":39.2904,\"lon\":-76.6122},{\"lat\":$1,\"lon\":$2}],\"costing\":\"auto\"}"
   }
   route 38.2542 -85.7594  # Louisville: a trip, not error_code 171
   route 38.9784 -76.4922  # Annapolis: a trip; compare the time with Maryland
   route 41.8781 -87.6298  # Chicago, outside US South: error_code 171
   ```

   Chicago must still answer 171, which the app reports as outside coverage
   (`apps/mobile/services/routing/RouteUnavailable.ts`) rather than inventing a
   route. Time a cold start too: the first `/status` after the machine has
   stopped.

Once the US South graph is live, these go stale and need changing:

- The exclude-polygon limit in `build-graph.sh` (this directory) was timed on
  Maryland and must be re-timed on the wider graph (#269). The app's
  `MAX_EXCLUDE_POLYGONS_PERIMETER_M`
  (`apps/mobile/services/routing/AvoidanceBudget.ts`) has to move with it:
  `apps/mobile/__tests__/services/ExcludePolygonLimitSync.test.ts` asserts the
  two are equal, so changing one alone turns `pnpm run check` red. ADR 0008
  makes this re-timing mandatory with R1.
- `apps/mobile/services/tiles/Neighbors.ts`,
  `apps/mobile/components/downloads/NearbyStates.tsx` and
  `apps/mobile/__tests__/components/NearbyStates.test.tsx` say the routing graph
  is Maryland-only. The copy shown to users is about needing a connection, which
  stays true; the reasons given in the comments do not.
- `apps/mobile/e2e/routing-unavailable.test.ts` uses Louisville as the
  out-of-coverage destination. The replay server still answers it with 171, so
  the spec keeps passing, but it no longer describes the live server. Move it to
  a destination outside US South, and update the coordinate table in
  `apps/mobile/e2e/support/coverage.ts` to match — that table is about the
  save-time map-coverage alert, which R1 does not change, so it goes stale only
  as a consequence of this move.

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
