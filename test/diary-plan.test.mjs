import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getPlanMealsController, logPlanMealController } from "../dist/controllers/food-log.controller.js";
import { logPlanMealBodySchema } from "../dist/schemas/food-log.schema.js";
import { listFoodLogs } from "../dist/services/food-log.service.js";
import {
  getPlanMealsForDate,
  logPlanMeal,
  mealMinutes,
  planDayForDate,
  PlanMealLogError,
} from "../dist/services/plan-meal-log.service.js";

const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const weekdays = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];

function meal(name, suggestedTime, caloriesKcal) {
  return {
    name,
    suggestedTime,
    foods: [{ name: "Arroz", quantity: 120.5, unit: "g" }, { name: "Feijão", quantity: 1, unit: "concha" }],
    preparation: "Cozinhe.",
    estimatedNutrition: { caloriesKcal, proteinGrams: 30, carbohydrateGrams: 60, fatGrams: 10 },
  };
}

function planContent(labels = weekdays) {
  return {
    dailyTargets: { caloriesKcal: 2000, proteinGrams: 120, carbohydrateGrams: 250, fatGrams: 60 },
    days: labels.map((label, index) => ({
      day: index + 1,
      label,
      meals: [meal(`Café ${index + 1}`, "07:30", 400), meal(`Almoço ${index + 1}`, null, 700)],
      estimatedDailyCost: 30,
    })),
  };
}

function fakeClient({ userId = "user-a", content = planContent(), createdAt = new Date("2026-10-12T15:00:00.000Z") } = {}) {
  const logs = [];
  const plans = [{ id: PLAN_ID, userId, createdAt, content }];
  return {
    logs,
    store: { findMany: async (args) => logs.filter((row) => row.userId === args.where.userId && row.consumedAt >= args.where.consumedAt.gte && row.consumedAt < args.where.consumedAt.lt) },
    client: {
      mealPlan: {
        async findFirst({ where }) {
          return plans.find((plan) => plan.userId === where.userId && (!where.id || plan.id === where.id)) ?? null;
        },
      },
      foodLog: {
        async findMany({ where }) {
          return logs.filter((row) => row.userId === where.userId && row.consumedAt >= where.consumedAt.gte && row.consumedAt < where.consumedAt.lt);
        },
        async create({ data }) {
          const id = `log-${logs.length + 1}`;
          const row = {
            id,
            ...data,
            items: data.items.create.map((item) => ({ id: `${id}-item-${item.position}`, ...item })),
          };
          logs.push(row);
          return row;
        },
      },
    },
  };
}

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

test("plan day follows weekday labels, or counts days from the plan creation", () => {
  const content = planContent();
  // 2026-10-19 is a Monday; 2026-10-25 a Sunday.
  assert.equal(planDayForDate(content.days, new Date("2026-10-01T12:00:00Z"), "2026-10-19", 180).label, "Segunda-feira");
  assert.equal(planDayForDate(content.days, new Date("2026-10-01T12:00:00Z"), "2026-10-25", 180).label, "Domingo");

  const numbered = planContent(["Dia 1", "Dia 2", "Dia 3", "Dia 4", "Dia 5", "Dia 6", "Dia 7"]).days;
  // Created late on 2026-10-12 in Brazil (01:30 UTC on the 13th): that local day is day 1.
  const createdAt = new Date("2026-10-13T01:30:00.000Z");
  assert.equal(planDayForDate(numbered, createdAt, "2026-10-12", 180).day, 1);
  assert.equal(planDayForDate(numbered, createdAt, "2026-10-14", 180).day, 3);
  assert.equal(planDayForDate(numbered, createdAt, "2026-10-19", 180).day, 1);
  assert.equal(planDayForDate(numbered, createdAt, "2026-10-01", 180).day, 1);
});

test("meal times are read from the common formats and ignored otherwise", () => {
  assert.equal(mealMinutes("07:30"), 450);
  assert.equal(mealMinutes("12h"), 720);
  assert.equal(mealMinutes("19h30"), 1170);
  assert.equal(mealMinutes("Manhã"), null);
  assert.equal(mealMinutes(null), null);
});

