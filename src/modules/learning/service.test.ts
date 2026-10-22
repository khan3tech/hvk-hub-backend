import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./repository.js", () => ({
  createCourse: vi.fn(),
  findCourse: vi.fn(),
  listCourses: vi.fn(),
  updateCourse: vi.fn(),
  createRule: vi.fn(),
  listComplianceRules: vi.fn(),
  listEmployees: vi.fn(),
  findEmployee: vi.fn(),
  departmentInOrg: vi.fn(),
  employeesWithOpenAssignment: vi.fn(),
  createAssignments: vi.fn(),
  findAssignment: vi.fn(),
  listAssignments: vi.fn(),
  completeAssignment: vi.fn(),
  writeActivityLog: vi.fn(),
}));
vi.mock("../documents/service.js", () => ({ uploadEmployeeDocument: vi.fn() }));

const repo = await import("./repository.js");
const docs = await import("../documents/service.js");
const service = await import("./service.js");

const ORG = "org_1";
const HR = { sub: "u_hr", role: "HR" as const, employeeId: "emp_hr" };
const EMP = { sub: "u_e", role: "EMPLOYEE" as const, employeeId: "emp_1" };
const course = (o: Record<string, unknown> = {}) => ({ id: "c1", orgId: ORG, title: "Safety", requiresProof: false, isComplianceRequired: false, archived: false, ...o });
const assignment = (o: Record<string, unknown> = {}) => ({
  id: "a1", courseId: "c1", employeeId: "emp_1", status: "INCOMPLETE", dueDate: null, completedAt: null, proofDocumentId: null, ruleId: null, assignedAt: new Date(),
  course: course(), employee: { id: "emp_1", name: "Ann", status: "ACTIVE", departmentId: "d1" }, ...o,
}) as never;
const FILE = { buffer: Buffer.from("%PDF-"), mimetype: "application/pdf", originalname: "cert.pdf", size: 5 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.findCourse).mockResolvedValue(course() as never);
  vi.mocked(repo.employeesWithOpenAssignment).mockResolvedValue(new Set());
  vi.mocked(repo.createRule).mockResolvedValue({ id: "r1" } as never);
  vi.mocked(repo.completeAssignment).mockResolvedValue({ count: 1 });
});

describe("learning — overdue (FR-005)", () => {
  const today = new Date("2026-10-22");
  it("is overdue only when incomplete past the due date", () => {
    expect(service.stateOf({ status: "INCOMPLETE", dueDate: new Date("2026-10-21") }, today)).toBe("OVERDUE");
    expect(service.stateOf({ status: "INCOMPLETE", dueDate: new Date("2026-10-22") }, today)).toBe("INCOMPLETE");
    expect(service.stateOf({ status: "COMPLETE", dueDate: new Date("2026-01-01") }, today)).toBe("COMPLETE");
    expect(service.stateOf({ status: "INCOMPLETE", dueDate: null }, today)).toBe("INCOMPLETE");
  });
});

describe("learning — assignment (FR-002, FR-010)", () => {
  it("assigns a department and skips people with an open assignment (completed ones don't block)", async () => {
    vi.mocked(repo.departmentInOrg).mockResolvedValue(true);
    vi.mocked(repo.listEmployees).mockResolvedValue([{ id: "e1" }, { id: "e2" }] as never);
    vi.mocked(repo.employeesWithOpenAssignment).mockResolvedValue(new Set(["e2"]));
    const out = await service.assign(ORG, "c1", { audience: "DEPARTMENT", departmentId: "d1", dueDate: "2026-12-01" }, HR);
    expect(out).toMatchObject({ assigned: 1, alreadyAssigned: 1 });
    expect(vi.mocked(repo.createAssignments).mock.calls[0][0]).toEqual([expect.objectContaining({ employeeId: "e1", ruleId: "r1" })]);
  });

  it("refuses archived courses", async () => {
    vi.mocked(repo.findCourse).mockResolvedValue(course({ archived: true }) as never);
    await expect(service.assign(ORG, "c1", { audience: "COMPANY" }, HR)).rejects.toMatchObject({ code: "COURSE_ARCHIVED" });
  });

  it("rejects employees outside the active workforce", async () => {
    vi.mocked(repo.listEmployees).mockResolvedValue([{ id: "e1" }] as never);
    await expect(service.assign(ORG, "c1", { audience: "EMPLOYEES", employeeIds: ["e1", "gone"] }, HR)).rejects.toMatchObject({ status: 400 });
  });
});

