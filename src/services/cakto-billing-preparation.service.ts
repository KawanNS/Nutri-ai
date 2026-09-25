import { timingSafeEqual } from "node:crypto";
import type { SubscriptionPlan } from "../generated/prisma/client.js";
import type {
  CaktoApiOffer,
  CaktoApiOrder,
  CaktoApiSubscription,
} from "../schemas/cakto-api.schema.js";
import { caktoCorrelationTokenSchema } from "../schemas/cakto-webhook.schema.js";
import type { CaktoApiClient } from "./cakto-api.service.js";
import { hashCheckoutCorrelationToken } from "./billing.service.js";
import {
  matchesCaktoPlanPrice,
  resolveCaktoPlan,
  type CaktoPlanAllowlist,
} from "./cakto-plan-mapping.service.js";

export type CaktoPreparationBlockReason =
  | "CHECKOUT_ATTEMPT_NOT_PENDING"
  | "CHECKOUT_ATTEMPT_EXPIRED"
  | "INVALID_EXPECTED_TOKEN_HASH"
  | "ORDER_ID_MISMATCH"
  | "ORDER_SCK_NOT_AVAILABLE"
  | "ORDER_SCK_INVALID"
  | "ORDER_SCK_MISMATCH"
  | "ORDER_STATUS_NOT_ELIGIBLE"
  | "ORDER_TYPE_MISMATCH"
  | "ORDER_SUBSCRIPTION_NOT_AVAILABLE"
  | "SUBSCRIPTION_ID_MISMATCH"
  | "SUBSCRIPTION_PRODUCT_MISMATCH"
  | "SUBSCRIPTION_OFFER_NOT_AVAILABLE"
  | "ORDER_SUBSCRIPTION_LINK_MISMATCH"
  | "OFFER_ID_MISMATCH"
  | "OFFER_PRODUCT_MISMATCH"
  | "OFFER_PRICE_MISMATCH"
  | "PLAN_NOT_RESOLVED"
  | "PLAN_CONFIGURATION_NOT_AVAILABLE"
  | "CHECKOUT_PLAN_MISMATCH"
  | "ORDER_STATUS_POLICY_NOT_CONFIGURED"
  | "PROVIDER_CONFIRMATION_FAILED"
  | "AUTHORITATIVE_PERIOD_NOT_AVAILABLE"
  | "INVALID_AUTHORITATIVE_PERIOD"
  | "INCOMPLETE_CONFIRMATION"
  | "PROVIDER_SUBSCRIPTION_STATE_NOT_ELIGIBLE"
  | "PROVIDER_STATE_TAKES_PRECEDENCE"
  | "RENEWAL_REFUSAL_POLICY_NOT_CONFIRMED"
  | "UNSUPPORTED_EVENT";

type ValidationResult =
  | { ok: true }
  | { ok: false; reason: CaktoPreparationBlockReason };

export interface CaktoCheckoutAttemptConfirmation {
  tokenHash: string;
  plan: SubscriptionPlan;
  status: "PENDING" | "COMPLETED" | "EXPIRED";
  expiresAt: Date;
}

export function validateCaktoCheckoutAttempt(
  attempt: CaktoCheckoutAttemptConfirmation,
  now: Date,
): ValidationResult {
  if (attempt.status !== "PENDING") {
    return { ok: false, reason: "CHECKOUT_ATTEMPT_NOT_PENDING" };
  }
  if (
    !Number.isFinite(attempt.expiresAt.getTime()) ||
    attempt.expiresAt.getTime() <= now.getTime()
  ) {
    return { ok: false, reason: "CHECKOUT_ATTEMPT_EXPIRED" };
  }
  if (!/^[a-f0-9]{64}$/i.test(attempt.tokenHash)) {
    return { ok: false, reason: "INVALID_EXPECTED_TOKEN_HASH" };
  }
  return { ok: true };
}

export interface ExpectedCaktoOrder {
  orderId: string;
  tokenHash: string;
  eligibleStatuses: readonly CaktoApiOrder["status"][];
  type: CaktoApiOrder["type"];
  requireSubscription: boolean;
}

