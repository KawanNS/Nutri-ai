import { prisma } from "../lib/prisma.js";

export const FUNNEL_PERIODS = [7, 14, 30] as const;
export type FunnelPeriod = (typeof FUNNEL_PERIODS)[number];

// Brazil has had no daylight saving time since 2019, so São Paulo days are a fixed UTC-3.
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LATEST_ACCOUNTS = 10;

interface DayCount { day: string; count: number }

/** The São Paulo calendar days of the period, oldest first, ending today. */
export function funnelDays(periodDays: FunnelPeriod, now: Date): string[] {
  const today = new Date(now.getTime() - SAO_PAULO_OFFSET_MS);
  return Array.from({ length: periodDays }, (_, index) =>
    new Date(today.getTime() - (periodDays - 1 - index) * DAY_MS).toISOString().slice(0, 10));
}

const sum = (rows: DayCount[]) => rows.reduce((total, row) => total + row.count, 0);

/** Previews and new accounts per ?origem= tag; empty while the AcquisitionEvent table does not exist yet. */
async function countBySource(since: Date) {
  try {
    const rows = await prisma.acquisitionEvent.groupBy({
      by: ["source", "kind"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });
    const sources = new Map<string, { source: string; previews: number; accounts: number }>();
    for (const row of rows) {
      const entry = sources.get(row.source) ?? { source: row.source, previews: 0, accounts: 0 };
      if (row.kind === "PREVIEW") entry.previews += row._count._all;
      else entry.accounts += row._count._all;
      sources.set(row.source, entry);
    }
    return [...sources.values()].sort((a, b) => b.previews + b.accounts - (a.previews + a.accounts));
  } catch {
    return [];
  }
}

/**
 * Where people drop off, for the owner: previews (anonymous, counted from the AI usage log the preview
 * already writes), accounts, profiles, first plans, checkout and subscriptions. Read-only; no emails.
 */
export async function getAdminFunnel(periodDays: FunnelPeriod, now = new Date()) {
  const days = funnelDays(periodDays, now);
  const since = new Date(`${days[0]}T00:00:00-03:00`);
  const day = (rows: Array<{ day: string; count: number | bigint }>): DayCount[] =>
    rows.map((row) => ({ day: row.day, count: Number(row.count) }));

  const [previews, previewFailures, accounts, profiles, firstPlans, checkouts, subscriptions] = await Promise.all([
    prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
      select to_char(("startedAt" at time zone 'UTC') at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as day, count(*) as count
      from "AiUsageEvent" where task = 'MEAL_PLAN_PREVIEW' and success and "startedAt" >= ${since} group by 1`,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      select count(*) as count from "AiUsageEvent" where task = 'MEAL_PLAN_PREVIEW' and not success and "startedAt" >= ${since}`,
    prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
      select to_char(("createdAt" at time zone 'UTC') at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as day, count(*) as count
      from "User" where role = 'USER' and "createdAt" >= ${since} group by 1`,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      select count(*) as count from "Profile" p join "User" u on u.id = p."userId"
      where u.role = 'USER' and p."createdAt" >= ${since}`,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      select count(*) as count from (
        select min(m."createdAt") as first from "MealPlan" m join "User" u on u.id = m."userId"
        where u.role = 'USER' group by m."userId"
      ) firsts where first >= ${since}`,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      select count(distinct c."userId") as count from "CheckoutAttempt" c join "User" u on u.id = c."userId"
      where u.role = 'USER' and c."createdAt" >= ${since}`,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      select count(distinct s."userId") as count from "Subscription" s join "User" u on u.id = s."userId"
      where u.role = 'USER' and s.status = 'ACTIVE' and s."createdAt" >= ${since}`,
  ]);

  const previewDays = day(previews), accountDays = day(accounts);
  const sources = await countBySource(since);
  const latest = await prisma.user.findMany({
    where: { role: "USER" },
    orderBy: { createdAt: "desc" },
    take: LATEST_ACCOUNTS,
    select: {
      name: true,
      createdAt: true,
      profile: { select: { id: true } },
      _count: { select: { mealPlans: true, checkoutAttempts: true } },
      subscriptions: { where: { status: "ACTIVE", currentPeriodEnd: { gt: now } }, select: { id: true }, take: 1 },
    },
  });

  return {
    periodDays,
    since: since.toISOString(),
    totals: {
      previews: sum(previewDays),
      previewFailures: Number(previewFailures[0]?.count ?? 0),
      accounts: sum(accountDays),
      profiles: Number(profiles[0]?.count ?? 0),
      firstPlans: Number(firstPlans[0]?.count ?? 0),
      checkouts: Number(checkouts[0]?.count ?? 0),
      subscriptions: Number(subscriptions[0]?.count ?? 0),
    },
    days: days.map((date) => ({
      date,
      previews: previewDays.find((row) => row.day === date)?.count ?? 0,
      accounts: accountDays.find((row) => row.day === date)?.count ?? 0,
    })),
    sources,
    latestAccounts: latest.map((user) => ({
      name: user.name,
      createdAt: user.createdAt.toISOString(),
      hasProfile: user.profile !== null,
      mealPlans: user._count.mealPlans,
      checkoutAttempts: user._count.checkoutAttempts,
      isPremium: user.subscriptions.length > 0,
    })),
  };
}

export type AdminFunnel = Awaited<ReturnType<typeof getAdminFunnel>>;
