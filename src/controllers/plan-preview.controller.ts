import type { Request, Response } from "express";

import { planPreviewRequestSchema } from "../schemas/plan-preview.schema.js";
import { parseSource, recordAcquisition } from "../services/acquisition.service.js";
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
      const preview = await generate(validation.data);
      // ?source= rides on the URL, not the strict body, so older and newer frontends both keep working.
      recordAcquisition("PREVIEW", parseSource(request.query?.source));
      response.status(200).json(preview);
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
