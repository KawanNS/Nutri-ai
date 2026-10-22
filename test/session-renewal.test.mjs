import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import jwt from "jsonwebtoken";

import { AuthError, renewSession } from "../dist/services/auth.service.js";

const user = {
  id: "user-1",
  name: "Pessoa",
  email: "pessoa@example.com",
  status: "ACTIVE",
  role: "USER",
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const users = (found) => ({ findUnique: async (query) => { assert.deepEqual(query.where, { id: "user-1" }); return found; } });

test("a valid session is renewed with a fresh seven-day token", async () => {
  const session = await renewSession("user-1", users(user));
  const payload = jwt.decode(session.token);
  assert.equal(session.expiresIn, "7d");
  assert.equal(payload.sub, "user-1");
  assert.equal(payload.exp - payload.iat, 7 * 24 * 60 * 60);
  assert.equal(session.user.id, "user-1");
});

test("blocked or deleted users cannot renew", async () => {
  await assert.rejects(() => renewSession("user-1", users({ ...user, status: "BLOCKED" })), (error) => error instanceof AuthError && error.statusCode === 403);
  await assert.rejects(() => renewSession("user-1", users(null)), (error) => error instanceof AuthError && error.statusCode === 401);
});

test("the refresh route needs a valid token and sits behind the auth rate limit", async () => {
  const routes = await readFile("src/routes/auth.routes.ts", "utf8");
  assert.match(routes, /authRouter\.use\(authRateLimit\)/);
  assert.match(routes, /authRouter\.post\("\/refresh", authenticate, renewSessionController\);/);
});

test("the app renews a day-old token on load, on return to the tab and hourly", async () => {
  const [app, session, authService, authToken] = await Promise.all([
    readFile("frontend/src/App.tsx", "utf8"),
    readFile("frontend/src/services/session.ts", "utf8"),
    readFile("frontend/src/services/authService.ts", "utf8"),
    readFile("frontend/src/services/authToken.ts", "utf8"),
  ]);
  assert.match(authService, /apiRequest<LoginResponse>\('\/auth\/refresh', \{ method: 'POST' \}\)/);
  assert.match(authToken, /payload\.iat \* 1000/);
  assert.match(session, /const RENEW_AFTER_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(session, /if \(getToken\(\) === token\) \{ saveToken\(fresh\); saveRole\(user\.role\) \}/);
  assert.match(app, /setAccount\(user\)\s+void renewSessionIfStale\(\)/);
  assert.match(app, /document\.addEventListener\('visibilitychange', renewWhenVisible\)/);
  assert.match(app, /window\.setInterval\(renewWhenVisible, 60 \* 60 \* 1000\)/);
  assert.match(app, /window\.clearInterval\(renewal\)/);
});
