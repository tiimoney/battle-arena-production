import { describe, expect, it } from "vitest";
import { buildMigrationPlan, type FirestoreDump } from "../src/transform.js";

function emptyDump(overrides: Partial<FirestoreDump> = {}): FirestoreDump {
  return {
    profiles: [],
    leagueState: { teams: [], fixtures: [], archivedSeasons: [] },
    approvedResults: [],
    scoreReports: [],
    ...overrides,
  };
}

describe("buildMigrationPlan", () => {
  it("carries profiles over as users with no team assignment when teamId is absent", () => {
    const plan = buildMigrationPlan(
      emptyDump({
        profiles: [{ id: "u1", email: "a@example.com", displayName: "Ada", role: "admin" }],
      }),
    );
    expect(plan.users).toEqual([{ id: "u1", email: "a@example.com", displayName: "Ada", role: "admin" }]);
    expect(plan.userTeamAssignments).toEqual([]);
    expect(plan.warnings).toEqual([]);
  });

  it("disambiguates colliding display names among migrated profiles and warns", () => {
    const plan = buildMigrationPlan(
      emptyDump({
        profiles: [
          { id: "u1", email: "a@example.com", displayName: "Sam", role: "admin" },
          { id: "u2", email: "b@example.com", displayName: "  Sam  ", role: "competitor" },
          { id: "u3", email: "c@example.com", displayName: "sam", role: "competitor" },
        ],
      }),
    );
    // Each profile keeps its own original casing; only the suffix disambiguates.
    expect(plan.users.map((u) => u.displayName)).toEqual(["Sam", "Sam (2)", "sam (3)"]);
    expect(plan.warnings).toHaveLength(2);
    expect(plan.warnings[0]).toContain('renamed to "Sam (2)"');
  });

  it("does not warn when display names only differ by whitespace across separate migrations of the same plan", () => {
    const plan = buildMigrationPlan(
      emptyDump({
        profiles: [{ id: "u1", email: "a@example.com", displayName: "  Ada   Lovelace ", role: "admin" }],
      }),
    );
    expect(plan.users[0].displayName).toBe("Ada Lovelace");
    expect(plan.warnings).toEqual([]);
  });

  it("applies a valid team assignment", () => {
    const plan = buildMigrationPlan(
      emptyDump({
        profiles: [{ id: "u1", email: "a@example.com", displayName: "Ada", role: "competitor", teamId: "t1" }],
        leagueState: {
          teams: [{ id: "t1", name: "Team A", teamSize: 1, entryType: "team", members: [] }],
          fixtures: [],
          archivedSeasons: [],
        },
      }),
    );
    expect(plan.userTeamAssignments).toEqual([{ userId: "u1", teamId: "t1" }]);
    expect(plan.warnings).toEqual([]);
  });

  it("warns and skips a team assignment pointing at a missing team", () => {
    const plan = buildMigrationPlan(
      emptyDump({
        profiles: [{ id: "u1", email: "a@example.com", displayName: "Ada", role: "competitor", teamId: "ghost" }],
      }),
    );
    expect(plan.userTeamAssignments).toEqual([]);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toContain("missing team ghost");
  });

  it("drops a dangling linkedUserId on a team member and warns", () => {
    const plan = buildMigrationPlan(
      emptyDump({
        leagueState: {
          teams: [
            {
              id: "t1",
              name: "Team A",
              teamSize: 1,
              entryType: "team",
              members: [{ id: "m1", name: "Sam", linkedUserId: "ghost" }],
            },
          ],
          fixtures: [],
          archivedSeasons: [],
        },
      }),
    );
    expect(plan.teams[0].members).toEqual([{ id: "m1", name: "Sam", linkedUserId: null }]);
    expect(plan.warnings[0]).toContain("missing profile ghost");
  });

  it("drops a fixture referencing a missing team", () => {
    const plan = buildMigrationPlan(
      emptyDump({
        leagueState: {
          teams: [{ id: "t1", name: "Team A", teamSize: 1, entryType: "team", members: [] }],
          fixtures: [{ id: "f1", round: 1, leg: 1, teamAId: "t1", teamBId: "ghost", date: "2026-01-01T00:00:00Z" }],
          archivedSeasons: [],
        },
      }),
    );
    expect(plan.fixtures).toEqual([]);
    expect(plan.warnings[0]).toContain("Fixture f1");
  });

  it("imports a match referencing a missing fixture as unlinked instead of dropping it", () => {
    const plan = buildMigrationPlan(
      emptyDump({
        leagueState: {
          teams: [
            { id: "a", name: "A", teamSize: 1, entryType: "team", members: [] },
            { id: "b", name: "B", teamSize: 1, entryType: "team", members: [] },
          ],
          fixtures: [],
          archivedSeasons: [],
        },
        approvedResults: [
          { id: "m1", teamAId: "a", teamBId: "b", scoreA: 2, scoreB: 1, date: "2026-01-01T00:00:00Z", fixtureId: "ghost" },
        ],
      }),
    );
    expect(plan.matches).toEqual([
      { id: "m1", teamAId: "a", teamBId: "b", scoreA: 2, scoreB: 1, date: "2026-01-01T00:00:00Z", fixtureId: null },
    ]);
    expect(plan.warnings[0]).toContain("importing as unlinked");
  });

  it("drops a match referencing a missing team entirely", () => {
    const plan = buildMigrationPlan(
      emptyDump({
        approvedResults: [
          { id: "m1", teamAId: "ghost-a", teamBId: "ghost-b", scoreA: 1, scoreB: 0, date: "2026-01-01T00:00:00Z" },
        ],
      }),
    );
    expect(plan.matches).toEqual([]);
  });

  it("drops a score report referencing a missing fixture or profile", () => {
    const plan = buildMigrationPlan(
      emptyDump({
        scoreReports: [
          {
            id: "r1",
            fixtureId: "ghost",
            teamAId: "a",
            teamBId: "b",
            reporterUserId: "u1",
            reporterTeamId: "a",
            teamAScore: 1,
            teamBScore: 0,
            reportedAt: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    );
    expect(plan.scoreReports).toEqual([]);
    expect(plan.warnings[0]).toContain("missing fixture ghost");
  });

  it("is a pure function: re-running on the same dump produces an identical plan", () => {
    const dump = emptyDump({
      profiles: [{ id: "u1", email: "a@example.com", displayName: "Ada", role: "admin", teamId: "t1" }],
      leagueState: {
        teams: [{ id: "t1", name: "Team A", teamSize: 1, entryType: "team", members: [] }],
        fixtures: [],
        archivedSeasons: [],
      },
    });
    expect(buildMigrationPlan(dump)).toEqual(buildMigrationPlan(dump));
  });
});
