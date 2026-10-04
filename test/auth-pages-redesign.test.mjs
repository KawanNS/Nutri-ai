import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("login and registration redesign preserve auth behavior and accessible controls", async () => {
  const [login, register, layout, passwordField, styles, authService, app] = await Promise.all([
    readFile("frontend/src/pages/LoginPage.tsx", "utf8"),
    readFile("frontend/src/pages/RegisterPage.tsx", "utf8"),
    readFile("frontend/src/components/AuthLayout.tsx", "utf8"),
    readFile("frontend/src/components/auth/PasswordField.tsx", "utf8"),
    readFile("frontend/src/components/AuthLayout.css", "utf8"),
    readFile("frontend/src/services/authService.ts", "utf8"),
    readFile("frontend/src/App.tsx", "utf8"),
  ]);

  assert.match(login, /await login\(\{ email: email\.trim\(\), password \}\)/);
  assert.match(login, /saveToken\(response\.token\)/);
  assert.match(login, /saveRole\(response\.user\.role\)/);
  assert.match(login, /onAuthenticated\(response\.user\.role\)/);
  assert.match(login, /requestError\.status === 401/);
  assert.match(login, /if \(submitting\) return/);

  assert.match(register, /await register\(\{ name: name\.trim\(\), email: email\.trim\(\), password \}\)/);
  assert.match(register, /onRegistered\(email\.trim\(\)\)/);
  assert.match(register, /requestError\.status === 409/);
  assert.match(register, /if \(submitting\) return/);

  assert.match(authService, /'\/auth\/login'/);
  assert.match(authService, /'\/auth\/register'/);
  assert.match(app, /setLoginNotice\('Conta criada\. Entre para continuar\.'\)/);
  assert.match(app, /setOnboardingDraft\(draft\)/);

  for (const page of [login, register]) {
    assert.match(page, /<AuthLayout/);
    assert.match(page, /<FormField/);
    assert.match(page, /<PasswordField/);
    assert.match(page, /<Button/);
    assert.match(page, /<Alert/);
    assert.match(page, /type="submit"/);
    assert.match(page, /required/);
  }

  assert.match(login, /type="email"/);
  assert.match(login, /autoComplete="email"/);
  assert.match(login, /autoComplete="current-password"/);
  assert.match(register, /autoComplete="name"/);
  assert.match(register, /autoComplete="new-password"/);
  assert.match(register, /minLength=\{8\}/);
  assert.match(passwordField, /aria-label=\{visible \? 'Ocultar senha' : 'Mostrar senha'\}/);
  assert.match(passwordField, /aria-pressed=\{visible\}/);
  assert.match(layout, /<BrandLogo\/>/);
  assert.match(layout, /<Surface/);
  assert.match(styles, /min-height: var\(--touch-target\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(login + register, /Google|Apple|recuperar senha|esqueci minha senha/i);
});
