import { env } from "../config/env.js";
import type { AIRoute, AITask } from "./ai-router.types.js";

export type AIRoutingPolicy = Readonly<Record<AITask, AIRoute>>;

export function createAIRoutingPolicy(geminiModel: string): AIRoutingPolicy {
  return Object.freeze({
    MEAL_PLAN_GENERATION: Object.freeze({
      task: "MEAL_PLAN_GENERATION",
      provider: "GEMINI",
      model: geminiModel,
    }),
  });
}

export function createConfiguredAIRoutingPolicy(): AIRoutingPolicy {
  return createAIRoutingPolicy(env.geminiModel);
}
