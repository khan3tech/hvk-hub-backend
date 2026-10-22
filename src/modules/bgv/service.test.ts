import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./repository.js", () => ({
  findSettings: vi.fn(),
  upsertSettings: vi.fn(),
  createCheck: vi.fn(),
  findCheck: vi.fn(),
  findCheckByApplication: vi.fn(),
  listChecks: vi.fn(),
  findItem: vi.fn(),
  recordResult: vi.fn(),
  addItem: vi.fn(),
  updateCheck: vi.fn(),
  createOverride: vi.fn(),
  listOverrides: vi.fn(),
  deleteForApplications: vi.fn(),
  writeActivityLog: vi.fn(),
}));
vi.mock("../recruitment/service.js", () => ({ getApplicationSummary: vi.fn() }));

const repo = await import("./repository.js");
const service = await import("./service.js");

const ORG = "org_1";
const HR = { sub: "u_hr", role: "HR" as const, employeeId: "emp_hr" };
const MGR = { sub: "u_m", role: "MANAGER" as const, employeeId: "emp_m" };
const check = (results: Array<string | null>, o: Record<string, unknown> = {}) =>
  ({ id: "c1", orgId: ORG, applicationId: "a1", status: "IN_PROGRESS", overallOutcome: null, completedAt: null, items: results.map((r, i) => ({ id: `i${i}`, label: `Item ${i}`, result: r })), ...o }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.updateCheck).mockImplementation(((_id: string, data: object) => Promise.resolve({ ...(check([]) as object), ...data })) as never);
  vi.mocked(repo.findItem).mockResolvedValue({ id: "i1", backgroundCheckId: "c1" } as never);
  vi.mocked(repo.recordResult).mockResolvedValue({ count: 1 });
});

describe("bgv — completion (FR-003, SC-002)", () => {
  it("stays in progress until every item has a result", async () => {
    vi.mocked(repo.findCheck).mockResolvedValue(check(["CLEARED", null]));
    await service.recordResult(ORG, "i0", { result: "CLEARED" }, HR);
    expect(repo.updateCheck).toHaveBeenCalledWith("c1", expect.objectContaining({ status: "IN_PROGRESS", overallOutcome: null }));
  });

  it("completes FLAGGED if any item is flagged, CLEARED otherwise; unable-to-verify isn't a flag", async () => {
    vi.mocked(repo.findCheck).mockResolvedValue(check(["CLEARED", "FLAGGED"]));
    await service.recordResult(ORG, "i1", { result: "FLAGGED" }, HR);
    expect(repo.updateCheck).toHaveBeenLastCalledWith("c1", expect.objectContaining({ status: "COMPLETE", overallOutcome: "FLAGGED" }));
    vi.mocked(repo.findCheck).mockResolvedValue(check(["CLEARED", "UNABLE_TO_VERIFY"]));
    vi.mocked(repo.updateCheck).mockImplementationOnce(((_id: string, data: object) => Promise.resolve({ ...(check(["CLEARED", "UNABLE_TO_VERIFY"]) as object), ...data })) as never);
    const r = await service.recordResult(ORG, "i1", { result: "UNABLE_TO_VERIFY" }, HR);
    expect(repo.updateCheck).toHaveBeenLastCalledWith("c1", expect.objectContaining({ status: "COMPLETE", overallOutcome: "CLEARED" }));
    expect(r.hasUnverified).toBe(true);
  });

  it("a result is recorded once", async () => {
    vi.mocked(repo.recordResult).mockResolvedValue({ count: 0 });
    await expect(service.recordResult(ORG, "i1", { result: "CLEARED" }, HR)).rejects.toMatchObject({ code: "RESULT_RECORDED" });
  });

  it("adding an item reopens a completed check (FR-004)", async () => {
    vi.mocked(repo.findCheck).mockResolvedValue(check(["CLEARED", null], { status: "COMPLETE", overallOutcome: "CLEARED" }));
    await service.addItem(ORG, "c1", "Credit history", HR);
    expect(repo.updateCheck).toHaveBeenLastCalledWith("c1", expect.objectContaining({ status: "IN_PROGRESS", overallOutcome: null }));
  });
});

describe("bgv — hire gate (FR-005/006/007, SC-003)", () => {
  it("passes a cleared, complete check with no justification", async () => {
    vi.mocked(repo.findCheckByApplication).mockResolvedValue(check(["CLEARED"], { status: "COMPLETE", overallOutcome: "CLEARED" }));
    await expect(service.hireGate(ORG, "a1", undefined, HR)).resolves.toBeUndefined();
    expect(repo.createOverride).not.toHaveBeenCalled();
  });

  it("blocks a missing/incomplete check unless HR overrides with a reason", async () => {
    vi.mocked(repo.findCheckByApplication).mockResolvedValue(null);
    await expect(service.hireGate(ORG, "a1", undefined, HR)).rejects.toMatchObject({ code: "BACKGROUND_CHECK_INCOMPLETE" });
    await expect(service.hireGate(ORG, "a1", "Urgent start, check pending with vendor", MGR)).rejects.toMatchObject({ status: 409 });
    await service.hireGate(ORG, "a1", "Urgent start, check pending with vendor", HR);
    expect(repo.createOverride).toHaveBeenCalledWith(expect.objectContaining({ kind: "INCOMPLETE_CHECK", overriddenById: "emp_hr" }));
  });

  it("a flagged check needs a written justification", async () => {
    vi.mocked(repo.findCheckByApplication).mockResolvedValue(check(["FLAGGED"], { status: "COMPLETE", overallOutcome: "FLAGGED" }));
    await expect(service.hireGate(ORG, "a1", undefined, HR)).rejects.toMatchObject({ code: "JUSTIFICATION_REQUIRED" });
    await service.hireGate(ORG, "a1", "Gap explained and verified by phone", HR);
    expect(repo.createOverride).toHaveBeenCalledWith(expect.objectContaining({ kind: "FLAGGED_CHECK" }));
  });
});

describe("bgv — visibility (FR-008, SC-004)", () => {
  it("managers see only that a check exists and its status", async () => {
    vi.mocked(repo.findCheckByApplication).mockResolvedValue(check(["FLAGGED"], { status: "COMPLETE", overallOutcome: "FLAGGED" }));
    expect(await service.applicationDecoration(ORG, "a1", MGR)).toEqual({ backgroundCheck: { status: "COMPLETE" } });
    expect(await service.applicationDecoration(ORG, "a1", HR)).toEqual({ backgroundCheck: { id: "c1", status: "COMPLETE", overallOutcome: "FLAGGED" } });
  });
});
