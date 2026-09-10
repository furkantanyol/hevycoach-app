import { randomUUID } from 'node:crypto';
import type { CoachDeps } from './coach.js';
import type { Message } from './state.js';

/** `kind`, `block`, `session` and `choices` are the fields the app reads off a message. */
export type MessageExtras = Partial<Pick<Message, 'kind' | 'block' | 'session' | 'choices'>>;

export function newMessage(role: Message['role'], text: string, extras: MessageExtras = {}): Message {
  const createdAt = new Date().toISOString();
  return { id: randomUUID(), role, text, createdAt, ...extras };
}

/** The shape of most coach replies: one assistant message on the thread, saved before it is answered with. */
export async function appended(deps: CoachDeps, text: string): Promise<Message> {
  const message = newMessage('assistant', text);
  deps.state.messages.push(message);
  await deps.save();
  return message;
}
