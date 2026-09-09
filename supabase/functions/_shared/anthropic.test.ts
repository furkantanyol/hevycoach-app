import { assertEquals, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import Anthropic from '@anthropic-ai/sdk';
import {
  type ModelClient,
  ModelOutputError,
  ModelUnavailableError,
  requestStructured,
} from './anthropic.ts';
import { USER_INPUT_OPEN } from './prompt.ts';

const REQUEST = {
  task: 'Design a training block for this lifter.',
  userInput: [{ label: 'Coaching notes', text: 'I hate leg press.' }],
  schema: null,
};

function answeringModel(text: string): ModelClient {
  return {
    messages: {
      create: () =>
        Promise.resolve({ content: [{ type: 'text', text }] } as Anthropic.Message),
    },
  };
}

function failingModel(error: unknown): ModelClient {
  return { messages: { create: () => Promise.reject(error) } };
}

async function messageFor(error: unknown): Promise<string> {
  const rejection = await assertRejects(
    () => requestStructured(failingModel(error), REQUEST),
    ModelUnavailableError,
  );
  return rejection.message;
}

describe('requestStructured', () => {
  it('should parse the JSON the model returned', async () => {
    const output = await requestStructured(answeringModel('{"explanation":"held"}'), REQUEST);
    assertEquals(output, { explanation: 'held' });
  });

  it('should reject text that is not JSON', async () => {
    await assertRejects(
      () => requestStructured(answeringModel('sure, here you go'), REQUEST),
      ModelOutputError,
    );
  });

  it('should reject a message carrying no text', async () => {
    const empty: ModelClient = {
      messages: { create: () => Promise.resolve({ content: [] } as unknown as Anthropic.Message) },
    };
    await assertRejects(() => requestStructured(empty, REQUEST), ModelOutputError);
  });

  it('should fence the user input in the prompt it sends', async () => {
    const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const model: ModelClient = {
      messages: {
        create(body) {
          calls.push(body);
          return Promise.resolve(
            { content: [{ type: 'text', text: '{}' }] } as Anthropic.Message,
          );
        },
      },
    };

    await requestStructured(model, REQUEST);

    const content = String(calls[0].messages[0].content);
    assertEquals(content.startsWith(REQUEST.task), true);
    assertEquals(content.includes(`${USER_INPUT_OPEN}\nCoaching notes: I hate leg press.`), true);
  });
});

describe('the message a failed model call carries', () => {
  it('should name a rate limit', async () => {
    assertEquals(
      await messageFor(new Anthropic.RateLimitError(429, undefined, undefined, new Headers())),
      'the coaching model is rate limited',
    );
  });

  it('should name a credential failure', async () => {
    assertEquals(
      await messageFor(new Anthropic.AuthenticationError(401, undefined, undefined, new Headers())),
      'the coaching model rejected our credentials',
    );
  });

  it('should name a rejected request', async () => {
    assertEquals(
      await messageFor(new Anthropic.BadRequestError(400, undefined, undefined, new Headers())),
      'the coaching model rejected the request',
    );
  });

  it('should name an unreachable model', async () => {
    assertEquals(
      await messageFor(new Anthropic.APIConnectionError({ message: 'socket hang up' })),
      'the coaching model could not be reached',
    );
  });

  it('should fall back to the status for any other API error', async () => {
    assertEquals(
      await messageFor(new Anthropic.InternalServerError(500, undefined, undefined, new Headers())),
      'the coaching model failed with status 500',
    );
  });

  it('should stay vague about anything that is not an API error', async () => {
    assertEquals(await messageFor(new Error('network down')), 'the coaching model failed');
  });

  it('should never repeat what the model was told', async () => {
    const message = await messageFor(
      new Anthropic.BadRequestError(400, undefined, 'I hate leg press.', new Headers()),
    );
    assertEquals(message.includes('leg press'), false);
  });
});
