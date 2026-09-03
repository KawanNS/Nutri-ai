import { ApiError, GoogleGenAI, type Schema } from "@google/genai";
import { writeSync } from "node:fs";
import { ZodError } from "zod";

import { env } from "../config/env.js";
import { buildMealPlanPrompt } from "../prompts/meal-plan.prompt.js";
import { validateGeneratedMealPlan } from "../schemas/meal-plan.schema.js";
import {
  AIProviderError,
  type GeneratedMealPlanWithAI,
} from "./ai-provider.types.js";
import { mealPlanResponseSchema } from "./gemini-response-schema.js";
import type { ProfileSnapshot } from "./meal-plan.service.js";

const GEMINI_TIMEOUT_MS = 60_000;
const MAX_VALIDATION_DIAGNOSTIC_ISSUES = 10;
const MEAL_PLAN_PROPERTY_NAMES = new Set([
  "title",
  "summary",
  "durationDays",
  "currency",
  "dailyTargets",
  "caloriesKcal",
  "proteinGrams",
  "carbohydrateGrams",
  "fatGrams",
  "days",
  "day",
  "label",
  "meals",
  "name",
  "suggestedTime",
  "foods",
  "quantity",
  "unit",
  "preparation",
  "estimatedNutrition",
  "estimatedDailyCost",
  "shoppingList",
  "category",
  "items",
  "estimatedWeeklyCost",
  "notes",
  "safetyNotices",
]);

type GeminiDiagnosticCategory =
  | "INVALID_ARGUMENT"
  | "MODEL_NOT_FOUND"
  | "AUTHENTICATION_FAILED"
  | "PERMISSION_DENIED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "SERVICE_UNAVAILABLE"
  | "UNKNOWN";

type JsonParseErrorCategory =
  | "unexpected_token"
  | "unexpected_end"
  | "bad_control_character"
  | "bad_escape"
  | "bad_number"
  | "missing_separator"
  | "unknown_syntax";

type GeminiDiagnosticWriter = (diagnostic: string) => void;

interface GeminiClient {
  models: {
    generateContent: (input: {
      model: string;
      contents: string;
      config: {
        systemInstruction: string;
        responseMimeType: "application/json";
        responseSchema: Schema;
        httpOptions: { timeout: number };
      };
    }) => Promise<{
      text?: string;
      responseId?: string;
      candidates?: Array<{
        finishReason?: string;
        content?: {
          parts?: Array<{ text?: string; thought?: boolean }>;
        };
      }>;
      promptFeedback?: { blockReason?: string };
    }>;
  };
}

function createGeminiClient(): GeminiClient {
  return new GoogleGenAI({ apiKey: env.geminiApiKey });
}

function categorizeGeminiError(error: unknown): GeminiDiagnosticCategory {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return "INVALID_ARGUMENT";
      case 401:
        return "AUTHENTICATION_FAILED";
      case 403:
        return "PERMISSION_DENIED";
      case 404:
        return "MODEL_NOT_FOUND";
      case 429:
        return "RATE_LIMITED";
      default:
        return error.status >= 500 ? "SERVICE_UNAVAILABLE" : "UNKNOWN";
    }
  }

  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return "TIMEOUT";
  }

  return "UNKNOWN";
}

function safeGeminiErrorName(error: unknown): string {
  if (error instanceof ApiError) {
    return "ApiError";
  }

  if (error instanceof Error) {
    const allowedNames = new Set([
      "AbortError",
      "TimeoutError",
      "SyntaxError",
      "ZodError",
      "AIProviderError",
      "Error",
    ]);

    return allowedNames.has(error.name) ? error.name : "Error";
  }

  return "UnknownError";
}

function writeGeminiDiagnosticToStderr(diagnostic: string): void {
  writeSync(process.stderr.fd, diagnostic);
}

function logGeminiDiagnostic(
  error: unknown,
  writeDiagnostic: GeminiDiagnosticWriter,
): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const diagnostic = {
    provider: "gemini",
    operation: "generateMealPlan",
    errorName: safeGeminiErrorName(error),
    ...(error instanceof ApiError ? { status: error.status } : {}),
    category: categorizeGeminiError(error),
  };

  writeDiagnostic(`${JSON.stringify(diagnostic)}\n`);
}

function logGeminiEmptyResponse(
  response: Awaited<ReturnType<GeminiClient["models"]["generateContent"]>>,
  writeDiagnostic: GeminiDiagnosticWriter,
): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const firstCandidate = response.candidates?.[0];
  const parts = firstCandidate?.content?.parts ?? [];
  const diagnostic = {
    provider: "gemini",
    operation: "generateMealPlan",
    event: "empty_response",
    candidateCount: response.candidates?.length ?? 0,
    finishReason: firstCandidate?.finishReason ?? null,
    promptBlockReason: response.promptFeedback?.blockReason ?? null,
    hasContent: firstCandidate?.content !== undefined,
    partCount: parts.length,
    textPartCount: parts.filter(
      (part) => typeof part.text === "string" && part.text.trim().length > 0,
    ).length,
    thoughtPartCount: parts.filter((part) => part.thought === true).length,
  };

  writeDiagnostic(`${JSON.stringify(diagnostic)}\n`);
}

