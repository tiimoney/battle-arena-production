import { collection, doc, getDoc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db, firebaseAuth } from "../firebase";
import { forbidden, notFound, unauthorized, validationError } from "../errors";
import { readGroupState } from "../leagueState";
import { resolveFixtureForRecordedMatch, type FixtureLike, type MatchLike } from "../logic/fixtureLinking";
import { validateMatchTeams, validateScores } from "../logic/validation";
import { teamGroupsApi } from "./teamGroups";
import type { StoredGroup, StoredMatch, StoredTeam } from "../logic/leagueSnapshot";
import type { MatchResult, Profile } from "./types";

export interface MatchInput {
  groupId: string;
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  date: string;
  fixtureId?: string | null;
}

function newId(): string {
  return doc(collection(db, "_ids")).id;
}

async function requireAdminProfile(): Promise<Profile> {
  const user = firebaseAuth.currentUser;
  if (!user) throw unauthorized("You must be logged in to continue.");
  const snap = await getDoc(doc(db, "profiles", user.uid));
  if (!snap.exists()) throw unauthorized("You must be logged in to continue.");
  const profile = snap.data() as Profile;
  if (profile.role !== "admin") throw forbidden("Only the admin account can change league data.");
  return profile;
}

async function matchesForGroup(groupId: string): Promise<StoredMatch[]> {
  const snapshot = await getDocs(query(collection(db, "approved_results"), where("groupId", "==", groupId)));
  return snapshot.docs.map((d) => d.data() as StoredMatch);
}

async function teamsInGroup(groupId: string): Promise<StoredTeam[]> {
  const links = await teamGroupsApi.listForGroup(groupId);
  const teamIds = new Set(links.map((l) => l.teamId));
  if (teamIds.size === 0) return [];
  const snapshot = await getDocs(collection(db, "teams"));
  return snapshot.docs.map((d) => d.data() as StoredTeam).filter((t) => teamIds.has(t.id));
}

function toFixtureLike(group: StoredGroup): FixtureLike[] {
  return group.fixtures.map((f) => ({ ...f, date: new Date(f.date) }));
}

function toMatchLike(matches: StoredMatch[]): MatchLike[] {
  return matches.map((m) => ({ ...m, date: new Date(m.date) }));
}

function parseInput(input: MatchInput) {
  if (!input.groupId) throw validationError("A group must be selected.");
  if (!input.teamAId || !input.teamBId) throw validationError("Select Entry A and Entry B.");
  if (!Number.isFinite(input.scoreA) || !Number.isFinite(input.scoreB)) throw validationError("Enter a score.");
  const date = new Date(input.date);
  if (Number.isNaN(date.getTime())) throw validationError("Enter a valid match date.");
  return { ...input, date, fixtureId: input.fixtureId ?? null };
}

function matchToJson(match: StoredMatch): MatchResult {
  return match;
}

async function list(groupId?: string): Promise<MatchResult[]> {
  const matches = groupId
    ? await matchesForGroup(groupId)
    : (await getDocs(collection(db, "approved_results"))).docs.map((d) => d.data() as StoredMatch);
  matches.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return matches.map(matchToJson);
}

async function create(input: MatchInput): Promise<MatchResult> {
  await requireAdminProfile();
  const { groupId, teamAId, teamBId, scoreA, scoreB, date, fixtureId } = parseInput(input);
  validateMatchTeams(teamAId, teamBId);
  validateScores(scoreA, scoreB);

  const [group, matches, teams] = await Promise.all([readGroupState(groupId), matchesForGroup(groupId), teamsInGroup(groupId)]);
  if (!teams.some((t) => t.id === teamAId) || !teams.some((t) => t.id === teamBId)) {
    throw validationError("Both entries must be in this group before recording a match.");
  }

  const linkedFixture = resolveFixtureForRecordedMatch({
    fixtures: toFixtureLike(group),
    matches: toMatchLike(matches),
    teamAId,
    teamBId,
    date,
    explicitFixtureId: fixtureId,
  });

  const match: StoredMatch = {
    id: newId(),
    teamAId,
    teamBId,
    scoreA,
    scoreB,
    date: date.toISOString(),
    fixtureId: linkedFixture?.id ?? null,
    groupId,
  };

  const batch = writeBatch(db);
  batch.set(doc(db, "approved_results", match.id), match);
  if (linkedFixture) {
    const reports = await getDocs(query(collection(db, "score_reports"), where("fixtureId", "==", linkedFixture.id)));
    for (const d of reports.docs) batch.delete(d.ref);
  }
  await batch.commit();

  return matchToJson(match);
}

async function update(id: string, input: MatchInput): Promise<MatchResult> {
  await requireAdminProfile();

  const currentRef = doc(db, "approved_results", id);
  const currentSnap = await getDoc(currentRef);
  if (!currentSnap.exists()) throw notFound("Match could not be found.");
  const current = currentSnap.data() as StoredMatch;

  const { groupId, teamAId, teamBId, scoreA, scoreB, date, fixtureId } = parseInput(input);
  validateMatchTeams(teamAId, teamBId);
  validateScores(scoreA, scoreB);

  const [group, matches, teams] = await Promise.all([readGroupState(groupId), matchesForGroup(groupId), teamsInGroup(groupId)]);
  if (!teams.some((t) => t.id === teamAId) || !teams.some((t) => t.id === teamBId)) {
    throw validationError("Both entries must be in this group before recording a match.");
  }

  const linkedFixture = resolveFixtureForRecordedMatch({
    fixtures: toFixtureLike(group),
    matches: toMatchLike(matches.filter((m) => m.id !== current.id)),
    teamAId,
    teamBId,
    date,
    explicitFixtureId: fixtureId ?? current.fixtureId,
    ignoreMatchId: current.id,
  });

  const updated: StoredMatch = {
    id: current.id,
    teamAId,
    teamBId,
    scoreA,
    scoreB,
    date: date.toISOString(),
    fixtureId: linkedFixture?.id ?? null,
    groupId,
  };

  const clearFixtureIds = new Set<string>();
  if (current.fixtureId) clearFixtureIds.add(current.fixtureId);
  if (linkedFixture) clearFixtureIds.add(linkedFixture.id);

  const batch = writeBatch(db);
  batch.set(currentRef, updated);
  for (const fid of clearFixtureIds) {
    const reports = await getDocs(query(collection(db, "score_reports"), where("fixtureId", "==", fid)));
    for (const d of reports.docs) batch.delete(d.ref);
  }
  await batch.commit();

  return matchToJson(updated);
}

async function remove(id: string): Promise<void> {
  await requireAdminProfile();
  const ref = doc(db, "approved_results", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw notFound("Match could not be found.");
  const batch = writeBatch(db);
  batch.delete(ref);
  await batch.commit();
}

export const matchesApi = {
  list,
  create,
  update,
  remove,
};
