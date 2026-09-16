import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import {
  caktoCorrelationTokenSchema,
  caktoKnownEventSchema,
  caktoOrderDataSchema,
  type CaktoWebhookEnvelope,
} from "../schemas/cakto-webhook.schema.js";
import { hashCheckoutCorrelationToken } from "./billing.service.js";
import { createConfiguredCaktoApiClient, type CaktoApiClient } from "./cakto-api.service.js";
import {
  prepareCaktoBillingEffect,
  type PreparedCaktoBillingEffect,
} from "./cakto-billing-preparation.service.js";
import {
  getConfiguredCaktoPlanAllowlist,
  type CaktoPlanAllowlist,
} from "./cakto-plan-mapping.service.js";

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

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function getPayloadHash(payload: CaktoWebhookEnvelope): string {
  return createHash("sha256")
    .update(canonicalJson({ event: payload.event, data: payload.data }))
    .digest("hex");
}

interface WebhookPersistence {
  create(args: Parameters<typeof prisma.paymentWebhookEvent.create>[0]): Promise<unknown>;
}

type CheckoutAttemptCandidate = {
  userId: string;
  plan: "MONTHLY" | "QUARTERLY" | "ANNUAL";
  status: "PENDING" | "COMPLETED" | "EXPIRED";
  expiresAt: Date;
};

interface CheckoutAttemptReader {
  findUnique(args: {
    where: { token: string };
    select: { userId: true; plan: true; status: true; expiresAt: true };
  }): Promise<CheckoutAttemptCandidate | null>;
}

interface WebhookCorrelationDependencies {
  checkoutAttempts?: CheckoutAttemptReader;
  now?: () => Date;
}

async function hasCheckoutCorrelationCandidate(
  data: Record<string, unknown>,
  dependencies: WebhookCorrelationDependencies,
): Promise<boolean> {
  const token = caktoCorrelationTokenSchema.safeParse(data.sck);
  if (!token.success || typeof token.data !== "string") return false;

  const checkoutAttempts = dependencies.checkoutAttempts ?? prisma.checkoutAttempt;
  const attempt = await checkoutAttempts.findUnique({
    where: { token: hashCheckoutCorrelationToken(token.data) },
    select: { userId: true, plan: true, status: true, expiresAt: true },
  });

  return (
    attempt !== null &&
    attempt.status === "PENDING" &&
    attempt.expiresAt.getTime() > (dependencies.now?.() ?? new Date()).getTime()
  );
}

export async function recordCaktoWebhook(
  payload: CaktoWebhookEnvelope,
  persistence: WebhookPersistence = prisma.paymentWebhookEvent,
  correlationDependencies: WebhookCorrelationDependencies = {},
) {
  const order = caktoOrderDataSchema.safeParse(payload.data);
  if (!order.success) {
    throw new CaktoWebhookError(400, "INVALID_WEBHOOK_PAYLOAD", "Invalid webhook payload");
  }

  const knownEvent = caktoKnownEventSchema.safeParse(payload.event);
  const checkoutCorrelationCandidate = await hasCheckoutCorrelationCandidate(
    payload.data,
    correlationDependencies,
  );
  const providerEventId = getCaktoProviderEventId(payload.event, order.data.id);
  const payloadHash = getPayloadHash(payload);
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
    return {
      duplicate: false,
      pendingAssociation: knownEvent.success,
      checkoutCorrelationCandidate,
      webhookEvent,
    };
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return {
        duplicate: true,
        pendingAssociation: knownEvent.success,
        checkoutCorrelationCandidate,
        webhookEvent: null,
      };
    }
    throw error;
  }
}

const executableEvents = new Set([
  "purchase_approved",
  "subscription_created",
  "subscription_renewed",
  "subscription_canceled",
  "refund",
  "chargeback",
]);

type StoredWebhookEvent = {
  id: string;
  payloadHash: string | null;
  processedAt: Date | null;
};

