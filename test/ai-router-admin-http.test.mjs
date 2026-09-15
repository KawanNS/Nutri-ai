import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  aiAdminAuditQuerySchema,
  aiAdminUsageQuerySchema,
} from "../dist/ai/admin/ai-admin.contracts.js";
import { AIAdminPersistenceError } from "../dist/ai/admin/ai-admin-persistence.service.js";
import { PrismaAIAdminQueryService } from "../dist/ai/admin/ai-admin-query.service.js";
import { createAIAdminControllers } from "../dist/controllers/ai-router-admin.controller.js";
import { createAdminRateLimit } from "../dist/middlewares/admin-rate-limit.middleware.js";

const task = "MEAL_PLAN_GENERATION";
const model = "gemini-3.5-flash-lite";
const route = {
  task,
  provider: "GEMINI",
  model,
  enabled: true,
  source: "PERSISTED",
  version: 2,
};

function responseDouble() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
}

function controllerDependencies(overrides = {}) {
  return {
    routes: {
      getRoute: async () => route,
      listRoutes: async () => [route],
      updateRoute: async (_task, input) => ({ ...route, ...input, version: 3 }),
      ...overrides.routes,
    },
    queries: {
      listUsage: async (query) => ({ items: [], pagination: { ...query, total: 0 } }),
      summarizeCosts: async () => ({
        totalCalls: 0,
        callsWithKnownCost: 0,
        callsWithUnknownCost: 0,
        totals: [],
      }),
      listAudit: async (query) => ({ items: [], pagination: { ...query, total: 0 } }),
      ...overrides.queries,
    },
    providerSummaries: () => [{ provider: "GEMINI", status: "ACTIVE" }],
    modelSummaries: () => [
      { provider: "GEMINI", model, enabled: true },
    ],
  };
}

