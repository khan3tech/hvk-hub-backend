import { Router } from "express";

// Declares this module's endpoints, attaches auth + RBAC middleware, and
// delegates to controller.ts. See the API endpoint catalog for recruitment in
// teamloom-system-design.html and specs/005-recruitment-ats/spec.md for requirements.
export const recruitmentRouter = Router();
