/**
 * Per-feature geometry validation on the two paths #287 left uncovered (#339):
 * the NWS alert parse, and the map overlay.
 *
 * Malformed is not the same thing as absent. An NWS zone-based alert carries
 * `geometry: null` by design — it applies to a named forecast zone rather than
 * to a polygon — so `NWSAlertResponse.geometry` is typed `| null` and dropping
 * such a feature is correct handling of a legitimately absent geometry, not a
 * rejection of a bad feed. That is why the all-unusable-feed guard added for
 * NIFC/USFS in #355 is deliberately confined to those sources: for NWS, every
 * feature having no polygon is an ordinary day. What `sanitizeThreatGeometry`
 * rejects is geometry that is *present but unusable* — a null or non-numeric
 * coordinate, a position out of range, a ring shorter than the four positions
 * RFC 7946 section 3.1.6 requires. Both end up off the map, for different
 * reasons, and only the second means the feed is malformed.
 *
 * Every case here is per-feature: one unusable alert must not take a usable
 * sibling down with it. Each test fails with its guard removed —
 * `sanitizeThreatGeometry` in `NWSService.parseNWSResponse`,
 * `withUsableGeometry` in `ThreatOverlay` — which is what #339 asks be
 * confirmed.
 */
import { render } from "@testing-library/react-native";

import { ThreatOverlay } from "@/components/map/ThreatOverlay";
import { fetchNWSAlerts } from "@/services/threats/NWSService";
import { useThreatStore } from "@/stores/useThreatStore";

import type { ThreatZone } from "@bugrout/shared";

jest.mock("@/db/queries/threats", () => ({
  upsertThreatZones: jest.fn().mockResolvedValue(undefined),
}));

interface CapturedSource {
  id: string;
  features: {
    geometry: ThreatZone["geometry"];
    properties: { threatId: string };
  }[];
}

const capturedSources: CapturedSource[] = [];

jest.mock("@/platform/maplibre", () => ({
  ShapeSource: (props: Record<string, unknown>) => {
    const shape = props.shape as { features: CapturedSource["features"] };
    capturedSources.push({
      id: props.id as string,
      features: shape.features,
    });
    return null;
  },
  FillLayer: () => null,
  LineLayer: () => null,
}));

/** A ~2 km square ring near Baltimore, inside {@link BBOX}. */
const RING: number[][] = [
  [-76.72, 39.37],
  [-76.72, 39.39],
  [-76.7, 39.39],
  [-76.7, 39.37],
  [-76.72, 39.37],
];

/** A second valid ring, elsewhere inside {@link BBOX}. */
const OTHER_RING: number[][] = [
  [-77.0, 38.9],
  [-77.0, 39.1],
  [-76.8, 39.1],
  [-76.8, 38.9],
  [-77.0, 38.9],
];

/** {@link RING} with its second vertex's longitude replaced. */
function ringWithLng(lng: unknown): number[][] {
  const ring = RING.map((p) => [...p]);
  (ring[1] as unknown[])[0] = lng;
  return ring;
}

const polygon = (ring: unknown) => ({ type: "Polygon", coordinates: [ring] });

const BBOX = { west: -79.5, south: 37.9, east: -75.0, north: 39.8 };
const POINT = {
  properties: { relativeLocation: { properties: { state: "MD" } } },
};
const originalFetch = global.fetch;

