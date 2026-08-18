import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
  };
}

export async function authenticate(
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
    const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;

    if (typeof payload.sub !== "string") {
      response.status(401).json({ error: "Invalid authentication token" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true },
    });

    if (!user) {
      response.status(401).json({ error: "Invalid authentication token" });
      return;
    }

    if (user.status === "BLOCKED") {
      response.status(403).json({ error: "User is blocked" });
      return;
    }

    request.auth = { userId: payload.sub };
    next();
  } catch {
    response.status(401).json({ error: "Invalid or expired authentication token" });
  }
}
