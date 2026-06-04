/**
 * SQLite queries for user preferences and emergency contacts.
 */

import { getDatabase } from "../database";

// --- Preferences ---

/**
 * Returns a stored preference value by key, or null if unset.
 */
export async function getPreference(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM preferences WHERE key = ?",
    key,
  );
  return row?.value ?? null;
}

/**
 * Inserts or updates a preference key/value pair.
 */
export async function setPreference(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)",
    key,
    value,
  );
}

// --- Emergency Contacts ---

/**
 * Persisted emergency contact record.
 */
export interface EmergencyContactRow {
  id: string;
  name: string;
  phone: string;
  sortOrder: number;
}

/**
 * Returns all emergency contacts ordered by sort position.
 */
export async function getEmergencyContacts(): Promise<EmergencyContactRow[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    phone: string;
    sort_order: number;
  }>("SELECT * FROM emergency_contacts ORDER BY sort_order");

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    sortOrder: r.sort_order,
  }));
}

/**
 * Inserts or replaces an emergency contact.
 */
export async function upsertEmergencyContact(
  contact: EmergencyContactRow,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO emergency_contacts (id, name, phone, sort_order)
     VALUES (?, ?, ?, ?)`,
    contact.id,
    contact.name,
    contact.phone,
    contact.sortOrder,
  );
}

/**
 * Removes an emergency contact by id.
 */
export async function deleteEmergencyContact(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM emergency_contacts WHERE id = ?", id);
}

// --- Recent Destinations ---

/**
 * Persisted recently-used destination record.
 */
export interface RecentDestinationRow {
  id: string;
  label: string | null;
  lat: number;
  lng: number;
  usedAt: number;
}

/**
 * Returns recent destinations ordered by most recent use.
 */
export async function getRecentDestinations(
  limit = 10,
): Promise<RecentDestinationRow[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    label: string | null;
    lat: number;
    lng: number;
    used_at: number;
  }>("SELECT * FROM recent_destinations ORDER BY used_at DESC LIMIT ?", limit);

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    lat: r.lat,
    lng: r.lng,
    usedAt: r.used_at,
  }));
}

/**
 * Inserts or replaces a recent destination.
 */
export async function addRecentDestination(
  dest: RecentDestinationRow,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO recent_destinations (id, label, lat, lng, used_at)
     VALUES (?, ?, ?, ?, ?)`,
    dest.id,
    dest.label,
    dest.lat,
    dest.lng,
    dest.usedAt,
  );
}
