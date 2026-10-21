import { Router } from "express";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import * as c from "./controller.js";

// FR-009: company-wide analytics are HR/Admin only (no Manager-scoped version in v1.1).
// Contract: specs/011-hr-analytics-reporting/contracts/analytics-api.md.
export const analyticsRouter = Router();
analyticsRouter.use(authenticate, authorize("ADMIN", "HR"));
const TAG = "HR Analytics";

analyticsRouter.get("/headcount", handle(c.headcount));
analyticsRouter.get("/attrition", handle(c.attrition));
analyticsRouter.get("/leave-usage", handle(c.leaveUsage));
analyticsRouter.get("/payroll-cost", handle(c.payrollCost));

const rangeQuery = z.object({
  from: z.string().optional().openapi({ description: "YYYY-MM-DD (default: 12 months back)" }),
  to: z.string().optional().openapi({ description: "YYYY-MM-DD (default: today)" }),
  format: z.enum(["json", "csv"]).optional(),
});
documentRoute({ method: "get", path: "/analytics/headcount", tag: TAG, description: "Current headcount by department and designation (Unassigned bucket included) plus a month-end trend with joins/exits.", query: rangeQuery });
documentRoute({ method: "get", path: "/analytics/attrition", tag: TAG, description: "Exits, average headcount and attrition % for the range, by department, plus average tenure of the active workforce.", query: rangeQuery });
documentRoute({ method: "get", path: "/analytics/leave-usage", tag: TAG, description: "Approved leave days per leave type (by start date), optionally for one department.", query: rangeQuery.extend({ departmentId: z.string().optional() }) });
documentRoute({ method: "get", path: "/analytics/payroll-cost", tag: TAG, description: "Gross, statutory and net pay per payroll period (reflects re-runs).", query: z.object({ from: z.string().optional().openapi({ description: "YYYY-MM" }), to: z.string().optional().openapi({ description: "YYYY-MM" }), format: z.enum(["json", "csv"]).optional() }) });
