/**
 * Pick a Plan's Destination on the Map
 *
 * The way to set a plan's destination that needs no address and no network at
 * all (#187).
 *
 * It exists for two reasons. Some destinations have no address — a field rally
 * point, a trailhead, the end of a forest road. And the bundled privacy policy
 * promises users they can reach any destination without going through
 * Nominatim; an address-only editor would have broken that promise.
 *
 * The tapped point is handed back through the scenario store, not a navigation
 * param: the editor must keep the name and stop switches the user has already
 * set. Nothing is saved here.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { withScreenTitle } from "@/components/common/ScreenTitle";
import { BugroutMap } from "@/components/map/BugroutMap";
import { colors, spacing, typography, touchTarget } from "@/constants/theme";
import { useLocation } from "@/hooks/useLocation";
import * as MapLibreGL from "@/platform/maplibre";
import { useScenarioStore } from "@/stores/useScenarioStore";

import type { LatLng } from "@bugrout/shared";

/**
 * The chosen point, drawn as a pin.
 *
 * A Point layer, not a one-coordinate `routeCoordinates` line: a LineString
 * needs two positions, so a single one is invalid GeoJSON and draws nothing.
 */
function PickedPointMarker({ point }: { point: LatLng }): React.JSX.Element {
  return (
    <MapLibreGL.ShapeSource
      id="picked-destination"
      shape={{
        type: "Feature",
        geometry: { type: "Point", coordinates: [point.lng, point.lat] },
        properties: {},
      }}
    >
      <MapLibreGL.CircleLayer
        id="picked-destination-dot"
        style={{
          circleRadius: 9,
          circleColor: colors.accent,
          circleStrokeColor: "#ffffff",
          circleStrokeWidth: 3,
        }}
      />
    </MapLibreGL.ShapeSource>
  );
}

/** Full-screen map for choosing a plan's destination by tapping it. */
function PickLocationScreen(): React.JSX.Element {
  const router = useRouter();
  const { position } = useLocation();
  const setPickedDestination = useScenarioStore((s) => s.setPickedDestination);
  const [picked, setPicked] = useState<LatLng | null>(null);

  const handleConfirm = useCallback(() => {
    if (!picked) return;
    // The editor owns saving; this screen only answers "where".
    setPickedDestination(picked);
    router.back();
  }, [picked, router, setPickedDestination]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mapContainer}>
        <BugroutMap userLocation={position} onMapPress={setPicked}>
          {picked ? <PickedPointMarker point={picked} /> : null}
        </BugroutMap>
      </View>

      <View style={styles.panel}>
        <Text
          style={styles.instruction}
          accessibilityRole="header"
          aria-level={2}
        >
          {picked ? "Destination chosen" : "Tap the map to choose"}
        </Text>
        <Text style={styles.detail} accessibilityLiveRegion="polite">
          {picked
            ? `${picked.lat.toFixed(4)}, ${picked.lng.toFixed(4)}`
            : "No address needed, and this works with no connection."}
        </Text>

        <View style={styles.actions}>
          <Pressable
            testID="pick-location-cancel-btn"
            style={styles.cancelButton}
            onPress={() => {
              router.back();
            }}
            accessibilityLabel="Cancel"
            accessibilityHint="Returns to the plan without changing its destination"
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>

          <Pressable
            testID="pick-location-confirm-btn"
            style={[styles.confirmButton, !picked && styles.confirmDisabled]}
            onPress={handleConfirm}
            disabled={!picked}
            accessibilityLabel="Use this point"
            accessibilityHint="Sets the plan's destination to the point you tapped"
            accessibilityRole="button"
            accessibilityState={{ disabled: !picked }}
          >
            <FontAwesome name="map-pin" size={16} color={colors.background} />
            <Text style={styles.confirmText}>Use this point</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapContainer: {
    flex: 1,
  },
  panel: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  instruction: {
    ...typography.body,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  detail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  cancelButton: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTarget.minHeight,
  },
  cancelText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  confirmButton: {
    flex: 2,
    flexDirection: "row",
    gap: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTarget.minHeight,
  },
  confirmDisabled: {
    opacity: 0.5,
  },
  confirmText: {
    ...typography.body,
    fontWeight: "800",
    color: colors.background,
  },
});

export default withScreenTitle(PickLocationScreen, "Choose Destination");
