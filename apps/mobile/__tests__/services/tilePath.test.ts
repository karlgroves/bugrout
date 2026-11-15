/**
 * The native routing engine opens tile archives with gzopen(), which takes a
 * POSIX path. expo-file-system hands out file:// URIs, so every tile path
 * built from `documentDirectory` has to be converted first — without it,
 * ValhallaCore::init failed with "cannot open file:///…", the error was
 * swallowed into the HTTP fallback, and routing reported itself offline on a
 * device that had the tiles and the engine.
 */
import { toFilesystemPath } from "@/services/valhalla/tilePath";

describe("toFilesystemPath", () => {
  it("strips the file:// scheme expo-file-system adds", () => {
    expect(
      toFilesystemPath(
        "file:///var/mobile/Containers/Data/Application/ABC/Documents/tiles/md/md.valhalla.tar.gz",
      ),
    ).toBe(
      "/var/mobile/Containers/Data/Application/ABC/Documents/tiles/md/md.valhalla.tar.gz",
    );
  });

  it("decodes percent-encoding, which real container paths carry", () => {
    expect(toFilesystemPath("file:///tmp/My%20Tiles/md.tar.gz")).toBe(
      "/tmp/My Tiles/md.tar.gz",
    );
  });

  it("leaves a plain path untouched", () => {
    expect(toFilesystemPath("/tmp/tiles/md.valhalla.tar.gz")).toBe(
      "/tmp/tiles/md.valhalla.tar.gz",
    );
  });

  it("keeps a relative path as-is", () => {
    expect(toFilesystemPath("tiles/md/md.valhalla.tar.gz")).toBe(
      "tiles/md/md.valhalla.tar.gz",
    );
  });

  it("falls back to the raw path when the escapes are malformed", () => {
    // decodeURIComponent throws on a lone %; a best-effort path beats failing
    // init outright.
    expect(toFilesystemPath("file:///tmp/100%/md.tar.gz")).toBe(
      "/tmp/100%/md.tar.gz",
    );
  });
});