/** A fetch response with a status and JSON body. */
function response(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

/** One feature of an NWS `/alerts/active` GeoJSON response. */
function alertFeature(id: string, event: string, geometry: unknown) {
  return {
    properties: { id, event, severity: "severe", headline: `${event} ${id}` },
    geometry,
  };
}

/**
 * Drive `fetchNWSAlerts` against a stubbed feed carrying `features`, so the
 * private `parseNWSResponse` is exercised on its real path.
 */
async function alertsFrom(features: unknown[]): Promise<ThreatZone[]> {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce(response(200, POINT))
    .mockResolvedValueOnce(response(200, { features }));
  return fetchNWSAlerts(BBOX);
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe("parseNWSResponse — legitimately absent geometry", () => {
  it("drops a zone-based alert with no geometry but keeps a polygon sibling", async () => {
    const zones = await alertsFrom([
      alertFeature("zone-only", "Winter Storm Warning", null),
      alertFeature("with-polygon", "Tornado Warning", polygon(RING)),
    ]);

    expect(zones.map((z) => z.id)).toEqual(["with-polygon"]);
  });

  it("returns no alerts when every feature is zone-based", async () => {
    // Not a feed failure: #288 makes an unreachable feed *reject*, so an empty
    // resolve means "nothing to draw", which is the normal case for a state
    // whose active alerts are all zone-based.
    await expect(
      alertsFrom([
        alertFeature("zone-a", "Heat Advisory", null),
        alertFeature("zone-b", "Wind Advisory", null),
      ]),
    ).resolves.toEqual([]);
  });
});

describe("parseNWSResponse — malformed geometry", () => {
  // Each shape below yields at least one usable ring coordinate, so it would
  // survive `alertIntersectsBBox` and reach the result if the guard were gone.
  // Shapes that yield *no* coordinates at all — a `Point`, or a `Polygon` with
  // an empty `coordinates` array — are deliberately not listed: the bbox
  // filter drops those on its own, so a test using one passes with the guard
  // removed and proves nothing here. Those shapes are covered directly by the
  // `sanitizeThreatGeometry` cases in ThreatGeometryValidation.test.ts (#287).
  it.each([
    ["a null coordinate", polygon(ringWithLng(null))],
    ["a string coordinate", polygon(ringWithLng("x"))],
    ["a NaN coordinate", polygon(ringWithLng(NaN))],
    ["an out-of-range longitude", polygon(ringWithLng(200))],
    ["a ring of three positions", polygon(RING.slice(0, 3))],
  ])("drops an alert with %s and keeps its usable sibling", async (_l, bad) => {
    const zones = await alertsFrom([
      alertFeature("bad", "Flood Warning", bad),
      alertFeature("good", "Flood Warning", polygon(RING)),
    ]);

    expect(zones.map((z) => z.id)).toEqual(["good"]);
    expect(zones[0]?.geometry).toEqual(polygon(RING));
  });

  it("keeps only the usable parts of a MultiPolygon alert", async () => {
    const zones = await alertsFrom([
      alertFeature("multi", "Red Flag Warning", {
        type: "MultiPolygon",
        coordinates: [[ringWithLng(null)], [RING]],
      }),
    ]);

    expect(zones).toHaveLength(1);
    expect(zones[0]?.geometry).toEqual({
      type: "MultiPolygon",
      coordinates: [[RING]],
    });
  });

  it("keeps a Polygon's outer ring when only its hole is malformed", async () => {
    const zones = await alertsFrom([
      alertFeature("holed", "Flood Warning", {
        type: "Polygon",
        coordinates: [RING, ringWithLng("x")],
      }),
    ]);

    expect(zones[0]?.geometry).toEqual(polygon(RING));
  });

  it("returns no alerts when every feature's geometry is unusable", async () => {
    await expect(
      alertsFrom([
        alertFeature("bad-a", "Flood Warning", polygon(ringWithLng(null))),
        alertFeature("bad-b", "Tornado Warning", polygon(RING.slice(0, 2))),
      ]),
    ).resolves.toEqual([]);
  });
});

/** A threat zone of `type` carrying the given (possibly malformed) geometry. */
function zone(
  id: string,
  type: ThreatZone["type"],
  geometry: unknown,
): ThreatZone {
  return {
    id,
    type,
    severity: "severe",
    geometry: geometry as ThreatZone["geometry"],
    headline: id,
    description: "",
    source: "nws",
    fetchedAt: 0,
    expiresAt: null,
  };
}

/** The threat ids the overlay drew into the layer for `type`. */
function drawnIds(type: string): string[] {
  const source = capturedSources.find((s) => s.id === `threat-source-${type}`);
  return (source?.features ?? []).map((f) => f.properties.threatId);
}

describe("ThreatOverlay — one bad feature does not affect the others", () => {
  // Reset before the render rather than after it: by this point the previous
  // test's overlay has been unmounted, so nothing is subscribed to the store
  // and the write needs no `act`.
  beforeEach(() => {
    capturedSources.length = 0;
    useThreatStore.setState({ threatZones: [] });
  });

  it("draws the usable zones of a type and leaves out the malformed one", async () => {
    useThreatStore.setState({
      threatZones: [
        zone("fire-a", "wildfire", polygon(RING)),
        zone("fire-bad", "wildfire", polygon(ringWithLng(null))),
        zone("fire-c", "wildfire", polygon(OTHER_RING)),
        zone("flood-d", "flood", polygon(RING)),
      ],
    });

    await render(<ThreatOverlay />);

    expect(drawnIds("wildfire")).toEqual(["fire-a", "fire-c"]);
    expect(drawnIds("flood")).toEqual(["flood-d"]);
  });

  it("draws no layer for a type whose only zone is malformed, and still draws the others", async () => {
    useThreatStore.setState({
      threatZones: [
        zone("fire-bad", "wildfire", polygon(ringWithLng("x"))),
        zone("flood-d", "flood", polygon(RING)),
      ],
    });

    await render(<ThreatOverlay />);

    expect(
      capturedSources.map((s) => s.id).includes("threat-source-wildfire"),
    ).toBe(false);
    expect(drawnIds("flood")).toEqual(["flood-d"]);
  });

  it("draws a partly usable MultiPolygon zone with only its usable part", async () => {
    useThreatStore.setState({
      threatZones: [
        zone("fire-multi", "wildfire", {
          type: "MultiPolygon",
          coordinates: [[ringWithLng(null)], [RING]],
        }),
      ],
    });

    await render(<ThreatOverlay />);

    const source = capturedSources.find(
      (s) => s.id === "threat-source-wildfire",
    );
    expect(source?.features[0]?.geometry).toEqual({
      type: "MultiPolygon",
      coordinates: [[RING]],
    });
  });

  it("leaves the store's zones untouched while filtering what it draws", async () => {
    const zones = [
      zone("fire-a", "wildfire", polygon(RING)),
      zone("fire-bad", "wildfire", polygon(ringWithLng(null))),
    ];
    useThreatStore.setState({ threatZones: zones });

    await render(<ThreatOverlay />);

    // The overlay filters for display only; the detail card and the routing
    // engine still read the store, so it must not be mutated.
    expect(useThreatStore.getState().threatZones).toBe(zones);
    expect(useThreatStore.getState().threatZones).toHaveLength(2);
  });
});
