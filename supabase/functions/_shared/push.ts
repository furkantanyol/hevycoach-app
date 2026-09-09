import { callDatabase, type Database } from './db.ts';

/**
 * Expo push delivery, capped at two notifications per rolling seven days per
 * identity. The product promises a quiet app: at most two informational pushes
 * a week, and nothing that asks the user a question.
 *
 * The cap is claimed in Postgres before anything is sent — a single statement
 * that inserts the row only while the count in the window is under the cap, so
 * two concurrent webhooks cannot both claim the second slot.
 */

export const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
export const NOTIFICATION_WINDOW_DAYS = 7;
export const MAX_NOTIFICATIONS_PER_WINDOW = 2;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface PushDependencies {
  readonly database: Database;
  readonly fetchImpl: FetchLike;
  readonly now: Date;
  /**
   * Expo accepts unauthenticated sends; an access token is only required once a
   * project enables push security, so it is optional here.
   */
  readonly accessToken?: string;
}

export interface PushRequest {
  readonly identityHash: string;
  readonly kind: string;
  readonly title: string;
  readonly body: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

export type PushOutcome =
  | { readonly sent: true; readonly ticketId: string | null }
  | { readonly sent: false; readonly reason: 'capped' | 'no-token' | 'rejected' };

export function rollingWindowStart(now: Date, days = NOTIFICATION_WINDOW_DAYS): Date {
  return new Date(now.getTime() - days * MILLISECONDS_PER_DAY);
}

async function pushTokenFor(database: Database, identityHash: string): Promise<string | null> {
  const token = await callDatabase(database, 'push_token_for_identity', {
    p_identity_hash: identityHash,
  });
  return typeof token === 'string' && token.length > 0 ? token : null;
}

async function claimNotificationSlot(
  database: Database,
  request: { readonly identityHash: string; readonly kind: string; readonly since: Date },
): Promise<boolean> {
  const claimed = await callDatabase(database, 'claim_notification_slot', {
    p_identity_hash: request.identityHash,
    p_kind: request.kind,
    p_since: request.since.toISOString(),
    p_max: MAX_NOTIFICATIONS_PER_WINDOW,
  });
  return claimed === true;
}

function ticketIdFrom(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const tickets = (payload as { data?: unknown }).data;
  if (!Array.isArray(tickets) || tickets.length === 0) {
    return null;
  }
  const first = tickets[0];
  if (typeof first !== 'object' || first === null) {
    return null;
  }
  const id = (first as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

async function postToExpo(
  message: Readonly<Record<string, unknown>>,
  dependencies: PushDependencies,
): Promise<string | null> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
  };
  if (dependencies.accessToken !== undefined) {
    headers.authorization = `Bearer ${dependencies.accessToken}`;
  }
  const response = await dependencies.fetchImpl(EXPO_PUSH_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(message),
  });
  if (!response.ok) {
    throw new Error(`expo push returned ${response.status}`);
  }
  return ticketIdFrom(await response.json());
}

/**
 * Sends one push if the identity has a registered token and a free slot in the
 * rolling window. The slot is claimed before the send, so a delivery failure
 * costs the user a slot rather than risking a burst of retries.
 */
export async function sendCappedPush(
  request: PushRequest,
  dependencies: PushDependencies,
): Promise<PushOutcome> {
  const token = await pushTokenFor(dependencies.database, request.identityHash);
  if (token === null) {
    return { sent: false, reason: 'no-token' };
  }
  const claimed = await claimNotificationSlot(dependencies.database, {
    identityHash: request.identityHash,
    kind: request.kind,
    since: rollingWindowStart(dependencies.now),
  });
  if (!claimed) {
    return { sent: false, reason: 'capped' };
  }
  const ticketId = await postToExpo({
    to: token,
    title: request.title,
    body: request.body,
    data: request.data ?? {},
  }, dependencies);
  return { sent: true, ticketId };
}
