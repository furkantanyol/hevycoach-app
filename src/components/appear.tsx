import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

const DURATION_MS = 200;
const INSTANT_MS = 0;

type AppearProps = {
  /** Flips once the data behind the content has arrived. */
  readonly visible: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
};

/**
 * Content fades in when it arrives, rather than snapping in under the reader's eye. A CSS
 * transition over one style value: the wrapper is mounted from the first frame, so the change from
 * hidden to shown is a real state change and the transition carries it. Reduce Motion sets the
 * duration to zero, which is what the setting asks for — the content still appears, it just does
 * not move.
 *
 * Nothing is rendered while hidden, so an empty or still-loading screen has no reserved gap where
 * the content will land.
 */
export function Appear({ visible, style, children }: AppearProps) {
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      style={[
        visible ? style : null,
        {
          opacity: visible ? 1 : 0,
          transitionProperty: 'opacity',
          transitionDuration: reduceMotion ? INSTANT_MS : DURATION_MS,
        },
      ]}
    >
      {visible ? children : null}
    </Animated.View>
  );
}
