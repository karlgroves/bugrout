/**
 * Map Detail Sheet
 *
 * Bottom-sheet modal shell used when a map feature is tapped. The threat
 * overlay and the resource markers both open one of these, and previously each
 * carried its own copy of the modal, the backdrop, the card and the close
 * button — including the 44pt touch target on that button.
 */

import { StyleSheet, View, Text, Pressable, Modal } from "react-native";

import { colors, spacing, typography, touchTarget } from "@/constants/theme";

/**
 * Props for {@link MapDetailSheet}.
 */
interface MapDetailSheetProps {
  /** Whether the sheet is open. Usually `selected !== null`. */
  visible: boolean;
  /** Dismisses the sheet. Wired to both the close button and hardware back. */
  onClose: () => void;
  /**
   * Accessible name for the close button, e.g. `"Close threat details"`.
   * Required rather than defaulted: each sheet names what it is closing, and a
   * generic "Close" is noticeably worse with a screen reader.
   */
  closeLabel: string;
  /** Accessible hint for the close button. */
  closeHint: string;
  /** Caps the card at half the screen. Use for content that can run long. */
  capHeight?: boolean;
  /**
   * Card contents. Callers pass a conditional here (`selected ? <>…</> : null`)
   * so the card renders empty rather than half-populated while the modal
   * animates out — when this is null the close button is withheld too.
   */
  children: React.ReactNode;
}

/**
 * Bottom-sheet container for map feature details.
 */
export function MapDetailSheet({
  visible,
  onClose,
  closeLabel,
  closeHint,
  capHeight = false,
  children,
}: MapDetailSheetProps): React.JSX.Element {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={capHeight ? [styles.card, styles.cardCapped] : styles.card}
        >
          {children ? (
            <>
              {children}

              <Pressable
                style={styles.closeButton}
                onPress={onClose}
                accessibilityLabel={closeLabel}
                accessibilityHint={closeHint}
                accessibilityRole="button"
              >
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  },
  cardCapped: {
    maxHeight: "50%",
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
