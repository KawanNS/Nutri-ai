import type { NextFunction, Response } from "express";

import type { AuthenticatedRequest } from "./auth.middleware.js";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface AdminRateLimitOptions {
  maximumRequests?: number;
  windowMs?: number;
  now?: () => number;
}

export function createAdminRateLimit(options: AdminRateLimitOptions = {}) {
  const maximumRequests = options.maximumRequests ?? 120;
  const windowMs = options.windowMs ?? 60_000;
  const now = options.now ?? Date.now;
  const entries = new Map<string, RateLimitEntry>();

  return function adminRateLimit(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): void {
    const userId = request.auth?.userId;
    if (!userId) {
      response.status(401).json({
        error: "Authentication is required",
        code: "AUTHENTICATION_REQUIRED",
      });
      return;
    }

    const timestamp = now();
    const current = entries.get(userId);
    const entry =
      !current || current.resetAt <= timestamp
        ? { count: 0, resetAt: timestamp + windowMs }
        : current;

    entry.count += 1;
    entries.set(userId, entry);
    response.setHeader("RateLimit-Limit", String(maximumRequests));
    response.setHeader(
      "RateLimit-Remaining",
      String(Math.max(0, maximumRequests - entry.count)),
    );
    response.setHeader("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > maximumRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1000));
      response.setHeader("Retry-After", String(retryAfterSeconds));
      response.status(429).json({
        error: "Too many administrative requests",
        code: "ADMIN_RATE_LIMIT_EXCEEDED",
        retryAfterSeconds,
      });
      return;
    }

    if (entries.size > 10_000) {
      for (const [key, value] of entries) {
        if (value.resetAt <= timestamp) entries.delete(key);
      }
    }
    next();
  };
}

export const adminRateLimit = createAdminRateLimit();
