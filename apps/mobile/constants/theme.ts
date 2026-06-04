/**
 * BugRout high-contrast stress-state theme.
 * Designed for readability under duress: scared, hurried, sleep-deprived users.
 * Minimum 44pt touch targets. WCAG AA contrast ratios.
 */

export const colors = {
  // Core
  background: "#0d0d0d",
  surface: "#1a1a1a",
  surfaceElevated: "#262626",
  border: "#404040",

  // Text
  textPrimary: "#f5f5f5",
  textSecondary: "#a3a3a3",
  textMuted: "#737373",

  // Brand
  accent: "#22c55e", // Green — safe, go, online
  accentMuted: "#166534",

  // Status
  online: "#22c55e",
  offline: "#737373",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",

  // Threat overlays
  threatFire: "rgba(239, 68, 68, 0.35)",
  threatFireBorder: "#ef4444",
  threatFlood: "rgba(59, 130, 246, 0.35)",
  threatFloodBorder: "#3b82f6",
  threatWeather: "rgba(168, 85, 247, 0.35)",
  threatWeatherBorder: "#a855f7",

  // Resource markers
  resourceFuel: "#f59e0b",
  resourceWater: "#3b82f6",
  resourceShelter: "#8b5cf6",

  // Navigation
  routeLine: "#22c55e",
  routeLineAlt: "#737373",
  maneuverHighlight: "#f59e0b",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const typography = {
  heading: {
    fontSize: 24,
    fontWeight: "700" as const,
    color: colors.textPrimary,
  },
  subheading: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: colors.textPrimary,
  },
  body: {
    fontSize: 16,
    fontWeight: "400" as const,
    color: colors.textPrimary,
  },
  caption: {
    fontSize: 14,
    fontWeight: "400" as const,
    color: colors.textSecondary,
  },
  maneuver: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: colors.textPrimary,
  },
} as const;

// Minimum 44pt touch targets per Apple HIG and spec requirement
export const touchTarget = {
  minHeight: 44,
  minWidth: 44,
} as const;

// FAB (Bug Out button) — oversized for emergency use
export const fab = {
  size: 72,
  iconSize: 32,
  backgroundColor: colors.danger,
  color: colors.textPrimary,
} as const;
