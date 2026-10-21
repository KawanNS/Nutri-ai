import { createDefaultAIRouter } from "../ai/ai-router.js";
import { AIRouterError, type AIRouter } from "../ai/ai-router.types.js";
import { buildPlanPreviewPrompt, PLAN_PREVIEW_PROMPT_VERSION } from "../prompts/plan-preview.prompt.js";
import { planPreviewAIResponseSchema, type PlanPreviewAIResponse } from "../schemas/meal-plan.schema.js";
import type { PlanPreviewRequest } from "../schemas/plan-preview.schema.js";

export class PlanPreviewError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function publicError(error: unknown): PlanPreviewError {
  if (error instanceof PlanPreviewError) return error;
  if (error instanceof AIRouterError) {
    if (["AI_RATE_LIMIT", "AI_TIMEOUT", "AI_PROVIDER_UNAVAILABLE"].includes(error.code)) {
      return new PlanPreviewError(503, "PLAN_PREVIEW_TEMPORARILY_UNAVAILABLE", "Plan preview is temporarily unavailable");
    }
    if (error.code === "AI_INVALID_RESPONSE" || error.code === "AI_SCHEMA_VALIDATION_FAILED") {
      return new PlanPreviewError(502, "PLAN_PREVIEW_INVALID_RESPONSE", "AI returned an invalid preview");
    }
  }
  return new PlanPreviewError(500, "PLAN_PREVIEW_FAILED", "Plan preview failed");
}

const sum = (meals: PlanPreviewAIResponse["meals"], key: keyof PlanPreviewAIResponse["meals"][number]["estimatedNutrition"]) =>
  Math.round(meals.reduce((total, meal) => total + meal.estimatedNutrition[key], 0));

/**
 * Generates Monday from the onboarding answers, for visitors without an account. Nothing is stored and no
 * usage counter is touched; the route in front of it limits how often it can run.
 */
export async function generatePlanPreview(
  request: PlanPreviewRequest,
  dependencies: { router?: AIRouter } = {},
) {
  const prompt = buildPlanPreviewPrompt(request);
  try {
    const response = await (dependencies.router ?? createDefaultAIRouter()).route({
      task: "MEAL_PLAN_PREVIEW",
      instructions: prompt.instructions,
      input: prompt.input,
      responseFormat: "STRUCTURED_JSON",
      timeoutMs: 40_000,
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw new AIRouterError("AI_INVALID_RESPONSE", false, "AI returned malformed JSON");
    }
    const validated = planPreviewAIResponseSchema.safeParse(parsed);
    if (!validated.success || validated.data.meals.length !== request.mealsPerDay) {
      throw new AIRouterError("AI_SCHEMA_VALIDATION_FAILED", false, "AI preview failed validation");
    }
    const { meals, estimatedDailyCost } = validated.data;
    return {
      preview: {
        label: "Segunda-feira",
        meals,
        estimatedDailyCost: Math.round(estimatedDailyCost * 100) / 100,
        totals: {
          caloriesKcal: sum(meals, "caloriesKcal"),
          proteinGrams: sum(meals, "proteinGrams"),
          carbohydrateGrams: sum(meals, "carbohydrateGrams"),
          fatGrams: sum(meals, "fatGrams"),
        },
        promptVersion: PLAN_PREVIEW_PROMPT_VERSION,
      },
    };
  } catch (error: unknown) {
    throw publicError(error);
  }
}
