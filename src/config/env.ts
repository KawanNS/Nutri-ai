import "dotenv/config";

function requireEnvironmentVariable(name: "DATABASE_URL" | "JWT_SECRET"): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }

  return value;
}

export const env = {
  get databaseUrl(): string {
    return requireEnvironmentVariable("DATABASE_URL");
  },
  get jwtSecret(): string {
    return requireEnvironmentVariable("JWT_SECRET");
  },
};
