/**
 * Maneuver Icon Component
 *
 * Renders a directional arrow for turn-by-turn navigation.
 * Uses React Native Views to draw arrows without requiring SVG dependency,
 * keeping the bundle lean for offline use.
 */

import { StyleSheet, View } from "react-native";
import { colors } from "@/constants/theme";

type Direction =
  | "straight"
  | "slight-right"
  | "right"
  | "sharp-right"
  | "uturn"
  | "sharp-left"
  | "left"
  | "slight-left"
  | "arrive"
  | "depart"
  | "roundabout"
  | "merge"
  | "fork";

interface ManeuverIconProps {
  type: string;
  size?: number;
  color?: string;
}

const TYPE_TO_DIRECTION: Record<string, Direction> = {
  depart: "depart",
  "depart-right": "depart",
  "depart-left": "depart",
  arrive: "arrive",
  "arrive-right": "arrive",
  "arrive-left": "arrive",
  continue: "straight",
  straight: "straight",
  "turn-slight-right": "slight-right",
  "turn-right": "right",
  "turn-sharp-right": "sharp-right",
  "uturn-right": "uturn",
  "uturn-left": "uturn",
  "turn-sharp-left": "sharp-left",
  "turn-left": "left",
  "turn-slight-left": "slight-left",
  "ramp-straight": "straight",
  "ramp-right": "slight-right",
  "ramp-left": "slight-left",
  "exit-right": "slight-right",
  "exit-left": "slight-left",
  "merge-left": "merge",
  "merge-right": "merge",
  "roundabout-enter": "roundabout",
  "roundabout-exit": "right",
  "fork-right": "slight-right",
  "fork-left": "slight-left",
  none: "straight",
};

/** Rotation degrees for each direction */
const DIRECTION_ROTATION: Record<Direction, number> = {
  straight: 0,
  "slight-right": 30,
  right: 90,
  "sharp-right": 135,
  uturn: 180,
  "sharp-left": -135,
  left: -90,
  "slight-left": -30,
  arrive: 0,
  depart: 0,
  roundabout: 0,
  merge: 0,
  fork: 0,
};

export function ManeuverIcon({
  type,
  size = 32,
  color = colors.accent,
}: ManeuverIconProps) {
  const direction = TYPE_TO_DIRECTION[type] ?? "straight";
  const rotation = DIRECTION_ROTATION[direction];

  if (direction === "arrive") {
    return (
      <View style={[styles.iconContainer, { width: size, height: size }]}>
        <View
          style={[
            styles.arriveMarker,
            {
              width: size * 0.5,
              height: size * 0.5,
              borderRadius: size * 0.25,
              borderColor: color,
              borderWidth: size * 0.08,
            },
          ]}
        >
          <View
            style={[
              styles.arriveDot,
              {
                width: size * 0.2,
                height: size * 0.2,
                borderRadius: size * 0.1,
                backgroundColor: color,
              },
            ]}
          />
        </View>
      </View>
    );
  }

  if (direction === "roundabout") {
    return (
      <View style={[styles.iconContainer, { width: size, height: size }]}>
        <View
          style={[
            styles.roundabout,
            {
              width: size * 0.6,
              height: size * 0.6,
              borderRadius: size * 0.3,
              borderColor: color,
              borderWidth: size * 0.06,
            },
          ]}
        />
        {/* Arrow pointing right out of roundabout */}
        <View
          style={[
            styles.roundaboutArrow,
            {
              right: size * 0.1,
              top: size * 0.35,
              borderTopWidth: size * 0.12,
              borderBottomWidth: size * 0.12,
              borderLeftWidth: size * 0.15,
              borderLeftColor: color,
            },
          ]}
        />
      </View>
    );
  }

  // Default arrow — rotated based on direction
  const arrowHeight = size * 0.55;
  const arrowWidth = size * 0.35;
  const stemHeight = size * 0.35;
  const stemWidth = size * 0.12;

  return (
    <View style={[styles.iconContainer, { width: size, height: size }]}>
      <View
        style={[
          styles.arrowWrapper,
          { transform: [{ rotate: `${rotation}deg` }] },
        ]}
      >
        {/* Arrow head (triangle) */}
        <View
          style={[
            styles.arrowHead,
            {
              borderBottomWidth: arrowHeight,
              borderLeftWidth: arrowWidth,
              borderRightWidth: arrowWidth,
              borderBottomColor: color,
            },
          ]}
        />
        {/* Arrow stem */}
        <View
          style={[
            styles.arrowStem,
            {
              width: stemWidth,
              height: stemHeight,
              backgroundColor: color,
              marginTop: -2,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  arrowWrapper: {
    alignItems: "center",
  },
  arrowHead: {
    width: 0,
    height: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  arrowStem: {
    borderRadius: 2,
  },
  arriveMarker: {
    justifyContent: "center",
    alignItems: "center",
  },
  arriveDot: {},
  roundabout: {
    position: "absolute",
  },
  roundaboutArrow: {
    position: "absolute",
    width: 0,
    height: 0,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderRightColor: "transparent",
  },
});
