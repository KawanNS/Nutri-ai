import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { aiRouteUpdateInputSchema } from "../dist/ai/admin/ai-admin.contracts.js";
import {
  createAIProviderSummaries,
  createAIRouteSummaries,
} from "../dist/ai/admin/ai-admin.service.js";
import { createAIRouter } from "../dist/ai/ai-router.js";
import { createAIRoutingPolicy } from "../dist/ai/ai-routing-policy.js";
import { AIRouterError } from "../dist/ai/ai-router.types.js";
import { InMemoryAIRouteConfigRepository } from "../dist/ai/config/ai-route-config.repository.js";
import { estimateAICost } from "../dist/ai/cost/ai-cost.js";
import {
  createAIModelRegistry,
  isAllowedAIModel,
} from "../dist/ai/registry/ai-model.registry.js";
import { createAIProviderRegistry } from "../dist/ai/registry/ai-provider.registry.js";
import { InMemoryAITelemetrySink } from "../dist/ai/telemetry/ai-telemetry.js";

const defaultRoute = {
  task: "MEAL_PLAN_GENERATION",
  provider: "GEMINI",
  model: "gemini-3.5-flash-lite",
};

const request = {
  task: "MEAL_PLAN_GENERATION",
  instructions: "private-system-prompt",
  input: "private-user-profile",
  responseFormat: "STRUCTURED_JSON",
  timeoutMs: 60_000,
};

function fakeAdapter(options = {}) {
  let calls = 0;
  let receivedRoute;
  const adapter = {
    provider: "GEMINI",
    health: () => ({
      provider: "GEMINI",
      status: options.configured === false ? "NOT_CONFIGURED" : "CONFIGURED",
    }),
    async generate(_request, route) {
      calls += 1;
      receivedRoute = route;
      if (options.error) throw options.error;
      return {
        content: options.content ?? "private-provider-response",
        provider: options.responseProvider ?? "GEMINI",
        model: options.responseModel ?? route.model,
        latencyMs: 5,
        usage: options.usage ?? {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
          cachedInputTokens: null,
          reasoningTokens: null,
        },
        finishReason: "STOP",
        requestId: null,
      };
    },
  };
  return { adapter, calls: () => calls, receivedRoute: () => receivedRoute };
}

function createV2Router(adapter, options = {}) {
  return createAIRouter({
    policy: createAIRoutingPolicy("gemini-3.5-flash-lite"),
    adapters: [adapter, ...(options.adapters ?? [])],
    routeConfigRepository: options.repository,
    telemetrySink: options.telemetrySink,
    now: options.now,
  });
}

test("provider registry exposes Gemini as the only operational provider", () => {
  const registry = createAIProviderRegistry();
  assert.deepEqual(registry.list().map((item) => item.provider), ["GEMINI"]);
  assert.equal(registry.isOperational("GEMINI"), true);
  assert.equal(registry.isOperational("OPENAI"), false);
  assert.equal(registry.get("UNKNOWN"), null);
});

test("model registry contains only the approved Gemini model", () => {
  const registry = createAIModelRegistry();
  assert.deepEqual(registry.list("GEMINI").map((item) => item.model), [
    "gemini-3.5-flash-lite",
  ]);
  assert.equal(isAllowedAIModel("GEMINI", "gemini-3.5-flash-lite"), true);
  assert.equal(isAllowedAIModel("GEMINI", "gemini-unapproved"), false);
});

test("registries expose immutable definitions without shared mutable lists", () => {
  const providers = createAIProviderRegistry();
  const models = createAIModelRegistry();
  const provider = providers.get("GEMINI");
  const model = models.get("GEMINI", defaultRoute.model);
  assert.equal(Object.isFrozen(provider), true);
  assert.equal(Object.isFrozen(provider.capabilities), true);
  assert.equal(Object.isFrozen(model), true);

  const providerList = providers.list();
  const modelList = models.list();
  providerList.length = 0;
  modelList.length = 0;
  assert.equal(providers.list().length, 1);
  assert.equal(models.list().length, 1);
});

test("missing custom configuration uses the known default route", async () => {
  let repositoryReads = 0;
  const repository = {
    async findByTask() {
      repositoryReads += 1;
      return null;
    },
  };
  const fake = fakeAdapter();
  await createV2Router(fake.adapter, { repository }).route(request);
  assert.equal(repositoryReads, 1);
  assert.deepEqual(fake.receivedRoute(), defaultRoute);
});

