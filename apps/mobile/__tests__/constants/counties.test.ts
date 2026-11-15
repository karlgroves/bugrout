/**
 * `getCountyGroups` is called with a region id from the downloaded manifest,
 * which is outside input (#307). A plain object index walked the prototype
 * chain, so `"__proto__"` returned `Object.prototype` and the offline-map
 * downloads screen threw on `.map`.
 */

import { getCountyGroups } from "@/constants/counties";

describe("getCountyGroups", () => {
  it("returns the groups for a state that has them", () => {
    const groups = getCountyGroups("ca");
    expect(Array.isArray(groups)).toBe(true);
    expect(groups.length).toBeGreaterThan(0);
  });

  it("returns an empty list for a state without groups", () => {
    expect(getCountyGroups("md")).toEqual([]);
  });

  it.each(["__proto__", "constructor", "toString", "hasOwnProperty"])(
    "returns an empty array, not an inherited property, for %s",
    (id) => {
      expect(getCountyGroups(id)).toEqual([]);
    },
  );
});
