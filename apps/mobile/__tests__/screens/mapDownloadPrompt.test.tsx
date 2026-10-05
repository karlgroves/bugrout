/**
 * Skipping the onboarding download leaves a persistent prompt on the map
 * until a region is downloaded (#199, spec §10).
 *
 * The first-launch guide can be dismissed; the banner can't. It goes away only
 * once tiles are loaded, which a completed download now sets straight away.
 */

import { fireEvent, render } from "@testing-library/react-native";

import MapScreen from "@/app/(tabs)/index";
import { useMapStore } from "@/stores/useMapStore";

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
jest.mock("@/services/tiles/TileVersions", () => ({
  isRegionStale: () => false,
}));
jest.mock("@/platform/haptics", () => ({ impact: jest.fn() }));

describe("map — offline map prompt", () => {
  it("prompts for a download, with no way to dismiss it, until tiles load", async () => {
    useMapStore.getState().setTilesLoaded(false);
    const screen = await render(<MapScreen />);

    const banner = screen.getByTestId("tile-download-banner");
    expect(banner.props.accessibilityRole).toBe("button");
    expect(screen.queryByLabelText(/dismiss/i)).toBeNull();

    await fireEvent.press(banner);
    expect(mockPush).toHaveBeenCalledWith("/downloads");
  });

  it("goes away once a region is downloaded", async () => {
    useMapStore.getState().setTilesLoaded(true);
    const screen = await render(<MapScreen />);

    expect(screen.queryByTestId("tile-download-banner")).toBeNull();
  });
});
