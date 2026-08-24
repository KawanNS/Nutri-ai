import { ApiError, GoogleGenAI } from "@google/genai";
import { z, ZodError } from "zod";

import { env } from "../config/env.js";
import { buildMealPlanPrompt } from "../prompts/meal-plan.prompt.js";
import {
  generatedMealPlanSchema,
  validateGeneratedMealPlan,
} from "../schemas/meal-plan.schema.js";
import {
  AIProviderError,
  type GeneratedMealPlanWithAI,
} from "./ai-provider.types.js";
import type { ProfileSnapshot } from "./meal-plan.service.js";

const GEMINI_TIMEOUT_MS = 60_000;

function toGeminiJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toGeminiJsonSchema);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const schema = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(schema)) {
    if (key === "$schema" || key === "minLength" || key === "maxLength") {
      continue;
    }

    if (key === "const") {
      sanitized.enum = [nestedValue];
      continue;
    }

    if (key === "exclusiveMinimum") {
      sanitized.minimum = nestedValue;
      continue;
    }

    sanitized[key] = toGeminiJsonSchema(nestedValue);
  }

  return sanitized;
}

const mealPlanJsonSchema = toGeminiJsonSchema(
  z.toJSONSchema(generatedMealPlanSchema),
);

interface GeminiClient {
  models: {
    generateContent: (input: {
      model: string;
      contents: string;
      config: {
        systemInstruction: string;
        responseMimeType: "application/json";
        responseJsonSchema: unknown;
        httpOptions: { timeout: number };
      };
    }) => Promise<{ text?: string; responseId?: string }>;
  };
}

function createGeminiClient(): GeminiClient {
  return new GoogleGenAI({ apiKey: env.geminiApiKey });
}

function normalizeGeminiError(error: unknown): AIProviderError {
  if (error instanceof AIProviderError) {
    return error;
  }

  if (error instanceof SyntaxError || error instanceof ZodError) {
    return new AIProviderError(
      502,
      "AI_INVALID_RESPONSE",
      "AI returned an invalid meal plan",
    );
  }

  if (error instanceof ApiError && (error.status === 429 || error.status >= 500)) {
    return new AIProviderError(
      503,
      "AI_TEMPORARILY_UNAVAILABLE",
      "Meal plan generation is temporarily unavailable",
    );
  }

  return new AIProviderError(
    error instanceof ApiError ? 502 : 500,
    "AI_GENERATION_FAILED",
    "Meal plan generation failed",
  );
}

export async function generateMealPlanWithGemini(
  profileSnapshot: ProfileSnapshot,
  client: GeminiClient = createGeminiClient(),
): Promise<GeneratedMealPlanWithAI> {
  const prompt = buildMealPlanPrompt(profileSnapshot);
  const model = env.geminiModel;

  try {
    const response = await client.models.generateContent({
      model,
      contents: prompt.input,
      config: {
        systemInstruction: prompt.instructions,
        responseMimeType: "application/json",
        responseJsonSchema: mealPlanJsonSchema,
        httpOptions: { timeout: GEMINI_TIMEOUT_MS },
      },
    });

    if (!response.text?.trim()) {
      throw new AIProviderError(
        502,
        "AI_INVALID_RESPONSE",
        "AI returned an invalid meal plan",
      );
    }

    const validation = validateGeneratedMealPlan(
      JSON.parse(response.text),
      profileSnapshot.mealsPerDay,
    );

    if (!validation.success) {
      throw new AIProviderError(
        502,
        "AI_INVALID_RESPONSE",
        "AI returned an invalid meal plan",
      );
    }

    return {
      plan: validation.data,
      provider: "gemini",
      model,
      responseId: response.responseId,
    };
  } catch (error: unknown) {
    throw normalizeGeminiError(error);
  }
}

export type { GeminiClient };
