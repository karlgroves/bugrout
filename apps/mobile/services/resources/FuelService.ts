/**
 * Fuel stations from OpenStreetMap (#200).
 *
 * The fuel layer used to come only from NREL's Alternative Fuel Stations API,
 * which has no gasoline or diesel stations at all, behind an API key no build
 * sets — so it never showed a gas station. OpenStreetMap's `amenity=fuel` is
 * national, free and needs no key. Stations reach the device two ways, read by
 * the same mapping: in the region package, so the layer works with no network
 * from the moment a region is downloaded; and from Overpass, which refreshes
 * them when online. Both are cached in SQLite.
 */

import {
  deleteResourcesByType,
  getResourcesByRegion,
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

/**
 * A region package's fuel file, as `data-pipeline/osm/extract-fuel.sh` writes
 * it: Overpass-shaped elements, plus the date of the OSM data they came from.
 */
interface FuelPackage {
  version: 1;
  osmTimestamp: string | null;
  elements: OverpassElement[];
}

/**
 * Load a region package's fuel stations into the cache, replacing its OSM
 * stations (NREL's are left alone). Each station is dated by the OSM data it
 * came from, so the map's "as of" is honest and an online refresh replaces it
 * once it is a day old.
 *
 * @param text - The fuel file, already checked against the manifest's SHA-256.
 * @param regionId - The region they are stored under.
 * @param builtAt - When the package was built: the date used when the file
 *   doesn't say when its OSM data is from.
 * @returns How many stations were loaded, or null when the cache already holds
 *   OSM stations at least as recent, which are kept: a re-download must not
 *   swap fresher online data for an older package.
 * @throws When the file isn't a fuel package this app can read.
 */
export async function loadPackagedFuelStations(
  text: string,
  regionId: string,
  builtAt: number,
): Promise<number | null> {
  const pkg = parseFuelPackage(text);
  const dataDate =
    pkg.osmTimestamp === null ? Number.NaN : Date.parse(pkg.osmTimestamp);
  const fetchedAt = Number.isFinite(dataDate) ? dataDate : builtAt;

  const cached = await getResourcesByRegion(regionId, "fuel");
  const newestCached = Math.max(
    -Infinity,
    ...cached.filter((r) => r.source === "osm").map((r) => r.fetchedAt),
  );
  if (newestCached >= fetchedAt) return null;

  const stations = pkg.elements.flatMap((el) => {
    const station = toStation(el, fetchedAt, regionId);
    return station ? [station] : [];
  });
  await deleteResourcesByType(regionId, "fuel", "osm");
  if (stations.length > 0) await upsertResourcePoints(stations);
  return stations.length;
}

/**
 * Parse a fuel file.
 *
 * @throws When it is not JSON, or not a version this app understands.
 */
function parseFuelPackage(text: string): FuelPackage {
  const data = JSON.parse(text) as Partial<FuelPackage> | null;
  if (data?.version !== 1 || !Array.isArray(data.elements)) {
    throw new Error("Not a fuel package this app can read");
  }
  return {
    version: 1,
    osmTimestamp:
      typeof data.osmTimestamp === "string" ? data.osmTimestamp : null,
    elements: data.elements,
  };
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
