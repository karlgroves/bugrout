/**
 * The in-process native Valhalla engine (Approach A), when this binary has it.
 */

import { NativeModules } from "react-native";

/** The native module's surface: load tiles once, then route in-process. */
export interface NativeValhalla {
  init: (tileDir: string) => Promise<void>;
  route: (request: string) => Promise<string>;
}

/**
 * Attempt to load the native Valhalla module (Approach A).
 *
 * Registered as "ValhallaEngine" by native-modules/valhalla/config-plugin.js
 * during prebuild. Exposes init(tileDir) and route(requestJson). Returns null
 * when the module isn't compiled into this binary — Expo Go, web preview, or a
 * build without the config plugin enabled — so callers fall back to HTTP.
 *
 * @returns The module, or null when it is absent or lacks init/route.
 */
export function loadNativeModule(): NativeValhalla | null {
  try {
    const mod = (NativeModules as { ValhallaEngine?: unknown }).ValhallaEngine;
    if (
      mod &&
      typeof (mod as Partial<NativeValhalla>).init === "function" &&
      typeof (mod as Partial<NativeValhalla>).route === "function"
    ) {
      return mod as NativeValhalla;
    }
    return null;
  } catch {
    return null;
  }
}
