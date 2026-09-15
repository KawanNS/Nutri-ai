import type { AIRouteConfigRepository } from "./config/ai-route-config.repository.js";
import type { AIModelRegistry } from "./registry/ai-model.registry.js";
import type { AIProviderRegistry } from "./registry/ai-provider.registry.js";
import { AI_TASKS, AIRouterError, type AIRoute, type AITask } from "./ai-router.types.js";
import type { AIRoutingPolicy } from "./ai-routing-policy.js";

interface AIRouteResolverDependencies {
  defaults: AIRoutingPolicy;
  repository: AIRouteConfigRepository;
  providers: AIProviderRegistry;
  models: AIModelRegistry;
}

function isAITask(task: string): task is AITask {
  return AI_TASKS.some((knownTask) => knownTask === task);
}

interface ParsedRouteConfig {
  task: AITask;
  provider: string;
  model: string;
  enabled: boolean;
}

function parseRouteConfig(value: unknown, task: AITask): ParsedRouteConfig | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;

    const expectedKeys = ["enabled", "model", "provider", "task"];
    const keys = Object.keys(value).sort();
    if (
      keys.length !== expectedKeys.length ||
      keys.some((key, index) => key !== expectedKeys[index])
    ) {
      return null;
    }

    if (
      !Object.hasOwn(value, "task") ||
      !Object.hasOwn(value, "provider") ||
      !Object.hasOwn(value, "model") ||
      !Object.hasOwn(value, "enabled")
    ) {
      return null;
    }

    const candidate = value as Record<string, unknown>;
    if (
      candidate.task !== task ||
      typeof candidate.provider !== "string" ||
      typeof candidate.model !== "string" ||
      typeof candidate.enabled !== "boolean"
    ) {
      return null;
    }

    return {
      task,
      provider: candidate.provider,
      model: candidate.model,
      enabled: candidate.enabled,
    };
  } catch {
    return null;
  }
}

export async function resolveAIRoute(
  task: string,
  dependencies: AIRouteResolverDependencies,
): Promise<AIRoute> {
  if (!isAITask(task) || !Object.hasOwn(dependencies.defaults, task)) {
    throw new AIRouterError("AI_UNSUPPORTED_TASK", false, "AI task is not supported");
  }

  let custom: unknown | null;
  try {
    custom = await dependencies.repository.findByTask(task);
  } catch {
    throw new AIRouterError(
      "AI_CONFIGURATION_ERROR",
      false,
      "AI route configuration is unavailable",
    );
  }

  const candidate = parseRouteConfig(
    custom === null ? { ...dependencies.defaults[task], enabled: true } : custom,
    task,
  );
  if (!candidate) {
    throw new AIRouterError(
      "AI_CONFIGURATION_ERROR",
      false,
      "AI route configuration is invalid",
    );
  }

  if (!candidate.enabled) {
    throw new AIRouterError("AI_CONFIGURATION_ERROR", false, "AI route is disabled");
  }

  const providerDefinition = dependencies.providers.get(candidate.provider);
  if (!providerDefinition) {
    throw new AIRouterError(
      "AI_UNSUPPORTED_PROVIDER",
      false,
      "AI provider is not supported",
    );
  }
  if (!providerDefinition.operational) {
    throw new AIRouterError(
      "AI_CONFIGURATION_ERROR",
      false,
      "AI provider is not operational",
    );
  }
  if (!dependencies.models.isAllowed(candidate.provider, candidate.model)) {
    throw new AIRouterError(
      "AI_UNSUPPORTED_MODEL",
      false,
      "AI model is not allowed",
    );
  }

  return Object.freeze({
    task,
    provider: candidate.provider,
    model: candidate.model,
  });
}

export type { AIRouteResolverDependencies };
