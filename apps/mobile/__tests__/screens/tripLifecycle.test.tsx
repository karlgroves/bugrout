/**
 * A trip can always be ended, and a route that was never started is not a trip
 * (#189).
 *
 * A calculated route used to be "active" at once. Backing out of the preview
 * — its Back button, a swipe, Android back — returned to a map that hid the
 * Bug Out button because a "trip" was running, drew the route, and offered no
 * Stop anywhere. The only way out was to force-quit. Seen on the iOS simulator
 * on 2026-09-29.
 */

import { act, fireEvent, render } from "@testing-library/react-native";

import MapScreen from "@/app/(tabs)/index";
import RoutePreviewScreen from "@/app/route-preview/index";
import { useRouteStore } from "@/stores/useRouteStore";

import type { Route } from "@bugrout/shared";

jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>(
    "react-native-reanimated/mock",
  ),
  __esModule: true,
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
}));

const mockStop = jest.fn().mockResolvedValue(undefined);
jest.mock("@/services/navigation/NavigationController", () => ({
  stop: () => mockStop() as unknown,
}));

jest.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));
jest.mock("@/hooks/useLocation", () => ({
  useLocation: () => ({
    position: null,
    getPosition: jest.fn(),
    locationError: null,
  }),
}));
jest.mock("@/hooks/useDataSync", () => ({ useDataSync: jest.fn() }));
jest.mock("@/components/map/BugroutMap", () => ({ BugroutMap: () => null }));
jest.mock("@/components/map/ThreatOverlay", () => ({
  ThreatOverlay: () => null,
}));
jest.mock("@/components/map/ResourceMarkers", () => ({
  ResourceMarkers: () => null,
}));
jest.mock("@/components/map/ScenarioChips", () => ({
  ScenarioChips: () => null,
}));
jest.mock("@/components/map/ResourceFilterBar", () => ({
  ResourceFilterBar: () => null,
}));
jest.mock("@/services/tiles/TileVersions", () => ({
  isRegionStale: () => false,
}));
jest.mock("@/platform/haptics", () => ({ impact: jest.fn() }));

const ROUTE: Route = {
  id: "route-1",
  geometry: "",
  coordinates: [
    { lat: 39.2904, lng: -76.6122 },
    { lat: 39.3138, lng: -76.6021 },
  ],
  distance: 4000,
  duration: 360,
  legs: [],
  summary: "North Calvert Street",
};

const FAB_LABEL = "Bug Out — set evacuation destination";

beforeEach(() => {
  mockPush.mockReset();
  mockReplace.mockReset();
  mockBack.mockReset();
  mockStop.mockClear();
  useRouteStore.getState().clearRoute();
});

describe("route preview", () => {
  it("drops the route when it closes without Go", async () => {
    useRouteStore.getState().setRoute(ROUTE);
    const screen = await render(<RoutePreviewScreen />);

    // However it closes — Back, a swipe, Android back — the screen unmounts.
    await act(async () => {
      screen.unmount();
      await Promise.resolve();
    });

    expect(useRouteStore.getState().activeRoute).toBeNull();
    expect(useRouteStore.getState().status).toBe("idle");
  });

  it("starts the trip on Go, and closing the preview then keeps it", async () => {
    useRouteStore.getState().setRoute(ROUTE);
    const screen = await render(<RoutePreviewScreen />);

    await fireEvent.press(screen.getByTestId("route-preview-go-btn"));
    expect(useRouteStore.getState().status).toBe("active");
    expect(mockReplace).toHaveBeenCalledWith("/navigation/route-1");

    await act(async () => {
      screen.unmount();
      await Promise.resolve();
    });
    expect(useRouteStore.getState().activeRoute?.id).toBe("route-1");
    expect(useRouteStore.getState().status).toBe("active");
  });
});

describe("map screen", () => {
  it("offers Bug Out, not a trip banner, for a route that was only previewed", async () => {
    useRouteStore.getState().setRoute(ROUTE);
    const screen = await render(<MapScreen />);

    expect(screen.getByLabelText(FAB_LABEL)).toBeTruthy();
    expect(screen.queryByTestId("trip-in-progress")).toBeNull();
  });

  it("offers Resume and End trip while a trip is running", async () => {
    useRouteStore.getState().setRoute(ROUTE);
    useRouteStore.getState().startNavigation();
    const screen = await render(<MapScreen />);

    expect(screen.getByTestId("trip-in-progress")).toBeTruthy();
    expect(screen.queryByLabelText(FAB_LABEL)).toBeNull();

    await fireEvent.press(screen.getByLabelText("Resume navigation"));
    expect(mockPush).toHaveBeenCalledWith("/navigation/route-1");
  });

  it("ends the trip and brings Bug Out back", async () => {
    useRouteStore.getState().setRoute(ROUTE);
    useRouteStore.getState().startNavigation();
    const screen = await render(<MapScreen />);

    await fireEvent.press(screen.getByLabelText("End trip"));

    expect(mockStop).toHaveBeenCalled();
    expect(useRouteStore.getState().activeRoute).toBeNull();
    expect(screen.getByLabelText(FAB_LABEL)).toBeTruthy();
    expect(screen.queryByTestId("trip-in-progress")).toBeNull();
  });
});
