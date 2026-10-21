import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./repository.js", () => ({
  listTemplates: vi.fn(),
  createTemplates: vi.fn(),
  createTemplate: vi.fn(),
  findTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  findChecklistByEmployee: vi.fn(),
  createChecklistWithTasks: vi.fn(),
  listChecklistsWithTasks: vi.fn(),
  findTask: vi.fn(),
  createTask: vi.fn(),
  maxTaskPosition: vi.fn(),
  updateTask: vi.fn(),
  completeTask: vi.fn(),
  deleteTask: vi.fn(),
  listIncompleteTasks: vi.fn(),
  writeActivityLog: vi.fn(),
}));

vi.mock("../employee/service.js", () => ({ getEmployeeSummary: vi.fn() }));

const repo = await import("./repository.js");
const employees = await import("../employee/service.js");
const service = await import("./service.js");

const ORG = "org_1";
const HR = { sub: "u_hr", role: "HR" as const, employeeId: "emp_hr" };
const HIRE_ACTOR = { sub: "u_new", role: "EMPLOYEE" as const, employeeId: "emp_new" };
const MGR = { sub: "u_mgr", role: "MANAGER" as const, employeeId: "emp_mgr" };
const OTHER = { sub: "u_x", role: "EMPLOYEE" as const, employeeId: "emp_x" };

const hire = (o: Record<string, unknown> = {}) =>
  ({ id: "emp_new", name: "New", email: "n@x.dev", status: "ACTIVE", departmentId: "d", managerId: "emp_mgr", dateOfJoining: new Date("2026-10-01"), ...o }) as never;
const task = (o: Record<string, unknown> = {}) =>
  ({ id: "t1", status: "INCOMPLETE", ownerRole: "EMPLOYEE", ownerEmployeeId: null, checklist: { employeeId: "emp_new" }, ...o }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(employees.getEmployeeSummary).mockResolvedValue(hire());
});

describe("onboarding — ownership (FR-003/004/006)", () => {
  it("routes EMPLOYEE tasks to the hire and MANAGER tasks to their manager", () => {
    expect(service.canCompleteTask(task(), hire(), HIRE_ACTOR)).toBe(true);
    expect(service.canCompleteTask(task(), hire(), OTHER)).toBe(false);
    expect(service.canCompleteTask(task({ ownerRole: "MANAGER" }), hire(), MGR)).toBe(true);
    expect(service.canCompleteTask(task({ ownerRole: "MANAGER" }), hire(), HIRE_ACTOR)).toBe(false);
  });

  it("lets an explicit reassignment override the role", () => {
    const t = task({ ownerRole: "MANAGER", ownerEmployeeId: "emp_x" });
    expect(service.canCompleteTask(t, hire(), OTHER)).toBe(true);
    expect(service.canCompleteTask(t, hire(), MGR)).toBe(false);
    expect(service.canCompleteTask(t, hire(), HR)).toBe(true);
  });

  it("refuses completion by a non-owner", async () => {
    vi.mocked(repo.findTask).mockResolvedValue(task({ ownerRole: "HR" }));
    await expect(service.completeTask(ORG, "t1", HIRE_ACTOR)).rejects.toMatchObject({ status: 403 });
    expect(repo.completeTask).not.toHaveBeenCalled();
  });

  it("records who completed it, and a second completion is a 409 (SC-003)", async () => {
    vi.mocked(repo.findTask).mockResolvedValue(task());
    vi.mocked(repo.completeTask).mockResolvedValueOnce({ count: 1 });
    await service.completeTask(ORG, "t1", HIRE_ACTOR);
    expect(repo.completeTask).toHaveBeenCalledWith("t1", "emp_new");

    vi.mocked(repo.completeTask).mockResolvedValueOnce({ count: 0 });
    await expect(service.completeTask(ORG, "t1", HIRE_ACTOR)).rejects.toMatchObject({ code: "ALREADY_COMPLETE" });
  });

  it("rejects reassignment to an offboarded employee (edge case)", async () => {
    vi.mocked(repo.findTask).mockResolvedValue(task());
    vi.mocked(employees.getEmployeeSummary).mockResolvedValue(hire({ status: "OFFBOARDED" }));
    await expect(service.updateTask(ORG, "t1", { ownerEmployeeId: "emp_gone" }, HR)).rejects.toMatchObject({ code: "OWNER_INVALID" });
  });
});

describe("onboarding — checklists (FR-001/005/010)", () => {
  it("seeds the default template the first time and copies it into the checklist", async () => {
    vi.mocked(repo.findChecklistByEmployee).mockResolvedValue(null);
    vi.mocked(repo.listTemplates)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(service.DEFAULT_TEMPLATE.map((t, order) => ({ id: `tp${order}`, orgId: ORG, order, ...t })) as never);
    vi.mocked(repo.createChecklistWithTasks).mockResolvedValue({ id: "c1", tasks: [{ status: "INCOMPLETE" }] } as never);

    await service.onEmployeeCreated(ORG, "emp_new", HR);

    expect(repo.createTemplates).toHaveBeenCalled();
    const [, , tasks] = vi.mocked(repo.createChecklistWithTasks).mock.calls[0]!;
    expect(tasks).toHaveLength(service.DEFAULT_TEMPLATE.length);
  });

  it("refuses a second checklist for the same employee", async () => {
    vi.mocked(repo.findChecklistByEmployee).mockResolvedValue({ id: "c1", tasks: [] } as never);
    await expect(service.attachChecklist(ORG, "emp_new", HR)).rejects.toMatchObject({ code: "CHECKLIST_EXISTS" });
  });

  it("hides a checklist from unrelated employees (SC-002)", async () => {
    vi.mocked(repo.findChecklistByEmployee).mockResolvedValue({ id: "c1", tasks: [] } as never);
    await expect(service.getChecklist(ORG, "emp_new", OTHER)).rejects.toMatchObject({ status: 403 });
    await expect(service.getChecklist(ORG, "emp_new", MGR)).resolves.toBeTruthy();
  });
});

describe("onboarding — overview (FR-008/009, SC-004)", () => {
  it("lists only in-progress checklists and flags stalled ones", async () => {
    vi.mocked(repo.listChecklistsWithTasks).mockResolvedValue([
      { id: "c1", employeeId: "emp_new", tasks: [{ status: "COMPLETE" }, { status: "INCOMPLETE" }] },
      { id: "c2", employeeId: "emp_done", tasks: [{ status: "COMPLETE" }] },
    ] as never);

    const overview = await service.getOverview(ORG, new Date("2026-10-11T12:00:00Z"));

    expect(overview).toHaveLength(1);
    expect(overview[0]).toMatchObject({ employeeId: "emp_new", completedCount: 1, totalCount: 2, daysSinceJoining: 10, stalled: true });
  });

  it("does not flag a hire whose joining date is still ahead", async () => {
    vi.mocked(repo.listChecklistsWithTasks).mockResolvedValue([{ id: "c1", employeeId: "emp_new", tasks: [{ status: "INCOMPLETE" }] }] as never);
    const [entry] = await service.getOverview(ORG, new Date("2026-09-25T00:00:00Z"));
    expect(entry).toMatchObject({ stalled: false, daysSinceJoining: -6 });
  });
});
