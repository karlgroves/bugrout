/**
 * Path conversion between expo-file-system and the native routing engine.
 */

/**
 * Convert a path from expo-file-system into one the native engine can open.
 *
 * `documentDirectory` is a URI ("file:///.../Documents/"), so every path built
 * from it — including `DownloadedRegion.valhallaTilesPath` — carries a
 * `file://` scheme and percent-encoding. ValhallaCore opens the archive with
 * gzopen(), which takes a POSIX path and cannot resolve a URI: init failed
 * with "cannot open file:///…", the error was swallowed into the HTTP
 * fallback, and routing reported itself offline on a device that had both the
 * tiles and the engine.
 *
 * Paths that are already plain are returned unchanged, so this is safe to
 * apply to any tile path regardless of where it came from.
 *
 * @param path - A file URI or a filesystem path.
 * @returns A filesystem path.
 */
export function toFilesystemPath(path: string): string {
  if (!path.startsWith("file://")) return path;
  const withoutScheme = path.slice("file://".length);
  try {
    return decodeURIComponent(withoutScheme);
  } catch {
    // Malformed escapes: better to try the raw path than to fail outright.
    return withoutScheme;
  }
}
