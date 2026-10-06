import type { NextFunction, Response } from "express";

import { getEffectiveSubscriptionAccess } from "../services/subscription.service.js";
import type { AuthenticatedRequest } from "./auth.middleware.js";

type PremiumAccessResolver = (
  userId: string,
) => Promise<{ isPremium: boolean }>;

export function createRequirePremium(
  getPremiumAccess: PremiumAccessResolver = getEffectiveSubscriptionAccess,
) {
  return async function requirePremiumAccess(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    const userId = request.auth?.userId;
    if (!userId) {
      response.status(401).json({ error: "Authentication is required" });
      return;
    }

    let isPremium: boolean;
    try {
      isPremium = (await getPremiumAccess(userId)).isPremium;
    } catch {
      response.status(500).json({ error: "Internal server error" });
      return;
    }

    if (!isPremium) {
      response.status(403).json({
        error: "Premium subscription is required",
        code: "PREMIUM_REQUIRED",
      });
      return;
    }
    next();
  };
}

export const requirePremium = createRequirePremium();
