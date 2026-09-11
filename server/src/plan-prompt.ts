import type Anthropic from '@anthropic-ai/sdk';
import { MAX_SESSIONS, MIN_SESSIONS } from './guard.js';
import { enumField, profileLines, STYLE_RULES, untrusted } from './prompt.js';
import { EQUIPMENT, GOALS, INJURIES, PROFILE_KEYS, YEARS_TRAINING, type Profile } from './state.js';

// The guard enforces these bounds; the prompt states them so the model aims inside them.
const MAX_JUMP_PERCENT = 15;
const NO_HISTORY_CAP_KG = 100;
const SET_RANGE = '1 to 8';
const REP_RANGE = '1 to 30';
const RPE_RANGE = '5 to 10';
const WEEKS_RANGE = '4 to 6';

/** The read is already on screen when the block lands, so the analysis is only what is left to say. Stated in the task and in the schema so the two cannot drift. */
const THIS_WEEK = `Write the analysis as markdown: the bold heading **This week**, then two bullets, one on how to run the first sessions and one on what you are watching. ${STYLE_RULES} Never a question. The athlete has already read your read of them; do not repeat it.`;

const PROFILE_SCHEMA = {
  type: 'object',
  description: 'the athlete profile the block is built from, carried whole so a re-plan can change any field',
  properties: {
    goals: {
      type: 'array',
      // No minItems: the messages API rejects the keyword (docs/research/claude-api-shapes.md), so isProfile enforces the rule after parsing.
      description: 'everything the block serves, most important first; never empty and never repeating a goal',
      items: { type: 'string', enum: [...GOALS] },
    },
    daysPerWeek: { type: 'integer', description: 'training sessions per week they will commit to, 1 to 7' },
    bodyweightKg: { type: 'number', description: 'bodyweight in kilograms' },
    injuries: {
      type: 'array',
      description: 'the joints and areas to program around; an empty list when there are none',
      items: { type: 'string', enum: [...INJURIES] },
    },
    notes: { type: 'string', description: 'injury detail and anything else in their own words; empty string if none' },
    equipment: enumField(EQUIPMENT, 'the equipment they actually train with'),
    sessionMinutes: { type: 'integer', description: 'minutes they have for one session' },
    yearsTraining: enumField(YEARS_TRAINING, 'years of consistent training'),
  },
  required: [...PROFILE_KEYS],
  additionalProperties: false,
};

export const CREATE_PROGRAM_TOOL: Anthropic.Tool = {
  name: 'create_program',
  description:
    'Read the full Hevy history, design a training block and write it into the athlete\'s Hevy account as routines. The only way a program exists or changes. Call it once intake is answered, and again whenever the goal, days, equipment or constraints change.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      profile: PROFILE_SCHEMA,
      reason: {
        type: 'string',
        description: 'one line on why this block is being written now, for the athlete to read',
      },
    },
    required: ['profile', 'reason'],
    additionalProperties: false,
  },
};

export const EXERCISE_SCHEMA = {
  type: 'object',
  properties: {
    templateId: { type: 'string', description: 'an exercise template id copied verbatim from the catalogue' },
    title: { type: 'string', description: 'the template title from the catalogue' },
    sets: { type: 'integer', description: `working sets, ${SET_RANGE}` },
    reps: { type: 'integer', description: `target reps per set, ${REP_RANGE}` },
    weightKg: {
      type: 'number',
      description: `load in kg; 0 for a bodyweight movement; at most ${MAX_JUMP_PERCENT}% above the best weight logged for this template, and at most ${NO_HISTORY_CAP_KG} when the template has no history`,
    },
    rpe: { type: 'number', description: `target RPE, ${RPE_RANGE}` },
    note: { type: 'string', description: 'one short cue for the athlete; empty string if there is nothing to say' },
  },
  required: ['templateId', 'title', 'sets', 'reps', 'weightKg', 'rpe', 'note'],
  additionalProperties: false,
} as const;

