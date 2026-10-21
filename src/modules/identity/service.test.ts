import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./repository.js", () => ({
  findConfig: vi.fn(),
  upsertConfig: vi.fn(),
  findLink: vi.fn(),
  createLink: vi.fn(),
  findEnrollment: vi.fn(),
  upsertPendingEnrollment: vi.fn(),
  updateEnrollment: vi.fn(),
  deleteEnrollment: vi.fn(),
  writeActivityLog: vi.fn(),
}));
vi.mock("../auth/service.js", () => ({
  completeSignIn: vi.fn(),
  getUserAuthState: vi.fn(),
  getUserAuthStateByEmail: vi.fn(),
  listUsableBreakGlassAdmins: vi.fn(),
  setBreakGlass: vi.fn(),
}));

process.env.JWT_ACCESS_SECRET ??= "test-access-secret";
const repo = await import("./repository.js");
const auth = await import("../auth/service.js");
const totp = await import("../../lib/totp.js");
const box = await import("../../lib/secretBox.js");
const { setOidcProviderFactory } = await import("./oidc.js");
const service = await import("./service.js");

const ORG = "org_1";
const ADMIN = { sub: "u_admin", role: "ADMIN" as const, employeeId: "emp_admin" };
const user = (o: Record<string, unknown> = {}) => ({ id: "u1", email: "e@x.dev", role: "EMPLOYEE", employeeId: "emp_1", isBreakGlass: false, locked: false, active: true, ...o }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.findConfig).mockResolvedValue(null);
  vi.mocked(repo.findEnrollment).mockResolvedValue(null);
});

describe("TOTP (RFC 6238 vectors)", () => {
  const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // "12345678901234567890"
  it("matches the published SHA1 test vectors (last 6 digits)", () => {
    expect(totp.codeForStep(RFC_SECRET, Math.floor(59 / 30))).toBe("287082");
    expect(totp.codeForStep(RFC_SECRET, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totp.codeForStep(RFC_SECRET, Math.floor(2000000000 / 30))).toBe("279037");
  });

  it("accepts ±1 step of drift and nothing further", () => {
    const now = 1_700_000_000_000;
    const step = totp.currentStep(now);
    expect(totp.verifyCode(RFC_SECRET, totp.codeForStep(RFC_SECRET, step - 1), { now })).toBe(step - 1);
    expect(totp.verifyCode(RFC_SECRET, totp.codeForStep(RFC_SECRET, step - 3), { now })).toBeNull();
    expect(totp.verifyCode(RFC_SECRET, "12ab56", { now })).toBeNull();
  });
});

describe("secretBox", () => {
  it("round-trips and detects tampering", () => {
    const sealed = box.seal("JBSWY3DPEHPK3PXP");
    expect(sealed).not.toContain("JBSWY3DPEHPK3PXP");
    expect(box.open(sealed)).toBe("JBSWY3DPEHPK3PXP");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => box.open(parts.join("."))).toThrow();
  });
});

describe("login policy (FR-004/005/008/009)", () => {
  const u = { id: "u1", role: "EMPLOYEE", isBreakGlass: false, employeeId: "e1" };
  it("blocks password sign-in when SSO is enforced, except break-glass", async () => {
    vi.mocked(repo.findConfig).mockResolvedValue({ provider: "GOOGLE", enforced: true, mfaRequired: false } as never);
    expect((await service.loginPolicy(ORG, u)).passwordAllowed).toBe(false);
    expect((await service.loginPolicy(ORG, { ...u, isBreakGlass: true })).passwordAllowed).toBe(true);
  });

  it("asks enrolled users to verify, and unenrolled users to enroll when MFA is required", async () => {
    vi.mocked(repo.findEnrollment).mockResolvedValue({ confirmedAt: new Date(), secret: "s" } as never);
    expect((await service.loginPolicy(ORG, u)).mfa).toBe("VERIFY");
    vi.mocked(repo.findEnrollment).mockResolvedValue(null);
    expect((await service.loginPolicy(ORG, u)).mfa).toBe("NONE");
    vi.mocked(repo.findConfig).mockResolvedValue({ provider: null, enforced: false, mfaRequired: true } as never);
    expect((await service.loginPolicy(ORG, u)).mfa).toBe("ENROLL");
  });
});

