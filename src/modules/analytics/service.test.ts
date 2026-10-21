import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../employee/service.js", () => ({
  listEmployeesForAnalytics: vi.fn(),
  listDepartments: vi.fn(),
  listDesignations: vi.fn(),
}));
vi.mock("../attendance/service.js", () => ({ listApprovedLeaveForAnalytics: vi.fn(), listLeaveTypes: vi.fn() }));
vi.mock("../payroll/service.js", () => ({ getPayrollCostByPeriod: vi.fn() }));

const employees = await import("../employee/service.js");
const attendance = await import("../attendance/service.js");
const payroll = await import("../payroll/service.js");
const compute = await import("./compute.js");
const service = await import("./service.js");

const ORG = "org_1";
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const emp = (id: string, joined: string, o: Partial<{ dept: string | null; desig: string | null; offboarded: string }> = {}) => ({
  id,
  departmentId: o.dept === undefined ? "eng" : o.dept,
  designationId: o.desig === undefined ? "swe" : o.desig,
  dateOfJoining: d(joined),
  status: o.offboarded ? "OFFBOARDED" : "ACTIVE",
  offboardedAt: o.offboarded ? d(o.offboarded) : null,
});

// Manual scenario: 4 joined before 2026, one left in March, one joined in June, one has no dept.
const PEOPLE = [
  emp("a", "2024-01-01"),
  emp("b", "2025-01-01", { dept: "sales" }),
  emp("c", "2025-06-01", { offboarded: "2026-03-10" }),
  emp("d", "2025-07-01", { dept: null, desig: null }),
  emp("e", "2026-06-15", { dept: "sales" }),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(employees.listEmployeesForAnalytics).mockResolvedValue(PEOPLE as never);
  vi.mocked(employees.listDepartments).mockResolvedValue([{ id: "eng", name: "Engineering" }, { id: "sales", name: "Sales" }] as never);
  vi.mocked(employees.listDesignations).mockResolvedValue([{ id: "swe", title: "Engineer" }] as never);
});

describe("analytics math (SC-002)", () => {
  it("counts headcount at a date, including offboarded people for when they were employed", () => {
    expect(compute.headcountOn(PEOPLE, d("2026-01-31"))).toBe(4); // a,b,c,d
    expect(compute.headcountOn(PEOPLE, d("2026-03-31"))).toBe(3); // c left
    expect(compute.headcountOn(PEOPLE, d("2026-06-30"))).toBe(4); // e joined
  });

  it("builds a month-end trend with joins and exits (FR-002)", () => {
    const trend = compute.monthlyTrend(PEOPLE, d("2026-01-01"), d("2026-06-30"));
    expect(trend.map((t) => t.month)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
    expect(trend[2]).toEqual({ month: "2026-03", headcount: 3, joins: 0, exits: 1 });
    expect(trend[5]).toEqual({ month: "2026-06", headcount: 4, joins: 1, exits: 0 });
  });

  it("attrition = exits / average(opening, closing headcount) (FR-003)", () => {
    // Q1 2026: opening 4, closing 3, avg 3.5, 1 exit -> 28.57%
    expect(compute.attrition(PEOPLE, d("2026-01-01"), d("2026-03-31"))).toEqual({ exits: 1, averageHeadcount: 3.5, ratePercent: 28.57 });
  });

  it("average tenure of the active workforce (FR-004)", () => {
    // as of 2026-07-01: a=912d, b=546d, d=365d, e=16d -> 459.75 days
    expect(compute.averageTenure(PEOPLE, d("2026-07-01"))).toEqual({ employees: 4, averageDays: 459.8, averageYears: 1.26 });
  });
});

describe("analytics service", () => {
  it("puts employees without a department/designation in an Unassigned bucket (FR-008, SC-004)", async () => {
    const h = await service.headcount(ORG, { from: "2026-01-01", to: "2026-06-30" });
    const total = h.byDepartment.reduce((s, r) => s + r.count, 0);
    expect(total).toBe(PEOPLE.filter((p) => p.status === "ACTIVE").length);
    expect(h.byDepartment).toContainEqual({ id: "unassigned", name: "Unassigned", count: 1 });
    expect(h.byDesignation).toContainEqual({ id: "unassigned", name: "Unassigned", count: 1 });
  });

  it("notes thin history instead of failing (edge case)", async () => {
    vi.mocked(payroll.getPayrollCostByPeriod).mockResolvedValue([{ period: "2026-09", periodYear: 2026, periodMonth: 9, netPay: 100, gross: 120, statutory: 5, payslipCount: 1 }]);
    const cost = await service.payrollCost(ORG, {});
    expect(cost.periods).toHaveLength(1);
    expect(cost.note).toMatch(/builds up/);
  });

  it("sums leave days per type and filters by department (FR-005)", async () => {
    vi.mocked(attendance.listLeaveTypes).mockResolvedValue([{ id: "pl", name: "Paid" }, { id: "sl", name: "Sick" }] as never);
    vi.mocked(attendance.listApprovedLeaveForAnalytics).mockResolvedValue([
      { employeeId: "a", leaveTypeId: "pl", days: 3 },
      { employeeId: "b", leaveTypeId: "pl", days: 2 },
      { employeeId: "a", leaveTypeId: "sl", days: 1 },
    ] as never);
    const all = await service.leaveUsage(ORG, { from: "2026-01-01", to: "2026-12-31" });
    expect(all.byLeaveType).toEqual([
      { leaveTypeId: "pl", name: "Paid", days: 5, requests: 2 },
      { leaveTypeId: "sl", name: "Sick", days: 1, requests: 1 },
    ]);
    const eng = await service.leaveUsage(ORG, { from: "2026-01-01", to: "2026-12-31", departmentId: "eng" });
    expect(eng.totalDays).toBe(4);
  });

  it("rejects an inverted range", async () => {
    await expect(service.headcount(ORG, { from: "2026-06-01", to: "2026-01-01" })).rejects.toMatchObject({ status: 400 });
  });

  it("exports CSV for each dashboard (FR-010)", async () => {
    const h = await service.headcount(ORG, { from: "2026-01-01", to: "2026-02-28" });
    const { filename, csv } = service.asCsv("headcount", h);
    expect(filename).toBe("headcount.csv");
    expect(csv.split("\n")[0]).toBe("Section,Key,Name,Count,Joins,Exits");
    expect(csv).toContain("DEPARTMENT,unassigned,Unassigned,1,,");
    expect(csv).toContain("TREND,2026-02,,4,0,0");
  });
});
