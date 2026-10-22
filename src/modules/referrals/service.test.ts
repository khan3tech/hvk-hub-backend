import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./repository.js", () => ({
  findConfig: vi.fn(),
  upsertConfig: vi.fn(),
  createReferral: vi.fn(),
  findReferral: vi.fn(),
  findByApplication: vi.fn(),
  listReferrals: vi.fn(),
  listPendingAllOrgs: vi.fn(),
  transition: vi.fn(),
  update: vi.fn(),
  deleteForApplications: vi.fn(),
}));
vi.mock("../employee/service.js", () => ({ findEmployeeSummaryByEmail: vi.fn(), getEmployeeSummary: vi.fn(), getOffboardedDate: vi.fn() }));
vi.mock("../recruitment/service.js", () => ({ applyFromOutside: vi.fn(), findOrCreateCandidate: vi.fn(), findPosting: vi.fn(), getApplicationBrief: vi.fn(), setCandidateResume: vi.fn() }));
vi.mock("../documents/service.js", () => ({ storeCandidateFile: vi.fn() }));
vi.mock("../notifications/service.js", () => ({ notifyEmployees: vi.fn() }));

const repo = await import("./repository.js");
const employees = await import("../employee/service.js");
const recruitment = await import("../recruitment/service.js");
const service = await import("./service.js");

const ORG = "org_1";
const ME = { sub: "u1", role: "EMPLOYEE" as const, employeeId: "emp_ref" };
const DAY = 86_400_000;
const referral = (o: Record<string, unknown> = {}) =>
  ({ id: "r1", orgId: ORG, referrerEmployeeId: "emp_ref", applicationId: "a1", bonusAmount: 5000, qualifyingDays: 90, status: "IN_PIPELINE", hiredAt: null, qualifyingUntil: null, hireEmployeeId: null, ...o }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.transition).mockResolvedValue({ count: 1 });
  vi.mocked(recruitment.getApplicationBrief).mockResolvedValue({ id: "a1", stage: "HIRED", candidateName: "Cara", candidateEmail: "cara@x.dev", postingTitle: "Eng" });
});

describe("referrals — submitting (FR-001/010)", () => {
  it("can't refer yourself", async () => {
    vi.mocked(employees.getEmployeeSummary).mockResolvedValue({ id: "emp_ref", status: "ACTIVE", email: "me@x.dev" } as never);
    await expect(service.submitReferral(ORG, { postingId: "p1", name: "Me", email: "ME@x.dev" }, undefined, ME)).rejects.toMatchObject({ status: 400 });
  });

  it("stamps today's bonus terms on the referral", async () => {
    vi.mocked(employees.getEmployeeSummary).mockResolvedValue({ id: "emp_ref", status: "ACTIVE", email: "me@x.dev" } as never);
    vi.mocked(recruitment.findPosting).mockResolvedValue({ id: "p1", status: "OPEN" } as never);
    vi.mocked(recruitment.findOrCreateCandidate).mockResolvedValue({ id: "c1" } as never);
    vi.mocked(recruitment.applyFromOutside).mockResolvedValue({ id: "a1" } as never);
    const docs = await import("../documents/service.js");
    vi.mocked(docs.storeCandidateFile).mockResolvedValue({ id: "d1" } as never);
    vi.mocked(repo.findConfig).mockResolvedValue({ bonusAmount: 7500, qualifyingDays: 30 } as never);
    vi.mocked(repo.createReferral).mockResolvedValue(referral({ bonusAmount: 7500, qualifyingDays: 30 }));
    await service.submitReferral(ORG, { postingId: "p1", name: "Cara", email: "cara@x.dev" }, { buffer: Buffer.from("%PDF-"), mimetype: "application/pdf", originalname: "cv.pdf", size: 5 }, ME);
    expect(recruitment.applyFromOutside).toHaveBeenCalledWith(ORG, "c1", "p1", expect.objectContaining({ source: "REFERRAL", referredByEmployeeId: "emp_ref" }));
    expect(repo.createReferral).toHaveBeenCalledWith(expect.objectContaining({ bonusAmount: 7500, qualifyingDays: 30 }));
  });
});

