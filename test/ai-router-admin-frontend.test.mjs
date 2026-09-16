import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("private AI Router panel consumes only the existing administrative API", async () => {
  const [app, page, service] = await Promise.all([
    readFile("frontend/src/App.tsx", "utf8"),
    readFile("frontend/src/pages/AdminRouterPage.tsx", "utf8"),
    readFile("frontend/src/services/adminService.ts", "utf8"),
  ]);
  assert.match(app, /role === 'ADMIN'/);
  assert.match(app, /AdminRouterPage/);
  for (const endpoint of ["routes", "providers", "models", "usage", "costs", "audit"]) {
    assert.equal(service.includes(`/api/admin/ai-router/${endpoint}`), true, endpoint);
  }
  assert.match(page, /expectedVersion: route\.version/);
  assert.match(page, /AI_ROUTE_VERSION_CONFLICT/);
});

test("admin frontend contains no credential access or secret editor", async () => {
  const files = await Promise.all([
    readFile("frontend/src/pages/AdminRouterPage.tsx", "utf8"),
    readFile("frontend/src/services/adminService.ts", "utf8"),
    readFile("frontend/src/types/admin.ts", "utf8"),
  ]);
  const source = files.join("\n");
  for (const forbidden of ["OPENAI_API_KEY", "GEMINI_API_KEY", "DATABASE_URL", "JWT_SECRET", "CAKTO_API_ACCESS_TOKEN"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
