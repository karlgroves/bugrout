/**
 * The callers following one running trip.
 *
 * A trip can be shown by more than one navigation screen at a time (a link to
 * the running trip pushes a second instance over the first). The trip must
 * outlive any one of them, so NavigationController counts its followers here
 * and ends the trip only when the last one lets go (#345).
 *
 * Events go to the newest follower only — the screen on top — so an arrival or
 * a lost-GPS alert is shown once. When that follower lets go, the one before it
 * receives them again.
 */

/** What letting go of a trip changed. */
type Released =
  /** The handler was not following the trip; nothing changed. */
  | "absent"
  /** It was the last follower: nobody is following the trip any more. */
  | "last"
  /** It was receiving events; the follower before it receives them now. */
  | "receiver"
  /** It was not receiving events; the receiver is unchanged. */
  | "waiting";

/** The followers of one trip, oldest first. */
export interface TripFollowers<E> {
  /** Follow the trip with `handler` and make it the one receiving events. */
  follow: (handler: (event: E) => void) => void;
  /** Stop following with `handler`. */
  release: (handler: (event: E) => void) => Released;
  /** Forget every follower: the trip has ended. */
  clear: () => void;
  /** Send an event to the follower receiving them, if there is one. */
  emit: (event: E) => void;
}

/** Create an empty set of followers. */
export function createTripFollowers<E>(): TripFollowers<E> {
  let handlers: ((event: E) => void)[] = [];

  return {
    follow(handler) {
      handlers = handlers.filter((other) => other !== handler);
      handlers.push(handler);
    },
    release(handler) {
      if (!handlers.includes(handler)) return "absent";
      const wasReceiving = handlers.at(-1) === handler;
      handlers = handlers.filter((other) => other !== handler);
      if (handlers.length === 0) return "last";
      return wasReceiving ? "receiver" : "waiting";
    },
    clear() {
      handlers = [];
    },
    emit(event) {
      handlers.at(-1)?.(event);
    },
  };
}
