import { z } from "zod";

const nullableEstimate = z.number().finite().min(0).max(100_000).nullable();

export const mealPhotoFoodSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    portionDescription: z.string().trim().min(1).max(240),
    estimatedCaloriesKcal: nullableEstimate,
    estimatedProteinGrams: nullableEstimate,
    estimatedCarbohydrateGrams: nullableEstimate,
    estimatedFatGrams: nullableEstimate,
    confidence: z.enum(["UNKNOWN", "LOW", "MEDIUM", "HIGH"]),
    limitations: z.array(z.string().trim().min(1).max(240)).max(10),
  })
  .strict();

export const mealPhotoAnalysisSchema = z
  .object({
    isEstimate: z.literal(true),
    foods: z.array(mealPhotoFoodSchema).max(30),
    observations: z.array(z.string().trim().min(1).max(500)).max(10),
    undeterminedItems: z.array(z.string().trim().min(1).max(240)).max(10),
  })
  .strict();

export const confirmFoodLogSchema = z
  .object({
    consumedAt: z.iso.datetime({ offset: true }).optional(),
    foods: z.array(mealPhotoFoodSchema).min(1).max(30),
    notes: z.string().trim().max(1000).nullable().optional(),
    uncertaintyNotes: z.array(z.string().trim().min(1).max(240)).max(20),
  })
  .strict();

export type MealPhotoAnalysis = z.infer<typeof mealPhotoAnalysisSchema>;
export type ConfirmFoodLogInput = z.infer<typeof confirmFoodLogSchema>;
