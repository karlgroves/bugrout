export interface LatLng {
  lat: number;
  lng: number;
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export type GeoJSONPoint = {
  type: "Point";
  coordinates: [number, number]; // [lng, lat]
};

export type GeoJSONPolygon = {
  type: "Polygon";
  coordinates: number[][][];
};

export type GeoJSONMultiPolygon = {
  type: "MultiPolygon";
  coordinates: number[][][][];
};

export type GeoJSONGeometry = GeoJSONPoint | GeoJSONPolygon | GeoJSONMultiPolygon;

export interface GeoJSONFeature<G extends GeoJSONGeometry = GeoJSONGeometry> {
  type: "Feature";
  geometry: G;
  properties: Record<string, unknown>;
}

export interface GeoJSONFeatureCollection<
  G extends GeoJSONGeometry = GeoJSONGeometry,
> {
  type: "FeatureCollection";
  features: GeoJSONFeature<G>[];
}
