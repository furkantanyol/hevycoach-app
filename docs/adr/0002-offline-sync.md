# 2. Offline sync: SQLite mirror, cursor delta, and an outbox for writes

- Status: accepted
- Date: 2026-09-09

## Context

HevyCoach has to be useful in a gym basement with no signal. That means the
whole workout history lives on the device, reads never touch the network, and a
change the user makes offline is not lost when the app is backgrounded or
killed. Hevy's public API gives us a paginated `/workouts` list (10 per page),
a `/workouts/events` feed of updates and deletes since a timestamp, and full
`PUT` replacement for routines.

## SQLite, not MMKV or a JSON blob

Workout history is relational and the app's own screens ask relational
questions: sets per muscle group per week for the Week review, every set of one
lift over months for Lift detail. A key-value store answers those by loading
everything into JS and filtering, which gets slower with every workout logged.

- Drizzle over `expo-sqlite` gives typed queries and indexes on `startTime`,
  `workoutId` and `exerciseTemplateId`, which are exactly the three access
  patterns above.
- `on delete cascade` from a workout to its exercises to its sets means a
  tombstone is one `DELETE` and cannot leave orphans behind.
- It is one file. Backing up or wiping local state is a file operation.

MMKV would still be the right call for small hot settings; it is not the right
call for a growing relational history.

### The foreign key pragma is not optional

SQLite ships with `foreign_keys` **off** by default, per connection. Without
`PRAGMA foreign_keys = ON` the `on delete cascade` clauses in the schema are
inert and deleting a workout silently leaves its exercises and sets behind. The
app sets it (and `journal_mode = WAL`) at open time in `src/db/client.ts`, and
the test database sets it too — otherwise the cascade tests would pass against a
database that behaves differently from the real one.

## Writes go through a SQLite outbox, not TanStack's paused mutations

React Query can pause a mutation while offline and resume it when the network
returns, but that queue does not survive the process. From the TanStack docs:

> When persisting to an external storage, only the state of mutations is
> persisted, as functions cannot be serialized.

> After hydration, the component that triggers the mutation might not be
> mounted, so calling `resumePausedMutations` might yield an error:
> `No mutationFn found`.

The documented fix is to register default mutation functions with
`setMutationDefaults` before hydration, so every persisted mutation can find a
function again by key. That works, but it means the durability of a user's
edit depends on a component tree and a hydration ordering rule.

An `outbox` table is the same idea with the payload written down. A queued
routine update is a row in the same database as everything else, it survives a
kill, and it is inspectable on the Sync screen. React Query stays for server
state and lifecycle (`networkMode: 'offlineFirst'`, so a request is attempted
rather than paused); it does not own durability.

Drain rules:

- Oldest row first, one at a time. Anything that stops the head stops the whole
  queue — a rejection, or a row still serving its backoff — because a later
  write must never overtake an earlier one. Filtering the not-yet-due rows out
  of the query instead would do exactly the opposite, and quietly.
- A row that has run out of attempts is the one exception: it is stepped over,
  not waited on, because it will never be sent and waiting would freeze the
  queue for good. It is counted and shown on the Sync screen as given up.
- A rejection records `attempts + 1`, a `nextAttemptAt` from exponential backoff
  with full jitter (1s doubling, capped at 5 minutes), and the error message.
  After 8 attempts the row stops being retried. The 8-attempt ladder tops out
  around two minutes, so the cap only binds if that budget ever grows.
- A `HevyNetworkError` is not the row's fault, so the drain stops and reports
  itself offline without spending one of the row's attempts. Otherwise a week
  offline would kill the queue.
- The outbox primary key is `AUTOINCREMENT`, not a bare rowid. SQLite reuses the
  highest rowid after a delete, and coalescing deletes before it inserts, so a
  reused id would put the re-edited row back at the *head* of the queue and
  silently invert the ordering.
