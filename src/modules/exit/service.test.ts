import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./repository.js", () => ({
  findActiveResignation: vi.fn(),
  createResignation: vi.fn(),
  findResignation: vi.fn(),
  listResignations: vi.fn(),
  activeResignationsFor: vi.fn(),
  transition: vi.fn(),
  updateResignation: vi.fn(),
  createChecklist: vi.fn(),
  findChecklistByResignation: vi.fn(),
  closeChecklist: vi.fn(),
  findTask: vi.fn(),
  completeTask: vi.fn(),
  findExitsDue: vi.fn(),
  writeActivityLog: vi.fn(),
}));
vi.mock("../employee/service.js", () => ({
  getEmployeeSummary: vi.fn(),
  listDirectReportIds: vi.fn(),
  offboardEmployee: vi.fn(),
}));
vi.mock("../notifications/service.js", () => ({ notifyEmployees: vi.fn(), notifyRoles: vi.fn() }));

const repo = await import("./repository.js");
const employees = await import("../employee/service.js");
const notifications = await import("../notifications/service.js");
const service = await import("./service.js");

const ORG = "org_1";
const HR = { sub: "u_hr", role: "HR" as const, employeeId: "emp_hr" };
const EMP = { sub: "u_e", role: "EMPLOYEE" as const, employeeId: "emp_1" };
const MGR = { sub: "u_m", role: "MANAGER" as const, employeeId: "emp_mgr" };
const OTHER_MGR = { sub: "u_m2", role: "MANAGER" as const, employeeId: "emp_mgr2" };

const employee = (o: Record<string, unknown> = {}) =>
  ({ id: "emp_1", name: "Res Igner", email: "r@x.dev", status: "ACTIVE", departmentId: "d", managerId: "emp_mgr", ...o }) as never;
const resignation = (o: Record<string, unknown> = {}) =>
  ({ id: "res_1", orgId: ORG, employeeId: "emp_1", proposedLastDay: new Date("2026-12-31"), confirmedLastDay: null, status: "PENDING", exitInterviewNotes: "private", ...o }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(employees.getEmployeeSummary).mockResolvedValue(employee());
  vi.mocked(employees.listDirectReportIds).mockResolvedValue([]);
});

describe("exit — submit (US1)", () => {
  it("creates a pending resignation and notifies manager + HR (FR-001)", async () => {
    vi.mocked(repo.findActiveResignation).mockResolvedValue(null);
    vi.mocked(repo.createResignation).mockResolvedValue(resignation());
    await service.submitResignation(ORG, { proposedLastDay: "2099-01-31" }, EMP);
    expect(repo.createResignation).toHaveBeenCalled();
    expect(notifications.notifyEmployees).toHaveBeenCalledWith(ORG, ["emp_mgr"], expect.objectContaining({ type: "RESIGNATION_SUBMITTED" }));
    expect(notifications.notifyRoles).toHaveBeenCalledWith(ORG, ["HR"], expect.anything());
  });

  it("prevents a second active resignation (FR-002)", async () => {
    vi.mocked(repo.findActiveResignation).mockResolvedValue(resignation());
    await expect(service.submitResignation(ORG, { proposedLastDay: "2099-01-31" }, EMP)).rejects.toMatchObject({ code: "RESIGNATION_EXISTS" });
  });

  it("rejects a last day in the past", async () => {
    await expect(service.submitResignation(ORG, { proposedLastDay: "2001-01-01" }, EMP)).rejects.toMatchObject({ status: 400 });
  });

  it("hides exit-interview notes from the employee (FR-007)", async () => {
    vi.mocked(repo.listResignations).mockResolvedValue([resignation()]);
    const [mine] = await service.getMyResignations(ORG, EMP);
    expect(mine).not.toHaveProperty("exitInterviewNotes");
  });
});

