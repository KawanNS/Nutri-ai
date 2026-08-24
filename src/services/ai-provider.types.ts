import type { GeneratedMealPlan } from "../schemas/meal-plan.schema.js";

export type AIProvider = "openai" | "gemini";

export class AIProviderError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code:
      | "AI_GENERATION_FAILED"
      | "AI_INVALID_RESPONSE"
      | "AI_TEMPORARILY_UNAVAILABLE",
    message: string,
  ) {
    super(message);
  }
}

export interface GeneratedMealPlanWithAI {
  plan: GeneratedMealPlan;
  provider: AIProvider;
  model: string;
  responseId?: string;
}
