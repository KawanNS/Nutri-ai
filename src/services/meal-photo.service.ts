import { createDefaultAIRouter } from "../ai/ai-router.js";
import {
  AIRouterError,
  type AIImageMimeType,
  type AIRouter,
} from "../ai/ai-router.types.js";
import { prisma } from "../lib/prisma.js";
import {
  mealPhotoAnalysisInput,
  mealPhotoAnalysisInstructions,
} from "../prompts/meal-photo.prompt.js";
import {
  mealPhotoAnalysisSchema,
  type ConfirmFoodLogInput,
  type MealPhotoAnalysis,
} from "../schemas/meal-photo.schema.js";

export const MAX_MEAL_PHOTO_BYTES = 5 * 1024 * 1024;
export const MEAL_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export class MealPhotoError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function detectedMimeType(data: Buffer): AIImageMimeType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function validateMealPhoto(
  body: unknown,
  contentType: string | undefined,
): { data: Buffer; mimeType: AIImageMimeType } {
  const declaredMime = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (!MEAL_PHOTO_MIME_TYPES.some((mime) => mime === declaredMime)) {
    throw new MealPhotoError(415, "UNSUPPORTED_IMAGE_TYPE", "Image type is not supported");
  }
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new MealPhotoError(400, "EMPTY_IMAGE", "Image is required");
  }
  if (body.length > MAX_MEAL_PHOTO_BYTES) {
    throw new MealPhotoError(413, "IMAGE_TOO_LARGE", "Image exceeds the size limit");
  }
  const detected = detectedMimeType(body);
  if (!detected || detected !== declaredMime) {
    throw new MealPhotoError(400, "INVALID_IMAGE", "Image content is invalid");
  }
  return { data: body, mimeType: detected };
}

function publicAIError(error: unknown): MealPhotoError {
  if (error instanceof MealPhotoError) return error;
  if (error instanceof AIRouterError) {
    if (["AI_RATE_LIMIT", "AI_TIMEOUT", "AI_PROVIDER_UNAVAILABLE"].includes(error.code)) {
      return new MealPhotoError(503, "PHOTO_ANALYSIS_TEMPORARILY_UNAVAILABLE", "Photo analysis is temporarily unavailable");
    }
    if (error.code === "AI_INVALID_RESPONSE" || error.code === "AI_SCHEMA_VALIDATION_FAILED") {
      return new MealPhotoError(502, "INVALID_PHOTO_ANALYSIS", "Photo analysis returned an invalid response");
    }
  }
  return new MealPhotoError(500, "PHOTO_ANALYSIS_FAILED", "Photo analysis failed");
}

export async function analyzeMealPhoto(
  data: Buffer,
  mimeType: AIImageMimeType,
  dependencies: { router?: AIRouter } = {},
): Promise<MealPhotoAnalysis> {
  try {
    const response = await (dependencies.router ?? createDefaultAIRouter()).route({
      task: "MEAL_PHOTO_ANALYSIS",
      instructions: mealPhotoAnalysisInstructions,
      input: mealPhotoAnalysisInput,
      image: { mimeType, data },
      responseFormat: "STRUCTURED_JSON",
      timeoutMs: 45_000,
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw new AIRouterError("AI_SCHEMA_VALIDATION_FAILED", false, "AI returned malformed JSON");
    }
    const validated = mealPhotoAnalysisSchema.safeParse(parsed);
    if (!validated.success) {
      throw new AIRouterError("AI_SCHEMA_VALIDATION_FAILED", false, "AI response failed validation");
    }
    return validated.data;
  } catch (error: unknown) {
    throw publicAIError(error);
  }
}

function sumKnown(
  foods: ConfirmFoodLogInput["foods"],
  field: "estimatedCaloriesKcal" | "estimatedProteinGrams" | "estimatedCarbohydrateGrams" | "estimatedFatGrams",
): number | null {
  if (foods.some((food) => food[field] === null)) return null;
  return foods.reduce((total, food) => total + (food[field] ?? 0), 0);
}

export async function confirmMealPhotoLog(
  userId: string,
  input: ConfirmFoodLogInput,
  dependencies: { client?: typeof prisma } = {},
) {
  const client = dependencies.client ?? prisma;
  const foodLog = await client.foodLog.create({
    data: {
      userId,
      ...(input.consumedAt ? { consumedAt: new Date(input.consumedAt) } : {}),
      estimatedCaloriesKcal: sumKnown(input.foods, "estimatedCaloriesKcal"),
      estimatedProteinGrams: sumKnown(input.foods, "estimatedProteinGrams"),
      estimatedCarbohydrateGrams: sumKnown(input.foods, "estimatedCarbohydrateGrams"),
      estimatedFatGrams: sumKnown(input.foods, "estimatedFatGrams"),
      notes: input.notes || null,
      uncertaintyNotes: input.uncertaintyNotes,
      items: {
        create: input.foods.map((food, position) => ({
          position,
          name: food.name,
          portionDescription: food.portionDescription,
          estimatedCaloriesKcal: food.estimatedCaloriesKcal,
          estimatedProteinGrams: food.estimatedProteinGrams,
          estimatedCarbohydrateGrams: food.estimatedCarbohydrateGrams,
          estimatedFatGrams: food.estimatedFatGrams,
          confidence: food.confidence,
        })),
      },
    },
    include: { items: { orderBy: { position: "asc" } } },
  });
  return {
    ...foodLog,
    estimatedCaloriesKcal: foodLog.estimatedCaloriesKcal === null ? null : Number(foodLog.estimatedCaloriesKcal),
    estimatedProteinGrams: foodLog.estimatedProteinGrams === null ? null : Number(foodLog.estimatedProteinGrams),
    estimatedCarbohydrateGrams: foodLog.estimatedCarbohydrateGrams === null ? null : Number(foodLog.estimatedCarbohydrateGrams),
    estimatedFatGrams: foodLog.estimatedFatGrams === null ? null : Number(foodLog.estimatedFatGrams),
    items: foodLog.items.map((item) => ({
      ...item,
      estimatedCaloriesKcal: item.estimatedCaloriesKcal === null ? null : Number(item.estimatedCaloriesKcal),
      estimatedProteinGrams: item.estimatedProteinGrams === null ? null : Number(item.estimatedProteinGrams),
      estimatedCarbohydrateGrams: item.estimatedCarbohydrateGrams === null ? null : Number(item.estimatedCarbohydrateGrams),
      estimatedFatGrams: item.estimatedFatGrams === null ? null : Number(item.estimatedFatGrams),
    })),
  };
}
