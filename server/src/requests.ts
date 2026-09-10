import type Anthropic from '@anthropic-ai/sdk';
import { contextBlock, CREATE_PROGRAM_TOOL, PLAN_OUTPUT_SCHEMA, SYSTEM_PROMPT, untrusted, VERDICT_OUTPUT_SCHEMA } from './prompt.js';
import type { Message, State } from './state.js';

export const CONTEXT_MESSAGES = 30;

const PLAN_MAX_TOKENS = 16_000;
const CHAT_MAX_TOKENS = 64_000;
const VERDICT_MAX_TOKENS = 4_000;

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

/** The recent thread, then the task last, so a plan or a verdict sees what was just said. */
function taskMessages(state: State, task: string): Anthropic.MessageParam[] {
  return [...toAnthropicMessages(state.messages), { role: 'user', content: task }];
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

export function chatRequest(state: State, model: string, messages: Anthropic.MessageParam[]): Anthropic.MessageStreamParams {
  return {
    model,
    max_tokens: CHAT_MAX_TOKENS,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: systemBlocks(state),
    tools: [CREATE_PROGRAM_TOOL],
    messages,
  };
}

export function verdictRequest(state: State, model: string, task: string): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: VERDICT_MAX_TOKENS,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: VERDICT_OUTPUT_SCHEMA } },
    system: systemBlocks(state),
    messages: taskMessages(state, task),
  };
}
