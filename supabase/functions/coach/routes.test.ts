import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import type Anthropic from '@anthropic-ai/sdk';
import type { ModelClient } from '../_shared/anthropic.ts';
import type { Database, DatabaseResult } from '../_shared/db.ts';
import { IDENTITY_HEADER } from '../_shared/identity.ts';
import { USER_NOTES_CLOSE, USER_NOTES_OPEN } from '../_shared/prompt.ts';
import { type CoachDependencies, handleCoachRequest } from './routes.ts';

const IDENTITY = 'd'.repeat(64);
const NOW = new Date('2026-09-09T09:00:00.000Z');

const TEMPLATES = [
  { id: 'tpl-squat', title: 'Squat (Barbell)', primaryMuscleGroup: 'quadriceps', equipment: 'barbell' },
  { id: 'tpl-bench', title: 'Bench Press (Barbell)', primaryMuscleGroup: 'chest', equipment: 'barbell' },
];

const PROGRAM_BODY = {
  onboarding: {
    goal: 'both',
    daysPerWeek: 4,
    experience: 'six years lifting',
    equipment: 'full commercial gym',
    constraints: 'none',
  },
  coachingNotes: 'I hate leg press.',
  historySummary: '275 workouts logged.',
  templates: TEMPLATES,
};

const PROGRAM_OUTPUT = {
  block: { name: 'Upper emphasis', weeks: 4, sessionsPerWeek: 4 },
  sessions: [
    {
      name: 'Lower A',
      focus: 'squat pattern',
      exercises: [{ exerciseTemplateId: 'tpl-squat', role: 'primary' }],
    },
  ],
  rationale: 'Pressing gets the fresh slot.',
};

function allowingDatabase(count = 1): Database {
  return { rpc: (): Promise<DatabaseResult> => Promise.resolve({ data: count, error: null }) };
}

function stubModel(
  output: unknown,
): { model: ModelClient; calls: Anthropic.MessageCreateParamsNonStreaming[] } {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const model: ModelClient = {
    messages: {
      create(body) {
        calls.push(body);
        return Promise.resolve({
          content: [{ type: 'text', text: JSON.stringify(output), citations: null }],
        } as Anthropic.Message);
      },
    },
  };
  return { model, calls };
}

function dependencies(database: Database, model: ModelClient): CoachDependencies {
  return { database, model, now: () => NOW };
}

