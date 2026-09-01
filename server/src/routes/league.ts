import { Router } from "express";
import { prisma } from "../db.js";
import { requireAdmin } from "../auth/middleware.js";
import { validationError } from "../errors.js";
import { normalizeName } from "../services/validation.js";
import { relinkMatchesToFixtures } from "../services/fixtureLinking.js";
import { findConsensus } from "../services/reconciliation.js";
import type { LeagueSnapshot, StoredScoreReport, StoredTeam } from "../services/leagueSnapshot.js";
import { teamToJson } from "./teams.js";
import { asyncHandler } from "./asyncHandler.js";

export const leagueRouter = Router();

leagueRouter.get(
  "/export",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [teams, fixtures, matches, scoreReports, archivedSeasons] = await Promise.all([
      prisma.team.findMany({ include: { members: true }, orderBy: { nameNormalized: "asc" } }),
      prisma.fixture.findMany(),
      prisma.matchResult.findMany(),
      prisma.scoreReport.findMany(),
      prisma.archivedSeason.findMany({ orderBy: { archivedAt: "desc" } }),
    ]);

    res.json({
      teams: teams.map((t) => teamToJson(t)),
      fixtures: fixtures.map((f) => ({
        id: f.id,
        round: f.round,
        leg: f.leg,
        teamAId: f.teamAId,
        teamBId: f.teamBId,
        date: f.date.toISOString(),
      })),
      matches: matches.map((m) => ({
        id: m.id,
        teamAId: m.teamAId,
        teamBId: m.teamBId,
        scoreA: m.scoreA,
        scoreB: m.scoreB,
        date: m.date.toISOString(),
        fixtureId: m.fixtureId,
      })),
      scoreReports: scoreReports.map((r) => ({
        id: r.id,
        fixtureId: r.fixtureId,
        teamAId: r.teamAId,
        teamBId: r.teamBId,
        reporterUserId: r.reporterUserId,
        reporterTeamId: r.reporterTeamId,
        teamAScore: r.teamAScore,
        teamBScore: r.teamBScore,
        reportedAt: r.reportedAt.toISOString(),
      })),
      archivedSeasons: archivedSeasons.map((a) => ({
        id: a.id,
        name: a.name,
        archivedAt: a.archivedAt.toISOString(),
        teams: a.teamsJson,
        fixtures: a.fixturesJson,
        matches: a.matchesJson,
      })),
    });
  }),
);

function parseSnapshot(body: unknown): LeagueSnapshot & { archivedSeasons?: unknown[] } {
  if (typeof body !== "object" || body === null) {
    throw validationError("Imported data must be a JSON object.");
  }
  const data = body as Record<string, unknown>;
  const teams = data.teams;
  const fixtures = data.fixtures;
  const matches = data.matches;
  const scoreReports = data.scoreReports ?? [];
  if (!Array.isArray(teams) || !Array.isArray(fixtures) || !Array.isArray(matches)) {
    throw validationError("Imported data is missing required league fields.");
  }
  return {
    teams: teams as StoredTeam[],
    fixtures: fixtures as LeagueSnapshot["fixtures"],
    matches: matches as LeagueSnapshot["matches"],
    scoreReports: scoreReports as StoredScoreReport[],
    archivedSeasons: Array.isArray(data.archivedSeasons) ? data.archivedSeasons : [],
  };
}

