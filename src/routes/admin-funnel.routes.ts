import { Router } from "express";

import { adminFunnelController } from "../controllers/admin-funnel.controller.js";
import { adminRateLimit } from "../middlewares/admin-rate-limit.middleware.js";
import { authenticate, requireAdmin } from "../middlewares/auth.middleware.js";

const adminFunnelRouter = Router();

adminFunnelRouter.use(authenticate, requireAdmin, adminRateLimit);
adminFunnelRouter.get("/", adminFunnelController);

export { adminFunnelRouter };
