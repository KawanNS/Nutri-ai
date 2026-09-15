import { Router } from "express";

import {
  getRouteController,
  listAuditController,
  listModelsController,
  listProvidersController,
  listRoutesController,
  listUsageController,
  summarizeCostsController,
  updateRouteController,
} from "../controllers/ai-router-admin.controller.js";
import { adminRateLimit } from "../middlewares/admin-rate-limit.middleware.js";
import { authenticate, requireAdmin } from "../middlewares/auth.middleware.js";

const aiRouterAdminRouter = Router();

aiRouterAdminRouter.use(authenticate, requireAdmin, adminRateLimit);
aiRouterAdminRouter.get("/routes", listRoutesController);
aiRouterAdminRouter.get("/routes/:task", getRouteController);
aiRouterAdminRouter.put("/routes/:task", updateRouteController);
aiRouterAdminRouter.get("/providers", listProvidersController);
aiRouterAdminRouter.get("/models", listModelsController);
aiRouterAdminRouter.get("/usage", listUsageController);
aiRouterAdminRouter.get("/costs", summarizeCostsController);
aiRouterAdminRouter.get("/audit", listAuditController);

export { aiRouterAdminRouter };
