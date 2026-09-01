import type { NextFunction, Request, Response } from "express";
import type { User } from "@prisma/client";
import { prisma } from "../db.js";
import { unauthorized, forbidden } from "../errors.js";
import { sessionCookie, verifySession } from "./jwt.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentUser?: User;
    }
  }
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[sessionCookie.name];
  if (!token) {
    next();
    return;
  }

  const payload = verifySession(token);
  if (!payload) {
    next();
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (user) {
      req.currentUser = user;
    }
    next();
  } catch (error) {
    // A DB hiccup here shouldn't crash the whole process (an unhandled rejection in
    // an async middleware not wrapped by asyncHandler takes the server down) -- fail
    // as "not logged in" for this request and let the route layer's requireAuth
    // reject it normally.
    console.error("attachUser: failed to load session user", error);
    next();
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.currentUser) {
    next(unauthorized("You must be logged in to continue."));
    return;
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.currentUser) {
    next(unauthorized("You must be logged in to continue."));
    return;
  }
  if (req.currentUser.role !== "admin") {
    next(forbidden("Only the admin account can change league data."));
    return;
  }
  next();
}

export function toProfile(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    teamId: user.teamId,
  };
}
