/**
 * Saved Destinations in Settings (#187).
 *
 * Entered with the same address-or-pin field as a plan, so it must refuse the
 * same things: nothing without coordinates is saved, and an ambiguous address
 * is offered to the user rather than settled by taking the first match.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import SavedDestinationsScreen from "@/app/saved-destinations/index";
import { useScenarioStore } from "@/stores/useScenarioStore";

import type { SavedDestination } from "@/db/queries/savedDestinations";
import type * as AddressLookupModule from "@/services/geocoding/AddressLookup";
import type { GeocodeResult } from "@/services/geocoding/Geocoder";

const mockStored: SavedDestination[] = [];
const mockUpsert = jest.fn((d: SavedDestination) => {
  const i = mockStored.findIndex((s) => s.id === d.id);
  if (i >= 0) mockStored.splice(i, 1, d);
  else mockStored.push(d);
  return Promise.resolve();
});
jest.mock("@/db/queries/savedDestinations", () => ({
  MAX_SAVED_DESTINATIONS: 10,
  getSavedDestinations: () => Promise.resolve([...mockStored]),
  upsertSavedDestination: (d: SavedDestination) => mockUpsert(d),
  deleteSavedDestination: (id: string) => {
    mockStored.splice(
      mockStored.findIndex((s) => s.id === id),
      1,
    );
    return Promise.resolve();
  },
}));

const mockConfirmCoverage = jest.fn(() => Promise.resolve(true));
jest.mock("@/services/routing/coverage", () => ({
  confirmCoverage: () => mockConfirmCoverage(),
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
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

jest.mock("@/services/geocoding/Geocoder", () => ({
  reverseGeocode: () => Promise.resolve(null),
}));

/** Build a geocoder result. */
function match(displayName: string, lat: number, lng: number): GeocodeResult {
  return { displayName, shortName: displayName, lat, lng };
}

const MOMS: SavedDestination = {
  id: "moms",
  name: "Mom's house",
  point: { lat: 39.3138, lng: -76.6021 },
  address: "120 Main St, Towson, Maryland",
  createdAt: 1,
  updatedAt: 1,
};

/** Open the add form and fill in a name and an address. */
async function fillNew(name: string, address: string) {
  const screen = await render(<SavedDestinationsScreen />);
  await fireEvent.press(await screen.findByTestId("add-saved-destination-btn"));
  await fireEvent.changeText(
    screen.getByTestId("saved-destination-name-input"),
    name,
  );
  await fireEvent.changeText(screen.getByTestId("plan-address-input"), address);
  return screen;
}

beforeEach(() => {
  mockStored.length = 0;
  mockUpsert.mockClear();
  mockLookupAddress.mockReset();
  mockPush.mockClear();
  useScenarioStore.setState({ pickedDestination: null });
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Saved Destinations screen", () => {
  it("saves an address with the coordinates it resolves to", async () => {
    mockLookupAddress.mockResolvedValue({
      kind: "one",
      match: match("Towson, Maryland", 39.4, -76.6),
    });
    const screen = await fillNew("Rally point", "Towson");

    await fireEvent.press(screen.getByTestId("save-saved-destination-btn"));

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });
    expect(mockUpsert.mock.calls[0]?.[0]).toMatchObject({
      name: "Rally point",
      point: { lat: 39.4, lng: -76.6 },
      address: "Towson, Maryland",
    });
    expect(await screen.findByText("Rally point")).toBeTruthy();
  });

  it("saves nothing when offline, and keeps what was typed", async () => {
    mockLookupAddress.mockResolvedValue({ kind: "offline" });
    const screen = await fillNew("Shelter", "1 School Rd");

    await fireEvent.press(screen.getByTestId("save-saved-destination-btn"));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
    });
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(screen.getByTestId("plan-address-input").props.value).toBe(
      "1 School Rd",
    );
  });

  it("offers every match for an ambiguous address and saves the one chosen", async () => {
    mockLookupAddress.mockResolvedValue({
      kind: "many",
      matches: [
        match("Springfield, Illinois", 39.78, -89.65),
        match("Springfield, Massachusetts", 42.1, -72.59),
      ],
    });
    const screen = await fillNew("Cousin", "Springfield");

    await fireEvent.press(screen.getByTestId("save-saved-destination-btn"));
    await fireEvent.press(
      await screen.findByLabelText("Use Springfield, Massachusetts"),
    );
    expect(mockUpsert).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("save-saved-destination-btn"));

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });
    expect(mockUpsert.mock.calls[0]?.[0].point).toEqual({
      lat: 42.1,
      lng: -72.59,
    });
  });

  it("opens the map to drop a pin instead", async () => {
    const screen = await fillNew("Trailhead", "");

    await fireEvent.press(screen.getByTestId("plan-pick-on-map-btn"));

    expect(mockPush).toHaveBeenCalledWith("/scenarios/pick-location");
  });

  it("saves a dropped pin with no address lookup", async () => {
    const screen = await fillNew("Trailhead", "");

    useScenarioStore.setState({ pickedDestination: { lat: 39.5, lng: -77.1 } });
    await waitFor(() => {
      expect(useScenarioStore.getState().pickedDestination).toBeNull();
    });
    await fireEvent.press(screen.getByTestId("save-saved-destination-btn"));

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });
    expect(mockLookupAddress).not.toHaveBeenCalled();
    expect(mockUpsert.mock.calls[0]?.[0]).toMatchObject({
      name: "Trailhead",
      point: { lat: 39.5, lng: -77.1 },
      address: null,
    });
  });

  it("adds one entry, not two, when Save is pressed twice", async () => {
    // Hold the coverage check open so the second press lands mid-save.
    let release: (ok: boolean) => void = () => undefined;
    mockConfirmCoverage.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
    );
    const screen = await fillNew("Shelter", "");
    useScenarioStore.setState({ pickedDestination: { lat: 39.5, lng: -77.1 } });
    await waitFor(() => {
      expect(useScenarioStore.getState().pickedDestination).toBeNull();
    });

    const save = screen.getByTestId("save-saved-destination-btn");
    await fireEvent.press(save);
    await fireEvent.press(save);
    release(true);

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledTimes(2);
    });
    expect(mockStored).toHaveLength(1);
  });

  it("renames an entry without looking its address up again", async () => {
    mockStored.push(MOMS);
    const screen = await render(<SavedDestinationsScreen />);

    await fireEvent.press(await screen.findByLabelText("Edit Mom's house"));
    await fireEvent.changeText(
      screen.getByTestId("saved-destination-name-input"),
      "Grandma's",
    );
    await fireEvent.press(screen.getByTestId("save-saved-destination-btn"));

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });
    expect(mockLookupAddress).not.toHaveBeenCalled();
    expect(mockUpsert.mock.calls[0]?.[0]).toMatchObject({
      id: "moms",
      name: "Grandma's",
      point: MOMS.point,
      createdAt: 1,
    });
  });

  it("stops offering Add at the cap", async () => {
    for (let i = 0; i < 10; i++) {
      mockStored.push({ ...MOMS, id: `d${i}`, name: `Place ${i}` });
    }
    const screen = await render(<SavedDestinationsScreen />);

    expect(await screen.findByText("Maximum 10 destinations")).toBeTruthy();
    expect(screen.queryByTestId("add-saved-destination-btn")).toBeNull();
  });
});
