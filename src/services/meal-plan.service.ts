import type { Profile } from "../generated/prisma/client.js";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import {
  buildMealPlanPrompt,
  type MealPlanPrompt,
} from "../prompts/meal-plan.prompt.js";
import {
  type GeneratedMealPlan,
  validateGeneratedMealPlan,
} from "../schemas/meal-plan.schema.js";

interface UsageCountersRow {
  freeUsesLimit: number;
  freeUsesConsumed: number;
  freeUsesReserved: number;
}

interface TransitionedEventRow {
  id: string;
  entitlement: "FREE" | "SUBSCRIPTION";
}

export interface ProfileSnapshot {
  birthDate: string;
  ageYears: number;
  sex: Profile["sex"];
  heightCm: number;
  weightKg: number;
  goal: Profile["goal"];
  activityLevel: Profile["activityLevel"];
  mealsPerDay: number;
  weeklyFoodBudget: number;
  foodPreferences: string[];
  likedFoods: string[];
  dislikedFoods: string[];
  foodRestrictions: string[];
  foodAllergies: string[];
}

export interface MealPlanGenerationContext {
  profileSnapshot: ProfileSnapshot;
  prompt: MealPlanPrompt;
}

export interface PersistMealPlanInput {
  userId: string;
  usageEventId: string;
  generatedPlan: unknown;
  profileSnapshot: ProfileSnapshot;
  model: string;
  promptVersion: string;
  openaiResponseId?: string;
}

export class MealPlanError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const BRAZIL_TIME_ZONE = "America/Sao_Paulo";

function getBrazilCivilDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BRAZIL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function calculateAgeYears(
  birthDate: string,
  todayCivilDate = getBrazilCivilDate(),
): number {
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = todayCivilDate
    .split("-")
    .map(Number);
  let age = todayYear - birthYear;
  const birthdayHasPassed =
    todayMonth > birthMonth ||
    (todayMonth === birthMonth && todayDay >= birthDay);

  if (!birthdayHasPassed) {
    age -= 1;
  }

  return age;
}

export function createProfileSnapshot(profile: Profile): ProfileSnapshot {
  const heightCm = profile.heightCm.toNumber();
  const weightKg = profile.weightKg.toNumber();
  const weeklyFoodBudget = profile.weeklyFoodBudget.toNumber();
  const birthDate = profile.birthDate.toISOString().slice(0, 10);
  const ageYears = calculateAgeYears(birthDate);

  if (
    ageYears < 0 ||
    !Number.isFinite(heightCm) ||
    heightCm <= 0 ||
    !Number.isFinite(weightKg) ||
    weightKg <= 0 ||
    !Number.isFinite(weeklyFoodBudget) ||
    weeklyFoodBudget < 0 ||
    !Number.isInteger(profile.mealsPerDay) ||
    profile.mealsPerDay < 1 ||
    profile.mealsPerDay > 10
  ) {
    throw new MealPlanError(
      422,
      "PROFILE_NOT_READY_FOR_GENERATION",
      "Profile data is not valid for meal plan generation",
    );
  }

  return {
    birthDate,
    ageYears,
    sex: profile.sex,
    heightCm,
    weightKg,
    goal: profile.goal,
    activityLevel: profile.activityLevel,
    mealsPerDay: profile.mealsPerDay,
    weeklyFoodBudget,
    foodPreferences: [...profile.foodPreferences],
    likedFoods: [...profile.likedFoods],
    dislikedFoods: [...profile.dislikedFoods],
    foodRestrictions: [...profile.foodRestrictions],
    foodAllergies: [...profile.foodAllergies],
  };
}

export async function prepareMealPlanGeneration(
  userId: string,
): Promise<MealPlanGenerationContext> {
  const profile = await prisma.profile.findUnique({ where: { userId } });

  if (!profile) {
    throw new MealPlanError(
      404,
      "PROFILE_NOT_FOUND",
      "Profile is required for meal plan generation",
    );
  }

  const profileSnapshot = createProfileSnapshot(profile);

  return {
    profileSnapshot,
    prompt: buildMealPlanPrompt(profileSnapshot),
  };
}

function serializeUsage(usage: UsageCountersRow) {
  return {
    freeUsesLimit: usage.freeUsesLimit,
    freeUsesConsumed: usage.freeUsesConsumed,
    freeUsesReserved: usage.freeUsesReserved,
    freeUsesAvailable:
      usage.freeUsesLimit -
      usage.freeUsesConsumed -
      usage.freeUsesReserved,
  };
}

