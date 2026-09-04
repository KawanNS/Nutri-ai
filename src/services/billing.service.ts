import { createHash, randomBytes } from "node:crypto";
import type { SubscriptionPlan } from "../generated/prisma/client.js";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import {
  getEffectiveSubscriptionAccess,
  serializeSubscriptionAccess,
} from "./subscription.service.js";

export class BillingError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const CHECKOUT_ATTEMPT_TTL_MS = 15 * 60 * 1000;
const CORRELATION_TOKEN_BYTES = 32;

interface CheckoutAttemptPersistence {
  create(args: Parameters<typeof prisma.checkoutAttempt.create>[0]): Promise<{ id: string }>;
}

interface CheckoutCorrelationDependencies {
  persistence?: CheckoutAttemptPersistence;
  now?: () => Date;
  generateToken?: () => string;
}

export function generateCheckoutCorrelationToken(): string {
  return randomBytes(CORRELATION_TOKEN_BYTES).toString("base64url");
}

export function hashCheckoutCorrelationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function buildCorrelatedCheckoutUrl(baseUrl: string, token: string): string {
  const checkoutUrl = new URL(baseUrl);
  checkoutUrl.searchParams.set("sck", token);
  return checkoutUrl.toString();
}

export function getConfiguredCheckoutUrl(plan: SubscriptionPlan): string {
  const checkoutUrl = env.caktoCheckoutUrls[plan];
  const parsed = new URL(checkoutUrl);

  if (parsed.protocol !== "https:" || parsed.hostname !== "pay.cakto.com.br") {
    throw new BillingError(500, "INVALID_CHECKOUT_CONFIGURATION", "Checkout is not configured safely");
  }

  return parsed.toString();
}

export async function getSubscriptionForUser(userId: string) {
  return serializeSubscriptionAccess(await getEffectiveSubscriptionAccess(userId));
}

export async function createCorrelatedCheckoutAttempt(
  userId: string,
  plan: SubscriptionPlan,
  dependencies: CheckoutCorrelationDependencies = {},
) {
  const persistence = dependencies.persistence ?? prisma.checkoutAttempt;
  const now = dependencies.now?.() ?? new Date();
  const token = dependencies.generateToken?.() ?? generateCheckoutCorrelationToken();
  const tokenHash = hashCheckoutCorrelationToken(token);
  const baseCheckoutUrl = getConfiguredCheckoutUrl(plan);
  const expiresAt = new Date(now.getTime() + CHECKOUT_ATTEMPT_TTL_MS);

  const attempt = await persistence.create({
    data: {
      userId,
      plan,
      token: tokenHash,
      status: "PENDING",
      checkoutUrl: baseCheckoutUrl,
      expiresAt,
    },
    select: { id: true },
  });

  return {
    checkoutAttemptId: attempt.id,
    checkoutUrl: buildCorrelatedCheckoutUrl(baseCheckoutUrl, token),
    expiresAt,
  };
}

export function prepareCheckout(_userId: string, plan: SubscriptionPlan): never {
  getConfiguredCheckoutUrl(plan);
  throw new BillingError(
    503,
    "CHECKOUT_CORRELATION_NOT_VERIFIED",
    "Checkout is temporarily unavailable while secure account association is finalized",
  );
}
