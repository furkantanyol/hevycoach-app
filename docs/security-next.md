# Security: what the demo setup defers

The 2026-09-10 build is single-user and optimised for a working demo. These are the known gaps and what closes them.

| Today | Next iteration |
|---|---|
| One static `APP_TOKEN` inlined into the app bundle | Sign in with Apple; short-lived session tokens; token rotation |
| Hevy and Anthropic keys in `server/.env`, one user | Per-user Hevy keys encrypted at rest (pgcrypto or a KMS), never in logs |
| Webhook secret compared with a plain string compare | Constant-time compare; rotate the secret by re-subscribing |
| No rate limiting | Per-user limits on `/messages` and on model spend |
| State in a JSON file on one machine | A database with backups once there are two users |
| Prompt-injection defence = delimiters + tool gating + scope | Add an eval set of injection attempts run in CI; log refusals |
| Push receipts not checked | Poll receipts, drop `DeviceNotRegistered` tokens |
| Tunnel exposes the server to the internet | Cloudflare Access in front of the app routes; only `/webhook/hevy` public |
| Guard bounds numbers but trusts template ids from the catalogue | Validate every write against the live template list before the call |
| Model output is trusted as the message text | Strip markdown/HTML, cap length, never render links |
