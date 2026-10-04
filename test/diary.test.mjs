import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { listFoodLogsController } from "../dist/controllers/food-log.controller.js";
import { foodLogListQuerySchema } from "../dist/schemas/food-log.schema.js";
import { listFoodLogs } from "../dist/services/food-log.service.js";
import { confirmMealPhotoLog } from "../dist/services/meal-photo.service.js";

function responseRecorder() {
  const output = {};
  return {
    output,
    response: {
      status(code) { output.status = code; return this; },
      json(body) { output.body = body; return this; },
    },
  };
}

function fakeFoodLogStore() {
  const logs = [];
  let sequence = 0;
  const foodLog = {
    async create({ data }) {
      const id = `log-${++sequence}`;
      const createdAt = new Date("2026-10-02T12:00:00.000Z");
      const items = data.items.create.map((item, position) => ({
        id: `${id}-item-${position + 1}`,
        foodLogId: id,
        ...item,
      }));
      const row = {
        id,
        userId: data.userId,
        consumedAt: data.consumedAt ?? createdAt,
        estimatedCaloriesKcal: data.estimatedCaloriesKcal,
        estimatedProteinGrams: data.estimatedProteinGrams,
        estimatedCarbohydrateGrams: data.estimatedCarbohydrateGrams,
        estimatedFatGrams: data.estimatedFatGrams,
        notes: data.notes,
        uncertaintyNotes: data.uncertaintyNotes,
        confirmedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
        items,
      };
      logs.push(row);
      return row;
    },
    async findMany({ where }) {
      return logs
        .filter((row) => row.userId === where.userId && row.consumedAt >= where.consumedAt.gte && row.consumedAt < where.consumedAt.lt)
        .sort((a, b) => a.consumedAt - b.consumedAt || a.id.localeCompare(b.id));
    },
  };
  return { logs, client: { foodLog }, store: foodLog };
}

function confirmation(consumedAt, name = "Arroz") {
  return {
    consumedAt,
    foods: [{
      name,
      portionDescription: "1 porção",
      estimatedCaloriesKcal: 130,
      estimatedProteinGrams: 2.5,
      estimatedCarbohydrateGrams: 28,
      estimatedFatGrams: null,
      confidence: "MEDIUM",
      limitations: [],
    }],
    notes: "Registro confirmado",
    uncertaintyNotes: [],
  };
}

test("food log list query validates civil date and timezone offset", () => {
  assert.equal(foodLogListQuerySchema.safeParse({ date: "2026-10-02", timezoneOffsetMinutes: "180" }).success, true);
  assert.equal(foodLogListQuerySchema.safeParse({ date: "2026-02-30" }).success, false);
  assert.equal(foodLogListQuerySchema.safeParse({ date: "02/10/2026" }).success, false);
  assert.equal(foodLogListQuerySchema.safeParse({ date: "2026-10-02", timezoneOffsetMinutes: "841" }).success, false);
});

test("diary listing requires authentication and rejects an invalid date", async () => {
  const unauthenticated = responseRecorder();
  await listFoodLogsController({ query: { date: "2026-10-02" } }, unauthenticated.response);
  assert.equal(unauthenticated.output.status, 401);

  const invalid = responseRecorder();
  await listFoodLogsController({ auth: { userId: "user-a" }, query: { date: "invalid" } }, invalid.response);
  assert.equal(invalid.output.status, 400);
  assert.equal(invalid.output.body.code, "INVALID_FOOD_LOG_QUERY");
});

test("list filters by authenticated user and local day, orders chronologically, and nests the correct items", async () => {
  const database = fakeFoodLogStore();
  await confirmMealPhotoLog("user-a", confirmation("2026-10-02T18:30:00.000Z", "Feijão"), { client: database.client });
  await confirmMealPhotoLog("user-b", confirmation("2026-10-02T17:00:00.000Z", "Registro privado"), { client: database.client });
  await confirmMealPhotoLog("user-a", confirmation("2026-10-02T13:15:00.000Z", "Arroz"), { client: database.client });
  await confirmMealPhotoLog("user-a", confirmation("2026-10-03T04:00:00.000Z", "Dia seguinte"), { client: database.client });

  const result = await listFoodLogs("user-a", { date: "2026-10-02", timezoneOffsetMinutes: 180 }, database.store);
  assert.deepEqual(result.foodLogs.map((row) => row.items[0].name), ["Arroz", "Feijão"]);
  assert.ok(result.foodLogs.every((row) => !Object.hasOwn(row, "userId")));
  assert.ok(result.foodLogs.every((row) => row.items.every((item) => item.id.startsWith(`${row.id}-item-`))));
});

test("empty day returns an empty collection without synthetic records", async () => {
  const database = fakeFoodLogStore();
  const result = await listFoodLogs("user-a", { date: "2026-10-01", timezoneOffsetMinutes: 180 }, database.store);
  assert.deepEqual(result, { date: "2026-10-01", foodLogs: [] });
});

test("a FoodLog created by meal-photo confirmation appears through the diary data source", async () => {
  const database = fakeFoodLogStore();
  const confirmed = await confirmMealPhotoLog("user-a", confirmation("2026-10-02T15:00:00.000Z", "Frango grelhado"), { client: database.client });
  const diary = await listFoodLogs("user-a", { date: "2026-10-02", timezoneOffsetMinutes: 180 }, database.store);
  assert.equal(diary.foodLogs[0].id, confirmed.id);
  assert.equal(diary.foodLogs[0].items[0].name, "Frango grelhado");
  assert.equal(diary.foodLogs[0].estimatedFatGrams, null);
});

test("frontend presents empty and real diary states and exposes authenticated navigation", async () => {
  const [page, service, app, route, mealPhoto, styles] = await Promise.all([
    readFile("frontend/src/pages/DiaryPage.tsx", "utf8"),
    readFile("frontend/src/services/diaryService.ts", "utf8"),
    readFile("frontend/src/App.tsx", "utf8"),
    readFile("src/routes/food-log.routes.ts", "utf8"),
    readFile("frontend/src/pages/MealPhotoPage.tsx", "utf8"),
    readFile("frontend/src/pages/DiaryPage.css", "utf8"),
  ]);
  assert.match(page, /Diário alimentar/);
  assert.match(page, /Nenhuma refeição registrada/);
  assert.match(page, /foodLogs\.map\(\(foodLog\) => <DiaryEntry/);
  assert.match(page, /Refeição — \{time\}/);
  assert.match(page, /Registrar refeição/);
  assert.match(service, /\/api\/food-logs\?/);
  assert.match(service, /getTimezoneOffset/);
  assert.match(app, /view === 'diary'/);
  assert.match(route, /foodLogRouter\.use\(authenticate\)/);
  assert.ok(route.indexOf("foodLogRouter.use(authenticate)") < route.indexOf('foodLogRouter.get("/"'));
  assert.match(mealPhoto, /Ver no Diário/);
  assert.match(styles, /@media \(max-width:560px\)/);
  assert.match(styles, /@media \(max-width:360px\)/);
});
