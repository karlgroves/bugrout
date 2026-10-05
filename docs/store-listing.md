# Store listing: claims and their evidence

The App Store and Play listing (`apps/mobile/fastlane/metadata/en-US/`) may only
claim what the submitted build does. Guideline 2.3.1 (accurate metadata)
rejections are common, reviewers test what they read, and an evacuation app gets
extra scrutiny under 1.4.1 (physical harm). Read this list against the build
**right before every submission**, and re-check anything whose issue has changed
state.

## What the listing claims now

| Claim                                                 | Evidence                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| Offline maps, Maryland only                           | Live manifest lists `md` alone (#147)                         |
| Severe-weather alerts shown and avoided when routing  | `NWSService`, `ThreatAvoidance`                               |
| Routing needs a data connection                       | Every route comes from the Fly Valhalla service (#193)        |
| Three taps from launch to navigation                  | `e2e/full-navigation.test.ts` counts them (#197)              |
| Up to 3 plans, with optional water stops              | `MAX_SCENARIOS`; `WaypointInsertion` with USGS data           |
| Voice guidance, next-turn card, "Advisory only" badge | Navigation screen                                             |
| A full list of every turn                             | `DirectionsList`, `RouteViewToggle` (#192)                    |
| Water sources from USGS and OpenStreetMap             | `USGSService` (USGS NWIS and Overpass)                        |
| Open shelters from FEMA, with status and "as of" time | `ShelterService` (FEMA ESF6-SS), `ShelterStatusNotice` (#201) |
| Up to 5 contacts; a text opens for the user to send   | `app/contacts`, `utils/sms.ts` (a one-time snapshot)          |
| No account, no advertising; what leaves the device    | `constants/legal.ts`; must match the privacy label (#206)     |

## Claims removed until the work lands

| Removed claim                                      | Why it's not true today                                        | Reinstate with |
| -------------------------------------------------- | -------------------------------------------------------------- | -------------- |
| Offline routing                                    | Routes come from a remote server; regions ship no graph        | #193, #146     |
| Evacuation Load Factor (ELF) congestion routing    | ELF is applied to no route                                     | #195           |
| Fuel stations; fuel stops                          | No API key in any build, and NREL has no gasoline              | #200           |
| Wildfire perimeters                                | The NIFC service queried returns 400 (2026-10-05)              | not yet filed  |
| Flood zones                                        | The app never downloads the region's flood GeoJSON             | not yet filed  |
| "Location processed on-device only"; "No tracking" | Route endpoints and searches leave the device; PostHog can run | #206           |
| Crowd signal                                       | Its endpoint doesn't resolve and the workers aren't deployed   | #144           |
| "Live" location in the emergency text              | The text carries a one-time snapshot                           | —              |
