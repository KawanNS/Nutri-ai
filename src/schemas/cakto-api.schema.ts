import { z } from "zod";

const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;

const caktoApiIdentifierSchema = z.string().min(1).max(255);
const caktoApiStringSchema = z.string().min(1);
const caktoApiOptionalIntegerSchema = z
  .number()
  .int()
  .min(INT32_MIN)
  .max(INT32_MAX)
  .optional();
const caktoApiNullableIntegerSchema = z
  .number()
  .int()
  .min(INT32_MIN)
  .max(INT32_MAX)
  .nullable()
  .optional();
const caktoApiDateTimeSchema = z.iso.datetime({ offset: true });
const caktoApiNullableDateTimeSchema = caktoApiDateTimeSchema.nullable().optional();
const caktoApiDecimalStringSchema = z
  .string()
  .min(1)
  .regex(/^-?\d{0,8}(?:\.\d{0,2})?$/);

export const caktoApiOrderStatusSchema = z.enum([
  "processing",
  "authorized",
  "paid",
  "refund_requested",
  "in_settlement",
  "acquirer_error",
  "refunded",
  "waiting_payment",
  "refused",
  "blocked",
  "chargedback",
  "canceled",
  "in_protest",
  "partially_paid",
  "prechargeback",
  "scheduled",
  "retrying",
  "MED",
]);
export const caktoApiOrderTypeSchema = z.enum(["unique", "subscription"]);

export const caktoApiProductReferenceSchema = z
  .object({
    id: caktoApiIdentifierSchema,
  })
  .strip();

export const caktoApiOrderSchema = z
  .object({
    id: caktoApiIdentifierSchema,
    refId: z.string().min(1).max(255).optional(),
    status: caktoApiOrderStatusSchema,
    type: caktoApiOrderTypeSchema,
    product: caktoApiProductReferenceSchema,
    checkout: caktoApiNullableIntegerSchema,
    subscription: caktoApiStringSchema.nullable().optional(),
    subscription_period: caktoApiNullableIntegerSchema,
    paidAt: caktoApiNullableDateTimeSchema,
    refundedAt: caktoApiNullableDateTimeSchema,
    chargedbackAt: caktoApiNullableDateTimeSchema,
    canceledAt: caktoApiNullableDateTimeSchema,
    sck: z.string().max(255).nullable().optional(),
    checkoutUrl: z.string().nullable().optional(),
  })
  .strip();

export const caktoApiOfferTypeSchema = z.enum(["unique", "subscription"]);
export const caktoApiOfferIntervalTypeSchema = z.enum(["week", "month", "year", "lifetime"]);
export const caktoApiOfferStatusSchema = z.enum(["active", "disabled", "deleted"]);
export const caktoApiOfferCurrencySchema = z.enum([
  "BRL",
  "EUR",
  "MXN",
  "PEN",
  "USD",
  "CLP",
  "COP",
  "ARS",
  "BOB",
  "UYU",
]);

export const caktoApiOfferSchema = z
  .object({
    id: caktoApiStringSchema,
    name: z.string().min(1).max(255),
    price: z.number().finite(),
    default: z.boolean(),
    currency: caktoApiOfferCurrencySchema.optional(),
    product: caktoApiStringSchema,
    status: caktoApiOfferStatusSchema.optional(),
    type: caktoApiOfferTypeSchema.optional(),
    intervalType: caktoApiOfferIntervalTypeSchema.optional(),
    interval: caktoApiOptionalIntegerSchema,
    recurrence_period: caktoApiOptionalIntegerSchema,
    quantity_recurrences: caktoApiOptionalIntegerSchema,
    trial_days: caktoApiOptionalIntegerSchema,
  })
  .strip();

export const caktoApiSubscriptionStatusSchema = z.enum([
  "active",
  "inactive",
  "canceled",
  "expired",
  "paused",
  "trial",
]);

export const caktoApiSubscriptionSchema = z
  .object({
    amount: caktoApiDecimalStringSchema,
    parent_order: caktoApiStringSchema,
    paymentMethod: caktoApiStringSchema,
    customer: caktoApiStringSchema,
    product: caktoApiStringSchema,
    offer: caktoApiStringSchema,
    orders: z.array(caktoApiStringSchema),
    createdAt: caktoApiDateTimeSchema,
    updatedAt: caktoApiDateTimeSchema,
    id: caktoApiIdentifierSchema,
    status: caktoApiSubscriptionStatusSchema,
    current_period: caktoApiOptionalIntegerSchema,
    recurrence_period: caktoApiOptionalIntegerSchema,
    quantity_recurrences: caktoApiOptionalIntegerSchema,
    trial_days: caktoApiOptionalIntegerSchema,
    max_retries: caktoApiOptionalIntegerSchema,
    retry_interval: caktoApiOptionalIntegerSchema,
    paid_payments_quantity: caktoApiOptionalIntegerSchema,
    retention: z.string().optional(),
    next_payment_date: caktoApiNullableDateTimeSchema,
    canceledAt: caktoApiNullableDateTimeSchema,
  })
  .strip();

export const caktoApiBillingAttemptResultSchema = z.enum(["success", "failure"]);

export const caktoApiBillingAttemptSchema = z
  .object({
    id: z.uuid(),
    attempt_number: z.number().int(),
    amount: z.string(),
    result: caktoApiBillingAttemptResultSchema,
    failure_reason: z.string().nullable(),
    scheduled_for: caktoApiDateTimeSchema,
    started_at: caktoApiDateTimeSchema,
    completed_at: caktoApiDateTimeSchema,
    created_at: caktoApiDateTimeSchema,
  })
  .strip();

export const caktoApiBillingCycleSchema = z
  .object({
    id: z.uuid(),
    cycle_number: z.number().int(),
    due_date: caktoApiDateTimeSchema,
    amount: z.string(),
    status: z.string().min(1),
    total_attempts: z.number().int(),
    created_at: caktoApiDateTimeSchema,
    attempts: z.array(caktoApiBillingAttemptSchema),
    completed_at: caktoApiDateTimeSchema.nullable(),
  })
  .strip();

export type CaktoApiOrder = z.infer<typeof caktoApiOrderSchema>;
export type CaktoApiOffer = z.infer<typeof caktoApiOfferSchema>;
export type CaktoApiSubscription = z.infer<typeof caktoApiSubscriptionSchema>;
export type CaktoApiBillingCycle = z.infer<typeof caktoApiBillingCycleSchema>;
export type CaktoApiBillingAttempt = z.infer<typeof caktoApiBillingAttemptSchema>;
