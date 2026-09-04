import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { db, firebaseAuth } from "../firebase";
import { forbidden, unauthorized, validationError } from "../errors";
import type { Profile, SupportCategory, SupportStatus, SupportTicket } from "./types";

const CATEGORIES: SupportCategory[] = ["issue", "suggestion", "question"];

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
  if (profile.role !== "admin") throw forbidden("Only the admin account can view support requests.");
  return profile;
}

// Any signed-in user (admin or competitor) can file one of these -- userDisplayName/
// userEmail are stamped from their own profile so the admin inbox never needs to
// cross-reference profiles/ to know who filed it (see firestore.rules, which
// re-validates both against the caller's own profile).
async function submit(category: SupportCategory, message: string): Promise<void> {
  const profile = await requireProfile();
  if (!CATEGORIES.includes(category)) throw validationError("Pick a category.");
  const cleaned = message.trim();
  if (!cleaned) throw validationError("Enter a message before submitting.");
  if (cleaned.length > 2000) throw validationError("Keep it under 2000 characters.");

  const ticket: SupportTicket = {
    id: newId(),
    userId: profile.id,
    userDisplayName: profile.displayName,
    userEmail: profile.email,
    category,
    message: cleaned,
    status: "open",
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  await setDoc(doc(db, "support_tickets", ticket.id), ticket);
}

async function list(): Promise<SupportTicket[]> {
  await requireAdminProfile();
  const snapshot = await getDocs(collection(db, "support_tickets"));
  return snapshot.docs.map((d) => d.data() as SupportTicket).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function setStatus(id: string, status: SupportStatus): Promise<void> {
  await requireAdminProfile();
  await updateDoc(doc(db, "support_tickets", id), {
    status,
    resolvedAt: status === "resolved" ? new Date().toISOString() : null,
  });
}

async function remove(id: string): Promise<void> {
  await requireAdminProfile();
  await deleteDoc(doc(db, "support_tickets", id));
}

export const supportApi = {
  submit,
  list,
  setStatus,
  remove,
};
