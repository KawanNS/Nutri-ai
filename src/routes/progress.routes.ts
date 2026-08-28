import { Router } from "express";

import {
  createProgressEntryController,
  getProgressEntryController,
  listProgressEntriesController,
} from "../controllers/progress.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const progressRouter = Router();

progressRouter.use(authenticate);
progressRouter.post("/", createProgressEntryController);
progressRouter.get("/", listProgressEntriesController);
progressRouter.get("/:id", getProgressEntryController);

export { progressRouter };
