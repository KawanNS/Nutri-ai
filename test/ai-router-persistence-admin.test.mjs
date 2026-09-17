import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AIAdminPersistenceError,
  PersistentAIAdminService,
} from "../dist/ai/admin/ai-admin-persistence.service.js";
import { createAIRouter } from "../dist/ai/ai-router.js";
import { createAIRoutingPolicy } from "../dist/ai/ai-routing-policy.js";
import { AIRouterError } from "../dist/ai/ai-router.types.js";
import { PrismaAIRouteConfigRepository } from "../dist/ai/config/prisma-ai-route-config.repository.js";
import { createAIModelRegistry } from "../dist/ai/registry/ai-model.registry.js";
import { createAIProviderRegistry } from "../dist/ai/registry/ai-provider.registry.js";
import { PrismaAITelemetrySink } from "../dist/ai/telemetry/prisma-ai-telemetry.sink.js";
import {
  createAuthenticate,
  findAuthenticationUser,
  requireAdmin,
} from "../dist/middlewares/auth.middleware.js";
import { aiPersistedRouteUpdateInputSchema } from "../dist/ai/admin/ai-admin.contracts.js";

const task = "MEAL_PLAN_GENERATION";
const configuredModel = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
const defaultRoute = {
  task,
  provider: "GEMINI",
  model: configuredModel,
};
const validUpdate = {
  provider: "GEMINI",
  model: configuredModel,
  enabled: true,
  expectedVersion: 0,
};

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

function createAdminDatabase(options = {}) {
  const state = {
    route: options.route ? structuredClone(options.route) : null,
    audits: [],
  };
  const actor = Object.hasOwn(options, "actor")
    ? options.actor
    : { status: "ACTIVE", role: "ADMIN" };

  const client = {
    aiRouteConfig: {
      findUnique: async () => (state.route ? structuredClone(state.route) : null),
    },
    async $transaction(operation) {
      let draftRoute = state.route ? structuredClone(state.route) : null;
      const draftAudits = structuredClone(state.audits);
      const transaction = {
        user: {
          findUnique: async () => (actor ? { ...actor } : null),
        },
        aiRouteConfig: {
          findUnique: async () => (draftRoute ? structuredClone(draftRoute) : null),
          create: async ({ data }) => {
            if (draftRoute) {
              throw Object.assign(new Error("unique conflict"), { code: "P2002" });
            }
            draftRoute = { id: "route-id", ...structuredClone(data) };
            return structuredClone(draftRoute);
          },
          updateMany: async ({ where, data }) => {
            if (
              options.forceConflict ||
              !draftRoute ||
              draftRoute.task !== where.task ||
              draftRoute.version !== where.version
            ) {
              return { count: 0 };
            }
            draftRoute = { ...draftRoute, ...structuredClone(data) };
            return { count: 1 };
          },
        },
        aiRouteAuditLog: {
          create: async ({ data }) => {
            if (options.failAudit) throw new Error("audit-secret-marker");
            draftAudits.push(structuredClone(data));
            return data;
          },
        },
      };
      const result = await operation(transaction);
      state.route = draftRoute;
      state.audits = draftAudits;
      return result;
    },
  };
  return { client, state };
}

function adminService(database) {
  return new PersistentAIAdminService(
    database.client,
    createAIRoutingPolicy(defaultRoute.model),
    createAIProviderRegistry(),
    createAIModelRegistry(),
  );
}

test("migration keeps existing and future users as USER by default", async () => {
  const [schema, migration] = await Promise.all([
    readFile("prisma/schema.prisma", "utf8"),
    readFile(
      "prisma/migrations/20260911120000_add_ai_router_admin_persistence/migration.sql",
      "utf8",
    ),
  ]);
  assert.match(schema, /role\s+UserRole\s+@default\(USER\)/);
  assert.match(migration, /"role" "UserRole" NOT NULL DEFAULT 'USER'/);
  assert.equal(migration.includes("UPDATE \"User\" SET \"role\" = 'ADMIN'"), false);
  assert.match(schema, /inputMicrosPerMillionTokens\s+BigInt/);
  assert.match(schema, /estimatedCostMicros\s+BigInt\?/);
  assert.match(migration, /"inputMicrosPerMillionTokens" BIGINT NOT NULL/);
  assert.equal(/\b(Float|DOUBLE PRECISION|REAL)\b/.test(`${schema}\n${migration}`), false);
});

