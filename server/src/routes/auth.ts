import { randomBytes } from "node:crypto";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { sessionCookie, signSession } from "../auth/jwt.js";
import { requireAuth, toProfile } from "../auth/middleware.js";
import { validationError, unauthorized } from "../errors.js";
import { sendVerificationEmail } from "../email.js";
import { CLIENT_ORIGIN, PUBLIC_URL } from "../config.js";
import { cleanName, normalizeName } from "../services/validation.js";
import { asyncHandler } from "./asyncHandler.js";

export const authRouter = Router();

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function validateDisplayName(name: unknown): string {
  const trimmed = cleanName(typeof name === "string" ? name : "");
  if (!trimmed) {
    throw validationError("Enter your name.");
  }
  return trimmed;
}

function validateEmail(email: unknown): string {
  const trimmed = typeof email === "string" ? email.trim() : "";
  if (!trimmed || !trimmed.includes("@")) {
    throw validationError("Enter a valid email.");
  }
  return trimmed.toLowerCase();
}

function validateIdentifier(value: unknown): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    throw validationError("Enter your email or display name.");
  }
  return trimmed;
}

function validatePassword(password: unknown): string {
  const value = typeof password === "string" ? password : "";
  if (value.trim().length < 6) {
    throw validationError("Use at least 6 characters.");
  }
  return value;
}

function issueSession(res: import("express").Response, userId: string) {
  const token = signSession({ userId });
  res.cookie(sessionCookie.name, token, sessionCookie.options);
}

function newVerificationToken() {
  return {
    verificationToken: randomBytes(32).toString("hex"),
    verificationTokenExpiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
  };
}

async function issueAndSendVerificationEmail(userId: string, email: string) {
  const { verificationToken, verificationTokenExpiresAt } = newVerificationToken();
  await prisma.user.update({
    where: { id: userId },
    data: { verificationToken, verificationTokenExpiresAt },
  });

  const verifyUrl = `${PUBLIC_URL}/auth/verify-email?token=${verificationToken}`;
  await sendVerificationEmail(email, verifyUrl);
}

// Translates a unique-constraint race (two signups landing on the same email/display
// name at once, slipping past the pre-checks below) into the same friendly message
// the pre-check would have thrown.
function rethrowAsFriendlyConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = Array.isArray(error.meta?.target) ? (error.meta!.target as string[]) : [];
    if (target.includes("email")) {
      throw validationError("An account with this email already exists.");
    }
    if (target.includes("displayNameNormalized")) {
      throw validationError("That display name is already taken.");
    }
  }
  throw error;
}

async function assertDisplayNameAvailable(displayName: string, excludeUserId?: string) {
  const conflict = await prisma.user.findFirst({
    where: {
      displayNameNormalized: normalizeName(displayName),
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
  if (conflict) {
    throw validationError("That display name is already taken.");
  }
}

// Sign-up "claims" an existing unclaimed profile (passwordHash === null) instead of
// creating a fresh row when the email matches one — this is how a returning
// admin/competitor from the migrated Firestore data regains access without ever
// having their old password. See migration/README.md. A claimed account is trusted
// immediately (emailVerified: true, session issued right away) since that email
// already belonged to a real account in the old system. A brand-new account must
// verify its email before it can log in — see /verify-email below.
//
// Display names double as a login identifier (see /login), so they must be globally
// unique, same as email.
authRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const displayName = validateDisplayName(req.body?.displayName);
    const email = validateEmail(req.body?.email);
    const password = validatePassword(req.body?.password);
    const passwordHash = await hashPassword(password);

    const existing = await prisma.user.findUnique({ where: { email } });

    try {
      if (existing) {
        if (existing.passwordHash) {
          throw validationError("An account with this email already exists.");
        }
        await assertDisplayNameAvailable(displayName, existing.id);
        const user = await prisma.user.update({
          where: { id: existing.id },
          data: { passwordHash, displayName, displayNameNormalized: normalizeName(displayName), emailVerified: true },
        });
        issueSession(res, user.id);
        res.status(201).json({ status: "signed_in", profile: toProfile(user) });
        return;
      }

      await assertDisplayNameAvailable(displayName);
      const adminCount = await prisma.user.count({ where: { role: "admin" } });
      const user = await prisma.user.create({
        data: {
          email,
          displayName,
          displayNameNormalized: normalizeName(displayName),
          passwordHash,
          role: adminCount === 0 ? "admin" : "competitor",
          emailVerified: false,
        },
      });

      await issueAndSendVerificationEmail(user.id, user.email);
      res.status(201).json({ status: "verify_email", email: user.email });
    } catch (error) {
      rethrowAsFriendlyConflict(error);
    }
  }),
);

// Login accepts either the account's email or its (unique) display name.
authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const identifier = validateIdentifier(req.body?.identifier ?? req.body?.email);
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier.toLowerCase() }, { displayNameNormalized: normalizeName(identifier) }],
      },
    });

    if (!user || !user.passwordHash) {
      throw unauthorized(
        user && !user.passwordHash
          ? "Create an account with this email to finish setup."
          : "Invalid email/display name or password.",
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw unauthorized("Invalid email/display name or password.");
    }

    if (!user.emailVerified) {
      throw unauthorized("Please verify your email before signing in. Check your inbox, or request a new link.");
    }

    issueSession(res, user.id);
    res.json(toProfile(user));
  }),
);

authRouter.post(
  "/resend-verification",
  asyncHandler(async (req, res) => {
    const identifier = validateIdentifier(req.body?.identifier ?? req.body?.email);
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier.toLowerCase() }, { displayNameNormalized: normalizeName(identifier) }],
      },
    });

    // Always respond the same way whether or not an account exists, so this can't be
    // used to probe for registered emails/display names.
    if (user && user.passwordHash && !user.emailVerified) {
      await issueAndSendVerificationEmail(user.id, user.email);
    }

    res.json({ message: "If that account has a pending verification, we've sent a new link." });
  }),
);

authRouter.get(
  "/verify-email",
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";

    const user = token ? await prisma.user.findUnique({ where: { verificationToken: token } }) : null;
    const expired = user?.verificationTokenExpiresAt ? user.verificationTokenExpiresAt < new Date() : true;

    if (!user || expired) {
      res.redirect(`${CLIENT_ORIGIN}/?emailVerifyError=1`);
      return;
    }

    const verified = await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationToken: null, verificationTokenExpiresAt: null },
    });

    issueSession(res, verified.id);
    res.redirect(`${CLIENT_ORIGIN}/?emailVerified=1`);
  }),
);

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(sessionCookie.name, { path: sessionCookie.options.path });
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(toProfile(req.currentUser!));
});