test("valid custom configuration is resolved through the repository", async () => {
  const repository = new InMemoryAIRouteConfigRepository([
    { ...defaultRoute, enabled: true },
  ]);
  const fake = fakeAdapter();
  await createV2Router(fake.adapter, { repository }).route(request);
  assert.deepEqual(fake.receivedRoute(), defaultRoute);
  assert.equal(Object.isFrozen(fake.receivedRoute()), true);
});

test("in-memory repository supports a future persistence replacement contract", async () => {
  const repository = new InMemoryAIRouteConfigRepository();
  const config = { ...defaultRoute, enabled: true };
  await repository.save(config);
  const stored = await repository.findByTask(defaultRoute.task);
  assert.deepEqual(stored, config);
  stored.model = "mutated-outside-repository";
  assert.deepEqual(await repository.findByTask(defaultRoute.task), config);
});

test("unsupported provider fails closed before any adapter call", async () => {
  const repository = new InMemoryAIRouteConfigRepository([
    { ...defaultRoute, provider: "OPENAI", enabled: true },
  ]);
  const fake = fakeAdapter();
  await assert.rejects(
    () => createV2Router(fake.adapter, { repository }).route(request),
    (error) =>
      error instanceof AIRouterError && error.code === "AI_UNSUPPORTED_PROVIDER",
  );
  assert.equal(fake.calls(), 0);
});

test("unapproved model fails closed before any adapter call", async () => {
  const repository = new InMemoryAIRouteConfigRepository([
    { ...defaultRoute, model: "gemini-unapproved", enabled: true },
  ]);
  const fake = fakeAdapter();
  await assert.rejects(
    () => createV2Router(fake.adapter, { repository }).route(request),
    (error) => error instanceof AIRouterError && error.code === "AI_UNSUPPORTED_MODEL",
  );
  assert.equal(fake.calls(), 0);
});

test("corrupt or disabled route configuration fails closed", async (t) => {
  for (const config of [
    { ...defaultRoute },
    { ...defaultRoute, enabled: false },
    { ...defaultRoute, task: "OTHER", enabled: true },
    undefined,
  ]) {
    await t.test(JSON.stringify(config) ?? "undefined", async () => {
      const repository = { findByTask: async () => config };
      const fake = fakeAdapter();
      await assert.rejects(
        () => createV2Router(fake.adapter, { repository }).route(request),
        (error) =>
          error instanceof AIRouterError && error.code === "AI_CONFIGURATION_ERROR",
      );
      assert.equal(fake.calls(), 0);
    });
  }
});

test("route configuration rejects unknown and inherited fields", async (t) => {
  const inherited = Object.assign(Object.create({ enabled: true }), defaultRoute);
  for (const config of [
    { ...defaultRoute, enabled: true, unexpected: "value" },
    inherited,
  ]) {
    await t.test(Object.hasOwn(config, "unexpected") ? "unknown" : "inherited", async () => {
      const fake = fakeAdapter();
      await assert.rejects(
        () => createV2Router(fake.adapter, {
          repository: { findByTask: async () => config },
        }).route(request),
        (error) =>
          error instanceof AIRouterError && error.code === "AI_CONFIGURATION_ERROR",
      );
      assert.equal(fake.calls(), 0);
    });
  }
});

test("repository failure is sanitized and fails closed", async () => {
  const repository = {
    findByTask: async () => {
      throw new Error("database-secret-marker");
    },
  };
  const fake = fakeAdapter();
  await assert.rejects(
    () => createV2Router(fake.adapter, { repository }).route(request),
    (error) =>
      error instanceof AIRouterError &&
      error.code === "AI_CONFIGURATION_ERROR" &&
      !error.message.includes("database-secret-marker"),
  );
  assert.equal(fake.calls(), 0);
});

test("provider failure causes no fallback and exactly one provider call", async () => {
  let unrelatedCalls = 0;
  const unrelated = {
    provider: "FUTURE_PROVIDER",
    health: () => ({ provider: "FUTURE_PROVIDER", status: "CONFIGURED" }),
    generate: async () => {
      unrelatedCalls += 1;
    },
  };
  const fake = fakeAdapter({
    error: new AIRouterError("AI_PROVIDER_UNAVAILABLE", true, "Unavailable"),
  });
  await assert.rejects(() =>
    createV2Router(fake.adapter, { adapters: [unrelated] }).route(request));
  assert.equal(fake.calls(), 1);
  assert.equal(unrelatedCalls, 0);
});

