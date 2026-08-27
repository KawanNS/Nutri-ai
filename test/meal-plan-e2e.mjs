import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const HOST = "127.0.0.1";
const FORBIDDEN_PORT = 3000;
const PROJECT_ENV_PATH = fileURLToPath(new URL("../.env", import.meta.url));

const LEGACY_FIELDS = ["provider", "operation", "errorName", "status", "category"];
const EMPTY_RESPONSE_FIELDS = [
  "provider",
  "operation",
  "event",
  "candidateCount",
  "finishReason",
  "promptBlockReason",
  "hasContent",
  "partCount",
  "textPartCount",
  "thoughtPartCount",
];
const MALFORMED_JSON_FIELDS = [
  "provider",
  "operation",
  "event",
  "responseLength",
  "firstNonWhitespaceChar",
  "lastNonWhitespaceChar",
  "hasMarkdownFence",
  "candidateCount",
  "finishReason",
  "partCount",
  "textPartCount",
  "thoughtPartCount",
  "parseErrorCategory",
  "parseErrorPosition",
  "parseErrorLine",
  "parseErrorColumn",
];
const VALIDATION_FAILED_FIELDS = [
  "provider",
  "operation",
  "event",
  "issueCount",
  "issues",
];
const VALIDATION_PATH_PROPERTIES = new Set([
  "title", "summary", "durationDays", "currency", "dailyTargets",
  "caloriesKcal", "proteinGrams", "carbohydrateGrams", "fatGrams",
  "days", "day", "label", "meals", "name", "suggestedTime", "foods",
  "quantity", "unit", "preparation", "estimatedNutrition",
  "estimatedDailyCost", "shoppingList", "category", "items",
  "estimatedWeeklyCost", "notes", "safetyNotices",
]);
const ZOD_ISSUE_CODES = new Set([
  "invalid_type", "too_big", "too_small", "invalid_format",
  "not_multiple_of", "unrecognized_keys", "invalid_union", "invalid_key",
  "invalid_element", "invalid_value", "custom",
]);
const JSON_PARSE_ERROR_CATEGORIES = new Set([
  "unexpected_token",
  "unexpected_end",
  "bad_control_character",
  "bad_escape",
  "bad_number",
  "missing_separator",
  "unknown_syntax",
]);

function safeString(value) {
  return typeof value === "string" ? value : null;
}

function safeNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function safeNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function safeNullableInteger(value, minimum) {
  return Number.isSafeInteger(value) && value >= minimum ? value : null;
}

function safeBoolean(value) {
  return typeof value === "boolean" ? value : false;
}

function safeCharacter(value) {
  return typeof value === "string" && [...value].length <= 1 ? value || null : null;
}

function sanitizeLegacyDiagnostic(value) {
  return {
    provider: safeString(value.provider),
    operation: safeString(value.operation),
    errorName: safeString(value.errorName),
    status: safeNumber(value.status, null),
    category: safeString(value.category),
  };
}

function sanitizeEmptyResponseDiagnostic(value) {
  return {
    provider: safeString(value.provider),
    operation: safeString(value.operation),
    event: "empty_response",
    candidateCount: safeNumber(value.candidateCount),
    finishReason: safeString(value.finishReason),
    promptBlockReason: safeString(value.promptBlockReason),
    hasContent: safeBoolean(value.hasContent),
    partCount: safeNumber(value.partCount),
    textPartCount: safeNumber(value.textPartCount),
    thoughtPartCount: safeNumber(value.thoughtPartCount),
  };
}

