// specs/017-hr-helpdesk-ticketing/quickstart.md, API side.
import { call, check, show, RUN } from "./lib.mjs";

export default async function ({ tok, me, hire }) {
  const emp = await hire(`Desk ${RUN}`);
  const cats = await call("GET", "/helpdesk/categories", { token: emp.token });
  check("017 default categories available (FR-002)", ["Payroll", "Leave", "Personal details", "General"].every((n) => cats.json.some?.((c) => c.name === n)), show(cats));
  const payroll = cats.json.find((c) => c.name === "Payroll");

  // US1
  const t = await call("POST", "/helpdesk/tickets", { token: emp.token, body: { categoryId: payroll.id, subject: `Allowance ${RUN}`, description: "My special allowance is missing" } });
  check("017 employee raises a ticket -> OPEN, unassigned (FR-001)", t.status === 201 && t.json.status === "OPEN" && t.json.unassigned, show(t));
  const q = await call("GET", "/helpdesk/tickets", { token: tok.hr });
  check("017 ticket is in HR's queue", q.json.some?.((x) => x.id === t.json.id), show(q));
  const peek = await call("GET", `/helpdesk/tickets/${t.json.id}`, { token: tok.manager });
  check("017 others can't see the ticket (FR-007/008)", peek.status === 404, show(peek));
  const mgrQueue = await call("GET", "/helpdesk/tickets", { token: tok.manager });
  check("017 queue is HR/Admin only", mgrQueue.status === 403, show(mgrQueue));

  // US2
  const bad = await call("POST", `/helpdesk/tickets/${t.json.id}/assign`, { token: tok.hr, body: { assigneeId: emp.id } });
  check("017 can't assign to a non-HR employee", bad.status === 400, show(bad));
  const a = await call("POST", `/helpdesk/tickets/${t.json.id}/assign`, { token: tok.hr, body: { assigneeId: me.hr.employeeId } });
  check("017 HR assigns to self (FR-004)", a.json.status === "ASSIGNED" && a.json.assigneeId === me.hr.employeeId, show(a));
  await call("POST", `/helpdesk/tickets/${t.json.id}/replies`, { token: tok.hr, body: { message: "Fixed in next payroll." } });
  const seen = await call("GET", `/helpdesk/tickets/${t.json.id}`, { token: emp.token });
  check("017 employee sees HR's reply (FR-005)", seen.json.replies?.some((r) => r.fromHr && r.message === "Fixed in next payroll."), show(seen));
  const notif = (await call("GET", "/notifications", { token: emp.token })).json.items.find((n) => n.type === "TICKET_UPDATED");
  check("017 employee notified of the reply", notif?.link.includes(t.json.id), JSON.stringify(notif));
  const res = await call("POST", `/helpdesk/tickets/${t.json.id}/resolve`, { token: tok.hr });
  const active = await call("GET", "/helpdesk/tickets", { token: tok.hr });
  check("017 resolved leaves the active queue (FR-006)", res.json.status === "RESOLVED" && !active.json.some((x) => x.id === t.json.id), show(res));
  const hrReopen = await call("POST", `/helpdesk/tickets/${t.json.id}/reopen`, { token: tok.hr });
  const reopen = await call("POST", `/helpdesk/tickets/${t.json.id}/reopen`, { token: emp.token });
  check("017 only the requester reopens", hrReopen.status === 403 && reopen.json.status === "REOPENED", show(reopen));
  await call("POST", `/helpdesk/tickets/${t.json.id}/resolve`, { token: tok.hr });

  // US3
  const sum = await call("GET", "/helpdesk/summary", { token: tok.hr });
  const row = sum.json.categories?.find((c) => c.categoryId === payroll.id);
  check("017 summary gives counts and average resolution time (FR-010)", row && row.resolved >= 1 && typeof row.averageResolutionHours === "number", show(sum));
  const set = await call("PUT", "/helpdesk/settings", { token: tok.hr, body: { overdueHours: 1 } });
  check("017 HR configures the overdue threshold", set.json.overdueHours === 1, show(set));
  await call("PUT", "/helpdesk/settings", { token: tok.hr, body: { overdueHours: 48 } });
}
