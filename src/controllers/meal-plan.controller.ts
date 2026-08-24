import type { Response } from "express";

import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import {
  mealPlanIdSchema,
  mealPlanListQuerySchema,
} from "../schemas/meal-plan.schema.js";
import {
  getMealPlan,
  listMealPlans,
  MealPlanError,
} from "../services/meal-plan.service.js";

function getAuthenticatedUserId(
  request: AuthenticatedRequest,
  response: Response,
): string | undefined {
  const userId = request.auth?.userId;

  if (!userId) {
    response.status(401).json({ error: "Authentication is required" });
    return undefined;
  }

  return userId;
}

function handleError(error: unknown, response: Response): void {
  if (error instanceof MealPlanError) {
    response.status(error.statusCode).json({
      error: error.message,
      code: error.code,
    });
    return;
  }

  response.status(500).json({ error: "Internal server error" });
}

export async function listMealPlansController(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = getAuthenticatedUserId(request, response);

  if (!userId) {
    return;
  }

  const validation = mealPlanListQuerySchema.safeParse(request.query);

  if (!validation.success) {
    response.status(400).json({
      error: "Invalid pagination parameters",
      details: validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  try {
    response.status(200).json(await listMealPlans(userId, validation.data));
  } catch (error: unknown) {
    handleError(error, response);
  }
}

export async function getMealPlanController(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = getAuthenticatedUserId(request, response);

  if (!userId) {
    return;
  }

  const validation = mealPlanIdSchema.safeParse(request.params.id);

  if (!validation.success) {
    response.status(400).json({ error: "Invalid meal plan id" });
    return;
  }

  try {
    response.status(200).json({
      mealPlan: await getMealPlan(userId, validation.data),
    });
  } catch (error: unknown) {
    handleError(error, response);
  }
}
