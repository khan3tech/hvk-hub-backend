import { describe, it, expect, vi, beforeEach } from "vitest";
import moment from "moment";

vi.mock("./repository.js", () => ({
  findEffectiveSalaryStructure: vi.fn(),
  createSalaryStructure: vi.fn(),
  findActiveEmployeesForPeriod: vi.fn(),
  upsertPayslip: vi.fn(),
  findPayslipsForEmployee: vi.fn(),
  findPayslipById: vi.fn(),
  findPayslipsForEmployees: vi.fn(),
  findPayslipsOrgWide: vi.fn(),
  writeActivityLog: vi.fn(),
}));

vi.mock("../employee/service.js", () => ({
  getTeamView: vi.fn(),
  getOffboardedDate: vi.fn(),
  getEmployeeSummary: vi.fn().mockResolvedValue({ id: "emp_x", status: "ACTIVE", name: "X" }),
}));

vi.mock("../notifications/service.js", () => ({
  notifyEmployees: vi.fn(),
  notifyRoles: vi.fn(),
  notifyDepartmentManagers: vi.fn(),
}));

vi.mock("../attendance/service.js", () => ({
  getUnpaidLeaveDaysForPeriod: vi.fn(),
}));
// 026: a single-country org (no settings, no assignments) — the v0.1 behaviour.
vi.mock("./global.js", () => ({
  resolveContext: vi.fn().mockResolvedValue({ mode: "SINGLE", country: null, homeCountry: null, currency: "INR" }),
}));

const repo = await import("./repository.js");
const employeeService = await import("../employee/service.js");
const attendanceService = await import("../attendance/service.js");
const {
  setSalaryStructure,
  getSalaryStructure,
  runPayroll,
  getMyPayslipById,
  getTeamPayslips,
  setStatutoryCalculator,
  setOneOffEarningsProvider,
} = await import("./service.js");

const ORG_ID = "org_1";
const EMPLOYEE_ID = "emp_1";
const HR_ACTOR = { sub: "u_hr", role: "HR" as const, employeeId: "emp_hr" };
const EMPLOYEE_ACTOR = { sub: "u_emp", role: "EMPLOYEE" as const, employeeId: EMPLOYEE_ID };
const MANAGER_ACTOR = { sub: "u_mgr", role: "MANAGER" as const, employeeId: "emp_mgr" };

function makeStructure(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ss_1",
    orgId: ORG_ID,
    employeeId: EMPLOYEE_ID,
    basic: 50000,
    hra: 10000,
    allowances: {},
    effectiveFrom: moment.utc("2026-01-01").toDate(),
    ...overrides,
  };
}

