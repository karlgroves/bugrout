/**
 * Coverage of a saved destination (#190).
 *
 * The map and the road network the app can route on stop at the edge of the
 * downloaded regions — today, Maryland. A plan whose destination lies outside
 * them looks fine when it's saved and fails when it's needed, during an
 * evacuation, possibly without signal. So the warning comes at save time,
 * while there is still time and signal to download the region or pick
 * another destination.
 */

import { Alert } from "react-native";

import { getDownloadedRegions } from "@/db/queries/regions";
import { pointInBBox } from "@/utils/geo";

import type { DownloadedRegion, LatLng } from "@bugrout/shared";

/**
 * Why a destination isn't covered, or null when a downloaded region holds it.
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
 * Warn before saving a destination outside every downloaded region, and let
 * the user save anyway or go back and change it.
 *
 * @param destination - The destination about to be saved.
 * @returns True to save, false to go back to editing.
 */
export async function confirmCoverage(destination: LatLng): Promise<boolean> {
  const warning = coverageWarning(destination, await getDownloadedRegions());
  if (warning === null) return true;
  return new Promise((resolve) => {
    Alert.alert(
      "Outside your offline maps",
      warning,
      [
        {
          text: "Change destination",
          style: "cancel",
          onPress: () => {
            resolve(false);
          },
        },
        {
          text: "Save anyway",
          onPress: () => {
            resolve(true);
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          resolve(false);
        },
      },
    );
  });
}
