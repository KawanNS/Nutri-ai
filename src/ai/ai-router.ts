import { createConfiguredAIAdapter } from "./adapters/configured.adapter.js";
import { resolveAIRoute } from "./ai-route-resolver.js";
import { createConfiguredAIRoutingPolicy, type AIRoutingPolicy } from "./ai-routing-policy.js";
import {
  InMemoryAIRouteConfigRepository,
  type AIRouteConfigRepository,
} from "./config/ai-route-config.repository.js";
import { PrismaAIRouteConfigRepository } from "./config/prisma-ai-route-config.repository.js";
import { estimateAICost } from "./cost/ai-cost.js";
import {
  createAIModelRegistry,
  type AIModelRegistry,
} from "./registry/ai-model.registry.js";
import {
  createAIProviderRegistry,
  type AIProviderRegistry,
} from "./registry/ai-provider.registry.js";
import {
  emitAITelemetry,
  sanitizeAIUsage,
  type AITelemetrySink,
} from "./telemetry/ai-telemetry.js";
import { PrismaAITelemetrySink } from "./telemetry/prisma-ai-telemetry.sink.js";
import { prisma } from "../lib/prisma.js";
import {
  AIRouterError,
  type AIProviderAdapter,
  type AIRoute,
  type AIRouterProvider,
  type AIRouter,
  type AIRouterObserver,
  type AIRouterRequest,
  type AIRouterResponse,
} from "./ai-router.types.js";

interface AIRouterDependencies {
  policy: AIRoutingPolicy;
  adapters: readonly AIProviderAdapter[];
  routeConfigRepository?: AIRouteConfigRepository;
  providerRegistry?: AIProviderRegistry;
  modelRegistry?: AIModelRegistry;
  telemetrySink?: AITelemetrySink;
  observe?: AIRouterObserver;
  now?: () => number;
}

function safeObserve(
  observer: AIRouterObserver | undefined,
  event: Parameters<AIRouterObserver>[0],
): void {
  try {
    observer?.(event);
  } catch {
    // Observability must not alter an AI generation outcome.
  }
}

function toISOString(timestamp: number): string {
  return new Date(Number.isFinite(timestamp) ? timestamp : 0).toISOString();
}

export function createAIRouter(dependencies: AIRouterDependencies): AIRouter {
  const adapters = new Map<AIRouterProvider, AIProviderAdapter>();
  for (const adapter of dependencies.adapters) {
    if (adapters.has(adapter.provider)) {
      throw new AIRouterError(
        "AI_CONFIGURATION_ERROR",
        false,
        "AI provider adapter is duplicated",
      );
    }
    adapters.set(adapter.provider, adapter);
  }
  const now = dependencies.now ?? Date.now;
  const routeConfigRepository =
    dependencies.routeConfigRepository ?? new InMemoryAIRouteConfigRepository();
  const providerRegistry =
    dependencies.providerRegistry ?? createAIProviderRegistry();
  const modelRegistry = dependencies.modelRegistry ?? createAIModelRegistry();

  return {
    async route(request: AIRouterRequest): Promise<AIRouterResponse> {
      const startedAt = now();
      let selectedRoute: AIRoute | null = null;

      try {
        selectedRoute = await resolveAIRoute(request.task, {
          defaults: dependencies.policy,
          repository: routeConfigRepository,
          providers: providerRegistry,
          models: modelRegistry,
        });
        const adapter = adapters.get(selectedRoute.provider);

        if (!adapter) {
          throw new AIRouterError(
            "AI_CONFIGURATION_ERROR",
            false,
            "AI provider is not configured",
          );
        }

        const response = await adapter.generate(request, selectedRoute);
        if (
          response.provider !== selectedRoute.provider ||
          response.model !== selectedRoute.model
        ) {
          throw new AIRouterError(
            "AI_INVALID_RESPONSE",
            false,
            "AI provider returned inconsistent routing metadata",
          );
        }
        const usage = sanitizeAIUsage(response.usage);
        const durationMs = Math.max(0, now() - startedAt);
        safeObserve(dependencies.observe, {
          task: request.task,
          provider: selectedRoute.provider,
          model: selectedRoute.model,
          success: true,
          latencyMs: durationMs,
          errorCode: null,
        });
        emitAITelemetry(dependencies.telemetrySink, {
          task: selectedRoute.task,
          provider: selectedRoute.provider,
          model: selectedRoute.model,
          startedAt: toISOString(startedAt),
          durationMs,
          success: true,
          errorCategory: null,
          usage,
          estimatedCost: usage
            ? estimateAICost(
                usage,
                modelRegistry.get(selectedRoute.provider, selectedRoute.model)?.pricing ??
                  null,
              )
            : null,
        });
        return response;
      } catch (error: unknown) {
        const normalized =
          error instanceof AIRouterError
            ? error
            : new AIRouterError("AI_UNKNOWN_ERROR", false, "AI generation failed");
        const durationMs = Math.max(0, now() - startedAt);
        safeObserve(dependencies.observe, {
          task: request.task,
          provider: selectedRoute?.provider ?? null,
          model: selectedRoute?.model ?? null,
          success: false,
          latencyMs: durationMs,
          errorCode: normalized.code,
        });
        emitAITelemetry(dependencies.telemetrySink, {
          task: selectedRoute?.task ?? null,
          provider: selectedRoute?.provider ?? null,
          model: selectedRoute?.model ?? null,
          startedAt: toISOString(startedAt),
          durationMs,
          success: false,
          errorCategory: normalized.code,
          usage: null,
          estimatedCost: null,
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
    adapters: [createConfiguredAIAdapter()],
    routeConfigRepository: new PrismaAIRouteConfigRepository(prisma),
    telemetrySink: new PrismaAITelemetrySink(prisma),
  });
}

export type { AIRouterDependencies };
