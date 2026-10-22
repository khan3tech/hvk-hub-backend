import { Router } from "express";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./controller.js";
import {
  ApplicationDetailSchema,
  ApplicationSchema,
  CandidateSchema,
  CreateApplicationRequestSchema,
  CreateCandidateRequestSchema,
  CreateJobPostingRequestSchema,
  InterviewRoundSchema,
  JobPostingSchema,
  ReassignInterviewRequestSchema,
  RecordInterviewResultRequestSchema,
  ScheduleInterviewRequestSchema,
  UpdateApplicationStageRequestSchema,
  UpdateJobPostingRequestSchema,
} from "./schema.js";

// Declares this module's endpoints, attaches auth + RBAC middleware, and delegates to
// controller.ts. Contract: specs/005-recruitment-ats/contracts/recruitment-api.md.
// Department scoping for Managers (FR-008, SC-005) is enforced in service.ts.
export const recruitmentRouter = Router();
const HR = authorize("ADMIN", "HR");
const TAG = "Recruitment";
const idParams = z.object({ id: z.string() });

recruitmentRouter.get("/postings", authenticate, handle(controller.listJobPostings));
recruitmentRouter.post("/postings", authenticate, HR, validate(CreateJobPostingRequestSchema), handle(controller.createJobPosting));
recruitmentRouter.get("/postings/:id", authenticate, handle(controller.getJobPosting));
recruitmentRouter.patch("/postings/:id", authenticate, HR, validate(UpdateJobPostingRequestSchema), handle(controller.updateJobPosting));
recruitmentRouter.get("/postings/:id/applications", authenticate, authorize("ADMIN", "HR", "MANAGER"), handle(controller.listApplicationsForPosting));

recruitmentRouter.get("/candidates", authenticate, HR, handle(controller.searchCandidates));
recruitmentRouter.post("/candidates", authenticate, HR, validate(CreateCandidateRequestSchema), handle(controller.createCandidate));
recruitmentRouter.get("/candidates/:id", authenticate, HR, handle(controller.getCandidate));
recruitmentRouter.delete("/candidates/:id", authenticate, HR, handle(controller.deleteCandidate));

recruitmentRouter.post("/applications", authenticate, HR, validate(CreateApplicationRequestSchema), handle(controller.createApplication));
recruitmentRouter.get("/applications/:id", authenticate, authorize("ADMIN", "HR", "MANAGER"), handle(controller.getApplication));
recruitmentRouter.patch("/applications/:id/stage", authenticate, authorize("ADMIN", "HR", "MANAGER"), validate(UpdateApplicationStageRequestSchema), handle(controller.moveApplicationStage));
recruitmentRouter.post("/applications/:id/interviews", authenticate, HR, validate(ScheduleInterviewRequestSchema), handle(controller.scheduleInterview));

recruitmentRouter.get("/interviews/me", authenticate, handle(controller.listMyInterviews));
recruitmentRouter.patch("/interviews/:id/interviewer", authenticate, HR, validate(ReassignInterviewRequestSchema), handle(controller.reassignInterview));
recruitmentRouter.post("/interviews/:id/result", authenticate, validate(RecordInterviewResultRequestSchema), handle(controller.recordInterviewResult));

documentRoute({ method: "get", path: "/recruitment/postings", tag: TAG, description: "List job postings: open ones for everyone; all statuses for HR/Admin and for a Manager's own department.", query: z.object({ status: z.string().optional(), departmentId: z.string().optional() }), response: z.array(JobPostingSchema) });
documentRoute({ method: "post", path: "/recruitment/postings", tag: TAG, description: "Create a job posting (status OPEN). Admin/HR only.", body: CreateJobPostingRequestSchema, response: JobPostingSchema });
documentRoute({ method: "get", path: "/recruitment/postings/{id}", tag: TAG, description: "Get one job posting.", params: idParams, response: JobPostingSchema });
documentRoute({ method: "patch", path: "/recruitment/postings/{id}", tag: TAG, description: "Change a posting's status and/or openings. Admin/HR only.", params: idParams, body: UpdateJobPostingRequestSchema, response: JobPostingSchema });
documentRoute({ method: "get", path: "/recruitment/postings/{id}/applications", tag: TAG, description: "The posting's pipeline. Admin/HR, or a Manager of the posting's department.", params: idParams, response: z.array(ApplicationSchema) });
documentRoute({ method: "get", path: "/recruitment/candidates", tag: TAG, description: "Search candidates by name or email. Admin/HR only.", query: z.object({ q: z.string().optional() }), response: z.array(CandidateSchema) });
documentRoute({ method: "post", path: "/recruitment/candidates", tag: TAG, description: "Add a candidate. Admin/HR only.", body: CreateCandidateRequestSchema, response: CandidateSchema });
documentRoute({ method: "get", path: "/recruitment/candidates/{id}", tag: TAG, description: "Get one candidate. Admin/HR only.", params: idParams, response: CandidateSchema });
documentRoute({ method: "delete", path: "/recruitment/candidates/{id}", tag: TAG, status: 204, description: "Delete a candidate and their applications, interviews and documents (data-subject request). Admin/HR.", params: idParams });
documentRoute({ method: "post", path: "/recruitment/applications", tag: TAG, description: "Apply a candidate to an open posting (starts at APPLIED). Admin/HR only; duplicates are rejected.", body: CreateApplicationRequestSchema, response: ApplicationSchema });
documentRoute({ method: "get", path: "/recruitment/applications/{id}", tag: TAG, description: "Application with candidate, posting and every interview round.", params: idParams, response: ApplicationDetailSchema });
documentRoute({ method: "patch", path: "/recruitment/applications/{id}/stage", tag: TAG, description: "Move an application to any stage (Admin/HR, including corrections) or, for a Manager, within their department while not final.", params: idParams, body: UpdateApplicationStageRequestSchema, response: ApplicationSchema });
documentRoute({ method: "post", path: "/recruitment/applications/{id}/interviews", tag: TAG, description: "Schedule an interview round (application must be in INTERVIEW). Admin/HR only.", params: idParams, body: ScheduleInterviewRequestSchema, response: InterviewRoundSchema });
documentRoute({ method: "get", path: "/recruitment/interviews/me", tag: TAG, description: "Interview rounds assigned to the caller." });
documentRoute({ method: "patch", path: "/recruitment/interviews/{id}/interviewer", tag: TAG, description: "Reassign a pending interview round. Admin/HR only.", params: idParams, body: ReassignInterviewRequestSchema, response: InterviewRoundSchema });
documentRoute({ method: "post", path: "/recruitment/interviews/{id}/result", tag: TAG, status: 200, description: "Record a round's result. Assigned interviewer or Admin/HR only; once.", params: idParams, body: RecordInterviewResultRequestSchema, response: InterviewRoundSchema });
