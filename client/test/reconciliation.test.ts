import { describe, expect, it } from "vitest";
import { findConsensus } from "../src/logic/reconciliation.js";

const report = (overrides: Partial<Parameters<typeof findConsensus>[0][number]>) => ({
  id: "r",
  teamAId: "a",
  teamBId: "b",
  reporterTeamId: "a",
  teamAScore: 2,
  teamBScore: 1,
  reportedAt: new Date(),
  ...overrides,
});

describe("findConsensus", () => {
  it("returns null with fewer than 2 reports", () => {
    expect(findConsensus([])).toBeNull();
    expect(findConsensus([report({})])).toBeNull();
  });

  it("returns null when both reports come from the same team", () => {
    const reports = [
      report({ id: "r1", reporterTeamId: "a", teamAScore: 2, teamBScore: 1 }),
      report({ id: "r2", reporterTeamId: "a", teamAScore: 2, teamBScore: 1 }),
    ];
    expect(findConsensus(reports)).toBeNull();
  });

  it("returns null when different-team reports disagree on the scoreline", () => {
    const reports = [
      report({ id: "r1", reporterTeamId: "a", teamAScore: 2, teamBScore: 1 }),
      report({ id: "r2", reporterTeamId: "b", teamAScore: 1, teamBScore: 1 }),
    ];
    expect(findConsensus(reports)).toBeNull();
  });

  it("auto-approves when two different teams agree on the same scoreline", () => {
    const reports = [
      report({ id: "r1", reporterTeamId: "a", teamAScore: 2, teamBScore: 1 }),
      report({ id: "r2", reporterTeamId: "b", teamAScore: 2, teamBScore: 1 }),
    ];
    expect(findConsensus(reports)).toEqual({ teamAId: "a", teamBId: "b", scoreA: 2, scoreB: 1 });
  });

  it("is idempotent: re-running on an already-resolved set of 2 keeps agreeing", () => {
    const reports = [
      report({ id: "r1", reporterTeamId: "a", teamAScore: 2, teamBScore: 1 }),
      report({ id: "r2", reporterTeamId: "b", teamAScore: 2, teamBScore: 1 }),
    ];
    expect(findConsensus(reports)).toEqual(findConsensus(reports));
  });

  it("finds consensus against the most recent report as baseline, among 3+ reports", () => {
    const older = new Date("2026-01-01T00:00:00Z");
    const newer = new Date("2026-01-02T00:00:00Z");
    const reports = [
      report({ id: "r1", reporterTeamId: "a", teamAScore: 3, teamBScore: 0, reportedAt: older }),
      report({ id: "r2", reporterTeamId: "b", teamAScore: 2, teamBScore: 1, reportedAt: newer }),
      report({ id: "r3", reporterTeamId: "a", teamAScore: 2, teamBScore: 1, reportedAt: newer }),
    ];
    expect(findConsensus(reports)).toEqual({ teamAId: "a", teamBId: "b", scoreA: 2, scoreB: 1 });
  });
});
