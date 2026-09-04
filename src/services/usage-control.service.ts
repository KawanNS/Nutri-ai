import { randomUUID } from "node:crypto";

import type {
  UsageAction,
  UsageStatus,
} from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import {
  getEffectiveSubscriptionAccess,
  serializeSubscriptionAccess,
} from "./subscription.service.js";

interface UsageCountersRow {
  freeUsesLimit: number;
  freeUsesConsumed: number;
  freeUsesReserved: number;
}

interface InsertedEventRow {
  id: string;
}

interface TransitionedEventRow {
  id: string;
  usageControlId: string;
  entitlement: "FREE" | "SUBSCRIPTION";
}

export class UsageControlError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function serializeUsage(usage: UsageCountersRow) {
  return {
    freeUsesLimit: usage.freeUsesLimit,
    freeUsesConsumed: usage.freeUsesConsumed,
    freeUsesReserved: usage.freeUsesReserved,
    freeUsesAvailable:
      usage.freeUsesLimit -
      usage.freeUsesConsumed -
      usage.freeUsesReserved,
  };
}

export async function getUsage(userId: string) {
  const [usage, subscription] = await Promise.all([
    prisma.usageControl.findUnique({
      where: { userId },
      select: {
        freeUsesLimit: true,
        freeUsesConsumed: true,
        freeUsesReserved: true,
      },
    }),
    getEffectiveSubscriptionAccess(userId),
  ]);

  if (!usage) {
    throw new UsageControlError(404, "USAGE_CONTROL_NOT_FOUND", "Usage control not found");
  }

  return {
    ...serializeUsage(usage),
    ...serializeSubscriptionAccess(subscription),
  };
}

