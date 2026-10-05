/**
 * The navigation screen's body: the map, or the directions list (#192).
 *
 * The essentials stay outside this switch — the advisory badge and status
 * above it, the ETA and Stop below it (#192, #189) — so either view keeps them.
 */

import { BugroutMap } from "@/components/map/BugroutMap";
import { ThreatOverlay } from "@/components/map/ThreatOverlay";
import { DirectionsList } from "@/components/navigation/DirectionsList";

import type { RouteView } from "@/stores/useRouteStore";
import type { LatLng, Route } from "@bugrout/shared";

/** The map following the user, or the list of every step of the route. */
export function RouteBody({
  view,
  route,
  maneuverIndex,
  metresToManeuver,
  position,
  heading,
}: {
  view: RouteView;
  route: Route | null;
  maneuverIndex: number;
  metresToManeuver: number;
  position: LatLng | null;
  heading: number;
}): React.JSX.Element {
  if (view === "directions" && route) {
    return (
      <DirectionsList
        route={route}
        progress={{ current: maneuverIndex, metresToCurrent: metresToManeuver }}
      />
    );
  }
  return (
    <BugroutMap
      userLocation={position}
      heading={heading}
      routeCoordinates={route?.coordinates}
      followUser
    >
      <ThreatOverlay />
    </BugroutMap>
  );
}
