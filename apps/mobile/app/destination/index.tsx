/**
 * Destination Picker
 *
 * Three input modes:
 * 1. Saved scenarios (quick-select)
 * 2. Address search via Nominatim (online only, debounced)
 * 3. Recent destinations from SQLite
 *
 * After selecting, "Route & Go" calculates and opens the route preview.
 */

/* eslint-disable max-lines, max-lines-per-function, complexity -- pre-existing oversized destination picker with inline search/scenario/recent list rendering; tracked in docs/tech-debt.md (decompose destination picker) */
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { v4 as uuidv4 } from "uuid";

import { LoadingOverlay } from "@/components/common/LoadingOverlay";
import { colors, spacing, typography, touchTarget } from "@/constants/theme";
import {
  getRecentDestinations,
  addRecentDestination,
  type RecentDestinationRow,
} from "@/db/queries/preferences";
import { useLocation } from "@/hooks/useLocation";
import { useRoute } from "@/hooks/useRoute";
import { useScenarioStore } from "@/stores/useScenarioStore";

import type { LatLng, Scenario  } from "@bugrout/shared";

interface GeocodingResult {
  displayName: string;
  shortName: string;
  lat: number;
  lng: number;
}

const SEARCH_DEBOUNCE_MS = 400;

/** Destination picker offering scenarios, address search, and recent destinations. */
export default function DestinationScreen(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ pinLat?: string; pinLng?: string }>();
  const { scenarios } = useScenarioStore();
  const { position, getPosition, error: locationError } = useLocation(false);
  const { calculateRoute, calculateRouteWithStops } = useRoute();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [recents, setRecents] = useState<RecentDestinationRow[]>([]);
  const [selectedDest, setSelectedDest] = useState<LatLng | null>(null);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(
    null,
  );
  const [calculating, setCalculating] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setGettingLocation(true);
    getPosition().finally(() => { setGettingLocation(false); }).catch(() => {
      // getPosition surfaces its own error via locationError; swallow here
    });
    getRecentDestinations(5)
      .then(setRecents)
      .catch((err: unknown) => {
        console.error("Failed to load recent destinations", err);
      });

    // Auto-select pin dropped from map
    if (params.pinLat && params.pinLng) {
      const lat = parseFloat(params.pinLat);
      const lng = parseFloat(params.pinLng);
      if (!isNaN(lat) && !isNaN(lng)) {
        setSelectedDest({ lat, lng });
        setSelectedLabel(`Map pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
      }
    }
  }, [getPosition, params.pinLat, params.pinLng]);

  // Debounced search
  const handleSearchChange = useCallback(
    (text: string) => {
      setQuery(text);
      setSelectedScenario(null); // Clear scenario when typing

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (text.length < 3) {
        setResults([]);
        setNoResults(false);
        return;
      }

      debounceRef.current = setTimeout(() => {
        void searchAddress(text);
      }, SEARCH_DEBOUNCE_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchAddress is stable (memoized below) and including it would create a declaration-order cycle
    [],
  );

  const searchAddress = useCallback(
    async (q: string) => {
      setSearching(true);
      setNoResults(false);
      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8&countrycodes=us&addressdetails=1`,
          { headers: { "User-Agent": "BugRout/1.0" } },
        );
        const data = (await resp.json()) as {
          display_name: string;
          lat: string;
          lon: string;
          address?: {
            city?: string;
            town?: string;
            village?: string;
            state?: string;
            road?: string;
            house_number?: string;
          };
        }[];

        if (data.length === 0) {
          setNoResults(true);
          setResults([]);
        } else {
          setResults(
            data.map((d) => ({
              displayName: d.display_name,
              shortName: buildShortName(d.address, d.display_name),
              lat: parseFloat(d.lat),
              lng: parseFloat(d.lon),
            })),
          );
          setNoResults(false);
        }
      } catch {
        setResults([]);
      }
      setSearching(false);
    },
    [],
  );

  const selectDestination = useCallback(
    (dest: LatLng, label: string) => {
      setSelectedDest(dest);
      setSelectedLabel(label);
    },
    [],
  );

  const confirmRoute = useCallback(async () => {
    if (!selectedDest) {
      Alert.alert("No Destination", "Select a destination first.");
      return;
    }
    if (!position) {
      Alert.alert(
        "Location Unavailable",
        "Your current location could not be determined. Please ensure location services are enabled and try again.",
        [
          { text: "Retry", onPress: () => { void getPosition(); } },
          { text: "Cancel", style: "cancel" },
        ],
      );
      return;
    }

    await addRecentDestination({
      id: uuidv4(),
      label:
        selectedLabel ||
        `${selectedDest.lat.toFixed(4)}, ${selectedDest.lng.toFixed(4)}`,
      lat: selectedDest.lat,
      lng: selectedDest.lng,
      usedAt: Date.now(),
    });

    setCalculating(true);
    try {
      if (selectedScenario?.resourceStops.some((r) => r.enabled)) {
        await calculateRouteWithStops(
          position,
          selectedDest,
          selectedScenario.resourceStops,
          selectedScenario.avoidZones.length > 0
            ? { avoidPolygons: selectedScenario.avoidZones }
            : undefined,
        );
      } else {
        await calculateRoute(
          position,
          selectedDest,
          selectedScenario?.avoidZones.length
            ? { avoidPolygons: selectedScenario.avoidZones }
            : undefined,
        );
      }

      router.replace("/route-preview");
    } catch {
      setCalculating(false);
      Alert.alert(
        "Routing Unavailable",
        "Could not calculate a route. Make sure you have offline maps downloaded for this area.",
      );
    }
  }, [
    selectedDest,
    position,
    selectedLabel,
    selectedScenario,
    calculateRoute,
    calculateRouteWithStops,
    getPosition,
    router,
  ]);

  const isSelected = (lat: number, lng: number): boolean =>
    selectedDest !== null &&
    selectedDest.lat === lat &&
    selectedDest.lng === lng;

  return (
    <View style={styles.container}>
      <LoadingOverlay visible={calculating} message="Calculating route..." />

      {/* Search input */}
      <View style={styles.searchRow}>
        <FontAwesome
          name="search"
          size={16}
          color={colors.textMuted}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search address or city..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={handleSearchChange}
          accessibilityLabel="Search for an address"
          accessibilityHint="Type at least three characters to look up matching addresses and cities"
          returnKeyType="search"
          testID="destination-search-input"
        />
        {query.length > 0 && (
          <Pressable
            onPress={() => {
              setQuery("");
              setResults([]);
              setNoResults(false);
            }}
            style={styles.clearButton}
            accessibilityLabel="Clear search"
            accessibilityHint="Clears the search field and removes the current results"
          >
            <FontAwesome name="times-circle" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {searching ? <ActivityIndicator style={styles.spinner} color={colors.accent} /> : null}

      {noResults && !searching ? <View style={styles.noResults}>
          <FontAwesome name="map-marker" size={20} color={colors.textMuted} />
          <Text style={styles.noResultsText}>
            No results found for "{query}"
          </Text>
        </View> : null}

      <FlatList
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        data={buildListData(results, scenarios, recents)}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          if (item._type === "header") {
            return <Text style={styles.sectionTitle}>{item.label}</Text>;
          }

          if (item._type === "search") {
            return (
              <Pressable
                style={[
                  styles.resultRow,
                  isSelected(item.lat, item.lng) && styles.selectedRow,
                ]}
                onPress={() =>
                  { selectDestination(
                    { lat: item.lat, lng: item.lng },
                    item.shortName,
                  ); }
                }
                accessibilityRole="button"
                testID={`search-result-${item.lat}`}
              >
                <View style={styles.resultContent}>
                  <Text style={styles.resultText} numberOfLines={1}>
                    {item.shortName}
                  </Text>
                  <Text style={styles.resultDetail} numberOfLines={1}>
                    {item.displayName}
                  </Text>
                </View>
                {isSelected(item.lat, item.lng) && (
                  <FontAwesome name="check" size={16} color={colors.accent} />
                )}
              </Pressable>
            );
          }

          if (item._type === "scenario") {
            const scenario = scenarios.find((s) => s.id === item.id);
            const hasStops = scenario?.resourceStops.some((r) => r.enabled);
            return (
              <Pressable
                style={[
                  styles.resultRow,
                  isSelected(item.lat, item.lng) && styles.selectedRow,
                ]}
                onPress={() => {
                  selectDestination(
                    { lat: item.lat, lng: item.lng },
                    item.name,
                  );
                  setSelectedScenario(scenario ?? null);
                }}
                accessibilityRole="button"
              >
                <View style={styles.resultContent}>
                  <Text style={styles.resultText}>
                    <FontAwesome name="bookmark" size={13} color={colors.accent} />{" "}
                    {item.name}
                  </Text>
                  {hasStops ? <Text style={styles.scenarioMeta}>
                      Includes resource stops
                    </Text> : null}
                </View>
                {isSelected(item.lat, item.lng) && (
                  <FontAwesome name="check" size={16} color={colors.accent} />
                )}
              </Pressable>
            );
          }

          // Recent
          return (
            <Pressable
              style={[
                styles.resultRow,
                isSelected(item.lat, item.lng) && styles.selectedRow,
              ]}
              onPress={() =>
                { selectDestination(
                  { lat: item.lat, lng: item.lng },
                  item.label,
                ); }
              }
              accessibilityRole="button"
            >
              <View style={styles.resultContent}>
                <Text style={styles.resultText}>
                  <FontAwesome name="clock-o" size={13} color={colors.textMuted} />{" "}
                  {item.label}
                </Text>
              </View>
              {isSelected(item.lat, item.lng) && (
                <FontAwesome name="check" size={16} color={colors.accent} />
              )}
            </Pressable>
          );
        }}
      />

      {/* Status messages */}
      {gettingLocation ? <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.statusText}>Getting your location...</Text>
        </View> : null}
      {!gettingLocation && !position && locationError ? <Pressable accessibilityRole="button"
          style={styles.statusRow}
          onPress={() => getPosition()}
        >
          <FontAwesome name="exclamation-circle" size={14} color={colors.warning} />
          <Text style={styles.statusText}>
            Location unavailable — tap to retry
          </Text>
        </Pressable> : null}
      {!gettingLocation && position && !selectedDest ? <Text style={styles.statusText}>
          Search for an address or select a scenario above
        </Text> : null}
      {selectedDest && position ? <Text style={styles.statusText}>
          Ready to route
        </Text> : null}

      {/* Confirm button — always tappable, shows alerts if not ready */}
      <Pressable
        style={[
          styles.confirmButton,
          !selectedDest && styles.confirmDisabled,
        ]}
        onPress={confirmRoute}
        accessibilityLabel="Calculate route and start navigation"
        accessibilityHint="Calculates the evacuation route to the selected destination and opens the route preview"
        accessibilityRole="button"
        testID="route-and-go-button"
      >
        <FontAwesome name="location-arrow" size={16} color={colors.background} />
        <Text style={styles.confirmText}>Route & Go</Text>
      </Pressable>
    </View>
  );
}

