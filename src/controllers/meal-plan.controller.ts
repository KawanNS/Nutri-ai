import type { Response } from "express";

import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import {
  generateMealPlanBodySchema,
  mealPlanIdSchema,
  mealPlanListQuerySchema,
} from "../schemas/meal-plan.schema.js";
import {
  generateMealPlan,
  MealPlanGenerationError,
} from "../services/meal-plan-generation.service.js";
import {
  getMealPlan,
  listMealPlans,
  MealPlanError,
} from "../services/meal-plan.service.js";
import { OpenAIServiceError } from "../services/openai.service.js";
import { UsageControlError } from "../services/usage-control.service.js";
import { idempotencyKeySchema } from "../schemas/usage-control.schema.js";

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
  if (
    error instanceof MealPlanError ||
    error instanceof MealPlanGenerationError ||
    error instanceof OpenAIServiceError ||
    error instanceof UsageControlError
  ) {
    response.status(error.statusCode).json({
      error: error.message,
      code: error.code,
    });
    return;
  }

  response.status(500).json({ error: "Internal server error" });
}

export async function generateMealPlanController(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = getAuthenticatedUserId(request, response);

  if (!userId) {
    return;
  }

  const idempotencyKey = idempotencyKeySchema.safeParse(
    request.get("Idempotency-Key"),
  );

  if (!idempotencyKey.success) {
    response.status(400).json({
      error: idempotencyKey.error.issues[0]?.message ?? "Invalid Idempotency-Key",
      code: "INVALID_IDEMPOTENCY_KEY",
    });
    return;
  }

  const body = generateMealPlanBodySchema.safeParse(request.body ?? {});

  if (!body.success) {
    response.status(400).json({
      error: "Request body must be empty",
      code: "INVALID_GENERATION_BODY",
    });
    return;
  }

  try {
    const result = await generateMealPlan(userId, idempotencyKey.data);

    if (result.outcome === "PENDING") {
      response.status(202).json({
        status: "PENDING",
        operationId: result.operationId,
      });
      return;
    }

    response.status(result.outcome === "CREATED" ? 201 : 200).json({
      mealPlan: result.mealPlan,
      usage: result.usage,
    });
  } catch (error: unknown) {
    handleError(error, response);
  }
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
