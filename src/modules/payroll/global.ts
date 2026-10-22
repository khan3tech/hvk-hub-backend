// 026-global-multi-currency-payroll: per-employee payroll country/currency (effective-dated),
// org defaults, exchange rates and the reporting-currency total. Framework-agnostic.
import moment from "moment";
import { DomainError } from "../../middleware/errorHandler.js";
import { getEmployeeSummary } from "../employee/service.js";
import * as repo from "./repository.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";

// What a single-country organization that never configures anything keeps getting (FR-011);
// v0.1 stamped every salary structure and payslip with it.
export const LEGACY_CURRENCY = "INR";

const CURRENCIES = new Set(Intl.supportedValuesOf("currency"));
export const isCurrency = (code: string) => CURRENCIES.has(code);
export const isCountry = (code: string) => /^[A-Z]{2}$/.test(code);

function requireCurrency(code: string, field: string) {
  const c = code.toUpperCase();
  if (!isCurrency(c)) throw new DomainError("VALIDATION_ERROR", `${code} isn't an ISO 4217 currency code.`, 400, { [field]: ["Unknown currency."] });
  return c;
}
function requireCountry(code: string, field: string) {
  const c = code.toUpperCase();
  if (!isCountry(c)) throw new DomainError("VALIDATION_ERROR", `${code} isn't an ISO 3166 alpha-2 country code.`, 400, { [field]: ["Use a two-letter country code."] });
  return c;
}

async function audit(orgId: string, actor: AccessTokenPayload, action: string, entity: string, entityId: string, after?: unknown) {
  if (actor.employeeId) await repo.writeActivityLog({ orgId, actorId: actor.employeeId, action, entity, entityId, after });
}

// --- Org settings (FR-008, FR-011) ---

export async function getSettings(orgId: string) {
  const s = await repo.findCurrencySettings(orgId);
  const multiCountry = await isMultiCountry(orgId, s);
  return {
    defaultCountry: s?.defaultCountry ?? null,
    defaultCurrency: s?.defaultCurrency ?? null,
    reportingCurrency: s?.reportingCurrency ?? null,
    // Single-country (legacy) mode: no country checks, every statutory component applies.
    multiCountry,
  };
}

export async function updateSettings(orgId: string, input: { defaultCountry?: string | null; defaultCurrency?: string | null; reportingCurrency?: string | null }, actor: AccessTokenPayload) {
  const data: { defaultCountry?: string | null; defaultCurrency?: string | null; reportingCurrency?: string | null } = {};
  if (input.defaultCountry !== undefined) data.defaultCountry = input.defaultCountry === null ? null : requireCountry(input.defaultCountry, "defaultCountry");
  if (input.defaultCurrency !== undefined) data.defaultCurrency = input.defaultCurrency === null ? null : requireCurrency(input.defaultCurrency, "defaultCurrency");
  if (input.reportingCurrency !== undefined) data.reportingCurrency = input.reportingCurrency === null ? null : requireCurrency(input.reportingCurrency, "reportingCurrency");
  await repo.upsertCurrencySettings(orgId, data);
  await audit(orgId, actor, "payroll.currency_settings_updated", "PayrollCurrencySettings", orgId, data);
  return getSettings(orgId);
}

// Multi-country is opt-in: it starts once an org names a home country or assigns anyone one.
async function isMultiCountry(orgId: string, s?: Awaited<ReturnType<typeof repo.findCurrencySettings>>) {
  return Boolean(s?.defaultCountry) || (await repo.countPayrollAssignments(orgId)) > 0;
}

// --- Employee assignments (FR-001, US1.3) ---

export async function assign(orgId: string, employeeId: string, input: { country: string; currency: string; effectiveFrom: string }, actor: AccessTokenPayload) {
  if (!(await getEmployeeSummary(orgId, employeeId))) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  const row = await repo.createPayrollAssignment({
    orgId,
    employeeId,
    country: requireCountry(input.country, "country"),
    currency: requireCurrency(input.currency, "currency"),
    effectiveFrom: moment.utc(input.effectiveFrom).startOf("day").toDate(),
    createdById: actor.employeeId,
  });
  await audit(orgId, actor, "payroll.assignment_created", "Employee", employeeId, { country: row.country, currency: row.currency, effectiveFrom: input.effectiveFrom });
  return listAssignments(orgId, employeeId);
}

export async function listAssignments(orgId: string, employeeId: string) {
  if (!(await getEmployeeSummary(orgId, employeeId))) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  const today = moment.utc().startOf("day").toDate();
  const [history, current] = await Promise.all([
    repo.listPayrollAssignments(orgId, employeeId),
    resolveContext(orgId, employeeId, today),
  ]);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return {
    current,
    history: history.map((h) => ({ id: h.id, country: h.country, currency: h.currency, effectiveFrom: day(h.effectiveFrom), createdAt: h.createdAt })),
  };
}

