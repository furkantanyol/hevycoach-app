import { Redirect, Tabs } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { useSettingsStore } from '@/features/settings/settings-store';
import { useSettingsHydrated } from '@/features/settings/use-settings-hydrated';
import { useTheme } from '@/hooks/use-theme';

const TAB_ICON_SIZE = 26;

/** Built once per symbol: a fresh component each render would remount the icon every time. */
function tabBarIcon(name: SFSymbol) {
  return function TabBarIcon({ color }: { color: ColorValue }) {
    return <SymbolView name={name} size={TAB_ICON_SIZE} tintColor={color} fallback={null} />;
  };
}

const TODAY_ICON = tabBarIcon('figure.strengthtraining.traditional');
const PROGRAM_ICON = tabBarIcon('calendar');
const REVIEW_ICON = tabBarIcon('chart.line.uptrend.xyaxis');
const SETTINGS_ICON = tabBarIcon('gearshape');

/**
 * The four top-level sections, and the two gates in front of them. Both gates are checked here
 * rather than per screen so there is one place that decides whether the app is usable.
 */
export default function TabsLayout() {
  const hydrated = useSettingsHydrated();
  const hasOnboarded = useSettingsStore((state) => state.hasOnboarded);
  const proStatus = useSettingsStore((state) => state.proStatus);
  const theme = useTheme();

  if (!hydrated) {
    return null;
  }
  if (!hasOnboarded) {
    return <Redirect href="/onboarding" />;
  }
  // Only a verdict redirects. `unknown` — an outage, or no key saved yet — leaves the app open.
  if (proStatus === 'not-pro') {
    return <Redirect href="/pro" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textSecondary,
      }}
    >
      <Tabs.Screen name="(today)" options={{ title: 'Today', tabBarIcon: TODAY_ICON }} />
      <Tabs.Screen name="program" options={{ title: 'Program', tabBarIcon: PROGRAM_ICON }} />
      <Tabs.Screen name="review" options={{ title: 'Review', tabBarIcon: REVIEW_ICON }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: SETTINGS_ICON }} />
    </Tabs>
  );
}
