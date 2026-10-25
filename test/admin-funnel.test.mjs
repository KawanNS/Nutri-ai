import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createAdminFunnelController } from "../dist/controllers/admin-funnel.controller.js";
import { funnelDays } from "../dist/services/admin-funnel.service.js";

function fakeResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("funnel days are São Paulo calendar days ending today", () => {
  // 02:30 UTC on the 25th is still the 24th in São Paulo.
  assert.deepEqual(funnelDays(7, new Date("2026-10-25T02:30:00Z")), [
    "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24",
  ]);
  assert.equal(funnelDays(30, new Date("2026-10-25T12:00:00Z")).length, 30);
  assert.equal(funnelDays(14, new Date("2026-10-25T12:00:00Z")).at(-1), "2026-10-25");
});

test("the funnel endpoint takes 7, 14 or 30 days and defaults to 14", async () => {
  const asked = [];
  const controller = createAdminFunnelController(async (days) => { asked.push(days); return { periodDays: days }; });

  const standard = fakeResponse();
  await controller({ query: {} }, standard);
  assert.deepEqual(standard.body, { funnel: { periodDays: 14 } });

  await controller({ query: { days: "30" } }, fakeResponse());
  assert.deepEqual(asked, [14, 30]);

  for (const query of [{ days: "90" }, { days: "abc" }, { days: "7", extra: "1" }]) {
    const rejected = fakeResponse();
    await controller({ query }, rejected);
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.body.code, "INVALID_FUNNEL_PERIOD");
  }

  const failing = fakeResponse();
  await createAdminFunnelController(async () => { throw new Error("db down"); })({ query: {} }, failing);
  assert.equal(failing.statusCode, 500);
  assert.equal(failing.body.code, "FUNNEL_UNAVAILABLE");
});

test("only admins reach the funnel, and it shows no emails", async () => {
  const [routes, app, service, page, component] = await Promise.all([
    readFile("src/routes/admin-funnel.routes.ts", "utf8"),
    readFile("src/app.ts", "utf8"),
    readFile("src/services/admin-funnel.service.ts", "utf8"),
    readFile("frontend/src/pages/AdminRouterPage.tsx", "utf8"),
    readFile("frontend/src/components/admin/AdminFunnel.tsx", "utf8"),
  ]);
  assert.match(routes, /adminFunnelRouter\.use\(authenticate, requireAdmin, adminRateLimit\)/);
  assert.match(app, /app\.use\("\/api\/admin\/funnel", adminFunnelRouter\)/);
  // Previews come from the AI usage log the preview already writes; admin accounts stay out of the counts.
  assert.match(service, /task = 'MEAL_PLAN_PREVIEW' and success/);
  assert.match(service, /where: \{ role: "USER" \}/);
  assert.doesNotMatch(service, /email: true|"email"/);
  assert.match(page, /<main className="page admin-page"><AdminFunnel\/>/);
  assert.match(component, /const periods: FunnelPeriod\[\] = \[7, 14, 30\]/);
  assert.match(component, /'Viram a prévia'[\s\S]*'Criaram conta'[\s\S]*'Completaram perfil'[\s\S]*'Geraram 1º plano'[\s\S]*'Foram ao pagamento'[\s\S]*'Assinaram'/);
});
