import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createMealPlanRateLimit } from "../dist/middlewares/meal-plan-rate-limit.middleware.js";

function request(userId, idempotencyKey) {
  return {
    auth: { userId, role: "USER" },
    get(name) {
      return name === "Idempotency-Key" ? idempotencyKey : undefined;
    },
  };
}

function response() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

function invoke(limit, currentRequest) {
  const currentResponse = response();
  let downstreamCalls = 0;
  limit(currentRequest, currentResponse, () => { downstreamCalls += 1; });
  return { response: currentResponse, downstreamCalls };
}

test("allows three unique generation attempts per user in ten minutes", () => {
  const limit = createMealPlanRateLimit({ now: () => 1_000 });
  for (const key of ["key-1", "key-2", "key-3"]) {
    const result = invoke(limit, request("user-a", key));
    assert.equal(result.downstreamCalls, 1);
    assert.equal(result.response.statusCode, null);
  }
});

test("fourth unique attempt returns sanitized 429 before quota or AI code", () => {
  const limit = createMealPlanRateLimit({ now: () => 1_000 });
  for (const key of ["key-1", "key-2", "key-3"]) invoke(limit, request("user-a", key));

  const blocked = invoke(limit, request("user-a", "key-4"));
  assert.equal(blocked.downstreamCalls, 0);
  assert.equal(blocked.response.statusCode, 429);
  assert.deepEqual(blocked.response.body, {
    error: "Too many meal plan generation attempts",
    code: "MEAL_PLAN_RATE_LIMIT_EXCEEDED",
    retryAfterSeconds: 600,
  });
  assert.equal(blocked.response.headers["Retry-After"], "600");
});

test("idempotent retries do not consume another operational slot", () => {
  const limit = createMealPlanRateLimit({ now: () => 1_000 });
  for (const key of ["key-1", "key-2", "key-3"]) invoke(limit, request("user-a", key));

  const retry = invoke(limit, request("user-a", "key-1"));
  assert.equal(retry.downstreamCalls, 1);
  assert.equal(retry.response.statusCode, null);
  assert.equal(retry.response.headers["RateLimit-Remaining"], "0");
});

test("different users have isolated operational limits", () => {
  const limit = createMealPlanRateLimit({ maximumGenerations: 1, now: () => 1_000 });
  assert.equal(invoke(limit, request("user-a", "key-a")).downstreamCalls, 1);
  assert.equal(invoke(limit, request("user-a", "key-b")).response.statusCode, 429);
  assert.equal(invoke(limit, request("user-b", "key-b")).downstreamCalls, 1);
});

test("window expiry resets the per-user limit", () => {
  let timestamp = 1_000;
  const limit = createMealPlanRateLimit({ maximumGenerations: 1, windowMs: 5_000, now: () => timestamp });
  assert.equal(invoke(limit, request("user-a", "key-1")).downstreamCalls, 1);
  assert.equal(invoke(limit, request("user-a", "key-2")).response.statusCode, 429);
  timestamp += 5_001;
  assert.equal(invoke(limit, request("user-a", "key-2")).downstreamCalls, 1);
});

test("the operational limit applies independently of free or Premium entitlement", () => {
  const limit = createMealPlanRateLimit({ maximumGenerations: 1, now: () => 1_000 });
  const premiumRequest = { ...request("premium-user", "key-1"), subscription: { isPremium: true } };
  assert.equal(invoke(limit, premiumRequest).downstreamCalls, 1);
  const blocked = invoke(limit, { ...premiumRequest, get: () => "key-2" });
  assert.equal(blocked.response.statusCode, 429);
  assert.equal(blocked.downstreamCalls, 0);
});

test("route authenticates before rate limiting and invokes the controller only afterward", async () => {
  const source = await readFile("src/routes/meal-plan.routes.ts", "utf8");
  assert.match(source, /mealPlanRouter\.use\(authenticate\)/);
  assert.match(source, /post\("\/generate", mealPlanRateLimit, generateMealPlanController\)/);
});
