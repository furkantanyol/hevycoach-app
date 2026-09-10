import { describe, expect, it } from 'vitest';
import { USER_INPUT_CLOSE, USER_INPUT_OPEN } from './prompt.js';
import { CONTEXT_MESSAGES, toAnthropicMessages } from './requests.js';
import type { Message } from './state.js';

const said = (role: Message['role'], text: string): Message => ({
  id: `${role}-${text}`,
  role,
  text,
  createdAt: '2026-09-10T10:00:00.000Z',
});

describe('toAnthropicMessages', () => {
  it(`should keep only the last ${CONTEXT_MESSAGES} messages`, () => {
    const messages = Array.from({ length: CONTEXT_MESSAGES + 12 }, (_, index) =>
      said('user', `line ${index}`),
    );

    expect(toAnthropicMessages(messages)).toHaveLength(CONTEXT_MESSAGES);
  });

  it('should wrap user text in the untrusted delimiters', () => {
    const [first] = toAnthropicMessages([said('user', 'four days a week')]);

    expect(first.content).toBe(`${USER_INPUT_OPEN}\nfour days a week\n${USER_INPUT_CLOSE}`);
  });

  it('should leave assistant text unwrapped', () => {
    const turns = [said('user', 'hi'), said('assistant', 'Upper/lower it is.')];

    expect(toAnthropicMessages(turns)[1].content).toBe('Upper/lower it is.');
  });

  it('should drop leading assistant messages so the turn starts with a user message', () => {
    const turns = [said('assistant', 'verdict'), said('assistant', 'more'), said('user', 'ok')];

    expect(toAnthropicMessages(turns)).toEqual([
      { role: 'user', content: `${USER_INPUT_OPEN}\nok\n${USER_INPUT_CLOSE}` },
    ]);
  });

  it('should return nothing when the window holds no user message', () => {
    expect(toAnthropicMessages([said('assistant', 'verdict')])).toEqual([]);
  });
});
