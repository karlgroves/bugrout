/**
 * Active Navigation Screen
 *
 * Uses NavigationController to orchestrate all real-time navigation services.
 * The screen is purely a view layer — all logic lives in the controller.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { StyleSheet, View, Alert } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { BugroutMap } from "@/components/map/BugroutMap";
import { ThreatOverlay } from "@/components/map/ThreatOverlay";
import { ManeuverCard } from "@/components/navigation/ManeuverCard";
import { RouteBottomBar } from "@/components/navigation/RouteBottomBar";
import { BatteryWarning } from "@/components/navigation/BatteryWarning";
import { DeviationBanner } from "@/components/navigation/DeviationBanner";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import { AdvisoryBadge } from "@/components/common/AdvisoryBadge";
import { useBattery } from "@/hooks/useBattery";
import * as NavController from "@/services/navigation/NavigationController";
import type { NavigationEvent } from "@/services/navigation/NavigationController";
import { useRouteStore } from "@/stores/useRouteStore";
import { estimateRemaining, calculateSmartRoute } from "@/services/routing/RouteEngine";
import { composeEmergencyMessage, sendEmergencySMS } from "@/utils/sms";
import { getEmergencyContacts } from "@/db/queries/preferences";
import { haversineDistance } from "@/utils/geo";
import type { LatLng } from "@bugrout/shared";
import { colors, spacing } from "@/constants/theme";

export default function NavigationScreen() {
  const router = useRouter();
  const { activeRoute, hasDeviated, clearRoute, setStatus } = useRouteStore();
  const battery = useBattery();

  const [position, setPosition] = useState<LatLng | null>(null);
  const [heading, setHeading] = useState(0);
  const [maneuverIndex, setManeuverIndex] = useState(0);
  const [remaining, setRemaining] = useState({ distance: 0, duration: 0 });
  const deviationAlertShown = useRef(false);

  // Handle events from NavigationController
  const handleNavEvent = useCallback(
    (event: NavigationEvent) => {
      switch (event.type) {
        case "position":
          setPosition(event.update.position);
          setHeading(event.update.heading);
          // Update remaining estimates
          if (activeRoute) {
            setRemaining(
              estimateRemaining(event.update.position, activeRoute),
            );
          }
          break;

        case "maneuver_advance":
          setManeuverIndex(event.index);
          deviationAlertShown.current = false;
          break;

        case "deviation":
          if (!deviationAlertShown.current) {
            deviationAlertShown.current = true;
            // Deviation is shown inline via DeviationBanner (rendered below)
          }
          break;

        case "arrival":
          Alert.alert("Arrived", "You have reached your destination.", [
            {
              text: "OK",
              onPress: () => {
                handleStop();
              },
            },
          ]);
          break;
      }
    },
    [activeRoute],
  );

  // Start navigation when screen mounts
  useEffect(() => {
    if (!activeRoute) {
      router.back();
      return;
    }

    NavController.start(activeRoute, handleNavEvent);

    // Initialize remaining from full route
    setRemaining({
      distance: activeRoute.distance,
      duration: activeRoute.duration,
    });

    return () => {
      NavController.stop();
    };
  }, []); // Only run once on mount

  // Update controller if route changes (after reroute)
  useEffect(() => {
    if (activeRoute && NavController.isActive()) {
      NavController.updateRoute(activeRoute);
      setManeuverIndex(0);
    }
  }, [activeRoute?.id]);

  const handleStop = useCallback(() => {
    NavController.stop();
    clearRoute();
    router.back();
  }, [clearRoute, router]);

  const handleReroute = useCallback(async () => {
    if (!position) return;

    const dest = activeRoute
      ? (activeRoute.coordinates[activeRoute.coordinates.length - 1] ?? null)
      : null;
    if (!dest) return;

    setStatus("rerouting");
    try {
      const newRoute = await calculateSmartRoute(position, dest);
      useRouteStore.getState().setRoute(newRoute);
      NavController.updateRoute(newRoute);
      deviationAlertShown.current = false;
    } catch {
      Alert.alert("Reroute Failed", "Could not calculate a new route.");
      setStatus("active");
    }
  }, [position, activeRoute, setStatus]);

  const handleEmergencyContact = useCallback(async () => {
    if (!position) return;

    const contacts = await getEmergencyContacts();
    if (contacts.length === 0) {
      Alert.alert(
        "No Contacts",
        "Add emergency contacts in Settings to use this feature.",
      );
      return;
    }

    const dest = activeRoute
      ? (activeRoute.coordinates[activeRoute.coordinates.length - 1] ?? null)
      : null;

    const message = composeEmergencyMessage(
      position,
      dest,
      remaining.duration > 0 ? remaining.duration : null,
    );

    try {
      await sendEmergencySMS(contacts, message);
      Alert.alert("Sent", "Emergency message sent to all contacts.");
    } catch {
      Alert.alert("SMS Error", "Could not send emergency SMS.");
    }
  }, [position, activeRoute, remaining.duration]);

  // Current maneuver data
  const allManeuvers = activeRoute?.legs.flatMap((l) => l.maneuvers) ?? [];
  const currentManeuver = allManeuvers[maneuverIndex] ?? null;
  const distanceToManeuver =
    position && currentManeuver
      ? haversineDistance(position, currentManeuver.position)
      : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.statusBar}>
        <StatusIndicator />
        <AdvisoryBadge />
      </View>

      <ManeuverCard
        maneuver={currentManeuver}
        distanceToManeuver={distanceToManeuver}
      />

      {/* Deviation warning */}
      {hasDeviated && (
        <DeviationBanner
          onReroute={() => {
            deviationAlertShown.current = false;
            handleReroute();
          }}
          onDismiss={() => {
            deviationAlertShown.current = false;
          }}
        />
      )}

      {/* Low battery warning */}
      {battery.isLow && !hasDeviated && (
        <BatteryWarning
          percent={battery.percent}
          isCritical={battery.isCritical}
        />
      )}

      <BugroutMap
        userLocation={position}
        heading={heading}
        routeCoordinates={activeRoute?.coordinates}
        followUser
      >
        <ThreatOverlay />
      </BugroutMap>

      <RouteBottomBar
        remainingDistance={remaining.distance}
        remainingDuration={remaining.duration}
        onStop={handleStop}
        onEmergencyContact={handleEmergencyContact}
        onReroute={handleReroute}
        showReroute={hasDeviated}
      />
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
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
});
