/**
 * Bounds on what an upstream threat feed may hand the app (#305).
 *
 * Every feature a feed returns is written to SQLite and later walked on the JS
 * thread while a route request is built, so a feed's size is a cost the Bug Out
 * flow pays. These caps sit far above any real feed (a state's active NWS
 * alerts, the active fire perimeters inside a region) and reject the rest: an
 * oversized response is treated as a failed fetch, never cut down to an
 * arbitrary subset that could leave out the threat nearest the user.
 */

/** Largest threat-feed response body accepted, in characters (~bytes). */
const MAX_FEED_BODY_CHARS = 32 * 1024 * 1024;

export /** Most features accepted from one threat-feed response. */
const MAX_FEED_FEATURES = 2000;

export /** Longest threat headline kept, in characters. */
const MAX_HEADLINE_CHARS = 300;

/**
 * Read a response body as JSON, refusing one larger than `maxChars`.
 *
 * A declared `content-length` over the limit is refused before the body is
 * read. Otherwise the body is buffered by `resp.text()` first (React Native's
 * fetch has no streaming body), so the actual-length check bounds what is
 * parsed and stored, not what is downloaded.
 *
 * @param resp - The fetch response.
 * @param maxChars - The largest body accepted.
 * @returns The parsed body.
 * @throws When the declared or actual body is over the limit, or not JSON.
 */
export async function readJsonBounded<T>(
  resp: Response,
  maxChars: number = MAX_FEED_BODY_CHARS,
): Promise<T> {
  const declared = Number(resp.headers.get("content-length") ?? "0");
  if (declared > maxChars) {
    throw new Error(`Response too large: ${String(declared)} bytes`);
  }
  const text = await resp.text();
  if (text.length > maxChars) {
    throw new Error(`Response too large: ${String(text.length)} characters`);
  }
  return JSON.parse(text) as T;
}

/**
 * Refuse a feature list longer than `MAX_FEED_FEATURES`.
 *
 * @param features - A feed's features.
 * @param feed - The feed's name, for the error.
 * @returns The same list.
 * @throws When there are more features than the cap.
 */
export function boundedFeatures<T>(features: T[], feed: string): T[] {
  if (features.length > MAX_FEED_FEATURES) {
    throw new Error(
      `${feed}: ${String(features.length)} features exceeds ${String(MAX_FEED_FEATURES)}`,
    );
  }
  return features;
}

/**
 * Shorten text to at most `max` characters, ending with an ellipsis when cut.
 *
 * @param text - The text.
 * @param max - The longest result.
 * @returns The text, cut if needed.
 */
export function capText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
