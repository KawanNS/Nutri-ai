import type { Request, Response } from "express";

import {
  checkAIReadiness,
  type AIReadinessResult,
} from "../services/ai-readiness.service.js";

type AIReadinessChecker = () => Promise<AIReadinessResult>;

export function livenessController(_request: Request, response: Response): void {
  response.status(200).json({ status: "ok" });
}

export function createReadinessController(
  check: AIReadinessChecker = checkAIReadiness,
) {
  return async function readinessController(
    _request: Request,
    response: Response,
  ): Promise<void> {
    let readiness: AIReadinessResult;

    try {
      readiness = await check();
    } catch {
      readiness = {
        ready: false,
        status: "UNAVAILABLE",
        mode: "GATEWAY",
        provider: "GEMINI",
        code: "AI_GATEWAY_UNAVAILABLE",
      };
    }

    response.status(readiness.ready ? 200 : 503).json({
      status: readiness.ready ? "ready" : "unavailable",
      checks: {
        ai: {
          status: readiness.status,
          mode: readiness.mode,
          provider: readiness.provider,
          code: readiness.code,
        },
      },
    });
  };
}

export type { AIReadinessChecker };
