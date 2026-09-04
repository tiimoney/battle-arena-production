// Shared JSON shapes for a "snapshot" of league data -- used by archive/restore,
// export/import, and the Firestore migration script. Field names deliberately mirror
// the old Flutter app's Team.toJson()/Fixture.toJson()/MatchResult.toJson()/
// ScoreReport.toJson() so an export from the old app or a Firestore dump can be
// dropped in unchanged.

export interface StoredTeamMember {
  id: string;
  name: string;
  linkedUserId: string | null;
  // ISO timestamp of when this member joined the roster (registered, or was added by
  // an admin) -- optional since teams/members created before this field existed
  // won't have it.
  joinedAt?: string;
}

export interface StoredTeam {
  id: string;
  name: string;
  teamSize: number;
  entryType: "individual" | "team";
  members: StoredTeamMember[];
  // ISO timestamp of when this entry first registered -- optional for the same
  // pre-existing-data reason as StoredTeamMember.joinedAt.
  registeredAt?: string;
}

// The many-to-many between teams and groups (episodes) -- a team can play in several
// groups at once, and a group has many teams. Modeled as its own junction collection
// (`team_groups/{teamId}_{groupId}`) rather than an array field on either side, so
// it's two clean one-to-many relationships instead of a repeating group. The
// *API-facing* `Team` type (client/src/api/types.ts) still exposes `groupIds:
// string[]` for convenience -- see api/teamGroups.ts's attachGroupIds, which joins
// this collection onto raw team docs -- so screens never needed to change.
export interface StoredTeamGroupLink {
  teamId: string;
  groupId: string;
  joinedAt: string; // ISO
}

export interface StoredFixture {
  id: string;
  round: number;
  leg: number;
  teamAId: string;
  teamBId: string;
  date: string; // ISO
  groupId: string;
}

export interface StoredMatch {
  id: string;
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  date: string; // ISO
  fixtureId: string | null;
  groupId: string;
}

export interface StoredScoreReport {
  id: string;
  fixtureId: string;
  teamAId: string;
  teamBId: string;
  reporterUserId: string;
  reporterTeamId: string;
  teamAScore: number;
  teamBScore: number;
  reportedAt: string; // ISO
  groupId: string;
}

export interface StoredArchivedSeason {
  id: string;
  name: string;
  archivedAt: string; // ISO
  teams: StoredTeam[];
  fixtures: StoredFixture[];
  matches: StoredMatch[];
  // The cap the group had when archived -- null means "no limit". Optional since
  // archives created before groups existed won't have it.
  maxTeams?: number | null;
}

// A group ("episode") is its own independent mini-league: its own fixtures, and
// (derived from teams/matches scoped to it) its own standings. A team may belong to
// several groups at once. Fixtures are embedded here the same way they used to live
// on the single `league_state/active` document -- now scoped per group instead of
// globally, which also means different groups' fixture writes no longer contend
// with each other.
export interface StoredGroup {
  id: string;
  name: string;
  maxTeams: number | null;
  createdAt: string; // ISO
  fixtures: StoredFixture[];
  // Denormalized count of teams currently in this group, maintained transactionally
  // alongside every groupIds change so the max-teams cap can be checked atomically
  // against this one document instead of racily scanning the whole teams collection.
  teamCount: number;
}

export interface LeagueSnapshot {
  teams: StoredTeam[];
  groups: StoredGroup[];
  teamGroups: StoredTeamGroupLink[];
  matches: StoredMatch[];
  scoreReports: StoredScoreReport[];
  archivedSeasons?: StoredArchivedSeason[];
}

// The shape of the single `league_state/active` Firestore document. Teams and
// fixtures live in their own collections instead (`teams/{id}`, `groups/{id}`)
// specifically so Firestore rules can allow precise per-document self-service
// writes -- not achievable against a single shared document holding everyone's data
// at once. Matches/score reports likewise live in their own top-level collections
// (approved_results, score_reports). Archived seasons are the one thing that stays
// here: they're historical, immutable snapshots, not tied to any live group.
export interface LeagueState {
  archivedSeasons: StoredArchivedSeason[];
}

export const EMPTY_LEAGUE_STATE: LeagueState = { archivedSeasons: [] };

// Admin-configurable tournament name + max players per entry (settings/tournament).
// The team-count cap used to live here too, but it's now set per-group instead
// (see StoredGroup.maxTeams) since a flat tournament-wide cap doesn't mean much once
// a team can play in several groups. null maxTeamSize means "no limit"; an empty
// name means "no name set yet".
export interface TournamentSettings {
  name: string;
  maxTeamSize: number | null;
}

export const DEFAULT_TOURNAMENT_SETTINGS: TournamentSettings = { name: "", maxTeamSize: null };
