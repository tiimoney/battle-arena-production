import { Router } from "express";
import { Prisma, type ArchivedSeason } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAdmin, requireAuth } from "../auth/middleware.js";
import { notFound, validationError } from "../errors.js";
import { cleanName, normalizeName } from "../services/validation.js";
import { relinkMatchesToFixtures } from "../services/fixtureLinking.js";
import type { StoredFixture, StoredMatch, StoredTeam } from "../services/leagueSnapshot.js";
import { teamToJson } from "./teams.js";
import { asyncHandler } from "./asyncHandler.js";

export const archivesRouter = Router();

function archiveToJson(archive: ArchivedSeason) {
  return {
    id: archive.id,
    name: archive.name,
    archivedAt: archive.archivedAt.toISOString(),
    teams: archive.teamsJson as unknown as StoredTeam[],
    fixtures: archive.fixturesJson as unknown as StoredFixture[],
    matches: archive.matchesJson as unknown as StoredMatch[],
  };
}

archivesRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const archives = await prisma.archivedSeason.findMany({ orderBy: { archivedAt: "desc" } });
    res.json(archives.map(archiveToJson));
  }),
);

archivesRouter.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const name = cleanName(typeof req.body?.name === "string" ? req.body.name : "");
    const clearCurrentSeason = req.body?.clearCurrentSeason !== false;
    if (!name) {
      throw validationError("Archive name is required.");
    }

    const [teams, fixtures, matches] = await Promise.all([
      prisma.team.findMany({ include: { members: true }, orderBy: { nameNormalized: "asc" } }),
      prisma.fixture.findMany(),
      prisma.matchResult.findMany(),
    ]);

    if (teams.length === 0 && fixtures.length === 0 && matches.length === 0) {
      throw validationError("There is no active season to archive.");
    }

    const teamsJson: StoredTeam[] = teams.map((team) => teamToJson(team) as StoredTeam);
    const fixturesJson: StoredFixture[] = fixtures.map((f) => ({
      id: f.id,
      round: f.round,
      leg: f.leg,
      teamAId: f.teamAId,
      teamBId: f.teamBId,
      date: f.date.toISOString(),
    }));
    const matchesJson: StoredMatch[] = matches.map((m) => ({
      id: m.id,
      teamAId: m.teamAId,
      teamBId: m.teamBId,
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      date: m.date.toISOString(),
      fixtureId: m.fixtureId,
    }));

    const archive = await prisma.archivedSeason.create({
      data: {
        name,
        teamsJson: teamsJson as unknown as Prisma.InputJsonValue,
        fixturesJson: fixturesJson as unknown as Prisma.InputJsonValue,
        matchesJson: matchesJson as unknown as Prisma.InputJsonValue,
      },
    });

    if (clearCurrentSeason) {
      // Cascades fixtures/matches/score-reports; any assigned User.teamId is set null.
      await prisma.team.deleteMany({});
    }

    res.status(201).json(archiveToJson(archive));
  }),
);

archivesRouter.post(
  "/:id/restore",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const archive = await prisma.archivedSeason.findUnique({ where: { id: req.params.id } });
    if (!archive) {
      throw notFound("Archived season could not be found.");
    }

    const teams = archive.teamsJson as unknown as StoredTeam[];
    const fixtures = archive.fixturesJson as unknown as StoredFixture[];
    const matches = archive.matchesJson as unknown as StoredMatch[];

    await prisma.$transaction(async (tx) => {
      await tx.team.deleteMany({});

      for (const team of teams) {
        await tx.team.create({
          data: {
            id: team.id,
            name: team.name,
            nameNormalized: normalizeName(team.name),
            teamSize: team.teamSize,
            entryType: team.entryType,
            members: {
              create: team.members.map((member, index) => ({
                id: member.id,
                name: member.name,
                linkedUserId: member.linkedUserId,
                position: index,
              })),
            },
          },
        });
      }

      for (const fixture of fixtures) {
        await tx.fixture.create({
          data: {
            id: fixture.id,
            round: fixture.round,
            leg: fixture.leg,
            teamAId: fixture.teamAId,
            teamBId: fixture.teamBId,
            date: new Date(fixture.date),
          },
        });
      }

      // Full relink pass across every match against every fixture (not incremental),
      // per the brief -- keeps stale/original fixtureId hints for tiebreak purposes,
      // exactly mirroring LeagueProvider._relinkMatchesToFixtures.
      const linking = relinkMatchesToFixtures({
        fixtures: fixtures.map((f) => ({ ...f, date: new Date(f.date) })),
        matches: matches.map((m) => ({ ...m, date: new Date(m.date) })),
      });

      for (const match of matches) {
        await tx.matchResult.create({
          data: {
            id: match.id,
            teamAId: match.teamAId,
            teamBId: match.teamBId,
            scoreA: match.scoreA,
            scoreB: match.scoreB,
            date: new Date(match.date),
            fixtureId: linking.get(match.id) ?? null,
          },
        });
      }
    });

    res.status(204).end();
  }),
);

archivesRouter.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const archive = await prisma.archivedSeason.findUnique({ where: { id: req.params.id } });
    if (!archive) {
      throw notFound("Archived season could not be found.");
    }
    await prisma.archivedSeason.delete({ where: { id: archive.id } });
    res.status(204).end();
  }),
);
