import { collection, doc, getDoc, getDocs, runTransaction, writeBatch } from "firebase/firestore";
import { db, firebaseAuth } from "../firebase";
import { forbidden, notFound, unauthorized, validationError } from "../errors";
import { cleanName } from "../logic/validation";
import { teamGroupsApi } from "./teamGroups";
import type { StoredGroup, StoredTeamGroupLink } from "../logic/leagueSnapshot";
import type { Group, Profile } from "./types";

export interface GroupInput {
  name: string;
  maxTeams: number | null;
}

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

async function requireAdminProfile(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") throw forbidden("Only the admin account can change league data.");
  return profile;
}

function validateMaxTeams(value: number | null): void {
  if (value === null) return;
  if (!Number.isFinite(value) || value < 1) {
    throw validationError("Max teams must be a positive number, or left blank for no limit.");
  }
}

function groupToJson(group: StoredGroup): Group {
  return { id: group.id, name: group.name, maxTeams: group.maxTeams, createdAt: group.createdAt, teamCount: group.teamCount };
}

async function list(): Promise<Group[]> {
  const snapshot = await getDocs(collection(db, "groups"));
  const groups = snapshot.docs.map((d) => groupToJson(d.data() as StoredGroup));
  return groups.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function create(input: GroupInput): Promise<Group> {
  await requireAdminProfile();
  const name = cleanName(input.name);
  if (!name) throw validationError("Group name is required.");
  validateMaxTeams(input.maxTeams);

  const group: StoredGroup = {
    id: newId(),
    name,
    maxTeams: input.maxTeams,
    createdAt: new Date().toISOString(),
    fixtures: [],
    teamCount: 0,
  };
  await runTransaction(db, async (tx) => {
    tx.set(doc(db, "groups", group.id), group);
  });
  return groupToJson(group);
}

async function update(id: string, input: GroupInput): Promise<Group> {
  await requireAdminProfile();
  const name = cleanName(input.name);
  if (!name) throw validationError("Group name is required.");
  validateMaxTeams(input.maxTeams);

  const ref = doc(db, "groups", id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw notFound("Group could not be found.");
    const current = snap.data() as StoredGroup;
    const updated: StoredGroup = { ...current, name, maxTeams: input.maxTeams };
    tx.set(ref, updated);
    return groupToJson(updated);
  });
}

// Deletes the group outright and unwinds every reference to it: removes every
// team_groups link for it (instead of rewriting every affected team's array), and
// removes this group's matches/score reports (the group's own fixtures go with the
// doc itself).
async function remove(id: string): Promise<void> {
  await requireAdminProfile();

  const ref = doc(db, "groups", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw notFound("Group could not be found.");

  const [links, matchesSnap, reportsSnap] = await Promise.all([
    teamGroupsApi.listForGroup(id),
    getDocs(collection(db, "approved_results")),
    getDocs(collection(db, "score_reports")),
  ]);

  const batch = writeBatch(db);
  batch.delete(ref);
  for (const link of links) {
    batch.delete(doc(db, "team_groups", teamGroupsApi.linkId(link.teamId, id)));
  }
  for (const d of matchesSnap.docs) {
    if ((d.data() as { groupId?: string }).groupId === id) batch.delete(d.ref);
  }
  for (const d of reportsSnap.docs) {
    if ((d.data() as { groupId?: string }).groupId === id) batch.delete(d.ref);
  }
  await batch.commit();
}

// Shared by the admin add/remove path and the competitor self-service join/leave
// path below -- both just differ in whose team is being touched and whether the cap
// is enforced. Membership itself is a team_groups/{teamId}_{groupId} doc
// (create/delete); teamCount lives on the group doc and is updated in the same
// transaction, so this stays a single two-document write, no collection scan
// required.
async function setMembership(groupId: string, teamId: string, member: boolean, enforceCap: boolean): Promise<void> {
  const groupRef = doc(db, "groups", groupId);
  const linkRef = doc(db, "team_groups", teamGroupsApi.linkId(teamId, groupId));

  await runTransaction(db, async (tx) => {
    const [groupSnap, linkSnap] = await Promise.all([tx.get(groupRef), tx.get(linkRef)]);
    if (!groupSnap.exists()) throw notFound("Group could not be found.");

    const group = groupSnap.data() as StoredGroup;
    const alreadyMember = linkSnap.exists();

    if (member === alreadyMember) return;

    if (member) {
      if (enforceCap && group.maxTeams !== null && group.teamCount >= group.maxTeams) {
        throw validationError("This group has already reached its maximum number of entries.");
      }
      const link: StoredTeamGroupLink = { teamId, groupId, joinedAt: new Date().toISOString() };
      tx.set(linkRef, link);
      tx.update(groupRef, { teamCount: group.teamCount + 1 });
    } else {
      tx.delete(linkRef);
      tx.update(groupRef, { teamCount: Math.max(0, group.teamCount - 1) });
    }
  });
}

// Admin-only add/remove -- bypasses the self-service max-teams check, since an admin
// is trusted to manage rosters directly.
async function addTeam(groupId: string, teamId: string): Promise<void> {
  await requireAdminProfile();
  await setMembership(groupId, teamId, true, false);
}

async function removeTeam(groupId: string, teamId: string): Promise<void> {
  await requireAdminProfile();
  await setMembership(groupId, teamId, false, false);
}

// Competitor self-service: add/remove their own team from a group.
async function joinGroup(groupId: string): Promise<void> {
  const profile = await requireProfile();
  if (!profile.teamId) throw validationError("You must be registered for the tournament first.");
  await setMembership(groupId, profile.teamId, true, true);
}

async function leaveGroup(groupId: string): Promise<void> {
  const profile = await requireProfile();
  if (!profile.teamId) throw validationError("You are not registered for the tournament.");
  await setMembership(groupId, profile.teamId, false, false);
}

export const groupsApi = {
  list,
  create,
  update,
  remove,
  addTeam,
  removeTeam,
  joinGroup,
  leaveGroup,
};
