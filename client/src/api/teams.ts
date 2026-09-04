import { collection, doc, getDoc, getDocs, query, runTransaction, updateDoc, where, writeBatch, type Transaction } from "firebase/firestore";
import { db, firebaseAuth } from "../firebase";
import { forbidden, notFound, unauthorized, validationError } from "../errors";
import { withGroupState } from "../leagueState";
import { getTournamentSettings } from "./settings";
import { teamGroupsApi } from "./teamGroups";
import {
  cleanName,
  normalizeMembers,
  normalizeName,
  validateRoster,
  type NormalizedTeamMember,
} from "../logic/validation";
import type { StoredTeam } from "../logic/leagueSnapshot";
import type { EntryType, Profile, Team } from "./types";

export interface TeamMemberInput {
  name: string;
  linkedUserId?: string | null;
}

export interface TeamInput {
  name: string;
  entryType: EntryType;
  members: TeamMemberInput[];
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

function sortTeams(teams: Team[]): Team[] {
  return [...teams].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

async function allTeams(): Promise<StoredTeam[]> {
  const snapshot = await getDocs(collection(db, "teams"));
  return snapshot.docs.map((d) => d.data() as StoredTeam);
}

function checkLinkedMemberConflicts(teams: StoredTeam[], members: NormalizedTeamMember[], currentTeamId: string | null) {
  for (const member of members) {
    if (!member.linkedUserId) continue;
    const conflictTeam = teams.find(
      (team) => team.id !== currentTeamId && team.members.some((m) => m.linkedUserId === member.linkedUserId),
    );
    if (conflictTeam) {
      throw validationError(`${member.name} is already attached to ${conflictTeam.name}.`);
    }
  }
}

// profile.teamId and team.members[].linkedUserId both encode "which team is this
// competitor on" -- kept as two separate stored fields (see firestore.rules'
// comments on isValidTeamSelfJoin for why profile.teamId can't just be derived), so
// every write that changes one must fix up the other in the same transaction. This
// is shared by create/update below: given the previous and next linkedUserId sets on
// a team's roster, it writes profiles/{id}.teamId for everyone who was newly linked
// or newly unlinked.
function syncLinkedProfiles(
  tx: Transaction,
  teamId: string,
  previousLinkedIds: Set<string>,
  nextLinkedIds: Set<string>,
) {
  for (const uid of nextLinkedIds) {
    if (!previousLinkedIds.has(uid)) {
      tx.update(doc(db, "profiles", uid), { teamId });
    }
  }
  for (const uid of previousLinkedIds) {
    if (!nextLinkedIds.has(uid)) {
      tx.update(doc(db, "profiles", uid), { teamId: null });
    }
  }
}

async function list(): Promise<Team[]> {
  const [teams, links] = await Promise.all([allTeams(), teamGroupsApi.list()]);
  return sortTeams(teamGroupsApi.attachGroupIds(teams, links));
}

async function create(input: TeamInput): Promise<Team> {
  await requireAdminProfile();
  const name = cleanName(input.name);
  if (!name) throw validationError("Entry name is required.");
  const members = normalizeMembers(input.members);
  validateRoster(input.entryType, members.length);
  checkLinkedMemberConflicts(await allTeams(), members, null);

  const now = new Date().toISOString();
  const team: StoredTeam = {
    id: newId(),
    name,
    teamSize: members.length,
    entryType: input.entryType,
    members: members.map((m) => ({ id: newId(), name: m.name, linkedUserId: m.linkedUserId, joinedAt: now })),
    registeredAt: now,
  };

  await runTransaction(db, async (tx) => {
    const nameRef = doc(db, "teamNames", normalizeName(name));
    const nameSnap = await tx.get(nameRef);
    if (nameSnap.exists()) {
      throw validationError("An entry with this name already exists.");
    }
    tx.set(nameRef, { teamId: team.id });
    tx.set(doc(db, "teams", team.id), team);
    syncLinkedProfiles(
      tx,
      team.id,
      new Set(),
      new Set(team.members.filter((m) => m.linkedUserId).map((m) => m.linkedUserId as string)),
    );
  });

  return { ...team, groupIds: [] } as Team;
}

async function update(id: string, input: TeamInput): Promise<Team> {
  await requireAdminProfile();
  const name = cleanName(input.name);
  if (!name) throw validationError("Entry name is required.");
  const members = normalizeMembers(input.members);
  validateRoster(input.entryType, members.length);

  const teamRef = doc(db, "teams", id);
  const snap = await getDoc(teamRef);
  if (!snap.exists()) throw notFound("Entry could not be found.");
  const current = snap.data() as StoredTeam;

  const others = (await allTeams()).filter((t) => t.id !== id);
  if (others.some((t) => normalizeName(t.name) === normalizeName(name))) {
    throw validationError("An entry with this name already exists.");
  }
  checkLinkedMemberConflicts(others, members, id);

  const previousMembers = current.members;
  const now = new Date().toISOString();
  const updated: StoredTeam = {
    id,
    name,
    teamSize: members.length,
    entryType: input.entryType,
    members: members.map((m, i) => {
      const previous = m.linkedUserId
        ? previousMembers.find((p) => p.linkedUserId === m.linkedUserId)
        : previousMembers[i];
      // Preserve the original join timestamp for members who were already on the
      // roster; a genuinely new member (no match above) is joining right now.
      return { id: previous?.id ?? newId(), name: m.name, linkedUserId: m.linkedUserId, joinedAt: previous?.joinedAt ?? now };
    }),
    // Preserve when this entry originally registered -- editing it isn't re-registering.
    registeredAt: current.registeredAt ?? now,
  };

  const normalizedOld = normalizeName(current.name);
  const normalizedNew = normalizeName(name);
  const previousLinkedIds = new Set(previousMembers.filter((m) => m.linkedUserId).map((m) => m.linkedUserId as string));
  const nextLinkedIds = new Set(updated.members.filter((m) => m.linkedUserId).map((m) => m.linkedUserId as string));

  await runTransaction(db, async (tx) => {
    if (normalizedOld !== normalizedNew) {
      const newNameRef = doc(db, "teamNames", normalizedNew);
      const newNameSnap = await tx.get(newNameRef);
      if (newNameSnap.exists()) {
        throw validationError("An entry with this name already exists.");
      }
      tx.set(newNameRef, { teamId: id });
      tx.delete(doc(db, "teamNames", normalizedOld));
    }
    tx.set(teamRef, updated);
    syncLinkedProfiles(tx, id, previousLinkedIds, nextLinkedIds);
  });

  const links = await teamGroupsApi.listForTeam(id);
  return teamGroupsApi.attachGroupIds([updated], links)[0];
}

// Deletes matches (approved_results) referencing the team directly, plus matches and
// pending score reports tied to the fixtures that were just removed -- explicit
// batched cleanup since Firestore has no native cascading foreign keys.
async function cascadeDelete(teamId: string, fixtureIds: string[]): Promise<void> {
  const batch = writeBatch(db);

  const [byTeamA, byTeamB] = await Promise.all([
    getDocs(query(collection(db, "approved_results"), where("teamAId", "==", teamId))),
    getDocs(query(collection(db, "approved_results"), where("teamBId", "==", teamId))),
  ]);
  const matchDocs = new Map(byTeamA.docs.concat(byTeamB.docs).map((d) => [d.id, d]));

  for (const fixtureId of fixtureIds) {
    const [byFixture, reports] = await Promise.all([
      getDocs(query(collection(db, "approved_results"), where("fixtureId", "==", fixtureId))),
      getDocs(query(collection(db, "score_reports"), where("fixtureId", "==", fixtureId))),
    ]);
    for (const d of byFixture.docs) matchDocs.set(d.id, d);
    for (const d of reports.docs) batch.delete(d.ref);
  }

  for (const d of matchDocs.values()) batch.delete(d.ref);
  await batch.commit();
}

async function remove(id: string): Promise<void> {
  await requireAdminProfile();

  const teamRef = doc(db, "teams", id);
  const snap = await getDoc(teamRef);
  if (!snap.exists()) throw notFound("Entry could not be found.");
  const team = snap.data() as StoredTeam;

  const links = await teamGroupsApi.listForTeam(id);

  // A team can be in several groups at once -- pull it out of its fixtures in every
  // one of them, not just a single global fixture list.
  const removedFixtureIds: string[] = [];
  for (const link of links) {
    const removed = await withGroupState(link.groupId, (group) => {
      const ids = group.fixtures.filter((f) => f.teamAId === id || f.teamBId === id).map((f) => f.id);
      group.fixtures = group.fixtures.filter((f) => f.teamAId !== id && f.teamBId !== id);
      return ids;
    });
    removedFixtureIds.push(...removed);
  }

  const batch = writeBatch(db);
  batch.delete(teamRef);
  batch.delete(doc(db, "teamNames", normalizeName(team.name)));
  for (const link of links) {
    batch.delete(doc(db, "team_groups", teamGroupsApi.linkId(id, link.groupId)));
    const groupSnap = await getDoc(doc(db, "groups", link.groupId));
    if (groupSnap.exists()) {
      const count = (groupSnap.data() as { teamCount: number }).teamCount;
      batch.update(doc(db, "groups", link.groupId), { teamCount: Math.max(0, count - 1) });
    }
  }
  // Clear the dangling reference on every profile still linked to this team --
  // otherwise they'd be permanently "assigned" to an entry that no longer exists.
  for (const member of team.members) {
    if (member.linkedUserId) {
      batch.update(doc(db, "profiles", member.linkedUserId), { teamId: null });
    }
  }
  await batch.commit();

  await cascadeDelete(id, removedFixtureIds);
}

async function checkNameAvailable(name: string): Promise<boolean> {
  const cleaned = cleanName(name);
  if (!cleaned) return false;
  const snap = await getDoc(doc(db, "teamNames", normalizeName(cleaned)));
  return !snap.exists();
}

// Competitor self-registration: create a brand-new entry for just themselves --
// entryType 'team' leaves it open for others to join later (up to the admin's max
// team size), 'individual' is just them, permanently. Starts in no groups; joining a
// group (episode) is a separate step from `groupsApi.joinGroup`, which is also
// where the per-group entry-count cap applies. See firestore.rules'
// isValidTeamSelfCreate for the actual enforcement -- this is the friendly
// pre-check/UX layer in front of it.
async function registerNewEntry(name: string, entryType: EntryType): Promise<Team> {
  const profile = await requireProfile();
  if (profile.role !== "competitor") {
    throw validationError("Only competitor accounts can register for the tournament.");
  }
  if (profile.teamId) {
    throw validationError("You're already registered for this tournament.");
  }

  const cleanedName = cleanName(name);
  if (!cleanedName) throw validationError("Entry name is required.");

  const now = new Date().toISOString();
  const team: StoredTeam = {
    id: newId(),
    name: cleanedName,
    teamSize: 1,
    entryType,
    members: [{ id: newId(), name: profile.displayName, linkedUserId: profile.id, joinedAt: now }],
    registeredAt: now,
  };

  // Two sequential writes, not one transaction: firestore.rules' isLastMemberOfTeam
  // (which the profiles/{uid} update rule uses to prove this teamId change
  // corresponds to a real roster slot, not an arbitrary team id typed in) reads the
  // team doc via get() -- and a security rule's get() during a transaction sees the
  // state from *before* that transaction, not that same transaction's own pending
  // writes (verified directly against this project). So the team has to actually
  // exist first. This does give up atomicity (a crash between the two writes leaves
  // a team with no linked profile) -- an accepted, recoverable-by-admin tradeoff for
  // closing what would otherwise be a real "hijack any team's reporting rights by
  // patching your own teamId" hole.
  await runTransaction(db, async (tx) => {
    const nameRef = doc(db, "teamNames", normalizeName(cleanedName));
    const nameSnap = await tx.get(nameRef);
    if (nameSnap.exists()) {
      throw validationError("An entry with this name already exists.");
    }
    tx.set(nameRef, { teamId: team.id });
    tx.set(doc(db, "teams", team.id), team);
  });
  await updateDoc(doc(db, "profiles", profile.id), { teamId: team.id });

  return { ...team, groupIds: [] } as Team;
}

// Competitor self-registration: join an existing open 'team'-type entry.
async function joinTeam(teamId: string): Promise<Team> {
  const profile = await requireProfile();
  if (profile.role !== "competitor") {
    throw validationError("Only competitor accounts can register for the tournament.");
  }
  if (profile.teamId) {
    throw validationError("You're already registered for this tournament.");
  }

  const settings = await getTournamentSettings();
  const teamRef = doc(db, "teams", teamId);

  // Two sequential writes, not one transaction -- see the comment in
  // registerNewEntry above for why (a rule's get() during a transaction can't see
  // that same transaction's own pending writes, verified directly).
  const updated = await runTransaction(db, async (tx) => {
    const snap = await tx.get(teamRef);
    if (!snap.exists()) throw notFound("Entry could not be found.");
    const team = snap.data() as StoredTeam;

    if (team.entryType !== "team") {
      throw validationError("You can only join a team entry, not an individual one.");
    }
    if (team.members.some((m) => m.linkedUserId === profile.id)) {
      throw validationError("You're already a member of this entry.");
    }
    if (settings.maxTeamSize !== null && team.members.length >= settings.maxTeamSize) {
      throw validationError("This team is already full.");
    }

    const next: StoredTeam = {
      ...team,
      teamSize: team.members.length + 1,
      members: [...team.members, { id: newId(), name: profile.displayName, linkedUserId: profile.id, joinedAt: new Date().toISOString() }],
    };
    tx.set(teamRef, next);
    return next;
  });
  await updateDoc(doc(db, "profiles", profile.id), { teamId: updated.id });

  const links = await teamGroupsApi.listForTeam(teamId);
  return teamGroupsApi.attachGroupIds([updated], links)[0];
}

export const teamsApi = {
  list,
  create,
  update,
  remove,
  checkNameAvailable,
  registerNewEntry,
  joinTeam,
};
