/**
 * The picker doesn't list a place twice (#191).
 *
 * A place that is already a saved scenario isn't repeated under Recent
 * Destinations. Before, both rows showed, and because selection compares
 * coordinates, both ticked together.
 */

import { render, waitFor } from "@testing-library/react-native";

import DestinationScreen from "@/app/destination/index";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

// A stable reference: the mount effect depends on it (see destination.a11y).
const mockGetPosition = jest
  .fn()
  .mockResolvedValue({ lat: 39.29, lng: -76.61 });

jest.mock("@/hooks/useLocation", () => ({
  useLocation: () => ({
    position: { lat: 39.29, lng: -76.61 },
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

const mockGetRecentDestinations = jest.fn<Promise<unknown[]>, [number]>();

jest.mock("@/db/queries/preferences", () => ({
  getRecentDestinations: (limit: number) => mockGetRecentDestinations(limit),
  addRecentDestination: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/stores/useScenarioStore", () => ({
  useScenarioStore: () => ({
    scenarios: [
      {
        id: "s1",
        name: "Mom's house",
        destination: { lat: 39.31384, lng: -76.60208 },
        resourceStops: [],
        avoidZones: [],
      },
    ],
  }),
}));

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve([]),
});

describe("destination picker — recents", () => {
  it("doesn't repeat a saved scenario's place as a recent", async () => {
    mockGetRecentDestinations.mockResolvedValue([
      // Same place as the scenario, within the ~11 m rounding.
      {
        id: "39.3138,-76.6021",
        label: "Map pin",
        lat: 39.3138,
        lng: -76.6021,
        usedAt: 2,
      },
      {
        id: "38.9784,-76.4922",
        label: "Annapolis",
        lat: 38.9784,
        lng: -76.4922,
        usedAt: 1,
      },
    ]);

    const screen = await render(<DestinationScreen />);

    expect(
      await screen.findByLabelText("Use recent destination: Annapolis"),
    ).toBeTruthy();
    expect(screen.getByLabelText("Use scenario: Mom's house")).toBeTruthy();
    expect(
      screen.queryByLabelText("Use recent destination: Map pin"),
    ).toBeNull();
  });

  it("drops the Recent Destinations heading when every recent is a scenario", async () => {
    mockGetRecentDestinations.mockResolvedValue([
      {
        id: "39.3138,-76.6021",
        label: "Map pin",
        lat: 39.3138,
        lng: -76.6021,
        usedAt: 2,
      },
    ]);

    const screen = await render(<DestinationScreen />);

    await waitFor(() => {
      expect(mockGetRecentDestinations).toHaveBeenCalled();
    });
    expect(screen.getByText("Saved Scenarios")).toBeTruthy();
    expect(screen.queryByText("Recent Destinations")).toBeNull();
  });

  it("still lists five recents when some are scenario places", async () => {
    const recent = (i: number) => ({
      id: `r${i}`,
      label: `Place ${i}`,
      lat: 38 + i / 10,
      lng: -77,
      usedAt: 100 - i,
    });
    mockGetRecentDestinations.mockImplementation((limit) =>
      Promise.resolve(
        [
          {
            id: "39.3138,-76.6021",
            label: "Map pin",
            lat: 39.3138,
            lng: -76.6021,
            usedAt: 101,
          },
          ...[0, 1, 2, 3, 4, 5, 6].map(recent),
        ].slice(0, limit),
      ),
    );

    const screen = await render(<DestinationScreen />);

    expect(
      await screen.findByLabelText("Use recent destination: Place 4"),
    ).toBeTruthy();
    expect(
      screen.queryByLabelText("Use recent destination: Place 5"),
    ).toBeNull();
    expect(
      screen.queryByLabelText("Use recent destination: Map pin"),
    ).toBeNull();
  });
});
