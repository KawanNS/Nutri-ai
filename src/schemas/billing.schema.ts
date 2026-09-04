import { z } from "zod";

export const subscriptionPlanSchema = z.enum(["MONTHLY", "QUARTERLY", "ANNUAL"]);

export const checkoutBodySchema = z
  .object({ plan: subscriptionPlanSchema })
  .strict();

export type CheckoutInput = z.infer<typeof checkoutBodySchema>;
