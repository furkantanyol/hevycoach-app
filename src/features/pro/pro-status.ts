import { HevyApiError, type HevyClient } from '@furkantanyol/hevy-client';

/**
 * The Hevy public API is a Pro feature, so `GET /v1/user/info` doubles as the entitlement check
 * (see PRODUCT.md). `unknown` is not a verdict: the user keeps the app and can retry.
 */
export type ProStatus = 'pro' | 'not-pro' | 'unknown';

/** What one attempt at `GET /v1/user/info` came back as. */
export type UserInfoOutcome =
  | { readonly kind: 'status'; readonly status: number }
  | { readonly kind: 'network-error' };

const HTTP_OK = 200;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_FLOOR = 500;

/**
 * The whole entitlement rule, as a pure function. 200 is Pro and a rejected key is not, but an
 * outage — no network, a 5xx, a rate limit — says nothing about what the user pays for, so those
 * answer `unknown` rather than locking a paying user out of an app they already bought.
 */
export function proStatusFrom(outcome: UserInfoOutcome): ProStatus {
  if (outcome.kind === 'network-error') {
    return 'unknown';
  }
  if (outcome.status === HTTP_OK) {
    return 'pro';
  }
  if (outcome.status === HTTP_TOO_MANY_REQUESTS || outcome.status >= HTTP_SERVER_ERROR_FLOOR) {
    return 'unknown';
  }
  return 'not-pro';
}

/** Anything that never became a response — DNS, offline, an abort — arrives as `HevyNetworkError`. */
async function userInfoOutcome(client: HevyClient): Promise<UserInfoOutcome> {
  try {
    await client.user.info();
    return { kind: 'status', status: HTTP_OK };
  } catch (error) {
    return error instanceof HevyApiError
      ? { kind: 'status', status: error.status }
      : { kind: 'network-error' };
  }
}

export async function fetchProStatus(client: HevyClient): Promise<ProStatus> {
  return proStatusFrom(await userInfoOutcome(client));
}
