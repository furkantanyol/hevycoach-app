/**
 * The number words the cards share, so a compact card and its expanded view
 * print the same figure the same way. No Intl: Hermes' is not relied on for a
 * caption.
 */
const KILO = 1000;
const DETAIL_SEPARATOR = ' · ';

/** Thousands separators, so a volume reads "1,800 kg". */
export function grouped(kg: number): string {
  return Math.round(kg)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Hevy writes five figures as "38.3k kg" and anything smaller in whole kilos. */
export function formatTotal(totalKg: number): string {
  if (totalKg >= KILO) return `${(totalKg / KILO).toFixed(1)}k kg`;
  return `${Math.round(totalKg)} kg`;
}

/** "60" or "62.5": a plate weight never needs more than one decimal. */
export function formatWeight(kg: number): string {
  return Number.isInteger(kg) ? `${kg}` : kg.toFixed(1);
}

/** "1 session", "3 sessions": every noun the cards count takes a plain -s. */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** "Yesterday · 8,420 kg": the caption's facts, skipping any that is empty. */
export function joinDetails(...parts: readonly string[]): string {
  return parts.filter((part) => part !== '').join(DETAIL_SEPARATOR);
}