describe("payroll service — setSalaryStructure / getSalaryStructure (US1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects negative amounts", async () => {
    await expect(
      setSalaryStructure(
        ORG_ID,
        EMPLOYEE_ID,
        { basic: -1, hra: 0, allowances: {}, effectiveFrom: "2026-01-01" },
        HR_ACTOR,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });

  it("inserts a new row rather than updating an existing one (research.md R1)", async () => {
    vi.mocked(repo.createSalaryStructure).mockResolvedValue(makeStructure() as never);

    await setSalaryStructure(
      ORG_ID,
      EMPLOYEE_ID,
      { basic: 50000, hra: 10000, allowances: {}, effectiveFrom: "2026-01-01" },
      HR_ACTOR,
    );

    expect(repo.createSalaryStructure).toHaveBeenCalled();
  });

  it("lets an Employee view only their own structure", async () => {
    vi.mocked(repo.findEffectiveSalaryStructure).mockResolvedValue(makeStructure() as never);

    const result = await getSalaryStructure(ORG_ID, EMPLOYEE_ID, undefined, EMPLOYEE_ACTOR);

    expect(result.employeeId).toBe(EMPLOYEE_ID);
  });

  it("rejects an Employee viewing someone else's structure", async () => {
    await expect(
      getSalaryStructure(ORG_ID, "someone_else", undefined, EMPLOYEE_ACTOR),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("rejects a Manager unconditionally — no salary-structure view access at all (FR-009)", async () => {
    await expect(
      getSalaryStructure(ORG_ID, EMPLOYEE_ID, undefined, MANAGER_ACTOR),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("throws NOT_FOUND when no structure exists yet", async () => {
    vi.mocked(repo.findEffectiveSalaryStructure).mockResolvedValue(null);

    await expect(getSalaryStructure(ORG_ID, EMPLOYEE_ID, undefined, HR_ACTOR)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });
});

describe("payroll service — runPayroll (US2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(attendanceService.getUnpaidLeaveDaysForPeriod).mockResolvedValue(0);
  });

  it("skips and reports an employee with no salary structure, rather than failing the run (FR-011)", async () => {
    vi.mocked(repo.findActiveEmployeesForPeriod).mockResolvedValue([
      { id: EMPLOYEE_ID, dateOfJoining: moment.utc("2020-01-01").toDate(), status: "ACTIVE" },
    ] as never);
    vi.mocked(repo.findEffectiveSalaryStructure).mockResolvedValue(null);

    const result = await runPayroll(ORG_ID, { periodMonth: 9, periodYear: 2026 }, HR_ACTOR);

    expect(result.skipped).toEqual([{ employeeId: EMPLOYEE_ID, reason: "NO_SALARY_STRUCTURE" }]);
    expect(result.payslipCount).toBe(0);
    expect(repo.upsertPayslip).not.toHaveBeenCalled();
  });

  it("computes a full-period payslip with no proration for an employee active the whole period", async () => {
    vi.mocked(repo.findActiveEmployeesForPeriod).mockResolvedValue([
      { id: EMPLOYEE_ID, dateOfJoining: moment.utc("2020-01-01").toDate(), status: "ACTIVE" },
    ] as never);
    vi.mocked(repo.findEffectiveSalaryStructure).mockResolvedValue(makeStructure() as never);

    const result = await runPayroll(ORG_ID, { periodMonth: 9, periodYear: 2026 }, HR_ACTOR);

    expect(result.payslipCount).toBe(1);
    const upsertCall = vi.mocked(repo.upsertPayslip).mock.calls[0]![0];
    expect(upsertCall.data.netPay).toBe(60000); // basic 50000 + hra 10000, no proration
  });

  it("prorates for an employee who joined mid-period (research.md R3)", async () => {
    // September 2026: joined on the 21st (a Monday) — only the last week+ of the month worked.
    vi.mocked(repo.findActiveEmployeesForPeriod).mockResolvedValue([
      { id: EMPLOYEE_ID, dateOfJoining: moment.utc("2026-09-21").toDate(), status: "ACTIVE" },
    ] as never);
    vi.mocked(repo.findEffectiveSalaryStructure).mockResolvedValue(
      makeStructure({ basic: 44000, hra: 0 }) as never,
    );

    const result = await runPayroll(ORG_ID, { periodMonth: 9, periodYear: 2026 }, HR_ACTOR);

    const upsertCall = vi.mocked(repo.upsertPayslip).mock.calls[0]![0];
    // September has 22 weekdays; from the 21st (Mon) through the 30th (Wed) = 8 weekdays.
    expect(upsertCall.data.earnings).toMatchObject({ basic: 44000 * (8 / 22) });
  });

  it("prorates for an employee offboarded mid-period (research.md R3/R4)", async () => {
    vi.mocked(repo.findActiveEmployeesForPeriod).mockResolvedValue([
      { id: EMPLOYEE_ID, dateOfJoining: moment.utc("2020-01-01").toDate(), status: "OFFBOARDED" },
    ] as never);
    vi.mocked(repo.findEffectiveSalaryStructure).mockResolvedValue(
      makeStructure({ basic: 44000, hra: 0 }) as never,
    );
    // Offboarded on Sept 14 (a Monday) — active Sept 1-14 = 10 weekdays of September's 22.
    vi.mocked(employeeService.getOffboardedDate).mockResolvedValue(moment.utc("2026-09-14").toDate());

    const result = await runPayroll(ORG_ID, { periodMonth: 9, periodYear: 2026 }, HR_ACTOR);

    const upsertCall = vi.mocked(repo.upsertPayslip).mock.calls[0]![0];
    expect(upsertCall.data.earnings).toMatchObject({ basic: 44000 * (10 / 22) });
  });

  it("applies the unpaid-leave deduction after proration, against the prorated daily rate (research.md R2)", async () => {
    vi.mocked(repo.findActiveEmployeesForPeriod).mockResolvedValue([
      { id: EMPLOYEE_ID, dateOfJoining: moment.utc("2020-01-01").toDate(), status: "ACTIVE" },
    ] as never);
    vi.mocked(repo.findEffectiveSalaryStructure).mockResolvedValue(
      makeStructure({ basic: 44000, hra: 0 }) as never,
    );
    vi.mocked(attendanceService.getUnpaidLeaveDaysForPeriod).mockResolvedValue(5);

    const result = await runPayroll(ORG_ID, { periodMonth: 9, periodYear: 2026 }, HR_ACTOR);

    const upsertCall = vi.mocked(repo.upsertPayslip).mock.calls[0]![0];
    // 22 weekdays in September; daily rate = 44000/22 = 2000; 5 days unpaid = 10000 deducted.
    expect(upsertCall.data.deductions).toMatchObject({ unpaidLeave: 10000 });
    expect(upsertCall.data.netPay).toBe(34000);
  });

  it("upserts keyed on [employeeId, periodMonth, periodYear] — replace, not duplicate, on re-run (FR-006/SC-005)", async () => {
    vi.mocked(repo.findActiveEmployeesForPeriod).mockResolvedValue([
      { id: EMPLOYEE_ID, dateOfJoining: moment.utc("2020-01-01").toDate(), status: "ACTIVE" },
    ] as never);
    vi.mocked(repo.findEffectiveSalaryStructure).mockResolvedValue(makeStructure() as never);

    await runPayroll(ORG_ID, { periodMonth: 9, periodYear: 2026 }, HR_ACTOR);
    await runPayroll(ORG_ID, { periodMonth: 9, periodYear: 2026 }, HR_ACTOR);

    expect(repo.upsertPayslip).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = vi.mocked(repo.upsertPayslip).mock.calls;
    expect(firstCall![0]).toMatchObject({ employeeId: EMPLOYEE_ID, periodMonth: 9, periodYear: 2026 });
    expect(secondCall![0]).toMatchObject({ employeeId: EMPLOYEE_ID, periodMonth: 9, periodYear: 2026 });
  });
});

describe("payroll service — payslip access scoping (US3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an Employee fetching another employee's payslip by id (spec Acceptance Scenario 3)", async () => {
    vi.mocked(repo.findPayslipById).mockResolvedValue({ id: "p1", employeeId: "someone_else" } as never);

    await expect(getMyPayslipById(ORG_ID, EMPLOYEE_ID, "p1")).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });

  it("scopes a Manager's team payslip view to their current direct reports (research.md R6)", async () => {
    vi.mocked(employeeService.getTeamView).mockResolvedValue({
      manager: null,
      directReports: [{ id: "report_1", name: "A", departmentId: null, designationId: null }],
    } as never);
    vi.mocked(repo.findPayslipsForEmployees).mockResolvedValue([] as never);

    await getTeamPayslips(ORG_ID, MANAGER_ACTOR, {});

    expect(repo.findPayslipsForEmployees).toHaveBeenCalledWith(ORG_ID, ["report_1"], {});
  });
});

describe("payroll service — statutory deductions (010 FR-004/005/010)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(attendanceService.getUnpaidLeaveDaysForPeriod).mockResolvedValue(0);
  });

  it("stores statutory lines separately, subtracts them from net pay, and passes prorated pay", async () => {
    vi.mocked(repo.findActiveEmployeesForPeriod).mockResolvedValue([
      { id: EMPLOYEE_ID, dateOfJoining: moment.utc("2020-01-01").toDate(), status: "ACTIVE" },
    ] as never);
    vi.mocked(repo.findEffectiveSalaryStructure).mockResolvedValue(makeStructure() as never);
    const calculator = vi.fn().mockResolvedValue([{ groupId: "g", componentId: "c", name: "Retirement fund", amount: 6000 }]);
    setStatutoryCalculator(calculator);

    await runPayroll(ORG_ID, { periodMonth: 9, periodYear: 2026 }, HR_ACTOR);
    setStatutoryCalculator(null);

    const data = vi.mocked(repo.upsertPayslip).mock.calls[0]![0].data;
    expect(data.statutoryDeductions).toEqual([{ groupId: "g", componentId: "c", name: "Retirement fund", amount: 6000 }]);
    expect(data.deductions).not.toHaveProperty("Retirement fund");
    expect(data.netPay).toBe(54000); // 60000 gross - 6000 statutory
    expect(calculator).toHaveBeenCalledWith(expect.objectContaining({ prorationRatio: 1, earnings: { basic: 50000, hra: 10000 } }));
  });
});

