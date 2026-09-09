import { callDatabase, type Database, DatabaseUnavailableError } from '../_shared/db.ts';
import { bearerToken, identityFromHash, IDENTITY_HEADER, secretsMatch } from '../_shared/identity.ts';
import { type FetchLike, sendCappedPush } from '../_shared/push.ts';
import { type HevyWebhookEvent, parseHevyWebhookEvent } from '../_shared/schemas.ts';

/**
 * Hevy calls this when a workout finishes. The body carries the event id and
 * the workout id, and nothing else — in particular it does not say whose
 * workout it is, which is why the notification target is read from the optional
 * identity header rather than inferred.
 */

const HEVY_PATH = '/webhook/hevy';
const REGENERATION_KIND = 'weekly-regeneration';

export interface WebhookDependencies {
  readonly database: Database;
  readonly fetchImpl: FetchLike;
  readonly now: () => Date;
  /** The shared secret Hevy sends as a bearer token. Never logged. */
  readonly webhookSecret: string | undefined;
  readonly expoAccessToken?: string;
  /**
   * Injected so the notification path can be tested before Phase D lands a real
   * policy. Defaults to the seam below, which always says no.
   */
  readonly shouldRegenerate?: (event: HevyWebhookEvent) => Promise<boolean>;
}

/**
 * Whether a finished workout means the lifter's program should be rebuilt.
 *
 * TODO(Phase D): this is a deliberate seam, not a policy. The progression spec
 * has not landed, and every rule that would answer this question — where a
 * training week ends, what counts as a stall, when a deload is due — arrives
 * with it. Inventing one here would put programming logic on the server that
 * the on-device rules engine owns. Until Phase D lands this always returns
 * false, so no regeneration notification is ever sent.
 */
export function shouldRegenerate(_event: HevyWebhookEvent): Promise<boolean> {
  return Promise.resolve(false);
}

function json(body: Readonly<Record<string, unknown>>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function authorised(request: Request, secret: string): Promise<boolean> {
  const token = bearerToken(request.headers.get('authorization'));
  if (token === null) {
    return false;
  }
  return await secretsMatch(token, secret);
}

async function notifyIfDue(
  request: Request,
  event: HevyWebhookEvent,
  dependencies: WebhookDependencies,
): Promise<boolean> {
  const regenerates = dependencies.shouldRegenerate ?? shouldRegenerate;
  if (!await regenerates(event)) {
    return false;
  }
  const identityHash = identityFromHash(request.headers.get(IDENTITY_HEADER));
  if (identityHash === null) {
    return false;
  }
  const outcome = await sendCappedPush({
    identityHash,
    kind: REGENERATION_KIND,
    title: 'Next week is ready',
    body: 'Your block moved on. Open HevyCoach to see what changed.',
    data: { workoutId: event.workoutId },
  }, {
    database: dependencies.database,
    fetchImpl: dependencies.fetchImpl,
    now: dependencies.now(),
    accessToken: dependencies.expoAccessToken,
  });
  return outcome.sent;
}

export async function handleWebhookRequest(
  request: Request,
  dependencies: WebhookDependencies,
): Promise<Response> {
  if (new URL(request.url).pathname !== HEVY_PATH) {
    return json({ error: 'unknown route' }, 404);
  }
  if (request.method !== 'POST') {
    return json({ error: 'this route only accepts POST' }, 405);
  }
  if (dependencies.webhookSecret === undefined) {
    return json({ error: 'the webhook is not configured' }, 503);
  }
  if (!await authorised(request, dependencies.webhookSecret)) {
    return json({ error: 'unauthorised' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'body must be JSON' }, 400);
  }
  const event = parseHevyWebhookEvent(body);
  if (!event.ok) {
    return json({ error: event.error }, 400);
  }

  let recorded: unknown;
  try {
    recorded = await callDatabase(dependencies.database, 'record_webhook_event', {
      p_id: event.value.id,
      p_workout_id: event.value.workoutId,
    });
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      return json({ error: 'the webhook store is unavailable' }, 503);
    }
    throw error;
  }
  // A replay is a delivery we have already acted on. Hevy retries at least
  // once, so re-running the notification here would send a second push for one
  // workout — which is the duplicate the event id exists to prevent.
  if (recorded !== true) {
    return json({ recorded: false, notified: false }, 200);
  }
  const notified = await notifyIfDue(request, event.value, dependencies);

  return json({ recorded: true, notified }, 200);
}
