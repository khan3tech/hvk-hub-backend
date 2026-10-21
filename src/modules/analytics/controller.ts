// Parses query parameters, calls the service, and returns JSON or CSV (?format=csv, FR-010).
import type { Request, Response } from "express";
import { orgOf } from "../../lib/tenant.js";
import * as service from "./service.js";

const orgId = (req: Request) => orgOf(req);
const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : undefined);

function respond(req: Request, res: Response, dashboard: string, data: Record<string, unknown>) {
  if (req.query.format === "csv") {
    const { filename, csv } = service.asCsv(dashboard, data);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(csv);
    return;
  }
  res.json(data);
}

export async function headcount(req: Request, res: Response) {
  respond(req, res, "headcount", await service.headcount(orgId(req), { from: str(req.query.from), to: str(req.query.to) }));
}
export async function attrition(req: Request, res: Response) {
  respond(req, res, "attrition", await service.attritionReport(orgId(req), { from: str(req.query.from), to: str(req.query.to) }));
}
export async function leaveUsage(req: Request, res: Response) {
  respond(req, res, "leave-usage", await service.leaveUsage(orgId(req), { from: str(req.query.from), to: str(req.query.to), departmentId: str(req.query.departmentId) }));
}
export async function payrollCost(req: Request, res: Response) {
  respond(req, res, "payroll-cost", await service.payrollCost(orgId(req), { from: str(req.query.from), to: str(req.query.to) }));
}
