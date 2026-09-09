/**
 * The app's colours and spacing. On iOS the colours are the system's own semantic ones, so the OS
 * resolves them per appearance and per accessibility setting (Increase Contrast, Smart Invert);
 * everywhere else there is a hand-written table, because only UIKit ships those colours.
 */

import { Platform, PlatformColor, StyleSheet, type ColorValue } from 'react-native';

import '@/global.css';

type Palette = {
  readonly text: ColorValue;
  readonly background: ColorValue;
  readonly backgroundSelected: ColorValue;
  readonly textSecondary: ColorValue;
  readonly link: ColorValue;
};

export type ThemeColor = keyof Palette;

/** Built only on iOS: `PlatformColor` does not exist in react-native-web. */
const systemPalette: Palette | null =
  Platform.OS === 'ios'
    ? {
        text: PlatformColor('label'),
        background: PlatformColor('systemBackground'),
        backgroundSelected: PlatformColor('systemFill'),
        textSecondary: PlatformColor('secondaryLabel'),
        link: PlatformColor('link'),
      }
    : null;

const hexPalettes = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    link: '#3c87f7',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    link: '#3c87f7',
  },
} as const;

/** One table per appearance off screen; on iOS both are the same colours, resolved by UIKit. */
export const Colors: { readonly light: Palette; readonly dark: Palette } =
  systemPalette === null ? hexPalettes : { light: systemPalette, dark: systemPalette };

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Every screen is one of these two shapes, so the padding lives here rather than in each file. */
export const Screen = StyleSheet.create({
  container: {
    flex: 1,
  },
  /** A list: rows bring their own spacing. */
  listContent: {
    padding: Spacing.four,
  },
  /** A scrolled column of sections. */
  scrollContent: {
    gap: Spacing.four,
    padding: Spacing.four,
  },
});
