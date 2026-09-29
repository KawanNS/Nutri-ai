import { env, type AIGatewayConfig } from "../config/env.js";

const DEFAULT_TIMEOUT_MS = 3_000;

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
}

interface GatewayHealthResponse {
  ok: boolean;
  status: number;
}

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

function defaultDiagnosticLogger(event: AIReadinessDiagnosticEvent): void {
  console.warn("[ai-readiness-diagnostic]", JSON.stringify(event));
}

function logFailure(
  logger: (event: AIReadinessDiagnosticEvent) => void,
  startedAt: number,
  now: () => number,
  category: AIReadinessDiagnosticCategory,
  upstreamStatus?: number,
): void {
  const elapsed = now() - startedAt;
  const event: AIReadinessDiagnosticEvent = {
    operation: "MODEL_CATALOG",
    durationMs: Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : 0,
    category,
    ...(upstreamStatus === undefined ? {} : { upstreamStatus }),
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

    logFailure(logDiagnostic, startedAt, now, "UPSTREAM_STATUS", response.status);

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
