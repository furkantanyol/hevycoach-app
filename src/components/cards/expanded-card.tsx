/**
 * The tapped card, brought to the front. It keeps its top edge and width and
 * grows to fit what it summarised over a dimmed screen. Tap outside or the
 * close button and it shrinks back onto the carousel.
 *
 * A transparent `Modal` rather than a sibling view: the native header floats
 * above the screen's content, so only a modal window dims it too and catches a
 * tap on it. The height animates as a layout prop (JS driver) — the width never
 * changes, so the content is laid out once at its final size and is revealed,
 * not reflowed. The content fades in over the first half of the growth.
 *
 * Reduce Motion swaps the growth for a crossfade at the final frame.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CARD_PADDING, Card } from './card';
import { SystemIcon } from './system-icon';
import { useTheme } from '../assistant-ui/theme';

/** Where the card sits in the window, as `measureInWindow` reports it. */
export interface Frame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ExpandedCardProps {
  readonly from: Frame;
  readonly reduceMotion: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

type Opacity = Animated.AnimatedInterpolation<number>;

const BACKDROP_ALPHA = 0.3;
/** Air kept under the expanded card so it never reaches the home indicator. */
const BOTTOM_GAP = 24;
const CLOSE_SIZE = 30;
const CLOSE_INSET = CARD_PADDING;
const CLOSE_GLYPH = 12;
const CLOSE_HIT_SLOP = 8;
const PRESSED_OPACITY = 0.7;
/** A confident arrival: near-critical damping, no bounce, about 400 ms. */
const OPEN_SPRING = { stiffness: 280, damping: 32, mass: 1, overshootClamping: true } as const;
const EXIT_MS = 200;
const CROSSFADE_MS = 160;
/** The content has arrived by the time the card is halfway grown. */
const CONTENT_FADE_END = 0.5;

/** The system's Reduce Motion switch, followed live. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => subscription.remove();
  }, []);

  return reduce;
}

/**
 * One value, 0 on the pager and 1 in front, that everything else interpolates.
 * It only starts once the content has been measured, so the target height is
 * known before the first frame moves; `close` runs it back and then reports.
 */
function useGrowth(measured: boolean, reduceMotion: boolean, onClosed: () => void) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!measured) return;
    const open = reduceMotion
      ? Animated.timing(progress, {
          toValue: 1,
          duration: CROSSFADE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        })
      : Animated.spring(progress, { toValue: 1, ...OPEN_SPRING, useNativeDriver: false });
    open.start();
    return () => open.stop();
  }, [measured, progress, reduceMotion]);

  const close = () => {
    Animated.timing(progress, {
      toValue: 0,
      duration: EXIT_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) onClosed();
    });
  };

  return { progress, close };
}

/** The card fits its content, never less than it was on the pager and never past the safe area. */
function fitHeight(from: Frame, contentHeight: number | null, floor: number): number {
  if (contentHeight === null) return from.height;
  return Math.min(floor - from.y, Math.max(from.height, contentHeight + CARD_PADDING * 2));
}

interface BackdropProps {
  readonly opacity: Opacity;
  readonly onPress: () => void;
}

/**
 * The tap that closes. VoiceOver reaches the close button instead: the card is
 * the modal accessibility subtree, so this view is not announced.
 */
function Backdrop({ opacity, onPress }: BackdropProps) {
  return (
    <Pressable onPress={onPress} style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, { opacity }]} />
    </Pressable>
  );
}

interface CloseButtonProps {
  readonly opacity: Opacity;
  readonly onPress: () => void;
}

/** Where the card's chevron was: the one control the expanded card adds. */
function CloseButton({ opacity, onPress }: CloseButtonProps) {
  const { colors } = useTheme();

  return (
    <Animated.View style={[styles.close, { opacity }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={CLOSE_HIT_SLOP}
        onPress={onPress}
        style={({ pressed }) => [
          styles.closeButton,
          { backgroundColor: colors.muted },
          pressed && styles.pressed,
        ]}
      >
        <SystemIcon name="xmark" size={CLOSE_GLYPH} color={colors.foreground} />
      </Pressable>
    </Animated.View>
  );
}

export function ExpandedCard({ from, reduceMotion, onClose, children }: ExpandedCardProps) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const { progress, close } = useGrowth(contentHeight !== null, reduceMotion, onClose);

  const toHeight = fitHeight(from, contentHeight, window.height - insets.bottom - BOTTOM_GAP);
  const height = reduceMotion
    ? toHeight
    : progress.interpolate({ inputRange: [0, 1], outputRange: [from.height, toHeight] });
  const backdropOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, BACKDROP_ALPHA] });
  const contentOpacity = progress.interpolate({
    inputRange: [0, CONTENT_FADE_END, 1],
    outputRange: [0, 1, 1],
  });
  const measure = (event: LayoutChangeEvent) => setContentHeight(event.nativeEvent.layout.height);

  // `onRequestClose` is the accessibility escape gesture on iOS; there is no swipe to dismiss.
  return (
    <Modal transparent visible animationType="none" onRequestClose={close}>
      <Backdrop opacity={backdropOpacity} onPress={close} />
      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.card,
          { left: from.x, top: from.y, width: from.width, height },
          reduceMotion && { opacity: progress },
        ]}
      >
        <Card>
          <ScrollView style={styles.fill} bounces={false} showsVerticalScrollIndicator={false}>
            <Animated.View onLayout={measure} style={{ opacity: contentOpacity }}>
              {children}
            </Animated.View>
          </ScrollView>
        </Card>
        <CloseButton opacity={contentOpacity} onPress={close} />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: {
    backgroundColor: '#000000',
  },
  card: {
    position: 'absolute',
  },
  // Fills the card, so content taller than the screen allows scrolls instead of being cut off.
  fill: {
    flex: 1,
  },
  close: {
    position: 'absolute',
    top: CLOSE_INSET,
    right: CLOSE_INSET,
  },
  closeButton: {
    width: CLOSE_SIZE,
    height: CLOSE_SIZE,
    borderRadius: CLOSE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: PRESSED_OPACITY,
  },
});
