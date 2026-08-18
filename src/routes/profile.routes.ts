import { Router } from "express";

import {
  getProfileController,
  upsertProfileController,
} from "../controllers/profile.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const profileRouter = Router();

profileRouter.use(authenticate);
profileRouter.get("/", getProfileController);
profileRouter.put("/", upsertProfileController);

export { profileRouter };
