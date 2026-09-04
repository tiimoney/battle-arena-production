import { collection, doc, getDoc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db, firebaseAuth } from "../firebase";
import { forbidden, unauthorized, validationError } from "../errors";
import { readLeagueState, withLeagueState } from "../leagueState";
import { relinkMatchesToFixtures } from "../logic/fixtureLinking";
import { findConsensus } from "../logic/reconciliation";
import { normalizeName } from "../logic/validation";
import { teamGroupsApi } from "./teamGroups";
import type {
  LeagueSnapshot,
  StoredGroup,
  StoredMatch,
  StoredScoreReport,
  StoredTeam,
  StoredTeamGroupLink,
} from "../logic/leagueSnapshot";
import type { LeagueExport, Profile } from "./types";

async function requireAdminProfile(): Promise<Profile> {
  const user = firebaseAuth.currentUser;
  if (!user) throw unauthorized("You must be logged in to continue.");
  const snap = await getDoc(doc(db, "profiles", user.uid));
  if (!snap.exists()) throw unauthorized("You must be logged in to continue.");
  const profile = snap.data() as Profile;
  if (profile.role !== "admin") throw forbidden("Only the admin account can change league data.");
  return profile;
}

async function allMatches(): Promise<StoredMatch[]> {
  const snapshot = await getDocs(collection(db, "approved_results"));
  return snapshot.docs.map((d) => d.data() as StoredMatch);
}

async function allReports(): Promise<StoredScoreReport[]> {
  const snapshot = await getDocs(collection(db, "score_reports"));
  return snapshot.docs.map((d) => d.data() as StoredScoreReport);
}

async function allTeams(): Promise<StoredTeam[]> {
  const snapshot = await getDocs(collection(db, "teams"));
  return snapshot.docs.map((d) => d.data() as StoredTeam);
}

async function allGroups(): Promise<StoredGroup[]> {
  const snapshot = await getDocs(collection(db, "groups"));
  return snapshot.docs.map((d) => d.data() as StoredGroup);
}

async function exportLeague(): Promise<LeagueExport> {
  await requireAdminProfile();
  const [state, matches, scoreReports, teams, groups, teamGroups] = await Promise.all([
    readLeagueState(),
    allMatches(),
    allReports(),
    allTeams(),
    allGroups(),
    teamGroupsApi.list(),
  ]);
  return {
    teams: teamGroupsApi.attachGroupIds(teams, teamGroups),
    groups,
    teamGroups,
    matches,
    scoreReports,
    archivedSeasons: state.archivedSeasons,
  } as unknown as LeagueExport;
}

function parseSnapshot(data: unknown): LeagueSnapshot {
  if (typeof data !== "object" || data === null) {
    throw validationError("Imported data must be a JSON object.");
  }
  const body = data as Record<string, unknown>;
  const { teams, groups, matches } = body;
  if (!Array.isArray(teams) || !Array.isArray(groups) || !Array.isArray(matches)) {
    throw validationError("Imported data is missing required league fields.");
  }
  // teamGroups is the authoritative source for membership on import; a `groupIds`
  // field that might still be present on individual team objects (e.g. an export
  // taken for display purposes) is ignored -- team docs no longer store that field.
  const teamGroups = Array.isArray(body.teamGroups) ? (body.teamGroups as StoredTeamGroupLink[]) : [];
  return {
    teams: (teams as Array<StoredTeam & { groupIds?: unknown }>).map(({ groupIds: _groupIds, ...team }) => team),
    groups: groups as StoredGroup[],
    teamGroups,
    matches: matches as LeagueSnapshot["matches"],
    scoreReports: Array.isArray(body.scoreReports) ? (body.scoreReports as StoredScoreReport[]) : [],
    archivedSeasons: Array.isArray(body.archivedSeasons) ? (body.archivedSeasons as LeagueSnapshot["archivedSeasons"]) : [],
  };
}

