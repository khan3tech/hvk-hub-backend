import { z } from "zod";
import { isIsoDate } from "../timetracking/week.js";

// Request/response validation for activity & presence (specs/029-activity-presence).
export const ActivityStateSchema = z.enum(["ACTIVE", "IDLE", "LOCKED"]);
export const PresenceStatusSchema = z.enum(["ACTIVE", "AWAY", "OFFLINE"]);

export const HeartbeatRequestSchema = z.object({ state: ActivityStateSchema });

export const UpdateSettingsRequestSchema = z
  .object({ enabled: z.boolean().optional(), idleThresholdMinutes: z.number().int().min(1).max(60).optional() })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

const isoDate = z.string().refine(isIsoDate, "Use a YYYY-MM-DD date.");
export const TimelineQuerySchema = z.object({ employeeId: z.string().optional(), date: isoDate.optional() });
export const TeamQuerySchema = z.object({ date: isoDate.optional() });

export const SettingsSchema = z.object({ enabled: z.boolean(), idleThresholdMinutes: z.number().int() });
export const PresenceSchema = z.object({
  employeeId: z.string(),
  employeeName: z.string(),
  status: PresenceStatusSchema,
  state: ActivityStateSchema.nullable(),
  lastSeenAt: z.string().datetime().nullable(),
});
const DaySummary = {
  activeMinutes: z.number().int(),
  awayMinutes: z.number().int(),
  firstActiveAt: z.string().datetime().nullable(),
  lastActiveAt: z.string().datetime().nullable(),
};
export const TimelineSchema = z.object({
  employeeId: z.string(),
  employeeName: z.string(),
  date: z.string(),
  spans: z.array(z.object({ state: ActivityStateSchema, startedAt: z.string().datetime(), endedAt: z.string().datetime(), minutes: z.number().int() })),
  summary: z.object(DaySummary),
});
export const TeamRowSchema = z.object({
  employeeId: z.string(),
  employeeName: z.string(),
  status: PresenceStatusSchema,
  lastSeenAt: z.string().datetime().nullable(),
  ...DaySummary,
});
export const HeartbeatResponseSchema = z.object({ recorded: z.boolean(), presence: PresenceSchema.nullable(), settings: SettingsSchema });
