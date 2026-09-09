/**
 * Validation primitives shared by every runtime contract in the backend.
 *
 * Every reader rejects rather than coerces, and every object check rejects
 * unknown keys rather than ignoring them: a field we did not expect is either
 * a client bug or an attempt to smuggle something past us, and neither should
 * travel any further.
 */

export type Validated<T> = { readonly ok: true; readonly value: T } | {
  readonly ok: false;
  readonly error: string;
};

export const MAX_SHORT_TEXT = 200;
export const MAX_NOTES_LENGTH = 2_000;
export const MAX_SUMMARY_LENGTH = 20_000;

export function invalid<T>(error: string): Validated<T> {
  return { ok: false, error };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function unexpectedKey(
  record: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): string | null {
  return Object.keys(record).find((key) => !allowed.includes(key)) ?? null;
}

export function readText(
  record: Readonly<Record<string, unknown>>,
  key: string,
  maxLength: number,
): Validated<string> {
  const value = record[key];
  if (typeof value !== 'string') {
    return invalid(`${key} must be a string`);
  }
  if (value.length > maxLength) {
    return invalid(`${key} must be at most ${maxLength} characters`);
  }
  return { ok: true, value };
}

export function readIdentifier(
  record: Readonly<Record<string, unknown>>,
  key: string,
): Validated<string> {
  const text = readText(record, key, MAX_SHORT_TEXT);
  if (!text.ok) return text;
  if (text.value.length === 0) {
    return invalid(`${key} must not be empty`);
  }
  return text;
}

export function readInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
  bounds: { readonly min: number; readonly max: number },
): Validated<number> {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return invalid(`${key} must be an integer`);
  }
  if (value < bounds.min || value > bounds.max) {
    return invalid(`${key} must be between ${bounds.min} and ${bounds.max}`);
  }
  return { ok: true, value };
}

export function readEnum<T extends string>(
  record: Readonly<Record<string, unknown>>,
  key: string,
  allowed: readonly string[],
): Validated<T> {
  const value = record[key];
  if (typeof value !== 'string' || !allowed.includes(value)) {
    return invalid(`${key} must be one of ${allowed.join(', ')}`);
  }
  return { ok: true, value: value as T };
}

export function readArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
  maxLength: number,
): Validated<readonly unknown[]> {
  const value = record[key];
  if (!Array.isArray(value)) {
    return invalid(`${key} must be an array`);
  }
  if (value.length === 0) {
    return invalid(`${key} must not be empty`);
  }
  if (value.length > maxLength) {
    return invalid(`${key} must hold at most ${maxLength} entries`);
  }
  return { ok: true, value };
}
