/**
 * The Map tab always has a way to Offline Maps (#174).
 *
 * Its only links were the first-run banner (gone once tiles load) and the
 * stale banner (only after a region ages out). Between the first download and
 * the region going stale, the Map tab had no way to get more maps.
 */

import { fireEvent, render } from "@testing-library/react-native";

import MapScreen from "@/app/(tabs)/index";
import { touchTarget } from "@/constants/theme";
import { useMapStore } from "@/stores/useMapStore";
import { useRouteStore } from "@/stores/useRouteStore";

import type { Route } from "@bugrout/shared";

jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>(
    "react-native-reanimated/mock",
  ),
  __esModule: true,
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/services/navigation/NavigationController", () => ({
  stop: jest.fn(),
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
jest.mock("@/components/common/DownloadGuide", () => ({
  DownloadGuide: () => null,
}));
jest.mock("@/platform/haptics", () => ({ impact: jest.fn() }));

const mockStale = jest.fn(() => false);
jest.mock("@/services/tiles/TileVersions", () => ({
  isRegionStale: () => mockStale(),
}));

const MARYLAND = {
  id: "md",
  name: "Maryland",
  bbox: { west: -79.5, south: 37.9, east: -75.0, north: 39.7 },
  pmtilesSize: 1,
  valhallaSize: 0,
  version: "2026.09.28",
  updatedAt: 0,
  downloadedAt: 0,
  pmtilesPath: "file:///docs/tiles/md/md.pmtiles",
  valhallaTilesPath: null,
};

const ROUTE: Route = {
  id: "route-1",
  summary: "North Calvert Street",
  geometry: "",
  coordinates: [],
  distance: 4000,
  duration: 360,
  legs: [],
};

beforeEach(() => {
  mockPush.mockReset();
  mockStale.mockReturnValue(false);
  useRouteStore.getState().clearRoute();
  useMapStore.getState().setTilesLoaded(true);
  useMapStore.getState().setActiveRegion(MARYLAND as never);
});

describe("Map tab — Offline maps entry point", () => {
  it("leads to Downloads once a region is downloaded", async () => {
    const screen = await render(<MapScreen />);
    const button = screen.getByLabelText("Offline maps");

    expect(button.props.accessibilityRole).toBe("button");
    expect(screen.getByText("Offline maps")).toBeTruthy();
    await fireEvent.press(button);
    expect(mockPush).toHaveBeenCalledWith("/downloads");
  });

  it("is at least 44pt", async () => {
    const screen = await render(<MapScreen />);
    expect(screen.getByLabelText("Offline maps")).toHaveStyle({
      minHeight: touchTarget.minHeight,
      minWidth: touchTarget.minWidth,
    });
  });

  it("stays out of the way during a trip", async () => {
    useRouteStore.getState().setRoute(ROUTE);
    useRouteStore.getState().startNavigation();
    const screen = await render(<MapScreen />);

    expect(screen.queryByLabelText("Offline maps")).toBeNull();
  });

  it("gives way to the stale banner, which already leads to Downloads", async () => {
    mockStale.mockReturnValue(true);
    const screen = await render(<MapScreen />);

    expect(screen.queryByLabelText("Offline maps")).toBeNull();
    expect(screen.getByTestId("stale-tile-banner")).toBeTruthy();
  });

  it("gives way to the first-run banner before any download", async () => {
    useMapStore.getState().setTilesLoaded(false);
    const screen = await render(<MapScreen />);

    expect(screen.queryByLabelText("Offline maps")).toBeNull();
    expect(screen.getByTestId("tile-download-banner")).toBeTruthy();
  });
});
