// Port of LeagueProvider._resolveFixtureForRecordedMatch / _findBestFixtureForMatch /
// _relinkMatchesToFixtures.

import { validationError } from "../errors.js";

export interface FixtureLike {
  id: string;
  teamAId: string;
  teamBId: string;
  date: Date;
  round: number;
}

export interface MatchLike {
  id: string;
  teamAId: string;
  teamBId: string;
  date: Date;
  fixtureId: string | null;
}

function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function findBestFixtureForMatch(params: {
  fixtures: FixtureLike[];
  matches: MatchLike[];
  teamAId: string;
  teamBId: string;
  date: Date;
  reservedFixtureIds?: Set<string>;
  ignoreMatchId?: string;
}): FixtureLike | null {
  const { fixtures, matches, teamAId, teamBId, date, reservedFixtureIds = new Set(), ignoreMatchId } = params;

  const unlinked = fixtures.filter((fixture) => {
    const alreadyLinked =
      reservedFixtureIds.has(fixture.id) ||
      matches.some((match) => match.fixtureId === fixture.id && match.id !== ignoreMatchId);
    if (alreadyLinked) {
      return false;
    }
    return (
      (fixture.teamAId === teamAId && fixture.teamBId === teamBId) ||
      (fixture.teamAId === teamBId && fixture.teamBId === teamAId)
    );
  });

  if (unlinked.length === 0) {
    return null;
  }

  const target = startOfDayUTC(date).getTime();
  unlinked.sort((a, b) => {
    const distanceA = Math.abs(startOfDayUTC(a.date).getTime() - target);
    const distanceB = Math.abs(startOfDayUTC(b.date).getTime() - target);
    if (distanceA !== distanceB) {
      return distanceA - distanceB;
    }
    if (a.round !== b.round) {
      return a.round - b.round;
    }
    return a.id.localeCompare(b.id);
  });

  return unlinked[0];
}

export function resolveFixtureForRecordedMatch(params: {
  fixtures: FixtureLike[];
  matches: MatchLike[];
  teamAId: string;
  teamBId: string;
  date: Date;
  explicitFixtureId?: string | null;
  ignoreMatchId?: string;
}): FixtureLike | null {
  const { fixtures, matches, teamAId, teamBId, date, explicitFixtureId, ignoreMatchId } = params;

  if (explicitFixtureId) {
    const explicitFixture = fixtures.find((fixture) => fixture.id === explicitFixtureId);
    if (!explicitFixture) {
      throw validationError("Selected fixture no longer exists.");
    }

    const alreadyLinked = matches.some(
      (match) => match.fixtureId === explicitFixture.id && match.id !== ignoreMatchId,
    );
    if (alreadyLinked) {
      throw validationError("This fixture already has a recorded result.");
    }

    const matchesFixtureTeams =
      (explicitFixture.teamAId === teamAId && explicitFixture.teamBId === teamBId) ||
      (explicitFixture.teamAId === teamBId && explicitFixture.teamBId === teamAId);
    if (!matchesFixtureTeams) {
      throw validationError("Recorded entries do not match the selected fixture.");
    }

    return explicitFixture;
  }

  return findBestFixtureForMatch({ fixtures, matches, teamAId, teamBId, date, ignoreMatchId });
}

// Full relink pass used after import / archive restore. Returns matchId -> new
// fixtureId (or null) for every match, processed oldest-date-first (ties by id),
// exactly mirroring `_sortedMatches().reversed` in the Dart original.
export function relinkMatchesToFixtures(params: {
  fixtures: FixtureLike[];
  matches: MatchLike[];
}): Map<string, string | null> {
  const { fixtures, matches } = params;

  const sorted = [...matches].sort((a, b) => {
    const dateDiff = a.date.getTime() - b.date.getTime();
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return a.id.localeCompare(b.id);
  });

  const reservedFixtureIds = new Set<string>();
  const result = new Map<string, string | null>();

  for (const match of sorted) {
    const linked = findBestFixtureForMatch({
      fixtures,
      matches,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      date: match.date,
      reservedFixtureIds,
      ignoreMatchId: match.id,
    });
    if (linked) {
      reservedFixtureIds.add(linked.id);
    }
    result.set(match.id, linked ? linked.id : null);
  }

  return result;
}
