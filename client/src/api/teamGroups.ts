import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import type { StoredTeam, StoredTeamGroupLink } from "../logic/leagueSnapshot";
import type { Team } from "./types";

function linkId(teamId: string, groupId: string): string {
  return `${teamId}_${groupId}`;
}

// Fetches the whole junction collection -- same "small hobby league, fetch
// everything" pattern already used for teams/groups/matches throughout this app.
async function list(): Promise<StoredTeamGroupLink[]> {
  const snapshot = await getDocs(collection(db, "team_groups"));
  return snapshot.docs.map((d) => d.data() as StoredTeamGroupLink);
}

async function listForGroup(groupId: string): Promise<StoredTeamGroupLink[]> {
  const snapshot = await getDocs(query(collection(db, "team_groups"), where("groupId", "==", groupId)));
  return snapshot.docs.map((d) => d.data() as StoredTeamGroupLink);
}

async function listForTeam(teamId: string): Promise<StoredTeamGroupLink[]> {
  const snapshot = await getDocs(query(collection(db, "team_groups"), where("teamId", "==", teamId)));
  return snapshot.docs.map((d) => d.data() as StoredTeamGroupLink);
}

// Joins the junction collection onto raw team docs so every API function that
// returns a `Team` can keep exposing the convenience `groupIds: string[]` field
// screens already rely on, without that field actually living on the team document.
function attachGroupIds(teams: StoredTeam[], links: StoredTeamGroupLink[]): Team[] {
  const byTeam = new Map<string, string[]>();
  for (const link of links) {
    const arr = byTeam.get(link.teamId) ?? [];
    arr.push(link.groupId);
    byTeam.set(link.teamId, arr);
  }
  return teams.map((t) => ({ ...t, groupIds: byTeam.get(t.id) ?? [] }) as Team);
}

export const teamGroupsApi = {
  linkId,
  list,
  listForGroup,
  listForTeam,
  attachGroupIds,
};
