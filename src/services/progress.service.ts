import { prisma } from "../lib/prisma.js";
import type {
  CreateProgressEntryInput,
  ProgressListQuery,
} from "../schemas/progress.schema.js";

interface ProgressEntryRecord {
  id: string;
  userId: string;
  weightKg: { toFixed(decimalPlaces: number): string };
  recordedAt: Date;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProgressEntryStore {
  create(args: Record<string, unknown>): Promise<ProgressEntryRecord>;
  findFirst(args: Record<string, unknown>): Promise<ProgressEntryRecord | null>;
  findMany(args: Record<string, unknown>): Promise<ProgressEntryRecord[]>;
}

const progressEntrySelect = {
  id: true,
  userId: true,
  weightKg: true,
  recordedAt: true,
  note: true,
  createdAt: true,
  updatedAt: true,
} as const;

const defaultStore = prisma.progressEntry as unknown as ProgressEntryStore;

export class ProgressError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function serializeProgressEntry(entry: ProgressEntryRecord) {
  return {
    id: entry.id,
    weightKg: entry.weightKg.toFixed(2),
    recordedAt: entry.recordedAt.toISOString().slice(0, 10),
    note: entry.note,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export async function createProgressEntry(
  userId: string,
  input: CreateProgressEntryInput,
  store: ProgressEntryStore = defaultStore,
) {
  const entry = await store.create({
    data: { userId, ...input },
    select: progressEntrySelect,
  });
  return serializeProgressEntry(entry);
}

export async function listProgressEntries(
  userId: string,
  options: ProgressListQuery,
  store: ProgressEntryStore = defaultStore,
) {
  if (options.cursor) {
    const cursor = await store.findFirst({
      where: { id: options.cursor, userId },
      select: { id: true },
    });
    if (!cursor) {
      throw new ProgressError(400, "INVALID_PROGRESS_CURSOR", "Invalid progress cursor");
    }
  }

  const entries = await store.findMany({
    where: { userId },
    orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: options.limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: progressEntrySelect,
  });
  const hasNextPage = entries.length > options.limit;
  const page = hasNextPage ? entries.slice(0, options.limit) : entries;
  return {
    progressEntries: page.map(serializeProgressEntry),
    nextCursor: hasNextPage ? page.at(-1)?.id ?? null : null,
  };
}

export async function getProgressEntry(
  userId: string,
  progressEntryId: string,
  store: ProgressEntryStore = defaultStore,
) {
  const entry = await store.findFirst({
    where: { id: progressEntryId, userId },
    select: progressEntrySelect,
  });
  if (!entry) {
    throw new ProgressError(
      404,
      "PROGRESS_ENTRY_NOT_FOUND",
      "Progress entry not found",
    );
  }
  return serializeProgressEntry(entry);
}
