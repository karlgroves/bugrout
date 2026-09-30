/**
 * Why a route could not be calculated, and what to tell the user (#190).
 *
 * Routing used to fall back to a made-up straight-line route whenever the
 * engine failed. It was presented like a real one — distance, ETA, turn-by-turn
 * — and its ETA went into the emergency SMS. For an app whose job is safe
 * arrival, a confident wrong route is worse than an honest failure, so a
 * failure now surfaces as one of these reasons instead.
 */

/** The distinct ways routing can fail, each with its own advice. */
export type RouteUnavailableReason =
  /** A location is outside the road network the routing engine has. */
  | "out_of_coverage"
  /** Both points are covered, but no drivable path connects them — for
   * instance when active threat areas block every road. */
  | "no_path"
  /** The routing service could not be reached: no connection, or it timed out. */
  | "offline"
  /** The routing service answered with an error, or with something unreadable. */
  | "server_error"
  /** Routing was asked for before the engine was set up. */
  | "not_ready";

/** A route calculation that failed, with the reason the UI explains. */
export class RouteUnavailableError extends Error {
  readonly reason: RouteUnavailableReason;

  constructor(
    reason: RouteUnavailableReason,
    detail: string,
    options?: { cause?: unknown },
  ) {
    super(`Route unavailable (${reason}): ${detail}`, options);
    this.name = "RouteUnavailableError";
    this.reason = reason;
  }
}

/**
 * Valhalla error codes that mean a location is off the routing graph.
 * 171: "No suitable edges near location" — what a destination outside the
 * downloaded state returns (Baltimore → Louisville, #190).
 */
const OUT_OF_COVERAGE_CODES = new Set([171]);

/**
 * Valhalla error codes that mean both locations are routable but no path
 * joins them. 170: "Locations are in unconnected regions"; 442: "No path
 * could be found for input"; 443: "Exact route match algorithm failed".
 */
const NO_PATH_CODES = new Set([170, 442, 443]);

/**
 * Classify a Valhalla error response by its `error_code`. Anything that isn't a
 * known coverage or no-path code is a server error.
 *
 * @param body - The response body, if it could be read as JSON.
 * @returns The reason to report.
 */
export function reasonForValhallaError(body: unknown): RouteUnavailableReason {
  const code =
    typeof body === "object" && body !== null && "error_code" in body
      ? body.error_code
      : undefined;
  if (typeof code === "number") {
    if (OUT_OF_COVERAGE_CODES.has(code)) return "out_of_coverage";
    if (NO_PATH_CODES.has(code)) return "no_path";
  }
  return "server_error";
}

/** What the user is told, in plain words, and what they can do next. */
export interface RouteUnavailableMessage {
  title: string;
  body: string;
  /** Whether downloading offline maps is a sensible next step. */
  suggestDownloads: boolean;
}

/**
 * The message for a routing failure. Every message ends the same way on
 * purpose: when the app cannot route, official evacuation routes are the
 * instruction to follow.
 *
 * @param error - Whatever the routing call threw.
 * @returns Title, body and whether to offer Offline Maps.
 */
export function routeUnavailableMessage(
  error: unknown,
): RouteUnavailableMessage {
  const reason =
    error instanceof RouteUnavailableError ? error.reason : "server_error";
  const follow = "Follow official evacuation routes and instructions.";
  switch (reason) {
    case "out_of_coverage":
      return {
        title: "Outside your offline maps",
        body: `There's no road data for this destination or your current location, so BugRout can't route there. ${follow}`,
        suggestDownloads: true,
      };
    case "no_path":
      return {
        title: "No drivable route found",
        body: `No road route connects these points — active threat areas may be blocking every road. ${follow}`,
        suggestDownloads: false,
      };
    case "offline":
      return {
        title: "Can't reach the routing service",
        body: `Routes need a connection right now. Try again when you have signal. ${follow}`,
        suggestDownloads: false,
      };
    case "not_ready":
      return {
        title: "Routing isn't ready yet",
        body: `The app is still starting up. Try again in a moment. ${follow}`,
        suggestDownloads: false,
      };
    case "server_error":
      return {
        title: "Routing failed",
        body: `The routing service returned an error. Try again. ${follow}`,
        suggestDownloads: false,
      };
  }
}
