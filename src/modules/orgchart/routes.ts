import { Router } from "express";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as c from "./controller.js";

// Contract: specs/016-org-chart-visualization/contracts/orgchart-api.md. Field-level visibility
// (FR-003) and the HR overlay (FR-008) are applied in service.ts.
export const orgChartRouter = Router();
orgChartRouter.use(authenticate);
const HR = authorize("ADMIN", "HR");
const TAG = "Org Chart";

orgChartRouter.get("/", handle(c.chart));
orgChartRouter.get("/search", handle(c.search));
orgChartRouter.get("/gaps", HR, handle(c.gaps));
orgChartRouter.put("/top", HR, validate(z.object({ employeeId: z.string().nullable() })), handle(c.setTop));
orgChartRouter.get("/nodes/:id/children", handle(c.children));

documentRoute({ method: "get", path: "/org-chart", tag: TAG, description: "Roots (designated top first) expanded to `depth` (default 2, max 6), the caller's path, and child counts for lazy expansion.", query: z.object({ depth: z.string().optional() }) });
documentRoute({ method: "get", path: "/org-chart/nodes/{id}/children", tag: TAG, description: "Expand a branch: direct reports (optionally deeper with ?depth).", params: z.object({ id: z.string() }), query: z.object({ depth: z.string().optional() }) });
documentRoute({ method: "get", path: "/org-chart/search", tag: TAG, description: "Name search; each match carries the root-to-node path to auto-expand. [] = no results.", query: z.object({ q: z.string() }) });
documentRoute({ method: "get", path: "/org-chart/gaps", tag: TAG, description: "HR/Admin overlay: orphaned employees, headless departments, reporting-line cycles." });
documentRoute({ method: "put", path: "/org-chart/top", tag: TAG, description: "Designate (or clear) the company's top position. Admin/HR.", body: z.object({ employeeId: z.string().nullable() }) });
