import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("./repository.js", () => ({
  createJobPosting: vi.fn(),
  findJobPostingById: vi.fn(),
  listJobPostings: vi.fn(),
  updateJobPosting: vi.fn(),
  departmentExists: vi.fn(),
  createCandidate: vi.fn(),
  findCandidateById: vi.fn(),
  searchCandidates: vi.fn(),
  createApplication: vi.fn(),
  findApplicationById: vi.fn(),
  findApplicationDetail: vi.fn(),
  listApplications: vi.fn(),
  updateApplicationStage: vi.fn(),
  createInterviewRound: vi.fn(),
  findInterviewRoundById: vi.fn(),
  listInterviewRoundsForInterviewer: vi.fn(),
  updateInterviewRound: vi.fn(),
  writeActivityLog: vi.fn(),
}));

vi.mock("../employee/service.js", () => ({
  getEmployeeSummary: vi.fn(),
}));

const repo = await import("./repository.js");
const employeeService = await import("../employee/service.js");
const service = await import("./service.js");

const ORG = "org_1";
const HR = { sub: "u_hr", role: "HR" as const, employeeId: "emp_hr" };
const MGR = { sub: "u_mgr", role: "MANAGER" as const, employeeId: "emp_mgr" };
const EMP = { sub: "u_emp", role: "EMPLOYEE" as const, employeeId: "emp_1" };

const posting = (o: Record<string, unknown> = {}) => ({
  id: "post_1",
  orgId: ORG,
  title: "Engineer",
  departmentId: "dept_eng",
  status: "OPEN",
  openings: 2,
  ...o,
});
const application = (o: Record<string, unknown> = {}) => ({
  id: "app_1",
  orgId: ORG,
  candidateId: "cand_1",
  jobPostingId: "post_1",
  stage: "APPLIED",
  jobPosting: posting(),
  ...o,
});

function managerIn(departmentId: string | null) {
  vi.mocked(employeeService.getEmployeeSummary).mockResolvedValue({
    id: "emp_mgr",
    name: "M",
    email: "m@x.dev",
    status: "ACTIVE",
    departmentId,
    managerId: null,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recruitment — postings (US1)", () => {
  it("creates an OPEN posting and audits it (FR-001)", async () => {
    vi.mocked(repo.departmentExists).mockResolvedValue(true);
    vi.mocked(repo.createJobPosting).mockResolvedValue(posting() as never);

    await service.createJobPosting(ORG, { title: "Engineer", departmentId: "dept_eng", openings: 2 }, HR);

    expect(repo.createJobPosting).toHaveBeenCalledWith(expect.objectContaining({ status: "OPEN" }));
    expect(repo.writeActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "recruitment.posting_created" }),
    );
  });

  it("rejects an unknown department", async () => {
    vi.mocked(repo.departmentExists).mockResolvedValue(false);
    await expect(
      service.createJobPosting(ORG, { title: "X", departmentId: "nope", openings: 1 }, HR),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });

  it("shows an Employee only OPEN postings (FR-014)", async () => {
    vi.mocked(repo.listJobPostings).mockResolvedValue([]);
    await service.listJobPostings(ORG, EMP);
    expect(repo.listJobPostings).toHaveBeenCalledWith(ORG, { OR: [{ status: "OPEN" }] });
  });

  it("shows a Manager open postings plus every status in their own department (US1.3)", async () => {
    managerIn("dept_eng");
    vi.mocked(repo.listJobPostings).mockResolvedValue([]);
    await service.listJobPostings(ORG, MGR);
    expect(repo.listJobPostings).toHaveBeenCalledWith(ORG, {
      OR: [{ status: "OPEN" }, { departmentId: "dept_eng" }],
    });
  });
});

describe("recruitment — applications (US2)", () => {
  beforeEach(() => {
    vi.mocked(repo.findCandidateById).mockResolvedValue({ id: "cand_1" } as never);
  });

  it("creates an application at APPLIED (FR-004)", async () => {
    vi.mocked(repo.findJobPostingById).mockResolvedValue(posting() as never);
    vi.mocked(repo.createApplication).mockResolvedValue(application() as never);

    const result = await service.createApplication(ORG, { candidateId: "cand_1", jobPostingId: "post_1" }, HR);

    expect(repo.createApplication).toHaveBeenCalledWith(expect.objectContaining({ stage: "APPLIED" }));
    expect(result.isTerminal).toBe(false);
  });

  it("maps the unique-constraint violation to DUPLICATE_APPLICATION (FR-005, SC-004)", async () => {
    vi.mocked(repo.findJobPostingById).mockResolvedValue(posting() as never);
    vi.mocked(repo.createApplication).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" }),
    );
    await expect(
      service.createApplication(ORG, { candidateId: "cand_1", jobPostingId: "post_1" }, HR),
    ).rejects.toMatchObject({ code: "DUPLICATE_APPLICATION", status: 409 });
  });

  it("refuses new applications to a closed posting (edge case)", async () => {
    vi.mocked(repo.findJobPostingById).mockResolvedValue(posting({ status: "CLOSED" }) as never);
    await expect(
      service.createApplication(ORG, { candidateId: "cand_1", jobPostingId: "post_1" }, HR),
    ).rejects.toMatchObject({ code: "POSTING_NOT_OPEN", status: 409 });
    expect(repo.createApplication).not.toHaveBeenCalled();
  });
});

