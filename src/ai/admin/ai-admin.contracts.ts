import { z } from "zod";

import { AI_ROUTER_PROVIDERS, AI_TASKS, type AIUsage } from "../ai-router.types.js";
import type { AIEstimatedCost } from "../cost/ai-cost.js";
import { isAllowedAIModel } from "../registry/ai-model.registry.js";

const POSTGRES_INTEGER_MAX = 2_147_483_647;
const ADMIN_LIST_MAX_LIMIT = 100;

function queryInteger(defaultValue: number, maximum: number) {
  return z.preprocess(
    (value) => {
      if (value === undefined) return defaultValue;
      if (typeof value === "number") return value;
      return typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
    },
    z.number().int().min(1).max(maximum),
  );
}

const adminPeriodSchema = {
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
};

function validatePeriod(
  input: { from?: string; to?: string },
  context: z.RefinementCtx,
): void {
  if (input.from && input.to && Date.parse(input.from) > Date.parse(input.to)) {
    context.addIssue({
      code: "custom",
      path: ["to"],
      message: "The end of the period must not precede its start",
    });
  }
}

function validatePagination(
  input: { page: number; limit: number },
  context: z.RefinementCtx,
): void {
  if ((input.page - 1) * input.limit > POSTGRES_INTEGER_MAX) {
    context.addIssue({
      code: "custom",
      path: ["page"],
      message: "Pagination offset is too large",
    });
  }
}

export const aiAdminUsageQuerySchema = z
  .object({
    page: queryInteger(1, POSTGRES_INTEGER_MAX),
    limit: queryInteger(20, ADMIN_LIST_MAX_LIMIT),
    task: z.enum(AI_TASKS).optional(),
    provider: z.enum(AI_ROUTER_PROVIDERS).optional(),
    model: z.string().trim().min(1).max(120).optional(),
    status: z.enum(["SUCCESS", "FAILURE"]).optional(),
    ...adminPeriodSchema,
  })
  .strict()
  .superRefine((input, context) => {
    validatePagination(input, context);
    validatePeriod(input, context);
    if (
      input.model &&
      !AI_ROUTER_PROVIDERS.some((provider) =>
        isAllowedAIModel(input.provider ?? provider, input.model!),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["model"],
        message: "Model is not allowed",
      });
    }
  });

export type AIAdminUsageQuery = z.infer<typeof aiAdminUsageQuerySchema>;

export const aiAdminAuditQuerySchema = z
  .object({
    page: queryInteger(1, POSTGRES_INTEGER_MAX),
    limit: queryInteger(20, ADMIN_LIST_MAX_LIMIT),
    task: z.enum(AI_TASKS).optional(),
    ...adminPeriodSchema,
  })
  .strict()
  .superRefine((input, context) => {
    validatePagination(input, context);
    validatePeriod(input, context);
  });

export type AIAdminAuditQuery = z.infer<typeof aiAdminAuditQuerySchema>;

export const aiRouteUpdateInputSchema = z
  .object({
    task: z.enum(AI_TASKS),
    provider: z.enum(AI_ROUTER_PROVIDERS),
    model: z.string().trim().min(1).max(120),
    enabled: z.boolean(),
  })
  .strict()
  .superRefine((input, context) => {
    if (!isAllowedAIModel(input.provider, input.model)) {
      context.addIssue({
        code: "custom",
        path: ["model"],
        message: "Model is not allowed for provider",
      });
    }
  });

export type AIRouteUpdateInput = z.infer<typeof aiRouteUpdateInputSchema>;

export const aiPersistedRouteUpdateInputSchema = z
  .object({
    provider: z.enum(AI_ROUTER_PROVIDERS),
    model: z.string().trim().min(1).max(120),
    enabled: z.boolean(),
    expectedVersion: z.number().int().min(0).max(POSTGRES_INTEGER_MAX),
  })
  .strict()
  .superRefine((input, context) => {
    if (!isAllowedAIModel(input.provider, input.model)) {
      context.addIssue({
        code: "custom",
        path: ["model"],
        message: "Model is not allowed for provider",
      });
    }
  });

export type AIPersistedRouteUpdateInput = z.infer<
  typeof aiPersistedRouteUpdateInputSchema
>;

export interface AIProviderSummary {
  provider: (typeof AI_ROUTER_PROVIDERS)[number];
  displayName: string;
  operational: boolean;
  configured: boolean;
  status: "ACTIVE" | "NOT_CONFIGURED" | "INACTIVE" | "UNAVAILABLE";
  capabilities: readonly string[];
  allowedModels: readonly string[];
}

export interface AIRouteSummary {
  task: (typeof AI_TASKS)[number];
  provider: (typeof AI_ROUTER_PROVIDERS)[number];
  model: string;
  enabled: boolean;
}

export interface AIPersistedRouteSummary extends AIRouteSummary {
  source: "DEFAULT" | "PERSISTED";
  version: number;
}

export interface AIUsageSummary {
  periodStart: string;
  periodEnd: string;
  task: (typeof AI_TASKS)[number] | null;
  provider: (typeof AI_ROUTER_PROVIDERS)[number] | null;
  model: string | null;
  calls: number;
  successfulCalls: number;
  failedCalls: number;
  usage: AIUsage;
}

export interface AIOfficialProviderBilling {
  kind: "PROVIDER_OFFICIAL_BILLING";
  provider: (typeof AI_ROUTER_PROVIDERS)[number];
  currency: string;
  amountMicros: number;
  periodStart: string;
  periodEnd: string;
}

export interface AICostSummary {
  estimatedCost: AIEstimatedCost | null;
  officialProviderBilling: AIOfficialProviderBilling | null;
}

export interface AIRouteAuditSummary {
  task: (typeof AI_TASKS)[number];
  actorId: string;
  previousRoute: AIRouteSummary;
  currentRoute: AIRouteSummary;
  changedAt: string;
}
