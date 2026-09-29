import { env, type AIGatewayConfig } from "../config/env.js";

const DEFAULT_TIMEOUT_MS = 3_000;
const MAX_ERROR_BODY_BYTES = 16 * 1_024;

export type AIReadinessCode =
  | "AI_READY"
  | "AI_GATEWAY_CONFIGURATION_ERROR"
  | "AI_GATEWAY_UNAVAILABLE"
  | "AI_GATEWAY_AUTH_ERROR"
  | "AI_PROVIDER_NOT_CONFIGURED";

export interface AIReadinessResult {
  ready: boolean;
  status: "READY" | "UNAVAILABLE";
  mode: "GATEWAY" | "DIRECT";
  provider: "GEMINI";
  code: AIReadinessCode;
}

export type AIReadinessDiagnosticCategory =
  | "TIMEOUT"
  | "DNS"
  | "TLS"
  | "CONNECTION"
  | "UPSTREAM_STATUS";

export interface AIReadinessDiagnosticEvent {
  operation: "MODEL_CATALOG";
  durationMs: number;
  category: AIReadinessDiagnosticCategory;
  upstreamStatus?: number;
  safeErrorType?: string | number;
  safeErrorCode?: string | number;
  safeErrorStatus?: string | number;
  safeErrorMessage?: string;
}

interface GatewayHealthResponse {
  ok: boolean;
  status: number;
  body?: ReadableStream<Uint8Array> | null;
}

type SafeErrorDetails = Pick<
  AIReadinessDiagnosticEvent,
  "safeErrorType" | "safeErrorCode" | "safeErrorStatus" | "safeErrorMessage"
>;

interface AIReadinessDependencies {
  gatewayConfig?: AIGatewayConfig | null;
  directProviderConfigured?: boolean;
  fetchGateway?: (
    url: string,
    init: { headers: Record<string, string>; signal: AbortSignal },
  ) => Promise<GatewayHealthResponse>;
  timeoutMs?: number;
  logDiagnostic?: (event: AIReadinessDiagnosticEvent) => void;
  now?: () => number;
}

const timeoutErrorNames = new Set([
  "AbortError",
  "TimeoutError",
  "APIConnectionTimeoutError",
]);
const timeoutErrorCodes = new Set(["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"]);
const dnsErrorCodes = new Set(["ENOTFOUND", "EAI_AGAIN", "EAI_FAIL"]);
const connectionErrorCodes = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "UND_ERR_SOCKET",
]);
const tlsErrorCodes = new Set([
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);
const sensitiveTextPattern =
  /token|bearer|authorization|cookie|key|secret|oauth|credential|password|initial_password/i;
const sensitiveUrlPattern = /https?:\/\/[^\s?]+\?\S*/i;
const credentialLikePattern =
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.|\b(?:sk|pk|ghp|github_pat|AIza)[-_]?[A-Za-z0-9_-]{8,}|[A-Za-z0-9+/_=-]{24,}/;

function stringProperty(value: unknown, property: "name" | "code"): string | null {
  if (typeof value !== "object" || value === null || !(property in value)) return null;
  const candidate = (value as Record<string, unknown>)[property];
  return typeof candidate === "string" ? candidate : null;
}

function errorCause(error: unknown): unknown {
  if (typeof error !== "object" || error === null || !("cause" in error)) return null;
  return (error as { cause?: unknown }).cause;
}

function classifyTransportError(error: unknown): AIReadinessDiagnosticCategory {
  const cause = errorCause(error);
  const name = stringProperty(error, "name");
  const code = stringProperty(error, "code") ?? stringProperty(cause, "code");

  if (name && timeoutErrorNames.has(name)) return "TIMEOUT";
  if (code && timeoutErrorCodes.has(code)) return "TIMEOUT";
  if (code && dnsErrorCodes.has(code)) return "DNS";
  if (
    code &&
    (tlsErrorCodes.has(code) || code.startsWith("ERR_TLS_") || code.startsWith("ERR_SSL_"))
  ) {
    return "TLS";
  }
  if (code && connectionErrorCodes.has(code)) return "CONNECTION";
  return "CONNECTION";
}

function containsSensitiveText(value: string): boolean {
  return (
    sensitiveTextPattern.test(value) ||
    sensitiveUrlPattern.test(value) ||
    credentialLikePattern.test(value)
  );
}

function sanitizeErrorScalar(value: unknown): string | number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 100 ||
    containsSensitiveText(normalized) ||
    !/^[A-Za-z0-9_.:-]+$/.test(normalized)
  ) {
    return "REDACTED";
  }
  return normalized;
}

function sanitizeErrorMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (
    normalized.length === 0 ||
    normalized.length > 300 ||
    containsSensitiveText(normalized)
  ) {
    return "REDACTED";
  }
  return normalized;
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // Body inspection is best-effort and must not affect readiness.
  }
}

