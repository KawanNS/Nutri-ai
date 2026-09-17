import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createAuthRateLimit } from "../dist/middlewares/auth-rate-limit.middleware.js";
import { loginBodySchema, registerBodySchema } from "../dist/schemas/auth.schema.js";

function response() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("authentication contracts are strict and bound expensive inputs", () => {
  assert.equal(registerBodySchema.safeParse({ name: "Ana", email: "ana@example.com", password: "password-safe" }).success, true);
  for (const input of [
    undefined,
    { name: "A", email: "invalid", password: "short" },
    { name: "Ana", email: "ana@example.com", password: "x".repeat(129) },
    { name: "Ana", email: "ana@example.com", password: "password-safe", role: "ADMIN" },
  ]) assert.equal(registerBodySchema.safeParse(input).success, false);
  assert.equal(loginBodySchema.safeParse({ email: "ana@example.com", password: "x".repeat(129) }).success, false);
});

test("authentication rate limit isolates paths, returns 429, and resets", () => {
  let timestamp = 1_000;
  const limit = createAuthRateLimit({ maximumRequests: 2, windowMs: 5_000, now: () => timestamp });
  const request = { ip: "127.0.0.1", path: "/login", socket: {} };
  for (let count = 0; count < 2; count += 1) {
    const current = response(); let nextCalls = 0;
    limit(request, current, () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
  }
  const blocked = response();
  limit(request, blocked, () => assert.fail("must not continue"));
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.code, "AUTH_RATE_LIMIT_EXCEEDED");

  const register = response(); let registerCalls = 0;
  limit({ ...request, path: "/register" }, register, () => { registerCalls += 1; });
  assert.equal(registerCalls, 1);
  timestamp += 5_001;
  const reset = response(); let resetCalls = 0;
  limit(request, reset, () => { resetCalls += 1; });
  assert.equal(resetCalls, 1);
});

test("public authentication routes are rate-limited and API headers reduce passive exposure", async () => {
  const [app, routes] = await Promise.all([
    readFile("src/app.ts", "utf8"),
    readFile("src/routes/auth.routes.ts", "utf8"),
  ]);
  assert.match(routes, /authRouter\.use\(authRateLimit\)/);
  assert.match(app, /disable\("x-powered-by"\)/);
  assert.match(app, /X-Content-Type-Options/);
  assert.match(app, /Permissions-Policy/);
});
