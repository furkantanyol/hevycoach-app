/**
 * The top third: three glass cards on a pager, with dots under them. One GET
 * /cards feeds all three, so a card that has no data yet shows its own skeleton
 * and the failure is reported once, in the first card.
 *
 * Nothing here paints a ground. The accent wash belongs to the whole screen now
 * (src/app/index.tsx), so the region and the dots row stay transparent and the
 * cards sit straight on it with no edge where the carousel ends. That suits
 * `GlassView`, which samples whatever is behind it: an opaque parent would give
 * it a flat colour to refract instead of the wash.
 */
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
const DOT_SIZE = 6;
const DOT_ACTIVE_WIDTH = 16;
const PAGE_PADDING_VERTICAL = 12;

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
  const { data, error } = useServer<CardsView>('/cards');
  const [active, setActive] = useState(0);

  const select = (event: NativeSyntheticEvent<PagerViewOnPageSelectedEventData>) => {
    setActive(event.nativeEvent.position);
  };

  return (
    <View style={styles.region}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  region: {
    flex: 1,
    backgroundColor: 'transparent',
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
    backgroundColor: 'transparent',
  },
  dot: {
    height: DOT_SIZE,
    width: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