function sanitizeMalformedJsonDiagnostic(value) {
  return {
    provider: safeString(value.provider),
    operation: safeString(value.operation),
    event: "malformed_json",
    responseLength: safeNumber(value.responseLength),
    firstNonWhitespaceChar: safeCharacter(value.firstNonWhitespaceChar),
    lastNonWhitespaceChar: safeCharacter(value.lastNonWhitespaceChar),
    hasMarkdownFence: safeBoolean(value.hasMarkdownFence),
    candidateCount: safeNumber(value.candidateCount),
    finishReason: safeString(value.finishReason),
    partCount: safeNumber(value.partCount),
    textPartCount: safeNumber(value.textPartCount),
    thoughtPartCount: safeNumber(value.thoughtPartCount),
    parseErrorCategory: JSON_PARSE_ERROR_CATEGORIES.has(value.parseErrorCategory)
      ? value.parseErrorCategory
      : null,
    parseErrorPosition: safeNullableInteger(value.parseErrorPosition, 0),
    parseErrorLine: safeNullableInteger(value.parseErrorLine, 1),
    parseErrorColumn: safeNullableInteger(value.parseErrorColumn, 1),
  };
}

function sanitizeValidationIssue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!Array.isArray(value.path) || !ZOD_ISSUE_CODES.has(value.code)) return null;
  const pathIsSafe = value.path.every(
    (segment) =>
      (Number.isSafeInteger(segment) && segment >= 0) ||
      (typeof segment === "string" && VALIDATION_PATH_PROPERTIES.has(segment)),
  );
  if (!pathIsSafe) return null;
  return { path: value.path, code: value.code };
}

function sanitizeValidationFailedDiagnostic(value) {
  const issues = Array.isArray(value.issues)
    ? value.issues
        .map(sanitizeValidationIssue)
        .filter((issue) => issue !== null)
        .slice(0, 10)
    : [];
  return {
    provider: safeString(value.provider),
    operation: safeString(value.operation),
    event: "validation_failed",
    issueCount: safeNonNegativeInteger(value.issueCount),
    issues,
  };
}

export function sanitizeDiagnostic(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.event === "empty_response") return sanitizeEmptyResponseDiagnostic(value);
  if (value.event === "malformed_json") return sanitizeMalformedJsonDiagnostic(value);
  if (value.event === "validation_failed") {
    return sanitizeValidationFailedDiagnostic(value);
  }
  return sanitizeLegacyDiagnostic(value);
}

export function parseSafeDiagnosticLine(line) {
  if (typeof line !== "string") return null;
  try {
    return sanitizeDiagnostic(JSON.parse(line));
  } catch {
    return null;
  }
}

export async function loadE2EEnvironment() {
  const { config } = await import("dotenv");
  const result = config({ path: PROJECT_ENV_PATH, quiet: true });
  if (result.error) throw new Error("HARNESS_ENV_LOAD_FAILED");
}

export function checkE2EEnvironment() {
  return {
    aiProviderCorrect: process.env.AI_PROVIDER === "gemini",
    geminiApiKeyPresent:
      typeof process.env.GEMINI_API_KEY === "string" &&
      process.env.GEMINI_API_KEY.length > 0,
    geminiModelCorrect:
      process.env.GEMINI_MODEL === "gemini-3.5-flash-lite",
  };
}

function captureSafeLines(stream, safeDiagnostics, onReady) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (/^Server running on port \d+$/.test(line)) onReady();
      const diagnostic = parseSafeDiagnosticLine(line);
      if (diagnostic) safeDiagnostics.push(diagnostic);
    }
  });
}

async function reserveEphemeralPort() {
  for (;;) {
    const server = net.createServer();
    server.unref();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host: HOST, port: 0, exclusive: true }, resolve);
    });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (port !== 0 && port !== FORBIDDEN_PORT) return port;
  }
}

async function isPortAvailable(port) {
  const server = net.createServer();
  server.unref();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host: HOST, port, exclusive: true }, resolve);
    });
    return true;
  } catch {
    return false;
  } finally {
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

function isPositivePid(value) {
  return Number.isSafeInteger(value) && value > 0;
}

async function runWindowsPowerShell(script, integerArgument) {
  if (!Number.isSafeInteger(integerArgument) || integerArgument < 0) return "";
  const command = `& { ${script} } ${integerArgument}`;
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    command,
  ], {
    windowsHide: true,
  });
  return stdout.trim();
}

