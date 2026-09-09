import { type ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

/**
 * The whole motion grammar, in one place: things are ruled into place, never faded in. A rule line
 * extends across the sheet, then the content settles onto it.
 *
 * Reduce Motion draws every rule at full length instantly and settles content with no travel. It is
 * honoured by zeroing durations rather than by skipping the change, so nothing appears late.
 */
const EXTEND_MS = 220;
const SETTLE_MS = 180;
const INSTANT_MS = 0;
const SETTLE_TRAVEL = 6;

/** Reduce Motion turns a stack push off rather than merely shortening it. */
export function useScreenAnimation(): 'default' | 'none' {
  return useReducedMotion() ? 'none' : 'default';
}

/** A rule arrives by being drawn from the left edge to the right, the way one is ruled by hand. */
const EXTEND = { from: { width: '0%' }, to: { width: '100%' } } as const;

type RuleProps = {
  /** `ink` for a rule that carries a heading; the default hairline is the ruling of the sheet. */
  readonly weight?: 'hair' | 'ink';
  readonly style?: StyleProp<ViewStyle>;
};

/** One ruled line. It extends from the left edge on arrival, which is how everything here begins. */
export function Rule({ weight = 'hair', style }: RuleProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: '100%',
          height: weight === 'ink' ? RULE_INK_HEIGHT : StyleSheet.hairlineWidth,
          backgroundColor: weight === 'ink' ? theme.ink : theme.rule,
          animationName: reduceMotion ? 'none' : EXTEND,
          animationDuration: EXTEND_MS,
          animationTimingFunction: 'ease-out',
          animationFillMode: 'both',
        },
        style,
      ]}
    />
  );
}

type SettleProps = {
  /** Flips once the data behind the content has arrived. */
  readonly visible: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
};

/**
 * Content settling onto the rule above it: it drops the last few points into position as it
 * arrives, after the rule has had time to extend. Nothing is rendered while hidden, so a screen
 * still waiting on Hevy has no reserved gap where the content will land.
 */
export function Settle({ visible, style, children }: SettleProps) {
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      style={[
        visible ? style : null,
        {
          opacity: visible ? 1 : 0,
          transform: [{ translateY: visible ? 0 : -SETTLE_TRAVEL }],
          transitionProperty: ['opacity', 'transform'],
          transitionDuration: reduceMotion ? INSTANT_MS : SETTLE_MS,
          transitionDelay: reduceMotion ? INSTANT_MS : EXTEND_MS,
        },
      ]}
    >
      {visible ? children : null}
    </Animated.View>
  );
}

const RULE_INK_HEIGHT = 1.5;
