import type { Response } from "express";
import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { checkoutBodySchema } from "../schemas/billing.schema.js";
import {
  BillingError,
  getSubscriptionForUser,
  prepareCheckout,
} from "../services/billing.service.js";

function userId(request: AuthenticatedRequest, response: Response) {
  if (!request.auth?.userId) {
    response.status(401).json({ error: "Authentication is required" });
    return null;
  }
  return request.auth.userId;
}

function handleBillingError(error: unknown, response: Response) {
  if (error instanceof BillingError) {
    response.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }
  response.status(500).json({ error: "Internal server error" });
}

export async function getSubscriptionController(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const authenticatedUserId = userId(request, response);
  if (!authenticatedUserId) return;

  try {
    response.status(200).json({
      subscription: await getSubscriptionForUser(authenticatedUserId),
    });
  } catch (error: unknown) {
    handleBillingError(error, response);
  }
}

export async function checkoutController(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const authenticatedUserId = userId(request, response);
  if (!authenticatedUserId) return;
  const input = checkoutBodySchema.safeParse(request.body);
  if (!input.success) {
    response.status(400).json({ error: "Invalid subscription plan", code: "INVALID_SUBSCRIPTION_PLAN" });
    return;
  }

  try {
    response.status(200).json(await prepareCheckout(authenticatedUserId, input.data.plan));
  } catch (error: unknown) {
    handleBillingError(error, response);
  }
}
