/**
 * Demo location (#205).
 *
 * Maryland is the only published region, and App Review happens somewhere
 * else, so a reviewer's real position has no map, no route and nothing to
 * navigate. With the demo location on (Settings → Demo location), the app
 * starts from a fixed point in Baltimore and, once a trip starts, drives
 * along the route at a steady speed, so the whole flow — download, Bug Out,
 * destination, preview, Go, turn-by-turn, arrival — works from anywhere.
 *
 * It is never on by default, does not survive a restart, and the map and the
 * navigation screen say it is on (`DemoLocationBanner`): a simulated position
 * in an evacuation app must never be mistaken for a real one.
 */

import { haversineDistance } from "@/utils/geo";

import type { LocationUpdate } from "./LocationTracker";
import type { LatLng } from "@bugrout/shared";

export /** The demo's starting point: downtown Baltimore, on the road network. */
const DEMO_ORIGIN: LatLng = { lat: 39.2904, lng: -76.6122 };

/** 30 mph: quick enough to see turns arrive, slow enough to follow them. */
const DEMO_SPEED_MPS = 13.4;

const TICK_MS = 1000;

/**
 * The point a given distance along a polyline, and the direction of travel
 * there.
 *
 * @param coordinates - The route's points, in order.
 * @param metres - How far along it to go.
 * @returns The point (the last one past the end), its heading in degrees from
 *   north, and whether the end has been reached.
 */
export function pointAlongRoute(
  coordinates: readonly LatLng[],
  metres: number,
): { position: LatLng; heading: number; done: boolean } {
  let remaining = Math.max(0, metres);
  for (let i = 1; i < coordinates.length; i++) {
    const from = coordinates.at(i - 1);
    const to = coordinates.at(i);
    if (!from || !to) continue;
    const length = haversineDistance(from, to);
    if (remaining <= length && length > 0) {
      const t = remaining / length;
      return {
        position: {
          lat: from.lat + (to.lat - from.lat) * t,
          lng: from.lng + (to.lng - from.lng) * t,
        },
        heading: bearing(from, to),
        done: false,
      };
    }
    remaining -= length;
  }
  const last = coordinates[coordinates.length - 1] ?? DEMO_ORIGIN;
  const prev = coordinates[coordinates.length - 2] ?? last;
  return { position: last, heading: bearing(prev, last), done: true };
}

/** Initial bearing from one point to another, in degrees from north. */
function bearing(from: LatLng, to: LatLng): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(to.lat));
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** A demo fix at a position. */
export function demoFix(
  position: LatLng,
  heading = 0,
  speed = 0,
): LocationUpdate {
  return { position, heading, speed, accuracy: 5, timestamp: Date.now() };
}

/**
 * How far along which route the drive has got. Module state, not per drive:
 * navigation restarts tracking (battery saving, a reroute), and a restart must
 * carry on from where the car is, not jump back to the start of the route.
 */
let drive: { route: readonly LatLng[] | null; travelled: number } = {
  route: null,
  travelled: 0,
};

/**
 * Emit demo fixes once a second until stopped: standing at the origin with no
 * route, or driving along the route once there is one. A new route (a
 * reroute) is driven from its own start, which is where the last fix was.
 *
 * @param onUpdate - Receives each fix.
 * @param currentRoute - Returns the route being driven, or null.
 * @returns A function that stops the drive.
 */
export function startDemoDrive(
  onUpdate: (update: LocationUpdate) => void,
  currentRoute: () => readonly LatLng[] | null,
): () => void {
  const tick = (): void => {
    const route = currentRoute();
    if (route !== drive.route) drive = { route, travelled: 0 };
    if (!route || route.length < 2) {
      onUpdate(demoFix(DEMO_ORIGIN));
      return;
    }
    const { position, heading, done } = pointAlongRoute(route, drive.travelled);
    onUpdate(demoFix(position, heading, done ? 0 : DEMO_SPEED_MPS));
    drive.travelled += (DEMO_SPEED_MPS * TICK_MS) / 1000;
  };

  tick();
  const timer = setInterval(tick, TICK_MS);
  return () => {
    clearInterval(timer);
  };
}
