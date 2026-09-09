import { askCoach } from './client';
import { coachIdentity } from './identity';

import { getApiKey } from '@/features/settings/api-key';

const BASE_URL = 'https://example.test/functions/v1';
const IDENTITY = 'f'.repeat(64);
const RAW_API_KEY = 'super-secret-hevy-key-should-never-leak';

jest.mock('@/features/settings/api-key', () => ({ getApiKey: jest.fn() }));

// Isolates client.ts's HTTP/error-mapping behaviour from identity.ts's own hashing, which has its
// own test file.
jest.mock('./identity', () => ({ coachIdentity: jest.fn(() => Promise.resolve('f'.repeat(64))) }));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { coachApiBaseUrl: 'https://example.test/functions/v1' } } },
}));

function fakeHeaders(values: Record<string, string> = {}) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null };
}

function fakeResponse(init: {
  ok: boolean;
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}): Response {
  return {
    ok: init.ok,
    status: init.status,
    headers: fakeHeaders(init.headers),
    json: () => Promise.resolve(init.body ?? {}),
  } as unknown as Response;
}

beforeEach(() => {
  jest.mocked(getApiKey).mockResolvedValue(RAW_API_KEY);
});

describe('askCoach', () => {
  it('should send the identity header and never the raw API key on the request', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        fakeResponse({ ok: true, status: 200, body: { explanation: 'Because you missed reps.' } })
      );
    global.fetch = fetchMock;

    const explanation = await askCoach({ subject: 'block', context: 'week summary' });

    expect(explanation).toBe('Because you missed reps.');
    expect(coachIdentity).toHaveBeenCalledWith(RAW_API_KEY);
    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/coach/explain`);
    const headers = requestInit.headers as Record<string, string>;
    expect(headers['x-hevy-identity']).toBe(IDENTITY);
    expect(JSON.stringify(requestInit)).not.toContain(RAW_API_KEY);
  });

  it('should name the wait when the server returns 429 with a retry-after header', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(fakeResponse({ ok: false, status: 429, headers: { 'retry-after': '125' } }));

    await expect(askCoach({ subject: 'block', context: 'x' })).rejects.toThrow(/3 minutes/);
  });

  it('should give a distinct message for a 401', async () => {
    global.fetch = jest.fn().mockResolvedValue(fakeResponse({ ok: false, status: 401 }));

    await expect(askCoach({ subject: 'block', context: 'x' })).rejects.toThrow(
      /API key was not recognized/
    );
  });

  it('should give a distinct message on a network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

    await expect(askCoach({ subject: 'block', context: 'x' })).rejects.toThrow(
      /Could not reach the coach/
    );
  });

  it('should never leak the raw API key or the identity hash in a thrown message', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

    const error = await askCoach({ subject: 'block', context: 'x' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    const message = error instanceof Error ? error.message : '';
    expect(message).not.toContain(RAW_API_KEY);
    expect(message).not.toContain(IDENTITY);
  });
});