async function readLimitedErrorBody(
  body: ReadableStream<Uint8Array> | null | undefined,
): Promise<string | null> {
  if (!body) return null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_ERROR_BODY_BYTES) {
        await cancelReader(reader);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    await cancelReader(reader);
    return null;
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function extractSafeErrorDetails(
  response: GatewayHealthResponse,
): Promise<SafeErrorDetails> {
  if (response.body === undefined) return {};
  const body = await readLimitedErrorBody(response.body);
  if (body === null) return { safeErrorMessage: "REDACTED" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { safeErrorMessage: "REDACTED" };
  }

  if (typeof parsed !== "object" || parsed === null || !("error" in parsed)) {
    return { safeErrorMessage: "REDACTED" };
  }
  const error = (parsed as { error?: unknown }).error;
  if (typeof error === "string") {
    return { safeErrorMessage: sanitizeErrorMessage(error) ?? "REDACTED" };
  }
  if (typeof error !== "object" || error === null) {
    return { safeErrorMessage: "REDACTED" };
  }

  const record = error as Record<string, unknown>;
  const details: SafeErrorDetails = {};
  const type = sanitizeErrorScalar(record.type);
  const code = sanitizeErrorScalar(record.code);
  const status = sanitizeErrorScalar(record.status);
  const message = sanitizeErrorMessage(record.message);
  if (type !== undefined) details.safeErrorType = type;
  if (code !== undefined) details.safeErrorCode = code;
  if (status !== undefined) details.safeErrorStatus = status;
  if (message !== undefined) details.safeErrorMessage = message;
  return Object.keys(details).length > 0 ? details : { safeErrorMessage: "REDACTED" };
}

function defaultDiagnosticLogger(event: AIReadinessDiagnosticEvent): void {
  console.warn("[ai-readiness-diagnostic]", JSON.stringify(event));
}

function logFailure(
  logger: (event: AIReadinessDiagnosticEvent) => void,
  startedAt: number,
  now: () => number,
  category: AIReadinessDiagnosticCategory,
  upstreamStatus?: number,
  safeErrorDetails: SafeErrorDetails = {},
): void {
  const elapsed = now() - startedAt;
  const event: AIReadinessDiagnosticEvent = {
    operation: "MODEL_CATALOG",
    durationMs: Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : 0,
    category,
    ...(upstreamStatus === undefined ? {} : { upstreamStatus }),
    ...safeErrorDetails,
  };

  try {
    logger(event);
  } catch {
    // Diagnostics must never change readiness behavior.
  }
}

function unavailable(
  mode: AIReadinessResult["mode"],
  code: Exclude<AIReadinessCode, "AI_READY">,
): AIReadinessResult {
  return {
    ready: false,
    status: "UNAVAILABLE",
    mode,
    provider: "GEMINI",
    code,
  };
}

export async function checkAIReadiness(
  overrides: AIReadinessDependencies = {},
): Promise<AIReadinessResult> {
  let gatewayConfig: AIGatewayConfig | null;

  try {
    gatewayConfig = overrides.gatewayConfig === undefined
      ? env.aiGatewayConfig
      : overrides.gatewayConfig;
  } catch {
    return unavailable("GATEWAY", "AI_GATEWAY_CONFIGURATION_ERROR");
  }

  if (!gatewayConfig) {
    const configured = overrides.directProviderConfigured === undefined
      ? env.geminiApiKeyOrNull !== null
      : overrides.directProviderConfigured;
    return configured
      ? {
          ready: true,
          status: "READY",
          mode: "DIRECT",
          provider: "GEMINI",
          code: "AI_READY",
        }
      : unavailable("DIRECT", "AI_PROVIDER_NOT_CONFIGURED");
  }

  const timeoutMs =
    Number.isFinite(overrides.timeoutMs) &&
    Number.isInteger(overrides.timeoutMs) &&
    overrides.timeoutMs! > 0 &&
    overrides.timeoutMs! <= 10_000
      ? overrides.timeoutMs!
      : DEFAULT_TIMEOUT_MS;
  const fetchGateway = overrides.fetchGateway ?? ((url, init) => fetch(url, init));
  const logDiagnostic = overrides.logDiagnostic ?? defaultDiagnosticLogger;
  const now = overrides.now ?? Date.now;
  const startedAt = now();

  try {
    const response = await fetchGateway(`${gatewayConfig.baseUrl}/models`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${gatewayConfig.apiKey}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.ok) {
      return {
        ready: true,
        status: "READY",
        mode: "GATEWAY",
        provider: "GEMINI",
        code: "AI_READY",
      };
    }

    const safeErrorDetails = await extractSafeErrorDetails(response);
    logFailure(
      logDiagnostic,
      startedAt,
      now,
      "UPSTREAM_STATUS",
      response.status,
      safeErrorDetails,
    );

    return unavailable(
      "GATEWAY",
      response.status === 401 || response.status === 403
        ? "AI_GATEWAY_AUTH_ERROR"
        : "AI_GATEWAY_UNAVAILABLE",
    );
  } catch (error: unknown) {
    logFailure(logDiagnostic, startedAt, now, classifyTransportError(error));
    return unavailable("GATEWAY", "AI_GATEWAY_UNAVAILABLE");
  }
}

export type { AIReadinessDependencies };
