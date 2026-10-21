import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";

vi.mock("./repository.js", () => ({
  createOrganization: vi.fn(),
  deleteOrganization: vi.fn(),
  findOrganization: vi.fn(),
  findOrganizationBySlug: vi.fn(),
  listOrganizations: vi.fn(),
  setStatus: vi.fn(),
  usageFor: vi.fn(),
  findSuperAdminByEmail: vi.fn(),
  findSuperAdmin: vi.fn(),
  recordSuperAdminFailure: vi.fn(),
  resetSuperAdminFailures: vi.fn(),
}));
vi.mock("../employee/service.js", () => ({
  countActiveEmployees: vi.fn(),
  createDepartment: vi.fn(),
  createDesignation: vi.fn(),
  createEmployee: vi.fn(),
}));

process.env.JWT_ACCESS_SECRET ??= "test-access-secret";
const repo = await import("./repository.js");
const employees = await import("../employee/service.js");
const service = await import("./service.js");

const input = { name: "Acme", slug: "acme", adminName: "Ann Admin", adminEmail: "ann@acme.test" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.createOrganization).mockResolvedValue({ id: "org_acme", name: "Acme", slug: "acme" } as never);
  vi.mocked(employees.createDepartment).mockResolvedValue({ id: "dept" } as never);
  vi.mocked(employees.createDesignation).mockResolvedValue({ id: "desig" } as never);
});

describe("platform — provisioning (FR-001, SC-002)", () => {
  it("creates the org and an ADMIN in it, returning the one-time password", async () => {
    vi.mocked(employees.createEmployee).mockResolvedValue({ id: "emp_ann", email: "ann@acme.test", temporaryPassword: "tmp" } as never);
    const r = await service.provisionOrganization(input, "sa_1");
    expect(employees.createEmployee).toHaveBeenCalledWith("org_acme", expect.objectContaining({ role: "ADMIN", departmentId: "dept" }), expect.objectContaining({ orgId: "org_acme" }));
    expect(r.admin).toEqual({ employeeId: "emp_ann", email: "ann@acme.test", temporaryPassword: "tmp" });
  });

  it("rolls the organization back if the first admin can't be created", async () => {
    vi.mocked(employees.createEmployee).mockRejectedValue(new Error("boom"));
    await expect(service.provisionOrganization(input, "sa_1")).rejects.toThrow("boom");
    expect(repo.deleteOrganization).toHaveBeenCalledWith("org_acme");
  });

  it("rejects a taken slug", async () => {
    vi.mocked(repo.createOrganization).mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" }));
    await expect(service.provisionOrganization(input, "sa_1")).rejects.toMatchObject({ code: "SLUG_TAKEN" });
  });
});

describe("platform — directory and sign-in", () => {
  it("reports suspension to auth (FR-007)", async () => {
    vi.mocked(repo.findOrganization).mockResolvedValueOnce({ status: "SUSPENDED" } as never).mockResolvedValueOnce({ status: "ACTIVE" } as never);
    expect(await service.organizationDirectory.isActive("o")).toBe(false);
    expect(await service.organizationDirectory.isActive("o")).toBe(true);
  });

  it("issues a platform token that verifies only as a platform token (FR-005)", async () => {
    vi.mocked(repo.findSuperAdminByEmail).mockResolvedValue({ id: "sa_1", email: "op@x.dev", passwordHash: await bcrypt.hash("operator-pass", 4), failedLoginAttempts: 0, lockedAt: null } as never);
    const { accessToken } = await service.platformLogin("op@x.dev", "operator-pass");
    expect(service.verifyPlatformToken(accessToken).sub).toBe("sa_1");
  });

  it("locks the operator account after repeated failures", async () => {
    vi.mocked(repo.findSuperAdminByEmail).mockResolvedValue({ id: "sa_1", passwordHash: await bcrypt.hash("right-pass", 4), failedLoginAttempts: 4, lockedAt: null } as never);
    await expect(service.platformLogin("op@x.dev", "wrong-pass")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(repo.recordSuperAdminFailure).toHaveBeenCalledWith("sa_1", true);
  });
});
