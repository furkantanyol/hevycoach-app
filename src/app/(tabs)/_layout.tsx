/**
 * Coach, Plan, Progress, Profile. No icon set ships with the app and the brief
 * forbids invented chrome, so the labels carry the tab bar on their own: the
 * icon slot is left empty and each item centres its label instead.
 */
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet } from 'react-native';

import { useTheme } from '../../components/assistant-ui/theme';

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        tabBarItemStyle: styles.item,
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tabs.Screen name="coach" options={{ title: 'Coach' }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  item: {
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});
