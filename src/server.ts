import { app } from "./app.js";
import { checkAIReadiness } from "./services/ai-readiness.service.js";

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  void checkAIReadiness().then((readiness) => {
    const payload = JSON.stringify({
      status: readiness.status,
      mode: readiness.mode,
      provider: readiness.provider,
      code: readiness.code,
    });
    if (readiness.ready) console.info("[ai-readiness]", payload);
    else console.warn("[ai-readiness]", payload);
  }).catch(() => {
    console.warn(
      "[ai-readiness]",
      JSON.stringify({
        status: "UNAVAILABLE",
        mode: "GATEWAY",
        provider: "GEMINI",
        code: "AI_GATEWAY_UNAVAILABLE",
      }),
    );
  });
});
