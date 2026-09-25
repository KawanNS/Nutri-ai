import express, { type NextFunction, type Response } from "express";
import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { confirmFoodLogSchema } from "../schemas/meal-photo.schema.js";
import {
  analyzeMealPhoto,
  confirmMealPhotoLog,
  MAX_MEAL_PHOTO_BYTES,
  MealPhotoError,
  validateMealPhoto,
} from "../services/meal-photo.service.js";

const parseRawImage = express.raw({ type: () => true, limit: MAX_MEAL_PHOTO_BYTES });

export function mealPhotoBodyParser(
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): void {
  parseRawImage(request, response, (error: unknown) => {
    if (error) {
      response.status(413).json({ error: "Image exceeds the size limit", code: "IMAGE_TOO_LARGE" });
      return;
    }
    next();
  });
}

function userId(request: AuthenticatedRequest, response: Response): string | null {
  if (!request.auth?.userId) {
    response.status(401).json({ error: "Authentication is required" });
    return null;
  }
  return request.auth.userId;
}

function handle(error: unknown, response: Response): void {
  if (error instanceof MealPhotoError) {
    response.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }
  response.status(500).json({ error: "Internal server error" });
}

export async function analyzeMealPhotoController(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  if (!userId(request, response)) return;
  try {
    const image = validateMealPhoto(request.body, request.headers["content-type"]);
    const analysis = await analyzeMealPhoto(image.data, image.mimeType);
    response.status(200).json({ analysis });
  } catch (error: unknown) {
    handle(error, response);
  }
}
export async function confirmMealPhotoController(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const authenticatedUserId = userId(request, response);
  if (!authenticatedUserId) return;
  const body = confirmFoodLogSchema.safeParse(request.body);
  if (!body.success) {
    response.status(400).json({ error: "Invalid food log confirmation", code: "INVALID_FOOD_LOG" });
    return;
  }
  try {
    response.status(201).json({ foodLog: await confirmMealPhotoLog(authenticatedUserId, body.data) });
  } catch (error: unknown) {
    handle(error, response);
  }
}
