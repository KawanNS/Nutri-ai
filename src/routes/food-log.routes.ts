import { Router } from "express";

import { listFoodLogsController } from "../controllers/food-log.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const foodLogRouter = Router();

foodLogRouter.use(authenticate);
foodLogRouter.get("/", listFoodLogsController);

export { foodLogRouter };
