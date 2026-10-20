import { isDeepStrictEqual } from "node:util";

import { createDefaultAIRouter } from "../ai/ai-router.js";
import { AIRouterError, type AIRouter } from "../ai/ai-router.types.js";
import type { Prisma, Profile } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { buildMealSwapPrompt } from "../prompts/meal-swap.prompt.js";
import {
  type GeneratedMeal,
  type GeneratedMealPlan,
  generatedMealPlanSchema,
  mealSwapAIResponseSchema,
  type MealSwapAIResponse,
  validateGeneratedMealPlan,
} from "../schemas/meal-plan.schema.js";
import { createProfileSnapshot } from "./meal-plan.service.js";
import { getPremiumAccess } from "./subscription.service.js";

export class MealSwapError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const mealPlanSelect = {
  id: true,
  title: true,
  content: true,
  model: true,
  promptVersion: true,
  schemaVersion: true,
  openaiResponseId: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface StoredMealPlan {
  id: string;
  content: unknown;
  updatedAt: Date;
}

/** The Prisma surface this service needs, so tests can inject an in-memory fake. */
export interface MealSwapClient {
  profile: {
    findUnique(args: { where: { userId: string } }): Promise<Profile | null>;
  };
  mealPlan: {
    findFirst(args: {
      where: { id: string; userId: string };
      select: typeof mealPlanSelect;
    }): Promise<(StoredMealPlan & Record<string, unknown>) | null>;
    updateMany(args: {
      where: { id: string; userId: string; updatedAt: Date };
      data: { content: Prisma.InputJsonValue; updatedAt: Date };
    }): Promise<{ count: number }>;
  };
}

export interface MealSwapDependencies {
  client?: MealSwapClient;
  router?: AIRouter;
  getPremiumAccess?: (userId: string) => Promise<{ isPremium: boolean }>;
  now?: () => Date;
}

export interface MealSwapTarget {
  mealPlanId: string;
  day: number;
  mealIndex: number;
}

const MAX_WRITE_ATTEMPTS = 3;

function publicAIError(error: unknown): MealSwapError {
  if (error instanceof MealSwapError) return error;
  if (error instanceof AIRouterError) {
    if (["AI_RATE_LIMIT", "AI_TIMEOUT", "AI_PROVIDER_UNAVAILABLE"].includes(error.code)) {
      return new MealSwapError(503, "MEAL_SWAP_TEMPORARILY_UNAVAILABLE", "Meal swap is temporarily unavailable");
    }
    if (error.code === "AI_INVALID_RESPONSE" || error.code === "AI_SCHEMA_VALIDATION_FAILED") {
      return new MealSwapError(502, "MEAL_SWAP_INVALID_RESPONSE", "AI returned an invalid meal");
    }
  }
  return new MealSwapError(500, "MEAL_SWAP_FAILED", "Meal swap failed");
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseStoredPlan(content: unknown): GeneratedMealPlan {
  const parsed = generatedMealPlanSchema.safeParse(content);
  if (!parsed.success) {
    throw new MealSwapError(409, "MEAL_PLAN_NOT_SWAPPABLE", "This meal plan cannot be edited");
  }
  return parsed.data;
}

function findTarget(plan: GeneratedMealPlan, target: MealSwapTarget) {
  const dayIndex = plan.days.findIndex((day) => day.day === target.day);
  const day = plan.days[dayIndex];
  const meal = day?.meals[target.mealIndex];
  if (!day || !meal) {
    throw new MealSwapError(404, "MEAL_NOT_FOUND", "Meal not found in this plan");
  }
  return { dayIndex, day, meal };
}

async function requestAlternative(
  router: AIRouter,
  prompt: { instructions: string; input: string },
): Promise<MealSwapAIResponse> {
  try {
    const response = await router.route({
      task: "MEAL_REPLACEMENT",
      instructions: prompt.instructions,
      input: prompt.input,
      responseFormat: "STRUCTURED_JSON",
      timeoutMs: 45_000,
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw new AIRouterError("AI_INVALID_RESPONSE", false, "AI returned malformed JSON");
    }
    const validated = mealSwapAIResponseSchema.safeParse(parsed);
    if (!validated.success) {
      throw new AIRouterError("AI_SCHEMA_VALIDATION_FAILED", false, "AI response failed validation");
    }
    return validated.data;
  } catch (error: unknown) {
    throw publicAIError(error);
  }
}

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
const roundQuantity = (value: number) => Math.round(value * 100) / 100;

/**
 * Applies the swap's shopping-list adjustment to the existing list, in purchase quantities: what only the
 * old meal needed is subtracted (and dropped at zero), what the new meal needs is added to the matching item
 * or to the category the AI picked. A removal that matches no item is ignored: buying a little extra is safer
 * than dropping an ingredient another meal still uses. The list never ends up empty.
 */
export function applyShoppingListChanges(
  shoppingList: GeneratedMealPlan["shoppingList"],
  changes: MealSwapAIResponse["shoppingListChanges"],
): GeneratedMealPlan["shoppingList"] {
  const next = shoppingList.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item })) }));
  const find = (name: string, unit: string) => {
    for (const group of next) {
      const item = group.items.find((candidate) => normalize(candidate.name) === normalize(name) && normalize(candidate.unit) === normalize(unit));
      if (item) return { group, item };
    }
    return undefined;
  };

  for (const removal of changes.remove) {
    const found = find(removal.name, removal.unit);
    if (!found) continue;
    found.item.quantity = roundQuantity(found.item.quantity - removal.quantity);
    if (found.item.quantity <= 0) found.group.items = found.group.items.filter((item) => item !== found.item);
  }

  for (const addition of changes.add) {
    const found = find(addition.name, addition.unit);
    if (found) {
      found.item.quantity = Math.min(100_000, roundQuantity(found.item.quantity + addition.quantity));
      continue;
    }
    let group = next.find((candidate) => normalize(candidate.category) === normalize(addition.category));
    if (!group) {
      if (next.length >= 20) continue;
      group = { category: addition.category, items: [] };
      next.push(group);
    }
    if (group.items.length < 50) group.items.push({ name: addition.name, quantity: addition.quantity, unit: addition.unit });
  }

  const kept = next.filter((group) => group.items.length > 0);
  return kept.length > 0 ? kept : shoppingList;
}

