/**
 * Fuel stations from OpenStreetMap (#200).
 *
 * The fuel layer used to come only from NREL's Alternative Fuel Stations API,
 * which has no gasoline or diesel stations at all, behind an API key no build
 * sets — so it never showed a gas station. OpenStreetMap's `amenity=fuel` is
 * national, free and needs no key. Fetched stations are cached in SQLite, so
 * the layer works offline once a region has been refreshed; shipping them in
 * the region package, so they work with no network at all, is the other half
 * of #200.
 */

import {
  deleteResourcesByType,
  upsertResourcePoints,
} from "@/db/queries/resources";
import { elementPosition, overpassQuery } from "@/services/osm/overpass";

import type { OverpassElement } from "@/services/osm/overpass";
import type { BBox, ResourcePoint } from "@bugrout/shared";

const CACHE_TTL_MS = 86_400_000; // 24 hours: stations rarely change

/**
 * Fetch a region's fuel stations and replace its cached OSM ones (NREL's are
 * left alone).
 *
 * @param bbox - The region's bounds.
 * @param regionId - The region they are stored under.
 * @returns The stations, possibly none.
 * @throws When Overpass can't answer: the caller must say so, never show an
 *   empty layer as "no fuel nearby".
 */
export async function fetchOsmFuelStations(
  bbox: BBox,
  regionId: string,
): Promise<ResourcePoint[]> {
  const area = `${String(bbox.south)},${String(bbox.west)},${String(bbox.north)},${String(bbox.east)}`;
  const elements = await overpassQuery(
    `[out:json][timeout:90];nwr["amenity"="fuel"](${area});out center tags;`,
    120_000,
  );
  const fetchedAt = Date.now();
  const stations = elements.flatMap((el) => {
    const station = toStation(el, fetchedAt, regionId);
    return station ? [station] : [];
  });
  await deleteResourcesByType(regionId, "fuel", "osm");
  if (stations.length > 0) await upsertResourcePoints(stations);
  return stations;
}

/** One OSM fuel station as a resource point, or null without a position. */
function toStation(
  el: OverpassElement,
  fetchedAt: number,
  regionId: string,
): ResourcePoint | null {
  const position = elementPosition(el);
  if (!position) return null;
  const tags = el.tags ?? {};
  const brand = tags.brand ?? tags.operator ?? null;
  return {
    id: `osm-fuel-${el.type}-${String(el.id)}`,
    type: "fuel",
    name: tags.name ?? brand ?? "Fuel station",
    lat: position.lat,
    lng: position.lng,
    address: streetAddress(tags),
    metadata: {
      brand,
      diesel: tags["fuel:diesel"] === "yes",
      openingHours: tags.opening_hours ?? null,
    },
    source: "osm",
    fetchedAt,
    regionId,
  };
}

/** "1200 Main St, Towson", or null when OSM has no street. */
function streetAddress(tags: Record<string, string>): string | null {
  const street = [tags["addr:housenumber"], tags["addr:street"]]
    .filter(Boolean)
    .join(" ");
  if (!street) return null;
  return [street, tags["addr:city"]].filter(Boolean).join(", ");
}

export { CACHE_TTL_MS };
