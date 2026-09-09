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
    const parsedPayload = caktoWebhookEnvelopeSchema.safeParse(body);
    if (!parsedPayload.success) {
      response.status(400).json({ error: "Invalid webhook payload", code: "INVALID_WEBHOOK_PAYLOAD" });
      return;
    }
    const payload = parsedPayload.data;

    const result = await recordCaktoWebhook(payload);
    try {
      console.info(
        "[cakto-webhook-correlation]",
        JSON.stringify({
          checkoutCorrelationCandidate: result.checkoutCorrelationCandidate,
        }),
      );
    } catch {}

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
