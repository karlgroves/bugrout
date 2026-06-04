/* eslint-disable max-lines-per-function -- pre-existing; tracked in docs/tech-debt.md (declarative cluster/marker layers plus inline detail modal in one render tree) */
/**
 * Resource Markers Component
 *
 * Renders fuel, water, and shelter points as icons on the map.
 * Supports symbol clustering at low zoom levels.
 * Tappable markers show detail cards with name, address, and distance.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useCallback, useState } from "react";
import { StyleSheet, View, Text, Pressable, Modal } from "react-native";

import { colors, spacing, typography, touchTarget } from "@/constants/theme";
import * as MapLibreGL from "@/platform/maplibre";
import { useResourceStore } from "@/stores/useResourceStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { haversineDistance, formatDistance } from "@/utils/geo";

import type { ResourcePoint, LatLng } from "@bugrout/shared";

const RESOURCE_ICONS: Record<string, { icon: string; color: string }> = {
  fuel: { icon: "tint", color: colors.resourceFuel },
  water: { icon: "tint", color: colors.resourceWater },
  shelter: { icon: "home", color: colors.resourceShelter },
};

/**
 * Props for {@link ResourceMarkers}.
 */
interface ResourceMarkersProps {
  userLocation?: LatLng | null;
}

/**
 * Renders clustered fuel, water, and shelter markers on the map and shows a
 * detail card (name, address, distance) when a marker is tapped.
 */
export function ResourceMarkers({
  userLocation,
}: ResourceMarkersProps): React.JSX.Element | null {
  const { resources, visibleTypes } = useResourceStore();
  const { units } = useSettingsStore();
  const [selectedResource, setSelectedResource] =
    useState<ResourcePoint | null>(null);

  const filteredResources = resources.filter((r) => visibleTypes.has(r.type));

  const handlePress = useCallback(
    (event: MapLibreGL.OnPressEvent) => {
      const resourceId = event.features[0]?.properties.id as string | undefined;
      if (resourceId) {
        const resource = resources.find((r) => r.id === resourceId);
        if (resource) setSelectedResource(resource);
      }
    },
    [resources],
  );

  if (filteredResources.length === 0) return null;

  const geojson = {
    type: "FeatureCollection" as const,
    features: filteredResources.map((r) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [r.lng, r.lat] as [number, number],
      },
      properties: {
        id: r.id,
        type: r.type,
        name: r.name,
      },
    })),
  };

  return (
    <>
      <MapLibreGL.ShapeSource
        id="resources"
        shape={geojson}
        cluster
        clusterRadius={50}
        clusterMaxZoomLevel={14}
        onPress={handlePress}
      >
        {/* Cluster circles */}
        <MapLibreGL.CircleLayer
          id="resource-cluster"
          filter={["has", "point_count"]}
          style={{
            circleColor: colors.surfaceElevated,
            circleRadius: 20,
            circleStrokeColor: colors.accent,
            circleStrokeWidth: 2,
          }}
        />
        <MapLibreGL.SymbolLayer
          id="resource-cluster-count"
          filter={["has", "point_count"]}
          style={{
            textField: ["get", "point_count_abbreviated"],
            textSize: 14,
            textColor: colors.textPrimary,
          }}
        />

        {/* Individual markers */}
        <MapLibreGL.CircleLayer
          id="resource-point"
          filter={["!", ["has", "point_count"]]}
          style={{
            circleColor: [
              "match",
              ["get", "type"],
              "fuel",
              colors.resourceFuel,
              "water",
              colors.resourceWater,
              "shelter",
              colors.resourceShelter,
              colors.textMuted,
            ],
            circleRadius: 8,
            circleStrokeColor: "#ffffff",
            circleStrokeWidth: 2,
          }}
        />
      </MapLibreGL.ShapeSource>

      {/* Resource detail modal */}
      <Modal
        visible={selectedResource !== null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setSelectedResource(null);
        }}
      >
        <View style={detailStyles.overlay}>
          <View style={detailStyles.card}>
            {selectedResource ? (
              <>
                <View style={detailStyles.header}>
                  <FontAwesome
                    name={
                      (RESOURCE_ICONS[selectedResource.type]?.icon ??
                        "question") as React.ComponentProps<
                        typeof FontAwesome
                      >["name"]
                    }
                    size={24}
                    color={
                      RESOURCE_ICONS[selectedResource.type]?.color ??
                      colors.textMuted
                    }
                  />
                  <View style={detailStyles.headerText}>
                    <Text style={detailStyles.name}>
                      {selectedResource.name}
                    </Text>
                    <Text style={detailStyles.type}>
                      {selectedResource.type.charAt(0).toUpperCase() +
                        selectedResource.type.slice(1)}
                    </Text>
                  </View>
                </View>

                {selectedResource.address ? (
                  <Text style={detailStyles.address}>
                    {selectedResource.address}
                  </Text>
                ) : null}

                {userLocation ? (
                  <Text style={detailStyles.distance}>
                    {formatDistance(
                      haversineDistance(userLocation, {
                        lat: selectedResource.lat,
                        lng: selectedResource.lng,
                      }),
                      units,
                    )}{" "}
                    away
                  </Text>
                ) : null}

                <Pressable
                  style={detailStyles.closeButton}
                  onPress={() => {
                    setSelectedResource(null);
                  }}
                  accessibilityLabel="Close resource details"
                  accessibilityHint="Dismisses this resource detail card and returns to the map"
                  accessibilityRole="button"
                >
                  <Text style={detailStyles.closeText}>Close</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const detailStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  name: {
    ...typography.subheading,
  },
  type: {
    ...typography.caption,
    textTransform: "capitalize",
  },
  address: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  distance: {
    ...typography.body,
    color: colors.accent,
    fontWeight: "600",
    marginBottom: spacing.lg,
  },
  closeButton: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: "center",
    minHeight: touchTarget.minHeight,
    justifyContent: "center",
  },
  closeText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
});
