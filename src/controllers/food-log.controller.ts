import type { Response } from "express";

import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { foodLogListQuerySchema } from "../schemas/food-log.schema.js";
import { listFoodLogs } from "../services/food-log.service.js";

export async function listFoodLogsController(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = request.auth?.userId;
  if (!userId) {
    response.status(401).json({ error: "Authentication is required" });
    return;
  }
  const validation = foodLogListQuerySchema.safeParse(request.query);
  if (!validation.success) {
    response.status(400).json({
      error: "Invalid food log query",
      code: "INVALID_FOOD_LOG_QUERY",
    });
    return;
  }
  try {
    response.status(200).json(await listFoodLogs(userId, validation.data));
  } catch {
    response.status(500).json({ error: "Internal server error" });
  }
}
