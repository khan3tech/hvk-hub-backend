import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";

vi.mock("./repository.js", () => ({
  listCategories: vi.fn(),
  createCategories: vi.fn(),
  createCategory: vi.fn(),
  findCategoryByName: vi.fn(),
  findCategory: vi.fn(),
  updateCategory: vi.fn(),
  createClaim: vi.fn(),
  findClaim: vi.fn(),
  listClaims: vi.fn(),
  transitionClaim: vi.fn(),
  writeActivityLog: vi.fn(),
}));
vi.mock("../employee/service.js", () => ({ getEmployeeSummary: vi.fn(), listDirectReportIds: vi.fn() }));
vi.mock("../notifications/service.js", () => ({ notifyEmployees: vi.fn() }));

const repo = await import("./repository.js");
const employees = await import("../employee/service.js");
const { setStorage } = await import("../../lib/storage.js");
const service = await import("./service.js");

const ORG = "org_1";
const EMP = { sub: "u_e", role: "EMPLOYEE" as const, employeeId: "emp_1" };
const MGR = { sub: "u_m", role: "MANAGER" as const, employeeId: "emp_mgr" };
const OTHER = { sub: "u_m2", role: "MANAGER" as const, employeeId: "emp_mgr2" };
const HR = { sub: "u_hr", role: "HR" as const, employeeId: "emp_hr" };
const claim = (o: Record<string, unknown> = {}) => ({ id: "c1", orgId: ORG, employeeId: "emp_1", amount: 120, category: "Travel", status: "PENDING", receiptUrl: "k", ...o }) as never;
const receipt = { buffer: Buffer.from("%PDF-"), mimetype: "application/pdf", originalname: "r.pdf" };

beforeEach(() => {
  vi.clearAllMocks();
  setStorage({ put: vi.fn().mockResolvedValue("expenses/k"), open: vi.fn().mockResolvedValue(Readable.from(["x"])) });
  vi.mocked(repo.listCategories).mockResolvedValue([{ id: "cat" }] as never);
  vi.mocked(employees.getEmployeeSummary).mockResolvedValue({ id: "emp_1", name: "E", managerId: "emp_mgr" } as never);
  vi.mocked(repo.createClaim).mockImplementation(((data: object) => Promise.resolve({ id: "c1", status: "PENDING", ...data })) as never);
});

describe("expenses — submission (FR-007/008)", () => {
  it("blocks a claim without a receipt for a category that requires one", async () => {
    vi.mocked(repo.findCategoryByName).mockResolvedValue({ name: "Travel", requiresReceipt: true, active: true } as never);
    await expect(service.submitClaim(ORG, { amount: 50, category: "travel" }, undefined, EMP)).rejects.toMatchObject({ code: "RECEIPT_REQUIRED" });
    expect(repo.createClaim).not.toHaveBeenCalled();
  });

  it("accepts a receipt-free claim for a category that doesn't need one, routed to the manager", async () => {
    vi.mocked(repo.findCategoryByName).mockResolvedValue({ name: "Internet & phone", requiresReceipt: false, active: true } as never);
    const c = await service.submitClaim(ORG, { amount: 30.456, category: "internet & phone" }, undefined, EMP);
    expect(c).toMatchObject({ amount: 30.46, category: "Internet & phone", hasReceipt: false });
    expect(c).not.toHaveProperty("receiptUrl");
  });

  it("stores the receipt and never returns its storage key", async () => {
    vi.mocked(repo.findCategoryByName).mockResolvedValue({ name: "Travel", requiresReceipt: true, active: true } as never);
    const c = await service.submitClaim(ORG, { amount: 120, category: "Travel" }, receipt, EMP);
    expect(c.hasReceipt).toBe(true);
    expect(JSON.stringify(c)).not.toContain("expenses/k");
  });

  it("rejects unknown or inactive categories", async () => {
    vi.mocked(repo.findCategoryByName).mockResolvedValue({ name: "Old", requiresReceipt: false, active: false } as never);
    await expect(service.submitClaim(ORG, { amount: 1, category: "Old" }, undefined, EMP)).rejects.toMatchObject({ status: 400 });
  });
});

describe("expenses — decisions (FR-009/010/011)", () => {
  it("the current manager or HR decides; others and the claimant can't", async () => {
    vi.mocked(repo.findClaim).mockResolvedValue(claim());
    vi.mocked(repo.transitionClaim).mockResolvedValue({ count: 1 });
    await expect(service.approveClaim(ORG, "c1", OTHER)).rejects.toMatchObject({ status: 403 });
    await expect(service.approveClaim(ORG, "c1", EMP)).rejects.toMatchObject({ status: 403 });
    await service.approveClaim(ORG, "c1", MGR);
    expect(repo.transitionClaim).toHaveBeenCalledWith("c1", "PENDING", expect.objectContaining({ status: "APPROVED", approverId: "emp_mgr" }));
  });

  it("a pending claim follows a manager change (edge case)", async () => {
    vi.mocked(employees.listDirectReportIds).mockResolvedValue(["emp_1"]);
    vi.mocked(repo.listClaims).mockResolvedValue([claim()]);
    await service.approvalQueue(ORG, OTHER);
    expect(repo.listClaims).toHaveBeenCalledWith(ORG, { status: "PENDING", employeeId: { in: ["emp_1"] } });
  });

  it("rejection records the reason; double decisions 409", async () => {
    vi.mocked(repo.findClaim).mockResolvedValue(claim());
    vi.mocked(repo.transitionClaim).mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await service.rejectClaim(ORG, "c1", "Not a business expense", HR);
    expect(repo.transitionClaim).toHaveBeenCalledWith("c1", "PENDING", expect.objectContaining({ status: "REJECTED", rejectionReason: "Not a business expense" }));
    await expect(service.approveClaim(ORG, "c1", HR)).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
  });

  it("payouts total only approved-unpaid claims (SC-005)", async () => {
    vi.mocked(repo.listClaims).mockResolvedValue([claim({ status: "APPROVED", amount: 100.1 }), claim({ id: "c2", status: "APPROVED", amount: 49.95 })]);
    const p = await service.payouts(ORG);
    expect(repo.listClaims).toHaveBeenCalledWith(ORG, { status: "APPROVED" });
    expect(p).toMatchObject({ outstandingTotal: 150.05, outstandingCount: 2 });
  });
});
