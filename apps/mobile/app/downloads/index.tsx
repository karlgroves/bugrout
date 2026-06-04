/**
 * Offline Maps Download Manager
 *
 * Allows users to download regional tile packages for offline use.
 * Shows download progress, storage usage, and stale tile warnings.
 */

import { useState } from "react";
import { StyleSheet, View, Text, Pressable, FlatList, Alert } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { Region, DownloadedRegion } from "@bugrout/shared";
import { getCountyGroups } from "@/constants/counties";
import { useTileManager } from "@/hooks/useTileManager";
import { isRegionStale, isExpoGo } from "@/services/tiles/TileManager";
import { colors, spacing, typography, touchTarget } from "@/constants/theme";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function DownloadsScreen() {
  const {
    downloadedRegions,
    availableRegions,
    activeDownload,
    storageUsed,
    storageAvailable,
    downloadRegion,
    deleteRegion,
  } = useTileManager();

  const downloadedIds = new Set(downloadedRegions.map((r) => r.id));
  const notDownloaded = availableRegions.filter(
    (r) => !downloadedIds.has(r.id),
  );
  const [expandedState, setExpandedState] = useState<string | null>(null);

  const handleDownload = async (region: Region) => {
    try {
      await downloadRegion(region);
    } catch (error) {
      Alert.alert(
        "Download Failed",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  };

  const handleDelete = (region: DownloadedRegion) => {
    Alert.alert(
      "Delete Offline Map",
      `Delete ${region.name}? You will need to re-download it for offline use.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteRegion(region.id),
        },
      ],
    );
  };

  return (
    <FlatList
      style={styles.container}
      ListHeaderComponent={
        <View>
          {isExpoGo() && (
            <View style={styles.expoGoBanner}>
              <FontAwesome name="info-circle" size={16} color={colors.info} />
              <Text style={styles.expoGoBannerText}>
                Downloads are not available in Expo Go. Create a dev build
                to enable offline maps:{"\n"}
                <Text style={styles.expoGoCommand}>
                  eas build --profile development
                </Text>
              </Text>
            </View>
          )}

          <Text style={styles.description}>
            Download offline maps to navigate without any data connection.
            Maps include routing data, fuel stations, water sources, and shelters.
          </Text>

          {/* Storage info */}
          {!isExpoGo() && (
            <View style={styles.storageBar}>
              <Text style={styles.storageText}>
                Using {formatBytes(storageUsed)} ·{" "}
                {formatBytes(storageAvailable)} available
              </Text>
            </View>
          )}

          {/* Active download progress */}
          {activeDownload && (
            <View style={styles.progressCard}>
              <Text style={styles.progressLabel}>
                Downloading... {activeDownload.percent.toFixed(0)}%
              </Text>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${activeDownload.percent}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressDetail}>
                {formatBytes(activeDownload.bytesDownloaded)} /{" "}
                {formatBytes(activeDownload.totalBytes)}
              </Text>
            </View>
          )}

          {/* Downloaded regions */}
          {downloadedRegions.length > 0 && (
            <Text style={styles.sectionTitle}>Downloaded</Text>
          )}
        </View>
      }
      data={[
        ...downloadedRegions.map((r) => ({ ...r, _type: "downloaded" as const })),
        ...(notDownloaded.length > 0
          ? [{ _type: "header" as const, id: "__header__" }]
          : []),
        ...notDownloaded.map((r) => ({ ...r, _type: "available" as const })),
      ]}
      keyExtractor={(item) => ("id" in item ? item.id : "__header__")}
      renderItem={({ item }) => {
        if (item._type === "header") {
          return <Text style={styles.sectionTitle}>Available</Text>;
        }

        if (item._type === "downloaded") {
          const region = item as DownloadedRegion & { _type: string };
          const stale = isRegionStale(region);
          return (
            <View style={styles.regionCard}>
              <View style={styles.regionInfo}>
                <View style={styles.regionHeader}>
                  <Text style={styles.regionName}>{region.name}</Text>
                  {stale && (
                    <View style={styles.staleBadge}>
                      <Text style={styles.staleText}>Update available</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.regionMeta}>
                  {formatBytes(region.sizeBytes)} · Downloaded{" "}
                  {new Date(region.downloadedAt).toLocaleDateString()}
                </Text>
              </View>
              <Pressable
                testID={`delete-region-${region.id}`}
                style={styles.deleteButton}
                onPress={() => handleDelete(region)}
                accessibilityLabel={`Delete ${region.name} offline map`}
                accessibilityRole="button"
              >
                <FontAwesome name="trash-o" size={18} color={colors.danger} />
              </Pressable>
            </View>
          );
        }

        const region = item as Region & { _type: string };
        const totalSize = region.pmtilesSize + region.valhallaSize;
        const isDownloading = activeDownload?.regionId === region.id;
        const countyGroups = getCountyGroups(region.id);
        const isExpanded = expandedState === region.id;

        return (
          <View>
            <View style={styles.regionCard}>
              <View style={styles.regionInfo}>
                <Text style={styles.regionName}>{region.name}</Text>
                <Text style={styles.regionMeta}>
                  Full state ~{formatBytes(totalSize)}
                  {countyGroups.length > 0 &&
                    ` · ${countyGroups.length} county groups available`}
                </Text>
              </View>
              <View style={styles.regionActions}>
                {countyGroups.length > 0 && (
                  <Pressable
                    style={styles.expandButton}
                    onPress={() =>
                      setExpandedState(isExpanded ? null : region.id)
                    }
                    accessibilityLabel={
                      isExpanded
                        ? `Collapse ${region.name} county groups`
                        : `Show ${region.name} county groups`
                    }
                  >
                    <FontAwesome
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={14}
                      color={colors.textMuted}
                    />
                  </Pressable>
                )}
                <Pressable
                  testID={`download-region-${region.id}`}
                  style={[
                    styles.downloadButton,
                    isDownloading && styles.downloadButtonDisabled,
                  ]}
                  onPress={() => !isDownloading && handleDownload(region)}
                  disabled={isDownloading}
                  accessibilityLabel={`Download ${region.name} full state`}
                  accessibilityRole="button"
                >
                  <FontAwesome
                    name="download"
                    size={18}
                    color={
                      isDownloading ? colors.textMuted : colors.textPrimary
                    }
                  />
                </Pressable>
              </View>
            </View>

            {/* County group sub-rows */}
            {isExpanded &&
              countyGroups.map((cg) => (
                <View key={cg.id} style={styles.countyRow}>
                  <View style={styles.regionInfo}>
                    <Text style={styles.countyName}>{cg.name}</Text>
                    <Text style={styles.regionMeta}>
                      ~{cg.estimatedSizeMB} MB · {cg.counties.length} counties
                    </Text>
                  </View>
                  <Pressable
                    style={styles.downloadButton}
                    accessibilityLabel={`Download ${cg.name} county group`}
                    accessibilityRole="button"
                  >
                    <FontAwesome
                      name="download"
                      size={16}
                      color={colors.textPrimary}
                    />
                  </Pressable>
                </View>
              ))}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  expoGoBanner: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderWidth: 1,
    borderColor: colors.info,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  expoGoBannerText: {
    ...typography.caption,
    color: colors.info,
    flex: 1,
    lineHeight: 20,
  },
  expoGoCommand: {
    fontFamily: "monospace",
    fontWeight: "700" as const,
    color: colors.textPrimary,
  },
  description: {
    ...typography.caption,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  storageBar: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  storageText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  progressCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  progressLabel: {
    ...typography.body,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 6,
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  progressDetail: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  regionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.sm,
  },
  regionInfo: {
    flex: 1,
  },
  regionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  regionName: {
    ...typography.body,
    fontWeight: "600",
  },
  regionMeta: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  staleBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  staleText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.background,
  },
  downloadButton: {
    width: touchTarget.minWidth,
    height: touchTarget.minHeight,
    borderRadius: 8,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  downloadButtonDisabled: {
    opacity: 0.4,
  },
  regionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  expandButton: {
    width: 32,
    height: touchTarget.minHeight,
    justifyContent: "center",
    alignItems: "center",
  },
  countyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: spacing.md,
    paddingLeft: spacing.xl,
    borderRadius: 8,
    marginBottom: spacing.xs,
    borderLeftWidth: 3,
    borderLeftColor: colors.accentMuted,
  },
  countyName: {
    ...typography.body,
    fontSize: 14,
  },
  deleteButton: {
    width: touchTarget.minWidth,
    height: touchTarget.minHeight,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});
