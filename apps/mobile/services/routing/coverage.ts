/**
 * Coverage of a saved destination (#190).
 *
 * The map and the road network the app can route on stop at the edge of the
 * downloaded regions — today, Maryland. A plan whose destination lies outside
 * them looks fine when it's saved and fails when it's needed, during an
 * evacuation, possibly without signal. So the warning comes at save time,
 * while there is still time and signal to download the region or pick
 * another destination, and it offers the download there and then (#196).
 */

import { Alert } from "react-native";

import { getDownloadedRegions } from "@/db/queries/regions";
import { pointInBBox } from "@/utils/geo";

import type { DownloadedRegion, LatLng } from "@bugrout/shared";

/**
 * Why a destination isn't covered, or null when a downloaded region holds it.
 *
 * A region is tested by its bounding box, the only shape the app stores. The
 * box is generous at the edges: Maryland's takes in Arlington and Alexandria,
 * Virginia, and Dover, Delaware, so a destination there gets no warning even
 * though neither the map nor routing covers it. The warning can therefore miss
 * a destination near a border, but never flags one inside a region.
 *
 * @param destination - The saved destination.
 * @param regions - The downloaded regions.
 * @returns The warning to show, or null.
 */
export function coverageWarning(
  destination: LatLng,
  regions: readonly Pick<DownloadedRegion, "name" | "bbox">[],
): string | null {
  if (regions.some((r) => pointInBBox(destination, r.bbox))) return null;
  if (regions.length === 0) {
    return "No offline maps are downloaded yet, so this destination can't be shown or routed to without a connection. Download the region it's in from Settings > Offline Maps.";
  }
  const names = regions.map((r) => r.name).join(", ");
  return `This destination is outside your downloaded maps (${names}). The map won't show it and the app may not be able to route to it. Download the region it's in, or choose a destination inside your maps.`;
}

/**
 * What the user chose at the coverage warning: save the plan as it is, go back
 * and change the destination, or go and download maps before saving.
 */
export type CoverageChoice = "save" | "change" | "download";

/**
 * Warn before saving a destination outside every downloaded region, and let
 * the user save anyway, go back and change it, or go to the downloads.
 *
 * @param destination - The destination about to be saved.
 * @returns "save" when the destination is covered or the user saves anyway.
 */
export async function confirmCoverage(
  destination: LatLng,
): Promise<CoverageChoice> {
  let regions: Awaited<ReturnType<typeof getDownloadedRegions>>;
  try {
    regions = await getDownloadedRegions();
  } catch {
    // The check is advice. If the regions can't be read, save the plan rather
    // than fail the save with nothing on screen.
    return "save";
  }
  const warning = coverageWarning(destination, regions);
  if (warning === null) return "save";
  return new Promise((resolve) => {
    Alert.alert(
      "Outside your offline maps",
      warning,
      [
        {
          text: "Change destination",
          style: "cancel",
          onPress: () => {
            resolve("change");
          },
        },
        {
          text: "Download maps",
          onPress: () => {
            resolve("download");
          },
        },
        {
          text: "Save anyway",
          onPress: () => {
            resolve("save");
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          resolve("change");
        },
      },
    );
  });
}
