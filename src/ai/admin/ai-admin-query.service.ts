import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import {
  AI_ROUTER_PROVIDERS,
  AI_TASKS,
  type AIRouterErrorCode,
  type AIRouterProvider,
  type AITask,
} from "../ai-router.types.js";
import { isAllowedAIModel } from "../registry/ai-model.registry.js";
import type {
  AIAdminAuditQuery,
  AIAdminUsageQuery,
} from "./ai-admin.contracts.js";

type AIAdminQueryClient = Pick<
  PrismaClient,
  "aiUsageEvent" | "aiRouteAuditLog"
>;

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

function pagination(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

function usageWhere(query: AIAdminUsageQuery): Prisma.AiUsageEventWhereInput {
  return {
    ...(query.task ? { task: query.task } : {}),
    ...(query.provider ? { provider: query.provider } : {}),
    ...(query.model ? { model: query.model } : {}),
    ...(query.status ? { success: query.status === "SUCCESS" } : {}),
    ...(query.from || query.to
      ? {
          startedAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  };
}

function knownTask(value: string | null): AITask | null {
  return value !== null && AI_TASKS.some((task) => task === value)
    ? (value as AITask)
    : null;
}

function knownProvider(value: string | null): AIRouterProvider | null {
  return value !== null && AI_ROUTER_PROVIDERS.some((provider) => provider === value)
    ? (value as AIRouterProvider)
    : null;
}

function knownModel(provider: AIRouterProvider | null, value: string | null): string | null {
  return provider && value && isAllowedAIModel(provider, value) ? value : null;
}

function iso(value: Date): string {
  return value.toISOString();
}

function safeErrorCategory(value: string | null): AIRouterErrorCode | null {
  return value !== null && ERROR_CATEGORIES.has(value as AIRouterErrorCode)
    ? (value as AIRouterErrorCode)
    : null;
}

function safeCurrency(value: string | null): string | null {
  const currency = value?.trim() ?? null;
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

export class PrismaAIAdminQueryService {
  constructor(private readonly client: AIAdminQueryClient) {}

  async listUsage(query: AIAdminUsageQuery) {
    const where = usageWhere(query);
    const [total, successfulCalls, aggregate, records] = await Promise.all([
      this.client.aiUsageEvent.count({ where }),
      this.client.aiUsageEvent.count({ where: { ...where, success: true } }),
      this.client.aiUsageEvent.aggregate({
        where,
        _sum: {
          durationMs: true,
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
          cachedInputTokens: true,
          reasoningTokens: true,
        },
        _avg: { durationMs: true },
      }),
      this.client.aiUsageEvent.findMany({
        where,
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          task: true,
          provider: true,
          model: true,
          startedAt: true,
          durationMs: true,
          success: true,
          errorCategory: true,
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
          cachedInputTokens: true,
          reasoningTokens: true,
          estimatedCostMicros: true,
          estimatedCurrency: true,
          pricingVersion: true,
        },
      }),
    ]);

    return {
      summary: {
        calls: total,
        successfulCalls,
        failedCalls: total - successfulCalls,
        latency: {
          totalMs: aggregate._sum.durationMs ?? 0,
          averageMs: aggregate._avg.durationMs,
        },
        usage: {
          inputTokens: aggregate._sum.inputTokens,
          outputTokens: aggregate._sum.outputTokens,
          totalTokens: aggregate._sum.totalTokens,
          cachedInputTokens: aggregate._sum.cachedInputTokens,
          reasoningTokens: aggregate._sum.reasoningTokens,
        },
      },
      items: records.map((record) => {
        const provider = knownProvider(record.provider);
        const estimatedCurrency = safeCurrency(record.estimatedCurrency);
        return {
          task: knownTask(record.task),
          provider,
          model: knownModel(provider, record.model),
          startedAt: iso(record.startedAt),
          durationMs: record.durationMs,
          success: record.success,
          errorCategory: safeErrorCategory(record.errorCategory),
          usage: {
            inputTokens: record.inputTokens,
            outputTokens: record.outputTokens,
            totalTokens: record.totalTokens,
            cachedInputTokens: record.cachedInputTokens,
            reasoningTokens: record.reasoningTokens,
          },
          estimatedCost:
            record.estimatedCostMicros === null || estimatedCurrency === null
              ? null
              : {
                  currency: estimatedCurrency,
                  amountMicros: record.estimatedCostMicros.toString(),
                  pricingVersion: record.pricingVersion,
                },
        };
      }),
      pagination: pagination(query.page, query.limit, total),
    };
  }

  async summarizeCosts(query: AIAdminUsageQuery) {
    const where = usageWhere(query);
    const [totalCalls, callsWithKnownCost, grouped] = await Promise.all([
      this.client.aiUsageEvent.count({ where }),
      this.client.aiUsageEvent.count({
        where: { ...where, estimatedCostMicros: { not: null } },
      }),
      this.client.aiUsageEvent.groupBy({
        by: ["estimatedCurrency"],
        where: { ...where, estimatedCostMicros: { not: null } },
        _sum: { estimatedCostMicros: true },
        orderBy: { estimatedCurrency: "asc" },
      }),
    ]);

    return {
      totalCalls,
      callsWithKnownCost,
      callsWithUnknownCost: totalCalls - callsWithKnownCost,
      totals: grouped.flatMap((group) => {
        const currency = safeCurrency(group.estimatedCurrency);
        return currency && group._sum.estimatedCostMicros !== null
          ? [
              {
                currency,
                amountMicros: group._sum.estimatedCostMicros.toString(),
              },
            ]
          : [];
      }),
    };
  }

  async listAudit(query: AIAdminAuditQuery) {
    const where: Prisma.AiRouteAuditLogWhereInput = {
      ...(query.task ? { task: query.task } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [total, records] = await Promise.all([
      this.client.aiRouteAuditLog.count({ where }),
      this.client.aiRouteAuditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          action: true,
          task: true,
          previousOrigin: true,
          previousProvider: true,
          previousModel: true,
          previousEnabled: true,
          previousVersion: true,
          newProvider: true,
          newModel: true,
          newEnabled: true,
          newVersion: true,
          changedByUserId: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      items: records.map((record) => {
        const task = knownTask(record.task);
        const previousProvider = knownProvider(record.previousProvider);
        const currentProvider = knownProvider(record.newProvider);
        const previousModel = knownModel(previousProvider, record.previousModel);
        const currentModel = knownModel(currentProvider, record.newModel);
        if (!task || !previousProvider || !currentProvider || !previousModel || !currentModel) {
          throw new Error("AI route audit record is invalid");
        }
        return {
          action: record.action,
          task,
          previousRoute: {
            source: record.previousOrigin,
            provider: previousProvider,
            model: previousModel,
            enabled: record.previousEnabled,
            version: record.previousVersion ?? 0,
          },
          currentRoute: {
            source: "PERSISTED" as const,
            provider: currentProvider,
            model: currentModel,
            enabled: record.newEnabled,
            version: record.newVersion,
          },
          actorUserId: record.changedByUserId,
          changedAt: iso(record.createdAt),
        };
      }),
      pagination: pagination(query.page, query.limit, total),
    };
  }
}
