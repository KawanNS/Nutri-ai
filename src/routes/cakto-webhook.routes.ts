import express, { Router } from "express";
import { caktoWebhookController } from "../controllers/cakto-webhook.controller.js";

const caktoWebhookRouter = Router();
caktoWebhookRouter.post(
  "/",
  express.raw({ type: "application/json", limit: "1mb" }),
  caktoWebhookController,
);

export { caktoWebhookRouter };
