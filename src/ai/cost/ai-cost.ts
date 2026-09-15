import type { AIUsage, AIRouterProvider } from "../ai-router.types.js";

export interface AIModelPricing {
  provider: AIRouterProvider;
  model: string;
  currency: "USD";
  inputMicrosPerMillionTokens: number;
  outputMicrosPerMillionTokens: number;
}

export interface AIEstimatedCost {
  kind: "ROUTER_ESTIMATE";
  currency: AIModelPricing["currency"];
  amountMicros: number;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function isValidAIModelPricing(value: AIModelPricing): boolean {
  return (
    value.currency === "USD" &&
    value.model.trim().length > 0 &&
    isNonNegativeSafeInteger(value.inputMicrosPerMillionTokens) &&
    isNonNegativeSafeInteger(value.outputMicrosPerMillionTokens)
  );
}

export function estimateAICost(
  usage: AIUsage,
  pricing: AIModelPricing | null,
): AIEstimatedCost | null {
  if (
    !pricing ||
    !isValidAIModelPricing(pricing) ||
    usage.inputTokens === null ||
    usage.outputTokens === null ||
    !isNonNegativeSafeInteger(usage.inputTokens) ||
    !isNonNegativeSafeInteger(usage.outputTokens)
  ) {
    return null;
  }

  const amountMicros = Math.round(
    (usage.inputTokens * pricing.inputMicrosPerMillionTokens +
      usage.outputTokens * pricing.outputMicrosPerMillionTokens) /
      1_000_000,
  );
  if (!isNonNegativeSafeInteger(amountMicros)) return null;

  return {
    kind: "ROUTER_ESTIMATE",
    currency: pricing.currency,
    amountMicros,
  };
}
