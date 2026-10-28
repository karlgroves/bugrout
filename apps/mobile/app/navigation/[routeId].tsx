/**
 * Active Navigation Screen
 *
 * Uses NavigationController to orchestrate all real-time navigation services.
 * The screen is purely a view layer — all logic lives in the controller.
 */

/* eslint-disable max-lines-per-function -- pre-existing oversized navigation screen orchestrating events, reroute, and emergency SMS; tracked in docs/tech-debt.md (decompose navigation screen) */
import { useRouter } from "expo-router";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { StyleSheet, View, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AdvisoryBadge } from "@/components/common/AdvisoryBadge";
import { DemoLocationBadge } from "@/components/common/DemoLocationBadge";
import { withScreenTitle } from "@/components/common/ScreenTitle";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import { BatteryWarning } from "@/components/navigation/BatteryWarning";
import { DeviationBanner } from "@/components/navigation/DeviationBanner";
import { FuelRangeWarning } from "@/components/navigation/FuelRangeWarning";
import { ManeuverCard } from "@/components/navigation/ManeuverCard";
import { RouteBody } from "@/components/navigation/RouteBody";
import { RouteBottomBar } from "@/components/navigation/RouteBottomBar";
import { RouteViewToggle } from "@/components/navigation/RouteViewToggle";
import { alertRouteUnavailable } from "@/components/routing/RouteUnavailableNotice";
import { colors, spacing, statusIndicator } from "@/constants/theme";
import { getEmergencyContacts } from "@/db/queries/preferences";
import { useBattery } from "@/hooks/useBattery";
import { useFuelRange } from "@/hooks/useFuelRange";
import * as NavController from "@/services/navigation/NavigationController";
import {
  estimateRemaining,
  calculateSmartRoute,
} from "@/services/routing/RouteEngine";
import { useRouteStore } from "@/stores/useRouteStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { haversineDistance } from "@/utils/geo";
import { composeEmergencyMessage, sendEmergencySMS } from "@/utils/sms";

import type { NavigationEvent } from "@/services/navigation/NavigationController";
import type { LatLng } from "@bugrout/shared";

