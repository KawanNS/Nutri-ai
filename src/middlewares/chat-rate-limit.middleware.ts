import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "./auth.middleware.js";

interface Entry { count: number; resetAt: number }
const entries = new Map<string, Entry>();

export function chatRateLimit(
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): void {
  const userId = request.auth?.userId;
  if (!userId) {
    response.status(401).json({ error: "Authentication is required" });
    return;
  }
  const now = Date.now();
  const current = entries.get(userId);
  const entry = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + 60_000 }
    : current;
  entry.count += 1;
  entries.set(userId, entry);
  if (entry.count > 12) {
    response.setHeader("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
    response.status(429).json({ error: "Too many chat messages", code: "CHAT_RATE_LIMIT_EXCEEDED" });
    return;
  }
  next();
}
