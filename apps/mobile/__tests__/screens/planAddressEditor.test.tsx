/**
 * The plan editor's destination is an address, not two coordinate fields (#187).
 *
 * What is worth pinning here is not the happy path but the refusals. A plan
 * with no coordinates cannot route, so nothing may be saved when the lookup
 * fails — and an ambiguous address must reach the user rather than be settled
 * by taking the first result, which is the quiet way to send someone to the
 * wrong Springfield.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import ScenarioEditScreen from "@/app/scenarios/edit";
import { useScenarioStore } from "@/stores/useScenarioStore";

import type * as AddressLookupModule from "@/services/geocoding/AddressLookup";
import type { GeocodeResult } from "@/services/geocoding/Geocoder";

const mockUpsertScenario = jest.fn().mockResolvedValue(undefined);
jest.mock("@/db/queries/scenarios", () => ({
  upsertScenario: (...args: unknown[]) =>
    mockUpsertScenario(...args) as unknown,
  deleteScenario: jest.fn(),
}));

// Coverage warnings are #190's concern and have their own suite; let every
// destination through so these cases are about the lookup alone.
jest.mock("@/services/routing/coverage", () => ({
  confirmCoverage: () => Promise.resolve(true),
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  useLocalSearchParams: () => ({}),
}));

const mockLookupAddress = jest.fn();
jest.mock("@/services/geocoding/AddressLookup", () => {
  const actual = jest.requireActual<typeof AddressLookupModule>(
    "@/services/geocoding/AddressLookup",
  );
  return {
    ...actual,
    lookupAddress: (address: string) => mockLookupAddress(address) as unknown,
  };
});

const mockReverseGeocode = jest.fn();
jest.mock("@/services/geocoding/Geocoder", () => ({
  reverseGeocode: (...args: unknown[]) =>
    mockReverseGeocode(...args) as unknown,
}));

/**
 * Build a geocoder result.
 */
function match(displayName: string, lat: number, lng: number): GeocodeResult {
  return { displayName, shortName: displayName.split(",")[0] ?? "", lat, lng };
}

const SPRINGFIELD_IL = match("Springfield, Illinois, USA", 39.78, -89.65);
const SPRINGFIELD_MA = match("Springfield, Massachusetts, USA", 42.1, -72.59);

/** The scenario handed to the database by the last save. */
function savedPlan(): {
  destination: { lat: number; lng: number };
  address: string | null;
} {
  const call = mockUpsertScenario.mock.calls.at(-1) as unknown[];
  return call[0] as ReturnType<typeof savedPlan>;
}

beforeEach(() => {
  mockUpsertScenario.mockClear();
  mockLookupAddress.mockReset();
  mockReverseGeocode.mockReset().mockResolvedValue(null);
  mockPush.mockClear();
  useScenarioStore.setState({ scenarios: [], pickedDestination: null });
});

describe("the plan editor's destination field", () => {
  it("asks for an address and offers no coordinate fields", async () => {
    const screen = await render(<ScenarioEditScreen />);

    expect(screen.getByLabelText("Destination address")).toBeTruthy();
    expect(screen.queryByLabelText("Destination latitude")).toBe(null);
    expect(screen.queryByLabelText("Destination longitude")).toBe(null);
  });

  it("saves the address alongside the coordinates it resolved to", async () => {
    mockLookupAddress.mockResolvedValue({ kind: "one", match: SPRINGFIELD_IL });

    const screen = await render(<ScenarioEditScreen />);
    await fireEvent.changeText(screen.getByLabelText("Plan name"), "Family");
    await fireEvent.changeText(
      screen.getByLabelText("Destination address"),
      "Springfield IL",
    );
    await fireEvent.press(screen.getByLabelText("Save Plan"));

    await waitFor(() => {
      expect(mockUpsertScenario).toHaveBeenCalled();
    });
    expect(savedPlan().destination).toEqual({ lat: 39.78, lng: -89.65 });
    expect(savedPlan().address).toBe("Springfield, Illinois, USA");
  });

  it("offers both Springfields rather than picking one", async () => {
    mockLookupAddress.mockResolvedValue({
      kind: "many",
      matches: [SPRINGFIELD_IL, SPRINGFIELD_MA],
    });

    const screen = await render(<ScenarioEditScreen />);
    await fireEvent.changeText(screen.getByLabelText("Plan name"), "Family");
    await fireEvent.changeText(
      screen.getByLabelText("Destination address"),
      "Springfield",
    );
    await fireEvent.press(screen.getByLabelText("Save Plan"));

    // Nothing saved, and each match offered by its full display name.
    await waitFor(() => {
      expect(
        screen.getByLabelText("Use Springfield, Illinois, USA"),
      ).toBeTruthy();
    });
    expect(
      screen.getByLabelText("Use Springfield, Massachusetts, USA"),
    ).toBeTruthy();
    expect(mockUpsertScenario).not.toHaveBeenCalled();

    // Choosing one, then saving, uses it and asks nothing further.
    mockLookupAddress.mockClear();
    await fireEvent.press(
      screen.getByLabelText("Use Springfield, Massachusetts, USA"),
    );
    await fireEvent.press(screen.getByLabelText("Save Plan"));

    await waitFor(() => {
      expect(mockUpsertScenario).toHaveBeenCalled();
    });
    expect(savedPlan().destination).toEqual({ lat: 42.1, lng: -72.59 });
    expect(mockLookupAddress).not.toHaveBeenCalled();
  });

  it("saves nothing when the address matches nothing", async () => {
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    mockLookupAddress.mockResolvedValue({ kind: "none" });

    const screen = await render(<ScenarioEditScreen />);
    await fireEvent.changeText(screen.getByLabelText("Plan name"), "Family");
    await fireEvent.changeText(
      screen.getByLabelText("Destination address"),
      "zzzz",
    );
    await fireEvent.press(screen.getByLabelText("Save Plan"));

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith(
        "Couldn't find that address",
        expect.stringContaining("dropping a pin"),
      );
    });
    expect(mockUpsertScenario).not.toHaveBeenCalled();
    // What was typed is left alone to be corrected.
    expect(screen.getByLabelText("Destination address").props.value).toBe(
      "zzzz",
    );
    alert.mockRestore();
  });

  it("saves nothing when offline, and says so without blaming the address", async () => {
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    mockLookupAddress.mockResolvedValue({ kind: "offline" });

    const screen = await render(<ScenarioEditScreen />);
    await fireEvent.changeText(screen.getByLabelText("Plan name"), "Family");
    await fireEvent.changeText(
      screen.getByLabelText("Destination address"),
      "120 Main St",
    );
    await fireEvent.press(screen.getByLabelText("Save Plan"));

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith(
        "You're offline",
        expect.stringContaining("needs no connection"),
      );
    });
    expect(mockUpsertScenario).not.toHaveBeenCalled();
  });

  it("refuses to save with no destination at all", async () => {
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);

    const screen = await render(<ScenarioEditScreen />);
    await fireEvent.changeText(screen.getByLabelText("Plan name"), "Family");
    await fireEvent.press(screen.getByLabelText("Save Plan"));

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith(
        "Destination Required",
        expect.stringContaining("drop a pin"),
      );
    });
    expect(mockLookupAddress).not.toHaveBeenCalled();
    expect(mockUpsertScenario).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it("offers the map as the way that needs no lookup", async () => {
    const screen = await render(<ScenarioEditScreen />);
    await fireEvent.press(screen.getByLabelText("Choose on map instead"));
    expect(mockPush).toHaveBeenCalledWith("/scenarios/pick-location");
  });
});

