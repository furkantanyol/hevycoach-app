# Plan

Interview: Friday 2026-09-11 16:00 (Europe/Madrid). Each step ends in a demoable, green state. Owners: the main session architects and reviews; `.claude/agents/` do the work (coder = opus, tester = sonnet, reviewer = sonnet, scout = haiku).

## Step 0 — reset the repo (2026-09-10, midday)

- [x] hevy-coach: delete the stray `supabase/.temp`; `pnpm validate` green (42 tests).
- [x] Strip the app: screens, features, components, health module, Supabase backend, old ADRs, PRODUCT.md, DESIGN.md.
- [x] Docs: state-of-play, research notes, spec, plan, reset ADR, security-next, CLAUDE.md, agents.
- [x] App skeleton: trimmed package.json, app.json without HealthKit/Sentry/sqlite and with `expo-notifications`, Metro without Sentry, ESLint/tsconfig without the Supabase excludes, `src/app/_layout.tsx` + `index.tsx` placeholder.
- [x] Server skeleton: `server/` package with Fastify, `/health`, state file, env loading, vitest, `.env.example`, Dockerfile, compose.
- [x] Root `pnpm validate` green for both packages. Committed (f370c9c, b3c6615, 6650442).
- [x] Owner runs `/impeccable init` (PRODUCT.md at the repo root).

## Step 1 — server (afternoon)

- [x] `state.ts` with atomic writes and a round-trip test.
- [x] `hevy.ts`: history summary, template catalogue, routine folder + writes (mocked-fetch tests from fixture workouts).
- [x] `guard.ts` table tests.
- [x] `prompt.ts`: system prompt per spec, delimiter wrapper, tests.
- [x] `coach.ts`: chat turn with streaming and the `create_program` tool; plan; verdict. Load the `claude-api` skill first.
- [x] `routes.ts`: five routes, bearer auth, webhook replay guard, first-delivery logging.
- [x] `push.ts` with expo-server-sdk.
- [x] Cloudflare Tunnel created via API; `brew install cloudflared`; tunnel running; `PUBLIC_URL` set; webhook self-registration logged.
- [x] Manual check with curl: intake conversation → `create_program` → routines visible in Hevy under "HevyCoach".
- [ ] Owner logs one workout in Hevy → delivery headers recorded → verdict message in `GET /messages`.

## Step 2 — app (evening)

- [ ] `@assistant-ui/react-native` thread from the scaffold, adapter against `POST /messages` via `expo/fetch`, history adapter on mount and foreground.
- [ ] Push registration and tap handling per `docs/research/push-notifications.md`.
- [ ] First push-capable build tonight: `pnpm ios:build` (interactive Apple sign-in, answer yes to push setup), `pnpm ios:install`.
- [ ] Rehearse the loop on the phone: chat → plan → workout → push → reply.

## Step 2b — four tabs and structured onboarding (2026-09-10 16:30) — SUPERSEDED at 18:00, deleted

- [ ] Server: new Profile shape with option lists; GET /prefill, GET/PUT /profile, GET /block, GET /progress; tool schema and context updated; tests.
- [ ] App: Coach, Plan, Progress, Profile tabs; onboarding stack of six steps with prefill from Hevy; `useServer` hook; notification tap opens Coach.
- [ ] Simulator: onboarding → block → all four tabs on real data; screenshots sent to the owner.
- [ ] Impeccable polish pass on the new surfaces in the owner's session.

## Step 2c — one screen, final (2026-09-10 18:00, owner decision after reviewing Hevy Coach's client side)

- [ ] Server: reduced Profile, scripted intake with choices, review with proposal and Apply/Keep, GET /week; old routes deleted; tests.
- [ ] App: one screen with the week strip, pills under coach messages, tabs and onboarding deleted.
- [ ] Simulator: intake with pills → plan → replayed workout → review → apply; screenshots to the owner.
- [ ] Owner: device build tonight; one real workout for the delivery contract.

## Step 3 — polish and narrative (2026-09-11 morning)

- [ ] Styling per the impeccable direction.
- [ ] README with the story: the client, the MCP server, this app, what was deleted and why.
- [ ] Both repos green, tagged. Rehearse twice.

## Interactive steps only the owner can do

`/impeccable init`; `brew install cloudflared` and running the tunnel; the Apple sign-in during the first push-capable build; logging one workout in Hevy for the webhook test.
