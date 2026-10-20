import { z } from "zod";

const civilDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD format")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "date must be a valid date");

export const foodLogListQuerySchema = z
  .object({
    date: civilDateSchema,
    timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840).default(0),
  })
  .strict();

export type FoodLogListQuery = z.infer<typeof foodLogListQuerySchema>;

export const planMealsQuerySchema = foodLogListQuerySchema;

export type PlanMealsQuery = z.infer<typeof planMealsQuerySchema>;

export const logPlanMealBodySchema = z
  .object({
    mealPlanId: z.string().uuid(),
    day: z.number().int().min(1).max(7),
    mealIndex: z.number().int().min(0).max(9),
    date: civilDateSchema,
    timezoneOffsetMinutes: z.number().int().min(-840).max(840).default(0),
  })
  .strict();

export type LogPlanMealBody = z.infer<typeof logPlanMealBodySchema>;
