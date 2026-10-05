/**
 * Metro asset sizing — `image-size` regression tests.
 *
 * GHSA-5p2g-fcmc-qvqq (CVE-2025-71329) and GHSA-w3rx-r6r6-pgpr
 * (CVE-2025-71330): `image-size` <= 2.0.2 loops forever on a JXL/HEIF box or
 * an ICNS entry whose size field is zero. It reaches the tree only through
 * Metro, which uses it to measure image assets at build time.
 *
 * Two controls hold it closed, and each fails differently:
 *
 *   1. A bounded `pnpm.overrides` entry lifts `image-size` to the first
 *      patched release, 2.0.3.
 *   2. A `pnpm` patch on each Metro in the tree reads the asset into a buffer
 *      before sizing it, because image-size 2.x no longer accepts a path —
 *      and Metro passes a path for every asset not inside a `.zip`.
 *
 * Removing (1) is caught by `pnpm audit`, `osv-scanner` and Trivy. Removing
 * (2) is **not** — those stay green while every image asset fails to bundle
 * with `The "list" argument must be an instance of ... ArrayBufferView`. That
 * gap is why this file exists; `bundle:check` also catches it, but only as a
 * build failure that does not name the cause. See
 * docs/dependency-upgrade-policy.md for the retirement condition.
 *
 * There are two Metros because two things load one: `@expo/metro` (what
 * `expo export` and the dev server use) and React Native's CLI plugin. Each is
 * resolved the way its consumer resolves it, so the test exercises the copies
 * that actually run — not a hoisted one that might differ.
 *
 * Only `@expo/metro`'s copy (0.83.3, pinned exactly by SDK 54) still uses
 * `image-size`. The CLI plugin's copy is overridden to Metro 0.83.8 (#156),
 * which sizes images with its own `src/lib/imageSize.js` and does not depend
 * on `image-size` at all — so for that copy the test asserts exactly that,
 * and fails if it ever falls back to a Metro that does. Both copies must
 * still give every app image the same dimensions.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, test } from "node:test";

const requireFrom = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, "../..");
const mobileRoot = path.join(repoRoot, "apps/mobile");

/**
 * Directory of the package `name` as seen from `fromDir`.
 *
 * @param name - Package to resolve.
 * @param fromDir - Directory to resolve it from.
 * @returns The package's directory.
 */
function packageDir(name: string, fromDir: string): string {
  return path.dirname(
    requireFrom.resolve(`${name}/package.json`, { paths: [fromDir] }),
  );
}

/**
 * Each Metro in the tree, keyed by the consumer that loads it, and how it
 * sizes images: through `image-size` (patched), or with its own sizer.
 */
const metros: readonly {
  consumer: string;
  dir: string;
  sizer: "image-size" | "own";
}[] = (() => {
  const expoCli = packageDir("@expo/cli", packageDir("expo", mobileRoot));
  const expoMetro = packageDir("@expo/metro", expoCli);
  const cliPlugin = packageDir(
    "@react-native/community-cli-plugin",
    packageDir("react-native", mobileRoot),
  );
  return [
    {
      consumer: "@expo/metro",
      dir: packageDir("metro", expoMetro),
      sizer: "image-size",
    },
    {
      consumer: "@react-native/community-cli-plugin",
      dir: packageDir("metro", cliPlugin),
      sizer: "own",
    },
  ];
})();

/**
 * Entry point of the `image-size` a given Metro loads.
 *
 * @param metroDir - Directory of that Metro.
 * @returns The resolved entry file.
 */
function imageSizeEntry(metroDir: string): string {
  return requireFrom.resolve("image-size", { paths: [metroDir] });
}

/**
 * Version of an `image-size`, read from its resolved path. pnpm's isolated
 * layout encodes it in the store directory; the deep-link test reads
 * `decode-uri-component` the same way.
 *
 * @param entry - Resolved `image-size` entry file.
 * @returns The version string, or null if the path is not in that layout.
 */
function versionFromPath(entry: string): string | null {
  return /image-size@(\d+\.\d+\.\d+)/.exec(entry)?.[1] ?? null;
}

interface AssetData {
  width?: number;
  height?: number;
}

/** Metro's own signature — five positional arguments, not ours to reshape. */
type GetAssetDataArgs = [
  assetPath: string,
  localPath: string,
  assetDataPlugins: readonly string[],
  platform: string | null,
  publicPath: string,
];

interface MetroAssets {
  getAssetData: (...args: GetAssetDataArgs) => Promise<AssetData>;
}

/** A 48x48 PNG that ships with the app. */
const fixture = path.join(mobileRoot, "assets/images/favicon.png");

/** Every image the app ships, which both Metros must size identically. */
const appImages = [
  "adaptive-icon.png",
  "favicon.png",
  "icon.png",
  "splash-icon.png",
].map((name) => path.join(mobileRoot, "assets/images", name));

/**
 * The dimensions a Metro gives an image.
 *
 * @param metroDir - Directory of that Metro.
 * @param image - Path of the image.
 * @returns Its width and height as Metro reports them.
 */
