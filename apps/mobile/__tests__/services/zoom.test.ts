/**
 * One zoom-button press moves one level, within the map's limits (#188).
 */

import { MAX_ZOOM, MIN_ZOOM, stepZoom } from "@/services/map/zoom";

describe("stepZoom", () => {
  it.each([
    [12, 1, 13],
    [12, -1, 11],
    [12.4, 1, 13.4],
  ] as const)("from %p by %p gives %p", (current, direction, expected) => {
    expect(stepZoom(current, direction)).toBe(expected);
  });

  it("stops at the limits", () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MAX_ZOOM - 0.5, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
    expect(stepZoom(MIN_ZOOM + 0.5, -1)).toBe(MIN_ZOOM);
  });
});
