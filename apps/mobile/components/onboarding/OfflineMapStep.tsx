/**
 * Onboarding's last step: get the offline map downloaded (#199).
 *
 * Spec §10: "Users who don't pre-load are unprotected when it matters." This
 * step suggests the user's region from their location, shows its size before
 * anything downloads (§6.2), and starts the download in one tap. Skipping is
 * allowed; the caller schedules a reminder, and the map keeps its download
 * banner until a region is on the device.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { findRegionForPoint } from "@/constants/regions";
import {
  buttons,
  colors,
  spacing,
  touchTarget,
  typography,
} from "@/constants/theme";
import { useTileManager } from "@/hooks/useTileManager";
import { getNetworkStateAsync } from "@/platform/network";
import { getCurrentPosition } from "@/services/location/LocationTracker";
import { formatBytes } from "@/utils/bytes";

import type { Region } from "@bugrout/shared";

/**
 * Props for {@link OfflineMapStep}.
 */
interface OfflineMapStepProps {
  /** Whether location permission was granted on the previous step. */
  locationGranted: boolean;
  /** Leave onboarding; `downloadStarted` says whether a download is running. */
  onFinish: (downloadStarted: boolean) => void;
}

/** A region's full download size. */
function sizeOf(region: Region): number {
  return region.pmtilesSize + region.valhallaSize;
}

/**
 * The id of the region the user is in, when location was allowed and a fix
 * arrives; null otherwise.
 */
function useHereRegionId(locationGranted: boolean): string | null {
  const [hereId, setHereId] = useState<string | null>(null);
  useEffect(() => {
    if (!locationGranted) return;
    getCurrentPosition()
      .then(({ position }) => {
        setHereId(findRegionForPoint(position.lat, position.lng)?.id ?? null);
      })
      .catch(() => {
        // No fix: offer the list instead of a suggestion.
      });
  }, [locationGranted]);
  return hereId;
}

/** Whether the device is on mobile data, as far as the platform can tell. */
function useOnCellular(): boolean {
  const [onCellular, setOnCellular] = useState(false);
  useEffect(() => {
    getNetworkStateAsync()
      .then((state) => {
        setOnCellular(state.type === "CELLULAR");
      })
      .catch(() => {
        // Unknown connection type: say nothing about mobile data.
      });
  }, []);
  return onCellular;
}

/**
 * The download button for one region, labelled with its size (§6.2: the size
 * must be clear before downloading).
 */
function RegionDownloadButton({
  region,
  onPress,
}: {
  region: Region;
  onPress: (region: Region) => void;
}): React.JSX.Element {
  const label = `Download ${region.name}, ${formatBytes(sizeOf(region))}`;
  return (
    <Pressable
      style={styles.primaryButton}
      onPress={() => {
        onPress(region);
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Starts downloading this region's offline map"
      testID={`onboarding-download-${region.id}`}
    >
      <FontAwesome name="download" size={16} color={colors.background} />
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

/** Progress of the download this step started. */
function DownloadStatus({
  region,
  percent,
}: {
  region: Region;
  percent: number | null;
}): React.JSX.Element {
  return (
    <Text
      style={styles.progress}
      accessibilityLiveRegion="polite"
      testID="onboarding-download-progress"
    >
      Downloading {region.name}
      {percent === null ? "…" : ` — ${percent.toFixed(0)}%`}. It keeps going
      after you continue.
    </Text>
  );
}

/** Notes that only apply sometimes: no maps for here yet, or mobile data. */
function StepNotes({
  unpublishedHere,
  onCellular,
}: {
  unpublishedHere: boolean;
  onCellular: boolean;
}): React.JSX.Element {
  return (
    <>
      {unpublishedHere ? (
        <Text style={styles.note}>
          Maps for where you are aren&apos;t published yet. You can download one
          of these now.
        </Text>
      ) : null}
      {onCellular ? (
        <Text style={styles.note} testID="onboarding-cellular-note">
          You&apos;re on mobile data. Downloads are large; use Wi-Fi if you can,
          or choose &quot;Get Started&quot; and download later.
        </Text>
      ) : null}
    </>
  );
}

/**
 * The offline-map step: a suggested region (or a choice), its size, and a
 * one-tap download.
 */
export function OfflineMapStep({
  locationGranted,
  onFinish,
}: OfflineMapStepProps): React.JSX.Element {
  const { availableRegions, downloadRegion, activeDownload } = useTileManager();
  const hereId = useHereRegionId(locationGranted);
  const onCellular = useOnCellular();
  const [started, setStarted] = useState<Region | null>(null);
  const [failed, setFailed] = useState(false);

  const suggested = availableRegions.find((r) => r.id === hereId) ?? null;
  const choices = suggested ? [suggested] : availableRegions;

  const start = (region: Region): void => {
    setStarted(region);
    setFailed(false);
    downloadRegion(region).catch(() => {
      setFailed(true);
      setStarted(null);
    });
  };

  return (
    <View style={styles.container}>
      <FontAwesome name="download" size={56} color={colors.accent} />
      <Text style={styles.title} accessibilityRole="header" aria-level={1}>
        Offline Maps
      </Text>
      <Text style={styles.body}>
        Download your state&apos;s map now, while you have signal. Without it,
        BugRout can&apos;t show you a map when the network is down.
      </Text>
      <StepNotes
        unpublishedHere={hereId !== null && suggested === null}
        onCellular={started === null ? onCellular : false}
      />
      {started === null ? (
        choices.map((region) => (
          <RegionDownloadButton
            key={region.id}
            region={region}
            onPress={start}
          />
        ))
      ) : (
        <DownloadStatus
          region={started}
          percent={activeDownload?.percent ?? null}
        />
      )}
      {failed ? (
        <Text style={styles.note} accessibilityRole="alert">
          The download didn&apos;t finish. You can try again here, or later from
          Offline Maps.
        </Text>
      ) : null}
      <Pressable
        style={styles.skipButton}
        onPress={() => {
          onFinish(started !== null);
        }}
        accessibilityRole="button"
        accessibilityLabel="Get Started"
        accessibilityHint={
          started === null
            ? "Opens the map; you can download offline maps later"
            : "Opens the map while the download continues"
        }
      >
        <Text style={styles.skipText}>Get Started</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  title: {
    ...typography.heading,
    marginTop: spacing.lg,
    textAlign: "center",
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginTop: spacing.md,
    maxWidth: 320,
  },
  note: {
    ...typography.caption,
    color: colors.warning,
    textAlign: "center",
    marginTop: spacing.md,
    maxWidth: 320,
  },
  progress: {
    ...typography.body,
    color: colors.textPrimary,
    textAlign: "center",
    marginTop: spacing.xl,
  },
  primaryButton: buttons.primary,
  primaryButtonText: buttons.primaryText,
  // "Get Started" leaves onboarding either way, so it reads as the quieter
  // choice beside a download, as "Skip for now" does on the step before.
  skipButton: {
    ...buttons.skip,
    minHeight: touchTarget.minHeight,
    justifyContent: "center",
  },
  // textSecondary, not the shared skip text's textMuted: muted grey on the
  // background is about 4:1, under the 4.5:1 body text needs.
  skipText: { ...buttons.skipText, color: colors.textSecondary },
});
