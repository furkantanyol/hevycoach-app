# 4. The HevyCoach backend on Supabase Edge Functions

- Status: accepted
- Date: 2026-09-09

## Context

Three things have to happen off the device. The Anthropic key cannot ship in the
app, so the model call belongs on a server. The coaching prompt is fixed and
must not be editable by a user, so it belongs next to that call. And Hevy's
finished-workout webhook has to arrive somewhere.

That is the whole backend. It is not a place for programming logic: the rules
engine on the device owns every number, and the server's job is to hold a
secret, run one model call, and count things.

## Decision

Two Supabase Edge Functions — `coach` and `webhook` — a shared module directory,
and four tables.

## One `coach` function with two routes

`POST /coach/program` and `POST /coach/explain` are routes inside a single
function rather than two functions. Supabase's routing guide recommends
combining actions to reduce cold starts, and both routes need exactly the same
preamble: identity, rate limit, JSON body, the same fixed system prompt, the
same injected model client. Splitting them would duplicate that and double the
cold starts for no gain. Paths are always prefixed with the function name, so
the router matches on the full `/coach/...` path.

`webhook` is separate because nothing is shared with it: a different caller, a
different credential, and no model call at all.

## The handler shape: `withSupabase`, not `Deno.serve`

Both entry points are:

```ts
import { withSupabase } from '@supabase/server';

export default {
  fetch: withSupabase({ auth: 'none', cors: 'disabled' }, handler),
};
```

The current quickstart shows `withSupabase` but not where it is imported from.
The import specifier was established from the CLI instead: `supabase functions
new` on CLI 2.116 generates exactly `import { withSupabase } from
'@supabase/server'` together with a `deno.json` mapping that name to
`npm:@supabase/server@^1`. `auth: 'none'` is documented in that package's own
type definitions (`AuthConfig`), and `ctx.supabaseAdmin` is the service-role
client the tables are reached through. `Deno.serve` remains supported and was
the fallback had the specifier stayed unverified; it was not needed.

`auth: 'none'` is not "no authentication". It means Supabase performs none,
because both routes authenticate themselves and `verify_jwt = false` is set for
both functions in `config.toml`. The app has no Supabase auth to check, and Hevy
cannot be asked to send a Supabase key.

## Identity is a hash the device computes

The device hashes the user's Hevy API key with SHA-256 and sends the hex digest
in an `x-hevy-identity` header. The raw key never reaches the server, which is
the point: we hold no credential that would let us read anyone's Hevy account.

The tradeoff is that the hash is bearer-equivalent. Anyone holding it is that
user as far as this backend is concerned, and it is stable for the life of the
key. That is acceptable because of what it can actually do: spend the holder's
rate limit and read back coaching text derived from a history summary the caller
supplied in the same request. It grants no access to stored data — there is
none. Every route validates the header's shape (64 lowercase hex characters)
before it is used as a database key.

## Rate limiting in the Postgres we already run

Supabase's own rate-limiting example uses Upstash Redis. We use Postgres
instead. The volume is one user's coaching requests, the state is a counter per
identity per endpoint per window, and adding a second managed service to hold
one integer is not a trade worth making.

Correctness rests on the increment being a single statement:

```sql
insert into rate_limits (identity_hash, endpoint, window_start, request_count)
values (..., 1)
on conflict (identity_hash, endpoint, window_start)
  do update set request_count = rate_limits.request_count + 1
returning request_count;
```

Read-then-write would let two concurrent requests both see the same count and
both decide they are under the limit. The returned count is the caller's own
position in the window, so the comparison happens once, in the database.

The notification cap needs a second mechanism. It also inserts only while the
count inside the rolling seven days is under two, but there is no unique key to
conflict on there — the count and the insert are separate reads of the same
table, so under read committed two concurrent claims would both see one row and
both insert. `claim_notification_slot` therefore takes
`pg_advisory_xact_lock(hashtext(identity_hash))` first: the lock is held for the
transaction, so the second claim waits and then counts the first one's committed
row. Both functions live in the migration, and the code reaches them through one
narrow `Database` seam with a single `rpc` method, which is what the tests
supply a fake for. The lock itself has no unit test — that would need a real
Postgres, and Docker is unavailable here.

