/**
 * County groups on the Downloads screen are information, not controls (#175).
 *
 * Each county group used to carry a Pressable with role "button" and the label
 * "Download {group} county group", but no onPress: screen-reader users were
 * told it downloaded something, and nothing happened (WCAG 2.2 SC 4.1.2). No
 * county package is published (#147), so the honest state is no button.
 */

import { fireEvent, render, within } from "@testing-library/react-native";

import DownloadsScreen from "@/app/downloads/index";
import { touchTarget } from "@/constants/theme";

import type { Region } from "@bugrout/shared";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock("@/services/tiles/TileManager", () => ({ isExpoGo: () => false }));

const california: Region = {
  id: "ca",
  name: "California",
  bbox: { west: -124.4, south: 32.5, east: -114.1, north: 42.0 },
  pmtilesSize: 900_000_000,
  valhallaSize: 0,
  version: "2026.09.28",
  updatedAt: 0,
};

jest.mock("@/hooks/useTileManager", () => ({
  useTileManager: () => ({
    downloadedRegions: [],
    availableRegions: [california],
    activeDownload: null,
    storageUsed: 0,
    storageAvailable: 1e10,
    downloadRegion: jest.fn(),
    deleteRegion: jest.fn(),
  }),
}));

describe("Downloads — county groups", () => {
  it("exposes the expand control as a button with its expanded state", async () => {
    const screen = await render(<DownloadsScreen />);
    const toggle = screen.getByLabelText("California county groups");

    expect(toggle.props.accessibilityRole).toBe("button");
    expect(toggle.props.accessibilityState).toEqual({ expanded: false });

    // A real button, so the app's 44pt minimum applies.
    expect(toggle).toHaveStyle({
      width: touchTarget.minWidth,
      height: touchTarget.minHeight,
    });

    await fireEvent.press(toggle);
    expect(
      screen.getByLabelText("California county groups").props
        .accessibilityState,
    ).toEqual({ expanded: true });
  });

  it("lists county groups as text, with no download control", async () => {
    const screen = await render(<DownloadsScreen />);
    await fireEvent.press(screen.getByLabelText("California county groups"));

    const groups = screen.getByTestId("county-groups-ca");
    expect(
      within(groups).getByText(/County downloads aren't available yet/),
    ).toBeTruthy();
    // The groups are still shown, so the size information isn't lost...
    expect(within(groups).getAllByText(/counties$/).length).toBeGreaterThan(0);
    // ...but nothing in them is announced as a control.
    expect(within(groups).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByLabelText(/county group$/)).toHaveLength(0);
  });

  it("keeps the working full-state download button", async () => {
    const screen = await render(<DownloadsScreen />);
    const full = screen.getByLabelText("Download California full state");

    expect(full.props.accessibilityRole).toBe("button");
  });
});
