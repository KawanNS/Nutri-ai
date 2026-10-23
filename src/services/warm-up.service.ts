import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

/**
 * On the hosting plan, both this API and the AI gateway sleep when idle (~20-25 s to wake each),
 * and the first database query opens a fresh connection (~3 s). The site pings /health as soon as
 * it opens, so this uses that moment to wake the gateway and open the database connection too,
 * while the visitor is still reading or answering the questions.
 */
export const WARM_UP_INTERVAL_MS = 60_000;
const GATEWAY_WAKE_TIMEOUT_MS = 60_000;

interface WarmUpDependencies {
  now: () => number;
  wakeGateway: () => Promise<unknown>;
  openDatabaseConnection: () => Promise<unknown>;
}

/** Any HTTP request wakes a sleeping service; no credentials are sent and the answer is ignored. */
async function wakeGateway(): Promise<void> {
  const gateway = env.aiGatewayConfig;
  if (!gateway) return;
  await fetch(gateway.baseUrl, { method: "GET", signal: AbortSignal.timeout(GATEWAY_WAKE_TIMEOUT_MS) });
}

async function openDatabaseConnection(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

export function createWarmUp(dependencies: WarmUpDependencies = { now: Date.now, wakeGateway, openDatabaseConnection }) {
  let lastWarmUp = Number.NEGATIVE_INFINITY;
  /** Starts the warm-up in the background at most once a minute; returns whether it started. */
  return function warmUpDependencies(): boolean {
    const now = dependencies.now();
    if (now - lastWarmUp < WARM_UP_INTERVAL_MS) return false;
    lastWarmUp = now;
    void dependencies.wakeGateway().catch(() => { /* Only a wake-up call. */ });
    void dependencies.openDatabaseConnection().catch(() => { /* Only a wake-up call. */ });
    return true;
  };
}

export const warmUpDependencies = createWarmUp();
