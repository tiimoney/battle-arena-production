import { describe, expect, it } from "vitest";
import {
  cleanName,
  normalizeMembers,
  normalizeName,
  validateMatchTeams,
  validateRoster,
  validateScores,
} from "../src/services/validation.js";

describe("cleanName / normalizeName", () => {
  it("trims and collapses internal whitespace", () => {
    expect(cleanName("  Team   Rocket  ")).toBe("Team Rocket");
  });

  it("normalizes for case-insensitive comparison", () => {
    expect(normalizeName("  Team   Rocket  ")).toBe("team rocket");
  });
});

describe("validateRoster", () => {
  it("rejects an empty roster", () => {
    expect(() => validateRoster("team", 0)).toThrow("Add at least one player to this entry.");
  });

  it("rejects an individual entry with more than one player", () => {
    expect(() => validateRoster("individual", 2)).toThrow(
      "An individual entry must contain exactly one player.",
    );
  });

  it("accepts a team entry with any positive roster size", () => {
    expect(() => validateRoster("team", 5)).not.toThrow();
  });

  it("accepts an individual entry with exactly one player", () => {
    expect(() => validateRoster("individual", 1)).not.toThrow();
  });
});

describe("validateMatchTeams / validateScores", () => {
  it("rejects identical teams", () => {
    expect(() => validateMatchTeams("a", "a")).toThrow("You must select two different entries.");
  });

  it("rejects negative scores", () => {
    expect(() => validateScores(-1, 0)).toThrow("Scores cannot be negative.");
    expect(() => validateScores(0, -1)).toThrow("Scores cannot be negative.");
  });

  it("accepts zero and positive scores", () => {
    expect(() => validateScores(0, 0)).not.toThrow();
  });
});

describe("normalizeMembers", () => {
  it("drops blank names and trims/collapses the rest", () => {
    const result = normalizeMembers([{ name: "  Ada   Lovelace " }, { name: "   " }]);
    expect(result).toEqual([{ name: "Ada Lovelace", linkedUserId: null }]);
  });

  it("dedupes unlinked members by case-insensitive name", () => {
    const result = normalizeMembers([{ name: "Sam" }, { name: "sam" }]);
    expect(result).toHaveLength(1);
  });

  it("dedupes linked members by linkedUserId, ignoring name", () => {
    const result = normalizeMembers([
      { name: "Sam", linkedUserId: "u1" },
      { name: "Samuel", linkedUserId: "u1" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Sam");
  });

  it("allows the same name to appear once linked and once unlinked", () => {
    const result = normalizeMembers([
      { name: "Sam", linkedUserId: "u1" },
      { name: "Sam" },
    ]);
    expect(result).toHaveLength(2);
  });
});
