import {
  AI_ROUTER_PROVIDERS,
  AI_TASKS,
  type AIRouterErrorCode,
} from "../ai-router.types.js";
import { isAllowedAIModel } from "../registry/ai-model.registry.js";
import {
  sanitizeAIUsage,
  type AITelemetryEvent,
  type AITelemetrySink,
} from "./ai-telemetry.js";

interface PricingRecord {
  version: number;
  currency: string;
  inputMicrosPerMillionTokens: bigint;
  outputMicrosPerMillionTokens: bigint;
}

const POSTGRES_INTEGER_MAX = 2_147_483_647;
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;

export interface PrismaAITelemetryClient {
  aiModelPricing: {
    findFirst(args: {
      where: {
        provider: string;
        model: string;
        validFrom: { lte: Date };
        OR: ({ validUntil: null } | { validUntil: { gt: Date } })[];
      };
      orderBy: ({ validFrom: "desc" } | { version: "desc" })[];
      select: {
        version: true;
        currency: true;
        inputMicrosPerMillionTokens: true;
        outputMicrosPerMillionTokens: true;
      };
    }): Promise<PricingRecord | null>;
  };
  aiUsageEvent: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

const ERROR_CATEGORIES = new Set<AIRouterErrorCode>([
  "AI_AUTH_ERROR",
  "AI_RATE_LIMIT",
  "AI_TIMEOUT",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_INVALID_RESPONSE",
  "AI_SCHEMA_VALIDATION_FAILED",
  "AI_CONFIGURATION_ERROR",
  "AI_UNSUPPORTED_PROVIDER",
  "AI_UNSUPPORTED_MODEL",
  "AI_UNSUPPORTED_TASK",
  "AI_UNKNOWN_ERROR",
]);

function estimateCostMicros(
  inputTokens: number | null,
  outputTokens: number | null,
  pricing: PricingRecord | null,
): bigint | null {
  if (
    !pricing ||
    inputTokens === null ||
    outputTokens === null ||
    !Number.isSafeInteger(pricing.version) ||
    pricing.version < 1 ||
    pricing.version > POSTGRES_INTEGER_MAX ||
    pricing.currency !== "USD" ||
    pricing.inputMicrosPerMillionTokens < 0n ||
    pricing.outputMicrosPerMillionTokens < 0n
  ) {
    return null;
  }
  const numerator =
    BigInt(inputTokens) * pricing.inputMicrosPerMillionTokens +
    BigInt(outputTokens) * pricing.outputMicrosPerMillionTokens;
  const rounded = (numerator + 500_000n) / 1_000_000n;
  return rounded <= POSTGRES_BIGINT_MAX ? rounded : null;
}

function databaseTokenCount(value: number | null): number | null {
  return value !== null && value <= POSTGRES_INTEGER_MAX ? value : null;
}

function knownTask(value: unknown): string | null {
  return typeof value === "string" && AI_TASKS.some((task) => task === value)
    ? value
    : null;
}

function knownProvider(value: unknown): string | null {
  return (
    typeof value === "string" &&
    AI_ROUTER_PROVIDERS.some((provider) => provider === value)
  )
    ? value
    : null;
}

export class PrismaAITelemetrySink implements AITelemetrySink {
  constructor(private readonly client: PrismaAITelemetryClient) {}

  async record(event: AITelemetryEvent): Promise<void> {
    const startedAt = new Date(event.startedAt);
    if (!Number.isFinite(startedAt.getTime())) {
      throw new Error("AI telemetry timestamp is invalid");
    }
    const task = knownTask(event.task);
    const provider = knownProvider(event.provider);
    const model =
      provider &&
      typeof event.model === "string" &&
      event.model.length <= 120 &&
      isAllowedAIModel(provider, event.model)
        ? event.model
        : null;
    const sanitizedUsage = sanitizeAIUsage(event.usage);
    const usage = sanitizedUsage
      ? {
          inputTokens: databaseTokenCount(sanitizedUsage.inputTokens),
          outputTokens: databaseTokenCount(sanitizedUsage.outputTokens),
          totalTokens: databaseTokenCount(sanitizedUsage.totalTokens),
          cachedInputTokens: databaseTokenCount(sanitizedUsage.cachedInputTokens),
          reasoningTokens: databaseTokenCount(sanitizedUsage.reasoningTokens),
        }
      : null;
    if (
      !Number.isSafeInteger(event.durationMs) ||
      event.durationMs < 0 ||
      event.durationMs > POSTGRES_INTEGER_MAX
    ) {
      throw new Error("AI telemetry duration is invalid");
    }
    const durationMs = event.durationMs;
    const errorCategory =
      typeof event.errorCategory === "string" &&
      ERROR_CATEGORIES.has(event.errorCategory as AIRouterErrorCode)
        ? event.errorCategory
        : null;

    const pricing =
      provider &&
      model &&
      usage !== null &&
      usage.inputTokens !== null &&
      usage.outputTokens !== null
        ? await this.client.aiModelPricing.findFirst({
            where: {
              provider,
              model,
              validFrom: { lte: startedAt },
              OR: [{ validUntil: null }, { validUntil: { gt: startedAt } }],
            },
            orderBy: [{ validFrom: "desc" }, { version: "desc" }],
            select: {
              version: true,
              currency: true,
              inputMicrosPerMillionTokens: true,
              outputMicrosPerMillionTokens: true,
            },
          })
        : null;
    const estimatedCostMicros = estimateCostMicros(
      usage?.inputTokens ?? null,
      usage?.outputTokens ?? null,
      pricing,
    );

    await this.client.aiUsageEvent.create({
      data: {
        task,
        provider: model ? provider : null,
        model,
        startedAt,
        durationMs,
        success: event.success === true,
        errorCategory,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
        cachedInputTokens: usage?.cachedInputTokens ?? null,
        reasoningTokens: usage?.reasoningTokens ?? null,
        estimatedCostMicros,
        estimatedCurrency: estimatedCostMicros === null ? null : pricing!.currency,
        pricingVersion: estimatedCostMicros === null ? null : pricing!.version,
      },
    });
  }
}