async function sizeWith(
  metroDir: string,
  image: string,
): Promise<{ width: number | undefined; height: number | undefined }> {
  const assets = requireFrom(
    path.join(metroDir, "src/Assets.js"),
  ) as MetroAssets;
  const data = await assets.getAssetData(
    image,
    path.basename(image),
    [],
    null,
    "/assets",
  );
  return { width: data.width, height: data.height };
}

/**
 * Whether a Metro declares `image-size` as a dependency.
 *
 * @param metroDir - Directory of that Metro.
 * @returns True when its package.json lists it.
 */
function dependsOnImageSize(metroDir: string): boolean {
  const pkg = requireFrom(path.join(metroDir, "package.json")) as {
    dependencies?: Record<string, string>;
  };
  return "image-size" in (pkg.dependencies ?? {});
}

/**
 * An ICNS header followed by one entry whose length field is zero. A
 * vulnerable parser never advances past that entry.
 */
const zeroLengthIcns = (() => {
  const buffer = Buffer.alloc(16);
  buffer.write("icns", 0);
  buffer.writeUInt32BE(16, 4);
  buffer.write("ic07", 8);
  buffer.writeUInt32BE(0, 12);
  return buffer;
})();

for (const { consumer, dir, sizer } of metros.filter(
  (m) => m.sizer === "own",
)) {
  describe(`asset sizing via ${consumer} — Metro sizes images itself`, () => {
    // If this copy ever falls back to a Metro that uses image-size, it is
    // unpatched (only 0.83.3 carries a patch) and the advisories reopen.
    test("this Metro does not depend on image-size", () => {
      assert.equal(
        dependsOnImageSize(dir),
        false,
        `${consumer} resolved metro to ${dir}, which depends on image-size ` +
          `again (${sizer} sizer expected). Check the community-cli-plugin ` +
          `overrides in package.json and docs/dependency-upgrade-policy.md.`,
      );
    });

    test("it gives every app image the same dimensions as @expo/metro's", async () => {
      const reference = metros.find((m) => m.sizer === "image-size");
      assert.ok(reference, "no image-size Metro to compare against");
      for (const image of appImages) {
        assert.deepEqual(
          await sizeWith(dir, image),
          await sizeWith(reference.dir, image),
          `${path.basename(image)} is sized differently by the two Metros`,
        );
      }
    });
  });
}

for (const { consumer, dir } of metros.filter(
  (m) => m.sizer === "image-size",
)) {
  test(`${consumer}'s Metro still depends on image-size, so its patch applies`, () => {
    assert.equal(dependsOnImageSize(dir), true);
  });

  describe(`asset sizing via ${consumer} — the patched dependencies are the ones that run`, () => {
    // Structural, not timing-based: a version comparison cannot silently stop
    // detecting the way a wall-clock threshold can.
    test("image-size resolves to a patched release", () => {
      const entry = imageSizeEntry(dir);
      const version = versionFromPath(entry);
      assert.ok(
        version,
        `could not read an image-size version from its resolved path ${entry}`,
      );
      const [major = 0, minor = 0, patch = 0] = version
        .split(".")
        .map((n) => Number.parseInt(n, 10));
      const patched = major > 2 || (major === 2 && (minor > 0 || patch >= 3));
      assert.ok(
        patched,
        `${consumer}'s Metro loads image-size ${version}; CVE-2025-71329/71330 ` +
          `need >= 2.0.3. Check pnpm.overrides in package.json.`,
      );
    });

    test("Metro is the patched copy, not an unpatched one", () => {
      assert.match(
        dir,
        /metro@[^/]*patch_hash=/,
        `${consumer} resolved metro to ${dir}, which carries no patch hash. ` +
          `Check pnpm.patchedDependencies in package.json.`,
      );
    });
  });

  describe(`asset sizing via ${consumer} — Metro still measures images`, () => {
    // Without the Metro patch this rejects: image-size 2.x is handed a path.
    test("an image asset on disk is sized from its path", async () => {
      assert.deepEqual(await sizeWith(dir, fixture), { width: 48, height: 48 });
    });
  });

  describe(`asset sizing via ${consumer} — the infinite loop is closed`, () => {
    // A backstop, not the primary detector: the version check above is what
    // holds this closed. It runs in a child process because the vulnerable
    // loop is synchronous — in-process it would hang this suite rather than
    // fail it. Measured: image-size 1.2.1 was still looping when killed at
    // 5 s; 2.0.4 rejects the buffer immediately.
    test("a zero-length ICNS entry is rejected, not looped on", () => {
      const script = [
        "const m = require(process.argv[1]);",
        "const size = m.default ?? m.imageSize ?? m;",
        "try { size(Buffer.from(process.argv[2], 'base64')); } catch {}",
      ].join("\n");
      const result = spawnSync(
        process.execPath,
        ["-e", script, imageSizeEntry(dir), zeroLengthIcns.toString("base64")],
        { timeout: 10_000, encoding: "utf8" },
      );
      assert.equal(
        result.signal,
        null,
        `sizing a zero-length ICNS entry was still running after 10 s ` +
          `(killed by ${String(result.signal)}) — this image-size loops.`,
      );
      assert.equal(result.status, 0, result.stderr);
    });
  });
}
