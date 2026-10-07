import "dotenv/config";

function requireEnvironmentVariable(
  name:
    | "DATABASE_URL"
    | "JWT_SECRET"
    | "GOOGLE_CLIENT_ID"
    | "OPENAI_API_KEY"
    | "GEMINI_API_KEY"
    | "CAKTO_WEBHOOK_SECRET",
): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }

  return value;
}

export interface AIGatewayConfig {
  baseUrl: string;
  apiKey: string;
}

export function resolveFrontendUrl(
  value: string | undefined,
  nodeEnvironment: string | undefined = process.env.NODE_ENV,
): string {
  const configured = value?.trim();

  if (!configured) {
    if (nodeEnvironment === "production") {
      throw new Error("FRONTEND_URL is required in production");
    }
    return "http://localhost:5173";
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("FRONTEND_URL must be a valid URL origin");
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("FRONTEND_URL must contain only an origin");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("FRONTEND_URL must use HTTP or HTTPS");
  }
  if (nodeEnvironment === "production" && url.protocol !== "https:") {
    throw new Error("FRONTEND_URL must use HTTPS in production");
  }

  return url.origin;
}

function normalizeGatewayBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("AI_GATEWAY_BASE_URL must be a valid URL");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error("AI_GATEWAY_BASE_URL must not contain credentials, query, or fragment");
  }

  const isLoopback = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    throw new Error("AI_GATEWAY_BASE_URL must use HTTPS except on loopback");
  }
  if (!url.pathname.replace(/\/$/, "").endsWith("/v1")) {
    throw new Error("AI_GATEWAY_BASE_URL must target the gateway /v1 endpoint");
  }

  return url.toString().replace(/\/$/, "");
}

export const env = {
  get frontendUrl(): string {
    return resolveFrontendUrl(process.env.FRONTEND_URL);
  },
  get databaseUrl(): string {
    return requireEnvironmentVariable("DATABASE_URL");
  },
  get jwtSecret(): string {
    return requireEnvironmentVariable("JWT_SECRET");
  },
  get googleClientId(): string {
    return requireEnvironmentVariable("GOOGLE_CLIENT_ID");
  },
  get openaiApiKey(): string {
    return requireEnvironmentVariable("OPENAI_API_KEY");
  },
  get openaiModel(): string {
    return process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";
  },
  get aiProvider(): "openai" | "gemini" {
    const provider = process.env.AI_PROVIDER?.trim() || "openai";

    if (provider !== "openai" && provider !== "gemini") {
      throw new Error("AI_PROVIDER must be either openai or gemini");
    }

    return provider;
  },
  get geminiApiKey(): string {
    return requireEnvironmentVariable("GEMINI_API_KEY");
  },
  get geminiApiKeyOrNull(): string | null {
    return process.env.GEMINI_API_KEY?.trim() || null;
  },
  get geminiModel(): string {
    return process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
  },
  get aiGatewayConfig(): AIGatewayConfig | null {
    const baseUrl = process.env.AI_GATEWAY_BASE_URL?.trim() || null;
    const apiKey = process.env.AI_GATEWAY_API_KEY?.trim() || null;

    if (baseUrl === null && apiKey === null) return null;
    if (baseUrl === null || apiKey === null) {
      throw new Error(
        "AI_GATEWAY_BASE_URL and AI_GATEWAY_API_KEY must be configured together",
      );
    }

    return Object.freeze({
      baseUrl: normalizeGatewayBaseUrl(baseUrl),
      apiKey,
    });
  },
  get caktoWebhookSecret(): string {
    return requireEnvironmentVariable("CAKTO_WEBHOOK_SECRET");
  },
  get caktoWebhookSecretOrNull(): string | null {
    return process.env.CAKTO_WEBHOOK_SECRET?.trim() || null;
  },
  get caktoApiBaseUrl(): string {
    return process.env.CAKTO_API_BASE_URL?.trim() || "https://api.cakto.com.br";
  },
  get caktoApiAccessToken(): string | null {
    return process.env.CAKTO_API_ACCESS_TOKEN?.trim() || null;
  },
  caktoCheckoutUrls: {
    MONTHLY:
      process.env.CAKTO_MONTHLY_CHECKOUT_URL?.trim() ||
      "https://pay.cakto.com.br/ugdtzm4_1082268",
    QUARTERLY:
      process.env.CAKTO_QUARTERLY_CHECKOUT_URL?.trim() ||
      "https://pay.cakto.com.br/t7cba8g_1082579",
    ANNUAL:
      process.env.CAKTO_ANNUAL_CHECKOUT_URL?.trim() ||
      "https://pay.cakto.com.br/osevqyx_1082601",
  },
  caktoProductIds: {
    MONTHLY: process.env.CAKTO_MONTHLY_PRODUCT_ID?.trim() || null,
    QUARTERLY: process.env.CAKTO_QUARTERLY_PRODUCT_ID?.trim() || null,
    ANNUAL: process.env.CAKTO_ANNUAL_PRODUCT_ID?.trim() || null,
  },
  caktoOfferIds: {
    MONTHLY: process.env.CAKTO_MONTHLY_OFFER_ID?.trim() || null,
    QUARTERLY: process.env.CAKTO_QUARTERLY_OFFER_ID?.trim() || null,
    ANNUAL: process.env.CAKTO_ANNUAL_OFFER_ID?.trim() || null,
  },
};
