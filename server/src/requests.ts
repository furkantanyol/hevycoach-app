import type Anthropic from '@anthropic-ai/sdk';
import { CREATE_PROGRAM_TOOL, PLAN_OUTPUT_SCHEMA } from './plan-prompt.js';
import { contextBlock, SYSTEM_PROMPT, untrusted } from './prompt.js';
import { REVIEW_OUTPUT_SCHEMA } from './review-prompt.js';
import type { Message, State } from './state.js';

export const CONTEXT_MESSAGES = 30;

const PLAN_MAX_TOKENS = 16_000;
/** Three to five short lines: the read streams within seconds and is over before the block call starts. */
const READ_MAX_TOKENS = 400;
const CHAT_MAX_TOKENS = 64_000;
const REVIEW_MAX_TOKENS = 4_000;

const NO_ARGUMENTS: Anthropic.Tool['input_schema'] = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
};

export const APPLY_PROPOSAL_TOOL: Anthropic.Tool = {
  name: 'apply_proposal',
  description:
    "Write the pending proposal into the athlete's Hevy account: the guard checks the numbers, the routine for that session is updated, and the block is updated to match. Call it when they agree to the change.",
  strict: true,
  input_schema: NO_ARGUMENTS,
};

export const DISCARD_PROPOSAL_TOOL: Anthropic.Tool = {
  name: 'discard_proposal',
  description:
    'Drop the pending proposal and leave Hevy exactly as it is. Call it when they turn the change down or want the session kept as written.',
  strict: true,
  input_schema: NO_ARGUMENTS,
};

export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

export function toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
  const recent = messages.slice(-CONTEXT_MESSAGES);
  const firstUser = recent.findIndex((message) => message.role === 'user');
  if (firstUser === -1) return [];
  return recent.slice(firstUser).map((message) => ({
    role: message.role,
    content: message.role === 'user' ? untrusted(message.text) : message.text,
  }));
}

/** The stable prompt is cached; the context that moves with every turn follows it. */
function systemBlocks(state: State): Anthropic.TextBlockParam[] {
  return [
    { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: contextBlock(state) },
  ];
}

/** The recent thread, then the task last, so a plan or a review sees what was just said. */
function taskMessages(state: State, task: string): Anthropic.MessageParam[] {
  return [...toAnthropicMessages(state.messages), { role: 'user', content: task }];
}

/** Answering a proposal is offered only while one is pending, so a stray call can never reach Hevy. */
function chatTools(state: State): Anthropic.Tool[] {
  if (!state.pendingProposal) return [CREATE_PROGRAM_TOOL];
  return [CREATE_PROGRAM_TOOL, APPLY_PROPOSAL_TOOL, DISCARD_PROPOSAL_TOOL];
}

export function planRequest(state: State, model: string, task: string): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: PLAN_MAX_TOKENS,
    output_config: { effort: 'high', format: { type: 'json_schema', schema: PLAN_OUTPUT_SCHEMA } },
    system: systemBlocks(state),
    messages: taskMessages(state, task),
  };
}

/** The coach's read of the athlete, streamed as plain text ahead of the block; no tools, no thinking, so the first word comes fast. */
export function readRequest(state: State, model: string, task: string): Anthropic.MessageStreamParams {
  return {
    model,
    max_tokens: READ_MAX_TOKENS,
    // Low: the read formats numbers the history already holds, and its first word is the wait the athlete feels.
    output_config: { effort: 'low' },
    system: systemBlocks(state),
    messages: taskMessages(state, task),
  };
}

export function chatRequest(state: State, model: string, messages: Anthropic.MessageParam[]): Anthropic.MessageStreamParams {
  return {
    model,
    max_tokens: CHAT_MAX_TOKENS,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: systemBlocks(state),
    tools: chatTools(state),
    messages,
  };
}

export function reviewRequest(state: State, model: string, task: string): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: REVIEW_MAX_TOKENS,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: REVIEW_OUTPUT_SCHEMA } },
    system: systemBlocks(state),
    messages: taskMessages(state, task),
  };
}
