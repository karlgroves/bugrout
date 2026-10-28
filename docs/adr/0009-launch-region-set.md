# ADR 0009: Which regions ship at launch, and what the free tier covers

- Status: **Proposed** — needs a decision from the product owner
- Date: 2026-10-28
- Context: Issue #196 (coverage beyond one state, spec open question #2);
  related #147 (publish more regions), #146 (routing tarball), #195 (ELF), #157
  (no deploy credentials). Follows ADR 0008.

## Context

ADR 0008 decided **how** coverage widens — R0 (graph out of the image), then R1
(server graph to US South), with M2 (offer neighbouring states on download) in
parallel. It deliberately did not decide **which regions get published**, and
that is the first question #196 asks. M2's code is now written (#268), so the
gap is visible in the product: a Maryland user is offered five neighbours and
every one of them reads "Not published yet".

Two separate decisions are outstanding, and nothing in ADR 0008 settles either.

### What is published today

The live manifest (`/v1/tiles/manifest`, checked 2026-10-28) lists exactly one
region:

```json
{
  "id": "md",
  "name": "Maryland",
  "pmtilesSize": 145188267,
  "valhallaSize": 0,
  "version": "2026.09.28"
}
```

`apps/mobile/constants/regions.ts` offers 51 region ids (50 states plus DC) as
an offline fallback list; one of them is real.
`data-pipeline/regions/region-definitions.json` defines four — `md`, `ca`, `tx`,
`fl` — so three of those four have never been built.

**`valhallaSize` is 0 for the only published region.** No routing graph has ever
been published for any region (#146). Every on-device figure below is therefore
**the map alone**, and the true per-region download is larger by an amount
nobody has measured yet. The first R0 build is what measures it.

### Measured source sizes

Geofabrik `.osm.pbf`, read from the US extract index on 2026-10-28:

| Extract              | Source  | Map on device (est.) |
| -------------------- | ------- | -------------------- |
| Maryland             | 206 MB  | 145 MB (measured)    |
| Delaware             | 21 MB   | ~15 MB               |
| District of Columbia | 20 MB   | ~14 MB               |
| West Virginia        | 94 MB   | ~66 MB               |
| Pennsylvania         | 333 MB  | ~235 MB              |
| Virginia             | 409 MB  | ~288 MB              |
| Florida              | 629 MB  | ~443 MB              |
| Texas                | 692 MB  | ~488 MB              |
| California           | 1200 MB | ~846 MB              |

The estimates scale Maryland's one real data point — 145,188,267 published bytes
from a 206 MB source, a ratio of 0.705 — so they are an order-of-magnitude
guide, not a quote. Maryland's own 206 MB is up 1 MB on the 205 MB ADR 0008
measured three weeks earlier, which is the scale of OSM drift behind #151.

Each region costs roughly **3 hours of build** (#241) plus an R2 publish, and
this repository has no Actions secrets at all (#157), so none of this is
buildable from CI as it stands.

## Decision 1: the launch region set

Two forces pull at different states.

- **Where the users are.** M2 is built, so Maryland's land neighbours — DC, DE,
  PA, VA, WV — are what makes it function rather than advertise.
- **Where the product is proven.** Spec §11.1 makes it a _launch hard gate_ that
  ELF routing beats shortest-path "verified on Camp Fire and Hurricane Ian
  evacuation routes as test cases" — Butte County, CA and Lee County, FL.
  Neither graph can exist until CA and FL are published, so the differentiator
  cannot be measured against its own acceptance criterion.

### Options

**L1. Maryland only (status quo).** No build cost. M2 ships offering five
neighbours that cannot be downloaded, and §11.1 stays unprovable.

**L2. Maryland plus its land neighbours** (DC, DE, PA, VA, WV). 1,083 MB of
source, ~764 MB of map if a user took all six, about 18 h of builds. Makes the
M2 work real. Does nothing for §11.1.

**L3. Maryland plus California and Florida** (the ELF corridors). 2,035 MB of
source, ~1,434 MB, about 9 h of builds. Addresses §11.1. But MD users still
cannot cross a border, and CA/FL users get a state whose neighbours are all
unpublished.

**L4. L2 and L3 together.** Eight regions, ~3,235 MB of source, about 24 h of
builds.

### Recommendation

**L2 now; L3 when #195 is fixed, not before.**

L2 is the only option that makes already-written code work. And L3's value is
conditional on something that is currently broken: #195 records that the ELF
baking step copies tiles through unchanged, so **ELF is not applied to any
route**. Publishing California and Florida today would buy two 3-hour builds and
prove nothing, because the comparison §11.1 demands would be ELF-vs-ELF with no
ELF in either. Sequence L3 behind #195 and it becomes a measurement; run it
before and it is theatre.

A cheaper check exists in the meantime: #195 can be proven on Maryland tiles
against any congested Maryland corridor. That is not the spec's test case, but
it establishes the mechanism works before 9 hours of builds ride on it.

## Decision 2: what the free tier covers

Spec §9.1 sets the free tier at "Basic routing + single offline region (**up to
3 counties**) + threat overlays". That promise cannot be kept by any code in the
repository:

- `apps/mobile/constants/counties.ts` defines county groups for `ca`, `fl` and
  `tx` only — **not for `md`**, the one published region.
- The downloads screen renders "county downloads coming soon"; no code path
  downloads a county group.
- The data pipeline has no county notion at all
  (`grep -ri county data-pipeline/` matches nothing), so no county-level
  artifact exists to download.
- `estimatedSizeMB` on each group is a hardcoded literal, never measured against
  a built extract.

So a free-tier user today gets a whole state or nothing, and the limit is
unenforced because it is unimplementable.

### Options

**F1. Drop the county limit; the free tier is one whole region.** Matches what
the code does. Maryland at ~145 MB is a defensible free download; California at
~846 MB of map plus an unmeasured graph is a different proposition.

**F2. Build county extracts in the pipeline and implement the download path.**
Honours the spec. Real pipeline work, and the per-county sizes then have to be
measured rather than estimated.

**F3. Cap the free tier by size rather than by counties** — one region up to N
MB, which the manifest already carries the data to enforce.

### Recommendation

**F1 now, F3 if large states make it necessary.** F1 makes the stated model
match the shipped product, which is the thing §2.3.1 and `docs/store-listing.md`
care about; keeping an unimplemented limit in the spec costs re-triage every
sweep. F3 is the cheap fallback if California-sized regions turn out to need
gating, and it needs no pipeline work. F2 only earns its cost if free-tier
storage is shown to drive abandonment.

Whichever is chosen, the spec §9.1 row and `constants/counties.ts` should stop
disagreeing with each other.

## Consequences

- #147 gets a region list and stops being "which regions?" — it becomes the
  build-and-publish job, still blocked on #157's credential.
- #196's acceptance item "the pipeline builds and publishes map tiles **and**
  routing graphs for every launch region" needs #146, which needs R0 (#266). Its
  last item — a 300-mile offline cross-state route — needs R2/R3, which ADR 0008
  deferred. **#196 cannot close on this ADR alone**; it closes when on-device
  routing lands.
- Publishing any region at all still needs the R2 credential in #157. A decision
  here does not unblock a build; it decides what the first credentialed build
  does.
- Revisit if the beta cohort is not in Maryland, or if #195's fix changes what
  the ELF gate needs.

## Decision

Not yet made. Needs one answer to Decision 1 and one to Decision 2.
