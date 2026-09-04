export type Role = "admin" | "competitor";
export type EntryType = "individual" | "team";
export type { TournamentSettings } from "../logic/leagueSnapshot";

export interface Profile {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  teamId: string | null;
  // Both optional -- only tracked from when this feature shipped, so accounts
  // created before then won't have them.
  createdAt?: string;
  lastLoginAt?: string;
  // Both optional -- undefined/false means active. disabled blocks sign-in/action
  // (see AuthContext.loadProfile and firestore.rules' isActiveProfile) but is
  // reversible from the admin Users screen. removedAt marks the stronger, one-way
  // "Remove" action (disabled forever, cleared from their team, display name freed
  // for reuse) -- set alongside disabled: true, never on its own.
  disabled?: boolean;
  removedAt?: string;
}

// Sign-up either logs you straight in (Firebase Auth account already existed and
// just needed a profile) or requires email verification first (a brand-new
// account) -- see AuthContext.tsx, which now owns this since sign-up goes through
// the Firebase Auth SDK directly rather than a backend endpoint.
export type SignUpResult = { status: "signed_in" } | { status: "verify_email"; email: string };

export interface TeamMember {
  id: string;
  name: string;
  linkedUserId: string | null;
  joinedAt?: string;
}

export interface Team {
  id: string;
  name: string;
  teamSize: number;
  entryType: EntryType;
  members: TeamMember[];
  registeredAt?: string;
  groupIds: string[];
}

export interface Fixture {
  id: string;
  round: number;
  leg: number;
  teamAId: string;
  teamBId: string;
  date: string;
  groupId: string;
  match: { id: string; scoreA: number; scoreB: number; date: string } | null;
}

export interface MatchResult {
  id: string;
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  date: string;
  fixtureId: string | null;
  groupId: string;
}

export interface ScoreReport {
  id: string;
  fixtureId: string;
  teamAId: string;
  teamBId: string;
  reporterUserId: string;
  reporterTeamId: string;
  teamAScore: number;
  teamBScore: number;
  reportedAt: string;
  groupId: string;
}

export interface Group {
  id: string;
  name: string;
  maxTeams: number | null;
  createdAt: string;
  teamCount: number;
}

export interface ArchivedSeason {
  id: string;
  name: string;
  archivedAt: string;
  teams: Team[];
  fixtures: Omit<Fixture, "match">[];
  matches: MatchResult[];
  maxTeams?: number | null;
}

export interface TeamStanding {
  team: { id: string; name: string; teamSize: number; entryType: EntryType; members: TeamMember[] };
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  goalDifference: number;
}

export type SupportCategory = "issue" | "suggestion" | "question";
export type SupportStatus = "open" | "resolved";

export interface SupportTicket {
  id: string;
  userId: string;
  userDisplayName: string;
  userEmail: string;
  category: SupportCategory;
  message: string;
  status: SupportStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export interface LeagueExport {
  teams: Team[];
  groups: (Group & { fixtures: Omit<Fixture, "match">[] })[];
  teamGroups: { teamId: string; groupId: string; joinedAt: string }[];
  matches: MatchResult[];
  scoreReports: ScoreReport[];
  archivedSeasons: ArchivedSeason[];
}
