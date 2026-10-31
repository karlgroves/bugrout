/**
 * The nearby-states offer, and the four things #268 says it must get right.
 *
 * Each test here maps to one of that issue's acceptance criteria, because every
 * one of them is a claim about what the user is told rather than about what the
 * code computes:
 *
 *   - the neighbours are offered, with sizes;
 *   - declining leaves current behaviour untouched — so nothing downloads
 *     unless a button is pressed, and there is nothing to dismiss;
 *   - the size shown is the size downloaded;
 *   - the map extending past the border must not imply a route exists there.
 */
import { render, fireEvent } from "@testing-library/react-native";

import { NearbyStates } from "@/components/downloads/NearbyStates";

import type { NeighborOffers } from "@/services/tiles/Neighbors";
import type { Region } from "@bugrout/shared";

const BBOX = { west: -1, south: -1, east: 1, north: 1 };

/**
 * A published region.
 *
 * @param id - Region id.
 * @param name - Display name.
 * @param pmtilesSize - Map tile size in bytes.
 * @returns The region.
 */
function region(id: string, name: string, pmtilesSize: number): Region {
  return {
    id,
    name,
    bbox: BBOX,
    pmtilesSize,
    valhallaSize: 0,
    version: "2026.10.28",
    updatedAt: 0,
  };
}

const VIRGINIA = region("va", "Virginia", 157_286_400); // 150 MB exactly

const OFFERS: NeighborOffers = {
  offers: [{ region: VIRGINIA, sizeBytes: 157_286_400 }],
  unpublished: [{ id: "wv", name: "West Virginia" }],
};

describe("NearbyStates", () => {
  it("offers each published neighbour with its size", async () => {
    const screen = await render(
      <NearbyStates
        regionName="Maryland"
        offers={OFFERS}
        onDownload={jest.fn()}
        busy={false}
      />,
    );

    expect(screen.getByText("Nearby states")).toBeTruthy();
    expect(screen.getByText("Virginia")).toBeTruthy();
    // The size is on the row and in the button's accessible name, so it is
    // "shown up front" to a screen reader too, not only to the eye.
    expect(screen.getByLabelText("Download Virginia, 150.0 MB")).toBeTruthy();
  });

  it("names an unpublished neighbour but offers no download for it", async () => {
    const screen = await render(
      <NearbyStates
        regionName="Maryland"
        offers={OFFERS}
        onDownload={jest.fn()}
        busy={false}
      />,
    );

    expect(screen.getByText("West Virginia")).toBeTruthy();
    expect(screen.getByText("Not published yet")).toBeTruthy();
    expect(screen.queryByLabelText(/Download West Virginia/)).toBeNull();
  });

  it("downloads nothing until a button is pressed", async () => {
    const onDownload = jest.fn();
    const screen = await render(
      <NearbyStates
        regionName="Maryland"
        offers={OFFERS}
        onDownload={onDownload}
        busy={false}
      />,
    );

    // Declining is doing nothing: rendering the offer must not start anything,
    // and there is no dismissal to perform.
    expect(onDownload).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText("Download Virginia, 150.0 MB"));

    expect(onDownload).toHaveBeenCalledWith(VIRGINIA);
  });

  it("says the map does not bring routing with it", async () => {
    const screen = await render(
      <NearbyStates
        regionName="Maryland"
        offers={OFFERS}
        onDownload={jest.fn()}
        busy={false}
      />,
    );

    // The routing graph is Maryland-only until #267 (ADR 0008's R1). Silence
    // here would let the wider map imply a route that does not exist.
    expect(
      screen.getByText(
        /add the map only\. Routing outside Maryland still needs a connection/i,
      ),
    ).toBeTruthy();
  });

  it("disables the buttons while a download is already running", async () => {
    const onDownload = jest.fn();
    const screen = await render(
      <NearbyStates
        regionName="Maryland"
        offers={OFFERS}
        onDownload={onDownload}
        busy
      />,
    );

    const button = screen.getByLabelText("Download Virginia, 150.0 MB");
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(button);
    expect(onDownload).not.toHaveBeenCalled();
  });

  it("renders nothing when there is no neighbour left to mention", async () => {
    const screen = await render(
      <NearbyStates
        regionName="Maryland"
        offers={{ offers: [], unpublished: [] }}
        onDownload={jest.fn()}
        busy={false}
      />,
    );

    expect(screen.queryByText("Nearby states")).toBeNull();
  });
});
