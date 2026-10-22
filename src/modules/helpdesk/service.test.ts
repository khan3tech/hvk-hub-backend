import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./repository.js", () => ({
  listCategories: vi.fn(),
  createCategories: vi.fn(),
  createCategory: vi.fn(),
  findCategory: vi.fn(),
  updateCategory: vi.fn(),
  createTicket: vi.fn(),
  findTicket: vi.fn(),
  listTickets: vi.fn(),
  transition: vi.fn(),
  updateTicket: vi.fn(),
  addReply: vi.fn(),
  findSettings: vi.fn(),
  upsertSettings: vi.fn(),
}));
vi.mock("../auth/service.js", () => ({ listUsersByRole: vi.fn() }));
vi.mock("../employee/service.js", () => ({ getEmployeeSummary: vi.fn() }));
vi.mock("../notifications/service.js", () => ({ notifyEmployees: vi.fn(), notifyRoles: vi.fn() }));

const repo = await import("./repository.js");
const auth = await import("../auth/service.js");
const employees = await import("../employee/service.js");
const service = await import("./service.js");

const ORG = "org_1";
const EMP = { sub: "u_e", role: "EMPLOYEE" as const, employeeId: "emp_1" };
const OTHER = { sub: "u_o", role: "MANAGER" as const, employeeId: "emp_mgr" };
const HR = { sub: "u_hr", role: "HR" as const, employeeId: "emp_hr" };
const ticket = (o: Record<string, unknown> = {}) =>
  ({ id: "t1", orgId: ORG, employeeId: "emp_1", categoryId: "cat", category: { name: "Payroll" }, subject: "Payslip", description: "Missing allowance", status: "OPEN", assigneeId: null, createdAt: new Date(), resolvedAt: null, awaitingHrSince: new Date(), replies: [], ...o }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.listCategories).mockResolvedValue([{ id: "cat", name: "Payroll", active: true }] as never);
  vi.mocked(repo.findSettings).mockResolvedValue(null);
  vi.mocked(repo.findTicket).mockResolvedValue(ticket());
});

describe("helpdesk — overdue (FR-009, SC-003)", () => {
  it("flags only tickets waiting on HR past the threshold", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    const since = (h: number) => new Date(now.getTime() - h * 3_600_000);
    expect(service.isOverdue({ status: "OPEN", awaitingHrSince: since(49) }, 48, now)).toBe(true);
    expect(service.isOverdue({ status: "OPEN", awaitingHrSince: since(47) }, 48, now)).toBe(false);
    expect(service.isOverdue({ status: "ASSIGNED", awaitingHrSince: null }, 48, now)).toBe(false);
    expect(service.isOverdue({ status: "RESOLVED", awaitingHrSince: since(100) }, 48, now)).toBe(false);
  });
});

describe("helpdesk — visibility (FR-007/008, SC-005)", () => {
  it("hides another employee's ticket as if it didn't exist", async () => {
    await expect(service.getTicket(ORG, "t1", OTHER)).rejects.toMatchObject({ status: 404 });
    await expect(service.getTicket(ORG, "t1", EMP)).resolves.toMatchObject({ id: "t1", category: "Payroll" });
    await expect(service.getTicket(ORG, "t1", HR)).resolves.toBeTruthy();
  });

  it("rejects an inactive category", async () => {
    vi.mocked(repo.findCategory).mockResolvedValue({ id: "cat", active: false } as never);
    await expect(service.raiseTicket(ORG, { categoryId: "cat", subject: "Hi", description: "Help" }, EMP)).rejects.toMatchObject({ status: 400 });
  });
});

describe("helpdesk — workflow (FR-004/005/006)", () => {
  it("only assigns to active HR/Admin users", async () => {
    vi.mocked(auth.listUsersByRole).mockResolvedValue([{ id: "u_hr", employeeId: "emp_hr" }] as never);
    vi.mocked(employees.getEmployeeSummary).mockResolvedValue({ id: "emp_x", status: "ACTIVE" } as never);
    await expect(service.assign(ORG, "t1", "emp_x", HR)).rejects.toMatchObject({ status: 400 });
    vi.mocked(employees.getEmployeeSummary).mockResolvedValue({ id: "emp_hr", status: "ACTIVE" } as never);
    await service.assign(ORG, "t1", "emp_hr", HR);
    expect(repo.updateTicket).toHaveBeenCalledWith("t1", { assigneeId: "emp_hr", status: "ASSIGNED" });
  });

  it("an HR reply stops the overdue clock; a requester reply restarts it", async () => {
    await service.reply(ORG, "t1", "Looking into it", HR);
    expect(repo.addReply).toHaveBeenCalledWith(expect.objectContaining({ fromHr: true }));
    expect(repo.updateTicket).toHaveBeenLastCalledWith("t1", { awaitingHrSince: null });
    await service.reply(ORG, "t1", "Any update?", EMP);
    expect(repo.updateTicket).toHaveBeenLastCalledWith("t1", { awaitingHrSince: expect.any(Date) });
  });

  it("only the requester reopens, and only a resolved ticket", async () => {
    vi.mocked(repo.findTicket).mockResolvedValue(ticket({ status: "RESOLVED" }));
    await expect(service.reopen(ORG, "t1", HR)).rejects.toMatchObject({ status: 403 });
    vi.mocked(repo.transition).mockResolvedValue({ count: 0 });
    await expect(service.reopen(ORG, "t1", EMP)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("can't reply to a resolved ticket", async () => {
    vi.mocked(repo.findTicket).mockResolvedValue(ticket({ status: "RESOLVED" }));
    await expect(service.reply(ORG, "t1", "x", EMP)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});

describe("helpdesk — summary (FR-010, SC-004)", () => {
  it("averages created→resolved hours per category", async () => {
    const t0 = new Date("2026-10-01T00:00:00Z");
    vi.mocked(repo.listTickets).mockResolvedValue([
      { categoryId: "cat", status: "RESOLVED", createdAt: t0, resolvedAt: new Date(t0.getTime() + 10 * 3_600_000) },
      { categoryId: "cat", status: "RESOLVED", createdAt: t0, resolvedAt: new Date(t0.getTime() + 20 * 3_600_000) },
      { categoryId: "cat", status: "OPEN", createdAt: t0, resolvedAt: null },
    ] as never);
    const s = await service.summary(ORG);
    expect(s.categories[0]).toEqual({ categoryId: "cat", name: "Payroll", open: 1, resolved: 2, averageResolutionHours: 15 });
  });
});
