/**
 * Valhalla offline tile resolution (Approach A).
 *
 * TileManager.downloadRegion() writes each region's routing tiles to
 *   <documents>/tiles/<id>/<id>.valhalla.tar.gz
 * The in-process native module (cpp/ValhallaCore) accepts that .tar.gz path
 * directly and gunzips it once to an mmap'd .tar on first init. This module's
 * job is to decide whether offline routing is actually possible and which
 * approach + path to hand to initValhalla().
 */

import * as FileSystem from "@/platform/fileSystem";
import type { DownloadedRegion } from "@bugrout/shared";

export type ValhallaApproach = "native" | "http";

/**
 * Approach selected at build time via EXPO_PUBLIC_VALHALLA_APPROACH (mirrors
 * app.config.ts `extra.valhallaApproach`). Defaults to "http" so dev/preview
 * builds without the native binaries keep using the remote Fly service.
 */
export function configuredApproach(): ValhallaApproach {
  return process.env.EXPO_PUBLIC_VALHALLA_APPROACH === "native" ? "native" : "http";
}

/** True when the region's Valhalla archive is present and non-empty on disk. */
export async function hasOfflineValhallaTiles(
  region: DownloadedRegion,
): Promise<boolean> {
  if (!region.valhallaTilesPath) return false;
  const info = await FileSystem.getInfoAsync(region.valhallaTilesPath);
  if (!info.exists) return false;
  // Native reports `size`; if it's absent treat "exists" as present.
  return !("size" in info) || (info.size ?? 0) > 0;
}

export interface ValhallaInitPlan {
  approach: ValhallaApproach;
  /**
   * Path passed to initValhalla. For "native" this is the on-disk
   * `.valhalla.tar.gz`; the native module handles gunzip + mmap. For "http" it
   * is unused (the remote URL wins) but kept for symmetry.
   */
  tileDir: string;
}

/**
 * Decide how to initialize Valhalla for a downloaded region:
 *  - "native" when the build opted in AND offline tiles are present, so routing
 *    runs fully offline in-process;
 *  - "http" otherwise (remote Fly service, or mock route when unreachable).
 *
 * Safe to call even when the native module isn't compiled in: ValhallaModule's
 * native branch falls back to HTTP if the module is missing or init throws.
 */
export async function planValhallaInit(
  region: DownloadedRegion,
): Promise<ValhallaInitPlan> {
  if (
    configuredApproach() === "native" &&
    (await hasOfflineValhallaTiles(region))
  ) {
    return { approach: "native", tileDir: region.valhallaTilesPath };
  }
  return { approach: "http", tileDir: region.valhallaTilesPath };
}
