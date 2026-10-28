# ADR 0010: How published tiles stay current, and where the refresh runs

- Status: **Proposed** — needs a decision from the product owner
- Date: 2026-10-28
- Context: Issue #151 (keep published tiles current); related #147 (publish more
  regions), #179 (staleness keyed off version), #266 (R0, graph out of the
  image), #157 (no deploy credentials). Follows ADR 0008.

## Context

Published tiles age, and for an evacuation app a road that closed after the
build is the whole problem. #151 asks for three things; **one of them is already
done**, which leaves two decisions.

### Corrections to the issue as written

**The tiles are not from 2026-04-12.** The live manifest (checked 2026-10-28)
reports `"version": "2026.09.28"` for `md` — about 30 days old, not five and a
half months. The issue body predates a refresh.

**Clients already learn of an update.** #151's third item says "the app already
has stale-tile warnings keyed off `version`; confirm they fire." They do, and
not in the way the body assumes. `services/tiles/TileVersions.ts` was rewritten
in #179: `isRegionStale` compares the downloaded region's `version` against the
manifest's published version, and the 90-day `downloadedAt` age is only a
fallback for when the manifest cannot be fetched. Before #179 it was age alone,
so a region downloaded the morning a new version shipped went unflagged for
three months. That item is closed.

So #151 reduces to **when to rebuild** and **where the rebuild runs**.

### What a refresh costs

- **A build is about 3 hours per region** plus an R2 publish (#241), and this
  repository has no Actions secrets at all (#157).
- **There is no incremental tile update.** Nothing in
  `apps/mobile/services/tiles/` does a delta or patch; `isRegionStale` returns
  true on _any_ version difference, and the downloads screen then shows "Update
  available". So every publish costs every user holding that region a **full
  re-download** — ~145 MB for Maryland, and on ADR 0009's estimates ~846 MB if
  California is ever published. Cadence is not free.
- **Scheduled GitHub Actions are banned** (CLAUDE.md, "CI policy").
  `data-pipeline.yml` is `workflow_dispatch`-only; #75 removed its Sunday cron
  and the workflow's own header says this job "does not belong in GitHub Actions
  at all".
- The project already runs **two Fly apps** (`valhalla`, `route-tracker`) and
  **three Cloudflare Workers**, so either platform is an existing account rather
  than a new vendor.

One measurement of drift: Maryland's source extract was 205 MB on 2026-10-05
(ADR 0008) and 206 MB on 2026-10-28. That shows edits arriving steadily; it does
not say how many of them are road closures, and nothing here measures that.

## Decision 1: target freshness

**C1. Monthly.** Freshest. Twelve full re-downloads a year per region held,
which for a user on cellular during the month before an evacuation is a real
cost, not a rounding error.

**C2. Quarterly.** Matches `STALE_THRESHOLD_DAYS = 90`, the constant the app
already ships, so the two notions of "stale" agree instead of contradicting each
other. Four re-downloads a year.

**C3. On significant OSM change.** Rebuild when the extract's road network moves
by more than some threshold. The most defensible per byte, and the only option
that spends bandwidth in proportion to what actually changed — but it needs a
diff metric the pipeline does not have.

**C4. Pre-season, by hand.** Rebuild each region before its hazard season.

### Recommendation

**C2 as the floor, plus C4 before each region's season.**

Quarterly because the app already defines 90 days as the age at which a download
stops being trustworthy; picking any other cadence means the server's idea of
fresh and the client's disagree. Plus a manual pre-season rebuild because
evacuation risk is seasonal and a calendar quarter does not know that — a June
rebuild matters more in Florida than a January one. Avoid C1 until delta updates
exist; twelve full re-downloads a year is a cost the product gets nothing for.
C3 is the right long-run answer and should be revisited once there is a
road-diff metric to key it off.

## Decision 2: where the refresh runs

**W1. A Cloudflare Cron Trigger that dispatches the existing workflow.** A
Worker fires on a cron and calls the GitHub API to `workflow_dispatch` Data
Pipeline. Cheapest to build — three Workers already exist — and a Worker cannot
do the build itself anyway, so it only ever triggers. **But the compute stays in
Actions**, which is what CLAUDE.md says this work should not use at all; only
the scheduler moves. Choosing this needs an explicit ruling that moving the
trigger is enough.

**W2. A scheduled Fly Machine.** Fly Machines take a schedule, so both the timer
and the compute leave Actions. The account, CLI and deploy path already exist. A
3-hour build needs a volume and a machine well above the `shared-cpu-1x` / 1024
MB that `backend/services/valhalla/fly.toml` uses. Alerting and retries have to
be built; Fly gives neither for free.

**W3. Fold it into R0's builder (#266).** ADR 0008 already accepted R0: build
the Valhalla graph out of band on real compute and have the service mount it.
That job downloads a Geofabrik extract, builds for hours on a sized machine, and
publishes a versioned artifact — the same shape as a tile refresh, against the
same extract. #266's acceptance criteria already call for a documented rebuild
and rollback path.

### Recommendation

**W3.** Building a separate freshness job first means building the same machine
twice. R0 is decided, has to exist, and needs the identical extract download,
compute profile and artifact publish; tile publishing is one more output of that
builder, and the per-region packaging #146 needs comes out of the same run.
Until R0 lands, leave `data-pipeline.yml` on `workflow_dispatch` and rebuild by
hand — which is the status quo, and at a ~30-day-old manifest it is not
currently the binding problem.

Whichever is chosen, **a failed refresh has to alert someone.** A silent failure
means tiles age exactly as they do today while a dashboard says the job is
configured, which is a worse position than rebuilding by hand.

## Consequences

- #151's third acceptance item is already satisfied by #179 and can be ticked.
  The issue is now two rulings, not three tasks.
- Freshness is coupled to bandwidth while there is no delta update. If C1 is
  chosen, incremental tile updates need their own issue first.
- W3 ties tile freshness to #266's delivery. If R0 slips, the manifest keeps
  ageing, so the cadence clock should start from R0 landing, not from this ADR.
- Publishing anything still needs the R2 credential in #157; this ADR decides
  what the schedule does once that exists.
- Revisit when R0 lands, when a road-diff metric exists, or if a region's tiles
  are found stale during a real event.

## Decision

Not yet made. Needs one answer to Decision 1 and one to Decision 2.
