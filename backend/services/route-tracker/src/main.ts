/**
 * Route Tracker entry point.
 *
 * Kept separate from `index.ts` so that importing the request handler — which
 * the security regression tests do — has no side effects. Everything that
 * binds a port, schedules a timer, or opens a Redis connection happens here.
 */

import { start } from "./index";

start();
