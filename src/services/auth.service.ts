import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

const PASSWORD_SALT_ROUNDS = 12;
const TOKEN_EXPIRATION = "1h";

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class AuthError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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
      },
      select: publicUserSelect,
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new AuthError(409, "Email already registered");
    }

    throw error;
  }
}

export async function login(input: LoginInput) {
  const email = normalizeEmail(input.email);

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new AuthError(401, "Invalid email or password");
  }

  if (user.status === "BLOCKED") {
    throw new AuthError(403, "User is blocked");
  }

  const token = jwt.sign({ sub: user.id }, env.jwtSecret, {
    expiresIn: TOKEN_EXPIRATION,
  });

  const { passwordHash: _passwordHash, ...publicUser } = user;

  return {
    token,
    expiresIn: TOKEN_EXPIRATION,
    user: publicUser,
  };
}
