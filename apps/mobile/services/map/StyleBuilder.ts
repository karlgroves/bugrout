/**
 * MapLibre Style Builder
 *
 * Generates MapLibre GL style JSON for offline PMTiles rendering.
 * Provides a dark theme matching BugRout's stress-state design.
 *
 * Two modes:
 * 1. Offline: references a local PMTiles file via pmtiles:// protocol
 * 2. Fallback: minimal dark background with no tile source
 */

interface StyleOptions {
  /** Local path to PMTiles file, or null for fallback mode */
  pmtilesPath: string | null;
  /** Port for local tile server (if using localhost approach) */
  tileServerPort?: number | undefined;
}

/**
 * Build a complete MapLibre style for BugRout's dark map theme.
 */
export function buildMapStyle(options: StyleOptions): object {
  const { pmtilesPath, tileServerPort } = options;

  if (!pmtilesPath) {
    return buildFallbackStyle();
  }

  // Determine tile source URL based on available method
  const tileSource = tileServerPort
    ? `http://localhost:${tileServerPort}/tiles/{z}/{x}/{y}.pbf`
    : `pmtiles://${pmtilesPath}`;

  return {
    version: 8,
    name: "BugRout Dark",
    sources: {
      openmaptiles: {
        type: "vector",
        url: tileSource,
        maxzoom: 14,
      },
    },
    glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
    layers: [
      // Background
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#0a0a0a" },
      },
      // Water
      {
        id: "water",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "water",
        paint: {
          "fill-color": "#0c1a2e",
          "fill-outline-color": "#1a3050",
        },
      },
      // Land use (parks, forests)
      {
        id: "landuse-park",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: ["in", "class", "park", "grass", "cemetery"],
        paint: { "fill-color": "#0d1a0d" },
      },
      // Buildings
      {
        id: "building",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 13,
        paint: {
          "fill-color": "#1a1a1a",
          "fill-outline-color": "#2a2a2a",
        },
      },
      // Roads — tunnels (dashed)
      {
        id: "road-tunnel",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["==", "brunnel", "tunnel"],
        paint: {
          "line-color": "#2a2a2a",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 16, 6],
          "line-dasharray": [2, 2],
        },
      },
      // Roads — minor
      {
        id: "road-minor",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: [
          "all",
          ["!has", "brunnel"],
          ["in", "class", "minor", "service", "track"],
        ],
        paint: {
          "line-color": "#252525",
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 16, 4],
        },
      },
      // Roads — tertiary / secondary
      {
        id: "road-secondary",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: [
          "all",
          ["!has", "brunnel"],
          ["in", "class", "tertiary", "secondary"],
        ],
        paint: {
          "line-color": "#333333",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 16, 8],
        },
      },
      // Roads — primary
      {
        id: "road-primary",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: [
          "all",
          ["!has", "brunnel"],
          ["==", "class", "primary"],
        ],
        paint: {
          "line-color": "#404040",
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 16, 10],
        },
      },
      // Roads — highway/motorway
      {
        id: "road-highway",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: [
          "all",
          ["!has", "brunnel"],
          ["in", "class", "motorway", "trunk"],
        ],
        paint: {
          "line-color": "#505050",
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 16, 12],
        },
      },
      // Bridges (elevated, solid line)
      {
        id: "road-bridge",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["==", "brunnel", "bridge"],
        paint: {
          "line-color": "#404040",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 16, 8],
        },
      },
      // Road labels
      {
        id: "road-label",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "transportation_name",
        minzoom: 12,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-font": ["Open Sans Regular"],
          "symbol-placement": "line",
          "text-max-angle": 30,
        },
        paint: {
          "text-color": "#666666",
          "text-halo-color": "#0a0a0a",
          "text-halo-width": 1,
        },
      },
      // Place labels
      {
        id: "place-city",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        filter: ["==", "class", "city"],
        layout: {
          "text-field": ["get", "name"],
          "text-size": 16,
          "text-font": ["Open Sans Bold"],
        },
        paint: {
          "text-color": "#888888",
          "text-halo-color": "#0a0a0a",
          "text-halo-width": 2,
        },
      },
      {
        id: "place-town",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        filter: ["in", "class", "town", "village"],
        layout: {
          "text-field": ["get", "name"],
          "text-size": 12,
          "text-font": ["Open Sans Regular"],
        },
        paint: {
          "text-color": "#777777",
          "text-halo-color": "#0a0a0a",
          "text-halo-width": 1,
        },
      },
    ],
  };
}

/**
 * Build an online fallback style using CARTO Dark Matter raster tiles.
 * Used when no offline PMTiles are available. Requires network.
 * Tile server: https://github.com/CartoDB/basemap-styles — free for use
 * with OSM attribution, no API key required.
 */
function buildFallbackStyle(): object {
  return {
    version: 8,
    name: "BugRout Online Fallback",
    sources: {
      "carto-dark": {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
          "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
          "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors © CARTO",
        maxzoom: 19,
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#0a0a0a" },
      },
      {
        id: "carto-dark-layer",
        type: "raster",
        source: "carto-dark",
      },
    ],
  };
}

/**
 * Serialize a style object to a data URI for MapLibre's styleURL prop.
 */
export function styleToDataUri(style: object): string {
  return `data:application/json,${encodeURIComponent(JSON.stringify(style))}`;
}
