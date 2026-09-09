import {
  type ModelClient,
  ModelOutputError,
  ModelUnavailableError,
  requestStructured,
} from '../_shared/anthropic.ts';
import type { Database } from '../_shared/db.ts';
import { identityFromHash, IDENTITY_HEADER } from '../_shared/identity.ts';
import {
  EXPLAIN_OUTPUT_SCHEMA,
  parseExplainResponse,
  parseProgramResponse,
  PROGRAM_OUTPUT_SCHEMA,
} from '../_shared/model-output.ts';
import { consumeRateLimit, type RateLimitPolicy } from '../_shared/rate-limit.ts';
import {
  type ExplainRequest,
  parseExplainRequest,
  parseProgramRequest,
  type ProgramRequest,
} from '../_shared/schemas.ts';

/**
 * Both coach routes live in one function: Supabase's routing guide recommends
 * combining actions to cut cold starts, and paths are always prefixed with the
 * function name.
 */

const PROGRAM_PATH = '/coach/program';
const EXPLAIN_PATH = '/coach/explain';

/** Generating a block is expensive; explaining one is cheap. */
const PROGRAM_POLICY: RateLimitPolicy = { limit: 5, windowSeconds: 60 * 60 };
const EXPLAIN_POLICY: RateLimitPolicy = { limit: 30, windowSeconds: 60 * 60 };

export interface CoachDependencies {
  readonly database: Database;
  readonly model: ModelClient;
  readonly now: () => Date;
}

function json(body: Readonly<Record<string, unknown>>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function failure(status: number, error: string): Response {
  return json({ error }, status);
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function programTask(request: ProgramRequest): string {
  const templates = request.templates
    .map((template) =>
      `- ${template.id} | ${template.title} | ${template.primaryMuscleGroup} | ${template.equipment}`
    )
    .join('\n');
  return [
    'Design a training block for this lifter.',
    '',
    `Goal: ${request.onboarding.goal}`,
    `Sessions available per week: ${request.onboarding.daysPerWeek}`,
    `Experience: ${request.onboarding.experience}`,
    `Equipment: ${request.onboarding.equipment}`,
    `Constraints: ${request.onboarding.constraints}`,
    '',
    'Training history summary:',
    request.historySummary,
    '',
    'Exercise templates you may use (id | title | primary muscle group | equipment):',
    templates,
  ].join('\n');
}

function explainTask(request: ExplainRequest): string {
  const question = request.question ?? `Explain this ${request.subject} to the lifter.`;
  return [
    `Explain a coaching ${request.subject} in a few sentences.`,
    '',
    'Context:',
    request.context,
    '',
    'Question:',
    question,
  ].join('\n');
}

async function handleProgram(body: unknown, dependencies: CoachDependencies): Promise<Response> {
  const request = parseProgramRequest(body);
  if (!request.ok) {
    return failure(400, request.error);
  }
  const output = await requestStructured(dependencies.model, {
    task: programTask(request.value),
    coachingNotes: request.value.coachingNotes,
    schema: PROGRAM_OUTPUT_SCHEMA,
  });
  const offeredIds = new Set(request.value.templates.map((template) => template.id));
  const program = parseProgramResponse(output, offeredIds);
  if (!program.ok) {
    return failure(502, `the coaching model returned an unusable program: ${program.error}`);
  }
  return json({ ...program.value }, 200);
}

async function handleExplain(body: unknown, dependencies: CoachDependencies): Promise<Response> {
  const request = parseExplainRequest(body);
  if (!request.ok) {
    return failure(400, request.error);
  }
  const output = await requestStructured(dependencies.model, {
    task: explainTask(request.value),
    coachingNotes: '',
    schema: EXPLAIN_OUTPUT_SCHEMA,
  });
  const explanation = parseExplainResponse(output);
  if (!explanation.ok) {
    return failure(502, `the coaching model returned an unusable explanation: ${explanation.error}`);
  }
  return json({ ...explanation.value }, 200);
}

function policyFor(pathname: string): { readonly endpoint: string; readonly policy: RateLimitPolicy } | null {
  if (pathname === PROGRAM_PATH) {
    return { endpoint: PROGRAM_PATH, policy: PROGRAM_POLICY };
  }
  if (pathname === EXPLAIN_PATH) {
    return { endpoint: EXPLAIN_PATH, policy: EXPLAIN_POLICY };
  }
  return null;
}

export async function handleCoachRequest(
  request: Request,
  dependencies: CoachDependencies,
): Promise<Response> {
  const route = policyFor(new URL(request.url).pathname);
  if (route === null) {
    return failure(404, 'unknown route');
  }
  if (request.method !== 'POST') {
    return failure(405, 'this route only accepts POST');
  }
  const identityHash = identityFromHash(request.headers.get(IDENTITY_HEADER));
  if (identityHash === null) {
    return failure(401, `a valid ${IDENTITY_HEADER} header is required`);
  }

  let decision;
  try {
    decision = await consumeRateLimit(dependencies.database, {
      identityHash,
      endpoint: route.endpoint,
      policy: route.policy,
      now: dependencies.now(),
    });
  } catch {
    return failure(503, 'the rate limiter is unavailable');
  }
  if (!decision.allowed) {
    return new Response(JSON.stringify({ error: 'rate limit exceeded' }), {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': String(decision.retryAfterSeconds),
      },
    });
  }

  const body = await readJsonBody(request);
  if (body === undefined) {
    return failure(400, 'body must be JSON');
  }

  try {
    return route.endpoint === PROGRAM_PATH
      ? await handleProgram(body, dependencies)
      : await handleExplain(body, dependencies);
  } catch (error) {
    if (error instanceof ModelOutputError) {
      return failure(502, error.message);
    }
    if (error instanceof ModelUnavailableError) {
      return failure(503, error.message);
    }
    throw error;
  }
}
