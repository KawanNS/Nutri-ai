import type { NextFunction, Request, Response } from "express";

interface Entry { count: number; resetAt: number }

interface Options {
  maximumPerVisitor?: number;
  maximumOverall?: number;
  windowMs?: number;
  now?: () => number;
}

export const PLAN_PREVIEW_MAX_PER_VISITOR = 5;
export const PLAN_PREVIEW_MAX_OVERALL = 120;
export const PLAN_PREVIEW_WINDOW_MS = 60 * 60_000;

/**
 * The preview runs the AI for anonymous visitors, so it has two caps per hour: one per address and one
 * for everyone together, which bounds the AI cost even if addresses are rotated.
 */
export function createPlanPreviewRateLimit(options: Options = {}) {
  const maximumPerVisitor = options.maximumPerVisitor ?? PLAN_PREVIEW_MAX_PER_VISITOR;
  const maximumOverall = options.maximumOverall ?? PLAN_PREVIEW_MAX_OVERALL;
  const windowMs = options.windowMs ?? PLAN_PREVIEW_WINDOW_MS;
  const now = options.now ?? Date.now;
  const visitors = new Map<string, Entry>();
  let overall: Entry = { count: 0, resetAt: 0 };

  const bump = (entry: Entry | undefined, timestamp: number): Entry => {
    const next = !entry || entry.resetAt <= timestamp ? { count: 0, resetAt: timestamp + windowMs } : entry;
    next.count += 1;
    return next;
  };

  const reject = (response: Response, entry: Entry, timestamp: number, code: string) => {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1000));
    response.setHeader("Retry-After", String(retryAfterSeconds));
    response.status(429).json({ error: "Too many plan previews", code, retryAfterSeconds });
  };

  return function planPreviewRateLimit(request: Request, response: Response, next: NextFunction): void {
    const timestamp = now();
    const address = request.ip || request.socket.remoteAddress || "unknown";
    const visitor = bump(visitors.get(address), timestamp);
    visitors.set(address, visitor);
    if (visitor.count > maximumPerVisitor) {
      reject(response, visitor, timestamp, "PLAN_PREVIEW_RATE_LIMIT_EXCEEDED");
      return;
    }
    overall = bump(overall, timestamp);
    if (overall.count > maximumOverall) {
      reject(response, overall, timestamp, "PLAN_PREVIEW_BUSY");
      return;
    }
    if (visitors.size > 10_000) {
      for (const [key, entry] of visitors) if (entry.resetAt <= timestamp) visitors.delete(key);
    }
    next();
  };
}

export const planPreviewRateLimit = createPlanPreviewRateLimit();
