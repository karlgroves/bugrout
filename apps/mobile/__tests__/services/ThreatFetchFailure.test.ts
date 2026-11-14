/**
 * The threat feeds reject on failure rather than resolving to `[]` (#288),
 * so the sync can tell "couldn't reach the feed" from "no active threats".
 */
import { fetchNWSAlerts } from "@/services/threats/NWSService";
import { fetchFirePerimeters } from "@/services/threats/USFSService";

jest.mock("@/db/queries/threats", () => ({
  upsertThreatZones: jest.fn().mockResolvedValue(undefined),
}));

const BBOX = { west: -79.5, south: 37.9, east: -75.0, north: 39.8 };
const originalFetch = global.fetch;

/** A fetch response with a status and JSON body. */
function response(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const POINT = {
  properties: { relativeLocation: { properties: { state: "MD" } } },
};

/** A closed square ring from its west/south/east/north edges. */
function square(w: number, s: number, e: number, n: number): number[][] {
  return [
    [w, s],
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ];
}

/** One polygon feature of an NWS `/alerts/active` response. */
function alert(id: string, ring: number[][]) {
  return {
    properties: { id, event: "Flood Warning", severity: "severe" },
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

/** Run `fetchNWSAlerts(BBOX)` against a feed carrying `features`. */
async function alertIdsFrom(features: unknown[]): Promise<string[]> {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce(response(200, POINT))
    .mockResolvedValueOnce(response(200, { features }));
  return (await fetchNWSAlerts(BBOX)).map((z) => z.id);
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe("fetchNWSAlerts", () => {
  it("rejects when the points lookup fails", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(503));
    await expect(fetchNWSAlerts(BBOX)).rejects.toThrow(/HTTP 503/);
  });

  it("rejects when the points response names no state (#338)", async () => {
    // The alerts query is never made, so this is a failed fetch. Resolving to
    // [] would stamp the source as fetched just now and, now that an empty
    // result clears the source, drop the cached alerts as well.
    global.fetch = jest.fn().mockResolvedValue(response(200, {}));
    await expect(fetchNWSAlerts(BBOX)).rejects.toThrow(/no state/);
  });

  it("rejects when the alerts request fails", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(response(200, POINT))
      .mockResolvedValueOnce(response(500));
    await expect(fetchNWSAlerts(BBOX)).rejects.toThrow(/HTTP 500/);
  });

  it("rejects when a request times out", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    await expect(fetchNWSAlerts(BBOX)).rejects.toThrow("timed out");
  });

  it("resolves to [] when the feed answers with no alerts", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(response(200, POINT))
      .mockResolvedValueOnce(response(200, { features: [] }));
    await expect(fetchNWSAlerts(BBOX)).resolves.toEqual([]);
  });

  it("resolves to [] when the state has alerts but none is in the area (#359)", async () => {
    // It used to hand back every alert in the state here, so alerts from
    // outside the area were stored and drawn as this area's.
    await expect(
      alertIdsFrom([alert("elsewhere", square(-90, 30, -89, 31))]),
    ).resolves.toEqual([]);
  });

  it("keeps an alert that covers the area without a vertex inside it (#359)", async () => {
    // A vertex-in-box test misses this one. The old all-alerts fallback hid
    // that only while no other alert was in the area.
    await expect(
      alertIdsFrom([
        alert("covering", square(-85, 35, -70, 45)),
        alert("inside", square(-76.72, 39.37, -76.7, 39.39)),
        alert("elsewhere", square(-90, 30, -89, 31)),
      ]),
    ).resolves.toEqual(["covering", "inside"]);
  });
});

describe("fetchFirePerimeters", () => {
  it("rejects when the NIFC feed fails", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(403));
    await expect(fetchFirePerimeters(BBOX)).rejects.toThrow(/HTTP 403/);
  });

  it("resolves to [] when there are no active perimeters", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(200, { features: [] }));
    await expect(fetchFirePerimeters(BBOX)).resolves.toEqual([]);
  });

  it("rejects when the feed answers with perimeters but none is usable (#338)", async () => {
    // Every perimeter in the NIFC feed is a polygon, so a response whose
    // every feature is dropped as malformed (#287) is a broken feed, not
    // "no active fires": resolving to [] stamped the source as fetched just
    // now and silently lost the cached perimeters.
    global.fetch = jest.fn().mockResolvedValue(
      response(200, {
        features: [
          { properties: { poly_IncidentName: "Null" }, geometry: null },
          {
            properties: { poly_IncidentName: "Bad" },
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [-77, 39],
                  [null, 39],
                ],
              ],
            },
          },
        ],
      }),
    );
    await expect(fetchFirePerimeters(BBOX)).rejects.toThrow(
      /unusable geometry/,
    );
  });
});
