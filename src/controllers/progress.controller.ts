import type { Response } from "express";

import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import {
  createProgressEntrySchema,
  progressEntryIdSchema,
  progressListQuerySchema,
} from "../schemas/progress.schema.js";
import {
  createProgressEntry,
  getProgressEntry,
  listProgressEntries,
  ProgressError,
} from "../services/progress.service.js";

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
  if (error instanceof ProgressError) {
    response.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }
  response.status(500).json({ error: "Internal server error" });
}

export async function createProgressEntryController(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = getAuthenticatedUserId(request, response);
  if (!userId) return;
  const validation = createProgressEntrySchema.safeParse(request.body);
  if (!validation.success) {
    response.status(400).json({
      error: "Invalid progress data",
      code: "INVALID_PROGRESS_DATA",
      details: validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }
  try {
    response.status(201).json({
      progressEntry: await createProgressEntry(userId, validation.data),
    });
  } catch (error: unknown) {
    handleError(error, response);
  }
}

export async function listProgressEntriesController(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = getAuthenticatedUserId(request, response);
  if (!userId) return;
  const validation = progressListQuerySchema.safeParse(request.query);
  if (!validation.success) {
    response.status(400).json({
      error: "Invalid progress pagination",
      code: "INVALID_PROGRESS_PAGINATION",
    });
    return;
  }
  try {
    response.status(200).json(await listProgressEntries(userId, validation.data));
  } catch (error: unknown) {
    handleError(error, response);
  }
}

export async function getProgressEntryController(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const userId = getAuthenticatedUserId(request, response);
  if (!userId) return;
  const validation = progressEntryIdSchema.safeParse(request.params.id);
  if (!validation.success) {
    response.status(400).json({
      error: "Invalid progress entry id",
      code: "INVALID_PROGRESS_ID",
    });
    return;
  }
  try {
    response.status(200).json({
      progressEntry: await getProgressEntry(userId, validation.data),
    });
  } catch (error: unknown) {
    handleError(error, response);
  }
}
