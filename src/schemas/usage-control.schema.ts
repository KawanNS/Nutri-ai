import { z } from "zod";

export const usageActionSchema = z.enum([
  "PLAN_GENERATION",
  "RELEVANT_REGENERATION",
]);

export const idempotencyKeySchema = z
  .string({ error: "Idempotency-Key is required" })
  .uuid("Idempotency-Key must be a valid UUID");

export const billableUsageSchema = z
  .object({
    action: usageActionSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type BillableUsageInput = z.infer<typeof billableUsageSchema>;
