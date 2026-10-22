import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { profileSchema } from "../dist/schemas/profile.schema.js";

const issuesFor = (field, value) =>
  (profileSchema.safeParse({ [field]: value }).error?.issues ?? []).filter((issue) => issue.path[0] === field);

test("profile height is in centimeters and weight in kilograms, within adult ranges", () => {
  for (const ok of ["50", "153", "175.5", "260"]) assert.deepEqual(issuesFor("heightCm", ok), [], `height ${ok}`);
  for (const bad of ["1.53", "1.8", "49.99", "260.01", "999"]) assert.notDeepEqual(issuesFor("heightCm", bad), [], `height ${bad}`);
  for (const ok of ["20", "50", "72.5", "400"]) assert.deepEqual(issuesFor("weightKg", ok), [], `weight ${ok}`);
  for (const bad of ["0.5", "19.99", "400.01", "5000"]) assert.notDeepEqual(issuesFor("weightKg", bad), [], `weight ${bad}`);
});

test("the profile form explains a height typed in meters", async () => {
  const page = await readFile("frontend/src/pages/ProfilePage.tsx", "utf8");
  assert.match(page, /Parece que está em metros\. Use centímetros/);
  assert.match(page, /if \(number > 0 && number < 3\)/);
  assert.match(page, /validDecimal\(value, 260, false, 50\)/);
  assert.match(page, /validDecimal\(form\.weightKg, 400, false, 20\)/);
  assert.match(page, /min="50" max="260"/);
  assert.match(page, /min="20" max="400"/);
});
