import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createGeminiAdapter } from "../dist/ai/adapters/gemini.adapter.js";
import { createAIRouter } from "../dist/ai/ai-router.js";
import { createAIRoutingPolicy } from "../dist/ai/ai-routing-policy.js";
import { AIRouterError } from "../dist/ai/ai-router.types.js";
import { generateMealPlanWithAI } from "../dist/services/ai-provider.service.js";
import { AIProviderError } from "../dist/services/ai-provider.types.js";

const configuredModel = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
const route = {
  task: "MEAL_PLAN_GENERATION",
  provider: "GEMINI",
  model: configuredModel,
};

const request = {
  task: "MEAL_PLAN_GENERATION",
  instructions: "system instructions",
  input: "normalized input",
  responseFormat: "STRUCTURED_JSON",
  timeoutMs: 60_000,
};

function validMealPlan() {
  const nutrition = {
    caloriesKcal: 500,
    proteinGrams: 30,
    carbohydrateGrams: 60,
    fatGrams: 15,
  };
  const meal = (name) => ({
    name,
    suggestedTime: null,
    foods: [{ name: "Arroz", quantity: 100, unit: "g" }],
    preparation: "Preparar e servir.",
    estimatedNutrition: nutrition,
  });
  return {
    title: "Plano semanal",
    summary: "Plano alimentar geral.",
    durationDays: 7,
    currency: "BRL",
    dailyTargets: nutrition,
    days: Array.from({ length: 7 }, (_, index) => ({
      day: index + 1,
      label: `Dia ${index + 1}`,
      meals: [meal("Café da manhã"), meal("Almoço"), meal("Jantar")],
      estimatedDailyCost: 40,
    })),
    shoppingList: [{ category: "Grãos", items: [{ name: "Arroz", quantity: 700, unit: "g" }] }],
    estimatedWeeklyCost: 280,
    notes: ["Valores estimados."],
    safetyNotices: ["Respeitar alergias e restrições."],
  };
}

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

function fakeGemini(options = {}) {
  let calls = 0;
  let received;
  const credentials = [];
  const client = {
    models: {
      async generateContent(input) {
        calls += 1;
        received = input;
        if (options.error) throw options.error;
        return options.response ?? {
          text: JSON.stringify(validMealPlan()),
          responseId: "safe-request-id",
          candidates: [{ finishReason: "STOP" }],
        };
      },
    },
  };
  const adapter = createGeminiAdapter({
    apiKey: options.apiKey === undefined ? "test-key-never-logged" : options.apiKey,
    createClient: (apiKey) => {
      credentials.push(apiKey);
      return client;
    },
    now: options.now ?? (() => 100),
  });
  return {
    adapter,
    calls: () => calls,
    credentials: () => credentials,
    received: () => received,
  };
}

function routerWith(adapter, extra = {}) {
  return createAIRouter({
    policy: createAIRoutingPolicy(configuredModel),
    adapters: [adapter, ...(extra.adapters ?? [])],
    observe: extra.observe,
    now: extra.now,
  });
}

test("MEAL_PLAN_GENERATION selects Gemini", async () => {
  const fake = fakeGemini();
  const result = await routerWith(fake.adapter).route(request);
  assert.equal(result.provider, "GEMINI");
  assert.equal(fake.calls(), 1);
});

test("routing policy selects the current model", () => {
  assert.equal(createAIRoutingPolicy(configuredModel).MEAL_PLAN_GENERATION.model, route.model);
});

test("Gemini adapter receives the normalized request mapping", async () => {
  const fake = fakeGemini();
  await routerWith(fake.adapter).route(request);
  assert.equal(fake.received().contents, request.input);
  assert.equal(fake.received().config.systemInstruction, request.instructions);
  assert.equal(fake.received().config.httpOptions.timeout, request.timeoutMs);
  assert.equal(fake.received().config.responseMimeType, "application/json");
});

test("Gemini response is normalized without exposing SDK objects", async () => {
  const result = await routerWith(fakeGemini().adapter).route(request);
  assert.deepEqual(Object.keys(result).sort(), [
    "content", "finishReason", "latencyMs", "model", "provider", "requestId", "usage",
  ]);
  assert.equal(result.finishReason, "STOP");
});

test("structured output still passes JSON and Zod validation through the meal-plan entry point", async () => {
  const result = await generateMealPlanWithAI(profileSnapshot, {
    router: routerWith(fakeGemini().adapter),
  });
  assert.equal(result.plan.days.length, 7);
  assert.equal(result.provider, "gemini");
});

test("provider 5xx becomes a retryable normalized error", async () => {
  const fake = fakeGemini({ error: { status: 503 } });
  await assert.rejects(() => routerWith(fake.adapter).route(request), (error) =>
    error instanceof AIRouterError && error.code === "AI_PROVIDER_UNAVAILABLE" && error.retryable);
});

test("timeout becomes a retryable normalized error", async () => {
  const fake = fakeGemini({ error: { name: "TimeoutError" } });
  await assert.rejects(() => fake.adapter.generate(request, route), (error) =>
    error instanceof AIRouterError && error.code === "AI_TIMEOUT" && error.retryable);
});

test("rate limit becomes a retryable normalized error", async () => {
  const fake = fakeGemini({ error: { status: 429 } });
  await assert.rejects(() => fake.adapter.generate(request, route), (error) =>
    error instanceof AIRouterError && error.code === "AI_RATE_LIMIT" && error.retryable);
});

test("authentication error becomes a non-retryable normalized error", async () => {
  const fake = fakeGemini({ error: { status: 401 } });
  await assert.rejects(() => fake.adapter.generate(request, route), (error) =>
    error instanceof AIRouterError && error.code === "AI_AUTH_ERROR" && !error.retryable);
});