async function wipeTeams(teams: StoredTeam[]): Promise<void> {
  const batch = writeBatch(db);
  for (const team of teams) {
    batch.delete(doc(db, "teams", team.id));
    batch.delete(doc(db, "teamNames", normalizeName(team.name)));
  }
  await batch.commit();
}

async function wipeGroups(groups: StoredGroup[]): Promise<void> {
  const batch = writeBatch(db);
  for (const group of groups) batch.delete(doc(db, "groups", group.id));
  await batch.commit();
}

async function wipeTeamGroups(links: StoredTeamGroupLink[]): Promise<void> {
  const batch = writeBatch(db);
  for (const link of links) batch.delete(doc(db, "team_groups", teamGroupsApi.linkId(link.teamId, link.groupId)));
  await batch.commit();
}

// Import is merge/upsert-by-id by default: existing rows not mentioned in the
// payload are left untouched. mode="replace" wipes the active season (teams,
// groups/fixtures, team_groups links, and archives, if included) first -- the old
// app's only behavior, kept as an explicit danger-zone opt-in per the brief.
// Team-name reservations are overwritten unconditionally during import
// (last-write-wins) rather than collision-checked like the interactive create/update
// flows -- an admin-only bulk import is trusted to bring in consistent data.
async function importLeague(data: unknown, mode: "merge" | "replace"): Promise<void> {
  await requireAdminProfile();
  const snapshot = parseSnapshot(data);

  const [currentTeams, currentGroups, currentTeamGroups] = await Promise.all([allTeams(), allGroups(), teamGroupsApi.list()]);
  if (mode === "replace") {
    await Promise.all([wipeTeams(currentTeams), wipeGroups(currentGroups), wipeTeamGroups(currentTeamGroups)]);
  }

  const teamsBatch = writeBatch(db);
  const survivingTeams = mode === "replace" ? [] : currentTeams;
  const teamsById = new Map(survivingTeams.map((t) => [t.id, t]));
  for (const team of snapshot.teams) {
    const previous = teamsById.get(team.id);
    if (previous && normalizeName(previous.name) !== normalizeName(team.name)) {
      teamsBatch.delete(doc(db, "teamNames", normalizeName(previous.name)));
    }
    teamsBatch.set(doc(db, "teams", team.id), team);
    teamsBatch.set(doc(db, "teamNames", normalizeName(team.name)), { teamId: team.id });
    teamsById.set(team.id, team);
  }
  await teamsBatch.commit();

  const groupsById = new Map((mode === "replace" ? [] : currentGroups).map((g) => [g.id, g]));
  for (const group of snapshot.groups) groupsById.set(group.id, group);

  const linksById = new Map(
    (mode === "replace" ? [] : currentTeamGroups).map((l) => [teamGroupsApi.linkId(l.teamId, l.groupId), l]),
  );
  for (const link of snapshot.teamGroups) linksById.set(teamGroupsApi.linkId(link.teamId, link.groupId), link);

  // Recompute each group's teamCount from the final link set rather than trusting
  // whatever count was in the imported group JSON, so it can't drift from reality.
  const countByGroup = new Map<string, number>();
  for (const link of linksById.values()) {
    countByGroup.set(link.groupId, (countByGroup.get(link.groupId) ?? 0) + 1);
  }

  const groupsBatch = writeBatch(db);
  for (const group of groupsById.values()) {
    groupsBatch.set(doc(db, "groups", group.id), { ...group, teamCount: countByGroup.get(group.id) ?? 0 });
  }
  await groupsBatch.commit();

  const linksBatch = writeBatch(db);
  for (const [id, link] of linksById) linksBatch.set(doc(db, "team_groups", id), link);
  await linksBatch.commit();

  if (mode === "replace") {
    await withLeagueState((state) => {
      state.archivedSeasons = [];
    });
  }
  if (snapshot.archivedSeasons && snapshot.archivedSeasons.length > 0) {
    await withLeagueState((state) => {
      const archivesById = new Map(state.archivedSeasons.map((a) => [a.id, a]));
      for (const archive of snapshot.archivedSeasons ?? []) archivesById.set(archive.id, archive);
      state.archivedSeasons = [...archivesById.values()];
    });
  }

  if (mode === "replace") {
    const [matchSnap, reportSnap] = await Promise.all([
      getDocs(collection(db, "approved_results")),
      getDocs(collection(db, "score_reports")),
    ]);
    const batch = writeBatch(db);
    for (const d of matchSnap.docs) batch.delete(d.ref);
    for (const d of reportSnap.docs) batch.delete(d.ref);
    await batch.commit();
  }

  // Full relink pass, per group, across every imported match against that group's
  // current fixtures -- not just an incremental link of the newly imported rows.
  const allCurrentGroups = [...groupsById.values()];
  const fixturesByGroup = new Map(allCurrentGroups.map((g) => [g.id, g.fixtures]));
  const matchesByGroup = new Map<string, typeof snapshot.matches>();
  for (const match of snapshot.matches) {
    const list = matchesByGroup.get(match.groupId) ?? [];
    list.push(match);
    matchesByGroup.set(match.groupId, list);
  }

  const matchesBatch = writeBatch(db);
  for (const [groupId, groupMatches] of matchesByGroup) {
    const linking = relinkMatchesToFixtures({
      fixtures: (fixturesByGroup.get(groupId) ?? []).map((f) => ({ ...f, date: new Date(f.date) })),
      matches: groupMatches.map((m) => ({ ...m, date: new Date(m.date) })),
    });
    for (const match of groupMatches) {
      matchesBatch.set(doc(db, "approved_results", match.id), { ...match, fixtureId: linking.get(match.id) ?? null });
    }
  }
  for (const report of snapshot.scoreReports) {
    matchesBatch.set(doc(db, "score_reports", `${report.fixtureId}_${report.reporterUserId}`), report);
  }
  await matchesBatch.commit();

  const affectedFixtureIds = new Map(snapshot.scoreReports.map((r) => [r.fixtureId, r.groupId]));
  for (const [fixtureId, groupId] of affectedFixtureIds) {
    const reportsSnap = await getDocs(query(collection(db, "score_reports"), where("fixtureId", "==", fixtureId)));
    const reports = reportsSnap.docs.map((d) => d.data() as StoredScoreReport);
    const consensus = findConsensus(reports.map((r) => ({ ...r, reportedAt: new Date(r.reportedAt) })));
    if (!consensus) continue;

    const fixture = (fixturesByGroup.get(groupId) ?? []).find((f) => f.id === fixtureId);
    const existingMatchSnap = await getDocs(query(collection(db, "approved_results"), where("fixtureId", "==", fixtureId)));
    const matchId = existingMatchSnap.empty ? fixtureId : existingMatchSnap.docs[0].id;

    const consensusBatch = writeBatch(db);
    consensusBatch.set(doc(db, "approved_results", matchId), {
      id: matchId,
      ...consensus,
      date: fixture?.date ?? new Date().toISOString(),
      fixtureId,
      groupId,
    });
    for (const d of reportsSnap.docs) consensusBatch.delete(d.ref);
    await consensusBatch.commit();
  }
}

async function reset(): Promise<void> {
  await requireAdminProfile();

  // Clears every active group, team, team_groups link, match, and pending report --
  // but keeps archived seasons.
  const [teams, groups, teamGroups] = await Promise.all([allTeams(), allGroups(), teamGroupsApi.list()]);
  await Promise.all([wipeTeams(teams), wipeGroups(groups), wipeTeamGroups(teamGroups)]);

  const [matchSnap, reportSnap] = await Promise.all([
    getDocs(collection(db, "approved_results")),
    getDocs(collection(db, "score_reports")),
  ]);
  const batch = writeBatch(db);
  for (const d of matchSnap.docs) batch.delete(d.ref);
  for (const d of reportSnap.docs) batch.delete(d.ref);
  await batch.commit();
}

export const leagueApi = {
  export: exportLeague,
  import: importLeague,
  reset,
};
