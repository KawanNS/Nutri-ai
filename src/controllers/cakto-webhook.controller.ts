import type { Request, Response } from "express";
import { caktoWebhookEnvelopeSchema } from "../schemas/cakto-webhook.schema.js";
import {
  authenticateCaktoWebhook,
  CaktoWebhookError,
  recordCaktoWebhook,
} from "../services/cakto-webhook.service.js";

export async function caktoWebhookController(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const body = request.body as Record<string, unknown> | undefined;
    authenticateCaktoWebhook(body?.secret);
    const payload = caktoWebhookEnvelopeSchema.safeParse(body);
    if (!payload.success) {
      response.status(400).json({ error: "Invalid webhook payload", code: "INVALID_WEBHOOK_PAYLOAD" });
      return;
    }

    const result = await recordCaktoWebhook(payload.data);
    response.status(result.pendingAssociation ? 202 : 200).json({
      received: true,
      duplicate: result.duplicate,
      processed: !result.pendingAssociation,
    });
  } catch (error: unknown) {
    if (error instanceof CaktoWebhookError) {
      response.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }
    response.status(500).json({ error: "Internal server error" });
  }
}
