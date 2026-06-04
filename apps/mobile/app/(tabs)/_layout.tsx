import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs } from "expo-router";

import { colors, touchTarget } from "@/constants/theme";

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}): React.JSX.Element {
  return <FontAwesome size={24} style={{ marginBottom: -3 }} {...props} />;
}

function MapTabIcon({ color }: { color: string }): React.JSX.Element {
  return <TabBarIcon name="map" color={color} />;
}

function ScenariosTabIcon({ color }: { color: string }): React.JSX.Element {
  return <TabBarIcon name="bookmark" color={color} />;
}

function SettingsTabIcon({ color }: { color: string }): React.JSX.Element {
  return <TabBarIcon name="cog" color={color} />;
}

/** Bottom tab navigator wiring the Map, Scenarios, and Settings screens. */
export default function TabLayout(): React.JSX.Element {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          minHeight: touchTarget.minHeight + 16,
        },
        headerStyle: {
          backgroundColor: colors.surface,
        },
        headerTintColor: colors.textPrimary,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Map",
          headerShown: false,
          tabBarIcon: MapTabIcon,
        }}
      />
      <Tabs.Screen
        name="scenarios"
        options={{
          title: "Scenarios",
          tabBarIcon: ScenariosTabIcon,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: SettingsTabIcon,
        }}
      />
    </Tabs>
  );
}
