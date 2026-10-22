import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./repository.js", () => ({
  recordInteractions: vi.fn(),
  listInteractions: vi.fn(),
  listArticles: vi.fn(),
  findArticle: vi.fn(),
  createArticle: vi.fn(),
  updateArticle: vi.fn(),
  deleteArticle: vi.fn(),
}));
vi.mock("../attendance/service.js", () => ({ getMyLeaveBalances: vi.fn(), listHolidays: vi.fn(), listLeaveTypes: vi.fn() }));
vi.mock("../payroll/service.js", () => ({ getMyPayslips: vi.fn() }));
vi.mock("../expenses/service.js", () => ({ myClaims: vi.fn() }));
vi.mock("../helpdesk/service.js", () => ({ myTickets: vi.fn() }));
vi.mock("../documents/service.js", () => ({ listPolicies: vi.fn() }));

const repo = await import("./repository.js");
const attendance = await import("../attendance/service.js");
const payroll = await import("../payroll/service.js");
const documents = await import("../documents/service.js");
const service = await import("./service.js");

const ORG = "org_1";
const EMP = { sub: "u", role: "EMPLOYEE" as const, employeeId: "emp_1" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(attendance.listLeaveTypes).mockResolvedValue([{ id: "lt_sick", name: "Sick", defaultDays: 10, isPaid: true }, { id: "lt_annual", name: "Annual", defaultDays: 20, isPaid: true }] as never);
  vi.mocked(attendance.getMyLeaveBalances).mockResolvedValue([{ leaveTypeId: "lt_sick", allocated: 10, used: 3 }, { leaveTypeId: "lt_annual", allocated: 20, used: 0 }] as never);
  vi.mocked(repo.listArticles).mockResolvedValue([]);
  vi.mocked(documents.listPolicies).mockResolvedValue([]);
});

describe("assistant — personal data (FR-002, SC-001)", () => {
  it("answers with the asker's real balance for the type asked about", async () => {
    const { answers } = await service.ask(ORG, "how many sick days do I have left?", EMP);
    expect(answers[0]).toMatchObject({ answered: true, grounding: "PERSONAL_DATA" });
    expect(answers[0]!.text).toContain("Sick: 7 day(s) left of 10");
    expect(answers[0]!.text).not.toContain("Annual");
    expect(attendance.getMyLeaveBalances).toHaveBeenCalledWith(ORG, "emp_1");
  });

  it("explains a named deduction from the real payslip (US1.2)", async () => {
    vi.mocked(payroll.getMyPayslips).mockResolvedValue([{ id: "p1", periodMonth: 9, periodYear: 2026, currency: "INR", netPay: 61800, earnings: { basic: 50000, hra: 20000 }, deductions: { unpaidLeave: 0 }, statutoryDeductions: [{ name: "Retirement fund", amount: 6000 }, { name: "Professional tax", amount: 200 }] }] as never);
    const { answers } = await service.ask(ORG, "explain the retirement fund deduction on my payslip", EMP);
    expect(answers[0]!.text).toContain("Retirement fund was INR 6,000");
    expect(answers[0]!.sources[0]!.link).toBe("/api/payroll/payslips/me/p1");
  });
});

describe("assistant — scope and refusal (FR-003, FR-005, SC-002, SC-003)", () => {
  it("refuses someone else's data without looking anything up", async () => {
    const { answers } = await service.ask(ORG, "what's Priya's salary", EMP);
    expect(answers[0]).toMatchObject({ answered: false, reason: "OUT_OF_SCOPE" });
    expect(payroll.getMyPayslips).not.toHaveBeenCalled();
  });

  it("declines a policy question with no grounding", async () => {
    const { answers } = await service.ask(ORG, "what's our stance on remote work", EMP);
    expect(answers[0]).toMatchObject({ answered: false, reason: "NO_GROUNDING", topic: "remote work" });
  });

  it("answers from an article, citing it and the linked policy (FR-004, FR-006)", async () => {
    vi.mocked(repo.listArticles).mockResolvedValue([{ id: "a1", title: "Remote work", body: "Up to two days a week from home.", keywords: ["remote", "work from home"], policyId: "pol1" }] as never);
    vi.mocked(documents.listPolicies).mockResolvedValue([{ id: "pol1", title: "Flexible Working Policy", documentId: "doc1" }] as never);
    const { answers } = await service.ask(ORG, "can I work from home", EMP);
    expect(answers[0]).toMatchObject({ answered: true, grounding: "POLICY" });
    expect(answers[0]!.text).toContain("Up to two days a week from home.");
    expect(answers[0]!.sources.map((s) => s.link)).toEqual(["/api/assistant/knowledge/a1", "/api/documents/doc1/download"]);
  });
});

describe("assistant — mixed questions and logging (FR-007, FR-010)", () => {
  it("answers the grounded part, flags the other, logs both without identity", async () => {
    const out = await service.ask(ORG, "what's my leave balance and what's our stance on remote work?", EMP);
    expect(out.answers.map((a) => a.answered)).toEqual([true, false]);
    expect(out.allAnswered).toBe(false);
    const rows = vi.mocked(repo.recordInteractions).mock.calls[0]![0];
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain("emp_1");
    expect(JSON.stringify(rows)).not.toContain("stance");
    expect(rows[0]!.createdAt.toISOString().endsWith("T00:00:00.000Z")).toBe(true);
  });

  it("aggregates topics and the unanswered rate", async () => {
    vi.mocked(repo.listInteractions).mockResolvedValue([
      { topic: "remote work", wasAnswered: false, groundingType: null },
      { topic: "remote work", wasAnswered: false, groundingType: null },
      { topic: "leave balance", wasAnswered: true, groundingType: "PERSONAL_DATA" },
    ] as never);
    const o = await service.overview(ORG, { from: "2026-10-01", to: "2026-10-22" });
    expect(o).toMatchObject({ questions: 3, unanswered: 2, unansweredRate: 0.667 });
    expect(o.topics[0]).toEqual({ topic: "remote work", questions: 2, unanswered: 2 });
  });
});

describe("assistant — unconfigured leave kinds (FR-005)", () => {
  it("treats a question about an unconfigured leave kind as a policy question", async () => {
    const { answers } = await service.ask(ORG, "what's the policy on parental leave", EMP);
    expect(answers[0]).toMatchObject({ answered: false, reason: "NO_GROUNDING", topic: "parental leave" });
  });

  it("still answers entitlement for configured types", async () => {
    const { answers } = await service.ask(ORG, "how many annual leave days do we get per year", EMP);
    expect(answers[0]).toMatchObject({ answered: true, grounding: "SYSTEM_SETTING" });
  });
});
