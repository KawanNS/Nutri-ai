import "dotenv/config";

function requireEnvironmentVariable(
  name: "DATABASE_URL" | "JWT_SECRET" | "OPENAI_API_KEY" | "GEMINI_API_KEY",
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
};
