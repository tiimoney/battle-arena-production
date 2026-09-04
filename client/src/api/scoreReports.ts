import { collection, doc, getDoc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db, firebaseAuth } from "../firebase";
import { forbidden, notFound, unauthorized, validationError } from "../errors";
import { readGroupState } from "../leagueState";
import { findConsensus } from "../logic/reconciliation";
import { validateScores } from "../logic/validation";
import type { StoredMatch, StoredScoreReport } from "../logic/leagueSnapshot";
import type { Profile, ScoreReport } from "./types";

function newId(): string {
  return doc(collection(db, "_ids")).id;
}

async function requireProfile(): Promise<Profile> {
  const user = firebaseAuth.currentUser;
  if (!user) throw unauthorized("You must be logged in to continue.");
  const snap = await getDoc(doc(db, "profiles", user.uid));
  if (!snap.exists()) throw unauthorized("You must be logged in to continue.");
  return snap.data() as Profile;
}

function reportDocId(fixtureId: string, reporterUserId: string): string {
  return `${fixtureId}_${reporterUserId}`;
}

// Shared by "submit report" and safe to re-run any time -- checks every pending
// report for a fixture and auto-approves on cross-team agreement.
async function reconcileFixtureReports(groupId: string, fixtureId: string): Promise<boolean> {
  const reportsSnap = await getDocs(query(collection(db, "score_reports"), where("fixtureId", "==", fixtureId)));
  const reports = reportsSnap.docs.map((d) => d.data() as StoredScoreReport);
  const consensus = findConsensus(reports.map((r) => ({ ...r, reportedAt: new Date(r.reportedAt) })));
  if (!consensus) return false;

  const [group, existingMatchSnap] = await Promise.all([
    readGroupState(groupId),
    getDocs(query(collection(db, "approved_results"), where("fixtureId", "==", fixtureId))),
  ]);
  const fixture = group.fixtures.find((f) => f.id === fixtureId);
  const matchId = existingMatchSnap.empty ? newId() : existingMatchSnap.docs[0].id;

  const match: StoredMatch = {
    id: matchId,
    teamAId: consensus.teamAId,
    teamBId: consensus.teamBId,
    scoreA: consensus.scoreA,
    scoreB: consensus.scoreB,
    date: fixture?.date ?? new Date().toISOString(),
    fixtureId,
    groupId,
  };

  const batch = writeBatch(db);
  batch.set(doc(db, "approved_results", matchId), match);
  for (const d of reportsSnap.docs) batch.delete(d.ref);
  await batch.commit();
  return true;
}

async function list(groupId?: string, fixtureId?: string): Promise<ScoreReport[]> {
  const reportsQuery = fixtureId
    ? query(collection(db, "score_reports"), where("fixtureId", "==", fixtureId))
    : groupId
      ? query(collection(db, "score_reports"), where("groupId", "==", groupId))
      : collection(db, "score_reports");
  const snapshot = await getDocs(reportsQuery);
  const reports = snapshot.docs.map((d) => d.data() as StoredScoreReport);
  reports.sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
  return reports;
}

async function submit(input: { groupId: string; fixtureId: string; scoreA: number; scoreB: number }): Promise<{ report: ScoreReport; approved: boolean }> {
  const profile = await requireProfile();
  if (profile.role !== "competitor" || !profile.teamId) {
    throw validationError("Only competitors with an assigned entry can report scores.");
  }
  if (!input.fixtureId) throw validationError("Fixture could not be found.");
  validateScores(input.scoreA, input.scoreB);

  const [group, matchSnap] = await Promise.all([
    readGroupState(input.groupId),
    getDocs(query(collection(db, "approved_results"), where("fixtureId", "==", input.fixtureId))),
  ]);
  const fixture = group.fixtures.find((f) => f.id === input.fixtureId);
  if (!fixture) throw notFound("Fixture could not be found.");

  const isParticipant = fixture.teamAId === profile.teamId || fixture.teamBId === profile.teamId;
  if (!isParticipant || !matchSnap.empty) {
    throw validationError("You can only report scores for your own unplayed fixtures.");
  }

  const report: StoredScoreReport = {
    id: reportDocId(input.fixtureId, profile.id),
    fixtureId: input.fixtureId,
    teamAId: fixture.teamAId,
    teamBId: fixture.teamBId,
    reporterUserId: profile.id,
    reporterTeamId: profile.teamId,
    teamAScore: input.scoreA,
    teamBScore: input.scoreB,
    reportedAt: new Date().toISOString(),
    groupId: input.groupId,
  };
  const batch = writeBatch(db);
  batch.set(doc(db, "score_reports", report.id), report);
  await batch.commit();

  const approved = await reconcileFixtureReports(input.groupId, input.fixtureId);
  return { report, approved };
}

async function approve(groupId: string, id: string): Promise<void> {
  const profile = await requireProfile();
  if (profile.role !== "admin") throw forbidden("Only the admin account can change league data.");

  const reportSnap = await getDoc(doc(db, "score_reports", id));
  if (!reportSnap.exists()) throw notFound("Score report could not be found.");
  const report = reportSnap.data() as StoredScoreReport;

  const [group, existingMatchSnap] = await Promise.all([
    readGroupState(groupId),
    getDocs(query(collection(db, "approved_results"), where("fixtureId", "==", report.fixtureId))),
  ]);
  const fixture = group.fixtures.find((f) => f.id === report.fixtureId);
  const matchId = existingMatchSnap.empty ? newId() : existingMatchSnap.docs[0].id;

  const match: StoredMatch = {
    id: matchId,
    teamAId: report.teamAId,
    teamBId: report.teamBId,
    scoreA: report.teamAScore,
    scoreB: report.teamBScore,
    date: fixture?.date ?? report.reportedAt,
    fixtureId: report.fixtureId,
    groupId,
  };

  const allReports = await getDocs(query(collection(db, "score_reports"), where("fixtureId", "==", report.fixtureId)));
  const batch = writeBatch(db);
  batch.set(doc(db, "approved_results", matchId), match);
  for (const d of allReports.docs) batch.delete(d.ref);
  await batch.commit();
}

async function remove(id: string): Promise<void> {
  const profile = await requireProfile();

  const ref = doc(db, "score_reports", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw notFound("Score report could not be found.");
  const report = snap.data() as StoredScoreReport;

  const canDelete = profile.role === "admin" || report.reporterUserId === profile.id;
  if (!canDelete) throw forbidden("You are not allowed to remove this score report.");

  const batch = writeBatch(db);
  batch.delete(ref);
  await batch.commit();
}

export const scoreReportsApi = {
  list,
  submit,
  approve,
  remove,
};
