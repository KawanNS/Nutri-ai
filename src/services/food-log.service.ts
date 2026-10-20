import { prisma } from "../lib/prisma.js";
import type { FoodLogListQuery } from "../schemas/food-log.schema.js";

interface DecimalValue {
  toString(): string;
}

interface FoodLogItemRecord {
  id: string;
  name: string;
  portionDescription: string;
}

interface FoodLogRecord {
  id: string;
  consumedAt: Date;
  estimatedCaloriesKcal: DecimalValue | null;
  estimatedProteinGrams: DecimalValue | null;
  estimatedCarbohydrateGrams: DecimalValue | null;
  estimatedFatGrams: DecimalValue | null;
  notes: string | null;
  items: FoodLogItemRecord[];
}

export interface FoodLogStore {
  findMany(args: Record<string, unknown>): Promise<FoodLogRecord[]>;
}

const foodLogSelect = {
  id: true,
  consumedAt: true,
  estimatedCaloriesKcal: true,
  estimatedProteinGrams: true,
  estimatedCarbohydrateGrams: true,
  estimatedFatGrams: true,
  notes: true,
  items: {
    orderBy: { position: "asc" },
    select: {
      id: true,
      name: true,
      portionDescription: true,
    },
  },
} as const;

const defaultStore = prisma.foodLog as unknown as FoodLogStore;

function numberOrNull(value: DecimalValue | null): number | null {
  return value === null ? null : Number(value.toString());
}

function localDayRange(date: string, timezoneOffsetMinutes: number) {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const start = new Date(Date.UTC(year, month - 1, day) + timezoneOffsetMinutes * 60_000);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

function serializeFoodLog(foodLog: FoodLogRecord) {
  return {
    id: foodLog.id,
    consumedAt: foodLog.consumedAt.toISOString(),
    estimatedCaloriesKcal: numberOrNull(foodLog.estimatedCaloriesKcal),
    estimatedProteinGrams: numberOrNull(foodLog.estimatedProteinGrams),
    estimatedCarbohydrateGrams: numberOrNull(foodLog.estimatedCarbohydrateGrams),
    estimatedFatGrams: numberOrNull(foodLog.estimatedFatGrams),
    notes: foodLog.notes,
    items: foodLog.items.map((item) => ({
      id: item.id,
      name: item.name,
      portionDescription: item.portionDescription,
    })),
  };
}

export async function listFoodLogs(
  userId: string,
  query: FoodLogListQuery,
  store: FoodLogStore = defaultStore,
) {
  const range = localDayRange(query.date, query.timezoneOffsetMinutes);
  const foodLogs = await store.findMany({
    where: {
      userId,
      consumedAt: { gte: range.start, lt: range.end },
    },
    orderBy: [{ consumedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: foodLogSelect,
  });
  return { date: query.date, foodLogs: foodLogs.map(serializeFoodLog) };
}
