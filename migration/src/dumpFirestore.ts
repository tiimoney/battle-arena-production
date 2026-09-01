// Read-only backup step: pulls `profiles`, `league_state/active`, `approved_results`,
// and `score_reports` from the live Firestore project into a local JSON file. This is
// the dry-run/backup the brief requires before any migration touches real data --
// nothing here ever writes to Firestore.
//
// Usage: npm run dump --workspace migration
// Requires FIREBASE_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS in migration/.env.

import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { FirestoreDump } from "./transform.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dumpsDir = join(__dirname, "..", "dumps");

function initFirebase() {
  if (getApps().length > 0) return;

  const projectId = process.env.FIREBASE_PROJECT_ID ?? "battle-arena-production";
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (credentialsPath) {
    const serviceAccount = JSON.parse(readFileSync(credentialsPath, "utf-8"));
    initializeApp({ credential: cert(serviceAccount), projectId });
  } else {
    // Falls back to Application Default Credentials (e.g. `gcloud auth application-default login`).
    initializeApp({ projectId });
  }
}

async function main() {
  initFirebase();
  const db = getFirestore();

  console.log("Reading profiles...");
  const profilesSnap = await db.collection("profiles").get();
  const profiles = profilesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  console.log("Reading league_state/active...");
  const stateSnap = await db.collection("league_state").doc("active").get();
  const state = stateSnap.data() ?? {};

  console.log("Reading approved_results...");
  const resultsSnap = await db.collection("approved_results").get();
  const approvedResults = resultsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  console.log("Reading score_reports...");
  const reportsSnap = await db.collection("score_reports").get();
  const scoreReports = reportsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const dump: FirestoreDump = {
    profiles: profiles as FirestoreDump["profiles"],
    leagueState: {
      teams: (state.teams ?? []) as FirestoreDump["leagueState"]["teams"],
      fixtures: (state.fixtures ?? []) as FirestoreDump["leagueState"]["fixtures"],
      archivedSeasons: (state.archivedSeasons ?? []) as FirestoreDump["leagueState"]["archivedSeasons"],
    },
    approvedResults: approvedResults as FirestoreDump["approvedResults"],
    scoreReports: scoreReports as FirestoreDump["scoreReports"],
  };

  if (!existsSync(dumpsDir)) {
    mkdirSync(dumpsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const timestampedPath = join(dumpsDir, `firestore-dump-${timestamp}.json`);
  const latestPath = join(dumpsDir, "latest.json");
  const json = JSON.stringify(dump, null, 2);

  writeFileSync(timestampedPath, json);
  writeFileSync(latestPath, json);

  console.log(`\nDumped ${dump.profiles.length} profiles, ${dump.leagueState.teams.length} teams, ` +
    `${dump.leagueState.fixtures.length} fixtures, ${dump.approvedResults.length} matches, ` +
    `${dump.scoreReports.length} pending score reports, ${dump.leagueState.archivedSeasons.length} archived seasons.`);
  console.log(`Wrote ${timestampedPath}`);
  console.log(`Wrote ${latestPath} (used by default by npm run migrate)`);
}

main().catch((error) => {
  console.error("Dump failed:", error);
  process.exit(1);
});
