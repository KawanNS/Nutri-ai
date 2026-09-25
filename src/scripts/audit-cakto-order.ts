import { pathToFileURL } from "node:url";

import { prisma } from "../lib/prisma.js";
import { CaktoApiError, createCaktoApiClient, requestCaktoAccessToken } from "../services/cakto-api.service.js";
import { hashCheckoutCorrelationToken } from "../services/billing.service.js";

const CONFIRMATION_FLAG = "--confirm-read-one-order";

function requiredSecret(name: "CAKTO_CLIENT_ID" | "CAKTO_CLIENT_SECRET"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_NOT_CONFIGURED`);
  return value;
}

function orderIdFromProviderEventId(providerEventId: string): string {
  return providerEventId.slice(providerEventId.indexOf(":") + 1);
}

async function findPreservedOrderId(): Promise<string> {
  const events = await prisma.paymentWebhookEvent.findMany({
    where: {
      provider: "CAKTO",
      eventType: { in: ["purchase_approved", "subscription_created"] },
      receivedAt: {
        gte: new Date("2026-09-12T00:00:00.000Z"),
        lt: new Date("2026-09-13T00:00:00.000Z"),
      },
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
  if (candidates.length !== 1) throw new Error("PRESERVED_ORDER_NOT_UNAMBIGUOUS");
  return candidates[0]!;
}

async function run(): Promise<void> {
  if (process.argv.slice(2).length !== 1 || process.argv[2] !== CONFIRMATION_FLAG) {
    throw new Error(`EXPLICIT_CONFIRMATION_REQUIRED:${CONFIRMATION_FLAG}`);
  }

  const clientId = requiredSecret("CAKTO_CLIENT_ID");
  const clientSecret = requiredSecret("CAKTO_CLIENT_SECRET");
  const baseUrl = process.env.CAKTO_API_BASE_URL?.trim() || "https://api.cakto.com.br";
  const orderId = await findPreservedOrderId();
  const oauth = await requestCaktoAccessToken({ baseUrl, clientId, clientSecret });
  const order = await createCaktoApiClient({ baseUrl, accessToken: oauth.accessToken }).getOrder(orderId);

  const gameSpot = await prisma.user.findFirst({
    where: { email: { startsWith: "gamespot", mode: "insensitive" } },
    select: { id: true, email: true },
  });
  const gameSpotEmailMatch = Boolean(
    gameSpot && order.customer?.email &&
    gameSpot.email.toLowerCase() === order.customer.email.toLowerCase(),
  );
  let gameSpotSckMatch = false;
  let checkoutAttemptMatch = false;
  if (order.sck) {
    const attempt = await prisma.checkoutAttempt.findUnique({
      where: { token: hashCheckoutCorrelationToken(order.sck) },
      select: { userId: true, plan: true, createdAt: true },
    });
    gameSpotSckMatch = attempt !== null && gameSpot !== null && attempt.userId === gameSpot.id;
    checkoutAttemptMatch = attempt !== null && gameSpotSckMatch && attempt.plan === "MONTHLY" &&
      attempt.createdAt >= new Date("2026-09-12T00:00:00.000Z") &&
      attempt.createdAt < new Date("2026-09-13T00:00:00.000Z");
  }
  const normalizedProductName = order.product.name?.trim().toLocaleLowerCase("pt-BR") ?? null;
  const configuredMonthlyProductId = process.env.CAKTO_MONTHLY_PRODUCT_ID?.trim() || null;
  const productMatch = configuredMonthlyProductId
    ? order.product.id === configuredMonthlyProductId
    : normalizedProductName === "nutri-ai mensal";
  const gameSpotCorrelationVerified =
    checkoutAttemptMatch ||
    (gameSpotEmailMatch && productMatch && Boolean(order.subscription));

  process.stdout.write(`${JSON.stringify({
    CAKTO_TOKEN_GENERATED: "SIM",
    CAKTO_TOKEN_HTTP_STATUS: 200,
    CAKTO_API_AUTHENTICATED: "SIM",
    CAKTO_API_HTTP_STATUS: 200,
    ORDER_FOUND: "SIM",
    ORDER_HTTP_STATUS: 200,
    ORDER_PAYMENT_STATUS: order.status,
    ORDER_DATE_MATCH: order.paidAt?.startsWith("2026-09-12") ? "SIM" : "NAO",
    ORDER_SUBSCRIPTION_ID_FOUND: order.subscription ? "SIM" : "NAO",
    ORDER_SCK_FOUND: order.sck ? "SIM" : "NAO",
    ORDER_PRODUCT_FOUND: order.product.id ? "SIM" : "NAO",
    ORDER_OFFER_FOUND: order.offer?.id ? "SIM" : "NAO",
    ORDER_CUSTOMER_FOUND: order.customer ? "SIM" : "NAO",
    GAMESPOT_EMAIL_MATCH: order.customer?.email ? (gameSpotEmailMatch ? "SIM" : "NAO") : "NAO_VERIFICAVEL",
    GAMESPOT_SCK_MATCH: order.sck ? (gameSpotSckMatch ? "SIM" : "NAO") : "NAO_VERIFICAVEL",
    PRODUCT_MATCH: order.product.name || configuredMonthlyProductId ? (productMatch ? "SIM" : "NAO") : "NAO_VERIFICAVEL",
    CHECKOUT_ATTEMPT_MATCH: order.sck ? (checkoutAttemptMatch ? "SIM" : "NAO") : "NAO_VERIFICAVEL",
    SUBSCRIPTION_REFERENCE_FOUND: order.subscription ? "SIM" : "NAO",
    GAMESPOT_CORRELATION_VERIFIED: gameSpotCorrelationVerified ? "SIM" : "NAO",
  }, null, 2)}\n`);
}

async function runDirectly(): Promise<void> {
  try {
    await run();
  } catch (error: unknown) {
    const result = error instanceof CaktoApiError
      ? { error: error.code, httpStatus: error.providerStatus }
      : { error: error instanceof Error ? error.message : "CAKTO_AUDIT_FAILED" };
    process.stderr.write(`${JSON.stringify(result)}\n`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) await runDirectly();