/** Active turn-by-turn navigation view driven by the NavigationController. */
function NavigationScreen(): React.JSX.Element {
  const router = useRouter();
  /*
   * Selectors, not `useRouteStore()` / `useSettingsStore()`.
   *
   * Calling the hook with no selector subscribes to the whole store, so this
   * screen re-rendered whenever *any* field changed — including
   * `currentManeuverIndex`, which NavigationController writes on every GPS
   * tick and which this screen never reads (it keeps its own `maneuverIndex`
   * in local state). #189 reports the navigation screen as slow to respond,
   * with taps lagging just after navigation starts, and asks for exactly this:
   * "profile the navigation screen's render and JS load, and fix whatever
   * keeps the JS thread busy."
   *
   * Field by field, so a write to a field this screen does not display costs
   * it nothing. The setters are stable references in Zustand, so selecting
   * them adds no subscription churn of its own.
   */
  const activeRoute = useRouteStore((s) => s.activeRoute);
  const hasDeviated = useRouteStore((s) => s.hasDeviated);
  const clearRoute = useRouteStore((s) => s.clearRoute);
  const setStatus = useRouteStore((s) => s.setStatus);
  const routeView = useRouteStore((s) => s.routeView);
  const setRouteView = useRouteStore((s) => s.setRouteView);
  const battery = useBattery();
  const units = useSettingsStore((s) => s.units);

  const [position, setPosition] = useState<LatLng | null>(null);
  const [heading, setHeading] = useState(0);
  const [maneuverIndex, setManeuverIndex] = useState(0);
  const [remaining, setRemaining] = useState({ distance: 0, duration: 0 });
  const deviationAlertShown = useRef(false);
  const [addedStopId, setAddedStopId] = useState<string | null>(null);

  const fuel = useFuelRange(activeRoute, position);
  const fuelStopAdded = useMemo(
    () => fuel.stop !== null && fuel.stop.resource.id === addedStopId,
    [fuel.stop, addedStopId],
  );

  // Handle events from NavigationController
  const handleNavEvent = useCallback(
    (event: NavigationEvent) => {
      switch (event.type) {
        case "position":
          setPosition(event.update.position);
          setHeading(event.update.heading);
          // Update remaining estimates
          if (activeRoute) {
            setRemaining(estimateRemaining(event.update.position, activeRoute));
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

        case "voice":
          // Voice prompts are spoken by NavigationController; no view update needed.
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleStop is declared after this callback and is stable; including it would create a declaration-order cycle, and it is only invoked from a one-shot arrival alert
    [activeRoute],
  );

  // Start navigation when screen mounts
  useEffect(() => {
    if (!activeRoute) {
      router.back();
      return;
    }

    void NavController.start(activeRoute, handleNavEvent);

    // Initialize remaining from full route
    setRemaining({
      distance: activeRoute.distance,
      duration: activeRoute.duration,
    });

    return () => {
      void NavController.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigation must start exactly once on mount; re-running on activeRoute/handleNavEvent/router changes would restart GPS and voice. Route updates are handled by the separate activeRoute.id effect below.
  }, []);

  // Update controller if route changes (after reroute)
  useEffect(() => {
    if (activeRoute && NavController.isActive()) {
      NavController.updateRoute(activeRoute);
      setManeuverIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on activeRoute.id so the controller only re-syncs when the route identity changes (e.g. after a reroute), not on every object reference change
  }, [activeRoute?.id]);

  const handleStop = useCallback(() => {
    void NavController.stop();
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
    } catch (err) {
      // The current route stays; say why a new one isn't available (#190).
      setStatus("active");
      alertRouteUnavailable(
        err,
        () => {
          router.push("/downloads");
        },
        "Keep current route",
      );
    }
  }, [position, activeRoute, setStatus, router]);

  // Reroute through the station the fuel banner is pointing at (#203). It is
  // the same local graph as any other route, so this works offline.
  const handleAddFuelStop = useCallback(async () => {
    const stop = fuel.stop;
    if (!position || !stop) return;

    const dest = activeRoute
      ? (activeRoute.coordinates[activeRoute.coordinates.length - 1] ?? null)
      : null;
    if (!dest) return;

    setStatus("rerouting");
    try {
      const newRoute = await calculateSmartRoute(position, dest, undefined, {
        waypoints: [{ lat: stop.resource.lat, lng: stop.resource.lng }],
      });
      useRouteStore.getState().setRoute(newRoute);
      NavController.updateRoute(newRoute);
      setAddedStopId(stop.resource.id);
    } catch (err) {
      // The trip continues on the route it is on; say why the stop could not
      // be added rather than dropping the driver into a dead end.
      setStatus("active");
      alertRouteUnavailable(
        err,
        () => {
          router.push("/downloads");
        },
        "Keep current route",
      );
    }
  }, [fuel.stop, position, activeRoute, setStatus, router]);

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
      // Only a send the composer confirmed is reported as one: a cancelled
      // message, or Android's unknown result, must not read as "sent".
      const result = await sendEmergencySMS(contacts, message);
      if (result === "sent") {
        Alert.alert("Sent", "Emergency message sent to all contacts.");
      } else if (result === "demo-location") {
        Alert.alert(
          "Demo location is on",
          "Your position is simulated, so it can't be sent to your contacts. Turn off Demo location in Settings to share where you really are.",
        );
      }
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
        <DemoLocationBadge compact />
      </View>

      <ManeuverCard
        maneuver={currentManeuver}
        distanceToManeuver={distanceToManeuver}
      />

      {/* Deviation warning */}
      {hasDeviated ? (
        <DeviationBanner
          onReroute={() => {
            deviationAlertShown.current = false;
            void handleReroute();
          }}
          onDismiss={() => {
            deviationAlertShown.current = false;
          }}
        />
      ) : null}

      {/* Low battery warning; renders nothing unless the level is known and low */}
      {!hasDeviated ? <BatteryWarning battery={battery} /> : null}

      {/* Fuel range; renders nothing unless a range was given and is running
          short of the next station on the route (#203) */}
      {!hasDeviated ? (
        <FuelRangeWarning
          stop={fuel.stop}
          rangeRemaining={fuel.rangeRemaining}
          warn={fuel.warn}
          stopAdded={fuelStopAdded}
          units={units}
          onAddFuelStop={() => {
            void handleAddFuelStop();
          }}
        />
      ) : null}

      {/* The essentials stay outside the switch: the advisory badge and
          status above, the ETA and Stop below (#192, #189). */}
      <RouteViewToggle value={routeView} onChange={setRouteView} />
      <RouteBody
        view={routeView}
        route={activeRoute}
        maneuverIndex={maneuverIndex}
        metresToManeuver={distanceToManeuver}
        position={position}
        heading={heading}
      />

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
    ...statusIndicator,
    // Navigation shows the advisory badge beside the indicator.
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
});

export default withScreenTitle(NavigationScreen, "Navigating");
