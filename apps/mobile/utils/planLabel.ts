/**
 * How a plan's destination is described to the user (#187).
 */

import type { Scenario } from "@bugrout/shared";

export /** Shown for a destination that has no address — a dropped pin. */
const DROPPED_PIN_LABEL = "Dropped pin";

/**
 * A readable description of where a plan goes.
 *
 * Plans used to be listed as raw coordinates, which is the complaint behind
 * #187: nobody knows their relative's house as `39.3138, -76.6021`.
 *
 * A plan set by dropping a pin has no address, and nor does any plan saved
 * before plans had addresses. Those get {@link DROPPED_PIN_LABEL} rather than a
 * reverse lookup: filling a list of them in would mean a request to
 * OpenStreetMap's geocoder per plan, sending where the user is going to a third
 * party for a cosmetic gain and without the user asking for it. A pin is
 * reverse-geocoded at the moment it is dropped instead, which is one request
 * the user just asked for.
 *
 * @param plan - The plan to describe.
 * @returns The saved address, or the dropped-pin label.
 */
export function planDestinationLabel(plan: Scenario): string {
  // Truthiness, not `??`: a plan whose address is an empty string needs the
  // label just as much as one whose address is null.
  const address = plan.address?.trim();
  if (!address) return DROPPED_PIN_LABEL;
  return address;
}
