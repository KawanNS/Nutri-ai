import { z } from "zod";

const boundedText = (maximum: number) =>
  z.string().trim().min(1, "Value cannot be empty").max(maximum);

const finiteNumber = z.number().finite();

const nutritionSchema = z
  .object({
    caloriesKcal: finiteNumber.nonnegative().max(20_000),
    proteinGrams: finiteNumber.nonnegative().max(1_000),
    carbohydrateGrams: finiteNumber.nonnegative().max(2_000),
    fatGrams: finiteNumber.nonnegative().max(1_000),
  })
  .strict();

const foodItemSchema = z
  .object({
    name: boundedText(120),
    quantity: finiteNumber.positive().max(100_000),
    unit: boundedText(30),
  })
  .strict();

const mealSchema = z
  .object({
    name: boundedText(100),
    suggestedTime: z.string().trim().min(1).max(20).nullable(),
    foods: z.array(foodItemSchema).min(1).max(20),
    preparation: boundedText(2_000),
    estimatedNutrition: nutritionSchema,
  })
  .strict();

const daySchema = z
  .object({
    day: z.number().int().min(1).max(7),
    label: boundedText(50),
    meals: z.array(mealSchema).min(1).max(10),
    estimatedDailyCost: finiteNumber.nonnegative().max(1_000_000),
  })
  .strict();

const shoppingCategorySchema = z
  .object({
    category: boundedText(80),
    items: z.array(foodItemSchema).min(1).max(50),
  })
  .strict();

export const generatedMealPlanSchema = z
  .object({
    title: boundedText(160),
    summary: boundedText(2_000),
    durationDays: z.literal(7),
    currency: z.literal("BRL"),
    dailyTargets: nutritionSchema,
    days: z.array(daySchema).length(7),
    shoppingList: z.array(shoppingCategorySchema).min(1).max(20),
    estimatedWeeklyCost: finiteNumber.nonnegative().max(10_000_000),
    notes: z.array(boundedText(500)).min(1).max(20),
    safetyNotices: z.array(boundedText(500)).min(1).max(20),
  })
  .strict();

export type GeneratedMealPlan = z.infer<typeof generatedMealPlanSchema>;

export function validateGeneratedMealPlan(
  input: unknown,
  mealsPerDay: number,
) {
  return generatedMealPlanSchema
    .superRefine((plan, context) => {
      const days = new Set(plan.days.map((day) => day.day));

      if (days.size !== 7) {
        context.addIssue({
          code: "custom",
          path: ["days"],
          message: "Days must contain each number from 1 through 7 exactly once",
        });
      }

      plan.days.forEach((day, index) => {
        if (day.meals.length !== mealsPerDay) {
          context.addIssue({
            code: "custom",
            path: ["days", index, "meals"],
            message: `Day must contain exactly ${mealsPerDay} meals`,
          });
        }
      });
    })
    .safeParse(input);
}

export const mealPlanIdSchema = z.string().uuid("Meal plan id must be a valid UUID");

export const mealPlanListQuerySchema = z
  .object({
    cursor: z.string().uuid("Cursor must be a valid UUID").optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
