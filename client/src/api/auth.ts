import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, updateDoc } from "firebase/firestore";
import { db, firebaseAuth } from "../firebase";
import { ApiError, notFound, unauthorized, validationError } from "../errors";
import { cleanName, normalizeName } from "../logic/validation";
import type { Profile } from "./types";

// usernames/{normalized} docs store {uid, email, createdAt} -- the email lives here
// too (not just on profiles/{uid}) specifically so it can be read *before* sign-in
// (Firestore rules lock profiles/ to owner-or-admin, but usernames/ is
// world-readable) to resolve a display-name login into the email Firebase Auth's
// sign-in call needs. createdAt is when the *reservation* was made -- for the
// original claim at sign-up (see claimDisplayName) that's effectively "when this
// account registered", which is what makes it possible to spot signups that never
// finished verifying: they get a usernames/ doc immediately, but never get a
// profiles/{uid} doc (that only happens post-verification) -- see listPendingSignUps
// below.
interface UsernameDoc {
  uid: string;
  email: string;
  createdAt?: string;
}

async function getUsernameDoc(normalized: string) {
  return getDoc(doc(db, "usernames", normalized));
}

// Claims usernames/{normalized(name)} for `uid`, disambiguating on collision rather
// than failing (see claimDisplayName below for why). Returns the display name that
// actually got claimed. Firestore rules don't require email verification for this
// collection, so it's safe to call right at sign-up time -- deliberately BEFORE the
// account is verified, so display-name login works on the very first sign-in rather
// than only after a profile has been created once already.
async function claimUsername(uid: string, email: string, displayName: string, attempt = 0): Promise<string> {
  const finalName = attempt === 0 ? displayName : `${displayName} (${uid.slice(0, 5)})`;
  const normalized = normalizeName(finalName);

  try {
    await runTransaction(db, async (tx) => {
      const usernameRef = doc(db, "usernames", normalized);
      const usernameSnap = await tx.get(usernameRef);
      if (usernameSnap.exists() && (usernameSnap.data() as UsernameDoc).uid !== uid) {
        throw new ApiError("taken", 409);
      }
      const existingCreatedAt = usernameSnap.exists() ? (usernameSnap.data() as UsernameDoc).createdAt : undefined;
      tx.set(usernameRef, { uid, email, createdAt: existingCreatedAt ?? new Date().toISOString() } satisfies UsernameDoc);
    });
    return finalName;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409 && attempt === 0) {
      return claimUsername(uid, email, displayName, attempt + 1);
    }
    throw error;
  }
}

// Called right after creating the Firebase Auth account, before verification --
// reserves the (possibly disambiguated) display name immediately so display-name
// login works from the very first sign-in, not just after ensureProfile has run
// once. The Firebase Auth account already exists by the time this runs, so a
// collision can't reject the sign-up outright -- that would strand a valid auth
// account with nothing to show for it. The sign-up form is expected to pre-check
// availability (see checkDisplayName below), so disambiguation here is a rare
// fallback, not the norm.
export async function claimDisplayName(uid: string, email: string, displayName: string): Promise<string> {
  return claimUsername(uid, email, cleanName(displayName));
}

// Mirrors the old Flutter app's AuthService.ensureProfile(): looks up profiles/{uid},
// creating it on first-ever *verified* sign-in. The very first profile created
// across the whole project becomes admin (the brief's implicit bootstrap rule),
// determined via meta/adminExists rather than a query against profiles filtered by
// role -- a brand-new, not-yet-admin caller isn't allowed to read *other* people's
// profile documents, so that query would be rejected outright (see firestore.rules).
//
// Email verification (added on top of the original app) only gates BRAND NEW
// profiles: an already-existing profile is grandfathered in regardless of its
// current emailVerified flag, since real accounts from before this feature existed
// never went through a verification step -- and "the document already exists" is
// exactly the condition that skips this check below.
export async function ensureProfile(): Promise<Profile | null> {
  const user = firebaseAuth.currentUser;
  if (!user) return null;

  const profileRef = doc(db, "profiles", user.uid);
  const existing = await getDoc(profileRef);
  if (existing.exists()) {
    return existing.data() as Profile;
  }

  if (!user.emailVerified) {
    throw unauthorized("Please verify your email before continuing. Check your inbox, or request a new link.");
  }

  const email = user.email ?? "";
  const fallbackName = email.split("@")[0] || "Player";
  // The display name was already claimed in usernames/ at sign-up time (see
  // claimDisplayName) -- reuse it as-is rather than re-running the claim/
  // disambiguation dance here. Falls back to claiming fresh only for the unlikely
  // case of a user object with no name at all reaching this point unclaimed.
  const displayName = cleanName(user.displayName || fallbackName);
  const normalized = normalizeName(displayName);
  const usernameSnap = await getUsernameDoc(normalized);
  const finalName =
    usernameSnap.exists() && (usernameSnap.data() as UsernameDoc).uid === user.uid
      ? displayName
      : await claimUsername(user.uid, email, displayName);

  // meta/adminExists (not a query against profiles filtered by role) is what makes
  // this readable by a brand-new, not-yet-admin user -- see firestore.rules for why
  // the equivalent collection query would be rejected outright.
  const metaRef = doc(db, "meta", "adminExists");

  return runTransaction(db, async (tx) => {
    const again = await tx.get(profileRef);
    if (again.exists()) {
      return again.data() as Profile;
    }

    const metaSnap = await tx.get(metaRef);
    const adminAlreadyExists = metaSnap.exists() && (metaSnap.data() as { exists: boolean }).exists === true;
    const role: Profile["role"] = adminAlreadyExists ? "competitor" : "admin";

    const now = new Date().toISOString();
    const profile: Profile = { id: user.uid, email, displayName: finalName, role, teamId: null, createdAt: now, lastLoginAt: now };
    tx.set(profileRef, profile);
    if (!adminAlreadyExists) {
      tx.set(metaRef, { exists: true });
    }
    return profile;
  });
}