test("authentication ignores client and JWT roles and uses current database state", async (t) => {
  await t.test("active USER keeps normal authenticated access but not ADMIN", async () => {
    const request = {
      headers: { authorization: "Bearer signed-token" },
      body: { role: "ADMIN" },
    };
    const response = createResponse();
    let nextCalls = 0;
    const authenticate = createAuthenticate({
      verifyToken: () => ({ sub: "user-id", role: "ADMIN" }),
      users: {
        findUnique: async () => ({ status: "ACTIVE", role: "USER" }),
      },
    });

    await authenticate(request, response, () => {
      nextCalls += 1;
    });

    assert.equal(nextCalls, 1);
    assert.deepEqual(request.auth, { userId: "user-id", role: "USER" });
    const adminResponse = createResponse();
    requireAdmin(request, adminResponse, () => {
      nextCalls += 1;
    });
    assert.equal(adminResponse.statusCode, 403);
    assert.equal(nextCalls, 1);
  });

  await t.test("blocked database user is denied before ADMIN authorization", async () => {
    const request = { headers: { authorization: "Bearer signed-token" } };
    const response = createResponse();
    let nextCalls = 0;
    const authenticate = createAuthenticate({
      verifyToken: () => ({ sub: "blocked-id", role: "ADMIN" }),
      users: {
        findUnique: async () => ({ status: "BLOCKED", role: "ADMIN" }),
      },
    });
    await authenticate(request, response, () => {
      nextCalls += 1;
    });
    assert.equal(response.statusCode, 403);
    assert.equal(request.auth, undefined);
    assert.equal(nextCalls, 0);
  });

  await t.test("missing bearer authentication is 401", async () => {
    const response = createResponse();
    await createAuthenticate({
      verifyToken: () => {
        throw new Error("must not verify");
      },
      users: { findUnique: async () => null },
    })({ headers: {} }, response, () => assert.fail("must not continue"));
    assert.equal(response.statusCode, 401);
  });
});

test("ADMIN authorization is based on the database role", async (t) => {
  const admin = await findAuthenticationUser("admin-id", {
    findUnique: async () => ({ status: "ACTIVE", role: "ADMIN" }),
  });
  const blocked = await findAuthenticationUser("blocked-id", {
    findUnique: async () => ({ status: "BLOCKED", role: "ADMIN" }),
  });
  assert.deepEqual(admin, { status: "ACTIVE", role: "ADMIN" });
  assert.deepEqual(blocked, { status: "BLOCKED", role: "ADMIN" });

  await t.test("missing authentication is 401", () => {
    const response = createResponse();
    let nextCalls = 0;
    requireAdmin({ auth: undefined }, response, () => {
      nextCalls += 1;
    });
    assert.equal(response.statusCode, 401);
    assert.equal(nextCalls, 0);
  });

  await t.test("ordinary JWT identity is not ADMIN", () => {
    const response = createResponse();
    let nextCalls = 0;
    requireAdmin({ auth: { userId: "user-id", role: "USER" } }, response, () => {
      nextCalls += 1;
    });
    assert.equal(response.statusCode, 403);
    assert.equal(nextCalls, 0);
  });

  await t.test("database-derived ADMIN continues", () => {
    const response = createResponse();
    let nextCalls = 0;
    requireAdmin({ auth: { userId: "admin-id", role: admin.role } }, response, () => {
      nextCalls += 1;
    });
    assert.equal(response.statusCode, null);
    assert.equal(nextCalls, 1);
  });

  await t.test("Premium USER remains forbidden from administration", () => {
    const response = createResponse();
    let nextCalls = 0;
    requireAdmin(
      {
        auth: {
          userId: "premium-user-id",
          role: "USER",
          isPremium: true,
          subscriptionId: "subscription-id",
        },
      },
      response,
      () => {
        nextCalls += 1;
      },
    );
    assert.equal(response.statusCode, 403);
    assert.equal(nextCalls, 0);
  });

  await t.test("database-derived ADMIN needs no Premium or Subscription", () => {
    const response = createResponse();
    let nextCalls = 0;
    requireAdmin(
      {
        auth: {
          userId: "admin-id",
          role: "ADMIN",
          isPremium: false,
          subscriptionId: null,
        },
      },
      response,
      () => {
        nextCalls += 1;
      },
    );
    assert.equal(response.statusCode, null);
    assert.equal(nextCalls, 1);
  });
});

