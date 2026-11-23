import { Router } from "express";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as c from "./controller.js";
import {
  HeartbeatRequestSchema,
  HeartbeatResponseSchema,
  PresenceSchema,
  SettingsSchema,
  TeamQuerySchema,
  TeamRowSchema,
  TimelineQuerySchema,
  TimelineSchema,
  UpdateSettingsRequestSchema,
} from "./schema.js";

// Contract: specs/029-activity-presence/contracts/activity-api.md. Scope (FR-005) is enforced in
// service.ts. Only a state is ever accepted — no content, apps or URLs (FR-012).
export const activityRouter = Router();
activityRouter.use(authenticate);
const TAG = "Activity & Presence";

activityRouter.post("/heartbeat", validate(HeartbeatRequestSchema), handle(c.heartbeat));
activityRouter.get("/settings", handle(c.getSettings));
activityRouter.put("/settings", authorize("ADMIN", "HR"), validate(UpdateSettingsRequestSchema), handle(c.updateSettings));
activityRouter.get("/presence", handle(c.presence));
activityRouter.get("/timeline", handle(c.timeline));
activityRouter.get("/team", authorize("ADMIN", "HR", "MANAGER"), handle(c.team));

const p = "/activity";
documentRoute({ method: "post", path: `${p}/heartbeat`, tag: TAG, status: 202, description: "Report your current state (server-timestamped; ≥20 s apart unless the state changes).", body: HeartbeatRequestSchema, response: HeartbeatResponseSchema });
documentRoute({ method: "get", path: `${p}/settings`, tag: TAG, description: "Tracking enabled flag and idle threshold.", response: SettingsSchema });
documentRoute({ method: "put", path: `${p}/settings`, tag: TAG, description: "Enable/disable tracking, set the idle threshold (1–60 min). Admin/HR.", body: UpdateSettingsRequestSchema, response: SettingsSchema });
documentRoute({ method: "get", path: `${p}/presence`, tag: TAG, description: "Live status (Active/Away/Offline): self; Manager adds direct reports; HR/Admin everyone.", response: z.array(PresenceSchema) });
documentRoute({ method: "get", path: `${p}/timeline`, tag: TAG, description: "One person's activity stretches and totals for a date (default: you, today).", query: TimelineQuerySchema, response: TimelineSchema });
documentRoute({ method: "get", path: `${p}/team`, tag: TAG, description: "Each visible person's status and day totals. Manager (direct reports) / HR/Admin (all).", query: TeamQuerySchema, response: z.array(TeamRowSchema) });
