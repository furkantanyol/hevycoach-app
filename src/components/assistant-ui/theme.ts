/**
 * Hevy's own values, sampled from the owner's screenshots and recorded in
 * `.impeccable/surfaces/src-app-index-tsx.md`: ground #FFFFFF, text #010A26,
 * secondary #959A9F, pills and fills #F4F5F8, the card border #E9EAEC (one
 * point, on white), and #4A9EF8 as the only accent. Dark has no Hevy reference,
 * so it is derived: the same roles over the splash screen's #0C0C0C ground,
 * keeping the one accent.
 */
import { useColorScheme } from 'react-native';

export type Palette = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  destructive: string;
  destructiveSurface: string;
};

export const Colors: { light: Palette; dark: Palette } = {
  light: {
    background: '#FFFFFF',
    foreground: '#010A26',
    card: '#FFFFFF',
    cardForeground: '#010A26',
    muted: '#F4F5F8',
    mutedForeground: '#959A9F',
    accent: '#4A9EF8',
    accentForeground: '#FFFFFF',
    border: '#E9EAEC',
    destructive: '#FF3B30',
    destructiveSurface: 'rgba(255, 59, 48, 0.08)',
  },
  dark: {
    background: '#0C0C0C',
    foreground: '#F5F6F8',
    card: '#141519',
    cardForeground: '#F5F6F8',
    muted: '#1C1D21',
    mutedForeground: '#959A9F',
    accent: '#4A9EF8',
    accentForeground: '#FFFFFF',
    border: '#26272B',
    destructive: '#FF453A',
    destructiveSurface: 'rgba(255, 69, 58, 0.14)',
  },
};

export const Radius = {
  md: 8,
  card: 16,
  bubble: 18,
  composer: 28,
  pill: 999,
} as const;

export const Spacing = {
  threadMaxWidth: 768,
  gutter: 16,
} as const;

export function useTheme(): { isDark: boolean; colors: Palette } {
  const isDark = useColorScheme() === 'dark';
  return { isDark, colors: isDark ? Colors.dark : Colors.light };
}