function logGeminiMalformedJson(
  responseText: string,
  response: Awaited<ReturnType<GeminiClient["models"]["generateContent"]>>,
  error: SyntaxError,
  writeDiagnostic: GeminiDiagnosticWriter,
): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const trimmedResponse = responseText.trim();
  const firstCandidate = response.candidates?.[0];
  const parts = firstCandidate?.content?.parts ?? [];
  const parseError = sanitizeJsonParseError(error, responseText);
  const diagnostic = {
    provider: "gemini",
    operation: "generateMealPlan",
    event: "malformed_json",
    responseLength: responseText.length,
    firstNonWhitespaceChar: trimmedResponse[0] ?? null,
    lastNonWhitespaceChar: trimmedResponse.at(-1) ?? null,
    hasMarkdownFence: responseText.includes("```"),
    candidateCount: response.candidates?.length ?? 0,
    finishReason: firstCandidate?.finishReason ?? null,
    partCount: parts.length,
    textPartCount: parts.filter(
      (part) => typeof part.text === "string" && part.text.trim().length > 0,
    ).length,
    thoughtPartCount: parts.filter((part) => part.thought === true).length,
    ...parseError,
  };

  writeDiagnostic(`${JSON.stringify(diagnostic)}\n`);
}

function sanitizeJsonParseError(error: SyntaxError, responseText: string): {
  parseErrorCategory: JsonParseErrorCategory;
  parseErrorPosition: number | null;
  parseErrorLine: number | null;
  parseErrorColumn: number | null;
} {
  const message = error.message.toLowerCase();
  let parseErrorCategory: JsonParseErrorCategory = "unknown_syntax";

  if (message.includes("unexpected end") || message.includes("end of json")) {
    parseErrorCategory = "unexpected_end";
  } else if (message.includes("control character")) {
    parseErrorCategory = "bad_control_character";
  } else if (message.includes("escape")) {
    parseErrorCategory = "bad_escape";
  } else if (message.includes("number")) {
    parseErrorCategory = "bad_number";
  } else if (
    message.includes("expected ','") ||
    message.includes("expected ':'") ||
    message.includes("separator")
  ) {
    parseErrorCategory = "missing_separator";
  } else if (
    message.includes("unexpected token") ||
    message.includes("unexpected non-whitespace") ||
    message.includes("expected property name") ||
    message.includes("expected double-quoted property name")
  ) {
    parseErrorCategory = "unexpected_token";
  }

  const positionMatch = /\bposition\s+(\d+)\b/i.exec(error.message);
  const parsedPosition = positionMatch ? Number(positionMatch[1]) : null;
  const parseErrorPosition =
    parsedPosition !== null &&
    Number.isSafeInteger(parsedPosition) &&
    parsedPosition >= 0 &&
    parsedPosition <= responseText.length
      ? parsedPosition
      : null;

  if (parseErrorPosition === null) {
    return {
      parseErrorCategory,
      parseErrorPosition: null,
      parseErrorLine: null,
      parseErrorColumn: null,
    };
  }

  const textBeforeError = responseText.slice(0, parseErrorPosition);
  const lastNewline = textBeforeError.lastIndexOf("\n");
  return {
    parseErrorCategory,
    parseErrorPosition,
    parseErrorLine: textBeforeError.split("\n").length,
    parseErrorColumn: parseErrorPosition - lastNewline,
  };
}

function logGeminiValidationFailed(
  error: ZodError,
  writeDiagnostic: GeminiDiagnosticWriter,
): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const diagnostic = {
    provider: "gemini",
    operation: "generateMealPlan",
    event: "validation_failed",
    issueCount: error.issues.length,
    issues: error.issues.slice(0, MAX_VALIDATION_DIAGNOSTIC_ISSUES).map((issue) => ({
      path: issue.path.every(
        (segment) =>
          (typeof segment === "number" &&
            Number.isSafeInteger(segment) &&
            segment >= 0) ||
          (typeof segment === "string" && MEAL_PLAN_PROPERTY_NAMES.has(segment)),
      )
        ? issue.path
        : [],
      code: issue.code,
    })),
  };

  writeDiagnostic(`${JSON.stringify(diagnostic)}\n`);
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
  writeDiagnostic: GeminiDiagnosticWriter = writeGeminiDiagnosticToStderr,
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
        responseSchema: mealPlanResponseSchema,
        httpOptions: { timeout: GEMINI_TIMEOUT_MS },
      },
    });

    const responseText = response.text;

    if (!responseText?.trim()) {
      logGeminiEmptyResponse(response, writeDiagnostic);
      throw new AIProviderError(
        502,
        "AI_INVALID_RESPONSE",
        "AI returned an invalid meal plan",
      );
    }

    let parsedResponse: unknown;

    try {
      parsedResponse = JSON.parse(responseText);
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        logGeminiMalformedJson(responseText, response, error, writeDiagnostic);
        throw new AIProviderError(
          502,
          "AI_INVALID_RESPONSE",
          "AI returned an invalid meal plan",
        );
      }

      throw error;
    }

    const validation = validateGeneratedMealPlan(
      parsedResponse,
      profileSnapshot.mealsPerDay,
    );

    if (!validation.success) {
      logGeminiValidationFailed(validation.error, writeDiagnostic);
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
    if (!(error instanceof AIProviderError)) {
      logGeminiDiagnostic(error, writeDiagnostic);
    }
    throw normalizeGeminiError(error);
  }
}

export type { GeminiClient, GeminiDiagnosticWriter };
