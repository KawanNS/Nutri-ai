import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isNewAccount, parseSource, recordAcquisition } from "../dist/services/acquisition.service.js";

test("only clean source tags are kept", () => {
  assert.equal(parseSource("instagram"), "instagram");
  assert.equal(parseSource(" Instagram "), "instagram");
  assert.equal(parseSource("tiktok_ads-2"), "tiktok_ads-2");
  for (const bad of [undefined, "", "insta gram", "<script>", "a".repeat(41), ["instagram"]]) assert.equal(parseSource(bad), undefined);
});

test("a Google sign-in counts as a sign-up only for a just-created account", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  assert.equal(isNewAccount("2026-10-26T11:59:30Z", now), true);
  assert.equal(isNewAccount("2026-10-20T11:59:30Z", now), false);
});

test("recording never throws and skips visits without a source", async () => {
  const recorded = [];
  recordAcquisition("PREVIEW", undefined, undefined, async (data) => { recorded.push(data); });
  recordAcquisition("PREVIEW", "instagram", undefined, async (data) => { recorded.push(data); });
  // A missing table rejects; the request must not notice.
  recordAcquisition("SIGNUP", "instagram", "user-1", async () => { throw new Error('relation "AcquisitionEvent" does not exist'); });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(recorded, [{ kind: "PREVIEW", source: "instagram", userId: undefined }]);
});

test("a campaign link opens the questions and tags previews and sign-ups", async () => {
  const [capture, main, app, preview, auth, previewController, authController, migration, funnel] = await Promise.all([
    readFile("frontend/src/services/acquisition.ts", "utf8"),
    readFile("frontend/src/main.tsx", "utf8"),
    readFile("frontend/src/App.tsx", "utf8"),
    readFile("frontend/src/services/planPreviewService.ts", "utf8"),
    readFile("frontend/src/services/authService.ts", "utf8"),
    readFile("src/controllers/plan-preview.controller.ts", "utf8"),
    readFile("src/controllers/auth.controller.ts", "utf8"),
    readFile("prisma/migrations/20261026120000_add_acquisition_events/migration.sql", "utf8"),
    readFile("frontend/src/components/admin/AdminFunnel.tsx", "utf8"),
  ]);
  // alyvora.vercel.app/?comecar&origem=instagram
  assert.match(capture, /query\.get\('origem'\)/);
  assert.match(capture, /startRequested = query\.has\('comecar'\)/);
  assert.match(capture, /window\.history\.replaceState/);
  assert.match(main, /captureAcquisitionFromUrl\(\)\s*\n[\s\S]*createRoot/);
  assert.match(app, /getToken\(\) \? 'checking-profile' : startRequestedFromLink\(\) \? 'onboarding' : 'landing'/);
  // The tag rides on the URL so a stricter, older API still accepts the body.
  assert.match(preview, /withSource\('\/api\/plan-preview'\)/);
  assert.match(auth, /withSource\('\/auth\/register'\)/);
  assert.match(auth, /withSource\('\/auth\/google\/code'\)/);
  assert.match(previewController, /recordAcquisition\("PREVIEW", parseSource\(request\.query\?\.source\)\)/);
  assert.match(authController, /recordAcquisition\("SIGNUP", parseSource\(request\.query\?\.source\), user\.id\)/);
  assert.match(authController, /if \(isNewAccount\(session\.user\.createdAt\)\) recordAcquisition\("SIGNUP"/);
  assert.match(migration, /CREATE TABLE "AcquisitionEvent"/);
  assert.match(funnel, /\/\?comecar&origem=instagram/);
  assert.match(funnel, /<h3>De onde vieram<\/h3>/);
});
