import { Router } from "express";
import { prisma } from "../db.js";
import { requireAdmin, requireAuth } from "../auth/middleware.js";
import { notFound, validationError } from "../errors.js";
import { resolveFixtureForRecordedMatch } from "../services/fixtureLinking.js";
import { validateMatchTeams, validateScores } from "../services/validation.js";
import { asyncHandler } from "./asyncHandler.js";
import type { MatchResult } from "@prisma/client";

export const matchesRouter = Router();

function matchToJson(match: MatchResult) {
  return {
    id: match.id,
    teamAId: match.teamAId,
    teamBId: match.teamBId,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    date: match.date.toISOString(),
    fixtureId: match.fixtureId,
  };
}

async function loadFixtureLinkingContext(ignoreMatchId?: string) {
  const [fixtures, matches] = await Promise.all([
    prisma.fixture.findMany(),
    prisma.matchResult.findMany(),
  ]);
  return {
    fixtures,
    matches: matches.filter((m) => m.id !== ignoreMatchId),
  };
}

function parseMatchBody(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const teamAId = typeof b.teamAId === "string" ? b.teamAId : "";
  const teamBId = typeof b.teamBId === "string" ? b.teamBId : "";
  const scoreA = Number(b.scoreA);
  const scoreB = Number(b.scoreB);
  const date = typeof b.date === "string" ? new Date(b.date) : null;
  const fixtureId = typeof b.fixtureId === "string" ? b.fixtureId : null;

  if (!teamAId || !teamBId) {
    throw validationError("Select Entry A and Entry B.");
  }
  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) {
    throw validationError("Enter a score.");
  }
  if (!date || Number.isNaN(date.getTime())) {
    throw validationError("Enter a valid match date.");
  }

  return { teamAId, teamBId, scoreA, scoreB, date, fixtureId };
}

matchesRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const matches = await prisma.matchResult.findMany({
      orderBy: [{ date: "desc" }, { id: "desc" }],
    });
    res.json(matches.map(matchToJson));
  }),
);

matchesRouter.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { teamAId, teamBId, scoreA, scoreB, date, fixtureId } = parseMatchBody(req.body);
    validateMatchTeams(teamAId, teamBId);
    validateScores(scoreA, scoreB);

    const [teamA, teamB] = await Promise.all([
      prisma.team.findUnique({ where: { id: teamAId } }),
      prisma.team.findUnique({ where: { id: teamBId } }),
    ]);
    if (!teamA || !teamB) {
      throw validationError("Both entries must exist before recording a match.");
    }

    const { fixtures, matches } = await loadFixtureLinkingContext();
    const linkedFixture = resolveFixtureForRecordedMatch({
      fixtures,
      matches,
      teamAId,
      teamBId,
      date,
      explicitFixtureId: fixtureId,
    });

    const match = await prisma.$transaction(async (tx) => {
      const created = await tx.matchResult.create({
        data: { teamAId, teamBId, scoreA, scoreB, date, fixtureId: linkedFixture?.id ?? null },
      });
      if (linkedFixture) {
        await tx.scoreReport.deleteMany({ where: { fixtureId: linkedFixture.id } });
      }
      return created;
    });

    res.status(201).json(matchToJson(match));
  }),
);

matchesRouter.put(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const current = await prisma.matchResult.findUnique({ where: { id: req.params.id } });
    if (!current) {
      throw notFound("Match could not be found.");
    }

    const { teamAId, teamBId, scoreA, scoreB, date, fixtureId } = parseMatchBody(req.body);
    validateMatchTeams(teamAId, teamBId);
    validateScores(scoreA, scoreB);

    const [teamA, teamB] = await Promise.all([
      prisma.team.findUnique({ where: { id: teamAId } }),
      prisma.team.findUnique({ where: { id: teamBId } }),
    ]);
    if (!teamA || !teamB) {
      throw validationError("Both entries must exist before recording a match.");
    }

    const { fixtures, matches } = await loadFixtureLinkingContext(current.id);
    const linkedFixture = resolveFixtureForRecordedMatch({
      fixtures,
      matches,
      teamAId,
      teamBId,
      date,
      explicitFixtureId: fixtureId ?? current.fixtureId,
      ignoreMatchId: current.id,
    });

    const clearFixtureIds = new Set<string>();
    if (current.fixtureId) clearFixtureIds.add(current.fixtureId);
    if (linkedFixture) clearFixtureIds.add(linkedFixture.id);

    const match = await prisma.$transaction(async (tx) => {
      const updated = await tx.matchResult.update({
        where: { id: current.id },
        data: { teamAId, teamBId, scoreA, scoreB, date, fixtureId: linkedFixture?.id ?? null },
      });
      if (clearFixtureIds.size > 0) {
        await tx.scoreReport.deleteMany({ where: { fixtureId: { in: [...clearFixtureIds] } } });
      }
      return updated;
    });

    res.json(matchToJson(match));
  }),
);

matchesRouter.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.matchResult.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      throw notFound("Match could not be found.");
    }
    await prisma.matchResult.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);
