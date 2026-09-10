/**
 * Every string the Plan tab prints. Hermes' Intl is not relied on for a caption
 * (the same call the thread's verdict caption makes in coach-metadata.tsx), so
 * the month names and the relative day are written out here.
 */
import type { Block, Exercise } from '../../lib/types';

const MILLISECONDS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;
/** Past four weeks a completion reads better as its date than as "5 weeks ago". */
const WEEKS_BEFORE_DATE = 4;
const ONE_DECIMAL = 1;
const SEPARATOR = ' · ';
const TITLE_SEPARATOR = ', ';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** 80 rather than 80.0, 82.5 rather than 82.50000000000001. */
function decimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(ONE_DECIMAL);
}

function midnight(date: Date): number {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

/** An empty string whenever the server sent something that is not a date. */
function parse(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "8 September", and the year too once it is not this one. */
export function calendarDate(iso: string): string {
  const date = parse(iso);
  if (!date) return '';
  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === new Date().getFullYear() ? day : `${day} ${date.getFullYear()}`;
}

/** "today", "yesterday", "3 days ago", "2 weeks ago", then the date itself. */
export function relativeDay(iso: string): string {
  const date = parse(iso);
  if (!date) return '';
  const days = Math.round((midnight(new Date()) - midnight(date)) / MILLISECONDS_PER_DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < DAYS_PER_WEEK) return `${days} days ago`;
  const weeks = Math.floor(days / DAYS_PER_WEEK);
  if (weeks >= WEEKS_BEFORE_DATE) return calendarDate(iso);
  return weeks === 1 ? 'last week' : `${weeks} weeks ago`;
}

/** The caption under the block's name: "5 weeks · started 8 September". */
export function blockCaption(block: Block): string {
  const weeks = `${block.weeks} ${block.weeks === 1 ? 'week' : 'weeks'}`;
  const started = calendarDate(block.createdAt);
  return started ? `${weeks}${SEPARATOR}started ${started}` : weeks;
}

/** "3 × 8 · 80 kg · RPE 8", dropping whatever the coach left at zero. */
export function exerciseDetail(exercise: Exercise): string {
  const parts = [`${exercise.sets} × ${exercise.reps}`];
  if (exercise.weightKg > 0) parts.push(`${decimal(exercise.weightKg)} kg`);
  if (exercise.rpe > 0) parts.push(`RPE ${decimal(exercise.rpe)}`);
  return parts.join(SEPARATOR);
}

/** One grey line per routine, the way Hevy lists a routine's exercises. */
export function exerciseSummary(exercises: readonly Exercise[]): string {
  return exercises
    .map((exercise) => exercise.title)
    .filter((title) => title.length > 0)
    .join(TITLE_SEPARATOR);
}

/** A verdict is two to five lines; the card shows only the one that matters. */
export function firstLine(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return '';
}
