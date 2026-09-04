import { validationError } from "../errors.js";
import type { EntryType } from "../api/types.js";

// Exact port of LeagueProvider._cleanName / _normalizeName.
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function normalizeName(name: string): string {
  return cleanName(name).toLowerCase();
}

export function validateRoster(entryType: EntryType, memberCount: number): void {
  if (memberCount <= 0) {
    throw validationError("Add at least one player to this entry.");
  }
  if (entryType === "individual" && memberCount !== 1) {
    throw validationError("An individual entry must contain exactly one player.");
  }
}

export function validateMatchTeams(teamAId: string, teamBId: string): void {
  if (teamAId === teamBId) {
    throw validationError("You must select two different entries.");
  }
}

export function validateScores(scoreA: number, scoreB: number): void {
  if (scoreA < 0 || scoreB < 0) {
    throw validationError("Scores cannot be negative.");
  }
}

export interface RawTeamMember {
  name: string;
  linkedUserId?: string | null;
}

export interface NormalizedTeamMember {
  name: string;
  linkedUserId: string | null;
}

// Port of LeagueProvider._normalizeMembers: dedupes by linkedUserId when present,
// otherwise by case-insensitive name; drops blank names; preserves input order.
export function normalizeMembers(members: RawTeamMember[]): NormalizedTeamMember[] {
  const normalized: NormalizedTeamMember[] = [];
  const seenLinkedUserIds = new Set<string>();
  const seenNames = new Set<string>();

  for (const member of members) {
    const cleanedName = cleanName(member.name ?? "");
    if (!cleanedName) {
      continue;
    }

    const linkedUserId = member.linkedUserId ?? null;
    if (linkedUserId) {
      if (seenLinkedUserIds.has(linkedUserId)) {
        continue;
      }
      seenLinkedUserIds.add(linkedUserId);
    } else {
      const normalizedName = cleanedName.toLowerCase();
      if (seenNames.has(normalizedName)) {
        continue;
      }
      seenNames.add(normalizedName);
    }

    normalized.push({ name: cleanedName, linkedUserId });
  }

  return normalized;
}
