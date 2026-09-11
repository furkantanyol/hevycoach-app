import { describe, expect, it } from 'vitest';
import { onThreadChange, threadChanged } from './events.js';

describe('thread change events', () => {
  it('should tell a listener the new length until it unsubscribes', () => {
    const heard: number[] = [];
    const stop = onThreadChange((messages) => heard.push(messages));

    threadChanged(3);
    stop();
    threadChanged(4);

    expect(heard).toEqual([3]);
  });
});
