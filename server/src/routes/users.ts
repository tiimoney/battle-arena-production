import { Router } from "express";
import { prisma } from "../db.js";
import { requireAdmin, toProfile } from "../auth/middleware.js";
import { notFound, validationError } from "../errors.js";
import { asyncHandler } from "./asyncHandler.js";

export const usersRouter = Router();

// Listing every profile is admin-only (the Firestore rules this replaces only let a
// non-admin read their own profile doc, not query the whole collection).
usersRouter.get(
  "/",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { displayName: "asc" } });
    res.json(users.map(toProfile));
  }),
);

usersRouter.post(
  "/:id/team",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const teamId = typeof req.body?.teamId === "string" ? req.body.teamId : null;
    if (!teamId) {
      throw validationError("Select an entry to assign.");
    }

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) {
      throw notFound("Profile could not be found.");
    }
    if (target.role !== "competitor") {
      throw validationError("Only competitor accounts can be assigned to league entries.");
    }

    const conflict = await prisma.user.findFirst({
      where: { teamId, id: { not: target.id } },
    });
    if (conflict) {
      throw validationError("That entry already has a competitor account assigned.");
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { teamId },
    });
    res.json(toProfile(updated));
  }),
);

usersRouter.delete(
  "/:id/team",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) {
      throw notFound("Profile could not be found.");
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { teamId: null },
    });
    res.json(toProfile(updated));
  }),
);
