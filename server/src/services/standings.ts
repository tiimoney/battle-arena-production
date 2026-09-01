// Port of LeagueProvider.standings / _compareStandings.

export interface StandingsTeam {
  id: string;
  name: string;
}

export interface StandingsMatch {
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
}

export interface TeamStats {
  team: StandingsTeam;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  goalDifference: number;
}

export function computeStandings(teams: StandingsTeam[], matches: StandingsMatch[]): TeamStats[] {
  const byId = new Map<
    string,
    {
      team: StandingsTeam;
      played: number;
      wins: number;
      draws: number;
      losses: number;
      goalsFor: number;
      goalsAgainst: number;
    }
  >();

  for (const team of teams) {
    byId.set(team.id, { team, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 });
  }

  for (const match of matches) {
    const a = byId.get(match.teamAId);
    const b = byId.get(match.teamBId);
    if (!a || !b) continue;

    a.played += 1;
    b.played += 1;
    a.goalsFor += match.scoreA;
    a.goalsAgainst += match.scoreB;
    b.goalsFor += match.scoreB;
    b.goalsAgainst += match.scoreA;

    if (match.scoreA > match.scoreB) {
      a.wins += 1;
      b.losses += 1;
    } else if (match.scoreA < match.scoreB) {
      b.wins += 1;
      a.losses += 1;
    } else {
      a.draws += 1;
      b.draws += 1;
    }
  }

  const standings: TeamStats[] = Array.from(byId.values()).map((entry) => ({
    ...entry,
    points: entry.wins * 3 + entry.draws,
    goalDifference: entry.goalsFor - entry.goalsAgainst,
  }));

  standings.sort(compareStandings);
  return standings;
}

function compareStandings(a: TeamStats, b: TeamStats): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return a.team.name.toLowerCase().localeCompare(b.team.name.toLowerCase());
}
