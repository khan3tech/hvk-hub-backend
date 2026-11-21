import { z } from "zod";

// Request/response validation for the notifications module (specs/006-notifications).
export const NotificationTypeSchema = z.enum([
  "LEAVE_DECIDED",
  "LEAVE_PENDING_APPROVAL",
  "PAYROLL_RUN_COMPLETED",
  "INTERVIEW_SCHEDULED",
  "INTERVIEW_RESULT_RECORDED",
  "SIGNATURE_REQUESTED",
  "RESIGNATION_SUBMITTED",
  "RESIGNATION_ACKNOWLEDGED",
  "EXIT_DUE",
  "GOAL_SUBMITTED",
  "GOAL_DECIDED",
  "REVIEW_FINALIZED",
  "EXPENSE_SUBMITTED",
  "EXPENSE_DECIDED",
  "TICKET_RAISED",
  "TICKET_ASSIGNED",
  "TICKET_UPDATED",
  "SURVEY_SENT",
  "REFERRAL_UPDATED",
  // 028-time-tracker
  "TIMESHEET_SUBMITTED",
  "TIMESHEET_DECIDED",
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationSchema = z.object({
  id: z.string(),
  type: z.string(),
  message: z.string(),
  link: z.string().nullable(),
  read: z.boolean(),
  createdAt: z.string().datetime(),
});

export const NotificationListQuerySchema = z.object({
  unreadOnly: z.enum(["true", "false"]).optional(),
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const NotificationListResponseSchema = z.object({
  items: z.array(NotificationSchema),
  unreadCount: z.number().int(),
});

export const UnreadCountResponseSchema = z.object({ unreadCount: z.number().int() });
