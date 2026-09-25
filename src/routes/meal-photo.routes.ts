import { Router } from "express";
import {
  analyzeMealPhotoController,
  confirmMealPhotoController,
  mealPhotoBodyParser,
} from "../controllers/meal-photo.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { mealPhotoRateLimit } from "../middlewares/meal-photo-rate-limit.middleware.js";

const mealPhotoRouter = Router();
mealPhotoRouter.use(authenticate);
mealPhotoRouter.post("/analyze", mealPhotoRateLimit, mealPhotoBodyParser, analyzeMealPhotoController);
mealPhotoRouter.post("/confirm", confirmMealPhotoController);

export { mealPhotoRouter };
