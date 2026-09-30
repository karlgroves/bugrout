/**
 * When routing fails, the destination picker says why — and shows no route
 * (#190).
 *
 * It used to show a generic "Routing Unavailable" alert, and before that the
 * engine never failed at all: it handed back a made-up straight-line route
 * that went on to the preview as if it were real. Now each failure reason
 * becomes an explanation on the picker itself, announced to screen readers,
 * with Offline Maps offered only when missing road data is the problem.
 */

import { fireEvent, render, waitFor } from "@testing-library/react-native";

import DestinationScreen from "@/app/destination/index";
import { RouteUnavailableError } from "@/services/routing/RouteUnavailable";

import type { RouteUnavailableReason } from "@/services/routing/RouteUnavailable";

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

// Stable across renders: the mount effect depends on it.
const mockGetPosition = jest
  .fn()
  .mockResolvedValue({ lat: 39.2904, lng: -76.6122 });
jest.mock("@/hooks/useLocation", () => ({
  useLocation: () => ({
    position: { lat: 39.2904, lng: -76.6122 },
    getPosition: mockGetPosition,
    locationError: null,
  }),
}));

const mockCalculateRoute = jest.fn();
jest.mock("@/hooks/useRoute", () => ({
  useRoute: () => ({
    calculateRoute: mockCalculateRoute,
    calculateRouteWithStops: jest.fn(),
  }),
}));

jest.mock("@/db/queries/preferences", () => ({
  getRecentDestinations: jest
    .fn()
    .mockResolvedValue([
      { id: "r1", label: "Louisville, Kentucky", lat: 38.254, lng: -85.759 },
    ]),
  addRecentDestination: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/stores/useScenarioStore", () => ({
  useScenarioStore: () => ({ scenarios: [] }),
}));

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve([]),
});

/** Pick the recent destination and press Route & Go. */
async function routeToLouisville(): Promise<ReturnType<typeof render>> {
  const screen = await render(<DestinationScreen />);
  await fireEvent.press(
    await screen.findByLabelText(
      "Use recent destination: Louisville, Kentucky",
    ),
  );
  await fireEvent.press(screen.getByTestId("route-and-go-button"));
  return screen;
}

describe("destination picker — no route", () => {
  beforeEach(() => {
    mockCalculateRoute.mockReset();
    mockReplace.mockReset();
    mockPush.mockReset();
  });

  it.each<[RouteUnavailableReason, string]>([
    ["out_of_coverage", "Outside your offline maps"],
    ["no_path", "No drivable route found"],
    ["offline", "Can't reach the routing service"],
    ["server_error", "Routing failed"],
  ])("explains a %s failure and opens no preview", async (reason, title) => {
    mockCalculateRoute.mockRejectedValue(
      new RouteUnavailableError(reason, "test"),
    );

    const screen = await routeToLouisville();

    const notice = await screen.findByTestId("route-unavailable");
    expect(notice.props.accessibilityRole).toBe("alert");
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.queryByText("Ready to route")).toBeNull();
    // No preview of a route that doesn't exist.
    expect(mockReplace).not.toHaveBeenCalledWith("/route-preview");
  });

  it("offers Offline Maps when the destination is outside the road data", async () => {
    mockCalculateRoute.mockRejectedValue(
      new RouteUnavailableError("out_of_coverage", "test"),
    );

    const screen = await routeToLouisville();

    await fireEvent.press(
      await screen.findByTestId("route-unavailable-downloads"),
    );
    expect(mockPush).toHaveBeenCalledWith("/downloads");
  });

  it("does not offer Offline Maps when downloading would not help", async () => {
    mockCalculateRoute.mockRejectedValue(
      new RouteUnavailableError("offline", "test"),
    );

    const screen = await routeToLouisville();

    await screen.findByTestId("route-unavailable");
    expect(screen.queryByTestId("route-unavailable-downloads")).toBeNull();
  });

  it("opens the preview when the route is real", async () => {
    mockCalculateRoute.mockResolvedValue({ id: "real" });

    const screen = await routeToLouisville();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/route-preview");
    });
    expect(screen.queryByTestId("route-unavailable")).toBeNull();
  });
});
