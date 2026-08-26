/**
 * Accessibility contract for the destination picker's result rows.
 *
 * None of the three row types — search result, saved scenario, recent
 * destination — had an accessibilityLabel, so each took its name from its
 * contents. The scenario row announced as " Wildfire EastIncludes resource
 * stops": a leading space from the icon, then two phrases run together.
 *
 * Found while authoring docs/use-cases/ (#81), filed as #102.
 */

import { render } from "@testing-library/react-native";

import DestinationScreen from "@/app/destination/index";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

// getPosition must be a STABLE reference across renders. The screen's mount
// effect lists it as a dependency and the real hook memoizes it with
// useCallback; a fresh jest.fn() per render re-fires the effect forever and
// the render never settles.
const mockGetPosition = jest
  .fn()
  .mockResolvedValue({ lat: 37.77, lng: -122.41 });

jest.mock("@/hooks/useLocation", () => ({
  useLocation: () => ({
    position: { lat: 37.77, lng: -122.41 },
    getPosition: mockGetPosition,
    locationError: null,
  }),
}));

jest.mock("@/hooks/useRoute", () => ({
  useRoute: () => ({
    calculateRoute: jest.fn(),
    calculateRouteWithStops: jest.fn(),
  }),
}));

jest.mock("@/db/queries/preferences", () => ({
  getRecentDestinations: jest
    .fn()
    .mockResolvedValue([
      { id: "r1", label: "Sacramento, CA", lat: 38.5816, lng: -121.4944 },
    ]),
  addRecentDestination: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/stores/useScenarioStore", () => ({
  useScenarioStore: () => ({
    scenarios: [
      {
        id: "s1",
        name: "Wildfire East",
        destination: { lat: 39.1, lng: -120.9 },
        resourceStops: [{ type: "fuel", enabled: true }],
        avoidZones: [],
      },
      {
        id: "s2",
        name: "Coastal Flood",
        destination: { lat: 37.4, lng: -122.1 },
        resourceStops: [],
        avoidZones: [],
      },
    ],
  }),
}));

// The screen geocodes with a bare fetch on this branch; stub the network so no
// test here can reach Nominatim.
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve([]),
});

describe("destination picker — every row is named", () => {
  it("names a saved scenario without running its detail into the name", async () => {
    const { findByLabelText } = await render(<DestinationScreen />);

    const row = await findByLabelText("Use scenario: Wildfire East");
    expect(row.props.accessibilityLabel).toBe("Use scenario: Wildfire East");
  });

  it("puts the resource-stop detail in the hint, not the name", async () => {
    const { findByLabelText } = await render(<DestinationScreen />);

    expect(
      (await findByLabelText("Use scenario: Wildfire East")).props
        .accessibilityHint,
    ).toBe("Routes via your configured fuel and water stops");

    expect(
      (await findByLabelText("Use scenario: Coastal Flood")).props
        .accessibilityHint,
    ).toBe("Routes directly to this scenario's destination");
  });

  it("names a recent destination", async () => {
    const { findByLabelText } = await render(<DestinationScreen />);

    expect(
      await findByLabelText("Use recent destination: Sacramento, CA"),
    ).toBeTruthy();
  });

  it("exposes selection state rather than only a check icon", async () => {
    // The selected row is marked with a checkmark glyph. Without
    // accessibilityState there is nothing for a screen reader to convey.
    const { findByLabelText } = await render(<DestinationScreen />);

    expect(
      (await findByLabelText("Use scenario: Wildfire East")).props
        .accessibilityState,
    ).toEqual({ selected: false });
  });

  it("marks the section headings as level-2 headers", async () => {
    // react-native-web maps a bare header role to <h1>, which would put a
    // second h1 on the page beside the screen title.
    const { findByText } = await render(<DestinationScreen />);

    const heading = await findByText("Saved Scenarios");
    expect(heading.props.accessibilityRole).toBe("header");
    expect(heading.props["aria-level"]).toBe(2);
  });
});
