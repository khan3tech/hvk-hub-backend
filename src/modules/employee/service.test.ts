import { describe, it, expect, vi, beforeEach } from "vitest";
import moment from "moment";
import { DomainError } from "../../middleware/errorHandler.js";

vi.mock("./repository.js", () => ({
  createEmployee: vi.fn(),
  findEmployeeById: vi.fn(),
  findEmployeeByEmail: vi.fn(),
  updateEmployee: vi.fn(),
  countEmployees: vi.fn(),
  listEmployees: vi.fn(),
  findDepartments: vi.fn(),
  createDepartment: vi.fn(),
  findDesignations: vi.fn(),
  createDesignation: vi.fn(),
  writeActivityLog: vi.fn(),
  findOffboardActivityLog: vi.fn(),
}));

vi.mock("../auth/service.js", () => ({
  revokeAllSessionsForUser: vi.fn(),
}));

const repo = await import("./repository.js");
const authService = await import("../auth/service.js");
const {
  createEmployee,
  getEmployee,
  listEmployeesForRequester,
  updateEmployee,
  offboardEmployee,
  getTeamView,
  getOffboardedDate,
} = await import("./service.js");

const ORG_ID = "org_1";
const ACTOR = { sub: "user_hr", role: "HR" as const, employeeId: "emp_hr" };

function makeEmployee(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "emp_1",
    orgId: ORG_ID,
    employeeCode: "EMP-00001",
    name: "Test Employee",
    email: "test@example.com",
    departmentId: "dept_1",
    designationId: "desig_1",
    managerId: null,
    dateOfJoining: moment.utc("2026-01-01").toDate(),
    status: "ACTIVE",
    user: { id: "user_1" },
    ...overrides,
  };
}

describe("employee service — createEmployee", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a sequential, zero-padded employee code", async () => {
    vi.mocked(repo.findEmployeeByEmail).mockResolvedValue(null);
    vi.mocked(repo.countEmployees).mockResolvedValue(4);
    vi.mocked(repo.createEmployee).mockResolvedValue(makeEmployee({ employeeCode: "EMP-00005" }) as never);

    await createEmployee(
      ORG_ID,
      { name: "New Hire", email: "new@example.com", departmentId: "d1", designationId: "de1", dateOfJoining: "2026-01-01" },
      ACTOR,
    );

    expect(repo.createEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ employeeCode: "EMP-00005" }),
    );
  });

  it("rejects a duplicate email with EMAIL_TAKEN", async () => {
    vi.mocked(repo.findEmployeeByEmail).mockResolvedValue(makeEmployee() as never);

    await expect(
      createEmployee(
        ORG_ID,
        { name: "Dup", email: "test@example.com", departmentId: "d1", designationId: "de1", dateOfJoining: "2026-01-01" },
        ACTOR,
      ),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN", status: 409 });
  });

  it("writes an ActivityLog entry and returns a one-time temporary password", async () => {
    vi.mocked(repo.findEmployeeByEmail).mockResolvedValue(null);
    vi.mocked(repo.countEmployees).mockResolvedValue(0);
    vi.mocked(repo.createEmployee).mockResolvedValue(makeEmployee() as never);

    const result = await createEmployee(
      ORG_ID,
      { name: "New Hire", email: "new@example.com", departmentId: "d1", designationId: "de1", dateOfJoining: "2026-01-01" },
      ACTOR,
    );

    expect(result.temporaryPassword).toBeTruthy();
    expect(repo.writeActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "employee.created", actorId: "emp_hr" }),
    );
  });

  it("rejects when the requested manager is a self-reference", async () => {
    vi.mocked(repo.findEmployeeByEmail).mockResolvedValue(null);

    // managerId equal to what would be the new employee's own id can't happen pre-creation,
    // but the same validateManagerAssignment path is exercised via updateEmployee below —
    // this test instead covers create-time manager validation against a non-existent id.
    vi.mocked(repo.findEmployeeById).mockResolvedValue(null);

    await expect(
      createEmployee(
        ORG_ID,
        {
          name: "New Hire",
          email: "new@example.com",
          departmentId: "d1",
          designationId: "de1",
          dateOfJoining: "2026-01-01",
          managerId: "does_not_exist",
        },
        ACTOR,
      ),
    ).rejects.toMatchObject({ code: "MANAGER_INVALID", status: 409 });
  });
});

