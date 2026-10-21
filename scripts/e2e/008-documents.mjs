// specs/008-document-esignature/quickstart.md, API side.
import { call, check, show, upload, download, PDF, RUN } from "./lib.mjs";

export default async function ({ tok, hire }) {
  const mgr = await hire(`DocMgr ${RUN}`, "MANAGER");
  const emp = await hire(`DocEmp ${RUN}`, "EMPLOYEE", { managerId: mgr.id });
  const stranger = await hire(`DocStranger ${RUN}`);

  // US1 — storage, versions, visibility
  const v1 = await upload(`/documents/employees/${emp.id}`, { token: tok.hr, fields: { label: "PAN card" }, file: PDF("pan-v1") });
  check("008 HR uploads a labeled document (FR-001)", v1.status === 201 && v1.json.version === 1 && !("fileUrl" in v1.json), show(v1));
  const v2 = await upload(`/documents/employees/${emp.id}`, { token: tok.hr, fields: { label: "PAN card" }, file: PDF("pan-v2") });
  check("008 same label -> v2 current", v2.json.version === 2 && v2.json.isCurrent, show(v2));
  const hist = await call("GET", `/documents/employees/${emp.id}?history=true`, { token: emp.token });
  check("008 both versions retrievable, newest current (FR-004)", hist.json.filter?.((d) => d.label === "PAN card").length === 2 && hist.json.find((d) => d.version === 1)?.isCurrent === false, show(hist));
  const own = await download(`/documents/${v2.json.id}/download`, emp.token);
  check("008 employee downloads own document (FR-002)", own.status === 200 && own.body.toString().includes("pan-v2"), `${own.status}`);
  const empUpload = await upload(`/documents/employees/${stranger.id}`, { token: emp.token, fields: { label: "x" }, file: PDF() });
  check("008 employee cannot upload for someone else", empUpload.status === 403, show(empUpload));
  const mgrId = await download(`/documents/${v2.json.id}/download`, mgr.token);
  check("008 manager can't open a report's personal ID (FR-003, SC-005)", mgrId.status === 403, `${mgrId.status}`);
  const shared = await upload(`/documents/employees/${emp.id}`, { token: tok.hr, fields: { label: "Appraisal letter", managerVisible: "true" }, file: PDF("appraisal") });
  const mgrList = await call("GET", `/documents/employees/${emp.id}`, { token: mgr.token });
  check("008 manager sees only manager-visible documents", mgrList.json.length === 1 && mgrList.json[0].id === shared.json.id, show(mgrList));
  const strangerList = await call("GET", `/documents/employees/${emp.id}`, { token: stranger.token });
  check("008 unrelated employee refused", strangerList.status === 403, show(strangerList));
  const bad = await upload(`/documents/employees/${emp.id}`, { token: tok.hr, fields: { label: "Script" }, file: { bytes: Buffer.from("MZ\x90\x00"), name: "a.exe", type: "application/x-msdownload" } });
  check("008 unsupported type rejected with specific error (FR-012)", bad.status === 415 && bad.json.error?.code === "UNSUPPORTED_FILE_TYPE", show(bad));
  const fake = await upload(`/documents/employees/${emp.id}`, { token: tok.hr, fields: { label: "Fake" }, file: { bytes: Buffer.from("not a pdf"), name: "f.pdf", type: "application/pdf" } });
  check("008 content/type mismatch rejected", fake.status === 415, show(fake));
  const big = await upload(`/documents/employees/${emp.id}`, { token: tok.hr, fields: { label: "Huge" }, file: { bytes: Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(11 * 1024 * 1024)]), name: "big.pdf", type: "application/pdf" } });
  check("008 oversized file rejected (FR-012)", big.status === 413 && big.json.error?.code === "FILE_TOO_LARGE", show(big));

  // US2 — employee signing
  const contract = await upload(`/documents/employees/${emp.id}`, { token: tok.hr, fields: { label: "Employment contract" }, file: PDF("contract") });
  const req = await call("POST", `/documents/${contract.json.id}/signature-requests`, { token: tok.hr, body: { recipientEmployeeId: emp.id } });
  check("008 HR sends for signature -> AWAITING (FR-005/008)", req.status === 201 && req.json.status === "AWAITING" && req.json.actionable, show(req));
  const inbox = await call("GET", "/documents/signatures", { token: emp.token });
  check("008 recipient sees awaiting request", inbox.json.some?.((r) => r.id === req.json.id && r.status === "AWAITING"), show(inbox));
  const notif = (await call("GET", "/notifications", { token: emp.token })).json.items.find((n) => n.type === "SIGNATURE_REQUESTED");
  check("008 recipient notified", notif?.link.includes(req.json.id), JSON.stringify(notif));
  const wrong = await call("POST", `/documents/signatures/${req.json.id}/sign`, { token: stranger.token, body: { fullName: "Not Me" } });
  check("008 non-recipient cannot sign", wrong.status === 404, show(wrong));
  const signed = await call("POST", `/documents/signatures/${req.json.id}/sign`, { token: emp.token, body: { fullName: `DocEmp ${RUN}` } });
  check("008 recipient signs: who + when recorded (FR-006)", signed.status === 200 && signed.json.status === "SIGNED" && signed.json.signedAt && signed.json.signedByName === `DocEmp ${RUN}`, show(signed));
  const resign = await call("POST", `/documents/signatures/${req.json.id}/sign`, { token: emp.token, body: { fullName: "Again" } });
  check("008 signed is immutable (FR-007, SC-002)", resign.status === 409 && resign.json.error?.code === "ALREADY_SIGNED", show(resign));
  const hrView = await call("GET", `/documents/signatures/${req.json.id}`, { token: tok.hr });
  check("008 sender sees SIGNED status", hrView.json.status === "SIGNED", show(hrView));

  // US2.4 — candidate offer letter through the private link
  const cand = (await call("POST", "/recruitment/candidates", { token: tok.hr, body: { name: `DocCand ${RUN}`, email: `dc.${RUN}@example.com`, resumeUrl: "https://files.example.com/r.pdf" } })).json;
  const dept = (await call("GET", "/departments", { token: tok.hr })).json[0].id;
  const posting = (await call("POST", "/recruitment/postings", { token: tok.hr, body: { title: `Offer role ${RUN}`, departmentId: dept, openings: 1 } })).json;
  const app = (await call("POST", "/recruitment/applications", { token: tok.hr, body: { candidateId: cand.id, jobPostingId: posting.id } })).json;
  const offer = await upload(`/documents/candidates/${cand.id}`, { token: tok.hr, fields: { label: "Offer letter" }, file: PDF("offer") });
  const offerReq = await call("POST", `/documents/${offer.json.id}/signature-requests`, { token: tok.hr, body: { recipientCandidateId: cand.id, applicationId: app.id } });
  check("008 candidate request returns a private signing link", offerReq.status === 201 && /\/sign\/[\w-]{20,}$/.test(offerReq.json.signingUrl ?? ""), show(offerReq));
  const token = offerReq.json.signingUrl.split("/sign/")[1];
  const view = await call("GET", `/public/signatures/${token}`);
  check("008 candidate opens link without login", view.status === 200 && view.json.status === "AWAITING" && view.json.document.label === "Offer letter", show(view));
  const file = await download(`/public/signatures/${token}/download`);
  check("008 candidate downloads the offer", file.status === 200 && file.body.toString().includes("offer"), `${file.status}`);
  const cSigned = await call("POST", `/public/signatures/${token}/sign`, { body: { fullName: `DocCand ${RUN}` } });
  check("008 candidate signs via link", cSigned.status === 200 && cSigned.json.status === "SIGNED", show(cSigned));
  const onApp = await call("GET", `/documents/signatures?applicationId=${app.id}`, { token: tok.hr });
  check("008 signed offer attached to the application (US2.4)", onApp.json.length === 1 && onApp.json[0].status === "SIGNED", show(onApp));
  const badToken = await call("GET", "/public/signatures/not-a-real-token-value-000000000000");
  check("008 bogus link -> 404", badToken.status === 404, show(badToken));

  // US3 — policies
  const pol = await upload("/policies", { token: tok.hr, fields: { title: `Code of conduct ${RUN}` }, file: PDF("conduct") });
  check("008 HR publishes a policy (FR-009)", pol.status === 201 && pol.json.documentId, show(pol));
  const mine = await call("GET", "/policies", { token: emp.token });
  check("008 employee sees it pending", mine.json.find?.((p) => p.id === pol.json.id)?.myAcknowledgedAt === null, show(mine));
  const polFile = await download(`/documents/${pol.json.documentId}/download`, stranger.token);
  check("008 any employee can read the policy file", polFile.status === 200, `${polFile.status}`);
  const ack = await call("POST", `/policies/${pol.json.id}/acknowledge`, { token: emp.token });
  const ack2 = await call("POST", `/policies/${pol.json.id}/acknowledge`, { token: emp.token });
  check("008 one-action acknowledgment, idempotent (FR-010)", ack.status === 200 && ack2.json.acknowledgedAt === ack.json.acknowledgedAt, show(ack2));
  const late = await hire(`DocLate ${RUN}`);
  const status = await call("GET", `/policies/${pol.json.id}/status`, { token: tok.hr });
  check("008 HR sees acknowledged vs pending incl. later joiner (FR-011, SC-004)", status.json.acknowledged.some((a) => a.employeeId === emp.id) && status.json.pending.some((p) => p.employeeId === late.id) && status.json.acknowledgedCount + status.json.pendingCount >= 4, show(status));
  const empStatus = await call("GET", `/policies/${pol.json.id}/status`, { token: emp.token });
  check("008 policy tracking is HR/Admin only", empStatus.status === 403, show(empStatus));
}
