// Port of LeagueProvider._reconcileScoreReportsLocally / FirebaseLeagueRepository.reconcileScoreReports.
//
// Two reports from two different teams on the same fixture that agree on the same
// scoreline auto-approve into the official MatchResult. Safe to re-run: with < 2
// reports, or no cross-team agreement, it's a no-op.

export interface ScoreReportLike {
  id: string;
  teamAId: string;
  teamBId: string;
  reporterTeamId: string;
  teamAScore: number;
  teamBScore: number;
  reportedAt: Date;
}

export interface ConsensusResult {
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
}

export function findConsensus(reports: ScoreReportLike[]): ConsensusResult | null {
  if (reports.length < 2) {
    return null;
  }

  const sorted = [...reports].sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());
  const distinctTeams = new Set(sorted.map((report) => report.reporterTeamId));
  if (distinctTeams.size < 2) {
    return null;
  }

  const baseline = sorted[0];
  const matching = sorted.find(
    (report) =>
      report.reporterTeamId !== baseline.reporterTeamId &&
      report.teamAScore === baseline.teamAScore &&
      report.teamBScore === baseline.teamBScore,
  );

  if (!matching) {
    return null;
  }

  return {
    teamAId: baseline.teamAId,
    teamBId: baseline.teamBId,
    scoreA: baseline.teamAScore,
    scoreB: baseline.teamBScore,
  };
}
