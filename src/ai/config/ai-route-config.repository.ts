import type { AITask } from "../ai-router.types.js";

export interface AIRouteConfig {
  readonly task: AITask;
  readonly provider: string;
  readonly model: string;
  readonly enabled: boolean;
}

export interface AIRouteConfigRepository {
  findByTask(task: AITask): Promise<unknown | null>;
}

export interface MutableAIRouteConfigRepository extends AIRouteConfigRepository {
  save(config: AIRouteConfig): Promise<void>;
}

export class InMemoryAIRouteConfigRepository
  implements MutableAIRouteConfigRepository
{
  private readonly configs = new Map<AITask, AIRouteConfig>();

  constructor(configs: readonly AIRouteConfig[] = []) {
    for (const config of configs) {
      this.configs.set(config.task, { ...config });
    }
  }

  async findByTask(task: AITask): Promise<AIRouteConfig | null> {
    const config = this.configs.get(task);
    return config ? { ...config } : null;
  }

  async save(config: AIRouteConfig): Promise<void> {
    this.configs.set(config.task, { ...config });
  }
}
