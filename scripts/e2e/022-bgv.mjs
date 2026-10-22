// specs/022-background-verification/quickstart.md, API side.
import { call, check, show, RUN } from "./lib.mjs";

export default async function ({ tok, me }) {
  const eng = (await call("GET", `/employees/${me.manager.employeeId}`, { token: tok.hr })).json.departmentId;
  const posting = (await call("POST", "/recruitment/postings", { token: tok.hr, body: { title: `BGV role ${RUN}`, departmentId: eng, openings: 3 } })).json;
  async function application(name) {
    const c = (await call("POST", "/recruitment/candidates", { token: tok.hr, body: { name, email: `${name.toLowerCase().replace(/\W/g, "")}.${RUN}@example.com`, resumeUrl: "https://files.example.com/cv.pdf" } })).json;
    const a = (await call("POST", "/recruitment/applications", { token: tok.hr, body: { candidateId: c.id, jobPostingId: posting.id } })).json;
    await call("PATCH", `/recruitment/applications/${a.id}/stage`, { token: tok.hr, body: { stage: "OFFER" } });
    return a;
  }
  const hire = (appId, token = tok.hr, justification) => call("PATCH", `/recruitment/applications/${appId}/stage`, { token, body: { stage: "HIRED", ...(justification ? { justification } : {}) } });

  // US1
  const a1 = await application("Clean Cara");
  const noCheck = await hire(a1.id);
  check("022 can't hire without a completed check (FR-005)", noCheck.status === 409 && noCheck.json.error?.code === "BACKGROUND_CHECK_INCOMPLETE", show(noCheck));
  const c1 = await call("POST", "/bgv/checks", { token: tok.hr, body: { applicationId: a1.id, items: ["Employment history", "Education"] } });
  check("022 HR initiates a check -> PENDING with items (FR-001)", c1.status === 201 && c1.json.status === "PENDING" && c1.json.items.length === 2, show(c1));
  const dupCheck = await call("POST", "/bgv/checks", { token: tok.hr, body: { applicationId: a1.id } });
  check("022 one check per application", dupCheck.status === 409, show(dupCheck));
  const mgrView = await call("GET", `/recruitment/applications/${a1.id}`, { token: tok.manager });
  const hrView = await call("GET", `/recruitment/applications/${a1.id}`, { token: tok.hr });
  check("022 status visible beside the stage; outcome HR-only (US1.3)", mgrView.json.backgroundCheck?.status === "PENDING" && !("overallOutcome" in mgrView.json.backgroundCheck) && hrView.json.backgroundCheck?.id === c1.json.id, `${show(mgrView)} | ${show(hrView)}`);
  const mgrDetail = await call("GET", `/bgv/checks/${c1.json.id}`, { token: tok.manager });
  check("022 check detail is HR/Admin only (FR-008, SC-004)", mgrDetail.status === 403, show(mgrDetail));

  // US2
  const [i1, i2] = c1.json.items;
  const r1 = await call("POST", `/bgv/items/${i1.id}/result`, { token: tok.hr, body: { result: "CLEARED", notes: "Confirmed with previous employer" } });
  check("022 one result recorded: check in progress (FR-002, SC-002)", r1.json.status === "IN_PROGRESS" && r1.json.overallOutcome === null, show(r1));
  const again = await call("POST", `/bgv/items/${i1.id}/result`, { token: tok.hr, body: { result: "FLAGGED" } });
  check("022 a recorded result is kept (history)", again.status === 409, show(again));
  const r2 = await call("POST", `/bgv/items/${i2.id}/result`, { token: tok.hr, body: { result: "UNABLE_TO_VERIFY", notes: "University did not respond" } });
  check("022 last result completes it; unable-to-verify shown, not a flag (FR-003)", r2.json.status === "COMPLETE" && r2.json.overallOutcome === "CLEARED" && r2.json.hasUnverified === true, show(r2));
  const added = await call("POST", `/bgv/checks/${c1.json.id}/items`, { token: tok.hr, body: { label: "Reference: former manager" } });
  check("022 adding an item reopens the check (FR-004)", added.json.status === "IN_PROGRESS" && added.json.items.length === 3, show(added));
  await call("POST", `/bgv/items/${added.json.items[2].id}/result`, { token: tok.hr, body: { result: "CLEARED" } });
  const ok = await hire(a1.id);
  check("022 clean completed check: hire needs no justification (FR-007)", ok.status === 200 && ok.json.stage === "HIRED", show(ok));

  // US3
  const a2 = await application("Flagged Finn");
  const c2 = (await call("POST", "/bgv/checks", { token: tok.hr, body: { applicationId: a2.id, items: ["Employment history"] } })).json;
  await call("POST", `/bgv/items/${c2.items[0].id}/result`, { token: tok.hr, body: { result: "FLAGGED", notes: "Dates don't match" } });
  const flaggedView = await call("GET", `/recruitment/applications/${a2.id}`, { token: tok.hr });
  check("022 flag visible on the application before a decision (US2.3)", flaggedView.json.backgroundCheck?.overallOutcome === "FLAGGED", show(flaggedView));
  const noJust = await hire(a2.id);
  check("022 flagged check: hire needs a justification (FR-006, SC-003)", noJust.status === 409 && noJust.json.error?.code === "JUSTIFICATION_REQUIRED", show(noJust));
  const mgrHire = await hire(a2.id, tok.manager, "Manager wants to override this one");
  check("022 only HR/Admin can override", mgrHire.status === 409, show(mgrHire));
  const just = await hire(a2.id, tok.hr, "Gap explained: contract work, verified by phone");
  const detail = await call("GET", `/bgv/checks/${c2.id}`, { token: tok.hr });
  check("022 hire with justification succeeds and the override is recorded", just.status === 200 && detail.json.overrides?.[0]?.kind === "FLAGGED_CHECK" && detail.json.items[0].notes === "Dates don't match", show(detail));

  const a3 = await application("Rejected Rae");
  const c3 = (await call("POST", "/bgv/checks", { token: tok.hr, body: { applicationId: a3.id, items: ["Identity"] } })).json;
  await call("POST", `/bgv/items/${c3.items[0].id}/result`, { token: tok.hr, body: { result: "FLAGGED" } });
  const rej = await call("PATCH", `/recruitment/applications/${a3.id}/stage`, { token: tok.hr, body: { stage: "REJECTED" } });
  const kept = await call("GET", `/bgv/applications/${a3.id}`, { token: tok.hr });
  check("022 rejecting keeps the flagged check as context (US3.3, FR-009)", rej.json.stage === "REJECTED" && kept.json.overallOutcome === "FLAGGED", show(kept));
}
