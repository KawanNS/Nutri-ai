import { Router } from "express";

import { getPlanMealsController, listFoodLogsController, logPlanMealController } from "../controllers/food-log.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const foodLogRouter = Router();

foodLogRouter.use(authenticate);
foodLogRouter.get("/", listFoodLogsController);
foodLogRouter.get("/plan-meals", getPlanMealsController);
foodLogRouter.post("/plan-meals", logPlanMealController);

export { foodLogRouter };
