import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import moment from "moment";
import { DomainError } from "../../middleware/errorHandler.js";

vi.mock("./repository.js", () => ({
  findAttendanceByDay: vi.fn(),
  createAttendance: vi.fn(),
  updateAttendance: vi.fn(),
  upsertAttendance: vi.fn(),
  findAttendanceRange: vi.fn(),
  findHolidaysInRange: vi.fn(),
  findApprovedLeaveInRange: vi.fn(),
  findApprovedUnpaidLeaveInRange: vi.fn(),
  createLeaveRequest: vi.fn(),
  findLeaveRequestById: vi.fn(),
  updateLeaveRequest: vi.fn(),
  findLeaveRequestsByEmployee: vi.fn(),
  findPendingLeaveForEmployees: vi.fn(),
  findPendingLeaveOrgWide: vi.fn(),
  findLeaveBalance: vi.fn(),
  findLeaveBalancesForEmployee: vi.fn(),
  createLeaveBalance: vi.fn(),
  updateLeaveBalance: vi.fn(),
  findLeaveTypes: vi.fn(),
  findLeaveTypeById: vi.fn(),
  createLeaveType: vi.fn(),
  findHolidays: vi.fn(),
  createHoliday: vi.fn(),
  writeActivityLog: vi.fn(),
}));

vi.mock("../employee/service.js", () => ({
  getTeamView: vi.fn(),
  getEmployee: vi.fn(),
}));

const repo = await import("./repository.js");
const employeeService = await import("../employee/service.js");
const {
  checkIn,
  checkOut,
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  getApprovalQueue,
  getUnpaidLeaveDaysForPeriod,
} = await import("./service.js");

const ORG_ID = "org_1";
const EMPLOYEE_ID = "emp_1";
const MANAGER_ACTOR = { sub: "u_mgr", role: "MANAGER" as const, employeeId: "emp_mgr" };
const HR_ACTOR = { sub: "u_hr", role: "HR" as const, employeeId: "emp_hr" };
const EMPLOYEE_ACTOR = { sub: "u_emp", role: "EMPLOYEE" as const, employeeId: EMPLOYEE_ID };

function makeLeaveType(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: "lt_1", orgId: ORG_ID, name: "Paid", isPaid: true, defaultDays: 20, ...overrides };
}

function makeBalance(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "bal_1",
    orgId: ORG_ID,
    employeeId: EMPLOYEE_ID,
    leaveTypeId: "lt_1",
    year: 2026,
    allocated: 20,
    used: 0,
    ...overrides,
  };
}

function makeLeaveRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "req_1",
    orgId: ORG_ID,
    employeeId: EMPLOYEE_ID,
    leaveTypeId: "lt_1",
    startDate: moment.utc("2026-09-21").toDate(),
    endDate: moment.utc("2026-09-25").toDate(),
    days: 5,
    status: "PENDING",
    approverId: null,
    rejectionReason: null,
    ...overrides,
  };
}

describe("attendance service — checkIn/checkOut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a duplicate check-in for the same day", async () => {
    vi.mocked(repo.findAttendanceByDay).mockResolvedValue({ checkIn: moment().toDate() } as never);

    await expect(checkIn(ORG_ID, EMPLOYEE_ID)).rejects.toMatchObject({
      code: "ALREADY_CHECKED_IN",
      status: 409,
    });
  });

  it("allows check-in when no row exists yet today", async () => {
    vi.mocked(repo.findAttendanceByDay).mockResolvedValue(null);
    vi.mocked(repo.upsertAttendance).mockResolvedValue({ checkIn: moment().toDate() } as never);

    await checkIn(ORG_ID, EMPLOYEE_ID);

    expect(repo.upsertAttendance).toHaveBeenCalled();
  });

  it("rejects check-out when not checked in", async () => {
    vi.mocked(repo.findAttendanceByDay).mockResolvedValue(null);

    await expect(checkOut(ORG_ID, EMPLOYEE_ID)).rejects.toMatchObject({
      code: "NOT_CHECKED_IN",
      status: 409,
    });
  });

  it("rejects a duplicate check-out for the same day", async () => {
    vi.mocked(repo.findAttendanceByDay).mockResolvedValue({
      id: "att_1",
      checkIn: moment().toDate(),
      checkOut: moment().toDate(),
    } as never);

    await expect(checkOut(ORG_ID, EMPLOYEE_ID)).rejects.toMatchObject({
      code: "ALREADY_CHECKED_OUT",
      status: 409,
    });
  });
});

