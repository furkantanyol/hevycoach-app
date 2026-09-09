import Anthropic from '@anthropic-ai/sdk';
import { COACH_SYSTEM_PROMPT, type UntrustedField, wrapUntrusted } from './prompt.ts';

/**
 * The single seam through which the model is called.
 *
 * The client is injected so tests never reach the network, and the Anthropic
 * key is read once at the edge (from Deno.env) and never leaves the server.
 */

const MODEL = 'claude-opus-5';
const MAX_TOKENS = 16_000;

export interface ModelClient {
  readonly messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
    ): Promise<Anthropic.Message>;
  };
}

export interface ModelRequest {
  /** Trusted instruction describing the task, written by us. */
  readonly task: string;
  /**
   * Every piece of free text the client supplied. Fenced as one untrusted
   * block, never interpolated into the task.
   */
  readonly userInput: readonly UntrustedField[];
  /** Structured-output schema, or null for a plain-text answer. */
  readonly schema: Readonly<Record<string, unknown>> | null;
}

export class ModelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelUnavailableError';
  }
}

export class ModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelOutputError';
  }
}

export function createModelClient(apiKey: string): ModelClient {
  return new Anthropic({ apiKey });
}

function textFrom(message: Anthropic.Message): string {
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  if (text.length === 0) {
    throw new ModelOutputError('the model returned no text');
  }
  return text;
}

function describe(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) {
    return 'the coaching model is rate limited';
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return 'the coaching model rejected our credentials';
  }
  if (error instanceof Anthropic.BadRequestError) {
    return 'the coaching model rejected the request';
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'the coaching model could not be reached';
  }
  if (error instanceof Anthropic.APIError) {
    return `the coaching model failed with status ${error.status}`;
  }
  return 'the coaching model failed';
}

async function callModel(client: ModelClient, request: ModelRequest): Promise<string> {
  const content = [request.task, wrapUntrusted(request.userInput)].join('\n\n');
  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system: COACH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
      ...(request.schema === null
        ? {}
        : { output_config: { format: { type: 'json_schema' as const, schema: request.schema } } }),
    });
    return textFrom(message);
  } catch (error) {
    if (error instanceof ModelOutputError) {
      throw error;
    }
    throw new ModelUnavailableError(describe(error));
  }
}

export async function requestStructured(
  client: ModelClient,
  request: ModelRequest,
): Promise<unknown> {
  const text = await callModel(client, request);
  try {
    return JSON.parse(text);
  } catch {
    throw new ModelOutputError('the model returned text that is not JSON');
  }
}
