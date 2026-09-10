# ADR 0001: Reset to a chat-first thin client with a local coach server

Date: 2026-09-10. Status: accepted.

## Context

By 2026-09-10 the app had six screens on real Hevy data, a Block Chart design, an Apple Health export module, and a Supabase backend, all green (`docs/state-of-play-2026-09-10.md`). None of it was the product the owner runs today: a Telegram-driven Claude Code coach on a VPS (`docs/research/furkan-ai-coaching-mechanics.md`). Hevy already exports to Apple Health. A dashboard duplicates what Hevy shows. The interview is on 2026-09-11.

## Decision

- The app is one surface: a chat thread with the coach, plus push notifications. It stores nothing.
- The coach runs in a small Fastify server the owner can run locally, with a JSON state file, reachable through a Cloudflare Tunnel. No database.
- Hevy stays the logger and the viewer of routines. The coach writes routines into a "HevyCoach" folder and judges workouts through Hevy's webhook.
- The model produces the numbers; a server-side guard bounds them. A rules engine was considered and deferred to keep the demo simple.
- Everything from the previous iteration that did not serve this was deleted rather than kept dormant. History is in git.

## Consequences

- Fewer moving parts to demo and explain; the whole product fits in a few files.
- Single user and a static token for now; `docs/security-next.md` lists the path to more.
- If the numbers prove unreliable, the guard becomes a rules engine specified by `hevy-coach/prompts/COACH.md`.
