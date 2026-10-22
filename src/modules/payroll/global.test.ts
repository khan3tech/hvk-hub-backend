import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./repository.js", () => ({
  findCurrencySettings: vi.fn(),
  upsertCurrencySettings: vi.fn(),
  countPayrollAssignments: vi.fn(),
  createPayrollAssignment: vi.fn(),
  listPayrollAssignments: vi.fn(),
  findEffectivePayrollAssignment: vi.fn(),
  upsertExchangeRate: vi.fn(),
  listExchangeRates: vi.fn(),
  findPayslipsOrgWide: vi.fn(),
  writeActivityLog: vi.fn(),
}));
vi.mock("../employee/service.js", () => ({ getEmployeeSummary: vi.fn().mockResolvedValue({ id: "e1" }) }));

const repo = await import("./repository.js");
const global = await import("./global.js");

const ORG = "org_1";
const HR = { sub: "u", role: "HR" as const, employeeId: "emp_hr" };
const SEPT = new Date("2026-09-30");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.findCurrencySettings).mockResolvedValue(null);
  vi.mocked(repo.countPayrollAssignments).mockResolvedValue(0);
  vi.mocked(repo.findEffectivePayrollAssignment).mockResolvedValue(null);
});

describe("026 — payroll context (FR-002, FR-011)", () => {
  it("single-country orgs need no configuration and keep the legacy currency", async () => {
    expect(await global.resolveContext(ORG, "e1", SEPT)).toEqual({ mode: "SINGLE", country: null, homeCountry: null, currency: "INR" });
  });

  it("multi-country orgs use the effective assignment, else the home defaults", async () => {
    vi.mocked(repo.findCurrencySettings).mockResolvedValue({ defaultCountry: "IN", defaultCurrency: "INR" } as never);
    vi.mocked(repo.findEffectivePayrollAssignment).mockResolvedValue({ country: "US", currency: "USD" } as never);
    expect(await global.resolveContext(ORG, "e1", SEPT)).toMatchObject({ mode: "MULTI", country: "US", currency: "USD", homeCountry: "IN" });
    vi.mocked(repo.findEffectivePayrollAssignment).mockResolvedValue(null);
    expect(await global.resolveContext(ORG, "e1", SEPT)).toMatchObject({ country: "IN", currency: "INR" });
  });

  it("never assumes a country once multi-country is on", async () => {
    vi.mocked(repo.countPayrollAssignments).mockResolvedValue(3);
    expect(await global.resolveContext(ORG, "e1", SEPT)).toMatchObject({ missing: true });
  });
});

describe("026 — validation", () => {
  it("rejects unknown currency and malformed country codes", async () => {
    await expect(global.assign(ORG, "e1", { country: "US", currency: "XYZ", effectiveFrom: "2026-01-01" }, HR)).rejects.toMatchObject({ status: 400 });
    await expect(global.assign(ORG, "e1", { country: "U1", currency: "USD", effectiveFrom: "2026-01-01" }, HR)).rejects.toMatchObject({ status: 400 });
  });
});

describe("026 — reporting total (FR-009, FR-010, SC-004)", () => {
  const slips = [
    { currency: "INR", country: "IN", netPay: 83000, earnings: { basic: 90000 } },
    { currency: "USD", country: "US", netPay: 1000, earnings: { basic: 1200 } },
    { currency: "USD", country: "US", netPay: 500.5, earnings: { basic: 600 } },
  ];

  it("converts with the period's rate and matches manual conversion", async () => {
    vi.mocked(repo.findCurrencySettings).mockResolvedValue({ reportingCurrency: "USD" } as never);
    vi.mocked(repo.findPayslipsOrgWide).mockResolvedValue(slips as never);
    vi.mocked(repo.listExchangeRates).mockResolvedValue([{ fromCurrency: "INR", rate: 0.012 }] as never);
    const t = await global.reportingTotal(ORG, 9, 2026);
    expect(t.complete).toBe(true);
    expect(t.totalNetPay).toBe(Math.round((83000 * 0.012 + 1500.5) * 100) / 100);
    expect(t.byCurrency.find((g) => g.currency === "USD")).toMatchObject({ rate: 1, payslipCount: 2, countries: ["US"] });
  });

  it("withholds the total and names the currency when a rate is missing", async () => {
    vi.mocked(repo.findCurrencySettings).mockResolvedValue({ reportingCurrency: "USD" } as never);
    vi.mocked(repo.findPayslipsOrgWide).mockResolvedValue(slips as never);
    vi.mocked(repo.listExchangeRates).mockResolvedValue([]);
    const t = await global.reportingTotal(ORG, 9, 2026);
    expect(t).toMatchObject({ complete: false, missingRates: ["INR"], totalNetPay: null });
  });

  it("needs a reporting currency", async () => {
    await expect(global.reportingTotal(ORG, 9, 2026)).rejects.toMatchObject({ code: "REPORTING_CURRENCY_NOT_SET" });
  });
});
