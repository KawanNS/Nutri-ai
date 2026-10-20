import { Router } from "express";

import {
  generateMealPlanController,
  getMealPlanController,
  listMealPlansController,
  swapMealController,
} from "../controllers/meal-plan.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { mealPlanRateLimit } from "../middlewares/meal-plan-rate-limit.middleware.js";
import { mealSwapRateLimit } from "../middlewares/meal-swap-rate-limit.middleware.js";

const mealPlanRouter = Router();

mealPlanRouter.use(authenticate);
mealPlanRouter.post("/generate", mealPlanRateLimit, generateMealPlanController);
mealPlanRouter.get("/", listMealPlansController);
mealPlanRouter.get("/:id", getMealPlanController);
mealPlanRouter.post(
  "/:id/days/:day/meals/:index/swap",
  mealSwapRateLimit,
  (request, response) => swapMealController(request, response),
);

export { mealPlanRouter };
