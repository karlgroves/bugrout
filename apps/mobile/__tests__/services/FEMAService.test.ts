import { parseFloodFeatures } from "@/services/threats/FEMAService";

describe("parseFloodFeatures", () => {
  const features = [
    {
      type: "Feature" as const,
      properties: { FLD_ZONE: "AE", ZONE_SUBTY: "Floodway" },
      geometry: {
        type: "Polygon" as const,
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
      },
    },
    {
      type: "Feature" as const,
      properties: { FLD_ZONE: "VE", STATIC_BFE: 12 },
      geometry: {
        type: "Polygon" as const,
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
      },
    },
    {
      type: "Feature" as const,
      properties: { FLD_ZONE: "X" }, // Low risk — should be filtered out
      geometry: {
        type: "Polygon" as const,
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
      },
    },
  ];

  it("filters to high-risk zones only", () => {
    const result = parseFloodFeatures(features, "ca");
    expect(result).toHaveLength(2); // AE and VE, not X
  });

  it("marks coastal zones as severe", () => {
    const result = parseFloodFeatures(features, "ca");
    const coastal = result.find((t) => t.headline.includes("VE"));
    expect(coastal?.severity).toBe("severe");
  });

  it("marks riverine zones as moderate", () => {
    const result = parseFloodFeatures(features, "ca");
    const riverine = result.find((t) => t.headline.includes("AE"));
    expect(riverine?.severity).toBe("moderate");
  });

  it("includes BFE in description when ZONE_SUBTY is present", () => {
    const featuresWithSubtype = [
      {
        type: "Feature" as const,
        properties: { FLD_ZONE: "VE", ZONE_SUBTY: "Coastal", STATIC_BFE: 12 },
        geometry: {
          type: "Polygon" as const,
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        },
      },
    ];
    const result = parseFloodFeatures(featuresWithSubtype, "ca");
    expect(result[0]!.description).toContain("BFE: 12 ft");
    expect(result[0]!.description).toContain("Coastal");
  });

  it("sets source to fema and expiresAt to null", () => {
    const result = parseFloodFeatures(features, "ca");
    for (const t of result) {
      expect(t.source).toBe("fema");
      expect(t.expiresAt).toBeNull();
      expect(t.type).toBe("flood");
    }
  });
});
