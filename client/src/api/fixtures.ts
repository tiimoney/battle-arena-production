import { collection, doc, getDoc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db, firebaseAuth } from "../firebase";
import { forbidden, notFound, unauthorized, validationError } from "../errors";
import { generateRoundRobinFixtures } from "../logic/fixtureGeneration";
import { readGroupState, withGroupState } from "../leagueState";
import { teamGroupsApi } from "./teamGroups";
import type { StoredFixture, StoredMatch, StoredTeam } from "../logic/leagueSnapshot";
import type { Fixture, Profile } from "./types";

export interface GenerateFixturesInput {
  startDate: string;
  daysBetweenRounds: number;
  isDoubleRoundRobin: boolean;
}

export interface UpdateFixtureInput {
  round: number;
  teamAId: string;
  teamBId: string;
  date: string;
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

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// This is a small hobby league -- fetching the whole (tiny) collection and filtering
// in memory sidesteps Firestore's null-vs-missing-field pitfalls with `!=` queries.
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

function fixtureToJson(fixture: StoredFixture, matchesByFixtureId: Map<string, StoredMatch>): Fixture {
  const match = matchesByFixtureId.get(fixture.id) ?? null;
  return {
    ...fixture,
    match: match ? { id: match.id, scoreA: match.scoreA, scoreB: match.scoreB, date: match.date } : null,
  };
}

async function list(groupId: string): Promise<Fixture[]> {
  const [group, matches] = await Promise.all([readGroupState(groupId), matchesForGroup(groupId)]);
  const byFixtureId = new Map(matches.filter((m) => m.fixtureId).map((m) => [m.fixtureId as string, m]));
  const sorted = [...group.fixtures].sort(
    (a, b) => a.round - b.round || a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  return sorted.map((f) => fixtureToJson(f, byFixtureId));
}

async function generate(groupId: string, input: GenerateFixturesInput): Promise<{ count: number }> {
  await requireAdminProfile();

  const startDate = new Date(input.startDate);
  if (Number.isNaN(startDate.getTime())) throw validationError("Enter a valid start date.");
  if (!Number.isFinite(input.daysBetweenRounds) || input.daysBetweenRounds <= 0) {
    throw validationError("Days between rounds must be greater than 0.");
  }

  const teams = await teamsInGroup(groupId);
  if (teams.length < 2) throw validationError("Add at least two entries to this group before generating fixtures.");

  const generatedCount = await withGroupState(groupId, (group) => {
    const generated = generateRoundRobinFixtures({
      teams,
      startDate,
      daysBetweenRounds: input.daysBetweenRounds,
      isDoubleRoundRobin: input.isDoubleRoundRobin,
    });

    group.fixtures = generated.map((f) => ({ ...f, id: newId(), date: f.date.toISOString(), groupId }));
    return group.fixtures.length;
  });

  // Regenerating clears every fixture-linked match and all pending score reports for
  // this group; unlinked (manually recorded) matches are left alone.
  const [matchesSnapshot, reportsSnapshot] = await Promise.all([
    getDocs(query(collection(db, "approved_results"), where("groupId", "==", groupId))),
    getDocs(query(collection(db, "score_reports"), where("groupId", "==", groupId))),
  ]);
  const batch = writeBatch(db);
  for (const d of matchesSnapshot.docs) {
    if ((d.data() as StoredMatch).fixtureId) batch.delete(d.ref);
  }
  for (const d of reportsSnapshot.docs) batch.delete(d.ref);
  await batch.commit();

  return { count: generatedCount };
}

async function clear(groupId: string): Promise<void> {
  await requireAdminProfile();

  await withGroupState(groupId, (group) => {
    group.fixtures = [];
  });

  // Unlink (not delete) recorded matches, and drop pending score reports for the
  // fixtures that no longer exist.
  const [matchesSnapshot, reportsSnapshot] = await Promise.all([
    getDocs(query(collection(db, "approved_results"), where("groupId", "==", groupId))),
    getDocs(query(collection(db, "score_reports"), where("groupId", "==", groupId))),
  ]);
  const batch = writeBatch(db);
  for (const d of matchesSnapshot.docs) {
    if ((d.data() as StoredMatch).fixtureId) batch.update(d.ref, { fixtureId: null });
  }
  for (const d of reportsSnapshot.docs) batch.delete(d.ref);
  await batch.commit();
}

async function shift(groupId: string, days: number): Promise<void> {
  await requireAdminProfile();
  if (!Number.isFinite(days) || days === 0) {
    throw validationError("Enter a number other than 0 to shift fixture dates.");
  }

  await withGroupState(groupId, (group) => {
    if (group.fixtures.length === 0) throw validationError("There are no fixtures to shift.");
    group.fixtures = group.fixtures.map((f) => {
      const shifted = startOfDay(new Date(f.date));
      shifted.setUTCDate(shifted.getUTCDate() + days);
      return { ...f, date: shifted.toISOString() };
    });
  });
}

async function update(groupId: string, id: string, input: UpdateFixtureInput): Promise<Fixture> {
  await requireAdminProfile();

  const date = new Date(input.date);
  if (!Number.isFinite(input.round) || input.round <= 0) throw validationError("Round must be greater than 0.");
  if (input.teamAId === input.teamBId) throw validationError("You must select two different entries.");
  if (Number.isNaN(date.getTime())) throw validationError("Enter a valid fixture date.");

  const [matches, teams] = await Promise.all([matchesForGroup(groupId), teamsInGroup(groupId)]);
  const linkedMatch = matches.find((m) => m.fixtureId === id) ?? null;
  if (!teams.some((t) => t.id === input.teamAId) || !teams.some((t) => t.id === input.teamBId)) {
    throw validationError("Both entries must be in this group before updating a fixture.");
  }

  const updated = await withGroupState(groupId, (group) => {
    const index = group.fixtures.findIndex((f) => f.id === id);
    if (index === -1) throw notFound("Fixture could not be found.");

    if (linkedMatch) {
      const stillSamePair =
        (linkedMatch.teamAId === input.teamAId && linkedMatch.teamBId === input.teamBId) ||
        (linkedMatch.teamAId === input.teamBId && linkedMatch.teamBId === input.teamAId);
      if (!stillSamePair) {
        throw validationError("Played fixtures cannot be changed to a different entry pairing.");
      }
    }

    // leg is not editable -- preserved from the existing fixture.
    const next: StoredFixture = {
      id,
      round: input.round,
      leg: group.fixtures[index].leg,
      teamAId: input.teamAId,
      teamBId: input.teamBId,
      date: startOfDay(date).toISOString(),
      groupId,
    };
    group.fixtures[index] = next;
    return next;
  });

  const byFixtureId = new Map(matches.filter((m) => m.fixtureId).map((m) => [m.fixtureId as string, m]));
  return fixtureToJson(updated, byFixtureId);
}

async function remove(groupId: string, id: string, deleteLinkedMatch: boolean): Promise<void> {
  await requireAdminProfile();

  await withGroupState(groupId, (group) => {
    if (!group.fixtures.some((f) => f.id === id)) throw notFound("Fixture could not be found.");
    group.fixtures = group.fixtures.filter((f) => f.id !== id);
  });

  const matches = await matchesForGroup(groupId);
  const linkedMatches = matches.filter((m) => m.fixtureId === id);
  const reportsSnapshot = await getDocs(query(collection(db, "score_reports"), where("groupId", "==", groupId)));

  const batch = writeBatch(db);
  for (const match of linkedMatches) {
    const ref = doc(db, "approved_results", match.id);
    if (deleteLinkedMatch) {
      batch.delete(ref);
    } else {
      batch.update(ref, { fixtureId: null });
    }
  }
  for (const d of reportsSnapshot.docs) {
    if ((d.data() as { fixtureId?: string }).fixtureId === id) batch.delete(d.ref);
  }
  await batch.commit();
}

export const fixturesApi = {
  list,
  generate,
  clear,
  shift,
  update,
  remove,
};
