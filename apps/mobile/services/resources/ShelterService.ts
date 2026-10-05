/**
 * Shelter Service (#201).
 *
 * Open shelters come from FEMA's ESF6-SS (Emergency Support Function #6
 * Shelter System, formerly the National Shelter System), published as a public
 * ArcGIS map service. FEMA syncs it each morning from the American Red Cross
 * shelter database, then checks for updates every 20 minutes, so it carries
 * the Red Cross shelters the app used to fetch directly; the Red Cross JSON
 * endpoint has returned HTTP 403 since at least 2026-09-30, and every failure
 * used to become an empty, silent layer.
 *
 * Source: https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer/0
 * Terms: public, no key or registration. The service's copyright text is
 * "FEMA ESF6-SS"; as a work of the US federal government it is not subject to
 * copyright (17 U.S.C. § 105), and the service states no licence or
 * attribution requirement. Contact: FEMA-GISMAPS@fema.gov. Requests carry the
 * region's bounding box, as the privacy policy says. Responses take several
 * seconds, hence the long timeout.
 *
 * Shelters open and close during an event, so a fetch replaces the region's
 * cached shelters, and the time it ran is what the map shows as "as of".
 */

import {
  deleteResourcesByType,
  upsertResourcePoints,
} from "@/db/queries/resources";
import { timeoutSignal } from "@/utils/abort";

import type { BBox, ResourcePoint } from "@bugrout/shared";

const CACHE_TTL_MS = 3600000; // 1 hour (shelters change during events)

/** FEMA's open-shelters layer. */
const FEMA_OPEN_SHELTERS =
  "https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer/0/query";

/** The service has been seen taking 10 s; allow it three times that. */
const REQUEST_TIMEOUT_MS = 30_000;

/** The fields read from each shelter. */
interface FemaShelterAttributes {
  shelter_id?: number | string | null;
  shelter_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  shelter_status?: string | null;
  evacuation_capacity?: number | null;
  total_population?: number | null;
}

/** An ArcGIS JSON query response, or its error form. */
interface FemaQueryResponse {
  features?: {
    attributes: FemaShelterAttributes;
    geometry?: { x: number; y: number } | null;
  }[];
  error?: { code: number; message: string };
}

/**
 * Fetch the shelters inside a region and replace its cached ones.
 *
 * @param bbox - The region's bounds.
 * @param regionId - The region they are stored under.
 * @returns The shelters, possibly none (no shelter is open).
 * @throws When the service can't be reached or answers with an error: the
 *   caller must say so, never show an empty layer as "none nearby".
 */
export async function fetchShelters(
  bbox: BBox,
  regionId: string,
): Promise<ResourcePoint[]> {
  const params = new URLSearchParams({
    where: "1=1",
    geometry: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields:
      "shelter_id,shelter_name,address,city,state,zip,shelter_status,evacuation_capacity,total_population",
    outSR: "4326",
    returnGeometry: "true",
    f: "json",
  });

  const resp = await fetch(`${FEMA_OPEN_SHELTERS}?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal: timeoutSignal(REQUEST_TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`FEMA shelters: HTTP ${String(resp.status)}`);
  }
  const data = (await resp.json()) as FemaQueryResponse;
  if (data.error || !data.features) {
    throw new Error(
      `FEMA shelters: ${data.error?.message ?? "no features in response"}`,
    );
  }

  const fetchedAt = Date.now();
  const shelters = data.features.flatMap(({ attributes: a, geometry }) =>
    geometry ? [toShelter(a, geometry, fetchedAt, regionId)] : [],
  );

  await deleteResourcesByType(regionId, "shelter");
  if (shelters.length > 0) await upsertResourcePoints(shelters);
  return shelters;
}

/** One FEMA shelter as a resource point. */
function toShelter(
  a: FemaShelterAttributes,
  geometry: { x: number; y: number },
  fetchedAt: number,
  regionId: string,
): ResourcePoint {
  return {
    id: `fema-${String(a.shelter_id ?? `${String(geometry.y)},${String(geometry.x)}`)}`,
    type: "shelter",
    name: a.shelter_name ?? "Shelter",
    lat: geometry.y,
    lng: geometry.x,
    address:
      [a.address, a.city, a.state, a.zip]
        .filter((part): part is string => Boolean(part))
        .join(", ") || null,
    metadata: {
      status: a.shelter_status ?? null,
      evacuationCapacity: a.evacuation_capacity ?? null,
      population: a.total_population ?? null,
      organization: "FEMA National Shelter System",
    },
    source: "fema",
    fetchedAt,
    regionId,
  };
}

export { CACHE_TTL_MS };
