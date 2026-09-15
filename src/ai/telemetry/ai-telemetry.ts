import type { AIEstimatedCost } from "../cost/ai-cost.js";
import type {
  AIRouterErrorCode,
  AIRouterProvider,
  AITask,
  AIUsage,
} from "../ai-router.types.js";

export interface AITelemetryEvent {
  task: AITask | null;
  provider: AIRouterProvider | null;
  model: string | null;
  startedAt: string;
  durationMs: number;
  success: boolean;
  errorCategory: AIRouterErrorCode | null;
  usage: AIUsage | null;
  estimatedCost: AIEstimatedCost | null;
}

export interface AITelemetrySink {
  record(event: AITelemetryEvent): void | Promise<void>;
}

export class InMemoryAITelemetrySink implements AITelemetrySink {
  private readonly events: AITelemetryEvent[] = [];

  record(event: AITelemetryEvent): void {
    this.events.push(structuredClone(event));
  }

  list(): readonly AITelemetryEvent[] {
    return this.events.map((event) => structuredClone(event));
  }
}

function sanitizeTokenCount(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;
}

export function sanitizeAIUsage(value: unknown): AIUsage | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  try {
    const candidate = value as Record<string, unknown>;
    return {
      inputTokens: sanitizeTokenCount(candidate.inputTokens),
      outputTokens: sanitizeTokenCount(candidate.outputTokens),
      totalTokens: sanitizeTokenCount(candidate.totalTokens),
      cachedInputTokens: sanitizeTokenCount(candidate.cachedInputTokens),
      reasoningTokens: sanitizeTokenCount(candidate.reasoningTokens),
    };
  } catch {
    return null;
  }
}

export function emitAITelemetry(
  sink: AITelemetrySink | undefined,
  event: AITelemetryEvent,
): void {
  if (!sink) return;

  try {
    const result = sink.record(event);
    void Promise.resolve(result).catch(() => undefined);
  } catch {
    // Telemetry must never repeat or change the outcome of an AI call.
  }
}