describe("second factor (FR-007/008/011)", () => {
  const secret = totp.generateSecret();
  const enrolled = (o: Record<string, unknown> = {}) => ({ confirmedAt: new Date(), secret: box.seal(secret), failedAttempts: 0, lockedUntil: null, lastUsedStep: null, ...o }) as never;

  it("accepts a valid code and records its step", async () => {
    vi.mocked(repo.findEnrollment).mockResolvedValue(enrolled());
    await service.verifySecondFactor("u1", totp.codeForStep(secret, totp.currentStep()));
    expect(repo.updateEnrollment).toHaveBeenCalledWith("u1", expect.objectContaining({ failedAttempts: 0, lastUsedStep: totp.currentStep() }));
  });

  it("rejects a replayed code (SC-004)", async () => {
    const step = totp.currentStep();
    vi.mocked(repo.findEnrollment).mockResolvedValue(enrolled({ lastUsedStep: step }));
    await expect(service.verifySecondFactor("u1", totp.codeForStep(secret, step))).rejects.toMatchObject({ code: "INVALID_CODE" });
  });

  it("locks after 5 consecutive failures, then refuses even a correct code", async () => {
    vi.mocked(repo.findEnrollment).mockResolvedValue(enrolled({ failedAttempts: 4 }));
    await expect(service.verifySecondFactor("u1", "000000")).rejects.toMatchObject({ code: "MFA_LOCKED", status: 429 });
    expect(repo.updateEnrollment).toHaveBeenCalledWith("u1", expect.objectContaining({ lockedUntil: expect.any(Date) }));

    vi.mocked(repo.findEnrollment).mockResolvedValue(enrolled({ lockedUntil: new Date(Date.now() + 60_000) }));
    await expect(service.verifySecondFactor("u1", totp.codeForStep(secret, totp.currentStep()))).rejects.toMatchObject({ code: "MFA_LOCKED" });
  });

  it("enrollment fails clearly on a wrong code and keeps the pending secret (edge case)", async () => {
    vi.mocked(repo.findEnrollment).mockResolvedValue({ pendingSecret: box.seal(secret) } as never);
    await expect(service.confirmEnrollment(ORG, "u1", "000000", { employeeId: "e1" })).rejects.toMatchObject({ code: "INVALID_CODE" });
    expect(repo.updateEnrollment).not.toHaveBeenCalled();
  });
});

describe("SSO (FR-002/003, SC-002)", () => {
  it("links a verified email to an existing employee account", async () => {
    vi.mocked(auth.getUserAuthStateByEmail).mockResolvedValue(user());
    const u = await service.resolveSsoUser(ORG, "GOOGLE", { sub: "g-1", email: "e@x.dev", emailVerified: true });
    expect(u).toMatchObject({ id: "u1" });
    expect(repo.createLink).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", provider: "GOOGLE", externalId: "g-1" }));
  });

  it("never creates an account for an unknown identity", async () => {
    vi.mocked(auth.getUserAuthStateByEmail).mockResolvedValue(null);
    await expect(service.resolveSsoUser(ORG, "GOOGLE", { sub: "g-2", email: "stranger@x.dev", emailVerified: true })).rejects.toMatchObject({ code: "NO_MATCHING_EMPLOYEE" });
    expect(repo.createLink).not.toHaveBeenCalled();
  });

  it("fails clearly when a linked user's email no longer matches (edge case)", async () => {
    vi.mocked(repo.findLink).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(auth.getUserAuthState).mockResolvedValue(user({ email: "renamed@x.dev" }));
    await expect(service.resolveSsoUser(ORG, "GOOGLE", { sub: "g-1", email: "e@x.dev", emailVerified: true })).rejects.toMatchObject({ code: "SSO_EMAIL_MISMATCH" });
  });

  it("rejects a callback whose state doesn't match, and signs in through a (fake) provider when it does", async () => {
    vi.mocked(repo.findConfig).mockResolvedValue({ provider: "GOOGLE" } as never);
    setOidcProviderFactory(() => ({
      authorizationUrl: () => "https://idp.example/auth",
      exchangeCode: async () => ({ sub: "g-1", email: "e@x.dev", emailVerified: true }),
    }));
    const flow = { provider: "GOOGLE" as const, state: "s1", nonce: "n", codeVerifier: "v" };
    await expect(service.finishSso(ORG, flow, { code: "c", state: "other" })).rejects.toMatchObject({ code: "SSO_STATE_MISMATCH" });

    vi.mocked(repo.findLink).mockResolvedValue(null);
    vi.mocked(auth.getUserAuthStateByEmail).mockResolvedValue(user());
    await service.finishSso(ORG, flow, { code: "c", state: "s1" });
    expect(auth.completeSignIn).toHaveBeenCalledWith(ORG, "u1", "sso");
  });
});

describe("enforcement safety (FR-005/006, SC-005)", () => {
  it("refuses to enforce SSO without a usable break-glass Admin", async () => {
    vi.mocked(auth.listUsableBreakGlassAdmins).mockResolvedValue([]);
    await expect(service.updateSettings(ORG, { provider: "GOOGLE", enforced: true }, ADMIN)).rejects.toMatchObject({ code: "BREAK_GLASS_REQUIRED" });
  });

  it("won't revoke the last break-glass account while enforced", async () => {
    vi.mocked(auth.getUserAuthState).mockResolvedValue(user({ id: "u_admin", role: "ADMIN" }));
    vi.mocked(repo.findConfig).mockResolvedValue({ provider: "GOOGLE", enforced: true } as never);
    vi.mocked(auth.listUsableBreakGlassAdmins).mockResolvedValue([{ userId: "u_admin", email: "a@x.dev" }]);
    await expect(service.setBreakGlassAccount(ORG, "u_admin", false, ADMIN)).rejects.toMatchObject({ code: "BREAK_GLASS_REQUIRED" });
  });
});
