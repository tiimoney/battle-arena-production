import { collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, updateDoc, where, type Transaction } from "firebase/firestore";
import { db, firebaseAuth } from "../firebase";
import { forbidden, notFound, unauthorized, validationError } from "../errors";
import { normalizeName } from "../logic/validation";
import type { StoredTeam } from "../logic/leagueSnapshot";
import type { Profile } from "./types";

function newMemberId(): string {
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

// Listing every profile is admin-only, matching the Firestore rules (a non-admin can
// only ever read their own profile doc, not query the whole collection).
async function list(): Promise<Profile[]> {
  await requireAdminProfile();
  const snapshot = await getDocs(query(collection(db, "profiles"), orderBy("displayName")));
  return snapshot.docs.map((d) => d.data() as Profile);
}

// profile.teamId and team.members[].linkedUserId both encode "which team is this
// competitor on" -- kept as two separate stored fields (see firestore.rules'
// comments on isValidTeamSelfJoin for why profile.teamId can't just be derived), so
// assigning/clearing here has to write both sides in the same transaction, mirroring
// what teamsApi.create/update/remove already do for the admin-roster-editing side of
// the same relationship.
async function assignTeam(userId: string, teamId: string): Promise<Profile> {
  await requireAdminProfile();
  if (!teamId) throw validationError("Select an entry to assign.");

  const profileRef = doc(db, "profiles", userId);
  const teamRef = doc(db, "teams", teamId);

  // The Firestore client SDK's transaction.get() only accepts a document reference,
  // not a query -- unlike the Admin SDK version of this same route. So this conflict
  // check runs just before the transaction rather than inside it; a real double-book
  // between two admins assigning the same team in the same instant is vanishingly
  // unlikely for this app's scale.
  const conflictSnap = await getDocs(query(collection(db, "profiles"), where("teamId", "==", teamId), limit(2)));
  const hasConflict = conflictSnap.docs.some((d) => d.id !== userId);
  if (hasConflict) {
    throw validationError("That entry already has a competitor account assigned.");
  }

  return runTransaction(db, async (tx) => {
    const [profileSnap, teamSnap] = await Promise.all([tx.get(profileRef), tx.get(teamRef)]);
    if (!profileSnap.exists()) throw notFound("Profile could not be found.");
    if (!teamSnap.exists()) throw notFound("Entry could not be found.");
    const profile = profileSnap.data() as Profile;
    const team = teamSnap.data() as StoredTeam;
    if (profile.role !== "competitor") {
      throw validationError("Only competitor accounts can be assigned to league entries.");
    }

    const alreadyLinked = team.members.some((m) => m.linkedUserId === userId);
    if (!alreadyLinked) {
      if (team.entryType === "individual") {
        const slot = team.members[0];
        if (slot?.linkedUserId) {
          throw validationError("This entry is already linked to another competitor.");
        }
        const nextMembers = team.members.map((m, i) => (i === 0 ? { ...m, linkedUserId: userId } : m));
        tx.update(teamRef, { members: nextMembers });
      } else {
        // An admin assignment bypasses the max-team-size cap, same precedent as
        // ManageGroupTeamsDialog's admin add/remove bypassing the group cap -- an
        // admin is trusted to manage rosters directly.
        const nextMembers = [
          ...team.members,
          { id: newMemberId(), name: profile.displayName, linkedUserId: userId, joinedAt: new Date().toISOString() },
        ];
        tx.update(teamRef, { members: nextMembers, teamSize: nextMembers.length });
      }
    }

    const next: Profile = { ...profile, teamId };
    tx.set(profileRef, next);
    return next;
  });
}

// Unlinks `userId` from the roster of `teamId` inside an in-flight transaction --
// keeps the slot and name (looks exactly like a manually-typed, never-signed-up
// player, which is already a normal state). Guarded on the team doc existing at all,
// since profile.teamId can be a dangling reference (e.g. the team was deleted before
// the write paths that now keep both sides in sync were in place).
async function unlinkFromRoster(tx: Transaction, teamId: string, userId: string): Promise<void> {
  const teamRef = doc(db, "teams", teamId);
  const teamSnap = await tx.get(teamRef);
  if (!teamSnap.exists()) return;
  const team = teamSnap.data() as StoredTeam;
  const nextMembers = team.members.map((m) => (m.linkedUserId === userId ? { ...m, linkedUserId: null } : m));
  tx.update(teamRef, { members: nextMembers });
}

async function clearTeam(userId: string): Promise<Profile> {
  await requireAdminProfile();
  const profileRef = doc(db, "profiles", userId);
  const snap = await getDoc(profileRef);
  if (!snap.exists()) throw notFound("Profile could not be found.");
  const profile = snap.data() as Profile;

  const next: Profile = { ...profile, teamId: null };

  await runTransaction(db, async (tx) => {
    if (profile.teamId) {
      await unlinkFromRoster(tx, profile.teamId, userId);
    }
    tx.set(profileRef, next);
  });

  return next;
}

// Reversible: blocks the account from signing in/acting (see AuthContext.
// loadProfile) or writing anything self-service-gated (see firestore.rules'
// isActiveProfile) without touching their team, name, or any other data. An admin
// can flip this back off at any time.
async function setDisabled(userId: string, disabled: boolean): Promise<Profile> {
  await requireAdminProfile();
  const profileRef = doc(db, "profiles", userId);
  const snap = await getDoc(profileRef);
  if (!snap.exists()) throw notFound("Profile could not be found.");
  const profile = snap.data() as Profile;
  await updateDoc(profileRef, { disabled });
  return { ...profile, disabled };
}

// The closest thing to "delete" this client-only architecture can offer: this app
// has no way to delete the underlying Firebase Auth login itself (that needs the
// Admin SDK, i.e. a backend -- see auth.ts's removePendingSignUp comment), so instead
// this permanently disables the account, clears their roster slot the same way
// clearTeam does, and frees up their claimed display name for reuse. One-way -- there
// is deliberately no "undo" for this in the app, since by the time anyone would want
// to reverse it, their name may already belong to someone else.
async function remove(userId: string): Promise<Profile> {
  await requireAdminProfile();
  const profileRef = doc(db, "profiles", userId);
  const snap = await getDoc(profileRef);
  if (!snap.exists()) throw notFound("Profile could not be found.");
  const profile = snap.data() as Profile;

  const next: Profile = { ...profile, teamId: null, disabled: true, removedAt: new Date().toISOString() };

  await runTransaction(db, async (tx) => {
    if (profile.teamId) {
      await unlinkFromRoster(tx, profile.teamId, userId);
    }
    tx.delete(doc(db, "usernames", normalizeName(profile.displayName)));
    tx.set(profileRef, next);
  });

  return next;
}

export const usersApi = {
  list,
  assignTeam,
  clearTeam,
  setDisabled,
  remove,
};
