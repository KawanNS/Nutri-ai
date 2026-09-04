import { Router } from "express";
import {
  checkoutController,
  getSubscriptionController,
} from "../controllers/billing.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const billingRouter = Router();
billingRouter.use(authenticate);
billingRouter.get("/subscription", getSubscriptionController);
billingRouter.post("/checkout", checkoutController);

export { billingRouter };
