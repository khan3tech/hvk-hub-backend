import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./repository.js", () => ({
  createNotification: vi.fn(),
  listForUser: vi.fn(),
  countUnread: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}));

vi.mock("../auth/service.js", () => ({
  findUserForEmployee: vi.fn(),
  listUsersByRole: vi.fn(),
}));

vi.mock("../employee/service.js", () => ({
  getEmployeeSummary: vi.fn(),
}));

const repo = await import("./repository.js");
const auth = await import("../auth/service.js");
const employees = await import("../employee/service.js");
const { setEmailSender } = await import("../../lib/email.js");
const service = await import("./service.js");

const ORG = "org_1";
const send = vi.fn();
const EVENT = {
  type: "LEAVE_DECIDED" as const,
  message: "Your leave was approved.",
  link: "/leave/requests/r1",
  email: { subject: "Leave approved", text: "Your leave was approved." },
};

function employee(status: "ACTIVE" | "OFFBOARDED", departmentId = "dept_1") {
  return { id: "emp_1", name: "E", email: "e@x.dev", status, departmentId, managerId: null } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  setEmailSender({ send });
  vi.mocked(auth.findUserForEmployee).mockResolvedValue({ id: "user_1", role: "EMPLOYEE", email: "e@x.dev", employeeId: "emp_1" } as never);
});

describe("notifications — delivery", () => {
  it("creates the in-app notification and sends the email (FR-001)", async () => {
    vi.mocked(employees.getEmployeeSummary).mockResolvedValue(employee("ACTIVE"));
    await service.notifyEmployees(ORG, ["emp_1"], EVENT);
    expect(repo.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", type: "LEAVE_DECIDED", link: "/leave/requests/r1" }),
    );
    expect(send).toHaveBeenCalledWith({ to: "e@x.dev", subject: "Leave approved", text: EVENT.email.text });
  });

  it("still creates the in-app notification when the email fails (FR-008, SC-002)", async () => {
    vi.mocked(employees.getEmployeeSummary).mockResolvedValue(employee("ACTIVE"));
    send.mockRejectedValueOnce(new Error("bounce"));
    await expect(service.notifyEmployees(ORG, ["emp_1"], EVENT)).resolves.toBeUndefined();
    expect(repo.createNotification).toHaveBeenCalledTimes(1);
  });

  it("never emails an offboarded employee (FR-009, SC-004)", async () => {
    vi.mocked(employees.getEmployeeSummary).mockResolvedValue(employee("OFFBOARDED"));
    await service.notifyEmployees(ORG, ["emp_1"], EVENT);
    expect(repo.createNotification).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends no email for in-app-only events (FR-002)", async () => {
    await service.notifyEmployees(ORG, ["emp_1"], { type: "LEAVE_PENDING_APPROVAL", message: "Review" });
    expect(repo.createNotification).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("skips employees without a login and never throws to the caller", async () => {
    vi.mocked(auth.findUserForEmployee).mockResolvedValue(null);
    await service.notifyEmployees(ORG, ["emp_x"], EVENT);
    expect(repo.createNotification).not.toHaveBeenCalled();

    vi.mocked(auth.findUserForEmployee).mockRejectedValue(new Error("db down"));
    await expect(service.notifyEmployees(ORG, ["emp_1"], EVENT)).resolves.toBeUndefined();
  });

  it("notifies only the department's active Managers (FR-005)", async () => {
    vi.mocked(auth.listUsersByRole).mockResolvedValue([
      { id: "u_m1", role: "MANAGER", email: "m1@x.dev", employeeId: "e_m1" },
      { id: "u_m2", role: "MANAGER", email: "m2@x.dev", employeeId: "e_m2" },
    ] as never);
    vi.mocked(employees.getEmployeeSummary).mockImplementation(async (_o, id) =>
      id === "e_m1" ? employee("ACTIVE", "dept_eng") : employee("ACTIVE", "dept_sales"),
    );
    await service.notifyDepartmentManagers(ORG, "dept_eng", { type: "INTERVIEW_RESULT_RECORDED", message: "x" });
    expect(repo.createNotification).toHaveBeenCalledTimes(1);
    expect(repo.createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "u_m1" }));
  });
});

describe("notifications — center (US2)", () => {
  it("404s when marking someone else's (or a missing) notification read", async () => {
    vi.mocked(repo.markRead).mockResolvedValue({ count: 0 });
    await expect(service.markRead(ORG, "user_1", "n_other")).rejects.toMatchObject({ status: 404 });
  });

  it("returns the new unread count after marking read (FR-007)", async () => {
    vi.mocked(repo.markRead).mockResolvedValue({ count: 1 });
    vi.mocked(repo.countUnread).mockResolvedValue(2);
    await expect(service.markRead(ORG, "user_1", "n_1")).resolves.toEqual({ unreadCount: 2 });
  });
});