export type PayrollContext =
  | { mode: "SINGLE"; country: null; homeCountry: null; currency: string }
  | { mode: "MULTI"; country: string; homeCountry: string | null; currency: string }
  | { mode: "MULTI"; missing: true; country: string | null; currency: string | null };

// FR-002/FR-003/FR-004: the country and currency an employee is paid under on a date. Multi-country
// orgs never fall back silently: no assignment and no org default means "missing".
export async function resolveContext(orgId: string, employeeId: string, asOf: Date): Promise<PayrollContext> {
  const s = await repo.findCurrencySettings(orgId);
  if (!(await isMultiCountry(orgId, s))) {
    return { mode: "SINGLE", country: null, homeCountry: null, currency: s?.defaultCurrency ?? LEGACY_CURRENCY };
  }
  const a = await repo.findEffectivePayrollAssignment(orgId, employeeId, asOf);
  const country = a?.country ?? s?.defaultCountry ?? null;
  const currency = a?.currency ?? s?.defaultCurrency ?? null;
  if (!country || !currency) return { mode: "MULTI", missing: true, country, currency };
  return { mode: "MULTI", country, homeCountry: s?.defaultCountry ?? null, currency };
}

// --- Exchange rates and reporting total (FR-008–FR-010, US3) ---

async function requireReportingCurrency(orgId: string) {
  const s = await repo.findCurrencySettings(orgId);
  if (!s?.reportingCurrency) throw new DomainError("REPORTING_CURRENCY_NOT_SET", "Set a reporting currency in payroll settings first.", 409);
  return s.reportingCurrency;
}

export async function recordExchangeRate(orgId: string, input: { fromCurrency: string; rate: number; periodMonth: number; periodYear: number }, actor: AccessTokenPayload) {
  const toCurrency = await requireReportingCurrency(orgId);
  const fromCurrency = requireCurrency(input.fromCurrency, "fromCurrency");
  if (fromCurrency === toCurrency) throw new DomainError("VALIDATION_ERROR", "The reporting currency converts at 1; no rate is needed.", 400);
  const row = await repo.upsertExchangeRate({ orgId, fromCurrency, toCurrency, rate: input.rate, periodMonth: input.periodMonth, periodYear: input.periodYear, recordedById: actor.employeeId });
  await audit(orgId, actor, "payroll.exchange_rate_recorded", "ExchangeRate", row.id, { fromCurrency, toCurrency, rate: input.rate, period: `${input.periodYear}-${input.periodMonth}` });
  return row;
}

export function listExchangeRates(orgId: string, filters: { periodMonth?: number; periodYear?: number }) {
  return repo.listExchangeRates(orgId, filters);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// FR-009/FR-010, SC-004: derived from the period's current payslips (so a re-run is reflected)
// and the rates recorded for that period now. A currency without a rate is listed as missing and
// the total is withheld rather than understated.
export async function reportingTotal(orgId: string, periodMonth: number, periodYear: number) {
  const reportingCurrency = await requireReportingCurrency(orgId);
  const [payslips, rates] = await Promise.all([
    repo.findPayslipsOrgWide(orgId, { periodMonth, periodYear }),
    repo.listExchangeRates(orgId, { periodMonth, periodYear, toCurrency: reportingCurrency }),
  ]);
  const rateFor = new Map(rates.map((r) => [r.fromCurrency, r.rate]));
  const groups = new Map<string, { currency: string; payslipCount: number; netPay: number; gross: number; countries: Set<string> }>();
  for (const p of payslips) {
    const currency = p.currency ?? LEGACY_CURRENCY;
    const g = groups.get(currency) ?? { currency, payslipCount: 0, netPay: 0, gross: 0, countries: new Set<string>() };
    g.payslipCount += 1;
    g.netPay += p.netPay;
    g.gross += Object.values(p.earnings as Record<string, number>).reduce((s, v) => s + v, 0);
    if (p.country) g.countries.add(p.country);
    groups.set(currency, g);
  }
  const byCurrency = [...groups.values()].sort((a, b) => a.currency.localeCompare(b.currency)).map((g) => {
    const rate = g.currency === reportingCurrency ? 1 : rateFor.get(g.currency) ?? null;
    return {
      currency: g.currency,
      countries: [...g.countries].sort(),
      payslipCount: g.payslipCount,
      netPay: round2(g.netPay),
      gross: round2(g.gross),
      rate,
      convertedNetPay: rate === null ? null : round2(g.netPay * rate),
      convertedGross: rate === null ? null : round2(g.gross * rate),
    };
  });
  const missingRates = byCurrency.filter((g) => g.rate === null).map((g) => g.currency);
  const complete = missingRates.length === 0;
  return {
    period: `${periodYear}-${String(periodMonth).padStart(2, "0")}`,
    reportingCurrency,
    complete,
    missingRates,
    totalNetPay: complete ? round2(byCurrency.reduce((s, g) => s + (g.convertedNetPay ?? 0), 0)) : null,
    totalGross: complete ? round2(byCurrency.reduce((s, g) => s + (g.convertedGross ?? 0), 0)) : null,
    byCurrency,
  };
}
