/**
 * Tests for Zustand stores — verify state management logic.
 */

import { useConnectivityStore } from "@/stores/useConnectivityStore";
import { useRouteStore } from "@/stores/useRouteStore";
import { useScenarioStore } from "@/stores/useScenarioStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useThreatStore } from "@/stores/useThreatStore";

import type { Scenario, ThreatZone, Route } from "@bugrout/shared";

// Reset stores between tests
beforeEach(() => {
  useScenarioStore.setState({ scenarios: [] });
  useSettingsStore.setState({
    units: "mi",
    voiceEnabled: true,
    batteryOptimization: true,
    crowdSignalOptIn: false,
  });
  useRouteStore.setState({
    activeRoute: null,
    status: "idle",
    currentManeuverIndex: 0,
    hasDeviated: false,
    destination: null,
  });
  useConnectivityStore.setState({ isOnline: false });
  useThreatStore.setState({
    threatZones: [],
    lastFetched: {},
    avoidanceEnabled: true,
  });
});

describe("useScenarioStore", () => {
  const mockScenario: Scenario = {
    id: "s1",
    name: "Test",
    destination: { lat: 37.0, lng: -122.0 },
    avoidZones: [],
    resourceStops: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it("adds a scenario", () => {
    useScenarioStore.getState().addScenario(mockScenario);
    expect(useScenarioStore.getState().scenarios).toHaveLength(1);
  });

  it("enforces max 3 scenarios", () => {
    const store = useScenarioStore.getState();
    store.addScenario({ ...mockScenario, id: "s1" });
    store.addScenario({ ...mockScenario, id: "s2" });
    store.addScenario({ ...mockScenario, id: "s3" });
    store.addScenario({ ...mockScenario, id: "s4" }); // Should be rejected
    expect(useScenarioStore.getState().scenarios).toHaveLength(3);
    expect(
      useScenarioStore.getState().scenarios.find((s) => s.id === "s4"),
    ).toBeUndefined();
  });

  it("updates a scenario", () => {
    useScenarioStore.getState().addScenario(mockScenario);
    useScenarioStore.getState().updateScenario("s1", { name: "Updated" });
    expect(useScenarioStore.getState().scenarios[0]!.name).toBe("Updated");
  });

  it("deletes a scenario", () => {
    useScenarioStore.getState().addScenario(mockScenario);
    useScenarioStore.getState().deleteScenario("s1");
    expect(useScenarioStore.getState().scenarios).toHaveLength(0);
  });
});

describe("useSettingsStore", () => {
  it("toggles units", () => {
    useSettingsStore.getState().setUnits("km");
    expect(useSettingsStore.getState().units).toBe("km");
  });

  it("toggles voice", () => {
    useSettingsStore.getState().setVoiceEnabled(false);
    expect(useSettingsStore.getState().voiceEnabled).toBe(false);
  });

  it("toggles crowd signal opt-in", () => {
    useSettingsStore.getState().setCrowdSignalOptIn(true);
    expect(useSettingsStore.getState().crowdSignalOptIn).toBe(true);
  });
});

describe("useRouteStore", () => {
  const mockRoute: Route = {
    id: "r1",
    geometry: "",
    coordinates: [{ lat: 37, lng: -122 }],
    distance: 1000,
    duration: 60,
    legs: [],
    summary: "Test",
  };

  it("sets route and status", () => {
    useRouteStore.getState().setRoute(mockRoute);
    expect(useRouteStore.getState().activeRoute?.id).toBe("r1");
    expect(useRouteStore.getState().status).toBe("active");
  });

  it("clears route", () => {
    useRouteStore.getState().setRoute(mockRoute);
    useRouteStore.getState().clearRoute();
    expect(useRouteStore.getState().activeRoute).toBeNull();
    expect(useRouteStore.getState().status).toBe("idle");
    expect(useRouteStore.getState().currentManeuverIndex).toBe(0);
  });

  it("tracks deviation", () => {
    useRouteStore.getState().setDeviated(true);
    expect(useRouteStore.getState().hasDeviated).toBe(true);
  });
});

describe("useConnectivityStore", () => {
  it("tracks online state", () => {
    useConnectivityStore.getState().setOnline(true);
    expect(useConnectivityStore.getState().isOnline).toBe(true);
  });
});

describe("useThreatStore", () => {
  const mockThreat: ThreatZone = {
    id: "t1",
    type: "wildfire",
    severity: "severe",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    },
    headline: "Test Fire",
    description: "",
    source: "usfs",
    fetchedAt: Date.now(),
    expiresAt: null,
  };

  it("adds threats without duplicates", () => {
    useThreatStore.getState().addThreats([mockThreat]);
    useThreatStore.getState().addThreats([mockThreat]); // duplicate
    expect(useThreatStore.getState().threatZones).toHaveLength(1);
  });

  it("adds new threats alongside existing", () => {
    useThreatStore.getState().addThreats([mockThreat]);
    useThreatStore.getState().addThreats([{ ...mockThreat, id: "t2" }]);
    expect(useThreatStore.getState().threatZones).toHaveLength(2);
  });

  it("toggles avoidance", () => {
    useThreatStore.getState().setAvoidanceEnabled(false);
    expect(useThreatStore.getState().avoidanceEnabled).toBe(false);
  });

  it("clears threats", () => {
    useThreatStore.getState().addThreats([mockThreat]);
    useThreatStore.getState().clearThreats();
    expect(useThreatStore.getState().threatZones).toHaveLength(0);
  });
});
