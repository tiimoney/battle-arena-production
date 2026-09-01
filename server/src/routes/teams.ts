import { Router } from "express";
import { prisma } from "../db.js";
import { requireAdmin, requireAuth } from "../auth/middleware.js";
import { notFound, validationError } from "../errors.js";
import {
  cleanName,
  normalizeMembers,
  normalizeName,
  validateRoster,
  type NormalizedTeamMember,
} from "../services/validation.js";
import { asyncHandler } from "./asyncHandler.js";
import type { EntryType, Team, TeamMember } from "@prisma/client";

export const teamsRouter = Router();

export function teamToJson(team: Team & { members: TeamMember[] }) {
  return {
    id: team.id,
    name: team.name,
    teamSize: team.teamSize,
    entryType: team.entryType,
    members: [...team.members]
      .sort((a, b) => a.position - b.position)
      .map((member) => ({ id: member.id, name: member.name, linkedUserId: member.linkedUserId })),
  };
}

async function checkLinkedMemberConflicts(members: NormalizedTeamMember[], currentTeamId: string | null) {
  for (const member of members) {
    if (!member.linkedUserId) continue;
    const conflict = await prisma.teamMember.findFirst({
      where: {
        linkedUserId: member.linkedUserId,
        ...(currentTeamId ? { teamId: { not: currentTeamId } } : {}),
      },
      include: { team: true },
    });
    if (conflict) {
      throw validationError(`${member.name} is already attached to ${conflict.team.name}.`);
    }
  }
}

teamsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const teams = await prisma.team.findMany({
      include: { members: true },
      orderBy: { nameNormalized: "asc" },
    });
    res.json(teams.map(teamToJson));
  }),
);

teamsRouter.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const name = cleanName(typeof req.body?.name === "string" ? req.body.name : "");
    const entryType: EntryType = req.body?.entryType === "individual" ? "individual" : "team";
    const rawMembers = Array.isArray(req.body?.members) ? req.body.members : [];

    if (!name) {
      throw validationError("Entry name is required.");
    }

    const nameNormalized = normalizeName(name);
    const nameConflict = await prisma.team.findUnique({ where: { nameNormalized } });
    if (nameConflict) {
      throw validationError("An entry with this name already exists.");
    }

    const members = normalizeMembers(rawMembers);
    validateRoster(entryType, members.length);
    await checkLinkedMemberConflicts(members, null);

    const team = await prisma.team.create({
      data: {
        name,
        nameNormalized,
        entryType,
        teamSize: members.length,
        members: {
          create: members.map((member, index) => ({
            name: member.name,
            linkedUserId: member.linkedUserId,
            position: index,
          })),
        },
      },
      include: { members: true },
    });

    res.status(201).json(teamToJson(team));
  }),
);

teamsRouter.put(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      throw notFound("Entry could not be found.");
    }

    const name = cleanName(typeof req.body?.name === "string" ? req.body.name : "");
    const entryType: EntryType = req.body?.entryType === "individual" ? "individual" : "team";
    const rawMembers = Array.isArray(req.body?.members) ? req.body.members : [];

    if (!name) {
      throw validationError("Entry name is required.");
    }

    const nameNormalized = normalizeName(name);
    const nameConflict = await prisma.team.findFirst({
      where: { nameNormalized, id: { not: existing.id } },
    });
    if (nameConflict) {
      throw validationError("An entry with this name already exists.");
    }

    const members = normalizeMembers(rawMembers);
    validateRoster(entryType, members.length);
    await checkLinkedMemberConflicts(members, existing.id);

    const team = await prisma.$transaction(async (tx) => {
      await tx.teamMember.deleteMany({ where: { teamId: existing.id } });
      return tx.team.update({
        where: { id: existing.id },
        data: {
          name,
          nameNormalized,
          entryType,
          teamSize: members.length,
          members: {
            create: members.map((member, index) => ({
              name: member.name,
              linkedUserId: member.linkedUserId,
              position: index,
            })),
          },
        },
        include: { members: true },
      });
    });

    res.json(teamToJson(team));
  }),
);

teamsRouter.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      throw notFound("Entry could not be found.");
    }

    // Fixtures/matches (both sides) and, through fixtures, pending score reports all
    // cascade at the DB layer -- see the onDelete: Cascade chain in schema.prisma.
    await prisma.team.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);
