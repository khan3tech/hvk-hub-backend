import { Router } from "express";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as c from "./controller.js";
import { CreateSurveyRequestSchema, SubmitResponseRequestSchema } from "./schema.js";

// Contract: specs/018-employee-engagement-surveys/contracts/surveys-api.md. Anonymity is enforced
// in the repository (no response→person link) and results thresholds in service.ts.
export const surveysRouter = Router();
surveysRouter.use(authenticate);
const HR = authorize("ADMIN", "HR");
const TAG = "Engagement Surveys";

surveysRouter.get("/pending", handle(c.pending));
surveysRouter.post("/:id/responses", validate(SubmitResponseRequestSchema), handle(c.submit));
surveysRouter.get("/trend", HR, handle(c.trend));
surveysRouter.post("/", HR, validate(CreateSurveyRequestSchema), handle(c.create));
surveysRouter.get("/", HR, handle(c.list));
surveysRouter.get("/:id", HR, handle(c.get));
surveysRouter.post("/:id/close", HR, handle(c.close));
surveysRouter.get("/:id/results", HR, handle(c.results));

const id = z.object({ id: z.string() });
documentRoute({ method: "get", path: "/surveys/pending", tag: TAG, description: "Open surveys sent to you that you haven't answered." });
documentRoute({ method: "post", path: "/surveys/{id}/responses", tag: TAG, description: "Submit your anonymous response (once). Every eNPS question needs a 0-10 score.", params: id, body: SubmitResponseRequestSchema });
documentRoute({ method: "get", path: "/surveys/trend", tag: TAG, description: "eNPS and response rate per survey, chronological. Admin/HR." });
documentRoute({ method: "post", path: "/surveys", tag: TAG, description: "Create and send a survey (questions fixed; audience = active employees now). Admin/HR.", body: CreateSurveyRequestSchema });
documentRoute({ method: "get", path: "/surveys", tag: TAG, description: "Surveys with response counts and rates. Admin/HR." });
documentRoute({ method: "get", path: "/surveys/{id}", tag: TAG, description: "One survey. Admin/HR.", params: id });
documentRoute({ method: "post", path: "/surveys/{id}/close", tag: TAG, status: 200, description: "Close a survey. Admin/HR.", params: id });
documentRoute({ method: "get", path: "/surveys/{id}/results", tag: TAG, description: "Aggregated results, withheld below the survey's minimum response count. Admin/HR.", params: id });
