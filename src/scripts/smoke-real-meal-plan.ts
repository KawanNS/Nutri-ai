/**
 * Explicitly gated development smoke for the complete meal-plan flow.
 *
 * This script intentionally performs real database writes and one real AI request.
 * It must only be run after the remote migration and the test itself are authorized.
 * It never prints credentials, tokens, prompts, profile data, or generated meal content.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import { app } from "../app.js";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { validateGeneratedMealPlan } from "../schemas/meal-plan.schema.js";

const EXECUTION_CONFIRMATION = "CONFIRMED";
const HOST = "127.0.0.1";
const TELEMETRY_WAIT_MS = 10_000;
const TELEMETRY_POLL_MS = 250;

interface JsonResponse {
  status: number;
  body: Record<string, unknown>;
}

function assertExecutionIsAuthorized(): void {
  if (process.env.NUTRI_REAL_DIET_SMOKE !== EXECUTION_CONFIRMATION) {
    throw new Error("REAL_DIET_SMOKE_NOT_AUTHORIZED");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("REAL_DIET_SMOKE_DISABLED_IN_PRODUCTION");
  }

  const gateway = env.aiGatewayConfig;
  if (!gateway) throw new Error("REAL_DIET_SMOKE_REQUIRES_AI_GATEWAY");
  const gatewayUrl = new URL(gateway.baseUrl);
  if (gatewayUrl.hostname !== "127.0.0.1" && gatewayUrl.hostname !== "localhost") {
    throw new Error("REAL_DIET_SMOKE_REQUIRES_LOCAL_AI_GATEWAY");
  }
}

async function requestJson(
  baseUrl: string,
  path: string,
  init: RequestInit,
): Promise<JsonResponse> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, body };
}

function authenticatedHeaders(token: string, extra: Record<string, string> = {}) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    ...extra,
  };
}

async function waitForTelemetry(startedAt: Date, model: string) {
  const deadline = Date.now() + TELEMETRY_WAIT_MS;
  while (Date.now() < deadline) {
    const event = await prisma.aiUsageEvent.findFirst({
      where: {
        startedAt: { gte: startedAt },
        task: "MEAL_PLAN_GENERATION",
        provider: "GEMINI",
        model,
        success: true,
      },
      orderBy: { createdAt: "desc" },
    });
    if (event) return event;
    await new Promise((resolve) => setTimeout(resolve, TELEMETRY_POLL_MS));
  }
  return null;
}

async function closeServer(server: ReturnType<typeof app.listen>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function main(): Promise<void> {
  assertExecutionIsAuthorized();

  const unique = randomUUID();
  const email = `nutri-real-smoke-${unique}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  let temporaryUserId: string | null = null;
  const server = app.listen(0, HOST);

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://${HOST}:${address.port}`;

    const registration = await requestJson(baseUrl, "/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Nutri Smoke", email, password }),
    });
    assert.equal(registration.status, 201, "SMOKE_REGISTRATION_FAILED");
    const registeredUser = registration.body.user as Record<string, unknown> | undefined;
    if (typeof registeredUser?.id !== "string") {
      throw new Error("SMOKE_USER_ID_MISSING");
    }
    temporaryUserId = registeredUser.id as string;

    const login = await requestJson(baseUrl, "/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200, "SMOKE_LOGIN_FAILED");
    assert.equal(typeof login.body.token, "string", "SMOKE_TOKEN_MISSING");
    const token = login.body.token as string;

    const profile = await requestJson(baseUrl, "/api/profile", {
      method: "PUT",
      headers: authenticatedHeaders(token),
      body: JSON.stringify({
        birthDate: "1992-05-20",
        sex: "FEMALE",
        heightCm: 165,
        weightKg: 62,
        goal: "MAINTENANCE",
        activityLevel: "MODERATE",
        mealsPerDay: 3,
        weeklyFoodBudget: 350,
        foodPreferences: ["comida brasileira"],
        likedFoods: ["arroz", "feijao"],
        dislikedFoods: [],
        foodRestrictions: [],
        foodAllergies: [],
      }),
    });
    assert.equal(profile.status, 200, "SMOKE_PROFILE_FAILED");

    const startedAt = new Date(Date.now() - 1_000);
    const generation = await requestJson(baseUrl, "/api/meal-plans/generate", {
      method: "POST",
      headers: authenticatedHeaders(token, { "Idempotency-Key": randomUUID() }),
      body: "{}",
    });
    assert.equal(generation.status, 201, "SMOKE_GENERATION_FAILED");

    const mealPlan = generation.body.mealPlan as Record<string, unknown> | undefined;
    if (typeof mealPlan?.id !== "string") {
      throw new Error("SMOKE_MEAL_PLAN_ID_MISSING");
    }
    if (typeof mealPlan.model !== "string") {
      throw new Error("SMOKE_MODEL_MISSING");
    }
    const validation = validateGeneratedMealPlan(mealPlan?.content, 3);
    assert.equal(validation.success, true, "SMOKE_MEAL_PLAN_SCHEMA_INVALID");

    const persisted = await prisma.mealPlan.findFirst({
      where: { id: mealPlan.id as string, userId: temporaryUserId },
    });
    assert.ok(persisted, "SMOKE_MEAL_PLAN_NOT_PERSISTED");
    const usageEvent = await prisma.usageEvent.findFirst({
      where: {
        id: persisted.usageEventId,
        userId: temporaryUserId,
        action: "PLAN_GENERATION",
        status: "CONSUMED",
      },
    });
    assert.ok(usageEvent, "SMOKE_USAGE_EVENT_NOT_CONSUMED");

    const aiUsageEvent = await waitForTelemetry(startedAt, persisted.model);
    assert.ok(aiUsageEvent, "SMOKE_AI_USAGE_EVENT_NOT_PERSISTED");
    const persistedRoute = await prisma.aiRouteConfig.findUnique({
      where: { task: "MEAL_PLAN_GENERATION" },
      select: { task: true },
    });

    process.stdout.write(`${JSON.stringify({
      httpStatus: generation.status,
      provider: aiUsageEvent.provider,
      model: persisted.model,
      structuredResponseValid: validation.success,
      mealPlanPersisted: true,
      usageEventConsumed: true,
      aiUsageEventPersisted: true,
      routeOrigin: persistedRoute ? "PERSISTED" : "DEFAULT",
      realAiRequests: 1,
    })}\n`);
  } finally {
    await closeServer(server).catch(() => undefined);
    if (!temporaryUserId) {
      temporaryUserId = (
        await prisma.user.findUnique({ where: { email }, select: { id: true } })
      )?.id ?? null;
    }
    if (temporaryUserId) {
      await prisma.user.deleteMany({ where: { id: temporaryUserId, email } });
    }
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "REAL_DIET_SMOKE_FAILED";
  process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  process.exitCode = 1;
});