test("missing persisted route resolves to the known default", async () => {
  const database = createAdminDatabase();
  assert.deepEqual(await adminService(database).getRoute(task), {
    ...defaultRoute,
    enabled: true,
    source: "DEFAULT",
    version: 0,
  });
});

test("Prisma repository strips extra fields and corrupt data fails closed", async () => {
  const repository = new PrismaAIRouteConfigRepository({
    aiRouteConfig: {
      findUnique: async () => ({
        ...defaultRoute,
        enabled: true,
        secret: "database-secret-marker",
      }),
    },
  });
  assert.deepEqual(await repository.findByTask(task), {
    ...defaultRoute,
    enabled: true,
  });

  let calls = 0;
  const corruptRepository = new PrismaAIRouteConfigRepository({
    aiRouteConfig: {
      findUnique: async () => ({ ...defaultRoute, model: null, enabled: true }),
    },
  });
  const router = createAIRouter({
    policy: createAIRoutingPolicy(defaultRoute.model),
    adapters: [
      {
        provider: "GEMINI",
        health: () => ({ provider: "GEMINI", status: "CONFIGURED" }),
        generate: async () => {
          calls += 1;
        },
      },
    ],
    routeConfigRepository: corruptRepository,
  });
  await assert.rejects(
    () =>
      router.route({
        task,
        instructions: "private-prompt",
        input: "private-response",
        responseFormat: "STRUCTURED_JSON",
        timeoutMs: 1,
      }),
    (error) => error instanceof AIRouterError && error.code === "AI_CONFIGURATION_ERROR",
  );
  assert.equal(calls, 0);
});

test("Prisma repository sanitizes database errors instead of returning absence", async () => {
  const repository = new PrismaAIRouteConfigRepository({
    aiRouteConfig: {
      findUnique: async () => {
        throw new Error("database-secret-marker");
      },
    },
  });
  await assert.rejects(
    () => repository.findByTask(task),
    (error) =>
      error instanceof AIRouterError &&
      error.code === "AI_CONFIGURATION_ERROR" &&
      !error.message.includes("database-secret-marker"),
  );
});

test("valid persisted route is reconstructed as a persisted summary", async () => {
  const database = createAdminDatabase({
    route: { id: "route-id", ...defaultRoute, enabled: true, version: 2 },
  });
  assert.deepEqual(await adminService(database).getRoute(task), {
    ...defaultRoute,
    enabled: true,
    source: "PERSISTED",
    version: 2,
  });
});

test("first customization records DEFAULT and creates an atomic audit", async () => {
  const database = createAdminDatabase();
  const result = await adminService(database).updateRoute(task, validUpdate, "admin-id");
  assert.equal(result.version, 1);
  assert.equal(database.state.route.version, 1);
  assert.equal(database.state.route.updatedByUserId, "admin-id");
  assert.equal(database.state.audits.length, 1);
  assert.deepEqual(
    {
      action: database.state.audits[0].action,
      previousOrigin: database.state.audits[0].previousOrigin,
      previousProvider: database.state.audits[0].previousProvider,
      previousModel: database.state.audits[0].previousModel,
      previousVersion: database.state.audits[0].previousVersion,
      newVersion: database.state.audits[0].newVersion,
    },
    {
      action: "CREATE",
      previousOrigin: "DEFAULT",
      previousProvider: "GEMINI",
      previousModel: defaultRoute.model,
      previousVersion: null,
      newVersion: 1,
    },
  );
});

