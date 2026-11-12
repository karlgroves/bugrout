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

afterEach(() => {
  global.fetch = originalFetch;
});

describe("fetchNWSAlerts", () => {
  it("rejects when the points lookup fails", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(503));
    await expect(fetchNWSAlerts(BBOX)).rejects.toThrow(/HTTP 503/);
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
    await expect(fetchFirePerimeters()).rejects.toThrow(/unusable geometry/);
  });
});
