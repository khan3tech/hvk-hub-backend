import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { orgOf } from "../../lib/tenant.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { uploadFile } from "../../middleware/upload.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

// Contract: specs/023-learning-development/contracts/learning-api.md.
export const learningRouter = Router();
learningRouter.use(authenticate);
const HR = authorize("ADMIN", "HR");
const TAG = "Learning & Development";

const CourseFields = {
  description: z.string().trim().max(5000).nullable().optional(),
  contentUrl: z.string().trim().url().max(2000).nullable().optional(),
  requiresProof: z.boolean().optional(),
  isComplianceRequired: z.boolean().optional(),
};
const CreateCourseSchema = z.object({ title: z.string().trim().min(2).max(200), ...CourseFields });
const UpdateCourseSchema = z.object({ title: z.string().trim().min(2).max(200).optional(), ...CourseFields })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");
const AssignSchema = z.object({
  audience: z.enum(["COMPANY", "DEPARTMENT", "EMPLOYEES"]),
  departmentId: z.string().optional(),
  employeeIds: z.array(z.string()).max(1000).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const StatusQuery = z.enum(["INCOMPLETE", "COMPLETE", "OVERDUE"]);
const actorOf = (req: Request) => req.user as AccessTokenPayload;
const id = (req: Request) => req.params.id ?? "";
const q = (req: Request, k: string) => (typeof req.query[k] === "string" ? (req.query[k] as string) : undefined);

// Employees: own learning list and completion (FR-003).
learningRouter.get("/me", handle(async (req: Request, res: Response) => {
  res.json(await service.myAssignments(orgOf(req), actorOf(req)));
}));
learningRouter.get("/assignments/:id", handle(async (req: Request, res: Response) => {
  res.json(await service.getAssignment(orgOf(req), id(req), actorOf(req)));
}));
learningRouter.post("/assignments/:id/complete", uploadFile(false), handle(async (req: Request, res: Response) => {
  res.json(await service.complete(orgOf(req), id(req), req.file, actorOf(req)));
}));

// HR/Admin: courses, assignment, tracking, compliance.
learningRouter.get("/courses", HR, handle(async (req: Request, res: Response) => {
  const archived = q(req, "archived");
  res.json(await service.listCourses(orgOf(req), archived === undefined ? undefined : archived === "true"));
}));
learningRouter.post("/courses", HR, validate(CreateCourseSchema), handle(async (req: Request, res: Response) => {
  res.status(201).json(await service.createCourse(orgOf(req), req.body, actorOf(req)));
}));
learningRouter.get("/courses/:id", HR, handle(async (req: Request, res: Response) => {
  res.json(await service.getCourse(orgOf(req), id(req)));
}));
learningRouter.patch("/courses/:id", HR, validate(UpdateCourseSchema), handle(async (req: Request, res: Response) => {
  res.json(await service.updateCourse(orgOf(req), id(req), req.body, actorOf(req)));
}));
learningRouter.post("/courses/:id/archive", HR, handle(async (req: Request, res: Response) => {
  res.json(await service.archiveCourse(orgOf(req), id(req), actorOf(req)));
}));
learningRouter.post("/courses/:id/assign", HR, validate(AssignSchema), handle(async (req: Request, res: Response) => {
  res.status(201).json(await service.assign(orgOf(req), id(req), req.body, actorOf(req)));
}));
learningRouter.get("/assignments", HR, handle(async (req: Request, res: Response) => {
  const status = StatusQuery.safeParse(q(req, "status"));
  res.json(await service.listAssignments(orgOf(req), { courseId: q(req, "courseId"), employeeId: q(req, "employeeId"), status: status.success ? status.data : undefined }));
}));
learningRouter.get("/compliance", HR, handle(async (req: Request, res: Response) => {
  res.json(await service.complianceDashboard(orgOf(req)));
}));

const idp = z.object({ id: z.string() });
documentRoute({ method: "get", path: "/learning/me", tag: TAG, description: "My assigned courses with status (INCOMPLETE / COMPLETE / OVERDUE)." });
documentRoute({ method: "get", path: "/learning/assignments/{id}", tag: TAG, description: "One assignment (assignee or Admin/HR).", params: idp });
documentRoute({ method: "post", path: "/learning/assignments/{id}/complete", tag: TAG, status: 200, description: "Mark my assignment complete. Multipart 'file' (PDF/PNG/JPEG/DOCX) is required when the course requires proof; stored as a document.", params: idp });
documentRoute({ method: "get", path: "/learning/courses", tag: TAG, description: "Courses. Admin/HR.", query: z.object({ archived: z.enum(["true", "false"]).optional() }) });
documentRoute({ method: "post", path: "/learning/courses", tag: TAG, description: "Create a course (external content link). Admin/HR.", body: CreateCourseSchema });
documentRoute({ method: "get", path: "/learning/courses/{id}", tag: TAG, description: "A course. Admin/HR.", params: idp });
documentRoute({ method: "patch", path: "/learning/courses/{id}", tag: TAG, description: "Update a course. Admin/HR.", params: idp, body: z.object({ title: z.string().optional(), ...CourseFields }) });
documentRoute({ method: "post", path: "/learning/courses/{id}/archive", tag: TAG, status: 200, description: "Archive a course: no new assignments, history kept. Admin/HR.", params: idp });
documentRoute({ method: "post", path: "/learning/courses/{id}/assign", tag: TAG, description: "Assign to the company, a department or employees, optionally with a due date. Employees with an open assignment are skipped. Admin/HR.", params: idp, body: AssignSchema });
documentRoute({ method: "get", path: "/learning/assignments", tag: TAG, description: "Assignments, filterable by course, employee and status. Admin/HR.", query: z.object({ courseId: z.string().optional(), employeeId: z.string().optional(), status: StatusQuery.optional() }) });
documentRoute({ method: "get", path: "/learning/compliance", tag: TAG, description: "Completed vs outstanding per compliance-required course across the active workforce, with overdue employees flagged. Admin/HR." });
