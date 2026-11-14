/**
 * The route preview says when cached threat data is older than its refresh
 * interval (#340).
 *
 * Opening the app offline used to show a route with no notice whatever the
 * age of the cached threats: the time of each source's last successful fetch
 * lived only in memory, so a restart forgot it. It is now saved with every
 * successful fetch and read back on launch.
 *
 * The case #288 deferred this over is pinned here too: the notice must be
 * about the data's real age, so an offline launch with data still inside its
 * refresh interval — or with no data ever fetched — says nothing.
 */
import { act, render } from "@testing-library/react-native";

import { staleThreatMessage } from "@/components/map/ThreatStatusNotice";
import { RouteThreatWarnings } from "@/components/routing/RouteThreatWarnings";
import { staleSources } from "@/services/threats/ThreatFreshness";
import {
  loadCachedThreats,
  refreshThreats,
} from "@/services/threats/ThreatSync";
import { useConnectivityStore } from "@/stores/useConnectivityStore";
import { useThreatStore } from "@/stores/useThreatStore";

import type { ThreatZone } from "@bugrout/shared";

const mockGetCachedThreats = jest.fn();
jest.mock("@/db/queries/threats", () => ({
  clearExpiredThreats: jest.fn().mockResolvedValue(undefined),
  getCachedThreats: (...args: unknown[]) =>
    mockGetCachedThreats(...args) as unknown,
  clearThreatsBySource: jest.fn().mockResolvedValue(undefined),
  upsertThreatZones: jest.fn().mockResolvedValue(undefined),
}));

/** Stands in for the SQLite preferences table: it outlives the store. */
const mockPreferences = new Map<string, string>();
jest.mock("@/db/queries/preferences", () => ({
  getPreference: (key: string) =>
    Promise.resolve(mockPreferences.get(key) ?? null),
  setPreference: (key: string, value: string) => {
    mockPreferences.set(key, value);
    return Promise.resolve();
  },
}));

const mockFetchNWSAlerts = jest.fn();
jest.mock("@/services/threats/NWSService", () => ({
  CACHE_TTL_MS: 3_600_000,
  fetchNWSAlerts: (...args: unknown[]) =>
    mockFetchNWSAlerts(...args) as unknown,
}));

const mockFetchFirePerimeters = jest.fn();
jest.mock("@/services/threats/USFSService", () => ({
  CACHE_TTL_MS: 43_200_000,
  fetchFirePerimeters: (...args: unknown[]) =>
    mockFetchFirePerimeters(...args) as unknown,
}));

jest.mock("@/services/threats/FEMAService", () => ({
  loadFloodZones: jest.fn().mockResolvedValue([]),
}));

const BBOX = { west: -79.5, south: 37.9, east: -75.0, north: 39.8 };
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = 1_800_000_000_000;

/** A cached fire perimeter fetched at a given time. */
function fire(id: string, fetchedAt: number): ThreatZone {
  return {
    id,
    type: "wildfire",
    severity: "severe",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-77, 39],
          [-76.9, 39],
          [-76.9, 39.1],
          [-77, 39],
        ],
      ],
    },
    headline: id,
    description: "",
    source: "usfs",
    fetchedAt,
    expiresAt: null,
  };
}

/** Forget everything held in memory, as quitting the app does. */
function restartApp(): void {
  useThreatStore.getState().clearThreats();
}