test("administrative Router V2 routes use the trusted authorization chain", async () => {
  const [appSource, routesSource] = await Promise.all([
    readFile("src/app.ts", "utf8"),
    readFile("src/routes/ai-router-admin.routes.ts", "utf8"),
  ]);
  assert.match(appSource, /app\.use\("\/api\/admin\/ai-router", aiRouterAdminRouter\)/);
  assert.match(
    routesSource,
    /aiRouterAdminRouter\.use\(authenticate, requireAdmin, adminRateLimit\)/,
  );
  assert.doesNotMatch(routesSource, /post\("\/audit|delete\("\/audit|put\("\/audit/);
});

test("route endpoints read and update only strict allowed configuration", async (t) => {
  let updateArguments = null;
  const controllers = createAIAdminControllers(
    controllerDependencies({
      routes: {
        updateRoute: async (...args) => {
          updateArguments = args;
          return { ...route, enabled: false, version: 3 };
        },
      },
    }),
  );

  await t.test("reads one route", async () => {
    const response = responseDouble();
    await controllers.getRoute({ params: { task } }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { route });
  });

  await t.test("valid update carries expectedVersion and server actor", async () => {
    const response = responseDouble();
    const body = { provider: "GEMINI", model, enabled: false, expectedVersion: 2 };
    await controllers.updateRoute(
      { params: { task }, body, auth: { userId: "admin-id", role: "ADMIN" } },
      response,
    );
    assert.equal(response.statusCode, 200);
    assert.deepEqual(updateArguments, [task, body, "admin-id"]);
  });

  for (const body of [
    { provider: "OPENAI", model, enabled: true, expectedVersion: 2 },
    { provider: "GEMINI", model: "not-allowed", enabled: true, expectedVersion: 2 },
    { provider: "GEMINI", model, enabled: true, expectedVersion: -1 },
    { provider: "GEMINI", model, enabled: true, expectedVersion: 2, apiKey: "secret" },
  ]) {
    await t.test(`rejects ${JSON.stringify(body)}`, async () => {
      updateArguments = null;
      const response = responseDouble();
      await controllers.updateRoute(
        { params: { task }, body, auth: { userId: "admin-id", role: "ADMIN" } },
        response,
      );
      assert.equal(response.statusCode, 400);
      assert.equal(updateArguments, null);
      assert.equal(JSON.stringify(response.body).includes("secret"), false);
    });
  }
});

test("optimistic concurrency is exposed as a sanitized 409", async () => {
  const controllers = createAIAdminControllers(
    controllerDependencies({
      routes: {
        updateRoute: async () => {
          throw new AIAdminPersistenceError("ROUTE_CONFLICT", "database-secret-marker");
        },
      },
    }),
  );
  const response = responseDouble();
  await controllers.updateRoute(
    {
      params: { task },
      body: { provider: "GEMINI", model, enabled: true, expectedVersion: 1 },
      auth: { userId: "admin-id", role: "ADMIN" },
    },
    response,
  );
  assert.equal(response.statusCode, 409);
  assert.equal(JSON.stringify(response.body).includes("database-secret-marker"), false);
});

test("administrative query schemas enforce allowlists, dates and bounded pagination", () => {
  assert.deepEqual(aiAdminUsageQuerySchema.parse({}), { page: 1, limit: 20 });
  assert.equal(
    aiAdminUsageQuerySchema.safeParse({
      page: "2",
      limit: "100",
      task,
      provider: "GEMINI",
      model,
      status: "SUCCESS",
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-15T00:00:00.000Z",
    }).success,
    true,
  );
  for (const query of [
    { page: "0" },
    { limit: "101" },
    { status: "ANY" },
    { provider: "OPENAI" },
    { model: "unlisted-model" },
    { from: "not-a-date" },
    { page: ["1"] },
    { limit: true },
    { page: "2147483647", limit: "100" },
    { from: "2026-09-15T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" },
    { arbitrary: "filter" },
  ]) {
    assert.equal(aiAdminUsageQuerySchema.safeParse(query).success, false);
  }
  assert.equal(aiAdminAuditQuerySchema.safeParse({ limit: "101" }).success, false);
  assert.equal(aiAdminAuditQuerySchema.safeParse({ actorEmail: "private@example.com" }).success, false);
});

test("usage query selects only telemetry fields and returns no PII", async () => {
  let findManyArguments;
  const service = new PrismaAIAdminQueryService({
    aiUsageEvent: {
      count: async () => 1,
      aggregate: async () => ({
        _sum: {
          durationMs: 42,
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
          cachedInputTokens: null,
          reasoningTokens: null,
        },
        _avg: { durationMs: 42 },
      }),
      findMany: async (args) => {
        findManyArguments = args;
        return [
          {
            task,
            provider: "GEMINI",
            model,
            startedAt: new Date("2026-09-15T12:00:00.000Z"),
            durationMs: 42,
            success: true,
            errorCategory: null,
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30,
            cachedInputTokens: null,
            reasoningTokens: null,
            estimatedCostMicros: null,
            estimatedCurrency: null,
            pricingVersion: null,
            prompt: "private-prompt",
            email: "private@example.com",
          },
        ];
      },
      groupBy: async () => [],
    },
    aiRouteAuditLog: { count: async () => 0, findMany: async () => [] },
  });
  const result = await service.listUsage({ page: 1, limit: 20 });
  assert.equal(result.items[0].estimatedCost, null);
  assert.deepEqual(result.summary, {
    calls: 1,
    successfulCalls: 1,
    failedCalls: 0,
    latency: { totalMs: 42, averageMs: 42 },
    usage: {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      cachedInputTokens: null,
      reasoningTokens: null,
    },
  });
  assert.equal(result.pagination.total, 1);
  assert.equal(JSON.stringify(result).includes("private-prompt"), false);
  assert.equal(JSON.stringify(result).includes("private@example.com"), false);
  assert.equal(Object.hasOwn(findManyArguments.select, "prompt"), false);
  assert.equal(Object.hasOwn(findManyArguments.select, "email"), false);
});

test("cost summary distinguishes unknown cost from zero", async () => {
  let countCalls = 0;
  const service = new PrismaAIAdminQueryService({
    aiUsageEvent: {
      count: async () => (++countCalls === 1 ? 3 : 1),
      aggregate: async () => ({ _sum: {}, _avg: {} }),
      findMany: async () => [],
      groupBy: async () => [
        { estimatedCurrency: "USD", _sum: { estimatedCostMicros: 0n } },
      ],
    },
    aiRouteAuditLog: { count: async () => 0, findMany: async () => [] },
  });
  assert.deepEqual(await service.summarizeCosts({ page: 1, limit: 20 }), {
    totalCalls: 3,
    callsWithKnownCost: 1,
    callsWithUnknownCost: 2,
    totals: [{ currency: "USD", amountMicros: "0" }],
  });
});

test("audit endpoint is read-only, paginated and returns the safe transition", async () => {
  const calls = [];
  const service = new PrismaAIAdminQueryService({
    aiUsageEvent: {
      count: async () => 0,
      aggregate: async () => ({ _sum: {}, _avg: {} }),
      findMany: async () => [],
      groupBy: async () => [],
    },
    aiRouteAuditLog: {
      count: async (args) => {
        calls.push(["count", args]);
        return 1;
      },
      findMany: async (args) => {
        calls.push(["findMany", args]);
        return [{
          action: "UPDATE",
          task,
          previousOrigin: "PERSISTED",
          previousProvider: "GEMINI",
          previousModel: model,
          previousEnabled: true,
          previousVersion: 1,
          newProvider: "GEMINI",
          newModel: model,
          newEnabled: false,
          newVersion: 2,
          changedByUserId: "admin-id",
          createdAt: new Date("2026-09-15T12:00:00.000Z"),
          privatePayload: "secret-marker",
        }];
      },
    },
  });
  const result = await service.listAudit({ page: 1, limit: 20, task });
  assert.equal(result.items[0].currentRoute.version, 2);
  assert.equal(JSON.stringify(result).includes("secret-marker"), false);
  assert.deepEqual(calls.map(([method]) => method).sort(), ["count", "findMany"]);
});

test("unexpected failures return a sanitized 500", async () => {
  const marker = "postgres://user:password@private-host/database";
  const controllers = createAIAdminControllers(
    controllerDependencies({ routes: { listRoutes: async () => { throw new Error(marker); } } }),
  );
  const response = responseDouble();
  const original = console.error;
  const logs = [];
  console.error = (...values) => logs.push(values);
  try {
    await controllers.listRoutes({}, response);
  } finally {
    console.error = original;
  }
  assert.equal(response.statusCode, 500);
  assert.equal(JSON.stringify(response.body).includes(marker), false);
  assert.equal(JSON.stringify(logs).includes(marker), false);
});

test("per-admin rate limit returns 429 and resets without a dependency", () => {
  let timestamp = 1_000;
  const middleware = createAdminRateLimit({
    maximumRequests: 2,
    windowMs: 1_000,
    now: () => timestamp,
  });
  const request = { auth: { userId: "admin-id", role: "ADMIN" } };
  let nextCalls = 0;
  for (let index = 0; index < 2; index += 1) {
    middleware(request, responseDouble(), () => { nextCalls += 1; });
  }
  const limited = responseDouble();
  middleware(request, limited, () => { nextCalls += 1; });
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.code, "ADMIN_RATE_LIMIT_EXCEEDED");
  assert.equal(nextCalls, 2);

  timestamp = 2_001;
  middleware(request, responseDouble(), () => { nextCalls += 1; });
  assert.equal(nextCalls, 3);
});

test("CORS remains restricted to the configured official frontend", async () => {
  const source = await readFile("src/app.ts", "utf8");
  assert.match(source, /!origin \|\| origin === env\.frontendUrl/);
  assert.doesNotMatch(source, /origin:\s*["']\*["']/);
  assert.match(source, /methods: \["GET", "POST", "PUT", "OPTIONS"\]/);
});
