import type { Request, Response } from "express";
import { caktoWebhookEnvelopeSchema } from "../schemas/cakto-webhook.schema.js";
import {
  authenticateCaktoWebhook,
  CaktoWebhookError,
  recordCaktoWebhook,
} from "../services/cakto-webhook.service.js";

type PayloadValueType = "string" | "number" | "boolean" | "object" | "array" | "null";

type PayloadStructureEntry = {
  path: string;
  type: PayloadValueType;
  length?: number;
};

function payloadValueType(value: unknown): PayloadValueType | null {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  return null;
}

function describePayloadStructure(payload: Record<string, unknown>): PayloadStructureEntry[] {
  const entries: PayloadStructureEntry[] = [];
  const seen = new Set<string>();

  function visit(value: unknown, path: string): void {
    const type = payloadValueType(value);
    if (type === null) return;

    const length = Array.isArray(value) ? value.length : undefined;
    const signature = `${path}\u0000${type}\u0000${length ?? ""}`;
    if (!seen.has(signature)) {
      seen.add(signature);
      entries.push(length === undefined ? { path, type } : { path, type, length });
    }

    if (Array.isArray(value)) {
      for (const item of value) visit(item, `${path}[]`);
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        visit(child, `${path}.${key}`);
      }
    }
  }

  for (const [key, value] of Object.entries(payload)) visit(value, key);
  return entries;
}

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

    try {
      console.info("[cakto-webhook-structure]", JSON.stringify(describePayloadStructure(payload)));
    } catch {}

    const result = await recordCaktoWebhook(payload);
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
