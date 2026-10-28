/**
 * Nearby states on the Downloads screen (#268, ADR 0008's M2).
 *
 * The component itself is covered in `components/NearbyStates.test.tsx`; this
 * is about where it sits on the screen, which is where the two decisions that
 * could go wrong live:
 *
 *   - **Every region the user does not have appears exactly once.** Delaware
 *     borders Maryland and is also published, so without the filter it would
 *     show up twice — once as a neighbour, once under "Available" — giving one
 *     download two buttons on one screen.
 *   - **#173's empty state must stay honest.** It exists because downloading
 *     the only published region emptied the Available section and took its
 *     heading with it, so the screen looked broken. "You've downloaded every
 *     map currently available" must not appear while regions are sitting in
 *     Nearby states waiting to be downloaded.
 */

import { render } from "@testing-library/react-native";

import DownloadsScreen from "@/app/downloads/index";

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
/** Borders Maryland. */
const delaware: Region = { ...maryland, id: "de", name: "Delaware" };
/** Does not border Maryland. */
const california: Region = { ...maryland, id: "ca", name: "California" };

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

describe("Downloads — nearby states", () => {
  it("offers a published neighbour of a downloaded region, with its size", async () => {
    mockState = {
      available: [maryland, delaware],
      downloaded: [downloadedMaryland],
    };
    const screen = await render(<DownloadsScreen />);

    expect(screen.getByText("Nearby states")).toBeTruthy();
    expect(screen.getByLabelText("Download Delaware, 138.5 MB")).toBeTruthy();
  });

  it("shows that neighbour once, not also under Available", async () => {
    mockState = {
      available: [maryland, delaware],
      downloaded: [downloadedMaryland],
    };
    const screen = await render(<DownloadsScreen />);

    expect(screen.getAllByText("Delaware")).toHaveLength(1);
  });

  it("omits the Available section when everything left is offered nearby", async () => {
    mockState = {
      available: [maryland, delaware],
      downloaded: [downloadedMaryland],
    };
    const screen = await render(<DownloadsScreen />);

    // Neither an empty section with a heading, nor a message claiming every
    // map is downloaded while Delaware is still on screen to download.
    expect(screen.queryByText("Available")).toBeNull();
    expect(screen.queryByTestId("downloads-all-downloaded")).toBeNull();
  });

  it("keeps a non-neighbour under Available", async () => {
    mockState = {
      available: [maryland, california],
      downloaded: [downloadedMaryland],
    };
    const screen = await render(<DownloadsScreen />);

    expect(screen.getByText("Available")).toBeTruthy();
    expect(screen.getAllByText("California")).toHaveLength(1);
    // California does not border Maryland, so it is not offered as a neighbour.
    expect(screen.queryByLabelText(/Download California,/)).toBeNull();
  });

  it("names an unpublished neighbour without offering a download", async () => {
    mockState = { available: [maryland], downloaded: [downloadedMaryland] };
    const screen = await render(<DownloadsScreen />);

    // Maryland's five land neighbours, none published today.
    expect(screen.getByText("Virginia")).toBeTruthy();
    expect(screen.getByText("District of Columbia")).toBeTruthy();
    expect(screen.queryByLabelText(/Download Virginia,/)).toBeNull();
    // And #173's message is correct here: nothing is left to download.
    expect(screen.getByTestId("downloads-all-downloaded")).toBeTruthy();
  });

  it("says the wider map does not bring routing with it", async () => {
    mockState = {
      available: [maryland, delaware],
      downloaded: [downloadedMaryland],
    };
    const screen = await render(<DownloadsScreen />);

    expect(
      screen.getByText(
        /add the map only\. Routing outside Maryland still needs a connection/i,
      ),
    ).toBeTruthy();
  });
});
