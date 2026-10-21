import { z } from "zod";

const foodList = z
  .array(z.string().trim().min(1).max(80))
  .max(15)
  .transform((items) => [...new Set(items.map((item) => item.toLocaleLowerCase("pt-BR")))]);

/** The onboarding answers a visitor sends to see one day of their plan before creating an account. */
export const planPreviewRequestSchema = z
  .object({
    goal: z.enum(["WEIGHT_LOSS", "MAINTENANCE", "WEIGHT_GAIN", "MUSCLE_GAIN"]),
    activityLevel: z.enum(["SEDENTARY", "LIGHT", "MODERATE", "ACTIVE", "VERY_ACTIVE"]),
    mealsPerDay: z.number().int().min(1).max(10),
    weeklyFoodBudget: z
      .union([z.string(), z.number()])
      .transform((value) => Number(typeof value === "number" ? value : value.trim()))
      .pipe(z.number().finite().positive().max(99_999_999.99)),
    foodAllergies: foodList.default([]),
    foodRestrictions: foodList.default([]),
    dislikedFoods: foodList.default([]),
  })
  .strict();

export type PlanPreviewRequest = z.infer<typeof planPreviewRequestSchema>;
