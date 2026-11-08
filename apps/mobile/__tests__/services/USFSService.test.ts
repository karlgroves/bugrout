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
});
