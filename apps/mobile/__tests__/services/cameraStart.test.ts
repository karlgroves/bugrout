import { cameraStart, LOCATED_ZOOM } from "@/services/map/cameraStart";

const MARYLAND = { west: -79.49, south: 37.89, east: -75.05, north: 39.72 };

describe("cameraStart", () => {
  it("opens on the user at street zoom when a fix is known", () => {
    expect(cameraStart({ lat: 39.2904, lng: -76.6122 }, MARYLAND)).toEqual({
      centerCoordinate: [-76.6122, 39.2904],
      zoomLevel: LOCATED_ZOOM,
    });
  });

  it("opens on the downloaded region's centre when there is no fix yet", () => {
    const { centerCoordinate } = cameraStart(null, MARYLAND);
    expect(centerCoordinate[0]).toBeCloseTo(-77.27);
    expect(centerCoordinate[1]).toBeCloseTo(38.805);
  });

  it("opens on a US overview, not California, when nothing is known", () => {
    const { centerCoordinate, zoomLevel } = cameraStart(null, null);
    expect(centerCoordinate).not.toEqual([-119.4179, 36.7783]);
    expect(zoomLevel).toBeLessThanOrEqual(4);
  });
});