test("missing and duplicate adapters fail closed", async (t) => {
  await t.test("missing", async () => {
    await assert.rejects(
      () => createAIRouter({
        policy: createAIRoutingPolicy("gemini-3.5-flash-lite"),
        adapters: [],
      }).route(request),
      (error) =>
        error instanceof AIRouterError && error.code === "AI_CONFIGURATION_ERROR",
    );
  });

  await t.test("duplicate", () => {
    const first = fakeAdapter();
    const second = fakeAdapter();
    assert.throws(
      () => createV2Router(first.adapter, { adapters: [second.adapter] }),
      (error) =>
        error instanceof AIRouterError && error.code === "AI_CONFIGURATION_ERROR",
    );
    assert.equal(first.calls(), 0);
    assert.equal(second.calls(), 0);
  });
});

test("inconsistent provider response metadata is rejected after one call", async () => {
  const fake = fakeAdapter({ responseModel: "gemini-unapproved" });
  await assert.rejects(
    () => createV2Router(fake.adapter).route(request),
    (error) => error instanceof AIRouterError && error.code === "AI_INVALID_RESPONSE",
  );
  assert.equal(fake.calls(), 1);
});

test("telemetry records only the safe success contract", async () => {
  const sink = new InMemoryAITelemetrySink();
  const fake = fakeAdapter();
  const times = [1_000, 1_015];
  await createV2Router(fake.adapter, {
    telemetrySink: sink,
    now: () => times.shift() ?? 1_015,
  }).route(request);
  const [event] = sink.list();
  assert.deepEqual(Object.keys(event).sort(), [
    "durationMs",
    "errorCategory",
    "estimatedCost",
    "model",
    "provider",
    "startedAt",
    "success",
    "task",
    "usage",
  ]);
  assert.equal(event.durationMs, 15);
  assert.equal(event.estimatedCost, null);
  const serialized = JSON.stringify(event);
  assert.equal(serialized.includes(request.instructions), false);
  assert.equal(serialized.includes(request.input), false);
  assert.equal(serialized.includes("private-provider-response"), false);
  assert.equal(serialized.includes("api-key"), false);
});

test("telemetry normalizes provider usage and drops extra fields", async () => {
  const sink = new InMemoryAITelemetrySink();
  const fake = fakeAdapter({
    usage: {
      inputTokens: -1,
      outputTokens: 20,
      totalTokens: Number.MAX_SAFE_INTEGER + 1,
      cachedInputTokens: null,
      reasoningTokens: 0,
      secret: "private-usage-marker",
    },
  });
  await createV2Router(fake.adapter, { telemetrySink: sink }).route(request);
  const [event] = sink.list();
  assert.deepEqual(event.usage, {
    inputTokens: null,
    outputTokens: 20,
    totalTokens: null,
    cachedInputTokens: null,
    reasoningTokens: 0,
  });
  assert.equal(JSON.stringify(event).includes("private-usage-marker"), false);
});

test("failure telemetry contains category but no error details", async () => {
  const sink = new InMemoryAITelemetrySink();
  const secret = "private-api-key-marker";
  const fake = fakeAdapter({ error: new Error(secret) });
  await assert.rejects(() =>
    createV2Router(fake.adapter, { telemetrySink: sink }).route(request));
  const [event] = sink.list();
  assert.equal(event.success, false);
  assert.equal(event.errorCategory, "AI_UNKNOWN_ERROR");
  assert.equal(event.usage, null);
  assert.equal(JSON.stringify(event).includes(secret), false);
});

test("unsupported task is not copied into telemetry", async () => {
  const sink = new InMemoryAITelemetrySink();
  const fake = fakeAdapter();
  const unsupported = { ...request, task: "PRIVATE_ARBITRARY_TASK" };
  await assert.rejects(() =>
    createV2Router(fake.adapter, { telemetrySink: sink }).route(unsupported));
  const [event] = sink.list();
  assert.equal(event.task, null);
  assert.equal(JSON.stringify(event).includes(unsupported.task), false);
  assert.equal(fake.calls(), 0);
});

test("telemetry sink failure does not repeat or fail a successful call", async () => {
  const fake = fakeAdapter();
  const result = await createV2Router(fake.adapter, {
    telemetrySink: { record: () => { throw new Error("sink unavailable"); } },
  }).route(request);
  assert.equal(result.provider, "GEMINI");
  assert.equal(fake.calls(), 1);
});