test("the diary lists the plan meals for the selected day and marks the ones already logged", async () => {
  const database = fakeClient();
  const before = await getPlanMealsForDate("user-a", { date: "2026-10-19", timezoneOffsetMinutes: 180 }, database.client);
  assert.equal(before.plan.mealPlanId, PLAN_ID);
  assert.equal(before.plan.label, "Segunda-feira");
  assert.deepEqual(before.plan.dailyTargets, planContent().dailyTargets);
  assert.deepEqual(before.plan.meals.map((item) => [item.index, item.name, item.logged]), [[0, "Café 1", false], [1, "Almoço 1", false]]);
  assert.equal(Object.hasOwn(before.plan.meals[0], "preparation"), false);

  await logPlanMeal("user-a", { mealPlanId: PLAN_ID, day: 1, mealIndex: 1, date: "2026-10-19", timezoneOffsetMinutes: 180 }, database.client, new Date("2026-10-19T22:00:00Z"));
  const after = await getPlanMealsForDate("user-a", { date: "2026-10-19", timezoneOffsetMinutes: 180 }, database.client);
  assert.deepEqual(after.plan.meals.map((item) => item.logged), [false, true]);
  // Another day of the week is untouched.
  const nextDay = await getPlanMealsForDate("user-a", { date: "2026-10-20", timezoneOffsetMinutes: 180 }, database.client);
  assert.deepEqual(nextDay.plan.meals.map((item) => item.logged), [false, false]);
});

test("without a plan, or with a plan the diary cannot read, there is nothing to offer", async () => {
  assert.deepEqual(await getPlanMealsForDate("user-b", { date: "2026-10-19", timezoneOffsetMinutes: 180 }, fakeClient().client), { date: "2026-10-19", plan: null });
  assert.deepEqual(await getPlanMealsForDate("user-a", { date: "2026-10-19", timezoneOffsetMinutes: 180 }, fakeClient({ content: { broken: true } }).client), { date: "2026-10-19", plan: null });
});

test("logging a plan meal copies foods and totals from the stored plan into the diary", async () => {
  const database = fakeClient();
  const now = new Date("2026-10-19T22:00:00Z");
  const { foodLog } = await logPlanMeal("user-a", { mealPlanId: PLAN_ID, day: 1, mealIndex: 0, date: "2026-10-19", timezoneOffsetMinutes: 180 }, database.client, now);

  assert.equal(foodLog.consumedAt, "2026-10-19T10:30:00.000Z");
  assert.equal(foodLog.estimatedCaloriesKcal, 400);
  assert.equal(foodLog.estimatedProteinGrams, 30);
  assert.equal(foodLog.notes, "Refeição do plano: Café 1");
  assert.deepEqual(foodLog.items.map((item) => [item.name, item.portionDescription]), [["Arroz", "120,5 g"], ["Feijão", "1 concha"]]);
  assert.equal(database.logs[0].userId, "user-a");

  const diary = await listFoodLogs("user-a", { date: "2026-10-19", timezoneOffsetMinutes: 180 }, database.store);
  assert.deepEqual(diary.foodLogs.map((row) => row.id), [foodLog.id]);
});

test("a meal without a time lands at noon, never after now", async () => {
  const database = fakeClient();
  const atNoon = await logPlanMeal("user-a", { mealPlanId: PLAN_ID, day: 1, mealIndex: 1, date: "2026-10-18", timezoneOffsetMinutes: 180 }, database.client, new Date("2026-10-19T22:00:00Z"));
  assert.equal(atNoon.foodLog.consumedAt, "2026-10-18T15:00:00.000Z");
  const early = new Date("2026-10-19T09:00:00Z");
  const now = await logPlanMeal("user-a", { mealPlanId: PLAN_ID, day: 1, mealIndex: 1, date: "2026-10-19", timezoneOffsetMinutes: 180 }, database.client, early);
  assert.equal(now.foodLog.consumedAt, early.toISOString());
});

