import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("a scheduled job pings the API health check so Render does not put it to sleep", async () => {
  const [workflow, app] = await Promise.all([
    readFile(".github/workflows/keep-api-awake.yml", "utf8"),
    readFile("src/app.ts", "utf8"),
  ]);
  assert.match(workflow, /cron: "\*\/5 \* \* \* \*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions: \{\}/);
  assert.match(workflow, /curl --fail .*https:\/\/nutri-ai-api\.onrender\.com\/health/);
  assert.match(app, /app\.get\("\/health", livenessController\);/);
});
