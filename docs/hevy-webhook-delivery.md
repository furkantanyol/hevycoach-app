# Hevy webhook delivery, as observed live

Recorded 2026-09-11 from real deliveries through the Cloudflare tunnel to `POST /webhook/hevy` (the server logs every delivery whole, headers without secrets). The probe of 2026-09-09 had exercised the subscription endpoints only, never a delivery.

- **Request.** `POST` to the subscribed URL. `Content-Type: application/json`, `User-Agent: node-fetch/1.0 (+https://github.com/bitinn/node-fetch)`, `Authorization: <authToken>` exactly as given to `POST /v1/webhook-subscription` (the route accepts it with or without `Bearer `). Tracing headers ride along (`sentry-trace`, `traceparent`, `newrelic`, `baggage`) and are ignored. Cloudflare adds its own (`cf-connecting-ip`, `cf-ray`).
- **Body, 52 bytes.** `{"workoutId":"<uuid>"}` — nothing else: no event id, no event type, no timestamp. The `{ id, payload: { workoutId } }` shape in the docs never arrived, and rejected six deliveries between 11:57 and 12:32 before this was recorded. The workout id is therefore the dedupe key in `seenEvents`.
- **When.** A workout saved in the app produced a delivery within seconds (workout saved ≈12:32:10, delivery 12:32:14).
- **Retries.** A non-2xx reply is retried with growing gaps: observed at +20 s, +82 s, +2 min, +5 min, +10 min — six attempts over about 18 minutes (11:57:26 → 12:15:51). A 200 stops them.
- **Deletion.** Deleting the workout produced no delivery; it appears only in `GET /v1/workouts/events` as `{ type: 'deleted', id }`. A delivery whose workout is deleted before the server fetches it ends at a 404 from `GET /v1/workouts/{id}`, and the review is skipped.
- **Unknown.** Whether editing a saved workout delivers again (same body) — the first accepted delivery will tell; a repeat is deduped either way.