const SESSION_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'the routine title as it will appear in Hevy' },
    focus: { type: 'string', description: 'what this day trains, a few words' },
    exercises: { type: 'array', description: 'the exercises in order, compounds first', items: EXERCISE_SCHEMA },
  },
  required: ['name', 'focus', 'exercises'],
  additionalProperties: false,
} as const;

export const PLAN_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    analysis: {
      type: 'string',
      description: `for the athlete to read under your read of them. ${THIS_WEEK}\nNever a refusal: when something is unknown, name the conservative assumption you made in one line.`,
    },
    block: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'the block name, a few words' },
        weeks: { type: 'integer', description: `mesocycle length before the deload, ${WEEKS_RANGE}` },
        sessions: {
          type: 'array',
          description: `one session per training day of the week, in the order they are trained: ${MIN_SESSIONS} to ${MAX_SESSIONS} of them, matching the days per week in the profile, each holding exercises built from the supplied template ids. Never an empty list.`,
          items: SESSION_SCHEMA,
        },
      },
      required: ['name', 'weeks', 'sessions'],
      additionalProperties: false,
    },
  },
  required: ['analysis', 'block'],
  additionalProperties: false,
};

/** Only when the athlete chose to continue: the block builds on what they run, and the analysis says what moved. */
const CONTINUE_INSTRUCTION =
  'The athlete is continuing the routines under "Current routines": keep their structure and exercise selection where it still serves the profile, progress the loads from the history, and change only what the analysis justifies. Say what changed and why.';

/** Streamed first, so the athlete reads the coach while the block is still being written. */
export function readTask(profile: Profile, history: string, current?: string): string {
  const data = untrusted(
    [
      '## Profile',
      profileLines(profile),
      '',
      ...(current === undefined ? [] : ['## Current routines', current, '']),
      '## Training history',
      history,
    ].join('\n'),
  );
  return `Give the athlete your read of them before their block is written, as markdown with three bold headings and bullets under each:
**Where you stand**: two or three bullets with the numbers from the history (sessions, frequency, the key lifts, how long they have been flat).
**What matters most**: one bullet.
**What the block does**: one bullet on the approach. Do not name the block's exercises or loads yet.
${STYLE_RULES} Never a question.

${data}`;
}

/** The read is shown before the block is written; handed back here so the block keeps its word. */
const readSection = (read: string | undefined): string =>
  read === undefined ? '' : `\nYour read, already shown to the athlete. The block keeps its word:\n${read}\n`;

export function planTask(profile: Profile, history: string, catalogue: string, reason: string, current?: string, read?: string): string {
  const data = untrusted(
    [
      '## Profile',
      profileLines(profile),
      '',
      '## Why a block is being written now',
      reason,
      '',
      ...(current === undefined ? [] : ['## Current routines', current, '']),
      '## Training history',
      history,
      '',
      '## Template catalogue',
      catalogue,
    ].join('\n'),
  );
  return `Design the next training block for this athlete, then return analysis and block.
${current === undefined ? '' : `\n${CONTINUE_INSTRUCTION}\n`}${readSection(read)}
Every templateId must be copied verbatim from the catalogue; an id that is not in it cannot be written to Hevy. Set weightKg from the history: at most ${MAX_JUMP_PERCENT}% above the best weight logged for that template, at most ${NO_HISTORY_CAP_KG} kg when the template has no history, and 0 for bodyweight movements. Sets stay in ${SET_RANGE}, reps in ${REP_RANGE}, RPE in ${RPE_RANGE}, and the block runs ${WEEKS_RANGE} weeks.

Give the athlete ${profile.daysPerWeek} sessions a week, every muscle twice a week, volume inside the landmarks, and DUP if they are intermediate.

The block is always complete: a name, ${MIN_SESSIONS} to ${MAX_SESSIONS} sessions matching the days per week above, and every session holding exercises built from the catalogue ids. Never return an empty block, and never ask a question in the analysis — nothing here can answer it. When something is unknown, make the conservative assumption, program it, and state that assumption in the analysis.

${THIS_WEEK}

${data}`;
}
