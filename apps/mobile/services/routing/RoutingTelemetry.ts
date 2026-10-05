/**
 * Routing failures reported to crash reporting (#169).
 *
 * Real routing was down in every build for about five and a half months
 * (#141): every request failed, every user silently got a made-up route, and
 * nothing anywhere surfaced it. Failures are now visible to the user (#190);
 * this makes them visible to us too, with enough context to tell the kinds
 * apart:
 *
 * - **#141-type** (the service rejects or drops everything): `offline` with
 *   the device online, or `server_error` with an HTTP status and no Valhalla
 *   code.
 * - **#168-type** (a request the service rejects on its merits, such as threat
 *   polygons over its limit): a Valhalla `error_code` and message.
 * - **Expected** cases (`out_of_coverage`, an `offline` device) are reported
 *   too, tagged, so their rate is visible rather than assumed.
 *
 * Nothing about where the user is or is going is sent. The error carries no
 * coordinates, and captureError's redaction is a backstop.
 */

import { captureError } from "@/services/CrashReporting";
import { useConnectivityStore } from "@/stores/useConnectivityStore";

import type { RouteUnavailableError } from "./RouteUnavailable";

/** Valhalla's error text is cut to this length before it is reported. */
const MAX_MESSAGE_LENGTH = 120;

/**
 * Report a routing failure. A no-op unless the user opted in to crash reports
 * and a DSN is configured (initCrashReporting decides that).
 *
 * @param error - The failure calculateRoute is about to throw.
 * @param approach - Which routing path failed: in-process native, or HTTP.
 */
export function reportRoutingFailure(
  error: RouteUnavailableError,
  approach: "native" | "http",
): void {
  const { httpStatus, valhallaCode, valhallaMessage } = error.diagnostics;
  captureError(error, {
    routing: {
      reason: error.reason,
      approach,
      deviceOnline: useConnectivityStore.getState().isOnline,
      httpStatus: httpStatus ?? null,
      valhallaCode: valhallaCode ?? null,
      valhallaMessage: valhallaMessage?.slice(0, MAX_MESSAGE_LENGTH) ?? null,
    },
  });
}
