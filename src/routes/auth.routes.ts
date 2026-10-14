import { Router } from "express";

import {
  currentUserController,
  googleCodeLoginController,
  googleLoginController,
  loginController,
  registerController,
} from "../controllers/auth.controller.js";
import { authRateLimit } from "../middlewares/auth-rate-limit.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const authRouter = Router();
authRouter.use(authRateLimit);

authRouter.post("/register", registerController);
authRouter.post("/login", loginController);
authRouter.post("/google", googleLoginController);
authRouter.post("/google/code", googleCodeLoginController);
authRouter.get("/me", authenticate, currentUserController);

export { authRouter };