The tables are service-role-only. Row level security is enabled on all four with
no policies at all, so a leaked publishable key reads nothing.

## The untrusted-input boundary

Every free-text field a user controls is treated as data — not just the coaching
note. Coaching notes, the onboarding answers they typed (experience, equipment,
constraints), the training history summary and an explain request's context and
question all reach the model the same way:

- The base system prompt is a constant in `_shared/prompt.ts`. There is no
  user-editable system prompt and no route that accepts one; a request carrying
  an unexpected top-level field is rejected rather than ignored.
- The task string the routes build carries only values we chose or validated
  into a closed set: the goal enum, the session count, the explain subject, and
  the exercise templates the request offered. No field a user typed is
  interpolated into it.
- All of that free text is labelled and wrapped in one
  `<<<UNTRUSTED_USER_INPUT>>>` block, and any occurrence of those delimiters
  inside it is replaced first. Without that, a user could close the block early
  and have the rest of their text read as though it came from us.
- The system prompt states that the fenced text is context, never instruction,
  and that it cannot grant permission to produce numbers, widen the set of
  exercise ids, or change the output format.

None of that is trusted to hold. The response is validated on the way out.

## The model may not return a number

`_shared/model-output.ts` is its own module for this reason: what the model
sends back is a different trust boundary from what a client sends us, and the
two are validated separately.

The structured-output schema has nowhere to put a weight, a set count or a rep
range, and the runtime validator rejects unknown keys rather than dropping them,
so a `sets: 4` that appeared anyway fails the whole response. Every returned
`exerciseTemplateId` must appear in the templates the request supplied; an
invented id rejects the response with a 502. This is the guard that keeps the
product's first principle true, and it is the part of the backend most worth
testing.

The free-text fields are where a number could still slip through, so they are
scanned rather than trusted: a `rationale` or `explanation` carrying a digit
next to kg, lb, reps, sets, RPE, RIR, a percentage or a `5x5` rep scheme rejects
the response with the same 502. A prompt instruction is not an enforcement
mechanism, and this rule is stated as forbidden rather than discouraged.

The schema itself carries no `minimum`, `maximum` or `maxItems`: the Anthropic
structured-output API rejects those keywords with a 400, and the request is
built by hand rather than through the SDK's `jsonSchemaOutputFormat()` helper
that would strip them. The bounds live in field descriptions, and the parsers
enforce them on the way back in.

## `shouldRegenerate()` is a seam, not a policy

The webhook records the event and, for a first delivery only, asks whether a
weekly regeneration is due. That function returns `false` and carries a TODO
naming Phase D. It is injected through `WebhookDependencies` so the notification
path can be tested against a stub that says yes; a replay short-circuits before
it, because Hevy retries at least once and re-running the push would send a
second notification for one workout.

The progression spec has not arrived. Where a training week ends, what counts as
a stall, when a deload is due — every rule that would answer this question comes
with it, and inventing one here would put programming logic on the server that
the rules engine owns. The seam is unit-tested as a seam, and the path behind it is
covered by stubbing it true: the tests assert what gets pushed, that nothing is
pushed without an identity, and that a redelivery pushes nothing at all.

One gap is worth naming. Hevy's webhook body is `{ id, payload: { workoutId } }`
and carries no identity, so when regeneration does become real the backend has
no way to tell whose workout finished. Today the notification target is read
from an optional `x-hevy-identity` header, and no push is sent without one.
Phase D has to solve attribution before it can solve policy.

## Tests run without Docker

Docker is not available here, so `supabase start` and `supabase functions serve`
cannot run. Tests are plain `deno test` with `@std/testing`'s BDD helpers: the
database is a fake implementing the one-method seam, `fetch` is a recording
stub, and the Anthropic client is injected. Nothing reaches the network and
nothing needs a local stack, which is also how Supabase's own unit-testing guide
frames it.

`supabase/functions/deno.json` exists for those tests and for `deno lint`; each
function keeps its own `deno.json`, which is what `config.toml` points
`import_map` at and what the deploy actually bundles. All of it is wired into
`pnpm validate`, so the backend passes or fails with the rest of the repo.