test("plan meal logging refuses duplicates, other users' plans, missing meals and future days", async () => {
  const database = fakeClient();
  const now = new Date("2026-10-19T22:00:00Z");
  const body = { mealPlanId: PLAN_ID, day: 1, mealIndex: 0, date: "2026-10-19", timezoneOffsetMinutes: 180 };
  await logPlanMeal("user-a", body, database.client, now);
  const rejects = (userId, input, code) => assert.rejects(
    () => logPlanMeal(userId, input, database.client, now),
    (error) => error instanceof PlanMealLogError && error.code === code,
  );
  await rejects("user-a", body, "PLAN_MEAL_ALREADY_LOGGED");
  await rejects("user-b", body, "MEAL_PLAN_NOT_FOUND");
  await rejects("user-a", { ...body, mealIndex: 5 }, "PLAN_MEAL_NOT_FOUND");
  await rejects("user-a", { ...body, date: "2026-10-21" }, "PLAN_MEAL_DATE_IN_FUTURE");
  assert.equal(database.logs.length, 1);
});

test("plan meal endpoints require authentication and validate their input", async () => {
  assert.equal(logPlanMealBodySchema.safeParse({ mealPlanId: PLAN_ID, day: 1, mealIndex: 0, date: "2026-10-19", timezoneOffsetMinutes: 180 }).success, true);
  assert.equal(logPlanMealBodySchema.safeParse({ mealPlanId: "x", day: 1, mealIndex: 0, date: "2026-10-19" }).success, false);
  assert.equal(logPlanMealBodySchema.safeParse({ mealPlanId: PLAN_ID, day: 8, mealIndex: 0, date: "2026-10-19" }).success, false);
  assert.equal(logPlanMealBodySchema.safeParse({ mealPlanId: PLAN_ID, day: 1, mealIndex: 0, date: "2026-10-19", foods: [] }).success, false);

  const unauthenticatedGet = responseRecorder();
  await getPlanMealsController({ query: { date: "2026-10-19" } }, unauthenticatedGet.response);
  assert.equal(unauthenticatedGet.output.status, 401);
  const unauthenticatedPost = responseRecorder();
  await logPlanMealController({ body: {} }, unauthenticatedPost.response);
  assert.equal(unauthenticatedPost.output.status, 401);

  const invalidGet = responseRecorder();
  await getPlanMealsController({ auth: { userId: "user-a" }, query: { date: "ontem" } }, invalidGet.response);
  assert.equal(invalidGet.output.status, 400);
  const invalidPost = responseRecorder();
  await logPlanMealController({ auth: { userId: "user-a" }, body: { mealIndex: 0 } }, invalidPost.response);
  assert.deepEqual([invalidPost.output.status, invalidPost.output.body.code], [400, "INVALID_PLAN_MEAL_LOG"]);
});

test("diary screen offers the plan meals and compares the day with the plan targets", async () => {
  const [page, component, service, route] = await Promise.all([
    readFile("frontend/src/pages/DiaryPage.tsx", "utf8"),
    readFile("frontend/src/components/diary/DiaryPlanMeals.tsx", "utf8"),
    readFile("frontend/src/services/diaryService.ts", "utf8"),
    readFile("src/routes/food-log.routes.ts", "utf8"),
  ]);
  assert.ok(route.indexOf("foodLogRouter.use(authenticate)") < route.indexOf('foodLogRouter.post("/plan-meals"'));
  assert.match(service, /\/api\/food-logs\/plan-meals\?/);
  assert.match(service, /method: 'POST'/);

  // The plan section shows on empty days too, and a failing plan request never breaks the diary.
  assert.equal((page.match(/\{planSection\}/g) ?? []).length, 2);
  assert.match(page, /getDiaryPlanMeals\(date\)\.catch\(\(\) => \(\{ plan: null \}\)\)/);
  assert.match(page, /<DiaryDayTarget calories=\{totals\.calories\} targets=\{plan\.dailyTargets\}\/>/);

  // One tap per meal, named for screen readers, locked while a request is running.
  assert.match(component, />Comi isso<\/Button>/);
  assert.match(component, /aria-label=\{`Comi isso: \$\{meal\.name\}`\}/);
  assert.match(component, /disabled=\{loggingIndex !== null\}/);
  assert.match(component, /role="alert"/);
  // The target bar is decorative; the numbers are in the text. The wording never judges.
  assert.match(component, /className="diary-target__bar" aria-hidden="true"/);
  assert.doesNotMatch(component, /parabéns|cuidado|exagerou|ruim|culpa/i);
});
