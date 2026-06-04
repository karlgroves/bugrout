/**
 * A geographic coordinate as latitude/longitude in decimal degrees.
 */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * An axis-aligned geographic bounding box (west/south/east/north).
 */
export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * A GeoJSON Point geometry with [lng, lat] coordinates.
 */
export interface GeoJSONPoint {
  type: "Point";
  coordinates: [number, number]; // [lng, lat]
}

/**
 * A GeoJSON Polygon geometry (array of linear-ring coordinate arrays).
 */
export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

/**
 * A GeoJSON MultiPolygon geometry (array of polygons).
 */
export interface GeoJSONMultiPolygon {
  type: "MultiPolygon";
  coordinates: number[][][][];
}

/**
 * Union of the GeoJSON geometry types used across the app.
 */
export type GeoJSONGeometry = GeoJSONPoint | GeoJSONPolygon | GeoJSONMultiPolygon;

/**
 * A GeoJSON Feature pairing a geometry with arbitrary properties.
 */
export interface GeoJSONFeature<G extends GeoJSONGeometry = GeoJSONGeometry> {
  type: "Feature";
  geometry: G;
  properties: Record<string, unknown>;
}

/**
 * A GeoJSON FeatureCollection of features sharing a geometry type.
 */
export interface GeoJSONFeatureCollection<
  G extends GeoJSONGeometry = GeoJSONGeometry,
> {
  type: "FeatureCollection";
  features: GeoJSONFeature<G>[];
}
