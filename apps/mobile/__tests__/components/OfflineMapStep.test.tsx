/**
 * Onboarding gets the offline map downloaded (#199).
 *
 * The step used to *mention* downloading in one line of text and then go to
 * the map, with no region choice, no download and no reminder.
 */

import { act, fireEvent, render } from "@testing-library/react-native";

import { OfflineMapStep } from "@/components/onboarding/OfflineMapStep";

import type { Region } from "@bugrout/shared";

const mockMaryland: Region = {
  id: "md",
  name: "Maryland",
  bbox: { west: -79.49, south: 37.89, east: -75.05, north: 39.72 },
  pmtilesSize: 145_188_267,
  valhallaSize: 0,
  version: "2026.09.28",
  updatedAt: 0,
};
const mockDelaware: Region = { ...mockMaryland, id: "de", name: "Delaware" };

const mockDownloadRegion = jest.fn<Promise<void>, [Region]>();
let mockActiveDownload: { percent: number } | null = null;
jest.mock("@/hooks/useTileManager", () => ({
  useTileManager: () => ({
    availableRegions: [mockMaryland, mockDelaware],
    downloadRegion: (r: Region) => mockDownloadRegion(r),
    activeDownload: mockActiveDownload,
  }),
}));

const mockGetCurrentPosition = jest.fn();
jest.mock("@/services/location/LocationTracker", () => ({
  getCurrentPosition: () => mockGetCurrentPosition() as unknown,
}));

let mockNetworkType = "WIFI";
jest.mock("@/platform/network", () => ({
  getNetworkStateAsync: () =>
    Promise.resolve({
      isConnected: true,
      isInternetReachable: true,
      type: mockNetworkType,
    }),
}));

const BALTIMORE = { lat: 39.2904, lng: -76.6122 };
const LOUISVILLE = { lat: 38.2542, lng: -85.7594 };

beforeEach(() => {
  mockDownloadRegion.mockReset().mockResolvedValue(undefined);
  mockGetCurrentPosition.mockReset().mockResolvedValue({ position: BALTIMORE });
  mockActiveDownload = null;
  mockNetworkType = "WIFI";
});

describe("OfflineMapStep", () => {
  it("suggests the user's own region, with its size, and downloads it in one tap", async () => {
    const onFinish = jest.fn();
    const screen = await render(
      <OfflineMapStep locationGranted onFinish={onFinish} />,
    );

    const button = await screen.findByLabelText("Download Maryland, 138.5 MB");
    expect(screen.queryByLabelText(/Download Delaware/)).toBeNull();

    await fireEvent.press(button);
    expect(mockDownloadRegion).toHaveBeenCalledWith(mockMaryland);
    expect(screen.getByTestId("onboarding-download-progress")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Get Started"));
    expect(onFinish).toHaveBeenCalledWith(true);
  });

  it("offers every published region when location wasn't allowed", async () => {
    const screen = await render(
      <OfflineMapStep locationGranted={false} onFinish={jest.fn()} />,
    );

    expect(screen.getByLabelText("Download Maryland, 138.5 MB")).toBeTruthy();
    expect(screen.getByLabelText("Download Delaware, 138.5 MB")).toBeTruthy();
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
  });

  it("says so when the user's area has no published map", async () => {
    mockGetCurrentPosition.mockResolvedValue({ position: LOUISVILLE });
    const screen = await render(
      <OfflineMapStep locationGranted onFinish={jest.fn()} />,
    );

    expect(
      await screen.findByText(/Maps for where you are aren't published yet/),
    ).toBeTruthy();
    expect(screen.getByLabelText("Download Maryland, 138.5 MB")).toBeTruthy();
  });

  it("warns before a download on mobile data", async () => {
    mockNetworkType = "CELLULAR";
    const screen = await render(
      <OfflineMapStep locationGranted onFinish={jest.fn()} />,
    );

    expect(await screen.findByTestId("onboarding-cellular-note")).toBeTruthy();
  });

  it("lets the user skip, reporting that nothing is downloading", async () => {
    const onFinish = jest.fn();
    const screen = await render(
      <OfflineMapStep locationGranted onFinish={onFinish} />,
    );

    await fireEvent.press(screen.getByLabelText("Get Started"));
    expect(onFinish).toHaveBeenCalledWith(false);
  });

  it("says when the download fails and offers it again", async () => {
    mockDownloadRegion.mockRejectedValue(new Error("network"));
    const screen = await render(
      <OfflineMapStep locationGranted onFinish={jest.fn()} />,
    );

    await act(async () => {
      fireEvent.press(
        await screen.findByLabelText("Download Maryland, 138.5 MB"),
      );
      await Promise.resolve();
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      /The download didn't finish/,
    );
    expect(screen.getByLabelText("Download Maryland, 138.5 MB")).toBeTruthy();
  });
});
