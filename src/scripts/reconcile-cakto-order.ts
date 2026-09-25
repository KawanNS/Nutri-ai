import { pathToFileURL } from "node:url";

import { prisma } from "../lib/prisma.js";
import { CaktoApiError, createCaktoApiClient, requestCaktoAccessToken } from "../services/cakto-api.service.js";
import { hashCheckoutCorrelationToken } from "../services/billing.service.js";
import { getEffectiveSubscriptionAccess } from "../services/subscription.service.js";

const CONFIRMATION_FLAG = "--confirm-reconcile-real-paid-order";
const EXPECTED_PRICE_CENTS = 1_990;
const EXPECTED_PAYMENT_DAY_START = new Date("2026-09-12T00:00:00.000Z");
const EXPECTED_PAYMENT_DAY_END = new Date("2026-09-13T00:00:00.000Z");
const EXPECTED_NEXT_PAYMENT_DAY_START = new Date("2026-10-12T00:00:00.000Z");
const EXPECTED_NEXT_PAYMENT_DAY_END = new Date("2026-10-13T00:00:00.000Z");
const MAX_CHECKOUT_GRACE_MS = 15 * 60 * 1_000;
let currentProviderStage = "NOT_STARTED";

function requiredSecret(name: "CAKTO_CLIENT_ID" | "CAKTO_CLIENT_SECRET"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_NOT_CONFIGURED`);
  return value;
}

function orderIdFromProviderEventId(providerEventId: string): string {
  return providerEventId.slice(providerEventId.indexOf(":") + 1);
}

function requireCondition(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function decimalToCents(value: string | number): number | null {
  const normalized = typeof value === "number" ? value.toString() : value;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

async function findPreservedOrderId(): Promise<string> {
  const events = await prisma.paymentWebhookEvent.findMany({
    where: {
      provider: "CAKTO",
      eventType: { in: ["purchase_approved", "subscription_created"] },
      receivedAt: { gte: EXPECTED_PAYMENT_DAY_START, lt: EXPECTED_PAYMENT_DAY_END },
    },
    select: { providerEventId: true, eventType: true },
  });
  const byOrder = new Map<string, Set<string>>();
  for (const event of events) {
    const orderId = orderIdFromProviderEventId(event.providerEventId);
    const types = byOrder.get(orderId) ?? new Set<string>();
    types.add(event.eventType);
    byOrder.set(orderId, types);
  }
  const candidates = [...byOrder.entries()]
    .filter(([, types]) => types.has("purchase_approved") && types.has("subscription_created"))
    .map(([orderId]) => orderId);
  requireCondition(candidates.length === 1, "PRESERVED_ORDER_NOT_UNAMBIGUOUS");
  return candidates[0]!;
}

async function run(): Promise<void> {
  requireCondition(
    process.argv.slice(2).length === 1 && process.argv[2] === CONFIRMATION_FLAG,
    `EXPLICIT_CONFIRMATION_REQUIRED:${CONFIRMATION_FLAG}`,
  );

  const userCountBefore = await prisma.user.count();
  const orderId = await findPreservedOrderId();
  const clientId = requiredSecret("CAKTO_CLIENT_ID");
  const clientSecret = requiredSecret("CAKTO_CLIENT_SECRET");
  const baseUrl = process.env.CAKTO_API_BASE_URL?.trim() || "https://api.cakto.com.br";
  currentProviderStage = "TOKEN";
  const oauth = await requestCaktoAccessToken({ baseUrl, clientId, clientSecret });
  const api = createCaktoApiClient({ baseUrl, accessToken: oauth.accessToken });

  // All provider reads happen before the database transaction. No secret or provider ID is printed.
  currentProviderStage = "ORDER";
  const order = await api.getOrder(orderId);
  requireCondition(order.id === orderId, "ORDER_ID_MISMATCH");
  requireCondition(order.status === "paid", "ORDER_NOT_PAID");
  requireCondition(order.type === "subscription", "ORDER_TYPE_MISMATCH");
  requireCondition(order.paidAt, "ORDER_PAID_AT_NOT_AVAILABLE");
  const paidAt = new Date(order.paidAt);
  requireCondition(
    paidAt >= EXPECTED_PAYMENT_DAY_START && paidAt < EXPECTED_PAYMENT_DAY_END,
    "ORDER_PAYMENT_DATE_MISMATCH",
  );
  requireCondition(order.subscription, "ORDER_SUBSCRIPTION_NOT_AVAILABLE");
  requireCondition(order.sck, "ORDER_SCK_NOT_AVAILABLE");
  requireCondition(order.customer?.email, "ORDER_CUSTOMER_EMAIL_NOT_AVAILABLE");
  requireCondition(
    order.product.name?.trim().toLocaleLowerCase("pt-BR") === "nutri-ai mensal",
    "ORDER_PRODUCT_NAME_MISMATCH",
  );

  currentProviderStage = "SUBSCRIPTION";
  const subscription = await api.getSubscription(order.subscription);
  requireCondition(subscription.id === order.subscription, "SUBSCRIPTION_ID_MISMATCH");
  requireCondition(subscription.status === "active", "SUBSCRIPTION_NOT_ACTIVE");
  requireCondition(subscription.product === order.product.id, "SUBSCRIPTION_PRODUCT_MISMATCH");
  requireCondition(
    subscription.parent_order === order.id || subscription.orders.includes(order.id),
    "SUBSCRIPTION_ORDER_LINK_MISMATCH",
  );
  requireCondition(subscription.next_payment_date, "NEXT_PAYMENT_DATE_NOT_AVAILABLE");
  const nextPaymentAt = new Date(subscription.next_payment_date);
  requireCondition(
    nextPaymentAt >= EXPECTED_NEXT_PAYMENT_DAY_START && nextPaymentAt < EXPECTED_NEXT_PAYMENT_DAY_END,
    "NEXT_PAYMENT_DATE_MISMATCH",
  );
  requireCondition(decimalToCents(subscription.amount) === EXPECTED_PRICE_CENTS, "SUBSCRIPTION_AMOUNT_MISMATCH");
  requireCondition(
    typeof subscription.customer !== "string" &&
      subscription.customer.email.toLowerCase() === order.customer.email.toLowerCase(),
    "SUBSCRIPTION_CUSTOMER_EMAIL_MISMATCH",
  );

  currentProviderStage = "OFFER";
  const offer = await api.getOffer(subscription.offer);
  requireCondition(offer.id === subscription.offer, "OFFER_ID_MISMATCH");
  requireCondition(offer.product === order.product.id, "OFFER_PRODUCT_MISMATCH");
  requireCondition(offer.status === undefined || offer.status === "active", "OFFER_NOT_ACTIVE");
  requireCondition(offer.type === undefined || offer.type === "subscription", "OFFER_TYPE_MISMATCH");
  requireCondition(decimalToCents(offer.price) === EXPECTED_PRICE_CENTS, "OFFER_PRICE_MISMATCH");

  const owner = await prisma.user.findFirst({
    where: { email: { startsWith: "gamespot", mode: "insensitive" } },
    select: { id: true, email: true },
  });
  requireCondition(owner, "GAMESPOT_OWNER_NOT_FOUND");
  requireCondition(owner.email.toLowerCase() === order.customer.email.toLowerCase(), "GAMESPOT_EMAIL_MISMATCH");

  const tokenHash = hashCheckoutCorrelationToken(order.sck);
  const attempt = await prisma.checkoutAttempt.findUnique({
    where: { token: tokenHash },
    select: { id: true, userId: true, plan: true, status: true, expiresAt: true, createdAt: true },
  });
  requireCondition(attempt, "CHECKOUT_ATTEMPT_NOT_FOUND");
  requireCondition(attempt.userId === owner.id, "CHECKOUT_OWNER_MISMATCH");
  requireCondition(attempt.plan === "MONTHLY", "CHECKOUT_PLAN_MISMATCH");
  requireCondition(attempt.status === "PENDING" || attempt.status === "COMPLETED", "CHECKOUT_STATE_MISMATCH");
  requireCondition(attempt.createdAt <= paidAt, "PAYMENT_PRECEDES_CHECKOUT");
  requireCondition(paidAt.getTime() <= attempt.expiresAt.getTime() + MAX_CHECKOUT_GRACE_MS, "PAYMENT_OUTSIDE_CHECKOUT_GRACE");

  const matchingEvents = await prisma.paymentWebhookEvent.findMany({
    where: {
      provider: "CAKTO",
      providerEventId: { in: [`purchase_approved:${orderId}`, `subscription_created:${orderId}`] },
    },
    select: { id: true, eventType: true },
  });
  requireCondition(matchingEvents.length === 2, "WEBHOOK_RECEIPTS_NOT_UNAMBIGUOUS");
  requireCondition(new Set(matchingEvents.map((event) => event.eventType)).size === 2, "WEBHOOK_RECEIPTS_DIVERGENT");

  const reconciliation = await prisma.$transaction(async (transaction) => {
    const durableAttempt = await transaction.checkoutAttempt.findUnique({
      where: { id: attempt.id },
      select: { userId: true, token: true, plan: true, status: true },
    });
    requireCondition(durableAttempt, "CHECKOUT_ATTEMPT_DISAPPEARED");
    requireCondition(durableAttempt.userId === owner.id, "DURABLE_CHECKOUT_OWNER_MISMATCH");
    requireCondition(durableAttempt.token === tokenHash, "DURABLE_CHECKOUT_TOKEN_MISMATCH");
    requireCondition(durableAttempt.plan === "MONTHLY", "DURABLE_CHECKOUT_PLAN_MISMATCH");
    requireCondition(
      durableAttempt.status === "PENDING" || durableAttempt.status === "COMPLETED",
      "DURABLE_CHECKOUT_STATE_MISMATCH",
    );

    const existing = await transaction.subscription.findUnique({
      where: { providerSubscriptionId: subscription.id },
    });
    if (existing) {
      requireCondition(existing.userId === owner.id, "SUBSCRIPTION_ALREADY_BOUND_TO_OTHER_USER");
      requireCondition(existing.plan === "MONTHLY", "EXISTING_SUBSCRIPTION_PLAN_MISMATCH");
      requireCondition(existing.providerCustomerId === null, "EXISTING_CUSTOMER_MISMATCH");
      requireCondition(existing.providerProductId === order.product.id, "EXISTING_PRODUCT_MISMATCH");
      requireCondition(existing.providerOfferId === offer.id, "EXISTING_OFFER_MISMATCH");
    }

    const data = {
      userId: owner.id,
      provider: "CAKTO" as const,
      plan: "MONTHLY" as const,
      status: "ACTIVE" as const,
      providerSubscriptionId: subscription.id,
      providerCustomerId: null,
      providerProductId: order.product.id,
      providerOfferId: offer.id,
      currentPeriodStart: paidAt,
      currentPeriodEnd: nextPaymentAt,
      canceledAt: null,
      lastEventOccurredAt: paidAt,
    };
    const existingAlreadyMatches = existing !== null &&
      existing.status === "ACTIVE" &&
      existing.currentPeriodStart?.getTime() === paidAt.getTime() &&
      existing.currentPeriodEnd?.getTime() === nextPaymentAt.getTime() &&
      existing.canceledAt === null &&
      existing.lastEventOccurredAt?.getTime() === paidAt.getTime();
    const saved = existingAlreadyMatches
      ? existing
      : existing
        ? await transaction.subscription.update({ where: { id: existing.id }, data })
        : await transaction.subscription.create({ data });

    if (durableAttempt.status === "PENDING") {
      await transaction.checkoutAttempt.update({
        where: { id: attempt.id },
        data: { status: "COMPLETED", completedAt: paidAt },
      });
    }
    await transaction.paymentWebhookEvent.updateMany({
      where: {
        id: { in: matchingEvents.map((event) => event.id) },
        OR: [
          { processedAt: null },
          { processingError: { not: null } },
          { occurredAt: { not: paidAt } },
        ],
      },
      data: { occurredAt: paidAt, processedAt: new Date(), processingError: null },
    });
    return { subscriptionId: saved.id, created: existing === null };
  }, { isolationLevel: "Serializable" });

  const [access, userCountAfter, ownerSubscription] = await Promise.all([
    getEffectiveSubscriptionAccess(owner.id),
    prisma.user.count(),
    prisma.subscription.findUnique({
      where: { id: reconciliation.subscriptionId },
      select: { status: true, plan: true, userId: true },
    }),
  ]);
  requireCondition(ownerSubscription?.userId === owner.id, "OWNER_SUBSCRIPTION_NOT_FOUND_AFTER_RECONCILIATION");

  process.stdout.write(`${JSON.stringify({
    CAKTO_TOKEN_GENERATED: "SIM",
    CAKTO_TOKEN_HTTP_STATUS: 200,
    CAKTO_API_AUTHENTICATED: "SIM",
    ORDER_FOUND: "SIM",
    ORDER_HTTP_STATUS: 200,
    ORDER_PAYMENT_STATUS: order.status,
    ORDER_DATE_MATCH: "SIM",
    ORDER_SUBSCRIPTION_ID_FOUND: "SIM",
    ORDER_SCK_FOUND: "SIM",
    ORDER_PRODUCT_FOUND: "SIM",
    ORDER_OFFER_FOUND: order.offer?.id ? "SIM" : "NAO_NO_PEDIDO; SIM_NA_ASSINATURA",
    ORDER_CUSTOMER_FOUND: "SIM",
    GAMESPOT_EMAIL_MATCH: "SIM",
    GAMESPOT_SCK_MATCH: "SIM",
    PRODUCT_MATCH: "SIM",
    CHECKOUT_ATTEMPT_MATCH: "SIM",
    SUBSCRIPTION_REFERENCE_FOUND: "SIM",
    OWNER_ACCOUNT_MATCH_CONFIRMED: "SIM",
    RECONCILIATION_PERFORMED: "SIM",
    RECONCILIATION_CREATED_SUBSCRIPTION: reconciliation.created ? "SIM" : "NAO_IDEMPOTENT_EXISTING",
    OWNER_SUBSCRIPTION_EXISTS: "SIM",
    OWNER_SUBSCRIPTION_STATUS: ownerSubscription.status,
    OWNER_SUBSCRIPTION_PLAN: ownerSubscription.plan,
    OWNER_PREMIUM: access.isPremium ? "SIM" : "NAO",
    EXISTING_USERS_BEFORE: userCountBefore,
    EXISTING_USERS_AFTER: userCountAfter,
    OTHER_USERS_CHANGED: userCountBefore === userCountAfter ? "NAO" : "NAO_VERIFICAVEL",
  }, null, 2)}\n`);
}

async function runDirectly(): Promise<void> {
  try {
    await run();
  } catch (error: unknown) {
    const result = error instanceof CaktoApiError
      ? { error: error.code, httpStatus: error.providerStatus, stage: currentProviderStage }
      : { error: error instanceof Error ? error.message : "CAKTO_RECONCILIATION_FAILED" };
    process.stderr.write(`${JSON.stringify(result)}\n`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) await runDirectly();
