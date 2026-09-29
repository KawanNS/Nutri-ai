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

    return unavailable(
      "GATEWAY",
      response.status === 401 || response.status === 403
        ? "AI_GATEWAY_AUTH_ERROR"
        : "AI_GATEWAY_UNAVAILABLE",
    );
  } catch {
    return unavailable("GATEWAY", "AI_GATEWAY_UNAVAILABLE");
  }
}

export type { AIReadinessDependencies };