describe("employee service — getEmployee (scope enforcement)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets HR fetch any employee", async () => {
    vi.mocked(repo.findEmployeeById).mockResolvedValue(makeEmployee() as never);
    const result = await getEmployee(ORG_ID, "emp_1", { sub: "u", role: "HR", employeeId: "other" });
    expect(result.id).toBe("emp_1");
  });

  it("lets a Manager fetch a direct report", async () => {
    vi.mocked(repo.findEmployeeById).mockResolvedValue(makeEmployee({ managerId: "mgr_1" }) as never);
    const result = await getEmployee(ORG_ID, "emp_1", { sub: "u", role: "MANAGER", employeeId: "mgr_1" });
    expect(result.id).toBe("emp_1");
  });

  it("rejects a Manager fetching a non-direct-report with FORBIDDEN", async () => {
    vi.mocked(repo.findEmployeeById).mockResolvedValue(makeEmployee({ managerId: "someone_else" }) as never);
    await expect(
      getEmployee(ORG_ID, "emp_1", { sub: "u", role: "MANAGER", employeeId: "mgr_1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("rejects an Employee fetching someone else's record with FORBIDDEN", async () => {
    vi.mocked(repo.findEmployeeById).mockResolvedValue(makeEmployee() as never);
    await expect(
      getEmployee(ORG_ID, "emp_1", { sub: "u", role: "EMPLOYEE", employeeId: "someone_else" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("lets an Employee fetch their own record", async () => {
    vi.mocked(repo.findEmployeeById).mockResolvedValue(makeEmployee() as never);
    const result = await getEmployee(ORG_ID, "emp_1", { sub: "u", role: "EMPLOYEE", employeeId: "emp_1" });
    expect(result.id).toBe("emp_1");
  });

  it("throws NOT_FOUND when the employee doesn't exist in the org", async () => {
    vi.mocked(repo.findEmployeeById).mockResolvedValue(null);
    await expect(getEmployee(ORG_ID, "missing", ACTOR)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });
});

describe("employee service — listEmployeesForRequester (directory scoping)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gives HR/Admin an unfiltered-by-manager org query, defaulting to ACTIVE status", async () => {
    vi.mocked(repo.listEmployees).mockResolvedValue([] as never);
    await listEmployeesForRequester(ORG_ID, { sub: "u", role: "HR", employeeId: "e1" });
    expect(repo.listEmployees).toHaveBeenCalledWith(ORG_ID, expect.objectContaining({ status: "ACTIVE" }));
  });

  it("excludes offboarded employees from the default list (spec User Story 3)", async () => {
    vi.mocked(repo.listEmployees).mockResolvedValue([makeEmployee()] as never);
    await listEmployeesForRequester(ORG_ID, { sub: "u", role: "ADMIN", employeeId: "e1" });
    const [, where] = vi.mocked(repo.listEmployees).mock.calls[0]!;
    expect(where).toMatchObject({ status: "ACTIVE" });
  });

  it("scopes a Manager's list to their own direct reports", async () => {
    vi.mocked(repo.listEmployees).mockResolvedValue([] as never);
    await listEmployeesForRequester(ORG_ID, { sub: "u", role: "MANAGER", employeeId: "mgr_1" });
    expect(repo.listEmployees).toHaveBeenCalledWith(ORG_ID, expect.objectContaining({ managerId: "mgr_1" }));
  });

  it("scopes an Employee's list to themself only", async () => {
    vi.mocked(repo.findEmployeeById).mockResolvedValue(makeEmployee() as never);
    const result = await listEmployeesForRequester(ORG_ID, { sub: "u", role: "EMPLOYEE", employeeId: "emp_1" });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("emp_1");
  });
});

describe("employee service — updateEmployee", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a self-reference manager assignment", async () => {
    vi.mocked(repo.findEmployeeById).mockImplementation(((_orgId: string, id: string) =>
      Promise.resolve(makeEmployee({ id }))) as never);

    await expect(
      updateEmployee(ORG_ID, "emp_1", { managerId: "emp_1" }, ACTOR),
    ).rejects.toMatchObject({ code: "MANAGER_INVALID", status: 409 });
  });

  it("rejects a transitive reporting-line cycle", async () => {
    // A -> B -> C ; attempting C's manager = A must be rejected.
    const employees: Record<string, ReturnType<typeof makeEmployee>> = {
      A: makeEmployee({ id: "A", managerId: "B" }),
      B: makeEmployee({ id: "B", managerId: "C" }),
      C: makeEmployee({ id: "C", managerId: null }),
    };
    vi.mocked(repo.findEmployeeById).mockImplementation(((_orgId: string, id: string) =>
      Promise.resolve(employees[id] ?? null)) as never);
    vi.mocked(repo.countEmployees).mockResolvedValue(3);

    await expect(
      updateEmployee(ORG_ID, "C", { managerId: "A" }, ACTOR),
    ).rejects.toMatchObject({ code: "MANAGER_INVALID", status: 409 });
  });

  it("rejects assigning an offboarded employee as manager", async () => {
    vi.mocked(repo.findEmployeeById).mockImplementation(((_orgId: string, id: string) => {
      if (id === "emp_target") return Promise.resolve(makeEmployee({ id: "emp_target" }));
      return Promise.resolve(makeEmployee({ id, status: "OFFBOARDED" }));
    }) as never);

    await expect(
      updateEmployee(ORG_ID, "emp_target", { managerId: "offboarded_mgr" }, ACTOR),
    ).rejects.toMatchObject({ code: "MANAGER_INVALID", status: 409 });
  });

  it("writes a before/after ActivityLog entry on a valid update", async () => {
    vi.mocked(repo.findEmployeeById).mockResolvedValue(makeEmployee() as never);
    vi.mocked(repo.updateEmployee).mockResolvedValue(makeEmployee({ departmentId: "dept_2" }) as never);

    await updateEmployee(ORG_ID, "emp_1", { departmentId: "dept_2" }, ACTOR);

    expect(repo.writeActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "employee.updated" }),
    );
  });
});