- Enqueueing coalesces: a pending row for the same routine is deleted before the
  new one is inserted. The last edit wins, and because the new row goes in at the
  tail the queue stays FIFO across different routines.

## Cursor semantics

`syncState.workoutsCursor` is an ISO timestamp passed to
`client.workouts.changes(since)`. Two rules make it safe:

1. **The cursor moves only after the rows are committed.** Upserts and tombstones
   from one delta page are applied in a single transaction; the cursor is written
   afterwards. A cursor advanced first would skip those events forever if the
   write failed.
2. **Re-delivery is fine.** `since` is inclusive of the instant it names, so the
   event sitting exactly on the cursor can arrive again on the next call.
   Applying is idempotent — a workout is upserted by primary key and its children
   are deleted and rewritten, a delete is by id — so a duplicate costs one wasted
   write and changes nothing.

## The backfill takes its watermark first

On a fresh install the cursor is set to *now* **before** the first page of
`/workouts` is read. It is tempting to set it after the backfill finishes, but
then every change made during the backfill (which can take a while over 10-item
pages) falls into the gap between "already read that page" and "cursor starts
here" and is never seen. Taking the watermark first makes the overlap the safe
direction: anything that changes during the backfill is re-delivered by the
first delta pass, and re-delivery is idempotent.

The watermark is also backdated by five minutes, because it comes off the device
clock. If the device runs ahead of Hevy's server, every event Hevy stamps inside
that gap sorts before the cursor and is never delivered — permanently and
silently. Overlapping the other way only costs a few repeated upserts.

The page loop is resumable. `backfillPage` is written after each page is applied,
so an interrupted run repeats at most one page, and `backfillDone` is what stops
the loop from running again. Pages are fetched back to back with no pacing; at
ten workouts a page a large history is a few hundred sequential requests. The
client retries 429s on its own, so this is accepted rather than throttled, but
it is the first thing to revisit if Hevy starts pushing back.

### Known gap

`/workouts` is paginated newest-first over a live list, so the window shifts
under us. If a workout is **deleted** while the backfill is walking pages,
everything below it moves up one position, and a workout that has not been read
yet can slide into a page that was already read. It is skipped. It is not in the
delta either, because it did not itself change — only its position did. It stays
missing until a full backfill is run again.

This is stated rather than fixed. Fixing it properly needs a stable ordering
(page oldest-first, or a real pagination cursor), which the endpoint does not
offer. The exposure is small: it needs a deletion during the one-time initial
backfill, and re-running the backfill repairs it.

## Routine children stay JSON

`routines.exercises` is a JSON column, not two more tables. Nothing in the app
queries inside a routine's exercises — routines are read whole to display and
written whole, because Hevy's update is a full `PUT` that replaces the routine.
Normalising them would buy queries no screen asks for and add a
delete-and-reinsert dance on every save. Workouts get the relational treatment
because the analysis screens genuinely need it; routines do not.

Two consequences.

Because a routine update replaces everything, a full routine refresh from the
server would clobber a local edit that has not shipped yet. So the refresh is
skipped while the outbox still holds a routine write.

And Hevy's routine *read* model has no `notes` field even though its update body
accepts one, so there is no `notes` column: it could never be filled. The honest
consequence is that a rename cannot round-trip a note, and the replacing `PUT`
may clear one the user has in Hevy. Stated rather than half-guarded against,
because a guard for a field the API never sends is a guard that never runs.

## Consequences

- Every read screen can be built against SQLite and will work with the network
  off. The Sync screen is the proof surface: counts, backfill position, cursor,
  queue depth and both error fields all come from the database. The table counts
  are recounted whenever `sync_state` moves rather than on every row change —
  SQLite's change hook fires per row, which is a few hundred times per backfill
  page.
- `pnpm validate` ends with the web export, because "web never imports
  expo-sqlite" is a constraint no test can see.
