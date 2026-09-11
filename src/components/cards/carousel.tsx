/**
 * The top third: three glass cards on a pager, dots under them, and the tap
 * that brings one to the front. One GET /cards feeds all three, so a card that
 * has no data yet shows its own skeleton and the failure is reported once, in
 * the first card.
 *
 * Nothing here paints a ground: the cards sit on the screen's plain ground the
 * way Hevy's routine cards sit on white, so the region and the dots row stay
 * transparent.
 *
 * A tap measures the card in the window and hands that frame to `ExpandedCard`,
 * which grows a full copy of the card from exactly there while the original
 * hides under it. A card with nothing to show yet does not open.
 */
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type NativeSyntheticEvent } from 'react-native';
import PagerView, { type PagerViewOnPageSelectedEventData } from 'react-native-pager-view';

import { ExpandedCard, useReduceMotion, type Frame } from './expanded-card';
import { Card } from './card';
import { LastWorkoutCard } from './last-workout';
import { NextSessionCard } from './next-session';
import { WeekVolumeCard } from './week-volume';
import { Spacing, useTheme } from '../assistant-ui/theme';
import { useServer } from '../../lib/server';
import type { CardsView } from '../../lib/types';

/** The three pages in order, named after the GET /cards field each one draws. */
const PAGES = ['weekVolume', 'lastWorkout', 'nextSession'] as const;
type Page = (typeof PAGES)[number];

const DOT_SIZE = 6;
const DOT_ACTIVE_WIDTH = 16;
const PAGE_PADDING_VERTICAL = 12;
const PRESSED_OPACITY = 0.85;
const OPEN_HINT = 'Shows the full details';

interface Cards {
  readonly view: CardsView | null;
  readonly error: string | null;
}

/** GET /cards still in flight: nothing to draw yet, and nothing to open. */
const isLoading = (cards: Cards): boolean => cards.view === null && cards.error === null;

interface Expanded {
  readonly page: Page;
  readonly frame: Frame;
}

interface CardContentProps {
  readonly page: Page;
  readonly cards: Cards;
  readonly expanded: boolean;
}

/** One card's content: a spinner until the cards arrive, compact on the pager, in full when expanded. */
function CardContent({ page, cards, expanded }: CardContentProps) {
  if (isLoading(cards)) return <Spinner />;
  switch (page) {
    case 'weekVolume':
      return <WeekVolumeCard view={cards.view} error={cards.error} expanded={expanded} />;
    case 'lastWorkout':
      return <LastWorkoutCard view={cards.view} expanded={expanded} />;
    case 'nextSession':
      return <NextSessionCard view={cards.view} expanded={expanded} />;
  }
}

function Spinner() {
  const { colors } = useTheme();

  return (
    <View style={styles.spinner} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <ActivityIndicator color={colors.mutedForeground} />
    </View>
  );
}

/** The week always has a card once loaded; the other two fields may be null. */
const hasContent = (page: Page, view: CardsView | null): boolean =>
  view !== null && view[page] !== null;

interface CardPageProps {
  readonly page: Page;
  readonly cards: Cards;
  /** True while this card's expanded copy is on screen over it. */
  readonly hidden: boolean;
  readonly onOpen: (expanded: Expanded) => void;
}

function CardPage({ page, cards, hidden, onOpen }: CardPageProps) {
  const card = useRef<View>(null);
  const opens = hasContent(page, cards.view);

  const open = () => {
    card.current?.measureInWindow((x, y, width, height) => {
      onOpen({ page, frame: { x, y, width, height } });
    });
  };

  return (
    <View style={styles.page}>
      <Pressable
        ref={card}
        accessibilityRole="button"
        accessibilityHint={opens ? OPEN_HINT : undefined}
        disabled={!opens || hidden}
        onPress={open}
        style={({ pressed }) => [styles.pressable, hidden && styles.hidden, pressed && styles.pressed]}
      >
        <Card>
          <CardContent page={page} cards={cards} expanded={false} />
        </Card>
      </Pressable>
    </View>
  );
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
  const { data, error } = useServer<CardsView>('/cards');
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState<Expanded | null>(null);
  const reduceMotion = useReduceMotion();
  const cards: Cards = { view: data, error };

  const select = (event: NativeSyntheticEvent<PagerViewOnPageSelectedEventData>) => {
    setActive(event.nativeEvent.position);
  };

  return (
    <View style={styles.region}>
      <PagerView style={styles.pager} initialPage={0} onPageSelected={select}>
        {PAGES.map((page) => (
          <CardPage
            key={page}
            page={page}
            cards={cards}
            hidden={expanded?.page === page}
            onOpen={setExpanded}
          />
        ))}
      </PagerView>
      <Dots active={active} />
      {expanded !== null && (
        <ExpandedCard
          from={expanded.frame}
          reduceMotion={reduceMotion}
          onClose={() => setExpanded(null)}
        >
          <CardContent page={expanded.page} cards={cards} expanded />
        </ExpandedCard>
      )}
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
  pressable: {
    flex: 1,
  },
  spinner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: {
    opacity: 0,
  },
  pressed: {
    opacity: PRESSED_OPACITY,
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
