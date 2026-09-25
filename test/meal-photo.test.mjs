import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { z } from "zod";

import { createAIGatewayAdapter } from "../dist/ai/adapters/ai-gateway.adapter.js";
import { createGeminiAdapter } from "../dist/ai/adapters/gemini.adapter.js";
import { createAIRouter } from "../dist/ai/ai-router.js";
import { createAIRoutingPolicy } from "../dist/ai/ai-routing-policy.js";
import { AIRouterError } from "../dist/ai/ai-router.types.js";
import { createAIModelRegistry } from "../dist/ai/registry/ai-model.registry.js";
import { createAIProviderRegistry } from "../dist/ai/registry/ai-provider.registry.js";
import { analyzeMealPhotoController } from "../dist/controllers/meal-photo.controller.js";
import { mealPhotoRateLimit } from "../dist/middlewares/meal-photo-rate-limit.middleware.js";
import { confirmFoodLogSchema, mealPhotoAnalysisSchema } from "../dist/schemas/meal-photo.schema.js";
import { mealPhotoAnalysisInstructions } from "../dist/prompts/meal-photo.prompt.js";
import {
  analyzeMealPhoto,
  confirmMealPhotoLog,
  MAX_MEAL_PHOTO_BYTES,
  MealPhotoError,
  validateMealPhoto,
} from "../dist/services/meal-photo.service.js";

const configuredModel = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = Buffer.from("RIFF0000WEBP", "ascii");

function validAnalysis() {
  return {
    isEstimate: true,
    foods: [{
      name: "Arroz",
      portionDescription: "1 porção visual",
      estimatedCaloriesKcal: 130,
      estimatedProteinGrams: 2.5,
      estimatedCarbohydrateGrams: 28,
      estimatedFatGrams: null,
      confidence: "MEDIUM",
      limitations: ["Peso não mensurável pela foto."],
    }],
    observations: ["Óleo não visível."],
    undeterminedItems: [],
  };
}

function responseRecorder() {
  const output = {};
  return {
    output,
    response: {
      setHeader(name, value) { output.headers ??= {}; output.headers[name] = value; },
      status(code) { output.status = code; return this; },
      json(body) { output.body = body; return this; },
    },
  };
}

function fakeFoodLogDatabase() {
  const state = { logs: [], items: [] };
  return {
    state,
    client: {
      foodLog: {
        async create({ data }) {
          const id = `log-${state.logs.length + 1}`;
          const createdAt = new Date("2026-09-22T12:00:00Z");
          const log = { id, ...data, consumedAt: data.consumedAt ?? createdAt, confirmedAt: createdAt, createdAt, updatedAt: createdAt };
          delete log.items;
          const items = data.items.create.map((item, index) => ({ id: `item-${index + 1}`, foodLogId: id, ...item, createdAt, updatedAt: createdAt }));
          state.logs.push(log);
          state.items.push(...items);
          return { ...log, items };
        },
      },
    },
  };
}

test("meal-photo analysis rejects unauthenticated access before reading an upload", async () => {
  const { output, response } = responseRecorder();
  await analyzeMealPhotoController({ headers: {}, body: jpeg }, response);
  assert.equal(output.status, 401);
  assert.deepEqual(output.body, { error: "Authentication is required" });
});

test("JPEG, PNG, and WebP require matching declared MIME and real signature", () => {
  assert.equal(validateMealPhoto(jpeg, "image/jpeg").mimeType, "image/jpeg");
  assert.equal(validateMealPhoto(png, "image/png; charset=binary").mimeType, "image/png");
  assert.equal(validateMealPhoto(webp, "image/webp").mimeType, "image/webp");
  assert.throws(() => validateMealPhoto(jpeg, "image/png"), (error) => error instanceof MealPhotoError && error.code === "INVALID_IMAGE");
  assert.throws(() => validateMealPhoto(Buffer.from("not-an-image"), "image/jpeg"), (error) => error instanceof MealPhotoError && error.code === "INVALID_IMAGE");
});

test("unsupported MIME, empty image, and payload over 5 MiB are rejected", () => {
  assert.throws(() => validateMealPhoto(jpeg, "image/gif"), (error) => error instanceof MealPhotoError && error.statusCode === 415 && error.code === "UNSUPPORTED_IMAGE_TYPE");
  assert.throws(() => validateMealPhoto(Buffer.alloc(0), "image/png"), (error) => error instanceof MealPhotoError && error.statusCode === 400 && error.code === "EMPTY_IMAGE");
  assert.throws(() => validateMealPhoto(Buffer.alloc(MAX_MEAL_PHOTO_BYTES + 1), "image/png"), (error) => error instanceof MealPhotoError && error.statusCode === 413 && error.code === "IMAGE_TOO_LARGE");
});