- Sync is iOS-first and Android-compatible. Web is out of scope for it: the
  route is a one-line re-export of a platform-split screen, because Expo Router
  bundles the fallback route file on every platform, so a `sync.web.tsx` sibling
  would still drag `expo-sqlite` into the web bundle.
- Until the account owner lifts the guard, a routine title this app writes is
  prefixed `[TEST]`, so nothing it does to a real Hevy account is ambiguous.
- Migrations are generated by `drizzle-kit` and committed. The Node test suite
  builds each in-memory database by executing those `.sql` files, so a migration
  that no longer applies fails the test run rather than the next install.
- **Regenerating a migration is destructive once a build is on a device.** The
  Expo migrator passes an empty hash, so drizzle's applied-check is purely the
  journal timestamp (`Number(created_at) < folderMillis`). A regenerated `0000`
  carries a newer timestamp than the one an installed app recorded, so the whole
  `CREATE TABLE` script re-runs and fails on the first table that already
  exists — and `useMigrations` then leaves the app on the error screen forever.
  `0000` was regenerated here rather than adding a `0001` to drop one column,
  which is the right call while nothing has shipped; from the first real install
  onward, add a migration instead. The tests cannot catch this: they execute the
  `.sql` files directly and never go through the migrator.

---

## Amendment, 2026-09-09: reversed. The mirror is deleted.

- Status of the decision above: **superseded**. Everything it describes was built,
  tested and then removed. It is kept because a decision that was measured and
  reversed is worth more than the code was.

### What was measured

The premise above is that reads must never touch the network. Measuring it
against the API it was replacing did not support that:

- `GET /exercise_history/{templateId}` is **unpaginated**. One request returns an
  exercise's entire history. Per-exercise depth is free; only breadth across
  many exercises costs requests — and no screen asks for breadth.
- Week review from the network is **1 request, 642 ms**. Lift detail is **1
  request, 318 ms**.
- The program is generated weekly, online, on wifi. Everything the Today screen
  needs offline can be baked into the generated block at that moment, so Today
  never needs a history mirror at all.
- `src/lib/query-client.ts` already configures TanStack Query with
  `networkMode: 'offlineFirst'` and an AsyncStorage persister over
  `expo-sqlite/kv-store`. That is the same offline guarantee the mirror was
  hand-rolling, in a dependency the app already has.

So the mirror bought one thing the alternative did not: durability of an offline
*write* across a process kill, which is what the outbox section above argues for
at length. Against 276 workouts and 5,927 sets of relational schema, a resumable
backfill, a cursor delta, tombstones, and a backoff ladder, that is not a trade
worth making before a single screen exists that writes offline.

### What replaced it

- `src/features/hevy/client.ts` — a `@furkantanyol/hevy-client` built from the
  stored API key. It caches nothing itself; React Query is the only cache.
- `src/features/hevy/queries.ts` — TanStack Query hooks with a `staleTime` per
  resource. React Query's persister is the offline cache; nothing caches on top
  of it. That cache is not keyed by account, so saving a new API key resets it.
- `src/features/coach/weekly-context.ts` — the weekly summary, now a pure
  function over an array of workouts, fed by `useRecentWorkouts`.

### What was given up, knowingly

- **Durable offline writes.** A routine write now lives in React Query's mutation
  lifecycle, which does not survive a process kill (the reason the outbox existed
  is quoted above and still holds). Nothing in the app writes offline today. When
  something does, the choice is `setMutationDefaults` before hydration or an
  outbox again — and this ADR is the record of what an outbox costs.
- **Relational queries over the whole history.** Sets per muscle group per week
  are now computed in JS over a fetched window rather than by SQLite over
  everything. If a screen ever needs an aggregate across all 276 workouts at
  once, that is the measurement that would reopen this.
- The backfill's known page-shift gap, the foreign-key pragma, the cursor
  watermark and the migration-regeneration hazard all stop being live concerns.
  They are left documented above because they are true of the approach, not of
  this repo, and whoever reaches for a device-side mirror next should read them
  first.
