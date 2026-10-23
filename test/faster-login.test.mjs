import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("logins check passwords at cost 10 and upgrade older hashes in the background", async () => {
  const service = await readFile("src/services/auth.service.ts", "utf8");
  assert.match(service, /const PASSWORD_SALT_ROUNDS = 10;/);
  assert.match(service, /if \(user\.passwordHash && bcrypt\.getRounds\(user\.passwordHash\) > PASSWORD_SALT_ROUNDS\) \{\s+void upgradePasswordHash\(user\.id, input\.password\);/);
  assert.match(service, /await prisma\.user\.update\(\{ where: \{ id: userId \}, data: \{ passwordHash \} \}\);/);
});

test("the login keeps trying while the API wakes up and says what is happening", async () => {
  const [page, api, app, hint] = await Promise.all([
    readFile("frontend/src/pages/LoginPage.tsx", "utf8"),
    readFile("frontend/src/services/api.ts", "utf8"),
    readFile("frontend/src/App.tsx", "utf8"),
    readFile("frontend/src/components/WakingHint.tsx", "utf8"),
  ]);
  assert.match(page, /await retryWhileWaking\(\(\) => login\(\{ email: email\.trim\(\), password \}\)\)/);
  assert.match(page, /\{submitting && <WakingHint\/>\}/);
  assert.match(api, /const transient = !\(error instanceof ApiError\) \|\| error\.status >= 500/);
  assert.match(app, /<AlyvoraLoader size=\{64\} label="Carregando perfil"\/><WakingHint\/>/);
  assert.match(hint, /Acordando o Alyvora…/);
  assert.match(hint, /delayMs = 3000/);
});
