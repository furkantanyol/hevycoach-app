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

- Oldest row first, one at a time. The first rejection stops the drain, because
  a later write must never overtake an earlier one.
- A rejection records `attempts + 1`, a `nextAttemptAt` from exponential backoff
  with full jitter (1s doubling to a 5 minute cap), and the error message. After
  8 attempts the row stops being retried and is reported as dead rather than
  retried forever or silently dropped.
- A `HevyNetworkError` is not the row's fault, so it stops the drain without
  spending one of the row's attempts. Otherwise a week offline would kill the
  queue.
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

The page loop is resumable. `backfillPage` is written after each page is applied,
so an interrupted run repeats at most one page, and `backfillDone` is what stops
the loop from running again.

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

One consequence: because a routine update replaces everything, a full routine
refresh from the server would clobber a local edit that has not shipped yet. So
the refresh is skipped while the outbox still holds a routine write.

## Consequences

- Every read screen can be built against SQLite and will work with the network
  off. The Sync screen is the proof surface: counts, backfill position, cursor,
  queue depth and last error all come from the database.
- Sync is iOS-first and Android-compatible. Web is out of scope for it: the
  route is a one-line re-export of a platform-split screen, because Expo Router
  bundles the fallback route file on every platform, so a `sync.web.tsx` sibling
  would still drag `expo-sqlite` into the web bundle.
- Until the account owner lifts the guard, a routine title this app writes is
  prefixed `[TEST]`, so nothing it does to a real Hevy account is ambiguous.
- Migrations are generated by `drizzle-kit` and committed. The Node test suite
  builds each in-memory database by executing those `.sql` files, so a migration
  that no longer applies fails the test run rather than the next install.
