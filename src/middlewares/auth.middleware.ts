import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    role: "USER" | "ADMIN";
  };
}

interface AuthenticationUserReader {
  findUnique(args: {
    where: { id: string };
    select: { status: true; role: true };
  }): Promise<{ status: "ACTIVE" | "BLOCKED"; role: "USER" | "ADMIN" } | null>;
}

interface AuthenticationDependencies {
  users: AuthenticationUserReader;
  verifyToken(token: string): string | JwtPayload;
}

export function findAuthenticationUser(
  userId: string,
  users: AuthenticationUserReader = prisma.user,
) {
  return users.findUnique({
    where: { id: userId },
    select: { status: true, role: true },
  });
}

export function createAuthenticate(
  dependencies: AuthenticationDependencies = {
    users: prisma.user,
    verifyToken: (token) => jwt.verify(token, env.jwtSecret),
  },
) {
  return async function authenticateRequest(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      response.status(401).json({ error: "Authentication token is required" });
      return;
    }

    const token = authorization.slice("Bearer ".length).trim();

    try {
      const payload = dependencies.verifyToken(token);

      if (typeof payload === "string" || typeof payload.sub !== "string") {
        response.status(401).json({ error: "Invalid authentication token" });
        return;
      }

      const user = await findAuthenticationUser(payload.sub, dependencies.users);

      if (!user) {
        response.status(401).json({ error: "Invalid authentication token" });
        return;
      }

      if (user.status === "BLOCKED") {
        response.status(403).json({ error: "User is blocked" });
        return;
      }

      request.auth = { userId: payload.sub, role: user.role };
      next();
    } catch {
      response.status(401).json({ error: "Invalid or expired authentication token" });
    }
  };
}

export const authenticate = createAuthenticate();

export function requireAdmin(
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): void {
  if (!request.auth) {
    response.status(401).json({ error: "Authentication is required" });
    return;
  }

  if (request.auth.role !== "ADMIN") {
    response.status(403).json({ error: "Administrator access is required" });
    return;
  }

  next();
}