beforeEach(() => {
  mockPreferences.clear();
  mockGetCachedThreats.mockReset().mockResolvedValue([]);
  mockFetchNWSAlerts.mockReset().mockResolvedValue([]);
  mockFetchFirePerimeters.mockReset().mockResolvedValue([]);
  useConnectivityStore.setState({ isOnline: true });
  restartApp();
  jest.spyOn(Date, "now").mockReturnValue(NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("staleSources", () => {
  it("lists a source older than its refresh interval, with its age", () => {
    expect(
      staleSources({ nws: NOW - 2 * HOUR, usfs: NOW - 2 * HOUR }, {}, NOW),
    ).toEqual([{ source: "nws", ageMs: 2 * HOUR }]);
    expect(staleSources({ usfs: NOW - 13 * HOUR }, {}, NOW)).toEqual([
      { source: "usfs", ageMs: 13 * HOUR },
    ]);
  });

  it("says nothing about a source that was never fetched", () => {
    expect(staleSources({}, {}, NOW)).toEqual([]);
  });

  it("never calls static flood zones stale", () => {
    expect(staleSources({ fema: NOW - 400 * DAY }, {}, NOW)).toEqual([]);
  });

  it("leaves a failed source to the failure notice", () => {
    expect(staleSources({ usfs: NOW - 3 * DAY }, { usfs: true }, NOW)).toEqual(
      [],
    );
  });
});

describe("staleThreatMessage", () => {
  it("gives each stale source's age", () => {
    expect(staleThreatMessage({ nws: NOW - 90 * 60_000 }, {}, NOW)).toBe(
      "Weather alerts last updated 1 hour ago; this route may not avoid current threats",
    );
    expect(
      staleThreatMessage({ nws: NOW - 5 * HOUR, usfs: NOW - 3 * DAY }, {}, NOW),
    ).toBe(
      "Weather alerts last updated 5 hours ago and fire perimeters last updated 3 days ago; this route may not avoid current threats",
    );
  });

  it("is null while every cached source is within its interval", () => {
    expect(
      staleThreatMessage({ nws: NOW - 59 * 60_000, usfs: NOW - HOUR }, {}, NOW),
    ).toBeNull();
  });
});

describe("a source's last successful fetch survives a restart", () => {
  it("saves the time of a successful fetch, even an empty one", async () => {
    await refreshThreats(BBOX, "md");
    expect(mockPreferences.get("threat_fetched_at_usfs")).toBe(String(NOW));
    expect(mockPreferences.get("threat_fetched_at_nws")).toBe(String(NOW));
  });

  it("does not save a time for a fetch that failed", async () => {
    mockFetchFirePerimeters.mockRejectedValue(new Error("HTTP 503"));
    await refreshThreats(BBOX, "md");
    expect(mockPreferences.has("threat_fetched_at_usfs")).toBe(false);
    expect(useThreatStore.getState().dataAsOf.usfs).toBeUndefined();
  });

  it("warns on an offline launch days after the last fetch", async () => {
    await refreshThreats(BBOX, "md");

    restartApp();
    useConnectivityStore.setState({ isOnline: false });
    jest.spyOn(Date, "now").mockReturnValue(NOW + 3 * DAY);
    await loadCachedThreats();

    const screen = await render(<RouteThreatWarnings threats={[]} />);
    const notice = screen.getByTestId("threat-stale");
    expect(notice).toHaveTextContent(
      "Weather alerts last updated 3 days ago and fire perimeters last updated 3 days ago; this route may not avoid current threats",
    );
    expect(notice.props.accessibilityLiveRegion).toBe("polite");
  });

  it("says nothing on an offline launch inside the refresh interval", async () => {
    await refreshThreats(BBOX, "md");

    restartApp();
    useConnectivityStore.setState({ isOnline: false });
    jest.spyOn(Date, "now").mockReturnValue(NOW + 30 * 60_000);
    await loadCachedThreats();
    // The offline sync the map runs after launch must not change that.
    await refreshThreats(BBOX, "md");

    expect(useThreatStore.getState().dataAsOf.usfs).toBe(NOW);
    const screen = await render(<RouteThreatWarnings threats={[]} />);
    expect(screen.queryByTestId("threat-stale")).toBeNull();
  });

  it("says nothing on an offline launch when nothing was ever fetched", async () => {
    useConnectivityStore.setState({ isOnline: false });
    await loadCachedThreats();
    await refreshThreats(BBOX, "md");

    expect(useThreatStore.getState().dataAsOf).toEqual({});
    const screen = await render(<RouteThreatWarnings threats={[]} />);
    expect(screen.toJSON()).toBeNull();
  });

  it("dates threats cached before the time was saved by their rows", async () => {
    mockGetCachedThreats.mockResolvedValue([
      fire("old", NOW - 9 * DAY),
      fire("newer", NOW - 8 * DAY),
    ]);
    useConnectivityStore.setState({ isOnline: false });
    await loadCachedThreats();

    expect(useThreatStore.getState().dataAsOf).toEqual({
      usfs: NOW - 8 * DAY,
    });
    const screen = await render(<RouteThreatWarnings threats={[]} />);
    expect(screen.getByTestId("threat-stale")).toHaveTextContent(
      "Fire perimeters last updated 8 days ago; this route may not avoid current threats",
    );
  });

  it("clears the notice once the source is fetched again", async () => {
    mockPreferences.set("threat_fetched_at_usfs", String(NOW - 3 * DAY));
    mockPreferences.set("threat_fetched_at_nws", String(NOW - 3 * DAY));
    await loadCachedThreats();
    const screen = await render(<RouteThreatWarnings threats={[]} />);
    expect(screen.getByTestId("threat-stale")).toBeTruthy();

    await act(async () => {
      await refreshThreats(BBOX, "md");
    });
    expect(screen.queryByTestId("threat-stale")).toBeNull();
  });

  it("ignores a saved time it cannot read", async () => {
    mockPreferences.set("threat_fetched_at_usfs", "not-a-time");
    await loadCachedThreats();
    expect(useThreatStore.getState().dataAsOf).toEqual({});
  });
});
