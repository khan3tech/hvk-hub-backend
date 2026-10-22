import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./repository.js", () => ({
  findEmployee: vi.fn(),
  findPlanByPosition: vi.fn(),
  listCriticalPlans: vi.fn(),
  criticalPositionIds: vi.fn(),
  upsertPlan: vi.fn(),
  unmarkPlan: vi.fn(),
  findCandidate: vi.fn(),
  findCandidateOnPlan: vi.fn(),
  addCandidate: vi.fn(),
  reinstateCandidate: vi.fn(),
  changeReadiness: vi.fn(),
  invalidateCandidate: vi.fn(),
  invalidateCandidacies: vi.fn(),
  writeActivityLog: vi.fn(),
}));

const repo = await import("./repository.js");
const service = await import("./service.js");

const ORG = "org_1";
const HR = { sub: "u_hr", role: "HR" as const, employeeId: "emp_hr" };
const MGR = { sub: "u_m", role: "MANAGER" as const, employeeId: "emp_m" };
const person = (id: string, status = "ACTIVE") => ({ id, name: id, status, departmentId: "d1", department: { name: "Eng" } });
const cand = (id: string, readinessLevel: string, isValid = true) => ({ id: `c_${id}`, candidateEmployee: person(id), readinessLevel, isValid, invalidReason: null, invalidatedAt: null, readinessChanges: [] });
const plan = (holder: string, candidates: unknown[] = [], o: Record<string, unknown> = {}) =>
  ({ id: `p_${holder}`, positionEmployee: person(holder), isCritical: true, markedAt: new Date(), unmarkedAt: null, candidates, ...o }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.findPlanByPosition).mockResolvedValue(plan("lead"));
  vi.mocked(repo.addCandidate).mockResolvedValue({ id: "c1" } as never);
});

describe("succession — risk (FR-007)", () => {
  it("ignores invalid successors and needs a ready-now one for lowest risk", () => {
    expect(service.riskOf([])).toBe("NO_COVERAGE");
    expect(service.riskOf([{ isValid: false, readinessLevel: "READY_NOW" }])).toBe("NO_COVERAGE");
    expect(service.riskOf([{ isValid: true, readinessLevel: "DEVELOPING" }])).toBe("NOT_READY");
    expect(service.riskOf([{ isValid: true, readinessLevel: "DEVELOPING" }, { isValid: true, readinessLevel: "READY_NOW" }])).toBe("READY_NOW");
  });
});

describe("succession — successors (FR-002, FR-003)", () => {
  it("accepts only active employees", async () => {
    vi.mocked(repo.findEmployee).mockResolvedValue({ id: "gone", status: "OFFBOARDED" } as never);
    await expect(service.addSuccessor(ORG, "lead", { employeeId: "gone", readinessLevel: "READY_NOW" }, HR)).rejects.toMatchObject({ code: "SUCCESSOR_NOT_ACTIVE" });
    vi.mocked(repo.findEmployee).mockResolvedValue(null);
    await expect(service.addSuccessor(ORG, "lead", { employeeId: "cand_1", readinessLevel: "READY_NOW" }, HR)).rejects.toMatchObject({ code: "SUCCESSOR_NOT_ACTIVE" });
    expect(repo.addCandidate).not.toHaveBeenCalled();
  });

  it("refuses the holder and duplicates; reinstates a removed entry", async () => {
    await expect(service.addSuccessor(ORG, "lead", { employeeId: "lead", readinessLevel: "READY_NOW" }, HR)).rejects.toMatchObject({ status: 400 });
    vi.mocked(repo.findEmployee).mockResolvedValue({ id: "e1", status: "ACTIVE" } as never);
    vi.mocked(repo.findCandidateOnPlan).mockResolvedValue({ id: "c1", isValid: true } as never);
    await expect(service.addSuccessor(ORG, "lead", { employeeId: "e1", readinessLevel: "READY_NOW" }, HR)).rejects.toMatchObject({ code: "SUCCESSOR_EXISTS" });
    vi.mocked(repo.findCandidateOnPlan).mockResolvedValue({ id: "c1", isValid: false, readinessLevel: "DEVELOPING" } as never);
    vi.mocked(repo.reinstateCandidate).mockResolvedValue({ id: "c1" } as never);
    await service.addSuccessor(ORG, "lead", { employeeId: "e1", readinessLevel: "READY_NOW" }, HR);
    expect(repo.reinstateCandidate).toHaveBeenCalledWith("c1", ORG, "READY_NOW", "DEVELOPING", "emp_hr", null);
  });

  it("needs the position to be critical", async () => {
    vi.mocked(repo.findPlanByPosition).mockResolvedValue(plan("lead", [], { isCritical: false }));
    await expect(service.addSuccessor(ORG, "lead", { employeeId: "e1", readinessLevel: "READY_NOW" }, HR)).rejects.toMatchObject({ status: 409 });
  });
});

describe("succession — readiness history (FR-004)", () => {
  it("records the change from the old level", async () => {
    vi.mocked(repo.findCandidate).mockResolvedValue({ id: "c1", isValid: true, readinessLevel: "DEVELOPING", successionPlan: { positionEmployeeId: "lead" } } as never);
    await service.updateReadiness(ORG, "c1", { readinessLevel: "READY_NOW" }, HR);
    expect(repo.changeReadiness).toHaveBeenCalledWith("c1", ORG, "DEVELOPING", "READY_NOW", "emp_hr", null);
  });
});

describe("succession — offboarding (FR-005, SC-003)", () => {
  it("invalidates every candidacy of the leaver", async () => {
    await service.onEmployeeOffboarded(ORG, "e1");
    expect(repo.invalidateCandidacies).toHaveBeenCalledWith(ORG, "e1", "Offboarded");
  });
});

describe("succession — overview (FR-007–FR-009)", () => {
  it("groups by risk and surfaces people covering several positions", async () => {
    vi.mocked(repo.listCriticalPlans).mockResolvedValue([
      plan("a", [cand("x", "READY_NOW")]),
      plan("b", [cand("x", "DEVELOPING"), cand("y", "READY_NOW", false)]),
      plan("c"),
    ] as never);
    const o = await service.overview(ORG);
    expect(o.totals).toEqual({ critical: 3, NO_COVERAGE: 1, NOT_READY: 1, READY_NOW: 1 });
    expect(o.multiPositionSuccessors).toHaveLength(1);
    expect(o.multiPositionSuccessors[0]!.employee.id).toBe("x");
  });
});

describe("succession — visibility (FR-010, SC-004)", () => {
  it("adds the profile flag for HR/Admin only", async () => {
    vi.mocked(repo.criticalPositionIds).mockResolvedValue(new Set(["e1"]));
    expect((await service.employeeDecoration(ORG, ["e1"], MGR)).size).toBe(0);
    expect((await service.employeeDecoration(ORG, ["e1"], HR)).get("e1")).toEqual({ criticalPosition: true });
  });
});
