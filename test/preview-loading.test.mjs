import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the preview wait is honest and keeps trying while the server wakes up", async () => {
  const [page, service] = await Promise.all([
    readFile("frontend/src/pages/PlanPreviewPage.tsx", "utf8"),
    readFile("frontend/src/services/planPreviewService.ts", "utf8"),
  ]);
  // No fixed promise of time: steps change while waiting and the copy says it can take up to 30 s.
  assert.doesNotMatch(page, /10 segundos/);
  assert.match(page, /Pode levar até meio minuto\. Não feche esta página\./);
  for (const step of ["Lendo suas respostas…", "Escolhendo as refeições do dia…", "Calculando calorias e custo…", "Conferindo o seu orçamento…"]) {
    assert.ok(page.includes(step), step);
  }
  assert.match(page, /Math\.round\(95 \* \(1 - Math\.exp\(-seconds \/ 11\)\)\)/);
  // Network errors and 5xx keep retrying for about a minute while "Montando" stays on screen;
  // 4xx answers (bad data, rate limit) are final.
  assert.match(page, /getPlanPreviewWithRetry\(draft\)/);
  assert.match(service, /return !\(error instanceof ApiError\) \|\| error\.status >= 500/);
  assert.match(service, /if \(!isTransient\(error\) \|\| Date\.now\(\) - started \+ retryDelayMs > giveUpAfterMs\) throw error/);
  assert.match(service, /retryDelayMs = 4000, giveUpAfterMs = 60_000/);
});
