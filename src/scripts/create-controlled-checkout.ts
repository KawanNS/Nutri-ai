import { pathToFileURL } from "node:url";

import jwt, { type JwtPayload } from "jsonwebtoken";
import { z } from "zod";

import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { subscriptionPlanSchema } from "../schemas/billing.schema.js";
import {
  createCorrelatedCheckoutAttempt,
  getConfiguredCheckoutUrl,
} from "../services/billing.service.js";

const ENABLE_ENVIRONMENT_VARIABLE = "NUTRI_CONTROLLED_CHECKOUT";
const JWT_ENVIRONMENT_VARIABLE = "NUTRI_CONTROLLED_CHECKOUT_JWT";
const CONFIRMATION_FLAG = "--confirm-create-one-attempt";
const PLAN_FLAG = "--plan";
const userIdSchema = z.string().uuid();

class ControlledCheckoutError extends Error {}

function parsePlan(arguments_: string[]) {
  let planInput: string | undefined;
  let confirmed = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === CONFIRMATION_FLAG) {
      if (confirmed) {
        throw new ControlledCheckoutError("Confirmation flag must be provided exactly once");
      }
      confirmed = true;
      continue;
    }

    if (argument === PLAN_FLAG) {
      if (planInput !== undefined) {
        throw new ControlledCheckoutError("Plan must be provided exactly once");
      }
      planInput = arguments_[index + 1];
      index += 1;
      continue;
    }

    throw new ControlledCheckoutError("Unsupported controlled checkout argument");
  }

  if (!confirmed) {
    throw new ControlledCheckoutError(`Missing required ${CONFIRMATION_FLAG} flag`);
  }

  const plan = subscriptionPlanSchema.safeParse(planInput);
  if (!plan.success) {
    throw new ControlledCheckoutError("Invalid subscription plan");
  }

  return plan.data;
}

function assertLocalExecution(): void {
  if (process.env.NODE_ENV?.trim().toLowerCase() === "production") {
    throw new ControlledCheckoutError("Controlled checkout is disabled in production");
  }

  if (process.env.CI !== undefined) {
    throw new ControlledCheckoutError("Controlled checkout is disabled in CI");
  }

  if (process.env[ENABLE_ENVIRONMENT_VARIABLE] !== "1") {
    throw new ControlledCheckoutError(
      `Set ${ENABLE_ENVIRONMENT_VARIABLE}=1 explicitly to enable controlled checkout`,
    );
  }
}

function verifyUserId(token: string): string {
  let payload: string | JwtPayload;

  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new ControlledCheckoutError("Invalid or expired authentication token");
  }

  const userId = userIdSchema.safeParse(typeof payload === "string" ? undefined : payload.sub);
  if (!userId.success) {
    throw new ControlledCheckoutError("Invalid authentication token subject");
  }

  return userId.data;
}

async function createControlledCheckout(arguments_: string[]): Promise<string> {
  const authenticationToken = process.env[JWT_ENVIRONMENT_VARIABLE];
  delete process.env[JWT_ENVIRONMENT_VARIABLE];

  assertLocalExecution();

  if (!authenticationToken?.trim()) {
    throw new ControlledCheckoutError(`Set ${JWT_ENVIRONMENT_VARIABLE} in the local process environment`);
  }

  const plan = parsePlan(arguments_);
  const userId = verifyUserId(authenticationToken.trim());
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true },
  });

  if (!user) {
    throw new ControlledCheckoutError("Authenticated user was not found");
  }

  if (user.status === "BLOCKED") {
    throw new ControlledCheckoutError("Authenticated user is blocked");
  }

  getConfiguredCheckoutUrl(plan);
  const now = new Date();

  const result = await prisma.$transaction(
    async (transaction) => {
      const activeAttempt = await transaction.checkoutAttempt.findFirst({
        where: {
          userId: user.id,
          status: "PENDING",
          expiresAt: { gt: now },
        },
        select: { id: true },
      });

      if (activeAttempt) {
        throw new ControlledCheckoutError(
          "An unexpired pending checkout attempt already exists for this user",
        );
      }

      return createCorrelatedCheckoutAttempt(user.id, plan, {
        persistence: transaction.checkoutAttempt,
        now: () => now,
      });
    },
    { isolationLevel: "Serializable" },
  );

  return result.checkoutUrl;
}

async function runDirectly(): Promise<void> {
  try {
    const checkoutUrl = await createControlledCheckout(process.argv.slice(2));
    process.stdout.write(`${checkoutUrl}\n`);
  } catch (error: unknown) {
    const message =
      error instanceof ControlledCheckoutError
        ? error.message
        : "Controlled checkout preparation failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  } finally {
    try {
      await prisma.$disconnect();
    } catch {
      process.stderr.write("Failed to disconnect the database client cleanly\n");
      process.exitCode = 1;
    }
  }
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  await runDirectly();
}
