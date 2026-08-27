import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_RESPONSE_FIELDS,
  LEGACY_FIELDS,
  MALFORMED_JSON_FIELDS,
  VALIDATION_FAILED_FIELDS,
  isPidOwnedByChildTree,
  listenerPidsForPort,
  parseSafeDiagnosticLine,
  sanitizeDiagnostic,
  selectListenerOwnership,
} from "./meal-plan-e2e.mjs";

async function parseListenerOutput(output) {
  return listenerPidsForPort(54382, async () => output, "win32");
}

function parentProvider(entries) {
  const parents = new Map(entries);
  return async (pid) => parents.get(pid) ?? null;
}

const forbidden = {
  responseText: "raw response",
  text: "raw text",
  prompt: "raw prompt",
  contents: "raw contents",
  systemInstruction: "raw instruction",
  Profile: { private: true },
  profileSnapshot: { private: true },
  apiKey: "private",
  GEMINI_API_KEY: "private",
  jwt: "private",
  JWT_SECRET: "private",
  DATABASE_URL: "private",
  headers: { authorization: "private" },
  URLs: ["private"],
  safetyRatings: ["private"],
  safetyMessages: ["private"],
  candidate: { private: true },
  content: { private: true },
  parts: [{ text: "private" }],
  response: { private: true },
  error: { message: "private" },
  message: "private message",
  token: "private token",
  character: "private character",
  snippet: "private snippet",
  context: "private context",
  rawLine: "private raw line",
  input: "private input",
  value: "private value",
  expected: "private expected",
  received: "private received",
  stack: "private",
  cause: "private cause",
  secretMarker: "SUPER_SECRET_MARKER",
  unknownObject: { nested: "private" },
};

const validValidationIssue = {
  path: ["days", 0, "meals", 1, "foods"],
  code: "invalid_type",
};

test("legacy diagnostic uses only its explicit allowlist", () => {
  const result = sanitizeDiagnostic({
    ...forbidden,
    provider: "gemini",
    operation: "generateMealPlan",
    errorName: "ApiError",
    status: 503,
    category: "SERVICE_UNAVAILABLE",
  });
  assert.deepEqual(Object.keys(result), LEGACY_FIELDS);
  assert.deepEqual(result, {
    provider: "gemini", operation: "generateMealPlan", errorName: "ApiError",
    status: 503, category: "SERVICE_UNAVAILABLE",
  });
});

test("empty_response uses only its explicit allowlist", () => {
  const result = sanitizeDiagnostic({
    ...forbidden, provider: "gemini", operation: "generateMealPlan", event: "empty_response",
    candidateCount: 1, finishReason: "STOP", promptBlockReason: null, hasContent: true,
    partCount: 2, textPartCount: 1, thoughtPartCount: 1,
  });
  assert.deepEqual(Object.keys(result), EMPTY_RESPONSE_FIELDS);
  assert.deepEqual(result, {
    provider: "gemini", operation: "generateMealPlan", event: "empty_response",
    candidateCount: 1, finishReason: "STOP", promptBlockReason: null, hasContent: true,
    partCount: 2, textPartCount: 1, thoughtPartCount: 1,
  });
});

test("malformed_json uses only its explicit allowlist", () => {
  const result = sanitizeDiagnostic({
    ...forbidden, provider: "gemini", operation: "generateMealPlan", event: "malformed_json",
    responseLength: 42, firstNonWhitespaceChar: "{", lastNonWhitespaceChar: "x",
    hasMarkdownFence: true, candidateCount: 1, finishReason: "STOP", partCount: 1,
    textPartCount: 1, thoughtPartCount: 0,
    parseErrorCategory: "unexpected_token", parseErrorPosition: 0,
    parseErrorLine: 1, parseErrorColumn: 1,
  });
  assert.deepEqual(Object.keys(result), MALFORMED_JSON_FIELDS);
  assert.deepEqual(result, {
    provider: "gemini", operation: "generateMealPlan", event: "malformed_json",
    responseLength: 42, firstNonWhitespaceChar: "{", lastNonWhitespaceChar: "x",
    hasMarkdownFence: true, candidateCount: 1, finishReason: "STOP", partCount: 1,
    textPartCount: 1, thoughtPartCount: 0,
    parseErrorCategory: "unexpected_token", parseErrorPosition: 0,
    parseErrorLine: 1, parseErrorColumn: 1,
  });
});

