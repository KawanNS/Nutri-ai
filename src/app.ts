import cors from "cors";
import express from "express";

import { env } from "./config/env.js";
import {
  createReadinessController,
  livenessController,
} from "./controllers/health.controller.js";
import { authRouter } from "./routes/auth.routes.js";
import { mealPlanRouter } from "./routes/meal-plan.routes.js";
import { profileRouter } from "./routes/profile.routes.js";
import { progressRouter } from "./routes/progress.routes.js";
import { usageControlRouter } from "./routes/usage-control.routes.js";
import { billingRouter } from "./routes/billing.routes.js";
import { caktoWebhookRouter } from "./routes/cakto-webhook.routes.js";
import { aiRouterAdminRouter } from "./routes/ai-router-admin.routes.js";
import { chatRouter } from "./routes/chat.routes.js";
import { mealPhotoRouter } from "./routes/meal-photo.routes.js";
import { foodLogRouter } from "./routes/food-log.routes.js";
import { planPreviewRouter } from "./routes/plan-preview.routes.js";

const app = express();

// Render (and most hosts) put one load balancer in front of the app: trust its X-Forwarded-For hop so
// request.ip is the visitor, not the proxy, and per-address rate limits (auth, plan preview) work.
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || origin === env.frontendUrl);
    },
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
  }),
);
app.use("/webhooks/cakto", caktoWebhookRouter);
app.use(express.json());

app.get("/health", livenessController);
app.get("/ready", createReadinessController());

app.use("/auth", authRouter);
app.use("/api/meal-plans", mealPlanRouter);
app.use("/api/profile", profileRouter);
app.use("/api/progress", progressRouter);
app.use("/api/usage", usageControlRouter);
app.use("/api/billing", billingRouter);
app.use("/api/chat", chatRouter);
app.use("/api/meal-photo", mealPhotoRouter);
app.use("/api/food-logs", foodLogRouter);
app.use("/api/plan-preview", planPreviewRouter);
app.use("/api/admin/ai-router", aiRouterAdminRouter);

export { app };
