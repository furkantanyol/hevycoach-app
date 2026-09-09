import { coachIdentity } from './identity';

/**
 * jest-expo's auto-mock for `expo-crypto` (see `expo-crypto/mocks/ExpoCrypto.ts`) resolves
 * `digestStringAsync` to `''` unconditionally, since there is no native module under Jest. This
 * mock stands a real SHA-256 in its place — via Node's own `crypto`, requested through
 * `jest.requireActual` so the module is not resolved through jest-expo's native-module mocking —
 * so the assertions below exercise `coachIdentity`'s real hashing contract rather than the
 * empty-string stub.
 */
jest.mock('expo-crypto', () => {
  const nodeCrypto = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: jest.fn((_algorithm: string, data: string) =>
      Promise.resolve(nodeCrypto.createHash('sha256').update(data, 'utf8').digest('hex'))
    ),
  };
});

// Computed independently with `shasum -a 256` and cross-checked against node:crypto — not derived
// from the mock above.
const KNOWN_INPUT = 'hevy-api-key-test-vector';
const KNOWN_DIGEST = '87bd6a4fb95b829d5952b604bc6b19606855ab7609c0055726a8193fdaebb196';

// The exact vector supabase/functions/_shared/identity.test.ts asserts for `sha256Hex('')`.
// Matching it here proves this client hashes byte-for-byte identically to what the server accepts.
const SERVER_EMPTY_STRING_DIGEST = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('coachIdentity', () => {
  it('should produce the known 64-character lowercase hex SHA-256 digest for a fixed input', async () => {
    await expect(coachIdentity(KNOWN_INPUT)).resolves.toBe(KNOWN_DIGEST);
  });

  it('should produce a digest matching the 64-lowercase-hex shape the server identity validator requires', async () => {
    const digest = await coachIdentity(KNOWN_INPUT);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should match the exact digest the server test suite asserts for an empty string', async () => {
    await expect(coachIdentity('')).resolves.toBe(SERVER_EMPTY_STRING_DIGEST);
  });
});
