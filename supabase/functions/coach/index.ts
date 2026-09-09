// Setup type definitions for built-in Supabase Runtime APIs
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { createModelClient } from '../_shared/anthropic.ts';
import { databaseFrom } from '../_shared/db.ts';
import { handleCoachRequest } from './routes.ts';

/**
 * Wiring only. `auth: 'none'` because the app has no Supabase auth: every route
 * authenticates itself with the device-computed identity hash, and
 * `verify_jwt = false` is set for this function in config.toml to match.
 *
 * The Anthropic key is read here and nowhere else. It never ships in the app.
 */
const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
const model = anthropicApiKey === undefined ? null : createModelClient(anthropicApiKey);

export default {
  fetch: withSupabase({ auth: 'none', cors: 'disabled' }, (request: Request, context) => {
    if (model === null) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: 'the coach is not configured' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    return handleCoachRequest(request, {
      database: databaseFrom(context.supabaseAdmin),
      model,
      now: () => new Date(),
    });
  }),
};