function programRequest(body: unknown = PROGRAM_BODY, identity: string | null = IDENTITY): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (identity !== null) {
    headers.set(IDENTITY_HEADER, identity);
  }
  return new Request('https://edge.test/coach/program', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('handleCoachRequest routing', () => {
  it('should return 404 for a path outside the function', async () => {
    const { model } = stubModel(PROGRAM_OUTPUT);
    const response = await handleCoachRequest(
      new Request('https://edge.test/coach/nonsense', { method: 'POST' }),
      dependencies(allowingDatabase(), model),
    );
    assertEquals(response.status, 404);
  });

  it('should refuse a GET on the program route', async () => {
    const { model } = stubModel(PROGRAM_OUTPUT);
    const response = await handleCoachRequest(
      new Request('https://edge.test/coach/program'),
      dependencies(allowingDatabase(), model),
    );
    assertEquals(response.status, 405);
  });
});

describe('handleCoachRequest identity', () => {
  it('should reject a request with no identity header', async () => {
    const { model } = stubModel(PROGRAM_OUTPUT);
    const response = await handleCoachRequest(
      programRequest(PROGRAM_BODY, null),
      dependencies(allowingDatabase(), model),
    );
    assertEquals(response.status, 401);
  });

  it('should reject an identity header that is not a SHA-256 hash', async () => {
    const { model } = stubModel(PROGRAM_OUTPUT);
    const response = await handleCoachRequest(
      programRequest(PROGRAM_BODY, 'not-a-hash'),
      dependencies(allowingDatabase(), model),
    );
    assertEquals(response.status, 401);
  });

  it('should not call the model when the identity is rejected', async () => {
    const { model, calls } = stubModel(PROGRAM_OUTPUT);
    await handleCoachRequest(
      programRequest(PROGRAM_BODY, null),
      dependencies(allowingDatabase(), model),
    );
    assertEquals(calls.length, 0);
  });
});

describe('handleCoachRequest rate limiting', () => {
  it('should return 429 with a retry-after once the limit is passed', async () => {
    const { model, calls } = stubModel(PROGRAM_OUTPUT);
    const response = await handleCoachRequest(
      programRequest(),
      dependencies(allowingDatabase(6), model),
    );

    assertEquals(response.status, 429);
    assert(response.headers.get('retry-after') !== null);
    assertEquals(calls.length, 0);
  });

  it('should fail closed with 503 when the rate limiter errors', async () => {
    const { model } = stubModel(PROGRAM_OUTPUT);
    const database: Database = {
      rpc: () => Promise.resolve({ data: null, error: { message: 'down' } }),
    };
    const response = await handleCoachRequest(programRequest(), dependencies(database, model));
    assertEquals(response.status, 503);
  });
});

describe('POST /coach/program', () => {
  it('should return the block the model proposed', async () => {
    const { model } = stubModel(PROGRAM_OUTPUT);
    const response = await handleCoachRequest(
      programRequest(),
      dependencies(allowingDatabase(), model),
    );

    assertEquals(response.status, 200);
    assertEquals(await response.json(), PROGRAM_OUTPUT);
  });

  it('should send the fixed system prompt rather than anything user-supplied', async () => {
    const { model, calls } = stubModel(PROGRAM_OUTPUT);
    await handleCoachRequest(programRequest(), dependencies(allowingDatabase(), model));

    assertStringIncludes(String(calls[0].system), 'rules engine on the device owns every number');
  });

  it('should wrap the coaching notes in the untrusted-input delimiters', async () => {
    const { model, calls } = stubModel(PROGRAM_OUTPUT);
    await handleCoachRequest(programRequest(), dependencies(allowingDatabase(), model));

    const content = String(calls[0].messages[0].content);
    assertStringIncludes(content, `${USER_NOTES_OPEN}\nI hate leg press.\n${USER_NOTES_CLOSE}`);
  });

  it('should ask for structured output with the number-free schema', async () => {
    const { model, calls } = stubModel(PROGRAM_OUTPUT);
    await handleCoachRequest(programRequest(), dependencies(allowingDatabase(), model));

    assertEquals(calls[0].output_config?.format?.type, 'json_schema');
    assertEquals(calls[0].thinking, { type: 'adaptive' });
    assertEquals(calls[0].model, 'claude-opus-5');
  });

  it('should reject a program that names an exercise template the request never offered', async () => {
    const hallucinated = {
      ...PROGRAM_OUTPUT,
      sessions: [
        {
          name: 'Lower A',
          focus: 'squat pattern',
          exercises: [{ exerciseTemplateId: 'tpl-invented', role: 'primary' }],
        },
      ],
    };
    const { model } = stubModel(hallucinated);

    const response = await handleCoachRequest(
      programRequest(),
      dependencies(allowingDatabase(), model),
    );

    assertEquals(response.status, 502);
    assertStringIncludes((await response.json()).error, 'tpl-invented');
  });

  it('should reject a program carrying a set count', async () => {
    const withSets = {
      ...PROGRAM_OUTPUT,
      sessions: [
        {
          name: 'Lower A',
          focus: 'squat pattern',
          exercises: [{ exerciseTemplateId: 'tpl-squat', role: 'primary', sets: 4 }],
        },
      ],
    };
    const { model } = stubModel(withSets);

    const response = await handleCoachRequest(
      programRequest(),
      dependencies(allowingDatabase(), model),
    );

    assertEquals(response.status, 502);
  });

  it('should return 400 for a malformed body', async () => {
    const { model } = stubModel(PROGRAM_OUTPUT);
    const response = await handleCoachRequest(
      programRequest({ onboarding: {} }),
      dependencies(allowingDatabase(), model),
    );
    assertEquals(response.status, 400);
  });

  it('should return 502 when the model answers with something that is not JSON', async () => {
    const model: ModelClient = {
      messages: {
        create: () =>
          Promise.resolve(
            { content: [{ type: 'text', text: 'sure, here you go' }] } as Anthropic.Message,
          ),
      },
    };
    const response = await handleCoachRequest(
      programRequest(),
      dependencies(allowingDatabase(), model),
    );
    assertEquals(response.status, 502);
  });

  it('should return 503 when the model call fails', async () => {
    const model: ModelClient = {
      messages: { create: () => Promise.reject(new Error('network down')) },
    };
    const response = await handleCoachRequest(
      programRequest(),
      dependencies(allowingDatabase(), model),
    );
    assertEquals(response.status, 503);
  });
});

describe('POST /coach/explain', () => {
  function explainRequest(body: unknown): Request {
    return new Request('https://edge.test/coach/explain', {
      method: 'POST',
      headers: { [IDENTITY_HEADER]: IDENTITY, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('should return the explanation as a single turn', async () => {
    const { model, calls } = stubModel({ explanation: 'Your bench held because you missed reps.' });

    const response = await handleCoachRequest(
      explainRequest({ subject: 'decision', context: 'bench held', question: 'why?' }),
      dependencies(allowingDatabase(), model),
    );

    assertEquals(response.status, 200);
    assertEquals(await response.json(), { explanation: 'Your bench held because you missed reps.' });
    assertEquals(calls[0].messages.length, 1);
  });

  it('should return 400 for an unknown subject', async () => {
    const { model } = stubModel({ explanation: 'x' });
    const response = await handleCoachRequest(
      explainRequest({ subject: 'nutrition', context: 'x' }),
      dependencies(allowingDatabase(), model),
    );
    assertEquals(response.status, 400);
  });

  it('should reject an explanation carrying extra fields', async () => {
    const { model } = stubModel({ explanation: 'do 87.5kg', suggestedWeightKg: 87.5 });
    const response = await handleCoachRequest(
      explainRequest({ subject: 'block', context: 'week 3' }),
      dependencies(allowingDatabase(), model),
    );
    assertEquals(response.status, 502);
  });
});
