import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import {
  parseProgramResponse,
  PROGRAM_OUTPUT_SCHEMA,
} from './model-output.ts';
import type { Validated } from './validate.ts';

const TEMPLATE_IDS = new Set(['tpl-squat', 'tpl-bench', 'tpl-row']);

const VALID_RESPONSE = {
  block: { name: 'Upper emphasis', weeks: 4, sessionsPerWeek: 4 },
  sessions: [
    {
      name: 'Lower A',
      focus: 'bilateral squat pattern',
      exercises: [{ exerciseTemplateId: 'tpl-squat', role: 'primary' }],
    },
  ],
  rationale: 'Your bench has not moved, so pressing gets the fresh slot.',
};

function errorOf<T>(result: Validated<T>): string {
  assert(!result.ok, 'expected validation to fail');
  return result.error;
}

describe('parseProgramResponse', () => {
  it('should accept a response built only from offered templates', () => {
    const result = parseProgramResponse(VALID_RESPONSE, TEMPLATE_IDS);
    assert(result.ok);
    assertEquals(result.value.sessions[0].exercises[0].exerciseTemplateId, 'tpl-squat');
  });

  it('should reject an exercise template id the request never offered', () => {
    const hallucinated = {
      ...VALID_RESPONSE,
      sessions: [
        {
          ...VALID_RESPONSE.sessions[0],
          exercises: [{ exerciseTemplateId: 'tpl-invented', role: 'primary' }],
        },
      ],
    };

    assertStringIncludes(errorOf(parseProgramResponse(hallucinated, TEMPLATE_IDS)), 'tpl-invented');
  });

  it('should reject a hallucinated id even when the rest of the session is valid', () => {
    const mixed = {
      ...VALID_RESPONSE,
      sessions: [
        {
          ...VALID_RESPONSE.sessions[0],
          exercises: [
            { exerciseTemplateId: 'tpl-squat', role: 'primary' },
            { exerciseTemplateId: 'tpl-ghost', role: 'accessory' },
          ],
        },
      ],
    };

    assertStringIncludes(errorOf(parseProgramResponse(mixed, TEMPLATE_IDS)), 'tpl-ghost');
  });

  it('should reject a set count smuggled onto an exercise', () => {
    const withSets = {
      ...VALID_RESPONSE,
      sessions: [
        {
          ...VALID_RESPONSE.sessions[0],
          exercises: [{ exerciseTemplateId: 'tpl-squat', role: 'primary', sets: 4 }],
        },
      ],
    };

    assertStringIncludes(errorOf(parseProgramResponse(withSets, TEMPLATE_IDS)), 'sets');
  });

  it('should reject a rep range smuggled onto a session', () => {
    const withReps = {
      ...VALID_RESPONSE,
      sessions: [{ ...VALID_RESPONSE.sessions[0], repRange: '8-12' }],
    };

    assertStringIncludes(errorOf(parseProgramResponse(withReps, TEMPLATE_IDS)), 'repRange');
  });

  it('should reject a working weight smuggled onto the block', () => {
    const withWeight = {
      ...VALID_RESPONSE,
      block: { ...VALID_RESPONSE.block, startingWeightKg: 87.5 },
    };

    assertStringIncludes(errorOf(parseProgramResponse(withWeight, TEMPLATE_IDS)), 'startingWeightKg');
  });

  it('should reject an unknown exercise role', () => {
    const badRole = {
      ...VALID_RESPONSE,
      sessions: [
        {
          ...VALID_RESPONSE.sessions[0],
          exercises: [{ exerciseTemplateId: 'tpl-squat', role: 'warmup' }],
        },
      ],
    };

    assertStringIncludes(errorOf(parseProgramResponse(badRole, TEMPLATE_IDS)), 'role');
  });

  it('should reject a session with no exercises', () => {
    const empty = {
      ...VALID_RESPONSE,
      sessions: [{ ...VALID_RESPONSE.sessions[0], exercises: [] }],
    };

    assertStringIncludes(errorOf(parseProgramResponse(empty, TEMPLATE_IDS)), 'exercises');
  });
});

describe('PROGRAM_OUTPUT_SCHEMA', () => {
  it('should not mention any number the rules engine owns', () => {
    const serialised = JSON.stringify(PROGRAM_OUTPUT_SCHEMA).toLowerCase();
    for (const forbidden of ['weight', 'sets', 'reps', 'rpe', 'rir', 'load', 'percent', 'rest']) {
      assertEquals(serialised.includes(forbidden), false, `schema mentions ${forbidden}`);
    }
  });

  it('should forbid additional properties at every level', () => {
    const serialised = JSON.stringify(PROGRAM_OUTPUT_SCHEMA);
    assertEquals(serialised.split('"additionalProperties":false').length - 1, 4);
  });
});
