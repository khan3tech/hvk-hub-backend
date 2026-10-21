// Parses/validates the request (via schema.ts + the validate middleware),
// calls one or more services, and shapes the HTTP response. No business
// logic here — see specs/005-recruitment-ats/spec.md for what this module must do.
import type { Request, Response } from "express";
import { orgOf } from "../../lib/tenant.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

function getOrgId(req: Request): string {
  return orgOf(req);
}

function actorOf(req: Request) {
  return req.user as AccessTokenPayload;
}

function idParam(req: Request): string {
  return req.params.id ?? "";
}

export async function createJobPosting(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.createJobPosting(getOrgId(req), req.body, actorOf(req)));
}

export async function listJobPostings(req: Request, res: Response): Promise<void> {
  const { status, departmentId } = req.query as Record<string, string | undefined>;
  res.json(await service.listJobPostings(getOrgId(req), actorOf(req), { status, departmentId }));
}

export async function getJobPosting(req: Request, res: Response): Promise<void> {
  res.json(await service.getJobPosting(getOrgId(req), idParam(req), actorOf(req)));
}

export async function updateJobPosting(req: Request, res: Response): Promise<void> {
  res.json(await service.updateJobPosting(getOrgId(req), idParam(req), req.body, actorOf(req)));
}

export async function listApplicationsForPosting(req: Request, res: Response): Promise<void> {
  res.json(await service.listApplicationsForPosting(getOrgId(req), idParam(req), actorOf(req)));
}

export async function createCandidate(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.createCandidate(getOrgId(req), req.body, actorOf(req)));
}

export async function searchCandidates(req: Request, res: Response): Promise<void> {
  const { q } = req.query as Record<string, string | undefined>;
  res.json(await service.searchCandidates(getOrgId(req), q));
}

export async function getCandidate(req: Request, res: Response): Promise<void> {
  res.json(await service.getCandidate(getOrgId(req), idParam(req)));
}

export async function createApplication(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.createApplication(getOrgId(req), req.body, actorOf(req)));
}

export async function getApplication(req: Request, res: Response): Promise<void> {
  res.json(await service.getApplication(getOrgId(req), idParam(req), actorOf(req)));
}

export async function moveApplicationStage(req: Request, res: Response): Promise<void> {
  res.json(
    await service.moveApplicationStage(getOrgId(req), idParam(req), req.body.stage, actorOf(req)),
  );
}

export async function scheduleInterview(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.scheduleInterview(getOrgId(req), idParam(req), req.body, actorOf(req)));
}

export async function reassignInterview(req: Request, res: Response): Promise<void> {
  res.json(
    await service.reassignInterview(getOrgId(req), idParam(req), req.body.interviewerId, actorOf(req)),
  );
}

export async function recordInterviewResult(req: Request, res: Response): Promise<void> {
  res.json(await service.recordInterviewResult(getOrgId(req), idParam(req), req.body, actorOf(req)));
}

export async function listMyInterviews(req: Request, res: Response): Promise<void> {
  res.json(await service.listMyInterviews(getOrgId(req), actorOf(req)));
}
