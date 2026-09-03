import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import {
  mealPlanResponseSchema,
  toGeminiResponseSchema,
} from "../dist/services/gemini-response-schema.js";

function property(schema, name) {
  assert.ok(schema.properties?.[name], `missing property ${name}`);
  return schema.properties[name];
}

test("MealPlan responseSchema preserves the complete supported structure", () => {
  const root = mealPlanResponseSchema;
  assert.equal(root.type, "OBJECT");
  assert.deepEqual(root.required, [
    "title", "summary", "durationDays", "currency", "dailyTargets", "days",
    "shoppingList", "estimatedWeeklyCost", "notes", "safetyNotices",
  ]);
  assert.equal(property(root, "title").type, "STRING");
  assert.equal(property(root, "summary").type, "STRING");
  assert.equal(property(root, "durationDays").type, "INTEGER");
  assert.equal(property(root, "currency").format, "enum");
  assert.deepEqual(property(root, "currency").enum, ["BRL"]);
  assert.equal(property(root, "estimatedWeeklyCost").type, "NUMBER");
  for (const name of ["notes", "safetyNotices"]) {
    const list = property(root, name);
    assert.equal(list.type, "ARRAY");
    assert.equal(list.items.type, "STRING");
  }
  const day = property(root, "days").items;
  assert.equal(day.type, "OBJECT");
  assert.deepEqual(day.required, ["day", "label", "meals", "estimatedDailyCost"]);
  assert.equal(property(day, "day").type, "INTEGER");
  assert.equal(property(day, "estimatedDailyCost").type, "NUMBER");

  const meal = property(day, "meals").items;
  assert.deepEqual(meal.required, [
    "name", "suggestedTime", "foods", "preparation", "estimatedNutrition",
  ]);
  assert.equal(property(meal, "suggestedTime").type, "STRING");
  assert.equal(property(meal, "suggestedTime").nullable, true);

  const food = property(meal, "foods").items;
  assert.deepEqual(food.required, ["name", "quantity", "unit"]);
  assert.equal(property(food, "name").type, "STRING");
  assert.equal(property(food, "quantity").type, "NUMBER");
  assert.equal(property(food, "unit").type, "STRING");

  const nutrition = property(meal, "estimatedNutrition");
  assert.deepEqual(nutrition.required, [
    "caloriesKcal", "proteinGrams", "carbohydrateGrams", "fatGrams",
  ]);
  for (const name of nutrition.required) assert.equal(property(nutrition, name).type, "NUMBER");
  assert.deepEqual(property(root, "dailyTargets").required, nutrition.required);

  const shoppingList = property(root, "shoppingList");
  const shoppingCategory = shoppingList.items;
  assert.deepEqual(shoppingCategory.required, ["category", "items"]);
  const shoppingItem = property(shoppingCategory, "items").items;
  assert.deepEqual(shoppingItem.required, ["name", "quantity", "unit"]);
  assert.equal(property(shoppingItem, "quantity").type, "NUMBER");
  assert.equal(property(shoppingItem, "unit").type, "STRING");
});

test("conversion emits only the conservative Gemini Schema subset", () => {
  const converted = toGeminiResponseSchema(z.object({
    positive: z.number().positive().max(10),
    text: z.string().min(2).max(5),
    list: z.array(z.string()).min(1).max(3),
    choice: z.enum(["A", "B"]),
    numericLiteral: z.literal(7),
  }).strict());
  const positive = property(converted, "positive");
  assert.equal("minimum" in positive, false);
  assert.equal("maximum" in positive, false);
  assert.equal("additionalProperties" in converted, false);
  assert.equal("minLength" in property(converted, "text"), false);
  assert.equal("maxLength" in property(converted, "text"), false);
  assert.equal("minItems" in property(converted, "list"), false);
  assert.equal("maxItems" in property(converted, "list"), false);
  assert.equal(property(converted, "choice").format, "enum");
  assert.deepEqual(property(converted, "choice").enum, ["A", "B"]);
  assert.equal(property(converted, "numericLiteral").type, "INTEGER");
  assert.equal("enum" in property(converted, "numericLiteral"), false);
});

test("MealPlan responseSchema contains no unsupported or non-structural keywords", () => {
  const allowedKeys = new Set([
    "type", "properties", "required", "items", "format", "enum", "nullable",
  ]);
  const emittedKeys = new Set();

  function visit(schema) {
    for (const key of Object.keys(schema)) {
      emittedKeys.add(key);
      assert.ok(allowedKeys.has(key), `unexpected Gemini Schema key: ${key}`);
    }
    if (schema.properties) {
      for (const child of Object.values(schema.properties)) visit(child);
    }
    if (schema.items) visit(schema.items);
  }

  visit(mealPlanResponseSchema);
  assert.deepEqual([...emittedKeys].sort(), [...allowedKeys].sort());
});
