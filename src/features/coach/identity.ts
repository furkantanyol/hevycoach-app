import * as Crypto from 'expo-crypto';

/**
 * SHA-256 of the Hevy API key, as 64 lowercase hex characters — exactly what `identityFromHash`
 * in `supabase/functions/_shared/identity.ts` validates. The raw key never leaves the device;
 * only this hash is sent as the `x-hevy-identity` header (see ADR 0004).
 *
 * `digestStringAsync` hashes the UTF-8 bytes of `data` and defaults to hex output
 * (`{ encoding: CryptoEncoding.HEX }`). iOS encodes each byte with `String(format: "%02x", …)`
 * and the web fallback with `byte.toString(16).padStart(2, '0')` — both lowercase, zero-padded,
 * and algorithmically identical to the server's own `sha256Hex`.
 */
export function coachIdentity(apiKey: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, apiKey);
}
