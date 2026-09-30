/**
 * A scenario chip that can't route says why (#190).
 *
 * Tapping a chip calculates a route straight from the map — the 2-tap path. On
 * failure it used to set the route status to "error" and show nothing, so a
 * scared user tapped a button and the app appeared to ignore them. Before
 * that, the engine never failed at all: it returned a made-up route.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import { ScenarioChips } from "@/components/map/ScenarioChips";
import { RouteUnavailableError } from "@/services/routing/RouteUnavailable";
import { useRouteStore } from "@/stores/useRouteStore";
import { useScenarioStore } from "@/stores/useScenarioStore";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/services/location/LocationTracker", () => ({
  getCurrentPosition: jest
    .fn()
    .mockResolvedValue({ position: { lat: 39.2904, lng: -76.6122 } }),
}));

const mockCalculateSmartRoute = jest.fn();
jest.mock("@/services/routing/RouteEngine", () => ({
  calculateSmartRoute: (...args: unknown[]) =>
    mockCalculateSmartRoute(...args) as unknown,
}));

describe("ScenarioChips — routing fails", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockCalculateSmartRoute.mockReset();
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    useRouteStore.getState().clearRoute();
    useScenarioStore.setState({
      scenarios: [
        {
          id: "s1",
          name: "Louisville",
          destination: { lat: 38.254, lng: -85.759 },
          resourceStops: [],
          avoidZones: [],
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("explains an out-of-coverage destination and offers Offline Maps", async () => {
    mockCalculateSmartRoute.mockRejectedValue(
      new RouteUnavailableError("out_of_coverage", "test"),
    );
    const screen = await render(<ScenarioChips />);

    await fireEvent.press(screen.getByLabelText("Quick activate: Louisville"));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
    });
    const [title, , buttons] = jest.mocked(Alert.alert).mock.calls[0] ?? [];
    expect(title).toBe("Outside your offline maps");
    const downloads = buttons?.find((b) => b.text === "Offline Maps");
    downloads?.onPress?.();
    expect(mockPush).toHaveBeenCalledWith("/downloads");
    // No preview of a route that doesn't exist.
    expect(mockPush).not.toHaveBeenCalledWith("/route-preview");
    expect(useRouteStore.getState().activeRoute).toBeNull();
  });

  it("explains a failure that downloading would not fix, without offering it", async () => {
    mockCalculateSmartRoute.mockRejectedValue(
      new RouteUnavailableError("offline", "test"),
    );
    const screen = await render(<ScenarioChips />);

    await fireEvent.press(screen.getByLabelText("Quick activate: Louisville"));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
    });
    const [title, , buttons] = jest.mocked(Alert.alert).mock.calls[0] ?? [];
    expect(title).toBe("Can't reach the routing service");
    expect(buttons?.some((b) => b.text === "Offline Maps")).toBe(false);
  });
});
