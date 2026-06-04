import { useState, useCallback, useEffect } from "react";
import { StyleSheet, View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "@/platform/haptics";

import { BugroutMap } from "@/components/map/BugroutMap";
import { ThreatOverlay } from "@/components/map/ThreatOverlay";
import { ResourceMarkers } from "@/components/map/ResourceMarkers";
import { ResourceFilterBar } from "@/components/map/ResourceFilterBar";
import { ScenarioChips } from "@/components/map/ScenarioChips";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import { DownloadGuide } from "@/components/common/DownloadGuide";
import { useLocation } from "@/hooks/useLocation";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { useDataSync } from "@/hooks/useDataSync";
import { useRouteStore } from "@/stores/useRouteStore";
import { useMapStore } from "@/stores/useMapStore";
import { isRegionStale } from "@/services/tiles/TileManager";
import { colors, fab, spacing, typography } from "@/constants/theme";

export default function MapScreen() {
  const router = useRouter();
  const { position } = useLocation(true);
  const isOnline = useOfflineStatus();
  useDataSync(); // Background threat/resource refresh
  const { activeRoute, status } = useRouteStore();
  const { tilesLoaded, activeRegion } = useMapStore();
  const tileStale = activeRegion ? isRegionStale(activeRegion) : false;
  const [showDownloadGuide, setShowDownloadGuide] = useState(!tilesLoaded);

  const isNavigating = status === "active" || status === "rerouting";

  // FAB pulse animation
  const fabScale = useSharedValue(1);
  useEffect(() => {
    fabScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, // infinite
    );
  }, [fabScale]);
  const fabAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fabScale.value }],
  }));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* First-launch download guide */}
      {showDownloadGuide && !tilesLoaded && (
        <DownloadGuide onDismiss={() => setShowDownloadGuide(false)} />
      )}

      {/* Online/Offline status */}
      <View style={styles.statusBar}>
        <StatusIndicator />
      </View>

      {/* Tile download banner */}
      {!tilesLoaded && (
        <Pressable
          testID="tile-download-banner"
          style={styles.tileBanner}
          onPress={() => router.push("/downloads")}
          accessibilityLabel="Download offline maps to navigate without a connection"
          accessibilityRole="button"
        >
          <Text style={styles.tileBannerText}>
            Download offline maps for your region
          </Text>
        </Pressable>
      )}

      {/* Stale tile warning */}
      {tilesLoaded && tileStale && (
        <Pressable
          testID="stale-tile-banner"
          style={styles.staleBanner}
          onPress={() => router.push("/downloads")}
          accessibilityLabel="Offline maps are outdated. Tap to update."
          accessibilityRole="button"
        >
          <Text style={styles.staleBannerText}>
            Maps outdated — tap to update
          </Text>
        </Pressable>
      )}

      {/* Map */}
      <BugroutMap
        userLocation={position}
        routeCoordinates={activeRoute?.coordinates}
        followUser={isNavigating}
        onMapPress={(coord) => {
          if (!isNavigating) {
            router.push({
              pathname: "/destination",
              params: {
                pinLat: coord.lat.toFixed(6),
                pinLng: coord.lng.toFixed(6),
              },
            });
          }
        }}
      >
        <ThreatOverlay />
        <ResourceMarkers userLocation={position} />
      </BugroutMap>

      {/* Resource filter toggles */}
      {!isNavigating && (
        <View style={styles.filterBar}>
          <ResourceFilterBar />
        </View>
      )}

      {/* Scenario quick-activate chips */}
      {!isNavigating && (
        <View style={styles.scenarioChips}>
          <ScenarioChips />
        </View>
      )}

      {/* Bug Out FAB — hidden during active navigation */}
      {!isNavigating && (
        <Animated.View style={[styles.fab, fabAnimatedStyle]}>
          <Pressable
            testID="bug-out-fab"
            style={styles.fabInner}
            onPress={() => {
              Haptics.impact("heavy");
              router.push("/destination");
            }}
            accessibilityLabel="Bug Out — set evacuation destination"
            accessibilityRole="button"
          >
            <Text style={styles.fabText}>BUG OUT</Text>
          </Pressable>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statusBar: {
    position: "absolute",
    top: 60,
    right: spacing.md,
    zIndex: 10,
  },
  tileBanner: {
    position: "absolute",
    top: 60,
    left: spacing.md,
    right: 80,
    zIndex: 10,
    backgroundColor: colors.warning,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tileBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.background,
  },
  staleBanner: {
    position: "absolute",
    top: 60,
    left: spacing.md,
    right: 80,
    zIndex: 10,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.warning,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  staleBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.warning,
  },
  filterBar: {
    position: "absolute",
    bottom: 260,
    alignSelf: "center",
    zIndex: 10,
  },
  scenarioChips: {
    position: "absolute",
    bottom: 210,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  fab: {
    position: "absolute",
    bottom: 110,
    alignSelf: "center",
    zIndex: 20,
  },
  fabInner: {
    minWidth: fab.size * 2.2,
    paddingHorizontal: spacing.lg,
    height: fab.size + 8,
    borderRadius: (fab.size + 8) / 2,
    backgroundColor: fab.backgroundColor,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  fabText: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.textPrimary,
    letterSpacing: 2,
  },
});
