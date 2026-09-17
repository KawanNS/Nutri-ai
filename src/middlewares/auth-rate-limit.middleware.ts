import type { NextFunction, Request, Response } from "express";

interface Entry { count: number; resetAt: number }
interface Options { maximumRequests?: number; windowMs?: number; now?: () => number }

export function createAuthRateLimit(options: Options = {}) {
  const maximumRequests = options.maximumRequests ?? 20;
  const windowMs = options.windowMs ?? 15 * 60_000;
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry>();

  return function authRateLimit(request: Request, response: Response, next: NextFunction): void {
    const timestamp = now();
    const address = request.ip || request.socket.remoteAddress || "unknown";
    const key = `${address}:${request.path}`;
    const current = entries.get(key);
    const entry = !current || current.resetAt <= timestamp
      ? { count: 0, resetAt: timestamp + windowMs }
      : current;
    entry.count += 1;
    entries.set(key, entry);

    response.setHeader("RateLimit-Limit", String(maximumRequests));
    response.setHeader("RateLimit-Remaining", String(Math.max(0, maximumRequests - entry.count)));
    response.setHeader("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
    if (entry.count > maximumRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1000));
      response.setHeader("Retry-After", String(retryAfterSeconds));
      response.status(429).json({
        error: "Too many authentication attempts",
        code: "AUTH_RATE_LIMIT_EXCEEDED",
        retryAfterSeconds,
      });
      return;
    }

    if (entries.size > 10_000) {
      for (const [storedKey, value] of entries) if (value.resetAt <= timestamp) entries.delete(storedKey);
    }
    next();
  };
}

export const authRateLimit = createAuthRateLimit();
