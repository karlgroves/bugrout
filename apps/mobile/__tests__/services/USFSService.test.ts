import { fetchFirePerimeters } from "@/services/threats/USFSService";

const square = {
  type: "Polygon" as const,
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
};

function mockFeed(features: unknown[]): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ features }),
  });
}

describe("fetchFirePerimeters ids", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("gives same-named and unnamed perimeters distinct ids", async () => {
    mockFeed([
      { properties: { poly_IncidentName: "Ridge" }, geometry: square },
      { properties: { poly_IncidentName: "Ridge" }, geometry: square },
      { properties: {}, geometry: square },
      { properties: {}, geometry: square },
    ]);

    const threats = await fetchFirePerimeters();

    expect(threats).toHaveLength(4);
    expect(new Set(threats.map((t) => t.id)).size).toBe(4);
    expect(threats.map((t) => t.headline)).toEqual([
      "Active Fire: Ridge",
      "Active Fire: Ridge",
      "Active Fire: Unnamed",
      "Active Fire: Unnamed",
    ]);
  });

  it("keys on the ArcGIS feature id when present, and stays unique", async () => {
    mockFeed([
      { id: 101, properties: { poly_IncidentName: "Ridge" }, geometry: square },
      { id: 102, properties: { poly_IncidentName: "Ridge" }, geometry: square },
      { id: 102, properties: {}, geometry: square },
    ]);

    const ids = (await fetchFirePerimeters()).map((t) => t.id);

    expect(ids[0]).toBe("fire-101");
    expect(ids[1]).toBe("fire-102");
    expect(new Set(ids).size).toBe(3);
  });

  it("requests OBJECTID, which ArcGIS needs to set each feature id", async () => {
    mockFeed([]);

    await fetchFirePerimeters();

    const fetchMock = global.fetch as jest.Mock<unknown, [string]>;
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("outFields")?.split(",")).toContain("OBJECTID");
  });
});

describe("fetchFirePerimeters endpoint", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  /**
   * Returns the URL `fetchFirePerimeters` requested.
   *
   * @returns The parsed request URL.
   */
  async function requestedUrl(): Promise<URL> {
    mockFeed([]);
    await fetchFirePerimeters();
    const fetchMock = global.fetch as jest.Mock<unknown, [string]>;
    return new URL(String(fetchMock.mock.calls[0]?.[0]));
  }

  // The withdrawn NIFC_Perimeters layer answered 400 "Invalid URL" to every
  // request, so the feed silently yielded no perimeters at all and avoidance
  // routing had no fires to route around (#336).
  it("queries the live WFIGS layer, not the withdrawn NIFC_Perimeters one", async () => {
    const url = await requestedUrl();

    expect(url.hostname).toBe("services3.arcgis.com");
    expect(url.pathname).toContain("/WFIGS_Interagency_Perimeters_Current/");
    expect(url.pathname).not.toContain("/NIFC_Perimeters/");
  });

  // ArcGIS ignores an outField the layer does not define instead of erroring,
  // so a name the parser reads but the layer never publishes fails silently:
  // every perimeter arrives with no containment. Requested names and read
  // names must therefore stay the same set.
  it("requests exactly the attribute names the parser reads", async () => {
    const url = await requestedUrl();

    expect(url.searchParams.get("outFields")?.split(",")).toEqual([
      "OBJECTID",
      "poly_IncidentName",
      "attr_PercentContained",
    ]);
  });
});

describe("fetchFirePerimeters containment", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  // Reads WFIGS's attr_PercentContained. Against the old irwin_* name these
  // both came back undefined, so a 90%-contained fire read as 0% and severe.
  it("reads containment from attr_PercentContained", async () => {
    mockFeed([
      {
        id: 1,
        properties: { poly_IncidentName: "Held", attr_PercentContained: 90 },
        geometry: square,
      },
      {
        id: 2,
        properties: { poly_IncidentName: "Running", attr_PercentContained: 10 },
        geometry: square,
      },
    ]);

    const threats = await fetchFirePerimeters();

    expect(threats.map((t) => t.severity)).toEqual(["moderate", "severe"]);
    expect(threats.map((t) => t.description)).toEqual([
      "90% contained",
      "10% contained",
    ]);
  });

  // The live layer leaves containment null on some perimeters, so unknown
  // containment must stay on the cautious side rather than read as contained.
  it("treats unreported containment as severe", async () => {
    mockFeed([
      {
        id: 3,
        properties: {
          poly_IncidentName: "Unknown",
          attr_PercentContained: null,
        },
        geometry: square,
      },
    ]);

    const threats = await fetchFirePerimeters();

    expect(threats[0]?.severity).toBe("severe");
  });
});
