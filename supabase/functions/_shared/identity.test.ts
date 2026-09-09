import { assert, assertEquals, assertFalse } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import { bearerToken, identityFromHash, secretsMatch, sha256Hex } from './identity.ts';

const VALID = 'a'.repeat(64);

describe('identityFromHash', () => {
  it('should accept a 64-character lowercase hex hash', () => {
    assertEquals(identityFromHash(VALID), VALID);
  });

  it('should accept a real SHA-256 digest', async () => {
    const digest = await sha256Hex('hevy-api-key');
    assertEquals(identityFromHash(digest), digest);
  });

  it('should reject an uppercase hash', () => {
    assertEquals(identityFromHash('A'.repeat(64)), null);
  });

  it('should reject a hash that is one character short', () => {
    assertEquals(identityFromHash('a'.repeat(63)), null);
  });

  it('should reject a hash that is one character long', () => {
    assertEquals(identityFromHash('a'.repeat(65)), null);
  });

  it('should reject non-hex characters', () => {
    assertEquals(identityFromHash(`${'a'.repeat(63)}z`), null);
  });

  it('should reject a hash with surrounding whitespace', () => {
    assertEquals(identityFromHash(` ${VALID} `), null);
  });

  it('should reject a missing header', () => {
    assertEquals(identityFromHash(null), null);
  });
});

describe('sha256Hex', () => {
  it('should produce the known digest of an empty string', async () => {
    assertEquals(
      await sha256Hex(''),
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('secretsMatch', () => {
  it('should accept an identical secret', async () => {
    assert(await secretsMatch('shhh', 'shhh'));
  });

  it('should reject a different secret of the same length', async () => {
    assertFalse(await secretsMatch('shhh', 'shhX'));
  });

  it('should reject a shorter secret without throwing on the length mismatch', async () => {
    assertFalse(await secretsMatch('sh', 'shhh'));
  });

  it('should reject an empty secret', async () => {
    assertFalse(await secretsMatch('', 'shhh'));
  });
});

describe('bearerToken', () => {
  it('should read the token out of a bearer header', () => {
    assertEquals(bearerToken('Bearer abc123'), 'abc123');
  });

  it('should reject a header with no bearer scheme', () => {
    assertEquals(bearerToken('abc123'), null);
  });

  it('should reject a missing header', () => {
    assertEquals(bearerToken(null), null);
  });
});
