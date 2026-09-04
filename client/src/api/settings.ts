import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, firebaseAuth } from "../firebase";
import { forbidden, unauthorized, validationError } from "../errors";
import { cleanName } from "../logic/validation";
import { DEFAULT_TOURNAMENT_SETTINGS, type TournamentSettings } from "../logic/leagueSnapshot";
import type { Profile } from "./types";

const SETTINGS_REF = doc(db, "settings", "tournament");

async function requireAdminProfile(): Promise<Profile> {
  const user = firebaseAuth.currentUser;
  if (!user) throw unauthorized("You must be logged in to continue.");
  const snap = await getDoc(doc(db, "profiles", user.uid));
  if (!snap.exists()) throw unauthorized("You must be logged in to continue.");
  const profile = snap.data() as Profile;
  if (profile.role !== "admin") throw forbidden("Only the admin account can change league data.");
  return profile;
}

export async function getTournamentSettings(): Promise<TournamentSettings> {
  const snap = await getDoc(SETTINGS_REF);
  if (!snap.exists()) return DEFAULT_TOURNAMENT_SETTINGS;
  const data = snap.data() ?? {};
  return {
    name: typeof data.name === "string" ? data.name : "",
    maxTeamSize: typeof data.maxTeamSize === "number" ? data.maxTeamSize : null,
  };
}

function validateLimit(value: number | null, label: string): void {
  if (value === null) return;
  if (!Number.isFinite(value) || value < 1) {
    throw validationError(`${label} must be a positive number, or left blank for no limit.`);
  }
}

async function update(input: TournamentSettings): Promise<TournamentSettings> {
  await requireAdminProfile();
  validateLimit(input.maxTeamSize, "Max team size");
  const cleaned: TournamentSettings = { ...input, name: cleanName(input.name) };
  await setDoc(SETTINGS_REF, cleaned);
  return cleaned;
}

export const settingsApi = {
  get: getTournamentSettings,
  update,
};
