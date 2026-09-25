import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { loginBodySchema, registerBodySchema } from "../schemas/auth.schema.js";

import {
  AuthError,
  getCurrentUser,
  login,
  register,
} from "../services/auth.service.js";

function handleError(error: unknown, response: Response): void {
  if (error instanceof AuthError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }

  response.status(500).json({ error: "Internal server error" });
}

export async function registerController(
  request: Request,
  response: Response,
): Promise<void> {
  const input = registerBodySchema.safeParse(request.body);
  if (!input.success) {
    response.status(400).json({ error: "Invalid registration data", code: "INVALID_REGISTRATION_DATA" });
    return;
  }

  try {
    const user = await register(input.data);
    response.status(201).json({ user });
  } catch (error: unknown) {
    handleError(error, response);
  }
}

export async function loginController(
  request: Request,
  response: Response,
): Promise<void> {
  const input = loginBodySchema.safeParse(request.body);
  if (!input.success) {
    response.status(400).json({ error: "Invalid login data", code: "INVALID_LOGIN_DATA" });
    return;
  }

  try {
    const result = await login(input.data);
    response.status(200).json(result);
  } catch (error: unknown) {
    handleError(error, response);
  }
}

export async function currentUserController(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  if (!request.auth?.userId) {
    response.status(401).json({ error: "Authentication is required" });
    return;
  }

  try {
    const user = await getCurrentUser(request.auth.userId);
    response.status(200).json({ user });
  } catch (error: unknown) {
    handleError(error, response);
  }
}