describe("referrals — lifecycle (FR-005/006/007, SC-002/003)", () => {
  it("hired → pending until the qualifying date; zero days → payable at once", async () => {
    vi.mocked(repo.findByApplication).mockResolvedValue(referral());
    await service.onStageChanged(ORG, "a1", "OFFER", "HIRED");
    expect(repo.transition).toHaveBeenCalledWith("r1", ["IN_PIPELINE"], expect.objectContaining({ status: "PENDING" }));
    vi.mocked(repo.findByApplication).mockResolvedValue(referral({ qualifyingDays: 0 }));
    await service.onStageChanged(ORG, "a1", "OFFER", "HIRED");
    expect(repo.transition).toHaveBeenLastCalledWith("r1", ["IN_PIPELINE"], expect.objectContaining({ status: "PAYABLE" }));
  });

  it("rejected → closed with no bonus", async () => {
    vi.mocked(repo.findByApplication).mockResolvedValue(referral());
    await service.onStageChanged(ORG, "a1", "SCREEN", "REJECTED");
    expect(repo.transition).toHaveBeenCalledWith("r1", ["IN_PIPELINE"], expect.objectContaining({ status: "CLOSED_NO_BONUS" }));
  });

  it("payable after the period if the hire (matched by email) is still active", async () => {
    vi.mocked(repo.listReferrals).mockResolvedValue([referral({ status: "PENDING", qualifyingUntil: new Date(Date.now() - DAY) })]);
    vi.mocked(employees.findEmployeeSummaryByEmail).mockResolvedValue({ id: "emp_hire" } as never);
    vi.mocked(employees.getEmployeeSummary).mockResolvedValue({ id: "emp_hire", status: "ACTIVE" } as never);
    await service.evaluateQualifying(ORG);
    expect(repo.update).toHaveBeenCalledWith("r1", { hireEmployeeId: "emp_hire" });
    expect(repo.transition).toHaveBeenCalledWith("r1", ["PENDING"], { status: "PAYABLE" });
  });

  it("forfeited if the hire left before the period ended — never payable", async () => {
    vi.mocked(repo.listReferrals).mockResolvedValue([referral({ status: "PENDING", hireEmployeeId: "emp_hire", qualifyingUntil: new Date(Date.now() - DAY) })]);
    vi.mocked(employees.getEmployeeSummary).mockResolvedValue({ id: "emp_hire", status: "OFFBOARDED" } as never);
    vi.mocked(employees.getOffboardedDate).mockResolvedValue(new Date(Date.now() - 10 * DAY));
    await service.evaluateQualifying(ORG);
    expect(repo.transition).toHaveBeenCalledWith("r1", ["PENDING"], expect.objectContaining({ status: "FORFEITED" }));
    expect(repo.transition).not.toHaveBeenCalledWith("r1", ["PENDING"], { status: "PAYABLE" });
  });

  it("stays pending while the period is running", async () => {
    vi.mocked(repo.listReferrals).mockResolvedValue([referral({ status: "PENDING", hireEmployeeId: "emp_hire", qualifyingUntil: new Date(Date.now() + DAY) })]);
    vi.mocked(employees.getEmployeeSummary).mockResolvedValue({ id: "emp_hire", status: "ACTIVE" } as never);
    await service.evaluateQualifying(ORG);
    expect(repo.transition).not.toHaveBeenCalled();
  });
});

describe("referrals — payroll (FR-008/009, SC-005)", () => {
  it("only a payable bonus can be scheduled", async () => {
    vi.mocked(repo.findReferral).mockResolvedValue(referral({ status: "PAID" }));
    vi.mocked(repo.transition).mockResolvedValue({ count: 0 });
    await expect(service.schedulePayout(ORG, "r1", 11, 2026)).rejects.toMatchObject({ code: "NOT_PAYABLE" });
  });

  it("lists scheduled bonuses as labelled one-off lines and marks them paid once", async () => {
    vi.mocked(repo.listReferrals).mockResolvedValue([referral({ status: "PAYABLE", payrollPeriodMonth: 11, payrollPeriodYear: 2026 })]);
    const lines = await service.referralEarnings.list(ORG, "emp_ref", 11, 2026);
    expect(lines).toEqual([{ id: "r1", label: "Referral bonus (Cara)", amount: 5000 }]);
    await service.referralEarnings.markIncluded(ORG, ["r1"], 11, 2026);
    expect(repo.transition).toHaveBeenCalledWith("r1", ["PAYABLE"], expect.objectContaining({ status: "PAID" }));
  });
});
