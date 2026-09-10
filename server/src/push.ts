import {
  Expo,
  type ExpoPushErrorTicket,
  type ExpoPushMessage,
  type ExpoPushTicket,
} from 'expo-server-sdk';

export const PUSH_BODY_MAX = 170;

const INVALID_TOKEN = 'not an Expo push token';
const NO_TICKET = 'Expo returned no push ticket';

interface PushSender {
  chunkPushNotifications(messages: ExpoPushMessage[]): ExpoPushMessage[][];
  sendPushNotificationsAsync(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
}

const expo = new Expo();

async function collectTickets(
  sender: PushSender,
  message: ExpoPushMessage,
): Promise<ExpoPushTicket[]> {
  const tickets: ExpoPushTicket[] = [];
  for (const chunk of sender.chunkPushNotifications([message])) {
    tickets.push(...(await sender.sendPushNotificationsAsync(chunk)));
  }
  return tickets;
}

function readTickets(tickets: ExpoPushTicket[]): { sent: boolean; error?: string } {
  if (tickets.length === 0) return { sent: false, error: NO_TICKET };

  const failed = tickets.find(
    (ticket): ticket is ExpoPushErrorTicket => ticket.status === 'error',
  );
  if (failed) return { sent: false, error: failed.message };

  return { sent: true };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function sendPush(
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
  sender: PushSender = expo,
): Promise<{ sent: boolean; error?: string }> {
  if (!Expo.isExpoPushToken(token)) return { sent: false, error: INVALID_TOKEN };

  try {
    const message: ExpoPushMessage = {
      to: token,
      title,
      body: body.slice(0, PUSH_BODY_MAX),
      data,
    };
    return readTickets(await collectTickets(sender, message));
  } catch (error) {
    return { sent: false, error: describe(error) };
  }
}
