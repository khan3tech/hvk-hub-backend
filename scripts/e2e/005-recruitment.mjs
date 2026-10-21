// specs/005-recruitment-ats/quickstart.md, API side.
import { call, check, show, RUN } from "./lib.mjs";

export default async function ({ tok, me, hire, department }) {
  const eng = (await call("GET", `/employees/${me.manager.employeeId}`, { token: tok.hr })).json.departmentId;
  const sales = await department(`Sales ${RUN}`);

  // US1 — postings
  const p = await call("POST", "/recruitment/postings", { token: tok.hr, body: { title: `Backend Engineer ${RUN}`, departmentId: eng, openings: 2 } });
  check("005 HR creates posting -> OPEN", p.status === 201 && p.json.status === "OPEN", show(p));
  const salesPosting = (await call("POST", "/recruitment/postings", { token: tok.hr, body: { title: `AE ${RUN}`, departmentId: sales.id, openings: 1 } })).json;
  const mgrCreate = await call("POST", "/recruitment/postings", { token: tok.manager, body: { title: "x", departmentId: eng, openings: 1 } });
  check("005 Manager cannot create posting", mgrCreate.status === 403, show(mgrCreate));
  const empList = await call("GET", "/recruitment/postings", { token: tok.employee });
  check("005 Employee sees open postings", empList.status === 200 && empList.json.some((x) => x.id === p.json.id), show(empList));

  // US2 — candidates + applications
  const c = await call("POST", "/recruitment/candidates", { token: tok.hr, body: { name: `Cand ${RUN}`, email: `cand.${RUN}@example.com`, resumeUrl: "https://files.example.com/cv.pdf" } });
  check("005 HR adds candidate", c.status === 201, show(c));
  const found = await call("GET", `/recruitment/candidates?q=${RUN}`, { token: tok.hr });
  check("005 candidate searchable", found.json.some?.((x) => x.id === c.json.id), show(found));
  const a = await call("POST", "/recruitment/applications", { token: tok.hr, body: { candidateId: c.json.id, jobPostingId: p.json.id } });
  check("005 application starts at APPLIED", a.status === 201 && a.json.stage === "APPLIED", show(a));
  const dup = await call("POST", "/recruitment/applications", { token: tok.hr, body: { candidateId: c.json.id, jobPostingId: p.json.id } });
  check("005 duplicate application -> 409", dup.status === 409 && dup.json.error?.code === "DUPLICATE_APPLICATION", show(dup));
  const a2 = await call("POST", "/recruitment/applications", { token: tok.hr, body: { candidateId: c.json.id, jobPostingId: salesPosting.id } });
  check("005 same candidate on second posting tracked separately", a2.status === 201 && a2.json.id !== a.json.id, show(a2));

  // US3 — pipeline
  const mgrMove = await call("PATCH", `/recruitment/applications/${a.json.id}/stage`, { token: tok.manager, body: { stage: "SCREEN" } });
  check("005 department Manager moves stage", mgrMove.status === 200 && mgrMove.json.stage === "SCREEN", show(mgrMove));
  const mgrOther = await call("PATCH", `/recruitment/applications/${a2.json.id}/stage`, { token: tok.manager, body: { stage: "SCREEN" } });
  check("005 Manager refused outside own department", mgrOther.status === 403, show(mgrOther));
  const mgrPipe = await call("GET", `/recruitment/postings/${salesPosting.id}/applications`, { token: tok.manager });
  check("005 Manager can't view other department pipeline", mgrPipe.status === 403, show(mgrPipe));
  const toInterview = await call("PATCH", `/recruitment/applications/${a.json.id}/stage`, { token: tok.hr, body: { stage: "INTERVIEW" } });
  check("005 HR moves to INTERVIEW", toInterview.json.stage === "INTERVIEW", show(toInterview));

  // US4 — interviews
  const interviewer = await hire(`Interviewer ${RUN}`, "EMPLOYEE", { departmentId: eng });
  const r = await call("POST", `/recruitment/applications/${a.json.id}/interviews`, { token: tok.hr, body: { interviewerId: interviewer.id, scheduledAt: "2026-12-01T10:00:00.000Z" } });
  check("005 HR schedules interview", r.status === 201 && r.json.result === "PENDING", show(r));
  const mine = await call("GET", "/recruitment/interviews/me", { token: interviewer.token });
  check("005 interviewer sees assigned round", mine.json.some?.((x) => x.id === r.json.id), show(mine));
  const wrong = await call("POST", `/recruitment/interviews/${r.json.id}/result`, { token: tok.employee, body: { result: "PASS" } });
  check("005 non-assigned employee cannot record result", wrong.status === 403, show(wrong));
  const ok = await call("POST", `/recruitment/interviews/${r.json.id}/result`, { token: interviewer.token, body: { result: "PASS", feedback: "Strong systems design" } });
  check("005 assigned interviewer records result", ok.status === 200 && ok.json.result === "PASS", show(ok));
  const detail = await call("GET", `/recruitment/applications/${a.json.id}`, { token: tok.manager });
  check("005 Manager sees rounds + results on application", detail.status === 200 && detail.json.interviewRounds?.[0]?.feedback === "Strong systems design", show(detail));

  // Terminal + closed posting edge cases
  const hired = await call("PATCH", `/recruitment/applications/${a.json.id}/stage`, { token: tok.hr, body: { stage: "HIRED" } });
  check("005 HIRED is terminal", hired.json.isTerminal === true, show(hired));
  const mgrAfter = await call("PATCH", `/recruitment/applications/${a.json.id}/stage`, { token: tok.manager, body: { stage: "OFFER" } });
  check("005 Manager can't move a final application", mgrAfter.status === 409, show(mgrAfter));
  await call("PATCH", `/recruitment/postings/${p.json.id}`, { token: tok.hr, body: { status: "CLOSED" } });
  const c2 = (await call("POST", "/recruitment/candidates", { token: tok.hr, body: { name: `Late ${RUN}`, email: `late.${RUN}@example.com`, resumeUrl: "https://files.example.com/cv2.pdf" } })).json;
  const late = await call("POST", "/recruitment/applications", { token: tok.hr, body: { candidateId: c2.id, jobPostingId: p.json.id } });
  check("005 closed posting refuses new applications", late.status === 409 && late.json.error?.code === "POSTING_NOT_OPEN", show(late));
  const stillVisible = await call("GET", `/recruitment/postings/${p.json.id}/applications`, { token: tok.hr });
  check("005 closed posting's applications stay visible", stillVisible.json.some?.((x) => x.id === a.json.id), show(stillVisible));
}
