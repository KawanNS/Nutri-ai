import { resolveAIRoute } from "../ai-route-resolver.js";
import { AI_TASKS, type AIProviderAdapter } from "../ai-router.types.js";
import type { AIRoutingPolicy } from "../ai-routing-policy.js";
import type { AIRouteConfigRepository } from "../config/ai-route-config.repository.js";
import type { AIRouteSummary, AIProviderSummary } from "./ai-admin.contracts.js";
import type { AIModelRegistry } from "../registry/ai-model.registry.js";
import {
  providerHealthById,
  type AIProviderRegistry,
} from "../registry/ai-provider.registry.js";

export function createAIProviderSummaries(
  providers: AIProviderRegistry,
  models: AIModelRegistry,
  adapters: readonly AIProviderAdapter[],
): readonly AIProviderSummary[] {
  const health = providerHealthById(adapters);

  return providers.list().map((definition) => {
    const configured = health.get(definition.provider)?.status === "CONFIGURED";
    return {
      provider: definition.provider,
      displayName: definition.displayName,
      operational: definition.operational,
      configured,
      status: !definition.operational
        ? "INACTIVE"
        : configured
          ? "ACTIVE"
          : "NOT_CONFIGURED",
      capabilities: [...definition.capabilities],
      allowedModels: models
        .list(definition.provider)
        .filter((model) => model.enabled)
        .map((model) => model.model),
    };
  });
}

export async function createAIRouteSummaries(
  policy: AIRoutingPolicy,
  repository: AIRouteConfigRepository,
  providers: AIProviderRegistry,
  models: AIModelRegistry,
): Promise<readonly AIRouteSummary[]> {
  return Promise.all(
    AI_TASKS.map(async (task) => {
      const route = await resolveAIRoute(task, {
        defaults: policy,
        repository,
        providers,
        models,
      });
      return { ...route, enabled: true };
    }),
  );
}