function hashesMatch(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function validateCaktoOrderCorrelation(
  order: CaktoApiOrder,
  expected: ExpectedCaktoOrder,
): ValidationResult {
  if (!/^[a-f0-9]{64}$/i.test(expected.tokenHash)) {
    return { ok: false, reason: "INVALID_EXPECTED_TOKEN_HASH" };
  }
  if (order.id !== expected.orderId) return { ok: false, reason: "ORDER_ID_MISMATCH" };
  if (typeof order.sck !== "string" || order.sck.length === 0) {
    return { ok: false, reason: "ORDER_SCK_NOT_AVAILABLE" };
  }
  if (!caktoCorrelationTokenSchema.safeParse(order.sck).success) {
    return { ok: false, reason: "ORDER_SCK_INVALID" };
  }
  if (!hashesMatch(hashCheckoutCorrelationToken(order.sck), expected.tokenHash)) {
    return { ok: false, reason: "ORDER_SCK_MISMATCH" };
  }
  if (!expected.eligibleStatuses.includes(order.status)) {
    return { ok: false, reason: "ORDER_STATUS_NOT_ELIGIBLE" };
  }
  if (order.type !== expected.type) return { ok: false, reason: "ORDER_TYPE_MISMATCH" };
  if (expected.requireSubscription && !order.subscription) {
    return { ok: false, reason: "ORDER_SUBSCRIPTION_NOT_AVAILABLE" };
  }
  return { ok: true };
}

export function validateCaktoOrderSubscription(
  order: CaktoApiOrder,
  subscription: CaktoApiSubscription,
): ValidationResult {
  if (!order.subscription || subscription.id !== order.subscription) {
    return { ok: false, reason: "SUBSCRIPTION_ID_MISMATCH" };
  }
  if (subscription.product !== order.product.id) {
    return { ok: false, reason: "SUBSCRIPTION_PRODUCT_MISMATCH" };
  }
  if (subscription.offer.trim().length === 0) {
    return { ok: false, reason: "SUBSCRIPTION_OFFER_NOT_AVAILABLE" };
  }
  if (subscription.parent_order !== order.id && !subscription.orders.includes(order.id)) {
    return { ok: false, reason: "ORDER_SUBSCRIPTION_LINK_MISMATCH" };
  }
  return { ok: true };
}

export function validateCaktoOffer(
  offer: CaktoApiOffer,
  subscription: CaktoApiSubscription,
): ValidationResult {
  if (offer.id !== subscription.offer) return { ok: false, reason: "OFFER_ID_MISMATCH" };
  if (offer.product !== subscription.product) {
    return { ok: false, reason: "OFFER_PRODUCT_MISMATCH" };
  }
  return { ok: true };
}

export interface CaktoEntitlementPeriodInput {
  authoritativePeriod?: {
    start: Date;
    end: Date;
    source: "CAKTO_AUTHORITATIVE_PERIOD";
  };
  nextPaymentDate?: string | null;
  recurrencePeriod?: number;
  billingCycleDueDate?: string;
}

export type CaktoEntitlementPeriodResult =
  | { ok: true; start: Date; end: Date; source: "CAKTO_AUTHORITATIVE_PERIOD" }
  | { ok: false; reason: "AUTHORITATIVE_PERIOD_NOT_AVAILABLE" | "INVALID_AUTHORITATIVE_PERIOD" };

export function resolveCaktoEntitlementPeriod(
  input: CaktoEntitlementPeriodInput,
): CaktoEntitlementPeriodResult {
  const period = input.authoritativePeriod;
  if (!period) return { ok: false, reason: "AUTHORITATIVE_PERIOD_NOT_AVAILABLE" };
  if (
    !Number.isFinite(period.start.getTime()) ||
    !Number.isFinite(period.end.getTime()) ||
    period.end.getTime() <= period.start.getTime()
  ) {
    return { ok: false, reason: "INVALID_AUTHORITATIVE_PERIOD" };
  }
  return { ok: true, ...period };
}

export type CaktoBillingDecision =
  | { kind: "ACTIVATE_CANDIDATE" }
  | { kind: "RENEW_CANDIDATE" }
  | { kind: "CANCEL_CANDIDATE"; accessUntil: Date }
  | { kind: "REVOKE_CANDIDATE" }
  | { kind: "NO_CHANGE"; reason: "PROVIDER_STATE_TAKES_PRECEDENCE" }
  | { kind: "BLOCKED"; reason: CaktoPreparationBlockReason };

export interface CaktoBillingDecisionContext {
  checkoutConfirmed: boolean;
  orderConfirmed: boolean;
  subscriptionConfirmed: boolean;
  subscriptionStatus: CaktoApiSubscription["status"] | null;
  commercialMappingConfirmed: boolean;
  period: CaktoEntitlementPeriodResult;
}

function fullyConfirmed(context: CaktoBillingDecisionContext): boolean {
  return (
    context.checkoutConfirmed &&
    context.orderConfirmed &&
    context.subscriptionConfirmed &&
    context.commercialMappingConfirmed
  );
}

export function decideCaktoBillingLifecycle(
  event: string,
  context: CaktoBillingDecisionContext,
): CaktoBillingDecision {
  if (event === "subscription_renewal_refused") {
    return { kind: "BLOCKED", reason: "RENEWAL_REFUSAL_POLICY_NOT_CONFIRMED" };
  }
  if (!["purchase_approved", "subscription_created", "subscription_renewed", "subscription_canceled", "refund", "chargeback"].includes(event)) {
    return { kind: "BLOCKED", reason: "UNSUPPORTED_EVENT" };
  }

  if (!context.checkoutConfirmed || !context.orderConfirmed) {
    return { kind: "BLOCKED", reason: "INCOMPLETE_CONFIRMATION" };
  }
  if (event === "refund" || event === "chargeback") return { kind: "REVOKE_CANDIDATE" };
  if (!fullyConfirmed(context)) return { kind: "BLOCKED", reason: "INCOMPLETE_CONFIRMATION" };

  if (event === "subscription_canceled" && context.subscriptionStatus === "active") {
    return { kind: "NO_CHANGE", reason: "PROVIDER_STATE_TAKES_PRECEDENCE" };
  }
  if (
    (event === "subscription_canceled" && context.subscriptionStatus !== "canceled") ||
    (event !== "subscription_canceled" && context.subscriptionStatus !== "active")
  ) {
    return { kind: "BLOCKED", reason: "PROVIDER_SUBSCRIPTION_STATE_NOT_ELIGIBLE" };
  }
  if (!context.period.ok) return { kind: "BLOCKED", reason: context.period.reason };

  if (event === "subscription_renewed") return { kind: "RENEW_CANDIDATE" };
  if (event === "subscription_canceled") {
    return { kind: "CANCEL_CANDIDATE", accessUntil: context.period.end };
  }
  return { kind: "ACTIVATE_CANDIDATE" };
}

export interface PrepareCaktoBillingDecisionInput {
  event: string;
  orderId: string;
  checkoutAttempt: CaktoCheckoutAttemptConfirmation;
  eligibleOrderStatuses: readonly CaktoApiOrder["status"][];
  allowlist: CaktoPlanAllowlist | null;
  entitlementPeriod: CaktoEntitlementPeriodInput;
  now?: Date;
}

export async function prepareCaktoBillingDecision(
  input: PrepareCaktoBillingDecisionInput,
  apiClient: CaktoApiClient,
): Promise<CaktoBillingDecision> {
  if (input.eligibleOrderStatuses.length === 0) {
    return { kind: "BLOCKED", reason: "ORDER_STATUS_POLICY_NOT_CONFIGURED" };
  }
  if (!input.allowlist) {
    return { kind: "BLOCKED", reason: "PLAN_CONFIGURATION_NOT_AVAILABLE" };
  }
  const attemptValidation = validateCaktoCheckoutAttempt(
    input.checkoutAttempt,
    input.now ?? new Date(),
  );
  if (!attemptValidation.ok) {
    return { kind: "BLOCKED", reason: attemptValidation.reason };
  }

  try {
    const order = await apiClient.getOrder(input.orderId);
    const orderValidation = validateCaktoOrderCorrelation(order, {
      orderId: input.orderId,
      tokenHash: input.checkoutAttempt.tokenHash,
      eligibleStatuses: input.eligibleOrderStatuses,
      type: "subscription",
      requireSubscription: true,
    });
    if (!orderValidation.ok) return { kind: "BLOCKED", reason: orderValidation.reason };

    const subscription = await apiClient.getSubscription(order.subscription!);
    const subscriptionValidation = validateCaktoOrderSubscription(order, subscription);
    if (!subscriptionValidation.ok) {
      return { kind: "BLOCKED", reason: subscriptionValidation.reason };
    }

    const offer = await apiClient.getOffer(subscription.offer);
    const offerValidation = validateCaktoOffer(offer, subscription);
    if (!offerValidation.ok) return { kind: "BLOCKED", reason: offerValidation.reason };

    const resolvedPlan = resolveCaktoPlan(input.allowlist, {
      productId: subscription.product,
      offerId: subscription.offer,
    });
    if (!resolvedPlan) return { kind: "BLOCKED", reason: "PLAN_NOT_RESOLVED" };
    if (resolvedPlan !== input.checkoutAttempt.plan) {
      return { kind: "BLOCKED", reason: "CHECKOUT_PLAN_MISMATCH" };
    }
    if (!matchesCaktoPlanPrice(resolvedPlan, offer.price)) {
      return { kind: "BLOCKED", reason: "OFFER_PRICE_MISMATCH" };
    }

    return decideCaktoBillingLifecycle(input.event, {
      checkoutConfirmed: true,
      orderConfirmed: true,
      subscriptionConfirmed: true,
      subscriptionStatus: subscription.status,
      commercialMappingConfirmed: true,
      period: resolveCaktoEntitlementPeriod(input.entitlementPeriod),
    });
  } catch {
    return { kind: "BLOCKED", reason: "PROVIDER_CONFIRMATION_FAILED" };
  }
}

export type CaktoBillingEffectAction = "ACTIVATE" | "RENEW" | "CANCEL" | "REVOKE";

export type PreparedCaktoBillingEffect =
  | {
      kind: "READY";
      action: CaktoBillingEffectAction;
      orderId: string;
      providerSubscriptionId: string;
      providerCustomerId: string | null;
      providerProductId: string;
      providerOfferId: string;
      plan: SubscriptionPlan;
      occurredAt: Date;
      period: { start: Date; end: Date } | null;
      correlationTokenHash: string | null;
    }
  | { kind: "BLOCKED"; reason: CaktoPreparationBlockReason };

export interface PrepareCaktoBillingEffectInput {
  event: string;
  orderId: string;
  allowlist: CaktoPlanAllowlist | null;
}

function parsedDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function expectedOrderStatuses(event: string): readonly CaktoApiOrder["status"][] | null {
  switch (event) {
    case "purchase_approved":
    case "subscription_created":
    case "subscription_renewed":
      return ["paid"];
    case "subscription_canceled":
      return ["paid", "canceled"];
    case "refund":
      return ["refunded"];
    case "chargeback":
      return ["chargedback"];
    default:
      return null;
  }
}

function eventOccurrence(
  event: string,
  order: CaktoApiOrder,
  subscription: CaktoApiSubscription,
): Date | null {
  switch (event) {
    case "purchase_approved":
    case "subscription_created":
    case "subscription_renewed":
      return parsedDate(order.paidAt);
    case "subscription_canceled":
      return parsedDate(subscription.canceledAt) ?? parsedDate(order.canceledAt);
    case "refund":
      return parsedDate(order.refundedAt);
    case "chargeback":
      return parsedDate(order.chargedbackAt);
    default:
      return null;
  }
}

function effectAction(event: string): CaktoBillingEffectAction | null {
  switch (event) {
    case "purchase_approved":
    case "subscription_created":
      return "ACTIVATE";
    case "subscription_renewed":
      return "RENEW";
    case "subscription_canceled":
      return "CANCEL";
    case "refund":
    case "chargeback":
      return "REVOKE";
    default:
      return null;
  }
}

/**
 * Reads the provider's current resources and returns only fully verified
 * commercial evidence. It performs no local persistence and never exposes the
 * raw checkout correlation token.
 */
export async function prepareCaktoBillingEffect(
  input: PrepareCaktoBillingEffectInput,
  apiClient: CaktoApiClient,
): Promise<PreparedCaktoBillingEffect> {
  const statuses = expectedOrderStatuses(input.event);
  const action = effectAction(input.event);
  if (!statuses || !action) return { kind: "BLOCKED", reason: "UNSUPPORTED_EVENT" };
  if (!input.allowlist) {
    return { kind: "BLOCKED", reason: "PLAN_CONFIGURATION_NOT_AVAILABLE" };
  }

  try {
    const order = await apiClient.getOrder(input.orderId);
    if (order.id !== input.orderId) return { kind: "BLOCKED", reason: "ORDER_ID_MISMATCH" };
    if (!statuses.includes(order.status)) {
      return { kind: "BLOCKED", reason: "ORDER_STATUS_NOT_ELIGIBLE" };
    }
    if (order.type !== "subscription") {
      return { kind: "BLOCKED", reason: "ORDER_TYPE_MISMATCH" };
    }
    if (!order.subscription) {
      return { kind: "BLOCKED", reason: "ORDER_SUBSCRIPTION_NOT_AVAILABLE" };
    }

    const subscription = await apiClient.getSubscription(order.subscription);
    const subscriptionValidation = validateCaktoOrderSubscription(order, subscription);
    if (!subscriptionValidation.ok) {
      return { kind: "BLOCKED", reason: subscriptionValidation.reason };
    }
    if (
      (["purchase_approved", "subscription_created", "subscription_renewed"].includes(input.event) &&
        subscription.status !== "active") ||
      (input.event === "subscription_canceled" && subscription.status !== "canceled")
    ) {
      return { kind: "BLOCKED", reason: "PROVIDER_SUBSCRIPTION_STATE_NOT_ELIGIBLE" };
    }

    const offer = await apiClient.getOffer(subscription.offer);
    const offerValidation = validateCaktoOffer(offer, subscription);
    if (!offerValidation.ok) return { kind: "BLOCKED", reason: offerValidation.reason };
    const plan = resolveCaktoPlan(input.allowlist, {
      productId: subscription.product,
      offerId: subscription.offer,
    });
    if (!plan) return { kind: "BLOCKED", reason: "PLAN_NOT_RESOLVED" };
    if (!matchesCaktoPlanPrice(plan, offer.price)) {
      return { kind: "BLOCKED", reason: "OFFER_PRICE_MISMATCH" };
    }

    const occurredAt = eventOccurrence(input.event, order, subscription);
    if (!occurredAt) return { kind: "BLOCKED", reason: "INCOMPLETE_CONFIRMATION" };

    let period: { start: Date; end: Date } | null = null;
    if (action === "ACTIVATE" || action === "RENEW") {
      const start = parsedDate(order.paidAt);
      const end = parsedDate(subscription.next_payment_date);
      if (!start || !end) {
        return { kind: "BLOCKED", reason: "AUTHORITATIVE_PERIOD_NOT_AVAILABLE" };
      }
      if (end.getTime() <= start.getTime()) {
        return { kind: "BLOCKED", reason: "INVALID_AUTHORITATIVE_PERIOD" };
      }
      period = { start, end };
    }

    let correlationTokenHash: string | null = null;
    if (typeof order.sck === "string" && order.sck.length > 0) {
      if (!caktoCorrelationTokenSchema.safeParse(order.sck).success) {
        return { kind: "BLOCKED", reason: "ORDER_SCK_INVALID" };
      }
      correlationTokenHash = hashCheckoutCorrelationToken(order.sck);
    }

    return {
      kind: "READY",
      action,
      orderId: order.id,
      providerSubscriptionId: subscription.id,
      providerCustomerId: typeof subscription.customer === "string" ? subscription.customer : null,
      providerProductId: subscription.product,
      providerOfferId: subscription.offer,
      plan,
      occurredAt,
      period,
      correlationTokenHash,
    };
  } catch {
    return { kind: "BLOCKED", reason: "PROVIDER_CONFIRMATION_FAILED" };
  }
}