test("asynchronous telemetry rejection does not repeat or fail a successful call", async () => {
  const fake = fakeAdapter();
  const result = await createV2Router(fake.adapter, {
    telemetrySink: { record: async () => { throw new Error("sink unavailable"); } },
  }).route(request);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result.provider, "GEMINI");
  assert.equal(fake.calls(), 1);
});

test("provider summary exposes status without credential fields", () => {
  const fake = fakeAdapter();
  const summaries = createAIProviderSummaries(
    createAIProviderRegistry(),
    createAIModelRegistry(),
    [fake.adapter],
  );
  assert.deepEqual(summaries, [
    {
      provider: "GEMINI",
      displayName: "Gemini",
      operational: true,
      configured: true,
      status: "ACTIVE",
      capabilities: ["STRUCTURED_JSON"],
      allowedModels: ["gemini-3.5-flash-lite"],
    },
  ]);
  assert.equal(/apiKey|secret|token|credential|env/i.test(JSON.stringify(summaries)), false);
  assert.equal(fake.calls(), 0);
});

test("route summary resolves the current effective route", async () => {
  const summaries = await createAIRouteSummaries(
    createAIRoutingPolicy("gemini-3.5-flash-lite"),
    new InMemoryAIRouteConfigRepository(),
    createAIProviderRegistry(),
    createAIModelRegistry(),
  );
  assert.deepEqual(summaries, [{ ...defaultRoute, enabled: true }]);
});

test("admin route DTO accepts only an allowed safe contract", () => {
  assert.equal(
    aiRouteUpdateInputSchema.safeParse({ ...defaultRoute, enabled: true }).success,
    true,
  );
  for (const forbidden of ["apiKey", "secret", "token", "credential", "env"]) {
    assert.equal(
      aiRouteUpdateInputSchema.safeParse({
        ...defaultRoute,
        enabled: true,
        [forbidden]: "private",
      }).success,
      false,
    );
  }
  assert.equal(
    aiRouteUpdateInputSchema.safeParse({
      ...defaultRoute,
      model: "gemini-unapproved",
      enabled: true,
    }).success,
    false,
  );
});

test("missing pricing produces an unknown estimated cost", () => {
  const usage = {
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    cachedInputTokens: null,
    reasoningTokens: null,
  };
  assert.equal(createAIModelRegistry().get("GEMINI", defaultRoute.model).pricing, null);
  assert.equal(estimateAICost(usage, null), null);
});

test("supplied pricing is calculated only as a Router estimate", () => {
  const usage = {
    inputTokens: 1_000_000,
    outputTokens: 2_000_000,
    totalTokens: 3_000_000,
    cachedInputTokens: null,
    reasoningTokens: null,
  };
  assert.deepEqual(
    estimateAICost(usage, {
      provider: "GEMINI",
      model: defaultRoute.model,
      currency: "USD",
      inputMicrosPerMillionTokens: 100,
      outputMicrosPerMillionTokens: 200,
    }),
    { kind: "ROUTER_ESTIMATE", currency: "USD", amountMicros: 500 },
  );
});

test("invalid pricing fails closed as an unknown cost", () => {
  const usage = {
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    cachedInputTokens: null,
    reasoningTokens: null,
  };
  assert.equal(
    estimateAICost(usage, {
      provider: "GEMINI",
      model: defaultRoute.model,
      currency: "USD",
      inputMicrosPerMillionTokens: -1,
      outputMicrosPerMillionTokens: 200,
    }),
    null,
  );
  assert.equal(
    estimateAICost(
      { ...usage, inputTokens: -1 },
      {
        provider: "GEMINI",
        model: defaultRoute.model,
        currency: "USD",
        inputMicrosPerMillionTokens: 100,
        outputMicrosPerMillionTokens: 200,
      },
    ),
    null,
  );
});

test("administrative HTTP is mounted after server-side ADMIN authorization", async () => {
  const [appSource, authSource, documentation] = await Promise.all([
    readFile("src/app.ts", "utf8"),
    readFile("src/middlewares/auth.middleware.ts", "utf8"),
    readFile("docs/ai-router-admin-api.md", "utf8"),
  ]);
  assert.equal(appSource.includes("/api/admin/ai-router"), true);
  assert.equal(authSource.includes("requireAdmin"), true);
  assert.equal(authSource.includes("user.role"), true);
  assert.equal(documentation.includes("API administrativa do AI Router V2"), true);
});
