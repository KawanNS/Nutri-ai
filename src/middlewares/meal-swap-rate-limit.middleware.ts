import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "./auth.middleware.js";

interface Entry { count: number; resetAt: number }

interface Options {
  maximumSwaps?: number;
  windowMs?: number;
  now?: () => number;
}

export const MEAL_SWAP_RATE_LIMIT_MAXIMUM = 10;
export const MEAL_SWAP_RATE_LIMIT_WINDOW_MS = 10 * 60_000;

export function createMealSwapRateLimit(options: Options = {}) {
  const maximumSwaps = options.maximumSwaps ?? MEAL_SWAP_RATE_LIMIT_MAXIMUM;
  const windowMs = options.windowMs ?? MEAL_SWAP_RATE_LIMIT_WINDOW_MS;
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry>();

  return function mealSwapRateLimit(
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
      ? { count: 0, resetAt: timestamp + windowMs }
      : current;
    entry.count += 1;
    entries.set(userId, entry);
    if (entry.count > maximumSwaps) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1000));
      response.setHeader("Retry-After", String(retryAfterSeconds));
      response.status(429).json({
        error: "Too many meal swaps",
        code: "MEAL_SWAP_RATE_LIMIT_EXCEEDED",
        retryAfterSeconds,
      });
      return;
    }
    if (entries.size > 10_000) {
      for (const [storedUserId, storedEntry] of entries) {
        if (storedEntry.resetAt <= timestamp) entries.delete(storedUserId);
      }
    }
    next();
  };
}

export const mealSwapRateLimit = createMealSwapRateLimit();
