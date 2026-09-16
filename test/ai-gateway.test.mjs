import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createAIGatewayAdapter,
  normalizeAIGatewayError,
} from "../dist/ai/adapters/ai-gateway.adapter.js";
import { AIRouterError } from "../dist/ai/ai-router.types.js";
import { env } from "../dist/config/env.js";

const config = {
  baseUrl: "http://127.0.0.1:20128/v1",
  apiKey: "private-test-gateway-key",
};
const route = {
  task: "MEAL_PLAN_GENERATION",
  provider: "GEMINI",
  model: "ag/test-gemini-model",
};
const request = {
  task: "MEAL_PLAN_GENERATION",
  instructions: "private system instructions",
  input: "private normalized input",
  responseFormat: "STRUCTURED_JSON",
  timeoutMs: 12_345,
};

function fakeGateway(options = {}) {
  const clients = [];
  const calls = [];
  const adapter = createAIGatewayAdapter({
    config: options.config === undefined ? config : options.config,
    now: options.now ?? (() => 100),
    createClient(receivedConfig) {
      clients.push(receivedConfig);
      return {
        chat: {
          completions: {
            async create(input, requestOptions) {
              calls.push({ input, requestOptions });
              if (options.error) throw options.error;
              return options.response ?? {
                id: "chatcmpl-safe-id",
                choices: [{
                  finish_reason: "stop",
                  message: { content: '{"ok":true}' },
                }],
                usage: {
                  prompt_tokens: 10,
                  completion_tokens: 20,
                  total_tokens: 30,
                  prompt_tokens_details: { cached_tokens: 2 },
                  completion_tokens_details: { reasoning_tokens: 4 },
                },
              };
            },
          },
        },
      };
    },
  });
  return { adapter, clients, calls };
}

test("gateway adapter maps Router V2 requests to OpenAI-compatible chat completions", async () => {
  const fake = fakeGateway();
  const result = await fake.adapter.generate(request, route);
  assert.deepEqual(fake.clients, [config]);
  assert.deepEqual(fake.calls, [{
    input: {
      model: route.model,
      messages: [
        { role: "system", content: request.instructions },
        { role: "user", content: request.input },
      ],
      response_format: { type: "json_object" },
      stream: false,
    },
    requestOptions: { timeout: request.timeoutMs },
  }]);
  assert.equal(result.provider, "GEMINI");
  assert.equal(result.model, route.model);
  assert.equal(result.content, '{"ok":true}');
  assert.equal(result.requestId, "chatcmpl-safe-id");
  assert.deepEqual(result.usage, {
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    cachedInputTokens: 2,
    reasoningTokens: 4,
  });
});

test("gateway adapter is fail-closed when server-side configuration is absent", async () => {
  const fake = fakeGateway({ config: null });
  assert.equal(fake.adapter.health().status, "NOT_CONFIGURED");
  await assert.rejects(
    () => fake.adapter.generate(request, route),
    (error) => error instanceof AIRouterError && error.code === "AI_CONFIGURATION_ERROR",
  );
  assert.equal(fake.calls.length, 0);
});

test("gateway adapter rejects empty content and unsafe request ids", async () => {
  const empty = fakeGateway({
    response: { id: "unsafe id", choices: [{ message: { content: " " } }] },
  });
  await assert.rejects(
    () => empty.adapter.generate(request, route),
    (error) => error instanceof AIRouterError && error.code === "AI_INVALID_RESPONSE",
  );

  const unsafeId = fakeGateway({
    response: {
      id: "unsafe id",
      choices: [{ finish_reason: "stop", message: { content: "{}" } }],
    },
  });
  assert.equal((await unsafeId.adapter.generate(request, route)).requestId, null);
});

test("gateway errors are normalized without leaking provider details", () => {
  const secret = "private-key-in-upstream-error";
  for (const [status, code, retryable] of [
    [401, "AI_AUTH_ERROR", false],
    [429, "AI_RATE_LIMIT", true],
    [503, "AI_PROVIDER_UNAVAILABLE", true],
    [400, "AI_INVALID_RESPONSE", false],
  ]) {
    const normalized = normalizeAIGatewayError({ status, message: secret });
    assert.equal(normalized.code, code);
    assert.equal(normalized.retryable, retryable);
    assert.equal(JSON.stringify(normalized).includes(secret), false);
    assert.equal(normalized.message.includes(secret), false);
  }
  assert.equal(
    normalizeAIGatewayError({ name: "APIConnectionError", message: secret }).code,
    "AI_PROVIDER_UNAVAILABLE",
  );
  assert.equal(
    normalizeAIGatewayError({ name: "APIConnectionTimeoutError", message: secret }).code,
    "AI_TIMEOUT",
  );
});

test("gateway configuration remains backend-only", async () => {
  const [example, frontendExample, source] = await Promise.all([
    readFile(".env.example", "utf8"),
    readFile("frontend/.env.example", "utf8"),
    readFile("src/ai/adapters/ai-gateway.adapter.ts", "utf8"),
  ]);
  assert.equal(example.includes("AI_GATEWAY_BASE_URL"), true);
  assert.equal(example.includes("AI_GATEWAY_API_KEY"), true);
  assert.equal(frontendExample.includes("AI_GATEWAY_"), false);
  assert.equal(source.includes("maxRetries: 0"), true);
});

test("gateway environment configuration requires a complete secure pair", () => {
  const previousBaseUrl = process.env.AI_GATEWAY_BASE_URL;
  const previousApiKey = process.env.AI_GATEWAY_API_KEY;
  try {
    process.env.AI_GATEWAY_BASE_URL = "http://127.0.0.1:20128/v1";
    delete process.env.AI_GATEWAY_API_KEY;
    assert.throws(() => env.aiGatewayConfig, /must be configured together/);

    process.env.AI_GATEWAY_API_KEY = "test-only-key";
    assert.deepEqual(env.aiGatewayConfig, {
      baseUrl: "http://127.0.0.1:20128/v1",
      apiKey: "test-only-key",
    });

    process.env.AI_GATEWAY_BASE_URL = "http://route.example.test/v1";
    assert.throws(() => env.aiGatewayConfig, /must use HTTPS/);

    process.env.AI_GATEWAY_BASE_URL = "https://route.example.test/v1?token=unsafe";
    assert.throws(() => env.aiGatewayConfig, /query, or fragment/);

    process.env.AI_GATEWAY_BASE_URL = "https://route.example.test";
    assert.throws(() => env.aiGatewayConfig, /gateway \/v1 endpoint/);
  } finally {
    if (previousBaseUrl === undefined) delete process.env.AI_GATEWAY_BASE_URL;
    else process.env.AI_GATEWAY_BASE_URL = previousBaseUrl;
    if (previousApiKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = previousApiKey;
  }
});
