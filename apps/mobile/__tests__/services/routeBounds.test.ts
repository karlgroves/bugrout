/**
 * The bounds a drawn route is framed by (#190).
 */
import {
  isDegenerate,
  routeBounds,
  ROUTE_FIT_PADDING,
} from "@/services/map/routeBounds";

const BALTIMORE = { lat: 39.2904, lng: -76.6122 };
const HAGERSTOWN = { lat: 39.6418, lng: -77.7199 };

describe("routeBounds", () => {
  it("encloses every coordinate, not just the end points", () => {
    // The midpoint sits north and west of both ends, so bounds taken from the
    // ends alone would crop it out of view.
    const bounds = routeBounds([
      BALTIMORE,
      { lat: 39.9, lng: -78.2 },
      HAGERSTOWN,
    ]);

    expect(bounds).toEqual({
      ne: [-76.6122, 39.9],
      sw: [-78.2, 39.2904],
    });
  });

  it("orders corners as north-east and south-west whatever order the route runs in", () => {
    const forward = routeBounds([BALTIMORE, HAGERSTOWN]);
    const reversed = routeBounds([HAGERSTOWN, BALTIMORE]);

    expect(forward).toEqual(reversed);
    expect(forward).toEqual({
      ne: [-76.6122, 39.6418],
      sw: [-77.7199, 39.2904],
    });
  });

  it("has nothing to frame for an empty or missing route", () => {
    expect(routeBounds([])).toBeNull();
    expect(routeBounds(null)).toBeNull();
    expect(routeBounds(undefined)).toBeNull();
  });

  it("reports a single point, and repeats of it, as enclosing no area", () => {
    const one = routeBounds([BALTIMORE]);
    const repeated = routeBounds([BALTIMORE, BALTIMORE, BALTIMORE]);

    expect(one).not.toBeNull();
    expect(one).toEqual(repeated);
    expect(isDegenerate(one!)).toBe(true);
  });

  it("does not report a real route as enclosing no area", () => {
    expect(isDegenerate(routeBounds([BALTIMORE, HAGERSTOWN])!)).toBe(false);
  });

  it("leaves room for the chrome every route screen draws over its edges", () => {
    expect(ROUTE_FIT_PADDING).toBeGreaterThan(0);
  });
});
