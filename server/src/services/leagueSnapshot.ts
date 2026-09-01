// Shared JSON shapes for a "snapshot" of league data -- used by archive/restore,
// export/import, and the Firestore migration script. Field names deliberately mirror
// the old Flutter app's Team.toJson()/Fixture.toJson()/MatchResult.toJson()/
// ScoreReport.toJson() so an export from the old app or a Firestore dump can be
// dropped in unchanged.

export interface StoredTeamMember {
  id: string;
  name: string;
  linkedUserId: string | null;
}

export interface StoredTeam {
  id: string;
  name: string;
  teamSize: number;
  entryType: "individual" | "team";
  members: StoredTeamMember[];
}

export interface StoredFixture {
  id: string;
  round: number;
  leg: number;
  teamAId: string;
  teamBId: string;
  date: string; // ISO
}

export interface StoredMatch {
  id: string;
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  date: string; // ISO
  fixtureId: string | null;
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
}

export interface LeagueSnapshot {
  teams: StoredTeam[];
  fixtures: StoredFixture[];
  matches: StoredMatch[];
  scoreReports: StoredScoreReport[];
}
