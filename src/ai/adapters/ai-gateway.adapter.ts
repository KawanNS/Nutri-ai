import OpenAI from "openai";

import { env, type AIGatewayConfig } from "../../config/env.js";
import {
  AIRouterError,
  type AIProviderAdapter,
  type AIRoute,
  type AIRouterRequest,
  type AIRouterResponse,
  type AIUsage,
} from "../ai-router.types.js";

interface GatewayCompletion {
  id?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

export interface AIGatewayClient {
  chat: {
    completions: {
      create(
        input: {
          model: string;
          messages: Array<{
            role: "system" | "user";
            content:
              | string
              | Array<
                  | { type: "text"; text: string }
                  | { type: "image_url"; image_url: { url: string; detail: "auto" } }
                >;
          }>;
          response_format?: { type: "json_object" };
          stream: false;
        },
        options: { timeout: number },
      ): Promise<GatewayCompletion>;
    };
  };
}

interface AIGatewayAdapterDependencies {
  config: AIGatewayConfig | null;
  createClient: (config: AIGatewayConfig) => AIGatewayClient;
  now: () => number;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function normalizeUsage(usage: GatewayCompletion["usage"]): AIUsage {
  return {
    inputTokens: nonNegativeInteger(usage?.prompt_tokens),
    outputTokens: nonNegativeInteger(usage?.completion_tokens),
    totalTokens: nonNegativeInteger(usage?.total_tokens),
    cachedInputTokens: nonNegativeInteger(usage?.prompt_tokens_details?.cached_tokens),
    reasoningTokens: nonNegativeInteger(
      usage?.completion_tokens_details?.reasoning_tokens,
    ),
  };
}

function safeRequestId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,255}$/.test(value)
    ? value
    : null;
}

function errorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) return null;
  return typeof error.status === "number" ? error.status : null;
}

function errorName(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("name" in error)) return null;
  return typeof error.name === "string" ? error.name : null;
}

export function normalizeAIGatewayError(error: unknown): AIRouterError {
  if (error instanceof AIRouterError) return error;

  const status = errorStatus(error);
  const name = errorName(error);
  if (status === 401 || status === 403) {
    return new AIRouterError("AI_AUTH_ERROR", false, "AI gateway authentication failed");
  }
  if (
    status === 408 ||
    name === "AbortError" ||
    name === "TimeoutError" ||
    name === "APIConnectionTimeoutError"
  ) {
    return new AIRouterError("AI_TIMEOUT", true, "AI gateway request timed out");
  }
  if (status === 429) {
    return new AIRouterError("AI_RATE_LIMIT", true, "AI gateway rate limit reached");
  }
  if (status !== null && status >= 500) {
    return new AIRouterError(
      "AI_PROVIDER_UNAVAILABLE",
      true,
      "AI gateway is temporarily unavailable",
    );
  }
  if (name === "APIConnectionError") {
    return new AIRouterError(
      "AI_PROVIDER_UNAVAILABLE",
      true,
      "AI gateway is temporarily unavailable",
    );
  }
  if (status !== null && status >= 400) {
    return new AIRouterError("AI_INVALID_RESPONSE", false, "AI gateway rejected the request");
  }
  return new AIRouterError("AI_UNKNOWN_ERROR", false, "AI generation failed");
}

export function createAIGatewayAdapter(
  overrides: Partial<AIGatewayAdapterDependencies> = {},
): AIProviderAdapter {
  const dependencies: AIGatewayAdapterDependencies = {
    config: overrides.config === undefined ? env.aiGatewayConfig : overrides.config,
    createClient:
      overrides.createClient ??
      ((config) =>
        new OpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseUrl,
          maxRetries: 0,
        }) as unknown as AIGatewayClient),
    now: overrides.now ?? Date.now,
  };

  return {
    provider: "GEMINI",
    health() {
      return {
        provider: "GEMINI",
        status: dependencies.config ? "CONFIGURED" : "NOT_CONFIGURED",
      };
    },
    async generate(request: AIRouterRequest, route: AIRoute): Promise<AIRouterResponse> {
      if (!dependencies.config || !route.model.trim()) {
        throw new AIRouterError(
          "AI_CONFIGURATION_ERROR",
          false,
          "AI gateway is not configured",
        );
      }

      const startedAt = dependencies.now();
      try {
        const userContent = request.image
          ? [
              { type: "text" as const, text: request.input },
              {
                type: "image_url" as const,
                image_url: {
                  url: `data:${request.image.mimeType};base64,${Buffer.from(request.image.data).toString("base64")}`,
                  detail: "auto" as const,
                },
              },
            ]
          : request.input;
        const response = await dependencies
          .createClient(dependencies.config)
          .chat.completions.create(
            {
              model: route.model,
              messages: [
                { role: "system", content: request.instructions },
                { role: "user", content: userContent },
              ],
              ...(request.responseFormat === "STRUCTURED_JSON"
                ? { response_format: { type: "json_object" as const } }
                : {}),
              stream: false,
            },
            { timeout: request.timeoutMs },
          );
        const content = response.choices?.[0]?.message?.content?.trim();
        if (!content) {
          throw new AIRouterError(
            "AI_INVALID_RESPONSE",
            false,
            "AI gateway returned an empty response",
          );
        }

        return {
          content,
          provider: "GEMINI",
          model: route.model,
          latencyMs: Math.max(0, dependencies.now() - startedAt),
          usage: normalizeUsage(response.usage),
          finishReason: response.choices?.[0]?.finish_reason ?? null,
          requestId: safeRequestId(response.id),
        };
      } catch (error: unknown) {
        throw normalizeAIGatewayError(error);
      }
    },
  };
}

export type { AIGatewayAdapterDependencies, GatewayCompletion };
