/**
 * The Block Chart's tokens. Named for their role on a printed programme sheet, not for their
 * colour: ground is the paper, rules are the ruling, ink is what is written on it, the load ramp
 * is the band a session is drawn in, and the marker is the highlighter struck across today.
 *
 * The colours are committed rather than borrowed from UIKit. A paper-white ground, a hairline
 * rule and a five-step greyscale ramp are the world itself, and the system's semantic colours
 * cannot express a ramp. Type is still the system's, so Dynamic Type keeps working.
 *
 * Dark mode inverts ground and ink honestly, and the ramp inverts with them: a heavier session is
 * always more ink than a lighter one, which on dark paper means brighter.
 */

import { StyleSheet } from 'react-native';

/**
 * Five bands, lightest to darkest. Step 5 is always the heaviest session on screen. The ramp starts
 * clear of the ground rather than beside it — a day with nothing planned draws no band at all, so
 * the lightest band has to be the one thing it can never be mistaken for under gym light.
 */
export const LOAD_STEPS = [1, 2, 3, 4, 5] as const;

export type LoadStep = (typeof LOAD_STEPS)[number];

type LoadKey = `load${LoadStep}`;

type Palette = Record<LoadKey, string> & {
  readonly ground: string;
  readonly rule: string;
  readonly ink: string;
  readonly inkSecondary: string;
  /** Ink written over the marker. Near-black in both appearances: a highlighter lies behind text. */
  readonly inkOnMarker: string;
  readonly marker: string;
};

export type ThemeColor = keyof Palette;

/**
 * The one chromatic colour in the app, reserved by law for today and drawn nowhere else. It is the
 * same value in both appearances because a highlighter glows on dark paper as it does on white —
 * but on white paper it is barely 1.1:1 against the ground, so the marker is always drawn with the
 * ink edges below rather than as a bare fill. The edge, not the fill, is what makes it findable.
 */
const MARKER = '#E8FF3B';

/** The ink edges that bracket the marker, so today is legible on paper-white as well as on black. */
export const MARKER_EDGE_WIDTH = 1.5;

const NEAR_BLACK = '#111111';

export const Colors: { readonly light: Palette; readonly dark: Palette } = {
  light: {
    ground: '#FFFFFF',
    rule: '#C9C9C9',
    ink: NEAR_BLACK,
    inkSecondary: '#6E6E6E',
    inkOnMarker: NEAR_BLACK,
    marker: MARKER,
    load1: '#D4D4D4',
    load2: '#B0B0B0',
    load3: '#8A8A8A',
    load4: '#626262',
    load5: '#3A3A3A',
  },
  dark: {
    ground: '#0C0C0C',
    rule: '#3A3A3A',
    ink: '#F2F2F2',
    inkSecondary: '#9C9C9C',
    inkOnMarker: NEAR_BLACK,
    marker: MARKER,
    load1: '#2E2E2E',
    load2: '#484848',
    load3: '#676767',
    load4: '#909090',
    load5: '#BEBEBE',
  },
} as const;

export function loadColor(palette: Palette, step: LoadStep): string {
  return palette[`load${step}`];
}

/**
 * A block chart's premise is that columns of numbers line up, so every figure on screen renders
 * with this. A misaligned column is a defect.
 */
export const Figures = StyleSheet.create({
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});

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
  /** A scrolled column of stamped sections, each ruled off from the next. */
  scrollContent: {
    gap: Spacing.five,
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
});
