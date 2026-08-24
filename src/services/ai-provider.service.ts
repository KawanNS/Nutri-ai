import { env } from "../config/env.js";
import type { ProfileSnapshot } from "./meal-plan.service.js";
import { generateMealPlanWithGemini } from "./gemini.service.js";
import { generateMealPlanWithOpenAI } from "./openai.service.js";

interface AIProviderDependencies {
  getProvider: () => "openai" | "gemini";
  generateWithGemini: typeof generateMealPlanWithGemini;
  generateWithOpenAI: typeof generateMealPlanWithOpenAI;
}

const defaultDependencies: AIProviderDependencies = {
  getProvider: () => env.aiProvider,
  generateWithGemini: generateMealPlanWithGemini,
  generateWithOpenAI: generateMealPlanWithOpenAI,
};

export function generateMealPlanWithAI(
  profileSnapshot: ProfileSnapshot,
  dependencies: AIProviderDependencies = defaultDependencies,
) {
  return dependencies.getProvider() === "gemini"
    ? dependencies.generateWithGemini(profileSnapshot)
    : dependencies.generateWithOpenAI(profileSnapshot);
}

export type { AIProviderDependencies };
