import { Router } from "express";
import type { Prisma, ScoreReport } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAdmin, requireAuth } from "../auth/middleware.js";
import { forbidden, notFound, validationError } from "../errors.js";
import { findConsensus } from "../services/reconciliation.js";
import { validateScores } from "../services/validation.js";
import { asyncHandler } from "./asyncHandler.js";

export const scoreReportsRouter = Router();

function reportToJson(report: ScoreReport) {
  return {
    id: report.id,
    fixtureId: report.fixtureId,
    teamAId: report.teamAId,
    teamBId: report.teamBId,
    reporterUserId: report.reporterUserId,
    reporterTeamId: report.reporterTeamId,
    teamAScore: report.teamAScore,
    teamBScore: report.teamBScore,
    reportedAt: report.reportedAt.toISOString(),
  };
}

// Shared by "submit report" (consensus-driven) and re-run safely any time -- checks
// every pending report for a fixture and auto-approves on cross-team agreement.
async function reconcileFixtureReports(tx: Prisma.TransactionClient, fixtureId: string) {
  const reports = await tx.scoreReport.findMany({ where: { fixtureId } });
  const consensus = findConsensus(reports);
  if (!consensus) {
    return false;
  }

  const fixture = await tx.fixture.findUnique({ where: { id: fixtureId } });
  const existingMatch = await tx.matchResult.findUnique({ where: { fixtureId } });

  if (existingMatch) {
    await tx.matchResult.update({
      where: { id: existingMatch.id },
      data: { teamAId: consensus.teamAId, teamBId: consensus.teamBId, scoreA: consensus.scoreA, scoreB: consensus.scoreB },
    });
  } else {
    await tx.matchResult.create({
      data: {
        teamAId: consensus.teamAId,
        teamBId: consensus.teamBId,
        scoreA: consensus.scoreA,
        scoreB: consensus.scoreB,
        date: fixture?.date ?? new Date(),
        fixtureId,
      },
    });
  }

  await tx.scoreReport.deleteMany({ where: { fixtureId } });
  return true;
}

scoreReportsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const fixtureId = typeof req.query.fixtureId === "string" ? req.query.fixtureId : undefined;
    const reports = await prisma.scoreReport.findMany({
      where: fixtureId ? { fixtureId } : undefined,
      orderBy: { reportedAt: "desc" },
    });
    res.json(reports.map(reportToJson));
  }),
);

scoreReportsRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.currentUser!;
    if (user.role !== "competitor" || !user.teamId) {
      throw validationError("Only competitors with an assigned entry can report scores.");
    }

    const fixtureId = typeof req.body?.fixtureId === "string" ? req.body.fixtureId : "";
    const scoreA = Number(req.body?.scoreA);
    const scoreB = Number(req.body?.scoreB);
    if (!fixtureId) {
      throw validationError("Fixture could not be found.");
    }
    validateScores(scoreA, scoreB);

    const fixture = await prisma.fixture.findUnique({ where: { id: fixtureId }, include: { match: true } });
    if (!fixture) {
      throw notFound("Fixture could not be found.");
    }

    const isParticipant = fixture.teamAId === user.teamId || fixture.teamBId === user.teamId;
    if (!isParticipant || fixture.match) {
      throw validationError("You can only report scores for your own unplayed fixtures.");
    }

    const result = await prisma.$transaction(async (tx) => {
      const report = await tx.scoreReport.upsert({
        where: { fixtureId_reporterUserId: { fixtureId, reporterUserId: user.id } },
        create: {
          fixtureId,
          teamAId: fixture.teamAId,
          teamBId: fixture.teamBId,
          reporterUserId: user.id,
          reporterTeamId: user.teamId!,
          teamAScore: scoreA,
          teamBScore: scoreB,
        },
        update: { teamAScore: scoreA, teamBScore: scoreB, reportedAt: new Date() },
      });

      const approved = await reconcileFixtureReports(tx, fixtureId);
      return { report, approved };
    });

    res.status(201).json({ report: reportToJson(result.report), approved: result.approved });
  }),
);

scoreReportsRouter.post(
  "/:id/approve",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const report = await prisma.scoreReport.findUnique({ where: { id: req.params.id } });
    if (!report) {
      throw notFound("Score report could not be found.");
    }

    await prisma.$transaction(async (tx) => {
      const fixture = await tx.fixture.findUnique({ where: { id: report.fixtureId } });
      const existingMatch = await tx.matchResult.findUnique({ where: { fixtureId: report.fixtureId } });

      if (existingMatch) {
        await tx.matchResult.update({
          where: { id: existingMatch.id },
          data: { teamAId: report.teamAId, teamBId: report.teamBId, scoreA: report.teamAScore, scoreB: report.teamBScore },
        });
      } else {
        await tx.matchResult.create({
          data: {
            teamAId: report.teamAId,
            teamBId: report.teamBId,
            scoreA: report.teamAScore,
            scoreB: report.teamBScore,
            date: fixture?.date ?? report.reportedAt,
            fixtureId: report.fixtureId,
          },
        });
      }

      await tx.scoreReport.deleteMany({ where: { fixtureId: report.fixtureId } });
    });

    res.status(204).end();
  }),
);

scoreReportsRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const report = await prisma.scoreReport.findUnique({ where: { id: req.params.id } });
    if (!report) {
      throw notFound("Score report could not be found.");
    }

    const user = req.currentUser!;
    const canDelete = user.role === "admin" || report.reporterUserId === user.id;
    if (!canDelete) {
      throw forbidden("You are not allowed to remove this score report.");
    }

    await prisma.scoreReport.delete({ where: { id: report.id } });
    res.status(204).end();
  }),
);
