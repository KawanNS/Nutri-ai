import { Router } from "express";
import { caktoWebhookController } from "../controllers/cakto-webhook.controller.js";

const caktoWebhookRouter = Router();
caktoWebhookRouter.post("/", caktoWebhookController);

export { caktoWebhookRouter };
