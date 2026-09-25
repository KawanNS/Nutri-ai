import { GoogleGenAI, type Schema } from "@google/genai";

import { env } from "../../config/env.js";
import {
  AIRouterError,
  type AIProviderAdapter,
  type AIRoute,
  type AIRouterRequest,
  type AIRouterResponse,
  type AIUsage,
} from "../ai-router.types.js";
import {
  mealPhotoResponseSchema,
  mealPlanResponseSchema,
} from "./gemini-response-schema.js";

interface GeminiRouterResponse {
  text?: string;
  responseId?: string;
  candidates?: Array<{ finishReason?: string }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}

export interface GeminiRouterClient {
  models: {
    generateContent(input: {
      model: string;
      contents:
        | string
        | Array<{
            role: "user";
            parts: Array<
              | { text: string }
              | { inlineData: { mimeType: string; data: string } }
            >;
          }>;
      config: {
        systemInstruction: string;
        responseMimeType?: "application/json";
        responseSchema?: Schema;
        httpOptions: { timeout: number };
      };
    }): Promise<GeminiRouterResponse>;
  };
}

interface GeminiAdapterDependencies {
  apiKey: string | null;
  createClient: (apiKey: string) => GeminiRouterClient;
  now: () => number;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function normalizeUsage(metadata: GeminiRouterResponse["usageMetadata"]): AIUsage {
  return {
    inputTokens: nonNegativeInteger(metadata?.promptTokenCount),
    outputTokens: nonNegativeInteger(metadata?.candidatesTokenCount),
    totalTokens: nonNegativeInteger(metadata?.totalTokenCount),
    cachedInputTokens: nonNegativeInteger(metadata?.cachedContentTokenCount),
    reasoningTokens: nonNegativeInteger(metadata?.thoughtsTokenCount),
  };
}

function sanitizeRequestId(value: unknown): string | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,255}$/.test(value)) return null;
  return value;
}

function errorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) return null;
  return typeof error.status === "number" ? error.status : null;
}

function errorName(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("name" in error)) return null;
  return typeof error.name === "string" ? error.name : null;
}

export function normalizeGeminiAdapterError(error: unknown): AIRouterError {
  if (error instanceof AIRouterError) return error;

  const status = errorStatus(error);
  if (status === 401 || status === 403) {
    return new AIRouterError("AI_AUTH_ERROR", false, "AI provider authentication failed");
  }
  if (status === 429) {
    return new AIRouterError("AI_RATE_LIMIT", true, "AI provider rate limit reached");
  }
  if (status !== null && status >= 500) {
    return new AIRouterError(
      "AI_PROVIDER_UNAVAILABLE",
      true,
      "AI provider is temporarily unavailable",
    );
  }

  const name = errorName(error);
  if (name === "AbortError" || name === "TimeoutError") {
    return new AIRouterError("AI_TIMEOUT", true, "AI provider request timed out");
  }

  return new AIRouterError("AI_UNKNOWN_ERROR", false, "AI generation failed");
}

function responseSchemaFor(route: AIRoute): Schema {
  if (route.task === "MEAL_PLAN_GENERATION") return mealPlanResponseSchema;
  if (route.task === "MEAL_PHOTO_ANALYSIS") return mealPhotoResponseSchema;
  throw new AIRouterError("AI_UNSUPPORTED_TASK", false, "AI task is not supported");
}

export function createGeminiAdapter(
  overrides: Partial<GeminiAdapterDependencies> = {},
): AIProviderAdapter {
  const dependencies: GeminiAdapterDependencies = {
    apiKey: overrides.apiKey === undefined ? env.geminiApiKeyOrNull : overrides.apiKey,
    createClient:
      overrides.createClient ??
      ((apiKey) => new GoogleGenAI({ apiKey }) as unknown as GeminiRouterClient),
    now: overrides.now ?? Date.now,
  };

  return {
    provider: "GEMINI",
    health() {
      return {
        provider: "GEMINI",
        status: dependencies.apiKey ? "CONFIGURED" : "NOT_CONFIGURED",
      };
    },
    async generate(request: AIRouterRequest, route: AIRoute): Promise<AIRouterResponse> {
      if (!dependencies.apiKey || !route.model.trim()) {
        throw new AIRouterError(
          "AI_CONFIGURATION_ERROR",
          false,
          "AI provider is not configured",
        );
      }

      const startedAt = dependencies.now();
      try {
        const structuredConfig = request.responseFormat === "STRUCTURED_JSON"
          ? {
              responseMimeType: "application/json" as const,
              responseSchema: responseSchemaFor(route),
            }
          : {};
        const contents = request.image
          ? [{
              role: "user" as const,
              parts: [
                { text: request.input },
                {
                  inlineData: {
                    mimeType: request.image.mimeType,
                    data: Buffer.from(request.image.data).toString("base64"),
                  },
                },
              ],
            }]
          : request.input;
        const response = await dependencies.createClient(dependencies.apiKey).models.generateContent({
          model: route.model,
          contents,
          config: {
            systemInstruction: request.instructions,
            ...structuredConfig,
            httpOptions: { timeout: request.timeoutMs },
          },
        });

        const content = response.text?.trim();
        if (!content) {
          throw new AIRouterError(
            "AI_INVALID_RESPONSE",
            false,
            "AI provider returned an invalid response",
          );
        }

        return {
          content,
          provider: "GEMINI",
          model: route.model,
          latencyMs: Math.max(0, dependencies.now() - startedAt),
          usage: normalizeUsage(response.usageMetadata),
          finishReason: response.candidates?.[0]?.finishReason ?? null,
          requestId: sanitizeRequestId(response.responseId),
        };
      } catch (error: unknown) {
        throw normalizeGeminiAdapterError(error);
      }
    },
  };
}

export type { GeminiAdapterDependencies };