test("valid update increments version and audits the persisted predecessor", async () => {
  const database = createAdminDatabase({
    route: { id: "route-id", ...defaultRoute, enabled: true, version: 4 },
  });
  const result = await adminService(database).updateRoute(
    task,
    { ...validUpdate, enabled: false, expectedVersion: 4 },
    "admin-id",
  );
  assert.equal(result.version, 5);
  assert.equal(result.enabled, false);
  assert.equal(database.state.route.version, 5);
  assert.equal(database.state.audits[0].previousOrigin, "PERSISTED");
  assert.equal(database.state.audits[0].previousVersion, 4);
  assert.equal(database.state.audits[0].newVersion, 5);
});

test("wrong expectedVersion and CAS collision protect lost updates", async (t) => {
  const scenarios = [
    { name: "stale client", expectedVersion: 3, forceConflict: false },
    { name: "CAS collision", expectedVersion: 4, forceConflict: true },
  ];
  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const database = createAdminDatabase({
        route: { id: "route-id", ...defaultRoute, enabled: true, version: 4 },
        forceConflict: scenario.forceConflict,
      });
      await assert.rejects(
        () =>
          adminService(database).updateRoute(
            task,
            { ...validUpdate, expectedVersion: scenario.expectedVersion },
            "admin-id",
          ),
        (error) =>
          error instanceof AIAdminPersistenceError &&
          error.code === "ROUTE_CONFLICT",
      );
      assert.equal(database.state.route.version, 4);
      assert.equal(database.state.audits.length, 0);
    });
  }
});

test("audit failure rolls back the route mutation", async () => {
  const database = createAdminDatabase({ failAudit: true });
  await assert.rejects(
    () => adminService(database).updateRoute(task, validUpdate, "admin-id"),
    /audit-secret-marker/,
  );
  assert.equal(database.state.route, null);
  assert.deepEqual(database.state.audits, []);
});

test("admin service rechecks active ADMIN inside the transaction", async (t) => {
  for (const actor of [
    { status: "ACTIVE", role: "USER" },
    { status: "BLOCKED", role: "ADMIN" },
    null,
  ]) {
    await t.test(JSON.stringify(actor), async () => {
      const database = createAdminDatabase({ actor });
      await assert.rejects(
        () => adminService(database).updateRoute(task, validUpdate, "actor-id"),
        (error) =>
          error instanceof AIAdminPersistenceError &&
          error.code === "ADMIN_FORBIDDEN",
      );
      assert.equal(database.state.route, null);
      assert.equal(database.state.audits.length, 0);
    });
  }
});

test("admin update rejects arbitrary task, provider, model, and secret fields", async (t) => {
  const scenarios = [
    { task: "ARBITRARY_TASK", input: validUpdate },
    { task, input: { ...validUpdate, provider: "OPENAI" } },
    { task, input: { ...validUpdate, model: "gemini-unapproved" } },
    { task, input: { ...validUpdate, apiKey: "private-api-key" } },
  ];
  for (const scenario of scenarios) {
    await t.test(`${scenario.task}:${scenario.input.provider}:${scenario.input.model}`, async () => {
      const database = createAdminDatabase();
      await assert.rejects(() =>
        adminService(database).updateRoute(
          scenario.task,
          scenario.input,
          "admin-id",
        ));
      assert.equal(database.state.route, null);
      assert.equal(database.state.audits.length, 0);
    });
  }
});

test("persisted route DTO rejects every credential-shaped field and version overflow", () => {
  for (const forbidden of ["apiKey", "secret", "token", "credential", "env"]) {
    assert.equal(
      aiPersistedRouteUpdateInputSchema.safeParse({
        ...validUpdate,
        [forbidden]: "private-marker",
      }).success,
      false,
    );
  }
  assert.equal(
    aiPersistedRouteUpdateInputSchema.safeParse({
      ...validUpdate,
      expectedVersion: 2_147_483_648,
    }).success,
    false,
  );
});

function telemetryEvent(overrides = {}) {
  return {
    task,
    provider: "GEMINI",
    model: defaultRoute.model,
    startedAt: "2026-09-12T12:00:00.000Z",
    durationMs: 25,
    success: true,
    errorCategory: null,
    usage: {
      inputTokens: 1_000_000,
      outputTokens: 2_000_000,
      totalTokens: 3_000_000,
      cachedInputTokens: null,
      reasoningTokens: null,
    },
    estimatedCost: null,
    prompt: "private-prompt-marker",
    response: "private-response-marker",
    email: "private@example.com",
    ...overrides,
  };
}

