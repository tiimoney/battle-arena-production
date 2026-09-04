# Deploying Mocheso League

Pure client-side architecture: the React app talks to Firestore and Firebase Auth
directly (no backend server, no Cloud Functions). Firebase Hosting serves the built
static app; Firestore Security Rules (`firestore.rules`) are the actual
authorization/enforcement layer, since there's no server-side code to enforce it.

## One-time setup

You need the Firebase CLI logged in with access to the `battle-arena-production`
project (already the case on this machine — `npx firebase-tools login`).

## Deploy

From the repo root:

```
npx firebase-tools deploy --only firestore:rules,firestore:indexes,hosting --project battle-arena-production
```

This runs the `predeploy` hook (`npm --prefix client run build`), then:
- Uploads `firestore.rules` / `firestore.indexes.json`.
- Publishes `client/dist` to Firebase Hosting, giving you a live URL at
  `https://battle-arena-production.web.app` (and `.firebaseapp.com`).

Split it into separate commands if you only need to update one part:
- `--only firestore:rules` after any `firestore.rules` change.
- `--only hosting` after any client code change (still runs the predeploy build).

## What's NOT part of this deploy

There is no server workspace and no Cloud Functions — this project doesn't need the
Blaze plan. Everything runs on Firebase's free Spark plan: Firestore, Firebase Auth,
and Hosting.

## Security model

Since there's no backend, `firestore.rules` is the *only* real enforcement layer for
authorization (team-edit permissions, score-report ownership, email-verification
gating on new sign-ups, etc.) — the client-side checks in `client/src/api/*.ts` exist
for UX (a friendly error message before a write is attempted) but are not the safety
net. Any change to authorization behavior needs a matching change in
`firestore.rules`, not just in the client code.

## Local development

`npm run dev --workspace client` runs against the **real** `battle-arena-production`
Firebase project by default (the config is baked into `client/src/firebase.ts`). To
develop against the Firebase Local Emulator Suite instead (recommended before testing
anything destructive):

1. `client/.env.local`: `VITE_USE_EMULATOR=true`
2. `npx firebase-tools emulators:start --only firestore,auth,hosting`
3. `npm run dev --workspace client`

The emulator suite's Firestore/Auth emulators require a JDK (Java 21+).
