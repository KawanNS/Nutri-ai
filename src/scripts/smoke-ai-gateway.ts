import { createAIGatewayAdapter } from "../ai/adapters/ai-gateway.adapter.js";
import { createConfiguredAIAdapter } from "../ai/adapters/configured.adapter.js";
import { createAIRouter } from "../ai/ai-router.js";
import { createConfiguredAIRoutingPolicy } from "../ai/ai-routing-policy.js";
import { AIRouterError } from "../ai/ai-router.types.js";
import { InMemoryAIRouteConfigRepository } from "../ai/config/ai-route-config.repository.js";
import { InMemoryAITelemetrySink } from "../ai/telemetry/ai-telemetry.js";
import { env } from "../config/env.js";

interface GatewaySmokeResponse {
  model?: unknown;
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: unknown;
  error?: { code?: unknown };
}

function safeContent(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 200) : "missing";
}

async function verifyAuthenticationError(): Promise<void> {
  const gateway = env.aiGatewayConfig;
  if (!gateway) throw new Error("AI gateway is not configured");
  const adapter = createAIGatewayAdapter({
    config: {
      baseUrl: gateway.baseUrl,
      apiKey: "intentionally-invalid-smoke-key",
    },
  });

  try {
    await adapter.generate(
      {
        task: "MEAL_PLAN_GENERATION",
        instructions: "Return only compact JSON.",
        input: "Return an empty JSON object.",
        responseFormat: "STRUCTURED_JSON",
        timeoutMs: 10_000,
      },
      {
        task: "MEAL_PLAN_GENERATION",
        provider: "GEMINI",
        model: env.geminiModel,
      },
    );
    throw new Error("AI gateway accepted an invalid API key");
  } catch (error: unknown) {
    if (!(error instanceof AIRouterError) || error.code !== "AI_AUTH_ERROR") {
      throw error;
    }
    console.log("AUTH_ERROR_TEST=SUCCESS");
    console.log(`AUTH_ERROR_CODE=${error.code}`);
    console.log(`AUTH_ERROR_RETRYABLE=${error.retryable}`);
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--auth-error-only")) {
    await verifyAuthenticationError();
    return;
  }

  const gateway = env.aiGatewayConfig;
  if (!gateway) throw new Error("AI gateway is not configured");

  const directResponse = await fetch(`${gateway.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${gateway.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.geminiModel,
      messages: [
        { role: "system", content: "Return only compact JSON." },
        { role: "user", content: "Return a JSON object with gateway set to ok." },
      ],
      response_format: { type: "json_object" },
      max_tokens: 32,
      stream: false,
    }),
  });
  const directBody = (await directResponse.json()) as GatewaySmokeResponse;
  console.log(`DIRECT_HTTP_STATUS=${directResponse.status}`);
  if (!directResponse.ok) {
    console.log(`DIRECT_ERROR_CODE=${String(directBody.error?.code ?? "unknown")}`);
    throw new Error("Direct AI gateway smoke request failed");
  }
  console.log(`DIRECT_MODEL=${String(directBody.model ?? "unknown")}`);
  console.log(`DIRECT_CONTENT=${safeContent(directBody.choices?.[0]?.message?.content)}`);
  console.log(`DIRECT_USAGE_PRESENT=${directBody.usage !== undefined}`);

  const telemetry = new InMemoryAITelemetrySink();
  const router = createAIRouter({
    policy: createConfiguredAIRoutingPolicy(),
    adapters: [createConfiguredAIAdapter()],
    routeConfigRepository: new InMemoryAIRouteConfigRepository(),
    telemetrySink: telemetry,
  });
  const routed = await router.route({
    task: "MEAL_PLAN_GENERATION",
    instructions: "Return only compact JSON.",
    input: "Return a JSON object with router set to ok.",
    responseFormat: "STRUCTURED_JSON",
    timeoutMs: 30_000,
  });

  console.log("ROUTER_RESULT=SUCCESS");
  console.log(`ROUTER_PROVIDER=${routed.provider}`);
  console.log(`ROUTER_MODEL=${routed.model}`);
  console.log(`ROUTER_CONTENT=${safeContent(routed.content)}`);
  console.log(`ROUTER_FINISH_REASON=${routed.finishReason ?? "null"}`);
  console.log(`ROUTER_USAGE=${JSON.stringify(routed.usage)}`);
  console.log(`ROUTER_TELEMETRY=${JSON.stringify(telemetry.list())}`);
}

main().catch((error: unknown) => {
  console.error("AI_GATEWAY_SMOKE=FAILED", {
    errorType: error instanceof Error ? error.name : "UnknownError",
  });
  process.exitCode = 1;
});
