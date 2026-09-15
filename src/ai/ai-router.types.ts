export const AI_TASKS = ["MEAL_PLAN_GENERATION"] as const;
export const AI_ROUTER_PROVIDERS = ["GEMINI"] as const;

export type AITask = (typeof AI_TASKS)[number];
export type AIRouterProvider = (typeof AI_ROUTER_PROVIDERS)[number];

export interface AIRouterRequest {
  task: string;
  instructions: string;
  input: string;
  responseFormat: "STRUCTURED_JSON";
  timeoutMs: number;
}

export interface AIRoute {
  readonly task: AITask;
  readonly provider: AIRouterProvider;
  readonly model: string;
}

export interface AIUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
}

export interface AIRouterResponse {
  content: string;
  provider: AIRouterProvider;
  model: string;
  latencyMs: number;
  usage: AIUsage;
  finishReason: string | null;
  requestId: string | null;
}

export type AIRouterErrorCode =
  | "AI_AUTH_ERROR"
  | "AI_RATE_LIMIT"
  | "AI_TIMEOUT"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_INVALID_RESPONSE"
  | "AI_SCHEMA_VALIDATION_FAILED"
  | "AI_CONFIGURATION_ERROR"
  | "AI_UNSUPPORTED_PROVIDER"
  | "AI_UNSUPPORTED_MODEL"
  | "AI_UNSUPPORTED_TASK"
  | "AI_UNKNOWN_ERROR";

export class AIRouterError extends Error {
  constructor(
    public readonly code: AIRouterErrorCode,
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = "AIRouterError";
  }
}

export interface AIProviderHealth {
  provider: AIRouterProvider;
  status: "CONFIGURED" | "NOT_CONFIGURED";
}

export interface AIProviderAdapter {
  readonly provider: AIRouterProvider;
  generate(request: AIRouterRequest, route: AIRoute): Promise<AIRouterResponse>;
  health(): AIProviderHealth;
}

export interface AIRouterObservation {
  task: string;
  provider: AIRouterProvider | null;
  model: string | null;
  success: boolean;
  latencyMs: number;
  errorCode: AIRouterErrorCode | null;
}

export type AIRouterObserver = (event: AIRouterObservation) => void;

export interface AIRouter {
  route(request: AIRouterRequest): Promise<AIRouterResponse>;
  health(): AIProviderHealth[];
}