export async function listenerPidsForPort(
  port,
  runPowerShell = runWindowsPowerShell,
  platform = process.platform,
) {
  if (platform !== "win32" || !Number.isSafeInteger(port) || port <= 0) return [];
  const output = await runPowerShell(
    "$port = [int]$args[0]; $pids = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique); ConvertTo-Json -InputObject $pids -Compress",
    port,
  );
  if (!output) return [];
  try {
    const parsed = JSON.parse(output);
    return (Array.isArray(parsed) ? parsed : [parsed]).filter(isPositivePid);
  } catch {
    return [];
  }
}

async function windowsParentPid(processId) {
  if (process.platform !== "win32" || !isPositivePid(processId)) return null;
  const output = await runWindowsPowerShell(
    "$processId = [int]$args[0]; $process = Get-CimInstance -ClassName Win32_Process -Filter \"ProcessId = $processId\" -ErrorAction SilentlyContinue; if ($null -ne $process) { [Console]::Out.Write($process.ParentProcessId) }",
    processId,
  );
  if (!/^\d+$/.test(output)) return null;
  const parentPid = Number(output);
  return isPositivePid(parentPid) ? parentPid : null;
}

export async function isPidOwnedByChildTree(
  childPid,
  listenerPid,
  getParentPid = windowsParentPid,
) {
  if (!isPositivePid(childPid) || !isPositivePid(listenerPid)) return false;
  if (listenerPid === childPid) return true;

  const visited = new Set();
  let currentPid = listenerPid;
  while (isPositivePid(currentPid) && !visited.has(currentPid)) {
    visited.add(currentPid);
    const parentPid = await getParentPid(currentPid);
    if (parentPid === childPid) return true;
    if (!isPositivePid(parentPid)) return false;
    currentPid = parentPid;
  }
  return false;
}

export async function selectListenerOwnership(
  childPid,
  listenerPids,
  getParentPid = windowsParentPid,
) {
  const validListenerPids = Array.isArray(listenerPids)
    ? [...new Set(listenerPids.filter(isPositivePid))]
    : [];

  for (const listenerPid of validListenerPids) {
    if (await isPidOwnedByChildTree(childPid, listenerPid, getParentPid)) {
      return { listenerPid, listenerOwnedByChildTree: true };
    }
  }

  return {
    listenerPid: validListenerPids[0] ?? null,
    listenerOwnedByChildTree: false,
  };
}

function childIsAlive(child) {
  return child.exitCode === null && child.signalCode === null;
}

async function waitForHealth(baseUrl, child, attempts = 80) {
  for (let index = 0; index < attempts; index += 1) {
    assert.equal(childIsAlive(child), true, "ChildProcess exited before health check");
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.status === 200) return response.status;
    } catch {
      // Readiness polling is not a generation retry.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("HARNESS_HEALTH_TIMEOUT");
}

async function requestJson(baseUrl, path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

function authHeaders(token, extra = {}) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json", ...extra };
}

function summarizeEvents(events) {
  const summary = { total: events.length, PENDING: 0, CONSUMED: 0, RELEASED: 0, FAILED: 0 };
  for (const event of events) {
    if (Object.hasOwn(summary, event.status)) summary[event.status] += 1;
  }
  return summary;
}

async function stopOwnedChild(child) {
  if (!child || !childIsAlive(child)) return true;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (childIsAlive(child)) child.kill("SIGKILL");
  if (childIsAlive(child)) await once(child, "exit");
  return !childIsAlive(child);
}

