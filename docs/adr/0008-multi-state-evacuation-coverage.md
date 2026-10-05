# ADR 0008: Covering evacuations that cross state lines

- Status: **Proposed** — needs a decision from the product owner
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

**R1. Widen the server's graph to a multi-state extract.** Build the Fly
Valhalla image from US South plus US Northeast, or the whole US, instead of
Maryland. One build-argument change (`PBF_URL`), and every destination in that
area routes immediately. Costs: a much larger image and volume, a longer build,
and more memory on the machine; and routing still needs a connection.

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

Not yet made. When it is, this ADR moves to Accepted with the chosen options,
and follow-up issues are filed for each (proposed below, not yet filed):

- Widen the Valhalla server's graph (R1): build args, Fly machine size and
  volume, build time.
- Neighbouring-state downloads (M2): manifest adjacency, the download prompt and
  sizes.
- Corridor downloads for saved plans (M3): pipeline support for corridor
  extracts.
- On-device routing (R2/R3): continue in #146 and #193.
