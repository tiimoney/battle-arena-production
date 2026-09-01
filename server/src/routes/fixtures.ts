import { Router } from "express";
import { prisma } from "../db.js";
import { requireAdmin, requireAuth } from "../auth/middleware.js";
import { notFound, validationError } from "../errors.js";
import { generateRoundRobinFixtures } from "../services/fixtureGeneration.js";
import { asyncHandler } from "./asyncHandler.js";
import type { Fixture, MatchResult } from "@prisma/client";

export const fixturesRouter = Router();

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function fixtureToJson(fixture: Fixture & { match: MatchResult | null }) {
  return {
    id: fixture.id,
    round: fixture.round,
    leg: fixture.leg,
    teamAId: fixture.teamAId,
    teamBId: fixture.teamBId,
    date: fixture.date.toISOString(),
    match: fixture.match
      ? {
          id: fixture.match.id,
          scoreA: fixture.match.scoreA,
          scoreB: fixture.match.scoreB,
          date: fixture.match.date.toISOString(),
        }
      : null,
  };
}

fixturesRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const fixtures = await prisma.fixture.findMany({
      include: { match: true },
      orderBy: [{ round: "asc" }, { date: "asc" }, { id: "asc" }],
    });
    res.json(fixtures.map(fixtureToJson));
  }),
);

fixturesRouter.post(
  "/generate",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const rawStartDate = typeof req.body?.startDate === "string" ? new Date(req.body.startDate) : null;
    const daysBetweenRounds = Number(req.body?.daysBetweenRounds ?? 7);
    const isDoubleRoundRobin = Boolean(req.body?.isDoubleRoundRobin);

    const teams = await prisma.team.findMany({ orderBy: { nameNormalized: "asc" }, select: { id: true } });
    if (teams.length < 2) {
      throw validationError("Add at least two entries before generating fixtures.");
    }
    if (!rawStartDate || Number.isNaN(rawStartDate.getTime())) {
      throw validationError("Enter a valid start date.");
    }
    if (!Number.isFinite(daysBetweenRounds) || daysBetweenRounds <= 0) {
      throw validationError("Days between rounds must be greater than 0.");
    }

    const generated = generateRoundRobinFixtures({
      teams,
      startDate: rawStartDate,
      daysBetweenRounds,
      isDoubleRoundRobin,
    });

    await prisma.$transaction(async (tx) => {
      // Regenerating clears every fixture-linked match and all pending score reports;
      // unlinked (manually recorded) matches are left alone.
      await tx.matchResult.deleteMany({ where: { fixtureId: { not: null } } });
      await tx.fixture.deleteMany({});
      if (generated.length > 0) {
        await tx.fixture.createMany({ data: generated });
      }
    });

    res.status(201).json({ count: generated.length });
  }),
);

fixturesRouter.post(
  "/clear",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    // MatchResult.fixtureId is ON DELETE SET NULL, so recorded matches survive as
    // unlinked history; ScoreReport.fixtureId cascades, so pending reports go with it.
    await prisma.fixture.deleteMany({});
    res.status(204).end();
  }),
);

fixturesRouter.post(
  "/shift",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const days = Number(req.body?.days);
    if (!Number.isFinite(days) || days === 0) {
      throw validationError("Enter a number other than 0 to shift fixture dates.");
    }

    const fixtures = await prisma.fixture.findMany();
    if (fixtures.length === 0) {
      throw validationError("There are no fixtures to shift.");
    }

    await prisma.$transaction(
      fixtures.map((fixture) => {
        const shifted = new Date(startOfDay(fixture.date));
        shifted.setUTCDate(shifted.getUTCDate() + days);
        return prisma.fixture.update({ where: { id: fixture.id }, data: { date: shifted } });
      }),
    );

    res.status(204).end();
  }),
);

fixturesRouter.put(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const fixture = await prisma.fixture.findUnique({ where: { id: req.params.id }, include: { match: true } });
    if (!fixture) {
      throw notFound("Fixture could not be found.");
    }

    const round = Number(req.body?.round);
    const teamAId = typeof req.body?.teamAId === "string" ? req.body.teamAId : "";
    const teamBId = typeof req.body?.teamBId === "string" ? req.body.teamBId : "";
    const date = typeof req.body?.date === "string" ? new Date(req.body.date) : null;

    if (!Number.isFinite(round) || round <= 0) {
      throw validationError("Round must be greater than 0.");
    }
    if (teamAId === teamBId) {
      throw validationError("You must select two different entries.");
    }
    if (!date || Number.isNaN(date.getTime())) {
      throw validationError("Enter a valid fixture date.");
    }

    const [teamA, teamB] = await Promise.all([
      prisma.team.findUnique({ where: { id: teamAId } }),
      prisma.team.findUnique({ where: { id: teamBId } }),
    ]);
    if (!teamA || !teamB) {
      throw validationError("Both entries must exist before updating a fixture.");
    }

    if (fixture.match) {
      const stillSamePair =
        (fixture.match.teamAId === teamAId && fixture.match.teamBId === teamBId) ||
        (fixture.match.teamAId === teamBId && fixture.match.teamBId === teamAId);
      if (!stillSamePair) {
        throw validationError("Played fixtures cannot be changed to a different entry pairing.");
      }
    }

    const updated = await prisma.fixture.update({
      where: { id: fixture.id },
      data: { round, teamAId, teamBId, date: startOfDay(date) },
      include: { match: true },
    });

    res.json(fixtureToJson(updated));
  }),
);

fixturesRouter.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const deleteLinkedMatch = req.query.deleteLinkedMatch === "true";
    const fixture = await prisma.fixture.findUnique({ where: { id: req.params.id }, include: { match: true } });
    if (!fixture) {
      throw notFound("Fixture could not be found.");
    }

    if (fixture.match && deleteLinkedMatch) {
      await prisma.matchResult.delete({ where: { id: fixture.match.id } });
    }
    // If a match is linked and deleteLinkedMatch is false, deleting the fixture below
    // triggers ON DELETE SET NULL on MatchResult.fixtureId, keeping the match as an
    // unlinked record -- and cascades pending score reports for this fixture away.
    await prisma.fixture.delete({ where: { id: fixture.id } });

    res.status(204).end();
  }),
);