// Stamps profiles/{uid}.lastLoginAt with "now" -- called once per explicit sign-in
// (see AuthContext.signIn), not on every silent session restore, so it reads as
// "last time they actually logged in" rather than "last time they had a tab open".
// A no-op failure (e.g. called before the profile exists yet, or a stray race) is
// swallowed by the caller -- this is a nice-to-have admin visibility feature, not
// something sign-in should ever be blocked by.
async function recordLogin(): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user) return;
  await updateDoc(doc(db, "profiles", user.uid), { lastLoginAt: new Date().toISOString() });
}

export interface PendingSignUp {
  uid: string;
  email: string;
  normalizedName: string;
  createdAt?: string;
}

// A usernames/ doc is created immediately at sign-up (before verification); a
// profiles/{uid} doc only exists after verification completes. The difference
// between the two collections is exactly the set of accounts that started signing
// up and never finished -- there's no other trace of them available to a
// client-only app (Firebase Auth's own list of unverified accounts needs the Admin
// SDK, which this app deliberately doesn't have -- see the Groups-era decision to
// stay off Cloud Functions/Blaze). Admin-only in spirit (cross-references real
// emails), even though the underlying usernames/ collection is itself
// world-readable for the display-name-login lookup.
async function listPendingSignUps(): Promise<PendingSignUp[]> {
  const user = firebaseAuth.currentUser;
  if (!user) throw unauthorized("You must be logged in to continue.");
  const selfSnap = await getDoc(doc(db, "profiles", user.uid));
  if (!selfSnap.exists() || (selfSnap.data() as Profile).role !== "admin") {
    throw new ApiError("Only the admin account can view pending sign-ups.", 403);
  }

  const [usernamesSnap, profilesSnap] = await Promise.all([getDocs(collection(db, "usernames")), getDocs(collection(db, "profiles"))]);
  const verifiedUids = new Set(profilesSnap.docs.map((d) => d.id));

  return usernamesSnap.docs
    .filter((d) => !verifiedUids.has((d.data() as UsernameDoc).uid))
    .map((d) => {
      const data = d.data() as UsernameDoc;
      return { uid: data.uid, email: data.email, normalizedName: d.id, createdAt: data.createdAt };
    })
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

// Frees up a stale sign-up's claimed display name (e.g. someone who typo'd their
// email and will never verify) without touching the underlying Firebase Auth
// account -- this app has no way to delete another user's auth account client-side.
// If the original person does come back and verify, ensureProfile() just claims a
// name fresh at that point (their own, if still free, or a disambiguated one).
async function removePendingSignUp(normalizedName: string): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user) throw unauthorized("You must be logged in to continue.");
  const selfSnap = await getDoc(doc(db, "profiles", user.uid));
  if (!selfSnap.exists() || (selfSnap.data() as Profile).role !== "admin") {
    throw new ApiError("Only the admin account can remove a pending sign-up.", 403);
  }
  await deleteDoc(doc(db, "usernames", normalizedName));
}

// Lets a signed-in user rename themselves: swaps the usernames/ reservation from the
// old normalized name to the new one (failing with a friendly error on collision,
// unlike claimDisplayName's disambiguate-on-collision -- there's no already-created
// auth account to strand here, so a clean rejection is the right call), and updates
// profiles/{uid}.displayName in the same transaction. Does not touch role/email/
// teamId. Firebase Auth's own user.displayName is kept in sync by the caller (see
// AuthContext.updateDisplayName) since that's a separate SDK call, not a Firestore
// write.
async function updateDisplayName(newDisplayName: string): Promise<string> {
  const user = firebaseAuth.currentUser;
  if (!user) throw unauthorized("You must be logged in to continue.");
  const cleaned = cleanName(newDisplayName);
  if (!cleaned) throw validationError("Enter a display name.");

  const normalizedNew = normalizeName(cleaned);
  const normalizedOld = normalizeName(user.displayName ?? "");
  const profileRef = doc(db, "profiles", user.uid);
  const newNameRef = doc(db, "usernames", normalizedNew);
  const oldNameRef = doc(db, "usernames", normalizedOld);

  await runTransaction(db, async (tx) => {
    if (normalizedNew !== normalizedOld) {
      const newNameSnap = await tx.get(newNameRef);
      if (newNameSnap.exists()) {
        throw validationError("That display name is already taken.");
      }
      tx.delete(oldNameRef);
    }
    tx.set(newNameRef, { uid: user.uid, email: user.email ?? "" });
    tx.update(profileRef, { displayName: cleaned });
  });

  return cleaned;
}

export const authApi = {
  me: ensureProfile,
  updateDisplayName,
  recordLogin,
  listPendingSignUps,
  removePendingSignUp,

  checkDisplayName: async (name: string): Promise<{ available: boolean }> => {
    if (!name.trim()) {
      return { available: false };
    }
    const snap = await getUsernameDoc(normalizeName(name));
    return { available: !snap.exists() };
  },

  // Firebase Auth's sign-in call only accepts an email, but login accepts either an
  // email or a display name (both unique) -- this resolves the latter.
  resolveIdentifier: async (identifier: string): Promise<{ email: string }> => {
    const trimmed = identifier.trim();
    if (trimmed.includes("@")) {
      return { email: trimmed.toLowerCase() };
    }
    const snap = await getUsernameDoc(normalizeName(trimmed));
    if (!snap.exists()) {
      throw notFound("No account found with that display name.");
    }
    return { email: (snap.data() as UsernameDoc).email };
  },
};
