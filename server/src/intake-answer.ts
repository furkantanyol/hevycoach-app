import type Anthropic from '@anthropic-ai/sdk';
import type { CoachDeps } from './coach.js';
import { SYSTEM_PROMPT, untrusted } from './prompt.js';
import { GOALS, INJURIES, type Goal, type Injury, type IntakeStep, type Profile } from './state.js';

export const DAYS_PER_WEEK = [2, 3, 4, 5, 6];
export const BODYWEIGHT_KG = { min: 30, max: 250 } as const;
/** Chosen on the injuries step, it clears whatever else was tapped. */
export const NOTHING = 'nothing';
export const YES = 'yes';
export const CHANGED = 'changed';

/** One answered profile field, or the athlete saying the bodyweight Hevy holds has changed. */
export type Answer = Partial<Profile> | typeof CHANGED;

/** The step a typed reply is answering, and the bodyweight Hevy holds when that step confirms it. */
export interface AnsweredStep {
  step: IntakeStep;
  heldBodyweightKg: number | null;
}

const INTERPRET_MAX_TOKENS = 512;
/** Said only when the history has no measurement to confirm, so a bare "still right" is never invented. */
const HELD_UNKNOWN = 'We hold no bodyweight for them: report unclear unless their reply gives a number.';

const single = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);

const strings = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).filter((entry): entry is string => typeof entry === 'string');

const isGoal = (value: string): value is Goal => GOALS.some((goal) => goal === value);
const isInjury = (value: string): value is Injury => INJURIES.some((injury) => injury === value);

function goalsAnswer(value: unknown): Answer | null {
  const goals = strings(value).filter(isGoal);
  return goals.length > 0 ? { goals } : null;
}

function daysAnswer(value: unknown): Answer | null {
  const daysPerWeek = Number(single(value));
  return DAYS_PER_WEEK.includes(daysPerWeek) ? { daysPerWeek } : null;
}

function injuriesAnswer(value: unknown): Answer | null {
  const chosen = strings(value);
  if (chosen.includes(NOTHING)) return { injuries: [] };
  return { injuries: chosen.filter(isInjury) };
}

function bodyweightAnswer(value: unknown): Answer | null {
  const bodyweightKg = Number(single(value));
  if (!Number.isFinite(bodyweightKg)) return null;
  return bodyweightKg >= BODYWEIGHT_KG.min && bodyweightKg <= BODYWEIGHT_KG.max ? { bodyweightKg } : null;
}

const ANSWER_OF: Record<IntakeStep, (value: unknown) => Answer | null> = {
  goals: goalsAnswer,
  daysPerWeek: daysAnswer,
  injuries: injuriesAnswer,
  bodyweight: bodyweightAnswer,
  bodyweightValue: bodyweightAnswer,
};

/** Null when the value is not an answer to this step: the coach re-asks rather than guessing. */
export function answerOf(step: IntakeStep, value: unknown): Answer | null {
  return ANSWER_OF[step](value);
}

const KILOGRAMS = `a number of kilograms between ${BODYWEIGHT_KG.min} and ${BODYWEIGHT_KG.max}`;

const ASKED: Record<IntakeStep, { task: string; values: string; field: Record<string, unknown> }> = {
  goals: {
    task: 'what they are training for',
    values: GOALS.join(', '),
    field: { type: 'array', description: 'every goal they named', items: { type: 'string', enum: [...GOALS] } },
  },
  daysPerWeek: {
    task: 'how many days a week they can train',
    values: DAYS_PER_WEEK.join(', '),
    field: { type: 'integer', description: `training days a week, ${DAYS_PER_WEEK.join(', ')}` },
  },
  injuries: {
    task: 'anything to work around: injuries, joints, areas that hurt',
    values: `${INJURIES.join(', ')}, or an empty list when nothing needs working around`,
    field: { type: 'array', description: 'the areas they named', items: { type: 'string', enum: [...INJURIES] } },
  },
  bodyweight: {
    task: 'what they weigh, either confirming the number Hevy holds or giving a new one',
    values: KILOGRAMS,
    field: { type: 'number', description: `their bodyweight, ${KILOGRAMS}` },
  },
  bodyweightValue: {
    task: 'what they weigh now',
    values: KILOGRAMS,
    field: { type: 'number', description: `their bodyweight, ${KILOGRAMS}` },
  },
};

// No minimum or maximum: the messages API rejects those keywords (docs/research/claude-api-shapes.md),
// so the range lives in the description and `answerOf` enforces it after parsing.
function replySchema(step: IntakeStep): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      field: ASKED[step].field,
      unclear: { type: 'boolean', description: 'true when the reply does not answer this question at all' },
    },
    required: ['field', 'unclear'],
    additionalProperties: false,
  };
}

/** The confirmation step turns on a number the model cannot know unless the request carries it. */
function heldLine(asked: AnsweredStep): string {
  if (asked.step !== 'bodyweight') return '';
  const held = asked.heldBodyweightKg;
  if (held === null) return `\n\n${HELD_UNKNOWN}`;
  return `\n\nHevy holds ${held} kg for them. Return exactly ${held} when they confirm it, or the number they give when it has changed.`;
}

function interpretTask(asked: AnsweredStep, text: string): string {
  const { step } = asked;
  return `The athlete is answering one intake question: ${ASKED[step].task}. Read their reply and return the field it sets, or unclear when it answers something else.

Allowed values: ${ASKED[step].values}.${heldLine(asked)}

${untrusted(text)}`;
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/** One small call: a typed reply is mapped onto the step the script is waiting on, or reported unclear. */
export async function interpret(deps: CoachDeps, asked: AnsweredStep, text: string): Promise<Answer | null> {
  const { step } = asked;
  const message = await deps.anthropic.messages.create({
    model: deps.models.chat,
    max_tokens: INTERPRET_MAX_TOKENS,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: replySchema(step) } },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: interpretTask(asked, text) }],
  });
  const parsed = JSON.parse(textOf(message)) as { field: unknown; unclear: boolean };
  if (parsed.unclear) return null;
  return answerOf(step, parsed.field);
}