test("analysis calls the existing AI Router once with MEAL_PHOTO_ANALYSIS and does not persist", async () => {
  let calls = 0;
  let received;
  const database = fakeFoodLogDatabase();
  const router = { health: () => [], route: async (request) => {
    calls += 1;
    received = request;
    return { content: JSON.stringify(validAnalysis()), provider: "GEMINI", model: configuredModel, latencyMs: 1, usage: {}, finishReason: "STOP", requestId: null };
  } };
  const result = await analyzeMealPhoto(jpeg, "image/jpeg", { router });
  assert.equal(result.foods[0].name, "Arroz");
  assert.equal(calls, 1);
  assert.equal(received.task, "MEAL_PHOTO_ANALYSIS");
  assert.equal(received.responseFormat, "STRUCTURED_JSON");
  assert.equal(received.image.mimeType, "image/jpeg");
  assert.equal(Buffer.from(received.image.data).equals(jpeg), true);
  assert.deepEqual(database.state, { logs: [], items: [] });
});

test("valid structured response passes Zod; malformed and semantically invalid responses fail safely", async () => {
  assert.equal(mealPhotoAnalysisSchema.safeParse(validAnalysis()).success, true);
  const missingRequired = validAnalysis();
  delete missingRequired.observations;
  const incorrectType = validAnalysis();
  incorrectType.foods[0].estimatedCaloriesKcal = "130";
  for (const content of [
    "{not-json",
    `\`\`\`json\n${JSON.stringify(validAnalysis())}\n\`\`\``,
    JSON.stringify(missingRequired),
    JSON.stringify(incorrectType),
    JSON.stringify({ ...validAnalysis(), isEstimate: false }),
  ]) {
    await assert.rejects(
      () => analyzeMealPhoto(jpeg, "image/jpeg", { router: { health: () => [], route: async () => ({ content }) } }),
      (error) => error instanceof MealPhotoError && error.statusCode === 502 && error.code === "INVALID_PHOTO_ANALYSIS",
    );
  }
});

test("meal-photo prompt embeds the exact Zod-derived JSON Schema and forbids response wrappers", () => {
  const expectedSchema = JSON.stringify(z.toJSONSchema(mealPhotoAnalysisSchema), null, 2);
  assert.equal(mealPhotoAnalysisInstructions.includes(expectedSchema), true);
  assert.match(mealPhotoAnalysisInstructions, /SOMENTE um objeto JSON válido/);
  assert.match(mealPhotoAnalysisInstructions, /Não use Markdown nem bloco/);
  assert.match(mealPhotoAnalysisInstructions, /Não crie campos extras/);
});

test("gateway errors are sanitized and never expose provider details", async () => {
  const privateMessage = "private-provider-token";
  await assert.rejects(
    () => analyzeMealPhoto(jpeg, "image/jpeg", { router: { health: () => [], route: async () => { throw new AIRouterError("AI_PROVIDER_UNAVAILABLE", true, privateMessage); } } }),
    (error) => error instanceof MealPhotoError && error.statusCode === 503 && error.code === "PHOTO_ANALYSIS_TEMPORARILY_UNAVAILABLE" && !error.message.includes(privateMessage),
  );
});

test("confirmation persists only the authenticated user's reviewed edits and item totals", async () => {
  const database = fakeFoodLogDatabase();
  const reviewed = validAnalysis().foods.map((food) => ({ ...food, name: "Arroz integral", portionDescription: "2 colheres revisadas", estimatedCaloriesKcal: 90 }));
  const result = await confirmMealPhotoLog("user-a", { foods: reviewed, notes: null, uncertaintyNotes: ["Estimativa visual"] }, { client: database.client });
  assert.equal(database.state.logs.length, 1);
  assert.equal(database.state.items.length, 1);
  assert.equal(result.userId, "user-a");
  assert.equal(result.items[0].name, "Arroz integral");
  assert.equal(result.items[0].portionDescription, "2 colheres revisadas");
  assert.equal(result.estimatedCaloriesKcal, 90);
  assert.equal(result.estimatedFatGrams, null);
});

test("confirmation contract allows add/remove edits but rejects cross-user fields", () => {
  const food = validAnalysis().foods[0];
  assert.equal(confirmFoodLogSchema.safeParse({ foods: [food, { ...food, name: "Feijão" }], uncertaintyNotes: [] }).success, true);
  assert.equal(confirmFoodLogSchema.safeParse({ foods: [food], uncertaintyNotes: [], userId: "user-b" }).success, false);
  assert.equal(confirmFoodLogSchema.safeParse({ foods: [], uncertaintyNotes: [] }).success, false);
});

