/**
 * The top third: three glass cards on a pager over an accent wash, with dots
 * under them. One GET /cards feeds all three, so a card that has no data yet
 * shows its own skeleton and the failure is reported once, in the first card.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View, type NativeSyntheticEvent } from 'react-native';
import PagerView, { type PagerViewOnPageSelectedEventData } from 'react-native-pager-view';

import { GlassCard } from './glass-card';
import { LastWorkoutCard } from './last-workout';
import { NextSessionCard } from './next-session';
import { WeekVolumeCard } from './week-volume';
import { Spacing, useTheme } from '../assistant-ui/theme';
import { useServer } from '../../lib/server';
import type { CardsView } from '../../lib/types';

/** Keys for the three pages, so the dots and the pager cannot drift apart. */
const PAGES = ['volume', 'lastWorkout', 'nextSession'] as const;
/** The accent wash at the top of the region, per the amendment. */
const WASH_ALPHA = 0.12;
const DOT_SIZE = 6;
const DOT_ACTIVE_WIDTH = 16;
const PAGE_PADDING_VERTICAL = 12;

/** A hex token as a translucent colour: RN needs the alpha baked into the string. */
function wash(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/** Decorative: the pager itself is what VoiceOver swipes through. */
function Dots({ active }: { readonly active: number }) {
  const { colors } = useTheme();

  return (
    <View
      style={styles.dots}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {PAGES.map((page, index) => (
        <View
          key={page}
          style={[
            styles.dot,
            index === active
              ? { width: DOT_ACTIVE_WIDTH, backgroundColor: colors.accent }
              : { backgroundColor: colors.border },
          ]}
        />
      ))}
    </View>
  );
}

export function Carousel() {
  const { colors } = useTheme();
  const { data, error } = useServer<CardsView>('/cards');
  const [active, setActive] = useState(0);

  const select = (event: NativeSyntheticEvent<PagerViewOnPageSelectedEventData>) => {
    setActive(event.nativeEvent.position);
  };

  return (
    <LinearGradient
      colors={[wash(colors.accent, WASH_ALPHA), colors.background]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.region}
    >
      <PagerView style={styles.pager} initialPage={0} onPageSelected={select}>
        <View key={PAGES[0]} style={styles.page}>
          <GlassCard>
            <WeekVolumeCard view={data} error={error} />
          </GlassCard>
        </View>
        <View key={PAGES[1]} style={styles.page}>
          <GlassCard>
            <LastWorkoutCard view={data} />
          </GlassCard>
        </View>
        <View key={PAGES[2]} style={styles.page}>
          <GlassCard>
            <NextSessionCard view={data} />
          </GlassCard>
        </View>
      </PagerView>
      <Dots active={active} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  region: {
    flex: 1,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    paddingHorizontal: Spacing.gutter,
    paddingVertical: PAGE_PADDING_VERTICAL,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: DOT_SIZE,
    paddingBottom: 8,
  },
  dot: {
    height: DOT_SIZE,
    width: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