test("empty provider response is blocked", async () => {
  const fake = fakeGemini({ response: { text: "   " } });
  await assert.rejects(() => fake.adapter.generate(request, route), (error) =>
    error instanceof AIRouterError && error.code === "AI_INVALID_RESPONSE");
});

test("schema failure is blocked and preserves the public error contract", async () => {
  const fake = fakeGemini({ response: { text: JSON.stringify({ invalid: true }) } });
  await assert.rejects(
    () => generateMealPlanWithAI(profileSnapshot, { router: routerWith(fake.adapter) }),
    (error) => error instanceof AIProviderError && error.code === "AI_INVALID_RESPONSE" && error.statusCode === 502,
  );
});

test("malformed JSON is blocked and preserves the public error contract", async () => {
  const fake = fakeGemini({ response: { text: "{not-json" } });
  await assert.rejects(
    () => generateMealPlanWithAI(profileSnapshot, { router: routerWith(fake.adapter) }),
    (error) => error instanceof AIProviderError && error.code === "AI_INVALID_RESPONSE" && error.statusCode === 502,
  );
  assert.equal(fake.calls(), 1);
});

test("there is no automatic retry", async () => {
  const fake = fakeGemini({ error: { status: 503 } });
  await assert.rejects(() => routerWith(fake.adapter).route(request));
  assert.equal(fake.calls(), 1);
});

test("there is no automatic fallback", async () => {
  let unrelatedCalls = 0;
  const unrelated = { provider: "FUTURE_PROVIDER", health: () => ({ provider: "FUTURE_PROVIDER", status: "CONFIGURED" }), generate: async () => { unrelatedCalls += 1; } };
  const fake = fakeGemini({ error: { status: 503 } });
  await assert.rejects(() => routerWith(fake.adapter, { adapters: [unrelated] }).route(request));
  assert.equal(unrelatedCalls, 0);
});

test("one generation uses only the configured credential once", async () => {
  const fake = fakeGemini({ apiKey: "single-test-key" });
  await routerWith(fake.adapter).route(request);
  assert.deepEqual(fake.credentials(), ["single-test-key"]);
  assert.equal(fake.calls(), 1);
});

test("API key never appears in normalized errors", async () => {
  const secret = "super-secret-test-key";
  const fake = fakeGemini({ apiKey: secret, error: new Error(secret) });
  await assert.rejects(() => fake.adapter.generate(request, route), (error) =>
    error instanceof AIRouterError && !JSON.stringify(error).includes(secret) && !error.message.includes(secret));
});

test("safe observation never contains prompt or response content", async () => {
  const observations = [];
  await routerWith(fakeGemini().adapter, { observe: (event) => observations.push(event) }).route(request);
  const serialized = JSON.stringify(observations);
  assert.equal(serialized.includes(request.instructions), false);
  assert.equal(serialized.includes(request.input), false);
  assert.deepEqual(Object.keys(observations[0]).sort(), ["errorCode", "latencyMs", "model", "provider", "success", "task"]);
});

test("missing usage remains unknown as null", async () => {
  const usage = (await fakeGemini().adapter.generate(request, route)).usage;
  assert.deepEqual(usage, { inputTokens: null, outputTokens: null, totalTokens: null, cachedInputTokens: null, reasoningTokens: null });
});

test("available Gemini usage is normalized", async () => {
  const fake = fakeGemini({ response: { text: "{}", usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30, cachedContentTokenCount: 2, thoughtsTokenCount: 4 } } });
  assert.deepEqual((await fake.adapter.generate(request, route)).usage, { inputTokens: 10, outputTokens: 20, totalTokens: 30, cachedInputTokens: 2, reasoningTokens: 4 });
});

test("health performs no external call", () => {
  const fake = fakeGemini();
  assert.deepEqual(fake.adapter.health(), { provider: "GEMINI", status: "CONFIGURED" });
  assert.equal(fake.calls(), 0);
});

test("unconfigured provider fails closed without external call", async () => {
  const fake = fakeGemini({ apiKey: null });
  assert.equal(fake.adapter.health().status, "NOT_CONFIGURED");
  await assert.rejects(() => fake.adapter.generate(request, route), (error) =>
    error instanceof AIRouterError && error.code === "AI_CONFIGURATION_ERROR" && !error.retryable);
  assert.equal(fake.calls(), 0);
});

test("unknown task fails closed without provider call", async () => {
  const fake = fakeGemini();
  await assert.rejects(() => routerWith(fake.adapter).route({ ...request, task: "PRIVATE_UNKNOWN_TASK" }), (error) =>
    error instanceof AIRouterError && error.code === "AI_UNSUPPORTED_TASK");
  assert.equal(fake.calls(), 0);
});

test("unsafe request id is discarded", async () => {
  const fake = fakeGemini({ response: { text: "{}", responseId: "secret id with spaces" } });
  assert.equal((await fake.adapter.generate(request, route)).requestId, null);
});

test("model and Gemini SDK references do not leak into meal-plan domain services", async () => {
  const sources = await Promise.all([
    readFile("src/services/meal-plan-generation.service.ts", "utf8"),
    readFile("src/services/meal-plan.service.ts", "utf8"),
    readFile("src/services/ai-provider.service.ts", "utf8"),
  ]);
  assert.equal(sources.some((source) => source.includes("@google/genai")), false);
  assert.equal(sources.some((source) => source.includes("gemini-3.5-flash-lite")), false);
  assert.equal(sources[2].includes('provider: "gemini"'), false);
});
