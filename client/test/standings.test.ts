import { describe, expect, it } from "vitest";
import { computeStandings } from "../src/logic/standings.js";

describe("computeStandings", () => {
  const teams = [
    { id: "a", name: "Zebra" },
    { id: "b", name: "alpha" },
    { id: "c", name: "Beta" },
  ];

  it("computes played/W/D/L/GF/GA/points/GD from matches", () => {
    const standings = computeStandings(teams, [
      { teamAId: "a", teamBId: "b", scoreA: 3, scoreB: 1 },
      { teamAId: "b", teamBId: "c", scoreA: 2, scoreB: 2 },
    ]);

    const a = standings.find((s) => s.team.id === "a")!;
    expect(a).toMatchObject({ played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 3, goalsAgainst: 1, points: 3, goalDifference: 2 });

    const b = standings.find((s) => s.team.id === "b")!;
    expect(b).toMatchObject({ played: 2, wins: 0, draws: 1, losses: 1, goalsFor: 3, goalsAgainst: 5, points: 1, goalDifference: -2 });
  });

  it("sorts by points desc, then goal difference desc, then goals-for desc, then name asc case-insensitive", () => {
    const sameTeams = [
      { id: "a", name: "Team A" },
      { id: "b", name: "team B" },
      { id: "c", name: "Team C" },
    ];

    // Everyone tied on every stat -> falls through entirely to case-insensitive name.
    const tiedOnName = computeStandings(sameTeams, []);
    expect(tiedOnName.map((s) => s.team.id)).toEqual(["a", "b", "c"]);

    // b and c both have 1pt/GD 0, but c has more goals-for -> c ranks above b.
    const tiedOnGoalsFor = computeStandings(sameTeams, [
      { teamAId: "b", teamBId: "a", scoreA: 1, scoreB: 1 },
      { teamAId: "c", teamBId: "a", scoreA: 3, scoreB: 3 },
    ]);
    const order = tiedOnGoalsFor.map((s) => s.team.id);
    expect(order.indexOf("c")).toBeLessThan(order.indexOf("b"));
  });

  it("teams with no matches appear with all-zero stats", () => {
    const standings = computeStandings(teams, []);
    for (const s of standings) {
      expect(s).toMatchObject({ played: 0, wins: 0, draws: 0, losses: 0, points: 0, goalDifference: 0 });
    }
  });

  it("ignores matches referencing unknown teams instead of throwing", () => {
    const standings = computeStandings(teams, [
      { teamAId: "a", teamBId: "ghost", scoreA: 1, scoreB: 0 },
    ]);
    const a = standings.find((s) => s.team.id === "a")!;
    expect(a.played).toBe(0);
  });
});