test("malformed_json preserves positive coordinates and nullable parse metadata", () => {
  assert.deepEqual(sanitizeDiagnostic({
    event: "malformed_json",
    parseErrorCategory: "bad_escape",
    parseErrorPosition: 123,
    parseErrorLine: 4,
    parseErrorColumn: 17,
  }), {
    provider: null,
    operation: null,
    event: "malformed_json",
    responseLength: 0,
    firstNonWhitespaceChar: null,
    lastNonWhitespaceChar: null,
    hasMarkdownFence: false,
    candidateCount: 0,
    finishReason: null,
    partCount: 0,
    textPartCount: 0,
    thoughtPartCount: 0,
    parseErrorCategory: "bad_escape",
    parseErrorPosition: 123,
    parseErrorLine: 4,
    parseErrorColumn: 17,
  });

  const nullable = sanitizeDiagnostic({
    event: "malformed_json",
    parseErrorCategory: "unexpected_end",
    parseErrorPosition: null,
    parseErrorLine: null,
    parseErrorColumn: null,
  });
  assert.equal(nullable.parseErrorPosition, null);
  assert.equal(nullable.parseErrorLine, null);
  assert.equal(nullable.parseErrorColumn, null);
});

test("malformed_json rejects unknown categories and invalid coordinates", () => {
  const unsafeCategory = "SUPER_SECRET_PARSE_CATEGORY";
  const result = sanitizeDiagnostic({
    ...forbidden,
    event: "malformed_json",
    parseErrorCategory: unsafeCategory,
    parseErrorPosition: "0",
    parseErrorLine: 0,
    parseErrorColumn: 1.5,
  });
  assert.equal(result.parseErrorCategory, null);
  assert.equal(result.parseErrorPosition, null);
  assert.equal(result.parseErrorLine, null);
  assert.equal(result.parseErrorColumn, null);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(unsafeCategory), false);
  for (const value of Object.values(forbidden)) {
    if (typeof value === "string") assert.equal(serialized.includes(value), false);
  }
});

