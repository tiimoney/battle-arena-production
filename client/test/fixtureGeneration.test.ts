import { describe, expect, it } from "vitest";
import { generateRoundRobinFixtures } from "../src/logic/fixtureGeneration.js";

const teams = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}` }));

describe("generateRoundRobinFixtures", () => {
  it("produces teamCount-1 rounds for an even team count, single round-robin", () => {
    const fixtures = generateRoundRobinFixtures({
      teams: teams(4),
      startDate: new Date("2026-01-01T00:00:00Z"),
      daysBetweenRounds: 7,
      isDoubleRoundRobin: false,
    });

    const rounds = new Set(fixtures.map((f) => f.round));
    expect(rounds.size).toBe(3); // 4 teams -> 3 rounds
    expect(fixtures).toHaveLength(6); // 3 rounds * 2 fixtures/round
    expect(fixtures.every((f) => f.leg === 1)).toBe(true);
  });

  it("skips fixtures involving the bye team for an odd team count", () => {
    const fixtures = generateRoundRobinFixtures({
      teams: teams(5),
      startDate: new Date("2026-01-01T00:00:00Z"),
      daysBetweenRounds: 7,
      isDoubleRoundRobin: false,
    });

    // 5 teams -> bye added -> 6 "slots", 5 rounds, 2 real fixtures/round (1 bye each round)
    expect(fixtures).toHaveLength(10);
    for (const f of fixtures) {
      expect(f.teamAId).not.toBe("__bye__");
      expect(f.teamBId).not.toBe("__bye__");
    }
  });

  it("every team plays every other team exactly once in a single round-robin", () => {
    const fixtures = generateRoundRobinFixtures({
      teams: teams(4),
      startDate: new Date("2026-01-01T00:00:00Z"),
      daysBetweenRounds: 7,
      isDoubleRoundRobin: false,
    });

    const pairs = new Set(
      fixtures.map((f) => [f.teamAId, f.teamBId].sort().join("-")),
    );
    expect(pairs.size).toBe(6); // C(4,2)
  });

  it("double round-robin reverses home/away and starts leg 2 at round teamCount, dated (teamCount-1)*daysBetweenRounds later", () => {
    const startDate = new Date("2026-01-01T00:00:00Z");
    const fixtures = generateRoundRobinFixtures({
      teams: teams(4),
      startDate,
      daysBetweenRounds: 7,
      isDoubleRoundRobin: true,
    });

    const leg1 = fixtures.filter((f) => f.leg === 1);
    const leg2 = fixtures.filter((f) => f.leg === 2);
    expect(leg1).toHaveLength(6);
    expect(leg2).toHaveLength(6);

    const leg2Rounds = leg2.map((f) => f.round);
    expect(Math.min(...leg2Rounds)).toBe(4); // startingRound = teamCount = 4

    const expectedLeg2Start = new Date(Date.UTC(2026, 0, 1 + 3 * 7)); // (4-1)*7 days after start
    const earliestLeg2Date = Math.min(...leg2.map((f) => f.date.getTime()));
    expect(earliestLeg2Date).toBe(expectedLeg2Start.getTime());

    // every leg1 pairing should appear reversed in leg2
    for (const f of leg1) {
      const reversed = leg2.find((g) => g.teamAId === f.teamBId && g.teamBId === f.teamAId);
      expect(reversed).toBeTruthy();
    }
  });

  it("throws nothing and returns [] cleanly for a trivial 2-team league", () => {
    const fixtures = generateRoundRobinFixtures({
      teams: teams(2),
      startDate: new Date("2026-01-01T00:00:00Z"),
      daysBetweenRounds: 7,
      isDoubleRoundRobin: false,
    });
    expect(fixtures).toHaveLength(1);
  });
});
