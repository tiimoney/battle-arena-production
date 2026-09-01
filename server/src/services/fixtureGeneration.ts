// Port of LeagueProvider.generateFixtures / _buildRoundRobinLeg (circle method).

export interface TeamForFixtures {
  id: string;
}

export interface GeneratedFixture {
  round: number;
  leg: number;
  teamAId: string;
  teamBId: string;
  date: Date;
}

const BYE_ID = "__bye__";

function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function buildRoundRobinLeg(params: {
  teams: TeamForFixtures[];
  startDate: Date;
  daysBetweenRounds: number;
  startingRound: number;
  leg: number;
  reverseHomeAway: boolean;
}): GeneratedFixture[] {
  const { teams, startDate, daysBetweenRounds, startingRound, leg, reverseHomeAway } = params;
  const rotating = [...teams];
  const roundCount = rotating.length - 1;
  const fixtures: GeneratedFixture[] = [];
  const dayZero = startOfDayUTC(startDate);

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex++) {
    const roundDate = addDays(dayZero, roundIndex * daysBetweenRounds);

    for (let pairingIndex = 0; pairingIndex < rotating.length / 2; pairingIndex++) {
      const first = rotating[pairingIndex];
      const second = rotating[rotating.length - 1 - pairingIndex];
      if (first.id === BYE_ID || second.id === BYE_ID) {
        continue;
      }

      const home = reverseHomeAway ? second : first;
      const away = reverseHomeAway ? first : second;

      fixtures.push({
        round: startingRound + roundIndex,
        leg,
        teamAId: home.id,
        teamBId: away.id,
        date: roundDate,
      });
    }

    const fixedTeam = rotating[0];
    const slice = rotating.slice(1);
    const lastTeam = slice.pop() as TeamForFixtures;
    rotating.splice(0, rotating.length, fixedTeam, lastTeam, ...slice);
  }

  return fixtures;
}

export function generateRoundRobinFixtures(params: {
  teams: TeamForFixtures[];
  startDate: Date;
  daysBetweenRounds: number;
  isDoubleRoundRobin: boolean;
}): GeneratedFixture[] {
  const { teams, startDate, daysBetweenRounds, isDoubleRoundRobin } = params;
  const orderedTeams = [...teams];
  if (orderedTeams.length % 2 !== 0) {
    orderedTeams.push({ id: BYE_ID });
  }

  const fixtures = buildRoundRobinLeg({
    teams: orderedTeams,
    startDate,
    daysBetweenRounds,
    startingRound: 1,
    leg: 1,
    reverseHomeAway: false,
  });

  if (isDoubleRoundRobin) {
    const secondLegStart = addDays(startOfDayUTC(startDate), (orderedTeams.length - 1) * daysBetweenRounds);
    fixtures.push(
      ...buildRoundRobinLeg({
        teams: orderedTeams,
        startDate: secondLegStart,
        daysBetweenRounds,
        startingRound: orderedTeams.length,
        leg: 2,
        reverseHomeAway: true,
      }),
    );
  }

  return fixtures;
}
