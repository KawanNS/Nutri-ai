import assert from "node:assert/strict";
import test from "node:test";

import {
  createProgressEntrySchema,
  progressEntryIdSchema,
  progressListQuerySchema,
} from "../dist/schemas/progress.schema.js";
import {
  createProgressEntry,
  getProgressEntry,
  listProgressEntries,
  ProgressError,
  serializeProgressEntry,
} from "../dist/services/progress.service.js";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const entryId = "33333333-3333-4333-8333-333333333333";
const cursorId = "44444444-4444-4444-8444-444444444444";

function validPayload(overrides = {}) {
  return {
    weightKg: "72.50",
    recordedAt: "2026-08-27",
    note: "Synthetic local test",
    ...overrides,
  };
}

function decimal(value) {
  return { toFixed: (places) => Number(value).toFixed(places) };
}

function record(overrides = {}) {
  return {
    id: entryId,
    userId,
    weightKg: decimal(72.5),
    recordedAt: new Date("2026-08-27T00:00:00.000Z"),
    note: null,
    createdAt: new Date("2026-08-27T12:00:00.000Z"),
    updatedAt: new Date("2026-08-27T12:30:00.000Z"),
    ...overrides,
  };
}

test("accepts a valid POST payload with weightKg as a string", () => {
  assert.equal(createProgressEntrySchema.safeParse(validPayload()).success, true);
});

test("accepts a valid POST payload with weightKg as a number", () => {
  assert.equal(createProgressEntrySchema.safeParse(validPayload({ weightKg: 72.5 })).success, true);
});

test("rejects zero weight", () => {
  assert.equal(createProgressEntrySchema.safeParse(validPayload({ weightKg: 0 })).success, false);
});

test("rejects negative weight", () => {
  assert.equal(createProgressEntrySchema.safeParse(validPayload({ weightKg: -1 })).success, false);
});

test("rejects weight above the database maximum", () => {
  assert.equal(createProgressEntrySchema.safeParse(validPayload({ weightKg: "10000.00" })).success, false);
});

test("rejects weight with more than two decimal places", () => {
  assert.equal(createProgressEntrySchema.safeParse(validPayload({ weightKg: "72.501" })).success, false);
});

test("accepts a real civil date", () => {
  const result = createProgressEntrySchema.safeParse(validPayload({ recordedAt: "2024-02-29" }));
  assert.equal(result.success, true);
  assert.equal(result.data.recordedAt.toISOString(), "2024-02-29T00:00:00.000Z");
});

test("rejects an impossible civil date", () => {
  assert.equal(createProgressEntrySchema.safeParse(validPayload({ recordedAt: "2026-02-30" })).success, false);
});

test("rejects a future civil date", () => {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  assert.equal(createProgressEntrySchema.safeParse(validPayload({ recordedAt: tomorrow })).success, false);
});

test("normalizes an absent note to null", () => {
  const { note: _note, ...payload } = validPayload();
  const result = createProgressEntrySchema.parse(payload);
  assert.equal(result.note, null);
});

test("accepts a null note", () => {
  assert.equal(createProgressEntrySchema.parse(validPayload({ note: null })).note, null);
});

test("accepts and trims a valid note", () => {
  assert.equal(createProgressEntrySchema.parse(validPayload({ note: "  note  " })).note, "note");
});

test("normalizes an empty note to null", () => {
  assert.equal(createProgressEntrySchema.parse(validPayload({ note: "   " })).note, null);
});

test("rejects a note above 1000 characters", () => {
  assert.equal(createProgressEntrySchema.safeParse(validPayload({ note: "x".repeat(1001) })).success, false);
});

test("rejects extra body properties", () => {
  assert.equal(createProgressEntrySchema.safeParse(validPayload({ extra: true })).success, false);
});

test("rejects userId in the body", () => {
  assert.equal(createProgressEntrySchema.safeParse(validPayload({ userId })).success, false);
});

test("rejects an invalid progress entry UUID", () => {
  assert.equal(progressEntryIdSchema.safeParse("not-a-uuid").success, false);
});

test("applies the default page limit", () => {
  assert.deepEqual(progressListQuerySchema.parse({}), { limit: 20 });
});

