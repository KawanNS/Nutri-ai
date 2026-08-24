import { MEAL_PLAN_PROMPT_VERSION } from "../prompts/meal-plan.prompt.js";
import {
  getMealPlanByUsageEvent,
  getMealPlanGenerationState,
  persistMealPlanAndConfirmUsage,
  prepareMealPlanGeneration,
} from "./meal-plan.service.js";
import { generateMealPlanWithAI } from "./openai.service.js";
import { failUsage, reserveUsage } from "./usage-control.service.js";

export class MealPlanGenerationError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface GenerationDependencies {
  prepare: typeof prepareMealPlanGeneration;
  reserve: typeof reserveUsage;
  generate: typeof generateMealPlanWithAI;
  persist: typeof persistMealPlanAndConfirmUsage;
  findExisting: typeof getMealPlanByUsageEvent;
  getState: typeof getMealPlanGenerationState;
  fail: typeof failUsage;
}

const defaultDependencies: GenerationDependencies = {
  prepare: prepareMealPlanGeneration,
  reserve: reserveUsage,
  generate: generateMealPlanWithAI,
  persist: persistMealPlanAndConfirmUsage,
  findExisting: getMealPlanByUsageEvent,
  getState: getMealPlanGenerationState,
  fail: failUsage,
};

async function failReservationIfPending(
  userId: string,
  usageEventId: string,
  dependencies: GenerationDependencies,
): Promise<void> {
  const state = await dependencies.getState(userId, usageEventId);

  if (state?.status === "PENDING" && !state.mealPlan) {
    await dependencies.fail(userId, usageEventId);
  }
}

export async function generateMealPlan(
  userId: string,
  idempotencyKey: string,
  dependencies: GenerationDependencies = defaultDependencies,
) {
  const context = await dependencies.prepare(userId);
  const reservation = await dependencies.reserve(
    userId,
    "PLAN_GENERATION",
    idempotencyKey,
  );

  if (!reservation.reservationCreated) {
    if (reservation.event.status === "CONSUMED") {
      return {
        outcome: "EXISTING" as const,
        ...(await dependencies.findExisting(userId, reservation.event.id)),
      };
    }

    if (reservation.event.status === "PENDING") {
      return {
        outcome: "PENDING" as const,
        operationId: reservation.event.id,
      };
    }

    throw new MealPlanGenerationError(
      409,
      "IDEMPOTENCY_KEY_FINALIZED",
      "Use a new Idempotency-Key for another generation attempt",
    );
  }

  try {
    const generated = await dependencies.generate(context.profileSnapshot);
    const result = await dependencies.persist({
      userId,
      usageEventId: reservation.event.id,
      generatedPlan: generated.plan,
      profileSnapshot: context.profileSnapshot,
      model: generated.model,
      promptVersion: MEAL_PLAN_PROMPT_VERSION,
      openaiResponseId: generated.responseId,
    });

    return { outcome: "CREATED" as const, ...result };
  } catch (error: unknown) {
    try {
      await failReservationIfPending(userId, reservation.event.id, dependencies);
    } catch {
      throw new MealPlanGenerationError(
        500,
        "USAGE_FINALIZATION_FAILED",
        "Meal plan generation could not be finalized safely",
      );
    }

    throw error;
  }
}

export type { GenerationDependencies };