describe("recruitment — pipeline (US3)", () => {
  it("lets HR move backward and audits before/after (FR-007)", async () => {
    vi.mocked(repo.findApplicationById).mockResolvedValue(application({ stage: "INTERVIEW" }) as never);
    vi.mocked(repo.updateApplicationStage).mockResolvedValue(application({ stage: "APPLIED" }) as never);

    await service.moveApplicationStage(ORG, "app_1", "APPLIED", HR);

    expect(repo.writeActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "recruitment.stage_changed",
        before: { stage: "INTERVIEW" },
        after: { stage: "APPLIED" },
      }),
    );
  });

  it("refuses a Manager outside the posting's department (FR-008, SC-005)", async () => {
    managerIn("dept_sales");
    vi.mocked(repo.findApplicationById).mockResolvedValue(application() as never);
    await expect(service.moveApplicationStage(ORG, "app_1", "SCREEN", MGR)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    expect(repo.updateApplicationStage).not.toHaveBeenCalled();
  });

  it("lets the department Manager move an in-progress application", async () => {
    managerIn("dept_eng");
    vi.mocked(repo.findApplicationById).mockResolvedValue(application() as never);
    vi.mocked(repo.updateApplicationStage).mockResolvedValue(application({ stage: "SCREEN" }) as never);
    const result = await service.moveApplicationStage(ORG, "app_1", "SCREEN", MGR);
    expect(result.stage).toBe("SCREEN");
  });

  it("treats HIRED/REJECTED as final for a Manager (FR-009)", async () => {
    managerIn("dept_eng");
    vi.mocked(repo.findApplicationById).mockResolvedValue(application({ stage: "REJECTED" }) as never);
    await expect(service.moveApplicationStage(ORG, "app_1", "OFFER", MGR)).rejects.toMatchObject({
      code: "APPLICATION_FINAL",
    });
  });

  it("marks terminal applications with isTerminal", async () => {
    vi.mocked(repo.findApplicationById).mockResolvedValue(application({ stage: "OFFER" }) as never);
    vi.mocked(repo.updateApplicationStage).mockResolvedValue(application({ stage: "HIRED" }) as never);
    const result = await service.moveApplicationStage(ORG, "app_1", "HIRED", HR);
    expect(result.isTerminal).toBe(true);
  });

  it("refuses an Employee viewing a pipeline", async () => {
    vi.mocked(repo.findJobPostingById).mockResolvedValue(posting() as never);
    await expect(service.listApplicationsForPosting(ORG, "post_1", EMP)).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe("recruitment — interviews (US4)", () => {
  const round = (o: Record<string, unknown> = {}) => ({
    id: "round_1",
    orgId: ORG,
    applicationId: "app_1",
    interviewerId: "emp_1",
    result: "PENDING",
    ...o,
  });

  it("only schedules for applications in INTERVIEW", async () => {
    vi.mocked(repo.findApplicationById).mockResolvedValue(application({ stage: "SCREEN" }) as never);
    await expect(
      service.scheduleInterview(ORG, "app_1", { interviewerId: "emp_1", scheduledAt: "2026-11-01T10:00:00Z" }, HR),
    ).rejects.toMatchObject({ code: "WRONG_STAGE" });
  });

  it("rejects an offboarded interviewer (FR-012 edge case)", async () => {
    vi.mocked(repo.findApplicationById).mockResolvedValue(application({ stage: "INTERVIEW" }) as never);
    vi.mocked(employeeService.getEmployeeSummary).mockResolvedValue({ status: "OFFBOARDED" } as never);
    await expect(
      service.scheduleInterview(ORG, "app_1", { interviewerId: "emp_x", scheduledAt: "2026-11-01T10:00:00Z" }, HR),
    ).rejects.toMatchObject({ code: "INTERVIEWER_INVALID" });
  });

  it("refuses a result from someone other than the assigned interviewer (FR-011, SC-003)", async () => {
    vi.mocked(repo.findInterviewRoundById).mockResolvedValue(round({ interviewerId: "emp_other" }) as never);
    await expect(
      service.recordInterviewResult(ORG, "round_1", { result: "PASS" }, EMP),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(repo.updateInterviewRound).not.toHaveBeenCalled();
  });

  it("lets the assigned interviewer record a result once", async () => {
    vi.mocked(repo.findInterviewRoundById).mockResolvedValue(round() as never);
    vi.mocked(repo.updateInterviewRound).mockResolvedValue(round({ result: "PASS" }) as never);
    await service.recordInterviewResult(ORG, "round_1", { result: "PASS", feedback: "Strong" }, EMP);
    expect(repo.updateInterviewRound).toHaveBeenCalledWith(
      "round_1",
      expect.objectContaining({ result: "PASS", feedback: "Strong" }),
    );

    vi.mocked(repo.findInterviewRoundById).mockResolvedValue(round({ result: "PASS" }) as never);
    await expect(
      service.recordInterviewResult(ORG, "round_1", { result: "FAIL" }, EMP),
    ).rejects.toMatchObject({ code: "RESULT_ALREADY_RECORDED" });
  });
});
