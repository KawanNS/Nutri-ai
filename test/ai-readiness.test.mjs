import assert from "node:assert/strict";
import test from "node:test";

import {
  createReadinessController,
} from "../dist/controllers/health.controller.js";
import {
  checkAIReadiness,
} from "../dist/services/ai-readiness.service.js";

const gatewayConfig = {
  baseUrl: "http://127.0.0.1:20128/v1",
  apiKey: "test-only-private-key",
};

test("gateway readiness succeeds without making a paid generation request", async () => {
  let receivedUrl = "";
  let receivedAuthorization = "";
  const result = await checkAIReadiness({
    gatewayConfig,
    fetchGateway: async (url, init) => {
      receivedUrl = url;
      receivedAuthorization = init.headers.Authorization;
      return { ok: true, status: 200 };
    },
  });

  assert.equal(receivedUrl, "http://127.0.0.1:20128/v1/models");
  assert.equal(receivedAuthorization, "Bearer test-only-private-key");
  assert.deepEqual(result, {
    ready: true,
    status: "READY",
    mode: "GATEWAY",
    provider: "GEMINI",
    code: "AI_READY",
  });
  assert.equal(JSON.stringify(result).includes(gatewayConfig.apiKey), false);
});

test("unreachable gateway returns a deterministic sanitized readiness failure", async () => {
  const privateFailure = `connection failed with ${gatewayConfig.apiKey}`;
  const result = await checkAIReadiness({
    gatewayConfig,
    fetchGateway: async () => {
      throw new Error(privateFailure);
    },
  });

  assert.deepEqual(result, {
    ready: false,
    status: "UNAVAILABLE",
    mode: "GATEWAY",
    provider: "GEMINI",
    code: "AI_GATEWAY_UNAVAILABLE",
  });
  assert.equal(JSON.stringify(result).includes(gatewayConfig.apiKey), false);
  assert.equal(JSON.stringify(result).includes(privateFailure), false);
});

test("gateway authentication failure is clear and does not expose credentials", async () => {
  const result = await checkAIReadiness({
    gatewayConfig,
    fetchGateway: async () => ({ ok: false, status: 401 }),
  });
  assert.equal(result.ready, false);
  assert.equal(result.code, "AI_GATEWAY_AUTH_ERROR");
  assert.equal(JSON.stringify(result).includes(gatewayConfig.apiKey), false);
});

test("direct provider readiness does not probe a gateway", async () => {
  let calls = 0;
  const result = await checkAIReadiness({
    gatewayConfig: null,
    directProviderConfigured: true,
    fetchGateway: async () => {
      calls += 1;
      return { ok: true, status: 200 };
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.ready, true);
  assert.equal(result.mode, "DIRECT");
});

test("public readiness controller returns 503 with sanitized AI status", async () => {
  let statusCode = 0;
  let body;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  };
  const controller = createReadinessController(async () => ({
    ready: false,
    status: "UNAVAILABLE",
    mode: "GATEWAY",
    provider: "GEMINI",
    code: "AI_GATEWAY_UNAVAILABLE",
  }));

  await controller({}, response);

  assert.equal(statusCode, 503);
  assert.deepEqual(body, {
    status: "unavailable",
    checks: {
      ai: {
        status: "UNAVAILABLE",
        mode: "GATEWAY",
        provider: "GEMINI",
        code: "AI_GATEWAY_UNAVAILABLE",
      },
    },
  });
  assert.equal(JSON.stringify(body).includes(gatewayConfig.apiKey), false);
});

test("public readiness sanitizes an unexpected checker failure", async () => {
  let statusCode = 0;
  let body;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  };
  const controller = createReadinessController(async () => {
    throw new Error("token-privado-nao-pode-vazar");
  });

  await controller({}, response);

  assert.equal(statusCode, 503);
  assert.equal(body.checks.ai.code, "AI_GATEWAY_UNAVAILABLE");
  assert.equal(
    JSON.stringify(body).includes("token-privado-nao-pode-vazar"),
    false,
  );
});
