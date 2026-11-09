/**
 * Destination search is submitted, never auto-completed (#208).
 *
 * Nominatim's usage policy lists "Auto-complete search" among uses that are
 * "strictly forbidden and will get you banned", and spells out that you "must
 * not implement such a service on the client side using the API". The picker
 * used to do exactly that: every keystroke restarted a 400 ms timer that then
 * called the geocoder, so one typed address sent several requests. A correct
 * User-Agent and a one-per-second limiter did not make that acceptable — they
 * satisfy different clauses of the same policy.
 *
 * Being banned is a safety problem, not a cosmetic one: it would take
 * destination search out for every install at once, and search is the second
 * tap of the evacuation flow. So the contract is pinned here: typing sends
 * nothing.
 *
 * Note for anyone extending this file: every `fireEvent` is wrapped in an
 * async `act`. Firing one bare leaves React 19's act scope overlapping, and the
 * *next* test's render then commits nothing — which surfaces as "Unable to find
 * an element" in a test that is actually fine. See `type` and `submit` below.
 */

import { render, waitFor, fireEvent, act } from "@testing-library/react-native";

import DestinationScreen from "@/app/destination/index";

import type { RenderResult } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

// A stable reference: the mount effect depends on it (see destination.a11y).
const mockGetPosition = jest
  .fn()
  .mockResolvedValue({ lat: 39.29, lng: -76.61 });

jest.mock("@/hooks/useLocation", () => ({
  useLocation: () => ({
    position: { lat: 39.29, lng: -76.61 },
    getPosition: mockGetPosition,
    locationError: null,
  }),
}));

jest.mock("@/hooks/useRoute", () => ({
  useRoute: () => ({
    calculateRoute: jest.fn(),
    calculateRouteWithStops: jest.fn(),
  }),
}));

jest.mock("@/db/queries/preferences", () => ({
  getRecentDestinations: jest.fn().mockResolvedValue([]),
  addRecentDestination: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/db/queries/savedDestinations", () => ({
  MAX_SAVED_DESTINATIONS: 10,
  getSavedDestinations: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/stores/useScenarioStore", () => ({
  useScenarioStore: () => ({ scenarios: [] }),
}));

const mockSearchDestinations = jest.fn();

jest.mock("@/services/geocoding/Geocoder", () => {
  class SearchSupersededError extends Error {}
  return {
    SearchSupersededError,
    searchDestinations: (q: string) => mockSearchDestinations(q) as unknown,
    reverseGeocode: () => Promise.resolve(null),
  };
});

const MATCH = {
  displayName: "120 Main St, Towson, Maryland, USA",
  shortName: "120 Main St, Towson, MD",
  lat: 39.3138,
  lng: -76.6021,
};

beforeEach(() => {
  mockSearchDestinations.mockReset();
  mockSearchDestinations.mockResolvedValue([MATCH]);
});

/**
 * Comfortably longer than the 400 ms debounce the picker used to search on, so
 * a reintroduced timer has time to fire and be caught.
 */
const DEBOUNCE_GRACE_MS = 700;

/** Let real time pass, with any render it causes settled. */
async function settleFor(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** An element from a render's queries. RNTL does not export the type. */
type Element = ReturnType<RenderResult["getByTestId"]>;

/** Type into the search field, one keystroke's worth. */
async function type(input: Element, text: string): Promise<void> {
  await act(async () => {
    await fireEvent.changeText(input, text);
  });
}

/**
 * Submit the search field, as the keyboard's search key does. The screen reads
 * the submitted text off the event, so the event has to carry it.
 */
async function submit(input: Element, text: string): Promise<void> {
  await act(async () => {
    await fireEvent(input, "submitEditing", { nativeEvent: { text } });
  });
}

/** Press an element, settling the render it causes. */
async function press(element: Element): Promise<void> {
  await act(async () => {
    await fireEvent.press(element);
  });
}

describe("destination search is not auto-complete", () => {
  it("sends nothing while the user types a whole address", async () => {
    const { getByTestId } = await render(<DestinationScreen />);
    const input = getByTestId("destination-search-input");

    for (const text of ["1", "12", "120", "120 Main", "120 Main St"]) {
      await type(input, text);
    }

    // Wait past the 400 ms debounce the old implementation used. Without this
    // the test passes against that implementation too, because an act-wrapped
    // event drains microtasks but never advances the clock.
    await settleFor(DEBOUNCE_GRACE_MS);

    expect(mockSearchDestinations).not.toHaveBeenCalled();
  });

  it("sends one request when the search is submitted", async () => {
    const { getByTestId } = await render(<DestinationScreen />);
    const input = getByTestId("destination-search-input");

    await type(input, "120 Main St");
    await submit(input, "120 Main St");

    await waitFor(() => {
      expect(mockSearchDestinations).toHaveBeenCalledTimes(1);
    });
    expect(mockSearchDestinations).toHaveBeenCalledWith("120 Main St");
  });

  it("searches when the search button is pressed", async () => {
    const { getByTestId } = await render(<DestinationScreen />);

    await type(getByTestId("destination-search-input"), "towson");
    await press(getByTestId("destination-search-submit"));

    await waitFor(() => {
      expect(mockSearchDestinations).toHaveBeenCalledWith("towson");
    });
  });

  it("sends nothing for a query too short to be worth a request", async () => {
    const { getByTestId } = await render(<DestinationScreen />);
    const input = getByTestId("destination-search-input");

    await type(input, "to");
    await submit(input, "to");
    await press(getByTestId("destination-search-submit"));

    expect(mockSearchDestinations).not.toHaveBeenCalled();
  });

  it("drops stale results as soon as the query is edited again", async () => {
    const { getByTestId, queryByTestId, findByTestId } = await render(
      <DestinationScreen />,
    );
    const input = getByTestId("destination-search-input");

    await type(input, "120 Main St");
    await submit(input, "120 Main St");
    await findByTestId("search-result-39.3138");

    await type(input, "120 Main Str");
    expect(queryByTestId("search-result-39.3138")).toBeNull();
  });
});

describe("OpenStreetMap attribution", () => {
  it("attributes the results the user is looking at", async () => {
    const { getByTestId, findByTestId } = await render(<DestinationScreen />);
    const input = getByTestId("destination-search-input");

    await type(input, "120 Main St");
    await submit(input, "120 Main St");

    const attribution = await findByTestId("search-attribution");
    expect(attribution.props.children).toContain("OpenStreetMap");
  });

  it("shows no attribution before anything has been searched", async () => {
    const { queryByTestId } = await render(<DestinationScreen />);

    expect(queryByTestId("search-attribution")).toBeNull();
  });
});
