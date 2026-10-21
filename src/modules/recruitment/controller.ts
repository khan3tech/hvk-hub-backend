// Parses/validates the request (via schema.ts + the validate middleware),
// calls one or more services, and shapes the HTTP response. No business
// logic here — see specs/005-recruitment-ats/spec.md for what this module must do.
import type { Request, Response } from "express";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

function getOrgId(): string {
  return process.env.DEFAULT_ORG_ID ?? "default";
}

function actorOf(req: Request) {
  return req.user as AccessTokenPayload;
}

function idParam(req: Request): string {
  return req.params.id ?? "";
}

export async function createJobPosting(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.createJobPosting(getOrgId(), req.body, actorOf(req)));
}

export async function listJobPostings(req: Request, res: Response): Promise<void> {
  const { status, departmentId } = req.query as Record<string, string | undefined>;
  res.json(await service.listJobPostings(getOrgId(), actorOf(req), { status, departmentId }));
}

export async function getJobPosting(req: Request, res: Response): Promise<void> {
  res.json(await service.getJobPosting(getOrgId(), idParam(req), actorOf(req)));
}

export async function updateJobPosting(req: Request, res: Response): Promise<void> {
  res.json(await service.updateJobPosting(getOrgId(), idParam(req), req.body, actorOf(req)));
}

export async function listApplicationsForPosting(req: Request, res: Response): Promise<void> {
  res.json(await service.listApplicationsForPosting(getOrgId(), idParam(req), actorOf(req)));
}

export async function createCandidate(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.createCandidate(getOrgId(), req.body, actorOf(req)));
}

export async function searchCandidates(req: Request, res: Response): Promise<void> {
  const { q } = req.query as Record<string, string | undefined>;
  res.json(await service.searchCandidates(getOrgId(), q));
}

export async function getCandidate(req: Request, res: Response): Promise<void> {
  res.json(await service.getCandidate(getOrgId(), idParam(req)));
}

export async function createApplication(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.createApplication(getOrgId(), req.body, actorOf(req)));
}

export async function getApplication(req: Request, res: Response): Promise<void> {
  res.json(await service.getApplication(getOrgId(), idParam(req), actorOf(req)));
}

export async function moveApplicationStage(req: Request, res: Response): Promise<void> {
  res.json(
    await service.moveApplicationStage(getOrgId(), idParam(req), req.body.stage, actorOf(req)),
  );
}

export async function scheduleInterview(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.scheduleInterview(getOrgId(), idParam(req), req.body, actorOf(req)));
}

export async function reassignInterview(req: Request, res: Response): Promise<void> {
  res.json(
    await service.reassignInterview(getOrgId(), idParam(req), req.body.interviewerId, actorOf(req)),
  );
}

export async function recordInterviewResult(req: Request, res: Response): Promise<void> {
  res.json(await service.recordInterviewResult(getOrgId(), idParam(req), req.body, actorOf(req)));
}

export async function listMyInterviews(req: Request, res: Response): Promise<void> {
  res.json(await service.listMyInterviews(getOrgId(), actorOf(req)));
}
