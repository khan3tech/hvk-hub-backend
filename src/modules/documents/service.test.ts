import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";

vi.mock("./repository.js", () => ({
  createDocumentVersion: vi.fn(),
  listDocuments: vi.fn(),
  findDocument: vi.fn(),
  isPolicyDocument: vi.fn(),
  createSignatureRequest: vi.fn(),
  findSignatureRequest: vi.fn(),
  findSignatureRequestByTokenHash: vi.fn(),
  listSignatureRequests: vi.fn(),
  markSigned: vi.fn(),
  createPolicy: vi.fn(),
  findPolicy: vi.fn(),
  listPolicies: vi.fn(),
  listAcknowledgments: vi.fn(),
  createAcknowledgment: vi.fn(),
  findAcknowledgment: vi.fn(),
  writeActivityLog: vi.fn(),
}));
vi.mock("../employee/service.js", () => ({ getEmployeeSummary: vi.fn(), listActiveEmployeeSummaries: vi.fn() }));
vi.mock("../recruitment/service.js", () => ({ getApplicationSummary: vi.fn(), getCandidate: vi.fn() }));
vi.mock("../notifications/service.js", () => ({ notifyEmployees: vi.fn() }));

const repo = await import("./repository.js");
const employees = await import("../employee/service.js");
const recruitment = await import("../recruitment/service.js");
const { setStorage } = await import("../../lib/storage.js");
const { setEmailSender } = await import("../../lib/email.js");
const { assertAcceptedFile } = await import("../../middleware/upload.js");
const service = await import("./service.js");

const ORG = "org_1";
const HR = { sub: "u_hr", role: "HR" as const, employeeId: "emp_hr" };
const OWNER = { sub: "u_e", role: "EMPLOYEE" as const, employeeId: "emp_1" };
const MGR = { sub: "u_m", role: "MANAGER" as const, employeeId: "emp_mgr" };
const OTHER_MGR = { sub: "u_m2", role: "MANAGER" as const, employeeId: "emp_mgr2" };

const doc = (o: Record<string, unknown> = {}) =>
  ({ id: "doc_1", orgId: ORG, ownerType: "EMPLOYEE", employeeId: "emp_1", candidateId: null, label: "PAN card", fileUrl: "documents/k", version: 1, isCurrent: true, managerVisible: false, contentType: "application/pdf", originalName: "pan.pdf", ...o }) as never;
const sig = (o: Record<string, unknown> = {}) =>
  ({ id: "sig_1", orgId: ORG, documentId: "doc_1", recipientType: "EMPLOYEE", recipientEmployeeId: "emp_1", recipientCandidateId: null, applicationId: null, status: "AWAITING", accessTokenHash: null, document: doc(), ...o }) as never;
const employee = (o: Record<string, unknown> = {}) =>
  ({ id: "emp_1", name: "E", email: "e@x.dev", status: "ACTIVE", departmentId: "d", managerId: "emp_mgr", ...o }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  setStorage({ put: vi.fn().mockResolvedValue("documents/k"), open: vi.fn().mockResolvedValue(Readable.from(["x"])) });
  setEmailSender({ send: vi.fn() });
  vi.mocked(employees.getEmployeeSummary).mockResolvedValue(employee());
  vi.mocked(repo.listSignatureRequests).mockResolvedValue([]);
  vi.mocked(repo.isPolicyDocument).mockResolvedValue(false);
});

