import assert from "node:assert/strict";
import test from "node:test";

import { createLivenessController } from "../dist/controllers/health.controller.js";
import { createWarmUp, WARM_UP_INTERVAL_MS } from "../dist/services/warm-up.service.js";

test("waking the API also wakes the AI gateway and the database, at most once a minute", async () => {
  let now = 0;
  const calls = [];
  const warmUp = createWarmUp({
    now: () => now,
    wakeGateway: async () => { calls.push("gateway"); },
    openDatabaseConnection: async () => { calls.push("database"); throw new Error("not reachable"); },
  });
  assert.equal(warmUp(), true);
  assert.equal(warmUp(), false, "a second ping in the same minute does nothing");
  now = WARM_UP_INTERVAL_MS;
  assert.equal(warmUp(), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["gateway", "database", "gateway", "database"]);
});

test("/health answers right away and only starts the warm-up in the background", () => {
  let warmed = 0;
  const controller = createLivenessController(() => { warmed += 1; return true; });
  const output = {};
  controller({}, { status(code) { output.status = code; return this; }, json(body) { output.body = body; return this; } });
  assert.deepEqual([output.status, output.body, warmed], [200, { status: "ok" }, 1]);
});
