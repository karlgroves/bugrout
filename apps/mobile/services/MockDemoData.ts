/**
 * Mock Demo Data
 *
 * Pre-populates stores with sample data when running in web preview
 * or Expo Go without downloaded tiles. This makes the demo experience
 * rich and visually representative of the real app.
 *
 * Only loaded when: no tiles are downloaded AND app is in preview mode.
 */
/* eslint-disable max-lines-per-function -- pre-existing; tracked in docs/tech-debt.md (loadMockDemoData: inline static fixture data) */

import { Platform } from "react-native";

import { useResourceStore } from "@/stores/useResourceStore";
import { useScenarioStore } from "@/stores/useScenarioStore";
import { useThreatStore } from "@/stores/useThreatStore";

import type { ThreatZone, ResourcePoint } from "@bugrout/shared";

const IS_PREVIEW = Platform.OS === "web" || __DEV__;

/**
 * Load mock demo data into stores for preview purposes.
 */
export function loadMockDemoData(): void {
  if (!IS_PREVIEW) return;

  const threatStore = useThreatStore.getState();
  const resourceStore = useResourceStore.getState();
  const scenarioStore = useScenarioStore.getState();

  // Only load if stores are empty
  if (threatStore.threatZones.length > 0) return;

  // --- Mock Threats ---
  const mockThreats: ThreatZone[] = [
    {
      id: "demo-fire-1",
      type: "wildfire",
      severity: "severe",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-122.3, 37.85],
            [-122.2, 37.85],
            [-122.2, 37.95],
            [-122.3, 37.95],
            [-122.3, 37.85],
          ],
        ],
      },
      headline: "Demo: Oak Hills Fire",
      description: "Active wildfire — 35% contained. ~2,400 acres.",
      source: "usfs",
      fetchedAt: Date.now(),
      expiresAt: null,
    },
    {
      id: "demo-flood-1",
      type: "flood",
      severity: "moderate",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-122.5, 37.6],
            [-122.4, 37.6],
            [-122.4, 37.65],
            [-122.5, 37.65],
            [-122.5, 37.6],
          ],
        ],
      },
      headline: "Demo: FEMA Flood Zone AE",
      description: "High-risk flood zone (riverine)",
      source: "fema",
      fetchedAt: Date.now(),
      expiresAt: null,
    },
    {
      id: "demo-weather-1",
      type: "weather",
      severity: "moderate",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-122.6, 37.7],
            [-122.4, 37.7],
            [-122.4, 37.8],
            [-122.6, 37.8],
            [-122.6, 37.7],
          ],
        ],
      },
      headline: "Demo: High Wind Advisory",
      description: "Winds 35-45 mph with gusts to 60 mph expected.",
      source: "nws",
      fetchedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
    },
  ];

  threatStore.setThreats(mockThreats);
  threatStore.setLastFetched("usfs", Date.now());
  threatStore.setLastFetched("fema", Date.now());
  threatStore.setLastFetched("nws", Date.now());

  // --- Mock Resources ---
  const mockResources: ResourcePoint[] = [
    {
      id: "demo-fuel-1",
      type: "fuel",
      name: "Shell Gas Station",
      lat: 37.785,
      lng: -122.409,
      address: "123 Market St, San Francisco, CA",
      metadata: { fuelType: "E85" },
      source: "nrel",
      fetchedAt: Date.now(),
      regionId: "ca",
    },
    {
      id: "demo-fuel-2",
      type: "fuel",
      name: "Chevron",
      lat: 37.762,
      lng: -122.435,
      address: "456 Mission St, San Francisco, CA",
      metadata: { fuelType: "LPG" },
      source: "nrel",
      fetchedAt: Date.now(),
      regionId: "ca",
    },
    {
      id: "demo-water-1",
      type: "water",
      name: "Public Drinking Fountain",
      lat: 37.77,
      lng: -122.42,
      address: "Golden Gate Park",
      metadata: { osmTags: { amenity: "drinking_water" } },
      source: "osm",
      fetchedAt: Date.now(),
      regionId: "ca",
    },
    {
      id: "demo-water-2",
      type: "water",
      name: "USGS Stream Gauge #11162500",
      lat: 37.82,
      lng: -122.38,
      address: null,
      metadata: { siteType: "ST" },
      source: "usgs",
      fetchedAt: Date.now(),
      regionId: "ca",
    },
    {
      id: "demo-shelter-1",
      type: "shelter",
      name: "Red Cross Emergency Shelter",
      lat: 37.79,
      lng: -122.4,
      address: "789 Howard St, San Francisco, CA",
      metadata: { status: "OPEN", organization: "Red Cross" },
      source: "redcross",
      fetchedAt: Date.now(),
      regionId: "ca",
    },
  ];

  resourceStore.setResources(mockResources);

  // --- Mock Scenario ---
  if (scenarioStore.scenarios.length === 0) {
    scenarioStore.addScenario({
      id: "demo-scenario-1",
      name: "Wildfire East",
      destination: { lat: 37.3382, lng: -121.8863 }, // San Jose
      avoidZones: [],
      resourceStops: [
        { type: "fuel", maxDetour: 16000, enabled: true },
        { type: "water", maxDetour: 16000, enabled: false },
      ],
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 86400000,
    });
  }
}
