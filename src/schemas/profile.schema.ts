import { z } from "zod";

function decimalField(options: {
  field: string;
  maximum: number;
  allowZero?: boolean;
}) {
  return z.union([z.string(), z.number()]).transform((value, context) => {
    const normalizedValue =
      typeof value === "number" ? value.toString() : value.trim();

    if (!/^\d+(\.\d{1,2})?$/.test(normalizedValue)) {
      context.addIssue({
        code: "custom",
        message: `${options.field} must be a valid decimal with up to 2 decimal places`,
      });
      return z.NEVER;
    }

    const numericValue = Number(normalizedValue);
    const minimumIsValid = options.allowZero
      ? numericValue >= 0
      : numericValue > 0;

    if (!Number.isFinite(numericValue) || !minimumIsValid || numericValue > options.maximum) {
      context.addIssue({
        code: "custom",
        message: `${options.field} is outside the allowed range`,
      });
      return z.NEVER;
    }

    return normalizedValue;
  });
}

const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "birthDate must use YYYY-MM-DD format")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "birthDate must be a valid date")
  .refine((value) => value <= new Date().toISOString().slice(0, 10), {
    message: "birthDate cannot be in the future",
  })
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

const foodListSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "Food item cannot be empty")
      .max(80, "Food item must contain at most 80 characters"),
  )
  .max(30, "Food list must contain at most 30 items")
  .transform((items) => {
    const seen = new Set<string>();

    return items.filter((item) => {
      const normalizedItem = item.toLowerCase();

      if (seen.has(normalizedItem)) {
        return false;
      }

      seen.add(normalizedItem);
      return true;
    });
  })
  .optional()
  .default([]);

function normalizedFoodSet(items: string[]): Set<string> {
  return new Set(items.map((item) => item.toLowerCase()));
}

export const profileSchema = z
  .object({
    birthDate: birthDateSchema,
    sex: z.enum(["MALE", "FEMALE", "OTHER"]),
    heightCm: decimalField({ field: "heightCm", maximum: 999.99 }),
    weightKg: decimalField({ field: "weightKg", maximum: 9999.99 }),
    goal: z.enum([
      "WEIGHT_LOSS",
      "MAINTENANCE",
      "WEIGHT_GAIN",
      "MUSCLE_GAIN",
    ]),
    activityLevel: z.enum([
      "SEDENTARY",
      "LIGHT",
      "MODERATE",
      "ACTIVE",
      "VERY_ACTIVE",
    ]),
    mealsPerDay: z.number().int().positive(),
    weeklyFoodBudget: decimalField({
      field: "weeklyFoodBudget",
      maximum: 99_999_999.99,
      allowZero: true,
    }),
    foodPreferences: foodListSchema,
    likedFoods: foodListSchema,
    dislikedFoods: foodListSchema,
    foodRestrictions: foodListSchema,
    foodAllergies: foodListSchema,
  })
  .strict()
  .superRefine((profile, context) => {
    const dislikedFoods = normalizedFoodSet(profile.dislikedFoods);
    const foodRestrictions = normalizedFoodSet(profile.foodRestrictions);
    const foodAllergies = normalizedFoodSet(profile.foodAllergies);

    for (const likedFood of profile.likedFoods) {
      const normalizedLikedFood = likedFood.toLowerCase();

      if (dislikedFoods.has(normalizedLikedFood)) {
        context.addIssue({
          code: "custom",
          path: ["likedFoods"],
          message: `${likedFood} cannot be both liked and disliked`,
        });
      }

      if (foodAllergies.has(normalizedLikedFood)) {
        context.addIssue({
          code: "custom",
          path: ["likedFoods"],
          message: `${likedFood} cannot be both liked and an allergen`,
        });
      }

      if (foodRestrictions.has(normalizedLikedFood)) {
        context.addIssue({
          code: "custom",
          path: ["likedFoods"],
          message: `${likedFood} cannot be both liked and restricted`,
        });
      }
    }
  });

export type ProfileInput = z.infer<typeof profileSchema>;
