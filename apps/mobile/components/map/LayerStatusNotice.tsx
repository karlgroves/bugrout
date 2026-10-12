/**
 * How current the fuel (#200) and shelter (#201) layers are.
 *
 * Shelters open and close during an event (spec §10, Data Freshness), fuel
 * stations come from a shared public server that is often busy, and both
 * layers used to be silently empty whenever their feed failed — which looks
 * exactly like "none nearby". One line per visible layer says which it is:
 * when the points shown were fetched, that none were found, or that they
 * couldn't be loaded.
 */

import { StyleSheet, Text } from "react-native";

import { colors, spacing, typography } from "@/constants/theme";
import { useResourceStore } from "@/stores/useResourceStore";

import type { LayerStatus, StatusLayer } from "@/stores/useResourceStore";

/** "9:30 AM" today, or "Oct 3, 9:30 AM" on an earlier day. */
function asOfLabel(ms: number, now: number): string {
  const when = new Date(ms);
  const time = when.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  if (when.toDateString() === new Date(now).toDateString()) return time;
  const day = when.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${day}, ${time}`;
}

/**
 * A shelter's open/closed status and when that was reported, for its detail
 * sheet: shelters open and close during an event, so a status is only as good
 * as its time.
 *
 * @returns E.g. "Open · as of 9:30 AM".
 */
function shelterDetail(
  shelter: { metadata: Record<string, unknown>; fetchedAt: number },
  now: number,
): string {
  const { status } = shelter.metadata;
  const label =
    typeof status === "string" && status.length > 0
      ? status.charAt(0) + status.slice(1).toLowerCase()
      : "Status unknown";
  return `${label} · as of ${asOfLabel(shelter.fetchedAt, now)}`;
}

/** How each layer is named in its status line. */
const WORDING: Record<
  StatusLayer,
  { plural: string; none: string; noun: string }
> = {
  fuel: {
    plural: "Fuel stations",
    none: "No fuel stations found in this area",
    noun: "fuel stations",
  },
  shelter: {
    plural: "Shelters",
    none: "No open shelters reported in this area",
    noun: "shelters",
  },
};

/** The message for a layer's current state, or null for none. */
export function layerStatusMessage(
  layer: StatusLayer,
  status: LayerStatus,
  count: number,
  now: number,
): string | null {
  const { plural, none, noun } = WORDING[layer];
  const asOf = status.asOf === null ? null : asOfLabel(status.asOf, now);
  if (status.failed) {
    return asOf === null
      ? `Couldn't load ${noun}`
      : `Couldn't update ${noun}; showing those as of ${asOf}`;
  }
  if (asOf === null) return null;
  return count === 0 ? `${none} · as of ${asOf}` : `${plural} as of ${asOf}`;
}

/** One status line per visible layer that has something to say. */
export function LayerStatusNotice({
  now = Date.now(),
}: {
  now?: number;
}): React.JSX.Element | null {
  const { layerStatus, resources, visibleTypes } = useResourceStore();
  const lines = (["fuel", "shelter"] as const).flatMap((layer) => {
    if (!visibleTypes.has(layer)) return [];
    const status = layerStatus[layer];
    const count = resources.filter((r) => r.type === layer).length;
    const message = layerStatusMessage(layer, status, count, now);
    return message === null ? [] : [{ layer, message, failed: status.failed }];
  });
  if (lines.length === 0) return null;
  return (
    <>
      {lines.map(({ layer, message, failed }) => (
        <Text
          key={layer}
          style={[styles.text, failed && styles.failed]}
          accessibilityLiveRegion="polite"
          testID={`${layer}-status`}
        >
          {message}
        </Text>
      ))}
    </>
  );
}

/**
 * A fuel station's brand, whether it sells diesel, and when it was fetched,
 * for its detail sheet (spec §11.1).
 *
 * @returns E.g. "Shell · Diesel · as of 9:30 AM".
 */
function fuelDetail(
  station: { metadata: Record<string, unknown>; fetchedAt: number },
  now: number,
): string {
  const { brand, diesel } = station.metadata;
  const parts = [
    typeof brand === "string" && brand.length > 0 ? brand : null,
    diesel === true ? "Diesel" : null,
    `as of ${asOfLabel(station.fetchedAt, now)}`,
  ];
  return parts.filter((p) => p !== null).join(" · ");
}

/**
 * The status line for a resource's detail sheet: a shelter's open/closed
 * status, or a fuel station's brand and diesel; each with its "as of" time.
 *
 * @returns The line, or null for a type that has none.
 */
export function resourceDetail(
  resource: {
    type: string;
    metadata: Record<string, unknown>;
    fetchedAt: number;
  },
  now: number,
): string | null {
  if (resource.type === "shelter") return shelterDetail(resource, now);
  if (resource.type === "fuel") return fuelDetail(resource, now);
  return null;
}

const styles = StyleSheet.create({
  text: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: "hidden",
  },
  failed: {
    color: colors.warning,
  },
});
