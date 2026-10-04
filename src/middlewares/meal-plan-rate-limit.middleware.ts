import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "./auth.middleware.js";

interface Entry {
  idempotencyKeys: Set<string>;
  resetAt: number;
}

interface Options {
  maximumGenerations?: number;
  windowMs?: number;
  now?: () => number;
}

export const MEAL_PLAN_RATE_LIMIT_MAXIMUM = 3;
export const MEAL_PLAN_RATE_LIMIT_WINDOW_MS = 10 * 60_000;

export function createMealPlanRateLimit(options: Options = {}) {
  const maximumGenerations =
    options.maximumGenerations ?? MEAL_PLAN_RATE_LIMIT_MAXIMUM;
  const windowMs = options.windowMs ?? MEAL_PLAN_RATE_LIMIT_WINDOW_MS;
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry>();

  return function mealPlanRateLimit(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): void {
    const userId = request.auth?.userId;
    if (!userId) {
      response.status(401).json({ error: "Authentication is required" });
      return;
    }

    const timestamp = now();
    const current = entries.get(userId);
    const entry = !current || current.resetAt <= timestamp
      ? { idempotencyKeys: new Set<string>(), resetAt: timestamp + windowMs }
      : current;
    const idempotencyKey = request.get("Idempotency-Key")?.trim();
    const isKnownAttempt = Boolean(idempotencyKey && entry.idempotencyKeys.has(idempotencyKey));

    if (!isKnownAttempt && entry.idempotencyKeys.size >= maximumGenerations) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((entry.resetAt - timestamp) / 1000),
      );
      response.setHeader("RateLimit-Limit", String(maximumGenerations));
      response.setHeader("RateLimit-Remaining", "0");
      response.setHeader("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
      response.setHeader("Retry-After", String(retryAfterSeconds));
      response.status(429).json({
        error: "Too many meal plan generation attempts",
        code: "MEAL_PLAN_RATE_LIMIT_EXCEEDED",
        retryAfterSeconds,
      });
      return;
    }

    if (idempotencyKey && !isKnownAttempt) entry.idempotencyKeys.add(idempotencyKey);
    entries.set(userId, entry);
    response.setHeader("RateLimit-Limit", String(maximumGenerations));
    response.setHeader(
      "RateLimit-Remaining",
      String(Math.max(0, maximumGenerations - entry.idempotencyKeys.size)),
    );
    response.setHeader("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entries.size > 10_000) {
      for (const [storedUserId, storedEntry] of entries) {
        if (storedEntry.resetAt <= timestamp) entries.delete(storedUserId);
      }
    }
    next();
  };
}

export const mealPlanRateLimit = createMealPlanRateLimit();
