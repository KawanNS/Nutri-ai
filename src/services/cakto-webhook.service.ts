import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import {
  caktoKnownEventSchema,
  caktoOrderDataSchema,
  type CaktoWebhookEnvelope,
} from "../schemas/cakto-webhook.schema.js";

export class CaktoWebhookError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function isValidCaktoSecret(received: unknown, expected: string): boolean {
  if (typeof received !== "string" || received.length === 0 || expected.length === 0) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export function authenticateCaktoWebhook(received: unknown): void {
  if (!isValidCaktoSecret(received, env.caktoWebhookSecret)) {
    throw new CaktoWebhookError(401, "INVALID_WEBHOOK_SECRET", "Unauthorized webhook");
  }
}

export function getCaktoProviderEventId(eventType: string, orderId: string): string {
  return `${eventType}:${orderId}`;
}

interface WebhookPersistence {
  create(args: Parameters<typeof prisma.paymentWebhookEvent.create>[0]): Promise<unknown>;
}

export async function recordCaktoWebhook(
  payload: CaktoWebhookEnvelope,
  persistence: WebhookPersistence = prisma.paymentWebhookEvent,
) {
  const order = caktoOrderDataSchema.safeParse(payload.data);
  if (!order.success) {
    throw new CaktoWebhookError(400, "INVALID_WEBHOOK_PAYLOAD", "Invalid webhook payload");
  }

  const knownEvent = caktoKnownEventSchema.safeParse(payload.event);
  const providerEventId = getCaktoProviderEventId(payload.event, order.data.id);
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ event: payload.event, data: payload.data }))
    .digest("hex");
  const processingError = knownEvent.success
    ? "CHECKOUT_ASSOCIATION_NOT_VERIFIED"
    : "UNSUPPORTED_EVENT";

  try {
    const webhookEvent = await persistence.create({
      data: {
        provider: "CAKTO",
        providerEventId,
        eventType: payload.event,
        payloadHash,
        processingError,
        processedAt: knownEvent.success ? null : new Date(),
      },
    });
    return { duplicate: false, pendingAssociation: knownEvent.success, webhookEvent };
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return { duplicate: true, pendingAssociation: knownEvent.success, webhookEvent: null };
    }
    throw error;
  }
}
