/**
 * Zoom limits and steps for the map's zoom buttons (#188).
 *
 * The same limits go to MapLibre's Camera, so the buttons and pinch agree on
 * how far the map can zoom.
 */

export /** Furthest out: a whole country. */
const MIN_ZOOM = 2;

export /** Furthest in: street detail. Offline tiles stop at 14 and overzoom past it. */
const MAX_ZOOM = 18;

export /**
 * Where navigation starts: street level, close enough to read the next turn
 * and see the route line. Following used to inherit the opening zoom, which
 * before a GPS fix is the whole region (#190).
 */
const NAVIGATION_ZOOM = 15;

/**
 * The zoom level one button press away from `current`.
 *
 * @param current - The map's zoom level now (fractional after a pinch).
 * @param direction - `1` to zoom in, `-1` to zoom out.
 * @returns `current` moved one level, clamped to {@link MIN_ZOOM}–{@link MAX_ZOOM}.
 */
export function stepZoom(current: number, direction: 1 | -1): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + direction));
}
