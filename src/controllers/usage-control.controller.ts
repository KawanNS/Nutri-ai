import type { Response } from "express";

import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { getUsage, UsageControlError } from "../services/usage-control.service.js";

export async function getUsageController(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = request.auth?.userId;

  if (!userId) {
    response.status(401).json({ error: "Authentication is required" });
    return;
  }

  try {
    response.status(200).json({ usage: await getUsage(userId) });
  } catch (error: unknown) {
    if (error instanceof UsageControlError) {
      response.status(error.statusCode).json({
        error: error.message,
        code: error.code,
      });
      return;
    }

    response.status(500).json({ error: "Internal server error" });
  }
}
