import OpenAI, {
  APIError,
  APIConnectionError,
  APIConnectionTimeoutError,
  InternalServerError,
  RateLimitError,
} from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ZodError } from "zod";

import { env } from "../config/env.js";
import { buildMealPlanPrompt } from "../prompts/meal-plan.prompt.js";
import {
  generatedMealPlanSchema,
  validateGeneratedMealPlan,
} from "../schemas/meal-plan.schema.js";
import type { ProfileSnapshot } from "./meal-plan.service.js";

const OPENAI_TIMEOUT_MS = 60_000;

export class OpenAIServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code:
      | "AI_GENERATION_FAILED"
      | "AI_INVALID_RESPONSE"
      | "AI_TEMPORARILY_UNAVAILABLE",
    message: string,
  ) {
    super(message);
  }
}

function createOpenAIClient(): OpenAI {
  return new OpenAI({
    apiKey: env.openaiApiKey,
    timeout: OPENAI_TIMEOUT_MS,
    maxRetries: 0,
  });
}

function normalizeOpenAIError(error: unknown): OpenAIServiceError {
  if (error instanceof OpenAIServiceError) {
    return error;
  }

  if (error instanceof APIConnectionTimeoutError) {
    return new OpenAIServiceError(
      503,
      "AI_TEMPORARILY_UNAVAILABLE",
      "Meal plan generation is temporarily unavailable",
    );
  }

  if (
    error instanceof RateLimitError ||
    error instanceof APIConnectionError ||
    error instanceof InternalServerError
  ) {
    return new OpenAIServiceError(
      503,
      "AI_TEMPORARILY_UNAVAILABLE",
      "Meal plan generation is temporarily unavailable",
    );
  }

  if (error instanceof SyntaxError || error instanceof ZodError) {
    return new OpenAIServiceError(
      502,
      "AI_INVALID_RESPONSE",
      "AI returned an invalid meal plan",
    );
  }

  if (error instanceof APIError) {
    return new OpenAIServiceError(
      502,
      "AI_GENERATION_FAILED",
      "Meal plan generation failed",
    );
  }

  return new OpenAIServiceError(
    500,
    "AI_GENERATION_FAILED",
    "Meal plan generation failed",
  );
}

export interface GeneratedMealPlanWithAI {
  plan: unknown;
  model: string;
  responseId: string;
}

export async function generateMealPlanWithAI(
  profileSnapshot: ProfileSnapshot,
): Promise<GeneratedMealPlanWithAI> {
  const prompt = buildMealPlanPrompt(profileSnapshot);
  const model = env.openaiModel;

  try {
    const response = await createOpenAIClient().responses.parse({
      model,
      instructions: prompt.instructions,
      input: prompt.input,
      text: {
        format: zodTextFormat(generatedMealPlanSchema, "meal_plan"),
      },
      store: false,
    });

    if (!response.output_parsed) {
      throw new OpenAIServiceError(
        502,
        "AI_INVALID_RESPONSE",
        "AI returned an invalid meal plan",
      );
    }

    const validation = validateGeneratedMealPlan(
      response.output_parsed,
      profileSnapshot.mealsPerDay,
    );

    if (!validation.success) {
      throw new OpenAIServiceError(
        502,
        "AI_INVALID_RESPONSE",
        "AI returned an invalid meal plan",
      );
    }

    return {
      plan: validation.data,
      model,
      responseId: response.id,
    };
  } catch (error: unknown) {
    throw normalizeOpenAIError(error);
  }
}
