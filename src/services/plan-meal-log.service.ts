import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import type { LogPlanMealBody, PlanMealsQuery } from "../schemas/food-log.schema.js";
import { localDayRange, serializeFoodLog, type FoodLogRecord } from "./food-log.service.js";

export class PlanMealLogError extends Error {
  constructor(
    readonly code: "MEAL_PLAN_NOT_FOUND" | "PLAN_MEAL_NOT_FOUND" | "PLAN_MEAL_ALREADY_LOGGED" | "PLAN_MEAL_DATE_IN_FUTURE",
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

// Only the parts of a stored plan the diary needs; other fields (or ones added later) are ignored.
const nutritionSchema = z.object({
  caloriesKcal: z.number().finite().nonnegative(),
  proteinGrams: z.number().finite().nonnegative(),
  carbohydrateGrams: z.number().finite().nonnegative(),
  fatGrams: z.number().finite().nonnegative(),
});

const planContentSchema = z.object({
  dailyTargets: nutritionSchema,
  days: z.array(z.object({
    day: z.number().int(),
    label: z.string(),
    meals: z.array(z.object({
      name: z.string().min(1).max(100),
      suggestedTime: z.string().nullable(),
      foods: z.array(z.object({ name: z.string().min(1), quantity: z.number().finite(), unit: z.string() })).min(1),
      estimatedNutrition: nutritionSchema,
    })),
  })).min(1),
});

type PlanContent = z.infer<typeof planContentSchema>;
type PlanDay = PlanContent["days"][number];

interface MealPlanRecord {
  id: string;
  createdAt: Date;
  content: unknown;
}

interface PlanMealLogClient {
  mealPlan: {
    findFirst(args: Record<string, unknown>): Promise<MealPlanRecord | null>;
  };
  foodLog: {
    findMany(args: Record<string, unknown>): Promise<Array<{ notes: string | null }>>;
    create(args: Record<string, unknown>): Promise<FoodLogRecord>;
  };
}

const defaultClient = prisma as unknown as PlanMealLogClient;

const weekdayKeys = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

function weekdayOfLabel(label: string): number | null {
  const key = label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().slice(0, 3);
  const index = weekdayKeys.indexOf(key);
  return index === -1 ? null : index;
}

function civilDayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`) / 86_400_000;
}

/**
 * The plan day shown for a civil date, matching the meal plan screen: plans labelled with weekday names
 * follow the calendar; otherwise day 1 is the day the plan was generated and the week repeats.
 */
export function planDayForDate(days: PlanDay[], createdAt: Date, date: string, timezoneOffsetMinutes: number): PlanDay | undefined {
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  const byWeekday = days.find((day) => weekdayOfLabel(day.label) === weekday);
  if (byWeekday) return byWeekday;
  const ordered = [...days].sort((a, b) => a.day - b.day);
  const createdLocalDate = new Date(createdAt.getTime() - timezoneOffsetMinutes * 60_000).toISOString().slice(0, 10);
  const elapsed = Math.max(0, Math.round(civilDayNumber(date) - civilDayNumber(createdLocalDate)));
  return ordered[elapsed % ordered.length];
}

/** Minutes after midnight for times such as "07:30", "7h30" or "12h"; null when there is no clock time. */
export function mealMinutes(suggestedTime: string | null): number | null {
  const match = suggestedTime?.match(/(\d{1,2})\s*(?:[:hH]\s*(\d{2})?)/);
  if (!match) return null;
  const hours = Number(match[1]), minutes = Number(match[2] ?? 0);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

/** The note that marks a diary entry as a meal taken from the plan; also how the diary knows it was logged. */
export function planMealNote(mealName: string): string {
  return `Refeição do plano: ${mealName}`;
}

const quantityFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function portionDescription(food: { quantity: number; unit: string }): string {
  return `${quantityFormat.format(food.quantity)} ${food.unit}`.slice(0, 240);
}

async function latestPlan(client: PlanMealLogClient, userId: string, mealPlanId?: string) {
  const record = await client.mealPlan.findFirst({
    where: mealPlanId ? { id: mealPlanId, userId } : { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, createdAt: true, content: true },
  });
  if (!record) return null;
  const content = planContentSchema.safeParse(record.content);
  return content.success ? { ...record, content: content.data } : null;
}

async function loggedNotes(client: PlanMealLogClient, userId: string, date: string, timezoneOffsetMinutes: number) {
  const range = localDayRange(date, timezoneOffsetMinutes);
  const logs = await client.foodLog.findMany({
    where: { userId, consumedAt: { gte: range.start, lt: range.end } },
    select: { notes: true },
  });
  return new Set(logs.map((log) => log.notes));
}

export async function getPlanMealsForDate(
  userId: string,
  query: PlanMealsQuery,
  client: PlanMealLogClient = defaultClient,
) {
  const plan = await latestPlan(client, userId);
  const day = plan && planDayForDate(plan.content.days, plan.createdAt, query.date, query.timezoneOffsetMinutes);
  if (!plan || !day) return { date: query.date, plan: null };
  const logged = await loggedNotes(client, userId, query.date, query.timezoneOffsetMinutes);
  return {
    date: query.date,
    plan: {
      mealPlanId: plan.id,
      day: day.day,
      label: day.label,
      dailyTargets: plan.content.dailyTargets,
      meals: day.meals.map((meal, index) => ({
        index,
        name: meal.name,
        suggestedTime: meal.suggestedTime,
        foods: meal.foods.map(({ name, quantity, unit }) => ({ name, quantity, unit })),
        estimatedNutrition: meal.estimatedNutrition,
        logged: logged.has(planMealNote(meal.name)),
      })),
    },
  };
}

export async function logPlanMeal(
  userId: string,
  body: LogPlanMealBody,
  client: PlanMealLogClient = defaultClient,
  now: Date = new Date(),
) {
  const range = localDayRange(body.date, body.timezoneOffsetMinutes);
  if (range.start.getTime() > now.getTime()) {
    throw new PlanMealLogError("PLAN_MEAL_DATE_IN_FUTURE", 400, "Meals cannot be logged for a future day");
  }
  const plan = await latestPlan(client, userId, body.mealPlanId);
  if (!plan) throw new PlanMealLogError("MEAL_PLAN_NOT_FOUND", 404, "Meal plan not found");
  const meal = plan.content.days.find((day) => day.day === body.day)?.meals[body.mealIndex];
  if (!meal) throw new PlanMealLogError("PLAN_MEAL_NOT_FOUND", 404, "Meal not found in this plan");

  const note = planMealNote(meal.name);
  if ((await loggedNotes(client, userId, body.date, body.timezoneOffsetMinutes)).has(note)) {
    throw new PlanMealLogError("PLAN_MEAL_ALREADY_LOGGED", 409, "This meal is already in the diary for this day");
  }

  // The meal's suggested time on that day; noon when the plan gives none. Never later than now.
  const minutes = mealMinutes(meal.suggestedTime) ?? 12 * 60;
  const consumedAt = new Date(Math.min(range.start.getTime() + minutes * 60_000, now.getTime()));
  const created = await client.foodLog.create({
    data: {
      userId,
      consumedAt,
      estimatedCaloriesKcal: meal.estimatedNutrition.caloriesKcal,
      estimatedProteinGrams: meal.estimatedNutrition.proteinGrams,
      estimatedCarbohydrateGrams: meal.estimatedNutrition.carbohydrateGrams,
      estimatedFatGrams: meal.estimatedNutrition.fatGrams,
      notes: note,
      uncertaintyNotes: [],
      items: {
        create: meal.foods.slice(0, 20).map((food, position) => ({
          position,
          name: food.name.slice(0, 120),
          portionDescription: portionDescription(food),
        })),
      },
    },
    select: {
      id: true,
      consumedAt: true,
      estimatedCaloriesKcal: true,
      estimatedProteinGrams: true,
      estimatedCarbohydrateGrams: true,
      estimatedFatGrams: true,
      notes: true,
      items: { orderBy: { position: "asc" }, select: { id: true, name: true, portionDescription: true } },
    },
  });
  return { foodLog: serializeFoodLog(created) };
}
