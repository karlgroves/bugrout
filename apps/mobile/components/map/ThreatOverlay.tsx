/**
 * Threat Overlay Component
 *
 * Renders threat zone polygons on the MapLibre map.
 * Color-coded by type: red=fire, blue=flood, purple=weather.
 * Tappable to show threat detail card.
 */

import { useCallback, useState } from "react";
import { StyleSheet, View, Text, Pressable, Modal } from "react-native";
import * as MapLibreGL from "@/platform/maplibre";
import type { ThreatZone } from "@bugrout/shared";
import { useThreatStore } from "@/stores/useThreatStore";
import { colors, spacing, typography, touchTarget } from "@/constants/theme";

const THREAT_COLORS: Record<string, { fill: string; border: string }> = {
  wildfire: { fill: colors.threatFire, border: colors.threatFireBorder },
  flood: { fill: colors.threatFlood, border: colors.threatFloodBorder },
  weather: {
    fill: colors.threatWeather,
    border: colors.threatWeatherBorder,
  },
};

export function ThreatOverlay() {
  const { threatZones } = useThreatStore();
  const [selectedThreat, setSelectedThreat] = useState<ThreatZone | null>(
    null,
  );

  const handleThreatPress = useCallback(
    (event: MapLibreGL.OnPressEvent) => {
      const threatId = event.features?.[0]?.properties?.threatId as string | undefined;
      if (threatId) {
        const threat = threatZones.find((t) => t.id === threatId);
        if (threat) setSelectedThreat(threat);
      }
    },
    [threatZones],
  );

  if (threatZones.length === 0) return null;

  // Group threats by type for separate layers with different colors
  const threatsByType = groupThreats(threatZones);

  return (
    <>
      {Object.entries(threatsByType).map(([type, threats]) => {
        const style = THREAT_COLORS[type] ?? THREAT_COLORS.weather;
        const geojson = threatsToFeatureCollection(threats);

        return (
          <MapLibreGL.ShapeSource
            key={`threat-${type}`}
            id={`threat-source-${type}`}
            shape={geojson}
            onPress={handleThreatPress}
          >
            <MapLibreGL.FillLayer
              id={`threat-fill-${type}`}
              style={{
                fillColor: style.fill,
                fillOutlineColor: style.border,
              }}
            />
            <MapLibreGL.LineLayer
              id={`threat-border-${type}`}
              style={{
                lineColor: style.border,
                lineWidth: 2,
                lineDasharray: [4, 2],
              }}
            />
          </MapLibreGL.ShapeSource>
        );
      })}

      {/* Threat detail modal */}
      <Modal
        visible={selectedThreat !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedThreat(null)}
      >
        <View style={detailStyles.overlay}>
          <View style={detailStyles.card}>
            {selectedThreat && (
              <>
                <View style={detailStyles.header}>
                  <View
                    style={[
                      detailStyles.typeBadge,
                      {
                        backgroundColor:
                          THREAT_COLORS[selectedThreat.type]?.border ??
                          colors.warning,
                      },
                    ]}
                  >
                    <Text style={detailStyles.typeText}>
                      {selectedThreat.type.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={detailStyles.severity}>
                    {selectedThreat.severity}
                  </Text>
                </View>

                <Text style={detailStyles.headline}>
                  {selectedThreat.headline}
                </Text>

                <Text style={detailStyles.description}>
                  {selectedThreat.description}
                </Text>

                <Text style={detailStyles.timestamp}>
                  Source: {selectedThreat.source.toUpperCase()} — Last updated:{" "}
                  {new Date(selectedThreat.fetchedAt).toLocaleString()}
                </Text>

                <Pressable
                  style={detailStyles.closeButton}
                  onPress={() => setSelectedThreat(null)}
                  accessibilityLabel="Close threat details"
                  accessibilityRole="button"
                >
                  <Text style={detailStyles.closeText}>Close</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

function groupThreats(
  threats: ThreatZone[],
): Record<string, ThreatZone[]> {
  const groups: Record<string, ThreatZone[]> = {};
  for (const t of threats) {
    if (!groups[t.type]) groups[t.type] = [];
    groups[t.type].push(t);
  }
  return groups;
}

function threatsToFeatureCollection(threats: ThreatZone[]) {
  return {
    type: "FeatureCollection" as const,
    features: threats.map((t) => ({
      type: "Feature" as const,
      geometry: t.geometry,
      properties: { threatId: t.id, type: t.type, severity: t.severity },
    })),
  };
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
    maxHeight: "50%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 4,
  },
  typeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  severity: {
    ...typography.caption,
    textTransform: "capitalize",
  },
  headline: {
    ...typography.subheading,
    marginBottom: spacing.sm,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  timestamp: {
    ...typography.caption,
    color: colors.textMuted,
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
