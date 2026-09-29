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

function sequenceClock(...values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function assertNoSensitiveData(value, ...privateValues) {
  const serialized = JSON.stringify(value).toLowerCase();
  const forbidden = [
    gatewayConfig.apiKey,
    "authorization",
    "bearer",
    "token",
    "headers",
    "upstream body",
    ...privateValues,
  ];
  for (const candidate of forbidden) {
    assert.equal(serialized.includes(candidate.toLowerCase()), false);
  }
}

test("gateway readiness succeeds without making a paid generation request", async () => {
  let receivedUrl = "";
  let receivedAuthorization = "";
  const diagnostics = [];
  const result = await checkAIReadiness({
    gatewayConfig,
    logDiagnostic: (event) => diagnostics.push(event),
    fetchGateway: async (url, init) => {
      receivedUrl = url;
      receivedAuthorization = init.headers.Authorization;
      return { ok: true, status: 200 };
    },
  });
  assert.deepEqual(diagnostics, []);

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
  const diagnostics = [];
  const result = await checkAIReadiness({
    gatewayConfig,
    fetchGateway: async () => {
      throw new Error(privateFailure);
    },
    logDiagnostic: (event) => diagnostics.push(event),
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
  assertNoSensitiveData({ result, diagnostics }, privateFailure);
});

for (const status of [401, 403]) {
  test(`gateway authentication failure ${status} remains sanitized`, async () => {
    const diagnostics = [];
    const result = await checkAIReadiness({
      gatewayConfig,
      fetchGateway: async () => ({ ok: false, status }),
      logDiagnostic: (event) => diagnostics.push(event),
      now: sequenceClock(100, 112),
    });
    assert.equal(result.ready, false);
    assert.equal(result.code, "AI_GATEWAY_AUTH_ERROR");
    assert.deepEqual(diagnostics, [{
      operation: "MODEL_CATALOG",
      durationMs: 12,
      category: "UPSTREAM_STATUS",
      upstreamStatus: status,
    }]);
    assertNoSensitiveData({ result, diagnostics });
  });
}

for (const status of [404, 429, 500]) {
  test(`gateway HTTP ${status} logs only the sanitized upstream status`, async () => {
    const diagnostics = [];
    const result = await checkAIReadiness({
      gatewayConfig,
      fetchGateway: async () => ({ ok: false, status }),
      logDiagnostic: (event) => diagnostics.push(event),
      now: sequenceClock(200, 219),
    });
    assert.equal(result.code, "AI_GATEWAY_UNAVAILABLE");
    assert.deepEqual(diagnostics, [{
      operation: "MODEL_CATALOG",
      durationMs: 19,
      category: "UPSTREAM_STATUS",
      upstreamStatus: status,
    }]);
    assertNoSensitiveData({ result, diagnostics });
  });
}

test("gateway timeout logs only the sanitized timeout category", async () => {
  const diagnostics = [];
  const privateMessage = `timeout with Authorization Bearer ${gatewayConfig.apiKey}`;
  const timeout = new Error(privateMessage);
  timeout.name = "TimeoutError";
  const result = await checkAIReadiness({
    gatewayConfig,
    fetchGateway: async () => { throw timeout; },
    logDiagnostic: (event) => diagnostics.push(event),
    now: sequenceClock(300, 3_305),
  });
  assert.equal(result.code, "AI_GATEWAY_UNAVAILABLE");
  assert.deepEqual(diagnostics, [{
    operation: "MODEL_CATALOG",
    durationMs: 3_005,
    category: "TIMEOUT",
  }]);
  assertNoSensitiveData({ result, diagnostics }, privateMessage);
});

test("gateway connection error logs only the sanitized connection category", async () => {
  const diagnostics = [];
  const privateMessage = `socket body token=${gatewayConfig.apiKey}`;
  const connectionError = new TypeError("fetch failed", {
    cause: Object.assign(new Error(privateMessage), { code: "ECONNRESET" }),
  });
  const result = await checkAIReadiness({
    gatewayConfig,
    fetchGateway: async () => { throw connectionError; },
    logDiagnostic: (event) => diagnostics.push(event),
    now: sequenceClock(400, 407),
  });
  assert.equal(result.code, "AI_GATEWAY_UNAVAILABLE");
  assert.deepEqual(diagnostics, [{
    operation: "MODEL_CATALOG",
    durationMs: 7,
    category: "CONNECTION",
  }]);
  assertNoSensitiveData({ result, diagnostics }, privateMessage);
});

for (const [code, category] of [
  ["ENOTFOUND", "DNS"],
  ["ERR_TLS_CERT_ALTNAME_INVALID", "TLS"],
]) {
  test(`gateway ${category} error is classified without leaking its cause`, async () => {
    const diagnostics = [];
    const privateMessage = `private upstream body with ${gatewayConfig.apiKey}`;
    const error = new TypeError("fetch failed", {
      cause: Object.assign(new Error(privateMessage), { code }),
    });
    const result = await checkAIReadiness({
      gatewayConfig,
      fetchGateway: async () => { throw error; },
      logDiagnostic: (event) => diagnostics.push(event),
      now: sequenceClock(500, 503),
    });
    assert.equal(result.code, "AI_GATEWAY_UNAVAILABLE");
    assert.deepEqual(diagnostics, [{
      operation: "MODEL_CATALOG",
      durationMs: 3,
      category,
    }]);
    assertNoSensitiveData({ result, diagnostics }, privateMessage);
  });
}

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
  assertNoSensitiveData(body);
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
