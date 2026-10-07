import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import {
  GoogleCredentialError,
  verifyGoogleCredential,
  type GoogleIdentity,
} from "./google-auth.service.js";

const PASSWORD_SALT_ROUNDS = 12;
const TOKEN_EXPIRATION = "1h";

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class AuthError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

interface LoginInput {
  email: string;
  password: string;
}

type GoogleCredentialVerifier = (credential: string) => Promise<GoogleIdentity>;

type PasswordComparer = (
  password: string,
  passwordHash: string,
) => Promise<boolean>;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function createSession(user: {
  id: string;
  name: string;
  email: string;
  status: "ACTIVE" | "BLOCKED";
  role: "USER" | "ADMIN";
  createdAt: Date;
  updatedAt: Date;
}) {
  if (user.status === "BLOCKED") {
    throw new AuthError(403, "User is blocked");
  }

  return {
    token: jwt.sign({ sub: user.id }, env.jwtSecret, { expiresIn: TOKEN_EXPIRATION }),
    expiresIn: TOKEN_EXPIRATION,
    user,
  };
}

export async function passwordMatches(
  password: string,
  passwordHash: string | null,
  compare: PasswordComparer = bcrypt.compare,
): Promise<boolean> {
  if (!passwordHash) return false;
  return compare(password, passwordHash);
}

export async function register(input: RegisterInput) {
  const email = normalizeEmail(input.email);

  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    throw new AuthError(409, "Email already registered");
  }

  const passwordHash = await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS);

  try {
    return await prisma.user.create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash,
        usageControl: {
          create: {},
        },
      },
      select: publicUserSelect,
    });
  } catch (error: unknown) {
    if (isUniqueConstraintError(error)) {
      throw new AuthError(409, "Email already registered");
    }

    throw error;
  }
}

export async function login(input: LoginInput) {
  const email = normalizeEmail(input.email);

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await passwordMatches(input.password, user.passwordHash))) {
    throw new AuthError(401, "Invalid email or password");
  }

  const { passwordHash: _passwordHash, ...publicUser } = user;
  return createSession(publicUser);
}

export async function loginWithGoogle(
  credential: string,
  verifyCredential: GoogleCredentialVerifier = verifyGoogleCredential,
) {
  let identity: GoogleIdentity;
  try {
    identity = await verifyCredential(credential);
  } catch (error: unknown) {
    if (error instanceof GoogleCredentialError && error.reason === "EMAIL_NOT_VERIFIED") {
      throw new AuthError(401, "Google authentication could not be completed", "GOOGLE_EMAIL_NOT_VERIFIED");
    }
    throw new AuthError(401, "Google authentication could not be completed", "GOOGLE_CREDENTIAL_INVALID");
  }

  const providerKey = { provider: "GOOGLE" as const, providerSubject: identity.subject };
  const existingIdentity = await prisma.authIdentity.findUnique({
    where: { provider_providerSubject: providerKey },
    select: { user: { select: publicUserSelect } },
  });
  if (existingIdentity) return createSession(existingIdentity.user);

  const existingEmail = await prisma.user.findUnique({
    where: { email: identity.email },
    select: { id: true },
  });
  if (existingEmail) {
    throw new AuthError(409, "An account already exists for this email", "LOCAL_ACCOUNT_EXISTS");
  }

  try {
    const user = await prisma.$transaction(async (transaction) => {
      const concurrentIdentity = await transaction.authIdentity.findUnique({
        where: { provider_providerSubject: providerKey },
        select: { user: { select: publicUserSelect } },
      });
      if (concurrentIdentity) return concurrentIdentity.user;

      const concurrentEmail = await transaction.user.findUnique({
        where: { email: identity.email },
        select: { id: true },
      });
      if (concurrentEmail) {
        throw new AuthError(409, "An account already exists for this email", "LOCAL_ACCOUNT_EXISTS");
      }

      return transaction.user.create({
        data: {
          name: identity.name,
          email: identity.email,
          passwordHash: null,
          usageControl: { create: {} },
          authIdentities: {
            create: { provider: "GOOGLE", providerSubject: identity.subject },
          },
        },
        select: publicUserSelect,
      });
    });

    return createSession(user);
  } catch (error: unknown) {
    if (error instanceof AuthError) throw error;
    if (isUniqueConstraintError(error)) {
      const concurrentIdentity = await prisma.authIdentity.findUnique({
        where: { provider_providerSubject: providerKey },
        select: { user: { select: publicUserSelect } },
      });
      if (concurrentIdentity) return createSession(concurrentIdentity.user);
      throw new AuthError(409, "An account already exists for this email", "LOCAL_ACCOUNT_EXISTS");
    }
    throw error;
  }
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect,
  });

  if (!user) {
    throw new AuthError(401, "Invalid authentication token");
  }

  return user;
}