test("meal-photo rate limit is per authenticated user", () => {
  const userA = { auth: { userId: "rate-user-a" } };
  const userB = { auth: { userId: "rate-user-b" } };
  for (let index = 0; index < 6; index += 1) {
    const { output, response } = responseRecorder();
    let next = 0;
    mealPhotoRateLimit(userA, response, () => { next += 1; });
    assert.equal(next, 1);
    assert.equal(output.status, undefined);
  }
  const blocked = responseRecorder();
  mealPhotoRateLimit(userA, blocked.response, () => assert.fail("rate-limited request advanced"));
  assert.equal(blocked.output.status, 429);
  const isolated = responseRecorder();
  let nextB = 0;
  mealPhotoRateLimit(userB, isolated.response, () => { nextB += 1; });
  assert.equal(nextB, 1);
});

test("9Router-compatible gateway encodes the image only in the multimodal request", async () => {
  let received;
  const adapter = createAIGatewayAdapter({
    config: { baseUrl: "http://127.0.0.1:20128/v1", apiKey: "test-key" },
    createClient: () => ({ chat: { completions: { create: async (input) => {
      received = input;
      return { choices: [{ message: { content: JSON.stringify(validAnalysis()) } }] };
    } } } }),
  });
  await adapter.generate(
    { task: "MEAL_PHOTO_ANALYSIS", instructions: "safe", input: "analyze", image: { mimeType: "image/jpeg", data: jpeg }, responseFormat: "STRUCTURED_JSON", timeoutMs: 1000 },
    { task: "MEAL_PHOTO_ANALYSIS", provider: "GEMINI", model: configuredModel },
  );
  const imagePart = received.messages[1].content.find((part) => part.type === "image_url");
  assert.match(imagePart.image_url.url, /^data:image\/jpeg;base64,/);
  assert.equal(received.response_format.type, "json_object");
});

test("Gemini multimodal adapter maps inline image without changing text-only task behavior", async () => {
  let received;
  const adapter = createGeminiAdapter({ apiKey: "test-key", createClient: () => ({ models: { generateContent: async (input) => {
    received = input;
    return { text: JSON.stringify(validAnalysis()) };
  } } }) });
  await adapter.generate(
    { task: "MEAL_PHOTO_ANALYSIS", instructions: "safe", input: "analyze", image: { mimeType: "image/png", data: png }, responseFormat: "STRUCTURED_JSON", timeoutMs: 1000 },
    { task: "MEAL_PHOTO_ANALYSIS", provider: "GEMINI", model: configuredModel },
  );
  assert.equal(received.contents[0].parts[1].inlineData.mimeType, "image/png");
  assert.equal(received.contents[0].parts[1].inlineData.data, png.toString("base64"));
});

test("photo task resolves through the shared Router and an image-capable registered route", async () => {
  let calls = 0;
  const adapter = { provider: "GEMINI", health: () => ({ provider: "GEMINI", status: "CONFIGURED" }), generate: async (_request, route) => {
    calls += 1;
    return { content: JSON.stringify(validAnalysis()), provider: route.provider, model: route.model, latencyMs: 1, usage: {}, finishReason: "STOP", requestId: null };
  } };
  const router = createAIRouter({ policy: createAIRoutingPolicy(configuredModel), adapters: [adapter] });
  const response = await router.route({ task: "MEAL_PHOTO_ANALYSIS", instructions: "safe", input: "analyze", image: { mimeType: "image/jpeg", data: jpeg }, responseFormat: "STRUCTURED_JSON", timeoutMs: 1000 });
  assert.equal(response.provider, "GEMINI");
  assert.equal(calls, 1);
  assert.equal(createAIProviderRegistry().get("GEMINI").capabilities.includes("IMAGE_INPUT"), true);
  assert.equal(createAIModelRegistry().get("GEMINI", configuredModel).modalities.includes("IMAGE"), true);
});

test("frontend exposes camera, preview controls, editable estimates, add/remove, uncertainty, and explicit confirmation", async () => {
  const [page, service, route, css] = await Promise.all([
    readFile("frontend/src/pages/MealPhotoPage.tsx", "utf8"),
    readFile("frontend/src/services/mealPhotoService.ts", "utf8"),
    readFile("src/routes/meal-photo.routes.ts", "utf8"),
    readFile("frontend/src/App.css", "utf8"),
  ]);
  assert.match(page, /capture="environment"/);
  assert.match(page, /Trocar foto/);
  assert.match(page, /Remover/);
  assert.match(page, /Adicionar alimento/);
  assert.match(page, /não garante peso, quantidade, ingredientes escondidos, óleos, molhos ou calorias exatas/i);
  assert.match(page, /Confirmar e registrar/);
  assert.match(page, /type="number"/);
  assert.match(service, /\/api\/meal-photo\/analyze/);
  assert.match(service, /\/api\/meal-photo\/confirm/);
  assert.match(route, /mealPhotoRouter\.use\(authenticate\)/);
  assert.ok(route.indexOf("mealPhotoRouter.use(authenticate)") < route.indexOf('mealPhotoRouter.post("/analyze"'));
  assert.match(css, /@media \(max-width:560px\)[\s\S]*\.photo-food-fields/);
});
