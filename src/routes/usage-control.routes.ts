import { Router } from "express";

import { getUsageController } from "../controllers/usage-control.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const usageControlRouter = Router();

usageControlRouter.use(authenticate);
usageControlRouter.get("/", getUsageController);

export { usageControlRouter };
