import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./repository.js", () => ({
  createGoal: vi.fn(),
  findGoal: vi.fn(),
  listGoals: vi.fn(),
  transitionGoal: vi.fn(),
  createCycleWithReviews: vi.fn(),
  findCycle: vi.fn(),
  listCycles: vi.fn(),
  findReview: vi.fn(),
  listReviews: vi.fn(),
  updateReview: vi.fn(),
  updateInProgressReview: vi.fn(),
  writeActivityLog: vi.fn(),
}));
vi.mock("../employee/service.js", () => ({ getEmployeeSummary: vi.fn(), listActiveEmployeeSummaries: vi.fn(), listDirectReportIds: vi.fn() }));
vi.mock("../notifications/service.js", () => ({ notifyEmployees: vi.fn() }));

const repo = await import("./repository.js");
const employees = await import("../employee/service.js");
const service = await import("./service.js");

const ORG = "org_1";
const HR = { sub: "u_hr", role: "HR" as const, employeeId: "emp_hr" };
const EMP = { sub: "u_e", role: "EMPLOYEE" as const, employeeId: "emp_1" };
const MGR = { sub: "u_m", role: "MANAGER" as const, employeeId: "emp_mgr" };
const NEW_MGR = { sub: "u_m2", role: "MANAGER" as const, employeeId: "emp_mgr2" };

const summary = (o: Record<string, unknown> = {}) => ({ id: "emp_1", name: "E", email: "e@x.dev", status: "ACTIVE", departmentId: "d", managerId: "emp_mgr", dateOfJoining: new Date("2025-01-01"), ...o }) as never;
const goal = (o: Record<string, unknown> = {}) => ({ id: "g1", orgId: ORG, employeeId: "emp_1", description: "Ship v2", targetDate: new Date("2099-12-31"), status: "PENDING_APPROVAL", ...o }) as never;
const cycle = { id: "cy1", name: "H2", startDate: new Date("2026-07-01"), endDate: new Date("2026-12-31") };
const review = (o: Record<string, unknown> = {}) => ({ id: "r1", orgId: ORG, employeeId: "emp_1", reviewCycleId: "cy1", managerId: "emp_mgr", rating: null, status: "IN_PROGRESS", reviewCycle: cycle, ...o }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(employees.getEmployeeSummary).mockResolvedValue(summary());
  vi.mocked(repo.listGoals).mockResolvedValue([]);
});

describe("performance — goals (US1)", () => {
  it("a new goal is pending approval and the manager is told (FR-001/002)", async () => {
    vi.mocked(repo.createGoal).mockResolvedValue(goal());
    const g = await service.createGoal(ORG, { description: "Ship v2", targetDate: "2099-12-31" }, EMP);
    expect(g.status).toBe("PENDING_APPROVAL");
  });

  it("only the employee's current manager (or HR) decides, never the owner", async () => {
    vi.mocked(repo.findGoal).mockResolvedValue(goal());
    await expect(service.approveGoal(ORG, "g1", EMP)).rejects.toMatchObject({ status: 403 });
    await expect(service.approveGoal(ORG, "g1", NEW_MGR)).rejects.toMatchObject({ status: 403 });
    vi.mocked(repo.transitionGoal).mockResolvedValue({ count: 1 });
    await service.approveGoal(ORG, "g1", MGR);
    expect(repo.transitionGoal).toHaveBeenCalledWith("g1", ["PENDING_APPROVAL"], expect.objectContaining({ status: "ACTIVE", approvedById: "emp_mgr" }));
  });

  it("request changes → owner revises → pending again (FR-003, US1.4)", async () => {
    vi.mocked(repo.findGoal).mockResolvedValue(goal());
    vi.mocked(repo.transitionGoal).mockResolvedValue({ count: 1 });
    await service.requestGoalChanges(ORG, "g1", "Make it measurable", MGR);
    expect(repo.transitionGoal).toHaveBeenLastCalledWith("g1", ["PENDING_APPROVAL"], { status: "CHANGES_REQUESTED", changeRequestNote: "Make it measurable" });
    await service.reviseGoal(ORG, "g1", { description: "Ship v2 to 3 customers" }, EMP);
    expect(repo.transitionGoal).toHaveBeenLastCalledWith("g1", ["CHANGES_REQUESTED", "PENDING_APPROVAL"], expect.objectContaining({ status: "PENDING_APPROVAL" }));
  });

  it("progress only on an active goal before its target date (FR-004)", async () => {
    vi.mocked(repo.findGoal).mockResolvedValue(goal({ status: "PENDING_APPROVAL" }));
    await expect(service.updateGoalProgress(ORG, "g1", { progressPercent: 50 }, EMP)).rejects.toMatchObject({ code: "INVALID_STATE" });
    vi.mocked(repo.findGoal).mockResolvedValue(goal({ status: "ACTIVE", targetDate: new Date("2001-01-01") }));
    await expect(service.updateGoalProgress(ORG, "g1", { progressPercent: 50 }, EMP)).rejects.toMatchObject({ code: "PERIOD_ENDED" });
  });
});

