// Parses the request, calls the service, shapes the response (specs/010-statutory-payroll-tax).
import type { Request, Response } from "express";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

const orgId = () => process.env.DEFAULT_ORG_ID ?? "default";
const actorOf = (req: Request) => req.user as AccessTokenPayload;
const param = (req: Request, name: string) => req.params[name] ?? "";
const int = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined);

export async function listComponents(_req: Request, res: Response) {
  res.json(await service.listComponents(orgId()));
}
export async function createComponent(req: Request, res: Response) {
  res.status(201).json(await service.createComponent(orgId(), req.body, actorOf(req)));
}
export async function createVersion(req: Request, res: Response) {
  res.status(201).json(await service.createVersion(orgId(), param(req, "groupId"), req.body, actorOf(req)));
}
export async function listExemptions(req: Request, res: Response) {
  const { employeeId, groupId } = req.query as Record<string, string | undefined>;
  res.json(await service.listExemptions(orgId(), { employeeId, groupId }));
}
export async function createExemption(req: Request, res: Response) {
  res.status(201).json(await service.createExemption(orgId(), req.body, actorOf(req)));
}
export async function removeExemption(req: Request, res: Response) {
  await service.removeExemption(orgId(), param(req, "id"), actorOf(req));
  res.status(204).send();
}
export async function generateReport(req: Request, res: Response) {
  res.status(201).json(await service.generateReport(orgId(), req.body.periodMonth, req.body.periodYear, actorOf(req)));
}
export async function listReports(req: Request, res: Response) {
  res.json(await service.listReports(orgId(), { periodMonth: int(req.query.periodMonth), periodYear: int(req.query.periodYear) }));
}
export async function getReport(req: Request, res: Response) {
  res.json(await service.getReport(orgId(), param(req, "id")));
}
export async function exportReport(req: Request, res: Response) {
  const { filename, csv } = await service.exportReportCsv(orgId(), param(req, "id"));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(csv);
}
