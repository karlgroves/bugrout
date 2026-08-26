# Use cases

BugRout's user journeys, written in the
[`@afixt/usecase-runner`](https://www.npmjs.com/package/@afixt/usecase-runner)
DSL. Each `.uc.yaml` is simultaneously **documentation**, an **executable
test**, and an **accessibility contract**.

Steps target elements by ARIA role and accessible name, never by CSS. A step
that cannot find its element is reporting a real barrier, not a broken selector
— which is why authoring these surfaced the defects listed at the bottom of this
file.

Why it matters more here than in most apps: BugRout's users are, by design,
frightened, time-pressed, and possibly operating one-handed in a moving vehicle
or in poor light. An unlabelled control is not a compliance defect. It is a
person who cannot start their route.

## Layout

| File                                                 | Type     | Journey                                                   |
| ---------------------------------------------------- | -------- | --------------------------------------------------------- |
| `01-first-launch-disclaimer.uc.yaml`                 | positive | The legal disclaimer, all three onboarding steps          |
| `02-map-screen-controls.uc.yaml`                     | positive | Every map control: status, banner, filters, chip, FAB     |
| `03-destination-search.uc.yaml`                      | positive | The destination picker and its search field               |
| `04-destination-search-no-results.uc.yaml`           | negative | A no-match search explains itself                         |
| `05-settings-and-legal.uc.yaml`                      | positive | Every settings row; the offline maps screen               |
| `06-emergency-contacts.uc.yaml`                      | positive | Add a contact through the accessibility tree              |
| `07-no-tiles-downloaded.uc.yaml`                     | negative | No offline maps: named, and the fix is offered            |
| `08-scenarios-empty-state.uc.yaml`                   | negative | The scenarios tab explains itself when empty              |
| `native/09-route-preview-and-go.uc.yaml`             | positive | Route preview; Go and Back both operable                  |
| `native/10-active-navigation-advisory-badge.uc.yaml` | positive | "Advisory Only" badge and emergency SMS during navigation |
| `native/11-contact-limit-reached.uc.yaml`            | negative | Five contacts: the limit is stated, not silent            |
| `native/12-offline-no-connectivity.uc.yaml`          | negative | Offline: announced, and scenarios still route             |

## The web/native split

The runner compiles to Playwright, so it drives a DOM. BugRout has a
react-native-web build, and `expo export --platform web` emits **all 17 routes**
— every screen builds.

Building is not the same as working. `metro.config.js` replaces ten native-only
modules with empty stubs on web:

```text
expo-sqlite  expo-location  expo-battery  expo-sms  expo-speech
expo-crypto  expo-file-system  expo-haptics  @sentry/react-native
@maplibre/maplibre-react-native
```

So the top-level files cover what is genuinely operable on web, and `native/`
documents what needs a device:

| Needs                          | Why it cannot run on web                                  |
| ------------------------------ | --------------------------------------------------------- |
| GPS fix                        | `expo-location` is stubbed, so no route can be calculated |
| Turn-by-turn                   | Navigation needs GPS and `expo-speech`                    |
| Persisted data across a reload | The web database is an in-memory mock                     |
| Real offline state             | `expo-network` always reports connected on web            |
| Rendered map tiles             | MapLibre is stubbed; the map shows a placeholder          |

Files under `native/` are authored and **syntactically validated** here, but
pass only on a device.

### Every web file starts from onboarding, on purpose

`platform/sqlite.ts` falls back to an **in-memory** mock on web, so a page load
always starts from a genuine first launch — `disclaimer_accepted` never survives
a reload. Every top-level file therefore walks the three onboarding steps before
doing anything else. That repetition is the platform's, not the format's.

## Running

The runner is not yet a dependency of this repository — see **Status** below.
Once it is:

```bash
pnpm run usecases:build     # expo export --platform web
pnpm run usecases:serve     # serve on http://localhost:4599
```

Then, in another shell:

```bash
pnpm run usecases:validate  # parse + schema-check, no browser
pnpm run usecases:run       # execute the web-target files
pnpm run usecases:generate  # -> e2e/generated/*.spec.ts
```

`start_location` is a literal `http://localhost:4599/` in every file; the DSL
does not template that field.

## Status

**Authored and validated. Not yet wired into CI.**

Every file passes `usecase-runner validate`. The web-target files were executed
against a real `expo export --platform web` build, and the results below are
measured, not predicted.

| File                               | Steps passing | Remaining failures               |
| ---------------------------------- | ------------- | -------------------------------- |
| `01-first-launch-disclaimer`       | 14/15         | `audit:` only                    |
| `02-map-screen-controls`           | 17/20         | `audit:`, plus the Bug Out flake |
| `03-destination-search`            | 11/14         | `audit:`, plus "Clear search"    |
| `04-destination-search-no-results` | 9/10 best run | `audit:`, plus the Bug Out flake |
| `05-settings-and-legal`            | 21/22         | `audit:` only                    |
| `06-emergency-contacts`            | 21/22         | `audit:` only                    |
| `07-no-tiles-downloaded`           | 11/12         | `audit:` only                    |
| `08-scenarios-empty-state`         | 14/15         | `audit:` only                    |

### Two blockers

**`@afixt` packages are unavailable** — the npm token for the private scope
returns 401. That is why the runner is not a dependency yet, and why every
`audit:` step fails with "audit steps require `@afixt/afixt-engine`". The
`audit:` steps are authored and correct; they have never executed.

**The Bug Out activation is intermittent on web.**
`activate: button "Bug Out — set evacuation destination"` times out on some runs
and succeeds on others — 1 pass in 4 consecutive runs of the same file,
unchanged.

The obvious suspect was the map screen's infinite FAB pulse
(`withRepeat(…, -1)`), since Playwright's actionability check waits for an
element to stop moving, and the same animation is what issue #30 identifies as
the Detox blocker. **That was tested and ruled out**: a second web bundle built
with the pulse removed fails the same way. Cause not isolated. Recorded here
rather than papered over by switching those steps to a test id, because if it is
a real defect, hiding it is the wrong outcome.

## Accessibility defects found while authoring

Per the issue's instruction, these are **filed separately** rather than worked
around in the steps: #100, #101, #102, #103. Each was confirmed against the
running web build and in the source.

1. **The four Settings toggles have no accessible name.** `ToggleRow` in
   `app/(tabs)/settings.tsx` renders `<Switch>` with no `accessibilityLabel`;
   the visible text sits in a sibling `View` and is never associated with the
   control. A screen reader user meets four unlabelled switches — Units, Voice
   Navigation, Crowd Signal, Battery Optimization. `05-settings-and-legal`
   targets them by test id with a comment saying why, and those steps should
   become `locate: switch "Voice Navigation"` once fixed.

2. **The scenario card in the destination picker has no `accessibilityLabel`.**
   Its name comes from contents and reads
   `" Wildfire EastIncludes resource stops"` — a leading space and two
   run-together phrases. Every comparable control in the app is labelled
   properly; the map's equivalent chip is `"Quick activate: Wildfire East"`.

3. **No page has a `<title>`.** `document.title` is empty on every route.
   Browser tabs, history entries and screen-reader page announcements all get
   nothing, and every route is indistinguishable from every other.

4. **Screens with `headerShown: false` have no heading at all.** The onboarding
   screen renders "BugRout" and "Important Disclaimer" as generic elements, and
   the map and scenarios tabs have no heading either. Screens presented as Stack
   routes do get an `h1` from the navigator, which is why
   `verify: heading "Set Destination"` works but no equivalent exists for the
   tab screens.

5. **Two settings test ids are unstable or malformed.** The id is derived from
   the visible label, so `Crowd Signal (Anonymous)` yields
   `settings-toggle-crowd-signal-anonymous-` with a trailing dash, and
   `Units: Miles` yields `settings-toggle-units-miles` — an id that **changes
   when the setting changes**. The Units toggle is deliberately not asserted:
   there is no stable handle to target.

## What is not covered

- The active navigation screen, the route preview, and the scenario editor's
  save path, all of which need a device — documented under `native/`.
- Tile download progress, which needs `expo-file-system`.
- Any `audit:` result, pending the engine.
