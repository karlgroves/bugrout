# BugRout — Survival Routing App

## MVP Product Specification

**Version 1.0 | April 2026**
**Classification: Internal / Confidential**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Target Users & Use Cases](#3-target-users--use-cases)
4. [MVP Feature Set](#4-mvp-feature-set)
5. [Predictive Congestion Engine](#5-predictive-congestion-engine)
6. [Data Architecture & Sources](#6-data-architecture--sources)
7. [UX Principles & Screen Flow](#7-ux-principles--screen-flow)
8. [Technical Architecture](#8-technical-architecture)
9. [Monetization Model](#9-monetization-model)
10. [Risk Register](#10-risk-register)
11. [MVP Release Criteria](#11-mvp-release-criteria)
12. [Suggested Sprint Plan](#12-suggested-sprint-plan)
13. [Open Questions & Decisions Required](#13-open-questions--decisions-required)

- [Appendix: Glossary](#appendix-glossary)

---

## 1. Executive Summary

BugRout is a survival-focused mobile navigation application designed for emergency evacuation scenarios. Unlike conventional nav apps that optimize for speed under normal conditions, BugRout optimizes for **mission completion** — getting the user safely from origin to destination during infrastructure stress events such as wildfires, hurricanes, civil unrest, or grid-down situations.

> **Core insight:** In mass evacuations, individually rational routing decisions produce collectively catastrophic congestion. BugRout's predictive clogging engine routes users as a distributed system, not as individuals competing for the same roads.

The MVP targets individual consumers and prepper communities as primary early adopters, with a parallel B2G (Business-to-Government) path for municipal emergency management agencies who serve as force multipliers for network density.

| Field | Value |
|---|---|
| Product Name | BugRout |
| Platform | iOS and Android (React Native) |
| MVP Target Date | Q4 2026 |
| Primary User | Individual adults planning or executing emergency evacuation |
| Secondary User | Municipal emergency managers (B2G channel) |
| Core Differentiator | Predictive congestion routing + resource-aware pathfinding + full offline capability |

---

## 2. Problem Statement

### 2.1 The Evacuation Routing Gap

Existing navigation tools fail predictably under mass evacuation conditions. Three core failure modes have been documented repeatedly across real-world events including Hurricane Katrina (2005), the Camp Fire (2018), and Hurricane Ian (2022):

- **Same-road funneling.** Standard apps route all users to statistically fastest roads, which immediately become the slowest roads once evacuation volume begins. The optimization function is self-defeating at scale.
- **No resource awareness.** Apps provide no guidance on fuel availability, water sources, or supply points. In extended evacuations, resource depletion strands more people than road congestion alone.
- **Cloud dependency.** Consumer nav apps degrade or fail when cell networks are overwhelmed. The moment of highest need is the moment of lowest reliability.

### 2.2 What Users Currently Do

In the absence of purpose-built tooling, evacuees improvise with a patchwork of:

- Google Maps (real-time, but cloud-dependent and unoptimized for evacuation)
- Paper maps (offline, but static and resource-unaware)
- Facebook community groups (crowdsourced but unstructured)
- Radio/scanner feeds (real-time but requires hardware and expertise)

No single tool provides the combination of offline capability, resource awareness, and crowd-informed predictive routing that the scenario demands.

### 2.3 Scope Constraints for MVP

> **Out of scope for v1:** Marine, aerial, and international routing. The MVP focuses exclusively on ground vehicle evacuation in the continental United States.

---

## 3. Target Users & Use Cases

### 3.1 Primary Persona — The Prepared Individual

| Field | Detail |
|---|---|
| Name | Prepared Pete |
| Demographics | 35–60 years old, suburban or exurban, owns a vehicle |
| Motivation | Has experienced or closely observed a disaster. Wants a plan that works when everything else fails. |
| Behavior | Pre-plans routes, stores offline maps, participates in HAM/CERT communities |
| Pain Point | Existing tools assume infrastructure is functional. His whole scenario is that it isn't. |
| Willingness to Pay | High. Will pay $30–50 one-time or $5–8/month for something that genuinely works. |

### 3.2 Secondary Persona — The Reactive Evacuee

| Field | Detail |
|---|---|
| Name | Reactive Rachel |
| Demographics | 25–50 years old, may not have pre-planned |
| Motivation | A fire, flood, or emergency just happened. She is scared and needs immediate guidance. |
| Behavior | Opens whatever app she has. Minimal pre-configuration. |
| Pain Point | Can't think clearly under stress. Needs extremely low cognitive load UX. |
| Willingness to Pay | Low in the moment, but becomes a Prepared Pete after the event. |

### 3.3 B2G Persona — Emergency Manager

| Field | Detail |
|---|---|
| Name | EM Director Dana |
| Organization | County or municipal Office of Emergency Management |
| Motivation | Needs to coordinate citizen evacuation without overloading 911 and public messaging systems. |
| Behavior | Creates zone-based evacuation plans, monitors compliance, coordinates with DOT |
| Pain Point | Has no real-time visibility into civilian routing decisions. Can push alerts but can't route. |
| Value Prop | BugRout's Waze CCP integration + admin dashboard gives her a view she's never had. |

---

## 4. MVP Feature Set

Features are categorized as **MVP** (required for launch), **V1.1** (planned follow-on), or **Future** (backlog). This document covers MVP features only.

| Feature | Description | Phase | Priority |
|---|---|---|---|
| Offline Map Download | User downloads regional map tiles to device storage before an event. App is fully functional without any data connection once tiles are loaded. | MVP | P0 |
| Basic Routing | Point-to-point route calculation using downloaded OSM road data via Valhalla engine embedded in app. | MVP | P0 |
| Threat Overlay | Visual overlay of active wildfires (USFS), flood zones (FEMA NFHL), and NWS severe weather alerts on the map. | MVP | P0 |
| Fuel Station Layer | Display of nearby fuel stations using NREL API data, cached in offline tile set. | MVP | P0 |
| Water Source Layer | Display of municipal water points, USGS stream gauge locations, and OSM-tagged water sources. | MVP | P0 |
| Shelter Layer | Red Cross shelter locations and 211.org social service points, updated when online. | MVP | P1 |
| Predictive Clog Engine | Route selection weighted by historical evacuation congestion patterns per road type and region. Does not require real-time data — uses baked-in statistical model. | MVP | P0 |
| Crowd Signal (passive) | When online, anonymously reports user speed and heading to inform live congestion layer for other users. | MVP | P1 |
| Bug-Out Scenario Presets | User can pre-configure up to 3 named scenarios (e.g., "Wildfire East", "Grid Down") with destination, preferred roads, resource stops, and avoidance zones. | MVP | P1 |
| Threat Avoidance Routing | Routes automatically avoid active threat polygons (fire perimeters, flood zones) when calculating paths. | MVP | P0 |
| Waypoint Resource Stops | User can request route that passes through fuel or water sources within tolerable detour distance. | MVP | P1 |
| Alert Integration | Parses IPAWS / NWS CAP alerts and displays them in-app. Optionally reroutes if alert overlaps current route. | MVP | P1 |
| Emergency Contacts | User configures up to 5 contacts. App can send a one-tap SMS with current location + destination + ETA. | MVP | P2 |
| Live Traffic (online only) | When connected, supplements predictive model with TomTom or Waze CCP real-time traffic data. | V1.1 | — |
| Admin Dashboard (B2G) | Web-based dashboard for emergency managers to view aggregate routing data, push zone alerts, and create evacuation corridors. | V1.1 | — |
| Vehicle Profile | Optimize routing by vehicle type (2WD, 4WD, motorcycle, RV) including road surface and clearance constraints. | V1.1 | — |
| Community Reports | Waze-style in-app crowdsourced incident reporting (road blocked, fuel gone, water gone). | V1.1 | — |

---

## 5. Predictive Congestion Engine

### 5.1 Design Philosophy

The predictive clog engine is BugRout's primary technical differentiator. It operates in two modes:

- **Offline statistical** — always available, baked into the app at build time
- **Online augmented** — supplements the static model with live crowd signal when connected

The offline model must be useful on its own. It cannot require connectivity to function.

### 5.2 Offline Statistical Model

The offline model is a road-segment weight table baked into the app at build time, trained on historical evacuation data. Each road segment in the routing graph carries an additional **Evacuation Load Factor (ELF)** alongside its base travel time.

**Training data:**

- FHWA historical traffic counts
- Published post-event analyses (Katrina, Camp Fire, Harvey, Ian)
- OSM road classification attributes

**Features per segment:**

- Road class and lane count
- Proximity to population center
- Proximity to known evacuation origin zones
- Presence of on/off ramp
- Bridge/tunnel flag
- Historical ADT (average daily traffic)

**Output:** ELF is a multiplier (1.0–10.0) applied to the base travel time during routing. A highway with ELF 8.0 will be avoided in favor of a backroad with ELF 1.5 even if the backroad is nominally slower under normal conditions.

**Update cadence:** Model weights are updated in app releases, not dynamically. This is intentional — stability and offline reliability take priority over continuous accuracy.

### 5.3 Route Distribution Logic

To prevent BugRout itself from causing a clog on a preferred backroad, the routing engine implements a load distribution heuristic:

- When online, the server tracks aggregate route assignments per road segment in the active region.
- Routes are probabilistically biased away from segments with high BugRout assignment density.
- The bias is **soft** — user preference (saved scenarios, fuel stops) always overrides distribution pressure.
- Offline users receive a route from the static model only; distribution logic requires connectivity.

### 5.4 MVP Model Limitations

> **Important:** The MVP statistical model will not account for real-time events (a bridge just collapsed, a road just flooded). Users must be clearly informed in the UI that the predictive layer is statistical and advisory, not real-time. This is also a liability management requirement.

---

## 6. Data Architecture & Sources

### 6.1 Data Source Registry

| Source | Data Provided | Cost | Priority |
|---|---|---|---|
| OSM + Valhalla | Road network, routing graph, POI tags | Free | P0 |
| Protomaps (.pmtiles) | Offline vector tile rendering | Free / self-host | P0 |
| NWS api.weather.gov | Severe weather alerts, CAP polygons | Free | P0 |
| FEMA NFHL | Flood zone polygons (static + periodic refresh) | Free | P0 |
| USFS Active Fire Mapping | Fire perimeter GeoJSON (~12hr update cadence) | Free | P0 |
| NREL Alt Fuels API | Fuel station locations | Free | P0 |
| USGS NWIS | Stream gauge / water body locations | Free | P0 |
| Red Cross Open Data | Active shelter locations (event-driven) | Free | P1 |
| 211.org Open211 API | Shelter + water distribution points | Free | P1 |
| Overpass API (OSM) | Custom POI queries (hospitals, wells) | Free | P1 |
| Waze CCP | Real-time crowdsourced incidents (gov partner required) | Free (B2G) | V1.1 |
| TomTom Traffic | Historical traffic + real-time augmentation | Paid | V1.1 |
| GasBuddy / MyGasFeed | Real-time fuel availability + price | Paid / partner | V1.1 |

### 6.2 Offline Data Package

The offline tile package is the foundation of BugRout's reliability advantage. Users download a regional package before an event. The package must be self-contained.

- **Format:** Protomaps `.pmtiles` single-file format. One file per region (state or multi-county area).
- **Contents:** Valhalla routing graph, vector tiles for rendering, pre-baked POI layers (fuel, water, shelter), static FEMA flood zones, ELF weight table for the region.
- **Estimated size:** ~500MB–2GB per state depending on road density. Must be communicated clearly before download.
- **Update trigger:** App checks tile age on launch (when online). Prompts user to update if tiles are older than 90 days.
- **Storage:** User-configurable. Default to device storage; allow SD card on Android.

### 6.3 Backend Infrastructure (MVP)

The MVP backend is intentionally minimal. The app must be viable without it. Backend serves only supplementary functions.

- **Tile server:** Protomaps-compatible CDN (Cloudflare R2 or similar) serving `.pmtiles` regional packages.
- **Alert aggregator:** Lightweight service polling NWS, USFS, and FEMA APIs. Publishes normalized GeoJSON alert feed consumed by app when online.
- **Crowd signal collector:** Anonymized speed/heading telemetry endpoint. No PII. Data retained for maximum 48 hours.
- **Route assignment tracker:** In-memory store (Redis) tracking active route assignments per segment for load distribution logic.
- **Stack:** Cloudflare Workers + R2 for edge delivery; Fly.io for stateful services. Estimated MVP infrastructure cost: **< $200/month** at moderate scale.

---

## 7. UX Principles & Screen Flow

### 7.1 Core UX Principles

> **Stress-state design:** The app must be usable by someone who is scared, in a hurry, and possibly sleep-deprived. Cognitive load reduction is a safety feature, not a UX preference.

- **One primary action per screen.** No buried menus during active navigation.
- **High contrast, large touch targets.** Minimum 44pt tap areas everywhere.
- **Offline-first feedback.** The UI must clearly indicate online vs. offline state at all times. Green dot = live data active. Gray = offline model only.
- **No dark patterns.** No upsells, no prompts, no "rate this app" during navigation.
- **Battery optimization mode.** When routing, the app reduces background activity aggressively. Screen stays on only when navigating.

### 7.2 Primary Screen Flow

The happy path for a user activating BugRout during an emergency should require no more than **three taps from launch to active navigation.**

1. **Launch:** Map view with current location. Threat overlays visible immediately if cached. No loading screen.
2. **Tap 1:** "Bug Out" FAB (floating action button). Opens destination selector.
3. **Tap 2:** Select destination (from saved scenarios, or enter address, or tap map).
4. **Tap 3:** Confirm route. Navigation begins.

Secondary flows (scenario pre-configuration, tile download, resource stop preferences) are accessible from a settings drawer and do not interrupt the primary flow.

### 7.3 During Navigation

- Turn-by-turn with voice guidance (offline TTS).
- Persistent threat overlay — fire perimeters and flood zones remain visible while navigating.
- **Fuel gauge warning:** When estimated remaining range approaches next fuel stop, a non-intrusive banner surfaces.
- **One-tap emergency contact ping:** Available from navigation screen at all times.
- **Route recalculation:** Triggered by deviation >500m or user tap. Fully offline.

---

## 8. Technical Architecture

### 8.1 Platform

| Component | Choice |
|---|---|
| Framework | React Native (Expo managed workflow) |
| Routing Engine | Valhalla — compiled to native via C++ bindings or WASM |
| Map Rendering | MapLibre GL (open source, supports .pmtiles natively) |
| Offline Tiles | Protomaps .pmtiles via MapLibre PMTiles plugin |
| Routing Graph | OSM data processed via Valhalla tile builder at build time |
| TTS (Voice) | On-device TTS (iOS AVSpeechSynthesizer / Android TTS) |
| State Management | Zustand |
| Local Storage | SQLite (via expo-sqlite) for POI cache, scenarios, and preferences |
| Analytics | PostHog (self-hosted or cloud, privacy-first) |

### 8.2 Key Technical Risks & Resolutions

**Valhalla native embedding**
The preferred path is a prebuilt Valhalla C++ shared library wrapped in a React Native native module. Alternative: run Valhalla in a local HTTP server process on-device. The latter is simpler to implement but has higher battery and memory cost. A proof of concept is required in Sprint 0 before committing to either approach.

**Tile package size**
A full state `.pmtiles` file may be 1–3GB. Partial county-level downloads must be supported for users with limited storage. Tile streaming for low-storage devices is a V1.1 consideration.

**iOS background location**
Apple restricts background location use. Navigation must hold a continuous location session (`CLLocationManager` with `allowsBackgroundLocationUpdates`). This requires a specific App Store usage description and review scrutiny. Factor into approval timeline.

### 8.3 Privacy Architecture

- **No account required** for core functionality. Email/account optional for scenario sync across devices.
- **Crowd signal telemetry is anonymous by design.** Device ID is rotated every 24 hours. No persistent identifier is transmitted.
- **Location data is processed on-device only.** Never transmitted to BugRout servers except as anonymized speed/heading telemetry, and only when the user has opted in.
- **No advertising SDK.** No third-party analytics that transmit PII.

---

## 9. Monetization Model

### 9.1 MVP Revenue Model

| Field | Detail |
|---|---|
| Model | One-time purchase with freemium gating |
| Free Tier | Basic routing + single offline region (up to 3 counties) + threat overlays |
| Paid Tier (BugRout Pro) | $29.99 one-time purchase |
| Pro Includes | Unlimited regions, all resource layers (fuel/water/shelter), scenario presets, crowd signal |
| B2G / B2B | Annual license per agency — target $2,000–$10,000/yr depending on jurisdiction size |

### 9.2 Rationale

- **One-time purchase is the highest trust signal for a safety app.** Subscriptions create doubt about service continuity. The target audience has seen companies shut down.
- **$29.99 is within the established range** for serious utility apps in the outdoor/preparedness category (Gaia GPS, onX Maps, CalTopo). The audience accepts it.
- **B2G licensing provides recurring revenue** and serves as social proof for consumer marketing. A county emergency management endorsement is worth more than any paid acquisition channel.

---

## 10. Risk Register

| Risk | Description | Severity | Mitigation |
|---|---|---|---|
| Cold Start | App has low predictive value without network density. Offline model partially mitigates but doesn't replace crowd signal. | High | B2G partnerships provide first-mover density. Community drills generate real data without real disasters. |
| Liability | User follows a route and is harmed. Legal exposure if app is presented as authoritative. | High | Prominent disclaimers in onboarding and during navigation. "Advisory only" framing throughout. Consult insurance and legal before launch. |
| Valhalla Integration | Native Valhalla embedding is technically complex. WASM alternative is slower. | Medium | Spike in Sprint 0. Fall back to local HTTP server model if native binding proves too costly. |
| App Store Approval | Background location + emergency-use framing may attract Apple review scrutiny. | Medium | Engage Apple developer relations early. Frame as navigation app with safety features, not an "emergency" app. |
| Tile Package UX | 2GB download is a real barrier. Users who don't pre-load are unprotected when it matters. | Medium | Prominent onboarding step for tile download. Push reminder 24–48 hours after install if download not completed. |
| Competitor Response | Google or Apple could add similar features. | Low | Both have reputational reasons to avoid this space. Speed to market and B2G relationships are the moat. |
| Data Freshness | FEMA/USFS data has update lag. App may show outdated threat boundaries. | Medium | Display data timestamp prominently. Prompt update when online. Never imply real-time accuracy for static layers. |

---

## 11. MVP Release Criteria

### 11.1 Must-Have at Launch (Hard Gates)

- [ ] Offline routing functional with zero data connection on a fully downloaded region.
- [ ] Threat overlays (fire, flood, weather) rendering correctly from cached data.
- [ ] Fuel and water layers visible and tappable with distance calculations.
- [ ] Predictive ELF model producing demonstrably different routes vs. baseline shortest-path on known congested corridors (verified on Camp Fire and Hurricane Ian evacuation routes as test cases).
- [ ] Cold-start time under 3 seconds on devices 3 years old or newer.
- [ ] App functions correctly in airplane mode after tile download.
- [ ] Legal disclaimers present on first launch and on the navigation screen.
- [ ] Privacy policy and terms of service published and linked in-app.

### 11.2 Quality Thresholds

- Crash-free sessions > 99% on both iOS and Android in beta.
- Battery consumption during active navigation < 15% per hour on reference devices.
- Routing calculation time < 5 seconds for routes up to 500 miles, fully offline.
- Tile download resumable after interruption — no restart-from-zero on failed downloads.

### 11.3 Explicit Out of Scope for MVP

> These items must not be committed to in any marketing or press materials prior to V1.1 delivery.

- Real-time live traffic integration (requires Waze CCP or TomTom, requires connectivity)
- Community incident reporting (crowdsourced road conditions)
- Emergency manager admin dashboard
- Vehicle profile routing (off-road, RV, motorcycle)
- Multi-vehicle convoy coordination
- International routing outside the continental US
- Integration with emergency broadcast systems (EAS/IPAWS) beyond NWS CAP alerts

---

## 12. Suggested Sprint Plan

Each sprint is 2 weeks. Total MVP timeline: **12 weeks (6 sprints).**

### Sprint 0 — Foundation

- Repo setup, CI/CD, React Native + Expo scaffolding
- MapLibre + Protomaps integration proof of concept
- **Valhalla native binding spike — go/no-go decision**
- OSM data pipeline: download → Valhalla tile build → embed in app

### Sprint 1 — Offline Core

- Offline routing: point-to-point via Valhalla
- Tile download + management UX
- Basic map rendering with offline tiles
- Location tracking + heading

### Sprint 2 — Threat Layers

- NWS alert integration + polygon rendering
- FEMA flood zone layer
- USFS fire perimeter layer
- Threat avoidance routing (avoid polygon in Valhalla)

### Sprint 3 — Resource Layers

- NREL fuel station layer
- USGS water source layer
- Red Cross / 211 shelter layer
- Waypoint insertion: route through resource stop

### Sprint 4 — Clog Engine + Scenarios

- ELF weight table: build training pipeline, validate against known evacuation corridors
- Embed ELF weights in routing graph
- Scenario preset UX (save / load named scenarios)
- Emergency contact ping (SMS with location)

### Sprint 5 — Polish + Beta Prep

- Voice navigation (offline TTS)
- Cold start optimization
- Accessibility pass (minimum WCAG AA)
- TestFlight / Play Store internal testing
- Legal review: disclaimers, privacy policy, ToS

### Sprint 6 — Beta + Release

- Closed beta with target personas (prepper community, CERT members)
- Bug triage and performance profiling
- App Store and Play Store submission
- Launch comms: press kit, community outreach

---

## 13. Open Questions & Decisions Required

| # | Question | Owner | Deadline |
|---|---|---|---|
| 1 | Valhalla native vs. local HTTP: which embedding approach do we commit to after the Sprint 0 spike? | Engineering Lead | End of Sprint 0 |
| 2 | Which state(s) do we ship offline tiles for at launch? One state (CA) or multi-state? | Product | Sprint 1 |
| 3 | Do we pursue Waze CCP partnership pre-launch? Requires gov/nonprofit affiliation. | BD / Founders | Sprint 2 |
| 4 | One-time $29.99 confirmed, or do we A/B test $19.99 vs $39.99 at launch? | Founders | Sprint 3 |
| 5 | Legal entity and insurance: what product liability coverage is appropriate for a safety navigation app? | Founders / Legal | Pre-Beta |
| 6 | App name "BugRout" — trademark search completed? Any concerns with App Store framing? | Founders / Legal | Sprint 1 |
| 7 | B2G pilot: do we have any county OEM contacts for a soft launch partnership? | BD / Founders | Sprint 4 |

---

## Appendix: Glossary

| Term | Definition |
|---|---|
| ADT | Average Daily Traffic — a standard road traffic measurement used in the ELF training model. |
| CAP | Common Alerting Protocol — the XML standard used by NWS and IPAWS for emergency alerts. |
| ELF | Evacuation Load Factor — BugRout's proprietary road-segment stress score used in routing. A multiplier (1.0–10.0) applied to base travel time. |
| FHWA | Federal Highway Administration — source of historical road traffic count data. |
| IPAWS | Integrated Public Alert and Warning System — the federal emergency alert infrastructure. |
| NFHL | National Flood Hazard Layer — FEMA's GIS dataset of flood zone designations. |
| NIFC | National Interagency Fire Center — publishes fire perimeter GeoJSON data. |
| NREL | National Renewable Energy Laboratory — publishes the Alternative Fuels Station Locator API. |
| NWIS | National Water Information System — USGS database of stream gauges and water bodies. |
| OSM | OpenStreetMap — the open-source geographic database used for road network and POI data. |
| Protomaps | A cloud-native map tile format (.pmtiles) optimized for offline single-file deployment. |
| Valhalla | Open-source routing engine by Mapzen/Linux Foundation, used for on-device route calculation. |
| Waze CCP | Connected Citizens Program — Waze's free real-time data sharing program for government partners. |

---

*© 2026 BugRout. All rights reserved. — BugRout MVP Product Specification v1.0*
