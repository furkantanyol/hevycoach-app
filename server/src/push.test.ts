import type { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { describe, expect, it } from 'vitest';
import { PUSH_BODY_MAX, sendPush } from './push.js';

const VALID_TOKEN = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';
const OK_TICKET: ExpoPushTicket = { status: 'ok', id: 'receipt-1' };
const DATA = { url: '/' };

interface FakeSender {
  chunkPushNotifications(messages: ExpoPushMessage[]): ExpoPushMessage[][];
  sendPushNotificationsAsync(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
  readonly seen: ExpoPushMessage[];
}

function fakeSender(reply: ExpoPushTicket[] | Error): FakeSender {
  const seen: ExpoPushMessage[] = [];
  return {
    seen,
    chunkPushNotifications: (messages) => [messages],
    sendPushNotificationsAsync: async (messages) => {
      seen.push(...messages);
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
}

describe('sendPush', () => {
  it('should not send when the token is not an Expo push token', async () => {
    const sender = fakeSender([OK_TICKET]);

    const result = await sendPush('not-a-token', 'Pull day', 'Solid session.', DATA, sender);

    expect(result).toEqual({ sent: false, error: 'not an Expo push token' });
  });

  it('should not reach the sender when the token is invalid', async () => {
    const sender = fakeSender([OK_TICKET]);

    await sendPush('', 'Pull day', 'Solid session.', DATA, sender);

    expect(sender.seen).toEqual([]);
  });

  it('should report sent when the ticket status is ok', async () => {
    const sender = fakeSender([OK_TICKET]);

    const result = await sendPush(VALID_TOKEN, 'Pull day', 'Solid session.', DATA, sender);

    expect(result).toEqual({ sent: true });
  });

  it('should send the title, body and data to the token', async () => {
    const sender = fakeSender([OK_TICKET]);

    await sendPush(VALID_TOKEN, 'Pull day', 'Solid session.', DATA, sender);

    expect(sender.seen).toEqual([
      { to: VALID_TOKEN, title: 'Pull day', body: 'Solid session.', data: DATA },
    ]);
  });

  it('should report the ticket message when the ticket status is error', async () => {
    const ticket: ExpoPushTicket = {
      status: 'error',
      message: 'device not registered',
      details: { error: 'DeviceNotRegistered' },
    };
    const sender = fakeSender([ticket]);

    const result = await sendPush(VALID_TOKEN, 'Pull day', 'Solid session.', DATA, sender);

    expect(result).toEqual({ sent: false, error: 'device not registered' });
  });

  it('should report an error when Expo returns no ticket', async () => {
    const sender = fakeSender([]);

    const result = await sendPush(VALID_TOKEN, 'Pull day', 'Solid session.', DATA, sender);

    expect(result).toEqual({ sent: false, error: 'Expo returned no push ticket' });
  });

  it('should truncate the body to PUSH_BODY_MAX characters', async () => {
    const sender = fakeSender([OK_TICKET]);
    const body = 'a'.repeat(PUSH_BODY_MAX + 30);

    await sendPush(VALID_TOKEN, 'Pull day', body, DATA, sender);

    expect(sender.seen[0]?.body).toBe('a'.repeat(PUSH_BODY_MAX));
  });

  it('should keep a body that is already within PUSH_BODY_MAX', async () => {
    const sender = fakeSender([OK_TICKET]);
    const body = 'b'.repeat(PUSH_BODY_MAX);

    await sendPush(VALID_TOKEN, 'Pull day', body, DATA, sender);

    expect(sender.seen[0]?.body).toBe(body);
  });

  it('should return an error instead of throwing when the sender throws', async () => {
    const sender = fakeSender(new Error('fetch failed'));

    const result = await sendPush(VALID_TOKEN, 'Pull day', 'Solid session.', DATA, sender);

    expect(result).toEqual({ sent: false, error: 'fetch failed' });
  });
});
