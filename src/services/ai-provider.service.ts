import { createDefaultAIRouter } from "../ai/ai-router.js";
import {
  AIRouterError,
  type AIRouter,
  type AIRouterProvider,
} from "../ai/ai-router.types.js";
import { buildMealPlanPrompt } from "../prompts/meal-plan.prompt.js";
import { validateGeneratedMealPlan } from "../schemas/meal-plan.schema.js";
import type { ProfileSnapshot } from "./meal-plan.service.js";
import { AIProviderError, type GeneratedMealPlanWithAI } from "./ai-provider.types.js";

interface AIProviderDependencies {
  router: AIRouter;
}

function toLegacyProviderName(
  provider: AIRouterProvider,
): Lowercase<AIRouterProvider> {
  return provider.toLowerCase() as Lowercase<AIRouterProvider>;
}

function toPublicProviderError(error: unknown): AIProviderError {
  if (error instanceof AIProviderError) return error;

  if (error instanceof AIRouterError) {
    if (
      error.code === "AI_RATE_LIMIT" ||
      error.code === "AI_TIMEOUT" ||
      error.code === "AI_PROVIDER_UNAVAILABLE"
    ) {
      return new AIProviderError(
        503,
        "AI_TEMPORARILY_UNAVAILABLE",
        "Meal plan generation is temporarily unavailable",
      );
    }

    if (
      error.code === "AI_INVALID_RESPONSE" ||
      error.code === "AI_SCHEMA_VALIDATION_FAILED"
    ) {
      return new AIProviderError(
        502,
        "AI_INVALID_RESPONSE",
        "AI returned an invalid meal plan",
      );
    }

    return new AIProviderError(
      error.code === "AI_AUTH_ERROR" ? 502 : 500,
      "AI_GENERATION_FAILED",
      "Meal plan generation failed",
    );
  }

  return new AIProviderError(500, "AI_GENERATION_FAILED", "Meal plan generation failed");
}

async function generateThroughRouter(
  profileSnapshot: ProfileSnapshot,
  router: AIRouter,
): Promise<GeneratedMealPlanWithAI> {
  const prompt = buildMealPlanPrompt(profileSnapshot);

  try {
    const response = await router.route({
      task: "MEAL_PLAN_GENERATION",
      instructions: prompt.instructions,
      input: prompt.input,
      responseFormat: "STRUCTURED_JSON",
      timeoutMs: 60_000,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw new AIRouterError(
        "AI_INVALID_RESPONSE",
        false,
        "AI provider returned malformed JSON",
      );
    }

    const validation = validateGeneratedMealPlan(parsed, profileSnapshot.mealsPerDay);
    if (!validation.success) {
      throw new AIRouterError(
        "AI_SCHEMA_VALIDATION_FAILED",
        false,
        "AI provider response failed schema validation",
      );
    }

    return {
      plan: validation.data,
      provider: toLegacyProviderName(response.provider),
      model: response.model,
      ...(response.requestId ? { responseId: response.requestId } : {}),
    };
  } catch (error: unknown) {
    throw toPublicProviderError(error);
  }
}

export function generateMealPlanWithAI(
  profileSnapshot: ProfileSnapshot,
  dependencies?: AIProviderDependencies,
): Promise<GeneratedMealPlanWithAI> {
  return generateThroughRouter(profileSnapshot, dependencies?.router ?? createDefaultAIRouter());
}

export type { AIProviderDependencies };
