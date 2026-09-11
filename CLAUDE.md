# HevyCoach

A chat-first coach on top of Hevy. Two workspace packages: the Expo app at the repo root (iOS only) and `server/` (Fastify, Node). Read `docs/spec.md` before changing behaviour; `docs/plan.md` is the order of work; `docs/adr/` holds decisions.

## Commands

```bash
pnpm install
pnpm validate                 # app lint + typecheck, server lint + typecheck + test. The quality gate.
pnpm start                    # Metro for the dev client
pnpm --filter server dev      # server on :3001, needs server/.env (see server/.env.example)
pnpm --filter server test
pnpm --filter server tunnel   # cloudflared with CLOUDFLARE_TUNNEL_TOKEN
pnpm ios:build && pnpm ios:install   # EAS local dev build, install with devicectl (needs DEVICE_ID)
```

## Rules

- Expo SDK 57 / React Native 0.86 / New Architecture. Expo has changed: read https://docs.expo.dev/versions/v57.0.0/ for any Expo API before writing it.
- TypeScript strict, no `any`. Files under 300 lines, functions under 50. Early returns, named constants.
- The app stores nothing. State lives in `server/data/state.json`. If the app must persist something, AsyncStorage only.
- Every Hevy call goes through `hevy-sdk`. Never call the API by hand.
- The model produces the numbers; `server/src/guard.ts` bounds them before anything is written to Hevy. `create_program` is the only tool that writes.
- Routines are written for real into the "HevyCoach" folder of the owner's account. Never touch other folders or existing routines.
- Load the `claude-api` skill before writing or changing any Anthropic call.
- Secrets live in `server/.env` and the app's `.env`, both gitignored. Never commit them. `docs/security-next.md` is the list of what the demo defers.
- Tests: server logic with mocked fetch (`options.fetch` on the client). No UI tests. Say "tests: yes/skipped" per task.
- Decisions with a why go in `docs/adr/`. Small conventional commits.
- The main session architects and reviews; `.claude/agents/` do the work: coder (opus), tester (sonnet), reviewer (sonnet), scout (haiku).

## Layout

```
src/app/        expo-router routes: _layout.tsx, index.tsx (the thread)
src/            coach-adapter.ts, push.ts
server/src/     index.ts routes.ts coach.ts prompt.ts hevy.ts guard.ts state.ts push.ts
server/data/    state.json (gitignored)
docs/           spec.md plan.md adr/ research/ security-next.md state-of-play-2026-09-10.md
```
