# Use cases

BugRout's user journeys, written in the `@afixt/usecase-runner` DSL. (Not
linked: the package is private, so the npm page returns 403 for anyone without
access to the scope — which is also why it is not yet a dependency here.) Each
`.uc.yaml` is simultaneously **documentation**, an **executable test**, and an
**accessibility contract**.

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

**Authored, validated, and executed against a real build. Not yet wired into
CI.**

Every file passes `usecase-runner validate`. The web-target files were run
against a real `expo export --platform web` build of `main`; the numbers below
are measured, not predicted.

| File                               | Steps passing | Remaining failures |
| ---------------------------------- | ------------- | ------------------ |
| `01-first-launch-disclaimer`       | 14/15         | `audit:` only      |
| `02-map-screen-controls`           | 19/20         | `audit:` only      |
| `03-destination-search`            | 13/14         | `audit:` only      |
| `04-destination-search-no-results` | 9/10          | `audit:` only      |
| `05-settings-and-legal`            | 23/24         | `audit:` only      |
| `06-emergency-contacts`            | 21/22         | `audit:` only      |
| `07-no-tiles-downloaded`           | 11/12         | `audit:` only      |
| `08-scenarios-empty-state`         | 14/15         | `audit:` only      |

Those numbers are from a run with **reduce-motion enabled** — see below, it is
not optional.

### The one remaining blocker

**`@afixt` packages are unavailable** — the npm token for the private scope
returns 401. That is why the runner is not a dependency yet, and why every
`audit:` step fails with "audit steps require `@afixt/afixt-engine`". The
`audit:` steps are authored and correct; they have never executed.

### Run with reduce-motion enabled

The Bug Out control is unclickable by Playwright unless the browser reports
`prefers-reduced-motion: reduce`. Playwright's actionability check waits for an
element to stop moving, and the map screen's FAB pulses forever
(`withRepeat(…, -1)`) unless the reduce-motion preference suppresses it.

This was measured, and it corrects an earlier claim in this file that the
animation had been "ruled out":

| build               | `02-map-screen-controls` | `04-no-results` | Bug Out click       |
| ------------------- | ------------------------ | --------------- | ------------------- |
| default (animating) | 17/20                    | 4/10            | fails, 3 of 3 runs  |
| reduce-motion on    | **19/20**                | **9/10**        | passes, 4 of 4 runs |

The earlier A/B that appeared to exonerate the animation was one run per arm
against pre-#30 code, and was simply wrong.

Two consequences worth carrying forward:

- When this is wired into CI, the Playwright context must set
  `reducedMotion: 'reduce'`. That is also the honest configuration — it is how a
  user with the preference set experiences the app.
- It made #109 more important than its severity suggested: nothing pinned the
  reduce-motion guard in the map screen, so a regression would have cost this
  suite as well as the accessibility property. That guard is now pinned by
  `apps/mobile/__tests__/screens/mapFabReducedMotion.test.tsx`, which asserts
  the branch reanimated actually takes rather than the rendered transform —
  under the jest mock the animation never runs, so the transform reads
  `scale: 1` either way and cannot distinguish them.

## Accessibility defects found while authoring — all now fixed

Authoring against real accessible names surfaced five defects that the Detox
suite and the unit tests never saw. Each was filed separately rather than worked
around in a step, and each has since been fixed and merged:

| #    | Defect                                                                 | Fixed by |
| ---- | ---------------------------------------------------------------------- | -------- |
| #100 | All four Settings switches had no accessible name                      | #105     |
| #101 | No page had a `<title>`; screens without a Stack header had no heading | #108     |
| #102 | The destination picker's rows had no `accessibilityLabel`              | #106     |
| #103 | Two Settings test ids were malformed or state-dependent                | #107     |

That is the argument for this format, made concretely: none of these were
visible to a suite that drives the app by text and test id, and all four were
found by insisting that every step address its element the way assistive
technology does.

`05-settings-and-legal.uc.yaml` shows the payoff directly — it originally
targeted the Settings switches by test id, with a comment recording that as a
finding. Now that they have names, it targets them by role and name, which is
what the format is for.

A fifth observation, which turned out **not** to be a defect: the bottom tab bar
looked unlabelled in an accessibility-tree dump. `role="tab"` computes its name
from contents, so `getByRole('tab', { name: 'Map' })` resolves. Checked before
filing.

## What is not covered

- The active navigation screen, the route preview, and the scenario editor's
  save path, all of which need a device — documented under `native/`.
- Tile download progress, which needs `expo-file-system`.
- Any `audit:` result, pending the engine.