describe("exit — acknowledge (US2)", () => {
  it("only the employee's manager or HR may acknowledge (FR-003)", async () => {
    vi.mocked(repo.findResignation).mockResolvedValue(resignation());
    await expect(service.acknowledgeResignation(ORG, "res_1", undefined, OTHER_MGR)).rejects.toMatchObject({ status: 403 });
  });

  it("moves to SERVING_NOTICE, keeps both dates, creates the IT/Finance/HR checklist (FR-004/005)", async () => {
    vi.mocked(repo.findResignation).mockResolvedValue(resignation());
    vi.mocked(repo.transition).mockResolvedValue({ count: 1 });
    await service.acknowledgeResignation(ORG, "res_1", "2027-01-15", MGR);
    expect(repo.transition).toHaveBeenCalledWith("res_1", ["PENDING"], expect.objectContaining({ status: "SERVING_NOTICE", confirmedLastDay: new Date("2027-01-15") }));
    const [, , tasks] = vi.mocked(repo.createChecklist).mock.calls[0]!;
    expect(new Set(tasks.map((t) => t.ownerRole))).toEqual(new Set(["IT", "FINANCE", "HR"]));
  });

  it("flags a resigning manager's direct reports for reassignment (FR-009)", async () => {
    vi.mocked(repo.findResignation).mockResolvedValue(resignation());
    vi.mocked(repo.transition).mockResolvedValue({ count: 1 });
    vi.mocked(employees.listDirectReportIds).mockResolvedValue(["emp_a", "emp_b"]);
    await service.acknowledgeResignation(ORG, "res_1", undefined, HR);
    const [, , tasks, reports] = vi.mocked(repo.createChecklist).mock.calls[0]!;
    expect(reports).toHaveLength(2);
    expect(tasks.some((t) => t.description.includes("Reassign 2 direct report"))).toBe(true);
  });

  it("cannot acknowledge twice", async () => {
    vi.mocked(repo.findResignation).mockResolvedValue(resignation({ status: "SERVING_NOTICE" }));
    vi.mocked(repo.transition).mockResolvedValue({ count: 0 });
    await expect(service.acknowledgeResignation(ORG, "res_1", undefined, HR)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});

describe("exit — offboarding (US3)", () => {
  const checklist = (statuses: string[]) =>
    ({ id: "cl_1", tasks: statuses.map((status, i) => ({ id: `t${i}`, ownerRole: "IT", description: `task ${i}`, status })) }) as never;

  it("blocks offboarding while clearance is incomplete and lists what remains (FR-006, SC-003)", async () => {
    vi.mocked(repo.findResignation).mockResolvedValue(resignation({ status: "SERVING_NOTICE" }));
    vi.mocked(repo.findChecklistByResignation).mockResolvedValue(checklist(["COMPLETE", "INCOMPLETE"]));
    await expect(service.completeOffboarding(ORG, "res_1", false, HR)).rejects.toMatchObject({
      code: "EXIT_CLEARANCE_INCOMPLETE",
      fields: { remainingTasks: ["IT: task 1"] },
    });
    expect(employees.offboardEmployee).not.toHaveBeenCalled();
  });

  it("offboards via 002 (revoking access) once clearance is complete (FR-010, SC-004)", async () => {
    vi.mocked(repo.findResignation).mockResolvedValue(resignation({ status: "SERVING_NOTICE" }));
    vi.mocked(repo.findChecklistByResignation).mockResolvedValue(checklist(["COMPLETE"]));
    await service.completeOffboarding(ORG, "res_1", false, HR);
    expect(employees.offboardEmployee).toHaveBeenCalledWith(ORG, "emp_1", HR);
    expect(repo.transition).toHaveBeenCalledWith("res_1", ["SERVING_NOTICE"], expect.objectContaining({ status: "COMPLETED", forcedOffboard: false }));
  });

  it("allows a forced offboard and records it, leaving tasks open (edge case)", async () => {
    vi.mocked(repo.findResignation).mockResolvedValue(resignation({ status: "SERVING_NOTICE" }));
    vi.mocked(repo.findChecklistByResignation).mockResolvedValue(checklist(["INCOMPLETE"]));
    await service.completeOffboarding(ORG, "res_1", true, HR);
    expect(employees.offboardEmployee).toHaveBeenCalled();
    expect(repo.transition).toHaveBeenCalledWith("res_1", ["SERVING_NOTICE"], expect.objectContaining({ forcedOffboard: true }));
    expect(repo.completeTask).not.toHaveBeenCalled();
  });

  it("withdrawal closes the checklist without offboarding (FR-008)", async () => {
    vi.mocked(repo.findResignation).mockResolvedValue(resignation({ status: "SERVING_NOTICE" }));
    vi.mocked(repo.transition).mockResolvedValue({ count: 1 });
    await service.withdrawResignation(ORG, "res_1", HR);
    expect(repo.closeChecklist).toHaveBeenCalledWith("res_1");
    expect(employees.offboardEmployee).not.toHaveBeenCalled();
  });
});

describe("exit — prompts and status", () => {
  it("prompts HR once per exit whose last day has passed (US2.3)", async () => {
    vi.mocked(repo.findExitsDue).mockResolvedValue([resignation({ status: "SERVING_NOTICE", confirmedLastDay: new Date("2026-10-01") })]);
    const n = await service.promptExitsDue(new Date("2026-10-05T09:00:00Z"));
    expect(n).toBe(1);
    expect(notifications.notifyRoles).toHaveBeenCalledWith(ORG, ["HR"], expect.objectContaining({ type: "EXIT_DUE" }));
    expect(repo.updateResignation).toHaveBeenCalledWith("res_1", expect.objectContaining({ exitDuePromptedAt: expect.any(Date) }));
  });

  it("reports SERVING_NOTICE with the confirmed day, and nothing after withdrawal (FR-004, SC-005)", async () => {
    vi.mocked(repo.activeResignationsFor).mockResolvedValue([resignation({ status: "SERVING_NOTICE", confirmedLastDay: new Date("2027-01-15") })]);
    const map = await service.exitStatusFor(ORG, ["emp_1", "emp_2"]);
    expect(map.get("emp_1")).toEqual({ exitStatus: "SERVING_NOTICE", lastWorkingDay: "2027-01-15" });
    expect(map.get("emp_2")).toEqual({ exitStatus: null, lastWorkingDay: null });
  });
});