describe("performance — reviews (US2)", () => {
  it("finalize requires a rating, then locks the review (FR-005/007, SC-004)", async () => {
    vi.mocked(repo.findReview).mockResolvedValue(review());
    await expect(service.finalizeReview(ORG, "r1", MGR)).rejects.toMatchObject({ status: 400 });

    vi.mocked(repo.findReview).mockResolvedValue(review({ status: "FINAL", rating: "4" }));
    await expect(service.saveManagerDraft(ORG, "r1", { rating: "5" }, MGR)).rejects.toMatchObject({ code: "REVIEW_FINAL" });
    await expect(service.addSelfReflection(ORG, "r1", "late", EMP)).rejects.toMatchObject({ code: "REVIEW_FINAL" });
  });

  it("HR corrects a final review and the before/after + reason is recorded", async () => {
    vi.mocked(repo.findReview).mockResolvedValue(review({ status: "FINAL", rating: "2", managerComments: "x" }));
    await service.correctReview(ORG, "r1", { rating: "3", reason: "Calibration" }, HR);
    expect(repo.writeActivityLog).toHaveBeenCalledWith(expect.objectContaining({ action: "review.corrected", before: { rating: "2", managerComments: "x" }, after: { rating: "3", reason: "Calibration" } }));
  });

  it("transfers an in-progress review to the new manager, keeping the previous one (FR-011, SC-005)", async () => {
    vi.mocked(employees.getEmployeeSummary).mockResolvedValue(summary({ managerId: "emp_mgr2" }));
    vi.mocked(repo.findReview).mockResolvedValue(review());
    vi.mocked(repo.updateReview).mockResolvedValue(review({ managerId: "emp_mgr2", previousManagerId: "emp_mgr" }));

    await expect(service.saveManagerDraft(ORG, "r1", { rating: "3" }, MGR)).rejects.toMatchObject({ status: 403 });
    expect(repo.updateReview).toHaveBeenCalledWith("r1", expect.objectContaining({ managerId: "emp_mgr2", previousManagerId: "emp_mgr" }));
  });

  it("covers the period's approved goals; zero goals is fine (edge case)", async () => {
    vi.mocked(repo.findReview).mockResolvedValue(review());
    const r = await service.getReview(ORG, "r1", MGR);
    expect((r as { goals: unknown[] }).goals).toEqual([]);
    expect(repo.listGoals).toHaveBeenCalledWith(ORG, expect.objectContaining({ status: { in: ["ACTIVE", "COMPLETED"] } }));
  });
});

describe("performance — cycles (US3)", () => {
  it("creates a review per covered employee; no-manager employees go to the opener (FR-008)", async () => {
    vi.mocked(employees.listActiveEmployeeSummaries).mockResolvedValue([
      { id: "emp_1", managerId: "emp_mgr", departmentId: "eng" },
      { id: "emp_2", managerId: null, departmentId: "eng" },
      { id: "emp_3", managerId: "emp_mgr", departmentId: "sales" },
    ] as never);
    vi.mocked(repo.createCycleWithReviews).mockImplementation(((data: object, reviews: unknown[]) => Promise.resolve({ id: "cy1", ...data, reviews })) as never);

    await service.createCycle(ORG, { name: "H2", startDate: "2026-07-01", endDate: "2026-12-31", scopeType: "DEPARTMENT", departmentId: "eng" }, HR);

    const [, reviews] = vi.mocked(repo.createCycleWithReviews).mock.calls[0]!;
    expect(reviews).toEqual([{ employeeId: "emp_1", managerId: "emp_mgr" }, { employeeId: "emp_2", managerId: "emp_hr" }]);
  });

  it("counts completed/pending/overdue and drops offboarded from pending (FR-009/010)", async () => {
    vi.mocked(repo.findCycle).mockResolvedValue(cycle as never);
    const past = { ...cycle, endDate: new Date("2001-01-01") };
    vi.mocked(repo.listReviews).mockResolvedValue([
      review({ id: "a", status: "FINAL", reviewCycle: past }),
      review({ id: "b", employeeId: "emp_2", reviewCycle: past }),
      review({ id: "c", employeeId: "emp_gone", reviewCycle: past }),
    ]);
    vi.mocked(employees.getEmployeeSummary).mockImplementation(async (_o, id) => summary({ id, status: id === "emp_gone" ? "OFFBOARDED" : "ACTIVE" }));

    const s = await service.cycleStatus(ORG, "cy1");
    expect(s).toMatchObject({ completed: 1, pending: 1, overdue: 1, notRequired: 1 });
  });
});