/** Build a short display name from Nominatim address details. */
function buildShortName(
  address: Record<string, string | undefined> | undefined,
  fallback: string,
): string {
  if (!address) return fallback.split(",")[0] ?? fallback;

  const parts: string[] = [];
  if (address.house_number && address.road) {
    parts.push(`${address.house_number} ${address.road}`);
  } else if (address.road) {
    parts.push(address.road);
  }

  const city = address.city ?? address.town ?? address.village;
  if (city) parts.push(city);
  if (address.state) parts.push(address.state);

  return parts.length > 0 ? parts.join(", ") : (fallback.split(",")[0] ?? fallback);
}

/** Build the heterogeneous list data. */
function buildListData(
  results: GeocodingResult[],
  scenarios: Scenario[],
  recents: RecentDestinationRow[],
) {
  return [
    ...results.map((r) => ({
      _type: "search" as const,
      id: `search-${r.lat}-${r.lng}`,
      ...r,
    })),
    ...(scenarios.length > 0
      ? [
          {
            _type: "header" as const,
            id: "__scenarios__",
            label: "Saved Scenarios",
            lat: 0,
            lng: 0,
          },
        ]
      : []),
    ...scenarios.map((s) => ({
      _type: "scenario" as const,
      id: s.id,
      name: s.name,
      lat: s.destination.lat,
      lng: s.destination.lng,
    })),
    ...(recents.length > 0
      ? [
          {
            _type: "header" as const,
            id: "__recents__",
            label: "Recent Destinations",
            lat: 0,
            lng: 0,
          },
        ]
      : []),
    ...recents.map((r) => ({
      _type: "recent" as const,
      id: r.id,
      label: r.label ?? `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`,
      lat: r.lat,
      lng: r.lng,
    })),
  ];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    minHeight: touchTarget.minHeight,
  },
  clearButton: {
    padding: spacing.sm,
  },
  spinner: {
    marginTop: spacing.md,
  },
  noResults: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    justifyContent: "center",
  },
  noResultsText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  list: {
    flex: 1,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.xs,
    minHeight: touchTarget.minHeight,
  },
  selectedRow: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
  resultContent: {
    flex: 1,
  },
  resultText: {
    ...typography.body,
  },
  resultDetail: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  scenarioMeta: {
    ...typography.caption,
    color: colors.accent,
    marginTop: 2,
  },
  confirmButton: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTarget.minHeight,
    marginTop: spacing.md,
  },
  confirmDisabled: {
    opacity: 0.5,
    backgroundColor: colors.border,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.background,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  statusText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.xs,
  },
});