type StoredSubscription = {
  id: string;
  userId: string;
  plan: "MONTHLY" | "QUARTERLY" | "ANNUAL";
  providerSubscriptionId: string | null;
  providerCustomerId: string | null;
  providerProductId: string | null;
  providerOfferId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  lastEventOccurredAt: Date | null;
};

type BillingTransaction = {
  paymentWebhookEvent: {
    findUnique(args: unknown): Promise<StoredWebhookEvent | null>;
    update(args: unknown): Promise<unknown>;
  };
  subscription: {
    findUnique(args: unknown): Promise<StoredSubscription | null>;
    create(args: unknown): Promise<{ id: string }>;
    update(args: unknown): Promise<{ id: string }>;
  };
  checkoutAttempt: {
    findUnique(args: unknown): Promise<{
      id: string;
      userId: string;
      plan: "MONTHLY" | "QUARTERLY" | "ANNUAL";
      status: "PENDING" | "COMPLETED" | "EXPIRED";
    } | null>;
    update(args: unknown): Promise<unknown>;
  };
};

type BillingClient = BillingTransaction & {
  paymentWebhookEvent: BillingTransaction["paymentWebhookEvent"] & {
    create(args: unknown): Promise<StoredWebhookEvent>;
  };
  $transaction<T>(
    operation: (transaction: BillingTransaction) => Promise<T>,
    options: { isolationLevel: "Serializable" },
  ): Promise<T>;
};

