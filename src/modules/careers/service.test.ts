import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

process.env.JWT_ACCESS_SECRET ??= "test-access-secret";
process.env.BOT_POW_BITS = "8";
process.env.BOT_MIN_FILL_MS = "1000";

vi.mock("../auth/service.js", () => ({ resolveOrganizationSlug: vi.fn() }));
vi.mock("../branding/service.js", () => ({ getBranding: vi.fn() }));
vi.mock("../organizations/service.js", () => ({ organizationDirectory: { isActive: vi.fn() } }));
vi.mock("../employee/service.js", () => ({ listDepartments: vi.fn() }));
vi.mock("../recruitment/service.js", () => ({
  applyFromOutside: vi.fn(),
  findApplicationByReferenceHash: vi.fn(),
  findOrCreateCandidate: vi.fn(),
  findPosting: vi.fn(),
  listOpenPostings: vi.fn(),
  setCandidateResume: vi.fn(),
}));
vi.mock("../documents/service.js", () => ({ storeCandidateFile: vi.fn() }));

const auth = await import("../auth/service.js");
const orgs = await import("../organizations/service.js");
const recruitment = await import("../recruitment/service.js");
const documents = await import("../documents/service.js");
const bot = await import("../../lib/botcheck.js");
const service = await import("./service.js");

function solve(nonce: string, bits: number) {
  for (let i = 0; ; i++) {
    if (bot.leadingZeroBits(createHash("sha256").update(`${nonce}:${i}`).digest()) >= bits) return String(i);
  }
}
const pdf = { buffer: Buffer.from("%PDF-1.4"), mimetype: "application/pdf", originalname: "cv.pdf", size: 8 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.resolveOrganizationSlug).mockResolvedValue("org_1");
  vi.mocked(orgs.organizationDirectory.isActive).mockResolvedValue(true);
});

describe("bot check (020 FR-007)", () => {
  it("accepts a valid solved challenge once, after the fill time", () => {
    const c = bot.issueChallenge("careers-apply");
    const solution = solve(c.nonce, c.bits);
    expect(() => bot.verifyHumanCheck({ challenge: c.challenge, solution }, "careers-apply", Date.now())).toThrow(); // too fast
    const later = Date.now() + 1500;
    expect(() => bot.verifyHumanCheck({ challenge: c.challenge, solution }, "careers-apply", later)).not.toThrow();
    expect(() => bot.verifyHumanCheck({ challenge: c.challenge, solution }, "careers-apply", later)).toThrow(); // replay
  });

  it("rejects a filled honeypot, a wrong solution, or another purpose", () => {
    const c = bot.issueChallenge("careers-apply");
    const later = Date.now() + 1500;
    expect(() => bot.verifyHumanCheck({ challenge: c.challenge, solution: solve(c.nonce, c.bits), honeypot: "x" }, "careers-apply", later)).toThrow();
    expect(() => bot.verifyHumanCheck({ challenge: c.challenge, solution: "not-it" }, "careers-apply", later)).toThrow();
    expect(() => bot.verifyHumanCheck({ challenge: c.challenge, solution: solve(c.nonce, c.bits) }, "other", later)).toThrow();
  });
});

describe("careers — applying", () => {
  const solved = async () => {
    const c = bot.issueChallenge("careers-apply");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 1500);
    return { challenge: c.challenge, solution: solve(c.nonce, c.bits) };
  };

  it("refuses a role closed since the page loaded (FR-006)", async () => {
    vi.mocked(recruitment.findPosting).mockResolvedValue({ id: "p1", status: "CLOSED" } as never);
    await expect(service.apply("acme", "p1", { name: "Ann", email: "a@x.dev", ...(await solved()) }, pdf)).rejects.toMatchObject({ code: "POSTING_NOT_OPEN" });
    vi.useRealTimers();
    expect(recruitment.findOrCreateCandidate).not.toHaveBeenCalled();
  });

  it("rejects non-PDF/DOCX resumes (FR-011)", async () => {
    await expect(service.apply("acme", "p1", { name: "Ann", email: "a@x.dev", ...(await solved()) }, { ...pdf, mimetype: "image/png" })).rejects.toMatchObject({ status: 415 });
    vi.useRealTimers();
  });

  it("enters the pipeline as PUBLIC and returns a reference stored only as a hash (FR-004/008)", async () => {
    vi.mocked(recruitment.findPosting).mockResolvedValue({ id: "p1", status: "OPEN", title: "Engineer" } as never);
    vi.mocked(recruitment.findOrCreateCandidate).mockResolvedValue({ id: "c1" } as never);
    vi.mocked(recruitment.applyFromOutside).mockResolvedValue({ id: "a1" } as never);
    vi.mocked(documents.storeCandidateFile).mockResolvedValue({ id: "d1" } as never);
    const r = await service.apply("acme", "p1", { name: "Ann", email: "a@x.dev", ...(await solved()) }, pdf);
    vi.useRealTimers();
    expect(r.reference).toMatch(/^TL-[0-9A-F]{12}$/);
    const opts = vi.mocked(recruitment.applyFromOutside).mock.calls[0]![3];
    expect(opts.source).toBe("PUBLIC");
    expect(opts.publicReferenceHash).toBe(createHash("sha256").update(r.reference).digest("hex"));
    expect(recruitment.setCandidateResume).toHaveBeenCalledWith("org_1", "c1", "/api/documents/d1/download");
  });
});

describe("careers — status check (FR-008/009, SC-005)", () => {
  it("needs both email and reference to match; every miss is identical", async () => {
    vi.mocked(recruitment.findApplicationByReferenceHash).mockResolvedValue({ orgId: "org_1", stage: "REJECTED", candidate: { email: "a@x.dev" }, jobPosting: { title: "Engineer" }, createdAt: new Date() } as never);
    await expect(service.checkStatus("acme", "A@x.dev", "TL-1")).resolves.toMatchObject({ status: "Not selected", final: true });
    const wrongEmail = await service.checkStatus("acme", "b@x.dev", "TL-1").catch((e) => e);
    vi.mocked(recruitment.findApplicationByReferenceHash).mockResolvedValue(null);
    const unknownRef = await service.checkStatus("acme", "a@x.dev", "TL-2").catch((e) => e);
    expect(wrongEmail).toMatchObject({ code: "NO_MATCH", status: 404 });
    expect(unknownRef.message).toBe(wrongEmail.message);
  });

  it("an unknown or suspended organization has no careers page", async () => {
    vi.mocked(orgs.organizationDirectory.isActive).mockResolvedValue(false);
    await expect(service.listPostings("acme")).rejects.toMatchObject({ status: 404 });
  });
});
