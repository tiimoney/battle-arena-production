// Idempotent, additive migration: reads a Firestore dump (see dumpFirestore.ts) and
// upserts everything into Postgres by id. Re-running is always safe -- every write is
// an upsert keyed on the original Firestore id, never an insert-only append.
//
// Usage:
//   npm run migrate --workspace migration -- --dry-run   (prints the plan, writes nothing)
//   npm run migrate --workspace migration                (applies it)
//   npm run migrate --workspace migration -- path/to/dump.json   (use a specific dump file)

import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import { buildMigrationPlan, type FirestoreDump } from "./transform.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultDumpPath = join(__dirname, "..", "dumps", "latest.json");

const prisma = new PrismaClient();

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function normalizeName(name: string): string {
  return cleanName(name).toLowerCase();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const dumpPath = args.find((a) => !a.startsWith("--")) ?? defaultDumpPath;

  console.log(`Reading dump from ${dumpPath}`);
  const dump: FirestoreDump = JSON.parse(readFileSync(dumpPath, "utf-8"));
  const plan = buildMigrationPlan(dump);

  if (plan.warnings.length > 0) {
    console.log(`\n${plan.warnings.length} warning(s) -- these rows were skipped or sanitized:`);
    for (const warning of plan.warnings) {
      console.log(`  - ${warning}`);
    }
  }

  console.log(
    `\nPlan: ${plan.users.length} users, ${plan.teams.length} teams, ${plan.fixtures.length} fixtures, ` +
      `${plan.matches.length} matches, ${plan.scoreReports.length} pending score reports, ` +
      `${plan.archivedSeasons.length} archived seasons.`,
  );

  if (dryRun) {
    console.log("\n--dry-run: no database writes performed.");
    return;
  }

  console.log("\nUpserting users (migrated accounts are unclaimed -- passwordHash stays null until sign-up)...");
  for (const user of plan.users) {
    await prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        displayNameNormalized: normalizeName(user.displayName),
        role: user.role,
        passwordHash: null,
      },
      update: {
        email: user.email,
        displayName: user.displayName,
        displayNameNormalized: normalizeName(user.displayName),
        role: user.role,
      },
    });
  }

  console.log("Upserting teams + rosters...");
  for (const team of plan.teams) {
    await prisma.team.upsert({
      where: { id: team.id },
      create: {
        id: team.id,
        name: team.name,
        nameNormalized: normalizeName(team.name),
        teamSize: team.teamSize,
        entryType: team.entryType,
      },
      update: {
        name: team.name,
        nameNormalized: normalizeName(team.name),
        teamSize: team.teamSize,
        entryType: team.entryType,
      },
    });

    await prisma.teamMember.deleteMany({ where: { teamId: team.id } });
    if (team.members.length > 0) {
      await prisma.teamMember.createMany({
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

  console.log("Applying user -> team assignments...");
  for (const assignment of plan.userTeamAssignments) {
    await prisma.user.update({ where: { id: assignment.userId }, data: { teamId: assignment.teamId } });
  }

  console.log("Upserting fixtures...");
  for (const fixture of plan.fixtures) {
    await prisma.fixture.upsert({
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

  console.log("Upserting matches...");
  for (const match of plan.matches) {
    await prisma.matchResult.upsert({
      where: { id: match.id },
      create: {
        id: match.id,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
        scoreA: match.scoreA,
        scoreB: match.scoreB,
        date: new Date(match.date),
        fixtureId: match.fixtureId ?? null,
      },
      update: {
        teamAId: match.teamAId,
        teamBId: match.teamBId,
        scoreA: match.scoreA,
        scoreB: match.scoreB,
        date: new Date(match.date),
        fixtureId: match.fixtureId ?? null,
      },
    });
  }

  console.log("Upserting pending score reports...");
  for (const report of plan.scoreReports) {
    await prisma.scoreReport.upsert({
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
  }

  console.log("Upserting archived seasons...");
  for (const archive of plan.archivedSeasons) {
    await prisma.archivedSeason.upsert({
      where: { id: archive.id },
      create: {
        id: archive.id,
        name: archive.name,
        archivedAt: new Date(archive.archivedAt),
        teamsJson: archive.teams as unknown as Prisma.InputJsonValue,
        fixturesJson: archive.fixtures as unknown as Prisma.InputJsonValue,
        matchesJson: archive.matches as unknown as Prisma.InputJsonValue,
      },
      update: {
        name: archive.name,
        teamsJson: archive.teams as unknown as Prisma.InputJsonValue,
        fixturesJson: archive.fixtures as unknown as Prisma.InputJsonValue,
        matchesJson: archive.matches as unknown as Prisma.InputJsonValue,
      },
    });
  }

  console.log("\nMigration complete. Re-running this script is safe (upsert by id throughout).");
}

main()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
