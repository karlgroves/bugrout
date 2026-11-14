/**
 * The route preview says when threat areas could not be avoided (#337).
 *
 * The count itself is covered by UnavoidedThreats.test.ts. These tests assert
 * the driver is TOLD, on the screen where they commit to the road, and told
 * out loud: accessibilityLiveRegion is Android-only and iOS VoiceOver does not
 * announce a view just because it appeared.
 */

import { render } from "@testing-library/react-native";
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
 * Spy on the screen-reader announcement. React Native's jest preset already
 * mocks it, so the calls accumulate across tests unless cleared.
 */
function spyOnAnnounce(): jest.SpyInstance<void, [string]> {
  const spy = jest
    .spyOn(AccessibilityInfo, "announceForAccessibility")
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

    await render(<RoutePreviewScreen />);
    expect(announce).toHaveBeenCalledWith(
      expect.stringContaining(
        "2 threat areas on this trip could not be avoided",
      ),
    );
    expect(announce).toHaveBeenCalledTimes(1);
    announce.mockRestore();
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
