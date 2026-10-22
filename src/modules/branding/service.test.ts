import { Readable } from "node:stream";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./repository.js", () => ({ findBranding: vi.fn(), upsertBranding: vi.fn(), deleteBranding: vi.fn() }));
vi.mock("../organizations/service.js", () => ({
  getOrganizationIdentity: vi.fn(),
  organizationDirectory: { idForSlug: vi.fn(), isActive: vi.fn() },
}));
const storage = { put: vi.fn(), open: vi.fn(), remove: vi.fn() };
vi.mock("../../lib/storage.js", () => ({ getStorage: () => storage }));

const repo = await import("./repository.js");
const orgs = await import("../organizations/service.js");
const service = await import("./service.js");

const ORG = "org_1";
const ADMIN = { sub: "u_a", role: "ADMIN" as const, employeeId: "emp_a" };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(orgs.getOrganizationIdentity).mockResolvedValue({ id: ORG, name: "Acme", slug: "acme", status: "ACTIVE" } as never);
  vi.mocked(repo.findBranding).mockResolvedValue(null);
});

describe("branding — contrast (FR-009, SC-004)", () => {
  it("computes WCAG contrast against white", () => {
    expect(service.contrastWithWhite("#000000")).toBe(21);
    expect(service.contrastWithWhite("#FFFFFF")).toBe(1);
    expect(service.contrastWithWhite("#4F46E5")).toBeGreaterThan(4.5);
  });

  it("rejects below 3:1, warns below 4.5:1, accepts above", async () => {
    await expect(service.setPrimaryColor(ORG, "#FFEB3B", ADMIN)).rejects.toMatchObject({ code: "LOW_CONTRAST" });
    expect(repo.upsertBranding).not.toHaveBeenCalled();
    const warned = await service.setPrimaryColor(ORG, "#E0662F", ADMIN); // ~3.5:1
    expect(warned.warnings).toHaveLength(1);
    const fine = await service.setPrimaryColor(ORG, "#1E3A8A", ADMIN);
    expect(fine.warnings).toEqual([]);
  });
});

describe("branding — defaults (FR-005)", () => {
  it("falls back to TeamLoom's look", async () => {
    const b = await service.getBranding(ORG);
    expect(b).toMatchObject({ organizationName: "Acme", primaryColor: service.DEFAULT_BRANDING.primaryColor, logoUrl: null, isDefault: true });
  });
});

describe("branding — logo (FR-001, FR-008)", () => {
  it("rejects SVG, mismatched bytes and oversized files before storing", async () => {
    await expect(service.setLogo(ORG, { buffer: Buffer.from("<svg/>"), mimetype: "image/svg+xml", size: 6 }, ADMIN)).rejects.toMatchObject({ status: 415 });
    await expect(service.setLogo(ORG, { buffer: Buffer.from("nope"), mimetype: "image/png", size: 4 }, ADMIN)).rejects.toMatchObject({ status: 415 });
    await expect(service.setLogo(ORG, { buffer: PNG, mimetype: "image/png", size: service.LOGO_MAX_BYTES + 1 }, ADMIN)).rejects.toMatchObject({ status: 413 });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("stores the new logo, removes the old one, never exposes the key", async () => {
    vi.mocked(repo.findBranding).mockResolvedValueOnce({ logoUrl: "branding/old" } as never)
      .mockResolvedValue({ logoUrl: "branding/new", logoUpdatedAt: new Date(5) } as never);
    storage.put.mockResolvedValue("branding/new");
    const out = await service.setLogo(ORG, { buffer: PNG, mimetype: "image/png", size: PNG.length }, ADMIN);
    expect(storage.remove).toHaveBeenCalledWith("branding/old");
    expect(out.logoUrl).toBe("/api/public/branding/acme/logo?v=5");
    expect(JSON.stringify(out)).not.toContain("branding/new");
  });
});

describe("branding — public and server-rendered surfaces (FR-004, FR-006)", () => {
  it("resolves only active organizations by slug", async () => {
    vi.mocked(orgs.organizationDirectory.idForSlug).mockResolvedValue(ORG);
    vi.mocked(orgs.organizationDirectory.isActive).mockResolvedValue(false);
    await expect(service.getPublicBranding("acme")).rejects.toMatchObject({ status: 404 });
  });

  it("hands payslips the logo bytes", async () => {
    vi.mocked(repo.findBranding).mockResolvedValue({ logoUrl: "k", primaryColor: "#1E3A8A" } as never);
    storage.open.mockResolvedValue(Readable.from([PNG]));
    const a = await service.brandingAssets(ORG);
    expect(a).toMatchObject({ organizationName: "Acme", primaryColor: "#1E3A8A" });
    expect(a.logo?.equals(PNG)).toBe(true);
  });
});

describe("branding — removal (FR-010)", () => {
  it("deletes the stored logo and the row", async () => {
    vi.mocked(repo.findBranding).mockResolvedValue({ logoUrl: "k" } as never);
    await service.clearBranding(ORG);
    expect(storage.remove).toHaveBeenCalledWith("k");
    expect(repo.deleteBranding).toHaveBeenCalledWith(ORG);
  });
});
