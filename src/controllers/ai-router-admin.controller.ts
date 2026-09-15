import type { Response } from "express";
import { z } from "zod";

import { createGeminiAdapter } from "../ai/adapters/gemini.adapter.js";
import {
  aiAdminAuditQuerySchema,
  aiAdminUsageQuerySchema,
  aiPersistedRouteUpdateInputSchema,
} from "../ai/admin/ai-admin.contracts.js";
import {
  AIAdminPersistenceError,
  PersistentAIAdminService,
} from "../ai/admin/ai-admin-persistence.service.js";
import { PrismaAIAdminQueryService } from "../ai/admin/ai-admin-query.service.js";
import { createAIProviderSummaries } from "../ai/admin/ai-admin.service.js";
import { createConfiguredAIRoutingPolicy } from "../ai/ai-routing-policy.js";
import { AIRouterError, AI_TASKS } from "../ai/ai-router.types.js";
import { createAIModelRegistry } from "../ai/registry/ai-model.registry.js";
import { createAIProviderRegistry } from "../ai/registry/ai-provider.registry.js";
import { prisma } from "../lib/prisma.js";
import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";

const taskSchema = z.enum(AI_TASKS);

interface AIAdminControllerDependencies {
  routes: Pick<PersistentAIAdminService, "getRoute" | "listRoutes" | "updateRoute">;
  queries: Pick<PrismaAIAdminQueryService, "listUsage" | "summarizeCosts" | "listAudit">;
  providerSummaries(): unknown;
  modelSummaries(): unknown;
}

function invalid(response: Response, code: string): void {
  response.status(400).json({ error: "Invalid administrative request", code });
}

function logInternalFailure(operation: string, error: unknown): void {
  console.error("[ai-router-admin]", {
    operation,
    errorType: error instanceof Error ? error.name : "UnknownError",
  });
}

function handleError(operation: string, error: unknown, response: Response): void {
  if (error instanceof AIAdminPersistenceError) {
    if (error.code === "ROUTE_INPUT_INVALID") {
      invalid(response, "INVALID_ROUTE_CONFIGURATION");
      return;
    }
    if (error.code === "ROUTE_CONFLICT") {
      response.status(409).json({
        error: "AI route version conflict",
        code: "AI_ROUTE_VERSION_CONFLICT",
      });
      return;
    }
    if (error.code === "ADMIN_FORBIDDEN") {
      response.status(403).json({
        error: "Administrator access is required",
        code: "ADMIN_FORBIDDEN",
      });
      return;
    }
  }
  if (error instanceof AIRouterError && error.code === "AI_UNSUPPORTED_TASK") {
    response.status(404).json({ error: "AI route was not found", code: "AI_ROUTE_NOT_FOUND" });
    return;
  }

  logInternalFailure(operation, error);
  response.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
}

export function createAIAdminControllers(dependencies: AIAdminControllerDependencies) {
  return {
    async listRoutes(_request: AuthenticatedRequest, response: Response): Promise<void> {
      try {
        response.status(200).json({ routes: await dependencies.routes.listRoutes() });
      } catch (error: unknown) {
        handleError("list-routes", error, response);
      }
    },

    async getRoute(request: AuthenticatedRequest, response: Response): Promise<void> {
      const task = taskSchema.safeParse(request.params.task);
      if (!task.success) {
        response.status(404).json({ error: "AI route was not found", code: "AI_ROUTE_NOT_FOUND" });
        return;
      }
      try {
        response.status(200).json({ route: await dependencies.routes.getRoute(task.data) });
      } catch (error: unknown) {
        handleError("get-route", error, response);
      }
    },

    async updateRoute(request: AuthenticatedRequest, response: Response): Promise<void> {
      const task = taskSchema.safeParse(request.params.task);
      if (!task.success) {
        response.status(404).json({ error: "AI route was not found", code: "AI_ROUTE_NOT_FOUND" });
        return;
      }
      const input = aiPersistedRouteUpdateInputSchema.safeParse(request.body);
      if (!input.success) {
        invalid(response, "INVALID_ROUTE_CONFIGURATION");
        return;
      }
      const actorUserId = request.auth?.userId;
      if (!actorUserId) {
        response.status(401).json({ error: "Authentication is required", code: "AUTHENTICATION_REQUIRED" });
        return;
      }
      try {
        response.status(200).json({
          route: await dependencies.routes.updateRoute(task.data, input.data, actorUserId),
        });
      } catch (error: unknown) {
        handleError("update-route", error, response);
      }
    },

    listProviders(_request: AuthenticatedRequest, response: Response): void {
      try {
        response.status(200).json({ providers: dependencies.providerSummaries() });
      } catch (error: unknown) {
        handleError("list-providers", error, response);
      }
    },

    listModels(_request: AuthenticatedRequest, response: Response): void {
      try {
        response.status(200).json({ models: dependencies.modelSummaries() });
      } catch (error: unknown) {
        handleError("list-models", error, response);
      }
    },

    async listUsage(request: AuthenticatedRequest, response: Response): Promise<void> {
      const query = aiAdminUsageQuerySchema.safeParse(request.query);
      if (!query.success) {
        invalid(response, "INVALID_USAGE_QUERY");
        return;
      }
      try {
        response.status(200).json(await dependencies.queries.listUsage(query.data));
      } catch (error: unknown) {
        handleError("list-usage", error, response);
      }
    },

    async summarizeCosts(request: AuthenticatedRequest, response: Response): Promise<void> {
      const query = aiAdminUsageQuerySchema.safeParse(request.query);
      if (!query.success) {
        invalid(response, "INVALID_COST_QUERY");
        return;
      }
      try {
        response.status(200).json({ costs: await dependencies.queries.summarizeCosts(query.data) });
      } catch (error: unknown) {
        handleError("summarize-costs", error, response);
      }
    },

    async listAudit(request: AuthenticatedRequest, response: Response): Promise<void> {
      const query = aiAdminAuditQuerySchema.safeParse(request.query);
      if (!query.success) {
        invalid(response, "INVALID_AUDIT_QUERY");
        return;
      }
      try {
        response.status(200).json(await dependencies.queries.listAudit(query.data));
      } catch (error: unknown) {
        handleError("list-audit", error, response);
      }
    },
  };
}

const providers = createAIProviderRegistry();
const models = createAIModelRegistry();
const productionControllers = createAIAdminControllers({
  routes: new PersistentAIAdminService(
    prisma,
    createConfiguredAIRoutingPolicy(),
    providers,
    models,
  ),
  queries: new PrismaAIAdminQueryService(prisma),
  providerSummaries: () =>
    createAIProviderSummaries(providers, models, [createGeminiAdapter()]),
  modelSummaries: () =>
    models.list().map((definition) => ({
      provider: definition.provider,
      model: definition.model,
      enabled: definition.enabled,
    })),
});

export const {
  listRoutesController,
  getRouteController,
  updateRouteController,
  listProvidersController,
  listModelsController,
  listUsageController,
  summarizeCostsController,
  listAuditController,
} = {
  listRoutesController: productionControllers.listRoutes,
  getRouteController: productionControllers.getRoute,
  updateRouteController: productionControllers.updateRoute,
  listProvidersController: productionControllers.listProviders,
  listModelsController: productionControllers.listModels,
  listUsageController: productionControllers.listUsage,
  summarizeCostsController: productionControllers.summarizeCosts,
  listAuditController: productionControllers.listAudit,
};
