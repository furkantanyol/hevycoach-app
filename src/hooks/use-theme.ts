import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

function useAppearance(): 'light' | 'dark' {
  // `useColorScheme` reports 'unspecified' before the OS answers; paper is the honest default.
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

export function useTheme() {
  return Colors[useAppearance()];
}

/**
 * The navigation chrome is part of the sheet, not a frame around it: headers and the tab bar sit
 * on the same ground, separated by the same hairline rule. The marker is not offered here — it
 * belongs to "today" alone, and a tint colour would spend it on every back button.
 */
export function useNavigationTheme(): Theme {
  const scheme = useAppearance();
  const palette = Colors[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return {
    ...base,
    colors: {
      ...base.colors,
      background: palette.ground,
      card: palette.ground,
      text: palette.ink,
      border: palette.rule,
      primary: palette.ink,
      notification: palette.ink,
    },
  };
}
