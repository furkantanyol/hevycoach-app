import { EXERCISE_SCHEMA, NO_MEMORY, untrusted } from './prompt.js';

/** Passed as the targets when a finished workout matches no session in the block. */
export const NO_TARGETS = 'no targets: this workout is not part of the current block';
/** The review rewrites the memory each time; `review` truncates to this so a drifting model cannot grow it without bound. */
export const MEMORY_MAX_CHARACTERS = 1500;

/** The shape of the review the athlete reads. Stated in the task and in the schema so the two cannot drift. */
const REVIEW_MARKDOWN = `Write it as markdown, bold headings with one to three short bullets each, in this order.
**Went well**
**Push next time**
**Proposed change** — only when you are proposing one; leave the heading out entirely otherwise.
Then the question, as a plain last line outside the bullets. No emoji.`;

/** One session of the current block, rewritten whole. The guard bounds the numbers before any of it reaches Hevy. */
const PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    session: {
      type: 'string',
      description: 'the name of the block session this rewrites, copied verbatim from the current block',
    },
    summary: {
      type: 'string',
      description: 'one line naming what changes and why, the same change the message describes',
    },
    exercises: {
      type: 'array',
      description:
        'the session as it should read after the change: every exercise it keeps, in order, not only the ones that move. Reuse the templateIds the current block already holds; an id you have not been shown cannot be written to Hevy. Never an empty list.',
      items: EXERCISE_SCHEMA,
    },
  },
  required: ['session', 'summary', 'exercises'],
  additionalProperties: false,
} as const;

export const REVIEW_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    message: {
      type: 'string',
      description: `the review the athlete reads: what went well, what to push next time, what you propose to change, ending with one question. ${REVIEW_MARKDOWN}`,
    },
    memory: {
      type: 'string',
      description: `the rolling coach memory rewritten with what is durable from this session, under ${MEMORY_MAX_CHARACTERS} characters, plain sentences`,
    },
    proposal: {
      description:
        'the one session you want to change, or null when the block should stand as written and when the workout matched no session of it',
      anyOf: [PROPOSAL_SCHEMA, { type: 'null' }],
    },
  },
  required: ['message', 'memory', 'proposal'],
  additionalProperties: false,
};

export function reviewTask(workout: string, targets: string, memory: string): string {
  return `Review this finished workout, then return message, memory and proposal.

## Session targets
${targets.trim() || NO_TARGETS}

## Memory so far
${memory.trim() || NO_MEMORY}

## The workout, from Hevy
${untrusted(workout)}

Compare what was done with the targets, name the adaptation rule that applies, say what changes next week, and end with one question. Rewrite the memory with what is durable from this session, under ${MEMORY_MAX_CHARACTERS} characters.

${REVIEW_MARKDOWN}

Propose a change only when an adaptation rule calls for one and this workout matched a session of the current block: name that session exactly as the block names it and rewrite it whole. Otherwise return proposal: null. Nothing is written to Hevy until the athlete accepts the proposal, so say what you propose in the message and let them answer.`;
}
