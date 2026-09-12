import { createGeminiAdapter } from "./adapters/gemini.adapter.js";
import { createConfiguredAIRoutingPolicy, type AIRoutingPolicy } from "./ai-routing-policy.js";
import {
  AIRouterError,
  type AIProviderAdapter,
  type AIRouter,
  type AIRouterObserver,
  type AIRouterRequest,
  type AIRouterResponse,
  type AITask,
} from "./ai-router.types.js";

interface AIRouterDependencies {
  policy: AIRoutingPolicy;
  adapters: readonly AIProviderAdapter[];
  observe?: AIRouterObserver;
  now?: () => number;
}

function isSupportedTask(task: string, policy: AIRoutingPolicy): task is AITask {
  return Object.hasOwn(policy, task);
}

export function createAIRouter(dependencies: AIRouterDependencies): AIRouter {
  const adapters = new Map(dependencies.adapters.map((adapter) => [adapter.provider, adapter]));
  const now = dependencies.now ?? Date.now;

  return {
    async route(request: AIRouterRequest): Promise<AIRouterResponse> {
      const startedAt = now();
      let provider = null;
      let model = null;

      try {
        if (!isSupportedTask(request.task, dependencies.policy)) {
          throw new AIRouterError("AI_UNSUPPORTED_TASK", false, "AI task is not supported");
        }

        const selectedRoute = dependencies.policy[request.task];
        provider = selectedRoute.provider;
        model = selectedRoute.model;
        const adapter = adapters.get(selectedRoute.provider);

        if (!adapter) {
          throw new AIRouterError(
            "AI_CONFIGURATION_ERROR",
            false,
            "AI provider is not configured",
          );
        }

        const response = await adapter.generate(request, selectedRoute);
        dependencies.observe?.({
          task: request.task,
          provider,
          model,
          success: true,
          latencyMs: Math.max(0, now() - startedAt),
          errorCode: null,
        });
        return response;
      } catch (error: unknown) {
        const normalized =
          error instanceof AIRouterError
            ? error
            : new AIRouterError("AI_UNKNOWN_ERROR", false, "AI generation failed");
        dependencies.observe?.({
          task: request.task,
          provider,
          model,
          success: false,
          latencyMs: Math.max(0, now() - startedAt),
          errorCode: normalized.code,
        });
        throw normalized;
      }
    },
    health() {
      return [...adapters.values()].map((adapter) => adapter.health());
    },
  };
}

export function createDefaultAIRouter(): AIRouter {
  return createAIRouter({
    policy: createConfiguredAIRoutingPolicy(),
    adapters: [createGeminiAdapter()],
  });
}

export type { AIRouterDependencies };
