/**
 * Which routing path a downloaded region gets: in-process native Valhalla, or
 * HTTP (#152).
 *
 * A wrong choice fails quietly: the app routes over the network when it should
 * route offline, or tries native routing with no archive on disk. The matrix
 * here is the build's opt-in × whether the region's routing archive is present.
 * What happens when the native module itself is missing is covered alongside,
 * in ValhallaNativeBranch.test.ts.
 */

import { planValhallaInit } from "@/services/valhalla/ValhallaTiles";

import type { DownloadedRegion } from "@bugrout/shared";

/** What getInfoAsync reports for the archive. */
interface Info {
  exists: boolean;
  size?: number;
}
const mockGetInfoAsync = jest.fn<Promise<Info>, [string]>();

jest.mock("@/platform/fileSystem", () => ({
  getInfoAsync: (path: string) => mockGetInfoAsync(path),
}));

const ARCHIVE = "file:///docs/tiles/md/md.valhalla.tar.gz";
const region: DownloadedRegion = {
  id: "md",
  name: "Maryland",
  bbox: { west: -79.5, south: 37.9, east: -75.0, north: 39.7 },
  pmtilesPath: "file:///docs/tiles/md/md.pmtiles",
  valhallaTilesPath: ARCHIVE,
  downloadedAt: 0,
  sizeBytes: 0,
  version: "2026.09.28",
};

const originalApproach = process.env.EXPO_PUBLIC_VALHALLA_APPROACH;

afterEach(() => {
  mockGetInfoAsync.mockReset();
  if (originalApproach === undefined) {
    delete process.env.EXPO_PUBLIC_VALHALLA_APPROACH;
  } else {
    process.env.EXPO_PUBLIC_VALHALLA_APPROACH = originalApproach;
  }
});

/** Set the build's approach (`undefined` = not set) and the archive's state. */
function given(approach: string | undefined, archive: Info): void {
  if (approach === undefined) delete process.env.EXPO_PUBLIC_VALHALLA_APPROACH;
  else process.env.EXPO_PUBLIC_VALHALLA_APPROACH = approach;
  mockGetInfoAsync.mockResolvedValue(archive);
}

describe("planValhallaInit", () => {
  it("routes natively when the build opts in and the archive is on disk", async () => {
    given("native", { exists: true, size: 52_000_000 });

    expect(await planValhallaInit(region)).toEqual({
      approach: "native",
      tileDir: ARCHIVE,
    });
    expect(mockGetInfoAsync).toHaveBeenCalledWith(ARCHIVE);
  });

  it("treats an archive whose size isn't reported as present", async () => {
    given("native", { exists: true });

    expect((await planValhallaInit(region)).approach).toBe("native");
  });

  it.each<[string, Info]>([
    ["missing", { exists: false }],
    ["empty (0 bytes, an interrupted download)", { exists: true, size: 0 }],
  ])(
    "uses HTTP when the build opts in but the archive is %s",
    async (_label, archive) => {
      given("native", archive);

      expect((await planValhallaInit(region)).approach).toBe("http");
    },
  );

  it("uses HTTP, without touching the disk, when the region has no archive path", async () => {
    given("native", { exists: true, size: 1 });

    const plan = await planValhallaInit({ ...region, valhallaTilesPath: "" });

    expect(plan.approach).toBe("http");
    expect(mockGetInfoAsync).not.toHaveBeenCalled();
  });

  it.each([undefined, "http", "NATIVE", ""])(
    "uses HTTP when the build hasn't opted in (approach %p), even with the archive present",
    async (approach) => {
      given(approach, { exists: true, size: 52_000_000 });

      expect((await planValhallaInit(region)).approach).toBe("http");
    },
  );
});
