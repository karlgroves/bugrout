/**
 * SQLite Schema Definitions
 *
 * All local data is stored in SQLite via expo-sqlite.
 * This is the single source of truth for offline data persistence.
 */

export const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS downloaded_regions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    bbox TEXT NOT NULL,
    pmtiles_path TEXT NOT NULL,
    valhalla_tiles_path TEXT NOT NULL,
    downloaded_at INTEGER NOT NULL,
    size_bytes INTEGER NOT NULL,
    version TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recent_destinations (
    id TEXT PRIMARY KEY,
    label TEXT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    used_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS threat_zones (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    geometry TEXT NOT NULL,
    headline TEXT NOT NULL,
    description TEXT,
    source TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    expires_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS resource_points (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    address TEXT,
    metadata TEXT,
    source TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    region_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    destination_lat REAL NOT NULL,
    destination_lng REAL NOT NULL,
    avoid_zones TEXT,
    resource_stops TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS emergency_contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS download_progress (
    region_id TEXT PRIMARY KEY,
    bytes_downloaded INTEGER NOT NULL DEFAULT 0,
    total_bytes INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
  );
`;