/** The new meal fills the same slot: it keeps the replaced meal's name and time, only the foods change. */
function inSameSlot(replaced: GeneratedMeal, alternative: GeneratedMeal): GeneratedMeal {
  return { ...alternative, name: replaced.name, suggestedTime: replaced.suggestedTime };
}

export function applyMealSwap(
  plan: GeneratedMealPlan,
  target: MealSwapTarget,
  alternative: MealSwapAIResponse,
): GeneratedMealPlan {
  const { dayIndex, day, meal: replaced } = findTarget(plan, target);
  // The AI estimates both costs; never subtract more than the day is worth.
  const previousCost = Math.min(alternative.previousMealEstimatedCost, day.estimatedDailyCost);
  const delta = alternative.estimatedMealCost - previousCost;
  const meal = inSameSlot(replaced, alternative.meal);
  const days = plan.days.map((current, index) => index !== dayIndex ? current : {
    ...current,
    meals: current.meals.map((existing, mealIndex) => mealIndex === target.mealIndex ? meal : existing),
    estimatedDailyCost: roundMoney(Math.max(0, current.estimatedDailyCost + delta)),
  });

  return {
    ...plan,
    days,
    estimatedWeeklyCost: roundMoney(Math.max(0, plan.estimatedWeeklyCost + delta)),
    shoppingList: applyShoppingListChanges(plan.shoppingList, alternative.shoppingListChanges),
  };
}

/**
 * Replaces one meal of a saved plan with an AI-generated alternative, in place.
 * Premium (subscription or ADMIN) only, and it never touches usage counters.
 */
export async function swapMeal(
  userId: string,
  target: MealSwapTarget,
  dependencies: MealSwapDependencies = {},
) {
  const client = dependencies.client ?? (prisma as unknown as MealSwapClient);
  const access = await (dependencies.getPremiumAccess ?? getPremiumAccess)(userId);
  if (!access.isPremium) {
    throw new MealSwapError(403, "PREMIUM_REQUIRED", "Premium subscription is required");
  }

  const profile = await client.profile.findUnique({ where: { userId } });
  if (!profile) {
    throw new MealSwapError(404, "PROFILE_NOT_FOUND", "Profile is required to swap a meal");
  }
  const profileSnapshot = createProfileSnapshot(profile);

  const loadPlan = async () => {
    const stored = await client.mealPlan.findFirst({
      where: { id: target.mealPlanId, userId },
      select: mealPlanSelect,
    });
    if (!stored) {
      throw new MealSwapError(404, "MEAL_PLAN_NOT_FOUND", "Meal plan not found");
    }
    return stored;
  };

  let stored = await loadPlan();
  const original = parseStoredPlan(stored.content);
  const { day, meal: replacedMeal } = findTarget(original, target);
  const alternative = await requestAlternative(
    dependencies.router ?? createDefaultAIRouter(),
    buildMealSwapPrompt({ profile: profileSnapshot, plan: original, day, mealIndex: target.mealIndex }),
  );

  // Optimistic concurrency: another swap may have saved while the AI was answering.
  // Re-read and re-apply on top of it, as long as this exact meal was not changed.
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    if (attempt > 0) stored = await loadPlan();
    const current = parseStoredPlan(stored.content);
    if (!isDeepStrictEqual(findTarget(current, target).meal, replacedMeal)) {
      throw new MealSwapError(409, "MEAL_CHANGED_DURING_SWAP", "This meal was changed while the swap was running");
    }

    const next = applyMealSwap(current, target, alternative);
    const validation = validateGeneratedMealPlan(next, day.meals.length);
    if (!validation.success) {
      throw new MealSwapError(502, "MEAL_SWAP_INVALID_RESPONSE", "AI returned an invalid meal");
    }

    const { count } = await client.mealPlan.updateMany({
      where: { id: stored.id, userId, updatedAt: stored.updatedAt },
      data: {
        content: validation.data as Prisma.InputJsonValue,
        updatedAt: (dependencies.now ?? (() => new Date()))(),
      },
    });
    if (count === 1) {
      const mealPlan = await loadPlan();
      return {
        mealPlan,
        swappedMeal: { day: target.day, mealIndex: target.mealIndex, meal: inSameSlot(replacedMeal, alternative.meal) },
      };
    }
  }

  throw new MealSwapError(409, "MEAL_PLAN_UPDATE_CONFLICT", "The meal plan changed; try again");
}
