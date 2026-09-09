import { timingSafeEqual } from 'node:crypto';

/**
 * Identity is a SHA-256 hash of the user's Hevy API key, computed on the
 * device. The raw key never reaches the server: the hash is the whole account.
 * That makes it bearer-equivalent — whoever holds it is that user — which is
 * why every route rate limits on it and nothing else is keyed to it.
 */
const IDENTITY_HASH_PATTERN = /^[0-9a-f]{64}$/;

export const IDENTITY_HEADER = 'x-hevy-identity';

export function identityFromHash(header: string | null | undefined): string | null {
  if (typeof header !== 'string') {
    return null;
  }
  return IDENTITY_HASH_PATTERN.test(header) ? header : null;
}

export async function sha256Bytes(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return new Uint8Array(digest);
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = await sha256Bytes(input);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Compares two secrets without leaking how much of a guess was correct.
 *
 * Both sides are hashed first so the comparison is always over 32 bytes:
 * `timingSafeEqual` throws on length mismatch, and an early throw would itself
 * leak the length of the real secret.
 */
export async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([sha256Bytes(provided), sha256Bytes(expected)]);
  return timingSafeEqual(left, right);
}

export function bearerToken(header: string | null | undefined): string | null {
  if (typeof header !== 'string') {
    return null;
  }
  const match = /^Bearer (.+)$/.exec(header);
  return match === null ? null : match[1];
}