describe("attendance service — createLeaveRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Fixture dates are in late Sept 2026; pin "today" before them so the
    // past-date rule (HR/Admin only) doesn't reject them as time passes.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));
    vi.mocked(repo.findHolidaysInRange).mockResolvedValue([]);
    vi.mocked(repo.findApprovedLeaveInRange).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts only working days, excluding weekends (research.md R1)", async () => {
    // 2026-09-21 is a Monday; 2026-09-27 is the following Sunday (7 calendar days, 5 working days)
    vi.mocked(repo.findLeaveBalance).mockResolvedValue(makeBalance() as never);
    vi.mocked(repo.createLeaveRequest).mockImplementation(((data: Record<string, unknown>) =>
      Promise.resolve({ ...data, id: "req_1" })) as never);

    const result = await createLeaveRequest(
      ORG_ID,
      EMPLOYEE_ID,
      { leaveTypeId: "lt_1", startDate: "2026-09-21", endDate: "2026-09-27" },
      EMPLOYEE_ACTOR,
    );

    expect(result.days).toBe(5);
  });

  it("excludes a holiday from the working-day count (FR-008)", async () => {
    vi.mocked(repo.findHolidaysInRange).mockResolvedValue([{ date: moment.utc("2026-09-23").toDate() }] as never);
    vi.mocked(repo.findLeaveBalance).mockResolvedValue(makeBalance() as never);
    vi.mocked(repo.createLeaveRequest).mockImplementation(((data: Record<string, unknown>) =>
      Promise.resolve({ ...data, id: "req_1" })) as never);

    const result = await createLeaveRequest(
      ORG_ID,
      EMPLOYEE_ID,
      { leaveTypeId: "lt_1", startDate: "2026-09-21", endDate: "2026-09-25" },
      EMPLOYEE_ACTOR,
    );

    expect(result.days).toBe(4);
  });

  it("does not decrement the balance on submission (FR-010, SC-003)", async () => {
    vi.mocked(repo.findLeaveBalance).mockResolvedValue(makeBalance() as never);
    vi.mocked(repo.createLeaveRequest).mockImplementation(((data: Record<string, unknown>) =>
      Promise.resolve({ ...data, id: "req_1" })) as never);

    await createLeaveRequest(
      ORG_ID,
      EMPLOYEE_ID,
      { leaveTypeId: "lt_1", startDate: "2026-09-21", endDate: "2026-09-25" },
      EMPLOYEE_ACTOR,
    );

    expect(repo.updateLeaveBalance).not.toHaveBeenCalled();
  });

  it("blocks a request exceeding the remaining balance (FR-007)", async () => {
    vi.mocked(repo.findLeaveBalance).mockResolvedValue(makeBalance({ used: 18 }) as never);

    await expect(
      createLeaveRequest(
        ORG_ID,
        EMPLOYEE_ID,
        { leaveTypeId: "lt_1", startDate: "2026-09-21", endDate: "2026-09-25" },
        EMPLOYEE_ACTOR,
      ),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE", status: 409 });
  });

  it("rejects a past start date from a self-service Employee (spec Edge Cases)", async () => {
    await expect(
      createLeaveRequest(
        ORG_ID,
        EMPLOYEE_ID,
        { leaveTypeId: "lt_1", startDate: "2020-01-01", endDate: "2020-01-02" },
        EMPLOYEE_ACTOR,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });

  it("allows HR to record a past-dated request on another employee's behalf", async () => {
    vi.mocked(repo.findLeaveBalance).mockResolvedValue(makeBalance() as never);
    vi.mocked(repo.createLeaveRequest).mockImplementation(((data: Record<string, unknown>) =>
      Promise.resolve({ ...data, id: "req_1" })) as never);

    const result = await createLeaveRequest(
      ORG_ID,
      "emp_hr",
      { leaveTypeId: "lt_1", startDate: "2020-01-01", endDate: "2020-01-02", employeeId: EMPLOYEE_ID },
      HR_ACTOR,
    );

    expect(result.employeeId).toBe(EMPLOYEE_ID);
  });

  it("rejects a self-service caller filing on someone else's behalf", async () => {
    await expect(
      createLeaveRequest(
        ORG_ID,
        EMPLOYEE_ID,
        { leaveTypeId: "lt_1", startDate: "2026-09-21", endDate: "2026-09-25", employeeId: "emp_hr" },
        EMPLOYEE_ACTOR,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});

describe("attendance service — approve/reject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repo.findHolidaysInRange).mockResolvedValue([]);
    vi.mocked(employeeService.getTeamView).mockResolvedValue({
      manager: null,
      directReports: [{ id: EMPLOYEE_ID, name: "A", departmentId: null, designationId: null }],
    } as never);
  });

  it("rejects a Manager deciding on someone who is not their direct report (FR-014)", async () => {
    vi.mocked(repo.findLeaveRequestById).mockResolvedValue(
      makeLeaveRequest({ employeeId: "emp_other_team" }) as never,
    );

    await expect(approveLeaveRequest(ORG_ID, "req_1", MANAGER_ACTOR)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    await expect(
      rejectLeaveRequest(ORG_ID, "req_1", MANAGER_ACTOR, { reason: "No" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(repo.updateLeaveRequest).not.toHaveBeenCalled();
  });

  it("lets HR decide org-wide without a reporting-line check (FR-015)", async () => {
    vi.mocked(repo.findLeaveRequestById).mockResolvedValue(
      makeLeaveRequest({ employeeId: "emp_other_team" }) as never,
    );
    vi.mocked(repo.updateLeaveRequest).mockResolvedValue(makeLeaveRequest({ status: "REJECTED" }) as never);

    await rejectLeaveRequest(ORG_ID, "req_1", HR_ACTOR, { reason: "Coverage" });

    expect(employeeService.getTeamView).not.toHaveBeenCalled();
    expect(repo.updateLeaveRequest).toHaveBeenCalled();
  });

  it("rejects self-approval unconditionally, even for HR/Admin (research.md R4)", async () => {
    vi.mocked(repo.findLeaveRequestById).mockResolvedValue(
      makeLeaveRequest({ employeeId: "emp_hr" }) as never,
    );

    await expect(approveLeaveRequest(ORG_ID, "req_1", HR_ACTOR)).rejects.toMatchObject({
      code: "SELF_APPROVAL_FORBIDDEN",
      status: 403,
    });
  });

  it("rejects deciding an already-decided request (FR-012, SC-005)", async () => {
    vi.mocked(repo.findLeaveRequestById).mockResolvedValue(
      makeLeaveRequest({ status: "APPROVED" }) as never,
    );

    await expect(approveLeaveRequest(ORG_ID, "req_1", MANAGER_ACTOR)).rejects.toMatchObject({
      code: "ALREADY_DECIDED",
      status: 409,
    });
  });

  it("increments the balance by exactly the working-day count on approval (FR-010)", async () => {
    vi.mocked(repo.findLeaveRequestById).mockResolvedValue(makeLeaveRequest() as never);
    vi.mocked(repo.findLeaveBalance).mockResolvedValue(makeBalance() as never);
    vi.mocked(repo.updateLeaveRequest).mockResolvedValue(makeLeaveRequest({ status: "APPROVED" }) as never);

    await approveLeaveRequest(ORG_ID, "req_1", MANAGER_ACTOR);

    expect(repo.updateLeaveBalance).toHaveBeenCalledWith("bal_1", { used: 5 });
  });

  it("writes ON_LEAVE attendance rows for each working day on approval (research.md R7)", async () => {
    vi.mocked(repo.findLeaveRequestById).mockResolvedValue(makeLeaveRequest() as never);
    vi.mocked(repo.findLeaveBalance).mockResolvedValue(makeBalance() as never);
    vi.mocked(repo.updateLeaveRequest).mockResolvedValue(makeLeaveRequest({ status: "APPROVED" }) as never);

    await approveLeaveRequest(ORG_ID, "req_1", MANAGER_ACTOR);

    expect(repo.upsertAttendance).toHaveBeenCalledTimes(5);
    expect(repo.upsertAttendance).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ON_LEAVE" }) }),
    );
  });

  it("never touches the balance on rejection (FR-010, SC-003)", async () => {
    vi.mocked(repo.findLeaveRequestById).mockResolvedValue(makeLeaveRequest() as never);
    vi.mocked(repo.updateLeaveRequest).mockResolvedValue(makeLeaveRequest({ status: "REJECTED" }) as never);

    await rejectLeaveRequest(ORG_ID, "req_1", MANAGER_ACTOR, { reason: "Coverage conflict" });

    expect(repo.updateLeaveBalance).not.toHaveBeenCalled();
    expect(repo.upsertAttendance).not.toHaveBeenCalled();
  });
});

describe("attendance service — getApprovalQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes a Manager's queue to their current direct reports only (FR-014, SC-004)", async () => {
    vi.mocked(employeeService.getTeamView).mockResolvedValue({
      manager: null,
      directReports: [{ id: "emp_report_1", name: "A", departmentId: null, designationId: null }],
    } as never);
    vi.mocked(repo.findPendingLeaveForEmployees).mockResolvedValue([] as never);

    await getApprovalQueue(ORG_ID, MANAGER_ACTOR);

    expect(repo.findPendingLeaveForEmployees).toHaveBeenCalledWith(ORG_ID, ["emp_report_1"]);
  });

  it("gives HR/Admin the company-wide pending queue (FR-015)", async () => {
    vi.mocked(repo.findPendingLeaveOrgWide).mockResolvedValue([] as never);

    await getApprovalQueue(ORG_ID, HR_ACTOR);

    expect(repo.findPendingLeaveOrgWide).toHaveBeenCalledWith(ORG_ID);
    expect(employeeService.getTeamView).not.toHaveBeenCalled();
  });
});

describe("attendance service — getUnpaidLeaveDaysForPeriod (004-payroll research.md R2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repo.findHolidaysInRange).mockResolvedValue([]);
  });

  it("sums working days across approved unpaid leave requests overlapping the period", async () => {
    vi.mocked(repo.findApprovedUnpaidLeaveInRange).mockResolvedValue([
      { startDate: moment.utc("2026-09-21").toDate(), endDate: moment.utc("2026-09-25").toDate() }, // 5 weekdays
    ] as never);

    const days = await getUnpaidLeaveDaysForPeriod(
      ORG_ID,
      EMPLOYEE_ID,
      moment.utc("2026-09-01").toDate(),
      moment.utc("2026-09-30").toDate(),
    );

    expect(days).toBe(5);
  });

  it("clips a leave request's range to the period's own bounds", async () => {
    // Leave spans Aug 28 - Sep 3; period is Sept only, so only Sep 1-3 (weekdays) count.
    vi.mocked(repo.findApprovedUnpaidLeaveInRange).mockResolvedValue([
      { startDate: moment.utc("2026-08-28").toDate(), endDate: moment.utc("2026-09-03").toDate() },
    ] as never);

    const days = await getUnpaidLeaveDaysForPeriod(
      ORG_ID,
      EMPLOYEE_ID,
      moment.utc("2026-09-01").toDate(),
      moment.utc("2026-09-30").toDate(),
    );

    // Sep 1 (Tue), Sep 2 (Wed), Sep 3 (Thu) = 3 weekdays
    expect(days).toBe(3);
  });

  it("returns 0 when there is no approved unpaid leave in the period", async () => {
    vi.mocked(repo.findApprovedUnpaidLeaveInRange).mockResolvedValue([] as never);

    const days = await getUnpaidLeaveDaysForPeriod(
      ORG_ID,
      EMPLOYEE_ID,
      moment.utc("2026-09-01").toDate(),
      moment.utc("2026-09-30").toDate(),
    );

    expect(days).toBe(0);
  });
});
