import {
  AI_ROUTER_PROVIDERS,
  type AIProviderAdapter,
  type AIProviderHealth,
  type AIRouterProvider,
} from "../ai-router.types.js";

export interface AIProviderDefinition {
  provider: AIRouterProvider;
  displayName: string;
  operational: boolean;
  capabilities: readonly "STRUCTURED_JSON"[];
}

const PROVIDER_DEFINITIONS: Readonly<
  Record<AIRouterProvider, AIProviderDefinition>
> = Object.freeze({
  GEMINI: Object.freeze({
    provider: "GEMINI",
    displayName: "Gemini",
    operational: true,
    capabilities: Object.freeze(["STRUCTURED_JSON"] as const),
  }),
});

export interface AIProviderRegistry {
  get(provider: string): AIProviderDefinition | null;
  list(): readonly AIProviderDefinition[];
  isOperational(provider: string): provider is AIRouterProvider;
}

export function createAIProviderRegistry(): AIProviderRegistry {
  const get = (provider: string): AIProviderDefinition | null =>
    Object.hasOwn(PROVIDER_DEFINITIONS, provider)
      ? PROVIDER_DEFINITIONS[provider as AIRouterProvider]
      : null;

  return {
    get,
    list() {
      return AI_ROUTER_PROVIDERS.map((provider) => PROVIDER_DEFINITIONS[provider]);
    },
    isOperational(provider): provider is AIRouterProvider {
      return get(provider)?.operational === true;
    },
  };
}

export function providerHealthById(
  adapters: readonly AIProviderAdapter[],
): ReadonlyMap<AIRouterProvider, AIProviderHealth> {
  return new Map(adapters.map((adapter) => [adapter.provider, adapter.health()]));
}
