import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("fresh login reuses the returned role and loads only the required destination", async () => {
  const [app, loginPage, authTypes] = await Promise.all([
    readFile("frontend/src/App.tsx", "utf8"),
    readFile("frontend/src/pages/LoginPage.tsx", "utf8"),
    readFile("frontend/src/types/auth.ts", "utf8"),
  ]);

  assert.match(authTypes, /LoginResponse \{ token: string; expiresIn: string; user: AuthUser \}/);
  assert.match(loginPage, /saveToken\(response\.token\)/);
  assert.match(loginPage, /saveRole\(response\.user\.role\)/);
  assert.match(loginPage, /onAuthenticated\(response\.user\.role\)/);
  const freshLoginCallback = app.split("const handleAuthenticated = (role:", 2)[1]?.split("if (view === 'register')", 1)[0] ?? "";
  assert.match(freshLoginCallback, /role === 'ADMIN'/);
  assert.match(freshLoginCallback, /setView\('admin'\); return/);
  assert.match(freshLoginCallback, /setView\('checking-profile'\); void loadProfile\(\)/);
  assert.doesNotMatch(freshLoginCallback, /restoreAuthenticatedSession/);
});

test("existing sessions still validate through auth me before loading the profile", async () => {
  const [app, authService] = await Promise.all([
    readFile("frontend/src/App.tsx", "utf8"),
    readFile("frontend/src/services/authService.ts", "utf8"),
  ]);

  assert.match(authService, /apiRequest<CurrentUserResponse>\('\/auth\/me'\)/);
  assert.match(app, /const \{ user \} = await getCurrentUser\(\)/);
  assert.match(app, /if \(user\.role === 'ADMIN'\) setView\('admin'\)\s*else await loadProfile\(\)/);
  assert.match(app, /if \(getToken\(\)\) void restoreAuthenticatedSession\(\)/);
  assert.equal((app.match(/void restoreAuthenticatedSession\(\)/g) ?? []).length, 1);
});

test("authentication failures and backend security checks remain fail closed", async () => {
  const [api, authService, authMiddleware] = await Promise.all([
    readFile("frontend/src/services/api.ts", "utf8"),
    readFile("src/services/auth.service.ts", "utf8"),
    readFile("src/middlewares/auth.middleware.ts", "utf8"),
  ]);

  assert.match(api, /response\.status === 401 && token/);
  assert.match(api, /removeToken\(\)/);
  assert.match(api, /AUTH_UNAUTHORIZED_EVENT/);
  assert.match(authService, /!user \|\| !\(await passwordMatches\(input\.password, user\.passwordHash\)\)/);
  assert.match(authService, /if \(!passwordHash\) return false/);
  assert.match(authService, /user\.status === "BLOCKED"/);
  assert.match(authService, /throw new AuthError\(403, "User is blocked"\)/);
  assert.match(authService, /jwt\.sign\(\{ sub: user\.id \}, env\.jwtSecret/);
  assert.match(authMiddleware, /jwt\.verify\(token, env\.jwtSecret\)/);
  assert.match(authMiddleware, /response\.status\(401\)\.json\(\{ error: "Invalid or expired authentication token" \}\)/);
});