describe("employee service — offboardEmployee", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets status to OFFBOARDED, revokes sessions, and writes an audited ActivityLog entry", async () => {
    vi.mocked(repo.findEmployeeById).mockResolvedValue(makeEmployee() as never);
    vi.mocked(repo.updateEmployee).mockResolvedValue(makeEmployee({ status: "OFFBOARDED" }) as never);

    const result = await offboardEmployee(ORG_ID, "emp_1", ACTOR);

    expect(result.status).toBe("OFFBOARDED");
    expect(authService.revokeAllSessionsForUser).toHaveBeenCalledWith("user_1");
    expect(repo.writeActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "employee.offboarded" }),
    );
  });

  it("rejects offboarding an already-offboarded employee", async () => {
    vi.mocked(repo.findEmployeeById).mockResolvedValue(makeEmployee({ status: "OFFBOARDED" }) as never);

    await expect(offboardEmployee(ORG_ID, "emp_1", ACTOR)).rejects.toMatchObject({
      code: "ALREADY_OFFBOARDED",
      status: 409,
    });
  });

  it("throws NOT_FOUND for a nonexistent employee", async () => {
    vi.mocked(repo.findEmployeeById).mockResolvedValue(null);
    await expect(offboardEmployee(ORG_ID, "missing", ACTOR)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });
});

describe("employee service — getTeamView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty directReports array, not an error, when there are none", async () => {
    vi.mocked(repo.findEmployeeById).mockResolvedValue(makeEmployee({ managerId: null }) as never);
    vi.mocked(repo.listEmployees).mockResolvedValue([] as never);

    const result = await getTeamView(ORG_ID, { sub: "u", role: "MANAGER", employeeId: "mgr_1" });

    expect(result.directReports).toEqual([]);
    expect(result.manager).toBeNull();
  });
});

describe("employee service — getOffboardedDate (004-payroll research.md R4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the offboarding ActivityLog row's createdAt", async () => {
    const offboardedAt = moment("2026-09-10T00:00:00.000Z").toDate();
    vi.mocked(repo.findOffboardActivityLog).mockResolvedValue({ createdAt: offboardedAt } as never);

    const result = await getOffboardedDate(ORG_ID, "emp_1");

    expect(result).toEqual(offboardedAt);
  });

  it("returns null when the employee was never offboarded", async () => {
    vi.mocked(repo.findOffboardActivityLog).mockResolvedValue(null);

    const result = await getOffboardedDate(ORG_ID, "emp_1");

    expect(result).toBeNull();
  });
});
