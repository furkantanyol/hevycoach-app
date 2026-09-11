import { existsSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { createHevyClient } from 'hevy-sdk';
import type { CoachDeps } from './coach.js';
import { buildApp } from './routes.js';
import { threadChanged } from './events.js';
import { DEFAULT_STATE_PATH, loadState, saveState } from './state.js';

const ENV_FILE = '.env';
const DEFAULT_PORT = 3001;
const DEFAULT_PLAN_MODEL = 'claude-opus-5';
const DEFAULT_CHAT_MODEL = 'claude-sonnet-5';
const WEBHOOK_ROUTE = '/webhook/hevy';
const MISSING_KEY = 'is not set. Copy server/.env.example to server/.env and fill it in.';
const FAILURE = 1;

if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(FAILURE);
}

const hevyApiKey = process.env.HEVY_API_KEY;
if (!hevyApiKey) fail(`HEVY_API_KEY ${MISSING_KEY}`);
if (!process.env.ANTHROPIC_API_KEY) fail(`ANTHROPIC_API_KEY ${MISSING_KEY}`);

const port = Number(process.env.PORT) || DEFAULT_PORT;
const state = await loadState();
const hevy = createHevyClient({ apiKey: hevyApiKey });

const coach: CoachDeps = {
  anthropic: new Anthropic(),
  hevy,
  state,
  save: async () => {
    await saveState(DEFAULT_STATE_PATH, state);
    threadChanged(state.messages.length);
  },
  models: {
    plan: process.env.PLAN_MODEL || DEFAULT_PLAN_MODEL,
    chat: process.env.CHAT_MODEL || DEFAULT_CHAT_MODEL,
  },
  log: (message) => app.log.info(message),
};

const app = buildApp({
  state,
  save: coach.save,
  coach,
  appToken: process.env.APP_TOKEN,
  webhookSecret: process.env.WEBHOOK_SECRET,
  pushToken: () => state.pushToken,
});

try {
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`hevycoach server listening on port ${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(FAILURE);
}

const publicUrl = process.env.PUBLIC_URL;
const webhookSecret = process.env.WEBHOOK_SECRET;

if (publicUrl && webhookSecret) {
  const url = `${publicUrl}${WEBHOOK_ROUTE}`;
  try {
    await hevy.webhook.set({ url, authToken: webhookSecret });
    app.log.info(`hevy webhook registered at ${url}`);
  } catch (error) {
    app.log.error(error);
  }
}
