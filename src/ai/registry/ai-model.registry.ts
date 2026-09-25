import type { AIRouterProvider } from "../ai-router.types.js";
import type { AIModelPricing } from "../cost/ai-cost.js";
import { env } from "../../config/env.js";

export const GEMINI_MODELS = [env.geminiModel] as const;

export interface AIModelDefinition {
  provider: AIRouterProvider;
  model: string;
  enabled: boolean;
  pricing: AIModelPricing | null;
  modalities: readonly ("TEXT" | "IMAGE")[];
}

const MODEL_DEFINITIONS: readonly AIModelDefinition[] = Object.freeze([
  Object.freeze({
    provider: "GEMINI",
    model: env.geminiModel,
    enabled: true,
    pricing: null,
    modalities: Object.freeze(["TEXT", "IMAGE"] as const),
  }),
]);

export interface AIModelRegistry {
  get(provider: string, model: string): AIModelDefinition | null;
  list(provider?: AIRouterProvider): readonly AIModelDefinition[];
  isAllowed(provider: string, model: string): provider is AIRouterProvider;
}

export function createAIModelRegistry(): AIModelRegistry {
  const get = (provider: string, model: string): AIModelDefinition | null =>
    MODEL_DEFINITIONS.find(
      (definition) =>
        definition.provider === provider && definition.model === model,
    ) ?? null;

  return {
    get,
    list(provider) {
      return provider === undefined
        ? [...MODEL_DEFINITIONS]
        : MODEL_DEFINITIONS.filter((definition) => definition.provider === provider);
    },
    isAllowed(provider, model): provider is AIRouterProvider {
      return get(provider, model)?.enabled === true;
    },
  };
}

export function isAllowedAIModel(provider: string, model: string): boolean {
  return createAIModelRegistry().isAllowed(provider, model);
}
