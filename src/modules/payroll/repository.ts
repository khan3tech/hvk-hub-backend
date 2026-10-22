// Prisma queries only — this is the one place in the payroll module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
// See specs/004-payroll/spec.md → Key Entities for the data this module owns.
import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "@prisma/client";

// data-model.md's lookup rule (research.md R1): latest version with effectiveFrom on or before
// the period's end date is the structure "in effect" for that period.
export function findEffectiveSalaryStructure(orgId: string, employeeId: string, periodEndDate: Date) {
  return prisma.salaryStructure.findFirst({
    where: { orgId, employeeId, effectiveFrom: { lte: periodEndDate } },
    orderBy: { effectiveFrom: "desc" },
  });
}

export function createSalaryStructure(data: Prisma.SalaryStructureUncheckedCreateInput) {
  return prisma.salaryStructure.create({ data });
}

// Active-now employees, plus anyone offboarded on/after the period's start (a cheap DB-level
// pre-filter on `updatedAt`; the service layer's exact "was this employee's offboard date
// actually inside the period" check uses 002's getOffboardedDate per employee, research.md R4 —
// this query only needs to avoid excluding someone who might qualify, not decide precisely).
export function findActiveEmployeesForPeriod(orgId: string, periodStart: Date) {
  return prisma.employee.findMany({
    where: {
      orgId,
      OR: [{ status: "ACTIVE" }, { status: "OFFBOARDED", updatedAt: { gte: periodStart } }],
    },
  });
}

export function upsertPayslip(params: {
  orgId: string;
  employeeId: string;
  periodMonth: number;
  periodYear: number;
  data: Prisma.PayslipUncheckedCreateInput & Prisma.PayslipUncheckedUpdateInput;
}) {
  return prisma.payslip.upsert({
    where: {
      employeeId_periodMonth_periodYear: {
        employeeId: params.employeeId,
        periodMonth: params.periodMonth,
        periodYear: params.periodYear,
      },
    },
    create: params.data,
    update: params.data,
  });
}

export function findPayslipsForEmployee(
  orgId: string,
  employeeId: string,
  filters: { periodMonth?: number; periodYear?: number } = {},
) {
  return prisma.payslip.findMany({
    where: { orgId, employeeId, ...filters },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
  });
}

export function findPayslipById(orgId: string, id: string) {
  return prisma.payslip.findFirst({ where: { id, orgId } });
}

export function findPayslipsForEmployees(
  orgId: string,
  employeeIds: string[],
  filters: { periodMonth?: number; periodYear?: number } = {},
) {
  return prisma.payslip.findMany({
    where: { orgId, employeeId: { in: employeeIds }, ...filters },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
  });
}

export function findPayslipsOrgWide(
  orgId: string,
  filters: { employeeId?: string; periodMonth?: number; periodYear?: number } = {},
) {
  return prisma.payslip.findMany({
    where: { orgId, ...filters },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
  });
}

export function writeActivityLog(params: {
  orgId: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}) {
  return prisma.activityLog.create({
    data: {
      orgId: params.orgId,
      actorId: params.actorId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      before: params.before as never,
      after: params.after as never,
    },
  });
}

// --- 026-global-multi-currency-payroll ---

export function findCurrencySettings(orgId: string) {
  return prisma.payrollCurrencySettings.findUnique({ where: { orgId } });
}

export function upsertCurrencySettings(orgId: string, data: { defaultCountry?: string | null; defaultCurrency?: string | null; reportingCurrency?: string | null }) {
  return prisma.payrollCurrencySettings.upsert({ where: { orgId }, create: { orgId, ...data }, update: data });
}

export function countPayrollAssignments(orgId: string) {
  return prisma.payrollAssignment.count({ where: { orgId } });
}

export function createPayrollAssignment(data: { orgId: string; employeeId: string; country: string; currency: string; effectiveFrom: Date; createdById: string | null }) {
  return prisma.payrollAssignment.create({ data });
}

export function listPayrollAssignments(orgId: string, employeeId: string) {
  return prisma.payrollAssignment.findMany({ where: { orgId, employeeId }, orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }] });
}

// Same lookup rule as salary structures: latest effectiveFrom on or before the date (ties: newest).
export function findEffectivePayrollAssignment(orgId: string, employeeId: string, asOf: Date) {
  return prisma.payrollAssignment.findFirst({
    where: { orgId, employeeId, effectiveFrom: { lte: asOf } },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
}

export function upsertExchangeRate(data: { orgId: string; fromCurrency: string; toCurrency: string; rate: number; periodMonth: number; periodYear: number; recordedById: string | null }) {
  const { orgId, fromCurrency, toCurrency, periodMonth, periodYear } = data;
  return prisma.exchangeRate.upsert({
    where: { orgId_fromCurrency_toCurrency_periodMonth_periodYear: { orgId, fromCurrency, toCurrency, periodMonth, periodYear } },
    create: data,
    update: { rate: data.rate, recordedById: data.recordedById },
  });
}

export function listExchangeRates(orgId: string, where: Prisma.ExchangeRateWhereInput = {}) {
  return prisma.exchangeRate.findMany({ where: { orgId, ...where }, orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { fromCurrency: "asc" }] });
}
