import { env } from "../../config/env.js";
import type { AIProviderAdapter } from "../ai-router.types.js";
import { createAIGatewayAdapter } from "./ai-gateway.adapter.js";
import { createGeminiAdapter } from "./gemini.adapter.js";

export function createConfiguredAIAdapter(): AIProviderAdapter {
  return env.aiGatewayConfig ? createAIGatewayAdapter() : createGeminiAdapter();
}
