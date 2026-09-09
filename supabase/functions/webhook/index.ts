// Setup type definitions for built-in Supabase Runtime APIs
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { databaseFrom } from '../_shared/db.ts';
import { handleWebhookRequest } from './routes.ts';

/**
 * Wiring only. `auth: 'none'` because Hevy cannot send a Supabase key: the
 * route authenticates the shared secret itself, and `verify_jwt = false` is set
 * for this function in config.toml to match.
 */
export default {
  fetch: withSupabase({ auth: 'none', cors: 'disabled' }, (request: Request, context) =>
    handleWebhookRequest(request, {
      database: databaseFrom(context.supabaseAdmin),
      fetchImpl: (url, init) => fetch(url, init),
      now: () => new Date(),
      webhookSecret: Deno.env.get('HEVY_WEBHOOK_SECRET'),
      expoAccessToken: Deno.env.get('EXPO_ACCESS_TOKEN'),
    })),
};