function createTelemetryClient(pricing = null, options = {}) {
  const state = { pricingReads: 0, writes: [] };
  return {
    state,
    client: {
      aiModelPricing: {
        findFirst: async () => {
          state.pricingReads += 1;
          return pricing;
        },
      },
      aiUsageEvent: {
        create: async ({ data }) => {
          if (options.failWrite) throw new Error("telemetry-database-secret");
          state.writes.push(structuredClone(data));
          return data;
        },
      },
    },
  };
}

test("persistent telemetry writes only sanitized fields and leaves unknown pricing null", async () => {
  const database = createTelemetryClient(null);
  await new PrismaAITelemetrySink(database.client).record(telemetryEvent());
  assert.equal(database.state.writes.length, 1);
  const [data] = database.state.writes;
  assert.deepEqual(Object.keys(data).sort(), [
    "cachedInputTokens",
    "durationMs",
    "errorCategory",
    "estimatedCostMicros",
    "estimatedCurrency",
    "inputTokens",
    "model",
    "outputTokens",
    "pricingVersion",
    "provider",
    "reasoningTokens",
    "startedAt",
    "success",
    "task",
    "totalTokens",
  ]);
  assert.equal(data.estimatedCostMicros, null);
  assert.equal(data.pricingVersion, null);
  const serialized = JSON.stringify(data);
  for (const marker of ["private-prompt-marker", "private-response-marker", "private@example.com"]) {
    assert.equal(serialized.includes(marker), false);
  }
});

test("persistent pricing uses versioned BigInt micros and rejects overflow", async (t) => {
  await t.test("valid pricing is rounded with BigInt", async () => {
    const database = createTelemetryClient({
      version: 7,
      currency: "USD",
      inputMicrosPerMillionTokens: 100n,
      outputMicrosPerMillionTokens: 200n,
    });
    await new PrismaAITelemetrySink(database.client).record(telemetryEvent());
    assert.equal(database.state.writes[0].estimatedCostMicros, 500n);
    assert.equal(database.state.writes[0].estimatedCurrency, "USD");
    assert.equal(database.state.writes[0].pricingVersion, 7);
  });

  await t.test("PostgreSQL integer and bigint overflow are not persisted", async () => {
    const database = createTelemetryClient({
      version: 8,
      currency: "USD",
      inputMicrosPerMillionTokens: 9_223_372_036_854_775_807n,
      outputMicrosPerMillionTokens: 9_223_372_036_854_775_807n,
    });
    await new PrismaAITelemetrySink(database.client).record(
      telemetryEvent({
        usage: {
          inputTokens: 2_147_483_647,
          outputTokens: 2_147_483_647,
          totalTokens: 2_147_483_648,
          cachedInputTokens: null,
          reasoningTokens: null,
        },
      }),
    );
    assert.equal(database.state.writes[0].totalTokens, null);
    assert.equal(database.state.writes[0].estimatedCostMicros, null);
    assert.equal(database.state.writes[0].pricingVersion, null);
  });
});

test("Prisma telemetry failure remains secondary and never repeats the provider", async () => {
  const database = createTelemetryClient(null, { failWrite: true });
  let providerCalls = 0;
  const router = createAIRouter({
    policy: createAIRoutingPolicy(defaultRoute.model),
    adapters: [{
      provider: "GEMINI",
      health: () => ({ provider: "GEMINI", status: "CONFIGURED" }),
      generate: async (_request, route) => {
        providerCalls += 1;
        return {
          content: "private-response",
          provider: "GEMINI",
          model: route.model,
          latencyMs: 1,
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            totalTokens: 2,
            cachedInputTokens: null,
            reasoningTokens: null,
          },
          finishReason: "STOP",
          requestId: null,
        };
      },
    }],
    telemetrySink: new PrismaAITelemetrySink(database.client),
  });
  const result = await router.route({
    task,
    instructions: "private-prompt",
    input: "private-profile",
    responseFormat: "STRUCTURED_JSON",
    timeoutMs: 1,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result.provider, "GEMINI");
  assert.equal(providerCalls, 1);
  assert.equal(database.state.writes.length, 0);
});
