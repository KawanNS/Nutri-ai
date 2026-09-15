import type { AIRoutingPolicy } from "../ai-routing-policy.js";
import {
  AI_TASKS,
  AIRouterError,
  type AIRouterProvider,
  type AITask,
} from "../ai-router.types.js";
import type { AIModelRegistry } from "../registry/ai-model.registry.js";
import type { AIProviderRegistry } from "../registry/ai-provider.registry.js";
import {
  aiPersistedRouteUpdateInputSchema,
  type AIPersistedRouteSummary,
  type AIPersistedRouteUpdateInput,
} from "./ai-admin.contracts.js";

const POSTGRES_INTEGER_MAX = 2_147_483_647;

interface PersistedRouteRecord {
  id: string;
  task: string;
  provider: string;
  model: string;
  enabled: boolean;
  version: number;
}

interface AdminTransactionClient {
  user: {
    findUnique(args: {
      where: { id: string };
      select: { status: true; role: true };
    }): Promise<{ status: "ACTIVE" | "BLOCKED"; role: "USER" | "ADMIN" } | null>;
  };
  aiRouteConfig: {
    findUnique(args: { where: { task: string } }): Promise<unknown | null>;
    create(args: { data: Record<string, unknown> }): Promise<PersistedRouteRecord>;
    updateMany(args: {
      where: { task: string; version: number };
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  aiRouteAuditLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface AIAdminPersistenceClient {
  aiRouteConfig: {
    findUnique(args: { where: { task: string } }): Promise<unknown | null>;
  };
  $transaction<T>(operation: (transaction: AdminTransactionClient) => Promise<T>): Promise<T>;
}

export class AIAdminPersistenceError extends Error {
  constructor(
    public readonly code:
      | "ADMIN_FORBIDDEN"
      | "ROUTE_CONFLICT"
      | "ROUTE_CONFIGURATION_INVALID"
      | "ROUTE_INPUT_INVALID",
    message: string,
  ) {
    super(message);
  }
}

function isKnownTask(value: string): value is AITask {
  return AI_TASKS.some((task) => task === value);
}

function hasKnownRouteShape(value: unknown): value is PersistedRouteRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.task === "string" &&
    typeof record.provider === "string" &&
    typeof record.model === "string" &&
    typeof record.enabled === "boolean" &&
    Number.isSafeInteger(record.version) &&
    (record.version as number) >= 1 &&
    (record.version as number) <= POSTGRES_INTEGER_MAX
  );
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export class PersistentAIAdminService {
  constructor(
    private readonly client: AIAdminPersistenceClient,
    private readonly defaults: AIRoutingPolicy,
    private readonly providers: AIProviderRegistry,
    private readonly models: AIModelRegistry,
  ) {}

  private validatePersistedRoute(
    value: unknown,
    expectedTask: AITask,
  ): PersistedRouteRecord {
    if (!hasKnownRouteShape(value) || value.task !== expectedTask) {
      throw new AIAdminPersistenceError(
        "ROUTE_CONFIGURATION_INVALID",
        "AI route configuration is invalid",
      );
    }
    const provider = this.providers.get(value.provider);
    if (
      !provider?.operational ||
      !this.models.isAllowed(value.provider, value.model)
    ) {
      throw new AIAdminPersistenceError(
        "ROUTE_CONFIGURATION_INVALID",
        "AI route configuration is invalid",
      );
    }
    return value;
  }

  async getRoute(taskValue: string): Promise<AIPersistedRouteSummary> {
    if (!isKnownTask(taskValue) || !Object.hasOwn(this.defaults, taskValue)) {
      throw new AIRouterError("AI_UNSUPPORTED_TASK", false, "AI task is not supported");
    }
    const persisted = await this.client.aiRouteConfig.findUnique({
      where: { task: taskValue },
    });
    if (persisted === null) {
      return {
        ...this.defaults[taskValue],
        enabled: true,
        source: "DEFAULT",
        version: 0,
      };
    }
    const route = this.validatePersistedRoute(persisted, taskValue);
    return {
      task: taskValue,
      provider: route.provider as AIRouterProvider,
      model: route.model,
      enabled: route.enabled,
      source: "PERSISTED",
      version: route.version,
    };
  }

  listRoutes(): Promise<readonly AIPersistedRouteSummary[]> {
    return Promise.all(AI_TASKS.map((task) => this.getRoute(task)));
  }

  async updateRoute(
    taskValue: string,
    inputValue: unknown,
    actorUserId: string,
  ): Promise<AIPersistedRouteSummary> {
    if (!isKnownTask(taskValue) || !Object.hasOwn(this.defaults, taskValue)) {
      throw new AIRouterError("AI_UNSUPPORTED_TASK", false, "AI task is not supported");
    }
    const parsed = aiPersistedRouteUpdateInputSchema.safeParse(inputValue);
    if (!parsed.success || actorUserId.trim().length === 0) {
      throw new AIAdminPersistenceError("ROUTE_INPUT_INVALID", "AI route input is invalid");
    }
    const input: AIPersistedRouteUpdateInput = parsed.data;
    if (
      !this.providers.isOperational(input.provider) ||
      !this.models.isAllowed(input.provider, input.model)
    ) {
      throw new AIAdminPersistenceError("ROUTE_INPUT_INVALID", "AI route input is invalid");
    }

    try {
      return await this.client.$transaction(async (transaction) => {
        const actor = await transaction.user.findUnique({
          where: { id: actorUserId },
          select: { status: true, role: true },
        });
        if (!actor || actor.status !== "ACTIVE" || actor.role !== "ADMIN") {
          throw new AIAdminPersistenceError(
            "ADMIN_FORBIDDEN",
            "Administrator access is required",
          );
        }

        const currentValue = await transaction.aiRouteConfig.findUnique({
          where: { task: taskValue },
        });
        const defaultRoute = this.defaults[taskValue];

        if (currentValue === null) {
          if (input.expectedVersion !== 0) {
            throw new AIAdminPersistenceError(
              "ROUTE_CONFLICT",
              "AI route version conflict",
            );
          }
          const created = await transaction.aiRouteConfig.create({
            data: {
              task: taskValue,
              provider: input.provider,
              model: input.model,
              enabled: input.enabled,
              version: 1,
              updatedByUserId: actorUserId,
            },
          });
          await transaction.aiRouteAuditLog.create({
            data: {
              routeConfigId: created.id,
              task: taskValue,
              action: "CREATE",
              previousOrigin: "DEFAULT",
              previousProvider: defaultRoute.provider,
              previousModel: defaultRoute.model,
              previousEnabled: true,
              previousVersion: null,
              newProvider: input.provider,
              newModel: input.model,
              newEnabled: input.enabled,
              newVersion: 1,
              changedByUserId: actorUserId,
            },
          });
          return {
            task: taskValue,
            provider: input.provider,
            model: input.model,
            enabled: input.enabled,
            source: "PERSISTED",
            version: 1,
          };
        }

        const current = this.validatePersistedRoute(currentValue, taskValue);
        if (current.version !== input.expectedVersion) {
          throw new AIAdminPersistenceError(
            "ROUTE_CONFLICT",
            "AI route version conflict",
          );
        }
        const nextVersion = current.version + 1;
        if (nextVersion > POSTGRES_INTEGER_MAX) {
          throw new AIAdminPersistenceError(
            "ROUTE_CONFLICT",
            "AI route version conflict",
          );
        }
        const updated = await transaction.aiRouteConfig.updateMany({
          where: { task: taskValue, version: current.version },
          data: {
            provider: input.provider,
            model: input.model,
            enabled: input.enabled,
            version: nextVersion,
            updatedByUserId: actorUserId,
          },
        });
        if (updated.count !== 1) {
          throw new AIAdminPersistenceError(
            "ROUTE_CONFLICT",
            "AI route version conflict",
          );
        }
        await transaction.aiRouteAuditLog.create({
          data: {
            routeConfigId: current.id,
            task: taskValue,
            action: "UPDATE",
            previousOrigin: "PERSISTED",
            previousProvider: current.provider,
            previousModel: current.model,
            previousEnabled: current.enabled,
            previousVersion: current.version,
            newProvider: input.provider,
            newModel: input.model,
            newEnabled: input.enabled,
            newVersion: nextVersion,
            changedByUserId: actorUserId,
          },
        });
        return {
          task: taskValue,
          provider: input.provider,
          model: input.model,
          enabled: input.enabled,
          source: "PERSISTED",
          version: nextVersion,
        };
      });
    } catch (error: unknown) {
      if (isUniqueConflict(error)) {
        throw new AIAdminPersistenceError(
          "ROUTE_CONFLICT",
          "AI route version conflict",
        );
      }
      throw error;
    }
  }
}
