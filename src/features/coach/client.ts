import Constants from 'expo-constants';

import { coachIdentity } from './identity';

import { getApiKey } from '@/features/settings/api-key';

const IDENTITY_HEADER = 'x-hevy-identity';
const EXPLAIN_PATH = '/coach/explain';
const SECONDS_PER_MINUTE = 60;

export type ExplainSubject = 'decision' | 'block';

export interface AskCoachInput {
  readonly subject: ExplainSubject;
  readonly context: string;
  readonly question?: string;
}

interface ExplainResponseBody {
  readonly explanation?: unknown;
}

/** Public, not a secret — lives in `app.json`'s `expo.extra` rather than a hardcoded literal. */
function coachBaseUrl(): string {
  const baseUrl: unknown = Constants.expoConfig?.extra?.coachApiBaseUrl;
  if (typeof baseUrl !== 'string' || baseUrl.length === 0) {
    throw new Error('The coach backend is not configured.');
  }
  return baseUrl;
}

/** `retry-after` is seconds (see ADR 0004's rate limiter); the message rounds up to whole minutes. */
function minutesUntilRetry(response: Response): number | null {
  const retryAfterSeconds = Number(response.headers.get('retry-after'));
  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
    return null;
  }
  return Math.max(1, Math.ceil(retryAfterSeconds / SECONDS_PER_MINUTE));
}

async function describeFailure(response: Response): Promise<string> {
  if (response.status === 401) {
    return 'Your Hevy API key was not recognized. Check it in Settings.';
  }
  if (response.status === 429) {
    const minutes = minutesUntilRetry(response);
    return minutes === null
      ? 'You are sending requests too quickly. Try again shortly.'
      : `You are sending requests too quickly, try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
  }
  if (response.status === 400) {
    return 'That request was not valid.';
  }
  if (response.status === 502) {
    return 'The coach could not produce a usable answer. Try again.';
  }
  if (response.status === 503) {
    return 'The coach is temporarily unavailable. Try again shortly.';
  }
  return `The coach returned an unexpected error (${response.status}).`;
}

/**
 * Asks the coaching backend to explain a decision or a block (see ADR 0004). The device never
 * sends the raw Hevy API key — only its SHA-256 identity hash, which the server rate limits on.
 */
export async function askCoach(input: AskCoachInput): Promise<string> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Save your Hevy API key in Settings first.');
  }
  const identity = await coachIdentity(apiKey);
  // Resolved before the try block so a missing/misconfigured base URL throws its own message
  // instead of being swallowed into the generic network-failure one below.
  const url = `${coachBaseUrl()}${EXPLAIN_PATH}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [IDENTITY_HEADER]: identity,
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error('Could not reach the coach. Check your connection and try again.');
  }

  if (!response.ok) {
    throw new Error(await describeFailure(response));
  }

  const body = (await response.json()) as ExplainResponseBody;
  if (typeof body.explanation !== 'string') {
    throw new Error('The coach sent back something unexpected.');
  }
  return body.explanation;
}
