/**
 * NREL Alternative Fuel Stations API Service
 *
 * Fetches fuel station locations from the National Renewable Energy Laboratory.
 * Cached per region in SQLite for offline access.
 *
 * API docs: https://developer.nrel.gov/docs/transportation/alt-fuel-stations-v1/
 */

import type { ResourcePoint } from "@bugrout/shared";
import { upsertResourcePoints } from "@/db/queries/resources";

const NREL_BASE = "https://developer.nrel.gov/api/alt-fuel-stations/v1.json";
const CACHE_TTL_MS = 86400000; // 24 hours

interface NRELStation {
  id: number;
  station_name: string;
  street_address: string;
  city: string;
  state: string;
  zip: string;
  latitude: number;
  longitude: number;
  fuel_type_code: string;
  status_code: string;
  access_code: string;
  ev_connector_types: string[] | null;
  ev_network: string | null;
}

interface NRELResponse {
  total_results: number;
  station_locator_url: string;
  fuel_stations: NRELStation[];
}

/**
 * Fetch fuel stations from NREL API for a given state.
 * Filters to gasoline-compatible fuels and open stations.
 */
export async function fetchFuelStations(
  stateCode: string,
  apiKey: string,
  regionId: string,
): Promise<ResourcePoint[]> {
  const params = new URLSearchParams({
    api_key: apiKey,
    state: stateCode,
    fuel_type: "ELEC,E85,LPG,BD,CNG", // All common fuel types
    status: "E", // Open/available stations only
    access: "public",
    limit: "10000",
  });

  const resp = await fetch(`${NREL_BASE}?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    throw new Error(`NREL API error: ${resp.status}`);
  }

  const data = (await resp.json()) as NRELResponse;

  const resources: ResourcePoint[] = data.fuel_stations
    .filter((s) => s.latitude && s.longitude)
    .map((s) => ({
      id: `nrel-${s.id}`,
      type: "fuel" as const,
      name: s.station_name,
      lat: s.latitude,
      lng: s.longitude,
      address: [s.street_address, s.city, s.state, s.zip]
        .filter(Boolean)
        .join(", "),
      metadata: {
        fuelType: s.fuel_type_code,
        accessCode: s.access_code,
        evConnectors: s.ev_connector_types,
        evNetwork: s.ev_network,
      },
      source: "nrel" as const,
      fetchedAt: Date.now(),
      regionId,
    }));

  // Cache in SQLite
  await upsertResourcePoints(resources);

  return resources;
}

export { CACHE_TTL_MS };