export async function reserveUsage(
  userId: string,
  action: UsageAction,
  idempotencyKey: string,
) {
  return prisma.$transaction(async (transaction) => {
    const subscription = await transaction.subscription.findFirst({
      where: {
        userId,
        OR: [
          { status: "ACTIVE" },
          { status: "CANCELED", currentPeriodEnd: { gt: new Date() } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    const eventId = randomUUID();
    const inserted = await transaction.$queryRaw<InsertedEventRow[]>`
      INSERT INTO "UsageEvent" (
        "id",
        "userId",
        "usageControlId",
        "action",
        "status",
        "idempotencyKey",
        "entitlement",
        "subscriptionId",
        "createdAt"
      )
      SELECT
        ${eventId}::uuid,
        ${userId}::uuid,
        "id",
        ${action}::"UsageAction",
        'PENDING'::"UsageStatus",
        ${idempotencyKey},
        ${subscription ? "SUBSCRIPTION" : "FREE"}::"UsageEntitlement",
        ${subscription?.id ?? null}::uuid,
        CURRENT_TIMESTAMP
      FROM "UsageControl"
      WHERE "userId" = ${userId}::uuid
      ON CONFLICT ("userId", "idempotencyKey") DO NOTHING
      RETURNING "id"
    `;

    if (inserted.length === 0) {
      const existingEvent = await transaction.usageEvent.findUnique({
        where: {
          userId_idempotencyKey: { userId, idempotencyKey },
        },
      });

      if (!existingEvent) {
        throw new UsageControlError(
          404,
          "USAGE_CONTROL_NOT_FOUND",
          "Usage control not found",
        );
      }

      if (existingEvent.action !== action) {
        throw new UsageControlError(
          409,
          "IDEMPOTENCY_KEY_CONFLICT",
          "Idempotency key was already used with a different action",
        );
      }

      const usage = await transaction.usageControl.findUniqueOrThrow({
        where: { userId },
        select: {
          freeUsesLimit: true,
          freeUsesConsumed: true,
          freeUsesReserved: true,
        },
      });

      return {
        event: existingEvent,
        usage: serializeUsage(usage),
        reservationCreated: false,
      };
    }

    if (subscription) {
      const usage = await transaction.usageControl.findUniqueOrThrow({
        where: { userId },
        select: {
          freeUsesLimit: true,
          freeUsesConsumed: true,
          freeUsesReserved: true,
        },
      });
      const event = await transaction.usageEvent.findUniqueOrThrow({
        where: { id: inserted[0].id },
      });
      return { event, usage: serializeUsage(usage), reservationCreated: true };
    }

    const updatedUsage = await transaction.$queryRaw<UsageCountersRow[]>`
      UPDATE "UsageControl"
      SET
        "freeUsesReserved" = "freeUsesReserved" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId}::uuid
        AND "freeUsesConsumed" + "freeUsesReserved" < "freeUsesLimit"
      RETURNING
        "freeUsesLimit",
        "freeUsesConsumed",
        "freeUsesReserved"
    `;

    if (updatedUsage.length === 0) {
      throw new UsageControlError(
        402,
        "FREE_USAGE_LIMIT_REACHED",
        "Free usage limit reached",
      );
    }

    const event = await transaction.usageEvent.findUniqueOrThrow({
      where: { id: inserted[0].id },
    });

    return {
      event,
      usage: serializeUsage(updatedUsage[0]),
      reservationCreated: true,
    };
  });
}

async function finalizeUsage(
  userId: string,
  eventId: string,
  targetStatus: Exclude<UsageStatus, "PENDING">,
) {
  return prisma.$transaction(async (transaction) => {
    const transitioned = await transaction.$queryRaw<TransitionedEventRow[]>`
      UPDATE "UsageEvent"
      SET
        "status" = ${targetStatus}::"UsageStatus",
        "finalizedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${eventId}::uuid
        AND "userId" = ${userId}::uuid
        AND "status" = 'PENDING'::"UsageStatus"
      RETURNING "id", "usageControlId", "entitlement"
    `;

    if (transitioned.length === 0) {
      const existingEvent = await transaction.usageEvent.findFirst({
        where: { id: eventId, userId },
      });

      if (!existingEvent) {
        throw new UsageControlError(404, "USAGE_EVENT_NOT_FOUND", "Usage event not found");
      }

      if (existingEvent.status !== targetStatus) {
        throw new UsageControlError(
          409,
          "USAGE_EVENT_STATE_CONFLICT",
          `Usage event is already ${existingEvent.status}`,
        );
      }

      const usage = await transaction.usageControl.findUniqueOrThrow({
        where: { userId },
        select: {
          freeUsesLimit: true,
          freeUsesConsumed: true,
          freeUsesReserved: true,
        },
      });

      return { event: existingEvent, usage: serializeUsage(usage) };
    }

    const [transition] = transitioned;
    const updatedUsage = transition.entitlement === "SUBSCRIPTION"
      ? [await transaction.usageControl.findUniqueOrThrow({
          where: { userId },
          select: {
            freeUsesLimit: true,
            freeUsesConsumed: true,
            freeUsesReserved: true,
          },
        })]
      :
      targetStatus === "CONSUMED"
        ? await transaction.$queryRaw<UsageCountersRow[]>`
            UPDATE "UsageControl"
            SET
              "freeUsesReserved" = "freeUsesReserved" - 1,
              "freeUsesConsumed" = "freeUsesConsumed" + 1,
              "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${transition.usageControlId}::uuid
              AND "userId" = ${userId}::uuid
              AND "freeUsesReserved" > 0
            RETURNING
              "freeUsesLimit",
              "freeUsesConsumed",
              "freeUsesReserved"
          `
        : await transaction.$queryRaw<UsageCountersRow[]>`
            UPDATE "UsageControl"
            SET
              "freeUsesReserved" = "freeUsesReserved" - 1,
              "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${transition.usageControlId}::uuid
              AND "userId" = ${userId}::uuid
              AND "freeUsesReserved" > 0
            RETURNING
              "freeUsesLimit",
              "freeUsesConsumed",
              "freeUsesReserved"
          `;

    if (updatedUsage.length === 0) {
      throw new UsageControlError(
        500,
        "USAGE_COUNTER_INCONSISTENT",
        "Usage counters are inconsistent",
      );
    }

    const event = await transaction.usageEvent.findUniqueOrThrow({
      where: { id: transition.id },
    });

    return { event, usage: serializeUsage(updatedUsage[0]) };
  });
}

export function confirmUsage(userId: string, eventId: string) {
  return finalizeUsage(userId, eventId, "CONSUMED");
}

export function failUsage(userId: string, eventId: string) {
  return finalizeUsage(userId, eventId, "FAILED");
}

export function releaseUsage(userId: string, eventId: string) {
  return finalizeUsage(userId, eventId, "RELEASED");
}