describe("payroll service — one-off earnings (021 FR-008)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(attendanceService.getUnpaidLeaveDaysForPeriod).mockResolvedValue(0);
  });

  it("adds a labelled one-off line, includes it in net pay, then marks it included", async () => {
    vi.mocked(repo.findActiveEmployeesForPeriod).mockResolvedValue([
      { id: EMPLOYEE_ID, dateOfJoining: moment.utc("2020-01-01").toDate(), status: "ACTIVE" },
    ] as never);
    vi.mocked(repo.findEffectiveSalaryStructure).mockResolvedValue(makeStructure() as never);
    const provider = { list: vi.fn().mockResolvedValue([{ id: "r1", label: "Referral bonus (Cara)", amount: 5000 }]), markIncluded: vi.fn() };
    setOneOffEarningsProvider(provider);
    await runPayroll(ORG_ID, { periodMonth: 9, periodYear: 2026 }, HR_ACTOR);
    setOneOffEarningsProvider(null);
    const data = vi.mocked(repo.upsertPayslip).mock.calls[0]![0].data;
    expect(data.earnings).toMatchObject({ basic: 50000, hra: 10000, "Referral bonus (Cara)": 5000 });
    expect(data.netPay).toBe(65000);
    expect(provider.markIncluded).toHaveBeenCalledWith(ORG_ID, ["r1"], 9, 2026);
  });
});