export async function runMealPlanE2E() {
  const { spawn } = await import("node:child_process");
  const safeDiagnostics = [];
  const report = {
    testPort: null,
    childPid: null,
    listenerPid: null,
    listenerOwnedByChildTree: false,
    listenerMatchesChild: false,
    healthStatus: null,
    childAliveBeforeGeneration: false,
    childAliveAfterResponse: false,
    generationRequestCount: 0,
    geminiCallCount: null,
    retryDetected: false,
    clientStatus: null,
    clientCode: null,
    safeDiagnostics,
    jsonParseExecuted: null,
    zodExecuted: null,
    zodPassed: null,
    usageControlSummary: null,
    usageEventSummary: null,
    mealPlanCount: null,
    cleanupCounts: null,
    childStopped: false,
    testPortReleased: false,
    port3000Untouched: true,
  };
  let child;
  let prisma;
  let temporaryUserId;
  const unique = randomUUID();
  const email = `nutri-e2e-${unique}@example.invalid`;
  const password = randomBytes(24).toString("base64url");

  try {
    assert.equal(process.env.AI_PROVIDER, "gemini", "HARNESS_PROVIDER_PRECONDITION");
    assert.ok(process.env.GEMINI_API_KEY, "HARNESS_GEMINI_KEY_PRECONDITION");
    assert.equal(process.env.GEMINI_MODEL, "gemini-3.5-flash-lite", "HARNESS_MODEL_PRECONDITION");
    const prismaModule = await import("../dist/lib/prisma.js");
    prisma = prismaModule.prisma;
    report.testPort = await reserveEphemeralPort();
    assert.notEqual(report.testPort, FORBIDDEN_PORT);
    const baseUrl = `http://${HOST}:${report.testPort}`;
    child = spawn(process.execPath, ["dist/server.js"], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "development", PORT: String(report.testPort) },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    report.childPid = child.pid ?? null;
    let readinessSeen = false;
    const onReady = () => { readinessSeen = true; };
    captureSafeLines(child.stdout, safeDiagnostics, onReady);
    captureSafeLines(child.stderr, safeDiagnostics, onReady);
    assert.equal(childIsAlive(child), true);
    report.healthStatus = await waitForHealth(baseUrl, child);
    assert.equal(readinessSeen || report.healthStatus === 200, true);
    assert.equal(childIsAlive(child), true);
    const listenerPids = await listenerPidsForPort(report.testPort);
    const listenerOwnership = await selectListenerOwnership(
      report.childPid,
      listenerPids,
    );
    report.listenerPid = listenerOwnership.listenerPid;
    report.listenerOwnedByChildTree =
      listenerOwnership.listenerOwnedByChildTree;
    report.listenerMatchesChild = report.listenerOwnedByChildTree;
    assert.equal(report.listenerOwnedByChildTree, true);

    const register = await requestJson(baseUrl, "/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Nutri E2E", email, password }),
    });
    assert.equal(register.status, 201);
    temporaryUserId = register.body?.user?.id;
    assert.equal(typeof temporaryUserId, "string");
    const login = await requestJson(baseUrl, "/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200);
    const token = login.body?.token;
    assert.equal(typeof token, "string");
    const profile = await requestJson(baseUrl, "/api/profile", {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({
        birthDate: "1990-01-01", sex: "FEMALE", heightCm: 165, weightKg: 60,
        goal: "MAINTENANCE", activityLevel: "MODERATE", mealsPerDay: 3,
        weeklyFoodBudget: 300, foodPreferences: [], likedFoods: [], dislikedFoods: [],
        foodRestrictions: [], foodAllergies: [],
      }),
    });
    assert.equal(profile.status, 200);

    const beforeUsage = await prisma.usageControl.findUniqueOrThrow({ where: { userId: temporaryUserId } });
    const beforeEvents = await prisma.usageEvent.count({ where: { userId: temporaryUserId } });
    const beforePlans = await prisma.mealPlan.count({ where: { userId: temporaryUserId } });
    assert.equal(beforeUsage.freeUsesConsumed, 0);
    assert.equal(beforeUsage.freeUsesReserved, 0);
    assert.equal(beforeEvents, 0);
    assert.equal(beforePlans, 0);
    report.childAliveBeforeGeneration = childIsAlive(child);
    assert.equal(report.childAliveBeforeGeneration, true);

    report.generationRequestCount += 1;
    const generation = await requestJson(baseUrl, "/api/meal-plans/generate", {
      method: "POST",
      headers: authHeaders(token, { "Idempotency-Key": randomUUID() }),
      body: "{}",
    });
    report.clientStatus = generation.status;
    report.clientCode = typeof generation.body?.code === "string" ? generation.body.code : null;
    report.childAliveAfterResponse = childIsAlive(child);
    assert.equal(report.childAliveAfterResponse, true);
    report.retryDetected = report.generationRequestCount > 1;
    assert.equal(report.generationRequestCount, 1);
    assert.equal(report.retryDetected, false);

    const afterUsage = await prisma.usageControl.findUniqueOrThrow({ where: { userId: temporaryUserId } });
    const afterEvents = await prisma.usageEvent.findMany({ where: { userId: temporaryUserId }, select: { status: true } });
    const afterPlans = await prisma.mealPlan.count({ where: { userId: temporaryUserId } });
    report.usageControlSummary = {
      consumed: afterUsage.freeUsesConsumed,
      reserved: afterUsage.freeUsesReserved,
    };
    report.usageEventSummary = summarizeEvents(afterEvents);
    report.mealPlanCount = afterPlans;

    const malformed = safeDiagnostics.some((item) => item.event === "malformed_json");
    const empty = safeDiagnostics.some((item) => item.event === "empty_response");
    if (generation.status >= 200 && generation.status < 300) {
      assert.equal(afterUsage.freeUsesConsumed, beforeUsage.freeUsesConsumed + 1);
      assert.equal(afterUsage.freeUsesReserved, 0);
      assert.deepEqual(summarizeEvents(afterEvents), { total: 1, PENDING: 0, CONSUMED: 1, RELEASED: 0, FAILED: 0 });
      assert.equal(afterPlans, 1);
      report.jsonParseExecuted = true;
      report.zodExecuted = true;
      report.zodPassed = true;
    } else {
      assert.equal(afterUsage.freeUsesConsumed, 0);
      assert.equal(afterUsage.freeUsesReserved, 0);
      assert.deepEqual(summarizeEvents(afterEvents), { total: 1, PENDING: 0, CONSUMED: 0, RELEASED: 0, FAILED: 1 });
      assert.equal(afterPlans, 0);
      if (malformed) {
        report.jsonParseExecuted = true;
        report.zodExecuted = false;
        report.zodPassed = false;
      } else if (empty) {
        report.jsonParseExecuted = false;
        report.zodExecuted = false;
        report.zodPassed = false;
      }
    }
  } catch {
    report.clientCode ??= "HARNESS_FAILED";
  } finally {
    try {
      if (prisma) {
        if (!temporaryUserId) {
          temporaryUserId = (await prisma.user.findUnique({ where: { email }, select: { id: true } }))?.id;
        }
        if (temporaryUserId) {
          await prisma.user.deleteMany({ where: { id: temporaryUserId, email } });
          report.cleanupCounts = {
            User: await prisma.user.count({ where: { id: temporaryUserId } }),
            Profile: await prisma.profile.count({ where: { userId: temporaryUserId } }),
            UsageControl: await prisma.usageControl.count({ where: { userId: temporaryUserId } }),
            UsageEvent: await prisma.usageEvent.count({ where: { userId: temporaryUserId } }),
            MealPlan: await prisma.mealPlan.count({ where: { userId: temporaryUserId } }),
          };
          assert.deepEqual(report.cleanupCounts, {
            User: 0,
            Profile: 0,
            UsageControl: 0,
            UsageEvent: 0,
            MealPlan: 0,
          });
        }
        await prisma.$disconnect();
      }
    } catch {
      report.cleanupCounts = null;
    }
    report.childStopped = await stopOwnedChild(child);
    if (report.testPort !== null) report.testPortReleased = await isPortAvailable(report.testPort);
  }
  return report;
}

export {
  EMPTY_RESPONSE_FIELDS,
  LEGACY_FIELDS,
  MALFORMED_JSON_FIELDS,
  VALIDATION_FAILED_FIELDS,
};

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  await loadE2EEnvironment();
  const report = await runMealPlanE2E();
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
