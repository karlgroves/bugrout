/**
 * How a plan's destination reads in a list (#187).
 *
 * Plans used to be listed as raw coordinates, which is the complaint the issue
 * opens with: nobody knows their relative's house as 39.3138, -76.6021.
 */
import { DROPPED_PIN_LABEL, planDestinationLabel } from "@/utils/planLabel";

import type { Scenario } from "@bugrout/shared";

/**
 * Build a plan with the given address.
 */
function plan(address: string | null): Scenario {
  return {
    id: "p1",
    name: "Mom's house",
    destination: { lat: 39.3138, lng: -76.6021 },
    address,
    avoidZones: [],
    resourceStops: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("planDestinationLabel", () => {
  it("uses the saved address", () => {
    expect(planDestinationLabel(plan("120 Main St, Towson, MD"))).toBe(
      "120 Main St, Towson, MD",
    );
  });

  it("names a dropped pin rather than showing coordinates", () => {
    expect(planDestinationLabel(plan(null))).toBe(DROPPED_PIN_LABEL);
  });

  it("treats a plan saved before addresses existed the same way", () => {
    // Such a plan reads back with address null, and must still be listed
    // readably rather than as numbers.
    const legacy = plan(null);
    expect(planDestinationLabel(legacy)).toBe(DROPPED_PIN_LABEL);
    expect(planDestinationLabel(legacy)).not.toContain("39.3");
  });

  it("does not show a blank line for an empty address", () => {
    expect(planDestinationLabel(plan("   "))).toBe(DROPPED_PIN_LABEL);
  });
});
