import type { Response } from "express";

import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { profileSchema } from "../schemas/profile.schema.js";
import {
  getProfile,
  ProfileError,
  upsertProfile,
} from "../services/profile.service.js";

function getAuthenticatedUserId(
  request: AuthenticatedRequest,
  response: Response,
): string | undefined {
  const userId = request.auth?.userId;

  if (!userId) {
    response.status(401).json({ error: "Authentication is required" });
    return undefined;
  }

  return userId;
}

function handleError(error: unknown, response: Response): void {
  if (error instanceof ProfileError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }

  response.status(500).json({ error: "Internal server error" });
}

export async function getProfileController(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = getAuthenticatedUserId(request, response);

  if (!userId) {
    return;
  }

  try {
    const profile = await getProfile(userId);
    response.status(200).json({ profile });
  } catch (error: unknown) {
    handleError(error, response);
  }
}

export async function upsertProfileController(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = getAuthenticatedUserId(request, response);

  if (!userId) {
    return;
  }

  const validation = profileSchema.safeParse(request.body);

  if (!validation.success) {
    response.status(400).json({
      error: "Invalid profile data",
      details: validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const profile = await upsertProfile(userId, validation.data);
    response.status(200).json({ profile });
  } catch (error: unknown) {
    handleError(error, response);
  }
}
