import assert from "node:assert/strict";
import test from "node:test";

import {
  generateMealPlan,
  MealPlanGenerationError,
} from "../dist/services/meal-plan-generation.service.js";
import { MealPlanError } from "../dist/services/meal-plan.service.js";
import { OpenAIServiceError } from "../dist/services/openai.service.js";
import { validateGeneratedMealPlan } from "../dist/schemas/meal-plan.schema.js";

const profileSnapshot = {
  birthDate: "1990-01-01",
  ageYears: 36,
  sex: "FEMALE",
  heightCm: 165,
  weightKg: 60,
  goal: "MAINTENANCE",
  activityLevel: "MODERATE",
  mealsPerDay: 3,
  weeklyFoodBudget: 300,
  foodPreferences: [],
  likedFoods: [],
  dislikedFoods: [],
  foodRestrictions: [],
  foodAllergies: [],
};

const createdEvent = {
  id: "event-1",
  status: "PENDING",
};

function createDependencies(overrides = {}) {
  const calls = {
    prepare: 0,
    reserve: 0,
    generate: 0,
    persist: 0,
    findExisting: 0,
    getState: 0,
    fail: 0,
  };

  const dependencies = {
    prepare: async () => {
      calls.prepare += 1;
      return { profileSnapshot, prompt: { instructions: "", input: "" } };
    },
    reserve: async () => {
      calls.reserve += 1;
      return {
        event: createdEvent,
        usage: {},
        reservationCreated: true,
      };
    },
    generate: async () => {
      calls.generate += 1;
      return { plan: { valid: true }, model: "mock-model", responseId: "resp-1" };
    },
    persist: async () => {
      calls.persist += 1;
      return {
        mealPlan: { id: "plan-1", userId: "user-a" },
        usage: {
          freeUsesLimit: 3,
          freeUsesConsumed: 1,
          freeUsesReserved: 0,
          freeUsesAvailable: 2,
        },
      };
    },
    findExisting: async () => {
      calls.findExisting += 1;
      return { mealPlan: { id: "plan-1" }, usage: { freeUsesConsumed: 1 } };
    },
    getState: async () => {
      calls.getState += 1;
      return { status: "PENDING", mealPlan: null };
    },
    fail: async () => {
      calls.fail += 1;
      return {};
    },
    ...overrides,
  };

  return { calls, dependencies };
}

test("missing profile does not reserve or call OpenAI", async () => {
  const { calls, dependencies } = createDependencies({
    prepare: async () => {
      calls.prepare += 1;
      throw new MealPlanError(404, "PROFILE_NOT_FOUND", "Profile is required");
    },
  });

  await assert.rejects(() => generateMealPlan("user-a", "key", dependencies));
  assert.equal(calls.reserve, 0);
  assert.equal(calls.generate, 0);
});

test("valid generation calls OpenAI once and consumes the reservation", async () => {
  const { calls, dependencies } = createDependencies();
  const result = await generateMealPlan("user-a", "key", dependencies);

  assert.equal(result.outcome, "CREATED");
  assert.equal(result.usage.freeUsesConsumed, 1);
  assert.equal(result.usage.freeUsesReserved, 0);
  assert.equal(calls.generate, 1);
  assert.equal(calls.persist, 1);
});

test("OpenAI failure fails the pending reservation without consuming usage", async () => {
  const state = { status: "PENDING", consumed: 0, reserved: 1 };
  const { calls, dependencies } = createDependencies({
    generate: async () => {
      calls.generate += 1;
      throw new OpenAIServiceError(
        503,
        "AI_TEMPORARILY_UNAVAILABLE",
        "temporarily unavailable",
      );
    },
    fail: async () => {
      calls.fail += 1;
      state.status = "FAILED";
      state.reserved -= 1;
    },
  });

  await assert.rejects(
    () => generateMealPlan("user-a", "key", dependencies),
    (error) => error.code === "AI_TEMPORARILY_UNAVAILABLE",
  );
  assert.equal(calls.persist, 0);
  assert.equal(calls.fail, 1);
  assert.deepEqual(state, { status: "FAILED", consumed: 0, reserved: 0 });
});

test("invalid structured response is rejected by Zod and releases usage", async () => {
  const validation = validateGeneratedMealPlan({}, profileSnapshot.mealsPerDay);
  assert.equal(validation.success, false);
  const state = { status: "PENDING", consumed: 0, reserved: 1 };

  const { calls, dependencies } = createDependencies({
    generate: async () => {
      calls.generate += 1;
      throw new OpenAIServiceError(502, "AI_INVALID_RESPONSE", "invalid response");
    },
    fail: async () => {
      calls.fail += 1;
      state.status = "FAILED";
      state.reserved -= 1;
    },
  });

  await assert.rejects(
    () => generateMealPlan("user-a", "key", dependencies),
    (error) => error.code === "AI_INVALID_RESPONSE",
  );
  assert.equal(calls.persist, 0);
  assert.equal(calls.fail, 1);
  assert.deepEqual(state, { status: "FAILED", consumed: 0, reserved: 0 });
});

