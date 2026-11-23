// Parses the request, calls the service, shapes the response (specs/028-time-tracker).
import type { Request, Response } from "express";
import type { z } from "zod";
import { DomainError } from "../../middleware/errorHandler.js";
import { orgOf } from "../../lib/tenant.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";
import { EntriesQuerySchema, ReportQuerySchema, TeamQuerySchema, WeekQuerySchema } from "./schema.js";

const actorOf = (req: Request) => req.user as AccessTokenPayload;
const param = (req: Request, name: string) => req.params[name] ?? "";
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

// Query strings are validated here (validate() covers bodies only) → 400 like a bad body.
function parseQuery<S extends z.ZodTypeAny>(schema: S, req: Request): z.infer<S> {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    throw new DomainError("VALIDATION_ERROR", "Query parameters failed validation.", 400, result.error.flatten().fieldErrors as Record<string, string[]>);
  }
  return result.data;
}

// Projects & tasks
export async function listProjects(req: Request, res: Response) {
  res.json(await service.listProjects(orgOf(req), actorOf(req), { status: str(req.query.status), mine: req.query.mine === "true" }));
}
export async function createProject(req: Request, res: Response) {
  res.status(201).json(await service.createProject(orgOf(req), req.body, actorOf(req)));
}
export async function getProject(req: Request, res: Response) {
  res.json(await service.getProject(orgOf(req), param(req, "id"), actorOf(req)));
}
export async function updateProject(req: Request, res: Response) {
  res.json(await service.updateProject(orgOf(req), param(req, "id"), req.body, actorOf(req)));
}
export async function createTask(req: Request, res: Response) {
  res.status(201).json(await service.createTask(orgOf(req), param(req, "id"), req.body.name, actorOf(req)));
}
export async function updateTask(req: Request, res: Response) {
  res.json(await service.updateTask(orgOf(req), param(req, "id"), req.body, actorOf(req)));
}
export async function addMembers(req: Request, res: Response) {
  res.json(await service.addMembers(orgOf(req), param(req, "id"), req.body.employeeIds, actorOf(req)));
}
export async function removeMember(req: Request, res: Response) {
  res.json(await service.removeMember(orgOf(req), param(req, "id"), param(req, "employeeId"), actorOf(req)));
}

// Entries
export async function listEntries(req: Request, res: Response) {
  res.json(await service.listEntries(orgOf(req), actorOf(req), parseQuery(EntriesQuerySchema, req)));
}
export async function createEntry(req: Request, res: Response) {
  res.status(201).json(await service.createEntry(orgOf(req), req.body, actorOf(req)));
}
export async function updateEntry(req: Request, res: Response) {
  res.json(await service.updateEntry(orgOf(req), param(req, "id"), req.body, actorOf(req)));
}
export async function deleteEntry(req: Request, res: Response) {
  await service.deleteEntry(orgOf(req), param(req, "id"), actorOf(req));
  res.status(204).end();
}

// Timer
export async function getTimer(req: Request, res: Response) {
  res.json(await service.getTimer(orgOf(req), actorOf(req)));
}
export async function startTimer(req: Request, res: Response) {
  res.status(201).json(await service.startTimer(orgOf(req), req.body, actorOf(req)));
}
export async function stopTimer(req: Request, res: Response) {
  res.json(await service.stopTimer(orgOf(req), req.body ?? {}, actorOf(req)));
}
export async function updateTimer(req: Request, res: Response) {
  res.json(await service.updateTimerNote(orgOf(req), req.body.note, actorOf(req)));
}
export async function trimTimer(req: Request, res: Response) {
  res.json(await service.trimTimer(orgOf(req), req.body.minutes, actorOf(req)));
}
export async function discardTimer(req: Request, res: Response) {
  await service.discardTimer(orgOf(req), actorOf(req));
  res.status(204).end();
}

// Timesheets
export async function getWeek(req: Request, res: Response) {
  res.json(await service.getWeek(orgOf(req), actorOf(req), parseQuery(WeekQuerySchema, req)));
}
export async function submitWeek(req: Request, res: Response) {
  res.json(await service.submitWeek(orgOf(req), req.body.weekStart, actorOf(req)));
}
export async function teamWeek(req: Request, res: Response) {
  res.json(await service.teamWeek(orgOf(req), actorOf(req), parseQuery(TeamQuerySchema, req)));
}
export async function approve(req: Request, res: Response) {
  res.json(await service.approveTimesheet(orgOf(req), param(req, "id"), actorOf(req)));
}
export async function reject(req: Request, res: Response) {
  res.json(await service.rejectTimesheet(orgOf(req), param(req, "id"), req.body.reason, actorOf(req)));
}
export async function reopen(req: Request, res: Response) {
  res.json(await service.reopenTimesheet(orgOf(req), param(req, "id"), req.body.reason, actorOf(req)));
}

// Reports
export async function hoursReport(req: Request, res: Response) {
  const q = parseQuery(ReportQuerySchema, req);
  res.json(await service.hoursReport(orgOf(req), actorOf(req), { ...q, approvedOnly: q.approvedOnly === "true" }));
}
