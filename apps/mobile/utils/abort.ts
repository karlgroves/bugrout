/**
 * Abort-signal helpers that work on Hermes.
 *
 * React Native polyfills `AbortController`/`AbortSignal` with abort-controller@3,
 * which has no `AbortSignal.timeout()`. Calling it on device throws
 * `TypeError: AbortSignal.timeout is not a function` before the request is
 * made — while type-checking and Jest (Node) both accept it. ESLint bans the
 * static helpers in the app; use these instead.
 */

/**
 * An `AbortSignal` that aborts after `ms` milliseconds.
 *
 * Equivalent to `AbortSignal.timeout(ms)`, built only from the parts of the API
 * the React Native polyfill provides.
 *
 * @param ms - Milliseconds before the signal aborts.
 * @returns A signal that aborts once `ms` have elapsed.
 */
export function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => {
    controller.abort();
  }, ms);
  return controller.signal;
}