test("validation_failed preserves only its nested allowlist", () => {
  const result = sanitizeDiagnostic({
    ...forbidden,
    provider: "gemini",
    operation: "generateMealPlan",
    event: "validation_failed",
    issueCount: 1,
    issues: [{
      ...validValidationIssue,
      message: "secret message",
      expected: "secret expected",
      received: "secret received",
      input: "secret input",
      value: "secret value",
      responseText: "secret response",
      stack: "secret stack",
      cause: "secret cause",
      unknown: "secret unknown",
    }],
  });

  assert.deepEqual(Object.keys(result), VALIDATION_FAILED_FIELDS);
  assert.deepEqual(result, {
    provider: "gemini",
    operation: "generateMealPlan",
    event: "validation_failed",
    issueCount: 1,
    issues: [validValidationIssue],
  });
  assert.deepEqual(Object.keys(result.issues[0]), ["path", "code"]);
  const serialized = JSON.stringify(result);
  for (const secret of [
    "secret message", "secret expected", "secret received", "secret input",
    "secret value", "secret response", "secret stack", "secret cause",
    "secret unknown", "SUPER_SECRET_MARKER",
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("validation_failed limits issues without changing valid issueCount", () => {
  const issues = Array.from({ length: 12 }, (_, index) => ({
    path: ["days", index, "meals"],
    code: "too_small",
  }));
  const result = sanitizeDiagnostic({ event: "validation_failed", issueCount: 12, issues });
  assert.equal(result.issueCount, 12);
  assert.equal(result.issues.length, 10);
});

test("validation_failed discards invalid issues and unsafe paths", () => {
  const leakedPathValue = "SUPER_SECRET_DYNAMIC_PATH";
  const result = sanitizeDiagnostic({
    event: "validation_failed",
    issueCount: 5,
    issues: [
      validValidationIssue,
      null,
      { path: ["days", -1], code: "invalid_type" },
      { path: [leakedPathValue], code: "invalid_type" },
      { path: ["days"], code: "not_a_zod_code" },
    ],
  });
  assert.deepEqual(result.issues, [validValidationIssue]);
  assert.equal(JSON.stringify(result).includes(leakedPathValue), false);
});

test("validation_failed normalizes invalid containers and issueCount", () => {
  assert.deepEqual(sanitizeDiagnostic({
    event: "validation_failed",
    issueCount: 1.5,
    issues: "not-an-array",
  }), {
    provider: null,
    operation: null,
    event: "validation_failed",
    issueCount: 0,
    issues: [],
  });
});

test("forbidden fields, secret markers, and unknown objects are discarded", () => {
  const result = sanitizeDiagnostic({
    ...forbidden, provider: "gemini", operation: "generateMealPlan", event: "malformed_json",
  });
  const serialized = JSON.stringify(result);
  for (const key of Object.keys(forbidden)) assert.equal(Object.hasOwn(result, key), false);
  assert.equal(serialized.includes("SUPER_SECRET_MARKER"), false);
  assert.equal(serialized.includes("raw response"), false);
});

test("invalid types are normalized without interpretation", () => {
  assert.deepEqual(sanitizeDiagnostic({
    provider: 1, operation: {}, event: "empty_response", candidateCount: -1,
    finishReason: 2, promptBlockReason: [], hasContent: "true", partCount: Infinity,
    textPartCount: NaN, thoughtPartCount: -2,
  }), {
    provider: null, operation: null, event: "empty_response", candidateCount: 0,
    finishReason: null, promptBlockReason: null, hasContent: false, partCount: 0,
    textPartCount: 0, thoughtPartCount: 0,
  });
});

test("multi-character boundary values are rejected", () => {
  const result = sanitizeDiagnostic({
    event: "malformed_json", firstNonWhitespaceChar: "{{", lastNonWhitespaceChar: "end",
  });
  assert.equal(result.firstNonWhitespaceChar, null);
  assert.equal(result.lastNonWhitespaceChar, null);
});

test("unknown event falls back to the narrow legacy allowlist", () => {
  const result = sanitizeDiagnostic({
    ...forbidden, provider: "gemini", operation: "generateMealPlan", event: "unknown",
    responseLength: 999, firstNonWhitespaceChar: "{", candidateCount: 5,
  });
  assert.deepEqual(Object.keys(result), LEGACY_FIELDS);
  assert.equal("event" in result, false);
  assert.equal("responseLength" in result, false);
});

test("line parser rejects raw and non-object input without output", () => {
  assert.equal(parseSafeDiagnosticLine("not-json SUPER_SECRET_MARKER"), null);
  assert.equal(parseSafeDiagnosticLine(JSON.stringify([forbidden])), null);
  assert.equal(parseSafeDiagnosticLine(null), null);
});

test("listener parser accepts an empty JSON array", async () => {
  assert.deepEqual(await parseListenerOutput("[]"), []);
});

test("listener parser accepts a one-item JSON array", async () => {
  assert.deepEqual(await parseListenerOutput("[123]"), [123]);
});

test("listener parser normalizes a scalar PID to an array", async () => {
  assert.deepEqual(await parseListenerOutput("123"), [123]);
});

test("listener parser accepts empty output", async () => {
  assert.deepEqual(await parseListenerOutput(""), []);
});

test("listener parser rejects invalid JSON", async () => {
  assert.deepEqual(await parseListenerOutput("not-json"), []);
});

test("listener parser accepts multiple PIDs", async () => {
  assert.deepEqual(await parseListenerOutput("[123,456]"), [123, 456]);
});

test("listener parser discards invalid PIDs", async () => {
  assert.deepEqual(
    await parseListenerOutput('[123,0,-1,1.5,"456",null,789]'),
    [123, 789],
  );
});

test("listener query uses exact port and does not require one local address", async () => {
  let capturedScript = "";
  let capturedPort = null;
  const result = await listenerPidsForPort(
    54382,
    async (script, port) => {
      capturedScript = script;
      capturedPort = port;
      return "[]";
    },
    "win32",
  );

  assert.deepEqual(result, []);
  assert.equal(capturedPort, 54382);
  assert.match(capturedScript, /-State Listen/);
  assert.match(capturedScript, /-LocalPort \$port/);
  assert.doesNotMatch(capturedScript, /-LocalAddress/);
});

test("listener PID equal to child PID is owned", async () => {
  assert.equal(await isPidOwnedByChildTree(10, 10, parentProvider([])), true);
});

test("direct child listener is owned", async () => {
  assert.equal(await isPidOwnedByChildTree(10, 20, parentProvider([[20, 10]])), true);
});

test("grandchild listener is owned", async () => {
  assert.equal(
    await isPidOwnedByChildTree(10, 30, parentProvider([[30, 20], [20, 10]])),
    true,
  );
});

test("external listener is rejected", async () => {
  assert.equal(
    await isPidOwnedByChildTree(10, 30, parentProvider([[30, 20], [20, 1]])),
    false,
  );
});

test("empty process tree is rejected", async () => {
  assert.equal(await isPidOwnedByChildTree(10, 20, parentProvider([])), false);
});

test("invalid PIDs are rejected", async () => {
  const provider = parentProvider([]);
  assert.equal(await isPidOwnedByChildTree(0, 20, provider), false);
  assert.equal(await isPidOwnedByChildTree(10, -1, provider), false);
  assert.equal(await isPidOwnedByChildTree(10.5, 20, provider), false);
  assert.equal(await isPidOwnedByChildTree("10", 20, provider), false);
});

test("artificial cycle terminates and is rejected", async () => {
  assert.equal(
    await isPidOwnedByChildTree(10, 30, parentProvider([[30, 20], [20, 30]])),
    false,
  );
});

test("broken parent chain is rejected", async () => {
  assert.equal(
    await isPidOwnedByChildTree(10, 30, parentProvider([[30, 20]])),
    false,
  );
});

test("listener selection preserves the child PID with ownership", async () => {
  assert.deepEqual(await selectListenerOwnership(10, [10], parentProvider([])), {
    listenerPid: 10,
    listenerOwnedByChildTree: true,
  });
});

test("listener selection preserves a direct child with ownership", async () => {
  assert.deepEqual(
    await selectListenerOwnership(10, [20], parentProvider([[20, 10]])),
    { listenerPid: 20, listenerOwnedByChildTree: true },
  );
});

test("listener selection preserves a grandchild with ownership", async () => {
  assert.deepEqual(
    await selectListenerOwnership(10, [30], parentProvider([[30, 20], [20, 10]])),
    { listenerPid: 30, listenerOwnedByChildTree: true },
  );
});

test("listener selection preserves an external PID only for diagnosis", async () => {
  assert.deepEqual(
    await selectListenerOwnership(10, [30], parentProvider([[30, 1]])),
    { listenerPid: 30, listenerOwnedByChildTree: false },
  );
});

test("listener selection reports no listener safely", async () => {
  assert.deepEqual(await selectListenerOwnership(10, [], parentProvider([])), {
    listenerPid: null,
    listenerOwnedByChildTree: false,
  });
});

test("listener selection prefers an owned PID among multiple listeners", async () => {
  assert.deepEqual(
    await selectListenerOwnership(
      10,
      [40, 30],
      parentProvider([[40, 1], [30, 20], [20, 10]]),
    ),
    { listenerPid: 30, listenerOwnedByChildTree: true },
  );
});

test("multiple external listeners remain unowned", async () => {
  assert.deepEqual(
    await selectListenerOwnership(10, [40, 30], parentProvider([[40, 1], [30, 2]])),
    { listenerPid: 40, listenerOwnedByChildTree: false },
  );
});

test("invalid listener PIDs are never selected or owned", async () => {
  assert.deepEqual(
    await selectListenerOwnership(10, [null, 0, -1, 1.5, "20"], parentProvider([])),
    { listenerPid: null, listenerOwnedByChildTree: false },
  );
});
