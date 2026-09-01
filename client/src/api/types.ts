export type Role = "admin" | "competitor";
export type EntryType = "individual" | "team";

export interface Profile {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  teamId: string | null;
}

// Sign-up either logs you straight in (claiming a migrated account -- its email is
// already trusted from the old system) or requires email verification first (a
// brand-new account).
export type SignUpResult = { status: "signed_in"; profile: Profile } | { status: "verify_email"; email: string };

export interface TeamMember {
  id: string;
  name: string;
  linkedUserId: string | null;
}

export interface Team {
  id: string;
  name: string;
  teamSize: number;
  entryType: EntryType;
  members: TeamMember[];
}

export interface Fixture {
  id: string;
  round: number;
  leg: number;
  teamAId: string;
  teamBId: string;
  date: string;
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
}

export interface ArchivedSeason {
  id: string;
  name: string;
  archivedAt: string;
  teams: Team[];
  fixtures: Omit<Fixture, "match">[];
  matches: MatchResult[];
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

export interface LeagueExport {
  teams: Team[];
  fixtures: Omit<Fixture, "match">[];
  matches: MatchResult[];
  scoreReports: ScoreReport[];
  archivedSeasons: ArchivedSeason[];
}
