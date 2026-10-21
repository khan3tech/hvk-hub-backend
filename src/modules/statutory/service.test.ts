import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./repository.js", () => ({
  createVersion: vi.fn(),
  listVersions: vi.fn(),
  findGroupRoot: vi.fn(),
  listExemptions: vi.fn(),
  createExemption: vi.fn(),
  findExemption: vi.fn(),
  deleteExemption: vi.fn(),
  createReport: vi.fn(),
  findReport: vi.fn(),
  listReports: vi.fn(),
  writeActivityLog: vi.fn(),
}));
vi.mock("../employee/service.js", () => ({ getEmployeeSummary: vi.fn() }));
vi.mock("../payroll/service.js", () => ({ getPayslipsOrgWide: vi.fn() }));

const repo = await import("./repository.js");
const employees = await import("../employee/service.js");
const payroll = await import("../payroll/service.js");
const { computeStatutoryAmount, progressiveTax } = await import("./calculate.js");
const service = await import("./service.js");

const ORG = "org_1";
const HR = { sub: "u_hr", role: "HR" as const, employeeId: "emp_hr" };
const full = { basic: 50000, hra: 20000, gross: 80000 };
const bases = (ratio = 1) => ({
  fullMonth: full,
  prorated: { basic: full.basic * ratio, hra: full.hra * ratio, gross: full.gross * ratio },
  prorationRatio: ratio,
});

const version = (o: Record<string, unknown>) =>
  ({ id: "v", orgId: ORG, groupId: "g", name: "C", ruleType: "FLAT", ruleConfig: { amount: 200 }, country: null, active: true, effectiveFrom: new Date("2026-01-01"), createdAt: new Date("2026-01-01"), ...o }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.listExemptions).mockResolvedValue([]);
});

describe("statutory math (SC-002, hand-calculated)", () => {
  it("FLAT prorates with the salary (FR-010)", () => {
    expect(computeStatutoryAmount({ ruleType: "FLAT", ruleConfig: { amount: 200 } }, bases())).toBe(200);
    expect(computeStatutoryAmount({ ruleType: "FLAT", ruleConfig: { amount: 200 } }, bases(0.5))).toBe(100);
  });

  it("PERCENTAGE of basic, with a cap", () => {
    expect(computeStatutoryAmount({ ruleType: "PERCENTAGE", ruleConfig: { percent: 12, base: "BASIC" } }, bases())).toBe(6000);
    expect(computeStatutoryAmount({ ruleType: "PERCENTAGE", ruleConfig: { percent: 12, base: "BASIC", cap: 1800 } }, bases())).toBe(1800);
    expect(computeStatutoryAmount({ ruleType: "PERCENTAGE", ruleConfig: { percent: 10, base: "BASIC_PLUS_HRA" } }, bases(0.5))).toBe(3500);
  });

  it("progressive brackets tax each slice at its own rate", () => {
    const brackets = [
      { upTo: 300000, percent: 0 },
      { upTo: 700000, percent: 5 },
      { upTo: null, percent: 20 },
    ];
    // 960000: 0 on first 3L, 5% of 4L = 20000, 20% of 2.6L = 52000
    expect(progressiveTax(960000, brackets)).toBe(72000);
    expect(progressiveTax(200000, brackets)).toBe(0);
  });

  it("ANNUAL brackets annualize gross, spread over 12 months, then prorate", () => {
    const rule = {
      ruleType: "BRACKET" as const,
      ruleConfig: { base: "GROSS" as const, period: "ANNUAL" as const, brackets: [{ upTo: 300000, percent: 0 }, { upTo: 700000, percent: 5 }, { upTo: null, percent: 20 }] },
    };
    expect(computeStatutoryAmount(rule, bases())).toBe(6000); // 72000 / 12
    expect(computeStatutoryAmount(rule, bases(0.5))).toBe(3000);
  });
});