test("no available usage prevents an OpenAI call", async () => {
  const { calls, dependencies } = createDependencies({
    reserve: async () => {
      calls.reserve += 1;
      throw new Error("FREE_USAGE_LIMIT_REACHED");
    },
  });

  await assert.rejects(() => generateMealPlan("user-a", "key", dependencies));
  assert.equal(calls.generate, 0);
});

test("retry of a consumed event returns the same plan without OpenAI", async () => {
  const { calls, dependencies } = createDependencies({
    reserve: async () => {
      calls.reserve += 1;
      return {
        event: { id: "event-1", status: "CONSUMED" },
        usage: {},
        reservationCreated: false,
      };
    },
  });
  const result = await generateMealPlan("user-a", "key", dependencies);

  assert.equal(result.outcome, "EXISTING");
  assert.equal(result.mealPlan.id, "plan-1");
  assert.equal(calls.generate, 0);
  assert.equal(calls.findExisting, 1);
});

test("retry of a pending event returns 202 semantics without OpenAI", async () => {
  const { calls, dependencies } = createDependencies({
    reserve: async () => {
      calls.reserve += 1;
      return {
        event: { id: "event-1", status: "PENDING" },
        usage: {},
        reservationCreated: false,
      };
    },
  });
  const result = await generateMealPlan("user-a", "key", dependencies);

  assert.deepEqual(result, { outcome: "PENDING", operationId: "event-1" });
  assert.equal(calls.generate, 0);
});

test("concurrent retries have one reservation owner and one OpenAI call", async () => {
  let reservationAttempts = 0;
  let releaseGeneration;
  const generationGate = new Promise((resolve) => {
    releaseGeneration = resolve;
  });
  const { calls, dependencies } = createDependencies({
    reserve: async () => {
      calls.reserve += 1;
      reservationAttempts += 1;
      return {
        event: createdEvent,
        usage: {},
        reservationCreated: reservationAttempts === 1,
      };
    },
    generate: async () => {
      calls.generate += 1;
      await generationGate;
      return { plan: {}, model: "mock-model", responseId: "resp-1" };
    },
  });

  const owner = generateMealPlan("user-a", "key", dependencies);
  const retry = await generateMealPlan("user-a", "key", dependencies);
  assert.equal(retry.outcome, "PENDING");
  releaseGeneration();
  await owner;

  assert.equal(calls.generate, 1);
  assert.equal(calls.persist, 1);
});

test("user A cannot retrieve user B plan through a consumed event", async () => {
  const { calls, dependencies } = createDependencies({
    reserve: async () => ({
      event: { id: "event-b", status: "CONSUMED" },
      usage: {},
      reservationCreated: false,
    }),
    findExisting: async (userId) => {
      calls.findExisting += 1;
      assert.equal(userId, "user-a");
      throw new MealPlanError(404, "MEAL_PLAN_NOT_FOUND", "Meal plan not found");
    },
  });

  await assert.rejects(
    () => generateMealPlan("user-a", "key", dependencies),
    (error) => error.code === "MEAL_PLAN_NOT_FOUND",
  );
  assert.equal(calls.generate, 0);
});

test("failed or released idempotency key requires a new key", async () => {
  for (const status of ["FAILED", "RELEASED"]) {
    const { calls, dependencies } = createDependencies({
      reserve: async () => ({
        event: { id: "event-1", status },
        usage: {},
        reservationCreated: false,
      }),
    });

    await assert.rejects(
      () => generateMealPlan("user-a", "key", dependencies),
      (error) =>
        error instanceof MealPlanGenerationError &&
        error.code === "IDEMPOTENCY_KEY_FINALIZED",
    );
    assert.equal(calls.generate, 0);
  }
});

test("idempotency key used by another action returns conflict without OpenAI", async () => {
  const { calls, dependencies } = createDependencies({
    reserve: async () => {
      calls.reserve += 1;
      throw new MealPlanGenerationError(
        409,
        "IDEMPOTENCY_KEY_CONFLICT",
        "conflict",
      );
    },
  });

  await assert.rejects(
    () => generateMealPlan("user-a", "key", dependencies),
    (error) => error.code === "IDEMPOTENCY_KEY_CONFLICT",
  );
  assert.equal(calls.generate, 0);
});

test("persistence error does not fail an event already consumed with a plan", async () => {
  const { calls, dependencies } = createDependencies({
    persist: async () => {
      calls.persist += 1;
      throw new Error("response transport failed after persistence");
    },
    getState: async () => {
      calls.getState += 1;
      return { status: "CONSUMED", mealPlan: { id: "plan-1" } };
    },
  });

  await assert.rejects(() => generateMealPlan("user-a", "key", dependencies));
  assert.equal(calls.fail, 0);
});