// Import is merge/upsert-by-id by default: existing rows not mentioned in the
// payload are left untouched. ?mode=replace wipes the active season (and archives,
// if included) first -- the old app's only behavior, kept as an explicit danger-zone
// opt-in per the brief.
leagueRouter.post(
  "/import",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const mode = req.query.mode === "replace" ? "replace" : "merge";
    const snapshot = parseSnapshot(req.body);

    await prisma.$transaction(async (tx) => {
      if (mode === "replace") {
        await tx.team.deleteMany({});
        await tx.archivedSeason.deleteMany({});
      }

      for (const team of snapshot.teams) {
        await tx.team.upsert({
          where: { id: team.id },
          create: {
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
          update: {
            name: team.name,
            nameNormalized: normalizeName(team.name),
            teamSize: team.teamSize,
            entryType: team.entryType,
          },
        });

        await tx.teamMember.deleteMany({ where: { teamId: team.id } });
        if (team.members.length > 0) {
          await tx.teamMember.createMany({
            data: team.members.map((member, index) => ({
              id: member.id,
              teamId: team.id,
              name: member.name,
              linkedUserId: member.linkedUserId,
              position: index,
            })),
          });
        }
      }

      for (const fixture of snapshot.fixtures) {
        await tx.fixture.upsert({
          where: { id: fixture.id },
          create: {
            id: fixture.id,
            round: fixture.round,
            leg: fixture.leg,
            teamAId: fixture.teamAId,
            teamBId: fixture.teamBId,
            date: new Date(fixture.date),
          },
          update: {
            round: fixture.round,
            leg: fixture.leg,
            teamAId: fixture.teamAId,
            teamBId: fixture.teamBId,
            date: new Date(fixture.date),
          },
        });
      }

      // Full relink pass across every imported match against every current fixture,
      // per the brief -- not just an incremental link of the newly imported rows.
      const allFixtures = await tx.fixture.findMany();
      const linking = relinkMatchesToFixtures({
        fixtures: allFixtures,
        matches: snapshot.matches.map((m) => ({ ...m, date: new Date(m.date) })),
      });

      for (const match of snapshot.matches) {
        const fixtureId = linking.get(match.id) ?? null;
        await tx.matchResult.upsert({
          where: { id: match.id },
          create: {
            id: match.id,
            teamAId: match.teamAId,
            teamBId: match.teamBId,
            scoreA: match.scoreA,
            scoreB: match.scoreB,
            date: new Date(match.date),
            fixtureId,
          },
          update: {
            teamAId: match.teamAId,
            teamBId: match.teamBId,
            scoreA: match.scoreA,
            scoreB: match.scoreB,
            date: new Date(match.date),
            fixtureId,
          },
        });
      }

      const affectedFixtureIds = new Set<string>();
      for (const report of snapshot.scoreReports) {
        await tx.scoreReport.upsert({
          where: { fixtureId_reporterUserId: { fixtureId: report.fixtureId, reporterUserId: report.reporterUserId } },
          create: {
            id: report.id,
            fixtureId: report.fixtureId,
            teamAId: report.teamAId,
            teamBId: report.teamBId,
            reporterUserId: report.reporterUserId,
            reporterTeamId: report.reporterTeamId,
            teamAScore: report.teamAScore,
            teamBScore: report.teamBScore,
            reportedAt: new Date(report.reportedAt),
          },
          update: {
            teamAScore: report.teamAScore,
            teamBScore: report.teamBScore,
            reportedAt: new Date(report.reportedAt),
          },
        });
        affectedFixtureIds.add(report.fixtureId);
      }

      for (const fixtureId of affectedFixtureIds) {
        const reports = await tx.scoreReport.findMany({ where: { fixtureId } });
        const consensus = findConsensus(reports);
        if (!consensus) continue;

        const fixture = await tx.fixture.findUnique({ where: { id: fixtureId } });
        const existingMatch = await tx.matchResult.findUnique({ where: { fixtureId } });
        if (existingMatch) {
          await tx.matchResult.update({
            where: { id: existingMatch.id },
            data: consensus,
          });
        } else {
          await tx.matchResult.create({
            data: { ...consensus, date: fixture?.date ?? new Date(), fixtureId },
          });
        }
        await tx.scoreReport.deleteMany({ where: { fixtureId } });
      }

      for (const archived of snapshot.archivedSeasons ?? []) {
        const a = archived as { id: string; name: string; archivedAt: string; teams: unknown; fixtures: unknown; matches: unknown };
        if (!a?.id) continue;
        await tx.archivedSeason.upsert({
          where: { id: a.id },
          create: {
            id: a.id,
            name: a.name,
            archivedAt: new Date(a.archivedAt),
            teamsJson: a.teams as object,
            fixturesJson: a.fixtures as object,
            matchesJson: a.matches as object,
          },
          update: {
            name: a.name,
            teamsJson: a.teams as object,
            fixturesJson: a.fixtures as object,
            matchesJson: a.matches as object,
          },
        });
      }
    });

    res.status(204).end();
  }),
);

leagueRouter.post(
  "/reset",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    // Clears the active teams/fixtures/matches/score-reports but keeps archived
    // seasons, matching LeagueProvider.resetLeague.
    await prisma.team.deleteMany({});
    res.status(204).end();
  }),
);