describe("learning — new hires (FR-007, SC-004)", () => {
  it("enrolls matching compliance rules once per course, with a grace period after a passed due date", async () => {
    vi.mocked(repo.findEmployee).mockResolvedValue({ id: "new", status: "ACTIVE", departmentId: "d1" } as never);
    vi.mocked(repo.listComplianceRules).mockResolvedValue([
      { id: "r1", courseId: "c1", audience: "COMPANY", departmentId: null, dueDate: new Date("2020-01-01") },
      { id: "r2", courseId: "c1", audience: "DEPARTMENT", departmentId: "d1", dueDate: null },
      { id: "r3", courseId: "c2", audience: "DEPARTMENT", departmentId: "other", dueDate: null },
    ] as never);
    await service.onEmployeeCreated(ORG, "new", HR);
    expect(repo.createAssignments).toHaveBeenCalledTimes(1);
    const row = vi.mocked(repo.createAssignments).mock.calls[0][0] as Array<{ courseId: string; dueDate: Date }>;
    expect(row[0].courseId).toBe("c1");
    expect(row[0].dueDate.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("learning — completion (FR-003, FR-004, SC-005)", () => {
  it("blocks completion without proof when the course requires it", async () => {
    vi.mocked(repo.findAssignment).mockResolvedValue(assignment({ course: course({ requiresProof: true }) }));
    await expect(service.complete(ORG, "a1", undefined, EMP)).rejects.toMatchObject({ code: "PROOF_REQUIRED" });
    expect(repo.completeAssignment).not.toHaveBeenCalled();
  });

  it("stores the proof as the employee's document and completes", async () => {
    vi.mocked(repo.findAssignment).mockResolvedValue(assignment({ course: course({ requiresProof: true }) }));
    vi.mocked(docs.uploadEmployeeDocument).mockResolvedValue({ id: "doc1" } as never);
    await service.complete(ORG, "a1", FILE, EMP);
    expect(repo.completeAssignment).toHaveBeenCalledWith("a1", "doc1");
  });

  it("only the assignee can complete", async () => {
    vi.mocked(repo.findAssignment).mockResolvedValue(assignment({ employeeId: "someone_else" }));
    await expect(service.complete(ORG, "a1", undefined, EMP)).rejects.toMatchObject({ status: 404 });
  });
});

describe("learning — compliance dashboard (FR-008)", () => {
  it("counts each employee's latest cycle and flags overdue", async () => {
    vi.mocked(repo.listCourses).mockResolvedValue([course({ isComplianceRequired: true }), course({ id: "c2" })] as never);
    vi.mocked(repo.listAssignments).mockResolvedValue([
      assignment({ id: "old", status: "COMPLETE", assignedAt: new Date("2025-01-01") }),
      assignment({ id: "new", status: "INCOMPLETE", dueDate: new Date("2020-01-01"), assignedAt: new Date("2026-01-01") }),
      assignment({ id: "b", employeeId: "emp_2", status: "COMPLETE", employee: { id: "emp_2", name: "Bo", status: "ACTIVE" } }),
    ]);
    const { courses } = await service.complianceDashboard(ORG);
    expect(courses).toHaveLength(1);
    expect(courses[0]).toMatchObject({ assigned: 2, completed: 1, outstanding: 1 });
    expect(courses[0].outstandingEmployees[0]).toMatchObject({ assignmentId: "new", overdue: true });
  });
});
