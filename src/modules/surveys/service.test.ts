import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("./repository.js", () => ({
  createSurvey: vi.fn(),
  findSurvey: vi.fn(),
  listSurveys: vi.fn(),
  closeSurvey: vi.fn(),
  participationFor: vi.fn(),
  countResponses: vi.fn(),
  recordAnonymousResponse: vi.fn(),
  answersFor: vi.fn(),
}));
vi.mock("../employee/service.js", () => ({ listActiveEmployeeSummaries: vi.fn() }));
vi.mock("../notifications/service.js", () => ({ notifyEmployees: vi.fn() }));

const repo = await import("./repository.js");
const employees = await import("../employee/service.js");
const service = await import("./service.js");

const ORG = "org_1";
const HR = { sub: "u_hr", role: "HR" as const, employeeId: "emp_hr" };
const EMP = { sub: "u_e", role: "EMPLOYEE" as const, employeeId: "e1" };
const survey = (o: Record<string, unknown> = {}) =>
  ({ id: "s1", orgId: ORG, title: "Pulse", status: "OPEN", audienceEmployeeIds: ["e1", "e2"], audienceSize: 2, minResponses: 5, sentAt: new Date(), questions: [{ id: "q1", type: "ENPS", prompt: "Recommend us?" }, { id: "q2", type: "TEXT", prompt: "Why?" }], ...o }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.findSurvey).mockResolvedValue(survey());
});

describe("surveys — eNPS (FR-007)", () => {
  it("is % promoters minus % detractors", () => {
    expect(service.enps([10, 9, 8, 7, 6, 0])).toBe(0); // 2 promoters, 2 detractors of 6
    expect(service.enps([10, 10, 10, 6])).toBe(50);
    expect(service.enps([])).toBeNull();
  });
});

describe("surveys — sending (FR-002/010)", () => {
  it("snapshots only the target department's active employees", async () => {
    vi.mocked(employees.listActiveEmployeeSummaries).mockResolvedValue([{ id: "e1", departmentId: "eng" }, { id: "e2", departmentId: "sales" }] as never);
    vi.mocked(repo.createSurvey).mockImplementation(((data: object, questions: unknown[]) => Promise.resolve({ ...data, id: "s1", questions })) as never);
    await service.createSurvey(ORG, { title: "Eng pulse", audienceType: "DEPARTMENT", departmentId: "eng", questions: [{ type: "ENPS", prompt: "Recommend?" }] }, HR);
    expect(repo.createSurvey).toHaveBeenCalledWith(expect.objectContaining({ audienceEmployeeIds: ["e1"], audienceSize: 1 }), expect.anything());
  });

  it("doesn't show a survey to someone outside its snapshot", async () => {
    vi.mocked(repo.listSurveys).mockResolvedValue([survey({ audienceEmployeeIds: ["e2"] })]);
    vi.mocked(repo.participationFor).mockResolvedValue([]);
    expect(await service.pendingFor(ORG, EMP)).toEqual([]);
    await expect(service.submit(ORG, "s1", { answers: [{ questionId: "q1", score: 9 }] }, EMP)).resolves.toBeTruthy();
  });
});

describe("surveys — responses (FR-003/004)", () => {
  it("records answers without the employee on the response", async () => {
    await service.submit(ORG, "s1", { answers: [{ questionId: "q1", score: 9 }, { questionId: "q2", text: " Great team " }] }, EMP);
    expect(repo.recordAnonymousResponse).toHaveBeenCalledWith(ORG, "s1", "e1", [
      { questionId: "q1", scoreValue: 9, textValue: null },
      { questionId: "q2", scoreValue: null, textValue: "Great team" },
    ]);
  });

  it("requires every eNPS score and refuses a second response", async () => {
    await expect(service.submit(ORG, "s1", { answers: [{ questionId: "q2", text: "x" }] }, EMP)).rejects.toMatchObject({ status: 400 });
    vi.mocked(repo.recordAnonymousResponse).mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" }));
    await expect(service.submit(ORG, "s1", { answers: [{ questionId: "q1", score: 5 }] }, EMP)).rejects.toMatchObject({ code: "ALREADY_RESPONDED" });
  });

  it("refuses responses to a closed survey", async () => {
    vi.mocked(repo.findSurvey).mockResolvedValue(survey({ status: "CLOSED" }));
    await expect(service.submit(ORG, "s1", { answers: [{ questionId: "q1", score: 5 }] }, EMP)).rejects.toMatchObject({ code: "SURVEY_CLOSED" });
  });
});

describe("surveys — results (FR-005, SC-004)", () => {
  it("withholds everything below the threshold", async () => {
    vi.mocked(repo.countResponses).mockResolvedValue(4);
    const r = await service.results(ORG, "s1");
    expect(r).toMatchObject({ withheld: true, responses: 4 });
    expect(r).not.toHaveProperty("questions");
    expect(repo.answersFor).not.toHaveBeenCalled();
  });

  it("shows aggregates at the threshold, texts without ids", async () => {
    vi.mocked(repo.countResponses).mockResolvedValue(5);
    vi.mocked(repo.answersFor).mockResolvedValue([
      ...[10, 10, 9, 7, 3].map((s) => ({ questionId: "q1", scoreValue: s, textValue: null })),
      { questionId: "q2", scoreValue: null, textValue: "More training" },
    ]);
    const r = (await service.results(ORG, "s1")) as { questions: Array<Record<string, unknown>> };
    expect(r.questions[0]).toMatchObject({ enps: 40, average: 7.8 });
    expect(r.questions[1]).toEqual({ questionId: "q2", type: "TEXT", prompt: "Why?", texts: ["More training"] });
  });
});
