import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { orgOf } from "../../lib/tenant.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

// FR-010: every succession route is HR/Admin only. Contract: contracts/succession-api.md.
export const successionRouter = Router();
successionRouter.use(authenticate, authorize("ADMIN", "HR"));
const TAG = "Succession Planning";

const Readiness = z.enum(["READY_NOW", "READY_1_2_YEARS", "DEVELOPING"]);
const AddSuccessorSchema = z.object({ employeeId: z.string(), readinessLevel: Readiness, note: z.string().trim().max(2000).optional() });
const ReadinessSchema = z.object({ readinessLevel: Readiness, note: z.string().trim().max(2000).optional() });
const actorOf = (req: Request) => req.user as AccessTokenPayload;
const id = (req: Request) => req.params.id ?? "";

successionRouter.get("/overview", handle(async (req: Request, res: Response) => {
  res.json(await service.overview(orgOf(req), { departmentId: typeof req.query.departmentId === "string" ? req.query.departmentId : undefined }));
}));
successionRouter.get("/positions/:id", handle(async (req: Request, res: Response) => {
  res.json(await service.getPlan(orgOf(req), id(req)));
}));
successionRouter.put("/positions/:id", handle(async (req: Request, res: Response) => {
  res.json(await service.markCritical(orgOf(req), id(req), actorOf(req)));
}));
successionRouter.delete("/positions/:id", handle(async (req: Request, res: Response) => {
  res.json(await service.unmarkCritical(orgOf(req), id(req), actorOf(req)));
}));
successionRouter.post("/positions/:id/successors", validate(AddSuccessorSchema), handle(async (req: Request, res: Response) => {
  res.status(201).json(await service.addSuccessor(orgOf(req), id(req), req.body, actorOf(req)));
}));
successionRouter.patch("/successors/:id", validate(ReadinessSchema), handle(async (req: Request, res: Response) => {
  res.json(await service.updateReadiness(orgOf(req), id(req), req.body, actorOf(req)));
}));
successionRouter.delete("/successors/:id", handle(async (req: Request, res: Response) => {
  res.json(await service.removeSuccessor(orgOf(req), id(req), actorOf(req)));
}));

const idp = z.object({ id: z.string() });
documentRoute({ method: "get", path: "/succession/overview", tag: TAG, description: "Critical positions grouped by risk (NO_COVERAGE / NOT_READY / READY_NOW), plus successors covering several positions. Admin/HR.", query: z.object({ departmentId: z.string().optional() }) });
documentRoute({ method: "get", path: "/succession/positions/{id}", tag: TAG, description: "The succession plan for an employee's position, with successors and readiness history. Admin/HR.", params: idp });
documentRoute({ method: "put", path: "/succession/positions/{id}", tag: TAG, description: "Mark an active employee's position critical. Admin/HR.", params: idp });
documentRoute({ method: "delete", path: "/succession/positions/{id}", tag: TAG, description: "Unmark a position as critical; the plan is kept. Admin/HR.", params: idp });
documentRoute({ method: "post", path: "/succession/positions/{id}/successors", tag: TAG, description: "Add an active employee as a successor with a readiness level. Admin/HR.", params: idp, body: AddSuccessorSchema });
documentRoute({ method: "patch", path: "/succession/successors/{id}", tag: TAG, description: "Change a successor's readiness level (history kept). Admin/HR.", params: idp, body: ReadinessSchema });
documentRoute({ method: "delete", path: "/succession/successors/{id}", tag: TAG, description: "Take a successor off the plan (kept as not valid). Admin/HR.", params: idp });
