import express from "express";

import { authRouter } from "./routes/auth.routes.js";
import { profileRouter } from "./routes/profile.routes.js";
import { usageControlRouter } from "./routes/usage-control.routes.js";

const app = express();

app.use(express.json());

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/api/profile", profileRouter);
app.use("/api/usage", usageControlRouter);

export { app };
