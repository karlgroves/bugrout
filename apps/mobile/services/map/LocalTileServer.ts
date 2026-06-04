/**
 * Local Tile Server
 *
 * When MapLibre Native doesn't support the pmtiles:// protocol directly,
 * this module provides a lightweight HTTP server that reads from the local
 * PMTiles file and serves vector tiles to MapLibre over localhost.
 *
 * The server runs on a random available port and serves tiles at:
 *   http://localhost:{port}/tiles/{z}/{x}/{y}.pbf
 *
 * This is Approach B for tile serving (alongside the direct pmtiles:// protocol).
 * The StyleBuilder checks which approach works and uses the appropriate URL.
 */

import { Platform, NativeModules } from "react-native";

/** Native module that serves PMTiles vector tiles over a localhost HTTP server. */
interface PMTilesServerModule {
  start(pmtilesPath: string): Promise<number>;
  stop(): Promise<void>;
}

/** Native MapLibre module exposing PMTiles protocol capability. */
interface MLNModuleNative {
  supportsPMTiles?: () => Promise<boolean>;
}

/** Subset of react-native NativeModules used by this module. */
interface TileNativeModules {
  PMTilesServer?: PMTilesServerModule;
  MLNModule?: MLNModuleNative;
}

const nativeModules = NativeModules as TileNativeModules;

let serverPort: number | null = null;
let serverRunning = false;

/**
 * Start a local tile server for a PMTiles file.
 * Returns the port number the server is listening on.
 *
 * On web, this is a no-op (tiles aren't available).
 * On native, this starts a background HTTP server via the native module.
 */
export async function startLocalTileServer(
  pmtilesPath: string,
): Promise<number | null> {
  if (Platform.OS === "web") return null;

  try {
    // The native module for serving tiles would be registered by the
    // Expo config plugin. It reads the PMTiles file directly and serves
    // individual tiles over HTTP.
    const TileServer = nativeModules.PMTilesServer;

    if (!TileServer) {
      console.warn("[BugRout] PMTilesServer native module not available");
      return null;
    }

    const port = await TileServer.start(pmtilesPath);
    serverPort = port;
    serverRunning = true;
    console.log(`[BugRout] Local tile server started on port ${port}`);
    return port;
  } catch (err) {
    console.warn("[BugRout] Failed to start local tile server:", err);
    return null;
  }
}

/**
 * Stop the local tile server.
 */
export async function stopLocalTileServer(): Promise<void> {
  if (!serverRunning) return;

  try {
    const TileServer = nativeModules.PMTilesServer;
    if (TileServer) {
      await TileServer.stop();
    }
  } catch {
    // No-op: best-effort shutdown; reset local state regardless below.
  }

  serverPort = null;
  serverRunning = false;
}

/**
 * Get the current tile server port, or null if not running.
 */
export function getTileServerPort(): number | null {
  return serverPort;
}

/**
 * Check if MapLibre natively supports pmtiles:// protocol.
 * This varies by MapLibre Native version and the React Native wrapper.
 */
export async function checkPMTilesProtocolSupport(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  try {
    // MapLibre Native >= 6.0 (iOS) and >= 11.0 (Android) support PMTiles
    // natively. Check if the protocol handler is registered.
    const MapLibre = nativeModules.MLNModule;

    if (MapLibre?.supportsPMTiles) {
      return await MapLibre.supportsPMTiles();
    }
  } catch {
    // Can't check — assume not supported
  }

  return false;
}

/**
 * Get the best tile source URL for a given PMTiles file.
 *
 * Tries in order:
 * 1. pmtiles:// protocol (if MapLibre supports it)
 * 2. localhost HTTP server (starts one if needed)
 * 3. null (no tiles available)
 */
export async function getTileSourceUrl(
  pmtilesPath: string,
): Promise<{ url: string; port?: number } | null> {
  // Try pmtiles:// first
  const supportsPMTiles = await checkPMTilesProtocolSupport();
  if (supportsPMTiles) {
    return { url: `pmtiles://${pmtilesPath}` };
  }

  // Fall back to local HTTP server
  const port = await startLocalTileServer(pmtilesPath);
  if (port) {
    return {
      url: `http://localhost:${port}/tiles/{z}/{x}/{y}.pbf`,
      port,
    };
  }

  return null;
}
