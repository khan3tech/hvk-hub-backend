import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import moment from "moment";
import { DomainError } from "../../middleware/errorHandler.js";

vi.mock("./repository.js", () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  incrementFailedAttempts: vi.fn(),
  resetFailedAttempts: vi.fn(),
  lockUser: vi.fn(),
  unlockUser: vi.fn(),
  createRefreshToken: vi.fn(),
  findActiveRefreshTokenByHash: vi.fn(),
  revokeRefreshToken: vi.fn(),
  revokeAllRefreshTokensForUser: vi.fn(),
  writeActivityLog: vi.fn(),
}));

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.AUTH_LOCKOUT_THRESHOLD = "3";

const repo = await import("./repository.js");
const { login, unlockUser } = await import("./service.js");

const ORG_ID = "org_1";

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user_1",
    orgId: ORG_ID,
    email: "employee@example.com",
    passwordHash: "",
    role: "EMPLOYEE",
    employeeId: "emp_1",
    failedLoginAttempts: 0,
    lockedAt: null,
    employee: { status: "ACTIVE" },
    ...overrides,
  };
}

describe("auth service — login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a nonexistent email with the generic invalid-credentials error", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(null);

    await expect(login(ORG_ID, { email: "nobody@example.com", password: "password123" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      status: 401,
    });
  });

  it("rejects a wrong password with the same generic error as a nonexistent email", async () => {
    const passwordHash = await bcrypt.hash("correct-password", 12);
    vi.mocked(repo.findUserByEmail).mockResolvedValue(makeUser({ passwordHash }) as never);
    vi.mocked(repo.incrementFailedAttempts).mockResolvedValue(makeUser({ failedLoginAttempts: 1 }) as never);

    await expect(login(ORG_ID, { email: "employee@example.com", password: "wrong-password" })).rejects.toMatchObject(
      { code: "INVALID_CREDENTIALS", status: 401 },
    );
  });

  it("rejects sign-in for a locked account with a distinct ACCOUNT_LOCKED error", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(makeUser({ lockedAt: moment().toDate() }) as never);

    await expect(login(ORG_ID, { email: "employee@example.com", password: "irrelevant" })).rejects.toMatchObject({
      code: "ACCOUNT_LOCKED",
      status: 403,
    });
  });

  it("locks the account once failed attempts reach the threshold", async () => {
    const passwordHash = await bcrypt.hash("correct-password", 12);
    vi.mocked(repo.findUserByEmail).mockResolvedValue(makeUser({ passwordHash }) as never);
    vi.mocked(repo.incrementFailedAttempts).mockResolvedValue(makeUser({ failedLoginAttempts: 3 }) as never);

    await expect(login(ORG_ID, { email: "employee@example.com", password: "wrong" })).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(repo.lockUser).toHaveBeenCalledWith("user_1");
  });

  it("succeeds with correct credentials, resets attempts, and issues a session", async () => {
    const passwordHash = await bcrypt.hash("correct-password", 12);
    vi.mocked(repo.findUserByEmail).mockResolvedValue(makeUser({ passwordHash }) as never);
    vi.mocked(repo.createRefreshToken).mockResolvedValue({} as never);

    const result = (await login(ORG_ID, { email: "employee@example.com", password: "correct-password" })) as {
      accessToken: string;
      user: { email: string };
    };

    expect(result.accessToken).toBeTruthy();
    expect(result.user.email).toBe("employee@example.com");
    expect(repo.resetFailedAttempts).toHaveBeenCalledWith("user_1");
    expect(repo.writeActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.sign_in", actorId: "emp_1" }),
    );
  });

  it("revokes any previously active session on a new successful sign-in (FR-013)", async () => {
    const passwordHash = await bcrypt.hash("correct-password", 12);
    vi.mocked(repo.findUserByEmail).mockResolvedValue(makeUser({ passwordHash }) as never);
    vi.mocked(repo.createRefreshToken).mockResolvedValue({} as never);

    await login(ORG_ID, { email: "employee@example.com", password: "correct-password" });

    expect(repo.revokeAllRefreshTokensForUser).toHaveBeenCalledWith("user_1");
  });

  it("rejects sign-in for an offboarded employee's user account", async () => {
    const passwordHash = await bcrypt.hash("correct-password", 12);
    vi.mocked(repo.findUserByEmail).mockResolvedValue(
      makeUser({ passwordHash, employee: { status: "OFFBOARDED" } }) as never,
    );

    await expect(
      login(ORG_ID, { email: "employee@example.com", password: "correct-password" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
  });
});

describe("auth service — unlockUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resets lockout state and writes an audited ActivityLog entry", async () => {
    vi.mocked(repo.findUserById).mockResolvedValue(makeUser({ lockedAt: moment().toDate() }) as never);
    vi.mocked(repo.unlockUser).mockResolvedValue(makeUser({ lockedAt: null }) as never);

    const actor = { sub: "admin_1", role: "ADMIN" as const, employeeId: "emp_admin" };
    const result = await unlockUser(ORG_ID, "user_1", actor);

    expect(result.lockedAt).toBeNull();
    expect(repo.writeActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.account_unlocked", actorId: "emp_admin" }),
    );
  });

  it("throws NOT_FOUND for a user that doesn't exist in the caller's org", async () => {
    vi.mocked(repo.findUserById).mockResolvedValue(null);

    const actor = { sub: "admin_1", role: "ADMIN" as const, employeeId: "emp_admin" };
    await expect(unlockUser(ORG_ID, "missing", actor)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });
});