describe("documents — upload validation (FR-012)", () => {
  it("accepts a real PDF and rejects a mislabeled or unsupported file", () => {
    expect(() => assertAcceptedFile({ mimetype: "application/pdf", buffer: Buffer.from("%PDF-1.7 ...") })).not.toThrow();
    expect(() => assertAcceptedFile({ mimetype: "application/pdf", buffer: Buffer.from("MZ\x90\x00") })).toThrow(/don't match/);
    expect(() => assertAcceptedFile({ mimetype: "application/x-msdownload", buffer: Buffer.from("MZ") })).toThrow(/Unsupported/);
    expect(() => assertAcceptedFile(undefined)).toThrow(/Attach a file/);
  });
});

describe("documents — visibility (FR-002/003, SC-005)", () => {
  it("owner and HR see everything; the direct manager only manager-visible", async () => {
    vi.mocked(repo.listDocuments).mockResolvedValue([]);
    await service.listEmployeeDocuments(ORG, "emp_1", OWNER);
    expect(repo.listDocuments).toHaveBeenLastCalledWith(ORG, expect.anything(), { history: false, managerVisibleOnly: false });
    await service.listEmployeeDocuments(ORG, "emp_1", MGR);
    expect(repo.listDocuments).toHaveBeenLastCalledWith(ORG, expect.anything(), { history: false, managerVisibleOnly: true });
    await expect(service.listEmployeeDocuments(ORG, "emp_1", OTHER_MGR)).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a manager downloading a direct report's personal ID document", async () => {
    vi.mocked(repo.findDocument).mockResolvedValue(doc());
    await expect(service.openDocument(ORG, "doc_1", MGR)).rejects.toMatchObject({ status: 403 });
    vi.mocked(repo.findDocument).mockResolvedValue(doc({ managerVisible: true }));
    await expect(service.openDocument(ORG, "doc_1", MGR)).resolves.toBeTruthy();
  });

  it("never returns the internal storage key", async () => {
    vi.mocked(repo.listDocuments).mockResolvedValue([doc()]);
    const [d] = await service.listEmployeeDocuments(ORG, "emp_1", HR);
    expect(d).not.toHaveProperty("fileUrl");
  });
});

describe("documents — signatures (US2)", () => {
  it("records the signer and refuses a second signature (FR-006/007, SC-002)", async () => {
    vi.mocked(repo.findSignatureRequest).mockResolvedValueOnce(sig()).mockResolvedValueOnce(sig({ status: "SIGNED" }));
    vi.mocked(repo.markSigned).mockResolvedValue({ count: 1 });
    await service.signAsEmployee(ORG, "sig_1", "Emp One", OWNER);
    expect(repo.markSigned).toHaveBeenCalledWith("sig_1", { signedByName: "Emp One", signedByUserId: "u_e" });

    vi.mocked(repo.findSignatureRequest).mockResolvedValue(sig({ status: "SIGNED" }));
    await expect(service.signAsEmployee(ORG, "sig_1", "Emp One", OWNER)).rejects.toMatchObject({ code: "ALREADY_SIGNED" });
  });

  it("loses a signing race cleanly (concurrent edge case)", async () => {
    vi.mocked(repo.findSignatureRequest).mockResolvedValue(sig());
    vi.mocked(repo.markSigned).mockResolvedValue({ count: 0 });
    await expect(service.signAsEmployee(ORG, "sig_1", "Emp One", OWNER)).rejects.toMatchObject({ code: "ALREADY_SIGNED" });
  });

  it("only the designated recipient can sign", async () => {
    vi.mocked(repo.findSignatureRequest).mockResolvedValue(sig({ recipientEmployeeId: "emp_other" }));
    await expect(service.signAsEmployee(ORG, "sig_1", "X", OWNER)).rejects.toMatchObject({ status: 404 });
  });

  it("blocks signing once the recipient is offboarded (edge case)", async () => {
    vi.mocked(repo.findSignatureRequest).mockResolvedValue(sig());
    vi.mocked(employees.getEmployeeSummary).mockResolvedValue(employee({ status: "OFFBOARDED" }));
    await expect(service.signAsEmployee(ORG, "sig_1", "X", OWNER)).rejects.toMatchObject({ code: "NOT_ACTIONABLE" });
  });

  it("gives a candidate a private link and stores only its hash", async () => {
    vi.mocked(repo.findDocument).mockResolvedValue(doc({ ownerType: "CANDIDATE", employeeId: null, candidateId: "cand_1" }));
    vi.mocked(recruitment.getCandidate).mockResolvedValue({ id: "cand_1", name: "C", email: "c@x.dev" } as never);
    vi.mocked(repo.createSignatureRequest).mockImplementation(((data: object) => Promise.resolve({ ...data, id: "sig_2", status: "AWAITING" })) as never);

    const created = await service.requestSignature(ORG, "doc_1", { recipientCandidateId: "cand_1" }, HR);

    const token = (created as { signingUrl: string }).signingUrl.split("/sign/")[1]!;
    const stored = vi.mocked(repo.createSignatureRequest).mock.calls[0]![0] as { accessTokenHash: string };
    expect(stored.accessTokenHash).toHaveLength(64);
    expect(stored.accessTokenHash).not.toContain(token);
    expect(created).not.toHaveProperty("accessTokenHash");
  });
});

describe("documents — policies (US3)", () => {
  it("counts acknowledged vs pending over current active employees, incl. later joiners (FR-011)", async () => {
    vi.mocked(repo.findPolicy).mockResolvedValue({ id: "pol_1" } as never);
    vi.mocked(employees.listActiveEmployeeSummaries).mockResolvedValue([
      { id: "emp_1", name: "A" },
      { id: "emp_2", name: "B" },
      { id: "emp_new", name: "Joined later" },
    ] as never);
    vi.mocked(repo.listAcknowledgments).mockResolvedValue([
      { employeeId: "emp_1", acknowledgedAt: new Date() },
      { employeeId: "emp_gone", acknowledgedAt: new Date() },
    ] as never);

    const status = await service.policyStatus(ORG, "pol_1");

    expect(status).toMatchObject({ acknowledgedCount: 1, pendingCount: 2 });
    expect(status.pending.map((p) => p.employeeId)).toContain("emp_new");
  });
});
