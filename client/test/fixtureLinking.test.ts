import { describe, expect, it } from "vitest";
import {
  findBestFixtureForMatch,
  relinkMatchesToFixtures,
  resolveFixtureForRecordedMatch,
} from "../src/logic/fixtureLinking.js";

describe("findBestFixtureForMatch", () => {
  const fixtures = [
    { id: "f1", teamAId: "a", teamBId: "b", date: new Date("2026-01-01T00:00:00Z"), round: 1 },
    { id: "f2", teamAId: "b", teamBId: "a", date: new Date("2026-01-08T00:00:00Z"), round: 2 },
  ];

  it("picks the unlinked fixture closest in date first", () => {
    const best = findBestFixtureForMatch({
      fixtures,
      matches: [],
      teamAId: "a",
      teamBId: "b",
      date: new Date("2026-01-09T00:00:00Z"),
    });
    expect(best?.id).toBe("f2");
  });

  it("falls back to lowest round on a date-distance tie", () => {
    const equalDistanceFixtures = [
      { id: "f2", teamAId: "a", teamBId: "b", date: new Date("2026-01-05T00:00:00Z"), round: 3 },
      { id: "f1", teamAId: "a", teamBId: "b", date: new Date("2026-01-03T00:00:00Z"), round: 1 },
    ];
    // target date 2026-01-04 is 1 day from both
    const best = findBestFixtureForMatch({
      fixtures: equalDistanceFixtures,
      matches: [],
      teamAId: "a",
      teamBId: "b",
      date: new Date("2026-01-04T00:00:00Z"),
    });
    expect(best?.id).toBe("f1");
  });

  it("excludes fixtures already linked to a different match", () => {
    const best = findBestFixtureForMatch({
      fixtures,
      matches: [{ id: "m1", teamAId: "a", teamBId: "b", date: new Date(), fixtureId: "f1" }],
      teamAId: "a",
      teamBId: "b",
      date: new Date("2026-01-01T00:00:00Z"),
    });
    expect(best?.id).toBe("f2");
  });

  it("returns null when no unlinked fixture matches the team pairing", () => {
    const best = findBestFixtureForMatch({
      fixtures,
      matches: [],
      teamAId: "a",
      teamBId: "z",
      date: new Date("2026-01-01T00:00:00Z"),
    });
    expect(best).toBeNull();
  });
});

describe("resolveFixtureForRecordedMatch", () => {
  const fixtures = [{ id: "f1", teamAId: "a", teamBId: "b", date: new Date("2026-01-01T00:00:00Z"), round: 1 }];

  it("rejects an explicit fixture id that does not exist", () => {
    expect(() =>
      resolveFixtureForRecordedMatch({
        fixtures,
        matches: [],
        teamAId: "a",
        teamBId: "b",
        date: new Date(),
        explicitFixtureId: "missing",
      }),
    ).toThrow("Selected fixture no longer exists.");
  });

  it("rejects an explicit fixture already linked to another match", () => {
    expect(() =>
      resolveFixtureForRecordedMatch({
        fixtures,
        matches: [{ id: "m1", teamAId: "a", teamBId: "b", date: new Date(), fixtureId: "f1" }],
        teamAId: "a",
        teamBId: "b",
        date: new Date(),
        explicitFixtureId: "f1",
      }),
    ).toThrow("This fixture already has a recorded result.");
  });

  it("rejects an explicit fixture whose teams don't match the recorded teams", () => {
    expect(() =>
      resolveFixtureForRecordedMatch({
        fixtures,
        matches: [],
        teamAId: "a",
        teamBId: "z",
        date: new Date(),
        explicitFixtureId: "f1",
      }),
    ).toThrow("Recorded entries do not match the selected fixture.");
  });

  it("falls back to best-match search when no explicit fixture is given", () => {
    const resolved = resolveFixtureForRecordedMatch({
      fixtures,
      matches: [],
      teamAId: "a",
      teamBId: "b",
      date: new Date("2026-01-01T00:00:00Z"),
    });
    expect(resolved?.id).toBe("f1");
  });
});

describe("relinkMatchesToFixtures", () => {
  it("relinks every match against the freshest fixture set, oldest match first, without double-booking a fixture", () => {
    const fixtures = [
      { id: "f1", teamAId: "a", teamBId: "b", date: new Date("2026-01-01T00:00:00Z"), round: 1 },
      { id: "f2", teamAId: "a", teamBId: "b", date: new Date("2026-01-08T00:00:00Z"), round: 2 },
    ];
    const matches = [
      { id: "m2", teamAId: "a", teamBId: "b", date: new Date("2026-01-08T00:00:00Z"), fixtureId: null },
      { id: "m1", teamAId: "a", teamBId: "b", date: new Date("2026-01-01T00:00:00Z"), fixtureId: null },
    ];

    const links = relinkMatchesToFixtures({ fixtures, matches });
    expect(links.get("m1")).toBe("f1");
    expect(links.get("m2")).toBe("f2");
  });

  it("leaves a match unlinked when no fixture pairing matches", () => {
    const fixtures = [{ id: "f1", teamAId: "a", teamBId: "b", date: new Date("2026-01-01T00:00:00Z"), round: 1 }];
    const matches = [{ id: "m1", teamAId: "x", teamBId: "y", date: new Date("2026-01-01T00:00:00Z"), fixtureId: null }];

    const links = relinkMatchesToFixtures({ fixtures, matches });
    expect(links.get("m1")).toBeNull();
  });
});