export async function persistMealPlanAndConfirmUsage(
  input: PersistMealPlanInput,
) {
  const validation = validateGeneratedMealPlan(
    input.generatedPlan,
    input.profileSnapshot.mealsPerDay,
  );

  if (!validation.success) {
    throw new MealPlanError(
      502,
      "INVALID_GENERATED_MEAL_PLAN",
      "Generated meal plan does not match the required schema",
    );
  }

  if (!input.model.trim() || !input.promptVersion.trim()) {
    throw new MealPlanError(
      500,
      "INVALID_GENERATION_METADATA",
      "Generation metadata is invalid",
    );
  }

  return prisma.$transaction(async (transaction) => {
    const existingMealPlan = await transaction.mealPlan.findUnique({
      where: { usageEventId: input.usageEventId },
    });

    if (existingMealPlan) {
      if (existingMealPlan.userId !== input.userId) {
        throw new MealPlanError(404, "MEAL_PLAN_NOT_FOUND", "Meal plan not found");
      }

      const usage = await transaction.usageControl.findUniqueOrThrow({
        where: { userId: input.userId },
        select: {
          freeUsesLimit: true,
          freeUsesConsumed: true,
          freeUsesReserved: true,
        },
      });

      return { mealPlan: existingMealPlan, usage: serializeUsage(usage) };
    }

    const transitioned = await transaction.$queryRaw<TransitionedEventRow[]>`
      UPDATE "UsageEvent"
      SET
        "status" = 'CONSUMED'::"UsageStatus",
        "finalizedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.usageEventId}::uuid
        AND "userId" = ${input.userId}::uuid
        AND "action" = 'PLAN_GENERATION'::"UsageAction"
        AND "status" = 'PENDING'::"UsageStatus"
      RETURNING "id", "entitlement"
    `;

    if (transitioned.length === 0) {
      const event = await transaction.usageEvent.findFirst({
        where: { id: input.usageEventId, userId: input.userId },
      });

      if (!event) {
        throw new MealPlanError(404, "USAGE_EVENT_NOT_FOUND", "Usage event not found");
      }

      if (event.status === "CONSUMED" && event.action === "PLAN_GENERATION") {
        const persistedMealPlan = await transaction.mealPlan.findUnique({
          where: { usageEventId: input.usageEventId },
        });

        if (!persistedMealPlan) {
          throw new MealPlanError(
            500,
            "MEAL_PLAN_PERSISTENCE_INCONSISTENT",
            "Consumed usage event does not have a meal plan",
          );
        }

        const usage = await transaction.usageControl.findUniqueOrThrow({
          where: { userId: input.userId },
          select: {
            freeUsesLimit: true,
            freeUsesConsumed: true,
            freeUsesReserved: true,
          },
        });

        return {
          mealPlan: persistedMealPlan,
          usage: serializeUsage(usage),
        };
      }

      throw new MealPlanError(
        409,
        "USAGE_EVENT_STATE_CONFLICT",
        `Usage event cannot generate a meal plan from status ${event.status}`,
      );
    }

    const generatedPlan: GeneratedMealPlan = validation.data;
    const mealPlan = await transaction.mealPlan.create({
      data: {
        userId: input.userId,
        usageEventId: input.usageEventId,
        title: generatedPlan.title,
        content: generatedPlan as Prisma.InputJsonValue,
        profileSnapshot: input.profileSnapshot as unknown as Prisma.InputJsonValue,
        model: input.model.trim(),
        promptVersion: input.promptVersion.trim(),
        openaiResponseId: input.openaiResponseId?.trim() || null,
      },
    });

    const updatedUsage = transitioned[0].entitlement === "SUBSCRIPTION"
      ? [await transaction.usageControl.findUniqueOrThrow({
          where: { userId: input.userId },
          select: {
            freeUsesLimit: true,
            freeUsesConsumed: true,
            freeUsesReserved: true,
          },
        })]
      : await transaction.$queryRaw<UsageCountersRow[]>`
      UPDATE "UsageControl"
      SET
        "freeUsesReserved" = "freeUsesReserved" - 1,
        "freeUsesConsumed" = "freeUsesConsumed" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${input.userId}::uuid
        AND "freeUsesReserved" > 0
      RETURNING
        "freeUsesLimit",
        "freeUsesConsumed",
        "freeUsesReserved"
    `;

    if (updatedUsage.length === 0) {
      throw new MealPlanError(
        500,
        "USAGE_COUNTER_INCONSISTENT",
        "Usage counters are inconsistent",
      );
    }

    return { mealPlan, usage: serializeUsage(updatedUsage[0]) };
  });
}

export async function listMealPlans(
  userId: string,
  options: { cursor?: string; limit: number },
) {
  if (options.cursor) {
    const cursorExists = await prisma.mealPlan.findFirst({
      where: { id: options.cursor, userId },
      select: { id: true },
    });

    if (!cursorExists) {
      throw new MealPlanError(400, "INVALID_CURSOR", "Invalid meal plan cursor");
    }
  }

  const mealPlans = await prisma.mealPlan.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: options.limit + 1,
    ...(options.cursor
      ? {
          cursor: { id: options.cursor },
          skip: 1,
        }
      : {}),
    select: {
      id: true,
      title: true,
      model: true,
      promptVersion: true,
      schemaVersion: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const hasNextPage = mealPlans.length > options.limit;
  const page = hasNextPage ? mealPlans.slice(0, options.limit) : mealPlans;

  return {
    mealPlans: page,
    nextCursor: hasNextPage ? page.at(-1)?.id ?? null : null,
  };
}

export async function getMealPlan(userId: string, mealPlanId: string) {
  const mealPlan = await prisma.mealPlan.findFirst({
    where: { id: mealPlanId, userId },
    select: {
      id: true,
      title: true,
      content: true,
      model: true,
      promptVersion: true,
      schemaVersion: true,
      openaiResponseId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!mealPlan) {
    throw new MealPlanError(404, "MEAL_PLAN_NOT_FOUND", "Meal plan not found");
  }

  return mealPlan;
}

export async function getMealPlanByUsageEvent(
  userId: string,
  usageEventId: string,
) {
  const mealPlan = await prisma.mealPlan.findUnique({
    where: { usageEventId },
  });

  if (!mealPlan || mealPlan.userId !== userId) {
    throw new MealPlanError(404, "MEAL_PLAN_NOT_FOUND", "Meal plan not found");
  }

  const usage = await prisma.usageControl.findUniqueOrThrow({
    where: { userId },
    select: {
      freeUsesLimit: true,
      freeUsesConsumed: true,
      freeUsesReserved: true,
    },
  });

  return { mealPlan, usage: serializeUsage(usage) };
}

export async function getMealPlanGenerationState(
  userId: string,
  usageEventId: string,
) {
  return prisma.usageEvent.findFirst({
    where: { id: usageEventId, userId },
    select: {
      status: true,
      mealPlan: { select: { id: true } },
    },
  });
}
