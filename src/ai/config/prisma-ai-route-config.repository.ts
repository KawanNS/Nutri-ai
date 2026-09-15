import { AIRouterError, type AITask } from "../ai-router.types.js";
import type { AIRouteConfig, AIRouteConfigRepository } from "./ai-route-config.repository.js";

interface AIRouteConfigReader {
  findUnique(args: {
    where: { task: string };
    select: {
      task: true;
      provider: true;
      model: true;
      enabled: true;
    };
  }): Promise<unknown | null>;
}

export interface PrismaAIRouteConfigClient {
  aiRouteConfig: AIRouteConfigReader;
}

function reconstructRouteConfig(value: unknown): AIRouteConfig | unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  const candidate = value as Record<string, unknown>;
  return {
    task: candidate.task,
    provider: candidate.provider,
    model: candidate.model,
    enabled: candidate.enabled,
  };
}

export class PrismaAIRouteConfigRepository implements AIRouteConfigRepository {
  constructor(private readonly client: PrismaAIRouteConfigClient) {}

  async findByTask(task: AITask): Promise<unknown | null> {
    try {
      const record = await this.client.aiRouteConfig.findUnique({
        where: { task },
        select: {
          task: true,
          provider: true,
          model: true,
          enabled: true,
        },
      });

      return record === null ? null : reconstructRouteConfig(record);
    } catch {
      throw new AIRouterError(
        "AI_CONFIGURATION_ERROR",
        false,
        "AI route configuration is unavailable",
      );
    }
  }
}
