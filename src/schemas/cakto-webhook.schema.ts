import { z } from "zod";

export const caktoKnownEventSchema = z.enum([
  "purchase_approved",
  "refund",
  "chargeback",
  "subscription_created",
  "subscription_renewed",
  "subscription_canceled",
]);

export const caktoWebhookEnvelopeSchema = z
  .object({
    secret: z.string().min(1),
    event: z.string().min(1).max(100),
    data: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export const caktoOrderDataSchema = z
  .object({
    id: z.string().min(1).max(255),
  })
  .passthrough();

export type CaktoWebhookEnvelope = z.infer<typeof caktoWebhookEnvelopeSchema>;
