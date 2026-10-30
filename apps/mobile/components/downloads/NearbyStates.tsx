/**
 * Nearby states, offered under a region that is already downloaded (#268).
 *
 * ADR 0008's M2. An evacuation crosses a state line as a matter of course, and
 * the download has to happen while there is still signal — so the neighbours
 * are put in front of the user at the moment they have just proved they want
 * offline maps, with each size shown before anything is downloaded.
 *
 * Three decisions worth recording, because each one is a thing it would be
 * easy to get wrong:
 *
 *   1. **A section, not a modal.** #268 asks for "a download prompt". A prompt
 *      that interrupts would be a modal, and Maryland has five neighbours —
 *      more than the three buttons a React Native `Alert` gives you, so the
 *      fifth would have to hide behind a second screen. The section sits where
 *      the user already is, every option is reachable in one tap, and
 *      *declining is doing nothing*, which is what "declining leaves current
 *      behaviour untouched" should feel like. No countdown, no pre-selection,
 *      nothing dismissed on the user's behalf.
 *   2. **It says what it does not do.** Downloading Virginia extends the map
 *      and the bbox the save-time coverage check tests, but the routing graph
 *      is Maryland-only until #267. #268's last criterion is that "the map
 *      extending past the border must not imply a route exists there", so the
 *      footnote says so in the user's words rather than leaving the silence to
 *      imply otherwise.
 *   3. **An unpublished neighbour is named without a size or a button.** It is
 *      not offered as a download that would fail, and no estimate is dressed
 *      up as a measurement — which is also what #147 asks the downloads screen
 *      to do for a region that is listed but not yet published.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, spacing, touchTarget, typography } from "@/constants/theme";
import { formatBytes } from "@/utils/bytes";

import type { NeighborOffers } from "@/services/tiles/Neighbors";
import type { Region } from "@bugrout/shared";

/** Props for {@link NearbyStates}. */
interface NearbyStatesProps {
  /** The already-downloaded region these are next to. */
  regionName: string;
  /** What to offer, from `neighborOffers`. */
  offers: NeighborOffers;
  /** Start a download. */
  onDownload: (region: Region) => void;
  /** True while any download is running, which disables the buttons. */
  busy: boolean;
}

/**
 * The "Nearby states" section for one downloaded region.
 *
 * @param props - See {@link NearbyStatesProps}.
 * @returns The section, or nothing when there is no neighbour left to mention.
 */
export function NearbyStates({
  regionName,
  offers,
  onDownload,
  busy,
}: NearbyStatesProps): React.JSX.Element | null {
  if (offers.offers.length === 0 && offers.unpublished.length === 0) {
    return null;
  }

  return (
    <View style={styles.container} testID={`nearby-states-${regionName}`}>
      <Text style={styles.heading} accessibilityRole="header">
        Nearby states
      </Text>
      <Text style={styles.intro}>
        Evacuations cross state lines. Download these now, while you have a
        connection.
      </Text>

      {offers.offers.map(({ region, sizeBytes }) => (
        <View key={region.id} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.name}>{region.name}</Text>
            <Text style={styles.size}>{formatBytes(sizeBytes)}</Text>
          </View>
          {/*
            The name and size sit OUTSIDE the button on purpose. With them
            inside it, the button's visible text reads "Virginia 150.0 MB
            Download" while its accessible name reads "Download Virginia,
            150.0 MB" — the same words in a different order, which fails WCAG
            2.5.3 (Label in Name) and breaks voice control: "tap Virginia
            150 megabytes Download" is not something anyone says.
            `__tests__/a11y/labelInName.test.ts` is a ratchet on exactly this
            and caught it. Now the button's visible label is the single word
            "Download", which its accessible name contains.
          */}
          <Pressable
            style={styles.button}
            onPress={() => {
              onDownload(region);
            }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            // Concatenation rather than a template literal so that
            // `__tests__/a11y/labelInName.test.ts` can read the fixed
            // part statically. A template reduces to no string literal,
            // which puts the control in that test's "unreadable names"
            // blind spot — fine for the icon-only Update and Delete
            // buttons already counted there, which have no visible label
            // to compare, but not for this one, which does. This way the
            // name is checked against its visible "Download" rather than
            // excused from the comparison.
            accessibilityLabel={
              "Download " + region.name + ", " + formatBytes(sizeBytes)
            }
            accessibilityHint="Downloads this neighbouring state's offline map"
          >
            <Text style={styles.action}>Download</Text>
          </Pressable>
        </View>
      ))}

      {offers.unpublished.map(({ id, name }) => (
        <View key={id} style={styles.row} accessible>
          <View style={styles.rowText}>
            <Text style={styles.nameMuted}>{name}</Text>
            <Text style={styles.size}>Not published yet</Text>
          </View>
        </View>
      ))}

      <Text style={styles.footnote}>
        These add the map only. Routing outside {regionName} still needs a
        connection.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  heading: {
    ...typography.subheading,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  intro: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  row: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: touchTarget.minHeight,
    paddingVertical: spacing.sm,
  },
  rowText: {
    flex: 1,
  },
  name: {
    ...typography.body,
    color: colors.textPrimary,
  },
  nameMuted: {
    ...typography.body,
    color: colors.textSecondary,
  },
  size: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTarget.minHeight,
    minWidth: touchTarget.minHeight,
    paddingHorizontal: spacing.sm,
  },
  action: {
    ...typography.body,
    color: colors.accent,
  },
  footnote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});