interface ProcessCaktoWebhookDependencies {
  client?: BillingClient;
  apiClient?: CaktoApiClient;
  allowlist?: CaktoPlanAllowlist | null;
  now?: () => Date;
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

async function recordReceipt(
  client: BillingClient,
  payload: CaktoWebhookEnvelope,
  providerEventId: string,
  payloadHash: string,
  executable: boolean,
  now: Date,
): Promise<{ event: StoredWebhookEvent; duplicate: boolean }> {
  try {
    const event = await client.paymentWebhookEvent.create({
      data: {
        provider: "CAKTO",
        providerEventId,
        eventType: payload.event,
        payloadHash,
        processingError: executable ? "PROCESSING_PENDING" : "UNSUPPORTED_EVENT",
        processedAt: executable ? null : now,
      },
      select: { id: true, payloadHash: true, processedAt: true },
    });
    return { event, duplicate: false };
  } catch (error: unknown) {
    if (!isUniqueConflict(error)) throw error;
    const existing = await client.paymentWebhookEvent.findUnique({
      where: { provider_providerEventId: { provider: "CAKTO", providerEventId } },
      select: { id: true, payloadHash: true, processedAt: true },
    });
    if (!existing) throw error;
    if (existing.payloadHash !== payloadHash) {
      throw new CaktoWebhookError(409, "DIVERGENT_WEBHOOK_REPLAY", "Webhook replay does not match the original delivery");
    }
    return { event: existing, duplicate: true };
  }
}

function subscriptionMatchesEvidence(
  subscription: StoredSubscription,
  effect: Extract<PreparedCaktoBillingEffect, { kind: "READY" }>,
): boolean {
  return (
    subscription.plan === effect.plan &&
    subscription.providerSubscriptionId === effect.providerSubscriptionId &&
    subscription.providerCustomerId === effect.providerCustomerId &&
    subscription.providerProductId === effect.providerProductId &&
    subscription.providerOfferId === effect.providerOfferId
  );
}

async function markEvent(
  transaction: BillingTransaction,
  eventId: string,
  data: { occurredAt?: Date; processedAt?: Date; processingError: string | null },
): Promise<void> {
  await transaction.paymentWebhookEvent.update({ where: { id: eventId }, data });
}

async function applyPreparedEffect(
  transaction: BillingTransaction,
  eventId: string,
  payloadHash: string,
  effect: Extract<PreparedCaktoBillingEffect, { kind: "READY" }>,
  now: Date,
): Promise<{ processed: boolean; ignored: boolean; reason: string | null }> {
  const event = await transaction.paymentWebhookEvent.findUnique({
    where: { id: eventId },
    select: { id: true, payloadHash: true, processedAt: true },
  });
  if (!event || event.payloadHash !== payloadHash) {
    throw new CaktoWebhookError(409, "WEBHOOK_RECEIPT_NOT_VERIFIED", "Webhook receipt could not be verified");
  }
  if (event.processedAt) return { processed: true, ignored: false, reason: null };

  const existing = await transaction.subscription.findUnique({
    where: { providerSubscriptionId: effect.providerSubscriptionId },
    select: {
      id: true,
      userId: true,
      plan: true,
      providerSubscriptionId: true,
      providerCustomerId: true,
      providerProductId: true,
      providerOfferId: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      lastEventOccurredAt: true,
    },
  });

  if (existing && !subscriptionMatchesEvidence(existing, effect)) {
    await markEvent(transaction, eventId, { processingError: "DURABLE_CORRELATION_MISMATCH" });
    return { processed: false, ignored: false, reason: "DURABLE_CORRELATION_MISMATCH" };
  }

  if (
    existing?.lastEventOccurredAt &&
    effect.occurredAt.getTime() <= existing.lastEventOccurredAt.getTime()
  ) {
    await markEvent(transaction, eventId, {
      occurredAt: effect.occurredAt,
      processedAt: now,
      processingError: "STALE_OR_OUT_OF_ORDER_EVENT",
    });
    return { processed: true, ignored: true, reason: "STALE_OR_OUT_OF_ORDER_EVENT" };
  }

  let subscriptionId: string;
  let checkoutAttemptId: string | null = null;
  if (!existing) {
    if (effect.action !== "ACTIVATE" || !effect.correlationTokenHash || !effect.period) {
      await markEvent(transaction, eventId, { processingError: "DURABLE_CORRELATION_NOT_FOUND" });
      return { processed: false, ignored: false, reason: "DURABLE_CORRELATION_NOT_FOUND" };
    }
    const attempt = await transaction.checkoutAttempt.findUnique({
      where: { token: effect.correlationTokenHash },
      select: { id: true, userId: true, plan: true, status: true },
    });
    if (!attempt || attempt.status !== "PENDING" || attempt.plan !== effect.plan) {
      await markEvent(transaction, eventId, { processingError: "CHECKOUT_ASSOCIATION_NOT_VERIFIED" });
      return { processed: false, ignored: false, reason: "CHECKOUT_ASSOCIATION_NOT_VERIFIED" };
    }
    const created = await transaction.subscription.create({
      data: {
        userId: attempt.userId,
        provider: "CAKTO",
        plan: effect.plan,
        status: "ACTIVE",
        providerSubscriptionId: effect.providerSubscriptionId,
        providerCustomerId: effect.providerCustomerId,
        providerProductId: effect.providerProductId,
        providerOfferId: effect.providerOfferId,
        currentPeriodStart: effect.period.start,
        currentPeriodEnd: effect.period.end,
        canceledAt: null,
        lastEventOccurredAt: effect.occurredAt,
      },
      select: { id: true },
    });
    subscriptionId = created.id;
    checkoutAttemptId = attempt.id;
  } else {
    if (effect.action === "RENEW" && !effect.period) {
      await markEvent(transaction, eventId, { processingError: "AUTHORITATIVE_PERIOD_NOT_AVAILABLE" });
      return { processed: false, ignored: false, reason: "AUTHORITATIVE_PERIOD_NOT_AVAILABLE" };
    }
    if (effect.action === "CANCEL" && !existing.currentPeriodEnd) {
      await markEvent(transaction, eventId, { processingError: "AUTHORITATIVE_PERIOD_NOT_AVAILABLE" });
      return { processed: false, ignored: false, reason: "AUTHORITATIVE_PERIOD_NOT_AVAILABLE" };
    }

    const data = effect.action === "CANCEL"
      ? {
          status: "CANCELED" as const,
          canceledAt: effect.occurredAt,
          lastEventOccurredAt: effect.occurredAt,
        }
      : effect.action === "REVOKE"
        ? {
            status: "EXPIRED" as const,
            lastEventOccurredAt: effect.occurredAt,
          }
        : {
            status: "ACTIVE" as const,
            currentPeriodStart: effect.period!.start,
            currentPeriodEnd: effect.period!.end,
            canceledAt: null,
            lastEventOccurredAt: effect.occurredAt,
          };
    const updated = await transaction.subscription.update({
      where: { id: existing.id },
      data,
      select: { id: true },
    });
    subscriptionId = updated.id;
  }

  if (checkoutAttemptId) {
    await transaction.checkoutAttempt.update({
      where: { id: checkoutAttemptId },
      data: { status: "COMPLETED", completedAt: now },
    });
  }
  await markEvent(transaction, eventId, {
    occurredAt: effect.occurredAt,
    processedAt: now,
    processingError: null,
  });
  void subscriptionId;
  return { processed: true, ignored: false, reason: null };
}

export async function processCaktoWebhook(
  payload: CaktoWebhookEnvelope,
  dependencies: ProcessCaktoWebhookDependencies = {},
) {
  const order = caktoOrderDataSchema.safeParse(payload.data);
  if (!order.success) {
    throw new CaktoWebhookError(400, "INVALID_WEBHOOK_PAYLOAD", "Invalid webhook payload");
  }

  const client = dependencies.client ?? (prisma as unknown as BillingClient);
  const now = dependencies.now?.() ?? new Date();
  const providerEventId = getCaktoProviderEventId(payload.event, order.data.id);
  const payloadHash = getPayloadHash(payload);
  const executable = executableEvents.has(payload.event);
  const receipt = await recordReceipt(
    client,
    payload,
    providerEventId,
    payloadHash,
    executable,
    now,
  );

  if (!executable || receipt.event.processedAt) {
    return {
      duplicate: receipt.duplicate,
      pendingAssociation: false,
      checkoutCorrelationCandidate: false,
      webhookEvent: receipt.event,
    };
  }

  let apiClient: CaktoApiClient;
  try {
    apiClient = dependencies.apiClient ?? createConfiguredCaktoApiClient();
  } catch {
    await client.paymentWebhookEvent.update({
      where: { id: receipt.event.id },
      data: { processingError: "PROVIDER_CONFIRMATION_FAILED" },
    });
    return {
      duplicate: receipt.duplicate,
      pendingAssociation: true,
      checkoutCorrelationCandidate: false,
      webhookEvent: receipt.event,
    };
  }

  const effect = await prepareCaktoBillingEffect(
    {
      event: payload.event,
      orderId: order.data.id,
      allowlist: dependencies.allowlist === undefined
        ? getConfiguredCaktoPlanAllowlist()
        : dependencies.allowlist,
    },
    apiClient,
  );
  if (effect.kind === "BLOCKED") {
    await client.paymentWebhookEvent.update({
      where: { id: receipt.event.id },
      data: { processingError: effect.reason },
    });
    return {
      duplicate: receipt.duplicate,
      pendingAssociation: true,
      checkoutCorrelationCandidate: false,
      webhookEvent: receipt.event,
    };
  }

  const applied = await client.$transaction(
    (transaction) => applyPreparedEffect(
      transaction,
      receipt.event.id,
      payloadHash,
      effect,
      now,
    ),
    { isolationLevel: "Serializable" },
  );
  return {
    duplicate: receipt.duplicate,
    pendingAssociation: !applied.processed,
    checkoutCorrelationCandidate: applied.processed,
    webhookEvent: receipt.event,
    ignored: applied.ignored,
    processingError: applied.reason,
  };
}
