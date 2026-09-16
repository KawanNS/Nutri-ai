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

interface ControlledCheckoutTransaction {
  user: {
    findUnique(args: {
      where: { id: string };
      select: { id: true; status: true };
    }): Promise<{ id: string; status: "ACTIVE" | "BLOCKED" } | null>;
  };
  checkoutAttempt: CheckoutAttemptPersistence & {
    findFirst(args: {
      where: {
        userId: string;
        plan: SubscriptionPlan;
        status: "PENDING";
        expiresAt: { gt: Date };
      };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
}

interface ControlledCheckoutClient {
  $transaction<T>(
    operation: (transaction: ControlledCheckoutTransaction) => Promise<T>,
    options: { isolationLevel: "Serializable" },
  ): Promise<T>;
}

interface CheckoutPreparationDependencies {
  controlledEnabled?: boolean;
  controlledUserId?: string;
  client?: ControlledCheckoutClient;
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

function isTransactionConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

export async function prepareCheckout(
  userId: string,
  plan: SubscriptionPlan,
  dependencies: CheckoutPreparationDependencies = {},
) {
  getConfiguredCheckoutUrl(plan);

  const controlledEnabled =
    dependencies.controlledEnabled ?? env.controlledCheckoutEnabled;
  if (!controlledEnabled) {
    throw new BillingError(
      503,
      "CHECKOUT_CORRELATION_NOT_VERIFIED",
      "Checkout is temporarily unavailable while secure account association is finalized",
    );
  }

  const controlledUserId =
    dependencies.controlledUserId ?? env.controlledCheckoutUserId;
  if (!controlledUserId || userId !== controlledUserId) {
    throw new BillingError(
      403,
      "CONTROLLED_CHECKOUT_USER_NOT_ALLOWED",
      "This account is not allowed to use the controlled checkout",
    );
  }

  if (plan !== "MONTHLY") {
    throw new BillingError(
      403,
      "CONTROLLED_CHECKOUT_MONTHLY_ONLY",
      "Only the monthly plan is available for the controlled checkout",
    );
  }

  const client: ControlledCheckoutClient =
    dependencies.client ?? (prisma as unknown as ControlledCheckoutClient);
  const now = dependencies.now?.() ?? new Date();

  try {
    return await client.$transaction(
      async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { id: userId },
          select: { id: true, status: true },
        });
        if (!user) {
          throw new BillingError(401, "AUTHENTICATED_USER_NOT_FOUND", "Authenticated user was not found");
        }
        if (user.status === "BLOCKED") {
          throw new BillingError(403, "AUTHENTICATED_USER_BLOCKED", "Authenticated user is blocked");
        }

        const activeAttempt = await transaction.checkoutAttempt.findFirst({
          where: {
            userId: user.id,
            plan: "MONTHLY",
            status: "PENDING",
            expiresAt: { gt: now },
          },
          select: { id: true },
        });
        if (activeAttempt) {
          throw new BillingError(
            409,
            "ACTIVE_CHECKOUT_ATTEMPT_EXISTS",
            "An active checkout attempt already exists",
          );
        }

        const result = await createCorrelatedCheckoutAttempt(user.id, "MONTHLY", {
          persistence: transaction.checkoutAttempt,
          now: () => now,
          generateToken: dependencies.generateToken,
        });
        return { checkoutUrl: result.checkoutUrl };
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error: unknown) {
    if (isTransactionConflict(error)) {
      throw new BillingError(
        409,
        "CHECKOUT_ATTEMPT_CONFLICT",
        "A concurrent checkout attempt already exists",
      );
    }
    throw error;
  }
}
