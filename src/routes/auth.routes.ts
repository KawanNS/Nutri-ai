import { Router } from "express";

import {
  loginController,
  registerController,
} from "../controllers/auth.controller.js";
import { authRateLimit } from "../middlewares/auth-rate-limit.middleware.js";

const authRouter = Router();
authRouter.use(authRateLimit);

authRouter.post("/register", registerController);
authRouter.post("/login", loginController);

export { authRouter };
