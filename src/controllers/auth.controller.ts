import type { Request, Response } from "express";

import {
  AuthError,
  login,
  register,
} from "../services/auth.service.js";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

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
  const { name, email, password } = request.body as Record<string, unknown>;

  if (
    !isNonEmptyString(name) ||
    !isNonEmptyString(email) ||
    !isNonEmptyString(password)
  ) {
    response.status(400).json({ error: "Name, email and password are required" });
    return;
  }

  try {
    const user = await register({ name, email, password });
    response.status(201).json({ user });
  } catch (error: unknown) {
    handleError(error, response);
  }
}

export async function loginController(
  request: Request,
  response: Response,
): Promise<void> {
  const { email, password } = request.body as Record<string, unknown>;

  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    response.status(400).json({ error: "Email and password are required" });
    return;
  }

  try {
    const result = await login({ email, password });
    response.status(200).json(result);
  } catch (error: unknown) {
    handleError(error, response);
  }
}