describe("statutory — versions (FR-002)", () => {
  it("uses the version in effect for the period, and honours discontinuation", () => {
    const v1 = version({ id: "v1", ruleConfig: { amount: 100 }, effectiveFrom: new Date("2026-01-01") });
    const v2 = version({ id: "v2", ruleConfig: { amount: 150 }, effectiveFrom: new Date("2026-07-01"), createdAt: new Date("2026-06-01") });
    const off = version({ id: "v3", active: false, effectiveFrom: new Date("2027-01-01"), createdAt: new Date("2026-12-01") });
    expect(service.versionsInEffect([v1, v2, off], new Date("2026-03-31")).map((v) => v.id)).toEqual(["v1"]);
    expect(service.versionsInEffect([v1, v2, off], new Date("2026-08-31")).map((v) => v.id)).toEqual(["v2"]);
    expect(service.versionsInEffect([v1, v2, off], new Date("2027-02-28"))).toEqual([]);
  });
});

describe("statutory — payroll calculator (FR-003/004)", () => {
  it("itemizes non-exempt components and skips exempt ones", async () => {
    vi.mocked(repo.listVersions).mockResolvedValue([
      version({ id: "pf", groupId: "g_pf", name: "Retirement fund", ruleType: "PERCENTAGE", ruleConfig: { percent: 12, base: "BASIC" } }),
      version({ id: "pt", groupId: "g_pt", name: "Professional tax", ruleType: "FLAT", ruleConfig: { amount: 200 } }),
    ]);
    vi.mocked(repo.listExemptions).mockResolvedValue([{ groupId: "g_pt" }] as never);

    const lines = await service.calculateStatutory({
      orgId: ORG,
      employeeId: "emp_1",
      periodStart: new Date("2026-09-01"),
      periodEnd: new Date("2026-09-30"),
      prorationRatio: 1,
      earnings: { basic: 50000, hra: 20000, special: 10000 },
      fullMonth: full,
    });

    expect(lines).toEqual([{ groupId: "g_pf", componentId: "pf", name: "Retirement fund", amount: 6000 }]);
  });
});

describe("statutory — compliance report (US3)", () => {
  it("totals exactly the sum of payslip statutory lines (SC-003)", async () => {
    vi.mocked(payroll.getPayslipsOrgWide).mockResolvedValue([
      { employeeId: "e1", statutoryDeductions: [{ groupId: "g_pf", name: "Retirement fund", amount: 6000 }, { groupId: "g_pt", name: "Professional tax", amount: 200 }] },
      { employeeId: "e2", statutoryDeductions: [{ groupId: "g_pf", name: "Retirement fund", amount: 1234.56 }] },
      { employeeId: "e3", statutoryDeductions: null },
    ] as never);
    vi.mocked(repo.createReport).mockImplementation(((data: object) => Promise.resolve({ id: "rep_1", ...data })) as never);

    const report = await service.generateReport(ORG, 9, 2026, HR);

    expect(report.totals).toMatchObject({ grandTotal: 7434.56, payslipCount: 3 });
    expect((report.totals as { components: unknown[] }).components).toEqual([
      { groupId: "g_pf", name: "Retirement fund", totalWithheld: 7234.56, employeeCount: 2 },
      { groupId: "g_pt", name: "Professional tax", totalWithheld: 200, employeeCount: 1 },
    ]);
    expect(report.totals).not.toHaveProperty("lines");
  });

  it("refuses a period with no payroll", async () => {
    vi.mocked(payroll.getPayslipsOrgWide).mockResolvedValue([]);
    await expect(service.generateReport(ORG, 1, 2030, HR)).rejects.toMatchObject({ code: "NO_PAYROLL_FOR_PERIOD" });
  });

  it("exports CSV with totals and per-employee lines, neutralising formula injection (FR-007)", async () => {
    vi.mocked(repo.findReport).mockResolvedValue({
      id: "rep_1", periodMonth: 9, periodYear: 2026,
      totals: { components: [{ name: "Retirement fund", totalWithheld: 6000, employeeCount: 1 }], grandTotal: 6000, lines: [{ employeeId: "e1", groupId: "g", name: "Retirement fund", amount: 6000 }] },
    } as never);
    vi.mocked(employees.getEmployeeSummary).mockResolvedValue({ name: "=HYPERLINK(\"x\")" } as never);

    const { filename, csv } = await service.exportReportCsv(ORG, "rep_1");

    expect(filename).toBe("compliance-2026-09.csv");
    const lines = csv.trim().split("\n");
    expect(lines[1]).toBe("TOTAL,2026-09,Retirement fund,,,1,6000.00");
    expect(lines[2]).toBe("GRAND_TOTAL,2026-09,,,,,6000.00");
    expect(lines[3]).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
