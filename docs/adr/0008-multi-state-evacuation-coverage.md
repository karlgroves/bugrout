# ADR 0008: Covering evacuations that cross state lines

- Status: **Accepted** — decided by the product owner 2026-10-28
- Date: 2026-10-05
- Context: Issue #190 (fake route to Louisville); related #151 (tile freshness),
  #147 (more regions), #146 and #193 (on-device routing), #187 (saved plans)

## Context

An evacuation often means leaving the affected area, so a trip that crosses a
state line is the normal case, not an edge case. Today nothing past Maryland
works:

- **Routing** runs on one Valhalla server (`backend/services/valhalla`, Fly,
  `iad`) whose road graph is built from Geofabrik's `maryland-latest.osm.pbf`
  alone. Baltimore to Hagerstown routes; Baltimore to Louisville gets Valhalla
  error 171, "No suitable edges near location".
- **The map** is the downloaded region's PMTiles, and the manifest publishes
  only `md` (about 138.5 MB on device). Past the border there is nothing to
  draw.
- **Routing needs a connection.** The app has no on-device road graph yet (#146,
  #193), so "offline-first" covers the map, not routing.

What #190 already fixed: a destination outside the graph no longer gets an
invented route; the app says the destination is outside coverage and what to do
(#209), and saving a plan whose destination is outside the downloaded maps warns
at save time. This ADR is about actually extending coverage.

Measured source sizes (Geofabrik, 2026-10-05):

| Extract                            | `.osm.pbf` |
| ---------------------------------- | ---------- |
| Maryland                           | 205 MB     |
| Virginia                           | 408 MB     |
| Pennsylvania                       | 332 MB     |
| US Northeast                       | 1,719 MB   |
| US South (includes MD, DE, DC, VA) | 3,945 MB   |
| Whole US                           | 11,621 MB  |

## Options

The map and the routing graph are separate problems, and the options below can
be combined.

### Routing

**R0. Move the routing graph out of the Docker image (prerequisite).** Today
`backend/services/valhalla/Dockerfile` downloads the PBF and runs
`valhalla_build_tiles` in a builder stage, then `COPY --from=builder` puts
`valhalla_tiles.tar` into the runtime image: the graph is an image layer, not
data. That is what makes R1 expensive rather than a one-line change. A 19x
larger extract means a multi-gigabyte image pulled onto the `shared-cpu-1x` /
1024 MB machine in `fly.toml`, which cold-starts from
`min_machines_running = 0`, and it is built single-threaded because
`--mjolnir-concurrency 1` is forced by the #178 double-free race. Building the
graph out of band — a job writing to a Fly volume or object storage, mounted by
the service — makes R1 a config change, lets the builder use many cores and
retry, and produces the same per-region artifact R2 needs.

**R1. Widen the server's graph to a multi-state extract.** Build the Fly
Valhalla image from US South plus US Northeast, or the whole US, instead of
Maryland. Behind R0 this is one build-argument change (`PBF_URL`) and every
destination in that area routes immediately; without R0 it is not — see R0.
Costs: a much larger graph artifact and volume (in the image itself without R0),
a longer build, and more memory on the machine; and routing still needs a
connection.

**R2. On-device graph per downloaded region (#146, #193).** Routing works with
no signal, which is the product's promise. But a route can only cross into a
region the user also downloaded, so it depends on M2 or M3 below, and it is the
largest piece of work.

**R3. Both.** The server graph covers any destination while there is signal; the
on-device graph covers the downloaded area when there isn't.

### Map

**M1. More single-state regions** (#147). The user downloads each state they
might pass through. Simple, but they have to know the route in advance.

**M2. Offer neighbouring states with a download.** Downloading Maryland suggests
Virginia, Pennsylvania, Delaware and West Virginia, each with its size. Covers
the likely exits from a state at a predictable size cost.

**M3. Corridor download for saved plans.** For each saved plan, download the map
(and later the graph) along the route to its destination, at the time the plan
is saved. Covers exactly the trip the user plans, at the lowest storage cost,
but needs a route-corridor tile extract that the pipeline doesn't have.

## Recommendation (for the product owner to accept or change)

- **Now: R1 with the US South and US Northeast extracts.** It is the smallest
  change that turns "outside coverage" into a working route for the trips
  Maryland users would actually make, and it does not touch the app.
- **Next: M2**, so the map follows the route across the border at a size the
  user is told up front.
- **Then: R3 via #146/#193**, so routing survives losing signal, the case the
  product exists for.
- **Later: M3**, once the pipeline can cut a corridor.

## Decision

Accepted 2026-10-28 by the product owner: **R0, then R1, with M2 in parallel.**

1. **R0 first** — decouple the graph from the image, as above. Every other
   routing option gets cheaper behind it, and it is the same artifact pipeline
   #146 and #193 already need.
2. **Then R1**, widening the server graph. **US South alone contains Maryland**,
   so that is a true one-argument change; US South _plus_ US Northeast is not,
   because the Dockerfile takes a single `ARG PBF_URL` and has no `osmium merge`
   stage. Start with US South; add Northeast only together with a merge step.
3. **M2 in parallel, starting now.** It touches no backend — manifest adjacency,
   the download prompt and its sizes — so it does not wait on the routing work.
4. **R2/R3 after**, continuing in #146 and #193. R1 only routes _with_ signal;
   on-device routing stays the product's actual promise.
5. **M3 later**, once the pipeline can cut a corridor extract.

**Mandatory with R1:** `--service-limits-max-exclude-polygons-length 250000` was
timed against Maryland's tiles (~1.7 s at 250 km of total perimeter, ~5.7 s at
1000 km, against the app's 10 s give-up). Re-time it on the widened graph and
update the app's `MAX_EXCLUDE_POLYGONS_PERIMETER_M` to match. The test that
compares the two keeps passing while the tuned value silently goes stale.

Follow-up issues are filed: R0 is #266, R1 is #267, M2 is #268 and the re-timing
above is #269. M3 and R2/R3 continue in their existing issues.
