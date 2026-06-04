/* eslint-disable max-lines -- static region definition data; tracked in docs/tech-debt.md (move region data to JSON asset) */
/**
 * Downloadable Region Definitions
 *
 * Each region corresponds to a state-level offline tile package
 * containing PMTiles (rendering), Valhalla tiles (routing),
 * pre-cached resource points, and flood zone data.
 *
 * Populated from the tile server manifest at runtime; this list is
 * the offline/fallback display set.
 */

import type { Region } from "@bugrout/shared";

/** Map region IDs to USPS state codes for API queries */
export /**
 *
 */
const REGION_STATE_CODES: Record<string, string> = {
  al: "AL",
  ak: "AK",
  az: "AZ",
  ar: "AR",
  ca: "CA",
  co: "CO",
  ct: "CT",
  de: "DE",
  dc: "DC",
  fl: "FL",
  ga: "GA",
  hi: "HI",
  id: "ID",
  il: "IL",
  in: "IN",
  ia: "IA",
  ks: "KS",
  ky: "KY",
  la: "LA",
  me: "ME",
  md: "MD",
  ma: "MA",
  mi: "MI",
  mn: "MN",
  ms: "MS",
  mo: "MO",
  mt: "MT",
  ne: "NE",
  nv: "NV",
  nh: "NH",
  nj: "NJ",
  nm: "NM",
  ny: "NY",
  nc: "NC",
  nd: "ND",
  oh: "OH",
  ok: "OK",
  or: "OR",
  pa: "PA",
  ri: "RI",
  sc: "SC",
  sd: "SD",
  tn: "TN",
  tx: "TX",
  ut: "UT",
  vt: "VT",
  va: "VA",
  wa: "WA",
  wv: "WV",
  wi: "WI",
  wy: "WY",
};

/**
 *
 */
interface RegionSeed {
  id: string;
  name: string;
  bbox: { west: number; south: number; east: number; north: number };
  pmtilesMB: number;
  valhallaMB: number;
}

const MB = 1_048_576;

