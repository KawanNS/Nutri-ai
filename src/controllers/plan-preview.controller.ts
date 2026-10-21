import type { Request, Response } from "express";

import { planPreviewRequestSchema } from "../schemas/plan-preview.schema.js";
import { generatePlanPreview, PlanPreviewError } from "../services/plan-preview.service.js";

type Generate = typeof generatePlanPreview;

export function createPlanPreviewController(generate: Generate = generatePlanPreview) {
  return async function planPreviewController(request: Request, response: Response): Promise<void> {
    const validation = planPreviewRequestSchema.safeParse(request.body);
    if (!validation.success) {
      response.status(400).json({ error: "Invalid plan preview request", code: "INVALID_PLAN_PREVIEW_REQUEST" });
      return;
    }
    try {
      response.status(200).json(await generate(validation.data));
    } catch (error: unknown) {
      if (error instanceof PlanPreviewError) {
        response.status(error.statusCode).json({ error: error.message, code: error.code });
        return;
      }
      response.status(500).json({ error: "Internal server error" });
    }
  };
}

export const planPreviewController = createPlanPreviewController();
