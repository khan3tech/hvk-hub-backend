// specs/006-notifications/quickstart.md, API side.
import { call, check, show, future, RUN } from "./lib.mjs";

const latest = async (token, type) =>
  (await call("GET", "/notifications", { token })).json.items?.find((n) => n.type === type);

export default async function ({ tok, me, hire }) {
  // US1 — leave filed -> manager; decided -> requester
  const mgr = await hire(`NotifMgr ${RUN}`, "MANAGER");
  const emp = await hire(`NotifEmp ${RUN}`, "EMPLOYEE", { managerId: mgr.id });
  const empty = await call("GET", "/notifications", { token: emp.token });
  check("006 empty center is a clean empty list (US2.3)", empty.status === 200 && Array.isArray(empty.json.items) && empty.json.unreadCount === 0, show(empty));

  const types = (await call("GET", "/leave-types", { token: emp.token })).json;
  const lr = await call("POST", "/leave-requests", { token: emp.token, body: { leaveTypeId: types[0].id, startDate: future(40), endDate: future(40) } });
  const pending = await latest(mgr.token, "LEAVE_PENDING_APPROVAL");
  check("006 manager notified of a direct report's leave (FR-002)", pending && pending.link.includes(lr.json.id), JSON.stringify(pending));

  await call("POST", `/leave-requests/${lr.json.id}/reject`, { token: mgr.token, body: { reason: "Release week" } });
  const decided = await latest(emp.token, "LEAVE_DECIDED");
  check("006 requester notified of rejection with reason (FR-001)", decided && decided.message.includes("Release week") && !decided.read, JSON.stringify(decided));

  // US2 — center
  const count = await call("GET", "/notifications/unread-count", { token: emp.token });
  check("006 unread count reflects new notification (FR-007)", count.json.unreadCount >= 1, show(count));
  const foreign = await call("POST", `/notifications/${decided.id}/read`, { token: mgr.token });
  check("006 cannot mark someone else's notification read", foreign.status === 404, show(foreign));
  const read = await call("POST", `/notifications/${decided.id}/read`, { token: emp.token });
  check("006 marking read lowers unread count", read.status === 200 && read.json.unreadCount === count.json.unreadCount - 1, show(read));

  // US3 — payroll + interviews
  const run = await call("POST", "/payroll/runs", { token: tok.hr, body: { periodMonth: 1, periodYear: 2031 } });
  const payroll = await latest(tok.hr, "PAYROLL_RUN_COMPLETED");
  check("006 HR who ran payroll gets a summary with skipped list (FR-003)", run.status === 200 && payroll?.message.includes(`${run.json.payslipCount} payslip`), JSON.stringify(payroll));

  const eng = (await call("GET", `/employees/${me.manager.employeeId}`, { token: tok.hr })).json.departmentId;
  const posting = (await call("POST", "/recruitment/postings", { token: tok.hr, body: { title: `Notif role ${RUN}`, departmentId: eng, openings: 1 } })).json;
  const cand = (await call("POST", "/recruitment/candidates", { token: tok.hr, body: { name: `NotifCand ${RUN}`, email: `nc.${RUN}@example.com`, resumeUrl: "https://files.example.com/x.pdf" } })).json;
  const app = (await call("POST", "/recruitment/applications", { token: tok.hr, body: { candidateId: cand.id, jobPostingId: posting.id } })).json;
  await call("PATCH", `/recruitment/applications/${app.id}/stage`, { token: tok.hr, body: { stage: "INTERVIEW" } });
  const round = (await call("POST", `/recruitment/applications/${app.id}/interviews`, { token: tok.hr, body: { interviewerId: emp.id, scheduledAt: "2026-12-02T09:30:00.000Z" } })).json;
  const sched = await latest(emp.token, "INTERVIEW_SCHEDULED");
  check("006 interviewer notified with candidate and time (FR-004)", sched?.message.includes(`NotifCand ${RUN}`) && sched.message.includes("2026-12-02 09:30"), JSON.stringify(sched));

  await call("POST", `/recruitment/interviews/${round.id}/result`, { token: emp.token, body: { result: "PASS" } });
  const hrResult = await latest(tok.hr, "INTERVIEW_RESULT_RECORDED");
  const mgrResult = await latest(tok.manager, "INTERVIEW_RESULT_RECORDED");
  check("006 HR notified of interview result (FR-005)", hrResult?.link.includes(app.id), JSON.stringify(hrResult));
  check("006 department Manager notified of interview result (FR-005)", mgrResult?.link.includes(app.id), JSON.stringify(mgrResult));

  // FR-009 — offboarded: still in-app, never emailed (email side covered by unit tests)
  const all = await call("POST", "/notifications/read-all", { token: emp.token });
  check("006 mark all read", all.json.unreadCount === 0, show(all));
}