describe("a plan set by dropping a pin", () => {
  it("saves the point with no address and no lookup", async () => {
    const screen = await render(<ScenarioEditScreen />);
    await fireEvent.changeText(screen.getByLabelText("Plan name"), "Rally");

    // The pick screen hands the point back through the store.
    await waitFor(() => {
      useScenarioStore.setState({
        pickedDestination: { lat: 39.5, lng: -76.8 },
      });
    });

    await fireEvent.press(screen.getByLabelText("Save Plan"));

    await waitFor(() => {
      expect(mockUpsertScenario).toHaveBeenCalled();
    });
    expect(savedPlan().destination).toEqual({ lat: 39.5, lng: -76.8 });
    expect(savedPlan().address).toBe(null);
    expect(mockLookupAddress).not.toHaveBeenCalled();
  });

  it("fills in the address when the point has one", async () => {
    mockReverseGeocode.mockResolvedValue("Rally Field, Baltimore County, MD");

    const screen = await render(<ScenarioEditScreen />);
    await fireEvent.changeText(screen.getByLabelText("Plan name"), "Rally");
    await waitFor(() => {
      useScenarioStore.setState({
        pickedDestination: { lat: 39.5, lng: -76.8 },
      });
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Destination address").props.value).toBe(
        "Rally Field, Baltimore County, MD",
      );
    });

    await fireEvent.press(screen.getByLabelText("Save Plan"));
    await waitFor(() => {
      expect(mockUpsertScenario).toHaveBeenCalled();
    });
    expect(savedPlan().address).toBe("Rally Field, Baltimore County, MD");
    expect(mockLookupAddress).not.toHaveBeenCalled();
  });
});

describe("a plan saved before plans had addresses", () => {
  const LEGACY = {
    id: "legacy-1",
    name: "Old plan",
    destination: { lat: 39.3138, lng: -76.6021 },
    address: null,
    avoidZones: [],
    resourceStops: [],
    createdAt: 0,
    updatedAt: 0,
  };

  it("still saves, with no lookup, so it works offline", async () => {
    useScenarioStore.setState({ scenarios: [LEGACY] });
    jest
      .spyOn(
        jest.requireMock<{ useLocalSearchParams: () => unknown }>(
          "expo-router",
        ),
        "useLocalSearchParams",
      )
      .mockReturnValue({ id: "legacy-1" });

    const screen = await render(<ScenarioEditScreen />);
    // Renaming it must not require resolving a destination that is already
    // resolved — there may be no signal at all.
    await fireEvent.changeText(
      screen.getByLabelText("Plan name"),
      "Old plan, renamed",
    );
    await fireEvent.press(screen.getByLabelText("Update Plan"));

    await waitFor(() => {
      expect(mockUpsertScenario).toHaveBeenCalled();
    });
    expect(savedPlan().destination).toEqual({ lat: 39.3138, lng: -76.6021 });
    expect(savedPlan().address).toBe(null);
    expect(mockLookupAddress).not.toHaveBeenCalled();
  });
});
