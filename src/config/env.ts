import "dotenv/config";

function requireEnvironmentVariable(
  name:
    | "DATABASE_URL"
    | "JWT_SECRET"
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

export const env = {
  get frontendUrl(): string {
    return process.env.FRONTEND_URL?.trim() || "http://localhost:5173";
  },
  get databaseUrl(): string {
    return requireEnvironmentVariable("DATABASE_URL");
  },
  get jwtSecret(): string {
    return requireEnvironmentVariable("JWT_SECRET");
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
  get geminiModel(): string {
    return process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
  },
  get caktoWebhookSecret(): string {
    return requireEnvironmentVariable("CAKTO_WEBHOOK_SECRET");
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
};
