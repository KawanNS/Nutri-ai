import type { Request, Response } from "express";

import {
  checkAIReadiness,
  type AIReadinessResult,
} from "../services/ai-readiness.service.js";
import { warmUpDependencies } from "../services/warm-up.service.js";

type AIReadinessChecker = () => Promise<AIReadinessResult>;

export function createLivenessController(warmUp: () => boolean = warmUpDependencies) {
  return function livenessController(_request: Request, response: Response): void {
    // The site calls /health on load to wake the API; use it to wake the AI gateway and database too.
    warmUp();
    response.status(200).json({ status: "ok" });
  };
}

export const livenessController = createLivenessController();

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
