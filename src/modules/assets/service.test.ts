import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("./repository.js", () => ({
  createAsset: vi.fn(),
  findAsset: vi.fn(),
  listAssets: vi.fn(),
  assignAsset: vi.fn(),
  closeAssignment: vi.fn(),
  openAssignmentsFor: vi.fn(),
  assignmentHistory: vi.fn(),
  writeActivityLog: vi.fn(),
}));
vi.mock("../employee/service.js", () => ({ getEmployeeSummary: vi.fn() }));
vi.mock("../onboarding/service.js", () => ({ completeSystemTask: vi.fn() }));
vi.mock("../exit/service.js", () => ({ completeSystemTask: vi.fn() }));

const repo = await import("./repository.js");
const employees = await import("../employee/service.js");
const onboarding = await import("../onboarding/service.js");
const exit = await import("../exit/service.js");
const service = await import("./service.js");

const ORG = "org_1";
const HR = { sub: "u_hr", role: "HR" as const, employeeId: "emp_hr" };
const asset = (o: Record<string, unknown> = {}) => ({ id: "a1", orgId: ORG, description: "MacBook", identifier: "SN-1", status: "UNASSIGNED", assignments: [], ...o }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(employees.getEmployeeSummary).mockResolvedValue({ id: "emp_1", status: "ACTIVE", managerId: "emp_mgr" } as never);
  vi.mocked(repo.findAsset).mockResolvedValue(asset());
});

describe("assets — inventory (US1)", () => {
  it("rejects a duplicate identifier (FR-001)", async () => {
    vi.mocked(repo.createAsset).mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" }));
    await expect(service.createAsset(ORG, { description: "x", identifier: "SN-1" }, HR)).rejects.toMatchObject({ code: "IDENTIFIER_TAKEN" });
  });

  it("refuses to assign an already-assigned asset (FR-002, SC-004)", async () => {
    vi.mocked(repo.findAsset).mockResolvedValue(asset({ status: "ASSIGNED" }));
    vi.mocked(repo.assignAsset).mockResolvedValue(null);
    await expect(service.assignAsset(ORG, "a1", "emp_1", HR)).rejects.toMatchObject({ code: "ASSET_UNAVAILABLE", status: 409 });
    expect(onboarding.completeSystemTask).not.toHaveBeenCalled();
  });

  it("assigning completes the hire's onboarding asset task (FR-005)", async () => {
    vi.mocked(repo.assignAsset).mockResolvedValue({ id: "as1", employeeId: "emp_1" } as never);
    await service.assignAsset(ORG, "a1", "emp_1", HR);
    expect(onboarding.completeSystemTask).toHaveBeenCalledWith(ORG, "emp_1", "ASSET_ASSIGNMENT", HR);
  });

  it("won't assign to an offboarded employee", async () => {
    vi.mocked(employees.getEmployeeSummary).mockResolvedValue({ id: "emp_1", status: "OFFBOARDED" } as never);
    await expect(service.assignAsset(ORG, "a1", "emp_1", HR)).rejects.toMatchObject({ status: 400 });
  });
});

describe("assets — returns and exit (US2)", () => {
  it("the last return completes the exit asset task (FR-006)", async () => {
    vi.mocked(repo.closeAssignment).mockResolvedValue({ employeeId: "emp_1" } as never);
    vi.mocked(repo.openAssignmentsFor).mockResolvedValue([]);
    await service.returnAsset(ORG, "a1", HR);
    expect(exit.completeSystemTask).toHaveBeenCalledWith(ORG, "emp_1", "ASSET_RETURN", HR);
  });

  it("does not complete it while other assets are still held", async () => {
    vi.mocked(repo.closeAssignment).mockResolvedValue({ employeeId: "emp_1" } as never);
    vi.mocked(repo.openAssignmentsFor).mockResolvedValue([{ asset: { identifier: "SN-2" } }] as never);
    await service.returnAsset(ORG, "a1", HR);
    expect(exit.completeSystemTask).not.toHaveBeenCalled();
  });

  it("guards the exit task while assets remain (US2.3)", async () => {
    vi.mocked(repo.openAssignmentsFor).mockResolvedValue([{ asset: { identifier: "SN-2" } }] as never);
    await expect(service.assetReturnGuard(ORG, "emp_1")).resolves.toMatch(/SN-2/);
    vi.mocked(repo.openAssignmentsFor).mockResolvedValue([]);
    await expect(service.assetReturnGuard(ORG, "emp_1")).resolves.toBeNull();
  });

  it("returning an unassigned asset is refused", async () => {
    vi.mocked(repo.closeAssignment).mockResolvedValue(null);
    await expect(service.returnAsset(ORG, "a1", HR)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});
