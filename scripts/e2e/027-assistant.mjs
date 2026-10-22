// specs/027-hr-assistant-chatbot/quickstart.md, API side. Its own organization keeps the
// overview counts and knowledge articles exact.
import { call, check, show, login, upload, PDF, platformToken, RUN } from "./lib.mjs";

export default async function () {
  const pt = await platformToken();
  const prov = await call("POST", "/platform/organizations", { token: pt, body: { name: `Assist ${RUN}`, slug: `assist-${RUN}`, adminName: "Ada Admin", adminEmail: `ada.${RUN}@assist.test` } });
  const admin = (await login(`ada.${RUN}@assist.test`, prov.json.admin.temporaryPassword)).json.accessToken;
  const dept = (await call("GET", "/departments", { token: admin })).json[0];
  const desig = (await call("GET", "/designations", { token: admin })).json[0];
  async function hire(name) {
    const e = (await call("POST", "/employees", { token: admin, body: { name, email: `${name.toLowerCase()}.${RUN}@assist.test`, departmentId: dept.id, designationId: desig.id, dateOfJoining: "2025-01-01", role: "EMPLOYEE" } })).json;
    return { ...e, token: (await login(e.email, e.temporaryPassword)).json.accessToken };
  }
  await call("POST", "/leave-types", { token: admin, body: { name: "Sick", isPaid: true, defaultDays: 12 } });
  await call("POST", "/leave-types", { token: admin, body: { name: "Annual", isPaid: true, defaultDays: 18 } });
  const pia = await hire("Pia");
  const raj = await hire("Raj");
  await call("POST", `/payroll/salary-structures/${raj.id}`, { token: admin, body: { basic: 90000, hra: 10000, allowances: {}, effectiveFrom: "2025-01-01" } });
  const ask = (token, question) => call("POST", "/assistant/ask", { token, body: { question } });

  // US1 — own data
  const screen = (await call("GET", "/leave-balances/me", { token: pia.token })).json;
  const sick = screen.find((b) => b.leaveTypeId && b.allocated === 12);
  const a1 = await ask(pia.token, "How many sick days do I have left?");
  check("027 leave balance matches the Leave screen exactly (FR-002, SC-001)", a1.status === 200 && a1.json.answers[0].answered && a1.json.answers[0].text.includes(`Sick: ${sick.allocated - sick.used} day(s) left of ${sick.allocated}`), show(a1));
  check("027 answers link to their source (FR-006)", a1.json.answers[0].sources[0]?.link === "/api/leave-balances/me", JSON.stringify(a1.json.answers[0].sources));
  await call("POST", "/payroll/runs", { token: admin, body: { periodMonth: 5, periodYear: 2030 } });
  const slip = (await call("GET", "/payroll/payslips/me", { token: raj.token })).json[0];
  const a2 = await ask(raj.token, "Explain my latest payslip");
  check("027 payslip explained from the real payslip (US1.2)", a2.json.answers[0].answered && a2.json.answers[0].text.includes("May 2030") && a2.json.answers[0].text.includes((slip.netPay).toLocaleString("en-US", { maximumFractionDigits: 2 })) && a2.json.answers[0].sources[0].link === `/api/payroll/payslips/me/${slip.id}`, show(a2));
  const a3 = await ask(pia.token, "What's Raj's salary?");
  check("027 someone else's data is refused (FR-003, US1.3, SC-002)", a3.json.answers[0].answered === false && a3.json.answers[0].reason === "OUT_OF_SCOPE" && !a3.json.answers[0].text.includes("90"), show(a3));
  const a3b = await ask(pia.token, "Explain my payslip");
  check("027 asker only ever sees their own records", a3b.json.answers[0].answered === false && a3b.json.answers[0].reason === "NO_RECORDS", show(a3b));

  // US2 — policy
  const none = await ask(pia.token, "What's our stance on remote work?");
  check("027 no grounding: declines instead of guessing (FR-005, SC-003)", none.json.answers[0].answered === false && none.json.answers[0].reason === "NO_GROUNDING", show(none));
  const empWrite = await call("POST", "/assistant/knowledge", { token: pia.token, body: { title: "x", body: "y", keywords: ["z"] } });
  check("027 only HR/Admin write knowledge", empWrite.status === 403, show(empWrite));
  const policy = (await upload("/policies", { token: admin, fields: { title: "Flexible Working Policy" }, file: PDF("flex") })).json;
  const art = await call("POST", "/assistant/knowledge", { token: admin, body: { title: "Remote work", body: "Employees may work from home up to two days a week with their manager's agreement.", keywords: ["remote", "work from home", "wfh"], policyId: policy.id } });
  const grounded = await ask(pia.token, "Can I work from home?");
  const g = grounded.json.answers[0];
  check("027 policy answer grounded in published content and cited (FR-004, US2.1)", art.status === 201 && g.answered && g.grounding === "POLICY" && g.text.includes("up to two days a week") && g.text.includes("Flexible Working Policy"), show(grounded));
  check("027 the cited policy document can be opened (FR-006, US2.3)", g.sources.some((s) => s.link === `/api/documents/${policy.documentId}/download`) && (await call("GET", g.sources[0].link.replace(/^\/api/, ""), { token: pia.token })).status === 200, JSON.stringify(g.sources));
  await call("PATCH", `/assistant/knowledge/${art.json.id}`, { token: admin, body: { body: "Employees may work from home up to three days a week." } });
  const fresh = await ask(pia.token, "Can I work from home?");
  check("027 answers use current content, never a cached one (FR-009)", fresh.json.answers[0].text.includes("three days"), show(fresh));
  const mixed = await ask(pia.token, "What's my leave balance and what's the policy on parental leave?");
  check("027 mixed question: grounded part answered, the other flagged (FR-010)", mixed.json.answers.length === 2 && mixed.json.answers[0].answered === true && mixed.json.answers[1].answered === false && mixed.json.allAnswered === false, show(mixed));

  // US3 — overview
  const empView = await call("GET", "/assistant/overview", { token: pia.token });
  const ov = await call("GET", "/assistant/overview", { token: admin });
  const topic = (t) => ov.json.topics?.find((x) => x.topic === t);
  check("027 overview is HR/Admin only", empView.status === 403, show(empView));
  check("027 topics and unanswered rate, no identities (FR-007, SC-004)", ov.json.questions === 9 && ov.json.unanswered === 4 && topic("parental leave")?.unanswered === 1 && topic("remote work")?.questions === 3 && topic("remote work")?.unanswered === 1 && !JSON.stringify(ov.json).includes(pia.id) && !JSON.stringify(ov.json).includes("stance"), show(ov));
  const past = await call("GET", "/assistant/overview?from=2020-01-01&to=2020-12-31", { token: admin });
  check("027 period filter (FR-008)", past.json.questions === 0 && past.json.topics.length === 0, show(past));
}
