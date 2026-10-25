import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { FUNNEL_PERIODS, getAdminFunnel, type FunnelPeriod } from "../services/admin-funnel.service.js";

const funnelQuerySchema = z
  .object({
    days: z.coerce
      .number()
      .refine((value): value is FunnelPeriod => (FUNNEL_PERIODS as readonly number[]).includes(value))
      .default(14),
  })
  .strict();

export function createAdminFunnelController(getFunnel: typeof getAdminFunnel = getAdminFunnel) {
  return async (request: AuthenticatedRequest, response: Response): Promise<void> => {
    const query = funnelQuerySchema.safeParse(request.query);
    if (!query.success) {
      response.status(400).json({ error: "Invalid administrative request", code: "INVALID_FUNNEL_PERIOD" });
      return;
    }
    try {
      response.json({ funnel: await getFunnel(query.data.days as FunnelPeriod) });
    } catch (error: unknown) {
      console.error("[admin-funnel]", { errorType: error instanceof Error ? error.name : "UnknownError" });
      response.status(500).json({ error: "Funnel is temporarily unavailable", code: "FUNNEL_UNAVAILABLE" });
    }
  };
}

export const adminFunnelController = createAdminFunnelController();
