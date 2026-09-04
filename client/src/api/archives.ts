import { collection, doc, getDoc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db, firebaseAuth } from "../firebase";
import { forbidden, notFound, unauthorized, validationError } from "../errors";
import { readLeagueState, withLeagueState } from "../leagueState";
import { relinkMatchesToFixtures } from "../logic/fixtureLinking";
import { cleanName, normalizeName } from "../logic/validation";
import { teamGroupsApi } from "./teamGroups";
import type { StoredArchivedSeason, StoredGroup, StoredMatch, StoredTeam, StoredTeamGroupLink } from "../logic/leagueSnapshot";
import type { ArchivedSeason, Profile } from "./types";

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

async function allTeams(): Promise<StoredTeam[]> {
  const snapshot = await getDocs(collection(db, "teams"));
  return snapshot.docs.map((d) => d.data() as StoredTeam);
}

async function list(): Promise<ArchivedSeason[]> {
  const state = await readLeagueState();
  return [...state.archivedSeasons].sort((a, b) => b.archivedAt.localeCompare(a.archivedAt)) as ArchivedSeason[];
}

// Archives one group's current teams/fixtures/matches as a season snapshot, then
// removes the group entirely: every team_groups link for it is deleted (instead of
// rewriting every affected team's array), and its matches/score reports are deleted.
// The group's own fixtures go with the doc. Other groups (and any of the same teams'
// membership in them) are untouched.
async function create(input: { groupId: string; name: string }): Promise<ArchivedSeason> {
  await requireAdminProfile();
  const name = cleanName(input.name);
  if (!name) throw validationError("Archive name is required.");

  const groupRef = doc(db, "groups", input.groupId);
  const [groupSnap, matches, links, teams] = await Promise.all([
    getDoc(groupRef),
    matchesForGroup(input.groupId),
    teamGroupsApi.listForGroup(input.groupId),
    allTeams(),
  ]);
  if (!groupSnap.exists()) throw notFound("Group could not be found.");
  const group = groupSnap.data() as StoredGroup;
  const teamIds = new Set(links.map((l) => l.teamId));
  const groupTeams = teams.filter((t) => teamIds.has(t.id));

  if (groupTeams.length === 0 && group.fixtures.length === 0 && matches.length === 0) {
    throw validationError("There is nothing in this group to archive yet.");
  }

  const archive: StoredArchivedSeason = {
    id: newId(),
    name,
    archivedAt: new Date().toISOString(),
    teams: groupTeams,
    fixtures: group.fixtures,
    matches,
    maxTeams: group.maxTeams,
  };

  await withLeagueState((state) => {
    state.archivedSeasons = [...state.archivedSeasons, archive];
  });

  const reportsSnap = await getDocs(query(collection(db, "score_reports"), where("groupId", "==", input.groupId)));
  const batch = writeBatch(db);
  batch.delete(groupRef);
  for (const link of links) {
    batch.delete(doc(db, "team_groups", teamGroupsApi.linkId(link.teamId, input.groupId)));
  }
  for (const match of matches) batch.delete(doc(db, "approved_results", match.id));
  for (const d of reportsSnap.docs) batch.delete(d.ref);
  await batch.commit();

  return archive as unknown as ArchivedSeason;
}

// Recreates a new group from an archived snapshot. Scoped to just this archive's own
// teams -- a team that still exists today (maybe now playing in other groups) just
// gets a team_groups link to the new group added; a team that no longer exists is
// recreated fresh. This deliberately does NOT touch any team outside this archive,
// unlike the old single-season version of restore (which wiped and replaced the
// entire teams collection -- fine when there was only one flat season, but would
// have destroyed every other group's rosters once groups can run in parallel).
async function restore(archiveId: string): Promise<void> {
  await requireAdminProfile();

  const [state, currentTeams] = await Promise.all([readLeagueState(), allTeams()]);
  const archive = state.archivedSeasons.find((a) => a.id === archiveId);
  if (!archive) throw notFound("Archived season could not be found.");

  const newGroupId = newId();

  // Full relink pass across every match against every fixture (not incremental),
  // per the brief -- mirrors the original app's _relinkMatchesToFixtures.
  const linking = relinkMatchesToFixtures({
    fixtures: archive.fixtures.map((f) => ({ ...f, date: new Date(f.date) })),
    matches: archive.matches.map((m) => ({ ...m, date: new Date(m.date) })),
  });

  const currentById = new Map(currentTeams.map((t) => [t.id, t]));
  const teamsBatch = writeBatch(db);
  const now = new Date().toISOString();
  for (const archivedTeam of archive.teams) {
    if (!currentById.has(archivedTeam.id)) {
      teamsBatch.set(doc(db, "teams", archivedTeam.id), archivedTeam);
      teamsBatch.set(doc(db, "teamNames", normalizeName(archivedTeam.name)), { teamId: archivedTeam.id });
    }
    // Every archived team (existing or just recreated) gets a link to the freshly
    // restored group -- newGroupId is guaranteed never seen before, so there's no
    // "does it already have this link" check needed, unlike the old array-field
    // version of this function.
    const link: StoredTeamGroupLink = { teamId: archivedTeam.id, groupId: newGroupId, joinedAt: now };
    teamsBatch.set(doc(db, "team_groups", teamGroupsApi.linkId(archivedTeam.id, newGroupId)), link);
  }
  await teamsBatch.commit();

  const newGroup: StoredGroup = {
    id: newGroupId,
    name: archive.name,
    maxTeams: archive.maxTeams ?? null,
    createdAt: new Date().toISOString(),
    fixtures: archive.fixtures,
    teamCount: archive.teams.length,
  };
  await writeBatch(db).set(doc(db, "groups", newGroupId), newGroup).commit();

  const matchesBatch = writeBatch(db);
  for (const match of archive.matches) {
    matchesBatch.set(doc(db, "approved_results", match.id), {
      ...match,
      fixtureId: linking.get(match.id) ?? null,
      groupId: newGroupId,
    });
  }
  await matchesBatch.commit();
}

async function remove(id: string): Promise<void> {
  await requireAdminProfile();
  await withLeagueState((state) => {
    if (!state.archivedSeasons.some((a) => a.id === id)) throw notFound("Archived season could not be found.");
    state.archivedSeasons = state.archivedSeasons.filter((a) => a.id !== id);
  });
}

export const archivesApi = {
  list,
  create,
  restore,
  remove,
};
