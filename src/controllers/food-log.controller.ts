import type { Response } from "express";

import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { foodLogListQuerySchema, logPlanMealBodySchema, planMealsQuerySchema } from "../schemas/food-log.schema.js";
import { listFoodLogs } from "../services/food-log.service.js";
import { getPlanMealsForDate, logPlanMeal, PlanMealLogError } from "../services/plan-meal-log.service.js";

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

export async function getPlanMealsController(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = request.auth?.userId;
  if (!userId) {
    response.status(401).json({ error: "Authentication is required" });
    return;
  }
  const validation = planMealsQuerySchema.safeParse(request.query);
  if (!validation.success) {
    response.status(400).json({
      error: "Invalid food log query",
      code: "INVALID_FOOD_LOG_QUERY",
    });
    return;
  }
  try {
    response.status(200).json(await getPlanMealsForDate(userId, validation.data));
  } catch {
    response.status(500).json({ error: "Internal server error" });
  }
}

export async function logPlanMealController(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = request.auth?.userId;
  if (!userId) {
    response.status(401).json({ error: "Authentication is required" });
    return;
  }
  const validation = logPlanMealBodySchema.safeParse(request.body);
  if (!validation.success) {
    response.status(400).json({
      error: "Invalid plan meal log",
      code: "INVALID_PLAN_MEAL_LOG",
    });
    return;
  }
  try {
    response.status(201).json(await logPlanMeal(userId, validation.data));
  } catch (error: unknown) {
    if (error instanceof PlanMealLogError) {
      response.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }
    response.status(500).json({ error: "Internal server error" });
  }
}