test("rejects invalid pagination limits", () => {
  for (const limit of ["0", "51", "1.5", "invalid"]) {
    assert.equal(progressListQuerySchema.safeParse({ limit }).success, false);
  }
});

test("rejects an invalid pagination cursor", () => {
  assert.equal(progressListQuerySchema.safeParse({ cursor: "not-a-uuid" }).success, false);
});

test("serializes Decimal and civil date without returning userId", () => {
  const serialized = serializeProgressEntry(record());
  assert.equal(serialized.weightKg, "72.50");
  assert.equal(serialized.recordedAt, "2026-08-27");
  assert.equal(Object.hasOwn(serialized, "userId"), false);
});

test("create obtains userId exclusively from the service argument", async () => {
  let createArgs;
  const store = {
    create: async (args) => {
      createArgs = args;
      return record();
    },
  };
  const input = createProgressEntrySchema.parse(validPayload());
  const result = await createProgressEntry(userId, input, store);
  assert.equal(createArgs.data.userId, userId);
  assert.equal(Object.hasOwn(result, "userId"), false);
});

test("list applies ownership and deterministic descending ordering", async () => {
  let findManyArgs;
  const store = {
    findFirst: async () => record({ id: cursorId }),
    findMany: async (args) => {
      findManyArgs = args;
      return [record()];
    },
  };
  await listProgressEntries(userId, { limit: 20 }, store);
  assert.deepEqual(findManyArgs.where, { userId });
  assert.deepEqual(findManyArgs.orderBy, [
    { recordedAt: "desc" },
    { createdAt: "desc" },
    { id: "desc" },
  ]);
  assert.equal(findManyArgs.take, 21);
});

test("list pagination returns a deterministic next cursor", async () => {
  const secondId = "55555555-5555-4555-8555-555555555555";
  const store = {
    findFirst: async () => record({ id: cursorId }),
    findMany: async () => [record(), record({ id: secondId })],
  };
  const result = await listProgressEntries(userId, { limit: 1 }, store);
  assert.equal(result.progressEntries.length, 1);
  assert.equal(result.nextCursor, entryId);
});

test("owned cursor is checked by id and userId before pagination", async () => {
  const calls = [];
  const store = {
    findFirst: async (args) => {
      calls.push(args);
      return record({ id: cursorId });
    },
    findMany: async (args) => {
      calls.push(args);
      return [];
    },
  };
  await listProgressEntries(userId, { cursor: cursorId, limit: 20 }, store);
  assert.deepEqual(calls[0].where, { id: cursorId, userId });
  assert.deepEqual(calls[1].cursor, { id: cursorId });
  assert.equal(calls[1].skip, 1);
});

test("foreign cursor is rejected without querying or leaking entries", async () => {
  let findManyCalled = false;
  const store = {
    findFirst: async (args) => {
      assert.deepEqual(args.where, { id: cursorId, userId });
      return null;
    },
    findMany: async () => {
      findManyCalled = true;
      return [record({ userId: otherUserId })];
    },
  };
  await assert.rejects(
    listProgressEntries(userId, { cursor: cursorId, limit: 20 }, store),
    (error) => error instanceof ProgressError
      && error.statusCode === 400
      && error.code === "INVALID_PROGRESS_CURSOR",
  );
  assert.equal(findManyCalled, false);
});

test("individual lookup applies id and user ownership together", async () => {
  let lookupArgs;
  const store = {
    findFirst: async (args) => {
      lookupArgs = args;
      return record();
    },
  };
  const result = await getProgressEntry(userId, entryId, store);
  assert.deepEqual(lookupArgs.where, { id: entryId, userId });
  assert.equal(Object.hasOwn(result, "userId"), false);
});

test("missing and foreign individual entries share the same 404", async () => {
  for (const scenario of ["missing", "foreign"]) {
    const store = { findFirst: async () => null };
    await assert.rejects(
      getProgressEntry(userId, entryId, store),
      (error) => error instanceof ProgressError
        && error.statusCode === 404
        && error.code === "PROGRESS_ENTRY_NOT_FOUND"
        && error.message === "Progress entry not found",
      scenario,
    );
  }
});
