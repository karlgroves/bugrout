/**
 * Launch to navigation in three taps: Bug Out → destination → Go (#197).
 *
 * Choosing a destination used to need a separate "Route & Go", which then
 * didn't go — it opened the preview, where Go was a fourth tap. Spec §7.2
 * makes three a hard rule, and says the third tap starts navigation. Now
 * tapping a destination routes to it and opens the preview, so the preview's
 * Go is tap 3; the threat warnings and disclaimer it shows are still seen
 * before navigation starts.
 */

import { act, fireEvent, render } from "@testing-library/react-native";
import { Alert } from "react-native";

import DestinationScreen from "@/app/destination/index";

import type { LatLng } from "@bugrout/shared";

const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

const BALTIMORE = { lat: 39.2904, lng: -76.6122 };
let mockPosition: LatLng | null = BALTIMORE;
// Stable across renders: the mount effect depends on it.
const mockGetPosition = jest.fn();
jest.mock("@/hooks/useLocation", () => ({
  useLocation: () => ({
    position: mockPosition,
    getPosition: mockGetPosition,
    error: null,
  }),
}));

const mockCalculateRoute = jest.fn().mockResolvedValue(undefined);
const mockCalculateRouteWithStops = jest.fn().mockResolvedValue(undefined);
jest.mock("@/hooks/useRoute", () => ({
  useRoute: () => ({
    calculateRoute: mockCalculateRoute,
    calculateRouteWithStops: mockCalculateRouteWithStops,
  }),
}));

jest.mock("@/db/queries/preferences", () => ({
  getRecentDestinations: jest
    .fn()
    .mockResolvedValue([
      { id: "r1", label: "Annapolis", lat: 38.9784, lng: -76.4922, usedAt: 1 },
    ]),
  addRecentDestination: jest.fn().mockResolvedValue(undefined),
}));

const STOPS = [{ type: "fuel", enabled: true }];
jest.mock("@/stores/useScenarioStore", () => ({
  useScenarioStore: () => ({
    scenarios: [
      {
        id: "s1",
        name: "Mom's house",
        destination: { lat: 39.3138, lng: -76.6021 },
        resourceStops: [],
        avoidZones: [],
      },
      {
        id: "s2",
        name: "Shelter run",
        destination: { lat: 39.1, lng: -76.8 },
        resourceStops: STOPS,
        avoidZones: [],
      },
    ],
  }),
}));

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve([]),
});

beforeEach(() => {
  mockReplace.mockReset();
  mockCalculateRoute.mockClear();
  mockCalculateRouteWithStops.mockClear();
  mockGetPosition.mockReset().mockResolvedValue({ position: BALTIMORE });
  mockPosition = BALTIMORE;
  mockParams = {};
});

describe("destination picker — one tap from destination to preview", () => {
  it("routes a saved scenario and opens the preview on the tap itself", async () => {
    const screen = await render(<DestinationScreen />);

    await fireEvent.press(
      await screen.findByLabelText("Use scenario: Mom's house"),
    );

    expect(mockCalculateRoute).toHaveBeenCalledWith(
      BALTIMORE,
      { lat: 39.3138, lng: -76.6021 },
      undefined,
    );
    expect(mockReplace).toHaveBeenCalledWith("/route-preview");
  });

  it("routes a scenario with stops through them", async () => {
    const screen = await render(<DestinationScreen />);

    await fireEvent.press(
      await screen.findByLabelText("Use scenario: Shelter run"),
    );

    expect(mockCalculateRouteWithStops).toHaveBeenCalledWith(
      BALTIMORE,
      { lat: 39.1, lng: -76.8 },
      STOPS,
      undefined,
    );
    expect(mockReplace).toHaveBeenCalledWith("/route-preview");
  });

  it("routes a recent destination on the tap itself", async () => {
    const screen = await render(<DestinationScreen />);

    await fireEvent.press(
      await screen.findByLabelText("Use recent destination: Annapolis"),
    );

    expect(mockCalculateRoute).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/route-preview");
  });

  it("has no Route & Go step, and no button promising to go", async () => {
    const screen = await render(<DestinationScreen />);
    await screen.findByLabelText("Use scenario: Mom's house");

    expect(screen.queryByText("Route & Go")).toBeNull();
    expect(screen.queryByTestId("route-and-go-button")).toBeNull();
    // Without a dropped pin there is nothing for a button to route.
    expect(screen.queryByTestId("preview-route-button")).toBeNull();
  });

  it("waits for the first GPS fix rather than refusing a quick tap", async () => {
    mockPosition = null;
    const screen = await render(<DestinationScreen />);

    await fireEvent.press(
      await screen.findByLabelText("Use scenario: Mom's house"),
    );

    expect(mockGetPosition).toHaveBeenCalled();
    expect(mockCalculateRoute).toHaveBeenCalledWith(
      BALTIMORE,
      expect.anything(),
      undefined,
    );
  });

  it("explains, and routes nothing, when no fix can be had", async () => {
    mockPosition = null;
    mockGetPosition.mockResolvedValue(null);
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    const screen = await render(<DestinationScreen />);

    await fireEvent.press(
      await screen.findByLabelText("Use scenario: Mom's house"),
    );

    expect(alert).toHaveBeenCalledWith(
      "Location Unavailable",
      expect.any(String),
      expect.any(Array),
    );
    expect(mockCalculateRoute).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});

describe("destination picker — a pin dropped on the map", () => {
  it("offers Preview route, which routes to the pin", async () => {
    mockParams = { pinLat: "39.300000", pinLng: "-76.600000" };
    const screen = await render(<DestinationScreen />);

    const button = await screen.findByLabelText("Preview route");
    await act(async () => {
      fireEvent.press(button);
      await Promise.resolve();
    });

    expect(mockCalculateRoute).toHaveBeenCalledWith(
      BALTIMORE,
      { lat: 39.3, lng: -76.6 },
      undefined,
    );
    expect(mockReplace).toHaveBeenCalledWith("/route-preview");
  });
});
