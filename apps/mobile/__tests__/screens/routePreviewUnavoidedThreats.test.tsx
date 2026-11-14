/**
 * The route preview says when threat areas could not be avoided (#337).
 *
 * The count itself is covered by UnavoidedThreats.test.ts. These tests assert
 * the driver is TOLD, on the screen where they commit to the road, and told
 * out loud: accessibilityLiveRegion is Android-only and iOS VoiceOver does not
 * announce a view just because it appeared.
 */

import { act, render } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import RoutePreviewScreen from "@/app/route-preview/index";
import { unavoidedThreatMessage } from "@/components/routing/UnavoidedThreatNotice";
import { useRouteStore } from "@/stores/useRouteStore";
import { useThreatStore } from "@/stores/useThreatStore";

import type { Route, UnavoidedThreats } from "@bugrout/shared";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock("@/components/map/BugroutMap", () => {
  const { View } = jest.requireActual<{
    View: React.ComponentType<{ testID?: string }>;
  }>("react-native");
  return { BugroutMap: () => <View testID="mock-map" /> };
});
jest.mock("@/components/map/ThreatOverlay", () => ({
  ThreatOverlay: () => null,
}));

function route(unavoided?: UnavoidedThreats): Route {
  return {
    id: "r",
    geometry: "",
    coordinates: [
      { lat: 39.0, lng: -76.05 },
      { lat: 39.0, lng: -75.9 },
    ],
    distance: 15_000,
    duration: 900,
    legs: [],
    summary: "MD 32",
    ...(unavoided === undefined ? {} : { unavoidedThreats: unavoided }),
  };
}

/**
 * Spy on the queued screen-reader announcement the notice makes. React
 * Native's jest preset already mocks it, so the calls accumulate across tests
 * unless cleared.
 */
function spyOnAnnounce(): jest.SpyInstance<
  void,
  [string, { queue?: boolean | undefined }]
> {
  const spy = jest
    .spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions")
    .mockImplementation(jest.fn());
  spy.mockClear();
  return spy;
}

beforeEach(() => {
  useRouteStore.getState().clearRoute();
  useThreatStore.setState({ threatZones: [], avoidanceEnabled: true });
});

describe("unavoidedThreatMessage", () => {
  it("says nothing when the route avoids everything it was asked to", () => {
    expect(unavoidedThreatMessage(undefined)).toBeNull();
    expect(unavoidedThreatMessage(0)).toBeNull();
  });

  it("gives the count, what it means and what to do", () => {
    expect(unavoidedThreatMessage(3)).toBe(
      "3 threat areas on this trip could not be avoided. This route was planned without going around them and may pass through them. Check the map and the threat warnings before you set off.",
    );
  });

  it("is singular for one area", () => {
    expect(unavoidedThreatMessage(1)).toMatch(
      /^1 threat area on this trip could not be avoided\. .* may pass through it\./,
    );
  });

  it("gives no number when avoidance could not be applied at all", () => {
    const message = unavoidedThreatMessage("all");
    expect(message).toMatch(/^Threat areas could not be avoided on this route/);
    expect(message).not.toMatch(/\d/);
  });
});

describe("the route preview", () => {
  it("tells the driver how many threat areas were not avoided", async () => {
    useRouteStore.getState().setRoute(route(2));

    const screen = await render(<RoutePreviewScreen />);
    const notice = screen.getByTestId("unavoided-threats");
    expect(notice).toHaveTextContent(
      /^2 threat areas on this trip could not be avoided/,
    );
    expect(notice.props.accessibilityRole).toBe("alert");
    expect(notice.props.accessibilityLiveRegion).toBe("polite");
  });

  it("says it out loud, once", async () => {
    const announce = spyOnAnnounce();
    useRouteStore.getState().setRoute(route(2));

    const screen = await render(<RoutePreviewScreen />);
    expect(announce).toHaveBeenCalledWith(
      expect.stringContaining(
        "2 threat areas on this trip could not be avoided",
      ),
      { queue: true },
    );
    expect(announce).toHaveBeenCalledTimes(1);

    // Once per message, not once per render: a second render of the same
    // route, and a store write that re-renders the screen, say nothing more.
    await screen.rerender(<RoutePreviewScreen />);
    await act(() => {
      useRouteStore.getState().setFuelRange(120_000);
    });
    expect(announce).toHaveBeenCalledTimes(1);
    announce.mockRestore();
  });

  it("does not talk over the dropped-stop notice", async () => {
    // Both notices can show for one route. A plain announcement on iOS
    // interrupts the one before it, so this one is queued behind it: the
    // dropped stop is announced plainly, and this is not.
    const plain = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(jest.fn());
    plain.mockClear();
    const queued = spyOnAnnounce();
    useRouteStore.getState().setRoute(route(2));
    useRouteStore.getState().setDroppedStops([
      {
        type: "fuel",
        reason: "routing-failed",
        name: "Shell",
        detourMeters: null,
      },
    ]);

    await render(<RoutePreviewScreen />);
    expect(plain).toHaveBeenCalledTimes(1);
    expect(plain).toHaveBeenCalledWith(
      expect.stringContaining("No fuel stop on this route"),
    );
    expect(plain).not.toHaveBeenCalledWith(
      expect.stringContaining("could not be avoided"),
    );
    expect(queued).toHaveBeenCalledTimes(1);
    expect(queued).toHaveBeenCalledWith(
      expect.stringContaining("could not be avoided"),
      { queue: true },
    );
    plain.mockRestore();
    queued.mockRestore();
  });

  it("tells the driver when avoidance could not be applied at all", async () => {
    useRouteStore.getState().setRoute(route("all"));

    const screen = await render(<RoutePreviewScreen />);
    expect(screen.getByTestId("unavoided-threats")).toHaveTextContent(
      /^Threat areas could not be avoided on this route/,
    );
  });

  it("says nothing, on screen or out loud, when everything was avoided", async () => {
    const announce = spyOnAnnounce();
    useRouteStore.getState().setRoute(route());

    const screen = await render(<RoutePreviewScreen />);
    expect(screen.queryByTestId("unavoided-threats")).toBeNull();
    expect(announce).not.toHaveBeenCalled();
    announce.mockRestore();
  });
});
