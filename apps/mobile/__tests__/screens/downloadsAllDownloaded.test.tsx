/**
 * The Downloads screen says so when every published map is downloaded (#173).
 *
 * With only Maryland in the manifest, downloading it emptied the Available
 * section and its heading vanished with it, so it looked as if downloading
 * more maps had broken.
 */

import { render } from "@testing-library/react-native";

import DownloadsScreen from "@/app/downloads/index";
import { DEFAULT_REGIONS } from "@/constants/regions";

import type { DownloadedRegion, Region } from "@bugrout/shared";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock("@/services/tiles/TileManager", () => ({ isExpoGo: () => false }));
jest.mock("@/services/tiles/TileVersions", () => ({
  isRegionStale: () => false,
}));

const maryland: Region = {
  id: "md",
  name: "Maryland",
  bbox: { west: -79.5, south: 37.9, east: -75.0, north: 39.7 },
  pmtilesSize: 145_188_267,
  valhallaSize: 0,
  version: "2026.09.28",
  updatedAt: 0,
};
const delaware: Region = { ...maryland, id: "de", name: "Delaware" };
const downloadedMaryland = {
  ...maryland,
  downloadedAt: 0,
  pmtilesPath: "file:///docs/tiles/md/md.pmtiles",
  valhallaTilesPath: null,
} as unknown as DownloadedRegion;

let mockState: { available: Region[]; downloaded: DownloadedRegion[] };

jest.mock("@/hooks/useTileManager", () => ({
  useTileManager: () => ({
    downloadedRegions: mockState.downloaded,
    availableRegions: mockState.available,
    activeDownload: null,
    storageUsed: 0,
    storageAvailable: 1e10,
    downloadRegion: jest.fn(),
    deleteRegion: jest.fn(),
  }),
}));

describe("Downloads — every available map downloaded", () => {
  it("keeps the Available heading and explains why it's empty", async () => {
    mockState = { available: [maryland], downloaded: [downloadedMaryland] };
    const screen = await render(<DownloadsScreen />);

    const heading = screen.getByText("Available");
    expect(heading.props.accessibilityRole).toBe("header");
    const message = screen.getByTestId("downloads-all-downloaded");
    expect(message).toHaveTextContent(
      /You've downloaded every map currently available\./,
    );
    // Names the reason: the published list is shorter than the full one.
    expect(message).toHaveTextContent(
      `published for 1 of ${DEFAULT_REGIONS.length} regions`,
      { exact: false },
    );
  });

  it("doesn't show the message while maps remain to download", async () => {
    mockState = {
      available: [maryland, delaware],
      downloaded: [downloadedMaryland],
    };
    const screen = await render(<DownloadsScreen />);

    expect(screen.getByText("Delaware")).toBeTruthy();
    expect(screen.queryByTestId("downloads-all-downloaded")).toBeNull();
  });

  it("says nothing before the region list has loaded", async () => {
    mockState = { available: [], downloaded: [] };
    const screen = await render(<DownloadsScreen />);

    expect(screen.queryByText("Available")).toBeNull();
    expect(screen.queryByTestId("downloads-all-downloaded")).toBeNull();
  });
});
