# HevyCoach

A coach that lives on top of [Hevy](https://www.hevyapp.com). You keep logging in Hevy. The coach reads your whole history, asks only what the history cannot answer, writes your training block into Hevy as routines, judges every finished workout within seconds and pushes a short verdict, and answers training questions in a chat.

Built on two packages published from [hevy-coach](https://github.com/furkantanyol/hevy-coach): `@furkantanyol/hevy-client` (typed, fetch-only Hevy client) and `hevy-coach` (the MCP server).

- `src/` — the Expo app (SDK 57, iOS). One surface: the chat thread, plus push notifications.
- `server/` — a small Fastify server that runs the coach: Anthropic models, the Hevy client, a JSON state file, Hevy's webhook.
- `docs/spec.md` — the design. `docs/plan.md` — the order of work. `docs/adr/` — decisions, including why the previous iteration was deleted.

```sh
pnpm install
pnpm validate
pnpm --filter server dev     # needs server/.env
pnpm start                   # Metro for the dev client
```
