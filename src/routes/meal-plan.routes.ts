import { Router } from "express";

import {
  getMealPlanController,
  listMealPlansController,
} from "../controllers/meal-plan.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const mealPlanRouter = Router();

mealPlanRouter.use(authenticate);
mealPlanRouter.get("/", listMealPlansController);
mealPlanRouter.get("/:id", getMealPlanController);

export { mealPlanRouter };
