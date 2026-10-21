import { Router } from "express";

import { planPreviewController } from "../controllers/plan-preview.controller.js";
import { planPreviewRateLimit } from "../middlewares/plan-preview-rate-limit.middleware.js";

/** Public on purpose: visitors see one day of their plan before creating an account. */
const planPreviewRouter = Router();

planPreviewRouter.post("/", planPreviewRateLimit, planPreviewController);

export { planPreviewRouter };