const SEEDS: RegionSeed[] = [
  {
    id: "al",
    name: "Alabama",
    bbox: { west: -88.47, south: 30.14, east: -84.89, north: 35.01 },
    pmtilesMB: 340,
    valhallaMB: 170,
  },
  {
    id: "ak",
    name: "Alaska",
    bbox: { west: -179.15, south: 51.21, east: -129.98, north: 71.44 },
    pmtilesMB: 520,
    valhallaMB: 260,
  },
  {
    id: "az",
    name: "Arizona",
    bbox: { west: -114.82, south: 31.33, east: -109.05, north: 37.0 },
    pmtilesMB: 400,
    valhallaMB: 200,
  },
  {
    id: "ar",
    name: "Arkansas",
    bbox: { west: -94.62, south: 33.0, east: -89.64, north: 36.5 },
    pmtilesMB: 300,
    valhallaMB: 150,
  },
  {
    id: "ca",
    name: "California",
    bbox: { west: -124.48, south: 32.53, east: -114.13, north: 42.01 },
    pmtilesMB: 850,
    valhallaMB: 400,
  },
  {
    id: "co",
    name: "Colorado",
    bbox: { west: -109.06, south: 36.99, east: -102.04, north: 41.0 },
    pmtilesMB: 450,
    valhallaMB: 220,
  },
  {
    id: "ct",
    name: "Connecticut",
    bbox: { west: -73.73, south: 40.98, east: -71.78, north: 42.05 },
    pmtilesMB: 180,
    valhallaMB: 90,
  },
  {
    id: "de",
    name: "Delaware",
    bbox: { west: -75.79, south: 38.45, east: -75.05, north: 39.84 },
    pmtilesMB: 80,
    valhallaMB: 40,
  },
  {
    id: "dc",
    name: "District of Columbia",
    bbox: { west: -77.12, south: 38.79, east: -76.91, north: 38.99 },
    pmtilesMB: 30,
    valhallaMB: 15,
  },
  {
    id: "fl",
    name: "Florida",
    bbox: { west: -87.64, south: 24.4, east: -79.97, north: 31.0 },
    pmtilesMB: 600,
    valhallaMB: 280,
  },
  {
    id: "ga",
    name: "Georgia",
    bbox: { west: -85.61, south: 30.36, east: -80.84, north: 35.0 },
    pmtilesMB: 420,
    valhallaMB: 210,
  },
  {
    id: "hi",
    name: "Hawaii",
    bbox: { west: -160.25, south: 18.91, east: -154.81, north: 22.24 },
    pmtilesMB: 150,
    valhallaMB: 75,
  },
  {
    id: "id",
    name: "Idaho",
    bbox: { west: -117.24, south: 41.99, east: -111.04, north: 49.0 },
    pmtilesMB: 280,
    valhallaMB: 140,
  },
  {
    id: "il",
    name: "Illinois",
    bbox: { west: -91.51, south: 36.97, east: -87.5, north: 42.51 },
    pmtilesMB: 500,
    valhallaMB: 240,
  },
  {
    id: "in",
    name: "Indiana",
    bbox: { west: -88.1, south: 37.77, east: -84.78, north: 41.76 },
    pmtilesMB: 340,
    valhallaMB: 170,
  },
  {
    id: "ia",
    name: "Iowa",
    bbox: { west: -96.64, south: 40.38, east: -90.14, north: 43.5 },
    pmtilesMB: 290,
    valhallaMB: 145,
  },
  {
    id: "ks",
    name: "Kansas",
    bbox: { west: -102.05, south: 36.99, east: -94.59, north: 40.0 },
    pmtilesMB: 310,
    valhallaMB: 155,
  },
  {
    id: "ky",
    name: "Kentucky",
    bbox: { west: -89.57, south: 36.5, east: -81.96, north: 39.15 },
    pmtilesMB: 320,
    valhallaMB: 160,
  },
  {
    id: "la",
    name: "Louisiana",
    bbox: { west: -94.04, south: 28.93, east: -88.82, north: 33.02 },
    pmtilesMB: 350,
    valhallaMB: 180,
  },
  {
    id: "me",
    name: "Maine",
    bbox: { west: -71.08, south: 43.06, east: -66.95, north: 47.46 },
    pmtilesMB: 220,
    valhallaMB: 110,
  },
  {
    id: "md",
    name: "Maryland",
    bbox: { west: -79.49, south: 37.89, east: -75.05, north: 39.72 },
    pmtilesMB: 240,
    valhallaMB: 120,
  },
  {
    id: "ma",
    name: "Massachusetts",
    bbox: { west: -73.51, south: 41.24, east: -69.93, north: 42.89 },
    pmtilesMB: 280,
    valhallaMB: 140,
  },
  {
    id: "mi",
    name: "Michigan",
    bbox: { west: -90.42, south: 41.7, east: -82.12, north: 48.31 },
    pmtilesMB: 520,
    valhallaMB: 260,
  },
  {
    id: "mn",
    name: "Minnesota",
    bbox: { west: -97.24, south: 43.5, east: -89.49, north: 49.38 },
    pmtilesMB: 400,
    valhallaMB: 200,
  },
  {
    id: "ms",
    name: "Mississippi",
    bbox: { west: -91.66, south: 30.17, east: -88.1, north: 34.99 },
    pmtilesMB: 260,
    valhallaMB: 130,
  },
  {
    id: "mo",
    name: "Missouri",
    bbox: { west: -95.77, south: 35.99, east: -89.1, north: 40.61 },
    pmtilesMB: 380,
    valhallaMB: 190,
  },
  {
    id: "mt",
    name: "Montana",
    bbox: { west: -116.05, south: 44.36, east: -104.04, north: 49.0 },
    pmtilesMB: 330,
    valhallaMB: 165,
  },
  {
    id: "ne",
    name: "Nebraska",
    bbox: { west: -104.05, south: 39.99, east: -95.31, north: 43.0 },
    pmtilesMB: 260,
    valhallaMB: 130,
  },
  {
    id: "nv",
    name: "Nevada",
    bbox: { west: -120.0, south: 35.0, east: -114.04, north: 42.0 },
    pmtilesMB: 240,
    valhallaMB: 120,
  },
  {
    id: "nh",
    name: "New Hampshire",
    bbox: { west: -72.56, south: 42.7, east: -70.61, north: 45.31 },
    pmtilesMB: 150,
    valhallaMB: 75,
  },
  {
    id: "nj",
    name: "New Jersey",
    bbox: { west: -75.56, south: 38.93, east: -73.89, north: 41.36 },
    pmtilesMB: 280,
    valhallaMB: 140,
  },
  {
    id: "nm",
    name: "New Mexico",
    bbox: { west: -109.05, south: 31.33, east: -103.0, north: 37.0 },
    pmtilesMB: 280,
    valhallaMB: 140,
  },
  {
    id: "ny",
    name: "New York",
    bbox: { west: -79.76, south: 40.5, east: -71.86, north: 45.02 },
    pmtilesMB: 620,
    valhallaMB: 300,
  },
  {
    id: "nc",
    name: "North Carolina",
    bbox: { west: -84.32, south: 33.84, east: -75.46, north: 36.59 },
    pmtilesMB: 500,
    valhallaMB: 240,
  },
  {
    id: "nd",
    name: "North Dakota",
    bbox: { west: -104.05, south: 45.93, east: -96.55, north: 49.0 },
    pmtilesMB: 200,
    valhallaMB: 100,
  },
  {
    id: "oh",
    name: "Ohio",
    bbox: { west: -84.82, south: 38.4, east: -80.52, north: 41.98 },
    pmtilesMB: 420,
    valhallaMB: 210,
  },
  {
    id: "ok",
    name: "Oklahoma",
    bbox: { west: -103.0, south: 33.62, east: -94.43, north: 37.0 },
    pmtilesMB: 320,
    valhallaMB: 160,
  },
  {
    id: "or",
    name: "Oregon",
    bbox: { west: -124.57, south: 41.99, east: -116.46, north: 46.29 },
    pmtilesMB: 380,
    valhallaMB: 190,
  },
  {
    id: "pa",
    name: "Pennsylvania",
    bbox: { west: -80.52, south: 39.72, east: -74.69, north: 42.27 },
    pmtilesMB: 520,
    valhallaMB: 260,
  },
  {
    id: "ri",
    name: "Rhode Island",
    bbox: { west: -71.91, south: 41.15, east: -71.12, north: 42.02 },
    pmtilesMB: 80,
    valhallaMB: 40,
  },
  {
    id: "sc",
    name: "South Carolina",
    bbox: { west: -83.35, south: 32.03, east: -78.54, north: 35.22 },
    pmtilesMB: 300,
    valhallaMB: 150,
  },
  {
    id: "sd",
    name: "South Dakota",
    bbox: { west: -104.06, south: 42.48, east: -96.44, north: 45.95 },
    pmtilesMB: 210,
    valhallaMB: 105,
  },
  {
    id: "tn",
    name: "Tennessee",
    bbox: { west: -90.31, south: 34.98, east: -81.65, north: 36.68 },
    pmtilesMB: 380,
    valhallaMB: 190,
  },
  {
    id: "tx",
    name: "Texas",
    bbox: { west: -106.65, south: 25.84, east: -93.51, north: 36.5 },
    pmtilesMB: 1100,
    valhallaMB: 500,
  },
  {
    id: "ut",
    name: "Utah",
    bbox: { west: -114.05, south: 36.99, east: -109.04, north: 42.0 },
    pmtilesMB: 260,
    valhallaMB: 130,
  },
  {
    id: "vt",
    name: "Vermont",
    bbox: { west: -73.43, south: 42.73, east: -71.46, north: 45.02 },
    pmtilesMB: 140,
    valhallaMB: 70,
  },
  {
    id: "va",
    name: "Virginia",
    bbox: { west: -83.68, south: 36.54, east: -75.24, north: 39.47 },
    pmtilesMB: 420,
    valhallaMB: 210,
  },
  {
    id: "wa",
    name: "Washington",
    bbox: { west: -124.85, south: 45.54, east: -116.92, north: 49.0 },
    pmtilesMB: 420,
    valhallaMB: 210,
  },
  {
    id: "wv",
    name: "West Virginia",
    bbox: { west: -82.64, south: 37.2, east: -77.72, north: 40.64 },
    pmtilesMB: 240,
    valhallaMB: 120,
  },
  {
    id: "wi",
    name: "Wisconsin",
    bbox: { west: -92.89, south: 42.49, east: -86.76, north: 47.08 },
    pmtilesMB: 380,
    valhallaMB: 190,
  },
  {
    id: "wy",
    name: "Wyoming",
    bbox: { west: -111.06, south: 40.99, east: -104.05, north: 45.01 },
    pmtilesMB: 200,
    valhallaMB: 100,
  },
];

export /**
 *
 */
const DEFAULT_REGIONS: Region[] = SEEDS.map((s) => ({
  id: s.id,
  name: s.name,
  bbox: s.bbox,
  pmtilesSize: s.pmtilesMB * MB,
  valhallaSize: s.valhallaMB * MB,
  version: "2026.04.01",
  updatedAt: Date.now(),
}));

/** Get the USPS state code for a region ID. */
export function getStateCode(regionId: string): string | null {
  return REGION_STATE_CODES[regionId] ?? null;
}

/** Find the region whose bounding box contains the given point. */
export function findRegionForPoint(lat: number, lng: number): Region | null {
  return (
    DEFAULT_REGIONS.find(
      (r) =>
        lat >= r.bbox.south &&
        lat <= r.bbox.north &&
        lng >= r.bbox.west &&
        lng <= r.bbox.east,
    ) ?? null
  );
}
