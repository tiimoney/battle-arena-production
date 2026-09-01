# Firestore -> Postgres migration

One-time, idempotent, **additive** migration from the live `battle-arena-production`
Firestore project into the new Postgres database. Every write is an upsert keyed by
the original Firestore id, so re-running this at any point is safe and will never
duplicate or destroy data. Nothing here ever writes to Firestore.

## Why migrated users can't just log in with their old password

Firebase Auth never exposes the password itself (only Firebase can verify it), so
there is no way to carry a usable password into the new bcrypt-based auth. Instead:

- Every migrated `User` row is created **unclaimed** (`passwordHash = null`).
- Existing admins/competitors get back into the app by **signing up again with the
  same email** at `/auth/signup` on the new app. The sign-up route detects the
  matching unclaimed row and "claims" it — setting the password and keeping the
  original `id`/`role`/`team assignment` — instead of creating a fresh account. See
  `server/src/routes/auth.ts`.
- This means role and team assignment survive the migration untouched; only the
  login credential itself needs to be re-created, once, by each person.

## Setup

1. `cp migration/.env.example migration/.env` and fill in:
   - `FIREBASE_PROJECT_ID` (defaults to `battle-arena-production`, from the old app's
     `.firebaserc`).
   - `GOOGLE_APPLICATION_CREDENTIALS` — path to a Firebase service account JSON key
     with Firestore **read** access. Generate one in the Firebase console:
     Project settings → Service accounts → Generate new private key. **Do not commit
     this file** — it's already covered by `.gitignore`.
   - `DATABASE_URL` — same Postgres/Neon connection string as `server/.env`.
2. From the repo root: `npm install` (this also runs `prisma generate` for `server`,
   which `migration` reuses).

## Step 1 — dump (read-only backup)

```
npm run dump --workspace migration
```

Reads `profiles`, `league_state/active`, `approved_results`, and `score_reports` from
Firestore and writes them to `migration/dumps/firestore-dump-<timestamp>.json` and
`migration/dumps/latest.json`. This is the backup step required before anything
touches real data — it never writes to Firestore or Postgres. Keep the timestamped
file as your point-in-time backup.

## Step 2 — dry run

```
npm run migrate --workspace migration -- --dry-run
```

Reads `migration/dumps/latest.json`, builds the migration plan, and prints:

- Every row it would create/update, by count.
- **Warnings** for anything with a dangling reference (e.g. a team member linked to a
  profile that no longer exists, a match pointing at a missing fixture) — these rows
  are sanitized (the dangling reference is dropped) or skipped, never silently
  corrupted. Read the warnings before proceeding; if anything looks wrong, stop and
  investigate the dump JSON rather than the live Firestore data.

The transform that builds this plan (`migration/src/transform.ts`) is unit-tested
(`npm run test --workspace migration`) against synthetic dumps covering the
missing-team/missing-profile/missing-fixture edge cases — you don't need to trust it
blindly, but the dry-run output is still worth reading for your actual data.

## Step 3 — validate against a throwaway database (recommended)

Point `DATABASE_URL` at a scratch Postgres/Neon database (not your real one yet), run:

```
npm run migrate --workspace migration
```

then spot-check the data with `npx prisma studio --schema ../server/prisma/schema.prisma`
or a `psql` session. Run the migration a **second time** against the same throwaway
database and confirm row counts don't change — that's the idempotency check.

## Step 4 — run for real

Point `DATABASE_URL` back at your real target database and run:

```
npm run migrate --workspace migration
```

Afterwards, hand out the news that migrated users need to sign up again with their
existing email at the new app's sign-up screen to reclaim their account (see above).

## What this does NOT touch

`firebase.json`, `firestore.rules`, `lib/firebase_options.dart`, and the live
Firestore data itself are never modified by any script in this directory — everything
here is read-only against Firebase. Retiring the Firebase project is a separate,
later step once the new app is confirmed working end-to-end.
